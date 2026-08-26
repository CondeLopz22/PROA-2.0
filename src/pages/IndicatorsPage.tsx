import { useEffect, useState } from 'react'
import { AlertCircle, BarChart3, RefreshCw } from 'lucide-react'
import { useIps } from '../features/ips/ipsContext'
import { getNativeIndicators, type NativeIndicators } from '../services/analyticsService'
import { readableError } from '../services/supabaseErrors'

function number(value: number | null, digits = 1) {
  if (value === null) return 'Pendiente'
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: digits }).format(value)
}

export function IndicatorsPage() {
  const { activeIps } = useIps()
  const [data, setData] = useState<NativeIndicators | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!activeIps) return
    setLoading(true)
    setError(null)
    try {
      setData(await getNativeIndicators(activeIps.id))
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
    <main className="page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Indicadores</p>
          <h1>Analítica operacional nativa</h1>
          <p className="muted">KPIs frecuentes desde MARTs. Looker queda para exploración profunda e informes compartibles.</p>
        </div>
        <button className="secondary-button" disabled={loading} onClick={load} type="button">
          <RefreshCw size={17} />
          Actualizar
        </button>
      </section>
      {error ? <div className="alert error"><AlertCircle size={18} /> {error}</div> : null}
      {loading ? <section className="panel">Cargando indicadores...</section> : null}
      {!loading && !data ? <section className="panel empty-state">Sin datos analíticos visibles.</section> : null}
      {data ? (
        <section className="indicator-grid">
          <IndicatorSection
            title="Actividad"
            kpis={[
              ['Casos activos', data.activity.activeCases],
              ['Rondas', data.activity.rounds],
              ['Primeras valoraciones', data.activity.firstRounds],
              ['Seguimientos', data.activity.followUps],
            ]}
          />
          <IndicatorSection
            title="Intervenciones"
            kpis={[
              ['Total intervenciones', data.interventions.total],
              ['Rondas con intervención', data.interventions.roundsWithIntervention],
              ['% aceptación', data.interventions.acceptanceRate],
            ]}
            bars={data.interventions.byType}
          />
          <IndicatorSection
            title="Microbiología"
            kpis={[
              ['Muestras', data.microbiology.samples],
              ['% positividad', data.microbiology.positivityRate],
              ['Con resistencia', data.microbiology.withResistance],
            ]}
            bars={data.microbiology.organisms}
          />
          <IndicatorSection
            title="Antimicrobianos"
            kpis={[
              ['DDD', data.antimicrobials.totalDdd],
              ['DDD100 último periodo', data.antimicrobials.latestDdd100],
              ['Gramos consumidos', data.antimicrobials.totalGrams],
            ]}
          />
        </section>
      ) : null}
    </main>
  )
}

function IndicatorSection({
  title,
  kpis,
  bars = [],
}: {
  title: string
  kpis: Array<[string, number | null]>
  bars?: Array<{ label: string; value: number }>
}) {
  return (
    <article className="panel">
      <div className="panel-title">
        <BarChart3 size={20} />
        <div>
          <h2>{title}</h2>
          <p>Datos reales visibles por RLS.</p>
        </div>
      </div>
      <div className="metrics-grid compact-metrics">
        {kpis.map(([label, value]) => (
          <div className="summary-item" key={label}>
            <span>{label}</span>
            <strong>{number(value)}</strong>
          </div>
        ))}
      </div>
      {bars.length ? (
        <div className="mini-bars">
          {bars.map((bar) => (
            <div className="mini-bar-row" key={bar.label}>
              <span>{bar.label}</span>
              <div><strong style={{ width: `${Math.min(bar.value * 12, 100)}%` }} /></div>
              <em>{bar.value}</em>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  )
}
