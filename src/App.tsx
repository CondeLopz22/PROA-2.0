import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './app/AppShell'
import { AuthProvider } from './features/auth/AuthProvider'
import { useAuth } from './features/auth/authContext'
import { LoginPage } from './features/auth/LoginPage'
import { IpsProvider } from './features/ips/IpsProvider'
import { useIps } from './features/ips/ipsContext'
import { canAccessAdministration } from './services/permissionService'

const AntimicrobialUsePage = lazy(() => import('./pages/AntimicrobialUsePage').then((module) => ({ default: module.AntimicrobialUsePage })))
const AdministrationPage = lazy(() => import('./pages/AdministrationPage').then((module) => ({ default: module.AdministrationPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const DataQualityPage = lazy(() => import('./pages/DataQualityPage').then((module) => ({ default: module.DataQualityPage })))
const IndicatorsPage = lazy(() => import('./pages/IndicatorsPage').then((module) => ({ default: module.IndicatorsPage })))
const PatientsPage = lazy(() => import('./pages/PatientsPage').then((module) => ({ default: module.PatientsPage })))
const RoundEditorPage = lazy(() => import('./pages/RoundEditorPage').then((module) => ({ default: module.RoundEditorPage })))
const RoundsPage = lazy(() => import('./pages/RoundsPage').then((module) => ({ default: module.RoundsPage })))

export function AdministrationRoute() {
  const { status, userType } = useIps()
  if (status === 'loading') return <main className="page"><section className="panel">Validando permisos...</section></main>
  if (!canAccessAdministration(userType)) {
    return (
      <main className="page">
        <section className="panel empty-state">
          <h1>Acceso denegado</h1>
          <p>Administración está disponible únicamente para usuarios Administrador.</p>
        </section>
      </main>
    )
  }
  return <AdministrationPage />
}

function ProtectedApp() {
  const { status, user } = useAuth()

  if (status === 'loading') {
    return <div className="screen-center">Cargando sesión...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <IpsProvider>
      <AppShell>
        <Suspense fallback={<main className="page"><section className="panel">Cargando módulo...</section></main>}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/rondas" element={<RoundsPage />} />
            <Route path="/rondas/:roundId" element={<RoundEditorPage />} />
            <Route path="/pacientes" element={<PatientsPage />} />
            <Route path="/ddd" element={<AntimicrobialUsePage />} />
            <Route path="/calidad" element={<DataQualityPage />} />
            <Route path="/indicadores" element={<IndicatorsPage />} />
            <Route path="/administracion" element={<AdministrationRoute />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AppShell>
    </IpsProvider>
  )
}

function AuthRoute() {
  const { status, user } = useAuth()

  if (status === 'loading') {
    return <div className="screen-center">Validando sesión...</div>
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  return <LoginPage />
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<AuthRoute />} />
        <Route path="/*" element={<ProtectedApp />} />
      </Routes>
    </AuthProvider>
  )
}
