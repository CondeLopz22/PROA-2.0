# Milestone 6D.1 - Plan de migracion

## Archivo

`supabase/migrations/20260901090000_milestone_6d1_role_model.sql`

## Estado

Pendiente de aplicar en Supabase real. La migracion debe revisarse y aplicarse completa, porque combina homologacion de roles, constraint, helpers y RLS en una sola transaccion.

## Cambios incluidos

1. Elimina `usuario_ips_rol_check`.
2. Promueve explicitamente a `0820c02c-0879-4dfb-a53e-9d6dfe894edb` con `perfiles_usuario.es_admin_global = true`.
3. Convierte roles:
   - `Administrador IPS` -> `Usuario INFECTOMAG`
   - `PROA` -> `Usuario INFECTOMAG`
   - `Consulta` -> `IPS Cliente`
4. Crea `usuario_ips_rol_check` con valores permitidos:
   - `Usuario INFECTOMAG`
   - `IPS Cliente`
5. Crea/reemplaza helpers:
   - `es_admin_global()`
   - `puede_leer_ips(uuid)`
   - `puede_escribir_operacion_ips(uuid)`
   - `puede_administrar_proa()`
   - `tiene_acceso_ips(uuid)` como compatibilidad de lectura
6. Reemplaza policies RLS de tablas clinicas, operativas, administrativas y catalogos.

## Orden seguro

La migracion usa:

```sql
begin;
...
commit;
```

Si falla cualquier paso, PostgreSQL debe hacer rollback de toda la transaccion y no dejar estado intermedio.

## Validaciones posteriores

Ejecutar despues de aplicar:

```sql
select rol, estado, count(*)
from public.usuario_ips
group by rol, estado
order by rol, estado;

select usuario_id, nombre, estado, es_admin_global
from public.perfiles_usuario
order by es_admin_global desc, nombre;

select p.usuario_id, p.nombre, p.es_admin_global, ui.ips_id, i.nombre as ips, ui.rol, ui.estado
from public.perfiles_usuario p
left join public.usuario_ips ui on ui.usuario_id = p.usuario_id
left join public.ips i on i.id = ui.ips_id
order by p.nombre, i.nombre;

select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;
```

Luego ejecutar:

```bash
npm run validate:6d1
```

## Rollback exacto si falla durante aplicacion

Si la migracion falla antes de `commit`, no se requiere rollback manual: PostgreSQL revierte la transaccion.

## Rollback estructural si se aplica y debe revertirse inmediatamente

Usar solo si la migracion ya hizo `commit` y se decide volver al modelo anterior:

```sql
begin;

alter table public.usuario_ips
  drop constraint if exists usuario_ips_rol_check;

update public.usuario_ips
set rol = 'PROA'
where rol = 'Usuario INFECTOMAG';

update public.usuario_ips
set rol = 'Consulta'
where rol = 'IPS Cliente';

update public.usuario_ips
set rol = 'Administrador IPS'
where usuario_id = '0820c02c-0879-4dfb-a53e-9d6dfe894edb';

update public.perfiles_usuario
set es_admin_global = false
where usuario_id = '0820c02c-0879-4dfb-a53e-9d6dfe894edb';

alter table public.usuario_ips
  add constraint usuario_ips_rol_check
  check (rol = any (array['Administrador IPS'::text, 'PROA'::text, 'Consulta'::text]));

-- Despues de esto deben restaurarse las policies RLS anteriores desde backup
-- o desde la auditoria previa. No ejecutar este rollback parcial sin restaurar
-- tambien las policies si el objetivo es regresar exactamente al estado previo.

commit;
```

Nota: el rollback exacto de policies requiere conservar el SQL anterior o usar backup/snapshot. La recomendacion operativa es aplicar la migracion en ventana controlada, validar inmediatamente y mantener un backup del esquema previo.
