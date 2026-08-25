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

const markers = ['VALIDACION-M2', 'VALIDACION-M3', 'VALIDACION-M4', 'VALIDACION-M5', 'Validación Milestone', 'M4-TEST', 'M5-TEST']
const markerOr = (columns) =>
  columns.flatMap((column) => markers.map((marker) => `${column}.ilike.%${marker}%`)).join(',')

const ok = (label, value = 'OK') => console.log(`✓ ${label}: ${value}`)
const fail = (label, error) => {
  console.error(`✗ ${label}`)
  console.error(error?.message ?? error)
  process.exit(1)
}

async function report(label, query, render = (row) => row.id) {
  const result = await query
  if (result.error) fail(label, result.error)
  const rows = result.data ?? []
  console.log(`\n## ${label}`)
  console.log(`Total visible: ${rows.length}`)
  rows.slice(0, 25).forEach((row) => console.log(`- ${render(row)}`))
  if (rows.length > 25) console.log(`- ... ${rows.length - 25} adicional(es) no mostrados`)
  return rows
}

const login = await supabase.auth.signInWithPassword({
  email: process.env.PROA_TEST_EMAIL,
  password: process.env.PROA_TEST_PASSWORD,
})
if (login.error) fail('Login', login.error)
ok('Login', login.data.user.id)

const patients = await report(
  'Pacientes prueba',
  supabase
    .from('pacientes')
    .select('id,ips_id,tipo_identificacion,numero_identificacion,nombres,apellidos')
    .or(markerOr(['numero_identificacion', 'nombres', 'apellidos'])),
  (row) => `${row.id} | ${row.numero_identificacion} | ${[row.nombres, row.apellidos].filter(Boolean).join(' ')}`,
)

const patientIds = patients.map((row) => row.id)
await report(
  'Casos prueba',
  patientIds.length
    ? supabase
        .from('casos_proa')
        .select('id,ips_id,paciente_id,estado,fecha_apertura,fecha_cierre,ubicacion_actual,cama_actual,motivo_cierre')
        .in('paciente_id', patientIds)
    : Promise.resolve({ data: [], error: null }),
  (row) => `${row.id} | paciente ${row.paciente_id} | ${row.estado}`,
)

await report(
  'Rondas prueba',
  patientIds.length
    ? supabase
        .from('rondas_proa')
        .select('id,ips_id,paciente_id,caso_id,estado,fecha_hora_ronda,cama')
        .in('paciente_id', patientIds)
    : Promise.resolve({ data: [], error: null }),
  (row) => `${row.id} | caso ${row.caso_id} | ${row.estado}`,
)

await report(
  'Notas prueba',
  supabase
    .from('notas_proa')
    .select('id,ronda_id,version,fecha_confirmacion,texto_generado,texto_final')
    .or(markerOr(['texto_generado', 'texto_final'])),
  (row) => `${row.id} | ronda ${row.ronda_id} | versión ${row.version ?? 's/r'}`,
)

await report(
  'DDD prueba',
  supabase
    .from('ddd_registros')
    .select('id,ips_id,servicio_id,periodo,estado,camas_disponibles,camas_dia_ocupadas,ddd_consumos(id,presentacion,cantidad_consumida,gramos_consumidos)')
    .or('periodo.gte.2090-01-01,camas_disponibles.eq.100,camas_dia_ocupadas.eq.1000,camas_dia_ocupadas.eq.2000'),
  (row) => `${row.id} | ${row.periodo} | ${row.estado} | consumos ${row.ddd_consumos?.length ?? 0}`,
)

await supabase.auth.signOut()
ok('Reporte generado sin eliminar datos')
