# Pilot Roles and RLS

## Roles funcionales

### Administrador IPS

- Lectura y escritura dentro de su IPS.
- Gestión institucional limitada: usuarios asignados, servicios y catálogos locales cuando exista UI.
- No debe ver datos de otras IPS.

### PROA

- Lectura y escritura clínica dentro de su IPS.
- Rondas, tratamientos, microbiología, intervenciones, notas y DDD.
- No debe administrar permisos globales.

### Consulta

- Solo lectura dentro de su IPS.
- Sin creación ni edición de pacientes, rondas, tratamientos, microbiología, intervenciones, notas ni DDD.

## Estado actual

Las pruebas de milestones previos validaron aislamiento Multi-IPS con el usuario disponible. Para Milestone 5 se agregó `npm run validate:rls`, que exige dos usuarios reales:

- `PROA_TEST_EMAIL` / `PROA_TEST_PASSWORD`: usuario GESTION SALUD.
- `PROA_TEST_HUJMB_EMAIL` / `PROA_TEST_HUJMB_PASSWORD`: usuario HUJMB.

El script falla si alguno puede leer filas de la IPS contraria en:

- `pacientes`
- `casos_proa`
- `rondas_proa`
- `tratamientos_antimicrobianos`
- `microbiologia`
- `intervenciones_proa`
- `ddd_registros`

## Políticas mínimas recomendadas

- SELECT: usuarios con `usuario_ips.estado = Activo` y coincidencia `ips_id`.
- INSERT/UPDATE: roles `Administrador IPS` y `PROA` dentro de la misma IPS.
- Consulta: solo SELECT.
- DELETE: evitar en piloto; preferir estados `Anulado` o `Cerrado`.

## Riesgos

- Si Looker se conecta con un usuario PostgreSQL que no respeta RLS, debe restringirse a MARTs y no a tablas transaccionales.
- Las vistas deben crearse con `security_invoker = true` cuando sean consumidas por usuarios autenticados con RLS.
- La diferenciación estricta de escritura por rol debe auditarse en Supabase antes de abrir piloto multirol.
