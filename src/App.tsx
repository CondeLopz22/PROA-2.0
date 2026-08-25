import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './app/AppShell'
import { AuthProvider } from './features/auth/AuthProvider'
import { useAuth } from './features/auth/authContext'
import { LoginPage } from './features/auth/LoginPage'
import { IpsProvider } from './features/ips/IpsProvider'
import { AntimicrobialUsePage } from './pages/AntimicrobialUsePage'
import { DashboardPage } from './pages/DashboardPage'
import { PatientsPage } from './pages/PatientsPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { RoundEditorPage } from './pages/RoundEditorPage'
import { RoundsPage } from './pages/RoundsPage'

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
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/rondas" element={<RoundsPage />} />
          <Route path="/rondas/:roundId" element={<RoundEditorPage />} />
          <Route path="/pacientes" element={<PatientsPage />} />
          <Route path="/ddd" element={<AntimicrobialUsePage />} />
          <Route path="/indicadores" element={<PlaceholderPage title="Indicadores" />} />
          <Route path="/administracion" element={<PlaceholderPage title="Administración" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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
