# Milestone 6D - Checklist navegador

## Acceso

- [ ] Login con usuario autorizado.
- [ ] IPS activa visible.
- [ ] Abrir `Administración` desde sidebar.
- [ ] Ver resumen modular con las 8 secciones.

## Institución

- [ ] Visualiza nombre, NIT, REPS y estado de IPS activa.
- [ ] Campos estructurales no críticos están claramente diferenciados.
- [ ] Un usuario sin permisos no puede editar.
- [ ] Un usuario con permisos recibe feedback al guardar.

## Usuarios y accesos

- [ ] Lista usuarios/asignaciones visibles por IPS.
- [ ] Rol `Consulta` ve acciones deshabilitadas.
- [ ] Admin IPS puede cambiar rol/estado solo si RLS lo permite.
- [ ] Retirar/desactivar acceso pide confirmación.
- [ ] No se expone correo desde Auth cuando no está disponible de forma segura.

## Servicios

- [ ] Lista servicios activos e inactivos.
- [ ] Crear servicio funciona para rol permitido.
- [ ] Activar/desactivar pide confirmación.
- [ ] Servicio inactivo queda visible como histórico.

## Catálogos

- [ ] Antimicrobianos lista catálogo visible.
- [ ] Microbiología lista tipos de muestra y microorganismos.
- [ ] Configuración PROA lista intervenciones y categorías.
- [ ] Búsqueda filtra resultados.
- [ ] Roles no globales no editan catálogos globales.

## DDD / OMS

- [ ] Lista antimicrobiano, ATC, vía, DDD y fuente.
- [ ] No permite edición accidental para Admin IPS/PROA/Consulta.

## Auditoría de datos

- [ ] Muestra tratamientos activos duplicados si existen.
- [ ] Acción `Revisar` muestra IDs involucrados.
- [ ] No corrige ni elimina automáticamente.

## Responsive

- [ ] Desktop: navegación lateral administrativa fija y tablas legibles.
- [ ] Tablet: secciones administrativas en navegación horizontal.
- [ ] Mobile: cards/formularios verticales sin scroll horizontal global.

## Seguridad

- [ ] Usuario GESTION SALUD no administra HUJMB.
- [ ] Usuario HUJMB no administra GESTION SALUD.
- [ ] Consulta no puede escribir aunque manipule la UI.
- [ ] PROA no modifica configuración sensible.
- [ ] Admin IPS no se eleva a Admin Global.

