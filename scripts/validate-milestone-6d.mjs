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

function normalize(value) {
  return (value ?? '').trim().toLocaleLowerCase('es-CO').replace(/\s+/g, ' ')
}

const login = await supabase.auth.signInWithPassword({
  email: process.env.PROA_TEST_EMAIL,
  password: process.env.PROA_TEST_PASSWORD,
})
if (login.error) fail('1. Login', login.error)
const userId = login.data.user.id
ok('1. Login', userId)

const profile = await supabase
  .from('perfiles_usuario')
  .select('usuario_id,nombre,estado,es_admin_global,fecha_creacion')
  .eq('usuario_id', userId)
  .maybeSingle()
if (profile.error) fail('2. Perfil/rol', profile.error)
ok('2. Perfil/rol', `${profile.data?.nombre ?? 'Sin nombre'} · admin global: ${Boolean(profile.data?.es_admin_global)}`)

const memberships = await supabase
  .from('usuario_ips')
  .select('usuario_id,ips_id,rol,estado,fecha_asignacion,ips:ips_id(id,nombre,nit,codigo_reps,estado,fecha_creacion)')
  .eq('usuario_id', userId)
  .eq('estado', 'Activo')
if (memberships.error) fail('3. IPS activa', memberships.error)
const membership =
  (memberships.data ?? [])
    .filter((row) => row.ips?.estado === 'Activa')
    .find((row) => row.ips?.nombre?.toUpperCase().includes('GESTION SALUD')) ?? memberships.data?.[0]
if (!membership?.ips) fail('3. IPS activa', 'Sin IPS activa visible para la validación')
const ips = membership.ips
ok('3. IPS activa', `${ips.nombre} · ${membership.rol}`)

const institution = await supabase
  .from('ips')
  .select('id,nombre,nit,codigo_reps,estado,fecha_creacion')
  .eq('id', ips.id)
  .maybeSingle()
if (institution.error) fail('4. Lectura configuración IPS', institution.error)
if (!institution.data) fail('4. Lectura configuración IPS', 'La IPS activa no fue visible por RLS')
ok('4. Lectura configuración IPS', institution.data.nombre)

const services = await supabase
  .from('servicios_ips')
  .select('id,ips_id,nombre,estado', { count: 'exact' })
  .eq('ips_id', ips.id)
  .limit(50)
if (services.error) fail('5. Servicios', services.error)
ok('5. Servicios', services.count ?? services.data?.length ?? 0)

const catalogChecks = [
  ['catalogo_antimicrobianos', 'id,nombre,codigo_atc,estado'],
  ['catalogo_microorganismos', 'id,nombre,tipo_germen,estado'],
  ['catalogo_tipos_muestra', 'id,nombre,estado'],
  ['catalogo_intervenciones', 'id,nombre,estado'],
  ['catalogo_categorias_proa', 'id,nombre,estado'],
  ['oms_ddd', 'id,antimicrobiano_id,via,ddd_oms,unidad_ddd,version_fuente,fecha_actualizacion'],
]

for (const [table, columns] of catalogChecks) {
  const result = await supabase.from(table).select(columns, { count: 'exact' }).limit(5)
  if (result.error) fail(`6. Catálogo ${table}`, result.error)
  ok(`6. Catálogo ${table}`, result.count ?? result.data?.length ?? 0)
}

const otherIps = await supabase
  .from('ips')
  .select('id,nombre,estado')
  .neq('id', ips.id)
  .ilike('nombre', '%HUJMB%')
  .limit(1)
if (otherIps.error) fail('7. Restricción Multi-IPS consulta IPS', otherIps.error)
const crossIpsVisible = (otherIps.data ?? []).length > 0
ok('7. Restricción Multi-IPS', crossIpsVisible ? 'Otra IPS visible; revisar si usuario es admin global/multi-IPS' : 'HUJMB no visible para este usuario')

const membershipsForIps = await supabase
  .from('usuario_ips')
  .select('usuario_id,ips_id,rol,estado,fecha_asignacion', { count: 'exact' })
  .eq('ips_id', ips.id)
  .limit(50)
if (membershipsForIps.error) fail('8. Restricciones por rol - lectura accesos', membershipsForIps.error)
ok('8. Restricciones por rol - lectura accesos', membershipsForIps.count ?? membershipsForIps.data?.length ?? 0)

const treatments = await supabase
  .from('tratamientos_antimicrobianos')
  .select('id,ips_id,paciente_id,caso_id,antimicrobiano_id,antimicrobiano,fecha_inicio,via,estado')
  .eq('ips_id', ips.id)
  .eq('estado', 'Activo')
  .limit(1000)
if (treatments.error) fail('9. Auditoría duplicados - tratamientos', treatments.error)

const duplicateGroups = new Map()
for (const treatment of treatments.data ?? []) {
  if (!treatment.caso_id) continue
  const antimicrobialKey = treatment.antimicrobiano_id ?? normalize(treatment.antimicrobiano)
  if (!antimicrobialKey) continue
  const key = `${treatment.caso_id}::${antimicrobialKey}`
  duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), treatment.id])
}
const duplicates = Array.from(duplicateGroups.values()).filter((ids) => ids.length > 1)
ok('9. Auditoría duplicados', `${duplicates.length} grupos duplicados activos visibles`)

await supabase.auth.signOut()
ok('10. Logout')

console.log('Milestone 6D validation finished without destructive writes.')
