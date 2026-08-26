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
const close = (a, b, tolerance = 0.0001) => Math.abs(Number(a ?? 0) - Number(b ?? 0)) <= tolerance

function normalizeAntimicrobialName(value) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function isDuplicate(treatment, candidate) {
  if (treatment.estado !== 'Activo') return false
  if (treatment.antimicrobiano_id && candidate.antimicrobiano_id) return treatment.antimicrobiano_id === candidate.antimicrobiano_id
  return normalizeAntimicrobialName(treatment.antimicrobiano) === normalizeAntimicrobialName(candidate.antimicrobiano)
}

async function ensureNoDuplicate(casoId, candidate) {
  const active = await supabase
    .from('tratamientos_antimicrobianos')
    .select('id,estado,antimicrobiano_id,antimicrobiano')
    .eq('caso_id', casoId)
    .eq('estado', 'Activo')
  if (active.error) fail('Consultar duplicados activos', active.error)
  const duplicate = (active.data ?? []).find((row) => isDuplicate(row, candidate))
  if (duplicate) throw new Error('Este antimicrobiano ya se encuentra activo en el caso.')
}

const login = await supabase.auth.signInWithPassword({
  email: process.env.PROA_TEST_EMAIL,
  password: process.env.PROA_TEST_PASSWORD,
})
if (login.error) fail('1. Login real', login.error)
const userId = login.data.user.id
ok('1. Login real', userId)

const memberships = await supabase
  .from('usuario_ips')
  .select('ips_id,estado,ips:ips_id(id,nombre,estado)')
  .eq('usuario_id', userId)
  .eq('estado', 'Activo')
if (memberships.error) fail('2. IPS activa', memberships.error)
const ips =
  (memberships.data ?? [])
    .map((row) => row.ips)
    .filter((row) => row?.estado === 'Activa')
    .find((row) => row.nombre?.toUpperCase().includes('GESTION SALUD')) ?? memberships.data?.[0]?.ips
if (!ips) fail('2. IPS activa', 'Sin IPS asignada')
ok('2. IPS activa', `${ips.nombre} (${ips.id})`)

const activeCases = await supabase
  .from('casos_proa')
  .select('id,paciente_id,estado,fecha_cierre', { count: 'exact' })
  .eq('ips_id', ips.id)
  .eq('estado', 'Activo')
  .is('fecha_cierre', null)
  .limit(50)
if (activeCases.error) fail('3. Carga de casos activos', activeCases.error)
ok('3. Carga de casos activos', activeCases.count ?? 0)

const today = new Date().toISOString().slice(0, 10)
const roundsToday = await supabase
  .from('rondas_proa')
  .select('id,fecha_hora_ronda', { count: 'exact', head: true })
  .eq('ips_id', ips.id)
  .gte('fecha_hora_ronda', `${today}T00:00:00`)
  .lt('fecha_hora_ronda', `${today}T23:59:59`)
if (roundsToday.error) fail('4. Filtros operacionales', roundsToday.error)
ok('4. Filtros operacionales', `rondas hoy ${roundsToday.count ?? 0}`)

const rounds = await supabase
  .from('rondas_proa')
  .select('id,estado,fecha_hora_ronda,paciente_id,servicio_id,profesional_id', { count: 'exact' })
  .eq('ips_id', ips.id)
  .order('fecha_hora_ronda', { ascending: false })
  .limit(50)
if (rounds.error) fail('5. Rondas disponibles', rounds.error)
ok('5. Rondas disponibles', rounds.count ?? 0)

const searchProbe = await supabase
  .from('pacientes')
  .select('id,numero_identificacion,nombres,apellidos', { count: 'exact' })
  .eq('ips_id', ips.id)
  .or('numero_identificacion.ilike.%VALIDACION%,nombres.ilike.%VALIDACION%,apellidos.ilike.%VALIDACION%')
  .limit(20)
if (searchProbe.error) fail('6. Búsqueda no altera datos', searchProbe.error)
ok('6. Búsqueda no altera datos', searchProbe.count ?? 0)

const patients = await supabase
  .from('pacientes')
  .select('id,tipo_identificacion,numero_identificacion,nombres,apellidos', { count: 'exact' })
  .eq('ips_id', ips.id)
  .limit(50)
if (patients.error) fail('7. Pacientes longitudinales', patients.error)
ok('7. Pacientes longitudinales disponibles', patients.count ?? 0)

const dddDetail = await supabase
  .from('ddd_registros')
  .select('id,periodo,servicio_id,camas_dia_ocupadas,ddd_consumos(id,antimicrobiano_id,via,cantidad_consumida,gramos_consumidos,ddd_oms,ddd_calculadas,ddd_100_camas_dia)')
  .eq('ips_id', ips.id)
  .limit(10)
if (dddDetail.error) fail('8. Detalle DDD recuperable', dddDetail.error)
ok('8. Detalle DDD recuperable', `${dddDetail.data?.length ?? 0} registros`)

const indicators = await Promise.all([
  supabase.from('mart_rondas_proa').select('ronda_id,tipo_valoracion,hubo_intervencion').eq('ips_id', ips.id).limit(50),
  supabase.from('mart_intervenciones_proa').select('intervencion_id,aceptacion').eq('ips_id', ips.id).limit(50),
  supabase.from('mart_ddd').select('consumo_id,ddd_calculadas,ddd_100_camas_dia').eq('ips_id', ips.id).limit(50),
])
indicators.forEach((result, index) => {
  if (result.error) fail(`9. Indicadores ${index + 1}`, result.error)
})
ok('9. Indicadores recuperables', indicators.map((result) => result.data?.length ?? 0).join(', '))

const quality = await Promise.all([
  supabase.from('tratamientos_antimicrobianos').select('id', { count: 'exact', head: true }).eq('ips_id', ips.id).is('antimicrobiano_id', null),
  supabase.from('microbiologia').select('id', { count: 'exact', head: true }).eq('ips_id', ips.id).eq('resultado_general', 'Positivo').is('microorganismo', null),
  supabase.from('ddd_registros').select('id', { count: 'exact', head: true }).eq('ips_id', ips.id).or('camas_dia_ocupadas.is.null,camas_dia_ocupadas.eq.0'),
])
quality.forEach((result, index) => {
  if (result.error) fail(`10. Regla calidad ${index + 1}`, result.error)
})
ok('10. Reglas de calidad recuperables', quality.map((result) => result.count ?? 0).join(', '))

let patient = (searchProbe.data ?? []).find((row) => row.numero_identificacion === 'VALIDACION-6B1')
if (!patient) {
  const inserted = await supabase
    .from('pacientes')
    .insert({
      ips_id: ips.id,
      tipo_identificacion: 'CC',
      numero_identificacion: 'VALIDACION-6B1',
      nombres: 'VALIDACION',
      apellidos: '6B1',
      sexo: 'No especificado',
    })
    .select('*')
    .single()
  if (inserted.error) fail('Paciente VALIDACION-6B1', inserted.error)
  patient = inserted.data
}

let caseRow = await supabase
  .from('casos_proa')
  .select('*')
  .eq('ips_id', ips.id)
  .eq('paciente_id', patient.id)
  .eq('estado', 'Activo')
  .is('fecha_cierre', null)
  .order('fecha_apertura', { ascending: false })
  .limit(1)
  .maybeSingle()
if (caseRow.error) fail('Caso VALIDACION-6B1', caseRow.error)
if (!caseRow.data) {
  caseRow = await supabase
    .from('casos_proa')
    .insert({ ips_id: ips.id, paciente_id: patient.id, estado: 'Activo', fecha_apertura: new Date().toISOString(), cama_actual: 'VALIDACION-6B1' })
    .select('*')
    .single()
  if (caseRow.error) fail('Crear caso VALIDACION-6B1', caseRow.error)
}

let round = await supabase
  .from('rondas_proa')
  .select('*')
  .eq('ips_id', ips.id)
  .eq('caso_id', caseRow.data.id)
  .eq('estado', 'Borrador')
  .order('fecha_hora_ronda', { ascending: false })
  .limit(1)
  .maybeSingle()
if (round.error) fail('Ronda VALIDACION-6B1', round.error)
if (!round.data) {
  round = await supabase
    .from('rondas_proa')
    .insert({
      ips_id: ips.id,
      paciente_id: patient.id,
      caso_id: caseRow.data.id,
      fecha_hora_ronda: new Date().toISOString(),
      profesional_id: userId,
      tipo_valoracion: 'Seguimiento',
      estado: 'Borrador',
      cama: 'VALIDACION-6B1',
    })
    .select('*')
    .single()
  if (round.error) fail('Crear ronda VALIDACION-6B1', round.error)
}

const antimicrobial = await supabase
  .from('catalogo_antimicrobianos')
  .select('id,nombre')
  .eq('estado', 'Activo')
  .limit(1)
  .maybeSingle()
if (antimicrobial.error) fail('Catálogo antimicrobiano', antimicrobial.error)
if (!antimicrobial.data) fail('Catálogo antimicrobiano', 'Sin antimicrobianos activos')

const candidate = { antimicrobiano_id: antimicrobial.data.id, antimicrobiano: antimicrobial.data.nombre }
const activeValidationTreatments = await supabase
  .from('tratamientos_antimicrobianos')
  .select('*')
  .eq('caso_id', caseRow.data.id)
  .eq('estado', 'Activo')
if (activeValidationTreatments.error) fail('Tratamientos validación activos', activeValidationTreatments.error)
const sameActive = (activeValidationTreatments.data ?? []).filter((row) => isDuplicate(row, candidate))
if (!sameActive.length) {
  const inserted = await supabase
    .from('tratamientos_antimicrobianos')
    .insert({
      ips_id: ips.id,
      paciente_id: patient.id,
      caso_id: caseRow.data.id,
      ronda_id: round.data.id,
      antimicrobiano_id: antimicrobial.data.id,
      antimicrobiano: antimicrobial.data.nombre,
      dosis: 1,
      unidad: 'g',
      frecuencia: 'cada 8 h',
      via: 'IV',
      fecha_inicio: today,
      estado: 'Activo',
    })
    .select('*')
    .single()
  if (inserted.error) fail('Preparar tratamiento activo', inserted.error)
  sameActive.push(inserted.data)
}
if (sameActive.length > 1) fail('11. Duplicados activos existentes', `VALIDACION-6B1 tiene ${sameActive.length} activos equivalentes`)

try {
  await ensureNoDuplicate(caseRow.data.id, candidate)
  fail('11. Rechazo duplicado activo', 'La regla no detectó el duplicado activo')
} catch (error) {
  if (error.message !== 'Este antimicrobiano ya se encuentra activo en el caso.') fail('11. Rechazo duplicado activo', error)
  ok('11. Rechazo duplicado activo', error.message)
}

const suspension = await supabase
  .from('tratamientos_antimicrobianos')
  .update({ estado: 'Suspendido', fecha_fin: today, fecha_ultima_modificacion: new Date().toISOString() })
  .eq('id', sameActive[0].id)
  .select('*')
  .single()
if (suspension.error) fail('Suspender tratamiento de prueba', suspension.error)

try {
  await ensureNoDuplicate(caseRow.data.id, candidate)
  ok('12. Suspendido no bloquea nuevo inicio')
} catch (error) {
  fail('12. Suspendido no bloquea nuevo inicio', error)
}

const newActive = await supabase
  .from('tratamientos_antimicrobianos')
  .insert({
    ips_id: ips.id,
    paciente_id: patient.id,
    caso_id: caseRow.data.id,
    ronda_id: round.data.id,
    antimicrobiano_id: antimicrobial.data.id,
    antimicrobiano: antimicrobial.data.nombre,
    dosis: 1,
    unidad: 'g',
    frecuencia: 'cada 12 h',
    via: 'IV',
    fecha_inicio: today,
    estado: 'Activo',
  })
  .select('*')
  .single()
if (newActive.error) fail('12. Insertar nuevo activo posterior', newActive.error)
ok('12. Tratamiento posterior válido', newActive.data.id)

if (dddDetail.data?.[0]?.ddd_consumos?.[0]?.ddd_calculadas && dddDetail.data[0].ddd_consumos[0].ddd_oms) {
  const c = dddDetail.data[0].ddd_consumos[0]
  const expected = Number(c.gramos_consumidos ?? 0) / Number(c.ddd_oms)
  if (!close(c.ddd_calculadas, expected, 0.01)) fail('Detalle DDD cálculo', `${c.ddd_calculadas} != ${expected}`)
}

const logout = await supabase.auth.signOut()
if (logout.error) fail('13. Logout', logout.error)
ok('13. Logout')
