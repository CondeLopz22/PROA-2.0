import { supabase } from '../lib/supabase'
import type {
  AntimicrobialCatalogItem,
  CatalogItem,
  Ips,
  MicroorganismCatalogItem,
  OmsDdd,
  Patient,
  ServiceIps,
  Treatment,
  UserIpsMembership,
  UserProfile,
  UUID,
} from '../types/domain'

export type AdminCapability = 'global_admin' | 'ips_admin' | 'proa' | 'consulta'
export type AdminCatalogKind = 'antimicrobials' | 'sampleTypes' | 'microorganisms' | 'interventions' | 'categories'

export type AdminContext = {
  profile: UserProfile | null
  membership: UserIpsMembership | null
  capability: AdminCapability
  canManageInstitution: boolean
  canManageUsers: boolean
  canManageServices: boolean
  canManageCatalogs: boolean
  canManageOmsDdd: boolean
}

export type AdminAccessRow = {
  membership: UserIpsMembership
  profile: UserProfile | null
  email: string | null
}

export type AdminSummary = {
  services: number
  activeServices: number
  users: number
  activeUsers: number
  antimicrobials: number
  microorganisms: number
  sampleTypes: number
  interventions: number
  categories: number
  omsDdd: number
  duplicateTreatmentGroups: number
}

export type DuplicateTreatmentGroup = {
  caseId: UUID
  patient: Patient | null
  antimicrobialKey: string
  antimicrobialName: string
  count: number
  treatments: Treatment[]
}

export type CatalogAdminRow = CatalogItem | AntimicrobialCatalogItem | MicroorganismCatalogItem

function normalize(value?: string | null) {
  return (value ?? '').trim().toLocaleLowerCase('es-CO').replace(/\s+/g, ' ')
}

function capabilityFrom(profile: UserProfile | null, membership: UserIpsMembership | null): AdminCapability {
  if (profile?.es_admin_global) return 'global_admin'
  if (membership?.rol === 'Administrador IPS') return 'ips_admin'
  if (membership?.rol === 'Consulta') return 'consulta'
  return 'proa'
}

function canWrite(context: Pick<AdminContext, 'capability'>) {
  return context.capability === 'global_admin' || context.capability === 'ips_admin'
}

export async function getAdminContext(userId: UUID, ipsId: UUID): Promise<AdminContext> {
  const [profileResult, membershipResult] = await Promise.all([
    supabase
      .from('perfiles_usuario')
      .select('usuario_id,nombre,estado,es_admin_global,fecha_creacion')
      .eq('usuario_id', userId)
      .maybeSingle(),
    supabase
      .from('usuario_ips')
      .select('usuario_id,ips_id,rol,estado,fecha_asignacion')
      .eq('usuario_id', userId)
      .eq('ips_id', ipsId)
      .maybeSingle(),
  ])
  if (profileResult.error) throw profileResult.error
  if (membershipResult.error) throw membershipResult.error

  const profile = (profileResult.data as UserProfile | null) ?? null
  const membership = (membershipResult.data as UserIpsMembership | null) ?? null
  const capability = capabilityFrom(profile, membership)
  const writable = canWrite({ capability })
  return {
    profile,
    membership,
    capability,
    canManageInstitution: writable,
    canManageUsers: writable,
    canManageServices: writable,
    canManageCatalogs: capability === 'global_admin',
    canManageOmsDdd: capability === 'global_admin',
  }
}

export async function getInstitution(ipsId: UUID) {
  const { data, error } = await supabase
    .from('ips')
    .select('id,nombre,nit,codigo_reps,estado,fecha_creacion')
    .eq('id', ipsId)
    .maybeSingle()
  if (error) throw error
  return (data as Ips | null) ?? null
}

export async function updateInstitutionName(ipsId: UUID, nombre: string) {
  const { data, error } = await supabase
    .from('ips')
    .update({ nombre })
    .eq('id', ipsId)
    .select('id,nombre,nit,codigo_reps,estado,fecha_creacion')
    .single()
  if (error) throw error
  return data as Ips
}

export async function getAllServicesForIps(ipsId: UUID) {
  const { data, error } = await supabase
    .from('servicios_ips')
    .select('id,ips_id,nombre,estado')
    .eq('ips_id', ipsId)
    .order('nombre')
  if (error) throw error
  return (data ?? []) as ServiceIps[]
}

export async function createServiceForIps(ipsId: UUID, nombre: string) {
  const { data, error } = await supabase
    .from('servicios_ips')
    .insert({ ips_id: ipsId, nombre, estado: 'Activo' })
    .select('id,ips_id,nombre,estado')
    .single()
  if (error) throw error
  return data as ServiceIps
}

export async function updateService(serviceId: UUID, updates: Pick<ServiceIps, 'nombre' | 'estado'>) {
  const { data, error } = await supabase
    .from('servicios_ips')
    .update(updates)
    .eq('id', serviceId)
    .select('id,ips_id,nombre,estado')
    .single()
  if (error) throw error
  return data as ServiceIps
}

export async function getAdminAccessRows(ipsId: UUID): Promise<AdminAccessRow[]> {
  const memberships = await supabase
    .from('usuario_ips')
    .select('usuario_id,ips_id,rol,estado,fecha_asignacion')
    .eq('ips_id', ipsId)
    .order('fecha_asignacion', { ascending: false })
  if (memberships.error) throw memberships.error
  const rows = (memberships.data ?? []) as UserIpsMembership[]
  const userIds = Array.from(new Set(rows.map((row) => row.usuario_id)))
  const profiles = userIds.length
    ? await supabase
      .from('perfiles_usuario')
      .select('usuario_id,nombre,estado,es_admin_global,fecha_creacion')
      .in('usuario_id', userIds)
    : { data: [], error: null }
  if (profiles.error) throw profiles.error
  const profileByUser = new Map(((profiles.data ?? []) as UserProfile[]).map((profile) => [profile.usuario_id, profile]))
  return rows.map((membership) => ({
    membership,
    profile: profileByUser.get(membership.usuario_id) ?? null,
    email: null,
  }))
}

export async function assignUserToIps(input: {
  usuarioId: UUID
  ipsId: UUID
  rol: 'Administrador IPS' | 'PROA' | 'Consulta'
}) {
  const existing = await supabase
    .from('usuario_ips')
    .select('usuario_id,ips_id')
    .eq('usuario_id', input.usuarioId)
    .eq('ips_id', input.ipsId)
    .maybeSingle()
  if (existing.error) throw existing.error

  const payload = { usuario_id: input.usuarioId, ips_id: input.ipsId, rol: input.rol, estado: 'Activo' }
  const result = existing.data
    ? await supabase
      .from('usuario_ips')
      .update({ rol: input.rol, estado: 'Activo' })
      .eq('usuario_id', input.usuarioId)
      .eq('ips_id', input.ipsId)
      .select('usuario_id,ips_id,rol,estado,fecha_asignacion')
      .single()
    : await supabase
      .from('usuario_ips')
      .insert(payload)
      .select('usuario_id,ips_id,rol,estado,fecha_asignacion')
      .single()
  if (result.error) throw result.error
  return result.data as UserIpsMembership
}

export async function updateUserIpsAccess(input: {
  usuarioId: UUID
  ipsId: UUID
  rol?: 'Administrador IPS' | 'PROA' | 'Consulta'
  estado?: 'Activo' | 'Inactivo'
}) {
  const updates: Record<string, string> = {}
  if (input.rol) updates.rol = input.rol
  if (input.estado) updates.estado = input.estado
  const { data, error } = await supabase
    .from('usuario_ips')
    .update(updates)
    .eq('usuario_id', input.usuarioId)
    .eq('ips_id', input.ipsId)
    .select('usuario_id,ips_id,rol,estado,fecha_asignacion')
    .single()
  if (error) throw error
  return data as UserIpsMembership
}

export async function getCatalogAdminRows(kind: AdminCatalogKind, query = ''): Promise<CatalogAdminRow[]> {
  const tableByKind = {
    antimicrobials: 'catalogo_antimicrobianos',
    sampleTypes: 'catalogo_tipos_muestra',
    microorganisms: 'catalogo_microorganismos',
    interventions: 'catalogo_intervenciones',
    categories: 'catalogo_categorias_proa',
  } as const
  const { data, error } = await supabase.from(tableByKind[kind]).select('*').limit(250)
  if (error) throw error
  const term = normalize(query)
  const rows = (data ?? []) as CatalogAdminRow[]
  if (!term) return rows
  return rows.filter((row) =>
    [row.nombre, row.descripcion, row.codigo, (row as AntimicrobialCatalogItem).codigo_atc, (row as MicroorganismCatalogItem).tipo_germen]
      .filter(Boolean)
      .some((value) => normalize(String(value)).includes(term)),
  )
}

export async function updateCatalogState(kind: AdminCatalogKind, id: UUID, estado: 'Activo' | 'Inactivo') {
  const tableByKind = {
    antimicrobials: 'catalogo_antimicrobianos',
    sampleTypes: 'catalogo_tipos_muestra',
    microorganisms: 'catalogo_microorganismos',
    interventions: 'catalogo_intervenciones',
    categories: 'catalogo_categorias_proa',
  } as const
  const { data, error } = await supabase.from(tableByKind[kind]).update({ estado }).eq('id', id).select('*').single()
  if (error) throw error
  return data as CatalogAdminRow
}

export async function getOmsDddAdminRows() {
  const [omsResult, antimicrobialResult] = await Promise.all([
    supabase.from('oms_ddd').select('id,antimicrobiano_id,via,ddd_oms,unidad_ddd,version_fuente,fecha_actualizacion').limit(300),
    supabase.from('catalogo_antimicrobianos').select('id,nombre,codigo_atc').limit(500),
  ])
  if (omsResult.error) throw omsResult.error
  if (antimicrobialResult.error) throw antimicrobialResult.error
  const antimicrobialById = new Map(((antimicrobialResult.data ?? []) as AntimicrobialCatalogItem[]).map((item) => [item.id, item]))
  return ((omsResult.data ?? []) as OmsDdd[]).map((row) => ({
    ...row,
    antimicrobial: antimicrobialById.get(row.antimicrobiano_id) ?? null,
  }))
}

export async function getDuplicateActiveTreatments(ipsId: UUID): Promise<DuplicateTreatmentGroup[]> {
  const [treatmentsResult, patientsResult] = await Promise.all([
    supabase
      .from('tratamientos_antimicrobianos')
      .select('*')
      .eq('ips_id', ipsId)
      .eq('estado', 'Activo')
      .limit(1000),
    supabase
      .from('pacientes')
      .select('id,ips_id,tipo_identificacion,numero_identificacion,nombres,apellidos,sexo,fecha_nacimiento')
      .eq('ips_id', ipsId)
      .limit(1000),
  ])
  if (treatmentsResult.error) throw treatmentsResult.error
  if (patientsResult.error) throw patientsResult.error

  const patients = new Map(((patientsResult.data ?? []) as Patient[]).map((patient) => [patient.id, patient]))
  const groups = new Map<string, Treatment[]>()
  for (const treatment of (treatmentsResult.data ?? []) as Treatment[]) {
    if (!treatment.caso_id) continue
    const antimicrobialKey = treatment.antimicrobiano_id ?? normalize(treatment.antimicrobiano)
    if (!antimicrobialKey) continue
    const key = `${treatment.caso_id}::${antimicrobialKey}`
    groups.set(key, [...(groups.get(key) ?? []), treatment])
  }

  return Array.from(groups.entries())
    .map(([key, treatments]) => {
      const [caseId, antimicrobialKey] = key.split('::') as [UUID, string]
      const first = treatments[0]
      return {
        caseId,
        patient: first?.paciente_id ? patients.get(first.paciente_id) ?? null : null,
        antimicrobialKey,
        antimicrobialName: first?.antimicrobiano ?? antimicrobialKey,
        count: treatments.length,
        treatments,
      }
    })
    .filter((group) => group.count > 1)
    .sort((a, b) => b.count - a.count)
}

export async function getAdminSummary(ipsId: UUID): Promise<AdminSummary> {
  const [
    services,
    users,
    antimicrobials,
    microorganisms,
    sampleTypes,
    interventions,
    categories,
    oms,
    duplicates,
  ] = await Promise.all([
    getAllServicesForIps(ipsId),
    getAdminAccessRows(ipsId),
    getCatalogAdminRows('antimicrobials'),
    getCatalogAdminRows('microorganisms'),
    getCatalogAdminRows('sampleTypes'),
    getCatalogAdminRows('interventions'),
    getCatalogAdminRows('categories'),
    getOmsDddAdminRows(),
    getDuplicateActiveTreatments(ipsId),
  ])
  return {
    services: services.length,
    activeServices: services.filter((row) => row.estado === 'Activo').length,
    users: users.length,
    activeUsers: users.filter((row) => row.membership.estado === 'Activo').length,
    antimicrobials: antimicrobials.length,
    microorganisms: microorganisms.length,
    sampleTypes: sampleTypes.length,
    interventions: interventions.length,
    categories: categories.length,
    omsDdd: oms.length,
    duplicateTreatmentGroups: duplicates.length,
  }
}
