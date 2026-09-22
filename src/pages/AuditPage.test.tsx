import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuditPage } from './AuditPage'
import type { AuditInboxRow } from '../services/auditService'
import { filterAuditRows, type AuditFilters } from '../services/auditFilters'
import type { ProductUserType } from '../types/domain'

const mocks = vi.hoisted(() => ({
  userType: 'infectomag' as ProductUserType,
  getAuditInbox: vi.fn(),
  updateAuditFindingStatus: vi.fn(),
}))

vi.mock('../features/auth/authContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

vi.mock('../features/ips/ipsContext', () => ({
  useIps: () => ({ activeIps: { id: 'ips-1', nombre: 'GESTION SALUD' }, userType: mocks.userType }),
}))

vi.mock('../services/auditService', () => ({
  getAuditInbox: mocks.getAuditInbox,
  updateAuditFindingStatus: mocks.updateAuditFindingStatus,
}))

const rows: AuditInboxRow[] = [
  finding({
    id: 'finding-priority',
    estado: 'Abierto',
    severidad: 'Prioritario',
    patient: patient('patient-a', 'Ana', 'Access', '1001'),
    tratamiento_id: 'treatment-reserve-a',
    antimicrobiano: 'LINEZOLID',
    aware_categoria: 'Reserve',
    tipo_hallazgo: 'Reserve sin intervención',
    descripcion: 'Tratamiento Reserve que requiere revisión.',
    intervention: {
      id: 'intervention-a',
      tipo_intervencion: 'Revisión de tratamiento Reserve',
      aceptacion: 'Pendiente',
    },
    intervencion_id: 'intervention-a',
  }),
  finding({
    id: 'finding-follow',
    estado: 'En seguimiento',
    severidad: 'Revisión',
    patient: patient('patient-b', 'Bruno', 'Beta', '2002'),
    servicio: 'UCI',
    antimicrobiano: 'MEROPENEM',
    tipo_hallazgo: 'Tratamiento prolongado',
  }),
  finding({
    id: 'finding-resolved',
    estado: 'Resuelto',
    severidad: 'Informativo',
    patient: patient('patient-c', 'Carla', 'Cierre', '3003'),
    antimicrobiano: 'AMIKACINA',
    tipo_hallazgo: 'Fecha revisada',
  }),
]

describe('AuditPage', () => {
  beforeEach(() => {
    mocks.userType = 'infectomag'
    mocks.getAuditInbox.mockResolvedValue(rows)
    mocks.updateAuditFindingStatus.mockImplementation(async ({ findingId, status, discardReason }) => ({
      ...rows.find((row) => row.id === findingId),
      estado: status,
      motivo_descarte: discardReason ?? null,
    }))
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renderiza la bandeja, aplica el default operativo e identifica Prioritario', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Auditoría PROA' })).toBeInTheDocument()
    expect(screen.getAllByText('Ana Access').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Bruno Beta').length).toBeGreaterThan(0)
    expect(screen.queryByText('Carla Cierre')).not.toBeInTheDocument()
    expect(screen.getAllByText('Prioritario').some((element) => element.classList.contains('severity-priority'))).toBe(true)
  })

  it('combina filtros y búsqueda por identificación', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Bandeja de hallazgos')

    await user.selectOptions(screen.getByLabelText('Estado'), 'Todos')
    await user.selectOptions(screen.getByLabelText('Prioridad'), 'Revisión')
    await user.type(screen.getByLabelText('Buscar paciente o identificación'), '2002')

    expect(screen.getAllByText('Bruno Beta').length).toBeGreaterThan(0)
    expect(screen.queryByText('Ana Access')).not.toBeInTheDocument()
    expect(screen.queryByText('Carla Cierre')).not.toBeInTheDocument()
  })

  it('muestra detalle, tratamiento e intervención vinculados al hallazgo correcto', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click((await screen.findAllByRole('button', { name: 'Revisar' }))[0])

    const detail = screen.getByRole('heading', { name: 'Reserve sin intervención' }).closest('section') as HTMLElement
    expect(within(detail).getByText('LINEZOLID')).toBeInTheDocument()
    expect(within(detail).getByText(/Revisión de tratamiento Reserve/)).toBeInTheDocument()
    expect(within(detail).getByText(/Aceptación: Pendiente/)).toBeInTheDocument()
    expect(within(detail).getByRole('link', { name: 'Ver ronda relacionada' })).toHaveAttribute('href', '/rondas/round-1')
  })

  it('permite la transición Abierto a En seguimiento y Resuelto', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click((await screen.findAllByRole('button', { name: 'Revisar' }))[0])
    const detail = screen.getByRole('heading', { name: 'Reserve sin intervención' }).closest('section') as HTMLElement
    await user.click(within(detail).getByRole('button', { name: /En seguimiento/i }))

    await waitFor(() => expect(mocks.updateAuditFindingStatus).toHaveBeenCalledWith(expect.objectContaining({ findingId: 'finding-priority', status: 'En seguimiento' })))
    await user.click(within(detail).getByRole('button', { name: /Resolver/i }))
    await waitFor(() => expect(mocks.updateAuditFindingStatus).toHaveBeenLastCalledWith(expect.objectContaining({ findingId: 'finding-priority', status: 'Resuelto' })))
  })

  it('exige motivo para descartar', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click((await screen.findAllByRole('button', { name: 'Revisar' }))[0])
    await user.click(screen.getByRole('button', { name: 'Descartar' }))

    const confirm = screen.getByRole('button', { name: 'Confirmar descarte' })
    expect(confirm).toBeDisabled()
    await user.type(screen.getByLabelText('Motivo de descarte (obligatorio)'), 'Condición revisada y no aplicable')
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    await waitFor(() => expect(mocks.updateAuditFindingStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'Descartado', discardReason: 'Condición revisada y no aplicable' })))
  })

  it('mantiene IPS Cliente en modo estrictamente consultivo', async () => {
    const user = userEvent.setup()
    mocks.userType = 'ips_cliente'
    renderPage()
    await user.click((await screen.findAllByRole('button', { name: 'Revisar' }))[0])

    expect(screen.getByText(/puede consultar este hallazgo/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Resolver/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Descartar' })).not.toBeInTheDocument()
  })
})

describe('filterAuditRows', () => {
  it('combina estado, servicio, AWaRe y tipo sin inventar registros', () => {
    const filters: AuditFilters = {
      status: 'Activos',
      severity: 'Prioritario',
      service: 'Medicina Interna',
      antimicrobial: 'LINEZOLID',
      aware: 'Reserve',
      type: 'Reserve sin intervención',
      search: '1001',
    }
    expect(filterAuditRows(rows, filters).map((row) => row.id)).toEqual(['finding-priority'])
  })
})

function renderPage() {
  return render(<MemoryRouter initialEntries={['/auditoria']}><AuditPage /></MemoryRouter>)
}

function patient(id: string, nombres: string, apellidos: string, document: string) {
  return { id, ips_id: 'ips-1', tipo_identificacion: 'CC', numero_identificacion: document, nombres, apellidos }
}

function finding(overrides: Partial<AuditInboxRow>): AuditInboxRow {
  return {
    id: 'finding',
    hallazgo_id: 'finding',
    ips_id: 'ips-1',
    caso_id: 'case-1',
    paciente_id: 'patient-a',
    tratamiento_id: 'treatment-1',
    ronda_detectada_id: 'round-1',
    codigo_regla: 'AUD-03',
    tipo_hallazgo: 'Tratamiento prolongado',
    categoria: 'Duración',
    severidad: 'Revisión',
    fecha_deteccion: '2026-09-20T10:00:00Z',
    estado: 'Abierto',
    descripcion: 'Descripción de prueba',
    origen: 'Automático',
    servicio: 'Medicina Interna',
    antimicrobiano: 'LINEZOLID',
    aware_categoria: 'Reserve',
    patient: null,
    treatment: { id: 'treatment-1', fecha_inicio: '2026-09-15', estado: 'Activo' },
    intervention: null,
    treatmentDay: 6,
    ...overrides,
  }
}
