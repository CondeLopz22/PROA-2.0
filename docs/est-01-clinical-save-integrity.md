# EST-01 - Integridad del guardado clínico

## Problema confirmado

El formulario guardaba cada bloque mediante solicitudes independientes. Un error tardío podía dejar cambios previos persistidos. El fallo observado fue `PGRST204`: el cliente enviaba `descripcion_motivo_no_intervencion`, pero `public.intervenciones_proa` no contenía esa columna.

## Migración propuesta

Archivo: `supabase/migrations/20261013160959_est_01_atomic_clinical_round_save.sql`.

La migración está preparada, pero **no está aplicada**.

1. Agrega `intervenciones_proa.descripcion_motivo_no_intervencion text` para conservar la explicación clínica cuando el motivo es `Otro`.
2. Crea `public.guardar_ronda_clinica(p_payload jsonb) returns jsonb`.
3. La función es `SECURITY INVOKER`; conserva RLS y los privilegios del usuario autenticado.
4. Solo concede ejecución a `authenticated`.
5. Bloquea la ronda con `FOR UPDATE` y el caso con un advisory lock transaccional.
6. Rechaza rondas distintas de `Borrador`.
7. Valida que IPS, paciente, caso, servicio, tratamientos y muestras relacionadas pertenezcan al mismo contexto.
8. Guarda contexto, diagnósticos, tratamientos, historial, microbiología, intervención y nota dentro de una sola transacción PostgreSQL.
9. La confirmación de ronda y nota ocurre dentro de la misma llamada cuando `confirm=true`.

Las eliminaciones necesarias para sincronizar diagnósticos o hijos microbiológicos ocurren dentro de la transacción. Si cualquier paso falla, PostgreSQL revierte también esas eliminaciones.

## Idempotencia

- Diagnósticos: conserva IDs del borrador y usa coincidencia semántica por ronda, tipo, código y descripción para datos heredados.
- Tratamientos nuevos: reutiliza la fila de la misma ronda, antimicrobiano y fecha de inicio.
- Historial de inicio/continuación: verifica la acción antes de insertar.
- Suspensión: solo registra historia al pasar desde `Activo`.
- Microbiología: conserva la muestra padre; reemplaza resistencias y sensibilidades dentro de la transacción.
- Intervención: actualiza la intervención editable de la ronda y usa la clave existente de `intervencion_tratamiento`.
- Nota: actualiza la última versión no confirmada; no elimina versiones confirmadas.

No se propone un índice único nuevo sobre tratamientos porque existen datos históricos duplicados que requieren auditoría separada.

## Mensajes y estado del formulario

La RPC utiliza prefijos sanitizados por sección (`EST01_DIAGNOSIS`, `EST01_TREATMENT`, `EST01_MICROBIOLOGY`, `EST01_INTERVENTION`, `EST01_NOTE`). El frontend los presenta en el bloque correspondiente y mantiene todos los datos diligenciados cuando la operación falla.

La evaluación automática de Auditoría PROA se ejecuta después del commit clínico. Si esa evaluación falla, se informa como pendiente sin afirmar que el guardado clínico falló.

## Validación posterior a aprobación

Después de aplicar la migración en desarrollo:

```bash
npm run validate:est01
```

El validador prueba:

- guardado completo;
- fallo tardío y rollback total;
- reintento sin duplicados;
- conservación de diagnósticos de otra ronda;
- aislamiento Multi-IPS;
- IPS Cliente sin escritura;
- disponibilidad de auditoría 6E.3;
- lectura de `mart_ddd` con AWaRe.

Los datos de prueba usan el prefijo `VALIDACION-EST01`. No se eliminan ni modifican registros clínicos ajenos.

## Aplicación propuesta

Antes de aplicar, comprobar que están desplegadas las migraciones hasta `20261009100000_milestone_6e3_therapeutic_reevaluation.sql`. Aplicar exclusivamente `20261013160959_est_01_atomic_clinical_round_save.sql`, revisar el resultado y ejecutar `validate:est01`.

## Rollback

Antes de uso clínico de la nueva columna:

```sql
begin;
revoke execute on function public.guardar_ronda_clinica(jsonb) from authenticated;
drop function if exists public.guardar_ronda_clinica(jsonb);
alter table public.intervenciones_proa
  drop column if exists descripcion_motivo_no_intervencion;
commit;
```

Después de que la columna contenga información, el rollback seguro debe retirar únicamente la RPC y conservar la columna para no perder texto clínico.
