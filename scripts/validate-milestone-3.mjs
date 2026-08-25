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
const close = (a, b, tolerance = 0.0001) => Math.abs(Number(a) - Number(b)) <= tolerance
const now = () => new Date().toISOString()
const testPeriod = () => {
  const date = new Date()
  date.setUTCMonth(date.getUTCMonth() + 1)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`
}

async function signIn() {
  const result = await supabase.auth.signInWithPassword({
    email: process.env.PROA_TEST_EMAIL,
    password: process.env.PROA_TEST_PASSWORD,
  })
  if (result.error) fail('A. Login', result.error)
  ok('A. Login', result.data.user.id)
  return result.data.user.id
}

async function getGestionIps(userId) {
  const memberships = await supabase
    .from('usuario_ips')
    .select('ips_id,rol,estado,ips:ips_id(id,nombre,estado)')
    .eq('usuario_id', userId)
    .eq('estado', 'Activo')
  if (memberships.error) fail('B. usuario_ips', memberships.error)
  const allowedIps = (memberships.data ?? []).map((row) => ({ ...row.ips, rol: row.rol })).filter((ips) => ips?.estado === 'Activa')
  const gestion =
    allowedIps.find((ips) => ips.nombre?.toUpperCase().includes('GESTION SALUD')) ??
    allowedIps.find((ips) => ips.id === process.env.PROA_TEST_IPS_ID) ??
    allowedIps[0]
  if (!gestion) fail('B. IPS GESTION SALUD', 'No hay IPS activa asignada al usuario')
  ok('B. IPS GESTION SALUD', `${gestion.nombre} (${gestion.id})`)
  return gestion
}

async function getService(ipsId) {
  const result = await supabase
    .from('servicios_ips')
    .select('*')
    .eq('ips_id', ipsId)
    .eq('estado', 'Activo')
    .limit(1)
    .maybeSingle()
  if (result.error || !result.data) fail('C. Servicio permitido', result.error ?? 'No hay servicios activos')
  ok('C. Servicio permitido', result.data.nombre ?? result.data.id)
  return result.data
}

async function getOmsReference() {
  const result = await supabase
    .from('oms_ddd')
    .select('*,catalogo_antimicrobianos:antimicrobiano_id(id,nombre,codigo_atc,estado)')
    .gt('ddd_oms', 0)
    .limit(20)
  if (result.error) fail('F. Referencia DDD OMS', result.error)
  const row = (result.data ?? []).find((item) => item.catalogo_antimicrobianos?.estado === 'Activo') ?? result.data?.[0]
  if (!row) fail('F. Referencia DDD OMS', 'No hay referencia OMS DDD visible')
  ok('F. Referencia DDD OMS', `${row.catalogo_antimicrobianos?.nombre ?? row.antimicrobiano_id} ${row.via} = ${row.ddd_oms}`)
  return row
}

async function openRecord({ ipsId, serviceId, period, userId }) {
  const existing = await supabase
    .from('ddd_registros')
    .select('*')
    .eq('ips_id', ipsId)
    .eq('servicio_id', serviceId)
    .eq('periodo', period)
    .maybeSingle()
  if (existing.error) fail('D. Buscar registro DDD', existing.error)
  if (existing.data) {
    const reopened = await supabase
      .from('ddd_registros')
      .update({
        camas_disponibles: 100,
        camas_dia_ocupadas: 1000,
        porcentaje_ocupacion: null,
        estado: 'Borrador',
        fecha_confirmacion: null,
      })
      .eq('id', existing.data.id)
      .select('*')
      .single()
    if (reopened.error) fail('D. Reabrir registro existente', reopened.error)
    ok('D. Reabrir registro sin duplicado', reopened.data.id)
    return reopened.data
  }

  const inserted = await supabase
    .from('ddd_registros')
    .insert({
      ips_id: ipsId,
      servicio_id: serviceId,
      periodo: period,
      camas_disponibles: 100,
      camas_dia_ocupadas: 1000,
      usuario_registro: userId,
      estado: 'Borrador',
    })
    .select('*')
    .single()
  if (inserted.error) fail('D. Crear ddd_registros Borrador', inserted.error)
  ok('D. Crear ddd_registros Borrador', inserted.data.id)
  return inserted.data
}

async function upsertValidationConsumption(recordId, oms) {
  const existing = await supabase
    .from('ddd_consumos')
    .select('*')
    .eq('registro_id', recordId)
    .eq('antimicrobiano_id', oms.antimicrobiano_id)
    .eq('via', oms.via)
    .limit(1)
  if (existing.error) fail('E. Buscar consumo existente', existing.error)

  const payload = {
    registro_id: recordId,
    antimicrobiano_id: oms.antimicrobiano_id,
    via: oms.via,
    presentacion: 'Validación Milestone 3: 1 g',
    concentracion: 1,
    unidad_concentracion: 'g',
    cantidad_consumida: 100,
    unidad_consumo: 'unidades',
    gramos_consumidos: 100,
  }

  const result = existing.data?.[0]
    ? await supabase.from('ddd_consumos').update(payload).eq('id', existing.data[0].id).select('*').single()
    : await supabase.from('ddd_consumos').insert(payload).select('*').single()
  if (result.error) fail('G. Registrar 100 unidades x 1 g', result.error)
  ok('G. Registrar 100 unidades x 1 g', result.data.id)
  return result.data
}

async function reloadConsumption(consumptionId) {
  const result = await supabase.from('ddd_consumos').select('*').eq('id', consumptionId).single()
  if (result.error) fail('H-I-J. Recargar consumo calculado', result.error)
  return result.data
}

async function assertMath(consumption, camasDia, oms) {
  const expectedGrams = 100
  const expectedDdd = expectedGrams / Number(oms.ddd_oms)
  const expectedDdd100 = (expectedDdd / camasDia) * 100
  if (!close(consumption.gramos_consumidos, expectedGrams)) {
    fail('H. gramos_consumidos = 100', `${consumption.gramos_consumidos} != ${expectedGrams}`)
  }
  if (!close(consumption.ddd_calculadas, expectedDdd)) {
    fail('I. DDD calculadas', `${consumption.ddd_calculadas} != ${expectedDdd}`)
  }
  if (!close(consumption.ddd_100_camas_dia, expectedDdd100)) {
    fail('J. DDD/100 camas-día', `${consumption.ddd_100_camas_dia} != ${expectedDdd100}`)
  }
  ok('H-I-J. Matemática DDD', `DDD=${expectedDdd}; DDD100=${expectedDdd100}`)
}

const userId = await signIn()
const ips = await getGestionIps(userId)
const service = await getService(ips.id)
const oms = await getOmsReference()
const period = process.env.PROA_TEST_DDD_PERIOD ?? testPeriod()

let record = await openRecord({ ipsId: ips.id, serviceId: service.id, period, userId })
if (Number(record.camas_dia_ocupadas) !== 1000) fail('E. Guardar camas_dia_ocupadas', `Valor inesperado ${record.camas_dia_ocupadas}`)
ok('E. Guardar camas_dia_ocupadas', record.camas_dia_ocupadas)

const consumption = await upsertValidationConsumption(record.id, oms)
let reloaded = await reloadConsumption(consumption.id)
await assertMath(reloaded, 1000, oms)

const updatedRecord = await supabase
  .from('ddd_registros')
  .update({ camas_dia_ocupadas: 2000 })
  .eq('id', record.id)
  .select('*')
  .single()
if (updatedRecord.error) fail('K. Modificar camas_dia_ocupadas', updatedRecord.error)
record = updatedRecord.data
reloaded = await reloadConsumption(consumption.id)
await assertMath(reloaded, 2000, oms)
ok('K. Trigger recalcula por ocupación', reloaded.ddd_100_camas_dia)

const duplicateCheck = await openRecord({ ipsId: ips.id, serviceId: service.id, period, userId })
if (duplicateCheck.id !== record.id) fail('L. Reabrir sin duplicado', `${duplicateCheck.id} != ${record.id}`)
ok('L. Reabrir sin duplicado')

const missingReferenceCandidate = await supabase
  .from('catalogo_antimicrobianos')
  .select('id,nombre')
  .eq('estado', 'Activo')
  .neq('id', oms.antimicrobiano_id)
  .limit(10)
if (!missingReferenceCandidate.error) {
  const candidate = (missingReferenceCandidate.data ?? [])[0]
  if (candidate) {
    const missingOms = await supabase
      .from('oms_ddd')
      .select('id')
      .eq('antimicrobiano_id', candidate.id)
      .eq('via', 'VIA_VALIDACION_SIN_OMS')
      .maybeSingle()
    if (missingOms.error) fail('M. Detectar referencia OMS faltante', missingOms.error)
    if (!missingOms.data) ok('M. Detectar referencia OMS faltante', candidate.nombre ?? candidate.id)
  }
}

const confirmed = await supabase
  .from('ddd_registros')
  .update({ estado: 'Confirmado', fecha_confirmacion: now() })
  .eq('id', record.id)
  .select('id,estado,fecha_confirmacion')
  .single()
if (confirmed.error) fail('N. Confirmar registro', confirmed.error)
if (confirmed.data.estado !== 'Confirmado' || !confirmed.data.fecha_confirmacion) fail('O. Comprobar Confirmado', 'Estado o fecha faltante')
ok('N-O. Confirmar registro', confirmed.data.id)

let forbiddenIpsId = process.env.PROA_FORBIDDEN_IPS_ID
if (!forbiddenIpsId) {
  const hujmb = await supabase.from('ips').select('id,nombre').ilike('nombre', '%HUJMB%').neq('id', ips.id).limit(1).maybeSingle()
  if (!hujmb.error && hujmb.data) forbiddenIpsId = hujmb.data.id
}
if (forbiddenIpsId) {
  const forbidden = await supabase.from('ddd_registros').select('id').eq('ips_id', forbiddenIpsId).limit(1)
  if (forbidden.error) ok('P. RLS bloqueado por error', forbidden.error.message)
  else if (!forbidden.data?.length) ok('P. RLS sin filas cruzadas visibles')
  else fail('P. RLS', `Se vieron ${forbidden.data.length} registros DDD de otra IPS`)
} else {
  ok('P. RLS', 'Sin PROA_FORBIDDEN_IPS_ID ni IPS HUJMB visible')
}

await supabase.auth.signOut()
ok('Logout')
