-- PROA V2 Milestone 5 - proposed pilot analytical views
-- Pending application in Supabase SQL editor or a versioned migration.
-- Views use security_invoker to preserve RLS behavior for authenticated users.

create or replace view public.mart_ddd
with (security_invoker = true) as
select
  r.id as registro_ddd_id,
  c.id as consumo_id,
  r.ips_id,
  i.nombre as ips,
  r.periodo,
  r.servicio_id,
  s.nombre as servicio,
  r.camas_disponibles,
  r.camas_dia_ocupadas,
  r.porcentaje_ocupacion,
  c.antimicrobiano_id,
  a.nombre as antimicrobiano,
  a.codigo_atc,
  c.via,
  c.gramos_consumidos,
  c.ddd_oms,
  c.ddd_calculadas,
  c.ddd_100_camas_dia,
  r.estado as estado_registro
from public.ddd_registros r
join public.ddd_consumos c on c.registro_id = r.id
join public.ips i on i.id = r.ips_id
left join public.servicios_ips s on s.id = r.servicio_id
left join public.catalogo_antimicrobianos a on a.id = c.antimicrobiano_id;

create or replace view public.mart_rondas_proa
with (security_invoker = true) as
select
  r.id as ronda_id,
  r.caso_id,
  r.paciente_id,
  r.ips_id,
  i.nombre as ips,
  r.fecha_hora_ronda,
  date_trunc('month', r.fecha_hora_ronda)::date as periodo,
  r.servicio_id,
  s.nombre as servicio,
  r.cama,
  r.profesional_id,
  p.nombre as profesional,
  r.tipo_valoracion,
  r.tipo_terapia,
  r.terapia_dirigida_por_microbiologia,
  r.tipo_profilaxis,
  r.evolucion_clinica,
  r.estado as estado_ronda,
  dx_principal.codigo_cie10 as diagnostico_principal_cie10,
  dx_principal.descripcion_cie10 as diagnostico_principal,
  dx_infeccioso.codigo_cie10 as diagnostico_infeccioso_cie10,
  dx_infeccioso.descripcion_cie10 as diagnostico_infeccioso,
  coalesce(dx_infeccioso.categoria_proa, dx_principal.categoria_proa) as categoria_proa,
  coalesce(t.numero_antimicrobianos_activos, 0) as numero_antimicrobianos_activos,
  coalesce(intervencion.hubo_intervencion, false) as hubo_intervencion,
  intervencion.cumplimiento_guia,
  intervencion.aceptacion,
  coalesce(intervencion.requiere_seguimiento, false) as requiere_seguimiento
from public.rondas_proa r
join public.ips i on i.id = r.ips_id
left join public.servicios_ips s on s.id = r.servicio_id
left join public.perfiles_usuario p on p.usuario_id = r.profesional_id
left join lateral (
  select d.*
  from public.diagnosticos_ronda d
  where d.ronda_id = r.id and d.tipo_diagnostico = 'Principal'
  order by d.fecha_creacion nulls last
  limit 1
) dx_principal on true
left join lateral (
  select d.*
  from public.diagnosticos_ronda d
  where d.ronda_id = r.id and d.tipo_diagnostico = 'Infeccioso'
  order by d.fecha_creacion nulls last
  limit 1
) dx_infeccioso on true
left join lateral (
  select count(*) as numero_antimicrobianos_activos
  from public.tratamientos_antimicrobianos ta
  where ta.caso_id = r.caso_id and ta.estado = 'Activo'
) t on true
left join lateral (
  select
    bool_or(coalesce(ip.hubo_intervencion, false)) as hubo_intervencion,
    string_agg(distinct ip.cumplimiento_guia, ', ') filter (where ip.cumplimiento_guia is not null) as cumplimiento_guia,
    string_agg(distinct ip.aceptacion, ', ') filter (where ip.aceptacion is not null) as aceptacion,
    bool_or(coalesce(ip.requiere_seguimiento, false)) as requiere_seguimiento
  from public.intervenciones_proa ip
  where ip.ronda_id = r.id
) intervencion on true;

create or replace view public.mart_intervenciones_proa
with (security_invoker = true) as
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
  ip.aceptacion,
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
  select string_agg(distinct ta.antimicrobiano, ', ' order by ta.antimicrobiano) as antimicrobianos_relacionados
  from public.intervencion_tratamiento it
  join public.tratamientos_antimicrobianos ta on ta.id = it.tratamiento_id
  where it.intervencion_id = ip.id
) rel on true;

create or replace view public.mart_microbiologia
with (security_invoker = true) as
select
  m.id as muestra_id,
  m.ronda_id,
  m.caso_id,
  m.ips_id,
  i.nombre as ips,
  m.fecha_toma,
  m.fecha_resultado,
  date_trunc('month', coalesce(m.fecha_resultado, m.fecha_toma))::date as periodo,
  r.servicio_id,
  s.nombre as servicio,
  m.tipo_muestra,
  m.resultado_general,
  m.microorganismo,
  m.tipo_germen,
  res.mecanismos_resistencia,
  coalesce(res.numero_mecanismos, 0) as numero_mecanismos,
  sens.sensibilidad_relevante,
  m.es_muestra_control,
  m.muestra_previa_id,
  m.impacto_conducta,
  r.tipo_terapia
from public.microbiologia m
join public.ips i on i.id = m.ips_id
left join public.rondas_proa r on r.id = m.ronda_id
left join public.servicios_ips s on s.id = r.servicio_id
left join lateral (
  select
    string_agg(distinct rm.mecanismo, ', ' order by rm.mecanismo) as mecanismos_resistencia,
    count(*) as numero_mecanismos
  from public.resistencia_microbiologica rm
  where rm.muestra_id = m.id
) res on true
left join lateral (
  select string_agg(distinct concat(sm.antimicrobiano, ': ', sm.resultado), '; ' order by concat(sm.antimicrobiano, ': ', sm.resultado)) as sensibilidad_relevante
  from public.sensibilidad_microbiologica sm
  where sm.muestra_id = m.id
) sens on true;

create or replace view public.mart_resistencia_microbiologica
with (security_invoker = true) as
select
  rm.id as resistencia_id,
  rm.muestra_id,
  m.ronda_id,
  m.caso_id,
  m.ips_id,
  i.nombre as ips,
  m.fecha_toma,
  rm.mecanismo
from public.resistencia_microbiologica rm
join public.microbiologia m on m.id = rm.muestra_id
join public.ips i on i.id = m.ips_id;

create or replace view public.mart_sensibilidad_microbiologica
with (security_invoker = true) as
select
  sm.id as sensibilidad_id,
  sm.muestra_id,
  m.ronda_id,
  m.caso_id,
  m.ips_id,
  i.nombre as ips,
  m.fecha_toma,
  sm.antimicrobiano_id,
  sm.antimicrobiano,
  sm.resultado
from public.sensibilidad_microbiologica sm
join public.microbiologia m on m.id = sm.muestra_id
join public.ips i on i.id = m.ips_id;

create or replace view public.mart_casos_proa
with (security_invoker = true) as
select
  c.id as caso_id,
  c.paciente_id,
  c.ips_id,
  i.nombre as ips,
  c.fecha_apertura,
  c.fecha_cierre,
  c.estado,
  c.motivo_cierre,
  c.ubicacion_actual as servicio_actual,
  c.cama_actual,
  coalesce(r.numero_rondas, 0) as numero_rondas,
  coalesce(t.numero_tratamientos, 0) as numero_tratamientos,
  coalesce(ip.numero_intervenciones, 0) as numero_intervenciones,
  r.ultima_ronda,
  r.ultima_evolucion,
  coalesce(ip.requiere_seguimiento_actual, false) as requiere_seguimiento_actual
from public.casos_proa c
join public.ips i on i.id = c.ips_id
left join lateral (
  select
    count(*) as numero_rondas,
    max(rp.fecha_hora_ronda) as ultima_ronda,
    (array_agg(rp.evolucion_clinica order by rp.fecha_hora_ronda desc))[1] as ultima_evolucion
  from public.rondas_proa rp
  where rp.caso_id = c.id
) r on true
left join lateral (
  select count(*) as numero_tratamientos
  from public.tratamientos_antimicrobianos ta
  where ta.caso_id = c.id
) t on true
left join lateral (
  select count(*) as numero_intervenciones, bool_or(coalesce(ip.requiere_seguimiento, false)) as requiere_seguimiento_actual
  from public.intervenciones_proa ip
  join public.rondas_proa rp on rp.id = ip.ronda_id
  where rp.caso_id = c.id
) ip on true;
