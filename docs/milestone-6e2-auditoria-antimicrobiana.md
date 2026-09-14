# Milestone 6E.2 - Auditoria antimicrobiana

## Alcance

Milestone 6E.2 agrega una capa deterministica de auditoria antimicrobiana para detectar condiciones que requieren revision por el equipo PROA. No usa IA, no interpreta antibiogramas, no recomienda tratamientos y no afirma que una conducta sea incorrecta.

Unidad principal:

`tratamiento_antimicrobiano` dentro de un `caso_proa`.

## Migracion propuesta

Archivo:

`supabase/migrations/20260914100000_milestone_6e2_antimicrobial_audit.sql`

No fue aplicada a Supabase real.

## Tablas propuestas

### configuracion_auditoria_proa

Configuracion por IPS.

- `ips_id`
- `umbral_tratamiento_prolongado_dias`, default 5
- `umbral_profilaxis_prolongada_dias`, nullable
- `umbral_seguimiento_vencido_dias`, nullable
- `umbral_microbiologia_pendiente_dias`, nullable

Una regla dependiente de un umbral nullable no debe generar hallazgos.

### reglas_auditoria_proa

Catalogo simple de reglas.

- `codigo_regla`
- `tipo_hallazgo`
- `categoria`
- `severidad`
- `activa`
- `parametro_umbral`
- `descripcion`

No es un motor generico complejo. Es una parametrizacion mantenible para el MVP.

### hallazgos_auditoria

Hallazgos trazables.

- `ips_id`
- `caso_id`
- `tratamiento_id`
- `ronda_detectada_id`
- `codigo_regla`
- `tipo_hallazgo`
- `categoria`
- `severidad`
- `estado`
- `descripcion`
- `origen`
- `intervencion_id`
- `fecha_resolucion`
- `motivo_descarte`

Estados:

- `Abierto`
- `En seguimiento`
- `Resuelto`
- `Descartado`

Origen:

- `Automático`
- `Profesional PROA`

Severidad:

- `Informativo`
- `Revisión`
- `Prioritario`

Los hallazgos no se eliminan fisicamente como mecanismo normal.

## Idempotencia

La migracion propone un indice unico parcial:

`ips_id + caso_id + tratamiento_id + codigo_regla`

solo para estados:

- `Abierto`
- `En seguimiento`

Esto evita duplicados abiertos para la misma condicion. Si un hallazgo se resolvio o descarto y la condicion reaparece, puede existir un nuevo hallazgo futuro.

## Reglas MVP

Activas:

- `AUD-01`: tratamiento activo sin indicacion infecciosa documentada.
- `AUD-02`: tratamiento activo sin fecha de inicio.
- `AUD-03`: tratamiento prolongado con umbral configurable, default 5 dias.
- `AUD-05`: microbiologia disponible mientras terapia sigue registrada como empirica.
- `AUD-07`: antimicrobiano AWaRe Reserve activo.
- `AUD-08`: Reserve activo sin intervencion PROA visible.
- `AUD-09`: duplicidad activa evidente de antimicrobianos identicos.
- `AUD-11`: intervencion pendiente de aceptacion.
- `AUD-12`: intervencion no aceptada/parcial con seguimiento.

Preparadas pero inactivas hasta definir umbral:

- `AUD-04`: profilaxis prolongada.
- `AUD-06`: microbiologia pendiente durante seguimiento.
- `AUD-10`: tratamiento activo sin seguimiento reciente.

## Integracion AWaRe

`AUD-07` y `AUD-08` usan `catalogo_antimicrobianos.aware_categoria`.

`No aplica` y `Sin clasificar` no generan `AUD-07`.

## Integracion con intervenciones

Un hallazgo puede vincular `intervencion_id`.

En la ronda, si ya existe una intervencion guardada, el profesional puede vincular el hallazgo a esa intervencion sin volver a registrar la informacion.

Crear una intervencion nueva se mantiene dentro del bloque Intervencion PROA aprobado en Milestone 2B/6A.

## RLS

La migracion reutiliza el modelo 6D.1:

- `puede_leer_ips(ips_id)` para lectura de configuracion/hallazgos.
- `puede_escribir_operacion_ips(ips_id)` para crear/actualizar hallazgos.
- `puede_administrar_proa()` para modificar configuracion y reglas.

IPS Cliente queda solo lectura.

## MART

Se crea:

`mart_auditoria_proa`

con:

- `security_invoker = true`
- una fila por hallazgo
- relacion con IPS, caso, paciente, tratamiento, ronda, servicio, antimicrobiano, AWaRe e intervencion.

## UX

Integraciones:

- Cockpit: KPIs de hallazgos abiertos y prioritarios, filtro operacional y matriz de auditoria.
- Ronda PROA: bloque compacto de auditoria.
- Administracion: parametros y reglas dentro de Configuracion PROA.
- Indicadores: seccion Auditoria antimicrobiana.

## Validacion

Despues de aplicar las migraciones 6E.1 y 6E.2:

```bash
npm run validate:6e2
```

El validador requiere credenciales reales de Administrador, Usuario INFECTOMAG e IPS Cliente mediante variables de entorno. No usa service role.

## Limitaciones clinicas

- No evalua dosis renal, alergias, interacciones, peso ni funcion hepatica.
- No interpreta espectro antimicrobiano.
- No interpreta antibiogramas completos.
- No recomienda desescalar, escalar o suspender.
- No corrige datos historicos.
