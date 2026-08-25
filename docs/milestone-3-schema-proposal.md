# PROA V2 - Milestone 3 Schema Notes

## Esquema real inspeccionado

Milestone 3 usa la arquitectura DDD existente en Supabase. No se crean tablas nuevas.

Tablas usadas:

- `public.oms_ddd`
- `public.catalogo_antimicrobianos`
- `public.ddd_registros`
- `public.ddd_consumos`
- `public.servicios_ips`

## Decisiones

- `ddd_registros` representa el periodo mensual por `ips_id + servicio_id + periodo`.
- `ddd_consumos` representa cada antimicrobiano/vía consumido dentro del registro.
- `oms_ddd` es el catálogo maestro de referencia y se resuelve por `antimicrobiano_id + via`.
- El frontend calcula gramos consumidos solo como ayuda de captura y guarda `gramos_consumidos`.
- Supabase, mediante `trg_calcular_ddd_consumo` y `trg_recalcular_ddd_ocupacion`, sigue siendo la fuente final para `ddd_oms`, `ddd_calculadas` y `ddd_100_camas_dia`.
- No se usa DELETE físico en Milestone 3 porque no existe política DELETE para DDD.
- La anulación se representa con `ddd_registros.estado = 'Anulado'`.

## Vista mart_ddd propuesta

Si `mart_ddd` existente no expone todos los campos requeridos, se propone ajustar la vista así:

```sql
create or replace view public.mart_ddd
with (security_invoker = true)
as
select
  r.ips_id,
  i.nombre as ips,
  r.periodo,
  r.servicio_id,
  s.nombre as servicio,
  c.antimicrobiano_id,
  a.nombre as antimicrobiano,
  a.codigo_atc,
  c.via,
  c.gramos_consumidos,
  c.ddd_oms,
  c.ddd_calculadas,
  r.camas_dia_ocupadas,
  c.ddd_100_camas_dia,
  r.estado as estado_registro,
  case
    when c.ddd_oms is null then 'Sin referencia OMS'
    when r.camas_dia_ocupadas is null or r.camas_dia_ocupadas = 0 then 'Denominador pendiente'
    when c.gramos_consumidos is null or c.gramos_consumidos < 0 then 'Revisión requerida'
    else 'Completo'
  end as estado_dato
from public.ddd_registros r
join public.ips i on i.id = r.ips_id
join public.servicios_ips s on s.id = r.servicio_id
left join public.ddd_consumos c on c.registro_id = r.id
left join public.catalogo_antimicrobianos a on a.id = c.antimicrobiano_id;
```

No ejecutar este SQL sin revisar primero la definición actual de `mart_ddd`.

## Validación esperada

El script `npm run validate:3` usa:

- autenticación real;
- IPS visible por RLS;
- servicio activo de la IPS;
- `ddd_registros` idempotente por `ips_id + servicio_id + periodo`;
- `ddd_consumos` sin DELETE físico;
- referencia real de `oms_ddd`;
- comparación matemática con tolerancia contra cálculos devueltos por Supabase.
