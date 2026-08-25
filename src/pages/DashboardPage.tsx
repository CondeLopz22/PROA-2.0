import { ClipboardList, ShieldCheck, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useIps } from '../features/ips/ipsContext'

export function DashboardPage() {
  const { activeIps } = useIps()

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Inicio</p>
          <h1>Gestión PROA</h1>
          <p className="muted">IPS activa: {activeIps?.nombre ?? 'No seleccionada'}</p>
        </div>
        <Link className="primary-button" to="/rondas">
          Nueva ronda
        </Link>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <ClipboardList size={24} />
          <span>Flujo habilitado</span>
          <strong>Rondas PROA</strong>
        </article>
        <article className="metric-card">
          <Users size={24} />
          <span>Consulta central</span>
          <strong>Pacientes y casos</strong>
        </article>
        <article className="metric-card">
          <ShieldCheck size={24} />
          <span>Aislamiento</span>
          <strong>RLS Supabase</strong>
        </article>
      </section>
    </main>
  )
}
