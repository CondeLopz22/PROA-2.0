# Milestone 6E.3 - Reevaluación terapéutica

## Alcance

6E.3 incorpora oportunidades determinísticas de reevaluación dentro de Auditoría PROA. El sistema identifica condiciones que requieren revisión profesional; no recomienda antimicrobianos, no interpreta el antibiograma y no modifica tratamientos.

La migración `20261009100000_milestone_6e3_therapeutic_reevaluation.sql` queda preparada para revisión. No se aplica automáticamente.

## Modelo

- `hallazgos_auditoria` sigue siendo la entidad principal. `AUD-05` representa DES-01 para evitar duplicidad.
- `hallazgo_tratamiento` relaciona una oportunidad con uno o varios tratamientos. DES-03 usa esta relación M:N.
- `decisiones_reevaluacion` conserva una decisión profesional inmutable por oportunidad, con autor autenticado, fecha, justificación e intervención opcional.
- `contexto_hash` identifica el contexto clínico semántico que originó la oportunidad.
- `mart_reevaluacion_terapeutica` expone una fila por oportunidad con tratamientos agregados y `security_invoker=true`.

## Reglas

| Código | Condición | Estado |
| --- | --- | --- |
| AUD-05 / DES-01 | Terapia empírica y microbiología disponible | Activa; reutiliza el hallazgo existente |
| DES-02 | Watch/Reserve activo y sensibilidad relevante disponible en el caso | Activa |
| DES-03 | Dos o más tratamientos activos y microbiología disponible | Activa; relaciona todos los tratamientos |
| DES-04 | Watch/Reserve activo, evolución `Mejoría` y día de tratamiento superior al umbral | Preparada; inactiva mientras el umbral sea `NULL` |

`No disponible` no cuenta como antibiograma disponible. El motor muestra el contexto microbiológico sin interpretar susceptibilidad.

## Decisión profesional

Valores permitidos:

- Desescalamiento realizado
- Optimización diferente
- Mantener tratamiento
- No aplica

Toda decisión exige justificación. `registrar_decision_reevaluacion` toma el profesional de `auth.uid()` y registra la decisión. Un trigger cierra el hallazgo como `Resuelto` dentro de la misma transacción. No existe una decisión `Pendiente`: la ausencia de decisión se representa con el hallazgo `Abierto` o `En seguimiento`.

La intervención opcional debe pertenecer al mismo caso e IPS. La edición de una intervención actualiza su fila y sincroniza sus tratamientos sin eliminarla, de modo que las referencias históricas se conservan.

## Idempotencia

El hash usa información clínica estable: código de regla, identidad del tratamiento y catálogo antimicrobiano, clasificación AWaRe, fecha de inicio, pauta, terapia, evolución, catálogos de muestra/microorganismo, resultado y sensibilidad. Excluye identificadores técnicos de muestras/sensibilidades, nombres libres corregibles y timestamps de creación.

- El mismo contexto retorna el hallazgo ya existente, incluso si está resuelto.
- Un contexto clínico relevante diferente puede originar una nueva oportunidad.
- Correcciones de texto no estructural o recreación equivalente de filas no generan otra oportunidad.
- El índice parcial único refuerza `IPS + caso + tratamiento + regla + contexto_hash`.

## Seguridad

- Administrador: lectura y gestión global mediante los helpers 6D.1.
- Usuario INFECTOMAG: lectura y gestión solo en IPS asignadas.
- IPS Cliente: lectura en su IPS; no puede insertar decisiones ni modificar hallazgos.
- Las tablas nuevas tienen RLS. Las políticas comprueban la IPS del hallazgo padre y la relación caso/IPS de los tratamientos e intervenciones.
- El RPC es `SECURITY INVOKER`; no usa service role ni evita RLS.

## Integración

- Auditoría PROA: muestra contexto microbiológico y exige una decisión justificada para resolver oportunidades.
- Ronda: bloque compacto con acceso a la oportunidad; no agrega diligenciamiento obligatorio.
- Paciente/caso: historial longitudinal de oportunidades y decisiones.
- Administración: umbral nullable de DES-04.
- Indicadores: oportunidades abiertas, evaluadas, vinculadas a intervención y distribución de decisiones.

## Validación

Después de revisar y aplicar la migración en el ambiente autorizado:

```bash
npm run validate:6e3
```

Requiere las credenciales de prueba de Administrador, Usuario INFECTOMAG e IPS Cliente. El validador usa registros identificados con `VALIDACION-6E3`, reutiliza semillas existentes y cierra el caso de prueba al terminar. No elimina datos clínicos.

## Límites clínicos

- No selecciona tratamiento ni interpreta sensibilidad.
- No infiere equivalencias farmacológicas.
- No suspende tratamientos ni bloquea rondas.
- DES-04 no opera hasta que la IPS configure un umbral aprobado.
- La decisión profesional no reemplaza la intervención PROA; puede vincularla cuando ya existe.
