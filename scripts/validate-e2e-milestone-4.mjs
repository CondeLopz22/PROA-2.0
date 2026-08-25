import { createClient } from '@supabase/supabase-js'

const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'PROA_TEST_EMAIL', 'PROA_TEST_PASSWORD']
const missing = required.filter((key) => !process.env[key])
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(', ')}`)
  process.exit(1)
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const ok = (label, value = 'OK') => console.log(`✓ ${label}: ${value}`)
const fail = (label, error) => {
  console.error(`✗ ${label}`)
  console.error(error?.message ?? error)
  process.exit(1)
}
const now = () => new Date().toISOString()
const today = () => new Date().toISOString().slice(0, 10)
const futurePeriod = () => {
  const date = new Date()
  date.setUTCMonth(date.getUTCMonth() + 2)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`
}
const close = (a, b, tolerance = 0.0001) => Math.abs(Number(a) - Number(b)) <= tolerance

async function first(table, label, query = supabase.from(table).select('*').limit(1).maybeSingle()) {
  const result = await query
  if (result.error || !result.data) fail(label, result.error ?? `${table} sin filas visibles`)
  ok(label, result.data.id ?? 'visible')
  return result.data
}

const signIn = await supabase.auth.signInWithPassword({
  email: process.env.PROA_TEST_EMAIL,
  password: process.env.PROA_TEST_PASSWORD,
})
if (signIn.error) fail('Login', signIn.error)
const userId = signIn.data.user.id
ok('Login', userId)

const memberships = await supabase
  .from('usuario_ips')
  .select('ips_id,rol,estado,ips:ips_id(id,nombre,estado)')
  .eq('usuario_id', userId)
  .eq('estado', 'Activo')
if (memberships.error) fail('IPS', memberships.error)
const ips =
  (memberships.data ?? [])
    .map((row) => ({ ...row.ips, rol: row.rol }))
    .filter((row) => row?.estado === 'Activa')
    .find((row) => row.nombre?.toUpperCase().includes('GESTION SALUD')) ?? memberships.data?.[0]?.ips
if (!ips) fail('IPS', 'Sin IPS activa visible')
ok('IPS', `${ips.nombre} (${ips.id})`)

const patient =
  (await supabase
    .from('pacientes')
    .select('*')
    .eq('ips_id', ips.id)
    .eq('numero_identificacion', 'VALIDACION-M4')
    .maybeSingle()).data ??
  (await supabase
    .from('pacientes')
    .insert({
      ips_id: ips.id,
      tipo_identificacion: 'CC',
      numero_identificacion: 'VALIDACION-M4',
      nombres: 'VALIDACION',
      apellidos: 'M4',
      sexo: 'No especificado',
    })
    .select('*')
    .single()).data
if (!patient) fail('Paciente', 'No fue posible crear o abrir paciente M4')
ok('Paciente', patient.id)

const service = await first(
  'servicios_ips',
  'Servicio',
  supabase.from('servicios_ips').select('*').eq('ips_id', ips.id).eq('estado', 'Activo').limit(1).maybeSingle(),
)
const antimicrobial = await first(
  'catalogo_antimicrobianos',
  'Antimicrobiano',
  supabase.from('catalogo_antimicrobianos').select('*').eq('estado', 'Activo').limit(1).maybeSingle(),
)
const oms = await first(
  'oms_ddd',
  'OMS DDD',
  supabase.from('oms_ddd').select('*').eq('antimicrobiano_id', antimicrobial.id).gt('ddd_oms', 0).limit(1).maybeSingle(),
)
const sampleType = await first('catalogo_tipos_muestra', 'Tipo muestra')
const organism = await first('catalogo_microorganismos', 'Microorganismo')
const interventionCatalog = await first('catalogo_intervenciones', 'Tipo intervención')

const caseResult = await supabase
  .from('casos_proa')
  .insert({
    ips_id: ips.id,
    paciente_id: patient.id,
    fecha_apertura: now(),
    estado: 'Activo',
    ubicacion_actual: 'VALIDACION-M4',
    cama_actual: 'M4-TEST',
  })
  .select('*')
  .single()
if (caseResult.error) fail('Caso', caseResult.error)
const caseRow = caseResult.data
ok('Caso', caseRow.id)

const roundResult = await supabase
  .from('rondas_proa')
  .insert({
    ips_id: ips.id,
    paciente_id: patient.id,
    caso_id: caseRow.id,
    servicio_id: service.id,
    fecha_hora_ronda: now(),
    cama: 'M4-TEST',
    profesional_id: userId,
    tipo_valoracion: 'Primera valoración',
    tipo_terapia: 'Dirigida',
    terapia_dirigida_por_microbiologia: true,
    evolucion_clinica: 'Estable',
    estado: 'Borrador',
  })
  .select('*')
  .single()
if (roundResult.error) fail('Ronda', roundResult.error)
const round = roundResult.data
ok('Ronda', round.id)

const diagnosis = await supabase
  .from('diagnosticos_ronda')
  .insert({
    ronda_id: round.id,
    codigo_cie10: 'J18.9',
    descripcion_cie10: 'VALIDACION-M4 Neumonía no especificada',
    tipo_diagnostico: 'Principal',
    categoria_proa: 'Validación',
  })
if (diagnosis.error) fail('Diagnóstico', diagnosis.error)
ok('Diagnóstico')

const treatment = await supabase
  .from('tratamientos_antimicrobianos')
  .insert({
    ips_id: ips.id,
    paciente_id: patient.id,
    caso_id: caseRow.id,
    ronda_id: round.id,
    antimicrobiano_id: antimicrobial.id,
    antimicrobiano: antimicrobial.nombre,
    dosis: 1,
    unidad: 'g',
    frecuencia: 'cada 8 h',
    via: oms.via,
    fecha_inicio: today(),
    estado: 'Activo',
  })
  .select('*')
  .single()
if (treatment.error) fail('Tratamiento', treatment.error)
ok('Tratamiento', treatment.data.id)

const micro = await supabase
  .from('microbiologia')
  .insert({
    ips_id: ips.id,
    caso_id: caseRow.id,
    ronda_id: round.id,
    tipo_muestra_id: sampleType.id,
    tipo_muestra: sampleType.nombre ?? 'VALIDACION-M4',
    fecha_toma: now(),
    fecha_resultado: now(),
    estado_resultado: 'Disponible',
    resultado_general: 'Positivo',
    microorganismo_id: organism.id,
    microorganismo: organism.nombre,
    tipo_germen: organism.tipo_germen ?? null,
    es_muestra_control: false,
    impacto_conducta: 'Sí',
  })
  .select('*')
  .single()
if (micro.error) fail('Microbiología', micro.error)
ok('Microbiología', micro.data.id)

const intervention = await supabase
  .from('intervenciones_proa')
  .insert({
    ips_id: ips.id,
    ronda_id: round.id,
    hubo_intervencion: true,
    tipo_intervencion_id: interventionCatalog.id,
    tipo_intervencion: interventionCatalog.nombre,
    origen_intervencion: 'Validación clínica',
    recomendacion: 'Validación M4',
    aceptacion: 'Sí',
    cumplimiento_guia: 'No evaluable',
    requiere_seguimiento: true,
    motivo_seguimiento: 'VALIDACION-M4',
  })
  .select('*')
  .single()
if (intervention.error) fail('Intervención', intervention.error)
ok('Intervención', intervention.data.id)

const relation = await supabase
  .from('intervencion_tratamiento')
  .insert({ intervencion_id: intervention.data.id, tratamiento_id: treatment.data.id })
if (relation.error) fail('Intervención-tratamiento', relation.error)

const generated = `## EVOLUCIÓN PROA\n\nVALIDACION-M4 ronda ${round.id}`
const note = await supabase
  .from('notas_proa')
  .insert({ ronda_id: round.id, texto_generado: generated, texto_final: `${generated}\n\nTexto final.`, version: 1 })
  .select('*')
  .single()
if (note.error) fail('Nota', note.error)
const confirmedAt = now()
const noteConfirm = await supabase
  .from('notas_proa')
  .update({ fecha_confirmacion: confirmedAt, usuario_confirma: userId })
  .eq('id', note.data.id)
if (noteConfirm.error) fail('Confirmar nota', noteConfirm.error)
const roundConfirm = await supabase
  .from('rondas_proa')
  .update({ estado: 'Confirmada', fecha_confirmacion: confirmedAt })
  .eq('id', round.id)
if (roundConfirm.error) fail('Confirmar ronda', roundConfirm.error)
ok('Nota y ronda confirmadas')

const period = futurePeriod()
let dddRecord = await supabase
  .from('ddd_registros')
  .select('*')
  .eq('ips_id', ips.id)
  .eq('servicio_id', service.id)
  .eq('periodo', period)
  .maybeSingle()
if (dddRecord.error) fail('Buscar DDD', dddRecord.error)
if (!dddRecord.data) {
  dddRecord = await supabase
    .from('ddd_registros')
    .insert({
      ips_id: ips.id,
      servicio_id: service.id,
      periodo: period,
      camas_disponibles: 100,
      camas_dia_ocupadas: 1000,
      usuario_registro: userId,
      estado: 'Borrador',
    })
    .select('*')
    .single()
  if (dddRecord.error) fail('Crear DDD', dddRecord.error)
}
ok('Registro DDD', dddRecord.data.id)

const dddConsumption = await supabase
  .from('ddd_consumos')
  .insert({
    registro_id: dddRecord.data.id,
    antimicrobiano_id: oms.antimicrobiano_id,
    via: oms.via,
    presentacion: 'VALIDACION-M4 1 g',
    concentracion: 1,
    unidad_concentracion: 'g',
    cantidad_consumida: 100,
    unidad_consumo: 'unidades',
    gramos_consumidos: 100,
  })
  .select('*')
  .single()
if (dddConsumption.error) fail('Consumo DDD', dddConsumption.error)
const dddReload = await supabase.from('ddd_consumos').select('*').eq('id', dddConsumption.data.id).single()
if (dddReload.error) fail('Recargar DDD', dddReload.error)
const expectedDdd = 100 / Number(oms.ddd_oms)
const expectedDdd100 = (expectedDdd / 1000) * 100
if (!close(dddReload.data.ddd_calculadas, expectedDdd)) fail('Cálculo DDD', `${dddReload.data.ddd_calculadas} != ${expectedDdd}`)
if (!close(dddReload.data.ddd_100_camas_dia, expectedDdd100)) {
  fail('Cálculo DDD/100 camas-día', `${dddReload.data.ddd_100_camas_dia} != ${expectedDdd100}`)
}
const dddConfirm = await supabase
  .from('ddd_registros')
  .update({ estado: 'Confirmado', fecha_confirmacion: now() })
  .eq('id', dddRecord.data.id)
if (dddConfirm.error) fail('Confirmar DDD', dddConfirm.error)
ok('DDD confirmado')

const martChecks = [
  ['mart_rondas_proa', 'ronda_id', round.id],
  ['mart_intervenciones_proa', 'intervencion_id', intervention.data.id],
  ['mart_microbiologia', 'muestra_id', micro.data.id],
  ['mart_ddd', 'consumo_id', dddConsumption.data.id],
]
for (const [view, field, value] of martChecks) {
  const result = await supabase.from(view).select(field, { count: 'exact', head: true }).eq(field, value)
  if (result.error) fail(`MART ${view}`, result.error)
  if (result.count !== 1) fail(`MART ${view}`, `conteo esperado 1, recibido ${result.count}`)
  ok(`MART ${view}`, '1 fila')
}

await supabase.auth.signOut()
ok('Logout')
