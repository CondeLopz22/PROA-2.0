import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from './AppShell'
import { AdministrationRoute } from '../App'
import type { ProductUserType } from '../types/domain'

const mocks = vi.hoisted(() => ({
  userType: 'ips_cliente' as ProductUserType,
  setActiveIps: vi.fn(),
}))

vi.mock('../features/auth/authContext', () => ({
  useAuth: () => ({
    status: 'authenticated',
    user: { id: 'user-1', email: 'usuario@example.com' },
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../features/ips/ipsContext', () => ({
  useIps: () => ({
    status: 'ready',
    allowedIps: [
      { id: 'ips-1', nombre: 'GESTION SALUD', estado: 'Activa' },
      { id: 'ips-2', nombre: 'HUJMB', estado: 'Activa' },
    ],
    activeIps: { id: 'ips-1', nombre: 'GESTION SALUD', estado: 'Activa' },
    profile: { usuario_id: 'user-1', nombre: 'Usuario', estado: 'Activo', es_admin_global: false },
    activeMembership: { usuario_id: 'user-1', ips_id: 'ips-1', rol: 'IPS Cliente', estado: 'Activo' },
    userType: mocks.userType,
    error: null,
    setActiveIps: mocks.setActiveIps,
  }),
}))

vi.mock('../pages/AdministrationPage', () => ({
  AdministrationPage: () => <div>Panel Administración</div>,
}))

describe('AppShell role navigation', () => {
  afterEach(() => {
    cleanup()
    mocks.userType = 'ips_cliente'
    mocks.setActiveIps.mockReset()
  })

  it('oculta Administración para Usuario INFECTOMAG e IPS Cliente', () => {
    mocks.userType = 'infectomag'
    render(
      <MemoryRouter>
        <AppShell>
          <div>Contenido</div>
        </AppShell>
      </MemoryRouter>,
    )

    expect(screen.queryByRole('link', { name: /Administración/i })).not.toBeInTheDocument()
  })

  it('muestra Administración para Administrador', () => {
    mocks.userType = 'administrador'
    render(
      <MemoryRouter>
        <AppShell>
          <div>Contenido</div>
        </AppShell>
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: /Administración/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Auditoría PROA/i })).toBeInTheDocument()
  })

  it('mantiene Auditoría PROA visible para IPS Cliente', () => {
    mocks.userType = 'ips_cliente'
    render(
      <MemoryRouter>
        <AppShell><div>Contenido</div></AppShell>
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: /Auditoría PROA/i })).toBeInTheDocument()
  })

  it('protege la ruta /administracion para perfiles no administradores', () => {
    mocks.userType = 'ips_cliente'
    render(
      <MemoryRouter>
        <AdministrationRoute />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Acceso denegado' })).toBeInTheDocument()
    expect(screen.queryByText('Panel Administración')).not.toBeInTheDocument()
  })

  it('cambia la IPS activa desde el selector institucional', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/pacientes/patient-1']}><AppShell><div>Contexto clínico</div></AppShell></MemoryRouter>)
    await user.selectOptions(screen.getByRole('combobox', { name: 'IPS activa' }), 'ips-2')
    expect(mocks.setActiveIps).toHaveBeenCalledWith(expect.objectContaining({ id: 'ips-2', nombre: 'HUJMB' }))
  })
})
