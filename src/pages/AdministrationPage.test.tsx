import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdministrationPage } from './AdministrationPage'

const mocks = vi.hoisted(() => ({
  context: {
    profile: {
      usuario_id: 'user-1',
      nombre: 'Cliente IPS',
      estado: 'Activo',
      es_admin_global: false,
      fecha_creacion: '2026-08-01T00:00:00Z',
    },
    membership: {
      usuario_id: 'user-1',
      ips_id: 'ips-1',
      rol: 'IPS Cliente',
      estado: 'Activo',
      fecha_asignacion: '2026-08-01T00:00:00Z',
    },
    capability: 'ips_cliente',
    canManageInstitution: false,
    canManageUsers: false,
    canManageServices: false,
    canManageCatalogs: false,
    canManageOmsDdd: false,
  },
  getAdminAccessRows: vi.fn(),
  getAdminContext: vi.fn(),
  getAdminSummary: vi.fn(),
  getAllServicesForIps: vi.fn(),
  getCatalogAdminRows: vi.fn(),
  getDuplicateActiveTreatments: vi.fn(),
  getInstitution: vi.fn(),
  getOmsDddAdminRows: vi.fn(),
}))

vi.mock('../features/auth/authContext', () => ({
  useAuth: () => ({
    status: 'authenticated',
    session: null,
    user: { id: 'user-1', email: 'consulta@example.com' },
    signOut: vi.fn(),
  }),
}))

vi.mock('../features/ips/ipsContext', () => ({
  useIps: () => ({
    status: 'ready',
    allowedIps: [{ id: 'ips-1', nombre: 'GESTION SALUD', estado: 'Activa' }],
    activeIps: { id: 'ips-1', nombre: 'GESTION SALUD', estado: 'Activa' },
    profile: mocks.context.profile,
    activeMembership: mocks.context.membership,
    userType: 'ips_cliente',
    error: null,
    setActiveIps: vi.fn(),
  }),
}))

vi.mock('../services/administrationService', async () => {
  const actual = await vi.importActual<typeof import('../services/administrationService')>('../services/administrationService')
  return {
    ...actual,
    getAdminAccessRows: mocks.getAdminAccessRows,
    getAdminContext: mocks.getAdminContext,
    getAdminSummary: mocks.getAdminSummary,
    getAllServicesForIps: mocks.getAllServicesForIps,
    getCatalogAdminRows: mocks.getCatalogAdminRows,
    getDuplicateActiveTreatments: mocks.getDuplicateActiveTreatments,
    getInstitution: mocks.getInstitution,
    getOmsDddAdminRows: mocks.getOmsDddAdminRows,
    assignUserToIps: vi.fn(),
    createServiceForIps: vi.fn(),
    updateCatalogState: vi.fn(),
    updateInstitutionName: vi.fn(),
    updateService: vi.fn(),
    updateUserIpsAccess: vi.fn(),
  }
})

function seedAdministrationMocks() {
  mocks.getAdminContext.mockResolvedValue(mocks.context)
  mocks.getInstitution.mockResolvedValue({
    id: 'ips-1',
    nombre: 'GESTION SALUD',
    nit: '900123',
    codigo_reps: 'REPS-1',
    estado: 'Activa',
    fecha_creacion: '2026-08-01T00:00:00Z',
  })
  mocks.getAdminSummary.mockResolvedValue({
    services: 2,
    activeServices: 1,
    users: 1,
    activeUsers: 1,
    antimicrobials: 48,
    microorganisms: 57,
    sampleTypes: 12,
    interventions: 8,
    categories: 6,
    omsDdd: 57,
    duplicateTreatmentGroups: 1,
  })
  mocks.getAdminAccessRows.mockResolvedValue([
    {
      membership: mocks.context.membership,
      profile: mocks.context.profile,
      email: null,
    },
  ])
  mocks.getAllServicesForIps.mockResolvedValue([
    { id: 'service-1', ips_id: 'ips-1', nombre: 'UCI', estado: 'Activo' },
    { id: 'service-2', ips_id: 'ips-1', nombre: 'Hospitalización histórica', estado: 'Inactivo' },
  ])
  mocks.getCatalogAdminRows.mockResolvedValue([{ id: 'am-1', nombre: 'ACICLOVIR', codigo_atc: 'J05AB01', estado: 'Activo' }])
  mocks.getOmsDddAdminRows.mockResolvedValue([
    {
      id: 'ddd-1',
      antimicrobiano_id: 'am-1',
      antimicrobial: { nombre: 'ACICLOVIR', codigo_atc: 'J05AB01' },
      via: 'IV',
      ddd_oms: 4,
      unidad_ddd: 'g',
      version_fuente: 'OMS',
      fecha_actualizacion: '2026-08-01T00:00:00Z',
    },
  ])
  mocks.getDuplicateActiveTreatments.mockResolvedValue([
    {
      caseId: 'case-1',
      patient: {
        id: 'patient-1',
        ips_id: 'ips-1',
        tipo_identificacion: 'CC',
        numero_identificacion: 'VALIDACION-6D',
        nombres: 'Validacion',
        apellidos: 'Administracion',
        sexo: 'F',
        fecha_nacimiento: '1990-01-01',
      },
      antimicrobialKey: 'am-1',
      antimicrobialName: 'ACICLOVIR',
      count: 3,
      treatments: [
        { id: 'tx-1', antimicrobiano: 'ACICLOVIR', fecha_inicio: '2026-08-01', via: 'IV', estado: 'Activo' },
        { id: 'tx-2', antimicrobiano: 'ACICLOVIR', fecha_inicio: '2026-08-02', via: 'IV', estado: 'Activo' },
        { id: 'tx-3', antimicrobiano: 'ACICLOVIR', fecha_inicio: '2026-08-03', via: 'IV', estado: 'Activo' },
      ],
    },
  ])
}

describe('AdministrationPage', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  function nav() {
    return within(screen.getByLabelText('Secciones de administración'))
  }

  it('renderiza el centro modular de administración', async () => {
    seedAdministrationMocks()
    render(<AdministrationPage />)

    expect(await screen.findByRole('heading', { name: 'Parametrización Multi-IPS' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Institución/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Usuarios y accesos/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Auditoría de datos/i })).toBeInTheDocument()
  })

  it('deshabilita escrituras visibles para IPS Cliente', async () => {
    seedAdministrationMocks()
    const user = userEvent.setup()
    render(<AdministrationPage />)

    await screen.findByRole('heading', { name: 'Parametrización Multi-IPS' })
    await user.click(nav().getByRole('button', { name: /Usuarios y accesos/i }))
    expect(await screen.findByLabelText('Usuario existente ID')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Asignar' })).toBeDisabled()
  })

  it('muestra servicios activos e inactivos sin borrado físico', async () => {
    seedAdministrationMocks()
    const user = userEvent.setup()
    render(<AdministrationPage />)

    await screen.findByRole('heading', { name: 'Parametrización Multi-IPS' })
    await user.click(nav().getByRole('button', { name: /Servicios/i }))
    expect(await screen.findAllByText('UCI')).not.toHaveLength(0)
    expect(screen.getAllByText('Hospitalización histórica')).not.toHaveLength(0)
    expect(screen.getAllByText('Inactivo')).not.toHaveLength(0)
  })

  it('detecta tratamientos activos duplicados en auditoría', async () => {
    seedAdministrationMocks()
    const user = userEvent.setup()
    render(<AdministrationPage />)

    await screen.findByRole('heading', { name: 'Parametrización Multi-IPS' })
    await user.click(nav().getByRole('button', { name: /Auditoría de datos/i }))
    await waitFor(() => expect(mocks.getDuplicateActiveTreatments).toHaveBeenCalledWith('ips-1'))
    expect(screen.getAllByText('ACICLOVIR')).not.toHaveLength(0)
    expect(screen.getAllByText('3')).not.toHaveLength(0)
  })
})
