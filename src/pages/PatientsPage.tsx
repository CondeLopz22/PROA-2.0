import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowDownUp, FolderOpen, LayoutGrid, List, Plus, RefreshCw, Search } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PatientWorkflow } from '../features/patients/PatientWorkflow'
import { useIps } from '../features/ips/ipsContext'
import { formatDateTime } from '../lib/date'
import { getPatientDirectory, type PatientDirectoryRow, type PatientWorkflowState } from '../services/operationalService'
import { patientDisplayName } from '../services/patientService'
import { canWriteOperationalData } from '../services/permissionService'
import { startCaseRound } from '../services/roundService'
import { readableError } from '../services/supabaseErrors'
import { treatmentName } from '../services/treatmentService'

const filters = ['Todos', 'Activos', 'Cerrados'] as const
const workflowColumns: PatientWorkflowState[] = ['Primera valoración', 'Seguimiento activo', 'Caso cerrado', 'Sin caso']

export function PatientsPage() {
  const { activeIps, userType } = useIps()
  const canWrite = canWriteOperationalData(userType)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const filter = filters.includes(params.get('estado') as (typeof filters)[number]) ? (params.get('estado') as (typeof filters)[number]) : 'Todos'
  const view = params.get('vista') === 'kanban' ? 'kanban' : 'lista'
  const order = params.get('orden') === 'antigua' ? 'antigua' : 'reciente'
  const appliedSearch = params.get('q') ?? params.get('documento') ?? ''
  const [search, setSearch] = useState(appliedSearch)
  const [rows, setRows] = useState<PatientDirectoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showLookup, setShowLookup] = useState(false)
  const [startingPatientId, setStartingPatientId] = useState<string | null>(null)

  function updateParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params)
    Object.entries(updates).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key))
    next.delete('documento')
    setParams(next, { replace: true })
  }

  async function startPatientRound(row: PatientDirectoryRow) {
    if (!activeIps || !canWrite) return
    setStartingPatientId(row.patient.id)
    setError(null)
    try {
      const result = await startCaseRound({
        ipsId: activeIps.id,
        patientId: row.patient.id,
        caseId: row.activeCase?.id ?? null,
        serviceId: row.latestRound?.servicio_id ?? null,
        bed: row.latestRound?.cama ?? row.activeCase?.cama_actual ?? null,
      })
      navigate(`/rondas/${result.round.id}`)
    } catch (startError) {
      setError(readableError(startError, 'rondas_proa'))
    } finally {
      setStartingPatientId(null)
    }
  }

  async function load() {
    if (!activeIps) return
    setLoading(true)
    setError(null)
    try {
      setRows(await getPatientDirectory(activeIps.id, filter, appliedSearch))
    } catch (loadError) {
      setError(readableError(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => setSearch(appliedSearch), [appliedSearch])
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIps?.id, filter, appliedSearch])

  const orderedRows = useMemo(() => [...rows].sort((a, b) => {
    const left = new Date(a.lastActivityAt ?? 0).getTime()
    const right = new Date(b.lastActivityAt ?? 0).getTime()
    return order === 'reciente' ? right - left : left - right
  }), [order, rows])

  return (
    <main className="page patients-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Gestión clínica PROA</p>
          <h1>Pacientes Registrados</h1>
          <p className="muted">Seguimiento longitudinal de {activeIps?.nombre ?? 'la IPS activa'}, sin cruces entre instituciones.</p>
        </div>
        {canWrite ? <button className="secondary-button" onClick={() => setShowLookup((value) => !value)} type="button"><Plus size={17} />{showLookup ? 'Cerrar nueva valoración' : 'Nueva valoración'}</button> : null}
      </section>

      {showLookup && canWrite ? <section className="panel"><PatientWorkflow mode="records" /></section> : null}
      {error ? <div className="alert error"><AlertCircle size={18} /> {error}</div> : null}

      <section className="panel patient-directory-panel">
        <div className="subsection-heading">
          <div><h2>Población visible</h2><p className="muted">Alterna entre lista y Kanban sin perder búsqueda ni filtros.</p></div>
          <button className="secondary-button" disabled={loading} onClick={load} type="button"><RefreshCw size={16} /> Actualizar</button>
        </div>
        <div className="patient-directory-toolbar">
          <div className="segmented-control" aria-label="Estado del caso">
            {filters.map((item) => <button className={filter === item ? 'selected' : ''} key={item} onClick={() => updateParams({ estado: item === 'Todos' ? null : item })} type="button">{item}</button>)}
          </div>
          <form className="patient-search" onSubmit={(event) => { event.preventDefault(); updateParams({ q: search.trim() || null }) }}>
            <label><span>Buscar paciente</span><span className="input-with-icon"><Search size={17} /><input placeholder="Nombre o identificación" value={search} onChange={(event) => setSearch(event.target.value)} /></span></label>
            <button className="primary-button" type="submit">Buscar</button>
            {appliedSearch ? <button className="ghost-button" onClick={() => { setSearch(''); updateParams({ q: null }) }} type="button">Limpiar</button> : null}
          </form>
          <div className="directory-view-controls">
            <button aria-label="Ordenar por actividad" className="ghost-button" onClick={() => updateParams({ orden: order === 'reciente' ? 'antigua' : null })} type="button"><ArrowDownUp size={16} /> {order === 'reciente' ? 'Más recientes' : 'Más antiguos'}</button>
            <div className="segmented-control" aria-label="Vista de pacientes">
              <button aria-label="Vista lista" className={view === 'lista' ? 'selected' : ''} onClick={() => updateParams({ vista: null })} type="button"><List size={17} /> Lista</button>
              <button aria-label="Vista Kanban" className={view === 'kanban' ? 'selected' : ''} onClick={() => updateParams({ vista: 'kanban' })} type="button"><LayoutGrid size={17} /> Kanban</button>
            </div>
          </div>
        </div>
        {loading ? <p className="muted">Cargando pacientes...</p> : null}
        {!loading && !orderedRows.length ? <div className="empty-state"><h3>Sin registros</h3><p>No hay pacientes para los filtros actuales en esta IPS.</p></div> : null}
        {!loading && orderedRows.length && view === 'lista' ? <PatientList rows={orderedRows} canWrite={canWrite} startingPatientId={startingPatientId} onStartRound={startPatientRound} /> : null}
        {!loading && orderedRows.length && view === 'kanban' ? <PatientKanban rows={orderedRows} canWrite={canWrite} startingPatientId={startingPatientId} onStartRound={startPatientRound} /> : null}
      </section>
    </main>
  )
}

type PatientCollectionProps = { rows: PatientDirectoryRow[]; canWrite: boolean; startingPatientId: string | null; onStartRound: (row: PatientDirectoryRow) => void }

function PatientList({ rows, canWrite, startingPatientId, onStartRound }: PatientCollectionProps) {
  return <><div className="table-wrap desktop-table"><table className="data-table patient-directory-table"><thead><tr><th>Paciente</th><th>Estado</th><th>Servicio</th><th>Antimicrobianos</th><th>Microbiología</th><th>Última decisión PROA</th><th>Última actividad</th><th>Acciones</th></tr></thead><tbody>{rows.map((row) => <tr key={row.patient.id}><td><Link className="patient-name-link" to={`/pacientes/${row.patient.id}`}><strong>{patientDisplayName(row.patient)}</strong><small>{row.patient.tipo_identificacion} {row.patient.numero_identificacion}</small></Link></td><td><span className={`status-badge ${workflowClass(row.workflowState)}`}>{row.workflowState}</span></td><td>{serviceSummary(row)}</td><td>{treatmentSummary(row)}</td><td>{microbiologySummary(row)}</td><td>{decisionSummary(row)}</td><td>{formatDateTime(row.lastActivityAt)}</td><td><PatientActions row={row} canWrite={canWrite} starting={startingPatientId === row.patient.id} onStartRound={onStartRound} /></td></tr>)}</tbody></table></div><div className="mobile-card-list">{rows.map((row) => <PatientCard key={row.patient.id} row={row} canWrite={canWrite} starting={startingPatientId === row.patient.id} onStartRound={onStartRound} />)}</div></>
}

function PatientKanban({ rows, canWrite, startingPatientId, onStartRound }: PatientCollectionProps) {
  return <div className="patient-kanban" aria-label="Kanban de pacientes">{workflowColumns.map((column) => { const items = rows.filter((row) => row.workflowState === column); return <section className="patient-kanban-column" key={column}><header><h3>{column}</h3><span>{items.length}</span></header><div>{items.length ? items.map((row) => <PatientCard key={row.patient.id} row={row} canWrite={canWrite} starting={startingPatientId === row.patient.id} onStartRound={onStartRound} />) : <p className="muted">Sin pacientes.</p>}</div></section> })}</div>
}

function PatientCard({ row, canWrite, starting, onStartRound }: { row: PatientDirectoryRow; canWrite: boolean; starting: boolean; onStartRound: (row: PatientDirectoryRow) => void }) {
  return <article className={`patient-clinical-card ${workflowClass(row.workflowState)}`}><div className="patient-card-heading"><div><strong>{patientDisplayName(row.patient)}</strong><span>{row.patient.tipo_identificacion} {row.patient.numero_identificacion}</span></div><span className="status-badge">{row.workflowState}</span></div><dl><div><dt>Servicio</dt><dd>{serviceSummary(row)}</dd></div><div><dt>Antimicrobianos</dt><dd>{treatmentSummary(row)}</dd></div><div><dt>Microbiología</dt><dd>{microbiologySummary(row)}</dd></div><div><dt>Última decisión</dt><dd>{decisionSummary(row)}</dd></div><div><dt>Última valoración</dt><dd>{formatDateTime(row.latestRound?.fecha_hora_ronda)}</dd></div></dl><PatientActions row={row} canWrite={canWrite} starting={starting} onStartRound={onStartRound} /></article>
}

function PatientActions({ row, canWrite, starting, onStartRound }: { row: PatientDirectoryRow; canWrite: boolean; starting: boolean; onStartRound: (row: PatientDirectoryRow) => void }) {
  return <div className="patient-card-actions"><Link className="secondary-button" to={`/pacientes/${row.patient.id}`}><FolderOpen size={16} /> Expediente</Link>{canWrite ? <button className="button-link" disabled={starting} onClick={() => onStartRound(row)} type="button">{starting ? 'Abriendo...' : row.latestActiveCaseRound?.estado === 'Borrador' ? 'Continuar borrador' : row.activeCase ? 'Nueva ronda' : 'Nuevo caso'}</button> : null}</div>
}

function treatmentSummary(row: PatientDirectoryRow) { return row.activeTreatments.length ? row.activeTreatments.map(treatmentName).join(', ') : 'Sin activos' }
function serviceSummary(row: PatientDirectoryRow) { return row.service?.nombre ?? row.latestRound?.ubicacion ?? row.activeCase?.ubicacion_actual ?? row.latestCase?.ubicacion_actual ?? 'Sin registro' }
function microbiologySummary(row: PatientDirectoryRow) { const item = row.latestMicrobiology; return item ? [item.microorganismo, item.tipo_muestra, item.resultado_general].filter(Boolean).join(' · ') : 'Sin estudio relacionado' }
function decisionSummary(row: PatientDirectoryRow) { const item = row.latestIntervention; if (!item) return 'Sin decisión registrada'; return item.hubo_intervencion ? item.descripcion_recomendacion ?? item.recomendacion ?? item.tipo_intervencion ?? 'Intervención registrada' : item.motivo_no_intervencion ?? 'Sin intervención' }
function workflowClass(state: PatientWorkflowState) { if (state === 'Primera valoración') return 'state-assessment'; if (state === 'Seguimiento activo') return 'state-followup'; if (state === 'Caso cerrado') return 'state-closed'; return 'state-empty' }
