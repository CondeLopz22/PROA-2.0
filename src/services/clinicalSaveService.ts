import { supabase } from '../lib/supabase'
import type { DiagnosisDraft } from './clinicalRoundService'
import type { InterventionDraft } from './interventionService'
import type { MicrobiologyDraft } from './microbiologyService'
import type { NewTreatmentDraft, TreatmentActionDraft } from './treatmentService'
import type { DiagnosisRound, ProaNote, RoundProa, UUID } from '../types/domain'

type RoundPayload = {
  serviceId: UUID | ''
  bed: string
  roundAt: string | null
  assessmentType: string
  therapyType: string
  microbiologyDirected: boolean | null
  prophylaxisType: string
  clinicalEvolution: string
}

export type ClinicalSaveInput = {
  roundId: UUID
  ipsId: UUID
  patientId: UUID
  caseId: UUID
  round: RoundPayload
  diagnoses: DiagnosisDraft[]
  treatmentActions: Array<{ treatmentId: UUID; draft: TreatmentActionDraft }>
  newTreatments: NewTreatmentDraft[]
  microbiology: MicrobiologyDraft
  intervention?: InterventionDraft | null
  note?: { generatedText: string; finalText: string } | null
  confirm?: boolean
}

export type ClinicalSaveResult = {
  round: RoundProa
  diagnoses: DiagnosisRound[]
  note: ProaNote | null
}

function treatmentActionPayload(item: ClinicalSaveInput['treatmentActions'][number]) {
  const { treatmentId, draft } = item
  if (draft.kind === 'Continuar') return { treatment_id: treatmentId, action: draft.kind }
  if (draft.kind === 'Modificar') {
    return {
      treatment_id: treatmentId,
      action: draft.kind,
      dose: draft.modification.dosis,
      unit: draft.modification.unidad,
      frequency: draft.modification.frecuencia,
      route: draft.modification.via,
      reason: draft.modification.motivo,
      reason_other: draft.modification.motivoOtro,
    }
  }
  return {
    treatment_id: treatmentId,
    action: draft.kind,
    end_date: draft.suspension.fechaFin,
    reason: draft.suspension.motivo,
    reason_other: draft.suspension.motivoOtro,
  }
}

export function buildClinicalSavePayload(input: ClinicalSaveInput) {
  const payload: Record<string, unknown> = {
    round_id: input.roundId,
    ips_id: input.ipsId,
    patient_id: input.patientId,
    case_id: input.caseId,
    round: {
      service_id: input.round.serviceId || null,
      bed: input.round.bed,
      round_at: input.round.roundAt,
      assessment_type: input.round.assessmentType,
      therapy_type: input.round.therapyType,
      microbiology_directed: input.round.microbiologyDirected,
      prophylaxis_type: input.round.prophylaxisType,
      clinical_evolution: input.round.clinicalEvolution,
    },
    diagnoses: input.diagnoses
      .filter((item) => item.codigo_cie10.trim() && item.descripcion_cie10.trim())
      .map((item) => ({
        id: item.id ?? null,
        code: item.codigo_cie10,
        description: item.descripcion_cie10,
        type: item.tipo_diagnostico,
        proa_category: item.categoria_proa,
        proa_category_id: item.categoria_proa_id,
      })),
    treatment_actions: input.treatmentActions.map(treatmentActionPayload),
    new_treatments: input.newTreatments.map((item) => ({
      antimicrobial_id: item.antimicrobialId,
      antimicrobial_name: item.antimicrobialName,
      dose: item.dosis,
      unit: item.unidad,
      frequency: item.frecuencia,
      route: item.via,
      start_date: item.fechaInicio,
      planned_duration_days: item.duracionPrevistaDias,
    })),
    microbiology: {
      status: input.microbiology.status,
      sample_type_id: input.microbiology.tipoMuestraId || null,
      sample_type: input.microbiology.tipoMuestra,
      sampled_at: input.microbiology.fechaToma || null,
      result_at: input.microbiology.fechaResultado || null,
      general_result: input.microbiology.resultadoGeneral || null,
      microorganism_id: input.microbiology.microorganismoId || null,
      microorganism: input.microbiology.microorganismo,
      germ_type: input.microbiology.tipoGermen,
      is_control_sample: input.microbiology.esMuestraControl,
      previous_sample_id: input.microbiology.muestraPreviaId || null,
      conduct_impact: input.microbiology.impactoConducta || null,
      resistances: input.microbiology.resistencias.map((item) => ({ mechanism: item.mecanismo })),
      sensitivities: input.microbiology.sensibilidades.map((item) => ({
        antimicrobial_id: item.antimicrobianoId || null,
        antimicrobial: item.antimicrobiano,
        result: item.resultado,
      })),
    },
    confirm: Boolean(input.confirm),
  }

  if (input.intervention?.huboIntervencion) {
    payload.intervention = {
      has_intervention: input.intervention.huboIntervencion === 'Sí',
      no_intervention_reason: input.intervention.motivoNoIntervencion || null,
      no_intervention_description: input.intervention.descripcionMotivoNoIntervencion || null,
      intervention_type_id: input.intervention.tipoIntervencionId || null,
      intervention_type: input.intervention.tipoIntervencion || null,
      treatment_ids: Array.from(new Set(input.intervention.tratamientosRelacionados)),
      origin: input.intervention.origenIntervencion || null,
      recommendation: input.intervention.recomendacion || null,
      recommendation_description: input.intervention.descripcionRecomendacion || null,
      acceptance: input.intervention.aceptacion || null,
      non_acceptance_reason: input.intervention.motivoNoAceptacion || null,
      guideline_compliance: input.intervention.cumplimientoGuia || null,
      non_compliance_reason: input.intervention.motivoNoCumplimiento || null,
      saved_days: input.intervention.diasAhorrados,
      follow_up_required: input.intervention.requiereSeguimiento,
      follow_up_at: input.intervention.fechaSeguimiento || null,
      follow_up_reason: input.intervention.motivoSeguimiento || null,
    }
  }

  if (input.note) {
    payload.note = {
      generated_text: input.note.generatedText,
      final_text: input.note.finalText,
    }
  }

  return payload
}

const transactionalErrors: Array<[string, string]> = [
  ['EST01_ACCESS:', 'No tienes permisos para modificar esta ronda.'],
  ['EST01_CONFIRMED:', 'La ronda confirmada o anulada es de solo lectura.'],
  ['EST01_CONTEXT:', 'No se pudo validar el contexto de la ronda.'],
  ['EST01_DIAGNOSIS:', 'No se pudo guardar el bloque Diagnóstico.'],
  ['EST01_TREATMENT:', 'No se pudo guardar el bloque Antimicrobianos.'],
  ['EST01_MICROBIOLOGY:', 'No se pudo guardar el bloque Microbiología.'],
  ['EST01_INTERVENTION:', 'No se pudo guardar el bloque Intervención PROA.'],
  ['EST01_NOTE:', 'No se pudo guardar la Nota de Evolución PROA.'],
]

export function clinicalSaveError(error: unknown) {
  const message = typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
    ? error.message
    : ''
  for (const [prefix, fallback] of transactionalErrors) {
    if (message.includes(prefix)) return message.split(prefix)[1]?.trim() || fallback
  }
  if (error instanceof Error && !('code' in error) && message) return message
  return 'No se pudo guardar la ronda. Ningún cambio de este intento fue aplicado.'
}

export async function saveClinicalRoundTransaction(input: ClinicalSaveInput): Promise<ClinicalSaveResult> {
  const { data, error } = await supabase.rpc('guardar_ronda_clinica', {
    p_payload: buildClinicalSavePayload(input),
  })
  if (error) throw error
  if (!data || typeof data !== 'object') throw new Error('EST01_UNEXPECTED: La respuesta del guardado no es válida')
  return data as ClinicalSaveResult
}
