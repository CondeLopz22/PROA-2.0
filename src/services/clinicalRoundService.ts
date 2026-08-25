import { supabase } from '../lib/supabase'
import type {
  CaseProa,
  DiagnosisRound,
  Patient,
  RoundClinicalBundle,
  RoundProa,
  Treatment,
  UserProfile,
  UUID,
} from '../types/domain'
import { getUserProfile } from './profileService'

export type RoundContextInput = {
  roundId: UUID
  ipsId: UUID
  pacienteId: UUID
  casoId: UUID
  servicioId?: UUID | null
  cama?: string | null
  fechaRonda?: string | null
  profesionalId: UUID
  tipoValoracion: 'Primera valoración' | 'Seguimiento'
  tipoTerapia?: 'Empírica' | 'Dirigida' | 'Profiláctica' | ''
  terapiaDirigidaPorMicrobiologia?: boolean | null
  tipoProfilaxis?: 'Quirúrgica' | 'Médica' | 'Otra' | ''
  evolucionClinica?: 'Mejoría' | 'Estable' | 'Deterioro' | 'No valorable' | ''
}

export type DiagnosisDraft = {
  id?: UUID
  codigo_cie10: string
  descripcion_cie10: string
  tipo_diagnostico: 'Principal' | 'Relacionado' | 'Infeccioso'
  categoria_proa?: string | null
  categoria_proa_id?: UUID | null
}

function caseIdFromRound(round: RoundProa) {
  return round.caso_id
}

async function getRound(roundId: UUID) {
  const { data, error } = await supabase.from('rondas_proa').select('*').eq('id', roundId).maybeSingle()
  if (error) throw error
  return data as RoundProa | null
}

async function getCaseTreatments(pacienteId: UUID, casoId: UUID) {
  const { data, error } = await supabase
    .from('tratamientos_antimicrobianos')
    .select('*')
    .eq('paciente_id', pacienteId)
    .eq('caso_id', casoId)
    .order('fecha_inicio', { ascending: false })

  if (error) throw error
  return (data ?? []) as Treatment[]
}

async function getPreviousRound(ipsId: UUID, pacienteId: UUID, casoId: UUID, roundId: UUID) {
  const { data, error } = await supabase
    .from('rondas_proa')
    .select('*')
    .eq('ips_id', ipsId)
    .eq('paciente_id', pacienteId)
    .eq('caso_id', casoId)
    .neq('id', roundId)
    .order('fecha_hora_ronda', { ascending: false })
    .limit(1)

  if (error) throw error
  return ((data ?? [])[0] as RoundProa | undefined) ?? null
}

export async function getRoundClinicalBundle(roundId: UUID, userId: UUID): Promise<RoundClinicalBundle> {
  const round = await getRound(roundId)
  if (!round) throw new Error('No se encontró la ronda solicitada.')
  const casoId = caseIdFromRound(round)
  if (!round.ips_id || !round.paciente_id || !casoId) {
    throw new Error('La ronda no tiene IPS, paciente o caso asociado.')
  }

  const [patientResult, caseResult, profileResult, diagnosesResult, treatments, previousRound] =
    await Promise.all([
      supabase.from('pacientes').select('*').eq('id', round.paciente_id).eq('ips_id', round.ips_id).maybeSingle(),
      supabase.from('casos_proa').select('*').eq('id', casoId).eq('paciente_id', round.paciente_id).maybeSingle(),
      getUserProfile(userId).catch(() => null),
      supabase.from('diagnosticos_ronda').select('*').eq('ronda_id', round.id).order('fecha_creacion'),
      getCaseTreatments(round.paciente_id, casoId),
      getPreviousRound(round.ips_id, round.paciente_id, casoId, round.id),
    ])

  if (patientResult.error) throw patientResult.error
  if (caseResult.error) throw caseResult.error
  if (diagnosesResult.error) throw diagnosesResult.error
  if (!patientResult.data) throw new Error('El paciente de la ronda no es visible para la IPS activa.')
  if (!caseResult.data) throw new Error('El caso de la ronda no corresponde al paciente seleccionado.')

  let previousDiagnoses: DiagnosisRound[] = []
  if (previousRound) {
    const previousDiagnosesResult = await supabase
      .from('diagnosticos_ronda')
      .select('*')
      .eq('ronda_id', previousRound.id)
      .order('fecha_creacion')
    if (!previousDiagnosesResult.error) previousDiagnoses = (previousDiagnosesResult.data ?? []) as DiagnosisRound[]
  }

  return {
    round,
    patient: patientResult.data as Patient,
    caseProa: caseResult.data as CaseProa,
    profile: profileResult as UserProfile | null,
    previousRound,
    previousDiagnoses,
    diagnoses: (diagnosesResult.data ?? []) as DiagnosisRound[],
    treatments,
  }
}

export async function saveRoundContext(input: RoundContextInput) {
  const payload = {
    servicio_id: input.servicioId || null,
    cama: input.cama?.trim() || null,
    fecha_hora_ronda: input.fechaRonda || new Date().toISOString(),
    profesional_id: input.profesionalId,
    tipo_valoracion: input.tipoValoracion,
    tipo_terapia: input.tipoTerapia || null,
    terapia_dirigida_por_microbiologia: input.terapiaDirigidaPorMicrobiologia,
    tipo_profilaxis: input.tipoProfilaxis || null,
    evolucion_clinica: input.evolucionClinica || null,
    estado: 'Borrador',
  }

  const { data, error } = await supabase
    .from('rondas_proa')
    .update(payload)
    .eq('id', input.roundId)
    .eq('ips_id', input.ipsId)
    .eq('paciente_id', input.pacienteId)
    .select('*')
    .single()

  if (error) throw error
  return data as RoundProa
}

export async function replaceRoundDiagnoses({
  round,
  diagnoses,
}: {
  round: RoundProa
  diagnoses: DiagnosisDraft[]
}) {
  const cleanDiagnoses = diagnoses.filter(
    (diagnosis) => diagnosis.codigo_cie10.trim() && diagnosis.descripcion_cie10.trim(),
  )

  const deleteResult = await supabase.from('diagnosticos_ronda').delete().eq('ronda_id', round.id)
  if (deleteResult.error) throw deleteResult.error

  if (!cleanDiagnoses.length) return []

  const { data, error } = await supabase
    .from('diagnosticos_ronda')
    .insert(
      cleanDiagnoses.map((diagnosis) => ({
        ronda_id: round.id,
        codigo_cie10: diagnosis.codigo_cie10.trim().toUpperCase(),
        descripcion_cie10: diagnosis.descripcion_cie10.trim(),
        tipo_diagnostico: diagnosis.tipo_diagnostico,
        categoria_proa: diagnosis.categoria_proa || null,
        categoria_proa_id: diagnosis.categoria_proa_id || null,
      })),
    )
    .select('*')

  if (error) throw error
  return (data ?? []) as DiagnosisRound[]
}
