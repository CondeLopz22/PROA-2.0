import { supabase } from '../lib/supabase'
import type {
  ImplementationStatus,
  InterventionDecision,
  InterventionImplementation,
  ProaIntervention,
  TreatmentAssessment,
  TreatingDecisionValue,
  UUID,
} from '../types/domain'

export type InterventionFollowUpDraft = {
  interventionId: UUID
  decision: TreatingDecisionValue | ''
  decisionReason: string
  implementationStatus: ImplementationStatus | ''
  implementationDetail: string
  implementationDate: string
  implementedTreatmentId: UUID | ''
}

export type PendingTherapeuticRecommendation = {
  intervention: ProaIntervention
  originRoundId: UUID
  originRoundAt?: string | null
  treatmentIds: UUID[]
  latestDecision: InterventionDecision | null
  latestImplementation: InterventionImplementation | null
}

function schemaUnavailable(error: { code?: string } | null) {
  return error?.code === 'PGRST205' || error?.code === '42P01' || error?.code === 'PGRST202'
}

export function emptyInterventionFollowUp(interventionId: UUID): InterventionFollowUpDraft {
  return {
    interventionId,
    decision: '',
    decisionReason: '',
    implementationStatus: '',
    implementationDetail: '',
    implementationDate: '',
    implementedTreatmentId: '',
  }
}

export function recommendationNeedsFollowUp(item: PendingTherapeuticRecommendation) {
  return !item.latestDecision || !item.latestImplementation
}

export async function getPendingTherapeuticRecommendations(caseId: UUID, currentRoundId?: UUID) {
  const roundsResult = await supabase
    .from('rondas_proa')
    .select('id,fecha_hora_ronda')
    .eq('caso_id', caseId)
  if (roundsResult.error) throw roundsResult.error
  const rounds = roundsResult.data ?? []
  const roundIds = rounds.map((row) => row.id as UUID)
  if (!roundIds.length) return []

  const interventionsResult = await supabase
    .from('intervenciones_proa')
    .select('*')
    .in('ronda_id', roundIds)
    .eq('hubo_intervencion', true)
    .order('fecha_creacion', { ascending: false })
  if (interventionsResult.error) throw interventionsResult.error
  const interventions = (interventionsResult.data ?? []) as ProaIntervention[]
  const candidates = interventions.filter((row) => row.ronda_id !== currentRoundId)
  if (!candidates.length) return []
  const interventionIds = candidates.map((row) => row.id)

  const [relationsResult, decisionsResult, implementationsResult] = await Promise.all([
    supabase.from('intervencion_tratamiento').select('intervencion_id,tratamiento_id').in('intervencion_id', interventionIds),
    supabase.from('decisiones_intervencion').select('*').in('intervencion_id', interventionIds).order('fecha_decision', { ascending: false }),
    supabase.from('implementaciones_intervencion').select('*').in('intervencion_id', interventionIds).order('fecha_implementacion', { ascending: false }),
  ])
  if (relationsResult.error) throw relationsResult.error
  if (decisionsResult.error && !schemaUnavailable(decisionsResult.error)) throw decisionsResult.error
  if (implementationsResult.error && !schemaUnavailable(implementationsResult.error)) throw implementationsResult.error

  const roundAt = new Map(rounds.map((row) => [row.id as UUID, row.fecha_hora_ronda as string | null]))
  const decisions = (decisionsResult.data ?? []) as InterventionDecision[]
  const implementations = (implementationsResult.data ?? []) as InterventionImplementation[]
  const rows = candidates.map<PendingTherapeuticRecommendation>((intervention) => ({
    intervention,
    originRoundId: intervention.ronda_id as UUID,
    originRoundAt: roundAt.get(intervention.ronda_id as UUID),
    treatmentIds: (relationsResult.data ?? [])
      .filter((row) => row.intervencion_id === intervention.id)
      .map((row) => row.tratamiento_id as UUID),
    latestDecision: decisions.find((row) => row.intervencion_id === intervention.id) ?? null,
    latestImplementation: implementations.find((row) => row.intervencion_id === intervention.id) ?? null,
  }))
  return rows.filter(recommendationNeedsFollowUp)
}

export async function getCaseTherapeuticHistory(caseId: UUID) {
  const [assessmentsResult, decisionsResult, implementationsResult] = await Promise.all([
    supabase.from('tratamientos_valoracion').select('*').eq('caso_id', caseId).order('fecha_registro', { ascending: false }),
    supabase.from('decisiones_intervencion').select('*').eq('caso_id', caseId).order('fecha_decision', { ascending: false }),
    supabase.from('implementaciones_intervencion').select('*').eq('caso_id', caseId).order('fecha_implementacion', { ascending: false }),
  ])
  for (const result of [assessmentsResult, decisionsResult, implementationsResult]) {
    if (result.error && !schemaUnavailable(result.error)) throw result.error
  }
  return {
    assessments: (assessmentsResult.data ?? []) as TreatmentAssessment[],
    decisions: (decisionsResult.data ?? []) as InterventionDecision[],
    implementations: (implementationsResult.data ?? []) as InterventionImplementation[],
  }
}
