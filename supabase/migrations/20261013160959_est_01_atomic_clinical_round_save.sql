begin;

alter table public.intervenciones_proa
  add column if not exists descripcion_motivo_no_intervencion text;

create or replace function public.guardar_ronda_clinica(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_round public.rondas_proa%rowtype;
  v_round_payload jsonb := coalesce(p_payload -> 'round', '{}'::jsonb);
  v_round_id uuid;
  v_expected_ips_id uuid;
  v_expected_patient_id uuid;
  v_expected_case_id uuid;
  v_service_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_kept_ids uuid[] := array[]::uuid[];
  v_treatment public.tratamientos_antimicrobianos%rowtype;
  v_treatment_id uuid;
  v_antimicrobial_id uuid;
  v_antimicrobial_name text;
  v_action text;
  v_reason text;
  v_start_date date;
  v_end_date date;
  v_numeric numeric;
  v_integer integer;
  v_microbiology public.microbiologia%rowtype;
  v_microbiology_id uuid;
  v_microbiology_count integer;
  v_microbiology_status text;
  v_result text;
  v_is_positive boolean;
  v_intervention public.intervenciones_proa%rowtype;
  v_intervention_id uuid;
  v_intervention_count integer;
  v_has_intervention boolean;
  v_preserve_relations boolean := false;
  v_note public.notas_proa%rowtype;
  v_confirm boolean := coalesce((p_payload ->> 'confirm')::boolean, false);
  v_now timestamptz := clock_timestamp();
begin
  if auth.uid() is null then
    raise exception 'EST01_ACCESS: Se requiere una sesión autenticada';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'EST01_CONTEXT: El contenido de la ronda no es válido';
  end if;

  begin
    v_round_id := nullif(p_payload ->> 'round_id', '')::uuid;
    v_expected_ips_id := nullif(p_payload ->> 'ips_id', '')::uuid;
    v_expected_patient_id := nullif(p_payload ->> 'patient_id', '')::uuid;
    v_expected_case_id := nullif(p_payload ->> 'case_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'EST01_CONTEXT: Los identificadores de la ronda no son válidos';
  end;

  select * into v_round
  from public.rondas_proa
  where id = v_round_id
  for update;

  if not found then
    raise exception 'EST01_CONTEXT: No se encontró la ronda solicitada';
  end if;

  if v_round.ips_id is distinct from v_expected_ips_id
     or v_round.paciente_id is distinct from v_expected_patient_id
     or v_round.caso_id is distinct from v_expected_case_id then
    raise exception 'EST01_CONTEXT: La ronda no corresponde a la IPS, paciente y caso indicados';
  end if;

  if not public.puede_escribir_operacion_ips(v_round.ips_id) then
    raise exception 'EST01_ACCESS: No tienes permisos para modificar esta ronda';
  end if;

  if v_round.estado <> 'Borrador' then
    raise exception 'EST01_CONFIRMED: La ronda confirmada o anulada es de solo lectura';
  end if;

  if not exists (
    select 1
    from public.casos_proa c
    join public.pacientes p on p.id = c.paciente_id
    where c.id = v_round.caso_id
      and c.ips_id = v_round.ips_id
      and c.paciente_id = v_round.paciente_id
      and p.id = v_round.paciente_id
      and p.ips_id = v_round.ips_id
  ) then
    raise exception 'EST01_CONTEXT: La relación IPS, paciente y caso no es válida';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_round.caso_id::text, 0));

  begin
    v_service_id := nullif(v_round_payload ->> 'service_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'EST01_CONTEXT: El servicio seleccionado no es válido';
  end;

  if v_service_id is not null and not exists (
    select 1 from public.servicios_ips s
    where s.id = v_service_id and s.ips_id = v_round.ips_id
  ) then
    raise exception 'EST01_CONTEXT: El servicio no pertenece a la IPS de la ronda';
  end if;

  update public.rondas_proa
  set servicio_id = v_service_id,
      cama = nullif(btrim(v_round_payload ->> 'bed'), ''),
      fecha_hora_ronda = coalesce(nullif(v_round_payload ->> 'round_at', '')::timestamptz, fecha_hora_ronda),
      profesional_id = auth.uid(),
      tipo_valoracion = nullif(v_round_payload ->> 'assessment_type', ''),
      tipo_terapia = nullif(v_round_payload ->> 'therapy_type', ''),
      terapia_dirigida_por_microbiologia = case
        when nullif(v_round_payload ->> 'therapy_type', '') = 'Dirigida'
          then nullif(v_round_payload ->> 'microbiology_directed', '')::boolean
        else null
      end,
      tipo_profilaxis = case
        when nullif(v_round_payload ->> 'therapy_type', '') = 'Profiláctica'
          then nullif(v_round_payload ->> 'prophylaxis_type', '')
        else null
      end,
      evolucion_clinica = nullif(v_round_payload ->> 'clinical_evolution', ''),
      estado = 'Borrador'
  where id = v_round.id
  returning * into v_round;

  if jsonb_typeof(coalesce(p_payload -> 'diagnoses', '[]'::jsonb)) <> 'array' then
    raise exception 'EST01_DIAGNOSIS: El bloque de diagnósticos no es válido';
  end if;

  if (
    select count(*) from jsonb_array_elements(coalesce(p_payload -> 'diagnoses', '[]'::jsonb)) d
    where d ->> 'type' = 'Principal'
  ) > 1 or (
    select count(*) from jsonb_array_elements(coalesce(p_payload -> 'diagnoses', '[]'::jsonb)) d
    where d ->> 'type' = 'Infeccioso'
  ) > 1 then
    raise exception 'EST01_DIAGNOSIS: Solo puede existir un diagnóstico principal y uno infeccioso por ronda';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'diagnoses', '[]'::jsonb))
  loop
    if nullif(btrim(v_item ->> 'code'), '') is null
       or nullif(btrim(v_item ->> 'description'), '') is null
       or (v_item ->> 'type') not in ('Principal', 'Relacionado', 'Infeccioso') then
      raise exception 'EST01_DIAGNOSIS: Cada diagnóstico debe tener código, descripción y tipo válidos';
    end if;

    begin
      v_item_id := nullif(v_item ->> 'id', '')::uuid;
    exception when invalid_text_representation then
      v_item_id := null;
    end;

    if v_item_id is not null and exists (
      select 1 from public.diagnosticos_ronda d where d.id = v_item_id and d.ronda_id = v_round.id
    ) then
      update public.diagnosticos_ronda
      set codigo_cie10 = upper(btrim(v_item ->> 'code')),
          descripcion_cie10 = btrim(v_item ->> 'description'),
          tipo_diagnostico = v_item ->> 'type',
          categoria_proa = nullif(btrim(v_item ->> 'proa_category'), ''),
          categoria_proa_id = nullif(v_item ->> 'proa_category_id', '')::uuid
      where id = v_item_id;
    else
      select d.id into v_item_id
      from public.diagnosticos_ronda d
      where d.ronda_id = v_round.id
        and d.tipo_diagnostico = v_item ->> 'type'
        and upper(coalesce(d.codigo_cie10, '')) = upper(btrim(v_item ->> 'code'))
        and coalesce(d.descripcion_cie10, '') = btrim(v_item ->> 'description')
      order by d.fecha_creacion
      limit 1;

      if v_item_id is null then
        insert into public.diagnosticos_ronda (
          ronda_id, codigo_cie10, descripcion_cie10, tipo_diagnostico, categoria_proa, categoria_proa_id
        ) values (
          v_round.id,
          upper(btrim(v_item ->> 'code')),
          btrim(v_item ->> 'description'),
          v_item ->> 'type',
          nullif(btrim(v_item ->> 'proa_category'), ''),
          nullif(v_item ->> 'proa_category_id', '')::uuid
        ) returning id into v_item_id;
      end if;
    end if;
    v_kept_ids := array_append(v_kept_ids, v_item_id);
    v_item_id := null;
  end loop;

  delete from public.diagnosticos_ronda d
  where d.ronda_id = v_round.id
    and not (d.id = any(v_kept_ids));

  if jsonb_typeof(coalesce(p_payload -> 'treatment_actions', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_payload -> 'new_treatments', '[]'::jsonb)) <> 'array' then
    raise exception 'EST01_TREATMENT: El bloque de tratamientos no es válido';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'treatment_actions', '[]'::jsonb))
  loop
    begin
      v_treatment_id := nullif(v_item ->> 'treatment_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'EST01_TREATMENT: El tratamiento seleccionado no es válido';
    end;

    select * into v_treatment
    from public.tratamientos_antimicrobianos t
    where t.id = v_treatment_id
      and t.ips_id = v_round.ips_id
      and t.paciente_id = v_round.paciente_id
      and t.caso_id = v_round.caso_id
    for update;
    if not found then
      raise exception 'EST01_TREATMENT: El tratamiento no pertenece al caso de la ronda';
    end if;

    v_action := v_item ->> 'action';
    if v_action = 'Continuar' then
      if not exists (
        select 1 from public.historial_tratamiento h
        where h.tratamiento_id = v_treatment.id
          and h.ronda_id = v_round.id
          and h.accion = 'Continuación'
      ) then
        insert into public.historial_tratamiento (tratamiento_id, ronda_id, accion, fecha_evento)
        values (v_treatment.id, v_round.id, 'Continuación', v_now);
      end if;
    elsif v_action = 'Modificar' then
      v_reason := case
        when v_item ->> 'reason' = 'Otro' then nullif(btrim(v_item ->> 'reason_other'), '')
        else nullif(btrim(v_item ->> 'reason'), '')
      end;

      if v_item ? 'dose' and coalesce(v_item ->> 'dose', '') <> coalesce(v_treatment.dosis::text, '') then
        v_numeric := nullif(v_item ->> 'dose', '')::numeric;
        insert into public.historial_tratamiento
          (tratamiento_id, ronda_id, accion, fecha_evento, campo_modificado, valor_anterior, valor_nuevo, motivo, tipo_intervencion)
        values
          (v_treatment.id, v_round.id, 'Modificación', v_now, 'dosis', v_treatment.dosis::text, v_numeric::text, v_reason,
           case when v_item ->> 'reason' = 'Intervención PROA' then 'Intervención PROA' end);
        update public.tratamientos_antimicrobianos set dosis = v_numeric, fecha_ultima_modificacion = v_now where id = v_treatment.id;
      end if;

      if v_item ? 'unit' and coalesce(v_item ->> 'unit', '') <> coalesce(v_treatment.unidad, '') then
        insert into public.historial_tratamiento
          (tratamiento_id, ronda_id, accion, fecha_evento, campo_modificado, valor_anterior, valor_nuevo, motivo, tipo_intervencion)
        values
          (v_treatment.id, v_round.id, 'Modificación', v_now, 'unidad', v_treatment.unidad, nullif(btrim(v_item ->> 'unit'), ''), v_reason,
           case when v_item ->> 'reason' = 'Intervención PROA' then 'Intervención PROA' end);
        update public.tratamientos_antimicrobianos set unidad = nullif(btrim(v_item ->> 'unit'), ''), fecha_ultima_modificacion = v_now where id = v_treatment.id;
      end if;

      if v_item ? 'frequency' and coalesce(v_item ->> 'frequency', '') <> coalesce(v_treatment.frecuencia, '') then
        insert into public.historial_tratamiento
          (tratamiento_id, ronda_id, accion, fecha_evento, campo_modificado, valor_anterior, valor_nuevo, motivo, tipo_intervencion)
        values
          (v_treatment.id, v_round.id, 'Modificación', v_now, 'frecuencia', v_treatment.frecuencia, nullif(btrim(v_item ->> 'frequency'), ''), v_reason,
           case when v_item ->> 'reason' = 'Intervención PROA' then 'Intervención PROA' end);
        update public.tratamientos_antimicrobianos set frecuencia = nullif(btrim(v_item ->> 'frequency'), ''), fecha_ultima_modificacion = v_now where id = v_treatment.id;
        v_treatment.frecuencia := nullif(btrim(v_item ->> 'frequency'), '');
      end if;

      if v_item ? 'route' and coalesce(v_item ->> 'route', '') <> coalesce(v_treatment.via, '') then
        insert into public.historial_tratamiento
          (tratamiento_id, ronda_id, accion, fecha_evento, campo_modificado, valor_anterior, valor_nuevo, motivo, tipo_intervencion)
        values
          (v_treatment.id, v_round.id, 'Modificación', v_now, 'via', v_treatment.via, nullif(btrim(v_item ->> 'route'), ''), v_reason,
           case when v_item ->> 'reason' = 'Intervención PROA' then 'Intervención PROA' end);
        update public.tratamientos_antimicrobianos set via = nullif(btrim(v_item ->> 'route'), ''), fecha_ultima_modificacion = v_now where id = v_treatment.id;
      end if;
    elsif v_action = 'Suspender' then
      v_end_date := nullif(v_item ->> 'end_date', '')::date;
      if v_end_date is null or (v_treatment.fecha_inicio is not null and v_end_date < v_treatment.fecha_inicio::date) then
        raise exception 'EST01_TREATMENT: La fecha de suspensión no es válida';
      end if;
      if v_treatment.estado = 'Activo' then
        v_reason := case
          when v_item ->> 'reason' = 'Otro' then nullif(btrim(v_item ->> 'reason_other'), '')
          else nullif(btrim(v_item ->> 'reason'), '')
        end;
        update public.tratamientos_antimicrobianos
        set fecha_fin = v_end_date, estado = 'Suspendido', fecha_ultima_modificacion = v_now
        where id = v_treatment.id;
        insert into public.historial_tratamiento
          (tratamiento_id, ronda_id, accion, fecha_evento, valor_anterior, valor_nuevo, motivo, tipo_intervencion)
        values
          (v_treatment.id, v_round.id, 'Suspensión', v_now, v_treatment.estado, 'Suspendido', v_reason,
           case when v_item ->> 'reason' = 'Intervención PROA' then 'Intervención PROA' end);
      end if;
    else
      raise exception 'EST01_TREATMENT: La acción del tratamiento no es válida';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'new_treatments', '[]'::jsonb))
  loop
    begin
      v_antimicrobial_id := nullif(v_item ->> 'antimicrobial_id', '')::uuid;
      v_start_date := coalesce(nullif(v_item ->> 'start_date', '')::date, current_date);
      v_numeric := nullif(v_item ->> 'dose', '')::numeric;
      v_integer := nullif(v_item ->> 'planned_duration_days', '')::integer;
    exception when invalid_text_representation then
      raise exception 'EST01_TREATMENT: Los datos numéricos o fechas del tratamiento no son válidos';
    end;

    select a.nombre into v_antimicrobial_name
    from public.catalogo_antimicrobianos a
    where a.id = v_antimicrobial_id and a.estado = 'Activo';
    if v_antimicrobial_name is null then
      raise exception 'EST01_TREATMENT: Selecciona un antimicrobiano activo del catálogo';
    end if;
    if v_numeric is not null and v_numeric < 0 then
      raise exception 'EST01_TREATMENT: La dosis no puede ser negativa';
    end if;
    if v_integer is not null and v_integer < 0 then
      raise exception 'EST01_TREATMENT: La duración prevista no puede ser negativa';
    end if;

    select * into v_treatment
    from public.tratamientos_antimicrobianos t
    where t.ronda_id = v_round.id
      and t.antimicrobiano_id = v_antimicrobial_id
      and t.fecha_inicio::date = v_start_date
    order by t.fecha_ultima_modificacion desc
    limit 1
    for update;

    if not found then
      if exists (
        select 1 from public.tratamientos_antimicrobianos t
        where t.caso_id = v_round.caso_id
          and t.estado = 'Activo'
          and (
            t.antimicrobiano_id = v_antimicrobial_id
            or (t.antimicrobiano_id is null and lower(btrim(t.antimicrobiano)) = lower(btrim(v_antimicrobial_name)))
          )
      ) then
        raise exception 'EST01_TREATMENT: Este antimicrobiano ya se encuentra activo en el caso';
      end if;

      insert into public.tratamientos_antimicrobianos (
        ips_id, paciente_id, caso_id, ronda_id, antimicrobiano_id, antimicrobiano,
        dosis, unidad, frecuencia, via, fecha_inicio, duracion_prevista_dias, estado
      ) values (
        v_round.ips_id, v_round.paciente_id, v_round.caso_id, v_round.id,
        v_antimicrobial_id, v_antimicrobial_name, v_numeric,
        nullif(btrim(v_item ->> 'unit'), ''), nullif(btrim(v_item ->> 'frequency'), ''),
        nullif(btrim(v_item ->> 'route'), ''), v_start_date, v_integer, 'Activo'
      ) returning * into v_treatment;
    else
      update public.tratamientos_antimicrobianos
      set dosis = v_numeric,
          unidad = nullif(btrim(v_item ->> 'unit'), ''),
          frecuencia = nullif(btrim(v_item ->> 'frequency'), ''),
          via = nullif(btrim(v_item ->> 'route'), ''),
          duracion_prevista_dias = v_integer,
          fecha_ultima_modificacion = v_now
      where id = v_treatment.id
      returning * into v_treatment;
    end if;

    if not exists (
      select 1 from public.historial_tratamiento h
      where h.tratamiento_id = v_treatment.id and h.ronda_id = v_round.id and h.accion = 'Inicio'
    ) then
      insert into public.historial_tratamiento
        (tratamiento_id, ronda_id, accion, fecha_evento, valor_nuevo)
      values
        (v_treatment.id, v_round.id, 'Inicio', v_now, v_antimicrobial_name);
    end if;
  end loop;

  if p_payload ? 'microbiology' and jsonb_typeof(p_payload -> 'microbiology') = 'object' then
    v_item := p_payload -> 'microbiology';
    v_microbiology_status := coalesce(v_item ->> 'status', 'No');

    select count(*) into v_microbiology_count
    from public.microbiologia where ronda_id = v_round.id;
    select m.id into v_microbiology_id
    from public.microbiologia m
    where m.ronda_id = v_round.id
    order by m.fecha_creacion, m.id
    limit 1;
    if v_microbiology_count > 1 then
      raise exception 'EST01_MICROBIOLOGY: La ronda tiene múltiples estudios editables y requiere revisión';
    end if;

    if v_microbiology_status = 'No' then
      if v_microbiology_id is not null then
        delete from public.resistencia_microbiologica where muestra_id = v_microbiology_id;
        delete from public.sensibilidad_microbiologica where muestra_id = v_microbiology_id;
        delete from public.microbiologia where id = v_microbiology_id;
      end if;
    elsif v_microbiology_status in ('Pendiente', 'Sí') then
      v_result := case when v_microbiology_status = 'Pendiente' then 'Pendiente' else coalesce(nullif(v_item ->> 'general_result', ''), 'Pendiente') end;
      v_is_positive := v_result = 'Positivo';

      if nullif(v_item ->> 'previous_sample_id', '') is not null and not exists (
        select 1 from public.microbiologia m
        where m.id = (v_item ->> 'previous_sample_id')::uuid
          and m.caso_id = v_round.caso_id
          and m.ips_id = v_round.ips_id
      ) then
        raise exception 'EST01_MICROBIOLOGY: La muestra de control debe pertenecer al mismo caso';
      end if;

      if v_microbiology_id is null then
        insert into public.microbiologia (
          ips_id, caso_id, ronda_id, tipo_muestra_id, tipo_muestra, fecha_toma,
          fecha_resultado, estado_resultado, resultado_general, microorganismo_id,
          microorganismo, tipo_germen, es_muestra_control, muestra_previa_id, impacto_conducta
        ) values (
          v_round.ips_id, v_round.caso_id, v_round.id,
          nullif(v_item ->> 'sample_type_id', '')::uuid, nullif(btrim(v_item ->> 'sample_type'), ''),
          nullif(v_item ->> 'sampled_at', '')::timestamptz,
          case when v_microbiology_status = 'Pendiente' then null else nullif(v_item ->> 'result_at', '')::timestamptz end,
          case when v_result = 'Pendiente' then 'Pendiente' else 'Disponible' end,
          v_result,
          case when v_is_positive then nullif(v_item ->> 'microorganism_id', '')::uuid end,
          case when v_is_positive then nullif(btrim(v_item ->> 'microorganism'), '') end,
          case when v_is_positive then nullif(btrim(v_item ->> 'germ_type'), '') end,
          coalesce((v_item ->> 'is_control_sample')::boolean, false),
          case when coalesce((v_item ->> 'is_control_sample')::boolean, false) then nullif(v_item ->> 'previous_sample_id', '')::uuid end,
          nullif(v_item ->> 'conduct_impact', '')
        ) returning id into v_microbiology_id;
      else
        update public.microbiologia
        set tipo_muestra_id = nullif(v_item ->> 'sample_type_id', '')::uuid,
            tipo_muestra = nullif(btrim(v_item ->> 'sample_type'), ''),
            fecha_toma = nullif(v_item ->> 'sampled_at', '')::timestamptz,
            fecha_resultado = case when v_microbiology_status = 'Pendiente' then null else nullif(v_item ->> 'result_at', '')::timestamptz end,
            estado_resultado = case when v_result = 'Pendiente' then 'Pendiente' else 'Disponible' end,
            resultado_general = v_result,
            microorganismo_id = case when v_is_positive then nullif(v_item ->> 'microorganism_id', '')::uuid end,
            microorganismo = case when v_is_positive then nullif(btrim(v_item ->> 'microorganism'), '') end,
            tipo_germen = case when v_is_positive then nullif(btrim(v_item ->> 'germ_type'), '') end,
            es_muestra_control = coalesce((v_item ->> 'is_control_sample')::boolean, false),
            muestra_previa_id = case when coalesce((v_item ->> 'is_control_sample')::boolean, false) then nullif(v_item ->> 'previous_sample_id', '')::uuid end,
            impacto_conducta = nullif(v_item ->> 'conduct_impact', '')
        where id = v_microbiology_id;
      end if;

      delete from public.resistencia_microbiologica where muestra_id = v_microbiology_id;
      delete from public.sensibilidad_microbiologica where muestra_id = v_microbiology_id;

      if v_is_positive then
        for v_item in select value from jsonb_array_elements(coalesce((p_payload -> 'microbiology') -> 'resistances', '[]'::jsonb))
        loop
          if nullif(btrim(v_item ->> 'mechanism'), '') is not null then
            insert into public.resistencia_microbiologica (muestra_id, mecanismo)
            values (v_microbiology_id, btrim(v_item ->> 'mechanism'));
          end if;
        end loop;
        for v_item in select value from jsonb_array_elements(coalesce((p_payload -> 'microbiology') -> 'sensitivities', '[]'::jsonb))
        loop
          if nullif(btrim(v_item ->> 'antimicrobial'), '') is not null and nullif(v_item ->> 'result', '') is not null then
            insert into public.sensibilidad_microbiologica (muestra_id, antimicrobiano_id, antimicrobiano, resultado)
            values (
              v_microbiology_id,
              nullif(v_item ->> 'antimicrobial_id', '')::uuid,
              btrim(v_item ->> 'antimicrobial'),
              v_item ->> 'result'
            );
          end if;
        end loop;
      end if;
    else
      raise exception 'EST01_MICROBIOLOGY: El estado microbiológico no es válido';
    end if;
  end if;

  if p_payload ? 'intervention' and jsonb_typeof(p_payload -> 'intervention') = 'object' then
    v_item := p_payload -> 'intervention';
    select count(*) into v_intervention_count
    from public.intervenciones_proa where ronda_id = v_round.id;
    select i.id into v_intervention_id
    from public.intervenciones_proa i
    where i.ronda_id = v_round.id
    order by i.fecha_creacion, i.id
    limit 1;
    if v_intervention_count > 1 then
      raise exception 'EST01_INTERVENTION: La ronda tiene múltiples intervenciones y requiere revisión';
    end if;

    v_has_intervention := (v_item ->> 'has_intervention')::boolean;
    if v_intervention_id is null then
      insert into public.intervenciones_proa (
        ips_id, ronda_id, hubo_intervencion, motivo_no_intervencion,
        descripcion_motivo_no_intervencion, tipo_intervencion_id, tipo_intervencion,
        origen_intervencion, recomendacion, descripcion_recomendacion, aceptacion,
        motivo_no_aceptacion, cumplimiento_guia, motivo_no_cumplimiento,
        dias_ahorrados, requiere_seguimiento, fecha_seguimiento, motivo_seguimiento
      ) values (
        v_round.ips_id, v_round.id, v_has_intervention,
        case when not v_has_intervention then nullif(v_item ->> 'no_intervention_reason', '') end,
        case when not v_has_intervention and v_item ->> 'no_intervention_reason' = 'Otro' then nullif(btrim(v_item ->> 'no_intervention_description'), '') end,
        case when v_has_intervention then nullif(v_item ->> 'intervention_type_id', '')::uuid end,
        case when v_has_intervention then nullif(btrim(v_item ->> 'intervention_type'), '') end,
        case when v_has_intervention then nullif(v_item ->> 'origin', '') end,
        case when v_has_intervention then nullif(v_item ->> 'recommendation', '') end,
        case when v_has_intervention then nullif(btrim(v_item ->> 'recommendation_description'), '') end,
        case when v_has_intervention then nullif(v_item ->> 'acceptance', '') end,
        case when v_has_intervention and (v_item ->> 'acceptance') in ('No', 'Parcialmente') then nullif(btrim(v_item ->> 'non_acceptance_reason'), '') end,
        nullif(v_item ->> 'guideline_compliance', ''),
        case when v_item ->> 'guideline_compliance' = 'No cumple' then nullif(btrim(v_item ->> 'non_compliance_reason'), '') end,
        case when v_has_intervention then nullif(v_item ->> 'saved_days', '')::numeric end,
        coalesce((v_item ->> 'follow_up_required')::boolean, false),
        case when coalesce((v_item ->> 'follow_up_required')::boolean, false) then nullif(v_item ->> 'follow_up_at', '')::timestamptz end,
        case when coalesce((v_item ->> 'follow_up_required')::boolean, false) then nullif(btrim(v_item ->> 'follow_up_reason'), '') end
      ) returning id into v_intervention_id;
    else
      update public.intervenciones_proa
      set hubo_intervencion = v_has_intervention,
          motivo_no_intervencion = case when not v_has_intervention then nullif(v_item ->> 'no_intervention_reason', '') end,
          descripcion_motivo_no_intervencion = case when not v_has_intervention and v_item ->> 'no_intervention_reason' = 'Otro' then nullif(btrim(v_item ->> 'no_intervention_description'), '') end,
          tipo_intervencion_id = case when v_has_intervention then nullif(v_item ->> 'intervention_type_id', '')::uuid end,
          tipo_intervencion = case when v_has_intervention then nullif(btrim(v_item ->> 'intervention_type'), '') end,
          origen_intervencion = case when v_has_intervention then nullif(v_item ->> 'origin', '') end,
          recomendacion = case when v_has_intervention then nullif(v_item ->> 'recommendation', '') end,
          descripcion_recomendacion = case when v_has_intervention then nullif(btrim(v_item ->> 'recommendation_description'), '') end,
          aceptacion = case when v_has_intervention then nullif(v_item ->> 'acceptance', '') end,
          motivo_no_aceptacion = case when v_has_intervention and (v_item ->> 'acceptance') in ('No', 'Parcialmente') then nullif(btrim(v_item ->> 'non_acceptance_reason'), '') end,
          cumplimiento_guia = nullif(v_item ->> 'guideline_compliance', ''),
          motivo_no_cumplimiento = case when v_item ->> 'guideline_compliance' = 'No cumple' then nullif(btrim(v_item ->> 'non_compliance_reason'), '') end,
          dias_ahorrados = case when v_has_intervention then nullif(v_item ->> 'saved_days', '')::numeric end,
          requiere_seguimiento = coalesce((v_item ->> 'follow_up_required')::boolean, false),
          fecha_seguimiento = case when coalesce((v_item ->> 'follow_up_required')::boolean, false) then nullif(v_item ->> 'follow_up_at', '')::timestamptz end,
          motivo_seguimiento = case when coalesce((v_item ->> 'follow_up_required')::boolean, false) then nullif(btrim(v_item ->> 'follow_up_reason'), '') end
      where id = v_intervention_id;
    end if;

    select exists (
      select 1 from public.decisiones_reevaluacion d where d.intervencion_id = v_intervention_id
    ) into v_preserve_relations;

    if not v_preserve_relations then
      delete from public.intervencion_tratamiento it
      where it.intervencion_id = v_intervention_id
        and not exists (
          select 1
          from jsonb_array_elements_text(coalesce(v_item -> 'treatment_ids', '[]'::jsonb)) as x(value)
          where x.value::uuid = it.tratamiento_id
        );
    end if;

    for v_treatment_id in
      select value::uuid from jsonb_array_elements_text(coalesce(v_item -> 'treatment_ids', '[]'::jsonb))
    loop
      if not exists (
        select 1 from public.tratamientos_antimicrobianos t
        where t.id = v_treatment_id
          and t.ips_id = v_round.ips_id
          and t.paciente_id = v_round.paciente_id
          and t.caso_id = v_round.caso_id
      ) then
        raise exception 'EST01_INTERVENTION: La intervención contiene un tratamiento de otro caso';
      end if;
      insert into public.intervencion_tratamiento (intervencion_id, tratamiento_id)
      values (v_intervention_id, v_treatment_id)
      on conflict do nothing;
    end loop;
  end if;

  if p_payload ? 'note' and jsonb_typeof(p_payload -> 'note') = 'object' then
    v_item := p_payload -> 'note';
    select * into v_note
    from public.notas_proa n
    where n.ronda_id = v_round.id
    order by n.version desc
    limit 1
    for update;

    if found and v_note.fecha_confirmacion is null then
      update public.notas_proa
      set texto_generado = coalesce(v_item ->> 'generated_text', ''),
          texto_final = coalesce(v_item ->> 'final_text', '')
      where id = v_note.id
      returning * into v_note;
    else
      insert into public.notas_proa (ronda_id, texto_generado, texto_final, version)
      values (
        v_round.id,
        coalesce(v_item ->> 'generated_text', ''),
        coalesce(v_item ->> 'final_text', ''),
        coalesce(v_note.version, 0) + 1
      ) returning * into v_note;
    end if;
  end if;

  if v_confirm then
    if v_note.id is null or nullif(btrim(v_note.texto_final), '') is null then
      raise exception 'EST01_NOTE: La ronda requiere una nota final antes de confirmarse';
    end if;
    update public.notas_proa
    set fecha_confirmacion = v_now,
        usuario_confirma = auth.uid()
    where id = v_note.id
    returning * into v_note;

    update public.rondas_proa
    set estado = 'Confirmada', fecha_confirmacion = v_now
    where id = v_round.id
    returning * into v_round;
  end if;

  return jsonb_build_object(
    'round', to_jsonb(v_round),
    'diagnoses', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.fecha_creacion)
      from public.diagnosticos_ronda d where d.ronda_id = v_round.id
    ), '[]'::jsonb),
    'note', case when v_note.id is null then null else to_jsonb(v_note) end
  );
exception
  when raise_exception then
    raise;
  when others then
    raise exception 'EST01_UNEXPECTED: No se pudo guardar la ronda de forma transaccional' using detail = sqlstate;
end;
$function$;

revoke all on function public.guardar_ronda_clinica(jsonb) from public;
revoke all on function public.guardar_ronda_clinica(jsonb) from anon;
grant execute on function public.guardar_ronda_clinica(jsonb) to authenticated;

comment on function public.guardar_ronda_clinica(jsonb) is
  'Guarda de forma atómica una ronda clínica en borrador y sus bloques dependientes respetando RLS.';

commit;
