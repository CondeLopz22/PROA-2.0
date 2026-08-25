# Admin Guide Pilot

## Usuarios

Los usuarios se autentican con Supabase Auth. No crear credenciales compartidas. Cada profesional debe tener un usuario nominal.

## Perfiles

Cada usuario debe tener fila en `perfiles_usuario`:

- `usuario_id`: id de Supabase Auth.
- `nombre`: nombre visible en la aplicación.
- `estado`: `Activo`.
- `es_admin_global`: solo cuando aplique.

## Asignación IPS

La tabla `usuario_ips` define permisos reales:

- `usuario_id`
- `ips_id`
- `rol`: `Administrador IPS`, `PROA` o `Consulta`.
- `estado`: `Activo`.
- `fecha_asignacion`

No usar columnas obsoletas como `activo`.

## Roles

- `Administrador IPS`: operación y configuración limitada dentro de su IPS.
- `PROA`: operación clínica y DDD.
- `Consulta`: solo lectura.

Antes del piloto ejecutar `npm run validate:rls` con dos usuarios de prueba para confirmar aislamiento Multi-IPS.

## Servicios

Los servicios se administran en `servicios_ips`:

- `ips_id`
- `nombre`
- `estado = Activo`

Solo servicios activos aparecen en formularios.

## Catálogos

Catálogos relevantes:

- `catalogo_antimicrobianos`
- `oms_ddd`
- `catalogo_microorganismos`
- `catalogo_tipos_muestra`
- `catalogo_intervenciones`
- `catalogo_categorias_proa`

Mantener `estado = Activo` solo para opciones vigentes. No borrar catálogos usados históricamente.

## Estados

- Ronda: `Borrador`, `Confirmada`.
- Caso: `Activo`, `Cerrado`.
- DDD: `Borrador`, `Confirmado`, `Anulado`.

No borrar registros clínicos ni DDD confirmados durante piloto.

## Troubleshooting

- Usuario sin IPS: revisar `usuario_ips.estado = Activo` e `ips.estado = Activa`.
- Paciente no visible: confirmar `ips_id` y RLS.
- Error de duplicado DDD: ya existe `ddd_registros` para IPS + servicio + periodo.
- Sin DDD OMS: falta referencia en `oms_ddd` para antimicrobiano + vía.
- Looker sin datos: revisar MART usada, filtro IPS/periodo y credencial analítica.
