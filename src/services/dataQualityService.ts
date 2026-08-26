import { supabase } from '../lib/supabase'
import type { UUID } from '../types/domain'

export type QualityIssue = {
  code: string
  label: string
  count: number
  evaluated?: number
  severity: 'Alta' | 'Media' | 'Baja'
  detail: string
  reviewPath?: string
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
  if (!roundIds.length) return { missing: 0, total: 0 }
  const diagnoses = await supabase.from('diagnosticos_ronda').select('ronda_id').in('ronda_id', roundIds)
  if (diagnoses.error) throw new Error(`rondas sin diagnóstico: ${diagnoses.error.message}`)
  const withDiagnosis = new Set((diagnoses.data ?? []).map((diagnosis) => diagnosis.ronda_id))
  return { missing: roundIds.filter((roundId) => !withDiagnosis.has(roundId)).length, total: roundIds.length }
}

export async function getDataQualityIssues(ipsId: UUID): Promise<QualityIssue[]> {
  const [
    roundsDiagnosis,
    treatmentsWithoutCatalog,
    treatmentsTotal,
    positiveMicroWithoutOrganism,
    positiveMicroTotal,
    inconsistentInterventions,
    interventionsTotal,
    dddWithoutOms,
    dddTotal,
    dddWithoutBeds,
    dddRecordsTotal,
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
      'tratamientos totales',
      supabase.from('tratamientos_antimicrobianos').select('id', { count: 'exact', head: true }).eq('ips_id', ipsId),
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
      'microbiología positiva total',
      supabase
        .from('microbiologia')
        .select('id', { count: 'exact', head: true })
        .eq('ips_id', ipsId)
        .eq('resultado_general', 'Positivo'),
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
      'intervenciones totales',
      supabase.from('intervenciones_proa').select('id', { count: 'exact', head: true }).eq('ips_id', ipsId),
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
      'consumos DDD totales',
      supabase.from('ddd_registros').select('ddd_consumos!inner(id)', { count: 'exact', head: true }).eq('ips_id', ipsId),
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
      'registros DDD totales',
      supabase.from('ddd_registros').select('id', { count: 'exact', head: true }).eq('ips_id', ipsId),
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
      count: roundsDiagnosis.missing,
      evaluated: roundsDiagnosis.total,
      severity: 'Alta',
      detail: 'Rondas visibles para la IPS activa que no tienen filas en diagnosticos_ronda.',
      reviewPath: '/rondas',
    },
    {
      code: 'DQ-TRAT-CAT',
      label: 'Tratamientos sin catálogo',
      count: treatmentsWithoutCatalog,
      evaluated: treatmentsTotal,
      severity: 'Media',
      detail: 'Tratamientos antimicrobianos sin antimicrobiano_id.',
      reviewPath: '/pacientes',
    },
    {
      code: 'DQ-MICRO-ORG',
      label: 'Microbiología positiva sin microorganismo',
      count: positiveMicroWithoutOrganism,
      evaluated: positiveMicroTotal,
      severity: 'Alta',
      detail: 'Muestras positivas sin microorganismo estructurado.',
      reviewPath: '/rondas',
    },
    {
      code: 'DQ-INT-TIPO',
      label: 'Intervenciones sin tipo',
      count: inconsistentInterventions,
      evaluated: interventionsTotal,
      severity: 'Alta',
      detail: 'Intervenciones marcadas como realizadas sin tipo_intervencion_id.',
      reviewPath: '/rondas',
    },
    {
      code: 'DQ-DDD-OMS',
      label: 'DDD sin referencia OMS',
      count: dddWithoutOms,
      evaluated: dddTotal,
      severity: 'Media',
      detail: 'Consumos DDD donde Supabase no resolvió ddd_oms.',
      reviewPath: '/ddd',
    },
    {
      code: 'DQ-DDD-DEN',
      label: 'DDD sin camas-día',
      count: dddWithoutBeds,
      evaluated: dddRecordsTotal,
      severity: 'Media',
      detail: 'Registros DDD sin denominador válido.',
      reviewPath: '/ddd',
    },
    {
      code: 'DQ-NOTA-CONF',
      label: 'Notas confirmadas ausentes',
      count: Math.max(confirmedRounds - notes, 0),
      evaluated: confirmedRounds,
      severity: 'Alta',
      detail: 'Diferencia global entre rondas confirmadas de la IPS y notas confirmadas visibles.',
      reviewPath: '/rondas',
    },
  ]
}

export function calculateQualityScore(issues: QualityIssue[]) {
  const evaluated = issues.reduce((sum, issue) => sum + (issue.evaluated ?? 0), 0)
  if (!evaluated) return null
  const nonConform = issues.reduce((sum, issue) => sum + issue.count, 0)
  return Math.max(0, ((evaluated - nonConform) / evaluated) * 100)
}
