import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

for (const file of ['.env.validation.local', '.env.local']) {
  const path = resolve(process.cwd(), file)
  if (existsSync(path)) process.loadEnvFile(path)
}

const required = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'PROA_TEST_INFECTOMAG_EMAIL',
  'PROA_TEST_INFECTOMAG_PASSWORD',
  'PROA_TEST_CLIENT_EMAIL',
  'PROA_TEST_CLIENT_PASSWORD',
]
const missing = required.filter((key) => !process.env[key])
if (missing.length) {
  console.error(`Missing env vars for real EST-03B validation: ${missing.join(', ')}`)
  process.exit(1)
}

const expectedProject = 'taqwtptopgwbljmwcasv'
const url = process.env.VITE_SUPABASE_URL
if (!new URL(url).hostname.startsWith(`${expectedProject}.`)) {
  console.error('The configured Supabase URL is not the authorized development project.')
  process.exit(1)
}

const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const runToken = `VALIDACION-EST03B-${Date.now().toString(36).toUpperCase()}`
const newClient = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const ok = (label) => console.log(`✓ ${label}`)
const fail = (label, error) => {
  console.error(`✗ ${label}: ${error?.message ?? error}`)
  process.exit(1)
}

async function login(email, password, label) {
  const supabase = newClient()
  const auth = await supabase.auth.signInWithPassword({ email, password })
  if (auth.error) fail(`${label} login`, auth.error)
  const membership = await supabase
    .from('usuario_ips')
    .select('ips_id,rol,estado,ips:ips_id(id,nombre,estado)')
    .eq('usuario_id', auth.data.user.id)
    .eq('estado', 'Activo')
    .limit(1)
    .single()
  if (membership.error) fail(`${label} IPS`, membership.error)
  return { supabase, user: auth.data.user, membership: membership.data, ips: membership.data.ips }
}

async function countRows(supabase, table, filters) {
  let query = supabase.from(table).select('id', { count: 'exact', head: true })
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value)
  const result = await query
  if (result.error) fail(`Contar ${table}`, result.error)
  return result.count ?? 0
}

async function expectRejected(label, operation) {
  const result = await operation
  if (!result.error && (result.data?.length ?? 0) > 0) fail(label, 'La operación no autorizada modificó registros')
  ok(label)
}

async function startRound(ctx, patientId, caseId, serviceId, bed) {
  const result = await ctx.supabase.rpc('iniciar_ronda_proa', {
    p_ips_id: ctx.ips.id,
    p_paciente_id: patientId,
    p_caso_id: caseId,
    p_servicio_id: serviceId,
    p_cama: bed,
  })
  if (result.error) fail('Iniciar ronda EST-03B', result.error)
  return result.data
}

function payloadFor({ ctx, patient, caseRow, round, service, treatment, antimicrobial, interventionType, confirm = false, intervention, followUps = [] }) {
  return {
    round_id: round.id,
    ips_id: ctx.ips.id,
    patient_id: patient.id,
    case_id: caseRow.id,
    round: {
      service_id: service.id,
      bed: runToken,
      round_at: round.fecha_hora_ronda,
      assessment_type: round.tipo_valoracion,
      therapy_type: 'Empírica',
      clinical_evolution: 'Estable',
    },
    diagnoses: [{ code: 'A49.9', description: runToken, type: 'Principal' }],
    treatment_actions: [],
    treatment_assessment: treatment ? [{ treatment_id: treatment.id, indication: 'Infección en evaluación', therapy_type: 'Empírico' }] : [],
    no_antimicrobials_at_assessment: false,
    new_treatments: treatment ? [] : [{
      antimicrobial_id: antimicrobial.id,
      antimicrobial_name: antimicrobial.nombre,
      dose: '1', unit: 'g', frequency: 'cada 24 horas', route: 'IV',
      start_date: new Date().toISOString().slice(0, 10), planned_duration_days: '5',
      indication: 'Infección en evaluación', therapy_type: 'Empírico',
    }],
    microbiology: { status: 'No' },
    ...(intervention === undefined ? {} : {
      intervention: intervention ?? {
        has_intervention: true,
        intervention_type_id: interventionType.id,
        intervention_type: interventionType.nombre,
        treatment_ids: treatment ? [treatment.id] : [],
        origin: 'Valoración clínica',
        recommendation: 'Ajustar dosis',
        recommendation_description: runToken,
        therapeutic_action: 'Ajustar',
        acceptance: 'Pendiente',
        guideline_compliance: 'No evaluable',
        follow_up_required: true,
      },
    }),
    intervention_followups: followUps,
    note: { generated_text: runToken, final_text: `${runToken} final` },
    confirm,
  }
}

const operator = await login(process.env.PROA_TEST_INFECTOMAG_EMAIL, process.env.PROA_TEST_INFECTOMAG_PASSWORD, 'Usuario INFECTOMAG')
if (operator.membership.rol !== 'Usuario INFECTOMAG') fail('Rol operativo', `Rol inesperado: ${operator.membership.rol}`)
const clientUser = await login(process.env.PROA_TEST_CLIENT_EMAIL, process.env.PROA_TEST_CLIENT_PASSWORD, 'IPS Cliente')
if (clientUser.membership.rol !== 'IPS Cliente') fail('Rol cliente', `Rol inesperado: ${clientUser.membership.rol}`)
if (clientUser.ips.id === operator.ips.id) fail('Aislamiento Multi-IPS', 'Las cuentas de prueba deben pertenecer a IPS diferentes')
ok('Sesiones y roles de prueba')

const schema = await operator.supabase.from('mart_trazabilidad_terapeutica').select('intervencion_id').limit(1)
if (schema.error) fail('Migración EST-03B disponible', schema.error)

const [service, antimicrobial, interventionType] = await Promise.all([
  operator.supabase.from('servicios_ips').select('id,nombre').eq('ips_id', operator.ips.id).eq('estado', 'Activo').limit(1).single(),
  operator.supabase.from('catalogo_antimicrobianos').select('id,nombre').eq('estado', 'Activo').limit(1).single(),
  operator.supabase.from('catalogo_intervenciones').select('id,nombre').eq('estado', 'Activo').limit(1).single(),
])
for (const [label, result] of [['Servicio', service], ['Antimicrobiano', antimicrobial], ['Tipo intervención', interventionType]]) {
  if (result.error) fail(label, result.error)
}

const patientResult = await operator.supabase.from('pacientes').insert({
  ips_id: operator.ips.id,
  tipo_identificacion: 'CC',
  numero_identificacion: runToken.slice(0, 50),
  nombres: 'VALIDACION',
  apellidos: 'EST03B',
  sexo: 'No especificado',
}).select('*').single()
if (patientResult.error) fail('Crear paciente ficticio EST-03B', patientResult.error)
const patient = patientResult.data
const generatedCaseIds = []

const firstStart = await startRound(operator, patient.id, null, service.data.id, runToken)
const caseRow = firstStart.case
const firstRound = firstStart.round
generatedCaseIds.push(caseRow.id)

const immediateIntervention = {
  has_intervention: true,
  intervention_type_id: interventionType.data.id,
  intervention_type: interventionType.data.nombre,
  treatment_ids: [],
  origin: 'Valoración clínica',
  recommendation: 'Ajustar dosis',
  recommendation_description: `${runToken} inmediata`,
  therapeutic_action: 'Ajustar',
  decision: 'Aceptada',
  implementation_status: 'Implementación parcial',
  implementation_detail: 'Validación inmediata EST-03B',
  implementation_date: new Date().toISOString(),
  acceptance: 'Sí',
  guideline_compliance: 'No evaluable',
  follow_up_required: false,
}
let firstPayload = payloadFor({ ctx: operator, patient, caseRow, round: firstRound, service: service.data, antimicrobial: antimicrobial.data, interventionType: interventionType.data, intervention: immediateIntervention })
let saved = await operator.supabase.rpc('guardar_ronda_clinica_trazable', { p_payload: firstPayload })
if (saved.error) fail('Tratamiento, decisión e implementación inmediata', saved.error)

const treatmentResult = await operator.supabase.from('tratamientos_antimicrobianos').select('*').eq('ronda_id', firstRound.id).single()
if (treatmentResult.error) fail('Tratamiento inicial', treatmentResult.error)
const treatment = treatmentResult.data
firstPayload = payloadFor({ ctx: operator, patient, caseRow, round: firstRound, service: service.data, treatment, antimicrobial: antimicrobial.data, interventionType: interventionType.data, intervention: { ...immediateIntervention, treatment_ids: [treatment.id] } })
saved = await operator.supabase.rpc('guardar_ronda_clinica_trazable', { p_payload: firstPayload })
if (saved.error) fail('Vincular tratamiento valorado', saved.error)

const firstIntervention = await operator.supabase.from('intervenciones_proa').select('*').eq('ronda_id', firstRound.id).single()
if (firstIntervention.error) fail('Intervención inmediata', firstIntervention.error)
const immediateCounts = {
  assessments: await countRows(operator.supabase, 'tratamientos_valoracion', { ronda_id: firstRound.id }),
  decisions: await countRows(operator.supabase, 'decisiones_intervencion', { intervencion_id: firstIntervention.data.id, ronda_id: firstRound.id }),
  implementations: await countRows(operator.supabase, 'implementaciones_intervencion', { intervencion_id: firstIntervention.data.id, ronda_id: firstRound.id }),
}
if (immediateCounts.assessments !== 1 || immediateCounts.decisions !== 1 || immediateCounts.implementations !== 1) {
  fail('Trazabilidad inmediata', JSON.stringify(immediateCounts))
}
ok('Tratamiento inicial, decisión e implementación inmediata')

const retry = await operator.supabase.rpc('guardar_ronda_clinica_trazable', { p_payload: firstPayload })
if (retry.error) fail('Reintento idempotente', retry.error)
const retryCounts = {
  assessments: await countRows(operator.supabase, 'tratamientos_valoracion', { ronda_id: firstRound.id }),
  decisions: await countRows(operator.supabase, 'decisiones_intervencion', { intervencion_id: firstIntervention.data.id, ronda_id: firstRound.id }),
  implementations: await countRows(operator.supabase, 'implementaciones_intervencion', { intervencion_id: firstIntervention.data.id, ronda_id: firstRound.id }),
}
if (JSON.stringify(immediateCounts) !== JSON.stringify(retryCounts)) fail('Reintento idempotente', JSON.stringify(retryCounts))
ok('Reintento sin duplicados')

const failedPayload = structuredClone(firstPayload)
failedPayload.round.bed = `${runToken}-ROLLBACK`
failedPayload.treatment_assessment = [
  { treatment_id: treatment.id, indication: 'NO DEBE PERSISTIR', therapy_type: 'Dirigido' },
  { treatment_id: randomUUID(), indication: 'No persistir', therapy_type: 'Empírico' },
]
const treatmentBeforeFailure = await operator.supabase.from('tratamientos_antimicrobianos').select('indicacion_clinica,tipo_tratamiento').eq('id', treatment.id).single()
if (treatmentBeforeFailure.error) fail('Preparar prueba rollback', treatmentBeforeFailure.error)
const rejected = await operator.supabase.rpc('guardar_ronda_clinica_trazable', { p_payload: failedPayload })
if (!rejected.error) fail('Rollback transaccional', 'La RPC aceptó un tratamiento de otro contexto')
const roundAfterFailure = await operator.supabase.from('rondas_proa').select('cama').eq('id', firstRound.id).single()
const treatmentAfterFailure = await operator.supabase.from('tratamientos_antimicrobianos').select('indicacion_clinica,tipo_tratamiento').eq('id', treatment.id).single()
if (roundAfterFailure.error || treatmentAfterFailure.error
  || roundAfterFailure.data.cama === `${runToken}-ROLLBACK`
  || JSON.stringify(treatmentAfterFailure.data) !== JSON.stringify(treatmentBeforeFailure.data)) {
  fail('Rollback transaccional', roundAfterFailure.error ?? treatmentAfterFailure.error ?? 'Persistió el cambio parcial')
}
ok('Rollback completo ante fallo intermedio')

const confirmFirst = await operator.supabase.rpc('guardar_ronda_clinica_trazable', { p_payload: { ...firstPayload, confirm: true } })
if (confirmFirst.error) fail('Confirmar trazabilidad inmediata', confirmFirst.error)

await expectRejected('Instantánea confirmada inmutable', operator.supabase.from('tratamientos_valoracion').update({ indicacion_clinica: 'NO MODIFICAR' }).eq('ronda_id', firstRound.id).select('id'))
await expectRejected('Decisión confirmada inmutable', operator.supabase.from('decisiones_intervencion').update({ justificacion: 'NO MODIFICAR' }).eq('ronda_id', firstRound.id).select('id'))
await expectRejected('Implementación confirmada inmutable', operator.supabase.from('implementaciones_intervencion').update({ detalle: 'NO MODIFICAR' }).eq('ronda_id', firstRound.id).select('id'))
await expectRejected('Intervención confirmada inmutable', operator.supabase.from('intervenciones_proa').update({ descripcion_recomendacion: 'NO MODIFICAR' }).eq('id', firstIntervention.data.id).select('id'))

const secondStart = await startRound(operator, patient.id, caseRow.id, service.data.id, `${runToken}-2`)
const pendingPayload = payloadFor({ ctx: operator, patient, caseRow, round: secondStart.round, service: service.data, treatment, antimicrobial: antimicrobial.data, interventionType: interventionType.data, confirm: true, intervention: null })
const pendingSave = await operator.supabase.rpc('guardar_ronda_clinica_trazable', { p_payload: pendingPayload })
if (pendingSave.error) fail('Crear recomendación pendiente', pendingSave.error)
const pendingIntervention = await operator.supabase.from('intervenciones_proa').select('*').eq('ronda_id', secondStart.round.id).single()
if (pendingIntervention.error) fail('Consultar recomendación pendiente', pendingIntervention.error)

const thirdStart = await startRound(operator, patient.id, caseRow.id, service.data.id, `${runToken}-3`)
const followUp = [{
  intervention_id: pendingIntervention.data.id,
  decision: 'Parcialmente aceptada',
  decision_reason: 'Validación posterior EST-03B',
  implementation_status: 'Implementada',
  implementation_detail: 'Verificada en seguimiento',
  implementation_date: new Date().toISOString(),
  implemented_treatment_id: treatment.id,
}]
const followUpPayload = payloadFor({ ctx: operator, patient, caseRow, round: thirdStart.round, service: service.data, treatment, antimicrobial: antimicrobial.data, interventionType: interventionType.data, intervention: undefined, followUps: followUp })
for (let attempt = 0; attempt < 2; attempt += 1) {
  const result = await operator.supabase.rpc('guardar_ronda_clinica_trazable', { p_payload: followUpPayload })
  if (result.error) fail('Confirmación posterior idempotente', result.error)
}
const followUpCounts = {
  decisions: await countRows(operator.supabase, 'decisiones_intervencion', { intervencion_id: pendingIntervention.data.id, ronda_id: thirdStart.round.id }),
  implementations: await countRows(operator.supabase, 'implementaciones_intervencion', { intervencion_id: pendingIntervention.data.id, ronda_id: thirdStart.round.id }),
}
if (followUpCounts.decisions !== 1 || followUpCounts.implementations !== 1) fail('Confirmación posterior idempotente', JSON.stringify(followUpCounts))
const confirmFollowUp = await operator.supabase.rpc('guardar_ronda_clinica_trazable', { p_payload: { ...followUpPayload, confirm: true } })
if (confirmFollowUp.error) fail('Confirmar seguimiento posterior', confirmFollowUp.error)
ok('Confirmación posterior vinculada a la intervención original')

const clientTreatment = await clientUser.supabase.from('tratamientos_antimicrobianos').select('*').not('ronda_id', 'is', null).limit(1).maybeSingle()
if (clientTreatment.error || !clientTreatment.data) fail('Contexto cruzado de control', clientTreatment.error ?? 'No hay datos de control')

await expectRejected('Aislamiento Multi-IPS en relación directa', operator.supabase.from('tratamientos_valoracion').insert({
  ips_id: operator.ips.id,
  paciente_id: clientTreatment.data.paciente_id,
  caso_id: clientTreatment.data.caso_id,
  ronda_id: clientTreatment.data.ronda_id,
  tratamiento_id: clientTreatment.data.id,
  antimicrobiano: clientTreatment.data.antimicrobiano,
  estado_al_valorar: clientTreatment.data.estado,
}).select('id'))

await expectRejected('IPS Cliente no puede usar la RPC de escritura', clientUser.supabase.rpc('guardar_ronda_clinica_trazable', { p_payload: firstPayload }))
await expectRejected('IPS Cliente no puede insertar trazabilidad', clientUser.supabase.from('tratamientos_valoracion').insert({
  ips_id: clientTreatment.data.ips_id,
  paciente_id: clientTreatment.data.paciente_id,
  caso_id: clientTreatment.data.caso_id,
  ronda_id: clientTreatment.data.ronda_id,
  tratamiento_id: clientTreatment.data.id,
  antimicrobiano: clientTreatment.data.antimicrobiano,
  estado_al_valorar: clientTreatment.data.estado,
}).select('id'))

const cleanup = await operator.supabase.from('casos_proa').update({
  estado: 'Anulado',
  fecha_cierre: new Date().toISOString(),
  motivo_cierre: runToken,
}).eq('id', caseRow.id)
if (cleanup.error) fail('Anular caso ficticio EST-03B', cleanup.error)

await Promise.allSettled([operator.supabase.auth.signOut(), clientUser.supabase.auth.signOut()])
ok('Datos ficticios identificados y caso de prueba anulado')
console.log(`EST-03B validation completed for ${runToken}`)
