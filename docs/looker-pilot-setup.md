# Looker Pilot Setup

## Fuentes autorizadas

Looker debe consumir vistas MART, no las tablas clínicas transaccionales:

- `mart_rondas_proa`
- `mart_casos_proa`
- `mart_intervenciones_proa`
- `mart_microbiologia`
- `mart_resistencia_microbiologica`
- `mart_sensibilidad_microbiologica`
- `mart_ddd`

Las vistas propuestas para piloto están en `docs/milestone-5-analytics-views.sql`.

## Filtros globales

- IPS: `ips` o `ips_id`
- Periodo: `periodo`
- Servicio: `servicio` o `servicio_id`

## Dimensiones principales

- Diagnóstico: `diagnostico_principal`, `diagnostico_infeccioso`
- Categoría PROA: `categoria_proa`
- Terapia: `tipo_terapia`, `terapia_dirigida_por_microbiologia`, `tipo_profilaxis`
- Antimicrobiano: `antimicrobiano`, `antimicrobiano_id`, `codigo_atc`, `via`
- Microbiología: `tipo_muestra`, `resultado_general`, `microorganismo`, `tipo_germen`
- Resistencia: `mecanismo`
- Intervención: `tipo_intervencion`, `origen_intervencion`, `aceptacion`, `cumplimiento_guia`

## Métricas base

- Rondas: conteo distinto de `ronda_id`
- Pacientes valorados: conteo distinto de `paciente_id`
- Casos activos: conteo distinto de `caso_id` filtrado por `estado = Activo`
- Intervenciones: conteo de `intervencion_id`
- % aceptación: recomendaciones con `aceptacion = Sí` / recomendaciones evaluadas
- % cumplimiento guía: `cumplimiento_guia = Cumple` / registros evaluables
- Positividad: muestras con `resultado_general = Positivo` / muestras con resultado
- DDD totales: suma de `ddd_calculadas`
- DDD/100 camas-día: usar `ddd_100_camas_dia` por fila o calcular sobre agregados como `sum(ddd_calculadas) / sum(camas_dia_ocupadas) * 100`

## Joins a evitar

No unir directamente MARTs principales por relaciones many-to-many para indicadores de conteo. En particular:

- `mart_rondas_proa` con `mart_intervenciones_proa` puede multiplicar rondas.
- `mart_microbiologia` con sensibilidad o resistencia detallada puede multiplicar muestras.
- `mart_ddd` ya está al nivel consumo; no mezclar con rondas clínicas para métricas institucionales.

Para análisis detallado usar vistas secundarias y conteos distintos.

## Seguridad

No usar `service_role`. Para piloto se recomienda una de estas opciones:

1. Usuario PostgreSQL analítico de solo lectura con `SELECT` solo sobre MARTs autorizadas.
2. Usuario Supabase autenticado con RLS y membresía `usuario_ips` controlada por IPS.
3. Exportación periódica a una capa analítica restringida si Looker requiere un modelo sin sesión de usuario.

No exponer credenciales en repositorio ni en variables frontend.

## Páginas recomendadas

1. Resumen ejecutivo: pacientes, rondas, casos activos, intervenciones, aceptación y adherencia.
2. Uso de antimicrobianos: DDD, DDD/100 camas-día, tendencias, servicios y antimicrobianos.
3. Microbiología: positividad, microorganismos, mecanismos de resistencia e impacto en conducta.
4. Intervenciones: tipos, aceptación, cumplimiento, antimicrobianos intervenidos y días ahorrados.
5. Calidad de datos: inconsistencias, referencias OMS faltantes, rondas incompletas y pendientes.
