import { supabase } from '../lib/supabase'
import type {
  CaseProa,
  DiagnosisRound,
  Microbiology,
  Patient,
  ProaIntervention,
  RoundProa,
  ServiceIps,
  Treatment,
  UUID,
} from '../types/domain'

export type PatientRecordBundle = {
  patient: Patient
  cases: CaseProa[]
  rounds: RoundProa[]
  diagnoses: DiagnosisRound[]
  treatments: Treatment[]
  microbiology: Microbiology[]
  interventions: ProaIntervention[]
  services: ServiceIps[]
}

export type PatientTimelineEvent = {
  id: string
  kind: 'Caso' | 'Ronda' | 'Diagnóstico' | 'Tratamiento' | 'Microbiología' | 'Intervención'
  title: string
  summary: string
  occurredAt: string
  caseId: UUID
  roundId?: UUID | null
}

export async function getPatientRecord(ipsId: UUID, patientId: UUID): Promise<PatientRecordBundle> {
  const patientResult = await supabase
    .from('pacientes')
    .select('*')
    .eq('ips_id', ipsId)
    .eq('id', patientId)
    .maybeSingle()
  if (patientResult.error) throw patientResult.error
  if (!patientResult.data) throw new Error('El paciente no está disponible en la IPS activa.')

  const [casesResult, roundsResult, treatmentsResult, servicesResult] = await Promise.all([
    supabase.from('casos_proa').select('*').eq('ips_id', ipsId).eq('paciente_id', patientId).order('fecha_apertura', { ascending: false }),
    supabase.from('rondas_proa').select('*').eq('ips_id', ipsId).eq('paciente_id', patientId).order('fecha_hora_ronda', { ascending: false }),
    supabase.from('tratamientos_antimicrobianos').select('*').eq('ips_id', ipsId).eq('paciente_id', patientId).order('fecha_inicio', { ascending: false }),
    supabase.from('servicios_ips').select('*').eq('ips_id', ipsId),
  ])
  if (casesResult.error) throw casesResult.error
  if (roundsResult.error) throw roundsResult.error
  if (treatmentsResult.error) throw treatmentsResult.error
  if (servicesResult.error) throw servicesResult.error

  const cases = (casesResult.data ?? []) as CaseProa[]
  const rounds = (roundsResult.data ?? []) as RoundProa[]
  const caseIds = cases.map((row) => row.id)
  const roundIds = rounds.map((row) => row.id)
  const [diagnosesResult, microbiologyResult, interventionsResult] = await Promise.all([
    roundIds.length
      ? supabase.from('diagnosticos_ronda').select('*').in('ronda_id', roundIds).order('fecha_creacion', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    caseIds.length
      ? supabase.from('microbiologia').select('*').eq('ips_id', ipsId).in('caso_id', caseIds).order('fecha_toma', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    roundIds.length
      ? supabase.from('intervenciones_proa').select('*').eq('ips_id', ipsId).in('ronda_id', roundIds).order('fecha_creacion', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ])
  if (diagnosesResult.error) throw diagnosesResult.error
  if (microbiologyResult.error) throw microbiologyResult.error
  if (interventionsResult.error) throw interventionsResult.error

  return {
    patient: patientResult.data as Patient,
    cases,
    rounds,
    diagnoses: (diagnosesResult.data ?? []) as DiagnosisRound[],
    treatments: (treatmentsResult.data ?? []) as Treatment[],
    microbiology: (microbiologyResult.data ?? []) as Microbiology[],
    interventions: (interventionsResult.data ?? []) as ProaIntervention[],
    services: (servicesResult.data ?? []) as ServiceIps[],
  }
}

export function buildPatientTimeline(record: PatientRecordBundle): PatientTimelineEvent[] {
  const roundCase = new Map(record.rounds.map((round) => [round.id, round.caso_id]))
  const events: PatientTimelineEvent[] = []
  const add = (event: PatientTimelineEvent | null) => { if (event?.occurredAt) events.push(event) }

  record.cases.forEach((item) => {
    if (item.fecha_apertura) add({ id: `case-open-${item.id}`, kind: 'Caso', title: 'Caso PROA abierto', summary: item.ubicacion_actual ?? 'Sin ubicación registrada', occurredAt: item.fecha_apertura, caseId: item.id })
    if (item.fecha_cierre) add({ id: `case-close-${item.id}`, kind: 'Caso', title: 'Caso PROA cerrado', summary: item.motivo_cierre ?? 'Sin motivo registrado', occurredAt: item.fecha_cierre, caseId: item.id })
  })
  record.rounds.forEach((item) => {
    if (item.caso_id) add({ id: `round-${item.id}`, kind: 'Ronda', title: item.tipo_valoracion ?? 'Ronda PROA', summary: `${item.estado ?? 'Sin estado'} · ${item.evolucion_clinica ?? 'Evolución no registrada'}`, occurredAt: item.fecha_hora_ronda ?? item.fecha_creacion ?? '', caseId: item.caso_id, roundId: item.id })
  })
  record.diagnoses.forEach((item) => {
    const caseId = roundCase.get(item.ronda_id)
    if (caseId) add({ id: `diagnosis-${item.id}`, kind: 'Diagnóstico', title: item.tipo_diagnostico ?? 'Diagnóstico', summary: [item.codigo_cie10, item.descripcion_cie10].filter(Boolean).join(' · '), occurredAt: item.fecha_creacion ?? '', caseId, roundId: item.ronda_id })
  })
  record.treatments.forEach((item) => {
    if (item.caso_id) add({ id: `treatment-${item.id}`, kind: 'Tratamiento', title: item.antimicrobiano ?? 'Antimicrobiano', summary: `${item.estado ?? 'Sin estado'} · ${[item.dosis, item.unidad, item.frecuencia, item.via].filter(Boolean).join(' ') || 'Esquema no registrado'}`, occurredAt: item.fecha_inicio ?? item.fecha_ultima_modificacion ?? '', caseId: item.caso_id, roundId: item.ronda_id })
  })
  record.microbiology.forEach((item) => {
    if (item.caso_id) add({ id: `micro-${item.id}`, kind: 'Microbiología', title: item.tipo_muestra ?? 'Estudio microbiológico', summary: [item.resultado_general, item.microorganismo].filter(Boolean).join(' · ') || 'Sin resultado', occurredAt: item.fecha_resultado ?? item.fecha_toma ?? item.fecha_creacion ?? '', caseId: item.caso_id, roundId: item.ronda_id })
  })
  record.interventions.forEach((item) => {
    const caseId = item.ronda_id ? roundCase.get(item.ronda_id) : null
    if (caseId) add({ id: `intervention-${item.id}`, kind: 'Intervención', title: item.hubo_intervencion ? item.tipo_intervencion ?? 'Intervención PROA' : 'Sin intervención', summary: item.descripcion_recomendacion ?? item.recomendacion ?? item.motivo_no_intervencion ?? 'Sin detalle', occurredAt: item.fecha_creacion ?? '', caseId, roundId: item.ronda_id })
  })

  return events.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
}
