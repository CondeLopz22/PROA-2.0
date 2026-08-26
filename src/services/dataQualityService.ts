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

export type QualityIssueDetail = {
  id: UUID
  label: string
  context?: string
  reviewPath: string
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

export async function getQualityIssueDetails(ipsId: UUID, code: string): Promise<QualityIssueDetail[]> {
  if (code === 'DQ-RONDA-DX') {
    const rounds = await supabase
      .from('rondas_proa')
      .select('id,fecha_hora_ronda,estado,paciente_id')
      .eq('ips_id', ipsId)
      .order('fecha_hora_ronda', { ascending: false })
      .limit(150)
    if (rounds.error) throw rounds.error
    const roundIds = (rounds.data ?? []).map((round) => round.id)
    if (!roundIds.length) return []
    const diagnoses = await supabase.from('diagnosticos_ronda').select('ronda_id').in('ronda_id', roundIds)
    if (diagnoses.error) throw diagnoses.error
    const withDiagnosis = new Set((diagnoses.data ?? []).map((diagnosis) => diagnosis.ronda_id))
    return (rounds.data ?? [])
      .filter((round) => !withDiagnosis.has(round.id))
      .map((round) => ({
        id: round.id,
        label: `Ronda ${round.fecha_hora_ronda ?? 'sin fecha'}`,
        context: round.estado ?? 'Sin estado',
        reviewPath: `/rondas/${round.id}`,
      }))
  }

  if (code === 'DQ-TRAT-CAT') {
    const { data, error } = await supabase
      .from('tratamientos_antimicrobianos')
      .select('id,antimicrobiano,estado,caso_id')
      .eq('ips_id', ipsId)
      .is('antimicrobiano_id', null)
      .limit(150)
    if (error) throw error
    return (data ?? []).map((row) => ({
      id: row.id,
      label: row.antimicrobiano ?? 'Tratamiento sin antimicrobiano',
      context: `${row.estado ?? 'Sin estado'} · caso ${row.caso_id}`,
      reviewPath: '/pacientes',
    }))
  }

  if (code === 'DQ-MICRO-ORG') {
    const { data, error } = await supabase
      .from('microbiologia')
      .select('id,ronda_id,tipo_muestra,fecha_toma')
      .eq('ips_id', ipsId)
      .eq('resultado_general', 'Positivo')
      .is('microorganismo', null)
      .limit(150)
    if (error) throw error
    return (data ?? []).map((row) => ({
      id: row.id,
      label: row.tipo_muestra ?? 'Muestra positiva',
      context: row.fecha_toma ?? 'Sin fecha',
      reviewPath: row.ronda_id ? `/rondas/${row.ronda_id}` : '/rondas',
    }))
  }

  if (code === 'DQ-INT-TIPO') {
    const { data, error } = await supabase
      .from('intervenciones_proa')
      .select('id,ronda_id,recomendacion,aceptacion')
      .eq('ips_id', ipsId)
      .eq('hubo_intervencion', true)
      .is('tipo_intervencion_id', null)
      .limit(150)
    if (error) throw error
    return (data ?? []).map((row) => ({
      id: row.id,
      label: row.recomendacion ?? 'Intervención sin tipo',
      context: row.aceptacion ?? 'Sin aceptación',
      reviewPath: row.ronda_id ? `/rondas/${row.ronda_id}` : '/rondas',
    }))
  }

  if (code === 'DQ-DDD-DEN') {
    const { data, error } = await supabase
      .from('ddd_registros')
      .select('id,periodo,servicio_id,estado')
      .eq('ips_id', ipsId)
      .or('camas_dia_ocupadas.is.null,camas_dia_ocupadas.eq.0')
      .limit(150)
    if (error) throw error
    return (data ?? []).map((row) => ({
      id: row.id,
      label: `Periodo ${row.periodo}`,
      context: `${row.estado ?? 'Sin estado'} · servicio ${row.servicio_id}`,
      reviewPath: '/ddd',
    }))
  }

  if (code === 'DQ-DDD-OMS') {
    const { data, error } = await supabase
      .from('ddd_registros')
      .select('id,periodo,ddd_consumos!inner(id,antimicrobiano_id,via)')
      .eq('ips_id', ipsId)
      .is('ddd_consumos.ddd_oms', null)
      .limit(150)
    if (error) throw error
    return (data ?? []).flatMap((record) =>
      (record.ddd_consumos ?? []).map((consumption: { id: UUID; antimicrobiano_id?: UUID | null; via?: string | null }) => ({
        id: consumption.id,
        label: `Consumo ${consumption.antimicrobiano_id ?? 'sin antimicrobiano'}`,
        context: `${record.periodo} · ${consumption.via ?? 'sin vía'}`,
        reviewPath: '/ddd',
      })),
    )
  }

  return []
}
