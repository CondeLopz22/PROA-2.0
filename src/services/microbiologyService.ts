import { supabase } from '../lib/supabase'
import type {
  Microbiology,
  MicrobiologyResistance,
  MicrobiologySensitivity,
  RoundProa,
  UUID,
} from '../types/domain'

export type MicrobiologyStatus = 'No' | 'Pendiente' | 'Sí'
export type MicrobiologyResult = 'Positivo' | 'Negativo' | 'Contaminado' | 'Sin crecimiento' | 'Pendiente'
export type MicrobiologyImpact = 'Sí' | 'No' | 'Pendiente' | ''

export type ResistanceDraft = {
  id?: UUID
  mecanismo: string
}

export type SensitivityDraft = {
  id?: UUID
  antimicrobianoId: UUID | ''
  antimicrobiano: string
  resultado: 'Sensible' | 'Intermedio' | 'Resistente' | 'Susceptible con mayor exposición' | 'No disponible' | ''
}

export type MicrobiologyDraft = {
  id?: UUID
  status: MicrobiologyStatus
  tipoMuestraId: UUID | ''
  tipoMuestra: string
  fechaToma: string
  fechaResultado: string
  resultadoGeneral: MicrobiologyResult | ''
  microorganismoId: UUID | ''
  microorganismo: string
  tipoGermen: string
  resistencias: ResistanceDraft[]
  sensibilidades: SensitivityDraft[]
  esMuestraControl: boolean
  muestraPreviaId: UUID | ''
  impactoConducta: MicrobiologyImpact
}

export type MicrobiologyBundle = {
  microbiology: Microbiology
  resistances: MicrobiologyResistance[]
  sensitivities: MicrobiologySensitivity[]
}

export function emptyMicrobiologyDraft(): MicrobiologyDraft {
  return {
    status: 'No',
    tipoMuestraId: '',
    tipoMuestra: '',
    fechaToma: '',
    fechaResultado: '',
    resultadoGeneral: '',
    microorganismoId: '',
    microorganismo: '',
    tipoGermen: '',
    resistencias: [],
    sensibilidades: [],
    esMuestraControl: false,
    muestraPreviaId: '',
    impactoConducta: '',
  }
}

export function microbiologyDraftFromBundle(bundle?: MicrobiologyBundle | null): MicrobiologyDraft {
  if (!bundle) return emptyMicrobiologyDraft()
  const row = bundle.microbiology
  const status: MicrobiologyStatus = row.resultado_general === 'Pendiente' ? 'Pendiente' : 'Sí'

  return {
    id: row.id,
    status,
    tipoMuestraId: row.tipo_muestra_id ?? '',
    tipoMuestra: row.tipo_muestra ?? '',
    fechaToma: row.fecha_toma ? row.fecha_toma.slice(0, 16) : '',
    fechaResultado: row.fecha_resultado ? row.fecha_resultado.slice(0, 16) : '',
    resultadoGeneral: (row.resultado_general as MicrobiologyResult | null) ?? '',
    microorganismoId: row.microorganismo_id ?? '',
    microorganismo: row.microorganismo ?? '',
    tipoGermen: row.tipo_germen ?? '',
    resistencias: bundle.resistances.map((item) => ({ id: item.id, mecanismo: item.mecanismo ?? '' })),
    sensibilidades: bundle.sensitivities.map((item) => ({
      id: item.id,
      antimicrobianoId: item.antimicrobiano_id ?? '',
      antimicrobiano: item.antimicrobiano ?? '',
      resultado: (item.resultado as SensitivityDraft['resultado']) ?? '',
    })),
    esMuestraControl: Boolean(row.es_muestra_control),
    muestraPreviaId: row.muestra_previa_id ?? '',
    impactoConducta: (row.impacto_conducta as MicrobiologyImpact | null) ?? '',
  }
}

async function getMicrobiologyChildren(ids: UUID[]) {
  if (!ids.length) return { resistances: [], sensitivities: [] }
  const [resistanceResult, sensitivityResult] = await Promise.all([
    supabase.from('resistencia_microbiologica').select('*').in('muestra_id', ids),
    supabase.from('sensibilidad_microbiologica').select('*').in('muestra_id', ids),
  ])
  if (resistanceResult.error) throw resistanceResult.error
  if (sensitivityResult.error) throw sensitivityResult.error
  return {
    resistances: (resistanceResult.data ?? []) as MicrobiologyResistance[],
    sensitivities: (sensitivityResult.data ?? []) as MicrobiologySensitivity[],
  }
}

export async function getRoundMicrobiology(roundId: UUID) {
  const { data, error } = await supabase
    .from('microbiologia')
    .select('*')
    .eq('ronda_id', roundId)
    .order('fecha_toma', { ascending: false })
  if (error) throw error

  const rows = (data ?? []) as Microbiology[]
  const children = await getMicrobiologyChildren(rows.map((row) => row.id))
  return rows.map((row) => ({
    microbiology: row,
    resistances: children.resistances.filter((item) => item.muestra_id === row.id),
    sensitivities: children.sensitivities.filter((item) => item.muestra_id === row.id),
  }))
}

export async function getCaseMicrobiology(casoId: UUID, excludeRoundId?: UUID) {
  const roundsResult = await supabase.from('rondas_proa').select('id').eq('caso_id', casoId)
  if (roundsResult.error) throw roundsResult.error
  const roundIds = (roundsResult.data ?? [])
    .map((row) => row.id as UUID)
    .filter((id) => id && id !== excludeRoundId)
  if (!roundIds.length) return []

  const { data, error } = await supabase
    .from('microbiologia')
    .select('*')
    .in('ronda_id', roundIds)
    .order('fecha_toma', { ascending: false })
  if (error) throw error

  const rows = (data ?? []) as Microbiology[]
  const children = await getMicrobiologyChildren(rows.map((row) => row.id))
  return rows.map((row) => ({
    microbiology: row,
    resistances: children.resistances.filter((item) => item.muestra_id === row.id),
    sensitivities: children.sensitivities.filter((item) => item.muestra_id === row.id),
  }))
}

export async function replaceRoundMicrobiology({
  round,
  draft,
}: {
  round: RoundProa
  draft: MicrobiologyDraft
}) {
  const existing = await getRoundMicrobiology(round.id)
  const existingIds = existing.map((item) => item.microbiology.id)

  if (existingIds.length) {
    const resistanceDelete = await supabase.from('resistencia_microbiologica').delete().in('muestra_id', existingIds)
    if (resistanceDelete.error) throw resistanceDelete.error
    const sensitivityDelete = await supabase.from('sensibilidad_microbiologica').delete().in('muestra_id', existingIds)
    if (sensitivityDelete.error) throw sensitivityDelete.error
    const microDelete = await supabase.from('microbiologia').delete().eq('ronda_id', round.id)
    if (microDelete.error) throw microDelete.error
  }

  if (draft.status === 'No') return null
  if (!round.ips_id || !round.id) throw new Error('La ronda no tiene contexto microbiológico completo.')

  const isPending = draft.status === 'Pendiente'
  const result = isPending ? 'Pendiente' : draft.resultadoGeneral || 'Pendiente'
  const isPositive = result === 'Positivo'

  const { data, error } = await supabase
    .from('microbiologia')
    .insert({
      ips_id: round.ips_id,
      ronda_id: round.id,
      tipo_muestra_id: draft.tipoMuestraId || null,
      tipo_muestra: draft.tipoMuestra.trim() || null,
      fecha_toma: draft.fechaToma ? new Date(draft.fechaToma).toISOString() : null,
      fecha_resultado: !isPending && draft.fechaResultado ? new Date(draft.fechaResultado).toISOString() : null,
      estado_resultado: result === 'Pendiente' ? 'Pendiente' : 'Disponible',
      resultado_general: result,
      microorganismo_id: isPositive ? draft.microorganismoId || null : null,
      microorganismo: isPositive ? draft.microorganismo.trim() || null : null,
      tipo_germen: isPositive ? draft.tipoGermen.trim() || null : null,
      es_muestra_control: draft.esMuestraControl,
      muestra_previa_id: draft.esMuestraControl ? draft.muestraPreviaId || null : null,
      impacto_conducta: draft.impactoConducta || null,
    })
    .select('*')
    .single()
  if (error) throw error

  if (isPositive) {
    const resistances = draft.resistencias
      .map((item) => item.mecanismo.trim())
      .filter(Boolean)
      .map((mecanismo) => ({ muestra_id: data.id, mecanismo }))
    if (resistances.length) {
      const resistanceResult = await supabase.from('resistencia_microbiologica').insert(resistances)
      if (resistanceResult.error) throw resistanceResult.error
    }

    const sensitivities = draft.sensibilidades
      .filter((item) => item.antimicrobiano.trim() && item.resultado)
      .map((item) => ({
        muestra_id: data.id,
        antimicrobiano_id: item.antimicrobianoId || null,
        antimicrobiano: item.antimicrobiano.trim(),
        resultado: item.resultado,
      }))
    if (sensitivities.length) {
      const sensitivityResult = await supabase.from('sensibilidad_microbiologica').insert(sensitivities)
      if (sensitivityResult.error) throw sensitivityResult.error
    }
  }

  return data as Microbiology
}
