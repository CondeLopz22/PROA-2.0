import { describe, expect, it } from 'vitest'
import { findActiveTreatmentDuplicate, normalizeAntimicrobialName } from './treatmentService'
import type { Treatment } from '../types/domain'

describe('duplicate active treatments', () => {
  it('normaliza nombres como fallback para históricos sin catálogo', () => {
    expect(normalizeAntimicrobialName('  ÁCICLOVIR   500 mg ')).toBe('aciclovir 500 mg')
  })

  it('rechaza duplicado activo por antimicrobiano_id', () => {
    const treatments: Treatment[] = [
      { id: 't1', estado: 'Activo', antimicrobiano_id: 'a1', antimicrobiano: 'Aciclovir' },
      { id: 't2', estado: 'Suspendido', antimicrobiano_id: 'a1', antimicrobiano: 'Aciclovir' },
    ]

    expect(findActiveTreatmentDuplicate(treatments, { antimicrobialId: 'a1', antimicrobialName: 'Aciclovir' })?.id).toBe('t1')
  })

  it('permite nuevo inicio cuando el equivalente está suspendido', () => {
    const treatments: Treatment[] = [
      { id: 't1', estado: 'Suspendido', antimicrobiano_id: 'a1', antimicrobiano: 'Aciclovir' },
    ]

    expect(findActiveTreatmentDuplicate(treatments, { antimicrobialId: 'a1', antimicrobialName: 'Aciclovir' })).toBeNull()
  })

  it('usa nombre normalizado cuando falta antimicrobiano_id', () => {
    const treatments: Treatment[] = [
      { id: 't1', estado: 'Activo', antimicrobiano_id: null, antimicrobiano: 'Áciclovir' },
    ]

    expect(findActiveTreatmentDuplicate(treatments, { antimicrobialId: '', antimicrobialName: 'aciclovir' })?.id).toBe('t1')
  })
})
