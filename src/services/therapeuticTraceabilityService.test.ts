import { describe, expect, it } from 'vitest'
import { emptyInterventionFollowUp, recommendationNeedsFollowUp } from './therapeuticTraceabilityService'

describe('trazabilidad terapéutica EST-03B', () => {
  it('mantiene pendiente una recomendación hasta tener decisión e implementación', () => {
    const base = {
      intervention: { id: 'i1', hubo_intervencion: true },
      originRoundId: 'r1',
      treatmentIds: ['t1'],
      latestDecision: null,
      latestImplementation: null,
    }
    expect(recommendationNeedsFollowUp(base)).toBe(true)
    expect(recommendationNeedsFollowUp({
      ...base,
      latestDecision: { id: 'd1', ips_id: 'ips', caso_id: 'case', intervencion_id: 'i1', ronda_id: 'r2', decision: 'Aceptada', profesional_id: 'u1', fecha_decision: '2026-11-13' },
      latestImplementation: { id: 'm1', ips_id: 'ips', caso_id: 'case', intervencion_id: 'i1', ronda_id: 'r2', estado: 'Implementada', profesional_id: 'u1', fecha_implementacion: '2026-11-13' },
    })).toBe(false)
  })

  it('crea un borrador vacío asociado a la intervención original', () => {
    expect(emptyInterventionFollowUp('i1')).toEqual(expect.objectContaining({
      interventionId: 'i1',
      decision: '',
      implementationStatus: '',
      implementationDate: '',
    }))
  })
})
