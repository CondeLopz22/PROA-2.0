import { describe, expect, it } from 'vitest'
import { buildPatientTimeline, type PatientRecordBundle } from './patientRecordService'

const record: PatientRecordBundle = {
  patient: { id: 'patient-1', ips_id: 'ips-1', tipo_identificacion: 'CC', numero_identificacion: '100' },
  cases: [
    { id: 'case-a', ips_id: 'ips-1', paciente_id: 'patient-1', estado: 'Activo', fecha_apertura: '2026-10-01T08:00:00Z' },
    { id: 'case-b', ips_id: 'ips-1', paciente_id: 'patient-1', estado: 'Cerrado', fecha_apertura: '2026-08-01T08:00:00Z', fecha_cierre: '2026-08-05T08:00:00Z' },
  ],
  rounds: [
    { id: 'round-a', ips_id: 'ips-1', paciente_id: 'patient-1', caso_id: 'case-a', fecha_hora_ronda: '2026-10-03T08:00:00Z', tipo_valoracion: 'Seguimiento' },
    { id: 'round-b', ips_id: 'ips-1', paciente_id: 'patient-1', caso_id: 'case-b', fecha_hora_ronda: '2026-08-03T08:00:00Z', tipo_valoracion: 'Primera valoración' },
  ],
  diagnoses: [{ id: 'diag-a', ronda_id: 'round-a', codigo_cie10: 'A49.9', descripcion_cie10: 'Infección', fecha_creacion: '2026-10-03T09:00:00Z' }],
  treatments: [{ id: 'tx-a', ips_id: 'ips-1', paciente_id: 'patient-1', caso_id: 'case-a', ronda_id: 'round-a', antimicrobiano: 'CEFTRIAXONA', estado: 'Activo', fecha_inicio: '2026-10-02' }],
  microbiology: [{ id: 'micro-a', ips_id: 'ips-1', caso_id: 'case-a', ronda_id: 'round-a', tipo_muestra: 'Hemocultivo', resultado_general: 'Positivo', microorganismo: 'E. coli', fecha_resultado: '2026-10-04T08:00:00Z' }],
  interventions: [{ id: 'int-a', ips_id: 'ips-1', ronda_id: 'round-a', hubo_intervencion: true, tipo_intervencion: 'Optimización', fecha_creacion: '2026-10-04T09:00:00Z' }],
  treatmentAssessments: [],
  interventionDecisions: [],
  interventionImplementations: [],
  services: [],
}

describe('expediente longitudinal EST-03A', () => {
  it('ordena eventos descendentes y conserva el caso de cada evento', () => {
    const events = buildPatientTimeline(record)
    expect(events[0].id).toBe('intervention-int-a')
    expect(events.every((event) => event.caseId === 'case-a' || event.caseId === 'case-b')).toBe(true)
    expect(events.find((event) => event.id === 'round-round-b')?.caseId).toBe('case-b')
  })
})
