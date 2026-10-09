import { describe, expect, it } from 'vitest'
import {
  buildReevaluationContext,
  hasRelevantAntibiogram,
  semanticContextHash,
  shouldCreateDes02,
  shouldCreateDes03,
  shouldCreateDes04,
} from './reevaluationService'

describe('reevaluación terapéutica', () => {
  it('considera disponible el antibiograma solo con sensibilidad relevante', () => {
    expect(hasRelevantAntibiogram([{ id: 's1', muestra_id: 'm1', resultado: 'No disponible' }])).toBe(false)
    expect(hasRelevantAntibiogram([{ id: 's2', muestra_id: 'm1', resultado: 'Sensible' }])).toBe(true)
  })

  it('genera una firma estable ante recreación de filas y cambios ortográficos no estructurales', () => {
    const base = {
      code: 'DES-02',
      treatments: [{ id: 't1', antimicrobiano_id: 'a1', antimicrobiano: 'Meropenem', estado: 'Activo', aware_categoria: 'Watch' }],
      round: { id: 'r1', ips_id: 'ips1', tipo_terapia: 'Empírica', evolucion_clinica: 'Mejoría' },
      microbiology: [{ id: 'm1', caso_id: 'c1', tipo_muestra_id: 'tm1', tipo_muestra: 'Hemocultivo', resultado_general: 'Positivo', microorganismo_id: 'org1' }],
      sensitivities: [{ id: 's1', muestra_id: 'm1', antimicrobiano_id: 'a1', antimicrobiano: 'Meropenem', resultado: 'Sensible' }],
    }
    const recreated = {
      ...base,
      microbiology: [{ ...base.microbiology[0], id: 'm2', tipo_muestra: 'Hemocultivo corregido' }],
      sensitivities: [{ ...base.sensitivities[0], id: 's2', muestra_id: 'm2', antimicrobiano: 'MEROPENEM' }],
    }
    expect(buildReevaluationContext(base)).toBe(buildReevaluationContext(recreated))
  })

  it('cambia la firma cuando aparece información clínica relevante nueva', () => {
    expect(semanticContextHash({ result: 'Sensible' })).not.toBe(semanticContextHash({ result: 'Resistente' }))
  })

  it('limita DES-02 a Watch/Reserve con antibiograma disponible', () => {
    const sensitivity = [{ id: 's1', muestra_id: 'm1', resultado: 'Sensible' }]
    expect(shouldCreateDes02('Watch', sensitivity)).toBe(true)
    expect(shouldCreateDes02('Reserve', sensitivity)).toBe(true)
    expect(shouldCreateDes02('Access', sensitivity)).toBe(false)
    expect(shouldCreateDes02('Watch', [{ id: 's2', muestra_id: 'm1', resultado: 'No disponible' }])).toBe(false)
  })

  it('activa DES-03 solo con terapia combinada y microbiología disponible', () => {
    const available = [{ id: 'm1', caso_id: 'c1', resultado_general: 'Positivo' }]
    expect(shouldCreateDes03(2, available)).toBe(true)
    expect(shouldCreateDes03(1, available)).toBe(false)
    expect(shouldCreateDes03(2, [{ id: 'm2', caso_id: 'c1', resultado_general: 'Pendiente' }])).toBe(false)
  })

  it('mantiene DES-04 inactiva sin umbral y respeta el límite estricto', () => {
    expect(shouldCreateDes04({ category: 'Watch', evolution: 'Mejoría', day: 8, threshold: null })).toBe(false)
    expect(shouldCreateDes04({ category: 'Watch', evolution: 'Mejoría', day: 5, threshold: 5 })).toBe(false)
    expect(shouldCreateDes04({ category: 'Reserve', evolution: 'Mejoría', day: 6, threshold: 5 })).toBe(true)
    expect(shouldCreateDes04({ category: 'Access', evolution: 'Mejoría', day: 6, threshold: 5 })).toBe(false)
  })
})
