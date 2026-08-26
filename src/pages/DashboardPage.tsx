import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertCircle, CalendarClock, ClipboardList, LayoutGrid, List, Microscope, Plus, RefreshCw, UserCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useIps } from '../features/ips/ipsContext'
import { formatDateTime } from '../lib/date'
import { getActiveCasesCockpit, operationalStatusRules, type ActiveCaseRow, type OperationalStatus } from '../services/operationalService'
import { patientDisplayName } from '../services/patientService'
import { treatmentName } from '../services/treatmentService'
import { readableError } from '../services/supabaseErrors'

const kanbanColumns: OperationalStatus[] = ['Por valorar', 'En seguimiento', 'Microbiología pendiente/relevante', 'Respuesta pendiente', 'Al día']

function treatmentSummary(row: ActiveCaseRow) {
  if (!row.activeTreatments.length) return 'Sin antimicrobianos activos'
  return row.activeTreatments.map(treatmentName).join(', ')
}

function microbiologySummary(row: ActiveCaseRow) {
  const relevant = row.microbiology.find((item) => item.resultado_general === 'Positivo' || item.resultado_general === 'Pendiente')
  if (!relevant) return 'Sin microbiología relevante'
  return [relevant.tipo_muestra, relevant.resultado_general, relevant.microorganismo].filter(Boolean).join(' · ')
}

export function DashboardPage() {
  const { activeIps } = useIps()
  const [rows, setRows] = useState<ActiveCaseRow[]>([])
  const [view, setView] = useState<'Matriz' | 'Kanban'>('Matriz')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!activeIps) return
    setLoading(true)
    setError(null)
    try {
      setRows(await getActiveCasesCockpit(activeIps.id))
    } catch (loadError) {
      setError(readableError(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIps?.id])

  const kpis = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return {
      active: rows.length,
      followUp: rows.filter((row) => row.requiresFollowUp).length,
      roundsToday: rows.filter((row) => row.latestRound?.fecha_hora_ronda?.slice(0, 10) === today).length,
      pendingResponse: rows.filter((row) => row.status === 'Respuesta pendiente').length,
      microbiology: rows.filter((row) => row.status === 'Microbiología pendiente/relevante').length,
    }
  }, [rows])

  return (
    <main className="page operational-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Cockpit PROA</p>
          <h1>Pacientes activos bajo seguimiento</h1>
          <p className="muted">IPS activa: {activeIps?.nombre ?? 'No seleccionada'}</p>
        </div>
        <div className="button-row">
          <button className="secondary-button" disabled={loading} onClick={load} type="button">
            <RefreshCw size={17} />
            Actualizar
          </button>
          <Link className="primary-button" to="/rondas?new=1">
            <Plus size={17} />
            Nueva valoración
          </Link>
        </div>
      </section>

      {error ? <div className="alert error"><AlertCircle size={18} /> {error}</div> : null}

      <section className="metrics-grid compact-metrics">
        <Metric icon={<UserCheck size={22} />} label="Pacientes activos" value={kpis.active} />
        <Metric icon={<CalendarClock size={22} />} label="Seguimiento requerido" value={kpis.followUp} />
        <Metric icon={<ClipboardList size={22} />} label="Rondas hoy" value={kpis.roundsToday} />
        <Metric icon={<RefreshCw size={22} />} label="Respuesta pendiente" value={kpis.pendingResponse} />
        <Metric icon={<Microscope size={22} />} label="Microbiología relevante" value={kpis.microbiology} />
      </section>

      <section className="panel">
        <div className="subsection-heading">
          <div>
            <h2>Población activa</h2>
            <p className="muted">Estados derivados por reglas determinísticas, sin clasificación de gravedad clínica.</p>
          </div>
          <div className="segmented-control">
            <button className={view === 'Matriz' ? 'selected' : ''} onClick={() => setView('Matriz')} type="button">
              <List size={16} />
              Matriz
            </button>
            <button className={view === 'Kanban' ? 'selected' : ''} onClick={() => setView('Kanban')} type="button">
              <LayoutGrid size={16} />
              Kanban
            </button>
          </div>
        </div>

        {loading ? <p className="muted">Cargando pacientes activos...</p> : null}
        {!loading && !rows.length ? (
          <div className="empty-state">
            <h2>Sin pacientes PROA activos</h2>
            <p>No existen casos activos para esta IPS en este momento.</p>
            <Link className="primary-button" to="/rondas?new=1">+ Nueva valoración</Link>
          </div>
        ) : null}
        {!loading && rows.length && view === 'Matriz' ? <ActiveMatrix rows={rows} /> : null}
        {!loading && rows.length && view === 'Kanban' ? <OperationalKanban rows={rows} /> : null}
      </section>

      <section className="panel">
        <h2>Reglas de estado operativo</h2>
        <div className="subtle-list">
          {operationalStatusRules().map((rule) => <span key={rule}>{rule}</span>)}
        </div>
      </section>
    </main>
  )
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <article className="metric-card">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function ActiveMatrix({ rows }: { rows: ActiveCaseRow[] }) {
  return (
    <div className="table-wrap">
      <table className="data-table operational-table">
        <thead>
          <tr>
            <th>Paciente</th>
            <th>Identificación</th>
            <th>Servicio / cama</th>
            <th>Antimicrobiano(s)</th>
            <th>Día tratamiento</th>
            <th>Microbiología</th>
            <th>Última ronda</th>
            <th>Seguimiento</th>
            <th>Estado operativo</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.case.id}>
              <td><strong>{patientDisplayName(row.patient)}</strong></td>
              <td>{row.patient.tipo_identificacion} {row.patient.numero_identificacion}</td>
              <td>{row.service?.nombre ?? row.case.ubicacion_actual ?? 'Sin servicio'} · {row.latestRound?.cama ?? row.case.cama_actual ?? 'Sin cama'}</td>
              <td>{treatmentSummary(row)}</td>
              <td>{row.maxTreatmentDay ? `Día ${row.maxTreatmentDay}` : 'Sin cálculo'}</td>
              <td>{microbiologySummary(row)}</td>
              <td>{formatDateTime(row.latestRound?.fecha_hora_ronda)}</td>
              <td>{row.requiresFollowUp ? 'Sí' : 'No'}</td>
              <td><span className="pill">{row.status}</span></td>
              <td><Link className="table-action" to={`/pacientes?documento=${row.patient.numero_identificacion}`}>Abrir</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function OperationalKanban({ rows }: { rows: ActiveCaseRow[] }) {
  return (
    <div className="kanban-board">
      {kanbanColumns.map((column) => {
        const columnRows = rows.filter((row) => row.status === column || (column === 'Por valorar' && row.status === 'Nuevo / sin ronda'))
        return (
          <section className="kanban-column" key={column}>
            <h3>{column}</h3>
            {columnRows.length ? columnRows.map((row) => (
              <Link className="kanban-card" key={row.case.id} to={`/pacientes?documento=${row.patient.numero_identificacion}`}>
                <strong>{patientDisplayName(row.patient)}</strong>
                <span>{row.service?.nombre ?? row.case.ubicacion_actual ?? 'Sin servicio'} · {row.latestRound?.cama ?? row.case.cama_actual ?? 'Sin cama'}</span>
                <span>{treatmentSummary(row)}</span>
                <span>{row.maxTreatmentDay ? `Día ${row.maxTreatmentDay}` : 'Día no calculable'} · Última {formatDateTime(row.latestRound?.fecha_hora_ronda)}</span>
                {row.requiresFollowUp ? <span className="pill">Seguimiento</span> : null}
              </Link>
            )) : <p className="muted">Sin casos.</p>}
          </section>
        )
      })}
    </div>
  )
}
