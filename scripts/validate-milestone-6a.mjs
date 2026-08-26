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
const now = () => new Date().toISOString()
const today = () => new Date().toISOString().slice(0, 10)

async function first(label, query) {
  const result = await query
  if (result.error || !result.data) fail(label, result.error ?? 'Sin filas visibles')
  ok(label, result.data.nombre ?? result.data.id)
  return result.data
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
  .select('ips_id,rol,estado,ips:ips_id(id,nombre,estado)')
  .eq('usuario_id', userId)
  .eq('estado', 'Activo')
if (memberships.error) fail('IPS permitidas', memberships.error)
const ips =
  (memberships.data ?? [])
    .map((row) => row.ips)
    .filter((row) => row?.estado === 'Activa')
    .find((row) => row.nombre?.toUpperCase().includes('GESTION SALUD')) ?? memberships.data?.[0]?.ips
if (!ips) fail('IPS activa', 'Usuario sin IPS activa visible')
ok('IPS activa', `${ips.nombre} (${ips.id})`)

const service = await first(
  'Servicio activo',
  supabase.from('servicios_ips').select('*').eq('ips_id', ips.id).eq('estado', 'Activo').limit(1).maybeSingle(),
)
const antimicrobial = await first(
  'Catálogo antimicrobianos',
  supabase.from('catalogo_antimicrobianos').select('*').eq('estado', 'Activo').limit(1).maybeSingle(),
)
const sampleType = await first(
  'Catálogo tipos de muestra',
  supabase.from('catalogo_tipos_muestra').select('*').eq('estado', 'Activo').limit(1).maybeSingle(),
)
const organism = await first(
  'Catálogo microorganismos',
  supabase.from('catalogo_microorganismos').select('*').limit(1).maybeSingle(),
)
const interventionCatalog = await first(
  'Catálogo intervenciones',
  supabase.from('catalogo_intervenciones').select('*').limit(1).maybeSingle(),
)

let patient = (
  await supabase
    .from('pacientes')
    .select('*')
    .eq('ips_id', ips.id)
    .eq('numero_identificacion', 'VALIDACION-6A')
    .maybeSingle()
).data
if (!patient) {
  const inserted = await supabase
    .from('pacientes')
    .insert({
      ips_id: ips.id,
      tipo_identificacion: 'CC',
      numero_identificacion: 'VALIDACION-6A',
      nombres: 'VALIDACION',
      apellidos: '6A',
      sexo: 'No especificado',
    })
    .select('*')
    .single()
  if (inserted.error) fail('Paciente validación', inserted.error)
  patient = inserted.data
}
ok('Paciente validación', patient.id)

const activeCases = await supabase
  .from('casos_proa')
  .select('*')
  .eq('ips_id', ips.id)
  .eq('paciente_id', patient.id)
  .eq('estado', 'Activo')
  .is('fecha_cierre', null)
if (activeCases.error) fail('Casos activos', activeCases.error)

let caseRow = activeCases.data?.[0]
if (!caseRow) {
  const inserted = await supabase
    .from('casos_proa')
    .insert({
      ips_id: ips.id,
      paciente_id: patient.id,
      fecha_apertura: now(),
      estado: 'Activo',
      ubicacion_actual: 'VALIDACION-6A',
      cama_actual: '6A-TEST',
    })
    .select('*')
    .single()
  if (inserted.error) fail('Crear caso activo', inserted.error)
  caseRow = inserted.data
}
if ((activeCases.data ?? []).length > 1) {
  ok('Advertencia casos activos', `${activeCases.data.length} casos activos existentes; UI debe confirmar nuevo episodio`)
} else {
  ok('Caso activo', caseRow.id)
}

const roundInsert = await supabase
  .from('rondas_proa')
  .insert({
    ips_id: ips.id,
    paciente_id: patient.id,
    caso_id: caseRow.id,
    servicio_id: service.id,
    fecha_hora_ronda: now(),
    cama: '6A-TEST',
    profesional_id: userId,
    tipo_valoracion: 'Seguimiento',
    tipo_terapia: 'Dirigida',
    evolucion_clinica: 'Estable',
    estado: 'Borrador',
  })
  .select('*')
  .single()
if (roundInsert.error) fail('Crear ronda borrador', roundInsert.error)
const round = roundInsert.data
ok('Crear ronda borrador', round.id)

const diagnosis = await supabase.from('diagnosticos_ronda').insert({
  ronda_id: round.id,
  codigo_cie10: 'J18.9',
  descripcion_cie10: 'VALIDACION-6A Neumonía no especificada',
  tipo_diagnostico: 'Principal',
})
if (diagnosis.error) fail('Diagnóstico', diagnosis.error)
ok('Diagnóstico')

async function upsertTreatment() {
  const existing = await supabase
    .from('tratamientos_antimicrobianos')
    .select('*')
    .eq('ronda_id', round.id)
    .eq('antimicrobiano_id', antimicrobial.id)
    .eq('fecha_inicio', today())
    .limit(1)
    .maybeSingle()
  if (existing.error) fail('Buscar tratamiento idempotente', existing.error)

  const payload = {
    ips_id: ips.id,
    paciente_id: patient.id,
    caso_id: caseRow.id,
    ronda_id: round.id,
    antimicrobiano_id: antimicrobial.id,
    antimicrobiano: antimicrobial.nombre,
    dosis: 1,
    unidad: 'g',
    frecuencia: 'cada 8 h',
    via: 'IV',
    fecha_inicio: today(),
    estado: 'Activo',
  }

  const result = existing.data
    ? await supabase.from('tratamientos_antimicrobianos').update(payload).eq('id', existing.data.id).select('*').single()
    : await supabase.from('tratamientos_antimicrobianos').insert(payload).select('*').single()
  if (result.error) fail('Guardar tratamiento', result.error)
  return result.data
}

const treatment = await upsertTreatment()
await upsertTreatment()
const treatmentCount = await supabase
  .from('tratamientos_antimicrobianos')
  .select('id', { count: 'exact', head: true })
  .eq('ronda_id', round.id)
  .eq('antimicrobiano_id', antimicrobial.id)
  .eq('fecha_inicio', today())
if (treatmentCount.error) fail('Tratamiento sin duplicado', treatmentCount.error)
if (treatmentCount.count !== 1) fail('Tratamiento sin duplicado', `conteo ${treatmentCount.count}`)
ok('Tratamiento sin duplicado', treatment.id)

const micro = await supabase
  .from('microbiologia')
  .insert({
    ips_id: ips.id,
    caso_id: caseRow.id,
    ronda_id: round.id,
    tipo_muestra_id: sampleType.id,
    tipo_muestra: sampleType.nombre,
    fecha_toma: now(),
    fecha_resultado: now(),
    estado_resultado: 'Disponible',
    resultado_general: 'Positivo',
    microorganismo_id: organism.id,
    microorganismo: organism.nombre,
    tipo_germen: organism.tipo_germen ?? null,
    es_muestra_control: false,
    impacto_conducta: 'Sí',
  })
  .select('*')
  .single()
if (micro.error) fail('Microbiología positiva', micro.error)
ok('Microbiología positiva', micro.data.id)

const intervention = await supabase
  .from('intervenciones_proa')
  .insert({
    ips_id: ips.id,
    ronda_id: round.id,
    hubo_intervencion: true,
    tipo_intervencion_id: interventionCatalog.id,
    tipo_intervencion: interventionCatalog.nombre,
    origen_intervencion: 'Valoración clínica',
    recomendacion: 'Validación 6A',
    aceptacion: 'Pendiente',
    cumplimiento_guia: 'No evaluable',
  })
  .select('*')
  .single()
if (intervention.error) fail('Intervención', intervention.error)
ok('Intervención', intervention.data.id)

const generated = [
  '## EVOLUCIÓN PROA',
  '',
  `Paciente: ${patient.nombres} ${patient.apellidos}`,
  `Tratamiento antimicrobiano: ${antimicrobial.nombre}`,
  `Microbiología: ${sampleType.nombre} positivo para ${organism.nombre}`,
  `Intervención PROA: ${interventionCatalog.nombre ?? 'intervención registrada'}`,
].join('\n')
const note = await supabase
  .from('notas_proa')
  .insert({ ronda_id: round.id, texto_generado: generated, texto_final: `${generated}\n\nEdición manual 6A.`, version: 1 })
  .select('*')
  .single()
if (note.error) fail('Nota editable', note.error)
if (note.data.texto_generado === note.data.texto_final) fail('Nota editable', 'texto_generado y texto_final quedaron iguales')
ok('Nota editable', note.data.id)

await supabase.auth.signOut()
ok('Logout')
