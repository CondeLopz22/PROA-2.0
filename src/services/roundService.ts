import { supabase } from '../lib/supabase'
import type { NewRoundInput, RoundProa, UUID } from '../types/domain'

export async function createEmptyRound(input: NewRoundInput) {
  const now = new Date().toISOString()
  const common = {
    ips_id: input.ipsId,
    paciente_id: input.pacienteId,
    caso_id: input.casoId,
    servicio_id: input.servicioId || null,
    cama: input.cama?.trim() || null,
    ubicacion: null,
    fecha_hora_ronda: now,
    tipo_valoracion: input.tipoValoracion,
    estado: 'Borrador',
    profesional_id: input.profesionalId,
  }

  const { data, error } = await supabase.from('rondas_proa').insert(common).select('*').single()
  if (error) throw error
  return data as RoundProa
}

export async function getRecentRounds(ipsId: UUID) {
  const { data, error } = await supabase
    .from('rondas_proa')
    .select('*')
    .eq('ips_id', ipsId)
    .order('fecha_creacion', { ascending: false })
    .limit(20)

  if (error) throw error
  return (data ?? []) as RoundProa[]
}
