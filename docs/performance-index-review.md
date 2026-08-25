# Milestone 4 - Performance Index Review

No se crearon índices en Milestone 4. Esta lista debe verificarse contra `pg_indexes` antes de ejecutar SQL.

## Índices candidatos

```sql
create index if not exists idx_rondas_proa_ips_fecha
  on public.rondas_proa (ips_id, fecha_hora_ronda);

create index if not exists idx_casos_proa_paciente_estado
  on public.casos_proa (paciente_id, estado);

create index if not exists idx_tratamientos_caso_estado
  on public.tratamientos_antimicrobianos (caso_id, estado);

create index if not exists idx_microbiologia_caso_fecha
  on public.microbiologia (caso_id, fecha_toma);

create index if not exists idx_intervenciones_ronda
  on public.intervenciones_proa (ronda_id);

create index if not exists idx_ddd_registros_ips_periodo_servicio
  on public.ddd_registros (ips_id, periodo, servicio_id);

create index if not exists idx_ddd_consumos_registro
  on public.ddd_consumos (registro_id);
```

## Criterio

Crear solo después de confirmar que no existen equivalentes y que los planes de consulta de MARTs los requieren.
