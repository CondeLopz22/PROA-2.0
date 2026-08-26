# Native Analytics vs Looker

## Analítica nativa en la WebApp

La WebApp debe cubrir decisiones operativas frecuentes:

- Casos activos y seguimiento requerido.
- Rondas pendientes, borradores, confirmadas y de hoy.
- Intervenciones pendientes o con respuesta pendiente.
- Microbiología relevante para gestión.
- DDD recientes y tendencia básica.
- Calidad de datos operativa.
- Indicadores rápidos por actividad, intervención, microbiología y antimicrobianos.

Estas vistas usan límites razonables, filtros simples y MARTs cuando existen.

## Looker

Looker queda recomendado para:

- Exploración profunda.
- Cruces complejos entre dimensiones.
- Informes gerenciales.
- Tendencias históricas extensas.
- Dashboards compartibles por institución.
- Control de acceso analítico con usuarios de solo lectura.

## Fuentes preferidas

Nativo y Looker deben consumir preferentemente:

- `mart_casos_proa`
- `mart_rondas_proa`
- `mart_intervenciones_proa`
- `mart_microbiologia`
- `mart_resistencia_microbiologica`
- `mart_sensibilidad_microbiologica`
- `mart_ddd`

No reconstruir joins complejos en frontend si existe MART analítica estable.
