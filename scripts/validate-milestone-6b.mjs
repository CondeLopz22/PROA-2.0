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

const login = await supabase.auth.signInWithPassword({
  email: process.env.PROA_TEST_EMAIL,
  password: process.env.PROA_TEST_PASSWORD,
})
if (login.error) fail('Login', login.error)
const userId = login.data.user.id
ok('Login', userId)

const memberships = await supabase
  .from('usuario_ips')
  .select('ips_id,estado,ips:ips_id(id,nombre,estado)')
  .eq('usuario_id', userId)
  .eq('estado', 'Activo')
if (memberships.error) fail('IPS', memberships.error)
const ips =
  (memberships.data ?? [])
    .map((row) => row.ips)
    .filter((row) => row?.estado === 'Activa')
    .find((row) => row.nombre?.toUpperCase().includes('GESTION SALUD')) ?? memberships.data?.[0]?.ips
if (!ips) fail('IPS', 'Sin IPS activa visible')
ok('IPS', `${ips.nombre} (${ips.id})`)

const activeCases = await supabase
  .from('casos_proa')
  .select('id,paciente_id,estado,fecha_cierre', { count: 'exact' })
  .eq('ips_id', ips.id)
  .eq('estado', 'Activo')
  .is('fecha_cierre', null)
  .limit(50)
if (activeCases.error) fail('Cockpit casos activos', activeCases.error)
ok('Cockpit casos activos', activeCases.count ?? 0)

const rounds = await supabase
  .from('rondas_proa')
  .select('id,estado,fecha_hora_ronda,paciente_id,servicio_id', { count: 'exact' })
  .eq('ips_id', ips.id)
  .order('fecha_hora_ronda', { ascending: false })
  .limit(50)
if (rounds.error) fail('Rondas actividad', rounds.error)
ok('Rondas actividad', rounds.count ?? 0)

const patients = await supabase
  .from('pacientes')
  .select('id,tipo_identificacion,numero_identificacion,nombres,apellidos', { count: 'exact' })
  .eq('ips_id', ips.id)
  .limit(50)
if (patients.error) fail('Directorio pacientes', patients.error)
ok('Directorio pacientes', patients.count ?? 0)

const martChecks = [
  ['mart_casos_proa', 'caso_id'],
  ['mart_rondas_proa', 'ronda_id'],
  ['mart_intervenciones_proa', 'intervencion_id'],
  ['mart_microbiologia', 'muestra_id'],
  ['mart_ddd', 'consumo_id'],
]
for (const [view, idField] of martChecks) {
  const result = await supabase.from(view).select(idField, { count: 'exact', head: true }).eq('ips_id', ips.id)
  if (result.error) fail(`MART ${view}`, result.error)
  ok(`MART ${view}`, result.count ?? 0)
}

const dddAnalytics = await supabase
  .from('mart_ddd')
  .select('periodo,antimicrobiano_id,servicio_id,gramos_consumidos,ddd_calculadas,ddd_100_camas_dia,camas_dia_ocupadas')
  .eq('ips_id', ips.id)
  .limit(100)
if (dddAnalytics.error) fail('DDD analytics', dddAnalytics.error)
const dddTotal = (dddAnalytics.data ?? []).reduce((sum, row) => sum + Number(row.ddd_calculadas ?? 0), 0)
ok('DDD analytics', `DDD visibles ${dddTotal}`)

const qualityQueries = await Promise.all([
  supabase.from('tratamientos_antimicrobianos').select('id', { count: 'exact', head: true }).eq('ips_id', ips.id).is('antimicrobiano_id', null),
  supabase.from('microbiologia').select('id', { count: 'exact', head: true }).eq('ips_id', ips.id).eq('resultado_general', 'Positivo').is('microorganismo', null),
  supabase.from('ddd_registros').select('id', { count: 'exact', head: true }).eq('ips_id', ips.id).or('camas_dia_ocupadas.is.null,camas_dia_ocupadas.eq.0'),
])
qualityQueries.forEach((result, index) => {
  if (result.error) fail(`Calidad regla ${index + 1}`, result.error)
})
ok('Calidad datos', qualityQueries.map((result) => result.count ?? 0).join(', '))

const indicatorRows = await Promise.all([
  supabase.from('mart_rondas_proa').select('ronda_id,tipo_valoracion,hubo_intervencion').eq('ips_id', ips.id).limit(100),
  supabase.from('mart_intervenciones_proa').select('intervencion_id,aceptacion,tipo_intervencion').eq('ips_id', ips.id).limit(100),
  supabase.from('mart_microbiologia').select('muestra_id,resultado_general,microorganismo').eq('ips_id', ips.id).limit(100),
])
indicatorRows.forEach((result, index) => {
  if (result.error) fail(`Indicadores ${index + 1}`, result.error)
})
ok('Indicadores nativos', indicatorRows.map((result) => result.data?.length ?? 0).join(', '))

await supabase.auth.signOut()
ok('Logout')
