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

const log = (label, value = 'OK') => console.log(`✓ ${label}: ${value}`)
const fail = (label, error) => {
  console.error(`✗ ${label}`)
  console.error(error?.message ?? error)
  process.exitCode = 1
}

async function expectRejectedLogin() {
  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.PROA_TEST_EMAIL,
    password: `${process.env.PROA_TEST_PASSWORD}-invalid`,
  })
  if (!error) throw new Error('Invalid password was accepted')
}

async function getProfile(userId) {
  const result = await supabase.from('perfiles_usuario').select('*').eq('usuario_id', userId).maybeSingle()
  if (result.error) throw result.error
  return result.data
}

async function getAllowedIps(userId) {
  const joined = await supabase
    .from('usuario_ips')
    .select('ips:ips_id(id,nombre,nit,codigo_reps,estado)')
    .eq('usuario_id', userId)
    .eq('estado', 'Activo')

  if (joined.error) throw joined.error
  return (joined.data ?? [])
    .map((row) => (Array.isArray(row.ips) ? row.ips[0] : row.ips))
    .filter((ips) => ips?.estado === 'Activa')
}

async function findPatient(ipsId) {
  if (process.env.PROA_TEST_PATIENT_TYPE && process.env.PROA_TEST_PATIENT_NUMBER) {
    const result = await supabase
      .from('pacientes')
      .select('*')
      .eq('ips_id', ipsId)
      .eq('tipo_identificacion', process.env.PROA_TEST_PATIENT_TYPE)
      .eq('numero_identificacion', process.env.PROA_TEST_PATIENT_NUMBER)
      .maybeSingle()
    if (result.error) throw result.error
    return result.data
  }

  const result = await supabase.from('pacientes').select('*').eq('ips_id', ipsId).limit(1).maybeSingle()
  if (result.error) throw result.error
  return result.data
}

async function createCase(ipsId, patientId) {
  const result = await supabase
    .from('casos_proa')
    .insert({
      ips_id: ipsId,
      paciente_id: patientId,
      estado: 'Activo',
      fecha_apertura: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (result.error) throw result.error
  return result.data
}

async function createRound(ipsId, patientId, caseId, userId) {
  const now = new Date().toISOString()
  const payload = {
    ips_id: ipsId,
    paciente_id: patientId,
    caso_id: caseId,
    fecha_hora_ronda: now,
    tipo_valoracion: 'Primera valoración',
    estado: 'Borrador',
    profesional_id: userId,
  }
  const result = await supabase.from('rondas_proa').insert(payload).select('*').single()
  if (result.error) throw result.error
  return result.data
}

try {
  await expectRejectedLogin()
  log('login incorrecto rechazado')
} catch (error) {
  fail('login incorrecto', error)
}

const signIn = await supabase.auth.signInWithPassword({
  email: process.env.PROA_TEST_EMAIL,
  password: process.env.PROA_TEST_PASSWORD,
})
if (signIn.error) fail('login correcto', signIn.error)
else log('login correcto', signIn.data.user.id)

const userResult = await supabase.auth.getUser()
if (userResult.error || !userResult.data.user) fail('usuario autenticado', userResult.error ?? 'No user')
else log('usuario autenticado', userResult.data.user.id)

const userId = userResult.data.user.id

const profile = await getProfile(userId)
if (!profile) fail('perfil de usuario', 'No existe fila visible en perfiles_usuario')
else log('perfil de usuario', profile.nombre ?? profile.usuario_id)

const ips = await getAllowedIps(userId)
if (!ips.length) fail('IPS permitidas', 'No existen filas activas visibles en usuario_ips')
else log('IPS permitidas', ips.map((item) => item.nombre ?? item.id).join(', '))

const activeIps = ips[0]
const patient = await findPatient(activeIps.id)
if (!patient) fail('paciente visible', `No hay paciente visible en IPS ${activeIps.id}`)
else log('paciente visible', `${patient.tipo_identificacion} ${patient.numero_identificacion}`)

if (patient) {
  const cases = await supabase.from('casos_proa').select('*').eq('ips_id', activeIps.id).eq('paciente_id', patient.id)
  if (cases.error) fail('casos del paciente', cases.error)
  else log('casos del paciente', `${cases.data?.length ?? 0} caso(s)`)

  const latestRound = await supabase
    .from('rondas_proa')
    .select('*')
    .eq('ips_id', activeIps.id)
    .eq('paciente_id', patient.id)
    .limit(1)
  if (latestRound.error) fail('rondas del paciente', latestRound.error)
  else log('rondas del paciente', `${latestRound.data?.length ?? 0} fila(s) consultada(s)`)

  const treatments = await supabase.from('tratamientos_antimicrobianos').select('*').eq('paciente_id', patient.id).limit(5)
  if (treatments.error) fail('tratamientos del paciente', treatments.error)
  else log('tratamientos del paciente', `${treatments.data?.length ?? 0} fila(s) consultada(s)`)

  const caseCreated = await createCase(activeIps.id, patient.id)
  log('caso creado', caseCreated.id)

  const roundCreated = await createRound(activeIps.id, patient.id, caseCreated.id, userId)
  log('ronda borrador creada', roundCreated.id)

  const confirmRound = await supabase.from('rondas_proa').select('*').eq('id', roundCreated.id).maybeSingle()
  if (confirmRound.error || !confirmRound.data) fail('confirmación ronda', confirmRound.error ?? 'No visible after insert')
  else log('confirmación ronda', confirmRound.data.estado ?? 'visible')

  if (process.env.PROA_FORBIDDEN_IPS_ID) {
    const forbidden = await supabase
      .from('pacientes')
      .select('*')
      .eq('ips_id', process.env.PROA_FORBIDDEN_IPS_ID)
      .limit(1)
    if (forbidden.error) log('RLS consulta otra IPS bloqueada por error', forbidden.error.message)
    else if ((forbidden.data ?? []).length === 0) log('RLS consulta otra IPS sin filas visibles')
    else fail('RLS consulta otra IPS', `Se vieron ${forbidden.data.length} paciente(s) de otra IPS`)
  }

  if (process.env.PROA_FORBIDDEN_IPS_ID) {
    const forbiddenInsert = await supabase
      .from('casos_proa')
      .insert({
        ips_id: process.env.PROA_FORBIDDEN_IPS_ID,
        paciente_id: patient.id,
        estado: 'Activo',
        fecha_apertura: new Date().toISOString(),
      })
      .select('*')
      .single()
    if (forbiddenInsert.error) log('RLS insert otra IPS bloqueado', forbiddenInsert.error.message)
    else fail('RLS insert otra IPS', `Inserción cruzada permitida: ${forbiddenInsert.data.id}`)
  }
}

const signOut = await supabase.auth.signOut()
if (signOut.error) fail('logout', signOut.error)
else log('logout')
