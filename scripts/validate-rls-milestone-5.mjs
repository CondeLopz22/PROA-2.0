import { createClient } from '@supabase/supabase-js'

const required = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'PROA_TEST_EMAIL',
  'PROA_TEST_PASSWORD',
  'PROA_TEST_HUJMB_EMAIL',
  'PROA_TEST_HUJMB_PASSWORD',
]
const missing = required.filter((key) => !process.env[key])
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(', ')}`)
  console.error('validate:rls requires two non-privileged test users: one assigned to GESTION SALUD and one to HUJMB.')
  process.exit(1)
}

const createSupabase = () =>
  createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

const ok = (label, value = 'OK') => console.log(`✓ ${label}: ${value}`)
const fail = (label, error) => {
  console.error(`✗ ${label}`)
  console.error(error?.message ?? error)
  process.exit(1)
}

async function signIn(email, password, label) {
  const supabase = createSupabase()
  const result = await supabase.auth.signInWithPassword({ email, password })
  if (result.error) fail(`${label} login`, result.error)
  ok(`${label} login`, result.data.user.id)
  return { supabase, userId: result.data.user.id }
}

async function getAllowedIps(session, label, expectedName) {
  const memberships = await session.supabase
    .from('usuario_ips')
    .select('ips_id,rol,estado,ips:ips_id(id,nombre,estado)')
    .eq('usuario_id', session.userId)
    .eq('estado', 'Activo')
  if (memberships.error) fail(`${label} usuario_ips`, memberships.error)

  const rows = (memberships.data ?? [])
    .map((row) => ({ ...row.ips, rol: row.rol }))
    .filter((ips) => ips?.estado === 'Activa')
  const expected = rows.find((ips) => ips.nombre?.toUpperCase().includes(expectedName))
  if (!expected) fail(`${label} IPS esperada`, `No se encontró ${expectedName} en IPS permitidas`)
  ok(`${label} IPS permitidas`, rows.map((ips) => ips.nombre).join(', '))
  return { all: rows, expected }
}

async function assertNoRows(session, table, ipsId, label) {
  const result = await session.supabase.from(table).select('id').eq('ips_id', ipsId).limit(1)
  if (result.error) {
    ok(`${label} ${table}`, `RLS rechazó consulta: ${result.error.message}`)
    return
  }
  if (result.data?.length) fail(`${label} ${table}`, `Se vio al menos una fila de IPS cruzada`)
  ok(`${label} ${table}`, 'sin filas cruzadas visibles')
}

async function assertOwnRowsQueryable(session, table, ipsId, label) {
  const result = await session.supabase.from(table).select('id').eq('ips_id', ipsId).limit(1)
  if (result.error) fail(`${label} ${table}`, result.error)
  ok(`${label} ${table}`, `${result.data?.length ?? 0} fila(s) visibles`)
}

const gestion = await signIn(process.env.PROA_TEST_EMAIL, process.env.PROA_TEST_PASSWORD, 'GESTION SALUD')
const hujmb = await signIn(process.env.PROA_TEST_HUJMB_EMAIL, process.env.PROA_TEST_HUJMB_PASSWORD, 'HUJMB')

const gestionIps = await getAllowedIps(gestion, 'GESTION SALUD', 'GESTION SALUD')
const hujmbIps = await getAllowedIps(hujmb, 'HUJMB', 'HUJMB')

if (gestionIps.expected.id === hujmbIps.expected.id) {
  fail('Separación IPS', 'Ambos usuarios resuelven la misma IPS; la prueba no puede validar aislamiento cruzado.')
}

const tables = [
  'pacientes',
  'casos_proa',
  'rondas_proa',
  'tratamientos_antimicrobianos',
  'microbiologia',
  'intervenciones_proa',
  'ddd_registros',
]

for (const table of tables) {
  await assertOwnRowsQueryable(gestion, table, gestionIps.expected.id, 'GESTION SALUD propia')
  await assertNoRows(gestion, table, hujmbIps.expected.id, 'GESTION SALUD contra HUJMB')
  await assertOwnRowsQueryable(hujmb, table, hujmbIps.expected.id, 'HUJMB propia')
  await assertNoRows(hujmb, table, gestionIps.expected.id, 'HUJMB contra GESTION SALUD')
}

await gestion.supabase.auth.signOut()
await hujmb.supabase.auth.signOut()
ok('Logout usuarios')
