import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, ClipboardCheck, RefreshCw } from 'lucide-react'
import { useIps } from '../features/ips/ipsContext'
import { getDataQualityIssues, type QualityIssue } from '../services/dataQualityService'
import { readableError } from '../services/supabaseErrors'

export function DataQualityPage() {
  const { activeIps } = useIps()
  const [issues, setIssues] = useState<QualityIssue[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIps?.id])

  return (
    <main className="page round-form-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Calidad de datos</p>
          <h1>Control técnico del piloto</h1>
          <p className="muted">Revisión básica de inconsistencias visibles por RLS para la IPS activa.</p>
        </div>
        <button className="secondary-button" disabled={loading} onClick={load} type="button">
          <RefreshCw size={17} />
          Actualizar
        </button>
      </section>

      {error ? <div className="alert error"><AlertCircle size={18} /> {error}</div> : null}

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
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Regla</th>
                  <th>Conteo</th>
                  <th>Severidad</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.code}>
                    <td>{issue.code}</td>
                    <td>{issue.label}</td>
                    <td>{issue.count}</td>
                    <td><span className="pill">{issue.severity}</span></td>
                    <td>{issue.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {!loading && issues.every((issue) => issue.count === 0) ? (
          <div className="alert success">
            <CheckCircle2 size={18} />
            Sin hallazgos en las reglas básicas.
          </div>
        ) : null}
      </section>
    </main>
  )
}
