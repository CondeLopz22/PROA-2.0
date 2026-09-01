# Milestone 6D - Administración y parametrización Multi-IPS

## Alcance implementado

El módulo `Administración` reemplaza el placeholder visual por un centro modular de parametrización. La pantalla principal carga tarjetas de resumen y abre cada área bajo demanda:

- Institución
- Usuarios y accesos
- Servicios
- Antimicrobianos
- Microbiología
- Configuración PROA
- DDD / OMS
- Auditoría de datos

La seguridad real sigue dependiendo de Supabase Auth + RLS. La interfaz solo habilita u oculta acciones según el rol visible para reducir fricción y errores operativos.

## Esquema real usado

Tablas leídas o administradas:

- `ips`: `id`, `nombre`, `nit`, `codigo_reps`, `estado`, `fecha_creacion`.
- `perfiles_usuario`: `usuario_id`, `nombre`, `estado`, `es_admin_global`, `fecha_creacion`.
- `usuario_ips`: `usuario_id`, `ips_id`, `rol`, `estado`, `fecha_asignacion`.
- `servicios_ips`: `id`, `ips_id`, `nombre`, `estado`.
- `catalogo_antimicrobianos`: `id`, `nombre`, `codigo_atc`, `estado`.
- `catalogo_microorganismos`: `id`, `nombre`, `tipo_germen`, `estado`.
- `catalogo_tipos_muestra`: `id`, `nombre`, `estado`.
- `catalogo_intervenciones`: `id`, `nombre`, `estado`.
- `catalogo_categorias_proa`: `id`, `nombre`, `estado`.
- `oms_ddd`: `id`, `antimicrobiano_id`, `via`, `ddd_oms`, `unidad_ddd`, `version_fuente`, `fecha_actualizacion`.
- `tratamientos_antimicrobianos`: usado para auditoría de duplicados activos.

No se aplicaron migraciones ni cambios de esquema en este milestone.

## Decisiones funcionales

- `ips.nombre` es el único campo institucional editable desde UI por ahora. NIT, REPS, estado e identificadores se muestran como solo lectura.
- El correo de usuarios no se consulta desde frontend porque Supabase Auth no debe exponerse con `service_role`. La invitación o creación de usuarios queda preparada para una Edge Function segura.
- `servicios_ips` se administra con activación/inactivación, no con borrado físico.
- Los catálogos globales se muestran en modo consulta para Admin IPS, PROA y Consulta. Solo Admin Global ve acciones de cambio de estado, siempre sujetas a RLS.
- `oms_ddd` se trata como catálogo maestro sensible; este milestone lo expone principalmente como consulta.
- La auditoría administrativa detecta tratamientos activos duplicados por `caso_id + antimicrobiano_id`; si falta `antimicrobiano_id`, usa nombre normalizado como fallback. No corrige automáticamente.

## Parametrización IPS pendiente

Actualmente no se encontró una tabla de habilitación IPS-catálogo en el frontend validado. Si se decide controlar disponibilidad institucional sin duplicar catálogos globales, se propone crear tablas puente:

- `ips_antimicrobianos`
- `ips_tipos_muestra`
- `ips_microorganismos`
- `ips_intervenciones`
- `ips_categorias_proa`

Cada una debería tener `ips_id`, `catalogo_id`, `estado`, `fecha_creacion`, `usuario_actualizacion` cuando aplique, y RLS Multi-IPS.

## Auditoría de datos

Regla inicial implementada:

`TRATAMIENTOS_ACTIVOS_DUPLICADOS`

Detecta grupos donde un mismo caso tiene más de un tratamiento activo equivalente. La UI muestra paciente, caso, antimicrobiano, cantidad e IDs involucrados para revisión manual segura.

No se eliminan, suspenden ni anulan datos históricos desde esta pantalla.

