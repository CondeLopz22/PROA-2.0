import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LineChart, Line, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getAntimicrobialCatalog, catalogLabel } from '../../services/catalogService'
import { getIpsServices } from '../../services/ipsService'
import { buildAwareSummary, buildDddTrend, getDddMartRows, type AwareSummary, type DddMartRow, type TrendPoint } from '../../services/analyticsService'
import { readableError } from '../../services/supabaseErrors'
import type { AntimicrobialCatalogItem, ServiceIps, UUID } from '../../types/domain'

function num(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined) return 'Pendiente'
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: digits }).format(value)
}

export default function DddAnalyticsPanel({ ipsId }: { ipsId: UUID }) {
  const [searchParams] = useSearchParams()
  const [antimicrobials, setAntimicrobials] = useState<AntimicrobialCatalogItem[]>([])
  const [services, setServices] = useState<ServiceIps[]>([])
  const [antimicrobialId, setAntimicrobialId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [awareCategory, setAwareCategory] = useState(searchParams.get('aware') ?? '')
  const [metric, setMetric] = useState<'ddd100' | 'ddd'>('ddd100')
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [martRows, setMartRows] = useState<DddMartRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [catalog, serviceRows, martRows] = await Promise.all([
        getAntimicrobialCatalog(),
        getIpsServices(ipsId),
        getDddMartRows({ ipsId, antimicrobialId, serviceId, awareCategory }),
      ])
      setAntimicrobials(catalog)
      setServices(serviceRows)
      setMartRows(martRows)
      setTrend(buildDddTrend(martRows))
    } catch (loadError) {
      setError(readableError(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ipsId, antimicrobialId, serviceId, awareCategory])

  useEffect(() => {
    setAwareCategory(searchParams.get('aware') ?? '')
  }, [searchParams])

  const totals = useMemo(() => ({
    ddd: trend.reduce((sum, row) => sum + row.ddd, 0),
    grams: trend.reduce((sum, row) => sum + row.gramos, 0),
    latestDdd100: trend[trend.length - 1]?.ddd100 ?? null,
  }), [trend])
  const aware = useMemo(() => buildAwareSummary(martRows), [martRows])

  return (
    <article className="panel analytics-panel">
      <div className="panel-title">
        <div>
          <h2>Analítica DDD</h2>
          <p>Fuente `mart_ddd`. Gramos consumidos normalizados y DDD calculadas por Supabase.</p>
        </div>
      </div>
      {error ? <div className="alert error">{error}</div> : null}
      <div className="metrics-grid compact-metrics">
        <Summary label="DDD total" value={num(totals.ddd)} />
        <Summary label="DDD/100 camas-día" value={num(totals.latestDdd100)} />
        <Summary label="Gramos consumidos" value={num(totals.grams)} />
        <Summary label="Periodos" value={String(trend.length)} />
      </div>
      <AwareKpis aware={aware} />
      <div className="toolbar-row">
        <label>
          Antimicrobiano
          <select value={antimicrobialId} onChange={(event) => setAntimicrobialId(event.target.value)}>
            <option value="">Todos</option>
            {antimicrobials.map((item) => <option key={item.id} value={item.id}>{catalogLabel(item)}</option>)}
          </select>
        </label>
        <label>
          Servicio
          <select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
            <option value="">Todos</option>
            {services.map((service) => <option key={service.id} value={service.id}>{service.nombre}</option>)}
          </select>
        </label>
        <label>
          AWaRe
          <select value={awareCategory} onChange={(event) => setAwareCategory(event.target.value)}>
            <option value="">Todas</option>
            <option value="Access">Access</option>
            <option value="Watch">Watch</option>
            <option value="Reserve">Reserve</option>
            <option value="No aplica">No aplica</option>
            <option value="Sin clasificar">Sin clasificar</option>
          </select>
        </label>
        <div className="segmented-control">
          <button className={metric === 'ddd100' ? 'selected' : ''} onClick={() => setMetric('ddd100')} type="button">DDD100</button>
          <button className={metric === 'ddd' ? 'selected' : ''} onClick={() => setMetric('ddd')} type="button">DDD total</button>
        </div>
      </div>
      {loading ? <p className="muted">Cargando MART DDD...</p> : null}
      {!loading && !trend.length ? <p className="muted">Sin datos DDD visibles para los filtros actuales.</p> : null}
      {trend.length ? (
        <div className="chart-grid">
          <Chart title={metric === 'ddd100' ? 'DDD/100 camas-día' : 'DDD total'} data={trend} field={metric} />
          <Chart title="Gramos consumidos" data={trend} field="gramos" />
        </div>
      ) : null}
      {martRows.length ? <AwareBreakdown aware={aware} /> : null}
    </article>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function AwareKpis({ aware }: { aware: AwareSummary }) {
  return (
    <div className="metrics-grid compact-metrics">
      <Summary label="DDD Access" value={num(aware.accessDdd)} />
      <Summary label="DDD Watch" value={num(aware.watchDdd)} />
      <Summary label="DDD Reserve" value={num(aware.reserveDdd)} />
      <Summary label="% Access" value={aware.accessPercent === null ? 'Pendiente' : `${num(aware.accessPercent, 1)}%`} />
    </div>
  )
}

function AwareBreakdown({ aware }: { aware: AwareSummary }) {
  return (
    <section className="aware-section">
      <div className="subsection-heading">
        <div>
          <h3>Clasificación WHO AWaRe</h3>
          <p className="muted">% Access excluye No aplica y Sin clasificar del denominador.</p>
        </div>
      </div>
      <div className="chart-grid">
        <div className="chart-card">
          <h3>Distribución AWaRe</h3>
          <MiniBars rows={aware.distribution.map((row) => ({ label: row.label, value: row.value }))} />
        </div>
        <div className="chart-card">
          <h3>Desglose por antimicrobiano</h3>
          <MiniBars rows={aware.byAntimicrobial.map((row) => ({ label: `${row.label} · ${row.category}`, value: row.value }))} />
        </div>
      </div>
      <div className="chart-card">
        <h3>Tendencia AWaRe</h3>
        <ResponsiveContainer height={260} width="100%">
          <LineChart data={aware.trend}>
            <CartesianGrid stroke="#d7e2e6" strokeDasharray="3 3" />
            <XAxis dataKey="periodo" minTickGap={24} />
            <YAxis />
            <Tooltip />
            <Line connectNulls dataKey="Access" dot={false} stroke="#2f855a" strokeWidth={2.4} type="monotone" />
            <Line connectNulls dataKey="Watch" dot={false} stroke="#c27803" strokeWidth={2.4} type="monotone" />
            <Line connectNulls dataKey="Reserve" dot={false} stroke="#b42318" strokeWidth={2.4} type="monotone" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function MiniBars({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const max = Math.max(...rows.map((row) => row.value), 1)
  if (!rows.length) return <p className="muted">Sin datos AWaRe para los filtros actuales.</p>
  return (
    <div className="mini-bars">
      {rows.map((row) => (
        <div className="mini-bar-row" key={row.label}>
          <span>{row.label}</span>
          <div><strong style={{ width: `${Math.max((row.value / max) * 100, 4)}%` }} /></div>
          <em>{num(row.value)}</em>
        </div>
      ))}
    </div>
  )
}

function Chart({ title, data, field }: { title: string; data: TrendPoint[]; field: keyof TrendPoint }) {
  return (
    <div className="chart-card">
      <h3>{title}</h3>
      <ResponsiveContainer height={260} width="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="#d7e2e6" strokeDasharray="3 3" />
          <XAxis dataKey="periodo" minTickGap={24} />
          <YAxis />
          <Tooltip />
          <Line connectNulls dataKey={field} dot={false} stroke={field === 'gramos' ? '#1D5B7A' : '#123B5D'} strokeWidth={2.4} type="monotone" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
