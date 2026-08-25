# Milestone 4 - RLS Audit

## Estado

No se inspeccionaron políticas en vivo desde esta sesión por falta de variables Supabase. Este documento define la matriz de auditoría que debe verificarse contra `pg_policies`.

| Tabla/Vista | SELECT | INSERT | UPDATE | DELETE | Política esperada | Riesgo | Observación |
|---|---|---|---|---|---|---|---|
| ips | Sí | No frontend | No frontend | No frontend | Lectura de IPS asignadas | Medio | No exponer IPS no asignadas en flujos operativos |
| usuario_ips | Sí | Admin | Admin | No | Usuario ve sus asignaciones activas | Alto | Fuente de autorización Multi-IPS |
| perfiles_usuario | Sí | Admin | Admin | No | Usuario autenticado visible | Medio | No asumir `id`; PK lógica `usuario_id` |
| pacientes | Sí | Sí | Sí | No | `ips_id` asignada activa | Alto | Base del aislamiento clínico |
| casos_proa | Sí | Sí | Sí | No | `ips_id` asignada activa | Alto | No DELETE histórico |
| rondas_proa | Sí | Sí | Sí | No | `ips_id` asignada activa | Alto | Confirmadas deben ser tratadas como solo lectura por app |
| diagnosticos_ronda | Sí | Sí | Sí/replace | Sí si RLS permite | Derivar acceso vía ronda | Medio | Reemplazo controlado en borrador |
| tratamientos_antimicrobianos | Sí | Sí | Sí | No | `ips_id` asignada activa | Alto | Historial preserva cambios |
| microbiologia | Sí | Sí | Sí | Sí si RLS permite | `ips_id` asignada activa | Alto | Usa `caso_id`, no `paciente_id` |
| resistencia_microbiologica | Sí | Sí | Sí | Sí si RLS permite | Derivar vía `muestra_id` | Medio | Hijo de microbiología |
| sensibilidad_microbiologica | Sí | Sí | Sí | Sí si RLS permite | Derivar vía `muestra_id` | Medio | Hijo de microbiología |
| intervenciones_proa | Sí | Sí | Sí | Sí si RLS permite | `ips_id` asignada activa | Alto | No usar service role |
| intervencion_tratamiento | Sí | Sí | Sí | Sí si RLS permite | Derivar vía intervención | Medio | Relación M:N |
| notas_proa | Sí | Sí | Sí | No | Derivar vía ronda | Alto | Texto clínico final |
| ddd_registros | Sí | Sí | Sí | No | `ips_id` asignada activa | Alto | Sin DELETE; usar `Anulado` |
| ddd_consumos | Sí | Sí | Sí | No | Derivar vía registro | Alto | Sin DELETE |
| oms_ddd | Sí | Admin | Admin | No | Catálogo maestro | Bajo | Lectura para autenticados |
| mart_* | Sí | No | No | No | `security_invoker=true` | Alto | Evitar vistas security definer que salten RLS |

## Looker

No usar service role. Alternativas seguras:

1. Usuario PostgreSQL analítico restringido a vistas `mart_*`.
2. Vistas dedicadas con `security_invoker=true` y filtros por IPS cuando aplique.
3. Réplica o esquema analítico con datos minimizados.

## Riesgos principales

- Vistas creadas sin `security_invoker` pueden saltar RLS.
- Looker con usuario demasiado amplio puede exponer Multi-IPS.
- Tablas hijas sin política derivada pueden bloquear validadores o generar huecos de acceso.
- Falta de DELETE policy debe respetarse en frontend y scripts.
