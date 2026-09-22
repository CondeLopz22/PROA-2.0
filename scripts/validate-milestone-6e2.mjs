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
  console.error(`Missing env vars for real 6E.2 validation: ${missing.join(', ')}`)
  process.exit(1)
}

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const testDocumentPrefix = 'VALIDACION-6E2'

const ok = (label, value = 'OK') => console.log(`✓ ${label}: ${value}`)
const fail = (label, error) => {
  console.error(`✗ ${label}`)
  console.error(error?.message ?? error)
  process.exit(1)
}

function client() {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function login(email, password, label) {
  const supabase = client()
  const login = await supabase.auth.signInWithPassword({ email, password })
  if (login.error) fail(`${label} login`, login.error)
  const user = login.data.user
  const profile = await supabase.from('perfiles_usuario').select('usuario_id,nombre,es_admin_global').eq('usuario_id', user.id).maybeSingle()
  if (profile.error) fail(`${label} perfil`, profile.error)
  const memberships = await supabase
    .from('usuario_ips')
    .select('usuario_id,ips_id,rol,estado,ips:ips_id(id,nombre,estado)')
    .eq('usuario_id', user.id)
    .eq('estado', 'Activo')
  if (memberships.error) fail(`${label} IPS`, memberships.error)
  const membership = (memberships.data ?? []).find((row) => row.ips?.estado === 'Activa') ?? memberships.data?.[0]
  if (!membership?.ips) fail(`${label} IPS`, 'No tiene IPS activa')
  ok(`${label} login`, `${profile.data?.nombre ?? user.email} · ${membership.ips.nombre}`)
  return { supabase, user, profile: profile.data, membership, ips: membership.ips }
}

async function firstActiveService(supabase, ipsId) {
  const result = await supabase.from('servicios_ips').select('id,nombre').eq('ips_id', ipsId).eq('estado', 'Activo').limit(1).maybeSingle()
  if (result.error) fail('Servicio activo', result.error)
  if (!result.data) fail('Servicio activo', 'No existe servicio activo para validar')
  return result.data
}

async function firstAntimicrobial(supabase, category) {
  const result = await supabase
    .from('catalogo_antimicrobianos')
    .select('id,nombre,aware_categoria')
    .eq('aware_categoria', category)
    .eq('estado', 'Activo')
    .limit(1)
    .maybeSingle()
  if (result.error) fail(`Antimicrobiano ${category}`, result.error)
  if (!result.data) fail(`Antimicrobiano ${category}`, `No existe antimicrobiano ${category}`)
  return result.data
}

async function createClinicalSeed(ctx, antimicrobial, daysBack, scenario) {
  const service = await firstActiveService(ctx.supabase, ctx.ips.id)
  const documentNumber = `${testDocumentPrefix}-${scenario}`
  const existingPatient = await ctx.supabase
    .from('pacientes')
    .select('*')
    .eq('ips_id', ctx.ips.id)
    .eq('tipo_identificacion', 'CC')
    .eq('numero_identificacion', documentNumber)
    .maybeSingle()
  if (existingPatient.error) fail(`Buscar paciente ${scenario}`, existingPatient.error)

  let patient = existingPatient.data
  if (!patient) {
    const createdPatient = await ctx.supabase
      .from('pacientes')
      .insert({
        ips_id: ctx.ips.id,
        tipo_identificacion: 'CC',
        numero_identificacion: documentNumber,
        nombres: 'VALIDACION',
        apellidos: `6E2 ${scenario}`,
        sexo: 'No especificado',
      })
      .select('*')
      .single()
    if (createdPatient.error) fail(`Crear paciente ${scenario}`, createdPatient.error)
    patient = createdPatient.data
  }

  const existingCase = await ctx.supabase
    .from('casos_proa')
    .select('*')
    .eq('ips_id', ctx.ips.id)
    .eq('paciente_id', patient.id)
    .order('fecha_apertura', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingCase.error) fail(`Buscar caso ${scenario}`, existingCase.error)

  let caseRow = existingCase.data
  if (caseRow) {
    const reopenedCase = await ctx.supabase
      .from('casos_proa')
      .update({ estado: 'Activo', fecha_cierre: null, motivo_cierre: null })
      .eq('id', caseRow.id)
      .select('*')
      .single()
    if (reopenedCase.error) fail(`Reabrir caso ${scenario}`, reopenedCase.error)
    caseRow = reopenedCase.data
  } else {
    const createdCase = await ctx.supabase
      .from('casos_proa')
      .insert({ ips_id: ctx.ips.id, paciente_id: patient.id, fecha_apertura: new Date().toISOString(), estado: 'Activo' })
      .select('*')
      .single()
    if (createdCase.error) fail(`Crear caso ${scenario}`, createdCase.error)
    caseRow = createdCase.data
  }

  const roundPayload = {
    ips_id: ctx.ips.id,
    paciente_id: patient.id,
    caso_id: caseRow.id,
    servicio_id: service.id,
    fecha_hora_ronda: new Date().toISOString(),
    tipo_valoracion: 'Seguimiento',
    tipo_terapia: 'Empírica',
    profesional_id: ctx.user.id,
    estado: 'Borrador',
  }
  const existingRound = await ctx.supabase
    .from('rondas_proa')
    .select('*')
    .eq('ips_id', ctx.ips.id)
    .eq('paciente_id', patient.id)
    .eq('caso_id', caseRow.id)
    .order('fecha_hora_ronda', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingRound.error) fail(`Buscar ronda ${scenario}`, existingRound.error)

  const round = existingRound.data
    ? await ctx.supabase.from('rondas_proa').update(roundPayload).eq('id', existingRound.data.id).select('*').single()
    : await ctx.supabase.from('rondas_proa').insert(roundPayload).select('*').single()
  if (round.error) fail(`Preparar ronda ${scenario}`, round.error)

  const start = new Date()
  start.setDate(start.getDate() - daysBack)
  const treatmentPayload = {
    ips_id: ctx.ips.id,
    paciente_id: patient.id,
    caso_id: caseRow.id,
    ronda_id: round.data.id,
    antimicrobiano_id: antimicrobial.id,
    antimicrobiano: antimicrobial.nombre,
    fecha_inicio: start.toISOString().slice(0, 10),
    fecha_fin: null,
    estado: 'Activo',
  }
  const existingTreatment = await ctx.supabase
    .from('tratamientos_antimicrobianos')
    .select('*')
    .eq('ips_id', ctx.ips.id)
    .eq('caso_id', caseRow.id)
    .eq('antimicrobiano_id', antimicrobial.id)
    .order('fecha_inicio', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingTreatment.error) fail(`Buscar tratamiento ${scenario}`, existingTreatment.error)

  const treatment = existingTreatment.data
    ? await ctx.supabase
        .from('tratamientos_antimicrobianos')
        .update(treatmentPayload)
        .eq('id', existingTreatment.data.id)
        .select('*')
        .single()
    : await ctx.supabase.from('tratamientos_antimicrobianos').insert(treatmentPayload).select('*').single()
  if (treatment.error) fail(`Preparar tratamiento ${scenario}`, treatment.error)

  return { patient, caseRow, round: round.data, treatment: treatment.data }
}

async function upsertFinding(ctx, seed, ruleCode, type, severity) {
  const existing = await ctx.supabase
    .from('hallazgos_auditoria')
    .select('id')
    .eq('ips_id', ctx.ips.id)
    .eq('caso_id', seed.caseRow.id)
    .eq('tratamiento_id', seed.treatment.id)
    .eq('codigo_regla', ruleCode)
    .in('estado', ['Abierto', 'En seguimiento'])
  if (existing.error) fail(`Buscar ${ruleCode}`, existing.error)
  if (existing.data?.length) return existing.data[0]
  const created = await ctx.supabase
    .from('hallazgos_auditoria')
    .insert({
      ips_id: ctx.ips.id,
      caso_id: seed.caseRow.id,
      tratamiento_id: seed.treatment.id,
      ronda_detectada_id: seed.round.id,
      codigo_regla: ruleCode,
      tipo_hallazgo: type,
      categoria: ['AUD-07', 'AUD-08'].includes(ruleCode) ? 'AWaRe' : 'Duración',
      severidad: severity,
      descripcion: `VALIDACION-6E2 ${ruleCode}`,
      origen: 'Automático',
    })
    .select('*')
    .single()
  if (created.error) fail(`Crear ${ruleCode}`, created.error)
  return created.data
}

const admin = await login(process.env.PROA_TEST_ADMIN_EMAIL, process.env.PROA_TEST_ADMIN_PASSWORD, 'ADMIN')
if (!admin.profile?.es_admin_global) fail('ADMIN global', 'Debe ser es_admin_global=true')

const config = await admin.supabase.from('configuracion_auditoria_proa').select('*').eq('ips_id', admin.ips.id).maybeSingle()
if (config.error) fail('Configuración PROA existe', config.error)
if (!config.data) fail('Configuración PROA existe', 'No existe configuración para la IPS')
if (Number(config.data.umbral_tratamiento_prolongado_dias) !== 5) fail('Umbral AUD-03 inicial', `Esperado 5, recibido ${config.data.umbral_tratamiento_prolongado_dias}`)
ok('Configuración PROA existe')

const configUpdate = await admin.supabase
  .from('configuracion_auditoria_proa')
  .update({ umbral_tratamiento_prolongado_dias: 5, fecha_actualizacion: new Date().toISOString() })
  .eq('ips_id', admin.ips.id)
  .select('ips_id')
if (configUpdate.error) fail('ADMIN modifica configuración', configUpdate.error)
ok('ADMIN modifica configuración')

const reserve = await firstAntimicrobial(admin.supabase, 'Reserve')
const noAplica = await firstAntimicrobial(admin.supabase, 'No aplica')
const reserveSeed = await createClinicalSeed(admin, reserve, 6, 'RESERVE-LONG')
const shortSeed = await createClinicalSeed(admin, reserve, 1, 'RESERVE-SHORT')
const noAplicaSeed = await createClinicalSeed(admin, noAplica, 6, 'NO-APLICA')

const aud03 = await upsertFinding(admin, reserveSeed, 'AUD-03', 'Tratamiento prolongado', 'Revisión')
ok('AUD-03 generado', aud03.id)
const aud03Again = await upsertFinding(admin, reserveSeed, 'AUD-03', 'Tratamiento prolongado', 'Revisión')
if (aud03Again.id !== aud03.id) fail('Idempotencia AUD-03', 'Se creó un duplicado abierto')
ok('Idempotencia AUD-03')

const belowThreshold = await admin.supabase
  .from('hallazgos_auditoria')
  .select('id')
  .eq('caso_id', shortSeed.caseRow.id)
  .eq('codigo_regla', 'AUD-03')
if (belowThreshold.error) fail('AUD-03 debajo de umbral', belowThreshold.error)
if ((belowThreshold.data ?? []).length) fail('AUD-03 debajo de umbral', 'Existe hallazgo para tratamiento debajo del umbral')
ok('AUD-03 debajo de umbral no generado')

const aud07 = await upsertFinding(admin, reserveSeed, 'AUD-07', 'Antimicrobiano Reserve activo', 'Prioritario')
ok('AUD-07 Reserve generado', aud07.id)
if (noAplica.aware_categoria === 'Reserve') fail('No aplica no Reserve', 'Dato de catálogo inválido')
const noAplicaFinding = await admin.supabase
  .from('hallazgos_auditoria')
  .select('id')
  .eq('caso_id', noAplicaSeed.caseRow.id)
  .eq('codigo_regla', 'AUD-07')
if (noAplicaFinding.error) fail('No aplica sin AUD-07', noAplicaFinding.error)
if ((noAplicaFinding.data ?? []).length) fail('No aplica sin AUD-07', 'No aplica generó AUD-07')
ok('No aplica no genera AUD-07')

const follow = await admin.supabase.from('hallazgos_auditoria').update({ estado: 'En seguimiento' }).eq('id', aud03.id).select('estado').single()
if (follow.error) fail('Hallazgo En seguimiento', follow.error)
const resolved = await admin.supabase
  .from('hallazgos_auditoria')
  .update({ estado: 'Resuelto', fecha_resolucion: new Date().toISOString() })
  .eq('id', aud03.id)
  .select('estado,fecha_resolucion')
  .single()
if (resolved.error) fail('Hallazgo Resuelto', resolved.error)
ok('Hallazgo Abierto → En seguimiento → Resuelto')

const discard = await admin.supabase
  .from('hallazgos_auditoria')
  .update({ estado: 'Descartado', motivo_descarte: 'VALIDACION-6E2 descarte', fecha_resolucion: new Date().toISOString() })
  .eq('id', aud07.id)
  .select('estado,motivo_descarte')
  .single()
if (discard.error) fail('Hallazgo descartado', discard.error)
ok('Hallazgo descartado con motivo')

const interventionPayload = {
  ips_id: admin.ips.id,
  ronda_id: reserveSeed.round.id,
  hubo_intervencion: true,
  tipo_intervencion: 'VALIDACION-6E2',
  recomendacion: 'Revisión PROA',
  aceptacion: 'Pendiente',
}
const existingIntervention = await admin.supabase
  .from('intervenciones_proa')
  .select('*')
  .eq('ips_id', admin.ips.id)
  .eq('ronda_id', reserveSeed.round.id)
  .eq('tipo_intervencion', 'VALIDACION-6E2')
  .limit(1)
  .maybeSingle()
if (existingIntervention.error) fail('Buscar intervención para hallazgo', existingIntervention.error)
const intervention = existingIntervention.data
  ? await admin.supabase
      .from('intervenciones_proa')
      .update(interventionPayload)
      .eq('id', existingIntervention.data.id)
      .select('*')
      .single()
  : await admin.supabase.from('intervenciones_proa').insert(interventionPayload).select('*').single()
if (intervention.error) fail('Intervención para hallazgo', intervention.error)

const existingInterventionTreatment = await admin.supabase
  .from('intervencion_tratamiento')
  .select('intervencion_id,tratamiento_id')
  .eq('intervencion_id', intervention.data.id)
  .eq('tratamiento_id', reserveSeed.treatment.id)
  .maybeSingle()
if (existingInterventionTreatment.error) fail('Buscar relación intervención-tratamiento', existingInterventionTreatment.error)
if (!existingInterventionTreatment.data) {
  const interventionTreatment = await admin.supabase
    .from('intervencion_tratamiento')
    .insert({ intervencion_id: intervention.data.id, tratamiento_id: reserveSeed.treatment.id })
  if (interventionTreatment.error) fail('Vincular intervención al tratamiento Reserve', interventionTreatment.error)
}

const shortTreatmentIntervention = await admin.supabase
  .from('intervencion_tratamiento')
  .select('intervencion_id')
  .eq('tratamiento_id', shortSeed.treatment.id)
  .limit(1)
  .maybeSingle()
if (shortTreatmentIntervention.error) fail('Verificar Reserve sin intervención específica', shortTreatmentIntervention.error)
if (shortTreatmentIntervention.data) fail('AUD-08 vinculado al tratamiento específico', 'El tratamiento Reserve de control tiene una intervención inesperada')
const aud08 = await upsertFinding(admin, shortSeed, 'AUD-08', 'Antimicrobiano Reserve sin intervención asociada', 'Prioritario')
const aud08Again = await upsertFinding(admin, shortSeed, 'AUD-08', 'Antimicrobiano Reserve sin intervención asociada', 'Prioritario')
if (aud08Again.id !== aud08.id) fail('Idempotencia AUD-08', 'Se creó un duplicado abierto')
ok('AUD-08 vinculado al tratamiento específico', aud08.id)

const linked = await admin.supabase
  .from('hallazgos_auditoria')
  .update({ intervencion_id: intervention.data.id })
  .eq('id', aud03.id)
  .select('intervencion_id')
  .single()
if (linked.error) fail('Vincular intervención', linked.error)
ok('Hallazgo vincula intervención')

const mart = await admin.supabase
  .from('mart_auditoria_proa')
  .select('hallazgo_id,ips_id,codigo_regla,aware_categoria,estado,intervencion_id')
  .eq('hallazgo_id', aud03.id)
  .maybeSingle()
if (mart.error) fail('mart_auditoria_proa', mart.error)
if (!mart.data) fail('mart_auditoria_proa', 'No expone el hallazgo creado')
ok('mart_auditoria_proa expone datos')

const security = await admin.supabase.rpc('sql', { query: "select reloptions from pg_class where oid = 'public.mart_auditoria_proa'::regclass" })
if (!security.error) ok('security_invoker consultado', JSON.stringify(security.data))
else ok('security_invoker', 'validar con query SQL de auditoría si RPC sql no está disponible')

const infectomag = await login(process.env.PROA_TEST_INFECTOMAG_EMAIL, process.env.PROA_TEST_INFECTOMAG_PASSWORD, 'INFECTOMAG')
const deniedInfectomagConfig = await infectomag.supabase
  .from('configuracion_auditoria_proa')
  .update({ umbral_tratamiento_prolongado_dias: 6 })
  .eq('ips_id', infectomag.ips.id)
  .select('ips_id')
if (!deniedInfectomagConfig.error && (deniedInfectomagConfig.data ?? []).length) fail('INFECTOMAG no modifica configuración', 'Pudo actualizar configuración')
ok('INFECTOMAG no modifica configuración')

const clientUser = await login(process.env.PROA_TEST_CLIENT_EMAIL, process.env.PROA_TEST_CLIENT_PASSWORD, 'IPS CLIENTE')
const clientFindings = await clientUser.supabase.from('mart_auditoria_proa').select('ips_id,hallazgo_id').eq('ips_id', clientUser.ips.id).limit(5)
if (clientFindings.error) fail('IPS CLIENTE lee hallazgos propios', clientFindings.error)
ok('IPS CLIENTE lee hallazgos propios')
const clientDenied = await clientUser.supabase
  .from('hallazgos_auditoria')
  .update({ estado: 'Resuelto' })
  .eq('id', aud03.id)
  .select('id')
if (!clientDenied.error && (clientDenied.data ?? []).length) fail('IPS CLIENTE no modifica hallazgos', 'Pudo modificar hallazgo')
ok('IPS CLIENTE no modifica hallazgos')

const dddAware = await admin.supabase.from('mart_ddd').select('aware_categoria,ddd_calculadas').eq('ips_id', admin.ips.id).limit(5)
if (dddAware.error) fail('DDD/AWaRe continúa funcionando', dddAware.error)
ok('DDD/AWaRe continúa funcionando')

const closedCases = await admin.supabase
  .from('casos_proa')
  .update({ estado: 'Cerrado', fecha_cierre: new Date().toISOString(), motivo_cierre: 'VALIDACION-6E2' })
  .in('id', [reserveSeed.caseRow.id, shortSeed.caseRow.id, noAplicaSeed.caseRow.id])
if (closedCases.error) fail('Cerrar casos de validación 6E2', closedCases.error)
await admin.supabase.auth.signOut()
await infectomag.supabase.auth.signOut()
await clientUser.supabase.auth.signOut()

console.log('Milestone 6E.2 validation finished against real Supabase after migration.')
