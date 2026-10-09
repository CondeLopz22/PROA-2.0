import { supabase } from '../lib/supabase'
import type {
  Microbiology,
  MicrobiologySensitivity,
  ReevaluationDecision,
  ReevaluationDecisionValue,
  ReevaluationMartRow,
  RoundProa,
  Treatment,
  UUID,
} from '../types/domain'

export const reevaluationRuleCodes = ['AUD-05', 'DES-02', 'DES-03', 'DES-04'] as const

export const reevaluationDecisionOptions: ReevaluationDecisionValue[] = [
  'Desescalamiento realizado',
  'Optimización diferente',
  'Mantener tratamiento',
  'No aplica',
]

export function isReevaluationRule(code?: string | null) {
  return reevaluationRuleCodes.includes(code as (typeof reevaluationRuleCodes)[number])
}

function normalized(value?: string | null) {
  return value?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es') || null
}

function dateValue(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function semanticContextHash(value: unknown) {
  const input = stableSerialize(value)
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`
}

export function hasRelevantAntibiogram(sensitivities: MicrobiologySensitivity[]) {
  return sensitivities.some((row) => Boolean(row.resultado) && row.resultado !== 'No disponible')
}

export function isWatchOrReserve(category?: string | null) {
  return category === 'Watch' || category === 'Reserve'
}

export function shouldCreateDes02(category: string | null | undefined, sensitivities: MicrobiologySensitivity[]) {
  return isWatchOrReserve(category) && hasRelevantAntibiogram(sensitivities)
}

export function shouldCreateDes03(activeTreatmentCount: number, microbiology: Microbiology[]) {
  return activeTreatmentCount >= 2 && microbiology.some((row) => row.resultado_general && row.resultado_general !== 'Pendiente')
}

export function shouldCreateDes04({
  category,
  evolution,
  day,
  threshold,
}: {
  category?: string | null
  evolution?: string | null
  day?: number | null
  threshold?: number | null
}) {
  return Boolean(
    isWatchOrReserve(category)
    && evolution === 'Mejoría'
    && threshold
    && day
    && day > threshold,
  )
}

export function buildReevaluationContext({
  code,
  treatments,
  round,
  microbiology,
  sensitivities,
  threshold,
}: {
  code: string
  treatments: Array<Treatment & { aware_categoria?: string | null }>
  round?: RoundProa | null
  microbiology: Microbiology[]
  sensitivities: MicrobiologySensitivity[]
  threshold?: number | null
}) {
  const treatmentContext = treatments
    .map((treatment) => ({
      id: treatment.id,
      antimicrobial: treatment.antimicrobiano_id ?? null,
      aware: treatment.aware_categoria ?? null,
      start: dateValue(treatment.fecha_inicio),
      dose: String(treatment.dosis ?? ''),
      unit: normalized(treatment.unidad),
      frequency: normalized(treatment.frecuencia),
      route: normalized(treatment.via),
      state: treatment.estado ?? null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
  const sampleContext = microbiology
    .filter((row) => row.resultado_general && row.resultado_general !== 'Pendiente')
    .map((row) => ({
      sample: row.tipo_muestra_id ?? null,
      taken: dateValue(row.fecha_toma),
      resulted: dateValue(row.fecha_resultado),
      result: row.resultado_general,
      organism: row.microorganismo_id ?? null,
    }))
    .sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right)))
  const sensitivityContext = sensitivities
    .filter((row) => row.resultado && row.resultado !== 'No disponible')
    .map((row) => ({ antimicrobial: row.antimicrobiano_id ?? null, result: row.resultado }))
    .sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right)))

  return semanticContextHash({
    code,
    therapy: round?.tipo_terapia ?? null,
    evolution: round?.evolucion_clinica ?? null,
    threshold: threshold ?? null,
    treatments: treatmentContext,
    microbiology: sampleContext,
    sensitivities: sensitivityContext,
  })
}

export async function getCaseReevaluation(caseId: UUID) {
  const { data, error } = await supabase
    .from('mart_reevaluacion_terapeutica')
    .select('*')
    .eq('caso_id', caseId)
    .order('fecha_deteccion', { ascending: false })
  if (error?.code === 'PGRST205' || error?.code === '42P01') return []
  if (error) throw error
  return (data ?? []) as ReevaluationMartRow[]
}

export async function getReevaluationDecisions(findingIds: UUID[]) {
  if (!findingIds.length) return []
  const { data, error } = await supabase
    .from('decisiones_reevaluacion')
    .select('*')
    .in('hallazgo_id', findingIds)
  if (error?.code === 'PGRST205' || error?.code === '42P01') return []
  if (error) throw error
  return (data ?? []) as ReevaluationDecision[]
}

export async function registerReevaluationDecision({
  findingId,
  decision,
  justification,
  interventionId,
}: {
  findingId: UUID
  decision: ReevaluationDecisionValue
  justification: string
  interventionId?: UUID | null
}) {
  if (!justification.trim()) throw new Error('La justificación es obligatoria.')
  const { data, error } = await supabase.rpc('registrar_decision_reevaluacion', {
    p_hallazgo_id: findingId,
    p_decision: decision,
    p_justificacion: justification.trim(),
    p_intervencion_id: interventionId ?? null,
  })
  if (error) throw error
  return data as ReevaluationDecision
}
