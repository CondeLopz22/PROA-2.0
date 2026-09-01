# Milestone 6D.1 - Auditoria RLS y permisos

## Hallazgo previo

La RLS actual usa principalmente `tiene_acceso_ips(ips_id)`. Esa funcion valida asignacion activa a IPS, pero no diferencia rol. Por tanto un usuario `Consulta` activo podria escribir en tablas operativas si llama Supabase directamente.

Tambien se encontro que `servicios_ips` permite `INSERT/UPDATE` a cualquier usuario con acceso activo a la IPS, incluyendo el rol operativo anterior `PROA`.

## Matriz objetivo

| Recurso | Administrador | Usuario INFECTOMAG | IPS Cliente |
| --- | --- | --- | --- |
| Administracion | RW | NO | NO |
| IPS/configuracion | RW | R propia/asignada | R propia |
| Usuarios y accesos | RW | NO | NO |
| Servicios | RW | R | R |
| Pacientes | RW | RW en IPS asignada | R |
| Casos | RW | RW en IPS asignada | R |
| Rondas | RW | RW en IPS asignada | R |
| Diagnosticos | RW | RW en IPS asignada | R |
| Tratamientos | RW | RW en IPS asignada | R |
| Historial tratamiento | RW | RW en IPS asignada | R |
| Microbiologia | RW | RW en IPS asignada | R |
| Intervenciones | RW | RW en IPS asignada | R |
| Notas | RW | RW en IPS asignada | R |
| DDD operativo | RW | RW en IPS asignada | R |
| Indicadores/MARTs | R | R | R |
| Calidad de Datos | R | R | R |
| Catalogos | RW | R | R |
| OMS DDD | RW | R | R |

## Helpers propuestos

- `es_admin_global()`: devuelve true solo para perfil activo con `es_admin_global = true`.
- `puede_leer_ips(uuid)`: administrador global o asignacion activa a la IPS.
- `puede_escribir_operacion_ips(uuid)`: administrador global o `Usuario INFECTOMAG` activo en la IPS.
- `puede_administrar_proa()`: alias semantico de `es_admin_global()`.
- `tiene_acceso_ips(uuid)`: se conserva como compatibilidad y delega en `puede_leer_ips(uuid)`.

## Endurecimiento RLS

- `SELECT` operativo: `puede_leer_ips`.
- `INSERT/UPDATE` operativo: `puede_escribir_operacion_ips`.
- `DELETE` solo donde ya existia: `puede_escribir_operacion_ips`.
- `servicios_ips` escritura: `puede_administrar_proa`.
- `perfiles_usuario` y `usuario_ips` escritura: `puede_administrar_proa`.
- Catalogos y `oms_ddd`: lectura autenticada segun politica actual; escritura solo administrador global.

## Validacion esperada

`npm run validate:6d1` debe ejecutarse despues de aplicar la migracion en Supabase real y con tres cuentas reales:

- Administrador: `PROA_TEST_ADMIN_EMAIL` / `PROA_TEST_ADMIN_PASSWORD`.
- Usuario INFECTOMAG: `PROA_TEST_INFECTOMAG_EMAIL` / `PROA_TEST_INFECTOMAG_PASSWORD`.
- IPS Cliente: `PROA_TEST_CLIENT_EMAIL` / `PROA_TEST_CLIENT_PASSWORD`.

La prueba debe fallar si `IPS Cliente` logra insertar o actualizar datos operativos, o si `Usuario INFECTOMAG` modifica servicios, catalogos o `perfiles_usuario.es_admin_global`.

## Riesgos

- Aplicar solo homologacion de roles sin RLS dejaria a `IPS Cliente` con escritura.
- Aplicar RLS sin cambiar el constraint podria fallar al guardar roles nuevos.
- Quitar la promocion explicita del usuario `0820c02c-0879-4dfb-a53e-9d6dfe894edb` podria bloquear la administracion inicial.
- Las vistas analiticas deben revisarse separadamente si usan `security definer`; esta migracion se concentra en tablas transaccionales y catalogos.
