# EST-03B — Trazabilidad terapéutica longitudinal

## Alcance

EST-03B separa cuatro hechos que antes podían confundirse:

1. el tratamiento que el paciente recibe al iniciar una valoración;
2. la recomendación emitida por PROA;
3. la decisión posterior del médico tratante;
4. la implementación efectiva verificada por un profesional autenticado.

La migración `20261113064602_est_03b_therapeutic_traceability.sql` está preparada, pero no debe aplicarse sin aprobación. El guardado clínico usa `guardar_ronda_clinica_trazable`, que invoca internamente la RPC EST-01 `guardar_ronda_clinica`; ambas operaciones comparten una transacción PostgreSQL.

## Modelo propuesto

- `tratamientos_antimicrobianos`: agrega indicación clínica y tipo Empírico/Dirigido al tratamiento vigente.
- `rondas_proa.sin_antimicrobianos_valoracion`: registra explícitamente la ausencia de antimicrobianos; queda `NULL` para rondas históricas no valoradas con este modelo.
- `tratamientos_valoracion`: instantánea por ronda del tratamiento recibido. La clave `ronda_id + tratamiento_id` evita duplicados en reintentos.
- `intervenciones_proa`: agrega acción terapéutica estructurada y, cuando aplica, el tratamiento recomendado. No convierte esa recomendación en tratamiento recibido.
- `decisiones_intervencion`: historial de Aceptada, Parcialmente aceptada o Rechazada (`No aceptada` en el valor compatible existente). La ausencia de fila representa Pendiente.
- `implementaciones_intervencion`: historial de Implementación parcial, Implementada o No implementada. La ausencia de fila representa Pendiente de verificación.
- `mart_trazabilidad_terapeutica`: una fila por intervención con la decisión e implementación más recientes y los tiempos desde la recomendación. Usa `security_invoker=true`.

## Continuidad longitudinal

Las recomendaciones incompletas de rondas anteriores se consultan por caso. Un seguimiento registra decisión o implementación sobre la intervención original mediante `registrar_seguimiento_intervencion`; no crea otra intervención. La combinación `intervencion_id + ronda_id` hace idempotente el reintento del mismo borrador y las rondas confirmadas quedan de solo lectura.

Las fechas y responsables son trazables: el profesional se deriva de `auth.uid()` y la fecha efectiva de implementación puede registrarse; en ausencia de fecha se usa la hora del servidor.

## Seguridad

Las tablas nuevas tienen RLS. `SELECT` usa `puede_leer_ips`; `INSERT/UPDATE` usa `puede_escribir_operacion_ips`, exige ronda Borrador y valida que ronda, caso, paciente, intervención y tratamiento pertenezcan a la misma IPS. No se crean políticas `DELETE`. IPS Cliente permanece sin escritura.

## Indicadores habilitados

El MART permite calcular sin un tablero nuevo:

- porcentaje de recomendaciones aceptadas;
- porcentaje de recomendaciones implementadas;
- horas entre recomendación y decisión;
- horas entre recomendación e implementación;
- recomendaciones pendientes de decisión o verificación.

## Validación posterior a la migración

Antes de aprobación funcional deben comprobarse en Supabase de desarrollo:

1. valoración con tratamientos recibidos y valoración sin antimicrobianos;
2. decisión e implementación inmediatas;
3. decisión o implementación diferida en una ronda posterior;
4. reintento del guardado sin duplicados;
5. rollback de todos los bloques ante un error de trazabilidad;
6. conservación de datos de rondas confirmadas;
7. aislamiento Multi-IPS e IPS Cliente solo lectura;
8. regresiones `validate:est01`, `validate:est02`, auditoría 6E.3 y DDD/AWaRe.

## Limitaciones deliberadas

- No se crea un nuevo tablero.
- No se infiere una decisión ni implementación clínica.
- Los tratamientos posteriores se registran con el flujo terapéutico existente; la implementación puede enlazar el tratamiento resultante principal.
- No se modifican retrospectivamente rondas históricas.
