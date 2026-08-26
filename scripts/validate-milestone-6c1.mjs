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
if (memberships.error) fail('IPS activa', memberships.error)
const ips =
  (memberships.data ?? [])
    .map((row) => row.ips)
    .filter((row) => row?.estado === 'Activa')
    .find((row) => row.nombre?.toUpperCase().includes('GESTION SALUD')) ?? memberships.data?.[0]?.ips
if (!ips) fail('IPS activa', 'Sin IPS visible')
ok('IPS activa', ips.nombre)

const checks = [
  ['Cockpit', supabase.from('casos_proa').select('id,paciente_id', { count: 'exact', head: true }).eq('ips_id', ips.id).eq('estado', 'Activo').is('fecha_cierre', null)],
  ['Rondas', supabase.from('rondas_proa').select('id', { count: 'exact', head: true }).eq('ips_id', ips.id)],
  ['Pacientes', supabase.from('pacientes').select('id', { count: 'exact', head: true }).eq('ips_id', ips.id)],
  ['DDD registros', supabase.from('ddd_registros').select('id', { count: 'exact', head: true }).eq('ips_id', ips.id)],
  ['DDD mart', supabase.from('mart_ddd').select('consumo_id', { count: 'exact', head: true }).eq('ips_id', ips.id)],
  ['Indicadores rondas', supabase.from('mart_rondas_proa').select('ronda_id', { count: 'exact', head: true }).eq('ips_id', ips.id)],
  ['Indicadores intervención', supabase.from('mart_intervenciones_proa').select('intervencion_id', { count: 'exact', head: true }).eq('ips_id', ips.id)],
  ['Indicadores microbiología', supabase.from('mart_microbiologia').select('muestra_id', { count: 'exact', head: true }).eq('ips_id', ips.id)],
]

for (const [label, query] of checks) {
  const result = await query
  if (result.error) fail(label, result.error)
  ok(label, result.count ?? 0)
}

const clinicalRound = await supabase
  .from('rondas_proa')
  .select('id,estado,caso_id,paciente_id')
  .eq('ips_id', ips.id)
  .order('fecha_hora_ronda', { ascending: false })
  .limit(1)
  .maybeSingle()
if (clinicalRound.error) fail('Flujo clínico base accesible', clinicalRound.error)
ok('Flujo clínico base accesible', clinicalRound.data?.id ?? 'sin rondas visibles')

const qualityRules = await Promise.all([
  supabase.from('tratamientos_antimicrobianos').select('id', { count: 'exact', head: true }).eq('ips_id', ips.id).is('antimicrobiano_id', null),
  supabase.from('microbiologia').select('id', { count: 'exact', head: true }).eq('ips_id', ips.id).eq('resultado_general', 'Positivo').is('microorganismo', null),
  supabase.from('ddd_registros').select('id', { count: 'exact', head: true }).eq('ips_id', ips.id).or('camas_dia_ocupadas.is.null,camas_dia_ocupadas.eq.0'),
])
qualityRules.forEach((result, index) => {
  if (result.error) fail(`Calidad regla ${index + 1}`, result.error)
})
ok('Calidad de Datos', qualityRules.map((result) => result.count ?? 0).join(', '))

await supabase.auth.signOut()
ok('Logout')
