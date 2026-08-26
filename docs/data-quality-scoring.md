# Data Quality Scoring

## Formula

Calidad global =

```
(registros evaluados conformes / registros evaluados) * 100
```

Donde:

- registros evaluados conformes = registros evaluados - hallazgos no conformes.
- si no hay registros evaluados, el porcentaje se muestra como `Pendiente`.
- todas las reglas tienen el mismo peso en Milestone 6B.

## Reglas incluidas

| Regla | Tabla/campo | Condición conforme | Dimensión | Peso |
|---|---|---|---|---|
| Rondas sin diagnóstico | `rondas_proa` + `diagnosticos_ronda` | Cada ronda visible tiene al menos un diagnóstico | Completitud | 1 |
| Tratamientos sin catálogo | `tratamientos_antimicrobianos.antimicrobiano_id` | Tratamiento tiene `antimicrobiano_id` | Integridad | 1 |
| Microbiología positiva sin microorganismo | `microbiologia.resultado_general`, `microbiologia.microorganismo` | Si resultado es positivo, microorganismo no es null | Completitud | 1 |
| Intervención inconsistente | `intervenciones_proa.hubo_intervencion`, `tipo_intervencion_id` | Si hubo intervención, tiene tipo estructurado | Integridad | 1 |
| DDD sin OMS | `ddd_consumos.ddd_oms` | Consumo tiene referencia OMS resuelta | Integridad | 1 |
| DDD sin camas-día | `ddd_registros.camas_dia_ocupadas` | Denominador no es null ni cero | Completitud | 1 |
| Nota confirmada ausente | `rondas_proa`, `notas_proa` | Ronda confirmada tiene nota confirmada visible | Consistencia | 1 |

## Dimensiones no mostradas aún

- Oportunidad: requiere definición de tiempos máximos esperados.
- Duplicados potenciales: requiere reglas de negocio definitivas por episodio, ronda y tratamiento.

No se muestra ninguna dimensión sin definición matemática reproducible.
