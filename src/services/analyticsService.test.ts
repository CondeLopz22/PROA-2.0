import { describe, expect, it } from 'vitest'
import { buildDddTrend } from './analyticsService'

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
