import { describe, expect, it } from 'vitest'
import { calculateQualityScore } from './dataQualityService'

describe('calculateQualityScore', () => {
  it('calcula porcentaje determinístico sin pesos inventados', () => {
    const score = calculateQualityScore([
      { code: 'A', label: 'A', count: 2, evaluated: 10, severity: 'Alta', detail: 'A' },
      { code: 'B', label: 'B', count: 1, evaluated: 5, severity: 'Media', detail: 'B' },
    ])

    expect(score).toBeCloseTo(80)
  })

  it('devuelve null cuando no hay registros evaluados', () => {
    expect(calculateQualityScore([])).toBeNull()
  })
})
