import { describe, expect, it } from 'vitest'

import { shouldFlagReserveWithoutTreatmentIntervention } from './auditService'

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
