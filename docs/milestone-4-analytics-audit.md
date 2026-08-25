# Milestone 4 - Analytics Audit

## Nota de inspección

En esta sesión no hay variables de conexión Supabase disponibles, por lo que no se pudo consultar la definición actual de las vistas. Este documento deja el contrato analítico esperado y el SQL propuesto para revisar contra Supabase real antes de ejecutar cambios.

## mart_rondas_proa

Columnas requeridas:

- `ronda_id`, `caso_id`, `paciente_id`, `ips_id`, `ips`
- `fecha_hora_ronda`, `periodo`, `servicio_id`, `servicio`, `cama`
- `profesional_id`, `profesional`
- `tipo_valoracion`, `tipo_terapia`, `terapia_dirigida_por_microbiologia`, `tipo_profilaxis`
- `evolucion_clinica`, `estado_ronda`
- `diagnostico_principal_cie10`, `diagnostico_principal_descripcion`
- `diagnostico_infeccioso_cie10`, `diagnostico_infeccioso_descripcion`, `categoria_proa`
- `antimicrobianos_activos`
- `hubo_intervencion`, `cumplimiento_guia`, `aceptacion`, `requiere_seguimiento`

Estrategia:

- Una fila por ronda.
- Diagnóstico principal e infeccioso se resuelven con joins filtrados por `tipo_diagnostico`.
- Intervención se agrega por ronda para evitar multiplicación de filas.
- Diagnósticos relacionados quedan fuera o en vista secundaria.

SQL propuesto:

```sql
create or replace view public.mart_rondas_proa
with (security_invoker = true)
as
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
  dxp.codigo_cie10 as diagnostico_principal_cie10,
  dxp.descripcion_cie10 as diagnostico_principal_descripcion,
  dxi.codigo_cie10 as diagnostico_infeccioso_cie10,
  dxi.descripcion_cie10 as diagnostico_infeccioso_descripcion,
  dxi.categoria_proa,
  coalesce(tx.antimicrobianos_activos, 0) as antimicrobianos_activos,
  coalesce(iv.hubo_intervencion, false) as hubo_intervencion,
  iv.cumplimiento_guia,
  iv.aceptacion,
  iv.requiere_seguimiento
from public.rondas_proa r
join public.ips i on i.id = r.ips_id
left join public.servicios_ips s on s.id = r.servicio_id
left join public.perfiles_usuario p on p.usuario_id = r.profesional_id
left join public.diagnosticos_ronda dxp on dxp.ronda_id = r.id and dxp.tipo_diagnostico = 'Principal'
left join public.diagnosticos_ronda dxi on dxi.ronda_id = r.id and dxi.tipo_diagnostico = 'Infeccioso'
left join lateral (
  select count(*) as antimicrobianos_activos
  from public.tratamientos_antimicrobianos t
  where t.caso_id = r.caso_id and t.estado = 'Activo'
) tx on true
left join lateral (
  select
    bool_or(coalesce(ip.hubo_intervencion, false)) as hubo_intervencion,
    max(ip.cumplimiento_guia) as cumplimiento_guia,
    max(ip.aceptacion) as aceptacion,
    bool_or(coalesce(ip.requiere_seguimiento, false)) as requiere_seguimiento
  from public.intervenciones_proa ip
  where ip.ronda_id = r.id
) iv on true;
```

## mart_intervenciones_proa

Estrategia:

- Una fila por intervención.
- Tratamientos relacionados se agregan con `string_agg` para no multiplicar indicadores.
- Si se requiere detalle, crear `mart_intervencion_tratamiento`.

SQL propuesto:

```sql
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
  s.nombre as servicio,
  ip.tipo_intervencion,
  ip.origen_intervencion,
  ip.recomendacion,
  ip.descripcion_recomendacion,
  ip.hubo_intervencion,
  ip.motivo_no_intervencion,
  ip.aceptacion,
  ip.motivo_no_aceptacion,
  ip.cumplimiento_guia,
  ip.motivo_no_cumplimiento,
  ip.dias_ahorrados,
  ip.requiere_seguimiento,
  ip.fecha_seguimiento,
  ip.motivo_seguimiento,
  string_agg(distinct t.antimicrobiano, ', ') as antimicrobianos_relacionados
from public.intervenciones_proa ip
left join public.rondas_proa r on r.id = ip.ronda_id
left join public.ips i on i.id = ip.ips_id
left join public.servicios_ips s on s.id = r.servicio_id
left join public.intervencion_tratamiento it on it.intervencion_id = ip.id
left join public.tratamientos_antimicrobianos t on t.id = it.tratamiento_id
group by ip.id, r.id, i.nombre, s.nombre;
```

## mart_microbiologia

Estrategia:

- Una fila por muestra.
- Resistencias y sensibilidades se agregan para conteo de muestras.
- Vistas secundarias pueden exponer detalle por resistencia/sensibilidad.

SQL propuesto:

```sql
create or replace view public.mart_microbiologia
with (security_invoker = true)
as
select
  m.id as muestra_id,
  m.ronda_id,
  m.caso_id,
  m.ips_id,
  i.nombre as ips,
  m.fecha_toma,
  m.fecha_resultado,
  date_trunc('month', m.fecha_toma)::date as periodo,
  s.nombre as servicio,
  m.tipo_muestra,
  m.resultado_general,
  m.microorganismo,
  m.tipo_germen,
  string_agg(distinct rm.mecanismo, ', ') as mecanismos_resistencia,
  count(distinct rm.id) as numero_mecanismos,
  string_agg(distinct sm.antimicrobiano || ': ' || sm.resultado, '; ') as sensibilidad_relevante,
  m.es_muestra_control,
  m.muestra_previa_id,
  m.impacto_conducta,
  r.tipo_terapia
from public.microbiologia m
left join public.rondas_proa r on r.id = m.ronda_id
left join public.ips i on i.id = m.ips_id
left join public.servicios_ips s on s.id = r.servicio_id
left join public.resistencia_microbiologica rm on rm.muestra_id = m.id
left join public.sensibilidad_microbiologica sm on sm.muestra_id = m.id
group by m.id, r.id, i.nombre, s.nombre;
```

## mart_ddd

SQL propuesto:

```sql
create or replace view public.mart_ddd
with (security_invoker = true)
as
select
  r.id as registro_ddd_id,
  c.id as consumo_id,
  r.ips_id,
  i.nombre as ips,
  r.periodo,
  s.nombre as servicio,
  r.estado as estado_registro,
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
  c.ddd_100_camas_dia
from public.ddd_registros r
join public.ips i on i.id = r.ips_id
join public.servicios_ips s on s.id = r.servicio_id
left join public.ddd_consumos c on c.registro_id = r.id
left join public.catalogo_antimicrobianos a on a.id = c.antimicrobiano_id;
```

## mart_casos_proa

Vista recomendada para indicadores longitudinales por episodio. Aporta valor claro para piloto.

```sql
create or replace view public.mart_casos_proa
with (security_invoker = true)
as
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
  case when c.fecha_cierre is null then null else c.fecha_cierre::date - c.fecha_apertura::date end as duracion_caso_dias,
  count(distinct r.id) as numero_rondas,
  count(distinct ip.id) as numero_intervenciones,
  count(distinct t.id) as numero_tratamientos,
  (array_agg(r.evolucion_clinica order by r.fecha_hora_ronda desc))[1] as ultima_evolucion
from public.casos_proa c
join public.ips i on i.id = c.ips_id
left join public.rondas_proa r on r.caso_id = c.id
left join public.intervenciones_proa ip on ip.ronda_id = r.id
left join public.tratamientos_antimicrobianos t on t.caso_id = c.id
group by c.id, i.nombre;
```
