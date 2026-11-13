begin;

alter table public.tratamientos_antimicrobianos
  add column if not exists indicacion_clinica text,
  add column if not exists tipo_tratamiento text;

alter table public.tratamientos_antimicrobianos
  drop constraint if exists tratamientos_antimicrobianos_tipo_tratamiento_check;
alter table public.tratamientos_antimicrobianos
  add constraint tratamientos_antimicrobianos_tipo_tratamiento_check
  check (tipo_tratamiento is null or tipo_tratamiento in ('Empírico', 'Dirigido'));

alter table public.rondas_proa
  add column if not exists sin_antimicrobianos_valoracion boolean;

alter table public.intervenciones_proa
  add column if not exists accion_terapeutica text,
  add column if not exists antimicrobiano_recomendado_id uuid references public.catalogo_antimicrobianos(id),
  add column if not exists antimicrobiano_recomendado text,
  add column if not exists dosis_recomendada numeric,
  add column if not exists unidad_recomendada text,
  add column if not exists via_recomendada text,
  add column if not exists frecuencia_recomendada text;

alter table public.intervenciones_proa
  drop constraint if exists intervenciones_proa_accion_terapeutica_check;
alter table public.intervenciones_proa
  add constraint intervenciones_proa_accion_terapeutica_check
  check (accion_terapeutica is null or accion_terapeutica in ('Continuar', 'Ajustar', 'Suspender', 'Sustituir', 'Iniciar tratamiento'));

create table if not exists public.tratamientos_valoracion (
  id uuid primary key default gen_random_uuid(),
  ips_id uuid not null references public.ips(id),
  paciente_id uuid not null references public.pacientes(id),
  caso_id uuid not null references public.casos_proa(id),
  ronda_id uuid not null references public.rondas_proa(id),
  tratamiento_id uuid not null references public.tratamientos_antimicrobianos(id),
  antimicrobiano_id uuid references public.catalogo_antimicrobianos(id),
  antimicrobiano text not null,
  dosis numeric,
  unidad text,
  via text,
  frecuencia text,
  fecha_inicio timestamptz,
  indicacion_clinica text,
  tipo_tratamiento text,
  estado_al_valorar text not null,
  fecha_registro timestamptz not null default now(),
  constraint tratamientos_valoracion_tipo_check
    check (tipo_tratamiento is null or tipo_tratamiento in ('Empírico', 'Dirigido')),
  constraint tratamientos_valoracion_round_treatment_key unique (ronda_id, tratamiento_id)
);

create table if not exists public.decisiones_intervencion (
  id uuid primary key default gen_random_uuid(),
  ips_id uuid not null references public.ips(id),
  caso_id uuid not null references public.casos_proa(id),
  intervencion_id uuid not null references public.intervenciones_proa(id),
  ronda_id uuid not null references public.rondas_proa(id),
  decision text not null,
  justificacion text,
  profesional_id uuid not null references public.perfiles_usuario(usuario_id),
  fecha_decision timestamptz not null default now(),
  constraint decisiones_intervencion_decision_check
    check (decision in ('Aceptada', 'No aceptada', 'Parcialmente aceptada')),
  constraint decisiones_intervencion_round_key unique (intervencion_id, ronda_id)
);

create table if not exists public.implementaciones_intervencion (
  id uuid primary key default gen_random_uuid(),
  ips_id uuid not null references public.ips(id),
  caso_id uuid not null references public.casos_proa(id),
  intervencion_id uuid not null references public.intervenciones_proa(id),
  ronda_id uuid not null references public.rondas_proa(id),
  estado text not null,
  detalle text,
  tratamiento_resultante_id uuid references public.tratamientos_antimicrobianos(id),
  profesional_id uuid not null references public.perfiles_usuario(usuario_id),
  fecha_implementacion timestamptz not null default now(),
  constraint implementaciones_intervencion_estado_check
    check (estado in ('Implementación parcial', 'Implementada', 'No implementada')),
  constraint implementaciones_intervencion_round_key unique (intervencion_id, ronda_id)
);

create index if not exists tratamientos_valoracion_case_round_idx
  on public.tratamientos_valoracion (caso_id, ronda_id);
create index if not exists decisiones_intervencion_case_date_idx
  on public.decisiones_intervencion (caso_id, fecha_decision desc);
create index if not exists implementaciones_intervencion_case_date_idx
  on public.implementaciones_intervencion (caso_id, fecha_implementacion desc);

alter table public.tratamientos_valoracion enable row level security;
alter table public.decisiones_intervencion enable row level security;
alter table public.implementaciones_intervencion enable row level security;

create or replace function public.validar_integridad_trazabilidad_est03b()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_round public.rondas_proa%rowtype;
  v_previous_round public.rondas_proa%rowtype;
  v_treatment public.tratamientos_antimicrobianos%rowtype;
  v_intervention public.intervenciones_proa%rowtype;
  v_origin_round public.rondas_proa%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.ips_id is distinct from old.ips_id
       or new.caso_id is distinct from old.caso_id
       or new.ronda_id is distinct from old.ronda_id then
      raise exception 'EST03B_CONTEXT: No se puede trasladar trazabilidad entre IPS, casos o rondas';
    end if;
    if tg_table_name = 'tratamientos_valoracion' then
      if new.paciente_id is distinct from old.paciente_id
         or new.tratamiento_id is distinct from old.tratamiento_id then
        raise exception 'EST03B_CONTEXT: No se puede cambiar el paciente o tratamiento de una valoración';
      end if;
    else
      if new.intervencion_id is distinct from old.intervencion_id
         or new.profesional_id is distinct from old.profesional_id then
        raise exception 'EST03B_CONTEXT: No se puede cambiar la intervención o autor de un registro histórico';
      end if;
    end if;

    select * into v_previous_round
    from public.rondas_proa
    where id = old.ronda_id;
    if not found or v_previous_round.estado <> 'Borrador' then
      raise exception 'EST03B_CONFIRMED: Los registros de una ronda confirmada son inmutables';
    end if;
  end if;

  select * into v_round
  from public.rondas_proa
  where id = new.ronda_id;
  if not found or v_round.estado <> 'Borrador'
     or v_round.ips_id <> new.ips_id
     or v_round.caso_id <> new.caso_id then
    raise exception 'EST03B_CONTEXT: La ronda no pertenece a la IPS y caso indicados o no admite cambios';
  end if;

  if tg_table_name = 'tratamientos_valoracion' then
    if v_round.paciente_id <> new.paciente_id then
      raise exception 'EST03B_CONTEXT: El paciente de la valoración no coincide con la ronda';
    end if;
    select * into v_treatment
    from public.tratamientos_antimicrobianos
    where id = new.tratamiento_id;
    if not found
       or v_treatment.ips_id <> new.ips_id
       or v_treatment.paciente_id <> new.paciente_id
       or v_treatment.caso_id <> new.caso_id then
      raise exception 'EST03B_CONTEXT: El tratamiento valorado no pertenece al mismo paciente, caso e IPS';
    end if;
  else
    if auth.uid() is not null and new.profesional_id <> auth.uid() then
      raise exception 'EST03B_ACCESS: El profesional debe corresponder a la sesión autenticada';
    end if;
    select * into v_intervention
    from public.intervenciones_proa
    where id = new.intervencion_id;
    if not found then
      raise exception 'EST03B_CONTEXT: La intervención no existe';
    end if;
    select * into v_origin_round
    from public.rondas_proa
    where id = v_intervention.ronda_id;
    if not found
       or v_intervention.ips_id <> new.ips_id
       or v_origin_round.ips_id <> new.ips_id
       or v_origin_round.caso_id <> new.caso_id then
      raise exception 'EST03B_CONTEXT: La intervención no pertenece al mismo caso e IPS';
    end if;

    if tg_table_name = 'implementaciones_intervencion'
       and new.tratamiento_resultante_id is not null then
      select * into v_treatment
      from public.tratamientos_antimicrobianos
      where id = new.tratamiento_resultante_id;
      if not found
         or v_treatment.ips_id <> new.ips_id
         or v_treatment.caso_id <> new.caso_id then
        raise exception 'EST03B_CONTEXT: El tratamiento implementado no pertenece al mismo caso e IPS';
      end if;
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_validar_tratamientos_valoracion_est03b on public.tratamientos_valoracion;
create trigger trg_validar_tratamientos_valoracion_est03b
before insert or update on public.tratamientos_valoracion
for each row execute function public.validar_integridad_trazabilidad_est03b();

drop trigger if exists trg_validar_decisiones_intervencion_est03b on public.decisiones_intervencion;
create trigger trg_validar_decisiones_intervencion_est03b
before insert or update on public.decisiones_intervencion
for each row execute function public.validar_integridad_trazabilidad_est03b();

drop trigger if exists trg_validar_implementaciones_intervencion_est03b on public.implementaciones_intervencion;
create trigger trg_validar_implementaciones_intervencion_est03b
before insert or update on public.implementaciones_intervencion
for each row execute function public.validar_integridad_trazabilidad_est03b();

drop policy if exists tratamientos_valoracion_select on public.tratamientos_valoracion;
drop policy if exists tratamientos_valoracion_insert on public.tratamientos_valoracion;
drop policy if exists tratamientos_valoracion_update on public.tratamientos_valoracion;
create policy tratamientos_valoracion_select on public.tratamientos_valoracion for select to authenticated
  using (public.puede_leer_ips(tratamientos_valoracion.ips_id));
create policy tratamientos_valoracion_insert on public.tratamientos_valoracion for insert to authenticated
  with check (
    public.puede_escribir_operacion_ips(tratamientos_valoracion.ips_id)
    and exists (
      select 1 from public.rondas_proa r
      where r.id = tratamientos_valoracion.ronda_id
        and r.ips_id = tratamientos_valoracion.ips_id
        and r.paciente_id = tratamientos_valoracion.paciente_id
        and r.caso_id = tratamientos_valoracion.caso_id
        and r.estado = 'Borrador'
    )
    and exists (
      select 1 from public.tratamientos_antimicrobianos t
      where t.id = tratamientos_valoracion.tratamiento_id
        and t.ips_id = tratamientos_valoracion.ips_id
        and t.paciente_id = tratamientos_valoracion.paciente_id
        and t.caso_id = tratamientos_valoracion.caso_id
    )
  );
create policy tratamientos_valoracion_update on public.tratamientos_valoracion for update to authenticated
  using (
    public.puede_escribir_operacion_ips(tratamientos_valoracion.ips_id)
    and exists (
      select 1 from public.rondas_proa r
      where r.id = tratamientos_valoracion.ronda_id
        and r.ips_id = tratamientos_valoracion.ips_id
        and r.paciente_id = tratamientos_valoracion.paciente_id
        and r.caso_id = tratamientos_valoracion.caso_id
        and r.estado = 'Borrador'
    )
    and exists (
      select 1 from public.tratamientos_antimicrobianos t
      where t.id = tratamientos_valoracion.tratamiento_id
        and t.ips_id = tratamientos_valoracion.ips_id
        and t.paciente_id = tratamientos_valoracion.paciente_id
        and t.caso_id = tratamientos_valoracion.caso_id
    )
  )
  with check (
    public.puede_escribir_operacion_ips(tratamientos_valoracion.ips_id)
    and exists (
      select 1 from public.rondas_proa r
      where r.id = tratamientos_valoracion.ronda_id
        and r.ips_id = tratamientos_valoracion.ips_id
        and r.paciente_id = tratamientos_valoracion.paciente_id
        and r.caso_id = tratamientos_valoracion.caso_id
        and r.estado = 'Borrador'
    )
    and exists (
      select 1 from public.tratamientos_antimicrobianos t
      where t.id = tratamientos_valoracion.tratamiento_id
        and t.ips_id = tratamientos_valoracion.ips_id
        and t.paciente_id = tratamientos_valoracion.paciente_id
        and t.caso_id = tratamientos_valoracion.caso_id
    )
  );

drop policy if exists decisiones_intervencion_select on public.decisiones_intervencion;
drop policy if exists decisiones_intervencion_insert on public.decisiones_intervencion;
drop policy if exists decisiones_intervencion_update on public.decisiones_intervencion;
create policy decisiones_intervencion_select on public.decisiones_intervencion for select to authenticated
  using (public.puede_leer_ips(decisiones_intervencion.ips_id));
create policy decisiones_intervencion_insert on public.decisiones_intervencion for insert to authenticated
  with check (
    public.puede_escribir_operacion_ips(decisiones_intervencion.ips_id)
    and decisiones_intervencion.profesional_id = auth.uid()
    and exists (
      select 1 from public.rondas_proa r
      where r.id = decisiones_intervencion.ronda_id
        and r.ips_id = decisiones_intervencion.ips_id
        and r.caso_id = decisiones_intervencion.caso_id
        and r.estado = 'Borrador'
    )
    and exists (
      select 1 from public.intervenciones_proa i
      join public.rondas_proa origin_round on origin_round.id = i.ronda_id
      where i.id = decisiones_intervencion.intervencion_id
        and i.ips_id = decisiones_intervencion.ips_id
        and origin_round.ips_id = decisiones_intervencion.ips_id
        and origin_round.caso_id = decisiones_intervencion.caso_id
    )
  );
create policy decisiones_intervencion_update on public.decisiones_intervencion for update to authenticated
  using (
    public.puede_escribir_operacion_ips(decisiones_intervencion.ips_id)
    and decisiones_intervencion.profesional_id = auth.uid()
    and exists (
      select 1 from public.rondas_proa r
      where r.id = decisiones_intervencion.ronda_id
        and r.ips_id = decisiones_intervencion.ips_id
        and r.caso_id = decisiones_intervencion.caso_id
        and r.estado = 'Borrador'
    )
    and exists (
      select 1 from public.intervenciones_proa i
      join public.rondas_proa origin_round on origin_round.id = i.ronda_id
      where i.id = decisiones_intervencion.intervencion_id
        and i.ips_id = decisiones_intervencion.ips_id
        and origin_round.ips_id = decisiones_intervencion.ips_id
        and origin_round.caso_id = decisiones_intervencion.caso_id
    )
  )
  with check (
    public.puede_escribir_operacion_ips(decisiones_intervencion.ips_id)
    and decisiones_intervencion.profesional_id = auth.uid()
    and exists (
      select 1 from public.rondas_proa r
      where r.id = decisiones_intervencion.ronda_id
        and r.ips_id = decisiones_intervencion.ips_id
        and r.caso_id = decisiones_intervencion.caso_id
        and r.estado = 'Borrador'
    )
    and exists (
      select 1 from public.intervenciones_proa i
      join public.rondas_proa origin_round on origin_round.id = i.ronda_id
      where i.id = decisiones_intervencion.intervencion_id
        and i.ips_id = decisiones_intervencion.ips_id
        and origin_round.ips_id = decisiones_intervencion.ips_id
        and origin_round.caso_id = decisiones_intervencion.caso_id
    )
  );

drop policy if exists implementaciones_intervencion_select on public.implementaciones_intervencion;
drop policy if exists implementaciones_intervencion_insert on public.implementaciones_intervencion;
drop policy if exists implementaciones_intervencion_update on public.implementaciones_intervencion;
create policy implementaciones_intervencion_select on public.implementaciones_intervencion for select to authenticated
  using (public.puede_leer_ips(implementaciones_intervencion.ips_id));
create policy implementaciones_intervencion_insert on public.implementaciones_intervencion for insert to authenticated
  with check (
    public.puede_escribir_operacion_ips(implementaciones_intervencion.ips_id)
    and implementaciones_intervencion.profesional_id = auth.uid()
    and exists (
      select 1 from public.rondas_proa r
      where r.id = implementaciones_intervencion.ronda_id
        and r.ips_id = implementaciones_intervencion.ips_id
        and r.caso_id = implementaciones_intervencion.caso_id
        and r.estado = 'Borrador'
    )
    and exists (
      select 1 from public.intervenciones_proa i
      join public.rondas_proa origin_round on origin_round.id = i.ronda_id
      where i.id = implementaciones_intervencion.intervencion_id
        and i.ips_id = implementaciones_intervencion.ips_id
        and origin_round.ips_id = implementaciones_intervencion.ips_id
        and origin_round.caso_id = implementaciones_intervencion.caso_id
    )
  );
create policy implementaciones_intervencion_update on public.implementaciones_intervencion for update to authenticated
  using (
    public.puede_escribir_operacion_ips(implementaciones_intervencion.ips_id)
    and implementaciones_intervencion.profesional_id = auth.uid()
    and exists (
      select 1 from public.rondas_proa r
      where r.id = implementaciones_intervencion.ronda_id
        and r.ips_id = implementaciones_intervencion.ips_id
        and r.caso_id = implementaciones_intervencion.caso_id
        and r.estado = 'Borrador'
    )
    and exists (
      select 1 from public.intervenciones_proa i
      join public.rondas_proa origin_round on origin_round.id = i.ronda_id
      where i.id = implementaciones_intervencion.intervencion_id
        and i.ips_id = implementaciones_intervencion.ips_id
        and origin_round.ips_id = implementaciones_intervencion.ips_id
        and origin_round.caso_id = implementaciones_intervencion.caso_id
    )
  )
  with check (
    public.puede_escribir_operacion_ips(implementaciones_intervencion.ips_id)
    and implementaciones_intervencion.profesional_id = auth.uid()
    and exists (
      select 1 from public.rondas_proa r
      where r.id = implementaciones_intervencion.ronda_id
        and r.ips_id = implementaciones_intervencion.ips_id
        and r.caso_id = implementaciones_intervencion.caso_id
        and r.estado = 'Borrador'
    )
    and exists (
      select 1 from public.intervenciones_proa i
      join public.rondas_proa origin_round on origin_round.id = i.ronda_id
      where i.id = implementaciones_intervencion.intervencion_id
        and i.ips_id = implementaciones_intervencion.ips_id
        and origin_round.ips_id = implementaciones_intervencion.ips_id
        and origin_round.caso_id = implementaciones_intervencion.caso_id
    )
  );

grant select, insert, update on public.tratamientos_valoracion to authenticated;
grant select, insert, update on public.decisiones_intervencion to authenticated;
grant select, insert, update on public.implementaciones_intervencion to authenticated;

create or replace function public.registrar_seguimiento_intervencion(
  p_intervencion_id uuid,
  p_ronda_id uuid,
  p_decision text default null,
  p_justificacion text default null,
  p_estado_implementacion text default null,
  p_detalle_implementacion text default null,
  p_tratamiento_resultante_id uuid default null,
  p_fecha_implementacion timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_intervention public.intervenciones_proa%rowtype;
  v_origin_round public.rondas_proa%rowtype;
  v_followup_round public.rondas_proa%rowtype;
  v_decision public.decisiones_intervencion%rowtype;
  v_implementation public.implementaciones_intervencion%rowtype;
  v_acceptance text;
begin
  if auth.uid() is null then
    raise exception 'EST03B_ACCESS: Se requiere una sesión autenticada';
  end if;

  select * into v_intervention from public.intervenciones_proa where id = p_intervencion_id for update;
  if not found or not v_intervention.hubo_intervencion then
    raise exception 'EST03B_CONTEXT: No se encontró una intervención terapéutica válida';
  end if;
  select * into v_origin_round from public.rondas_proa where id = v_intervention.ronda_id;
  select * into v_followup_round from public.rondas_proa where id = p_ronda_id for update;
  if v_origin_round.id is null or v_followup_round.id is null
     or v_origin_round.ips_id <> v_followup_round.ips_id
     or v_origin_round.caso_id <> v_followup_round.caso_id then
    raise exception 'EST03B_CONTEXT: La intervención y la ronda de seguimiento no pertenecen al mismo caso';
  end if;
  if v_followup_round.estado <> 'Borrador' then
    raise exception 'EST03B_CONFIRMED: La trazabilidad de una ronda confirmada es de solo lectura';
  end if;
  if not public.puede_escribir_operacion_ips(v_followup_round.ips_id) then
    raise exception 'EST03B_ACCESS: No tienes permisos para registrar este seguimiento';
  end if;

  if p_decision is not null then
    if p_decision not in ('Aceptada', 'No aceptada', 'Parcialmente aceptada') then
      raise exception 'EST03B_DECISION: La decisión del médico tratante no es válida';
    end if;
    if p_decision in ('No aceptada', 'Parcialmente aceptada') and nullif(btrim(p_justificacion), '') is null then
      raise exception 'EST03B_DECISION: Registra el motivo de la decisión';
    end if;
    insert into public.decisiones_intervencion (
      ips_id, caso_id, intervencion_id, ronda_id, decision, justificacion, profesional_id
    ) values (
      v_followup_round.ips_id, v_followup_round.caso_id, p_intervencion_id, p_ronda_id,
      p_decision, nullif(btrim(p_justificacion), ''), auth.uid()
    )
    on conflict (intervencion_id, ronda_id) do update set
      decision = excluded.decision,
      justificacion = excluded.justificacion,
      profesional_id = auth.uid(),
      fecha_decision = now()
    returning * into v_decision;

    v_acceptance := case p_decision
      when 'Aceptada' then 'Sí'
      when 'No aceptada' then 'No'
      else 'Parcialmente'
    end;
    -- La intervención de una ronda confirmada es historia clínica inmutable.
    -- En seguimientos posteriores, la decisión vigente vive en la tabla
    -- longitudinal y en el MART, sin reescribir la ronda de origen.
    if v_origin_round.estado = 'Borrador' then
      update public.intervenciones_proa
      set aceptacion = v_acceptance,
          motivo_no_aceptacion = case when v_acceptance in ('No', 'Parcialmente') then nullif(btrim(p_justificacion), '') end
      where id = p_intervencion_id;
    end if;
  end if;

  if p_estado_implementacion is not null then
    if p_estado_implementacion not in ('Implementación parcial', 'Implementada', 'No implementada') then
      raise exception 'EST03B_IMPLEMENTATION: El estado de implementación no es válido';
    end if;
    if p_estado_implementacion = 'No implementada' and nullif(btrim(p_detalle_implementacion), '') is null then
      raise exception 'EST03B_IMPLEMENTATION: Registra el motivo de no implementación';
    end if;
    if p_tratamiento_resultante_id is not null and not exists (
      select 1 from public.tratamientos_antimicrobianos t
      where t.id = p_tratamiento_resultante_id
        and t.ips_id = v_followup_round.ips_id and t.caso_id = v_followup_round.caso_id
    ) then
      raise exception 'EST03B_CONTEXT: El tratamiento implementado no pertenece al caso';
    end if;
    insert into public.implementaciones_intervencion (
      ips_id, caso_id, intervencion_id, ronda_id, estado, detalle,
      tratamiento_resultante_id, profesional_id, fecha_implementacion
    ) values (
      v_followup_round.ips_id, v_followup_round.caso_id, p_intervencion_id, p_ronda_id,
      p_estado_implementacion, nullif(btrim(p_detalle_implementacion), ''),
      p_tratamiento_resultante_id, auth.uid(), coalesce(p_fecha_implementacion, now())
    )
    on conflict (intervencion_id, ronda_id) do update set
      estado = excluded.estado,
      detalle = excluded.detalle,
      tratamiento_resultante_id = excluded.tratamiento_resultante_id,
      profesional_id = auth.uid(),
      fecha_implementacion = coalesce(p_fecha_implementacion, now())
    returning * into v_implementation;
  end if;

  return jsonb_build_object(
    'decision', case when v_decision.id is null then null else to_jsonb(v_decision) end,
    'implementation', case when v_implementation.id is null then null else to_jsonb(v_implementation) end
  );
end;
$function$;

revoke all on function public.registrar_seguimiento_intervencion(uuid, uuid, text, text, text, text, uuid, timestamptz) from public;
revoke all on function public.registrar_seguimiento_intervencion(uuid, uuid, text, text, text, text, uuid, timestamptz) from anon;
grant execute on function public.registrar_seguimiento_intervencion(uuid, uuid, text, text, text, text, uuid, timestamptz) to authenticated;

create or replace function public.guardar_ronda_clinica_trazable(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_round public.rondas_proa%rowtype;
  v_result jsonb;
  v_item jsonb;
  v_treatment public.tratamientos_antimicrobianos%rowtype;
  v_intervention public.intervenciones_proa%rowtype;
  v_no_antimicrobials boolean := coalesce((p_payload ->> 'no_antimicrobials_at_assessment')::boolean, false);
  v_confirm boolean := coalesce((p_payload ->> 'confirm')::boolean, false);
begin
  if auth.uid() is null then
    raise exception 'EST03B_ACCESS: Se requiere una sesión autenticada';
  end if;
  select * into v_round
  from public.rondas_proa
  where id = nullif(p_payload ->> 'round_id', '')::uuid
  for update;
  if not found or v_round.estado <> 'Borrador' then
    raise exception 'EST03B_CONTEXT: La ronda no existe o no admite modificaciones';
  end if;
  if not public.puede_escribir_operacion_ips(v_round.ips_id) then
    raise exception 'EST03B_ACCESS: No tienes permisos para modificar esta ronda';
  end if;

  if v_no_antimicrobials and (
    exists (select 1 from public.tratamientos_antimicrobianos t where t.caso_id = v_round.caso_id and t.estado = 'Activo')
    or jsonb_array_length(coalesce(p_payload -> 'new_treatments', '[]'::jsonb)) > 0
  ) then
    raise exception 'EST03B_TREATMENT: El caso tiene tratamientos activos; no puede marcarse sin antimicrobianos';
  end if;

  update public.rondas_proa
  set sin_antimicrobianos_valoracion = v_no_antimicrobials
  where id = v_round.id;

  if not v_no_antimicrobials then
    insert into public.tratamientos_valoracion (
      ips_id, paciente_id, caso_id, ronda_id, tratamiento_id, antimicrobiano_id,
      antimicrobiano, dosis, unidad, via, frecuencia, fecha_inicio,
      indicacion_clinica, tipo_tratamiento, estado_al_valorar
    )
    select t.ips_id, t.paciente_id, t.caso_id, v_round.id, t.id, t.antimicrobiano_id,
      t.antimicrobiano, t.dosis, t.unidad, t.via, t.frecuencia, t.fecha_inicio,
      t.indicacion_clinica, t.tipo_tratamiento, t.estado
    from public.tratamientos_antimicrobianos t
    where t.caso_id = v_round.caso_id and t.ips_id = v_round.ips_id and t.estado = 'Activo'
    on conflict (ronda_id, tratamiento_id) do nothing;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'treatment_assessment', '[]'::jsonb))
  loop
    select * into v_treatment
    from public.tratamientos_antimicrobianos t
    where t.id = nullif(v_item ->> 'treatment_id', '')::uuid
      and t.ips_id = v_round.ips_id and t.caso_id = v_round.caso_id
    for update;
    if not found then
      raise exception 'EST03B_TREATMENT: El tratamiento valorado no pertenece al caso';
    end if;
    if nullif(v_item ->> 'therapy_type', '') is not null
       and (v_item ->> 'therapy_type') not in ('Empírico', 'Dirigido') then
      raise exception 'EST03B_TREATMENT: El tipo de tratamiento no es válido';
    end if;
    update public.tratamientos_antimicrobianos
    set indicacion_clinica = nullif(btrim(v_item ->> 'indication'), ''),
        tipo_tratamiento = nullif(v_item ->> 'therapy_type', '')
    where id = v_treatment.id;
    update public.tratamientos_valoracion
    set indicacion_clinica = nullif(btrim(v_item ->> 'indication'), ''),
        tipo_tratamiento = nullif(v_item ->> 'therapy_type', '')
    where ronda_id = v_round.id and tratamiento_id = v_treatment.id;
  end loop;

  -- EST-01 confirma al final de su ejecución. Se difiere esa confirmación hasta
  -- guardar toda la trazabilidad para que las políticas de ronda Borrador sigan
  -- protegiendo las escrituras y el conjunto permanezca atómico.
  v_result := public.guardar_ronda_clinica(jsonb_set(p_payload, '{confirm}', 'false'::jsonb, true));

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'new_treatments', '[]'::jsonb))
  loop
    select * into v_treatment
    from public.tratamientos_antimicrobianos t
    where t.ronda_id = v_round.id
      and t.antimicrobiano_id = nullif(v_item ->> 'antimicrobial_id', '')::uuid
      and t.fecha_inicio::date = coalesce(nullif(v_item ->> 'start_date', '')::date, current_date)
    order by t.fecha_ultima_modificacion desc limit 1;
    if v_treatment.id is not null then
      if nullif(v_item ->> 'therapy_type', '') is not null
         and (v_item ->> 'therapy_type') not in ('Empírico', 'Dirigido') then
        raise exception 'EST03B_TREATMENT: El tipo de tratamiento no es válido';
      end if;
      update public.tratamientos_antimicrobianos
      set indicacion_clinica = nullif(btrim(v_item ->> 'indication'), ''),
          tipo_tratamiento = nullif(v_item ->> 'therapy_type', '')
      where id = v_treatment.id
      returning * into v_treatment;
      insert into public.tratamientos_valoracion (
        ips_id, paciente_id, caso_id, ronda_id, tratamiento_id, antimicrobiano_id,
        antimicrobiano, dosis, unidad, via, frecuencia, fecha_inicio,
        indicacion_clinica, tipo_tratamiento, estado_al_valorar
      ) values (
        v_treatment.ips_id, v_treatment.paciente_id, v_treatment.caso_id, v_round.id,
        v_treatment.id, v_treatment.antimicrobiano_id, v_treatment.antimicrobiano,
        v_treatment.dosis, v_treatment.unidad, v_treatment.via, v_treatment.frecuencia,
        v_treatment.fecha_inicio, v_treatment.indicacion_clinica, v_treatment.tipo_tratamiento,
        v_treatment.estado
      ) on conflict (ronda_id, tratamiento_id) do update set
        indicacion_clinica = excluded.indicacion_clinica,
        tipo_tratamiento = excluded.tipo_tratamiento;
    end if;
  end loop;

  if p_payload ? 'intervention' then
    select * into v_intervention
    from public.intervenciones_proa i where i.ronda_id = v_round.id
    order by i.fecha_creacion limit 1 for update;
    if v_intervention.id is not null and v_intervention.hubo_intervencion then
      v_item := p_payload -> 'intervention';
      if nullif(v_item ->> 'therapeutic_action', '') is not null
         and (v_item ->> 'therapeutic_action') not in ('Continuar', 'Ajustar', 'Suspender', 'Sustituir', 'Iniciar tratamiento') then
        raise exception 'EST03B_INTERVENTION: La acción terapéutica recomendada no es válida';
      end if;
      if (v_item ->> 'therapeutic_action') in ('Sustituir', 'Iniciar tratamiento')
         and nullif(v_item ->> 'recommended_antimicrobial_id', '') is null then
        raise exception 'EST03B_INTERVENTION: Selecciona el antimicrobiano recomendado';
      end if;
      update public.intervenciones_proa
      set accion_terapeutica = nullif(v_item ->> 'therapeutic_action', ''),
          antimicrobiano_recomendado_id = nullif(v_item ->> 'recommended_antimicrobial_id', '')::uuid,
          antimicrobiano_recomendado = nullif(btrim(v_item ->> 'recommended_antimicrobial'), ''),
          dosis_recomendada = nullif(v_item ->> 'recommended_dose', '')::numeric,
          unidad_recomendada = nullif(btrim(v_item ->> 'recommended_unit'), ''),
          via_recomendada = nullif(btrim(v_item ->> 'recommended_route'), ''),
          frecuencia_recomendada = nullif(btrim(v_item ->> 'recommended_frequency'), '')
      where id = v_intervention.id;

      if nullif(v_item ->> 'decision', '') is not null or nullif(v_item ->> 'implementation_status', '') is not null then
        perform public.registrar_seguimiento_intervencion(
          v_intervention.id, v_round.id,
          nullif(v_item ->> 'decision', ''), nullif(v_item ->> 'decision_reason', ''),
          nullif(v_item ->> 'implementation_status', ''), nullif(v_item ->> 'implementation_detail', ''),
          nullif(v_item ->> 'implemented_treatment_id', '')::uuid,
          nullif(v_item ->> 'implementation_date', '')::timestamptz
        );
      end if;
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'intervention_followups', '[]'::jsonb))
  loop
    perform public.registrar_seguimiento_intervencion(
      nullif(v_item ->> 'intervention_id', '')::uuid, v_round.id,
      nullif(v_item ->> 'decision', ''), nullif(v_item ->> 'decision_reason', ''),
      nullif(v_item ->> 'implementation_status', ''), nullif(v_item ->> 'implementation_detail', ''),
      nullif(v_item ->> 'implemented_treatment_id', '')::uuid,
      nullif(v_item ->> 'implementation_date', '')::timestamptz
    );
  end loop;

  if v_confirm then
    v_result := public.guardar_ronda_clinica(p_payload);
  end if;

  return v_result || jsonb_build_object('traceability_saved', true);
exception
  when raise_exception then raise;
  when others then
    raise exception 'EST03B_UNEXPECTED: No se pudo guardar la trazabilidad terapéutica' using detail = sqlstate;
end;
$function$;

revoke all on function public.guardar_ronda_clinica_trazable(jsonb) from public;
revoke all on function public.guardar_ronda_clinica_trazable(jsonb) from anon;
grant execute on function public.guardar_ronda_clinica_trazable(jsonb) to authenticated;

create or replace view public.mart_trazabilidad_terapeutica
with (security_invoker = true)
as
select
  i.id as intervencion_id,
  r.ips_id,
  r.caso_id,
  r.paciente_id,
  i.ronda_id as ronda_recomendacion_id,
  r.fecha_hora_ronda as fecha_recomendacion,
  i.accion_terapeutica,
  i.recomendacion,
  i.descripcion_recomendacion,
  coalesce(
    case d.decision
      when 'Aceptada' then 'Sí'
      when 'No aceptada' then 'No'
      when 'Parcialmente aceptada' then 'Parcialmente'
    end,
    i.aceptacion
  ) as aceptacion_actual,
  d.decision,
  d.fecha_decision,
  d.profesional_id as profesional_decision_id,
  imp.estado as estado_implementacion,
  imp.fecha_implementacion,
  imp.profesional_id as profesional_implementacion_id,
  imp.tratamiento_resultante_id,
  extract(epoch from (d.fecha_decision - r.fecha_hora_ronda)) / 3600.0 as horas_hasta_decision,
  extract(epoch from (imp.fecha_implementacion - r.fecha_hora_ronda)) / 3600.0 as horas_hasta_implementacion,
  (d.id is null) as decision_pendiente,
  (imp.id is null) as implementacion_pendiente
from public.intervenciones_proa i
join public.rondas_proa r on r.id = i.ronda_id
left join lateral (
  select di.* from public.decisiones_intervencion di
  where di.intervencion_id = i.id order by di.fecha_decision desc limit 1
) d on true
left join lateral (
  select ii.* from public.implementaciones_intervencion ii
  where ii.intervencion_id = i.id order by ii.fecha_implementacion desc limit 1
) imp on true
where i.hubo_intervencion;

grant select on public.mart_trazabilidad_terapeutica to authenticated;

comment on table public.tratamientos_valoracion is
  'Instantánea inmutable por ronda de los antimicrobianos recibidos al iniciar la valoración.';
comment on table public.decisiones_intervencion is
  'Decisiones longitudinales del médico tratante registradas por ronda de seguimiento.';
comment on table public.implementaciones_intervencion is
  'Confirmaciones longitudinales de implementación efectiva por ronda de seguimiento.';
comment on function public.guardar_ronda_clinica_trazable(jsonb) is
  'Extiende el guardado atómico EST-01 con instantáneas terapéuticas y seguimiento de recomendaciones.';

commit;
