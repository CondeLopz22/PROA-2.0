import { useEffect, useState } from 'react'
import { AlertCircle, Plus, RefreshCw, Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { PatientWorkflow } from '../features/patients/PatientWorkflow'
import { useIps } from '../features/ips/ipsContext'
import { formatDateTime } from '../lib/date'
import { getRoundsActivity, matchesRoundContext, matchesRoundSearch, type RoundsActivityRow } from '../services/operationalService'
import { patientDisplayName } from '../services/patientService'
import { readableError } from '../services/supabaseErrors'
import { canWriteOperationalData } from '../services/permissionService'

const filters = ['Pendientes', 'Hoy', 'Borradores', 'Confirmadas', 'Todas'] as const

export function RoundsPage() {
  const { activeIps, userType } = useIps()
  const canWrite = canWriteOperationalData(userType)
  const [params, setParams] = useSearchParams()
  const initialFilter = filters.includes(params.get('filtro') as (typeof filters)[number]) ? (params.get('filtro') as (typeof filters)[number]) : 'Pendientes'
  const [filter, setFilter] = useState<(typeof filters)[number]>(initialFilter)
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [rows, setRows] = useState<RoundsActivityRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const creating = params.get('new') === '1'
  const contextualFilter = params.get('tipo') || params.get('intervencion')
  const visibleRows = rows.filter((row) => matchesRoundSearch(row, search) && matchesRoundContext(row, params))

  async function load() {
    if (!activeIps) return
    setLoading(true)
    setError(null)
    try {
      setRows(await getRoundsActivity(activeIps.id, filter))
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
    const nextFilter = filters.includes(params.get('filtro') as (typeof filters)[number]) ? (params.get('filtro') as (typeof filters)[number]) : filter
    if (nextFilter !== filter) setFilter(nextFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  return (
    <main className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Rondas PROA</p>
          <h1>Actividad de rondas</h1>
          <p className="muted">Borradores, pendientes y rondas confirmadas de la IPS activa.</p>
        </div>
        <div className="button-row">
          <button className="secondary-button" disabled={loading} onClick={load} type="button">
            <RefreshCw size={17} />
            Actualizar
          </button>
          {canWrite ? (
            <button className="primary-button" onClick={() => setParams({ new: creating ? '0' : '1' })} type="button">
              <Plus size={17} />
              {creating ? 'Ocultar nueva ronda' : 'Nueva ronda'}
            </button>
          ) : null}
        </div>
      </section>

      {creating && canWrite ? (
        <section className="panel">
          <h2>Nueva valoración</h2>
          <PatientWorkflow mode="round" />
        </section>
      ) : null}
      {creating && !canWrite ? (
        <div className="alert info">Tu perfil permite consultar rondas, pero no crear nuevas valoraciones.</div>
      ) : null}

      {error ? <div className="alert error"><AlertCircle size={18} /> {error}</div> : null}

      <section className="panel">
        <div className="subsection-heading">
          <div>
            <h2>Rondas</h2>
            <p className="muted">La búsqueda de paciente se abre solo al iniciar una nueva ronda.</p>
          </div>
          <div className="segmented-control">
            {filters.map((item) => (
              <button
                className={filter === item ? 'selected' : ''}
                key={item}
                onClick={() => {
                  setFilter(item)
                  const next = new URLSearchParams(params)
                  next.set('filtro', item)
                  next.delete('new')
                  setParams(next)
                }}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-row">
          <form className="inline-form compact-search" onSubmit={(event) => event.preventDefault()}>
            <label>
              Buscar rondas
              <div className="input-with-icon">
                <Search size={16} />
                <input
                  placeholder="Paciente, identificación, servicio o profesional"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </label>
          </form>
          {contextualFilter ? (
            <div className="active-filter-banner inline-filter">
              <span>Filtro contextual activo.</span>
              <button className="ghost-button" onClick={() => { setParams({ filtro: filter }); setSearch('') }} type="button">Limpiar</button>
            </div>
          ) : null}
        </div>
        {loading ? <p className="muted">Cargando rondas...</p> : null}
        {!loading && !rows.length ? <p className="muted">Sin rondas para el filtro seleccionado.</p> : null}
        {!loading && rows.length && !visibleRows.length ? <p className="muted">Sin rondas que coincidan con la búsqueda y filtros activos.</p> : null}
        {!loading && visibleRows.length ? (
          <>
            <div className="table-wrap desktop-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fecha/hora</th>
                    <th>Paciente</th>
                    <th>Servicio</th>
                    <th>Tipo valoración</th>
                    <th>Profesional</th>
                    <th>Intervención</th>
                    <th>Estado</th>
                    <th>Seguimiento</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.round.id}>
                      <td>{formatDateTime(row.round.fecha_hora_ronda)}</td>
                      <td>{row.patient ? patientDisplayName(row.patient) : 'Paciente no visible'}</td>
                      <td>{row.service?.nombre ?? row.round.ubicacion ?? 'Sin servicio'}</td>
                      <td>{row.round.tipo_valoracion ?? 'Sin registro'}</td>
                      <td>{row.professional?.nombre ?? 'Sin profesional'}</td>
                      <td>{row.intervention?.hubo_intervencion ? 'Sí' : 'No'}</td>
                      <td><span className="pill">{row.round.estado ?? 'Borrador'}</span></td>
                      <td>{row.intervention?.requiere_seguimiento ? 'Sí' : 'No'}</td>
                      <td><Link className="table-action" to={`/rondas/${row.round.id}`}>Abrir</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-card-list">
              {visibleRows.map((row) => (
                <Link className="mobile-record-card" key={row.round.id} to={`/rondas/${row.round.id}`}>
                  <div className="mobile-card-header">
                    <strong>{row.patient ? patientDisplayName(row.patient) : 'Paciente no visible'}</strong>
                    <span className="pill">{row.round.estado ?? 'Borrador'}</span>
                  </div>
                  <span>{formatDateTime(row.round.fecha_hora_ronda)}</span>
                  <span>{row.service?.nombre ?? row.round.ubicacion ?? 'Sin servicio'} · {row.round.tipo_valoracion ?? 'Sin registro'}</span>
                  <span>Profesional: {row.professional?.nombre ?? 'Sin profesional'}</span>
                  <span>Intervención: {row.intervention?.hubo_intervencion ? 'Sí' : 'No'} · Seguimiento: {row.intervention?.requiere_seguimiento ? 'Sí' : 'No'}</span>
                </Link>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </main>
  )
}
