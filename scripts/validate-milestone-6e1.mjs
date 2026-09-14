import { createClient } from '@supabase/supabase-js'

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
  console.error(`Missing env vars for real 6E.1 validation: ${missing.join(', ')}`)
  process.exit(1)
}

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY

const expected = {
  Access: [
    'AMIKACINA',
    'AMOXACILINA',
    'AMOXACILINA + INHIBIDOR',
    'AMPICILINA',
    'AMPICILINA + INHIBIDOR',
    'CEFALEXINA',
    'CEFALOTINA',
    'CEFAZOLINA',
    'CEFRADINA',
    'CLINDAMICINA',
    'DOXICICLINA',
    'GENTAMICINA',
    'METRONIDAZOL',
    'NITROFURANTOINA',
    'OXACILINA',
    'TRIMETOPRIM SULFA',
  ],
  Watch: [
    'AZITROMICINA',
    'CEFEPIME',
    'CEFOTAXIME',
    'CEFTAZIDIME',
    'CEFTRIAXONA',
    'CEFUROXIMA',
    'CIPROFLOXACINO',
    'CLARITROMICINA',
    'ERITROMICINA',
    'ERTAPENEM',
    'IMIPENEM',
    'LEVOFLOXACINO',
    'MEROPENEM',
    'MOXIFLOXACINO',
    'PIPERACILINA',
    'VANCOMICINA',
  ],
  Reserve: ['AZTREONAN', 'CEFTAROLINA', 'CEFTAZIDIME+INHIB', 'COLISTINA', 'DAPTOMICINA', 'LINEZOLID', 'POLIMIXINA', 'TIGECICLINA'],
  'No aplica': ['ACICLOVIR', 'ALBENDAZOL', 'ANFOTERICINA', 'CASPOFUNGINA', 'FLUCONAZOL', 'GANCICLOVIR', 'VORICONAZOL'],
  'Sin clasificar': ['PENICILINA'],
}

const expectedCounts = {
  Access: 16,
  Watch: 16,
  Reserve: 8,
  'No aplica': 7,
  'Sin clasificar': 1,
}

const ok = (label, value = 'OK') => console.log(`✓ ${label}: ${value}`)
const fail = (label, error) => {
  console.error(`✗ ${label}`)
  console.error(error?.message ?? error)
  process.exit(1)
}

function client() {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function num(value) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

async function login(email, password, label) {
  const supabase = client()
  const loginResult = await supabase.auth.signInWithPassword({ email, password })
  if (loginResult.error) fail(`${label} login`, loginResult.error)
  const user = loginResult.data.user
  const profile = await supabase
    .from('perfiles_usuario')
    .select('usuario_id,nombre,estado,es_admin_global')
    .eq('usuario_id', user.id)
    .maybeSingle()
  if (profile.error) fail(`${label} perfil`, profile.error)
  const memberships = await supabase
    .from('usuario_ips')
    .select('usuario_id,ips_id,rol,estado,ips:ips_id(id,nombre,estado)')
    .eq('usuario_id', user.id)
    .eq('estado', 'Activo')
  if (memberships.error) fail(`${label} usuario_ips`, memberships.error)
  const membership = (memberships.data ?? []).find((row) => row.ips?.estado === 'Activa') ?? memberships.data?.[0]
  if (!membership?.ips) fail(`${label} IPS`, 'No tiene IPS activa visible')
  ok(`${label} login`, `${profile.data?.nombre ?? user.email} · ${membership.ips.nombre}`)
  return { supabase, user, profile: profile.data, membership, ips: membership.ips }
}

function assertNearly(label, actual, expectedValue, tolerance = 0.0001) {
  if (Math.abs(actual - expectedValue) > tolerance) {
    fail(label, `Esperado ${expectedValue}, recibido ${actual}`)
  }
  ok(label, actual)
}

const admin = await login(process.env.PROA_TEST_ADMIN_EMAIL, process.env.PROA_TEST_ADMIN_PASSWORD, 'ADMIN')
if (!admin.profile?.es_admin_global) fail('ADMIN rol', 'El usuario admin debe tener es_admin_global=true')

const catalog = await admin.supabase
  .from('catalogo_antimicrobianos')
  .select('id,nombre,estado,codigo_atc,aware_categoria,aware_nombre_oms,atc_codigo,clase_farmacologica,aware_version')
  .order('nombre')
if (catalog.error) fail('Catálogo AWaRe', catalog.error)
if ((catalog.data ?? []).length !== 48) fail('48 registros conservados', `Recibidos ${(catalog.data ?? []).length}`)
ok('48 registros conservados')

const byName = new Map((catalog.data ?? []).map((row) => [row.nombre, row]))
for (const [category, names] of Object.entries(expected)) {
  for (const name of names) {
    const row = byName.get(name)
    if (!row) fail(`AWaRe ${category}`, `No existe ${name}`)
    if (row.aware_categoria !== category) fail(`AWaRe ${name}`, `Esperado ${category}, recibido ${row.aware_categoria}`)
    if (row.aware_version !== 'WHO AWaRe 2023') fail(`AWaRe versión ${name}`, `Versión inválida: ${row.aware_version}`)
  }
}
ok('Clasificación AWaRe exacta')

const counts = new Map()
for (const row of catalog.data ?? []) counts.set(row.aware_categoria, (counts.get(row.aware_categoria) ?? 0) + 1)
for (const [category, count] of Object.entries(expectedCounts)) {
  if (counts.get(category) !== count) fail(`Conteo ${category}`, `Esperado ${count}, recibido ${counts.get(category) ?? 0}`)
  ok(`Conteo ${category}`, count)
}

const mart = await admin.supabase
  .from('mart_ddd')
  .select('registro_ddd_id,consumo_id,ips_id,periodo,servicio_id,antimicrobiano_id,antimicrobiano,aware_categoria,atc_codigo,clase_farmacologica,ddd_calculadas,ddd_100_camas_dia,camas_dia_ocupadas')
  .eq('ips_id', admin.ips.id)
  .limit(1000)
if (mart.error) fail('mart_ddd expone AWaRe', mart.error)
ok('mart_ddd expone AWaRe', `${mart.data?.length ?? 0} filas visibles`)

const dddRows = mart.data ?? []
const access = dddRows.filter((row) => row.aware_categoria === 'Access').reduce((sum, row) => sum + num(row.ddd_calculadas), 0)
const watch = dddRows.filter((row) => row.aware_categoria === 'Watch').reduce((sum, row) => sum + num(row.ddd_calculadas), 0)
const reserve = dddRows.filter((row) => row.aware_categoria === 'Reserve').reduce((sum, row) => sum + num(row.ddd_calculadas), 0)
const excluded = dddRows
  .filter((row) => row.aware_categoria === 'No aplica' || row.aware_categoria === 'Sin clasificar')
  .reduce((sum, row) => sum + num(row.ddd_calculadas), 0)
const denominator = access + watch + reserve
const accessPercent = denominator > 0 ? (access / denominator) * 100 : null
if (denominator > 0) assertNearly('% Access calculado', accessPercent, (access / (access + watch + reserve)) * 100)
ok('No aplica/Sin clasificar excluidos', `${excluded} DDD fuera del denominador AWaRe`)

const dddExisting = await admin.supabase.from('ddd_registros').select('id,ips_id,estado,periodo').eq('ips_id', admin.ips.id).limit(1)
if (dddExisting.error) fail('DDD existente continúa consultable', dddExisting.error)
ok('DDD existente continúa consultable', `${dddExisting.data?.length ?? 0} registros`)

const infectomag = await login(process.env.PROA_TEST_INFECTOMAG_EMAIL, process.env.PROA_TEST_INFECTOMAG_PASSWORD, 'INFECTOMAG')
const infectomagCatalog = await infectomag.supabase.from('catalogo_antimicrobianos').select('id,nombre,aware_categoria').limit(5)
if (infectomagCatalog.error) fail('INFECTOMAG consulta AWaRe', infectomagCatalog.error)
ok('INFECTOMAG consulta AWaRe')
await infectomag.supabase.auth.signOut()

const clientUser = await login(process.env.PROA_TEST_CLIENT_EMAIL, process.env.PROA_TEST_CLIENT_PASSWORD, 'IPS CLIENTE')
const clientMart = await clientUser.supabase.from('mart_ddd').select('ips_id,aware_categoria,ddd_calculadas').eq('ips_id', clientUser.ips.id).limit(5)
if (clientMart.error) fail('IPS CLIENTE consulta AWaRe DDD', clientMart.error)
ok('IPS CLIENTE consulta AWaRe DDD')
const denied = await clientUser.supabase
  .from('catalogo_antimicrobianos')
  .update({ aware_categoria: 'Access' })
  .eq('nombre', 'ACICLOVIR')
  .select('id')
if (!denied.error && (denied.data ?? []).length > 0) fail('IPS CLIENTE read-only', 'Pudo modificar catálogo global')
ok('IPS CLIENTE read-only', denied.error ? 'rechazado por RLS' : 'sin filas modificadas')

const otherIps = await clientUser.supabase.from('ips').select('id,nombre').neq('id', clientUser.ips.id).limit(5)
if (otherIps.error) fail('IPS CLIENTE aislamiento', otherIps.error)
if ((otherIps.data ?? []).length > 0) fail('IPS CLIENTE aislamiento', `IPS adicionales visibles: ${otherIps.data.map((ips) => ips.nombre).join(', ')}`)
ok('IPS CLIENTE aislamiento Multi-IPS')

await admin.supabase.auth.signOut()
await clientUser.supabase.auth.signOut()
console.log('Milestone 6E.1 validation finished against real Supabase after AWaRe migration.')
