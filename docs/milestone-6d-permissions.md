# Milestone 6D - Permisos y RLS

Este documento queda actualizado por la decisión de producto de Milestone 6D.1.

Roles funcionales vigentes:

- `Administrador`
- `Usuario INFECTOMAG`
- `IPS Cliente`

Ver detalle definitivo en:

- `docs/milestone-6d1-role-model.md`
- `docs/milestone-6d1-rls-audit.md`
- `docs/milestone-6d1-migration-plan.md`

La UI ayuda a reducir errores, pero la seguridad debe estar respaldada por RLS. `IPS Cliente` debe ser solo lectura también si llama Supabase directamente.
