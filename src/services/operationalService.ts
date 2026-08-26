import { supabase } from '../lib/supabase'
import { treatmentDay } from './treatmentService'
import type { CaseProa, Microbiology, Patient, ProaIntervention, RoundProa, ServiceIps, Treatment, UUID, UserProfile } from '../types/domain'

export type OperationalStatus =
  | 'Nuevo / sin ronda'
  | 'Por valorar'
  | 'En seguimiento'
  | 'Microbiología pendiente/relevante'
  | 'Respuesta pendiente'
  | 'Al día'

export type ActiveCaseRow = {
  case: CaseProa
  patient: Patient
  service: ServiceIps | null
  latestRound: RoundProa | null
  activeTreatments: Treatment[]
  microbiology: Microbiology[]
  latestIntervention: ProaIntervention | null
  status: OperationalStatus
  requiresFollowUp: boolean
  maxTreatmentDay: number | null
}

export type RoundsActivityRow = {
  round: RoundProa
  patient: Patient | null
  service: ServiceIps | null
  professional: UserProfile | null
  intervention: ProaIntervention | null
}

export type PatientDirectoryRow = {
  patient: Patient
  activeCase: CaseProa | null
  latestCase: CaseProa | null
  latestRound: RoundProa | null
  activeTreatments: Treatment[]
  roundCount: number
}

function isActiveCase(row: CaseProa) {
  return row.estado === 'Activo' && !row.fecha_cierre
}

function groupBy<T, K extends string>(rows: T[], key: (row: T) => K | null | undefined) {
  const map = new Map<K, T[]>()
  rows.forEach((row) => {
    const value = key(row)
    if (!value) return
    map.set(value, [...(map.get(value) ?? []), row])
  })
  return map
}

function latestByDate<T>(rows: T[], date: (row: T) => string | null | undefined) {
  return [...rows].sort((a, b) => new Date(date(b) ?? 0).getTime() - new Date(date(a) ?? 0).getTime())[0] ?? null
}

function deriveStatus({
  latestRound,
  activeTreatments,
  microbiology,
  intervention,
}: {
  latestRound: RoundProa | null
  activeTreatments: Treatment[]
  microbiology: Microbiology[]
  intervention: ProaIntervention | null
}): OperationalStatus {
  if (!latestRound) return 'Nuevo / sin ronda'
  if (latestRound.estado === 'Borrador') return 'Por valorar'
  if (microbiology.some((row) => row.resultado_general === 'Pendiente' || row.impacto_conducta === 'Pendiente')) {
    return 'Microbiología pendiente/relevante'
  }
  if (microbiology.some((row) => row.resultado_general === 'Positivo' && row.impacto_conducta !== 'No')) {
    return 'Microbiología pendiente/relevante'
  }
  if (intervention?.aceptacion === 'Pendiente') return 'Respuesta pendiente'
  if (intervention?.requiere_seguimiento) return 'En seguimiento'
  if (activeTreatments.length) return 'En seguimiento'
  return 'Al día'
}

export function operationalStatusRules() {
  return [
    'Sin ronda visible: Nuevo / sin ronda.',
    'Última ronda en Borrador: Por valorar.',
    'Microbiología positiva o pendiente con impacto no descartado: Microbiología pendiente/relevante.',
    'Intervención con aceptación Pendiente: Respuesta pendiente.',
    'Intervención requiere seguimiento o hay tratamientos activos: En seguimiento.',
    'Sin señales pendientes anteriores: Al día.',
  ]
}

export async function getActiveCasesCockpit(ipsId: UUID): Promise<ActiveCaseRow[]> {
  const casesResult = await supabase
    .from('casos_proa')
    .select('*')
    .eq('ips_id', ipsId)
    .eq('estado', 'Activo')
    .is('fecha_cierre', null)
    .order('fecha_apertura', { ascending: false })
    .limit(150)
  if (casesResult.error) throw casesResult.error
  const cases = (casesResult.data ?? []) as CaseProa[]
  if (!cases.length) return []

  const patientIds = Array.from(new Set(cases.map((row) => row.paciente_id)))
  const caseIds = cases.map((row) => row.id)
  const [patientsResult, roundsResult, treatmentsResult, microbiologyResult, servicesResult] = await Promise.all([
    supabase.from('pacientes').select('*').eq('ips_id', ipsId).in('id', patientIds),
    supabase.from('rondas_proa').select('*').eq('ips_id', ipsId).in('caso_id', caseIds).order('fecha_hora_ronda', { ascending: false }),
    supabase.from('tratamientos_antimicrobianos').select('*').eq('ips_id', ipsId).in('caso_id', caseIds).eq('estado', 'Activo'),
    supabase.from('microbiologia').select('*').eq('ips_id', ipsId).in('caso_id', caseIds).order('fecha_toma', { ascending: false }),
    supabase.from('servicios_ips').select('*').eq('ips_id', ipsId),
  ])
  if (patientsResult.error) throw patientsResult.error
  if (roundsResult.error) throw roundsResult.error
  if (treatmentsResult.error) throw treatmentsResult.error
  if (microbiologyResult.error) throw microbiologyResult.error
  if (servicesResult.error) throw servicesResult.error

  const rounds = (roundsResult.data ?? []) as RoundProa[]
  const roundIds = rounds.map((row) => row.id)
  const interventions = roundIds.length
    ? await supabase.from('intervenciones_proa').select('*').eq('ips_id', ipsId).in('ronda_id', roundIds).order('fecha_creacion', { ascending: false })
    : { data: [], error: null }
  if (interventions.error) throw interventions.error

  const patients = new Map(((patientsResult.data ?? []) as Patient[]).map((row) => [row.id, row]))
  const roundsByCase = groupBy(rounds, (row) => row.caso_id)
  const treatmentsByCase = groupBy((treatmentsResult.data ?? []) as Treatment[], (row) => row.caso_id)
  const microbiologyByCase = groupBy((microbiologyResult.data ?? []) as Microbiology[], (row) => row.caso_id)
  const interventionsByRound = groupBy((interventions.data ?? []) as ProaIntervention[], (row) => row.ronda_id)
  const services = new Map(((servicesResult.data ?? []) as ServiceIps[]).map((row) => [row.id, row]))

  return cases
    .map((caseRow) => {
      const patient = patients.get(caseRow.paciente_id)
      if (!patient) return null
      const caseRounds = roundsByCase.get(caseRow.id) ?? []
      const latestRound = latestByDate(caseRounds, (row) => row.fecha_hora_ronda)
      const activeTreatments = treatmentsByCase.get(caseRow.id) ?? []
      const microbiology = microbiologyByCase.get(caseRow.id) ?? []
      const latestIntervention = latestRound ? latestByDate(interventionsByRound.get(latestRound.id) ?? [], (row) => row.fecha_creacion) : null
      const maxTreatmentDay = activeTreatments.reduce<number | null>((max, treatment) => {
        const day = treatmentDay(treatment.fecha_inicio, latestRound?.fecha_hora_ronda)
        if (!day) return max
        return max === null ? day : Math.max(max, day)
      }, null)
      return {
        case: caseRow,
        patient,
        service: latestRound?.servicio_id ? services.get(latestRound.servicio_id) ?? null : null,
        latestRound,
        activeTreatments,
        microbiology,
        latestIntervention,
        status: deriveStatus({ latestRound, activeTreatments, microbiology, intervention: latestIntervention }),
        requiresFollowUp: Boolean(latestIntervention?.requiere_seguimiento),
        maxTreatmentDay,
      }
    })
    .filter((row): row is ActiveCaseRow => Boolean(row))
}

export async function getRoundsActivity(ipsId: UUID, filter: 'Pendientes' | 'Hoy' | 'Borradores' | 'Confirmadas' | 'Todas') {
  let query = supabase.from('rondas_proa').select('*').eq('ips_id', ipsId).order('fecha_hora_ronda', { ascending: false }).limit(150)
  const today = new Date().toISOString().slice(0, 10)
  if (filter === 'Hoy') query = query.gte('fecha_hora_ronda', `${today}T00:00:00`).lt('fecha_hora_ronda', `${today}T23:59:59`)
  if (filter === 'Borradores' || filter === 'Pendientes') query = query.eq('estado', 'Borrador')
  if (filter === 'Confirmadas') query = query.eq('estado', 'Confirmada')

  const roundsResult = await query
  if (roundsResult.error) throw roundsResult.error
  const rounds = (roundsResult.data ?? []) as RoundProa[]
  if (!rounds.length) return []
  const patientIds = Array.from(new Set(rounds.map((row) => row.paciente_id).filter(Boolean) as UUID[]))
  const professionalIds = Array.from(new Set(rounds.map((row) => row.profesional_id).filter(Boolean) as UUID[]))

  const [patientsResult, servicesResult, profilesResult, interventionsResult] = await Promise.all([
    patientIds.length ? supabase.from('pacientes').select('*').eq('ips_id', ipsId).in('id', patientIds) : Promise.resolve({ data: [], error: null }),
    supabase.from('servicios_ips').select('*').eq('ips_id', ipsId),
    professionalIds.length ? supabase.from('perfiles_usuario').select('*').in('usuario_id', professionalIds) : Promise.resolve({ data: [], error: null }),
    supabase.from('intervenciones_proa').select('*').eq('ips_id', ipsId).in('ronda_id', rounds.map((row) => row.id)),
  ])
  if (patientsResult.error) throw patientsResult.error
  if (servicesResult.error) throw servicesResult.error
  if (profilesResult.error) throw profilesResult.error
  if (interventionsResult.error) throw interventionsResult.error

  const patients = new Map(((patientsResult.data ?? []) as Patient[]).map((row) => [row.id, row]))
  const services = new Map(((servicesResult.data ?? []) as ServiceIps[]).map((row) => [row.id, row]))
  const profiles = new Map(((profilesResult.data ?? []) as UserProfile[]).map((row) => [row.usuario_id, row]))
  const interventions = groupBy((interventionsResult.data ?? []) as ProaIntervention[], (row) => row.ronda_id)

  return rounds.map((round) => ({
    round,
    patient: round.paciente_id ? patients.get(round.paciente_id) ?? null : null,
    service: round.servicio_id ? services.get(round.servicio_id) ?? null : null,
    professional: round.profesional_id ? profiles.get(round.profesional_id) ?? null : null,
    intervention: latestByDate(interventions.get(round.id) ?? [], (row) => row.fecha_creacion),
  }))
}

export async function getPatientDirectory(ipsId: UUID, filter: 'Todos' | 'Activos' | 'Cerrados', search: string): Promise<PatientDirectoryRow[]> {
  let patientQuery = supabase.from('pacientes').select('*').eq('ips_id', ipsId).order('apellidos').limit(150)
  const term = search.trim()
  if (term) patientQuery = patientQuery.or(`numero_identificacion.ilike.%${term}%,nombres.ilike.%${term}%,apellidos.ilike.%${term}%`)
  const patientsResult = await patientQuery
  if (patientsResult.error) throw patientsResult.error
  const patients = (patientsResult.data ?? []) as Patient[]
  if (!patients.length) return []

  const patientIds = patients.map((row) => row.id)
  const [casesResult, roundsResult, treatmentsResult] = await Promise.all([
    supabase.from('casos_proa').select('*').eq('ips_id', ipsId).in('paciente_id', patientIds).order('fecha_apertura', { ascending: false }),
    supabase.from('rondas_proa').select('*').eq('ips_id', ipsId).in('paciente_id', patientIds).order('fecha_hora_ronda', { ascending: false }),
    supabase.from('tratamientos_antimicrobianos').select('*').eq('ips_id', ipsId).in('paciente_id', patientIds).eq('estado', 'Activo'),
  ])
  if (casesResult.error) throw casesResult.error
  if (roundsResult.error) throw roundsResult.error
  if (treatmentsResult.error) throw treatmentsResult.error

  const casesByPatient = groupBy((casesResult.data ?? []) as CaseProa[], (row) => row.paciente_id)
  const roundsByPatient = groupBy((roundsResult.data ?? []) as RoundProa[], (row) => row.paciente_id)
  const treatmentsByPatient = groupBy((treatmentsResult.data ?? []) as Treatment[], (row) => row.paciente_id)

  return patients
    .map((patient) => {
      const patientCases = casesByPatient.get(patient.id) ?? []
      const activeCase = patientCases.find(isActiveCase) ?? null
      return {
        patient,
        activeCase,
        latestCase: latestByDate(patientCases, (row) => row.fecha_apertura),
        latestRound: latestByDate(roundsByPatient.get(patient.id) ?? [], (row) => row.fecha_hora_ronda),
        activeTreatments: treatmentsByPatient.get(patient.id) ?? [],
        roundCount: roundsByPatient.get(patient.id)?.length ?? 0,
      }
    })
    .filter((row) => {
      if (filter === 'Activos') return Boolean(row.activeCase)
      if (filter === 'Cerrados') return !row.activeCase && Boolean(row.latestCase?.fecha_cierre || row.latestCase?.estado === 'Cerrado')
      return true
    })
}
