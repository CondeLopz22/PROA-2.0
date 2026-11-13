begin;

create or replace function public.validar_intervencion_clinica_est03b()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_old_round public.rondas_proa%rowtype;
  v_new_round public.rondas_proa%rowtype;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select * into v_old_round
    from public.rondas_proa
    where id = old.ronda_id;
    if not found
       or v_old_round.ips_id <> old.ips_id
       or v_old_round.estado <> 'Borrador' then
      raise exception 'EST03B_CONFIRMED: Una intervención de una ronda confirmada o anulada es inmutable';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    if tg_op = 'UPDATE' and (
      new.id is distinct from old.id
      or new.ips_id is distinct from old.ips_id
      or new.ronda_id is distinct from old.ronda_id
    ) then
      raise exception 'EST03B_CONTEXT: No se puede trasladar una intervención entre IPS o rondas';
    end if;
    select * into v_new_round
    from public.rondas_proa
    where id = new.ronda_id;
    if not found
       or v_new_round.ips_id <> new.ips_id
       or v_new_round.estado <> 'Borrador' then
      raise exception 'EST03B_CONTEXT: La intervención no pertenece a una ronda borrador de la misma IPS';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_validar_intervencion_clinica_est03b on public.intervenciones_proa;
create trigger trg_validar_intervencion_clinica_est03b
before insert or update or delete on public.intervenciones_proa
for each row execute function public.validar_intervencion_clinica_est03b();

drop policy if exists intervenciones_insert on public.intervenciones_proa;
drop policy if exists intervenciones_update on public.intervenciones_proa;
drop policy if exists intervenciones_delete on public.intervenciones_proa;

create policy intervenciones_insert on public.intervenciones_proa
for insert to authenticated
with check (
  public.puede_escribir_operacion_ips(intervenciones_proa.ips_id)
  and exists (
    select 1
    from public.rondas_proa r
    where r.id = intervenciones_proa.ronda_id
      and r.ips_id = intervenciones_proa.ips_id
      and r.estado = 'Borrador'
  )
);

create policy intervenciones_update on public.intervenciones_proa
for update to authenticated
using (
  public.puede_escribir_operacion_ips(intervenciones_proa.ips_id)
  and exists (
    select 1
    from public.rondas_proa r
    where r.id = intervenciones_proa.ronda_id
      and r.ips_id = intervenciones_proa.ips_id
      and r.estado = 'Borrador'
  )
)
with check (
  public.puede_escribir_operacion_ips(intervenciones_proa.ips_id)
  and exists (
    select 1
    from public.rondas_proa r
    where r.id = intervenciones_proa.ronda_id
      and r.ips_id = intervenciones_proa.ips_id
      and r.estado = 'Borrador'
  )
);

create policy intervenciones_delete on public.intervenciones_proa
for delete to authenticated
using (
  public.puede_escribir_operacion_ips(intervenciones_proa.ips_id)
  and exists (
    select 1
    from public.rondas_proa r
    where r.id = intervenciones_proa.ronda_id
      and r.ips_id = intervenciones_proa.ips_id
      and r.estado = 'Borrador'
  )
);

create or replace function public.validar_intervencion_tratamiento_est03b()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_intervention public.intervenciones_proa%rowtype;
  v_round public.rondas_proa%rowtype;
  v_treatment public.tratamientos_antimicrobianos%rowtype;
  v_intervention_id uuid := case when tg_op = 'DELETE' then old.intervencion_id else new.intervencion_id end;
  v_treatment_id uuid := case when tg_op = 'DELETE' then old.tratamiento_id else new.tratamiento_id end;
begin
  select * into v_intervention
  from public.intervenciones_proa
  where id = v_intervention_id;
  if not found then
    -- Durante ON DELETE CASCADE la fila padre ya puede no ser visible para el
    -- trigger hijo. La eliminación del padre fue validada por su propio trigger.
    if tg_op = 'DELETE' then
      return old;
    end if;
    raise exception 'EST03B_CONTEXT: La intervención relacionada no existe';
  end if;

  select * into v_round
  from public.rondas_proa
  where id = v_intervention.ronda_id;
  if not found or v_round.estado <> 'Borrador' or v_round.ips_id <> v_intervention.ips_id then
    raise exception 'EST03B_CONFIRMED: Las relaciones de una intervención confirmada son inmutables';
  end if;

  if tg_op <> 'DELETE' then
    select * into v_treatment
    from public.tratamientos_antimicrobianos
    where id = v_treatment_id;
    if not found
       or v_treatment.ips_id <> v_intervention.ips_id
       or v_treatment.paciente_id <> v_round.paciente_id
       or v_treatment.caso_id <> v_round.caso_id then
      raise exception 'EST03B_CONTEXT: El tratamiento y la intervención no pertenecen al mismo paciente, caso e IPS';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_validar_intervencion_tratamiento_est03b on public.intervencion_tratamiento;
create trigger trg_validar_intervencion_tratamiento_est03b
before insert or update or delete on public.intervencion_tratamiento
for each row execute function public.validar_intervencion_tratamiento_est03b();

drop policy if exists int_trat_insert on public.intervencion_tratamiento;
drop policy if exists int_trat_delete on public.intervencion_tratamiento;

create policy int_trat_insert on public.intervencion_tratamiento
for insert to authenticated
with check (
  exists (
    select 1
    from public.intervenciones_proa i
    join public.rondas_proa r on r.id = i.ronda_id
    join public.tratamientos_antimicrobianos t
      on t.id = intervencion_tratamiento.tratamiento_id
    where i.id = intervencion_tratamiento.intervencion_id
      and public.puede_escribir_operacion_ips(i.ips_id)
      and r.estado = 'Borrador'
      and r.ips_id = i.ips_id
      and t.ips_id = i.ips_id
      and t.paciente_id = r.paciente_id
      and t.caso_id = r.caso_id
  )
);

create policy int_trat_delete on public.intervencion_tratamiento
for delete to authenticated
using (
  exists (
    select 1
    from public.intervenciones_proa i
    join public.rondas_proa r on r.id = i.ronda_id
    where i.id = intervencion_tratamiento.intervencion_id
      and public.puede_escribir_operacion_ips(i.ips_id)
      and r.estado = 'Borrador'
      and r.ips_id = i.ips_id
  )
);

create or replace view public.mart_intervenciones_proa
with (security_invoker = true)
as
select
  ip.id as intervencion_id,
  ip.ronda_id,
  r.caso_id,
  r.paciente_id,
  ip.ips_id,
  i.nombre as ips,
  r.fecha_hora_ronda,
  date_trunc('month', r.fecha_hora_ronda)::date as periodo,
  r.servicio_id,
  s.nombre as servicio,
  ip.hubo_intervencion,
  ip.tipo_intervencion,
  ip.origen_intervencion,
  ip.recomendacion,
  ip.descripcion_recomendacion,
  ip.motivo_no_intervencion,
  coalesce(
    case latest_decision.decision
      when 'Aceptada' then 'Sí'
      when 'No aceptada' then 'No'
      when 'Parcialmente aceptada' then 'Parcialmente'
    end,
    ip.aceptacion
  ) as aceptacion,
  ip.motivo_no_aceptacion,
  ip.cumplimiento_guia,
  ip.motivo_no_cumplimiento,
  ip.dias_ahorrados,
  ip.requiere_seguimiento,
  ip.fecha_seguimiento,
  ip.motivo_seguimiento,
  rel.antimicrobianos_relacionados
from public.intervenciones_proa ip
join public.rondas_proa r on r.id = ip.ronda_id
join public.ips i on i.id = ip.ips_id
left join public.servicios_ips s on s.id = r.servicio_id
left join lateral (
  select di.decision
  from public.decisiones_intervencion di
  where di.intervencion_id = ip.id
  order by di.fecha_decision desc, di.id desc
  limit 1
) latest_decision on true
left join lateral (
  select string_agg(distinct ta.antimicrobiano, ', ' order by ta.antimicrobiano) as antimicrobianos_relacionados
  from public.intervencion_tratamiento it
  join public.tratamientos_antimicrobianos ta on ta.id = it.tratamiento_id
  where it.intervencion_id = ip.id
) rel on true;

grant select on public.mart_intervenciones_proa to authenticated;

comment on function public.validar_intervencion_clinica_est03b() is
  'Impide modificar o eliminar intervenciones asociadas a rondas confirmadas o anuladas.';
comment on function public.validar_intervencion_tratamiento_est03b() is
  'Garantiza integridad Multi-IPS y la inmutabilidad de las relaciones intervención-tratamiento.';

commit;
