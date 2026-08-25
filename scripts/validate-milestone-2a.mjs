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

const signIn = await supabase.auth.signInWithPassword({
  email: process.env.PROA_TEST_EMAIL,
  password: process.env.PROA_TEST_PASSWORD,
})
if (signIn.error) fail('1. Login', signIn.error)
const userId = signIn.data.user.id
ok('1. Login', userId)

const memberships = await supabase
  .from('usuario_ips')
  .select('ips_id,rol,estado,ips:ips_id(id,nombre,estado)')
  .eq('usuario_id', userId)
  .eq('estado', 'Activo')
if (memberships.error) fail('2. usuario_ips', memberships.error)

const allowedIps = (memberships.data ?? [])
  .map((row) => ({ ...row.ips, rol: row.rol }))
  .filter((ips) => ips?.estado === 'Activa')
const gestion =
  allowedIps.find((ips) => ips.nombre?.toUpperCase().includes('GESTION SALUD')) ??
  allowedIps.find((ips) => ips.id === process.env.PROA_TEST_IPS_ID) ??
  allowedIps[0]
if (!gestion) fail('2. IPS GESTION SALUD', 'No hay IPS activa asignada al usuario')
ok('2. IPS GESTION SALUD', `${gestion.nombre} (${gestion.id})`)

const patientResult = process.env.PROA_TEST_PATIENT_NUMBER
  ? await supabase
      .from('pacientes')
      .select('*')
      .eq('ips_id', gestion.id)
      .eq('tipo_identificacion', process.env.PROA_TEST_PATIENT_TYPE ?? 'CC')
      .eq('numero_identificacion', process.env.PROA_TEST_PATIENT_NUMBER)
      .maybeSingle()
  : await supabase.from('pacientes').select('*').eq('ips_id', gestion.id).limit(1).maybeSingle()
if (patientResult.error || !patientResult.data) fail('3. Paciente visible', patientResult.error ?? 'No patient')
const patient = patientResult.data
ok('3. Paciente visible', `${patient.tipo_identificacion} ${patient.numero_identificacion}`)

const caseResult = await supabase
  .from('casos_proa')
  .insert({
    ips_id: gestion.id,
    paciente_id: patient.id,
    fecha_apertura: now(),
    estado: 'Activo',
    ubicacion_actual: 'Validación 2A',
    cama_actual: 'T-2A',
  })
  .select('*')
  .single()
if (caseResult.error) fail('4. Crear caso con fecha_apertura', caseResult.error)
const caseId = caseResult.data.id
ok('4. Crear caso con fecha_apertura', caseId)

const roundResult = await supabase
  .from('rondas_proa')
  .insert({
    ips_id: gestion.id,
    paciente_id: patient.id,
    caso_id: caseId,
    fecha_hora_ronda: now(),
    ubicacion: 'Validación 2A',
    cama: 'T-2A',
    profesional_id: userId,
    tipo_valoracion: 'Primera valoración',
    estado: 'Borrador',
  })
  .select('*')
  .single()
if (roundResult.error) fail('5. Crear ronda con fecha_hora_ronda', roundResult.error)
const roundId = roundResult.data.id
ok('5. Crear ronda con fecha_hora_ronda', roundId)

const roundUpdate = await supabase
  .from('rondas_proa')
  .update({ tipo_terapia: 'Empírica', evolucion_clinica: 'Estable', estado: 'Borrador' })
  .eq('id', roundId)
  .select('id,tipo_terapia,evolucion_clinica,estado')
  .single()
if (roundUpdate.error) fail('6. Guardar tipo_terapia/evolucion_clinica', roundUpdate.error)
if (roundUpdate.data.tipo_terapia !== 'Empírica' || roundUpdate.data.evolucion_clinica !== 'Estable') {
  fail('6. Guardar tipo_terapia/evolucion_clinica', 'Valores no persistieron')
}
ok('6. Guardar tipo_terapia/evolucion_clinica')

async function replaceDiagnosis() {
  const deleted = await supabase.from('diagnosticos_ronda').delete().eq('ronda_id', roundId)
  if (deleted.error) throw deleted.error
  return supabase
    .from('diagnosticos_ronda')
    .insert({
      ronda_id: roundId,
      codigo_cie10: 'J18.9',
      descripcion_cie10: 'Neumonía, no especificada',
      tipo_diagnostico: 'Principal',
      categoria_proa: 'Infección respiratoria',
    })
    .select('*')
}

const diagnosis = await replaceDiagnosis()
if (diagnosis.error) fail('7. Insertar diagnóstico real', diagnosis.error)
ok('7. Insertar diagnóstico real', `${diagnosis.data.length} fila(s)`)

const antimicrobialCatalog = await supabase.from('catalogo_antimicrobianos').select('*').limit(1).maybeSingle()
if (antimicrobialCatalog.error || !antimicrobialCatalog.data) {
  fail('8. Catálogo antimicrobianos', antimicrobialCatalog.error ?? 'Catálogo vacío')
}
const antimicrobial = antimicrobialCatalog.data
const antimicrobialName =
  antimicrobial.nombre ?? antimicrobial.antimicrobiano ?? antimicrobial.descripcion ?? antimicrobial.codigo ?? antimicrobial.id

const treatment = await supabase
  .from('tratamientos_antimicrobianos')
  .insert({
    ips_id: gestion.id,
    paciente_id: patient.id,
    caso_id: caseId,
    ronda_id: roundId,
    antimicrobiano_id: antimicrobial.id,
    antimicrobiano: antimicrobialName,
    dosis: 1,
    unidad: 'g',
    frecuencia: 'cada 8 h',
    via: 'IV',
    fecha_inicio: today(),
    duracion_prevista_dias: 7,
    estado: 'Activo',
  })
  .select('*')
  .single()
if (treatment.error) fail('8. Agregar antimicrobiano real', treatment.error)
ok('8. Agregar antimicrobiano real', treatment.data.id)

const historyStart = await supabase.from('historial_tratamiento').insert({
  tratamiento_id: treatment.data.id,
  ronda_id: roundId,
  accion: 'Inicio',
  valor_nuevo: antimicrobialName,
  fecha_evento: now(),
})
if (historyStart.error) fail('9. Historial Inicio', historyStart.error)
ok('9. Historial Inicio')

const continuation = await supabase.from('historial_tratamiento').insert({
  tratamiento_id: treatment.data.id,
  ronda_id: roundId,
  accion: 'Continuación',
  fecha_evento: now(),
})
if (continuation.error) fail('10. Continuación', continuation.error)
ok('10. Continuación')

const previousFrequency = treatment.data.frecuencia
const newFrequency = 'cada 12 h'
const modificationHistory = await supabase
  .from('historial_tratamiento')
  .insert({
    tratamiento_id: treatment.data.id,
    ronda_id: roundId,
    accion: 'Modificación',
    campo_modificado: 'frecuencia',
    valor_anterior: previousFrequency,
    valor_nuevo: newFrequency,
    motivo: 'Ajuste por función renal',
    fecha_evento: now(),
  })
  .select('*')
  .single()
if (modificationHistory.error) fail('11. Historial Modificación', modificationHistory.error)
if (modificationHistory.data.valor_anterior !== previousFrequency || modificationHistory.data.valor_nuevo !== newFrequency) {
  fail('12. Valor anterior/nuevo', 'El historial no conserva valores anterior/nuevo')
}

const modification = await supabase
  .from('tratamientos_antimicrobianos')
  .update({ frecuencia: newFrequency, fecha_ultima_modificacion: now() })
  .eq('id', treatment.data.id)
  .select('id,frecuencia')
  .single()
if (modification.error) fail('11. Modificación', modification.error)
ok('11-12. Modificación + valores anterior/nuevo')

const suspension = await supabase
  .from('tratamientos_antimicrobianos')
  .update({ estado: 'Suspendido', fecha_fin: today(), fecha_ultima_modificacion: now() })
  .eq('id', treatment.data.id)
  .select('id,estado,fecha_fin')
  .single()
if (suspension.error) fail('13. Suspender con fecha_fin', suspension.error)
if (suspension.data.estado !== 'Suspendido' || !suspension.data.fecha_fin) {
  fail('14. Confirmar Suspendido', 'Estado o fecha_fin no persistieron')
}
const suspensionHistory = await supabase.from('historial_tratamiento').insert({
  tratamiento_id: treatment.data.id,
  ronda_id: roundId,
  accion: 'Suspensión',
  valor_anterior: 'Activo',
  valor_nuevo: 'Suspendido',
  motivo: 'Fin de tratamiento',
  fecha_evento: now(),
})
if (suspensionHistory.error) fail('13. Historial Suspensión', suspensionHistory.error)
ok('13-14. Suspensión con fecha_fin y estado Suspendido')

const diagnosisCountBefore = await supabase
  .from('diagnosticos_ronda')
  .select('id', { count: 'exact', head: true })
  .eq('ronda_id', roundId)
const treatmentCountBefore = await supabase
  .from('tratamientos_antimicrobianos')
  .select('id', { count: 'exact', head: true })
  .eq('ronda_id', roundId)
if (diagnosisCountBefore.error) fail('15. Conteo diagnósticos antes', diagnosisCountBefore.error)
if (treatmentCountBefore.error) fail('15. Conteo tratamientos antes', treatmentCountBefore.error)

const diagnosisReload = await replaceDiagnosis()
if (diagnosisReload.error) fail('15. Reabrir ronda/guardar diagnóstico idempotente', diagnosisReload.error)
const diagnosisCountAfter = await supabase
  .from('diagnosticos_ronda')
  .select('id', { count: 'exact', head: true })
  .eq('ronda_id', roundId)
const treatmentCountAfter = await supabase
  .from('tratamientos_antimicrobianos')
  .select('id', { count: 'exact', head: true })
  .eq('ronda_id', roundId)
if (diagnosisCountAfter.count !== diagnosisCountBefore.count || treatmentCountAfter.count !== treatmentCountBefore.count) {
  fail(
    '15. Reabrir sin duplicados',
    `Diagnósticos ${diagnosisCountBefore.count}->${diagnosisCountAfter.count}; tratamientos ${treatmentCountBefore.count}->${treatmentCountAfter.count}`,
  )
}
ok('15. Reabrir ronda sin duplicar diagnósticos ni tratamientos')

let forbiddenIpsId = process.env.PROA_FORBIDDEN_IPS_ID
if (!forbiddenIpsId) {
  const hujmb = await supabase.from('ips').select('id,nombre').ilike('nombre', '%HUJMB%').neq('id', gestion.id).limit(1).maybeSingle()
  if (!hujmb.error && hujmb.data) forbiddenIpsId = hujmb.data.id
}
if (forbiddenIpsId) {
  const forbidden = await supabase.from('pacientes').select('id').eq('ips_id', forbiddenIpsId).limit(1)
  if (forbidden.error) ok('16. RLS HUJMB bloqueado por error', forbidden.error.message)
  else if (!forbidden.data?.length) ok('16. RLS HUJMB sin filas visibles')
  else fail('16. RLS HUJMB', `Se vieron ${forbidden.data.length} paciente(s) de HUJMB`)

  const forbiddenInsert = await supabase
    .from('casos_proa')
    .insert({ ips_id: forbiddenIpsId, paciente_id: patient.id, fecha_apertura: now(), estado: 'Activo' })
    .select('id')
    .single()
  if (forbiddenInsert.error) ok('16. RLS insert HUJMB bloqueado', forbiddenInsert.error.message)
  else fail('16. RLS insert HUJMB', `Inserción cruzada permitida: ${forbiddenInsert.data.id}`)
} else {
  ok('16. RLS HUJMB', 'Sin PROA_FORBIDDEN_IPS_ID ni IPS HUJMB visible para probar')
}

await supabase.auth.signOut()
ok('Logout')
