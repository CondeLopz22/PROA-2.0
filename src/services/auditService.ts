import { supabase } from '../lib/supabase'
import type {
  AwareCategory,
  DiagnosisRound,
  Microbiology,
  MicrobiologySensitivity,
  Patient,
  ProaAuditConfig,
  ProaAuditFinding,
  ProaAuditRule,
  ProaIntervention,
  ReevaluationDecision,
  RoundProa,
  Treatment,
  UUID,
} from '../types/domain'
import { normalizeAntimicrobialName, treatmentDay } from './treatmentService'
import {
  buildReevaluationContext,
  getReevaluationDecisions,
  shouldCreateDes02,
  shouldCreateDes03,
  shouldCreateDes04,
} from './reevaluationService'

export type AuditFindingDraft = {
  ipsId: UUID
  casoId: UUID
  treatmentId?: UUID | null
  treatmentIds?: UUID[]
  roundId?: UUID | null
  contextHash?: string | null
  code: string
  type: string
  category: string
  severity: ProaAuditFinding['severidad']
  description: string
  origin?: ProaAuditFinding['origen']
}

export type AuditFindingRow = ProaAuditFinding & {
  hallazgo_id?: UUID | null
  paciente_id?: UUID | null
  paciente?: string | null
  servicio?: string | null
  antimicrobiano?: string | null
  aware_categoria?: AwareCategory | string | null
  aceptacion?: string | null
}

export type AuditInboxRow = AuditFindingRow & {
  patient: Patient | null
  treatment: Treatment | null
  intervention: ProaIntervention | null
  treatmentDay: number | null
  relatedTreatments: Treatment[]
  reevaluationDecision: ReevaluationDecision | null
  microbiologyContext: Array<{
    id: UUID
    sample: string
    result: string
    organism: string | null
    sensitivities: string[]
  }>
}

const inactiveParameterizedRules = new Set(['AUD-04', 'AUD-06', 'AUD-10'])

function auditSchemaUnavailable(error: unknown) {
  const candidate = error as { code?: string; message?: string } | null
  return candidate?.code === 'PGRST205' || candidate?.code === '42P01' || candidate?.message?.includes('Could not find')
}

function defaultConfig(ipsId: UUID): ProaAuditConfig {
  return {
    ips_id: ipsId,
    umbral_tratamiento_prolongado_dias: 5,
    umbral_profilaxis_prolongada_dias: null,
    umbral_seguimiento_vencido_dias: null,
    umbral_microbiologia_pendiente_dias: null,
    umbral_reevaluacion_favorable_dias: null,
  }
}

function withAware(treatment: Treatment & { catalogo_antimicrobianos?: { aware_categoria?: string | null } | null }) {
  return { ...treatment, aware_categoria: treatment.catalogo_antimicrobianos?.aware_categoria ?? null }
}

function isActiveTreatment(treatment: Treatment) {
  return treatment.estado === 'Activo'
}

function hasInfectiousDiagnosis(diagnoses: DiagnosisRound[]) {
  return diagnoses.some((diagnosis) => diagnosis.tipo_diagnostico === 'Infeccioso' && Boolean(diagnosis.codigo_cie10 || diagnosis.descripcion_cie10))
}

function hasAvailableMicrobiology(rows: Microbiology[]) {
  return rows.some((row) => row.resultado_general && row.resultado_general !== 'Pendiente')
}

function ruleMap(rules: ProaAuditRule[]) {
  return new Map(rules.filter((rule) => rule.activa).map((rule) => [rule.codigo_regla, rule]))
}

function ruleDraft(rule: ProaAuditRule | undefined, fallback: Pick<AuditFindingDraft, 'code' | 'type' | 'category' | 'severity'>) {
  return {
    code: rule?.codigo_regla ?? fallback.code,
    type: rule?.tipo_hallazgo ?? fallback.type,
    category: rule?.categoria ?? fallback.category,
    severity: rule?.severidad ?? fallback.severity,
  }
}

export function shouldFlagReserveWithoutTreatmentIntervention({
  awareCategory,
  linkedTreatmentIds,
  treatmentId,
}: {
  awareCategory?: string | null
  linkedTreatmentIds: Set<UUID>
  treatmentId: UUID
}) {
  return awareCategory === 'Reserve' && !linkedTreatmentIds.has(treatmentId)
}

export async function getAuditConfig(ipsId: UUID) {
  const { data, error } = await supabase
    .from('configuracion_auditoria_proa')
    .select('*')
    .eq('ips_id', ipsId)
    .maybeSingle()
  if (error && auditSchemaUnavailable(error)) return defaultConfig(ipsId)
  if (error) throw error
  return (data as ProaAuditConfig | null) ?? defaultConfig(ipsId)
}

export async function updateAuditConfig(ipsId: UUID, updates: Partial<Omit<ProaAuditConfig, 'ips_id'>>) {
  const payload = {
    ...updates,
    ips_id: ipsId,
    fecha_actualizacion: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('configuracion_auditoria_proa')
    .upsert(payload, { onConflict: 'ips_id' })
    .select('*')
    .single()
  if (error) throw error
  return data as ProaAuditConfig
}

export async function getAuditRules() {
  const { data, error } = await supabase
    .from('reglas_auditoria_proa')
    .select('*')
    .order('codigo_regla')
  if (error && auditSchemaUnavailable(error)) return []
  if (error) throw error
  return (data ?? []) as ProaAuditRule[]
}

export async function getAuditFindings(ipsId: UUID, filters: { status?: string; severity?: string } = {}) {
  let query = supabase
    .from('mart_auditoria_proa')
    .select('*')
    .eq('ips_id', ipsId)
    .order('fecha_deteccion', { ascending: false })
    .limit(200)
  if (filters.status) query = query.eq('estado', filters.status)
  if (filters.severity) query = query.eq('severidad', filters.severity)
  const { data, error } = await query
  if (error && auditSchemaUnavailable(error)) return []
  if (error) throw error
  return (data ?? []) as AuditFindingRow[]
}

export async function getAuditInbox(ipsId: UUID) {
  const martResult = await supabase
    .from('mart_auditoria_proa')
    .select('*')
    .eq('ips_id', ipsId)
    .order('fecha_deteccion', { ascending: false })
    .limit(500)
  if (martResult.error && auditSchemaUnavailable(martResult.error)) return []
  if (martResult.error) throw martResult.error

  const martRows = (martResult.data ?? []) as AuditFindingRow[]
  if (!martRows.length) return []

  const findingIds = unique(martRows.map((row) => row.hallazgo_id ?? row.id))
  const patientIds = unique(martRows.map((row) => row.paciente_id))
  const caseIds = unique(martRows.map((row) => row.caso_id))
  const primaryTreatmentIds = unique(martRows.map((row) => row.tratamiento_id))
  const interventionIds = unique(martRows.map((row) => row.intervencion_id))
  const [findingsResult, patientsResult, interventionsResult, decisions, microbiologyResult, relationResult] = await Promise.all([
    supabase.from('hallazgos_auditoria').select('*').in('id', findingIds),
    patientIds.length ? supabase.from('pacientes').select('*').in('id', patientIds) : Promise.resolve({ data: [], error: null }),
    interventionIds.length ? supabase.from('intervenciones_proa').select('*').in('id', interventionIds) : Promise.resolve({ data: [], error: null }),
    getReevaluationDecisions(findingIds),
    caseIds.length ? supabase.from('microbiologia').select('*').in('caso_id', caseIds) : Promise.resolve({ data: [], error: null }),
    findingIds.length ? supabase.from('hallazgo_tratamiento').select('hallazgo_id,tratamiento_id').in('hallazgo_id', findingIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (findingsResult.error) throw findingsResult.error
  if (patientsResult.error) throw patientsResult.error
  if (interventionsResult.error) throw interventionsResult.error
  if (microbiologyResult.error) throw microbiologyResult.error
  if (relationResult.error && relationResult.error.code !== 'PGRST205' && relationResult.error.code !== '42P01') throw relationResult.error
  const relations = (relationResult.data ?? []) as Array<{ hallazgo_id: UUID; tratamiento_id: UUID }>
  const treatmentIds = unique([...primaryTreatmentIds, ...relations.map((row) => row.tratamiento_id)])
  const treatmentsResult = treatmentIds.length
    ? await supabase.from('tratamientos_antimicrobianos').select('*').in('id', treatmentIds)
    : { data: [], error: null }
  if (treatmentsResult.error) throw treatmentsResult.error
  const microbiologyRows = (microbiologyResult.data ?? []) as Microbiology[]
  const microbiologyIds = microbiologyRows.map((row) => row.id)
  const sensitivityResult = microbiologyIds.length
    ? await supabase.from('sensibilidad_microbiologica').select('*').in('muestra_id', microbiologyIds)
    : { data: [], error: null }
  if (sensitivityResult.error) throw sensitivityResult.error
  const sensitivityRows = (sensitivityResult.data ?? []) as MicrobiologySensitivity[]

  const findingById = byId((findingsResult.data ?? []) as ProaAuditFinding[])
  const patientById = byId((patientsResult.data ?? []) as Patient[])
  const treatmentById = byId((treatmentsResult.data ?? []) as Treatment[])
  const interventionById = byId((interventionsResult.data ?? []) as ProaIntervention[])
  const decisionByFindingId = new Map(decisions.map((decision) => [decision.hallazgo_id, decision]))

  return martRows.map((martRow) => {
    const findingId = martRow.hallazgo_id ?? martRow.id
    const finding = findingById.get(findingId)
    const treatment = martRow.tratamiento_id ? treatmentById.get(martRow.tratamiento_id) ?? null : null
    return {
      ...martRow,
      ...finding,
      id: findingId,
      hallazgo_id: findingId,
      patient: martRow.paciente_id ? patientById.get(martRow.paciente_id) ?? null : null,
      treatment,
      relatedTreatments: relations
        .filter((relation) => relation.hallazgo_id === findingId)
        .map((relation) => treatmentById.get(relation.tratamiento_id))
        .filter(Boolean) as Treatment[],
      intervention: martRow.intervencion_id ? interventionById.get(martRow.intervencion_id) ?? null : null,
      treatmentDay: treatmentDay(treatment?.fecha_inicio),
      reevaluationDecision: decisionByFindingId.get(findingId) ?? null,
      microbiologyContext: microbiologyRows
        .filter((row) => row.caso_id === martRow.caso_id && row.resultado_general && row.resultado_general !== 'Pendiente')
        .map((row) => ({
          id: row.id,
          sample: row.tipo_muestra ?? 'Muestra',
          result: row.resultado_general ?? 'Sin resultado',
          organism: row.microorganismo ?? null,
          sensitivities: sensitivityRows
            .filter((item) => item.muestra_id === row.id && item.resultado && item.resultado !== 'No disponible')
            .map((item) => `${item.antimicrobiano ?? 'Antimicrobiano'}: ${item.resultado}`),
        })),
    } satisfies AuditInboxRow
  })
}

function unique(values: Array<UUID | null | undefined>) {
  return [...new Set(values.filter((value): value is UUID => Boolean(value)))]
}

function byId<T extends { id: UUID }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]))
}

async function linkFindingTreatments(findingId: UUID, treatmentIds: UUID[] = []) {
  if (!treatmentIds.length) return
  const { error } = await supabase.from('hallazgo_tratamiento').upsert(
    Array.from(new Set(treatmentIds)).map((treatmentId) => ({
      hallazgo_id: findingId,
      tratamiento_id: treatmentId,
    })),
    { onConflict: 'hallazgo_id,tratamiento_id', ignoreDuplicates: true },
  )
  if (error) throw error
}

export async function getRoundAuditFindings(roundId: UUID) {
  const { data, error } = await supabase
    .from('hallazgos_auditoria')
    .select('*')
    .eq('ronda_detectada_id', roundId)
    .order('fecha_deteccion', { ascending: false })
  if (error && auditSchemaUnavailable(error)) return []
  if (error) throw error
  return (data ?? []) as ProaAuditFinding[]
}

export async function saveAuditFinding(draft: AuditFindingDraft) {
  if (draft.contextHash) {
    const sameContext = await supabase
      .from('hallazgos_auditoria')
      .select('*')
      .eq('ips_id', draft.ipsId)
      .eq('caso_id', draft.casoId)
      .eq('codigo_regla', draft.code)
      .eq('contexto_hash', draft.contextHash)
      .limit(20)
    if (sameContext.error) throw sameContext.error
    const exact = (sameContext.data ?? []).find((row) =>
      draft.treatmentId ? row.tratamiento_id === draft.treatmentId : !row.tratamiento_id,
    )
    if (exact) {
      const refreshed = await supabase
        .from('hallazgos_auditoria')
        .update({ fecha_ultima_deteccion: new Date().toISOString() })
        .eq('id', exact.id)
        .select('*')
        .single()
      if (refreshed.error) throw refreshed.error
      await linkFindingTreatments(exact.id as UUID, draft.treatmentIds)
      return refreshed.data as ProaAuditFinding
    }
  }

  const existing = await supabase
    .from('hallazgos_auditoria')
    .select('id,estado,tratamiento_id,contexto_hash')
    .eq('ips_id', draft.ipsId)
    .eq('caso_id', draft.casoId)
    .eq('codigo_regla', draft.code)
    .in('estado', ['Abierto', 'En seguimiento'])
    .limit(20)
  if (existing.error) throw existing.error
  const duplicate = (existing.data ?? []).find((row) =>
    draft.treatmentId ? row.tratamiento_id === draft.treatmentId : !row.tratamiento_id,
  )
  if (duplicate) {
    const { data, error } = await supabase
      .from('hallazgos_auditoria')
      .update({
        descripcion: draft.description,
        severidad: draft.severity,
        ronda_detectada_id: draft.roundId ?? null,
        contexto_hash: duplicate.contexto_hash ?? draft.contextHash ?? null,
        fecha_ultima_deteccion: new Date().toISOString(),
        fecha_actualizacion: new Date().toISOString(),
      })
      .eq('id', duplicate.id)
      .select('*')
      .single()
    if (error) throw error
    await linkFindingTreatments(data.id as UUID, draft.treatmentIds)
    return data as ProaAuditFinding
  }

  const { data, error } = await supabase
    .from('hallazgos_auditoria')
    .insert({
      ips_id: draft.ipsId,
      caso_id: draft.casoId,
      tratamiento_id: draft.treatmentId ?? null,
      ronda_detectada_id: draft.roundId ?? null,
      codigo_regla: draft.code,
      tipo_hallazgo: draft.type,
      categoria: draft.category,
      severidad: draft.severity,
      descripcion: draft.description,
      origen: draft.origin ?? 'Automático',
      estado: 'Abierto',
      contexto_hash: draft.contextHash ?? null,
      fecha_ultima_deteccion: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (error) throw error
  const finding = data as ProaAuditFinding
  await linkFindingTreatments(finding.id, draft.treatmentIds)
  return finding
}

export async function updateAuditFindingStatus({
  findingId,
  status,
  userId,
  discardReason,
  interventionId,
}: {
  findingId: UUID
  status?: ProaAuditFinding['estado']
  userId?: UUID
  discardReason?: string
  interventionId?: UUID | null
}) {
  if (status === 'Descartado' && !discardReason?.trim()) throw new Error('El descarte requiere motivo.')
  const resolved = status === 'Resuelto' || status === 'Descartado'
  const payload: Record<string, string | null> = {
    usuario_actualizacion: userId ?? null,
    fecha_actualizacion: new Date().toISOString(),
  }
  if (interventionId !== undefined) payload.intervencion_id = interventionId
  if (status) {
    payload.estado = status
    payload.motivo_descarte = status === 'Descartado' ? (discardReason?.trim() ?? null) : null
    payload.fecha_resolucion = resolved ? new Date().toISOString() : null
  }
  const { data, error } = await supabase
    .from('hallazgos_auditoria')
    .update(payload)
    .eq('id', findingId)
    .select('*')
    .single()
  if (error) throw error
  return data as ProaAuditFinding
}

export async function evaluateCaseAudit({
  ipsId,
  casoId,
  roundId,
}: {
  ipsId: UUID
  casoId: UUID
  roundId?: UUID | null
}) {
  const [config, rules, treatmentsResult, roundsResult, microbiologyResult] = await Promise.all([
    getAuditConfig(ipsId),
    getAuditRules(),
    supabase.from('tratamientos_antimicrobianos').select('*,catalogo_antimicrobianos:antimicrobiano_id(aware_categoria)').eq('ips_id', ipsId).eq('caso_id', casoId),
    supabase.from('rondas_proa').select('*').eq('ips_id', ipsId).eq('caso_id', casoId).order('fecha_hora_ronda', { ascending: false }),
    supabase.from('microbiologia').select('*').eq('ips_id', ipsId).eq('caso_id', casoId),
  ])
  if (treatmentsResult.error) throw treatmentsResult.error
  if (roundsResult.error) throw roundsResult.error
  if (microbiologyResult.error) throw microbiologyResult.error

  const activeRules = ruleMap(rules)
  const treatments = (treatmentsResult.data ?? []) as Array<Treatment & { catalogo_antimicrobianos?: { aware_categoria?: string | null } | null }>
  const activeTreatments = treatments.filter(isActiveTreatment)
  const activeTreatmentIds = activeTreatments.map((treatment) => treatment.id)
  const rounds = (roundsResult.data ?? []) as RoundProa[]
  const roundIds = rounds.map((round) => round.id)
  const latestRound = rounds[0] ?? null
  const detectionRoundId = roundId ?? latestRound?.id ?? null
  const microbiology = (microbiologyResult.data ?? []) as Microbiology[]
  const microbiologyIds = microbiology.map((row) => row.id)

  const [diagnosesResult, interventionsResult, interventionTreatmentResult, sensitivityResult] = await Promise.all([
    roundIds.length ? supabase.from('diagnosticos_ronda').select('*').in('ronda_id', roundIds) : Promise.resolve({ data: [], error: null }),
    roundIds.length ? supabase.from('intervenciones_proa').select('*').eq('ips_id', ipsId).in('ronda_id', roundIds) : Promise.resolve({ data: [], error: null }),
    activeTreatmentIds.length ? supabase.from('intervencion_tratamiento').select('intervencion_id,tratamiento_id').in('tratamiento_id', activeTreatmentIds) : Promise.resolve({ data: [], error: null }),
    microbiologyIds.length ? supabase.from('sensibilidad_microbiologica').select('*').in('muestra_id', microbiologyIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (diagnosesResult.error) throw diagnosesResult.error
  if (interventionsResult.error) throw interventionsResult.error
  if (interventionTreatmentResult.error) throw interventionTreatmentResult.error
  if (sensitivityResult.error) throw sensitivityResult.error
  const diagnoses = (diagnosesResult.data ?? []) as DiagnosisRound[]
  const interventions = (interventionsResult.data ?? []) as ProaIntervention[]
  const proaInterventionIds = new Set(interventions.filter((intervention) => intervention.hubo_intervencion).map((intervention) => intervention.id))
  const treatmentIdsWithIntervention = new Set(
    ((interventionTreatmentResult.data ?? []) as Array<{ intervencion_id?: UUID | null; tratamiento_id?: UUID | null }>)
      .filter((relation) => relation.intervencion_id && relation.tratamiento_id && proaInterventionIds.has(relation.intervencion_id))
      .map((relation) => relation.tratamiento_id as UUID),
  )
  const sensitivities = (sensitivityResult.data ?? []) as MicrobiologySensitivity[]
  const drafts: AuditFindingDraft[] = []

  for (const treatment of activeTreatments) {
    if (activeRules.has('AUD-01') && !hasInfectiousDiagnosis(diagnoses)) {
      const rule = ruleDraft(activeRules.get('AUD-01'), { code: 'AUD-01', type: 'Tratamiento sin indicación infecciosa', category: 'Documentación', severity: 'Revisión' })
      drafts.push({ ipsId, casoId, treatmentId: treatment.id, roundId: detectionRoundId, ...rule, description: `${treatment.antimicrobiano ?? 'Tratamiento activo'} no tiene indicación infecciosa documentada en el caso.` })
    }
    if (activeRules.has('AUD-02') && !treatment.fecha_inicio) {
      const rule = ruleDraft(activeRules.get('AUD-02'), { code: 'AUD-02', type: 'Tratamiento sin fecha de inicio', category: 'Tratamiento', severity: 'Revisión' })
      drafts.push({ ipsId, casoId, treatmentId: treatment.id, roundId: detectionRoundId, ...rule, description: `${treatment.antimicrobiano ?? 'Tratamiento activo'} requiere fecha de inicio para seguimiento.` })
    }
    if (activeRules.has('AUD-03') && config.umbral_tratamiento_prolongado_dias && treatment.fecha_inicio) {
      const day = treatmentDay(treatment.fecha_inicio, latestRound?.fecha_hora_ronda)
      if (day && day >= config.umbral_tratamiento_prolongado_dias) {
        const rule = ruleDraft(activeRules.get('AUD-03'), { code: 'AUD-03', type: 'Tratamiento prolongado', category: 'Duración', severity: 'Revisión' })
        drafts.push({ ipsId, casoId, treatmentId: treatment.id, roundId: detectionRoundId, ...rule, description: `${treatment.antimicrobiano ?? 'Tratamiento activo'} en día ${day}; umbral configurado ${config.umbral_tratamiento_prolongado_dias} días. Requiere revisión.` })
      }
    }
    const aware = treatment.catalogo_antimicrobianos?.aware_categoria
    if (activeRules.has('AUD-07') && aware === 'Reserve') {
      const rule = ruleDraft(activeRules.get('AUD-07'), { code: 'AUD-07', type: 'Antimicrobiano Reserve activo', category: 'AWaRe', severity: 'Prioritario' })
      drafts.push({ ipsId, casoId, treatmentId: treatment.id, roundId: detectionRoundId, ...rule, description: `${treatment.antimicrobiano ?? 'Antimicrobiano'} está clasificado como Reserve. Requiere revisión PROA.` })
    }
    if (activeRules.has('AUD-08') && shouldFlagReserveWithoutTreatmentIntervention({ awareCategory: aware, linkedTreatmentIds: treatmentIdsWithIntervention, treatmentId: treatment.id })) {
      const rule = ruleDraft(activeRules.get('AUD-08'), { code: 'AUD-08', type: 'Reserve sin intervención asociada', category: 'AWaRe', severity: 'Prioritario' })
      drafts.push({ ipsId, casoId, treatmentId: treatment.id, roundId: detectionRoundId, ...rule, description: `${treatment.antimicrobiano ?? 'Antimicrobiano Reserve'} no tiene intervención PROA asociada al tratamiento.` })
    }
  }

  if (activeRules.has('AUD-05') && latestRound?.tipo_terapia === 'Empírica' && hasAvailableMicrobiology(microbiology)) {
    const rule = ruleDraft(activeRules.get('AUD-05'), { code: 'AUD-05', type: 'Terapia empírica con microbiología disponible', category: 'Microbiología', severity: 'Revisión' })
    drafts.push({
      ipsId,
      casoId,
      treatmentIds: activeTreatmentIds,
      roundId: detectionRoundId,
      contextHash: buildReevaluationContext({ code: 'AUD-05', treatments: activeTreatments.map(withAware), round: latestRound, microbiology, sensitivities }),
      ...rule,
      description: 'Existe microbiología con resultado disponible y la terapia continúa registrada como empírica. Requiere revisión.',
    })
  }

  if (activeRules.has('DES-02')) {
    activeTreatments.forEach((treatment) => {
      const aware = treatment.catalogo_antimicrobianos?.aware_categoria
      if (!shouldCreateDes02(aware, sensitivities)) return
      const rule = ruleDraft(activeRules.get('DES-02'), { code: 'DES-02', type: 'Watch/Reserve con antibiograma disponible', category: 'Reevaluación terapéutica', severity: 'Revisión' })
      drafts.push({
        ipsId,
        casoId,
        treatmentId: treatment.id,
        treatmentIds: [treatment.id],
        roundId: detectionRoundId,
        contextHash: buildReevaluationContext({ code: 'DES-02', treatments: [withAware(treatment)], round: latestRound, microbiology, sensitivities }),
        ...rule,
        description: `${treatment.antimicrobiano ?? 'Tratamiento Watch/Reserve'} continúa activo y el caso tiene antibiograma disponible. Requiere reevaluación profesional.`,
      })
    })
  }

  if (activeRules.has('DES-03') && shouldCreateDes03(activeTreatments.length, microbiology)) {
    const rule = ruleDraft(activeRules.get('DES-03'), { code: 'DES-03', type: 'Terapia combinada con microbiología disponible', category: 'Reevaluación terapéutica', severity: 'Revisión' })
    drafts.push({
      ipsId,
      casoId,
      treatmentIds: activeTreatmentIds,
      roundId: detectionRoundId,
      contextHash: buildReevaluationContext({ code: 'DES-03', treatments: activeTreatments.map(withAware), round: latestRound, microbiology, sensitivities }),
      ...rule,
      description: `${activeTreatments.length} tratamientos antimicrobianos continúan activos y existe microbiología disponible. Requiere reevaluación profesional.`,
    })
  }

  const favorableThreshold = config.umbral_reevaluacion_favorable_dias
  if (activeRules.has('DES-04')) {
    activeTreatments.forEach((treatment) => {
      const aware = treatment.catalogo_antimicrobianos?.aware_categoria
      if (!treatment.fecha_inicio) return
      const day = treatmentDay(treatment.fecha_inicio, latestRound.fecha_hora_ronda)
      if (!shouldCreateDes04({ category: aware, evolution: latestRound?.evolucion_clinica, day, threshold: favorableThreshold })) return
      const rule = ruleDraft(activeRules.get('DES-04'), { code: 'DES-04', type: 'Watch/Reserve con mejoría y duración superior al umbral', category: 'Reevaluación terapéutica', severity: 'Revisión' })
      drafts.push({
        ipsId,
        casoId,
        treatmentId: treatment.id,
        treatmentIds: [treatment.id],
        roundId: detectionRoundId,
        contextHash: buildReevaluationContext({ code: 'DES-04', treatments: [withAware(treatment)], round: latestRound, microbiology, sensitivities, threshold: favorableThreshold }),
        ...rule,
        description: `${treatment.antimicrobiano ?? 'Tratamiento Watch/Reserve'} está en día ${day}, con evolución en mejoría y umbral institucional de ${favorableThreshold} días. Requiere reevaluación profesional.`,
      })
    })
  }

  if (activeRules.has('AUD-09')) {
    const groups = new Map<string, Treatment[]>()
    activeTreatments.forEach((treatment) => {
      const key = treatment.antimicrobiano_id ?? normalizeAntimicrobialName(treatment.antimicrobiano)
      if (!key) return
      groups.set(key, [...(groups.get(key) ?? []), treatment])
    })
    groups.forEach((group) => {
      if (group.length < 2) return
      const rule = ruleDraft(activeRules.get('AUD-09'), { code: 'AUD-09', type: 'Duplicidad activa evidente', category: 'Tratamiento', severity: 'Revisión' })
      drafts.push({ ipsId, casoId, treatmentId: group[0].id, roundId: detectionRoundId, ...rule, description: `Hay ${group.length} tratamientos activos equivalentes para ${group[0].antimicrobiano ?? 'el mismo antimicrobiano'}.` })
    })
  }

  if (activeRules.has('AUD-11')) {
    interventions.filter((intervention) => intervention.aceptacion === 'Pendiente').forEach((intervention) => {
      const rule = ruleDraft(activeRules.get('AUD-11'), { code: 'AUD-11', type: 'Intervención pendiente de aceptación', category: 'Intervención', severity: 'Revisión' })
      drafts.push({ ipsId, casoId, roundId: intervention.ronda_id ?? detectionRoundId, ...rule, description: 'Intervención PROA con aceptación pendiente.' })
    })
  }

  if (activeRules.has('AUD-12')) {
    interventions
      .filter((intervention) => intervention.requiere_seguimiento && (intervention.aceptacion === 'No' || intervention.aceptacion === 'Parcialmente'))
      .forEach((intervention) => {
        const rule = ruleDraft(activeRules.get('AUD-12'), { code: 'AUD-12', type: 'Intervención no aceptada con seguimiento', category: 'Intervención', severity: 'Revisión' })
        drafts.push({ ipsId, casoId, roundId: intervention.ronda_id ?? detectionRoundId, ...rule, description: 'Intervención no aceptada o parcialmente aceptada que continúa requiriendo seguimiento.' })
      })
  }

  inactiveParameterizedRules.forEach((code) => activeRules.delete(code))
  const saved = []
  for (const draft of drafts) saved.push(await saveAuditFinding(draft))
  return saved
}
