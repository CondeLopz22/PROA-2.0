import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getAntimicrobialCatalog, catalogLabel } from '../../services/catalogService'
import { getIpsServices } from '../../services/ipsService'
import { buildDddTrend, getDddMartRows, type TrendPoint } from '../../services/analyticsService'
import { readableError } from '../../services/supabaseErrors'
import type { AntimicrobialCatalogItem, ServiceIps, UUID } from '../../types/domain'

function num(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined) return 'Pendiente'
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: digits }).format(value)
}

export default function DddAnalyticsPanel({ ipsId }: { ipsId: UUID }) {
  const [antimicrobials, setAntimicrobials] = useState<AntimicrobialCatalogItem[]>([])
  const [services, setServices] = useState<ServiceIps[]>([])
  const [antimicrobialId, setAntimicrobialId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [metric, setMetric] = useState<'ddd100' | 'ddd'>('ddd100')
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [catalog, serviceRows, martRows] = await Promise.all([
        getAntimicrobialCatalog(),
        getIpsServices(ipsId),
        getDddMartRows({ ipsId, antimicrobialId, serviceId }),
      ])
      setAntimicrobials(catalog)
      setServices(serviceRows)
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
  }, [ipsId, antimicrobialId, serviceId])

  const totals = useMemo(() => ({
    ddd: trend.reduce((sum, row) => sum + row.ddd, 0),
    grams: trend.reduce((sum, row) => sum + row.gramos, 0),
    latestDdd100: trend[trend.length - 1]?.ddd100 ?? null,
  }), [trend])

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

function Chart({ title, data, field }: { title: string; data: TrendPoint[]; field: keyof TrendPoint }) {
  return (
    <div className="chart-card">
      <h3>{title}</h3>
      <ResponsiveContainer height={260} width="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="periodo" minTickGap={24} />
          <YAxis />
          <Tooltip />
          <Line connectNulls dataKey={field} dot={false} stroke="#0f766e" strokeWidth={2} type="monotone" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
