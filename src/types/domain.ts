export type UUID = string

export type Ips = {
  id: UUID
  nombre: string
  nit?: string | null
  codigo_reps?: string | null
  estado?: 'Activa' | 'Inactiva' | string | null
  fecha_creacion?: string | null
}

export type UserProfile = {
  usuario_id: UUID
  nombre?: string | null
  estado?: 'Activo' | 'Inactivo' | string | null
  es_admin_global?: boolean | null
  fecha_creacion?: string | null
}

export type Patient = {
  id: UUID
  ips_id: UUID
  tipo_identificacion: string
  numero_identificacion: string
  nombres?: string | null
  apellidos?: string | null
  sexo?: string | null
  fecha_nacimiento?: string | null
}

export type CaseProa = {
  id: UUID
  ips_id: UUID
  paciente_id: UUID
  estado?: string | null
  fecha_apertura?: string | null
  fecha_cierre?: string | null
  motivo_cierre?: string | null
  ubicacion_actual?: string | null
  cama_actual?: string | null
}

export type RoundProa = {
  id: UUID
  ips_id: UUID
  paciente_id?: UUID | null
  caso_id?: UUID | null
  servicio_id?: UUID | null
  fecha_hora_ronda?: string | null
  ubicacion?: string | null
  tipo_valoracion?: string | null
  tipo_terapia?: 'Empírica' | 'Dirigida' | 'Profiláctica' | string | null
  terapia_dirigida_por_microbiologia?: boolean | null
  tipo_profilaxis?: 'Quirúrgica' | 'Médica' | 'Otra' | string | null
  evolucion_clinica?: 'Mejoría' | 'Estable' | 'Deterioro' | 'No valorable' | string | null
  equipo_valorador?: string | null
  estado?: string | null
  cama?: string | null
  profesional_id?: UUID | null
  fecha_creacion?: string | null
}

export type ServiceIps = {
  id: UUID
  ips_id: UUID
  nombre: string
  estado?: 'Activo' | 'Inactivo' | string | null
}

export type Treatment = {
  id: UUID
  ips_id?: UUID | null
  caso_id?: UUID | null
  paciente_id?: UUID | null
  ronda_id?: UUID | null
  antimicrobiano_id?: UUID | null
  antimicrobiano?: string | null
  dosis?: number | string | null
  unidad?: string | null
  frecuencia?: string | null
  via?: string | null
  fecha_inicio?: string | null
  fecha_fin?: string | null
  duracion_prevista_dias?: number | null
  estado?: string | null
  fecha_ultima_modificacion?: string | null
}

export type DiagnosisRound = {
  id: UUID
  ronda_id: UUID
  ips_id?: UUID | null
  paciente_id?: UUID | null
  caso_id?: UUID | null
  codigo_cie10?: string | null
  descripcion_cie10?: string | null
  tipo_diagnostico?: 'Principal' | 'Relacionado' | 'Infeccioso' | string | null
  categoria_proa?: string | null
  categoria_proa_id?: UUID | null
  fecha_creacion?: string | null
}

export type CatalogItem = {
  id: UUID
  nombre?: string | null
  descripcion?: string | null
  codigo?: string | null
  estado?: string | null
}

export type AntimicrobialCatalogItem = CatalogItem & {
  principio_activo?: string | null
  nombre_generico?: string | null
}

export type TreatmentHistory = {
  id: UUID
  tratamiento_id?: UUID | null
  ronda_id?: UUID | null
  accion?: string | null
  fecha_evento?: string | null
  campo_modificado?: string | null
  valor_anterior?: string | null
  valor_nuevo?: string | null
  motivo?: string | null
  tipo_intervencion?: string | null
}

export type PatientLookupResult = {
  patient: Patient
  activeCase: CaseProa | null
  historicalCases: CaseProa[]
  latestRound: RoundProa | null
  activeTreatments: Treatment[]
}

export type NewPatientInput = {
  ipsId: UUID
  tipoIdentificacion: string
  numeroIdentificacion: string
  nombres: string
  apellidos: string
  sexo?: string
  fechaNacimiento?: string
}

export type NewCaseInput = {
  ipsId: UUID
  pacienteId: UUID
}

export type NewRoundInput = {
  ipsId: UUID
  pacienteId: UUID
  casoId: UUID
  servicioId?: UUID
  cama?: string
  tipoValoracion: 'Primera valoración' | 'Seguimiento'
  profesionalId: UUID
}

export type RoundClinicalBundle = {
  round: RoundProa
  patient: Patient
  caseProa: CaseProa
  profile: UserProfile | null
  previousRound: RoundProa | null
  previousDiagnoses: DiagnosisRound[]
  diagnoses: DiagnosisRound[]
  treatments: Treatment[]
}
