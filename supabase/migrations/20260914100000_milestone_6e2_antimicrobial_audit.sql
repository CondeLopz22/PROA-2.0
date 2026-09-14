-- Milestone 6E.2 - Auditoria antimicrobiana PROA.
-- PENDIENTE DE APLICAR tras revision. No modifica datos clinicos historicos.
-- Crea configuracion, reglas, hallazgos trazables y MART analitico.

begin;

create table if not exists public.configuracion_auditoria_proa (
  ips_id uuid primary key references public.ips(id),
  umbral_tratamiento_prolongado_dias integer not null default 5 check (umbral_tratamiento_prolongado_dias > 0),
  umbral_profilaxis_prolongada_dias integer check (umbral_profilaxis_prolongada_dias is null or umbral_profilaxis_prolongada_dias > 0),
  umbral_seguimiento_vencido_dias integer check (umbral_seguimiento_vencido_dias is null or umbral_seguimiento_vencido_dias > 0),
  umbral_microbiologia_pendiente_dias integer check (umbral_microbiologia_pendiente_dias is null or umbral_microbiologia_pendiente_dias > 0),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now()
);

create table if not exists public.reglas_auditoria_proa (
  codigo_regla text primary key,
  tipo_hallazgo text not null,
  categoria text not null,
  severidad text not null check (severidad in ('Informativo', 'Revisión', 'Prioritario')),
  activa boolean not null default true,
  parametro_umbral text,
  descripcion text not null,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now()
);

insert into public.reglas_auditoria_proa
  (codigo_regla, tipo_hallazgo, categoria, severidad, activa, parametro_umbral, descripcion)
values
  ('AUD-01', 'Tratamiento sin indicación infecciosa', 'Documentación', 'Revisión', true, null, 'Tratamiento activo sin diagnóstico/indicación infecciosa documentada en el caso.'),
  ('AUD-02', 'Tratamiento sin fecha de inicio', 'Tratamiento', 'Revisión', true, null, 'Tratamiento activo sin fecha de inicio registrada.'),
  ('AUD-03', 'Tratamiento prolongado', 'Duración', 'Revisión', true, 'umbral_tratamiento_prolongado_dias', 'Tratamiento activo que alcanza o supera el umbral configurable de duración.'),
  ('AUD-04', 'Profilaxis prolongada', 'Duración', 'Revisión', false, 'umbral_profilaxis_prolongada_dias', 'Regla preparada; solo genera hallazgos cuando exista umbral configurado y la regla se active.'),
  ('AUD-05', 'Terapia empírica con microbiología disponible', 'Microbiología', 'Revisión', true, null, 'Microbiología con resultado disponible mientras la terapia continúa registrada como empírica. Requiere revisión.'),
  ('AUD-06', 'Microbiología pendiente en seguimiento', 'Microbiología', 'Informativo', false, 'umbral_microbiologia_pendiente_dias', 'Regla preparada; requiere umbral configurable.'),
  ('AUD-07', 'Antimicrobiano Reserve activo', 'AWaRe', 'Prioritario', true, null, 'Tratamiento activo con antimicrobiano clasificado como Reserve. Requiere revisión PROA.'),
  ('AUD-08', 'Reserve sin intervención asociada', 'AWaRe', 'Prioritario', true, null, 'Antimicrobiano Reserve activo sin intervención PROA vinculada al tratamiento.'),
  ('AUD-09', 'Duplicidad activa evidente', 'Tratamiento', 'Revisión', true, null, 'Posible duplicidad de antimicrobianos activos idénticos en el mismo caso.'),
  ('AUD-10', 'Tratamiento sin seguimiento reciente', 'Seguimiento', 'Revisión', false, 'umbral_seguimiento_vencido_dias', 'Regla preparada; requiere umbral configurable.'),
  ('AUD-11', 'Intervención pendiente de aceptación', 'Intervención', 'Revisión', true, null, 'Intervención PROA con aceptación o respuesta pendiente.'),
  ('AUD-12', 'Intervención no aceptada con seguimiento', 'Intervención', 'Revisión', true, null, 'Intervención no aceptada o parcialmente aceptada que continúa requiriendo seguimiento.')
on conflict (codigo_regla) do update set
  tipo_hallazgo = excluded.tipo_hallazgo,
  categoria = excluded.categoria,
  severidad = excluded.severidad,
  activa = excluded.activa,
  parametro_umbral = excluded.parametro_umbral,
  descripcion = excluded.descripcion,
  fecha_actualizacion = now();

insert into public.configuracion_auditoria_proa (ips_id)
select id from public.ips
on conflict (ips_id) do nothing;

create table if not exists public.hallazgos_auditoria (
  id uuid primary key default gen_random_uuid(),
  ips_id uuid not null references public.ips(id),
  caso_id uuid not null references public.casos_proa(id),
  tratamiento_id uuid references public.tratamientos_antimicrobianos(id),
  ronda_detectada_id uuid references public.rondas_proa(id),
  codigo_regla text not null references public.reglas_auditoria_proa(codigo_regla),
  tipo_hallazgo text not null,
  categoria text not null,
  severidad text not null check (severidad in ('Informativo', 'Revisión', 'Prioritario')),
  fecha_deteccion timestamptz not null default now(),
  estado text not null default 'Abierto' check (estado in ('Abierto', 'En seguimiento', 'Resuelto', 'Descartado')),
  descripcion text not null,
  origen text not null default 'Automático' check (origen in ('Automático', 'Profesional PROA')),
  intervencion_id uuid references public.intervenciones_proa(id),
  fecha_resolucion timestamptz,
  motivo_descarte text,
  usuario_actualizacion uuid,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now()
);

create unique index if not exists hallazgos_auditoria_abierto_unico
on public.hallazgos_auditoria (
  ips_id,
  caso_id,
  coalesce(tratamiento_id, '00000000-0000-0000-0000-000000000000'::uuid),
  codigo_regla
)
where estado in ('Abierto', 'En seguimiento');

create index if not exists hallazgos_auditoria_ips_estado_idx on public.hallazgos_auditoria (ips_id, estado);
create index if not exists hallazgos_auditoria_caso_idx on public.hallazgos_auditoria (caso_id);
create index if not exists hallazgos_auditoria_tratamiento_idx on public.hallazgos_auditoria (tratamiento_id);

alter table public.configuracion_auditoria_proa enable row level security;
alter table public.reglas_auditoria_proa enable row level security;
alter table public.hallazgos_auditoria enable row level security;

drop policy if exists configuracion_auditoria_select on public.configuracion_auditoria_proa;
drop policy if exists configuracion_auditoria_insert_admin on public.configuracion_auditoria_proa;
drop policy if exists configuracion_auditoria_update_admin on public.configuracion_auditoria_proa;
create policy configuracion_auditoria_select on public.configuracion_auditoria_proa
for select to authenticated using (public.puede_leer_ips(ips_id));
create policy configuracion_auditoria_insert_admin on public.configuracion_auditoria_proa
for insert to authenticated with check (public.puede_administrar_proa());
create policy configuracion_auditoria_update_admin on public.configuracion_auditoria_proa
for update to authenticated using (public.puede_administrar_proa()) with check (public.puede_administrar_proa());

drop policy if exists reglas_auditoria_select on public.reglas_auditoria_proa;
drop policy if exists reglas_auditoria_insert_admin on public.reglas_auditoria_proa;
drop policy if exists reglas_auditoria_update_admin on public.reglas_auditoria_proa;
create policy reglas_auditoria_select on public.reglas_auditoria_proa
for select to authenticated using (true);
create policy reglas_auditoria_insert_admin on public.reglas_auditoria_proa
for insert to authenticated with check (public.puede_administrar_proa());
create policy reglas_auditoria_update_admin on public.reglas_auditoria_proa
for update to authenticated using (public.puede_administrar_proa()) with check (public.puede_administrar_proa());

drop policy if exists hallazgos_auditoria_select on public.hallazgos_auditoria;
drop policy if exists hallazgos_auditoria_insert on public.hallazgos_auditoria;
drop policy if exists hallazgos_auditoria_update on public.hallazgos_auditoria;
create policy hallazgos_auditoria_select on public.hallazgos_auditoria
for select to authenticated using (public.puede_leer_ips(ips_id));
create policy hallazgos_auditoria_insert on public.hallazgos_auditoria
for insert to authenticated with check (public.puede_escribir_operacion_ips(ips_id));
create policy hallazgos_auditoria_update on public.hallazgos_auditoria
for update to authenticated using (public.puede_escribir_operacion_ips(ips_id)) with check (public.puede_escribir_operacion_ips(ips_id));

create or replace view public.mart_auditoria_proa
with (security_invoker = true) as
select
  h.id as hallazgo_id,
  h.ips_id,
  i.nombre as ips,
  h.caso_id,
  c.paciente_id,
  h.tratamiento_id,
  h.ronda_detectada_id,
  r.fecha_hora_ronda,
  date_trunc('month', coalesce(h.fecha_deteccion, r.fecha_hora_ronda))::date as periodo,
  r.servicio_id,
  s.nombre as servicio,
  t.antimicrobiano_id,
  t.antimicrobiano,
  a.aware_categoria,
  h.codigo_regla,
  h.tipo_hallazgo,
  h.categoria,
  h.severidad,
  h.estado,
  h.origen,
  h.fecha_deteccion,
  h.intervencion_id,
  iv.aceptacion,
  iv.fecha_creacion as fecha_intervencion,
  h.fecha_resolucion,
  case
    when h.intervencion_id is not null then extract(epoch from (iv.fecha_creacion - h.fecha_deteccion)) / 86400.0
    else null
  end as dias_hasta_intervencion,
  case
    when h.fecha_resolucion is not null then extract(epoch from (h.fecha_resolucion - h.fecha_deteccion)) / 86400.0
    else null
  end as dias_hasta_resolucion
from public.hallazgos_auditoria h
join public.ips i on i.id = h.ips_id
join public.casos_proa c on c.id = h.caso_id
left join public.rondas_proa r on r.id = h.ronda_detectada_id
left join public.servicios_ips s on s.id = r.servicio_id
left join public.tratamientos_antimicrobianos t on t.id = h.tratamiento_id
left join public.catalogo_antimicrobianos a on a.id = t.antimicrobiano_id
left join public.intervenciones_proa iv on iv.id = h.intervencion_id;

commit;

-- Auditoria posterior sugerida:
--
-- select codigo_regla, activa, severidad from public.reglas_auditoria_proa order by codigo_regla;
-- select ips_id, umbral_tratamiento_prolongado_dias from public.configuracion_auditoria_proa;
-- select reloptions from pg_class where oid = 'public.mart_auditoria_proa'::regclass;
-- select count(*) from public.hallazgos_auditoria;
