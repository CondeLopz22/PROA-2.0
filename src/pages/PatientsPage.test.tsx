import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPatientDirectory: vi.fn(),
  startCaseRound: vi.fn(),
}))

vi.mock('../features/ips/ipsContext', () => ({
  useIps: () => ({ activeIps: { id: 'ips-1', nombre: 'IPS Prueba' }, userType: 'infectomag' }),
}))
vi.mock('../services/operationalService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/operationalService')>()
  return { ...actual, getPatientDirectory: mocks.getPatientDirectory }
})
vi.mock('../services/roundService', () => ({ startCaseRound: mocks.startCaseRound }))

import { PatientsPage } from './PatientsPage'

describe('navegación paciente a ronda EST-02', () => {
  beforeEach(() => {
    mocks.getPatientDirectory.mockReset()
    mocks.startCaseRound.mockReset()
    mocks.getPatientDirectory.mockResolvedValue([{
      patient: {
        id: 'patient-1', ips_id: 'ips-1', tipo_identificacion: 'CC', numero_identificacion: '100',
        nombres: 'Paciente', apellidos: 'Prueba',
      },
      activeCase: { id: 'case-1', ips_id: 'ips-1', paciente_id: 'patient-1', estado: 'Activo' },
      latestCase: { id: 'case-1', ips_id: 'ips-1', paciente_id: 'patient-1', estado: 'Activo' },
      latestRound: null,
      latestActiveCaseRound: null,
      activeTreatments: [],
      roundCount: 0,
    }])
    mocks.startCaseRound.mockResolvedValue({
      case: { id: 'case-1' },
      round: { id: 'round-1' },
      caseCreated: false,
      draftReused: false,
    })
  })

  it('abre directamente la ronda conservando paciente, caso e IPS', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/pacientes']}>
        <Routes>
          <Route path="/pacientes" element={<PatientsPage />} />
          <Route path="/rondas/:roundId" element={<div>Editor directo</div>} />
        </Routes>
      </MemoryRouter>,
    )

    const actions = await screen.findAllByRole('button', { name: 'Nueva ronda' })
    await user.click(actions[0])

    expect(mocks.startCaseRound).toHaveBeenCalledWith({
      ipsId: 'ips-1',
      patientId: 'patient-1',
      caseId: 'case-1',
    })
    await waitFor(() => expect(screen.getByText('Editor directo')).toBeTruthy())
  })
})
