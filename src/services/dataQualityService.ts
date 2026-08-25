import { supabase } from '../lib/supabase'
import type { UUID } from '../types/domain'

export type QualityIssue = {
  code: string
  label: string
  count: number
  severity: 'Alta' | 'Media' | 'Baja'
  detail: string
}

async function countQuery(label: string, query: PromiseLike<{ count: number | null; error: unknown }>) {
  const result = await query
  if (result.error) throw new Error(`${label}: ${(result.error as { message?: string }).message ?? 'error de consulta'}`)
  return result.count ?? 0
}

async function countRoundsWithoutDiagnosis(ipsId: UUID) {
  const rounds = await supabase.from('rondas_proa').select('id').eq('ips_id', ipsId).limit(1000)
  if (rounds.error) throw new Error(`rondas sin diagnóstico: ${rounds.error.message}`)
  const roundIds = (rounds.data ?? []).map((round) => round.id)
  if (!roundIds.length) return 0

  const diagnoses = await supabase.from('diagnosticos_ronda').select('ronda_id').in('ronda_id', roundIds)
  if (diagnoses.error) throw new Error(`rondas sin diagnóstico: ${diagnoses.error.message}`)

  const roundsWithDiagnosis = new Set((diagnoses.data ?? []).map((diagnosis) => diagnosis.ronda_id))
  return roundIds.filter((roundId) => !roundsWithDiagnosis.has(roundId)).length
}

export async function getDataQualityIssues(ipsId: UUID): Promise<QualityIssue[]> {
  const [
    roundsWithoutDiagnosis,
    treatmentsWithoutCatalog,
    positiveMicroWithoutOrganism,
    inconsistentInterventions,
    dddWithoutOms,
    dddWithoutBeds,
    confirmedRounds,
    notes,
  ] = await Promise.all([
    countRoundsWithoutDiagnosis(ipsId),
    countQuery(
      'tratamientos sin antimicrobiano_id',
      supabase
        .from('tratamientos_antimicrobianos')
        .select('id', { count: 'exact', head: true })
        .eq('ips_id', ipsId)
        .is('antimicrobiano_id', null),
    ),
    countQuery(
      'microbiología positiva sin microorganismo',
      supabase
        .from('microbiologia')
        .select('id', { count: 'exact', head: true })
        .eq('ips_id', ipsId)
        .eq('resultado_general', 'Positivo')
        .is('microorganismo', null),
    ),
    countQuery(
      'intervenciones inconsistentes',
      supabase
        .from('intervenciones_proa')
        .select('id', { count: 'exact', head: true })
        .eq('ips_id', ipsId)
        .eq('hubo_intervencion', true)
        .is('tipo_intervencion_id', null),
    ),
    countQuery(
      'DDD sin OMS',
      supabase
        .from('ddd_registros')
        .select('ddd_consumos!inner(id)', { count: 'exact', head: true })
        .eq('ips_id', ipsId)
        .is('ddd_consumos.ddd_oms', null),
    ),
    countQuery(
      'DDD sin camas-día',
      supabase
        .from('ddd_registros')
        .select('id', { count: 'exact', head: true })
        .eq('ips_id', ipsId)
        .or('camas_dia_ocupadas.is.null,camas_dia_ocupadas.eq.0'),
    ),
    countQuery(
      'rondas confirmadas',
      supabase
        .from('rondas_proa')
        .select('id', { count: 'exact', head: true })
        .eq('ips_id', ipsId)
        .eq('estado', 'Confirmada'),
    ),
    countQuery(
      'notas confirmadas',
      supabase
        .from('notas_proa')
        .select('id,rondas_proa!inner(ips_id)', { count: 'exact', head: true })
        .eq('rondas_proa.ips_id', ipsId)
        .not('fecha_confirmacion', 'is', null),
    ),
  ])

  return [
    {
      code: 'DQ-RONDA-DX',
      label: 'Rondas sin diagnóstico',
      count: roundsWithoutDiagnosis,
      severity: 'Alta',
      detail: 'Rondas visibles para la IPS activa que no tienen filas en diagnosticos_ronda.',
    },
    {
      code: 'DQ-TRAT-CAT',
      label: 'Tratamientos sin catálogo',
      count: treatmentsWithoutCatalog,
      severity: 'Media',
      detail: 'Tratamientos antimicrobianos sin antimicrobiano_id.',
    },
    {
      code: 'DQ-MICRO-ORG',
      label: 'Microbiología positiva sin microorganismo',
      count: positiveMicroWithoutOrganism,
      severity: 'Alta',
      detail: 'Muestras positivas sin microorganismo estructurado.',
    },
    {
      code: 'DQ-INT-TIPO',
      label: 'Intervenciones sin tipo',
      count: inconsistentInterventions,
      severity: 'Alta',
      detail: 'Intervenciones marcadas como realizadas sin tipo_intervencion_id.',
    },
    {
      code: 'DQ-DDD-OMS',
      label: 'DDD sin referencia OMS',
      count: dddWithoutOms,
      severity: 'Media',
      detail: 'Consumos DDD donde Supabase no resolvió ddd_oms.',
    },
    {
      code: 'DQ-DDD-DEN',
      label: 'DDD sin camas-día',
      count: dddWithoutBeds,
      severity: 'Media',
      detail: 'Registros DDD sin denominador válido.',
    },
    {
      code: 'DQ-NOTA-CONF',
      label: 'Notas confirmadas ausentes',
      count: Math.max(confirmedRounds - notes, 0),
      severity: 'Alta',
      detail: 'Diferencia global entre rondas confirmadas de la IPS y notas confirmadas visibles.',
    },
  ]
}
