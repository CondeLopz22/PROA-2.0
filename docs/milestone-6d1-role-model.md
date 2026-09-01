# Milestone 6D.1 - Modelo definitivo de usuarios

PROA V2 queda definido con tres tipos funcionales:

| Tipo | Fuente de verdad | Alcance | Escritura operativa | Administracion |
| --- | --- | --- | --- | --- |
| Administrador | `perfiles_usuario.es_admin_global = true` | Global | Si | Si |
| Usuario INFECTOMAG | `usuario_ips.rol = 'Usuario INFECTOMAG'` | IPS asignadas activas | Si | No |
| IPS Cliente | `usuario_ips.rol = 'IPS Cliente'` | IPS asignadas activas | No | No |

## Decisiones finales

- `Administrador` no se deriva de `usuario_ips.rol`.
- `usuario_ips.rol` solo acepta roles institucionales: `Usuario INFECTOMAG` e `IPS Cliente`.
- La administracion de plataforma depende exclusivamente de `perfiles_usuario.es_admin_global = true`.
- La lectura Multi-IPS se controla con asignaciones activas en `usuario_ips`.
- La escritura clinica/operativa requiere `Usuario INFECTOMAG` en la IPS asignada o administrador global.
- `IPS Cliente` queda en modo lectura por UI y por RLS.

## Homologacion

| Valor anterior | Resultado |
| --- | --- |
| `Administrador IPS` | `Usuario INFECTOMAG` |
| `PROA` | `Usuario INFECTOMAG` |
| `Consulta` | `IPS Cliente` |

El usuario `0820c02c-0879-4dfb-a53e-9d6dfe894edb` se promueve explicitamente con `perfiles_usuario.es_admin_global = true` y conserva su relacion operativa con GESTION SALUD como `Usuario INFECTOMAG`.

El usuario `a9743fae-9e01-4b02-88f2-53c83c1e9f28` queda como `Usuario INFECTOMAG` en HUJMB y no se promueve a administrador.

## Compatibilidad de UI

La interfaz no ofrece ni muestra `Administrador` como rol asignable en `usuario_ips`. Valores heredados visibles durante una transicion se normalizan internamente para no bloquear sesiones, pero no otorgan administracion.
