# Milestone 6D.1 - Modelo definitivo de usuarios

PROA V2 queda definido con tres tipos funcionales:

| Tipo | Alcance | Escritura clinica/operativa | Administracion |
| --- | --- | --- | --- |
| Administrador | Todas las IPS autorizadas/globales | Si | Si |
| Usuario INFECTOMAG | IPS asignadas | Si | No |
| IPS Cliente | Su IPS asignada | No | No |

## Homologacion de roles

El codigo acepta temporalmente valores heredados para no bloquear sesiones existentes, pero los normaliza asi:

| Valor heredado | Tipo funcional |
| --- | --- |
| `Administrador IPS` | `Administrador` |
| `PROA` | `Usuario INFECTOMAG` |
| `Consulta` | `IPS Cliente` |

La migracion pendiente `supabase/migrations/20260901090000_milestone_6d1_role_model.sql` propone actualizar esos valores en `usuario_ips.rol`.

## Representacion actual

- `perfiles_usuario.es_admin_global = true` sigue identificando capacidad administrativa global.
- `usuario_ips.rol` representa el tipo funcional dentro de una IPS.
- `usuario_ips.estado = Activo` define asignacion vigente.
- La UI usa `permissionService` para derivar `Administrador`, `Usuario INFECTOMAG`, `IPS Cliente` o `Sin acceso`.

## Decisiones

- Administracion queda exclusiva para `Administrador`.
- `Usuario INFECTOMAG` conserva llenado, consulta y analisis en IPS asignadas.
- `IPS Cliente` queda en modo consulta y no debe poder escribir por RLS.
- Los catalogos globales no se duplican por IPS en este milestone.
- No se implementa creacion/invitacion de usuarios desde frontend porque requiere backend privilegiado.
