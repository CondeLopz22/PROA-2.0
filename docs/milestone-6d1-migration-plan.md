# Milestone 6D.1 - Plan de migracion

## Migracion creada

Archivo:

`supabase/migrations/20260901090000_milestone_6d1_role_model.sql`

## Cambios propuestos

1. Homologar valores existentes:
   - `Administrador IPS` -> `Administrador`
   - `PROA` -> `Usuario INFECTOMAG`
   - `Consulta` -> `IPS Cliente`
2. Crear funciones auxiliares:
   - `es_administrador_proa()`
   - `es_usuario_infectomag_en_ips(uuid)`
   - `es_ips_cliente_en_ips(uuid)`

## No incluido automaticamente

No se reescriben politicas RLS en esta migracion porque deben revisarse contra los nombres y dependencias reales de cada politica activa. La etapa segura es:

1. aplicar homologacion en ambiente controlado;
2. ejecutar `validate:6d1`;
3. si una operacion prohibida pasa, ajustar esa politica especifica;
4. volver a ejecutar `validate:6d1`.

## Cuentas requeridas para validacion real

Variables de entorno:

- `PROA_TEST_ADMIN_EMAIL`
- `PROA_TEST_ADMIN_PASSWORD`
- `PROA_TEST_INFECTOMAG_EMAIL`
- `PROA_TEST_INFECTOMAG_PASSWORD`
- `PROA_TEST_CLIENT_EMAIL`
- `PROA_TEST_CLIENT_PASSWORD`

No se deben guardar contrasenas en el repositorio.
