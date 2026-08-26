import { supabase } from '../lib/supabase'
import type { Treatment, UUID } from '../types/domain'

export type NewTreatmentDraft = {
  id?: UUID
  antimicrobialId: UUID
  antimicrobialName: string
  dosis: string
  unidad: string
  frecuencia: string
  via: string
  fechaInicio: string
  duracionPrevistaDias?: string
}

export type TreatmentModificationDraft = {
  dosis?: string
  unidad?: string
  frecuencia?: string
  via?: string
  motivo: string
  motivoOtro?: string
}

export type TreatmentSuspensionDraft = {
  fechaFin: string
  motivo: string
  motivoOtro?: string
}

export type TreatmentActionDraft =
  | { kind: 'Continuar' }
  | { kind: 'Modificar'; modification: TreatmentModificationDraft }
  | { kind: 'Suspender'; suspension: TreatmentSuspensionDraft }

export function treatmentName(treatment: Treatment) {
  return treatment.antimicrobiano ?? 'Antimicrobiano'
}

export function normalizeAntimicrobialName(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export function isEquivalentActiveTreatment(treatment: Treatment, draft: Pick<NewTreatmentDraft, 'antimicrobialId' | 'antimicrobialName'>) {
  if (treatment.estado !== 'Activo') return false
  if (treatment.antimicrobiano_id && draft.antimicrobialId) return treatment.antimicrobiano_id === draft.antimicrobialId
  return normalizeAntimicrobialName(treatment.antimicrobiano) === normalizeAntimicrobialName(draft.antimicrobialName)
}

export function findActiveTreatmentDuplicate(
  treatments: Treatment[],
  draft: Pick<NewTreatmentDraft, 'antimicrobialId' | 'antimicrobialName'>,
) {
  return treatments.find((treatment) => isEquivalentActiveTreatment(treatment, draft)) ?? null
}

export function treatmentDay(fechaInicio?: string | null, fechaRonda?: string | null) {
  if (!fechaInicio) return null
  const start = new Date(fechaInicio)
  const round = fechaRonda ? new Date(fechaRonda) : new Date()
  if (Number.isNaN(start.getTime()) || Number.isNaN(round.getTime())) return null
  const diff = Math.floor((round.getTime() - start.getTime()) / 86_400_000)
  return Math.max(diff + 1, 1)
}

export function estimatedEndDate(fechaInicio?: string | null, durationDays?: number | null) {
  if (!fechaInicio || !durationDays || durationDays < 0) return null
  const start = new Date(fechaInicio)
  if (Number.isNaN(start.getTime())) return null
  start.setDate(start.getDate() + durationDays - 1)
  return start.toISOString()
}

function asNumber(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : value
}

function reasonWithOther(reason: string, other?: string) {
  return reason === 'Otro' && other?.trim() ? other.trim() : reason
}

async function insertHistory(payload: Record<string, string | number | null>) {
  const { error } = await supabase.from('historial_tratamiento').insert(payload)
  if (error) throw error
}

async function ensureNoActiveTreatmentDuplicate(casoId: UUID, draft: Pick<NewTreatmentDraft, 'antimicrobialId' | 'antimicrobialName'>) {
  const { data, error } = await supabase
    .from('tratamientos_antimicrobianos')
    .select('id,estado,antimicrobiano_id,antimicrobiano')
    .eq('caso_id', casoId)
    .eq('estado', 'Activo')
  if (error) throw error
  const duplicate = findActiveTreatmentDuplicate((data ?? []) as Treatment[], draft)
  if (duplicate) throw new Error('Este antimicrobiano ya se encuentra activo en el caso.')
}

export async function createTreatment({
  ipsId,
  pacienteId,
  casoId,
  rondaId,
  draft,
}: {
  ipsId: UUID
  pacienteId: UUID
  casoId: UUID
  rondaId: UUID
  draft: NewTreatmentDraft
}) {
  const payload = {
    ips_id: ipsId,
    paciente_id: pacienteId,
    caso_id: casoId,
    ronda_id: rondaId,
    antimicrobiano_id: draft.antimicrobialId,
    antimicrobiano: draft.antimicrobialName,
    dosis: asNumber(draft.dosis),
    unidad: draft.unidad.trim() || null,
    frecuencia: draft.frecuencia.trim() || null,
    via: draft.via.trim() || null,
    fecha_inicio: draft.fechaInicio || new Date().toISOString().slice(0, 10),
    duracion_prevista_dias: draft.duracionPrevistaDias ? Number(draft.duracionPrevistaDias) : null,
    estado: 'Activo',
  }

  const existing = await supabase
    .from('tratamientos_antimicrobianos')
    .select('*')
    .eq('ronda_id', rondaId)
    .eq('antimicrobiano_id', draft.antimicrobialId)
    .eq('fecha_inicio', payload.fecha_inicio)
    .limit(1)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) {
    const { data, error } = await supabase
      .from('tratamientos_antimicrobianos')
      .update(payload)
      .eq('id', existing.data.id)
      .select('*')
      .single()
    if (error) throw error
    return data as Treatment
  }

  await ensureNoActiveTreatmentDuplicate(casoId, draft)

  const { data, error } = await supabase.from('tratamientos_antimicrobianos').insert(payload).select('*').single()
  if (error) throw error

  await insertHistory({
    tratamiento_id: data.id,
    ronda_id: rondaId,
    accion: 'Inicio',
    fecha_evento: new Date().toISOString(),
    valor_nuevo: draft.antimicrobialName,
  })

  return data as Treatment
}

export async function continueTreatment(treatmentId: UUID, rondaId: UUID) {
  await insertHistory({
    tratamiento_id: treatmentId,
    ronda_id: rondaId,
    accion: 'Continuación',
    fecha_evento: new Date().toISOString(),
  })
}

export async function modifyTreatment({
  treatment,
  rondaId,
  modification,
}: {
  treatment: Treatment
  rondaId: UUID
  modification: TreatmentModificationDraft
}) {
  const fields: Array<keyof Pick<Treatment, 'dosis' | 'unidad' | 'frecuencia' | 'via'>> = [
    'dosis',
    'unidad',
    'frecuencia',
    'via',
  ]
  const updates: Record<string, string | number | null> = {}
  const reason = reasonWithOther(modification.motivo, modification.motivoOtro)

  for (const field of fields) {
    const rawNext = modification[field]
    if (rawNext === undefined) continue
    const nextValue = field === 'dosis' ? asNumber(rawNext) : rawNext.trim() || null
    const previousValue = treatment[field] ?? null
    if (String(previousValue ?? '') === String(nextValue ?? '')) continue

    await insertHistory({
      tratamiento_id: treatment.id,
      ronda_id: rondaId,
      accion: 'Modificación',
      fecha_evento: new Date().toISOString(),
      campo_modificado: field,
      valor_anterior: previousValue === null ? null : String(previousValue),
      valor_nuevo: nextValue === null ? null : String(nextValue),
      motivo: reason,
      tipo_intervencion: modification.motivo === 'Intervención PROA' ? 'Intervención PROA' : null,
    })

    updates[field] = nextValue
  }

  if (!Object.keys(updates).length) return treatment

  updates.fecha_ultima_modificacion = new Date().toISOString()
  const { data, error } = await supabase
    .from('tratamientos_antimicrobianos')
    .update(updates)
    .eq('id', treatment.id)
    .select('*')
    .single()

  if (error) throw error
  return data as Treatment
}

export async function suspendTreatment({
  treatment,
  rondaId,
  suspension,
}: {
  treatment: Treatment
  rondaId: UUID
  suspension: TreatmentSuspensionDraft
}) {
  if (treatment.fecha_inicio && suspension.fechaFin < treatment.fecha_inicio.slice(0, 10)) {
    throw new Error('La fecha de suspensión no puede ser anterior a la fecha de inicio.')
  }

  const reason = reasonWithOther(suspension.motivo, suspension.motivoOtro)
  const { data, error } = await supabase
    .from('tratamientos_antimicrobianos')
    .update({
      fecha_fin: suspension.fechaFin,
      estado: 'Suspendido',
      fecha_ultima_modificacion: new Date().toISOString(),
    })
    .eq('id', treatment.id)
    .select('*')
    .single()

  if (error) throw error

  await insertHistory({
    tratamiento_id: treatment.id,
    ronda_id: rondaId,
    accion: 'Suspensión',
    fecha_evento: new Date().toISOString(),
    valor_anterior: treatment.estado ?? 'Activo',
    valor_nuevo: 'Suspendido',
    motivo: reason,
    tipo_intervencion: suspension.motivo === 'Intervención PROA' ? 'Intervención PROA' : null,
  })

  return data as Treatment
}
