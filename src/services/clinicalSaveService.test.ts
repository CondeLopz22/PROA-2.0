import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('../lib/supabase', () => ({
  supabase: { rpc },
}))

import {
  buildClinicalSavePayload,
  clinicalSaveError,
  saveClinicalRoundTransaction,
  type ClinicalSaveInput,
} from './clinicalSaveService'

function input(): ClinicalSaveInput {
  return {
    roundId: 'round-1',
    ipsId: 'ips-1',
    patientId: 'patient-1',
    caseId: 'case-1',
    round: {
      serviceId: 'service-1',
      bed: 'A-01',
      roundAt: '2026-10-13T12:00:00.000Z',
      assessmentType: 'Seguimiento',
      therapyType: 'Empírica',
      microbiologyDirected: null,
      prophylaxisType: '',
      clinicalEvolution: 'Estable',
    },
    diagnoses: [{
      codigo_cie10: 'A41.9',
      descripcion_cie10: 'Sepsis no especificada',
      tipo_diagnostico: 'Principal',
      categoria_proa: null,
      categoria_proa_id: null,
    }],
    treatmentActions: [{ treatmentId: 'treatment-1', draft: { kind: 'Continuar' } }],
    newTreatments: [{
      antimicrobialId: 'antimicrobial-1',
      antimicrobialName: 'CEFTRIAXONA',
      dosis: '2',
      unidad: 'g',
      frecuencia: 'cada 24 horas',
      via: 'IV',
      fechaInicio: '2026-10-13',
      duracionPrevistaDias: '5',
    }],
    microbiology: {
      status: 'No',
      tipoMuestraId: '',
      tipoMuestra: '',
      fechaToma: '',
      fechaResultado: '',
      resultadoGeneral: '',
      microorganismoId: '',
      microorganismo: '',
      tipoGermen: '',
      resistencias: [],
      sensibilidades: [],
      esMuestraControl: false,
      muestraPreviaId: '',
      impactoConducta: '',
    },
    intervention: {
      huboIntervencion: 'No',
      tipoIntervencionId: '',
      tipoIntervencion: '',
      tratamientosRelacionados: [],
      motivoNoIntervencion: 'Otro',
      descripcionMotivoNoIntervencion: 'Decisión documentada por el profesional',
      origenIntervencion: '',
      recomendacion: '',
      descripcionRecomendacion: '',
      aceptacion: '',
      motivoNoAceptacion: '',
      cumplimientoGuia: 'No evaluable',
      motivoNoCumplimiento: '',
      diasAhorrados: null,
      requiereSeguimiento: false,
      fechaSeguimiento: '',
      motivoSeguimiento: '',
    },
    note: { generatedText: 'Nota generada', finalText: 'Nota final' },
  }
}

describe('guardado clínico transaccional', () => {
  beforeEach(() => rpc.mockReset())

  it('envía todos los bloques en una sola llamada RPC y conserva la descripción de no intervención', async () => {
    rpc.mockResolvedValue({
      data: { round: { id: 'round-1' }, diagnoses: [], note: null },
      error: null,
    })

    await saveClinicalRoundTransaction(input())

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('guardar_ronda_clinica', {
      p_payload: expect.objectContaining({
        round_id: 'round-1',
        diagnoses: expect.any(Array),
        treatment_actions: expect.any(Array),
        new_treatments: expect.any(Array),
        microbiology: expect.any(Object),
        intervention: expect.objectContaining({
          no_intervention_description: 'Decisión documentada por el profesional',
        }),
        note: { generated_text: 'Nota generada', final_text: 'Nota final' },
      }),
    })
  })

  it('no inventa un bloque de intervención cuando el usuario todavía no lo diligencia', () => {
    const value = input()
    value.intervention = null
    expect(buildClinicalSavePayload(value)).not.toHaveProperty('intervention')
  })

  it('traduce errores por bloque sin mostrar detalles internos', () => {
    expect(clinicalSaveError({ message: 'EST01_MICROBIOLOGY: La muestra no pertenece al caso', code: 'P0001' }))
      .toBe('La muestra no pertenece al caso')
    expect(clinicalSaveError({ message: 'column x does not exist', code: '42703' }))
      .toBe('No se pudo guardar la ronda. Ningún cambio de este intento fue aplicado.')
  })
})
