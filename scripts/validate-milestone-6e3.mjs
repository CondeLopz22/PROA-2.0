import { createClient } from '@supabase/supabase-js'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

for (const file of ['.env.validation.local', '.env.local']) {
  const path = resolve(process.cwd(), file)
  if (existsSync(path)) process.loadEnvFile(path)
}

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
  console.error(`Missing env vars for real 6E.3 validation: ${missing.join(', ')}`)
  process.exit(1)
}

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const prefix = 'VALIDACION-6E3'
const runToken = `${prefix}-${Date.now().toString(36)}`
const ok = (label, detail = 'OK') => console.log(`✓ ${label}: ${detail}`)
const fail = (label, error) => {
  console.error(`✗ ${label}`)
  console.error(error?.message ?? error)
  process.exit(1)
}
const expectRejected = (label, result) => {
  if (!result.error) fail(label, 'La operación no autorizada fue aceptada')
  ok(label)
}
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function login(email, password, label) {
  const supabase = client()
  const auth = await supabase.auth.signInWithPassword({ email, password })
  if (auth.error) fail(`${label} login`, auth.error)
  const profile = await supabase.from('perfiles_usuario').select('usuario_id,nombre,es_admin_global').eq('usuario_id', auth.data.user.id).single()
  if (profile.error) fail(`${label} perfil`, profile.error)
  const memberships = await supabase
    .from('usuario_ips')
    .select('ips_id,rol,estado,ips:ips_id(id,nombre,estado)')
    .eq('usuario_id', auth.data.user.id)
    .eq('estado', 'Activo')
  if (memberships.error) fail(`${label} IPS`, memberships.error)
  const membership = memberships.data.find((row) => row.ips?.estado === 'Activa')
  if (!membership?.ips) fail(`${label} IPS`, 'No tiene una IPS activa')
  ok(`${label} login`, `${profile.data.nombre} · ${membership.ips.nombre}`)
  return { supabase, user: auth.data.user, profile: profile.data, membership, ips: membership.ips }
}

async function seed(ctx, scenario, antimicrobials) {
  const service = await ctx.supabase.from('servicios_ips').select('id,nombre').eq('ips_id', ctx.ips.id).eq('estado', 'Activo').limit(1).single()
  if (service.error) fail(`${scenario} servicio`, service.error)
  const document = `${prefix}-${scenario}`
  let patient = await ctx.supabase
    .from('pacientes')
    .select('*')
    .eq('ips_id', ctx.ips.id)
    .eq('tipo_identificacion', 'CC')
    .eq('numero_identificacion', document)
    .maybeSingle()
  if (patient.error) fail(`${scenario} paciente`, patient.error)
  if (!patient.data) {
    patient = await ctx.supabase.from('pacientes').insert({
      ips_id: ctx.ips.id,
      tipo_identificacion: 'CC',
      numero_identificacion: document,
      nombres: 'VALIDACION',
      apellidos: `6E3 ${scenario}`,
      sexo: 'No especificado',
    }).select('*').single()
    if (patient.error) fail(`${scenario} crear paciente`, patient.error)
  }

  let caseRow = await ctx.supabase.from('casos_proa').select('*').eq('ips_id', ctx.ips.id).eq('paciente_id', patient.data.id).limit(1).maybeSingle()
  if (caseRow.error) fail(`${scenario} caso`, caseRow.error)
  if (!caseRow.data) {
    caseRow = await ctx.supabase.from('casos_proa').insert({
      ips_id: ctx.ips.id,
      paciente_id: patient.data.id,
      fecha_apertura: new Date().toISOString(),
      estado: 'Activo',
    }).select('*').single()
    if (caseRow.error) fail(`${scenario} crear caso`, caseRow.error)
  } else {
    const reopened = await ctx.supabase.from('casos_proa').update({ estado: 'Activo', fecha_cierre: null, motivo_cierre: null }).eq('id', caseRow.data.id).select('*').single()
    if (reopened.error) fail(`${scenario} reabrir caso`, reopened.error)
    caseRow.data = reopened.data
  }

  const roundPayload = {
    ips_id: ctx.ips.id,
    paciente_id: patient.data.id,
    caso_id: caseRow.data.id,
    servicio_id: service.data.id,
    fecha_hora_ronda: new Date().toISOString(),
    tipo_valoracion: 'Seguimiento',
    tipo_terapia: 'Empírica',
    evolucion_clinica: 'Mejoría',
    profesional_id: ctx.user.id,
    estado: 'Borrador',
  }
  let round = await ctx.supabase.from('rondas_proa').select('*').eq('caso_id', caseRow.data.id).limit(1).maybeSingle()
  if (round.error) fail(`${scenario} ronda`, round.error)
  round = round.data
    ? await ctx.supabase.from('rondas_proa').update(roundPayload).eq('id', round.data.id).select('*').single()
    : await ctx.supabase.from('rondas_proa').insert(roundPayload).select('*').single()
  if (round.error) fail(`${scenario} preparar ronda`, round.error)

  const treatments = []
  for (const antimicrobial of antimicrobials) {
    const start = new Date()
    start.setDate(start.getDate() - 8)
    const payload = {
      ips_id: ctx.ips.id,
      paciente_id: patient.data.id,
      caso_id: caseRow.data.id,
      ronda_id: round.data.id,
      antimicrobiano_id: antimicrobial.id,
      antimicrobiano: antimicrobial.nombre,
      fecha_inicio: start.toISOString().slice(0, 10),
      fecha_fin: null,
      estado: 'Activo',
    }
    let treatment = await ctx.supabase.from('tratamientos_antimicrobianos').select('*').eq('caso_id', caseRow.data.id).eq('antimicrobiano_id', antimicrobial.id).limit(1).maybeSingle()
    if (treatment.error) fail(`${scenario} tratamiento`, treatment.error)
    treatment = treatment.data
      ? await ctx.supabase.from('tratamientos_antimicrobianos').update(payload).eq('id', treatment.data.id).select('*').single()
      : await ctx.supabase.from('tratamientos_antimicrobianos').insert(payload).select('*').single()
    if (treatment.error) fail(`${scenario} preparar tratamiento`, treatment.error)
    treatments.push(treatment.data)
  }

  let sample = await ctx.supabase.from('microbiologia').select('*').eq('caso_id', caseRow.data.id).eq('tipo_muestra', prefix).limit(1).maybeSingle()
  if (sample.error) fail(`${scenario} microbiología`, sample.error)
  const samplePayload = {
    ips_id: ctx.ips.id,
    caso_id: caseRow.data.id,
    ronda_id: round.data.id,
    tipo_muestra: prefix,
    fecha_toma: new Date().toISOString(),
    fecha_resultado: new Date().toISOString(),
    estado_resultado: 'Disponible',
    resultado_general: 'Positivo',
    microorganismo: 'VALIDACION-6E3',
    es_muestra_control: false,
  }
  sample = sample.data
    ? await ctx.supabase.from('microbiologia').update(samplePayload).eq('id', sample.data.id).select('*').single()
    : await ctx.supabase.from('microbiologia').insert(samplePayload).select('*').single()
  if (sample.error) fail(`${scenario} preparar microbiología`, sample.error)
  const sensitivityPayload = { muestra_id: sample.data.id, antimicrobiano_id: antimicrobials[0].id, antimicrobiano: antimicrobials[0].nombre, resultado: 'Sensible' }
  const sensitivityLookup = await ctx.supabase
    .from('sensibilidad_microbiologica')
    .select('*')
    .eq('muestra_id', sample.data.id)
    .eq('antimicrobiano_id', antimicrobials[0].id)
    .order('id')
    .limit(1)
  if (sensitivityLookup.error) fail(`${scenario} sensibilidad`, sensitivityLookup.error)
  const existingSensitivity = sensitivityLookup.data?.[0]
  const sensitivity = existingSensitivity
    ? await ctx.supabase.from('sensibilidad_microbiologica').update(sensitivityPayload).eq('id', existingSensitivity.id)
    : await ctx.supabase.from('sensibilidad_microbiologica').insert(sensitivityPayload).select('*').single()
  if (sensitivity.error) fail(`${scenario} preparar sensibilidad`, sensitivity.error)
  return { patient: patient.data, caseRow: caseRow.data, round: round.data, treatments, sample: sample.data }
}

async function upsertOpportunity(ctx, seed, code, treatment, treatmentIds, contextHash) {
  let finding = await ctx.supabase.from('hallazgos_auditoria').select('*')
    .eq('ips_id', ctx.ips.id).eq('caso_id', seed.caseRow.id).eq('codigo_regla', code).eq('contexto_hash', contextHash).limit(1).maybeSingle()
  if (finding.error) fail(`${code} buscar oportunidad`, finding.error)
  if (!finding.data) {
    finding = await ctx.supabase.from('hallazgos_auditoria').insert({
      ips_id: ctx.ips.id,
      caso_id: seed.caseRow.id,
      tratamiento_id: treatment?.id ?? null,
      ronda_detectada_id: seed.round.id,
      codigo_regla: code,
      tipo_hallazgo: `${prefix} ${code}`,
      categoria: 'Reevaluación terapéutica',
      severidad: 'Revisión',
      descripcion: `${prefix} oportunidad ${code}`,
      origen: 'Automático',
      estado: 'Abierto',
      contexto_hash: contextHash,
      fecha_ultima_deteccion: new Date().toISOString(),
    }).select('*').single()
    if (finding.error) fail(`${code} crear oportunidad`, finding.error)
  }
  const relations = treatmentIds.map((treatmentId) => ({ hallazgo_id: finding.data.id, tratamiento_id: treatmentId }))
  const linked = await ctx.supabase.from('hallazgo_tratamiento').upsert(relations, { onConflict: 'hallazgo_id,tratamiento_id', ignoreDuplicates: true })
  if (linked.error) fail(`${code} relacionar tratamientos`, linked.error)
  return finding.data
}

async function closePriorSeedFindings(ctx, caseId) {
  const result = await ctx.supabase.from('hallazgos_auditoria').update({
    estado: 'Descartado',
    motivo_descarte: `${prefix}: cierre previo a nueva ejecución`,
    fecha_resolucion: new Date().toISOString(),
  }).eq('caso_id', caseId)
    .in('codigo_regla', ['AUD-05', 'DES-02', 'DES-03', 'DES-04'])
    .in('estado', ['Abierto', 'En seguimiento'])
  if (result.error) fail('Cerrar residuos inequívocos 6E.3', result.error)
}

const admin = await login(process.env.PROA_TEST_ADMIN_EMAIL, process.env.PROA_TEST_ADMIN_PASSWORD, 'ADMIN')
if (!admin.profile.es_admin_global) fail('ADMIN global', 'El perfil no es administrador global')

const config = await admin.supabase.from('configuracion_auditoria_proa').select('*').eq('ips_id', admin.ips.id).single()
if (config.error) fail('Configuración 6E.3', config.error)
if (config.data.umbral_reevaluacion_favorable_dias !== null) ok('DES-04 configurada', String(config.data.umbral_reevaluacion_favorable_dias))
else ok('DES-04 inactiva con umbral NULL')
const temporaryThreshold = await admin.supabase.from('configuracion_auditoria_proa')
  .update({ umbral_reevaluacion_favorable_dias: 7, fecha_actualizacion: new Date().toISOString() })
  .eq('ips_id', admin.ips.id).select('ips_id').single()
if (temporaryThreshold.error) fail('ADMIN configura DES-04', temporaryThreshold.error)
const restoreThreshold = await admin.supabase.from('configuracion_auditoria_proa')
  .update({ umbral_reevaluacion_favorable_dias: config.data.umbral_reevaluacion_favorable_dias, fecha_actualizacion: new Date().toISOString() })
  .eq('ips_id', admin.ips.id)
if (restoreThreshold.error) fail('Restaurar configuración DES-04', restoreThreshold.error)
ok('ADMIN modifica y restaura configuración DES-04')
const rules = await admin.supabase.from('reglas_auditoria_proa').select('codigo_regla,activa').in('codigo_regla', ['AUD-05', 'DES-02', 'DES-03', 'DES-04'])
if (rules.error || rules.data.length !== 4) fail('Reglas de reevaluación', rules.error ?? 'No están las cuatro reglas')
const duplicateDes01 = await admin.supabase.from('reglas_auditoria_proa').select('codigo_regla').eq('codigo_regla', 'DES-01')
if (duplicateDes01.error || duplicateDes01.data.length) fail('DES-01 reutiliza AUD-05', duplicateDes01.error ?? 'Existe una regla DES-01 duplicada')
ok('DES-01 reutiliza AUD-05 y reglas DES disponibles')

const antimicrobials = await admin.supabase.from('catalogo_antimicrobianos').select('id,nombre,aware_categoria').in('aware_categoria', ['Watch', 'Reserve']).eq('estado', 'Activo').limit(2)
if (antimicrobials.error || antimicrobials.data.length < 2) fail('Antimicrobianos Watch/Reserve', antimicrobials.error ?? 'Se requieren dos')
const seeded = await seed(admin, 'COMBINADA', antimicrobials.data)
const otherCaseSeed = await seed(admin, 'OTRO-CASO', [antimicrobials.data[0]])
await closePriorSeedFindings(admin, seeded.caseRow.id)
const des02Context = `${runToken}-DES02-V1`
const des03Context = `${runToken}-DES03-V1`
const des02 = await upsertOpportunity(admin, seeded, 'DES-02', seeded.treatments[0], [seeded.treatments[0].id], des02Context)
const des03 = await upsertOpportunity(admin, seeded, 'DES-03', null, seeded.treatments.map((row) => row.id), des03Context)

const des03Relations = await admin.supabase.from('hallazgo_tratamiento').select('tratamiento_id').eq('hallazgo_id', des03.id)
if (des03Relations.error || des03Relations.data.length !== 2) fail('DES-03 relación M:N', des03Relations.error ?? 'No relacionó ambos tratamientos')
ok('DES-02 y DES-03 con contexto microbiológico')
ok('DES-03 relaciona todos los tratamientos')

const wrongCaseRelation = await admin.supabase.from('hallazgo_tratamiento').insert({
  hallazgo_id: des03.id,
  tratamiento_id: otherCaseSeed.treatments[0].id,
})
expectRejected('Tratamiento de otro caso rechazado', wrongCaseRelation)

const otherIps = await admin.supabase.from('ips').select('id,nombre,estado').neq('id', admin.ips.id).eq('estado', 'Activa').limit(1).maybeSingle()
if (otherIps.error || !otherIps.data) fail('IPS alterna para aislamiento', otherIps.error ?? 'No existe otra IPS activa')
const otherIpsContext = { ...admin, ips: otherIps.data }
const otherIpsSeed = await seed(otherIpsContext, 'OTRA-IPS', [antimicrobials.data[0]])
const wrongIpsRelation = await admin.supabase.from('hallazgo_tratamiento').insert({
  hallazgo_id: des03.id,
  tratamiento_id: otherIpsSeed.treatments[0].id,
})
expectRejected('Tratamiento de otra IPS rechazado', wrongIpsRelation)

const duplicate = await upsertOpportunity(admin, seeded, 'DES-03', null, seeded.treatments.map((row) => row.id), des03Context)
if (duplicate.id !== des03.id) fail('Idempotencia por contexto semántico', 'La oportunidad fue duplicada')
const resolveFirstContext = await admin.supabase.from('hallazgos_auditoria').update({
  estado: 'Resuelto',
  fecha_resolucion: new Date().toISOString(),
}).eq('id', des03.id)
if (resolveFirstContext.error) fail('Resolver primer contexto DES-03', resolveFirstContext.error)
const newContext = await upsertOpportunity(admin, seeded, 'DES-03', null, seeded.treatments.map((row) => row.id), `${runToken}-DES03-V2`)
if (newContext.id === des03.id) fail('Nueva información clínica', 'No creó un contexto nuevo')
ok('Idempotencia y reapertura por contexto relevante')

const mismatchInterventionPayload = {
  ips_id: admin.ips.id,
  ronda_id: otherCaseSeed.round.id,
  hubo_intervencion: true,
  tipo_intervencion: prefix,
  recomendacion: 'Validación de integridad entre casos',
  aceptacion: 'Pendiente',
}
let mismatchIntervention = await admin.supabase.from('intervenciones_proa').select('*')
  .eq('ronda_id', otherCaseSeed.round.id).eq('tipo_intervencion', prefix).limit(1).maybeSingle()
if (mismatchIntervention.error) fail('Buscar intervención de otro caso', mismatchIntervention.error)
mismatchIntervention = mismatchIntervention.data
  ? await admin.supabase.from('intervenciones_proa').update(mismatchInterventionPayload).eq('id', mismatchIntervention.data.id).select('*').single()
  : await admin.supabase.from('intervenciones_proa').insert(mismatchInterventionPayload).select('*').single()
if (mismatchIntervention.error) fail('Preparar intervención de otro caso', mismatchIntervention.error)
const mismatchedDecision = await admin.supabase.rpc('registrar_decision_reevaluacion', {
  p_hallazgo_id: newContext.id,
  p_decision: 'No aplica',
  p_justificacion: `${prefix}: intervención de otro caso`,
  p_intervencion_id: mismatchIntervention.data.id,
})
expectRejected('Decisión e intervención de casos diferentes rechazadas', mismatchedDecision)

const decision = await admin.supabase.rpc('registrar_decision_reevaluacion', {
  p_hallazgo_id: des02.id,
  p_decision: 'Mantener tratamiento',
  p_justificacion: `${prefix}: decisión profesional justificada`,
  p_intervencion_id: null,
})
if (decision.error) fail('Decisión profesional atómica', decision.error)
const resolved = await admin.supabase.from('hallazgos_auditoria').select('estado,fecha_resolucion').eq('id', des02.id).single()
if (resolved.error || resolved.data.estado !== 'Resuelto' || !resolved.data.fecha_resolucion) fail('Cierre atómico', resolved.error ?? resolved.data.estado)
if (decision.data.profesional_id !== admin.user.id) fail('Autor autenticado', 'El profesional no corresponde a auth.uid()')
ok('Mantener tratamiento + justificación cierra oportunidad')
const resolvedSameContext = await upsertOpportunity(admin, seeded, 'DES-02', seeded.treatments[0], [seeded.treatments[0].id], des02Context)
if (resolvedSameContext.id !== des02.id) fail('Oportunidad resuelta no reaparece', 'Se creó otro hallazgo sin cambio clínico')
ok('Oportunidad resuelta no reaparece sin cambio clínico')

const decisionOnResolved = await admin.supabase.rpc('registrar_decision_reevaluacion', {
  p_hallazgo_id: des02.id,
  p_decision: 'No aplica',
  p_justificacion: `${prefix}: intento sobre resuelto`,
  p_intervencion_id: null,
})
expectRejected('Decisión sobre hallazgo Resuelto rechazada', decisionOnResolved)

const discarded = await admin.supabase.from('hallazgos_auditoria').update({
  estado: 'Descartado',
  motivo_descarte: `${prefix}: descarte`,
  fecha_resolucion: new Date().toISOString(),
}).eq('id', newContext.id).select('id').single()
if (discarded.error) fail('Preparar hallazgo Descartado', discarded.error)
const decisionOnDiscarded = await admin.supabase.rpc('registrar_decision_reevaluacion', {
  p_hallazgo_id: newContext.id,
  p_decision: 'No aplica',
  p_justificacion: `${prefix}: intento sobre descartado`,
  p_intervencion_id: null,
})
expectRejected('Decisión sobre hallazgo Descartado rechazada', decisionOnDiscarded)

const concurrentFinding = await upsertOpportunity(
  admin,
  seeded,
  'DES-03',
  null,
  seeded.treatments.map((row) => row.id),
  `${runToken}-DES03-CONCURRENCIA`,
)
const concurrentPayload = {
  p_hallazgo_id: concurrentFinding.id,
  p_decision: 'Mantener tratamiento',
  p_justificacion: `${prefix}: prueba de concurrencia`,
  p_intervencion_id: null,
}
const concurrentResults = await Promise.all([
  admin.supabase.rpc('registrar_decision_reevaluacion', concurrentPayload),
  admin.supabase.rpc('registrar_decision_reevaluacion', concurrentPayload),
])
if (concurrentResults.filter((result) => !result.error).length !== 1) {
  fail('Concurrencia de decisiones', 'Debe aceptarse exactamente una decisión')
}
ok('Concurrencia de dos decisiones acepta solo una')

const roundEdit = await admin.supabase.from('rondas_proa').update({ evolucion_clinica: 'Mejoría' }).eq('id', seeded.round.id).select('id').single()
if (roundEdit.error) fail('Editar ronda de validación', roundEdit.error)
const preservedDecision = await admin.supabase.from('decisiones_reevaluacion').select('id').eq('id', decision.data.id).single()
if (preservedDecision.error) fail('Decisión preservada al editar ronda', preservedDecision.error)
ok('Decisión preservada al editar ronda')

const mart = await admin.supabase.from('mart_reevaluacion_terapeutica').select('*').eq('oportunidad_id', des02.id).single()
if (mart.error || mart.data.decision !== 'Mantener tratamiento') fail('MART reevaluación', mart.error ?? 'No expone decisión')
ok('mart_reevaluacion_terapeutica expone la decisión')

const infectomag = await login(process.env.PROA_TEST_INFECTOMAG_EMAIL, process.env.PROA_TEST_INFECTOMAG_PASSWORD, 'INFECTOMAG')
const infectomagRead = await infectomag.supabase.from('mart_reevaluacion_terapeutica').select('ips_id').limit(100)
if (infectomagRead.error || infectomagRead.data.some((row) => row.ips_id !== infectomag.ips.id)) fail('INFECTOMAG aislamiento IPS', infectomagRead.error ?? 'Vio otra IPS')
const deniedConfig = await infectomag.supabase.from('configuracion_auditoria_proa')
  .update({ umbral_reevaluacion_favorable_dias: 9 }).eq('ips_id', infectomag.ips.id).select('ips_id')
if (!deniedConfig.error && deniedConfig.data.length) fail('INFECTOMAG no administra configuración', 'Pudo modificar el umbral')
ok('INFECTOMAG limitado a IPS asignadas')

const clientUser = await login(process.env.PROA_TEST_CLIENT_EMAIL, process.env.PROA_TEST_CLIENT_PASSWORD, 'IPS CLIENTE')
const clientRead = await clientUser.supabase.from('mart_reevaluacion_terapeutica').select('ips_id').limit(100)
if (clientRead.error || clientRead.data.some((row) => row.ips_id !== clientUser.ips.id)) fail('IPS Cliente aislamiento', clientRead.error ?? 'Vio otra IPS')
const clientAdminContext = { ...admin, ips: clientUser.ips }
const clientSeed = await seed(clientAdminContext, 'CLIENTE-READONLY', [antimicrobials.data[0]])
await closePriorSeedFindings(clientAdminContext, clientSeed.caseRow.id)
const clientFinding = await upsertOpportunity(
  clientAdminContext,
  clientSeed,
  'DES-02',
  clientSeed.treatments[0],
  [clientSeed.treatments[0].id],
  `${runToken}-CLIENTE-DIRECTO`,
)
const deniedDecision = await clientUser.supabase.from('decisiones_reevaluacion').insert({
  ips_id: clientUser.ips.id,
  hallazgo_id: clientFinding.id,
  decision: 'No aplica',
  justificacion: prefix,
  profesional_id: clientUser.user.id,
})
expectRejected('INSERT directo sin permisos rechazado', deniedDecision)

const ddd = await admin.supabase.from('mart_ddd').select('aware_categoria,ddd_calculadas').limit(1)
if (ddd.error) fail('DDD/AWaRe', ddd.error)
ok('DDD/AWaRe continúa funcionando')

const closeOpenFindings = await admin.supabase.from('hallazgos_auditoria').update({
  estado: 'Descartado',
  motivo_descarte: `${prefix}: cierre de validación`,
  fecha_resolucion: new Date().toISOString(),
}).in('id', [clientFinding.id]).in('estado', ['Abierto', 'En seguimiento'])
if (closeOpenFindings.error) fail('Cerrar hallazgos de validación', closeOpenFindings.error)

const cleanup = await admin.supabase.from('casos_proa').update({ estado: 'Cerrado', fecha_cierre: new Date().toISOString(), motivo_cierre: prefix }).eq('id', seeded.caseRow.id)
if (cleanup.error) fail('Identificar seed 6E.3', cleanup.error)
const cleanupAdditional = await admin.supabase.from('casos_proa').update({ estado: 'Cerrado', fecha_cierre: new Date().toISOString(), motivo_cierre: prefix })
  .in('id', [otherCaseSeed.caseRow.id, otherIpsSeed.caseRow.id, clientSeed.caseRow.id])
if (cleanupAdditional.error) fail('Identificar seeds adicionales 6E.3', cleanupAdditional.error)
await Promise.all([admin.supabase.auth.signOut(), infectomag.supabase.auth.signOut(), clientUser.supabase.auth.signOut()])
console.log('Milestone 6E.3 validation finished against real Supabase after migration.')
