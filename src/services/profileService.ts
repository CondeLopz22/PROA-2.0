import { supabase } from '../lib/supabase'
import type { UserProfile, UUID } from '../types/domain'

export async function getUserProfile(userId: UUID) {
  const { data, error } = await supabase
    .from('perfiles_usuario')
    .select('usuario_id,nombre,estado,es_admin_global,fecha_creacion')
    .eq('usuario_id', userId)
    .maybeSingle()

  if (error) throw error
  return (data as UserProfile | null) ?? null
}
