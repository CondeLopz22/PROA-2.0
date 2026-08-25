import { formatDate, formatDateTime } from '../lib/date'
import { supabase } from '../lib/supabase'
import { patientDisplayName } from './patientService'
import { treatmentDay, treatmentName } from './treatmentService'
import type { InterventionDraft } from './interventionService'
import type { MicrobiologyBundle } from './microbiologyService'
import type { DiagnosisRound, Patient, ProaNote, RoundProa, ServiceIps, Treatment, UUID } from '../types/domain'

export type NoteGenerationInput = {
  round: RoundProa
  patient: Patient
  services: ServiceIps[]
  diagnoses: DiagnosisRound[]
  treatments: Treatment[]
  microbiology: MicrobiologyBundle[]
  intervention: InterventionDraft
}

function line(value?: string | null) {
  return value?.trim() ? value.trim() : null
}

function section(title: string, body: Array<string | null | undefined>) {
  const clean = body.map(line).filter((value): value is string => Boolean(value))
  if (!clean.length) return null
  return [`**${title}:**`, ...clean].join('\n')
}

function diagnosisSummary(diagnoses: DiagnosisRound[], type: string) {
  const diagnosis = diagnoses.find((item) => item.tipo_diagnostico === type)
  if (!diagnosis?.descripcion_cie10) return null
  return [diagnosis.codigo_cie10, diagnosis.descripcion_cie10].filter(Boolean).join(' - ')
}

function treatmentSummary(treatment: Treatment, roundDate?: string | null) {
  const parts = [
    treatmentName(treatment),
    [treatment.dosis, treatment.unidad].filter(Boolean).join(' '),
    treatment.via,
    treatment.frecuencia,
  ].filter(Boolean)
  const day = treatmentDay(treatment.fecha_inicio, roundDate)
  const suffix = [
    treatment.fecha_inicio ? `Inicio ${formatDate(treatment.fecha_inicio)}` : null,
    day ? `día ${day}` : null,
    treatment.estado && treatment.estado !== 'Activo' ? `estado ${treatment.estado}` : null,
  ]
    .filter(Boolean)
    .join(', ')
  return `- ${parts.join(' · ')}${suffix ? `. ${suffix}.` : '.'}`
}

function microbiologySummary(bundle: MicrobiologyBundle) {
  const row = bundle.microbiology
  const sample = row.tipo_muestra ?? 'Muestra'
  const date = row.fecha_toma ? ` del ${formatDate(row.fecha_toma)}` : ''
  const result = row.resultado_general ? ` ${String(row.resultado_general).toLowerCase()}` : ''
  const organism = row.resultado_general === 'Positivo' && row.microorganismo ? ` para ${row.microorganismo}` : ''
  const germ = row.tipo_germen ? ` (${row.tipo_germen})` : ''
  const resistances = bundle.resistances.map((item) => item.mecanismo).filter(Boolean).join(', ')
  const sensitivity = bundle.sensitivities
    .map((item) => [item.antimicrobiano, item.resultado].filter(Boolean).join(': '))
    .filter(Boolean)
    .join('; ')
  const tail = [
    resistances ? `mecanismo(s): ${resistances}` : null,
    sensitivity ? `sensibilidad relevante: ${sensitivity}` : null,
    row.impacto_conducta ? `impacto en conducta: ${row.impacto_conducta}` : null,
  ]
    .filter(Boolean)
    .join('. ')
  return `${sample}${date}${result}${organism}${germ}.${tail ? ` ${tail}.` : ''}`
}

function interventionSummary(intervention: InterventionDraft) {
  if (!intervention.huboIntervencion) return null
  if (intervention.huboIntervencion === 'No') {
    const reason = intervention.motivoNoIntervencion === 'Otro'
      ? intervention.descripcionMotivoNoIntervencion
      : intervention.motivoNoIntervencion
    return [`No hubo intervención PROA${reason ? `: ${reason}` : ''}.`]
  }

  const first = [
    intervention.tipoIntervencion ? `Intervención: ${intervention.tipoIntervencion}` : null,
    intervention.origenIntervencion ? `origen ${intervention.origenIntervencion}` : null,
    intervention.recomendacion ? `recomendación ${intervention.recomendacion}` : null,
  ]
    .filter(Boolean)
    .join('; ')
  return [
    first ? `${first}.` : null,
    intervention.descripcionRecomendacion ? intervention.descripcionRecomendacion : null,
    intervention.aceptacion ? `Aceptación: ${intervention.aceptacion}.` : null,
    intervention.motivoNoAceptacion ? `Motivo de no aceptación/parcial: ${intervention.motivoNoAceptacion}.` : null,
  ].filter((value): value is string => Boolean(value))
}

export function generateProaNote(input: NoteGenerationInput) {
  const service = input.services.find((item) => item.id === input.round.servicio_id)
  const principal = diagnosisSummary(input.diagnoses, 'Principal')
  const infectious = diagnosisSummary(input.diagnoses, 'Infeccioso')
  const contextBits = [
    `Paciente en ${input.round.tipo_valoracion?.toLowerCase() ?? 'valoración'} por PROA`,
    principal ? `diagnóstico principal ${principal}` : null,
    infectious ? `diagnóstico infeccioso ${infectious}` : null,
    input.round.tipo_terapia ? `terapia ${String(input.round.tipo_terapia).toLowerCase()}` : null,
  ].filter(Boolean)

  const blocks = [
    '## EVOLUCIÓN PROA',
    section('Paciente', [
      `${patientDisplayName(input.patient)} · ${input.patient.tipo_identificacion} ${input.patient.numero_identificacion}`,
    ]),
    section('Ubicación', [[service?.nombre ?? input.round.ubicacion, input.round.cama].filter(Boolean).join(' · ')]),
    section('Contexto clínico', [contextBits.length ? `${contextBits.join(', ')}.` : null]),
    section('Evolución', [input.round.evolucion_clinica ?? null]),
    section('Tratamiento antimicrobiano', input.treatments.map((treatment) => treatmentSummary(treatment, input.round.fecha_hora_ronda))),
    input.microbiology.length
      ? section('Microbiología', input.microbiology.map(microbiologySummary))
      : null,
    section('Intervención PROA', interventionSummary(input.intervention) ?? []),
    section('Adherencia', [
      input.intervention.cumplimientoGuia
        ? `${input.intervention.cumplimientoGuia}${input.intervention.motivoNoCumplimiento ? `: ${input.intervention.motivoNoCumplimiento}` : ''}.`
        : null,
    ]),
    section('Plan / seguimiento', [
      input.intervention.requiereSeguimiento
        ? `Requiere seguimiento${input.intervention.fechaSeguimiento ? ` el ${formatDate(input.intervention.fechaSeguimiento)}` : ''}${
            input.intervention.motivoSeguimiento ? ` por ${input.intervention.motivoSeguimiento}` : ''
          }.`
        : null,
      input.round.fecha_hora_ronda ? `Ronda registrada el ${formatDateTime(input.round.fecha_hora_ronda)}.` : null,
    ]),
  ].filter(Boolean)

  return blocks.join('\n\n')
}

export async function getLatestRoundNote(roundId: UUID) {
  const { data, error } = await supabase
    .from('notas_proa')
    .select('*')
    .eq('ronda_id', roundId)
    .order('version', { ascending: false })
    .limit(1)
  if (error) throw error
  return (((data ?? [])[0] as ProaNote | undefined) ?? null)
}

export async function saveRoundNoteDraft({
  roundId,
  generatedText,
  finalText,
}: {
  roundId: UUID
  generatedText: string
  finalText: string
}) {
  const latest = await getLatestRoundNote(roundId)
  if (latest && !latest.fecha_confirmacion) {
    const { data, error } = await supabase
      .from('notas_proa')
      .update({ texto_generado: generatedText, texto_final: finalText })
      .eq('id', latest.id)
      .select('*')
      .single()
    if (error) throw error
    return data as ProaNote
  }

  const { data, error } = await supabase
    .from('notas_proa')
    .insert({
      ronda_id: roundId,
      texto_generado: generatedText,
      texto_final: finalText,
      version: (latest?.version ?? 0) + 1,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as ProaNote
}

export async function confirmRoundWithNote({
  roundId,
  userId,
  generatedText,
  finalText,
}: {
  roundId: UUID
  userId: UUID
  generatedText: string
  finalText: string
}) {
  const now = new Date().toISOString()
  const note = await saveRoundNoteDraft({ roundId, generatedText, finalText })
  const noteResult = await supabase
    .from('notas_proa')
    .update({ texto_final: finalText, fecha_confirmacion: now, usuario_confirma: userId })
    .eq('id', note.id)
    .select('*')
    .single()
  if (noteResult.error) throw noteResult.error

  const roundResult = await supabase
    .from('rondas_proa')
    .update({ estado: 'Confirmada', fecha_confirmacion: now })
    .eq('id', roundId)
    .select('*')
    .single()
  if (roundResult.error) throw roundResult.error

  return { note: noteResult.data as ProaNote, round: roundResult.data as RoundProa }
}
