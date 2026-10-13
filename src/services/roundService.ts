import { supabase } from '../lib/supabase'
import type { CaseProa, NewRoundInput, RoundProa, UUID } from '../types/domain'

export type StartCaseRoundInput = {
  ipsId: UUID
  patientId: UUID
  caseId?: UUID | null
  serviceId?: UUID | null
  bed?: string | null
}

export type StartCaseRoundResult = {
  case: CaseProa
  round: RoundProa
  caseCreated: boolean
  draftReused: boolean
}

export function assessmentTypeForRoundCount(roundCount: number): 'Primera valoración' | 'Seguimiento' {
  return roundCount === 0 ? 'Primera valoración' : 'Seguimiento'
}

export async function startCaseRound(input: StartCaseRoundInput): Promise<StartCaseRoundResult> {
  const { data, error } = await supabase.rpc('iniciar_ronda_proa', {
    p_ips_id: input.ipsId,
    p_paciente_id: input.patientId,
    p_caso_id: input.caseId ?? null,
    p_servicio_id: input.serviceId ?? null,
    p_cama: input.bed?.trim() || null,
  })

  if (error) throw error
  if (!data || typeof data !== 'object') throw new Error('EST02_UNEXPECTED: La ronda no pudo iniciarse.')

  const result = data as Record<string, unknown>
  if (!result.case || !result.round) throw new Error('EST02_UNEXPECTED: La ronda no devolvió un contexto válido.')
  return {
    case: result.case as CaseProa,
    round: result.round as RoundProa,
    caseCreated: Boolean(result.case_created),
    draftReused: Boolean(result.draft_reused),
  }
}

export async function createEmptyRound(input: NewRoundInput) {
  const now = new Date().toISOString()
  const common = {
    ips_id: input.ipsId,
    paciente_id: input.pacienteId,
    caso_id: input.casoId,
    servicio_id: input.servicioId || null,
    cama: input.cama?.trim() || null,
    ubicacion: null,
    fecha_hora_ronda: now,
    tipo_valoracion: input.tipoValoracion,
    estado: 'Borrador',
    profesional_id: input.profesionalId,
  }

  const { data, error } = await supabase.from('rondas_proa').insert(common).select('*').single()
  if (error) throw error
  return data as RoundProa
}

export async function getRecentRounds(ipsId: UUID) {
  const { data, error } = await supabase
    .from('rondas_proa')
    .select('*')
    .eq('ips_id', ipsId)
    .order('fecha_creacion', { ascending: false })
    .limit(20)

  if (error) throw error
  return (data ?? []) as RoundProa[]
}
