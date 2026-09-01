import { supabase } from '../lib/supabase'
import type { Ips, ServiceIps, UUID } from '../types/domain'

type UsuarioIpsRow = {
  ips_id?: UUID | null
  ips?: Ips | Ips[] | null
}

export async function getAllowedIps(userId: UUID) {
  const { data, error } = await supabase
    .from('usuario_ips')
    .select('ips:ips_id(id,nombre,nit,codigo_reps,estado,fecha_creacion)')
    .eq('usuario_id', userId)
    .eq('estado', 'Activo')
    .order('fecha_asignacion', { ascending: true })

  if (error) throw error
  return (data ?? [])
    .map((row: UsuarioIpsRow) => (Array.isArray(row.ips) ? row.ips[0] : row.ips))
    .filter((ips): ips is Ips => Boolean(ips) && (ips as Ips).estado === 'Activa')
}

export async function getAllActiveIps() {
  const { data, error } = await supabase
    .from('ips')
    .select('id,nombre,nit,codigo_reps,estado,fecha_creacion')
    .eq('estado', 'Activa')
    .order('nombre')

  if (error) throw error
  return (data ?? []) as Ips[]
}

export async function getIpsServices(ipsId: UUID) {
  const { data, error } = await supabase
    .from('servicios_ips')
    .select('*')
    .eq('ips_id', ipsId)
    .eq('estado', 'Activo')
    .order('nombre')

  if (error) throw error
  return (data ?? []) as ServiceIps[]
}
