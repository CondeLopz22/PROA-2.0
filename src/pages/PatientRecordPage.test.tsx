import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getPatientRecord: vi.fn(), startCaseRound: vi.fn() }))

vi.mock('../features/ips/ipsContext', () => ({ useIps: () => ({ activeIps: { id: 'ips-1', nombre: 'GESTION SALUD' }, userType: 'infectomag' }) }))
vi.mock('../services/patientRecordService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/patientRecordService')>()
  return { ...actual, getPatientRecord: mocks.getPatientRecord }
})
vi.mock('../services/roundService', () => ({ startCaseRound: mocks.startCaseRound }))

import { PatientRecordPage } from './PatientRecordPage'

describe('PatientRecordPage', () => {
  beforeEach(() => {
    mocks.getPatientRecord.mockResolvedValue({
      patient: { id: 'patient-1', ips_id: 'ips-1', tipo_identificacion: 'CC', numero_identificacion: '100', nombres: 'Ana', apellidos: 'Prueba' },
      cases: [{ id: 'case-1', ips_id: 'ips-1', paciente_id: 'patient-1', estado: 'Activo', fecha_apertura: '2026-10-01' }],
      rounds: [{ id: 'round-1', ips_id: 'ips-1', paciente_id: 'patient-1', caso_id: 'case-1', estado: 'Confirmada', tipo_valoracion: 'Primera valoración', fecha_hora_ronda: '2026-10-02T12:00:00Z' }],
      diagnoses: [{ id: 'diag-1', ronda_id: 'round-1', codigo_cie10: 'A49.9', descripcion_cie10: 'Infección', fecha_creacion: '2026-10-02T12:30:00Z' }],
      treatments: [], microbiology: [], interventions: [], services: [],
    })
    mocks.startCaseRound.mockResolvedValue({ round: { id: 'round-2' }, case: { id: 'case-1' }, caseCreated: false, draftReused: false })
  })

  it('muestra expediente por caso y abre una nueva ronda con contexto', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/pacientes/patient-1']}><Routes><Route path="/pacientes/:patientId" element={<PatientRecordPage />} /><Route path="/rondas/:roundId" element={<div>Ronda abierta</div>} /></Routes></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Ana Prueba' })).toBeTruthy()
    expect(screen.getAllByText(/A49.9/).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: /Nueva ronda/i }))
    expect(mocks.startCaseRound).toHaveBeenCalledWith({ ipsId: 'ips-1', patientId: 'patient-1', caseId: 'case-1', serviceId: null, bed: null })
    await waitFor(() => expect(screen.getByText('Ronda abierta')).toBeTruthy())
  })
})
