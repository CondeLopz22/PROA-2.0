# Pilot UX Review

## Flujo revisado

El flujo de piloto mantiene una sola aplicación:

1. Login.
2. Selección de IPS activa.
3. Búsqueda de paciente.
4. Crear o continuar caso.
5. Registrar ronda continua.
6. Tratamientos.
7. Microbiología si aplica.
8. Intervención PROA.
9. Nota clínica.
10. Confirmación.
11. Uso de antimicrobianos y DDD.
12. Calidad de datos.

## Ajustes incluidos en Milestone 5

- Caso cerrado bloquea creación accidental de rondas de seguimiento.
- Cierre de caso disponible desde el resumen del paciente con motivos estandarizados.
- DDD `Confirmado` o `Anulado` se trata como solo lectura.
- Mensajes de error del usuario evitan SQL, stack traces y detalles internos de RLS.
- Logging frontend básico queda limitado a desarrollo y sanitiza correos/números largos.

## Fricciones detectadas

- La pantalla de ronda es completa y puede sentirse densa en tablet. Para piloto se mantiene porque evita duplicidad entre bloques.
- CIE-10 sigue usando catálogo local inicial; el catálogo definitivo debe conectarse cuando esté disponible en Supabase.
- La calidad de datos muestra conteos técnicos, no flujo de corrección guiado.
- La anulación de DDD existe en servicio, pero no se expone como acción principal para evitar borrado/cambios accidentales durante el piloto.

## Revisión responsive

- Desktop 1366x768: flujo utilizable con navegación lateral y bloques compactos.
- Tablet: funcional, aunque la ronda clínica requiere desplazamiento vertical.
- Móvil: soportado para consulta y operación puntual, no recomendado como dispositivo principal del piloto.

## Accesibilidad básica

- Formularios principales usan `label`.
- Botones primarios/secundarios tienen texto explícito.
- Alertas usan texto además de color.
- Pendiente: revisión formal de contraste y navegación completa por teclado antes de producción.
