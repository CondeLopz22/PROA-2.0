# PROA V2 - Looker Data Model

## Principio

Looker Studio debe consumir vistas `mart_*`, no tablas transaccionales complejas.

## Fuentes MART

- `mart_rondas_proa`: actividad clínica por ronda.
- `mart_intervenciones_proa`: intervención, aceptación y adherencia.
- `mart_microbiologia`: muestras y resultados microbiológicos.
- `mart_ddd`: consumo institucional y DDD.
- `mart_casos_proa`: episodios longitudinales, recomendado.

## Dimensiones comunes

- IPS.
- Servicio.
- Periodo mensual.
- Fecha de ronda o toma.
- Profesional.
- Tipo de terapia.
- Tipo de intervención.
- Antimicrobiano.
- Microorganismo.
- Vía.

## Métricas

- Rondas.
- Pacientes distintos.
- Casos activos.
- Intervenciones.
- % rondas con intervención.
- % aceptación.
- % cumplimiento guía.
- Muestras.
- % positividad.
- DDD calculadas.
- DDD/100 camas-día.
- Registros con alertas de calidad.

## Joins a evitar

- No unir `mart_rondas_proa` con `mart_microbiologia` por `ronda_id` dentro de Looker para conteos generales si puede multiplicar rondas.
- No unir `mart_intervenciones_proa` con detalle de tratamientos sin controlar cardinalidad.
- No sumar `ddd_100_camas_dia` directamente como si fuera aditivo; usar ratio ponderado cuando se agreguen servicios/periodos.

## Campos de fecha

- `periodo` para tendencias mensuales.
- `fecha_hora_ronda` para actividad clínica.
- `fecha_toma` y `fecha_resultado` para microbiología.

## Filtros recomendados

- IPS.
- Servicio.
- Periodo.
- Tipo de terapia.
- Tipo de intervención.
- Antimicrobiano.
- Microorganismo.

## Estructura de dashboard

### Página 1 - Resumen PROA

- pacientes valorados;
- rondas;
- intervenciones;
- aceptación;
- adherencia.

### Página 2 - Uso de antimicrobianos

- DDD totales;
- DDD/100 camas-día;
- tendencia mensual;
- servicio;
- antimicrobiano.

### Página 3 - Microbiología

- muestras;
- positividad;
- microorganismos;
- mecanismos de resistencia;
- impacto conducta.

### Página 4 - Intervenciones

- tipos;
- aceptación;
- días ahorrados;
- cumplimiento.

### Página 5 - Calidad de dato

- pendientes;
- inconsistencias;
- registros sin denominador;
- consumos sin OMS.

## Acceso seguro

No usar service role. Preferir usuario analítico PostgreSQL con permisos solo sobre vistas revisadas, o una capa analítica replicada con datos minimizados.
