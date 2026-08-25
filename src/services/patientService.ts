import { supabase } from '../lib/supabase'
import type {
  CaseProa,
  NewCaseInput,
  NewPatientInput,
  Patient,
  PatientLookupResult,
  RoundProa,
  Treatment,
  UUID,
} from '../types/domain'

const ACTIVE_CASE_STATES = ['activo', 'abierto', 'en seguimiento', 'seguimiento']

function isActiveCase(caso: CaseProa) {
  const estado = caso.estado?.toLowerCase()
  return !caso.fecha_cierre && (!estado || ACTIVE_CASE_STATES.includes(estado))
}

export function patientDisplayName(patient: Patient) {
  return [patient.nombres, patient.apellidos].filter(Boolean).join(' ') || 'Paciente sin nombre'
}

export async function findPatientInIps(
  ipsId: UUID,
  tipoIdentificacion: string,
  numeroIdentificacion: string,
): Promise<PatientLookupResult | null> {
  const { data: patient, error } = await supabase
    .from('pacientes')
    .select('*')
    .eq('ips_id', ipsId)
    .eq('tipo_identificacion', tipoIdentificacion)
    .eq('numero_identificacion', numeroIdentificacion.trim())
    .maybeSingle()

  if (error) throw error
  if (!patient) return null

  const [casesResult, roundsResult, treatmentsResult] = await Promise.all([
    supabase
      .from('casos_proa')
      .select('*')
      .eq('ips_id', ipsId)
      .eq('paciente_id', patient.id)
      .order('fecha_apertura', { ascending: false }),
    supabase
      .from('rondas_proa')
      .select('*')
      .eq('ips_id', ipsId)
      .eq('paciente_id', patient.id)
      .order('fecha_hora_ronda', { ascending: false })
      .limit(1),
    supabase
      .from('tratamientos_antimicrobianos')
      .select('*')
      .eq('paciente_id', patient.id)
      .eq('estado', 'Activo')
      .order('fecha_inicio', { ascending: false }),
  ])

  if (casesResult.error) throw casesResult.error
  if (roundsResult.error) throw roundsResult.error

  const cases = (casesResult.data ?? []) as CaseProa[]
  const activeCase = cases.find(isActiveCase) ?? null

  return {
    patient: patient as Patient,
    activeCase,
    historicalCases: cases.filter((caso) => caso.id !== activeCase?.id),
    latestRound: ((roundsResult.data ?? [])[0] as RoundProa | undefined) ?? null,
    activeTreatments: treatmentsResult.error ? [] : ((treatmentsResult.data ?? []) as Treatment[]),
  }
}

export async function createPatient(input: NewPatientInput) {
  const { data, error } = await supabase
    .from('pacientes')
    .insert({
      ips_id: input.ipsId,
      tipo_identificacion: input.tipoIdentificacion,
      numero_identificacion: input.numeroIdentificacion.trim(),
      nombres: input.nombres.trim(),
      apellidos: input.apellidos.trim(),
      sexo: input.sexo || null,
      fecha_nacimiento: input.fechaNacimiento || null,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as Patient
}

export async function createCase(input: NewCaseInput) {
  const { data, error } = await supabase
    .from('casos_proa')
    .insert({
      ips_id: input.ipsId,
      paciente_id: input.pacienteId,
      estado: 'Activo',
      fecha_apertura: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error) throw error
  return data as CaseProa
}
