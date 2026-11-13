import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  afterEach(() => cleanup())
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
      latestMicrobiology: null,
      latestIntervention: null,
      service: null,
      workflowState: 'Primera valoración',
      lastActivityAt: '2026-10-13T10:00:00Z',
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
      serviceId: null,
      bed: null,
    })
    await waitFor(() => expect(screen.getByText('Editor directo')).toBeTruthy())
  })

  it('alterna lista y Kanban conservando los filtros en la URL', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/pacientes?estado=Activos&q=Paciente']}><PatientsPage /></MemoryRouter>)

    expect(await screen.findByRole('table')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Vista Kanban' }))

    expect(screen.getByLabelText('Kanban de pacientes')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Activos' }).className).toContain('selected')
    expect(screen.getByDisplayValue('Paciente')).toBeTruthy()
  })

  it('abre el expediente del paciente desde la lista', async () => {
    render(
      <MemoryRouter initialEntries={['/pacientes']}>
        <Routes>
          <Route path="/pacientes" element={<PatientsPage />} />
          <Route path="/pacientes/:patientId" element={<div>Expediente visible</div>} />
        </Routes>
      </MemoryRouter>,
    )
    const links = await screen.findAllByRole('link', { name: /Expediente/i })
    await userEvent.click(links[0])
    expect(screen.getByText('Expediente visible')).toBeTruthy()
  })
})
