import { Activity, BarChart3, Building2, ClipboardCheck, ClipboardList, Database, Home, LogOut, Menu, Users } from 'lucide-react'
import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../features/auth/authContext'
import { useIps } from '../features/ips/ipsContext'

const navigation = [
  { to: '/', label: 'Inicio', icon: Home },
  { to: '/rondas', label: 'Rondas PROA', icon: ClipboardList },
  { to: '/pacientes', label: 'Pacientes / Registros', icon: Users },
  { to: '/ddd', label: 'Consumo / DDD', icon: Database },
  { to: '/calidad', label: 'Calidad de Datos', icon: ClipboardCheck },
  { to: '/indicadores', label: 'Indicadores', icon: BarChart3 },
  { to: '/administracion', label: 'Administración', icon: Building2 },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { signOut, user } = useAuth()
  const { allowedIps, activeIps, error, setActiveIps, status } = useIps()
  const [open, setOpen] = useState(false)

  return (
    <div className="app-layout">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <span className="brand-mark small">
            <Activity size={20} />
          </span>
          <div>
            <strong>INFECTOMAG</strong>
            <em>PROA</em>
            <span>HealthSolutions</span>
          </div>
        </div>
        <nav className="nav-list" aria-label="Principal">
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)}>
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="content-shell">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setOpen((value) => !value)} type="button">
            <Menu size={20} />
          </button>
          <div className="ips-chip">
            <Building2 size={16} />
            <span>{status === 'loading' ? 'Cargando IPS...' : activeIps?.nombre ?? 'Sin IPS activa'}</span>
          </div>
          <div className="topbar-actions">
            {allowedIps.length > 1 ? (
              <select
                aria-label="IPS activa"
                value={activeIps?.id ?? ''}
                onChange={(event) => {
                  const next = allowedIps.find((ips) => ips.id === event.target.value)
                  if (next) setActiveIps(next)
                }}
              >
                {allowedIps.map((ips) => (
                  <option key={ips.id} value={ips.id}>
                    {ips.nombre}
                  </option>
                ))}
              </select>
            ) : null}
            <span className="user-email" title={user?.email}>Usuario activo</span>
            <button className="ghost-button" onClick={signOut} type="button">
              <LogOut size={16} />
              Salir
            </button>
          </div>
        </header>

        {status === 'error' ? <div className="alert error shell-alert">{error}</div> : null}
        {status === 'no_profile' || status === 'empty' ? (
          <main className="page">
            <section className="panel empty-state">
              <h1>{status === 'no_profile' ? 'Usuario sin perfil' : 'Sin IPS asignada'}</h1>
              <p>
                {status === 'no_profile'
                  ? 'Tu usuario autenticado no tiene fila visible en perfiles_usuario.'
                  : 'Tu usuario no tiene IPS activas visibles por RLS o por la tabla usuario_ips.'}
              </p>
            </section>
          </main>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
