import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertCircle, CalendarClock, ClipboardList, LayoutGrid, List, Microscope, Plus, RefreshCw, ShieldCheck, UserCheck } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { KanbanBoard, type KanbanColumn } from '../components/KanbanBoard'
import { useIps } from '../features/ips/ipsContext'
import { formatDateTime } from '../lib/date'
import {
  getActiveCasesCockpit,
  matchesOperationalFilter,
  operationalStatusRules,
  type ActiveCaseRow,
  type OperationalFilter,
  type OperationalStatus,
} from '../services/operationalService'
import { patientDisplayName } from '../services/patientService'
import { treatmentName } from '../services/treatmentService'
import { readableError } from '../services/supabaseErrors'
import { canWriteOperationalData } from '../services/permissionService'

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
  const { activeIps, userType } = useIps()
  const [searchParams] = useSearchParams()
  const canWrite = canWriteOperationalData(userType)
  const [rows, setRows] = useState<ActiveCaseRow[]>([])
  const [view, setView] = useState<'Matriz' | 'Kanban'>('Matriz')
  const [activeFilter, setActiveFilter] = useState<OperationalFilter>('Todos')
  const [selectedKanbanColumn, setSelectedKanbanColumn] = useState<OperationalStatus>('Por valorar')
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

  useEffect(() => {
    const filtro = searchParams.get('filtro') as OperationalFilter | null
    if (filtro) setActiveFilter(filtro)
  }, [searchParams])

  const kpis = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return {
      active: rows.length,
      followUp: rows.filter((row) => row.requiresFollowUp).length,
      roundsToday: rows.filter((row) => row.latestRound?.fecha_hora_ronda?.slice(0, 10) === today).length,
      pendingResponse: rows.filter((row) => row.status === 'Respuesta pendiente').length,
      microbiology: rows.filter((row) => row.status === 'Microbiología pendiente/relevante').length,
      auditOpen: rows.filter((row) => row.auditFindings.some((finding) => finding.estado === 'Abierto' || finding.estado === 'En seguimiento')).length,
      auditPriority: rows.filter((row) => row.auditFindings.some((finding) => finding.severidad === 'Prioritario' && (finding.estado === 'Abierto' || finding.estado === 'En seguimiento'))).length,
    }
  }, [rows])
  const filteredRows = useMemo(
    () => rows.filter((row) => matchesOperationalFilter(row, activeFilter)),
    [activeFilter, rows],
  )

  function toggleFilter(filter: OperationalFilter) {
    setActiveFilter((current) => (current === filter ? 'Todos' : filter))
  }

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
          {canWrite ? (
            <Link className="primary-button" to="/rondas?new=1">
              <Plus size={17} />
              Nueva valoración
            </Link>
          ) : null}
        </div>
      </section>

      {error ? <div className="alert error"><AlertCircle size={18} /> {error}</div> : null}

      <section className="metrics-grid compact-metrics">
        <Metric active={activeFilter === 'Todos'} icon={<UserCheck size={22} />} label="Pacientes activos" onClick={() => setActiveFilter('Todos')} value={kpis.active} />
        <Metric active={activeFilter === 'Seguimiento requerido'} icon={<CalendarClock size={22} />} label="Seguimiento requerido" onClick={() => toggleFilter('Seguimiento requerido')} value={kpis.followUp} />
        <Metric active={activeFilter === 'Rondas hoy'} icon={<ClipboardList size={22} />} label="Rondas hoy" onClick={() => toggleFilter('Rondas hoy')} value={kpis.roundsToday} />
        <Metric active={activeFilter === 'Respuesta pendiente'} icon={<RefreshCw size={22} />} label="Respuesta pendiente" onClick={() => toggleFilter('Respuesta pendiente')} value={kpis.pendingResponse} />
        <Metric active={activeFilter === 'Microbiología relevante'} icon={<Microscope size={22} />} label="Microbiología relevante" onClick={() => toggleFilter('Microbiología relevante')} value={kpis.microbiology} />
        <Metric active={activeFilter === 'Hallazgos abiertos'} icon={<ShieldCheck size={22} />} label="Hallazgos abiertos" onClick={() => toggleFilter('Hallazgos abiertos')} value={kpis.auditOpen} />
        <Metric active={activeFilter === 'Hallazgos prioritarios'} icon={<AlertCircle size={22} />} label="Prioritarios" onClick={() => toggleFilter('Hallazgos prioritarios')} value={kpis.auditPriority} />
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
        {activeFilter !== 'Todos' ? (
          <div className="active-filter-banner">
            <span>Filtro activo: {activeFilter}. Mostrando {filteredRows.length} de {rows.length} casos.</span>
            <button className="ghost-button" onClick={() => setActiveFilter('Todos')} type="button">Limpiar filtro</button>
          </div>
        ) : null}

        {loading ? <p className="muted">Cargando pacientes activos...</p> : null}
        {!loading && !rows.length ? (
          <div className="empty-state">
            <h2>Sin pacientes PROA activos</h2>
            <p>No existen casos activos para esta IPS en este momento.</p>
            {canWrite ? <Link className="primary-button" to="/rondas?new=1">+ Nueva valoración</Link> : null}
          </div>
        ) : null}
        {!loading && rows.length && !filteredRows.length ? <p className="muted">Sin casos para el filtro seleccionado.</p> : null}
        {!loading && filteredRows.length && view === 'Matriz' ? <ActiveMatrix rows={filteredRows} /> : null}
        {!loading && filteredRows.length && view === 'Kanban' ? (
          <OperationalKanban rows={filteredRows} selectedColumn={selectedKanbanColumn} setSelectedColumn={setSelectedKanbanColumn} />
        ) : null}
      </section>

      {!loading && filteredRows.some((row) => row.auditFindings.length) ? (
        <AuditMatrix rows={filteredRows} />
      ) : null}

      <section className="panel">
        <h2>Reglas de estado operativo</h2>
        <div className="subtle-list">
          {operationalStatusRules().map((rule) => <span key={rule}>{rule}</span>)}
        </div>
      </section>
    </main>
  )
}

function AuditMatrix({ rows }: { rows: ActiveCaseRow[] }) {
  const findings = rows.flatMap((row) =>
    row.auditFindings.map((finding) => ({ row, finding })),
  )
  if (!findings.length) return null
  return (
    <section className="panel">
      <div className="panel-title">
        <ShieldCheck size={20} />
        <div>
          <h2>Auditoría antimicrobiana</h2>
          <p>Condiciones que requieren revisión por el equipo PROA.</p>
        </div>
      </div>
      <div className="table-wrap desktop-table">
        <table className="data-table operational-table">
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Servicio</th>
              <th>Antimicrobiano</th>
              <th>AWaRe</th>
              <th>Hallazgo</th>
              <th>Prioridad</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {findings.map(({ row, finding }) => (
              <tr key={finding.hallazgo_id ?? finding.id}>
                <td><strong>{patientDisplayName(row.patient)}</strong></td>
                <td>{finding.servicio ?? row.service?.nombre ?? 'Sin servicio'}</td>
                <td>{finding.antimicrobiano ?? treatmentSummary(row)}</td>
                <td>{finding.aware_categoria ?? 'Sin clasificar'}</td>
                <td>{finding.tipo_hallazgo}</td>
                <td><span className="pill">{finding.severidad}</span></td>
                <td>{finding.estado}</td>
                <td><Link className="table-action" to={`/auditoria?hallazgo=${finding.hallazgo_id ?? finding.id}`}>Revisar</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-card-list">
        {findings.map(({ row, finding }) => (
          <Link className="mobile-record-card" key={finding.hallazgo_id ?? finding.id} to={`/auditoria?hallazgo=${finding.hallazgo_id ?? finding.id}`}>
            <div className="mobile-card-header">
              <strong>{patientDisplayName(row.patient)}</strong>
              <span className="pill">{finding.severidad}</span>
            </div>
            <span>{finding.tipo_hallazgo}</span>
            <span>{finding.antimicrobiano ?? treatmentSummary(row)} · {finding.aware_categoria ?? 'Sin AWaRe'}</span>
            <span>{finding.estado}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function Metric({ active, icon, label, value, onClick }: { active: boolean; icon: ReactNode; label: string; value: number; onClick: () => void }) {
  return (
    <button className={`metric-card metric-button ${active ? 'selected' : ''}`} onClick={onClick} type="button">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  )
}

export function ActiveMatrix({ rows }: { rows: ActiveCaseRow[] }) {
  return (
    <>
      <div className="table-wrap desktop-table">
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
      <div className="mobile-card-list patient-card-list">
        {rows.map((row) => (
          <Link className="mobile-record-card patient-active-card" key={row.case.id} to={`/pacientes?documento=${row.patient.numero_identificacion}`}>
            <div className="mobile-card-header">
              <strong>{patientDisplayName(row.patient)}</strong>
              <span className="pill">{row.status}</span>
            </div>
            <span>{row.patient.tipo_identificacion} {row.patient.numero_identificacion}</span>
            <span>{row.service?.nombre ?? row.case.ubicacion_actual ?? 'Sin servicio'} · {row.latestRound?.cama ?? row.case.cama_actual ?? 'Sin cama'}</span>
            <span>{treatmentSummary(row)}</span>
            <span>{row.maxTreatmentDay ? `Día ${row.maxTreatmentDay}` : 'Día no calculable'}</span>
            <span>{microbiologySummary(row)}</span>
            <span>Última ronda: {formatDateTime(row.latestRound?.fecha_hora_ronda)}</span>
            {row.requiresFollowUp ? <span className="pill">Seguimiento requerido</span> : null}
          </Link>
        ))}
      </div>
    </>
  )
}

export function OperationalKanban({
  rows,
  selectedColumn,
  setSelectedColumn,
}: {
  rows: ActiveCaseRow[]
  selectedColumn: OperationalStatus
  setSelectedColumn: (column: OperationalStatus) => void
}) {
  const columns: KanbanColumn<ActiveCaseRow>[] = kanbanColumns.map((column) => ({
    id: column,
    title: column,
    items: rows.filter((row) => row.status === column || (column === 'Por valorar' && row.status === 'Nuevo / sin ronda')),
  }))
  return (
    <>
      <div className="kanban-mobile-tabs" aria-label="Estados Kanban">
        {columns.map((column) => (
          <button
            className={selectedColumn === column.id ? 'selected' : ''}
            key={column.id}
            onClick={() => setSelectedColumn(column.id as OperationalStatus)}
            type="button"
          >
            {shortKanbanLabel(column.id)} ({column.items.length})
          </button>
        ))}
      </div>
      <KanbanBoard
        columns={columns}
        getKey={(row) => row.case.id}
        selectedColumnId={selectedColumn}
        renderCard={(row, columnId) => (
          <Link className={`kanban-card ${statusClass(columnId)}`} to={`/pacientes?documento=${row.patient.numero_identificacion}`}>
            <strong>{patientDisplayName(row.patient)}</strong>
            <span>{row.service?.nombre ?? row.case.ubicacion_actual ?? 'Sin servicio'} · {row.latestRound?.cama ?? row.case.cama_actual ?? 'Sin cama'}</span>
            <span>{treatmentSummary(row)}</span>
            <span>{row.maxTreatmentDay ? `Día ${row.maxTreatmentDay}` : 'Día no calculable'} · Última {formatDateTime(row.latestRound?.fecha_hora_ronda)}</span>
            {row.requiresFollowUp ? <span className="pill">Seguimiento</span> : null}
          </Link>
        )}
      />
    </>
  )
}

function shortKanbanLabel(status: string) {
  if (status === 'Microbiología pendiente/relevante') return 'Microbiología'
  if (status === 'Respuesta pendiente') return 'Pendiente'
  if (status === 'En seguimiento') return 'Seguimiento'
  return status
}

function statusClass(status: string) {
  if (status === 'Respuesta pendiente') return 'status-response'
  if (status === 'Microbiología pendiente/relevante') return 'status-microbiology'
  if (status === 'En seguimiento') return 'status-followup'
  if (status === 'Al día') return 'status-current'
  return 'status-pending'
}
