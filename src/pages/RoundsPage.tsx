import { useEffect, useState } from 'react'
import { AlertCircle, Plus, RefreshCw } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { PatientWorkflow } from '../features/patients/PatientWorkflow'
import { useIps } from '../features/ips/ipsContext'
import { formatDateTime } from '../lib/date'
import { getRoundsActivity, type RoundsActivityRow } from '../services/operationalService'
import { patientDisplayName } from '../services/patientService'
import { readableError } from '../services/supabaseErrors'

const filters = ['Pendientes', 'Hoy', 'Borradores', 'Confirmadas', 'Todas'] as const

export function RoundsPage() {
  const { activeIps } = useIps()
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<(typeof filters)[number]>('Pendientes')
  const [rows, setRows] = useState<RoundsActivityRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const creating = params.get('new') === '1'

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
          <button className="primary-button" onClick={() => setParams({ new: creating ? '0' : '1' })} type="button">
            <Plus size={17} />
            {creating ? 'Ocultar nueva ronda' : 'Nueva ronda'}
          </button>
        </div>
      </section>

      {creating ? (
        <section className="panel">
          <h2>Nueva valoración</h2>
          <PatientWorkflow mode="round" />
        </section>
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
              <button className={filter === item ? 'selected' : ''} key={item} onClick={() => setFilter(item)} type="button">
                {item}
              </button>
            ))}
          </div>
        </div>
        {loading ? <p className="muted">Cargando rondas...</p> : null}
        {!loading && !rows.length ? <p className="muted">Sin rondas para el filtro seleccionado.</p> : null}
        {!loading && rows.length ? (
          <div className="table-wrap">
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
                {rows.map((row) => (
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
        ) : null}
      </section>
    </main>
  )
}
