import { supabase } from '../lib/supabase'
import type { UUID } from '../types/domain'

export type DddMartRow = {
  consumo_id?: UUID
  registro_ddd_id?: UUID
  ips_id: UUID
  periodo: string
  servicio?: string | null
  servicio_id?: UUID | null
  antimicrobiano_id?: UUID | null
  antimicrobiano?: string | null
  codigo_atc?: string | null
  via?: string | null
  gramos_consumidos?: number | string | null
  ddd_calculadas?: number | string | null
  ddd_100_camas_dia?: number | string | null
  camas_dia_ocupadas?: number | string | null
}

export type TrendPoint = {
  periodo: string
  ddd: number
  ddd100: number | null
  gramos: number
}

export type NativeIndicators = {
  activity: {
    activeCases: number
    rounds: number
    firstRounds: number
    followUps: number
  }
  interventions: {
    total: number
    roundsWithIntervention: number
    acceptanceRate: number | null
    byType: Array<{ label: string; value: number }>
  }
  microbiology: {
    samples: number
    positivityRate: number | null
    withResistance: number
    organisms: Array<{ label: string; value: number }>
  }
  antimicrobials: {
    totalDdd: number
    totalGrams: number
    latestDdd100: number | null
  }
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function increment(map: Map<string, number>, key?: string | null) {
  if (!key) return
  map.set(key, (map.get(key) ?? 0) + 1)
}

function top(map: Map<string, number>, limit = 8) {
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}

export function buildDddTrend(rows: DddMartRow[]): TrendPoint[] {
  const byPeriod = new Map<string, { ddd: number; grams: number; beds: number }>()
  rows.forEach((row) => {
    const current = byPeriod.get(row.periodo) ?? { ddd: 0, grams: 0, beds: 0 }
    current.ddd += toNumber(row.ddd_calculadas)
    current.grams += toNumber(row.gramos_consumidos)
    current.beds += toNumber(row.camas_dia_ocupadas)
    byPeriod.set(row.periodo, current)
  })
  return Array.from(byPeriod.entries())
    .map(([periodo, value]) => ({
      periodo,
      ddd: value.ddd,
      gramos: value.grams,
      ddd100: value.beds > 0 ? (value.ddd / value.beds) * 100 : null,
    }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
}

export async function getDddMartRows({
  ipsId,
  antimicrobialId,
  serviceId,
  from,
  to,
}: {
  ipsId: UUID
  antimicrobialId?: UUID | ''
  serviceId?: UUID | ''
  from?: string
  to?: string
}) {
  let query = supabase
    .from('mart_ddd')
    .select('consumo_id,registro_ddd_id,ips_id,periodo,servicio,servicio_id,antimicrobiano_id,antimicrobiano,codigo_atc,via,gramos_consumidos,ddd_calculadas,ddd_100_camas_dia,camas_dia_ocupadas')
    .eq('ips_id', ipsId)
    .order('periodo', { ascending: true })
    .limit(600)
  if (antimicrobialId) query = query.eq('antimicrobiano_id', antimicrobialId)
  if (serviceId) query = query.eq('servicio_id', serviceId)
  if (from) query = query.gte('periodo', from)
  if (to) query = query.lte('periodo', to)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as DddMartRow[]
}

export async function getNativeIndicators(ipsId: UUID): Promise<NativeIndicators> {
  const [casesResult, roundsResult, interventionsResult, microbiologyResult, dddResult] = await Promise.all([
    supabase.from('mart_casos_proa').select('caso_id,estado').eq('ips_id', ipsId).limit(1000),
    supabase.from('mart_rondas_proa').select('ronda_id,tipo_valoracion,hubo_intervencion').eq('ips_id', ipsId).limit(1000),
    supabase.from('mart_intervenciones_proa').select('intervencion_id,tipo_intervencion,aceptacion').eq('ips_id', ipsId).limit(1000),
    supabase.from('mart_microbiologia').select('muestra_id,resultado_general,microorganismo,numero_mecanismos').eq('ips_id', ipsId).limit(1000),
    supabase.from('mart_ddd').select('periodo,ddd_calculadas,ddd_100_camas_dia,gramos_consumidos,camas_dia_ocupadas').eq('ips_id', ipsId).limit(1000),
  ])
  if (casesResult.error) throw casesResult.error
  if (roundsResult.error) throw roundsResult.error
  if (interventionsResult.error) throw interventionsResult.error
  if (microbiologyResult.error) throw microbiologyResult.error
  if (dddResult.error) throw dddResult.error

  const rounds = roundsResult.data ?? []
  const interventions = interventionsResult.data ?? []
  const microbiology = microbiologyResult.data ?? []
  const dddRows = (dddResult.data ?? []) as DddMartRow[]
  const acceptanceEvaluable = interventions.filter((row) => row.aceptacion)
  const organisms = new Map<string, number>()
  microbiology.forEach((row) => increment(organisms, row.microorganismo))
  const interventionTypes = new Map<string, number>()
  interventions.forEach((row) => increment(interventionTypes, row.tipo_intervencion))
  const trend = buildDddTrend(dddRows)
  const latestTrend = trend[trend.length - 1]

  return {
    activity: {
      activeCases: (casesResult.data ?? []).filter((row) => row.estado === 'Activo').length,
      rounds: rounds.length,
      firstRounds: rounds.filter((row) => row.tipo_valoracion === 'Primera valoración').length,
      followUps: rounds.filter((row) => row.tipo_valoracion === 'Seguimiento').length,
    },
    interventions: {
      total: interventions.length,
      roundsWithIntervention: rounds.filter((row) => row.hubo_intervencion).length,
      acceptanceRate: acceptanceEvaluable.length
        ? (acceptanceEvaluable.filter((row) => row.aceptacion === 'Sí').length / acceptanceEvaluable.length) * 100
        : null,
      byType: top(interventionTypes),
    },
    microbiology: {
      samples: microbiology.length,
      positivityRate: microbiology.length
        ? (microbiology.filter((row) => row.resultado_general === 'Positivo').length / microbiology.length) * 100
        : null,
      withResistance: microbiology.filter((row) => toNumber(row.numero_mecanismos) > 0).length,
      organisms: top(organisms),
    },
    antimicrobials: {
      totalDdd: dddRows.reduce((sum, row) => sum + toNumber(row.ddd_calculadas), 0),
      totalGrams: dddRows.reduce((sum, row) => sum + toNumber(row.gramos_consumidos), 0),
      latestDdd100: latestTrend?.ddd100 ?? null,
    },
  }
}
