# User Guide Pilot

## Login

Ingresa con tu usuario de Supabase Auth. Si tienes una sola IPS activa, el sistema la selecciona automáticamente. Si tienes varias, selecciona la IPS de trabajo antes de consultar pacientes.

## Buscar paciente

1. Abre `Rondas PROA` o `Pacientes / Registros`.
2. Selecciona tipo de identificación.
3. Digita número de identificación.
4. Usa `Buscar paciente`.

La búsqueda solo muestra pacientes visibles por RLS para la IPS activa.

## Crear o continuar caso

- Si existe caso activo, puedes continuar seguimiento.
- Si no existe caso activo, usa `Crear nuevo caso`.
- Si el caso está cerrado, crea un nuevo caso para un nuevo episodio.

## Registrar ronda

1. Abre la ronda en borrador.
2. Revisa contexto de ronda: servicio, cama, profesional y tipo de valoración.
3. Revisa resumen del paciente/caso.
4. Registra diagnósticos y contexto clínico solo si cambian o hacen falta.
5. Gestiona antimicrobianos: continuar, modificar, suspender o agregar.
6. Registra microbiología solo cuando aplique.
7. Registra intervención PROA o motivo de no intervención.
8. Genera la nota.
9. Edita la nota si necesitas mejorar la narrativa.
10. Confirma la ronda.

Una ronda confirmada queda en modo solo lectura.

## Uso de antimicrobianos / DDD

1. Abre `Consumo / DDD`.
2. Selecciona periodo y servicio.
3. Registra ocupación: especialmente `camas_dia_ocupadas`.
4. Agrega consumos reales de antimicrobianos.
5. Revisa alertas de referencia OMS y denominador.
6. Guarda borrador o confirma el periodo.

Un periodo confirmado queda en modo solo lectura para esta versión.

## Indicadores y calidad

- `Calidad de Datos` muestra hallazgos técnicos básicos antes de usar datos en Looker.
- Los indicadores finales se consumen desde Looker usando las MARTs preparadas.

## Cerrar caso

Desde el resumen del paciente:

1. Selecciona el caso.
2. Elige motivo de cierre.
3. Usa `Cerrar caso`.

Motivos disponibles: egreso/alta, finalización de seguimiento PROA, fallecimiento, traslado u otro.
