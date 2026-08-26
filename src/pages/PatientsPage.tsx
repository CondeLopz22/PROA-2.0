import { useEffect, useState } from 'react'
import { AlertCircle, RefreshCw, Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { PatientWorkflow } from '../features/patients/PatientWorkflow'
import { useIps } from '../features/ips/ipsContext'
import { formatDate, formatDateTime } from '../lib/date'
import { getPatientDirectory, type PatientDirectoryRow } from '../services/operationalService'
import { patientDisplayName } from '../services/patientService'
import { treatmentName } from '../services/treatmentService'
import { readableError } from '../services/supabaseErrors'

const filters = ['Todos', 'Activos', 'Cerrados'] as const

export function PatientsPage() {
  const { activeIps } = useIps()
  const [params] = useSearchParams()
  const initialFilter = filters.includes(params.get('estado') as (typeof filters)[number]) ? (params.get('estado') as (typeof filters)[number]) : 'Todos'
  const [filter, setFilter] = useState<(typeof filters)[number]>(initialFilter)
  const [search, setSearch] = useState(params.get('documento') ?? '')
  const [rows, setRows] = useState<PatientDirectoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showLookup, setShowLookup] = useState(false)

  async function load() {
    if (!activeIps) return
    setLoading(true)
    setError(null)
    try {
      setRows(await getPatientDirectory(activeIps.id, filter, search))
    } catch (loadError) {
      setError(readableError(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIps?.id, filter])

  useEffect(() => {
    const nextFilter = filters.includes(params.get('estado') as (typeof filters)[number]) ? (params.get('estado') as (typeof filters)[number]) : filter
    if (nextFilter !== filter) setFilter(nextFilter)
    const documentParam = params.get('documento')
    if (documentParam && documentParam !== search) setSearch(documentParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Pacientes / Registros</p>
          <h1>Pacientes Registrados</h1>
          <p className="muted">Pacientes y casos visibles para la IPS activa. La búsqueda filtra, no bloquea la vista inicial.</p>
        </div>
        <button className="secondary-button" onClick={() => setShowLookup((value) => !value)} type="button">
          <Search size={17} />
          {showLookup ? 'Ocultar búsqueda avanzada' : 'Buscar / crear paciente'}
        </button>
      </section>

      {showLookup ? (
        <section className="panel">
          <PatientWorkflow mode="records" />
        </section>
      ) : null}

      {error ? <div className="alert error"><AlertCircle size={18} /> {error}</div> : null}

      <section className="panel">
        <div className="subsection-heading">
          <div>
            <h2>Registros</h2>
            <p className="muted">Activos, cerrados e históricos de la IPS activa.</p>
          </div>
          <button className="secondary-button" disabled={loading} onClick={load} type="button">
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>
        <div className="toolbar-row">
          <div className="segmented-control">
            {filters.map((item) => (
              <button className={filter === item ? 'selected' : ''} key={item} onClick={() => setFilter(item)} type="button">
                {item}
              </button>
            ))}
          </div>
          <form className="inline-form compact-search" onSubmit={(event) => { event.preventDefault(); load() }}>
            <label>
              Buscar
              <input placeholder="Identificación o nombre" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <button className="primary-button" type="submit">Filtrar</button>
          </form>
        </div>

        {loading ? <p className="muted">Cargando pacientes...</p> : null}
        {!loading && !rows.length ? <p className="muted">Sin pacientes visibles para los filtros actuales.</p> : null}
        {!loading && rows.length ? (
          <>
            <div className="table-wrap desktop-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Paciente</th>
                    <th>Identificación</th>
                    <th>Estado caso</th>
                    <th>Servicio actual/último</th>
                    <th>Antimicrobianos activos</th>
                    <th>Última ronda</th>
                    <th>Número de rondas</th>
                    <th>Apertura</th>
                    <th>Cierre</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.patient.id}>
                      <td><strong>{patientDisplayName(row.patient)}</strong></td>
                      <td>{row.patient.tipo_identificacion} {row.patient.numero_identificacion}</td>
                      <td><span className="pill">{row.activeCase ? 'Activo' : row.latestCase?.estado ?? 'Sin caso'}</span></td>
                      <td>{row.latestRound?.ubicacion ?? row.activeCase?.ubicacion_actual ?? row.latestCase?.ubicacion_actual ?? 'Sin registro'}</td>
                      <td>{row.activeTreatments.length ? row.activeTreatments.map(treatmentName).join(', ') : 'Sin activos'}</td>
                      <td>{formatDateTime(row.latestRound?.fecha_hora_ronda)}</td>
                      <td>{row.roundCount}</td>
                      <td>{formatDate(row.latestCase?.fecha_apertura)}</td>
                      <td>{formatDate(row.latestCase?.fecha_cierre)}</td>
                      <td><Link className="table-action" to={`/rondas?new=1`}>{row.activeCase ? 'Nueva ronda' : 'Valorar'}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-card-list">
              {rows.map((row) => (
                <article className="mobile-record-card" key={row.patient.id}>
                  <div className="mobile-card-header">
                    <strong>{patientDisplayName(row.patient)}</strong>
                    <span className="pill">{row.activeCase ? 'Activo' : row.latestCase?.estado ?? 'Sin caso'}</span>
                  </div>
                  <span>{row.patient.tipo_identificacion} {row.patient.numero_identificacion}</span>
                  <span>{row.latestRound?.ubicacion ?? row.activeCase?.ubicacion_actual ?? row.latestCase?.ubicacion_actual ?? 'Sin registro'}</span>
                  <span>{row.activeTreatments.length ? row.activeTreatments.map(treatmentName).join(', ') : 'Sin antimicrobianos activos'}</span>
                  <span>Última ronda: {formatDateTime(row.latestRound?.fecha_hora_ronda)} · Rondas: {row.roundCount}</span>
                  <span>Apertura: {formatDate(row.latestCase?.fecha_apertura)} · Cierre: {formatDate(row.latestCase?.fecha_cierre)}</span>
                  <Link className="primary-button mobile-card-action" to="/rondas?new=1">{row.activeCase ? 'Nueva ronda' : 'Valorar'}</Link>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </main>
  )
}
