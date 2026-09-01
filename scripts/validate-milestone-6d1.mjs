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
  console.error(`Missing env vars for real 6D.1 validation: ${missing.join(', ')}`)
  console.error('Configure three real test users: Administrador, Usuario INFECTOMAG and IPS Cliente.')
  process.exit(1)
}

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY

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

function normalizeUserType(profile, membership) {
  if (profile?.es_admin_global) return 'administrador'
  if (membership?.rol === 'Administrador' || membership?.rol === 'Administrador IPS') return 'administrador'
  if (membership?.rol === 'Usuario INFECTOMAG' || membership?.rol === 'PROA') return 'infectomag'
  if (membership?.rol === 'IPS Cliente' || membership?.rol === 'Consulta') return 'ips_cliente'
  return 'sin_acceso'
}

async function loginAs(label, email, password) {
  const supabase = client()
  const login = await supabase.auth.signInWithPassword({ email, password })
  if (login.error) fail(`${label} login`, login.error)
  const user = login.data.user
  const profile = await supabase
    .from('perfiles_usuario')
    .select('usuario_id,nombre,estado,es_admin_global,fecha_creacion')
    .eq('usuario_id', user.id)
    .maybeSingle()
  if (profile.error) fail(`${label} perfil`, profile.error)

  const memberships = await supabase
    .from('usuario_ips')
    .select('usuario_id,ips_id,rol,estado,fecha_asignacion,ips:ips_id(id,nombre,nit,codigo_reps,estado,fecha_creacion)')
    .eq('usuario_id', user.id)
    .eq('estado', 'Activo')
  if (memberships.error) fail(`${label} usuario_ips`, memberships.error)

  const visibleMemberships = (memberships.data ?? []).filter((row) => row.ips?.estado === 'Activa')
  const membership =
    visibleMemberships.find((row) => row.ips?.nombre?.toUpperCase().includes('GESTION SALUD')) ??
    visibleMemberships[0]
  if (!membership?.ips) fail(`${label} IPS`, 'No tiene IPS activa visible para validar')

  const userType = normalizeUserType(profile.data, membership)
  ok(`${label} login`, `${profile.data?.nombre ?? email} · ${userType} · ${membership.ips.nombre}`)
  return { supabase, user, profile: profile.data, membership, ips: membership.ips, userType }
}

async function expectRejected(label, operation) {
  const result = await operation()
  const hasError = Boolean(result?.error)
  const emptySelection = !hasError && Array.isArray(result?.data) && result.data.length === 0
  if (!hasError && !emptySelection) {
    fail(label, 'La operación no autorizada fue permitida por Supabase/RLS.')
  }
  ok(label, result?.error?.message ? 'rechazado por Supabase/RLS' : 'sin filas modificadas')
}

async function expectAllowed(label, operation) {
  const result = await operation()
  if (result?.error) fail(label, result.error)
  ok(label)
  return result
}

async function firstService(supabase, ipsId) {
  const result = await supabase
    .from('servicios_ips')
    .select('id,ips_id,nombre,estado')
    .eq('ips_id', ipsId)
    .limit(1)
    .maybeSingle()
  if (result.error) fail('Servicio para prueba', result.error)
  if (!result.data) fail('Servicio para prueba', 'No hay servicios visibles')
  return result.data
}

async function firstCatalog(supabase, table, columns = 'id,nombre,estado') {
  const result = await supabase.from(table).select(columns).limit(1).maybeSingle()
  if (result.error) fail(`Catálogo ${table}`, result.error)
  if (!result.data) fail(`Catálogo ${table}`, 'No hay filas visibles')
  return result.data
}

const admin = await loginAs(
  'ADMINISTRADOR',
  process.env.PROA_TEST_ADMIN_EMAIL,
  process.env.PROA_TEST_ADMIN_PASSWORD,
)
if (admin.userType !== 'administrador') fail('ADMINISTRADOR tipo usuario', `Esperado administrador, recibido ${admin.userType}`)

await expectAllowed('ADMINISTRADOR lee configuración', () =>
  admin.supabase.from('ips').select('id,nombre,nit,codigo_reps,estado,fecha_creacion').limit(10),
)
const adminService = await firstService(admin.supabase, admin.ips.id)
await expectAllowed('ADMINISTRADOR escritura administrativa reversible', () =>
  admin.supabase
    .from('servicios_ips')
    .update({ nombre: adminService.nombre })
    .eq('id', adminService.id)
    .select('id'),
)
await admin.supabase.auth.signOut()
ok('ADMINISTRADOR logout')

const infectomag = await loginAs(
  'USUARIO INFECTOMAG',
  process.env.PROA_TEST_INFECTOMAG_EMAIL,
  process.env.PROA_TEST_INFECTOMAG_PASSWORD,
)
if (infectomag.userType !== 'infectomag') fail('USUARIO INFECTOMAG tipo usuario', `Esperado infectomag, recibido ${infectomag.userType}`)
const infectomagService = await firstService(infectomag.supabase, infectomag.ips.id)
const antimicrobial = await firstCatalog(infectomag.supabase, 'catalogo_antimicrobianos', 'id,nombre,codigo_atc,estado')

await expectAllowed('USUARIO INFECTOMAG consulta indicadores', () =>
  infectomag.supabase.from('mart_rondas_proa').select('ronda_id,ips_id,ips,periodo').eq('ips_id', infectomag.ips.id).limit(5),
)
await expectRejected('USUARIO INFECTOMAG no modifica servicios', () =>
  infectomag.supabase
    .from('servicios_ips')
    .update({ nombre: infectomagService.nombre })
    .eq('id', infectomagService.id)
    .select('id'),
)
await expectRejected('USUARIO INFECTOMAG no modifica catálogo', () =>
  infectomag.supabase
    .from('catalogo_antimicrobianos')
    .update({ estado: antimicrobial.estado })
    .eq('id', antimicrobial.id)
    .select('id'),
)
await expectRejected('USUARIO INFECTOMAG no se eleva a Administrador', () =>
  infectomag.supabase
    .from('usuario_ips')
    .update({ rol: 'Administrador' })
    .eq('usuario_id', infectomag.user.id)
    .eq('ips_id', infectomag.ips.id)
    .select('usuario_id'),
)
await infectomag.supabase.auth.signOut()
ok('USUARIO INFECTOMAG logout')

const clientUser = await loginAs(
  'IPS CLIENTE',
  process.env.PROA_TEST_CLIENT_EMAIL,
  process.env.PROA_TEST_CLIENT_PASSWORD,
)
if (clientUser.userType !== 'ips_cliente') fail('IPS CLIENTE tipo usuario', `Esperado ips_cliente, recibido ${clientUser.userType}`)
const clientService = await firstService(clientUser.supabase, clientUser.ips.id)
const clientCatalog = await firstCatalog(clientUser.supabase, 'catalogo_antimicrobianos', 'id,nombre,codigo_atc,estado')

await expectAllowed('IPS CLIENTE consulta rondas', () =>
  clientUser.supabase.from('rondas_proa').select('id,ips_id,estado,fecha_hora_ronda').eq('ips_id', clientUser.ips.id).limit(5),
)
await expectAllowed('IPS CLIENTE consulta DDD', () =>
  clientUser.supabase.from('ddd_registros').select('id,ips_id,estado,periodo').eq('ips_id', clientUser.ips.id).limit(5),
)
await expectAllowed('IPS CLIENTE consulta indicadores', () =>
  clientUser.supabase.from('mart_ddd').select('registro_ddd_id,ips_id,periodo,ddd_calculadas').eq('ips_id', clientUser.ips.id).limit(5),
)
await expectRejected('IPS CLIENTE no inserta pacientes', () =>
  clientUser.supabase
    .from('pacientes')
    .insert({
      ips_id: clientUser.ips.id,
      tipo_identificacion: 'CC',
      numero_identificacion: `VALIDACION-6D1-CLIENT-${Date.now()}`,
      nombres: 'VALIDACION',
      apellidos: 'CLIENTE',
    })
    .select('id'),
)

const clientRound = await clientUser.supabase
  .from('rondas_proa')
  .select('id,estado')
  .eq('ips_id', clientUser.ips.id)
  .limit(1)
  .maybeSingle()
if (clientRound.error) fail('IPS CLIENTE ronda para UPDATE', clientRound.error)
if (clientRound.data) {
  await expectRejected('IPS CLIENTE no actualiza rondas', () =>
    clientUser.supabase
      .from('rondas_proa')
      .update({ estado: clientRound.data.estado })
      .eq('id', clientRound.data.id)
      .select('id'),
  )
} else {
  ok('IPS CLIENTE no actualiza rondas', 'sin rondas visibles para intentar update')
}

await expectRejected('IPS CLIENTE no inserta DDD', () =>
  clientUser.supabase
    .from('ddd_registros')
    .insert({
      ips_id: clientUser.ips.id,
      servicio_id: clientService.id,
      periodo: '2099-06-01',
      camas_dia_ocupadas: 1,
      estado: 'Borrador',
      usuario_registro: clientUser.user.id,
    })
    .select('id'),
)
await expectRejected('IPS CLIENTE no modifica servicios', () =>
  clientUser.supabase
    .from('servicios_ips')
    .update({ nombre: clientService.nombre })
    .eq('id', clientService.id)
    .select('id'),
)
await expectRejected('IPS CLIENTE no modifica catálogo', () =>
  clientUser.supabase
    .from('catalogo_antimicrobianos')
    .update({ estado: clientCatalog.estado })
    .eq('id', clientCatalog.id)
    .select('id'),
)
await expectRejected('IPS CLIENTE no se eleva a Administrador', () =>
  clientUser.supabase
    .from('usuario_ips')
    .update({ rol: 'Administrador' })
    .eq('usuario_id', clientUser.user.id)
    .eq('ips_id', clientUser.ips.id)
    .select('usuario_id'),
)
const otherIps = await clientUser.supabase
  .from('ips')
  .select('id,nombre')
  .neq('id', clientUser.ips.id)
  .limit(5)
if (otherIps.error) fail('IPS CLIENTE aislamiento Multi-IPS', otherIps.error)
if ((otherIps.data ?? []).length) fail('IPS CLIENTE aislamiento Multi-IPS', `IPS adicionales visibles: ${otherIps.data.map((ips) => ips.nombre).join(', ')}`)
ok('IPS CLIENTE aislamiento Multi-IPS', 'sin otras IPS visibles')

await clientUser.supabase.auth.signOut()
ok('IPS CLIENTE logout')

console.log('Milestone 6D.1 validation finished against real Supabase RLS.')
