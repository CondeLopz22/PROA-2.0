# Milestone 6B.1 - propuesta de control SQL para tratamientos activos duplicados

## Problema

Durante la validación en navegador se observaron tratamientos activos repetidos para un mismo caso, por ejemplo `ACICLOVIR` varias veces en el mismo episodio. En Milestone 6B.1 se agregó defensa en frontend/servicio para impedir nuevas inserciones activas equivalentes.

## Regla funcional

Para un mismo `caso_id` no debe existir más de un tratamiento con `estado = 'Activo'` para el mismo `antimicrobiano_id`.

Los tratamientos `Suspendido`, `Finalizado` o históricos no deben bloquear un nuevo inicio clínicamente válido posterior.

## SQL propuesto, no aplicado

Antes de aplicar cualquier constraint se debe auditar y corregir duplicados históricos.

```sql
select
  caso_id,
  antimicrobiano_id,
  count(*) as tratamientos_activos
from public.tratamientos_antimicrobianos
where estado = 'Activo'
  and antimicrobiano_id is not null
group by caso_id, antimicrobiano_id
having count(*) > 1;
```

Si el resultado está limpio, se propone:

```sql
create unique index concurrently if not exists uq_tratamientos_activos_por_caso_antimicrobiano
on public.tratamientos_antimicrobianos (caso_id, antimicrobiano_id)
where estado = 'Activo'
  and antimicrobiano_id is not null;
```

## Registros históricos sin catálogo

Para filas antiguas con `antimicrobiano_id is null`, el frontend usa comparación de nombre normalizado como fallback. No se propone constraint por texto hasta homologar el catálogo y limpiar nombres históricos, porque un índice por nombre normalizado podría bloquear casos clínicamente válidos o consolidar variantes no equivalentes.

## Decisión 6B.1

No se modifica Supabase en este milestone. La barrera queda aplicada en `treatmentService` y en la validación del formulario de ronda; el refuerzo transaccional queda pendiente de aprobación después de auditoría histórica.
