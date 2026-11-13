# EST-03A - Validación de navegación clínica

## Preparación local

1. Configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en `.env.local` o `.env.validation.local`.
2. Ejecutar `npm install`.
3. Ejecutar `npm run dev` y abrir la URL informada por Vite.
4. Usar únicamente cuentas de prueba del proyecto de desarrollo.

## Gestión de pacientes

- [ ] La lista carga pacientes sin exigir búsqueda previa.
- [ ] Buscar por nombre y por identificación.
- [ ] Filtrar Todos, Activos y Cerrados.
- [ ] Ordenar por actividad reciente y antigua.
- [ ] Cambiar Lista/Kanban conserva búsqueda y filtro en la URL.
- [ ] Las tarjetas muestran paciente, identificación, estado, decisión PROA, microbiología y última valoración.
- [ ] Expediente abre el paciente seleccionado.
- [ ] Nueva ronda conserva paciente, caso e IPS.
- [ ] Un borrador existente se reutiliza.
- [ ] Un caso cerrado no recibe rondas nuevas.

## Expediente longitudinal

- [ ] Muestra identificación e IPS activa.
- [ ] Distingue caso activo e históricos.
- [ ] Cambiar de caso actualiza diagnósticos, tratamientos, microbiología e intervenciones.
- [ ] Línea de tiempo está ordenada de forma descendente.
- [ ] Cada evento identifica su caso y abre la ronda relacionada cuando existe.
- [ ] No aparecen eventos de otra IPS.

## Multi-IPS

- [ ] El selector muestra claramente la IPS activa.
- [ ] Cambiar de IPS redirige a Inicio.
- [ ] Pacientes, casos y rondas se recargan para la nueva IPS.
- [ ] Volver a Pacientes no conserva el expediente de la IPS anterior.
- [ ] Recargar el navegador conserva la última IPS permitida seleccionada.
- [ ] Un usuario de una IPS no visualiza registros de otra.

## Responsive

- [ ] Desktop 1920x1080 y 1366x768: tabla y Kanban legibles.
- [ ] Tablet 1024x768 y 768x1024: Kanban con desplazamiento local y controles táctiles.
- [ ] Mobile 430x932, 390x844 y 360x800: pacientes en tarjetas, sin scroll horizontal global.
- [ ] Expediente pasa a una columna y selector de casos permite desplazamiento local.
- [ ] Acciones de ronda tienen área táctil suficiente.

## Login

- [ ] La imagen de placa de Petri carga en desktop, tablet y móvil.
- [ ] El formulario conserva contraste y no queda cubierto por la imagen.
- [ ] Login y logout mantienen su comportamiento previo.
