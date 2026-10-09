import { describe, expect, it } from 'vitest'

import { findSemanticAuditFinding, shouldFlagReserveWithoutTreatmentIntervention } from './auditService'

describe('AUD-08 Reserve sin intervencion asociada', () => {
  it('solo considera cubierta la regla para el tratamiento relacionado por intervencion_tratamiento', () => {
    const linkedTreatmentIds = new Set(['tratamiento-reserve-a'])

    expect(
      shouldFlagReserveWithoutTreatmentIntervention({
        awareCategory: 'Reserve',
        linkedTreatmentIds,
        treatmentId: 'tratamiento-reserve-a',
      }),
    ).toBe(false)

    expect(
      shouldFlagReserveWithoutTreatmentIntervention({
        awareCategory: 'Reserve',
        linkedTreatmentIds,
        treatmentId: 'tratamiento-reserve-b',
      }),
    ).toBe(true)
  })

  it('mantiene AUD-08 inactiva para antimicrobianos no Reserve', () => {
    expect(
      shouldFlagReserveWithoutTreatmentIntervention({
        awareCategory: 'No aplica',
        linkedTreatmentIds: new Set(),
        treatmentId: 'tratamiento-no-aplica',
      }),
    ).toBe(false)
  })
})

describe('idempotencia semántica de hallazgos', () => {
  it('reutiliza una oportunidad resuelta cuando el contexto y tratamiento no cambiaron', () => {
    const resolved = { id: 'finding-resolved', tratamiento_id: 'treatment-1', estado: 'Resuelto' }
    expect(findSemanticAuditFinding([resolved], 'treatment-1')).toBe(resolved)
  })

  it('distingue el hallazgo de caso cuando no existe tratamiento principal', () => {
    const combined = { id: 'finding-combined', tratamiento_id: null, estado: 'Resuelto' }
    expect(findSemanticAuditFinding([combined], null)).toBe(combined)
  })
})
