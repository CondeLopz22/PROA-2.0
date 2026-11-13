# EST-02: gestión de casos, navegación y diagnósticos

## Alcance implementado

- La acción desde Pacientes conserva `ips_id`, `paciente_id` y `caso_id`; no vuelve a abrir la búsqueda de Rondas.
- Un caso nuevo y su primera valoración se crean en una sola RPC transaccional.
- Una nueva ronda se inicia únicamente sobre el caso activo. Si existe un borrador, se reutiliza en lugar de crear otro.
- `tipo_valoracion` se deriva de las rondas no anuladas del caso seleccionado.
- Los casos cerrados o anulados no aceptan nuevas rondas.
- La primera valoración nunca hereda diagnósticos de otro caso.
- En seguimiento, `Sin cambios` copia los diagnósticos previos a la ronda actual al guardar; `Con cambios` permite editar, retirar o agregar diagnósticos sin modificar rondas anteriores.
- Los tratamientos mostrados en el resumen del paciente se limitan al caso activo.

## Migración pendiente

`20261013183925_est_02_case_workflow.sql` propone:

1. `iniciar_ronda_proa(...)`, RPC `security invoker` que valida permisos Multi-IPS y crea caso + primera ronda o inicia/reutiliza un borrador del caso activo.
2. Un trigger que impide crear un nuevo caso activo cuando ya existe otro para el mismo paciente e IPS.
3. Un trigger que valida la pertenencia IPS/paciente/caso, impide rondas nuevas en casos cerrados y deriva el tipo de valoración.

La migración no actualiza, cierra ni elimina casos existentes. No incluye un índice único parcial porque la base de desarrollo contiene duplicados activos históricos; imponerlo requeriría primero una corrección de datos aprobada por separado.

### Rollback técnico propuesto

Si la migración necesitara revertirse antes de usar la RPC en producción:

```sql
begin;
drop trigger if exists trg_est02_validar_nueva_ronda on public.rondas_proa;
drop trigger if exists trg_est02_caso_activo_unico on public.casos_proa;
drop function if exists public.iniciar_ronda_proa(uuid, uuid, uuid, uuid, text);
drop function if exists public.est02_validar_nueva_ronda();
drop function if exists public.est02_validar_caso_activo_unico();
drop function if exists public.est02_caso_activo(text, timestamptz);
commit;
```

Este rollback elimina únicamente objetos EST-02. No revierte ni altera datos clínicos creados válidamente mientras la migración estuvo activa.

## Hallazgo de datos

La inspección de solo lectura encontró pacientes de prueba con más de un caso activo. La interfaz muestra una advertencia y usa el caso activo más reciente de forma determinística. No se modificaron esos registros.

## Validación manual después de aprobar y aplicar la migración

1. Abrir `Pacientes / Registros` y pulsar `Nueva ronda` en un paciente con caso activo; debe abrir directamente el editor.
2. Repetir la acción antes de confirmar; debe abrir el mismo borrador, no crear otro.
3. Elegir un paciente sin caso activo y pulsar `Nuevo caso`; debe abrir una `Primera valoración`.
4. Confirmar la primera ronda y crear otra; debe ser `Seguimiento`.
5. En seguimiento, elegir `Sin cambios`, guardar y comprobar que la ronda anterior no cambió.
6. Crear otro seguimiento, elegir `Con cambios`, modificar y retirar diagnósticos; comprobar que solo cambió la ronda actual.
7. Intentar crear una ronda sobre un caso cerrado mediante llamada directa; debe devolver `EST02_CLOSED_CASE`.
8. Intentar abrir un segundo caso activo; debe devolver `EST02_ACTIVE_CASE`.
9. Verificar con una sesión IPS Cliente que la RPC rechaza la escritura.
10. Cambiar de paciente y comprobar que diagnósticos y tratamientos no persisten en el formulario nuevo.

## Validación SQL posterior a despliegue

```sql
select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'iniciar_ronda_proa';

select event_object_table, trigger_name
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name in ('trg_est02_caso_activo_unico', 'trg_est02_validar_nueva_ronda');
```
