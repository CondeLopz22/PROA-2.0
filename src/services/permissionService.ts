import { supabase } from '../lib/supabase'
import type { ProductUserType, UserIpsMembership, UserProfile, UUID } from '../types/domain'

export const productRoleLabels: Record<ProductUserType, string> = {
  administrador: 'Administrador',
  infectomag: 'Usuario INFECTOMAG',
  ips_cliente: 'IPS Cliente',
  sin_acceso: 'Sin acceso',
}

export const productRoleValues = ['Administrador', 'Usuario INFECTOMAG', 'IPS Cliente'] as const
export type ProductRoleValue = (typeof productRoleValues)[number]

export function normalizeProductUserType(
  profile: Pick<UserProfile, 'es_admin_global'> | null,
  membership: Pick<UserIpsMembership, 'rol'> | null,
): ProductUserType {
  if (profile?.es_admin_global) return 'administrador'
  switch (membership?.rol) {
    case 'Administrador':
    case 'Administrador IPS':
      return 'administrador'
    case 'Usuario INFECTOMAG':
    case 'PROA':
      return 'infectomag'
    case 'IPS Cliente':
    case 'Consulta':
      return 'ips_cliente'
    default:
      return 'sin_acceso'
  }
}

export function productRoleValueFor(userType: ProductUserType): ProductRoleValue | null {
  if (userType === 'administrador') return 'Administrador'
  if (userType === 'infectomag') return 'Usuario INFECTOMAG'
  if (userType === 'ips_cliente') return 'IPS Cliente'
  return null
}

export function canAccessAdministration(userType?: ProductUserType | null) {
  return userType === 'administrador'
}

export function canWriteOperationalData(userType?: ProductUserType | null) {
  return userType === 'administrador' || userType === 'infectomag'
}

export async function getActiveMembershipForIps(userId: UUID, ipsId: UUID) {
  const { data, error } = await supabase
    .from('usuario_ips')
    .select('usuario_id,ips_id,rol,estado,fecha_asignacion')
    .eq('usuario_id', userId)
    .eq('ips_id', ipsId)
    .eq('estado', 'Activo')
    .maybeSingle()
  if (error) throw error
  return (data as UserIpsMembership | null) ?? null
}
