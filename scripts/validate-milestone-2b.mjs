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

async function firstFrom(table, label) {
  const result = await supabase.from(table).select('*').limit(1).maybeSingle()
  if (result.error || !result.data) fail(label, result.error ?? `${table} vacío`)
  return result.data
}

async function insertRound({ ips, patient, userId, suffix }) {
  const caseResult = await supabase
    .from('casos_proa')
    .insert({
      ips_id: ips.id,
      paciente_id: patient.id,
      fecha_apertura: now(),
      estado: 'Activo',
      ubicacion_actual: `Validación 2B ${suffix}`,
      cama_actual: `T-2B-${suffix}`,
    })
    .select('*')
    .single()
  if (caseResult.error) fail(`Crear caso ${suffix}`, caseResult.error)

  const roundResult = await supabase
    .from('rondas_proa')
    .insert({
      ips_id: ips.id,
      paciente_id: patient.id,
      caso_id: caseResult.data.id,
      fecha_hora_ronda: now(),
      ubicacion: `Validación 2B ${suffix}`,
      cama: `T-2B-${suffix}`,
      profesional_id: userId,
      tipo_valoracion: 'Primera valoración',
      tipo_terapia: 'Dirigida',
      evolucion_clinica: 'Estable',
      estado: 'Borrador',
    })
    .select('*')
    .single()
  if (roundResult.error) fail(`Crear ronda ${suffix}`, roundResult.error)
  return { caseRow: caseResult.data, round: roundResult.data }
}

async function insertTreatment({ ips, patient, caseRow, round, antimicrobial }) {
  const antimicrobialName =
    antimicrobial.nombre ?? antimicrobial.antimicrobiano ?? antimicrobial.descripcion ?? antimicrobial.codigo ?? antimicrobial.id
  const result = await supabase
    .from('tratamientos_antimicrobianos')
    .insert({
      ips_id: ips.id,
      paciente_id: patient.id,
      caso_id: caseRow.id,
      ronda_id: round.id,
      antimicrobiano_id: antimicrobial.id,
      antimicrobiano: antimicrobialName,
      dosis: 1,
      unidad: 'g',
      frecuencia: 'cada 8 h',
      via: 'IV',
      fecha_inicio: today(),
      duracion_prevista_dias: 7,
      estado: 'Activo',
    })
    .select('*')
    .single()
  if (result.error) fail('Tratamiento base', result.error)
  return result.data
}

async function replaceMicrobiology({ ips, patient, caseRow, round, sample, organism, antimicrobial, positive }) {
  const existing = await supabase.from('microbiologia').select('id').eq('ronda_id', round.id)
  if (existing.error) fail('Microbiología existente', existing.error)
  const ids = (existing.data ?? []).map((row) => row.id)
  if (ids.length) {
    const resistanceDelete = await supabase.from('resistencia_microbiologica').delete().in('microbiologia_id', ids)
    if (resistanceDelete.error) fail('Eliminar resistencias', resistanceDelete.error)
    const sensitivityDelete = await supabase.from('sensibilidad_microbiologica').delete().in('microbiologia_id', ids)
    if (sensitivityDelete.error) fail('Eliminar sensibilidades', sensitivityDelete.error)
    const microDelete = await supabase.from('microbiologia').delete().eq('ronda_id', round.id)
    if (microDelete.error) fail('Eliminar microbiología', microDelete.error)
  }

  const sampleName = sample.nombre ?? sample.descripcion ?? sample.codigo ?? sample.id
  const organismName = organism.nombre ?? organism.descripcion ?? organism.codigo ?? organism.id
  const antimicrobialName =
    antimicrobial.nombre ?? antimicrobial.antimicrobiano ?? antimicrobial.descripcion ?? antimicrobial.codigo ?? antimicrobial.id

  const micro = await supabase
    .from('microbiologia')
    .insert({
      ips_id: ips.id,
      paciente_id: patient.id,
      caso_id: caseRow.id,
      ronda_id: round.id,
      tipo_muestra_id: sample.id,
      tipo_muestra: sampleName,
      fecha_toma: now(),
      fecha_resultado: positive ? now() : null,
      estado_resultado: positive ? 'Disponible' : 'Pendiente',
      resultado_general: positive ? 'Positivo' : 'Negativo',
      microorganismo_id: positive ? organism.id : null,
      microorganismo: positive ? organismName : null,
      tipo_germen: positive ? organism.tipo_germen ?? null : null,
      es_muestra_control: false,
      impacto_conducta: positive ? 'Sí' : 'No',
    })
    .select('*')
    .single()
  if (micro.error) fail(positive ? 'Microbiología positiva' : 'Microbiología negativa', micro.error)

  if (positive) {
    const resistance = await supabase
      .from('resistencia_microbiologica')
      .insert({ microbiologia_id: micro.data.id, mecanismo: 'BLEE' })
      .select('*')
      .single()
    if (resistance.error) fail('Resistencia microbiológica', resistance.error)

    const sensitivity = await supabase
      .from('sensibilidad_microbiologica')
      .insert({
        microbiologia_id: micro.data.id,
        antimicrobiano_id: antimicrobial.id,
        antimicrobiano: antimicrobialName,
        resultado: 'Sensible',
      })
      .select('*')
      .single()
    if (sensitivity.error) fail('Sensibilidad microbiológica', sensitivity.error)
  }

  return micro.data
}

async function replaceIntervention({ ips, patient, caseRow, round, interventionCatalog, treatment, hubo, acceptance }) {
  const existing = await supabase.from('intervenciones_proa').select('id').eq('ronda_id', round.id)
  if (existing.error) fail('Intervenciones existentes', existing.error)
  const ids = (existing.data ?? []).map((row) => row.id)
  if (ids.length) {
    const relationDelete = await supabase.from('intervencion_tratamiento').delete().in('intervencion_id', ids)
    if (relationDelete.error) fail('Eliminar intervención_tratamiento', relationDelete.error)
    const interventionDelete = await supabase.from('intervenciones_proa').delete().eq('ronda_id', round.id)
    if (interventionDelete.error) fail('Eliminar intervención', interventionDelete.error)
  }

  const interventionName =
    interventionCatalog.nombre ?? interventionCatalog.descripcion ?? interventionCatalog.codigo ?? interventionCatalog.id
  const inserted = await supabase
    .from('intervenciones_proa')
    .insert({
      ips_id: ips.id,
      paciente_id: patient.id,
      caso_id: caseRow.id,
      ronda_id: round.id,
      hubo_intervencion: hubo,
      tipo_intervencion_id: hubo ? interventionCatalog.id : null,
      tipo_intervencion: hubo ? interventionName : null,
      motivo_no_intervencion: hubo ? null : 'Tratamiento adecuado',
      origen_intervencion: hubo ? 'Microbiología' : null,
      recomendacion: hubo ? 'Ajustar según microbiología' : null,
      descripcion_recomendacion: hubo ? 'Validación determinística Milestone 2B' : null,
      aceptacion: hubo ? acceptance : null,
      motivo_no_aceptacion: hubo && (acceptance === 'No' || acceptance === 'Parcialmente') ? 'Validación de motivo' : null,
      cumplimiento_guia: hubo ? 'No evaluable' : 'Cumple',
      dias_ahorrados: null,
      requiere_seguimiento: true,
      fecha_seguimiento: today(),
      motivo_seguimiento: 'Validación 2B',
    })
    .select('*')
    .single()
  if (inserted.error) fail(hubo ? `Intervención ${acceptance}` : 'No intervención', inserted.error)

  if (hubo) {
    const relation = await supabase
      .from('intervencion_tratamiento')
      .insert({ intervencion_id: inserted.data.id, tratamiento_id: treatment.id })
      .select('*')
      .single()
    if (relation.error) fail('intervencion_tratamiento', relation.error)
  }

  return inserted.data
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
if (memberships.error) fail('usuario_ips', memberships.error)
const allowedIps = (memberships.data ?? []).map((row) => ({ ...row.ips, rol: row.rol })).filter((ips) => ips?.estado === 'Activa')
const gestion =
  allowedIps.find((ips) => ips.nombre?.toUpperCase().includes('GESTION SALUD')) ??
  allowedIps.find((ips) => ips.id === process.env.PROA_TEST_IPS_ID) ??
  allowedIps[0]
if (!gestion) fail('IPS GESTION SALUD', 'No hay IPS activa asignada')
ok('IPS GESTION SALUD', `${gestion.nombre} (${gestion.id})`)

const patientResult = process.env.PROA_TEST_PATIENT_NUMBER
  ? await supabase
      .from('pacientes')
      .select('*')
      .eq('ips_id', gestion.id)
      .eq('tipo_identificacion', process.env.PROA_TEST_PATIENT_TYPE ?? 'CC')
      .eq('numero_identificacion', process.env.PROA_TEST_PATIENT_NUMBER)
      .maybeSingle()
  : await supabase.from('pacientes').select('*').eq('ips_id', gestion.id).limit(1).maybeSingle()
if (patientResult.error || !patientResult.data) fail('Paciente visible', patientResult.error ?? 'No patient')
const patient = patientResult.data
ok('Paciente visible', `${patient.tipo_identificacion} ${patient.numero_identificacion}`)

const sample = await firstFrom('catalogo_tipos_muestra', 'Catálogo tipos de muestra')
const organism = await firstFrom('catalogo_microorganismos', 'Catálogo microorganismos')
const antimicrobial = await firstFrom('catalogo_antimicrobianos', 'Catálogo antimicrobianos')
const interventionCatalog = await firstFrom('catalogo_intervenciones', 'Catálogo intervenciones')

const negative = await insertRound({ ips: gestion, patient, userId, suffix: 'NEG' })
await replaceMicrobiology({ ips: gestion, patient, caseRow: negative.caseRow, round: negative.round, sample, organism, antimicrobial, positive: false })
const negativeChildren = await supabase
  .from('microbiologia')
  .select('id')
  .eq('ronda_id', negative.round.id)
  .single()
if (negativeChildren.error) fail('Microbiología negativa persistida', negativeChildren.error)
const negativeResistanceCount = await supabase
  .from('resistencia_microbiologica')
  .select('id', { count: 'exact', head: true })
  .eq('microbiologia_id', negativeChildren.data.id)
const negativeSensitivityCount = await supabase
  .from('sensibilidad_microbiologica')
  .select('id', { count: 'exact', head: true })
  .eq('microbiologia_id', negativeChildren.data.id)
if (negativeResistanceCount.error || negativeSensitivityCount.error) {
  fail('Microbiología negativa sin hijos innecesarios', negativeResistanceCount.error ?? negativeSensitivityCount.error)
}
if (negativeResistanceCount.count || negativeSensitivityCount.count) {
  fail('Microbiología negativa sin hijos innecesarios', 'Se crearon resistencias o sensibilidades para resultado negativo')
}
ok('A. Microbiología negativa')

const positive = await insertRound({ ips: gestion, patient, userId, suffix: 'POS' })
const treatment = await insertTreatment({ ips: gestion, patient, caseRow: positive.caseRow, round: positive.round, antimicrobial })
await replaceMicrobiology({ ips: gestion, patient, caseRow: positive.caseRow, round: positive.round, sample, organism, antimicrobial, positive: true })
const positiveReload = await supabase
  .from('microbiologia')
  .select('id,microorganismo')
  .eq('ronda_id', positive.round.id)
  .single()
if (positiveReload.error) fail('Microbiología positiva persistida', positiveReload.error)
const positiveResistanceCount = await supabase
  .from('resistencia_microbiologica')
  .select('id', { count: 'exact', head: true })
  .eq('microbiologia_id', positiveReload.data.id)
const positiveSensitivityCount = await supabase
  .from('sensibilidad_microbiologica')
  .select('id', { count: 'exact', head: true })
  .eq('microbiologia_id', positiveReload.data.id)
if (positiveResistanceCount.error || positiveSensitivityCount.error) {
  fail('Microbiología positiva completa', positiveResistanceCount.error ?? positiveSensitivityCount.error)
}
if (!positiveReload.data.microorganismo || !positiveResistanceCount.count || !positiveSensitivityCount.count) {
  fail('Microbiología positiva completa', 'Falta microorganismo, resistencia o sensibilidad')
}
ok('B. Microbiología positiva')

await replaceIntervention({
  ips: gestion,
  patient,
  caseRow: positive.caseRow,
  round: positive.round,
  interventionCatalog,
  treatment,
  hubo: true,
  acceptance: 'Sí',
})
const relationCount = await supabase
  .from('intervencion_tratamiento')
  .select('tratamiento_id', { count: 'exact', head: true })
  .eq('tratamiento_id', treatment.id)
if (relationCount.error) fail('Relación intervención-tratamiento', relationCount.error)
if (!relationCount.count) fail('Relación intervención-tratamiento', 'No se creó relación')
ok('C. Intervención relacionada con tratamiento')

const noIntervention = await insertRound({ ips: gestion, patient, userId, suffix: 'NOINT' })
const noInterventionTreatment = await insertTreatment({
  ips: gestion,
  patient,
  caseRow: noIntervention.caseRow,
  round: noIntervention.round,
  antimicrobial,
})
await replaceIntervention({
  ips: gestion,
  patient,
  caseRow: noIntervention.caseRow,
  round: noIntervention.round,
  interventionCatalog,
  treatment: noInterventionTreatment,
  hubo: false,
  acceptance: 'Pendiente',
})
ok('D. No intervención')

for (const acceptance of ['Sí', 'No', 'Parcialmente', 'Pendiente']) {
  await replaceIntervention({
    ips: gestion,
    patient,
    caseRow: positive.caseRow,
    round: positive.round,
    interventionCatalog,
    treatment,
    hubo: true,
    acceptance,
  })
}
ok('E. Aceptación Sí/No/Parcialmente/Pendiente')

const generatedText = [
  '## EVOLUCIÓN PROA',
  `Paciente: ${patient.nombres ?? ''} ${patient.apellidos ?? ''}`.trim(),
  'Microbiología positiva registrada.',
  'Intervención PROA registrada.',
].join('\n\n')
const finalText = `${generatedText}\n\nEdición manual validada.`
const note = await supabase
  .from('notas_proa')
  .insert({ ronda_id: positive.round.id, texto_generado: generatedText, texto_final: finalText, version: 1 })
  .select('*')
  .single()
if (note.error) fail('Nota PROA', note.error)
if (note.data.texto_generado === note.data.texto_final) fail('Texto generado/final independientes', 'Los textos quedaron iguales')
ok('F. Nota generada y editada')

const confirmationTime = now()
const noteConfirm = await supabase
  .from('notas_proa')
  .update({ fecha_confirmacion: confirmationTime, usuario_confirma: userId })
  .eq('id', note.data.id)
  .select('*')
  .single()
if (noteConfirm.error) fail('Confirmar nota', noteConfirm.error)
const roundConfirm = await supabase
  .from('rondas_proa')
  .update({ estado: 'Confirmada', fecha_confirmacion: confirmationTime })
  .eq('id', positive.round.id)
  .select('id,estado,fecha_confirmacion')
  .single()
if (roundConfirm.error) fail('Confirmar ronda', roundConfirm.error)
if (roundConfirm.data.estado !== 'Confirmada' || !roundConfirm.data.fecha_confirmacion || !noteConfirm.data.usuario_confirma) {
  fail('Confirmación persistida', 'Falta estado, fecha o usuario confirmante')
}
ok('G. Confirmación de ronda')

const duplicateRound = await insertRound({ ips: gestion, patient, userId, suffix: 'DUP' })
const duplicateTreatment = await insertTreatment({
  ips: gestion,
  patient,
  caseRow: duplicateRound.caseRow,
  round: duplicateRound.round,
  antimicrobial,
})
await replaceMicrobiology({
  ips: gestion,
  patient,
  caseRow: duplicateRound.caseRow,
  round: duplicateRound.round,
  sample,
  organism,
  antimicrobial,
  positive: true,
})
await replaceIntervention({
  ips: gestion,
  patient,
  caseRow: duplicateRound.caseRow,
  round: duplicateRound.round,
  interventionCatalog,
  treatment: duplicateTreatment,
  hubo: true,
  acceptance: 'Pendiente',
})
await replaceMicrobiology({
  ips: gestion,
  patient,
  caseRow: duplicateRound.caseRow,
  round: duplicateRound.round,
  sample,
  organism,
  antimicrobial,
  positive: true,
})
await replaceIntervention({
  ips: gestion,
  patient,
  caseRow: duplicateRound.caseRow,
  round: duplicateRound.round,
  interventionCatalog,
  treatment: duplicateTreatment,
  hubo: true,
  acceptance: 'Pendiente',
})
const duplicateMicroCount = await supabase
  .from('microbiologia')
  .select('id', { count: 'exact', head: true })
  .eq('ronda_id', duplicateRound.round.id)
const duplicateInterventionCount = await supabase
  .from('intervenciones_proa')
  .select('id', { count: 'exact', head: true })
  .eq('ronda_id', duplicateRound.round.id)
const duplicateRelationCount = await supabase
  .from('intervencion_tratamiento')
  .select('tratamiento_id', { count: 'exact', head: true })
  .eq('tratamiento_id', duplicateTreatment.id)
if (duplicateMicroCount.error || duplicateInterventionCount.error || duplicateRelationCount.error) {
  fail('H. Conteo duplicados', duplicateMicroCount.error ?? duplicateInterventionCount.error ?? duplicateRelationCount.error)
}
if (duplicateMicroCount.count !== 1 || duplicateInterventionCount.count !== 1 || duplicateRelationCount.count !== 1) {
  fail(
    'H. Sin duplicados',
    `micro=${duplicateMicroCount.count}, intervenciones=${duplicateInterventionCount.count}, relaciones=${duplicateRelationCount.count}`,
  )
}
ok('H. Reabrir/guardar sin duplicados')

let forbiddenIpsId = process.env.PROA_FORBIDDEN_IPS_ID
if (!forbiddenIpsId) {
  const hujmb = await supabase.from('ips').select('id,nombre').ilike('nombre', '%HUJMB%').neq('id', gestion.id).limit(1).maybeSingle()
  if (!hujmb.error && hujmb.data) forbiddenIpsId = hujmb.data.id
}
if (forbiddenIpsId) {
  const forbidden = await supabase.from('pacientes').select('id').eq('ips_id', forbiddenIpsId).limit(1)
  if (forbidden.error) ok('RLS HUJMB bloqueado por error', forbidden.error.message)
  else if (!forbidden.data?.length) ok('RLS HUJMB sin filas visibles')
  else fail('RLS HUJMB', `Se vieron ${forbidden.data.length} paciente(s) de HUJMB`)
} else {
  ok('RLS HUJMB', 'Sin PROA_FORBIDDEN_IPS_ID ni IPS HUJMB visible para probar')
}

await supabase.auth.signOut()
ok('Logout')
