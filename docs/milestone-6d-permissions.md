# Milestone 6D - Permisos y RLS

## Roles encontrados

Roles funcionales usados por `usuario_ips.rol`:

- `Administrador IPS`
- `PROA`
- `Consulta`

Además, `perfiles_usuario.es_admin_global = true` identifica capacidad administrativa global.

## Matriz funcional objetivo

| Capacidad | Admin Global | Administrador IPS | PROA | Consulta |
| --- | --- | --- | --- | --- |
| Ver IPS permitidas | Sí | Sí | Sí | Sí |
| Editar nombre visible de IPS | Sí | Sí, solo IPS activa si RLS lo permite | No | No |
| Ver usuarios asignados a IPS | Sí | Sí, solo IPS activa | Según RLS | Según RLS |
| Asignar usuario existente a IPS | Sí | Sí, solo IPS activa si RLS lo permite | No | No |
| Cambiar rol dentro de IPS | Sí | Sí, sin elevar Admin Global | No | No |
| Activar/desactivar acceso IPS | Sí | Sí, solo IPS activa | No | No |
| Crear/activar/desactivar servicios | Sí | Sí, solo IPS activa | No | No |
| Ver catálogos globales | Sí | Sí | Sí | Sí |
| Activar/desactivar catálogos globales | Sí, si RLS lo permite | No | No | No |
| Ver OMS DDD | Sí | Sí | Sí | Sí |
| Editar OMS DDD | Sensible, solo si RLS lo permite | No | No | No |
| Ver auditoría de duplicados | Sí | Sí, solo IPS activa | Sí/lectura según RLS | Sí/lectura según RLS |

La UI implementa esta matriz como control de experiencia. RLS debe sostenerla como control de seguridad.

## Riesgos auditados

- `Consulta` debe ser read-only también en políticas RLS. Si las políticas actuales permiten escritura, el frontend no es suficiente.
- `PROA` no debe modificar configuración institucional sensible. Puede operar rondas, tratamientos, microbiología, intervenciones, notas y DDD según reglas clínicas previas.
- `Administrador IPS` no debe poder modificar `perfiles_usuario.es_admin_global`.
- Ningún usuario IPS debe administrar registros de otra IPS mediante manipulación de parámetros.
- Looker o usuarios analíticos no deben usar `service_role` ni acceso directo amplio a tablas clínicas.

## SQL propuesto si RLS no diferencia Consulta/PROA

No aplicado en este milestone. Debe revisarse contra las políticas reales antes de ejecutar.

```sql
-- Ejemplo conceptual: escritura de servicios solo para admin global o Administrador IPS activo.
create policy "servicios_ips admin write"
on public.servicios_ips
for update
to authenticated
using (
  exists (
    select 1
    from public.perfiles_usuario p
    where p.usuario_id = auth.uid()
      and p.es_admin_global = true
      and p.estado = 'Activo'
  )
  or exists (
    select 1
    from public.usuario_ips ui
    where ui.usuario_id = auth.uid()
      and ui.ips_id = servicios_ips.ips_id
      and ui.estado = 'Activo'
      and ui.rol = 'Administrador IPS'
  )
)
with check (
  exists (
    select 1
    from public.perfiles_usuario p
    where p.usuario_id = auth.uid()
      and p.es_admin_global = true
      and p.estado = 'Activo'
  )
  or exists (
    select 1
    from public.usuario_ips ui
    where ui.usuario_id = auth.uid()
      and ui.ips_id = servicios_ips.ips_id
      and ui.estado = 'Activo'
      and ui.rol = 'Administrador IPS'
  )
);
```

## Invitación de usuarios

Crear o invitar usuarios requiere operaciones privilegiadas de Supabase Auth. No debe hacerse desde el cliente con `service_role`.

Arquitectura recomendada:

1. Edge Function `admin-invite-user`.
2. Verificación server-side del JWT del solicitante.
3. Validación de `es_admin_global` o `usuario_ips.rol = 'Administrador IPS'`.
4. Uso de service role solo dentro de la Edge Function.
5. Inserción controlada en `perfiles_usuario` y `usuario_ips`.
6. Auditoría mínima sin datos clínicos sensibles.

