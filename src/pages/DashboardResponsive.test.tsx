import { cleanup, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActiveMatrix, DashboardPage, OperationalKanban } from './DashboardPage'
import type { ActiveCaseRow } from '../services/operationalService'

const mocks = vi.hoisted(() => ({
  userType: 'ips_cliente',
  getActiveCasesCockpit: vi.fn(),
}))

vi.mock('../features/ips/ipsContext', () => ({
  useIps: () => ({
    status: 'ready',
    allowedIps: [{ id: 'ips-1', nombre: 'GESTION SALUD', estado: 'Activa' }],
    activeIps: { id: 'ips-1', nombre: 'GESTION SALUD', estado: 'Activa' },
    profile: null,
    activeMembership: null,
    userType: mocks.userType,
    error: null,
    setActiveIps: vi.fn(),
  }),
}))

vi.mock('../services/operationalService', async () => {
  const actual = await vi.importActual<typeof import('../services/operationalService')>('../services/operationalService')
  return {
    ...actual,
    getActiveCasesCockpit: mocks.getActiveCasesCockpit,
  }
})

const baseRow: ActiveCaseRow = {
  case: {
    id: 'case-1',
    ips_id: 'ips-1',
    paciente_id: 'patient-1',
    fecha_apertura: '2026-08-01',
    fecha_cierre: null,
    ubicacion_actual: 'Medicina Interna',
    cama_actual: '401',
    estado: 'Activo',
    motivo_cierre: null,
  },
  patient: {
    id: 'patient-1',
    ips_id: 'ips-1',
    tipo_identificacion: 'CC',
    numero_identificacion: 'VALIDACION-6C2',
    nombres: 'Validacion',
    apellidos: 'Responsive',
    sexo: 'F',
    fecha_nacimiento: '1990-01-01',
  },
  latestRound: {
    id: 'round-1',
    ips_id: 'ips-1',
    paciente_id: 'patient-1',
    caso_id: 'case-1',
    fecha_hora_ronda: '2026-08-26T14:00:00Z',
    ubicacion: 'Medicina Interna',
    servicio_id: 'service-1',
    cama: '401',
    profesional_id: 'user-1',
    tipo_valoracion: 'Seguimiento',
    evolucion_clinica: 'Estable',
    tipo_terapia: 'Dirigida',
    terapia_dirigida_por_microbiologia: true,
    tipo_profilaxis: null,
    equipo_valorador: null,
    estado: 'Borrador',
    fecha_creacion: '2026-08-26T14:00:00Z',
    fecha_confirmacion: null,
  },
  activeTreatments: [
    {
      id: 'treatment-1',
      ips_id: 'ips-1',
      paciente_id: 'patient-1',
      caso_id: 'case-1',
      ronda_id: 'round-1',
      antimicrobiano_id: 'am-1',
      antimicrobiano: 'ACICLOVIR',
      dosis: '500',
      unidad: 'mg',
      frecuencia: 'cada 8 h',
      via: 'IV',
      fecha_inicio: '2026-08-24',
      fecha_fin: null,
      duracion_prevista_dias: null,
      estado: 'Activo',
      fecha_ultima_modificacion: null,
    },
  ],
  microbiology: [
    {
      id: 'micro-1',
      ips_id: 'ips-1',
      caso_id: 'case-1',
      ronda_id: 'round-1',
      fecha_toma: '2026-08-25T10:00:00Z',
      tipo_muestra: 'Hemocultivo',
      estado_resultado: 'Pendiente',
      fecha_resultado: null,
      resultado_general: 'Pendiente',
      microorganismo: null,
      tipo_germen: null,
      es_muestra_control: false,
      muestra_previa_id: null,
      impacto_conducta: 'Pendiente',
      fecha_creacion: '2026-08-25T10:00:00Z',
      tipo_muestra_id: 'sample-1',
      microorganismo_id: null,
    },
  ],
  service: { id: 'service-1', ips_id: 'ips-1', nombre: 'Medicina Interna', estado: 'Activo' },
  latestIntervention: null,
  requiresFollowUp: true,
  maxTreatmentDay: 3,
  status: 'Microbiología pendiente/relevante',
}

describe('Dashboard responsive views', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    mocks.userType = 'ips_cliente'
  })

  it('renderiza tabla desktop y card clínica para la matriz operacional', () => {
    render(
      <MemoryRouter>
        <ActiveMatrix rows={[baseRow]} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('table')).toHaveClass('operational-table')
    expect(document.querySelector('.desktop-table')).toBeInTheDocument()
    expect(document.querySelector('.mobile-card-list')).toBeInTheDocument()
    expect(screen.getAllByText(/VALIDACION-6C2/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Microbiología pendiente/relevante').length).toBeGreaterThan(0)
  })

  it('cambia la categoría visible del Kanban móvil mediante chips', async () => {
    const user = userEvent.setup()
    let selected = 'Por valorar' as const
    const { rerender } = render(
      <MemoryRouter>
        <OperationalKanban rows={[baseRow]} selectedColumn={selected} setSelectedColumn={(next) => { selected = next as typeof selected }} />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /Microbiología/i }))
    expect(selected).toBe('Microbiología pendiente/relevante')

    rerender(
      <MemoryRouter>
        <OperationalKanban rows={[baseRow]} selectedColumn={selected} setSelectedColumn={(next) => { selected = next as typeof selected }} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Microbiología pendiente/relevante' }).closest('.kanban-column')).toHaveClass('mobile-selected')
  })

  it('oculta nueva valoración para IPS Cliente en el cockpit', async () => {
    mocks.userType = 'ips_cliente'
    mocks.getActiveCasesCockpit.mockResolvedValue([baseRow])

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    await waitFor(() => expect(mocks.getActiveCasesCockpit).toHaveBeenCalledWith('ips-1'))
    expect(screen.queryByRole('link', { name: /Nueva valoración/i })).not.toBeInTheDocument()
    expect(screen.getAllByText(/VALIDACION-6C2/).length).toBeGreaterThan(0)
  })
})
