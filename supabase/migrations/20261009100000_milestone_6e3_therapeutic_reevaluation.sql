-- Milestone 6E.3 - Oportunidades de reevaluacion terapeutica.
-- PENDIENTE DE APLICAR. Extension aditiva sobre Milestone 6E.2.

begin;

alter table public.configuracion_auditoria_proa
  add column if not exists umbral_reevaluacion_favorable_dias integer
  check (umbral_reevaluacion_favorable_dias is null or umbral_reevaluacion_favorable_dias > 0);

insert into public.reglas_auditoria_proa
  (codigo_regla, tipo_hallazgo, categoria, severidad, activa, parametro_umbral, descripcion)
values
  ('DES-02', 'Watch/Reserve con antibiograma disponible', 'Reevaluación terapéutica', 'Revisión', true, null,
   'Tratamiento Watch o Reserve activo con sensibilidad microbiologica disponible en el caso. Requiere reevaluacion profesional.'),
  ('DES-03', 'Terapia combinada con microbiologia disponible', 'Reevaluación terapéutica', 'Revisión', true, null,
   'Dos o mas tratamientos antimicrobianos activos con microbiologia disponible en el caso. Requiere reevaluacion profesional.'),
  ('DES-04', 'Watch/Reserve con mejoria y duracion superior al umbral', 'Reevaluación terapéutica', 'Revisión', true,
   'umbral_reevaluacion_favorable_dias',
   'Tratamiento Watch o Reserve activo, evolucion en mejoria y duracion superior al umbral institucional. La regla no genera hallazgos mientras el umbral sea nulo.')
on conflict (codigo_regla) do update set
  tipo_hallazgo = excluded.tipo_hallazgo,
  categoria = excluded.categoria,
  severidad = excluded.severidad,
  activa = excluded.activa,
  parametro_umbral = excluded.parametro_umbral,
  descripcion = excluded.descripcion,
  fecha_actualizacion = now();

alter table public.hallazgos_auditoria
  add column if not exists contexto_hash text,
  add column if not exists fecha_ultima_deteccion timestamptz;

update public.hallazgos_auditoria
set fecha_ultima_deteccion = coalesce(fecha_ultima_deteccion, fecha_deteccion)
where fecha_ultima_deteccion is null;

alter table public.hallazgos_auditoria
  alter column fecha_ultima_deteccion set default now(),
  alter column fecha_ultima_deteccion set not null;

create unique index if not exists hallazgos_auditoria_contexto_unico
on public.hallazgos_auditoria (
  ips_id,
  caso_id,
  coalesce(tratamiento_id, '00000000-0000-0000-0000-000000000000'::uuid),
  codigo_regla,
  contexto_hash
)
where contexto_hash is not null;

create table if not exists public.hallazgo_tratamiento (
  hallazgo_id uuid not null references public.hallazgos_auditoria(id) on delete cascade,
  tratamiento_id uuid not null references public.tratamientos_antimicrobianos(id) on delete restrict,
  fecha_creacion timestamptz not null default now(),
  primary key (hallazgo_id, tratamiento_id)
);

create index if not exists hallazgo_tratamiento_tratamiento_idx
on public.hallazgo_tratamiento (tratamiento_id);

create table if not exists public.decisiones_reevaluacion (
  id uuid primary key default gen_random_uuid(),
  ips_id uuid not null references public.ips(id) on delete restrict,
  hallazgo_id uuid not null unique references public.hallazgos_auditoria(id) on delete restrict,
  decision text not null check (decision in (
    'Desescalamiento realizado',
    'Optimización diferente',
    'Mantener tratamiento',
    'No aplica'
  )),
  justificacion text not null check (length(btrim(justificacion)) > 0),
  profesional_id uuid not null references public.perfiles_usuario(usuario_id) on delete restrict,
  fecha_decision timestamptz not null default now(),
  intervencion_id uuid references public.intervenciones_proa(id) on delete restrict,
  fecha_creacion timestamptz not null default now()
);

create index if not exists decisiones_reevaluacion_ips_fecha_idx
on public.decisiones_reevaluacion (ips_id, fecha_decision desc);

alter table public.hallazgo_tratamiento enable row level security;
alter table public.decisiones_reevaluacion enable row level security;

create or replace function public.validar_hallazgo_tratamiento()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_hallazgo_caso_id uuid;
  v_hallazgo_ips_id uuid;
  v_tratamiento_caso_id uuid;
  v_tratamiento_ips_id uuid;
begin
  select h.caso_id, h.ips_id, t.caso_id, t.ips_id
  into v_hallazgo_caso_id, v_hallazgo_ips_id, v_tratamiento_caso_id, v_tratamiento_ips_id
  from public.hallazgos_auditoria h
  join public.tratamientos_antimicrobianos t on t.id = new.tratamiento_id
  where h.id = new.hallazgo_id
  for key share of h, t;

  if not found then
    raise exception 'Hallazgo o tratamiento no disponible';
  end if;

  if v_tratamiento_caso_id is distinct from v_hallazgo_caso_id
    or v_tratamiento_ips_id is distinct from v_hallazgo_ips_id
  then
    raise exception 'El tratamiento no pertenece al mismo caso e IPS del hallazgo';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_hallazgo_tratamiento on public.hallazgo_tratamiento;
create trigger trg_validar_hallazgo_tratamiento
before insert or update on public.hallazgo_tratamiento
for each row execute function public.validar_hallazgo_tratamiento();

drop policy if exists hallazgo_tratamiento_select on public.hallazgo_tratamiento;
drop policy if exists hallazgo_tratamiento_insert on public.hallazgo_tratamiento;
drop policy if exists hallazgo_tratamiento_delete on public.hallazgo_tratamiento;
create policy hallazgo_tratamiento_select on public.hallazgo_tratamiento
for select to authenticated using (
  exists (
    select 1 from public.hallazgos_auditoria h
    where h.id = hallazgo_tratamiento.hallazgo_id
      and public.puede_leer_ips(h.ips_id)
  )
);
create policy hallazgo_tratamiento_insert on public.hallazgo_tratamiento
for insert to authenticated with check (
  exists (
    select 1
    from public.hallazgos_auditoria h
    join public.tratamientos_antimicrobianos t on t.id = hallazgo_tratamiento.tratamiento_id
    where h.id = hallazgo_tratamiento.hallazgo_id
      and t.caso_id = h.caso_id
      and t.ips_id = h.ips_id
      and public.puede_escribir_operacion_ips(h.ips_id)
  )
);
drop policy if exists decisiones_reevaluacion_select on public.decisiones_reevaluacion;
drop policy if exists decisiones_reevaluacion_insert on public.decisiones_reevaluacion;
create policy decisiones_reevaluacion_select on public.decisiones_reevaluacion
for select to authenticated using (public.puede_leer_ips(ips_id));
create policy decisiones_reevaluacion_insert on public.decisiones_reevaluacion
for insert to authenticated with check (
  public.puede_escribir_operacion_ips(ips_id)
  and profesional_id = auth.uid()
  and exists (
    select 1
    from public.hallazgos_auditoria h
    where h.id = decisiones_reevaluacion.hallazgo_id
      and h.ips_id = decisiones_reevaluacion.ips_id
      and h.codigo_regla in ('AUD-05', 'DES-02', 'DES-03', 'DES-04')
      and h.estado in ('Abierto', 'En seguimiento')
  )
  and (
    intervencion_id is null
    or exists (
      select 1
      from public.intervenciones_proa iv
      join public.rondas_proa r on r.id = iv.ronda_id
      join public.hallazgos_auditoria h on h.id = decisiones_reevaluacion.hallazgo_id
      where iv.id = decisiones_reevaluacion.intervencion_id
        and iv.ips_id = decisiones_reevaluacion.ips_id
        and r.caso_id = h.caso_id
    )
  )
);

create or replace function public.validar_decision_reevaluacion()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_hallazgo public.hallazgos_auditoria%rowtype;
begin
  select * into v_hallazgo
  from public.hallazgos_auditoria
  where id = new.hallazgo_id
  for update;

  if not found
    or v_hallazgo.codigo_regla not in ('AUD-05', 'DES-02', 'DES-03', 'DES-04')
    or v_hallazgo.estado not in ('Abierto', 'En seguimiento')
    or not public.puede_escribir_operacion_ips(v_hallazgo.ips_id)
  then
    raise exception 'Hallazgo no disponible para decision de reevaluacion';
  end if;

  if new.intervencion_id is not null and not exists (
    select 1
    from public.intervenciones_proa i
    join public.rondas_proa r on r.id = i.ronda_id
    where i.id = new.intervencion_id
      and i.ips_id = v_hallazgo.ips_id
      and r.caso_id = v_hallazgo.caso_id
  ) then
    raise exception 'La intervencion no pertenece al mismo caso e IPS';
  end if;

  new.ips_id := v_hallazgo.ips_id;
  new.profesional_id := auth.uid();
  new.fecha_decision := now();
  new.fecha_creacion := now();
  new.justificacion := btrim(new.justificacion);
  return new;
end;
$$;

drop trigger if exists trg_validar_decision_reevaluacion on public.decisiones_reevaluacion;
create trigger trg_validar_decision_reevaluacion
before insert on public.decisiones_reevaluacion
for each row execute function public.validar_decision_reevaluacion();

create or replace function public.cerrar_hallazgo_por_decision_reevaluacion()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.hallazgos_auditoria
  set estado = 'Resuelto',
      intervencion_id = coalesce(new.intervencion_id, intervencion_id),
      fecha_resolucion = new.fecha_decision,
      usuario_actualizacion = new.profesional_id,
      fecha_actualizacion = now()
  where id = new.hallazgo_id
    and ips_id = new.ips_id;

  if not found then
    raise exception 'No fue posible cerrar el hallazgo de reevaluacion';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cerrar_hallazgo_decision_reevaluacion on public.decisiones_reevaluacion;
create trigger trg_cerrar_hallazgo_decision_reevaluacion
after insert on public.decisiones_reevaluacion
for each row execute function public.cerrar_hallazgo_por_decision_reevaluacion();

create or replace function public.registrar_decision_reevaluacion(
  p_hallazgo_id uuid,
  p_decision text,
  p_justificacion text,
  p_intervencion_id uuid default null
)
returns public.decisiones_reevaluacion
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_hallazgo public.hallazgos_auditoria%rowtype;
  v_decision public.decisiones_reevaluacion%rowtype;
begin
  if p_decision not in (
    'Desescalamiento realizado',
    'Optimización diferente',
    'Mantener tratamiento',
    'No aplica'
  ) then
    raise exception 'Decision de reevaluacion no valida';
  end if;

  if nullif(btrim(p_justificacion), '') is null then
    raise exception 'La justificacion es obligatoria';
  end if;

  select * into v_hallazgo
  from public.hallazgos_auditoria
  where id = p_hallazgo_id
  for update;

  if not found or not public.puede_escribir_operacion_ips(v_hallazgo.ips_id) then
    raise exception 'Hallazgo no disponible para gestion';
  end if;

  if v_hallazgo.codigo_regla not in ('AUD-05', 'DES-02', 'DES-03', 'DES-04') then
    raise exception 'El hallazgo no corresponde a reevaluacion terapeutica';
  end if;

  if v_hallazgo.estado not in ('Abierto', 'En seguimiento') then
    raise exception 'Solo se pueden registrar decisiones sobre hallazgos abiertos o en seguimiento';
  end if;

  if exists (
    select 1 from public.decisiones_reevaluacion d
    where d.hallazgo_id = p_hallazgo_id
  ) then
    raise exception 'La oportunidad ya tiene una decision registrada';
  end if;

  if p_intervencion_id is not null and not exists (
    select 1
    from public.intervenciones_proa i
    join public.rondas_proa r on r.id = i.ronda_id
    where i.id = p_intervencion_id
      and i.ips_id = v_hallazgo.ips_id
      and r.caso_id = v_hallazgo.caso_id
  ) then
    raise exception 'La intervencion no pertenece al mismo caso e IPS';
  end if;

  insert into public.decisiones_reevaluacion (
    ips_id,
    hallazgo_id,
    decision,
    justificacion,
    profesional_id,
    intervencion_id
  ) values (
    v_hallazgo.ips_id,
    p_hallazgo_id,
    p_decision,
    btrim(p_justificacion),
    auth.uid(),
    p_intervencion_id
  )
  returning * into v_decision;

  return v_decision;
end;
$$;

create or replace view public.mart_reevaluacion_terapeutica
with (security_invoker = true) as
select
  h.id as oportunidad_id,
  h.ips_id,
  i.nombre as ips,
  h.caso_id,
  c.paciente_id,
  h.tratamiento_id,
  h.ronda_detectada_id,
  r.fecha_hora_ronda,
  r.servicio_id,
  s.nombre as servicio,
  h.codigo_regla,
  h.tipo_hallazgo,
  h.severidad,
  h.estado,
  h.contexto_hash,
  h.fecha_deteccion,
  h.fecha_ultima_deteccion,
  coalesce(rel.tratamiento_ids, array[]::uuid[]) as tratamiento_ids,
  coalesce(rel.antimicrobianos, array[]::text[]) as antimicrobianos,
  coalesce(rel.aware_categorias, array[]::text[]) as aware_categorias,
  d.id as decision_id,
  d.decision,
  d.justificacion,
  d.profesional_id,
  p.nombre as profesional,
  d.fecha_decision,
  d.intervencion_id,
  iv.aceptacion,
  case
    when d.fecha_decision is not null
      then extract(epoch from (d.fecha_decision - h.fecha_deteccion)) / 86400.0
    else null
  end as dias_hasta_decision
from public.hallazgos_auditoria h
join public.ips i on i.id = h.ips_id
join public.casos_proa c on c.id = h.caso_id
left join public.rondas_proa r on r.id = h.ronda_detectada_id
left join public.servicios_ips s on s.id = r.servicio_id
left join public.decisiones_reevaluacion d on d.hallazgo_id = h.id
left join public.perfiles_usuario p on p.usuario_id = d.profesional_id
left join public.intervenciones_proa iv on iv.id = d.intervencion_id
left join lateral (
  select
    array_agg(t.id order by t.id) as tratamiento_ids,
    array_agg(coalesce(t.antimicrobiano, 'Sin antimicrobiano') order by t.id) as antimicrobianos,
    array_agg(coalesce(a.aware_categoria, 'Sin clasificar') order by t.id) as aware_categorias
  from public.hallazgo_tratamiento ht
  join public.tratamientos_antimicrobianos t on t.id = ht.tratamiento_id
  left join public.catalogo_antimicrobianos a on a.id = t.antimicrobiano_id
  where ht.hallazgo_id = h.id
) rel on true
where h.codigo_regla in ('AUD-05', 'DES-02', 'DES-03', 'DES-04');

grant select, insert on public.hallazgo_tratamiento to authenticated;
grant select, insert on public.decisiones_reevaluacion to authenticated;
revoke all on function public.validar_hallazgo_tratamiento() from public, anon;
revoke all on function public.validar_decision_reevaluacion() from public, anon;
revoke all on function public.cerrar_hallazgo_por_decision_reevaluacion() from public, anon;
revoke all on function public.registrar_decision_reevaluacion(uuid, text, text, uuid) from public, anon;
grant execute on function public.registrar_decision_reevaluacion(uuid, text, text, uuid) to authenticated;
grant select on public.mart_reevaluacion_terapeutica to authenticated;

commit;

-- Auditoria posterior sugerida; no forma parte de la aplicacion automatica:
-- select column_name, data_type from information_schema.columns
-- where table_schema = 'public' and table_name in ('hallazgo_tratamiento', 'decisiones_reevaluacion');
-- select codigo_regla, activa, parametro_umbral from public.reglas_auditoria_proa where codigo_regla like 'DES-%';
-- select reloptions from pg_class where oid = 'public.mart_reevaluacion_terapeutica'::regclass;
-- select policyname, cmd, qual, with_check from pg_policies
-- where schemaname = 'public' and tablename in ('hallazgo_tratamiento', 'decisiones_reevaluacion');
