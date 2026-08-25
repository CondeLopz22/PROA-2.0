import { supabase } from '../lib/supabase'
import type { ProaIntervention, RoundProa, Treatment, UUID } from '../types/domain'

export type InterventionDraft = {
  id?: UUID
  huboIntervencion: '' | 'Sí' | 'No'
  tipoIntervencionId: UUID | ''
  tipoIntervencion: string
  tratamientosRelacionados: UUID[]
  motivoNoIntervencion: string
  descripcionMotivoNoIntervencion: string
  origenIntervencion: string
  recomendacion: string
  descripcionRecomendacion: string
  aceptacion: 'Sí' | 'No' | 'Parcialmente' | 'Pendiente' | ''
  motivoNoAceptacion: string
  cumplimientoGuia: 'Cumple' | 'No cumple' | 'No aplica' | 'No evaluable' | ''
  motivoNoCumplimiento: string
  diasAhorrados: number | null
  requiereSeguimiento: boolean
  fechaSeguimiento: string
  motivoSeguimiento: string
}

export type InterventionBundle = {
  intervention: ProaIntervention
  treatmentIds: UUID[]
}

export const noInterventionReasons = [
  'Tratamiento adecuado',
  'Sin cambios requeridos',
  'Pendiente de resultados',
  'Paciente no valorable',
  'Otro',
]

export const interventionOrigins = [
  'Valoración clínica',
  'Microbiología',
  'Duración',
  'Dosis',
  'Función renal',
  'Función hepática',
  'Interacción',
  'Evento adverso',
  'Adherencia a guía',
  'Otro',
]

export const recommendationOptions = [
  'Desescalar',
  'Escalar',
  'Rotar/cambiar',
  'Suspender',
  'Ajustar dosis',
  'Ajustar frecuencia',
  'Cambiar IV a VO',
  'Optimizar duración',
  'Iniciar antimicrobiano',
  'Ajustar según microbiología',
]

export function emptyInterventionDraft(): InterventionDraft {
  return {
    huboIntervencion: '',
    tipoIntervencionId: '',
    tipoIntervencion: '',
    tratamientosRelacionados: [],
    motivoNoIntervencion: '',
    descripcionMotivoNoIntervencion: '',
    origenIntervencion: '',
    recomendacion: '',
    descripcionRecomendacion: '',
    aceptacion: '',
    motivoNoAceptacion: '',
    cumplimientoGuia: '',
    motivoNoCumplimiento: '',
    diasAhorrados: null,
    requiereSeguimiento: false,
    fechaSeguimiento: '',
    motivoSeguimiento: '',
  }
}

export function interventionDraftFromBundle(bundle?: InterventionBundle | null): InterventionDraft {
  if (!bundle) return emptyInterventionDraft()
  const row = bundle.intervention
  return {
    id: row.id,
    huboIntervencion: row.hubo_intervencion === null || row.hubo_intervencion === undefined ? '' : row.hubo_intervencion ? 'Sí' : 'No',
    tipoIntervencionId: row.tipo_intervencion_id ?? '',
    tipoIntervencion: row.tipo_intervencion ?? '',
    tratamientosRelacionados: bundle.treatmentIds,
    motivoNoIntervencion: row.motivo_no_intervencion ?? '',
    descripcionMotivoNoIntervencion: row.descripcion_motivo_no_intervencion ?? '',
    origenIntervencion: row.origen_intervencion ?? '',
    recomendacion: row.recomendacion ?? '',
    descripcionRecomendacion: row.descripcion_recomendacion ?? '',
    aceptacion: (row.aceptacion as InterventionDraft['aceptacion']) ?? '',
    motivoNoAceptacion: row.motivo_no_aceptacion ?? '',
    cumplimientoGuia: (row.cumplimiento_guia as InterventionDraft['cumplimientoGuia']) ?? '',
    motivoNoCumplimiento: row.motivo_no_cumplimiento ?? '',
    diasAhorrados: row.dias_ahorrados ?? null,
    requiereSeguimiento: Boolean(row.requiere_seguimiento),
    fechaSeguimiento: row.fecha_seguimiento ? row.fecha_seguimiento.slice(0, 10) : '',
    motivoSeguimiento: row.motivo_seguimiento ?? '',
  }
}

export function calculateSavedDays(treatments: Treatment[], selectedIds: UUID[]) {
  const selected = treatments.filter((treatment) => selectedIds.includes(treatment.id))
  const values = selected
    .map((treatment) => {
      if (!treatment.fecha_inicio || !treatment.fecha_fin || !treatment.duracion_prevista_dias) return null
      const start = new Date(treatment.fecha_inicio)
      const end = new Date(treatment.fecha_fin)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
      const actualDays = Math.max(Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1, 0)
      return Math.max(Number(treatment.duracion_prevista_dias) - actualDays, 0)
    })
    .filter((value): value is number => value !== null)
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0)
}

export async function getRoundIntervention(roundId: UUID) {
  const { data, error } = await supabase
    .from('intervenciones_proa')
    .select('*')
    .eq('ronda_id', roundId)
    .order('fecha_creacion', { ascending: false })
    .limit(1)
  if (error) throw error

  const intervention = ((data ?? [])[0] as ProaIntervention | undefined) ?? null
  if (!intervention) return null

  const relationResult = await supabase
    .from('intervencion_tratamiento')
    .select('tratamiento_id')
    .eq('intervencion_id', intervention.id)
  if (relationResult.error) throw relationResult.error

  return {
    intervention,
    treatmentIds: (relationResult.data ?? []).map((row) => row.tratamiento_id as UUID).filter(Boolean),
  }
}

export async function replaceRoundIntervention({
  round,
  draft,
}: {
  round: RoundProa
  draft: InterventionDraft
}) {
  const existing = await supabase.from('intervenciones_proa').select('id').eq('ronda_id', round.id)
  if (existing.error) throw existing.error
  const existingIds = (existing.data ?? []).map((item) => item.id as UUID)
  if (existingIds.length) {
    const relationDelete = await supabase.from('intervencion_tratamiento').delete().in('intervencion_id', existingIds)
    if (relationDelete.error) throw relationDelete.error
    const interventionDelete = await supabase.from('intervenciones_proa').delete().eq('ronda_id', round.id)
    if (interventionDelete.error) throw interventionDelete.error
  }

  if (!draft.huboIntervencion) return null
  if (!round.ips_id || !round.id) throw new Error('La ronda no tiene contexto de intervención completo.')
  const hasIntervention = draft.huboIntervencion === 'Sí'

  const { data, error } = await supabase
    .from('intervenciones_proa')
    .insert({
      ips_id: round.ips_id,
      ronda_id: round.id,
      hubo_intervencion: hasIntervention,
      tipo_intervencion_id: hasIntervention ? draft.tipoIntervencionId || null : null,
      tipo_intervencion: hasIntervention ? draft.tipoIntervencion.trim() || null : null,
      motivo_no_intervencion: hasIntervention ? null : draft.motivoNoIntervencion || null,
      descripcion_motivo_no_intervencion:
        !hasIntervention && draft.motivoNoIntervencion === 'Otro' ? draft.descripcionMotivoNoIntervencion.trim() || null : null,
      origen_intervencion: hasIntervention ? draft.origenIntervencion || null : null,
      recomendacion: hasIntervention ? draft.recomendacion || null : null,
      descripcion_recomendacion: hasIntervention ? draft.descripcionRecomendacion.trim() || null : null,
      aceptacion: hasIntervention ? draft.aceptacion || null : null,
      motivo_no_aceptacion:
        hasIntervention && (draft.aceptacion === 'No' || draft.aceptacion === 'Parcialmente')
          ? draft.motivoNoAceptacion.trim() || null
          : null,
      cumplimiento_guia: draft.cumplimientoGuia || null,
      motivo_no_cumplimiento:
        draft.cumplimientoGuia === 'No cumple' ? draft.motivoNoCumplimiento.trim() || null : null,
      dias_ahorrados: hasIntervention ? draft.diasAhorrados : null,
      requiere_seguimiento: draft.requiereSeguimiento,
      fecha_seguimiento: draft.requiereSeguimiento && draft.fechaSeguimiento ? draft.fechaSeguimiento : null,
      motivo_seguimiento: draft.requiereSeguimiento ? draft.motivoSeguimiento.trim() || null : null,
    })
    .select('*')
    .single()
  if (error) throw error

  if (hasIntervention && draft.tratamientosRelacionados.length) {
    const relationResult = await supabase.from('intervencion_tratamiento').insert(
      Array.from(new Set(draft.tratamientosRelacionados)).map((tratamientoId) => ({
        intervencion_id: data.id,
        tratamiento_id: tratamientoId,
      })),
    )
    if (relationResult.error) throw relationResult.error
  }

  return data as ProaIntervention
}
