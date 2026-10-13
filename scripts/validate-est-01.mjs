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
  console.error(`Missing env vars for real EST-01 validation: ${missing.join(', ')}`)
  process.exit(1)
}

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const runToken = `VALIDACION-EST01-${Date.now().toString(36)}`
const ok = (label) => console.log(`✓ ${label}`)
const fail = (label, error) => {
  console.error(`✗ ${label}: ${error?.message ?? error}`)
  process.exit(1)
}
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function login(email, password, label) {
  const supabase = client()
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

async function countRows(supabase, table, column, value) {
  const result = await supabase.from(table).select('id', { count: 'exact', head: true }).eq(column, value)
  if (result.error) fail(`Contar ${table}`, result.error)
  return result.count ?? 0
}

async function snapshot(supabase, roundId) {
  const micro = await supabase.from('microbiologia').select('id').eq('ronda_id', roundId)
  if (micro.error) fail('Consultar microbiología', micro.error)
  const microIds = (micro.data ?? []).map((row) => row.id)
  const childCount = async (table) => {
    if (!microIds.length) return 0
    const result = await supabase.from(table).select('id', { count: 'exact', head: true }).in('muestra_id', microIds)
    if (result.error) fail(`Contar ${table}`, result.error)
    return result.count ?? 0
  }
  return {
    diagnoses: await countRows(supabase, 'diagnosticos_ronda', 'ronda_id', roundId),
    treatments: await countRows(supabase, 'tratamientos_antimicrobianos', 'ronda_id', roundId),
    history: await countRows(supabase, 'historial_tratamiento', 'ronda_id', roundId),
    microbiology: microIds.length,
    resistances: await childCount('resistencia_microbiologica'),
    sensitivities: await childCount('sensibilidad_microbiologica'),
    interventions: await countRows(supabase, 'intervenciones_proa', 'ronda_id', roundId),
    notes: await countRows(supabase, 'notas_proa', 'ronda_id', roundId),
  }
}

const operator = await login(
  process.env.PROA_TEST_INFECTOMAG_EMAIL,
  process.env.PROA_TEST_INFECTOMAG_PASSWORD,
  'Usuario INFECTOMAG',
)
if (operator.membership.rol !== 'Usuario INFECTOMAG') fail('Rol operativo', `Rol inesperado: ${operator.membership.rol}`)
ok('Login Usuario INFECTOMAG')

const service = await operator.supabase.from('servicios_ips').select('id,nombre').eq('ips_id', operator.ips.id).eq('estado', 'Activo').limit(1).single()
if (service.error) fail('Servicio activo', service.error)
const antimicrobial = await operator.supabase.from('catalogo_antimicrobianos').select('id,nombre,aware_categoria').eq('estado', 'Activo').limit(1).single()
if (antimicrobial.error) fail('Antimicrobiano activo', antimicrobial.error)

const document = runToken.slice(0, 50)
const patient = await operator.supabase.from('pacientes').insert({
  ips_id: operator.ips.id,
  tipo_identificacion: 'CC',
  numero_identificacion: document,
  nombres: 'VALIDACION',
  apellidos: 'EST01',
  sexo: 'No especificado',
}).select('*').single()
if (patient.error) fail('Crear paciente aislado', patient.error)

const initial = await operator.supabase.rpc('iniciar_ronda_proa', {
  p_ips_id: operator.ips.id,
  p_paciente_id: patient.data.id,
  p_caso_id: null,
  p_servicio_id: service.data.id,
  p_cama: runToken,
})
if (initial.error) fail('Crear caso y ronda anterior', initial.error)
const caseRow = initial.data.case
const previousRound = { data: initial.data.round }
const previousDiagnosis = await operator.supabase.from('diagnosticos_ronda').insert({
  ronda_id: previousRound.data.id,
  codigo_cie10: 'Z71.1',
  descripcion_cie10: runToken,
  tipo_diagnostico: 'Principal',
}).select('*').single()
if (previousDiagnosis.error) fail('Crear diagnóstico anterior', previousDiagnosis.error)

const confirmedPrevious = await operator.supabase.from('rondas_proa').update({
  estado: 'Confirmada',
  fecha_confirmacion: new Date().toISOString(),
}).eq('id', previousRound.data.id)
if (confirmedPrevious.error) fail('Confirmar ronda anterior', confirmedPrevious.error)

const startedRound = await operator.supabase.rpc('iniciar_ronda_proa', {
  p_ips_id: operator.ips.id,
  p_paciente_id: patient.data.id,
  p_caso_id: caseRow.id,
  p_servicio_id: service.data.id,
  p_cama: runToken,
})
if (startedRound.error) fail('Crear ronda objetivo', startedRound.error)
const round = { data: startedRound.data.round }

const payload = {
  round_id: round.data.id,
  ips_id: operator.ips.id,
  patient_id: patient.data.id,
  case_id: caseRow.id,
  round: {
    service_id: service.data.id,
    bed: runToken,
    round_at: round.data.fecha_hora_ronda,
    assessment_type: 'Seguimiento',
    therapy_type: 'Empírica',
    clinical_evolution: 'Estable',
  },
  diagnoses: [{ code: 'A49.9', description: runToken, type: 'Principal' }],
  treatment_actions: [],
  new_treatments: [{
    antimicrobial_id: antimicrobial.data.id,
    antimicrobial_name: antimicrobial.data.nombre,
    dose: '1',
    unit: 'g',
    frequency: 'cada 24 horas',
    route: 'IV',
    start_date: new Date().toISOString().slice(0, 10),
    planned_duration_days: '5',
  }],
  microbiology: {
    status: 'Sí',
    sample_type: runToken,
    sampled_at: new Date().toISOString(),
    result_at: new Date().toISOString(),
    general_result: 'Negativo',
    is_control_sample: false,
    resistances: [],
    sensitivities: [],
  },
  intervention: {
    has_intervention: false,
    no_intervention_reason: 'Otro',
    no_intervention_description: runToken,
    treatment_ids: [],
    guideline_compliance: 'No evaluable',
    follow_up_required: false,
  },
  note: { generated_text: runToken, final_text: `${runToken} final` },
  confirm: false,
}

const saved = await operator.supabase.rpc('guardar_ronda_clinica', { p_payload: payload })
if (saved.error) fail('Guardado completo', saved.error)
ok('Guardado completo exitoso')
const firstSnapshot = await snapshot(operator.supabase, round.data.id)

const retried = await operator.supabase.rpc('guardar_ronda_clinica', { p_payload: payload })
if (retried.error) fail('Reintento', retried.error)
const retrySnapshot = await snapshot(operator.supabase, round.data.id)
if (JSON.stringify(firstSnapshot) !== JSON.stringify(retrySnapshot)) fail('Reintento idempotente', `${JSON.stringify(firstSnapshot)} -> ${JSON.stringify(retrySnapshot)}`)
ok('Reintento sin duplicados')

const failedPayload = structuredClone(payload)
failedPayload.round.bed = `${runToken}-NO-DEBE-PERSISTIR`
failedPayload.diagnoses = [{ code: 'B99.9', description: 'Debe revertirse', type: 'Principal' }]
failedPayload.intervention = {
  has_intervention: true,
  intervention_type: 'Validación rollback',
  treatment_ids: [randomUUID()],
  follow_up_required: false,
}
const rejected = await operator.supabase.rpc('guardar_ronda_clinica', { p_payload: failedPayload })
if (!rejected.error) fail('Fallo intermedio', 'La RPC aceptó una relación de tratamiento inválida')
const afterFailure = await snapshot(operator.supabase, round.data.id)
const roundAfterFailure = await operator.supabase.from('rondas_proa').select('cama').eq('id', round.data.id).single()
if (roundAfterFailure.error) fail('Verificar rollback', roundAfterFailure.error)
if (JSON.stringify(firstSnapshot) !== JSON.stringify(afterFailure) || roundAfterFailure.data.cama !== runToken) {
  fail('Rollback total', 'Persistieron cambios de la operación rechazada')
}
ok('Rollback total ante fallo intermedio')

const preserved = await operator.supabase.from('diagnosticos_ronda').select('id').eq('id', previousDiagnosis.data.id).maybeSingle()
if (preserved.error || !preserved.data) fail('Diagnóstico anterior', preserved.error ?? 'Fue eliminado')
ok('Conservación de diagnósticos anteriores')

const clientUser = await login(
  process.env.PROA_TEST_CLIENT_EMAIL,
  process.env.PROA_TEST_CLIENT_PASSWORD,
  'IPS Cliente',
)
const clientWrite = await clientUser.supabase.rpc('guardar_ronda_clinica', { p_payload: payload })
if (!clientWrite.error) fail('IPS Cliente read-only', 'La escritura fue aceptada')
ok('IPS Cliente sin permisos de escritura')

const crossIpsPayload = { ...payload, ips_id: randomUUID() }
const crossIps = await operator.supabase.rpc('guardar_ronda_clinica', { p_payload: crossIpsPayload })
if (!crossIps.error) fail('Aislamiento Multi-IPS', 'La RPC aceptó una IPS distinta')
ok('Aislamiento Multi-IPS')

const audit = await operator.supabase.from('hallazgos_auditoria').select('id', { count: 'exact', head: true }).eq('caso_id', caseRow.id)
if (audit.error) fail('Compatibilidad auditoría PROA', audit.error)
const ddd = await operator.supabase.from('mart_ddd').select('consumo_id,aware_categoria').eq('ips_id', operator.ips.id).limit(1)
if (ddd.error) fail('Regresión DDD/AWaRe', ddd.error)
ok('Compatibilidad con auditoría PROA y 6E.3')
ok('Regresión DDD/AWaRe')

const cleanup = await operator.supabase.from('casos_proa').update({
  estado: 'Anulado',
  fecha_cierre: new Date().toISOString(),
  motivo_cierre: runToken,
}).eq('id', caseRow.id)
if (cleanup.error) fail('Anular caso ficticio EST-01', cleanup.error)

await Promise.allSettled([
  operator.supabase.auth.signOut(),
  clientUser.supabase.auth.signOut(),
])
console.log(`EST-01 validation completed for ${runToken}`)
