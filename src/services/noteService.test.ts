import { describe, expect, it } from 'vitest'
import { generateProaNote } from './noteService'

describe('generateProaNote', () => {
  it('produce texto clínico sin null ni undefined con bloques parciales', () => {
    const text = generateProaNote({
      round: {
        id: 'r1',
        ips_id: 'ips1',
        paciente_id: 'p1',
        caso_id: 'c1',
        tipo_valoracion: 'Primera valoración',
        tipo_terapia: 'Dirigida',
        evolucion_clinica: 'Estable',
        fecha_hora_ronda: '2026-08-24T10:00:00.000Z',
      },
      patient: {
        id: 'p1',
        ips_id: 'ips1',
        tipo_identificacion: 'CC',
        numero_identificacion: 'VALIDACION-6A',
        nombres: 'Paciente',
        apellidos: 'Prueba',
      },
      services: [],
      diagnoses: [
        {
          id: 'd1',
          ronda_id: 'r1',
          codigo_cie10: 'J18.9',
          descripcion_cie10: 'Neumonía no especificada',
          tipo_diagnostico: 'Principal',
        },
      ],
      treatments: [
        {
          id: 't1',
          antimicrobiano: 'Meropenem',
          dosis: 1,
          unidad: 'g',
          via: 'IV',
          frecuencia: 'cada 8 h',
          fecha_inicio: '2026-08-22',
          estado: 'Activo',
        },
      ],
      microbiology: [],
      intervention: {
        huboIntervencion: '',
        tipoIntervencionId: '',
        tipoIntervencion: '',
        tratamientosRelacionados: [],
        motivoNoIntervencion: '',
        descripcionMotivoNoIntervencion: '',
        origenIntervencion: '',
        recomendacion: '',
        descripcionRecomendacion: '',
        aceptacion: '',
        motivoNoAceptacion: '',
        cumplimientoGuia: '',
        motivoNoCumplimiento: '',
        diasAhorrados: null,
        requiereSeguimiento: false,
        fechaSeguimiento: '',
        motivoSeguimiento: '',
      },
    })

    expect(text).toContain('## EVOLUCIÓN PROA')
    expect(text).toContain('Paciente Prueba')
    expect(text).toContain('Meropenem')
    expect(text).not.toMatch(/undefined|null|\[\]/i)
  })
})
