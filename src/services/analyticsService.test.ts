import { describe, expect, it } from 'vitest'
import { buildDddTrend } from './analyticsService'
import { dddDataStatus } from './dddService'

describe('buildDddTrend', () => {
  it('agrega DDD, gramos y calcula DDD100 por periodo desde mart_ddd', () => {
    const trend = buildDddTrend([
      { ips_id: 'ips1', periodo: '2026-08-01', ddd_calculadas: 50, gramos_consumidos: 100, camas_dia_ocupadas: 1000 },
      { ips_id: 'ips1', periodo: '2026-08-01', ddd_calculadas: 25, gramos_consumidos: 50, camas_dia_ocupadas: 1000 },
      { ips_id: 'ips1', periodo: '2026-09-01', ddd_calculadas: 10, gramos_consumidos: 20, camas_dia_ocupadas: 0 },
    ])

    expect(trend[0]).toEqual({ periodo: '2026-08-01', ddd: 75, gramos: 150, ddd100: 3.75 })
    expect(trend[1]).toEqual({ periodo: '2026-09-01', ddd: 10, gramos: 20, ddd100: null })
  })
})

describe('dddDataStatus', () => {
  it('clasifica detalle DDD sin recalcular como fuente autoritativa', () => {
    const record = { id: 'r1', ips_id: 'ips1', servicio_id: 's1', periodo: '2026-08-01', camas_dia_ocupadas: 1000 }
    expect(dddDataStatus({ id: 'c1', registro_id: 'r1', antimicrobiano_id: 'a1', via: 'IV', gramos_consumidos: 100, ddd_oms: 2, ddd_100_camas_dia: 5 }, record)).toBe('Completo')
    expect(dddDataStatus({ id: 'c2', registro_id: 'r1', antimicrobiano_id: 'a1', via: 'IV', gramos_consumidos: 100, ddd_oms: null }, record)).toBe('Sin referencia OMS')
  })
})
