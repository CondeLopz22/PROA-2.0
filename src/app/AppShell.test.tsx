import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from './AppShell'
import { AdministrationRoute } from '../App'
import type { ProductUserType } from '../types/domain'

const mocks = vi.hoisted(() => ({
  userType: 'ips_cliente' as ProductUserType,
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
    allowedIps: [{ id: 'ips-1', nombre: 'GESTION SALUD', estado: 'Activa' }],
    activeIps: { id: 'ips-1', nombre: 'GESTION SALUD', estado: 'Activa' },
    profile: { usuario_id: 'user-1', nombre: 'Usuario', estado: 'Activo', es_admin_global: false },
    activeMembership: { usuario_id: 'user-1', ips_id: 'ips-1', rol: 'IPS Cliente', estado: 'Activo' },
    userType: mocks.userType,
    error: null,
    setActiveIps: vi.fn(),
  }),
}))

vi.mock('../pages/AdministrationPage', () => ({
  AdministrationPage: () => <div>Panel Administración</div>,
}))

describe('AppShell role navigation', () => {
  afterEach(() => {
    cleanup()
    mocks.userType = 'ips_cliente'
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
})
