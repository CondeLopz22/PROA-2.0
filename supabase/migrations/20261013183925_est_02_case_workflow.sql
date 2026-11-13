begin;

create or replace function public.est02_caso_activo(p_estado text, p_fecha_cierre timestamptz)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_estado = 'Activo' and p_fecha_cierre is null;
$$;

create or replace function public.est02_validar_caso_activo_unico()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.ips_id::text || ':' || new.paciente_id::text, 0));

  if public.est02_caso_activo(new.estado, new.fecha_cierre) and exists (
    select 1
    from public.casos_proa c
    where c.ips_id = new.ips_id
      and c.paciente_id = new.paciente_id
      and c.id <> new.id
      and public.est02_caso_activo(c.estado, c.fecha_cierre)
  ) then
    raise exception 'EST02_ACTIVE_CASE: El paciente ya tiene un caso PROA activo en esta IPS'
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_est02_caso_activo_unico on public.casos_proa;
create trigger trg_est02_caso_activo_unico
before insert or update of ips_id, paciente_id, estado, fecha_cierre
on public.casos_proa
for each row execute function public.est02_validar_caso_activo_unico();

create or replace function public.est02_validar_nueva_ronda()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_case public.casos_proa%rowtype;
  v_round_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.caso_id::text, 0));

  select * into v_case
  from public.casos_proa c
  where c.id = new.caso_id;

  if not found
    or v_case.ips_id <> new.ips_id
    or v_case.paciente_id <> new.paciente_id then
    raise exception 'EST02_CONTEXT: El caso no corresponde al paciente y la IPS de la ronda';
  end if;

  if not public.est02_caso_activo(v_case.estado, v_case.fecha_cierre) then
    raise exception 'EST02_CLOSED_CASE: No se pueden crear rondas en un caso cerrado o anulado';
  end if;

  if exists (
    select 1 from public.rondas_proa r
    where r.caso_id = new.caso_id and r.estado = 'Borrador'
  ) then
    raise exception 'EST02_DRAFT_EXISTS: El caso ya tiene una ronda en borrador';
  end if;

  select count(*) into v_round_count
  from public.rondas_proa r
  where r.caso_id = new.caso_id
    and r.estado <> 'Anulada';

  new.tipo_valoracion := case when v_round_count = 0 then 'Primera valoración' else 'Seguimiento' end;
  return new;
end;
$$;

drop trigger if exists trg_est02_validar_nueva_ronda on public.rondas_proa;
create trigger trg_est02_validar_nueva_ronda
before insert on public.rondas_proa
for each row execute function public.est02_validar_nueva_ronda();

create or replace function public.iniciar_ronda_proa(
  p_ips_id uuid,
  p_paciente_id uuid,
  p_caso_id uuid default null,
  p_servicio_id uuid default null,
  p_cama text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_case public.casos_proa%rowtype;
  v_round public.rondas_proa%rowtype;
  v_case_created boolean := false;
  v_draft_reused boolean := false;
  v_round_count integer;
begin
  if auth.uid() is null or not public.puede_escribir_operacion_ips(p_ips_id) then
    raise exception 'EST02_ACCESS: No tiene permisos para iniciar una ronda en esta IPS';
  end if;

  perform 1
  from public.pacientes p
  where p.id = p_paciente_id and p.ips_id = p_ips_id;
  if not found then
    raise exception 'EST02_CONTEXT: El paciente no pertenece a la IPS seleccionada';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_ips_id::text || ':' || p_paciente_id::text, 0));

  if p_servicio_id is not null and not exists (
    select 1 from public.servicios_ips s
    where s.id = p_servicio_id and s.ips_id = p_ips_id and s.estado = 'Activo'
  ) then
    raise exception 'EST02_CONTEXT: El servicio no pertenece a la IPS o está inactivo';
  end if;

  if p_caso_id is null then
    if exists (
      select 1 from public.casos_proa c
      where c.ips_id = p_ips_id
        and c.paciente_id = p_paciente_id
        and public.est02_caso_activo(c.estado, c.fecha_cierre)
    ) then
      raise exception 'EST02_ACTIVE_CASE: El paciente ya tiene un caso PROA activo en esta IPS';
    end if;

    insert into public.casos_proa (ips_id, paciente_id, estado, fecha_apertura)
    values (p_ips_id, p_paciente_id, 'Activo', now())
    returning * into v_case;
    v_case_created := true;
  else
    select * into v_case
    from public.casos_proa c
    where c.id = p_caso_id
      and c.ips_id = p_ips_id
      and c.paciente_id = p_paciente_id
    for update;

    if not found then
      raise exception 'EST02_CONTEXT: El caso no corresponde al paciente y la IPS seleccionados';
    end if;
    if not public.est02_caso_activo(v_case.estado, v_case.fecha_cierre) then
      raise exception 'EST02_CLOSED_CASE: El caso debe reabrirse explícitamente antes de registrar otra ronda';
    end if;
  end if;

  select * into v_round
  from public.rondas_proa r
  where r.caso_id = v_case.id
    and r.ips_id = p_ips_id
    and r.paciente_id = p_paciente_id
    and r.estado = 'Borrador'
  order by r.fecha_creacion desc
  limit 1
  for update;

  if found then
    v_draft_reused := true;
  else
    select count(*) into v_round_count
    from public.rondas_proa r
    where r.caso_id = v_case.id
      and r.estado <> 'Anulada';

    insert into public.rondas_proa (
      ips_id, paciente_id, caso_id, servicio_id, cama,
      profesional_id, tipo_valoracion, estado, fecha_hora_ronda
    ) values (
      p_ips_id, p_paciente_id, v_case.id, p_servicio_id, nullif(btrim(p_cama), ''),
      auth.uid(),
      case when v_round_count = 0 then 'Primera valoración' else 'Seguimiento' end,
      'Borrador', now()
    ) returning * into v_round;
  end if;

  return jsonb_build_object(
    'case', to_jsonb(v_case),
    'round', to_jsonb(v_round),
    'case_created', v_case_created,
    'draft_reused', v_draft_reused
  );
end;
$$;

revoke all on function public.est02_caso_activo(text, timestamptz) from public;
revoke all on function public.est02_validar_caso_activo_unico() from public;
revoke all on function public.est02_validar_nueva_ronda() from public;
revoke all on function public.iniciar_ronda_proa(uuid, uuid, uuid, uuid, text) from public;
revoke all on function public.iniciar_ronda_proa(uuid, uuid, uuid, uuid, text) from anon;
grant execute on function public.est02_caso_activo(text, timestamptz) to authenticated;
grant execute on function public.iniciar_ronda_proa(uuid, uuid, uuid, uuid, text) to authenticated;

comment on function public.iniciar_ronda_proa(uuid, uuid, uuid, uuid, text) is
  'EST-02: crea caso + primera valoración o inicia/reutiliza borrador del caso activo, con contexto Multi-IPS validado.';

commit;
