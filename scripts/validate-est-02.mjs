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
  'PROA_TEST_ADMIN_EMAIL',
  'PROA_TEST_ADMIN_PASSWORD',
  'PROA_TEST_INFECTOMAG_EMAIL',
  'PROA_TEST_INFECTOMAG_PASSWORD',
  'PROA_TEST_CLIENT_EMAIL',
  'PROA_TEST_CLIENT_PASSWORD',
]
const missing = required.filter((key) => !process.env[key])
if (missing.length) {
  console.error(`Missing env vars for real EST-02 validation: ${missing.join(', ')}`)
  process.exit(1)
}

const expectedProject = 'taqwtptopgwbljmwcasv'
const url = process.env.VITE_SUPABASE_URL
if (!new URL(url).hostname.startsWith(`${expectedProject}.`)) {
  console.error('The configured Supabase URL is not the authorized development project.')
  process.exit(1)
}

const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const runToken = `VALIDACION-EST02-${Date.now().toString(36).toUpperCase()}`
const newClient = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const ok = (label) => console.log(`✓ ${label}`)
const fail = (label, error) => {
  console.error(`✗ ${label}: ${error?.message ?? error}`)
  process.exit(1)
}
const expectError = (label, result, code) => {
  if (!result.error) fail(label, 'La operación no autorizada fue aceptada')
  if (code && !result.error.message.includes(code)) fail(label, `Error inesperado: ${result.error.message}`)
  ok(label)
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

async function createPatient(ctx, suffix) {
  const document = `${runToken}-${suffix}`.slice(0, 50)
  const result = await ctx.supabase.from('pacientes').insert({
    ips_id: ctx.ips.id,
    tipo_identificacion: 'CC',
    numero_identificacion: document,
    nombres: 'VALIDACION',
    apellidos: `EST02 ${suffix}`,
    sexo: 'No especificado',
  }).select('*').single()
  if (result.error) fail(`Crear paciente ${suffix}`, result.error)
  return result.data
}

async function startRound(ctx, patientId, caseId, serviceId, bed) {
  return ctx.supabase.rpc('iniciar_ronda_proa', {
    p_ips_id: ctx.ips.id,
    p_paciente_id: patientId,
    p_caso_id: caseId ?? null,
    p_servicio_id: serviceId ?? null,
    p_cama: bed ?? null,
  })
}

async function activeCaseCount(ctx, patientId) {
  const result = await ctx.supabase
    .from('casos_proa')
    .select('id', { count: 'exact', head: true })
    .eq('ips_id', ctx.ips.id)
    .eq('paciente_id', patientId)
    .eq('estado', 'Activo')
    .is('fecha_cierre', null)
  if (result.error) fail('Contar casos activos', result.error)
  return result.count ?? 0
}

async function draftCount(ctx, caseId) {
  const result = await ctx.supabase
    .from('rondas_proa')
    .select('id', { count: 'exact', head: true })
    .eq('caso_id', caseId)
    .eq('estado', 'Borrador')
  if (result.error) fail('Contar borradores', result.error)
  return result.count ?? 0
}

const operator = await login(
  process.env.PROA_TEST_INFECTOMAG_EMAIL,
  process.env.PROA_TEST_INFECTOMAG_PASSWORD,
  'Usuario INFECTOMAG',
)
if (operator.membership.rol !== 'Usuario INFECTOMAG') fail('Rol operativo', `Rol inesperado: ${operator.membership.rol}`)
ok('Login Usuario INFECTOMAG')

const service = await operator.supabase
  .from('servicios_ips')
  .select('id,nombre')
  .eq('ips_id', operator.ips.id)
  .eq('estado', 'Activo')
  .limit(1)
  .single()
if (service.error) fail('Servicio activo', service.error)

const generatedCaseIds = []
const primaryPatient = await createPatient(operator, 'PRINCIPAL')
const first = await startRound(operator, primaryPatient.id, null, service.data.id, `${runToken}-01`)
if (first.error) fail('Crear caso y primera valoración', first.error)
if (!first.data.case_created || first.data.draft_reused) fail('Crear caso y primera valoración', 'La RPC devolvió banderas inconsistentes')
if (first.data.round.tipo_valoracion !== 'Primera valoración') fail('Tipo primera valoración', first.data.round.tipo_valoracion)
generatedCaseIds.push(first.data.case.id)
ok('Creación atómica de caso y primera valoración')

const reused = await startRound(operator, primaryPatient.id, first.data.case.id, service.data.id, `${runToken}-02`)
if (reused.error) fail('Reutilizar borrador', reused.error)
if (!reused.data.draft_reused || reused.data.round.id !== first.data.round.id) fail('Reutilizar borrador', 'Se creó otra ronda')
if (await activeCaseCount(operator, primaryPatient.id) !== 1 || await draftCount(operator, first.data.case.id) !== 1) {
  fail('Idempotencia del borrador', 'El caso o el borrador se duplicaron')
}
ok('Reutilización idempotente del borrador')

const diagnosisMarker = `${runToken}-CASO-PRINCIPAL`
const diagnosis = await operator.supabase.from('diagnosticos_ronda').insert({
  ronda_id: first.data.round.id,
  codigo_cie10: 'A49.9',
  descripcion_cie10: diagnosisMarker,
  tipo_diagnostico: 'Principal',
}).select('id').single()
if (diagnosis.error) fail('Crear diagnóstico del caso', diagnosis.error)

const confirm = await operator.supabase.from('rondas_proa').update({
  estado: 'Confirmada',
  fecha_confirmacion: new Date().toISOString(),
}).eq('id', first.data.round.id)
if (confirm.error) fail('Confirmar primera ronda de prueba', confirm.error)

const followUp = await startRound(operator, primaryPatient.id, first.data.case.id, service.data.id, `${runToken}-03`)
if (followUp.error) fail('Crear seguimiento', followUp.error)
if (followUp.data.round.tipo_valoracion !== 'Seguimiento') fail('Tipo seguimiento', followUp.data.round.tipo_valoracion)
ok('Tipo de ronda determinado por el caso seleccionado')

const foreignPatient = await createPatient(operator, 'OTRO-CASO')
const foreign = await startRound(operator, foreignPatient.id, null, service.data.id, `${runToken}-04`)
if (foreign.error) fail('Crear caso de control', foreign.error)
generatedCaseIds.push(foreign.data.case.id)
const foreignMarker = `${runToken}-NO-HEREDAR`
const foreignDiagnosis = await operator.supabase.from('diagnosticos_ronda').insert({
  ronda_id: foreign.data.round.id,
  codigo_cie10: 'B99.9',
  descripcion_cie10: foreignMarker,
  tipo_diagnostico: 'Principal',
}).select('id').single()
if (foreignDiagnosis.error) fail('Crear diagnóstico de control', foreignDiagnosis.error)

const sameCaseRounds = await operator.supabase.from('rondas_proa').select('id').eq('caso_id', first.data.case.id)
if (sameCaseRounds.error) fail('Consultar rondas del caso', sameCaseRounds.error)
const sameCaseDiagnoses = await operator.supabase
  .from('diagnosticos_ronda')
  .select('descripcion_cie10')
  .in('ronda_id', sameCaseRounds.data.map((row) => row.id))
if (sameCaseDiagnoses.error) fail('Consultar diagnósticos del caso', sameCaseDiagnoses.error)
const descriptions = sameCaseDiagnoses.data.map((row) => row.descripcion_cie10)
if (!descriptions.includes(diagnosisMarker) || descriptions.includes(foreignMarker)) {
  fail('Aislamiento de diagnósticos por caso', 'Se mezclaron diagnósticos entre casos')
}
ok('Diagnósticos heredables exclusivamente desde el mismo caso')

const closeCase = await operator.supabase.from('casos_proa').update({
  estado: 'Cerrado',
  fecha_cierre: new Date().toISOString(),
  motivo_cierre: runToken,
}).eq('id', first.data.case.id)
if (closeCase.error) fail('Cerrar caso de prueba', closeCase.error)
expectError(
  'Bloqueo RPC de caso cerrado',
  await startRound(operator, primaryPatient.id, first.data.case.id, service.data.id, `${runToken}-05`),
  'EST02_CLOSED_CASE',
)
const directClosedRound = await operator.supabase.from('rondas_proa').insert({
  ips_id: operator.ips.id,
  paciente_id: primaryPatient.id,
  caso_id: first.data.case.id,
  servicio_id: service.data.id,
  profesional_id: operator.user.id,
  tipo_valoracion: 'Seguimiento',
  estado: 'Borrador',
  fecha_hora_ronda: new Date().toISOString(),
})
expectError('Bloqueo directo de ronda en caso cerrado', directClosedRound, 'EST02_CLOSED_CASE')

const concurrentPatient = await createPatient(operator, 'CONCURRENCIA')
const concurrentCalls = await Promise.all([
  startRound(operator, concurrentPatient.id, null, service.data.id, `${runToken}-A`),
  startRound(operator, concurrentPatient.id, null, service.data.id, `${runToken}-B`),
])
const successes = concurrentCalls.filter((result) => !result.error)
const failures = concurrentCalls.filter((result) => result.error)
if (successes.length !== 1 || failures.length !== 1 || !failures[0].error.message.includes('EST02_ACTIVE_CASE')) {
  fail('Concurrencia de caso activo', 'Se esperaba una creación y un rechazo EST02_ACTIVE_CASE')
}
generatedCaseIds.push(successes[0].data.case.id)
if (await activeCaseCount(operator, concurrentPatient.id) !== 1 || await draftCount(operator, successes[0].data.case.id) !== 1) {
  fail('Concurrencia de caso activo', 'La concurrencia dejó más de un caso o borrador')
}
ok('Solicitudes concurrentes dejan un único caso activo')

const admin = await login(
  process.env.PROA_TEST_ADMIN_EMAIL,
  process.env.PROA_TEST_ADMIN_PASSWORD,
  'Administrador',
)
ok('Login Administrador para auditoría histórica')
const activeCases = await admin.supabase
  .from('casos_proa')
  .select('id,paciente_id,ips_id')
  .eq('estado', 'Activo')
  .is('fecha_cierre', null)
  .limit(1000)
if (activeCases.error) fail('Consultar inconsistencias históricas', activeCases.error)
const grouped = new Map()
for (const row of activeCases.data) {
  const key = `${row.ips_id}:${row.paciente_id}`
  const current = grouped.get(key) ?? { ipsId: row.ips_id, patientId: row.paciente_id, ids: [] }
  current.ids.push(row.id)
  grouped.set(key, current)
}
const duplicatePatients = [...grouped.values()].filter(({ ids }) => ids.length > 1)
if (duplicatePatients.length < 2) fail('Casos activos históricos duplicados', `Se esperaban al menos 2 grupos; se encontraron ${duplicatePatients.length}`)
for (const { ipsId, patientId, ids } of duplicatePatients.slice(0, 2)) {
  const targetService = await admin.supabase
    .from('servicios_ips')
    .select('id')
    .eq('ips_id', ipsId)
    .eq('estado', 'Activo')
    .limit(1)
    .maybeSingle()
  if (targetService.error) fail('Servicio para caso histórico', targetService.error)
  const attempt = await admin.supabase.rpc('iniciar_ronda_proa', {
    p_ips_id: ipsId,
    p_paciente_id: patientId,
    p_caso_id: null,
    p_servicio_id: targetService.data?.id ?? null,
    p_cama: `${runToken}-HIST`,
  })
  expectError(`Bloqueo de inconsistencia histórica (${ids.length} casos activos)`, attempt, 'EST02_ACTIVE_CASE')
  const unchanged = await admin.supabase
    .from('casos_proa')
    .select('id', { count: 'exact', head: true })
    .eq('ips_id', ipsId)
    .eq('paciente_id', patientId)
    .eq('estado', 'Activo')
    .is('fecha_cierre', null)
  if (unchanged.error || unchanged.count !== ids.length) fail('Preservar inconsistencia histórica', unchanged.error ?? 'Cambió la cantidad de casos activos')
}

const clientUser = await login(
  process.env.PROA_TEST_CLIENT_EMAIL,
  process.env.PROA_TEST_CLIENT_PASSWORD,
  'IPS Cliente',
)
if (clientUser.membership.rol !== 'IPS Cliente') fail('Rol IPS Cliente', `Rol inesperado: ${clientUser.membership.rol}`)
const clientRpc = await clientUser.supabase.rpc('iniciar_ronda_proa', {
  p_ips_id: clientUser.ips.id,
  p_paciente_id: randomUUID(),
  p_caso_id: null,
  p_servicio_id: null,
  p_cama: runToken,
})
expectError('IPS Cliente no puede crear caso ni ronda', clientRpc, 'EST02_ACCESS')

const crossIps = await operator.supabase.rpc('iniciar_ronda_proa', {
  p_ips_id: clientUser.ips.id,
  p_paciente_id: randomUUID(),
  p_caso_id: null,
  p_servicio_id: null,
  p_cama: runToken,
})
expectError('Aislamiento Multi-IPS', crossIps, 'EST02_ACCESS')

const cleanup = await operator.supabase.from('casos_proa').update({
  estado: 'Anulado',
  fecha_cierre: new Date().toISOString(),
  motivo_cierre: runToken,
}).in('id', generatedCaseIds.filter((id) => id !== first.data.case.id))
if (cleanup.error) fail('Anular casos ficticios de validación', cleanup.error)
ok('Datos ficticios identificados y casos de prueba anulados')

await Promise.allSettled([operator.supabase.auth.signOut(), admin.supabase.auth.signOut(), clientUser.supabase.auth.signOut()])
console.log(`EST-02 validation completed for ${runToken}`)
