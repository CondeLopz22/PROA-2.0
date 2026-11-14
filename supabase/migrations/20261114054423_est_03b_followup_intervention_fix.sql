begin;

-- A confirmed intervention is historical and read-only. Locking it with
-- FOR UPDATE incorrectly subjects the lookup to the UPDATE RLS policy, which
-- intentionally rejects rows whose origin round is no longer Borrador.
-- Concurrency is serialized on the writable follow-up round instead.
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

  select * into v_intervention
  from public.intervenciones_proa
  where id = p_intervencion_id;
  if not found or not v_intervention.hubo_intervencion then
    raise exception 'EST03B_CONTEXT: No se encontró una intervención terapéutica válida';
  end if;

  select * into v_origin_round
  from public.rondas_proa
  where id = v_intervention.ronda_id;

  select * into v_followup_round
  from public.rondas_proa
  where id = p_ronda_id
  for update;

  if v_origin_round.id is null or v_followup_round.id is null
     or v_origin_round.ips_id <> v_followup_round.ips_id
     or v_origin_round.paciente_id <> v_followup_round.paciente_id
     or v_origin_round.caso_id <> v_followup_round.caso_id then
    raise exception 'EST03B_CONTEXT: La intervención y la ronda de seguimiento no pertenecen al mismo paciente, caso e IPS';
  end if;
  if v_intervention.ips_id <> v_followup_round.ips_id then
    raise exception 'EST03B_CONTEXT: La intervención no pertenece a la IPS de la ronda de seguimiento';
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
    -- A confirmed origin round remains immutable. For an immediate decision
    -- on the same draft round, keep the legacy summary synchronized.
    if v_origin_round.estado = 'Borrador' then
      update public.intervenciones_proa
      set aceptacion = v_acceptance,
          motivo_no_aceptacion = case
            when v_acceptance in ('No', 'Parcialmente') then nullif(btrim(p_justificacion), '')
          end
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
        and t.ips_id = v_followup_round.ips_id
        and t.paciente_id = v_followup_round.paciente_id
        and t.caso_id = v_followup_round.caso_id
    ) then
      raise exception 'EST03B_CONTEXT: El tratamiento implementado no pertenece al paciente, caso e IPS';
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

comment on function public.registrar_seguimiento_intervencion(uuid, uuid, text, text, text, text, uuid, timestamptz) is
  'Registra decisiones e implementaciones longitudinales sobre intervenciones del mismo paciente, caso e IPS sin modificar rondas históricas confirmadas.';

commit;
