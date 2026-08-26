import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, ClipboardCheck, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useIps } from '../features/ips/ipsContext'
import {
  calculateQualityScore,
  getDataQualityIssues,
  getQualityIssueDetails,
  type QualityIssue,
  type QualityIssueDetail,
} from '../services/dataQualityService'
import { readableError } from '../services/supabaseErrors'

export function DataQualityPage() {
  const { activeIps } = useIps()
  const [issues, setIssues] = useState<QualityIssue[]>([])
  const [loading, setLoading] = useState(false)
  const [details, setDetails] = useState<{ issue: QualityIssue; rows: QualityIssueDetail[] } | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const score = calculateQualityScore(issues)
  const scoreValue = score ?? 0
  const scoreTone = score === null ? 'unknown' : score >= 90 ? 'good' : score >= 75 ? 'watch' : 'risk'

  async function load() {
    if (!activeIps) return
    setLoading(true)
    setError(null)
    try {
      setIssues(await getDataQualityIssues(activeIps.id))
    } catch (loadError) {
      setError(readableError(loadError))
    } finally {
      setLoading(false)
    }
  }

  async function reviewIssue(issue: QualityIssue) {
    if (!activeIps) return
    setLoadingDetails(true)
    setError(null)
    try {
      const rows = await getQualityIssueDetails(activeIps.id, issue.code)
      if (!rows.length && issue.reviewPath) {
        setDetails({ issue, rows: [{ id: issue.code, label: issue.label, context: 'Abrir módulo relacionado', reviewPath: issue.reviewPath }] })
      } else {
        setDetails({ issue, rows })
      }
    } catch (detailError) {
      setError(readableError(detailError))
    } finally {
      setLoadingDetails(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIps?.id])

  return (
    <main className="page round-form-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Calidad de datos</p>
          <h1>Calidad de Datos</h1>
          <p className="muted">Revisión básica de inconsistencias visibles por RLS para la IPS activa.</p>
        </div>
        <button className="secondary-button" disabled={loading} onClick={load} type="button">
          <RefreshCw size={17} />
          Actualizar
        </button>
      </section>

      {error ? <div className="alert error"><AlertCircle size={18} /> {error}</div> : null}

      <section className="metrics-grid compact-metrics">
        <article className="metric-card">
          <span>Calidad global</span>
          <strong>{score === null ? 'Pendiente' : `${score.toFixed(1)}%`}</strong>
          <div className={`quality-progress ${scoreTone}`} aria-label="Progreso visual de calidad de datos">
            <span style={{ width: `${Math.max(0, Math.min(scoreValue, 100))}%` }} />
          </div>
        </article>
        <article className="metric-card">
          <span>Reglas evaluadas</span>
          <strong>{issues.length}</strong>
        </article>
        <article className="metric-card">
          <span>Hallazgos abiertos</span>
          <strong>{issues.reduce((sum, issue) => sum + issue.count, 0)}</strong>
        </article>
      </section>

      <section className="panel">
        <div className="panel-title">
          <ClipboardCheck size={20} />
          <div>
            <h2>Hallazgos</h2>
            <p>Conteos para orientar corrección antes de análisis en Looker.</p>
          </div>
        </div>
        {loading ? <p className="muted">Consultando calidad...</p> : null}
        {!loading && issues.length ? (
          <>
            <div className="table-wrap desktop-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Regla</th>
                    <th>Conteo</th>
                    <th>Evaluados</th>
                    <th>Severidad</th>
                    <th>Detalle</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue) => (
                    <tr key={issue.code}>
                      <td>{issue.code}</td>
                      <td>{issue.label}</td>
                      <td>{issue.count}</td>
                      <td>{issue.evaluated ?? 'N/A'}</td>
                      <td><span className="pill">{issue.severity}</span></td>
                      <td>{issue.detail}</td>
                      <td>
                        {issue.reviewPath ? (
                          <button className="table-action button-link" disabled={loadingDetails} onClick={() => reviewIssue(issue)} type="button">
                            Revisar
                          </button>
                        ) : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-card-list">
              {issues.map((issue) => (
                <article className="mobile-record-card" key={issue.code}>
                  <div className="mobile-card-header">
                    <strong>{issue.code}</strong>
                    <span className="pill">{issue.severity}</span>
                  </div>
                  <span>{issue.label}</span>
                  <span>Conteo: {issue.count} · Evaluados: {issue.evaluated ?? 'N/A'}</span>
                  <span>{issue.detail}</span>
                  {issue.reviewPath ? (
                    <button className="secondary-button mobile-card-action" disabled={loadingDetails} onClick={() => reviewIssue(issue)} type="button">
                      Revisar
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          </>
        ) : null}
        {!loading && issues.every((issue) => issue.count === 0) ? (
          <div className="alert success">
            <CheckCircle2 size={18} />
            Sin hallazgos en las reglas básicas.
          </div>
        ) : null}
      </section>

      {details ? (
        <section className="panel">
          <div className="subsection-heading">
            <div>
              <h2>{details.issue.label}</h2>
              <p className="muted">Registros responsables visibles por RLS para auditoría y corrección.</p>
            </div>
            <button className="secondary-button" onClick={() => setDetails(null)} type="button">Cerrar</button>
          </div>
          {loadingDetails ? <p className="muted">Cargando registros...</p> : null}
          {!loadingDetails && !details.rows.length ? <p className="muted">No se encontraron registros puntuales para esta regla.</p> : null}
          {!loadingDetails && details.rows.length ? (
            <>
              <div className="table-wrap desktop-table">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Registro</th>
                      <th>Contexto</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.rows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.label}</td>
                        <td>{row.context ?? 'Sin contexto'}</td>
                        <td><Link className="table-action" to={row.reviewPath}>Abrir</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mobile-card-list">
                {details.rows.map((row) => (
                  <Link className="mobile-record-card" key={row.id} to={row.reviewPath}>
                    <strong>{row.label}</strong>
                    <span>{row.context ?? 'Sin contexto'}</span>
                    <span className="table-action">Abrir</span>
                  </Link>
                ))}
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </main>
  )
}
