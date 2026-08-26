import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { AlertCircle, BarChart3, BedDouble, CheckCircle2, ClipboardCheck, Database, Plus, Save, Trash2 } from 'lucide-react'
import { useAuth } from '../features/auth/authContext'
import { useIps } from '../features/ips/ipsContext'
import { formatDate } from '../lib/date'
import { getAntimicrobialCatalog, catalogLabel } from '../services/catalogService'
import {
  calculateGrams,
  calculateOccupancy,
  confirmDddRecord,
  consumptionDraftFromRow,
  dddDataStatus,
  daysInMonth,
  emptyConsumptionDraft,
  getDddConsumptions,
  getDddSummary,
  getOmsDdd,
  monthStart,
  openDddRecord,
  saveDddConsumption,
  toNumber,
  updateDddRecord,
  type DddConsumptionDraft,
  type DddRecordDraft,
  type DddSummaryRow,
} from '../services/dddService'
import { getIpsServices } from '../services/ipsService'
import { readableError } from '../services/supabaseErrors'
import type { AntimicrobialCatalogItem, DddConsumption, DddRecord, ServiceIps } from '../types/domain'

const routes = ['IV', 'VO', 'IM', 'SC', 'Inhalada', 'Tópica'] as const
const DddAnalyticsPanel = lazy(() => import('../features/ddd/DddAnalyticsPanel'))

function numberLabel(value?: string | number | null, digits = 2) {
  const parsed = toNumber(value)
  if (parsed === null) return 'Pendiente'
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: digits }).format(parsed)
}

export function AntimicrobialUsePage() {
  const { user } = useAuth()
  const { activeIps } = useIps()
  const [periodMonth, setPeriodMonth] = useState(new Date().toISOString().slice(0, 7))
  const [serviceId, setServiceId] = useState('')
  const [services, setServices] = useState<ServiceIps[]>([])
  const [summary, setSummary] = useState<DddSummaryRow[]>([])
  const [record, setRecord] = useState<DddRecord | null>(null)
  const [consumptions, setConsumptions] = useState<DddConsumption[]>([])
  const [drafts, setDrafts] = useState<DddConsumptionDraft[]>([])
  const [detail, setDetail] = useState<{ row: DddSummaryRow; consumptions: DddConsumption[]; drafts: DddConsumptionDraft[] } | null>(null)
  const [occupancy, setOccupancy] = useState<DddRecordDraft>({ camasDisponibles: '', camasDiaOcupadas: '', porcentajeOcupacion: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const period = monthStart(periodMonth)
  const readOnly = record?.estado === 'Confirmado' || record?.estado === 'Anulado'
  const periodDays = daysInMonth(period)
  const qualityAlerts = useMemo(() => {
    const alerts = new Set<string>()
    if (!record || !toNumber(record.camas_dia_ocupadas)) alerts.add('Denominador pendiente')
    consumptions.forEach((consumption) => {
      const status = record ? dddDataStatus(consumption, record) : 'Revisión requerida'
      if (status !== 'Completo') alerts.add(status)
    })
    drafts.forEach((draft) => {
      if (draft.antimicrobialId && draft.via && !draft.omsDdd) alerts.add('Sin referencia OMS')
      if (draft.gramosPreview === null && (draft.concentracion || draft.cantidadConsumida)) alerts.add('Revisión requerida')
    })
    return Array.from(alerts)
  }, [consumptions, drafts, record])

  async function loadBase() {
    if (!activeIps) return
    setLoading(true)
    setError(null)
    try {
      const nextServices = await getIpsServices(activeIps.id)
      setServices(nextServices)
      setSummary(await getDddSummary(activeIps.id, nextServices))
      if (!serviceId && nextServices[0]) setServiceId(nextServices[0].id)
    } catch (loadError) {
      setError(readableError(loadError))
    } finally {
      setLoading(false)
    }
  }

  async function refreshRecord(nextRecord: DddRecord) {
    const [nextConsumptions, catalog] = await Promise.all([getDddConsumptions(nextRecord.id), getAntimicrobialCatalog()])
    setRecord(nextRecord)
    setOccupancy({
      camasDisponibles: nextRecord.camas_disponibles === null || nextRecord.camas_disponibles === undefined ? '' : String(nextRecord.camas_disponibles),
      camasDiaOcupadas:
        nextRecord.camas_dia_ocupadas === null || nextRecord.camas_dia_ocupadas === undefined ? '' : String(nextRecord.camas_dia_ocupadas),
      porcentajeOcupacion:
        nextRecord.porcentaje_ocupacion === null || nextRecord.porcentaje_ocupacion === undefined ? '' : String(nextRecord.porcentaje_ocupacion),
    })
    setConsumptions(nextConsumptions)
    setDrafts(nextConsumptions.map((row) => consumptionDraftFromRow(row, catalog)))
  }

  async function openSelectedRecord() {
    if (!activeIps || !user || !serviceId) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const nextRecord = await openDddRecord({ ipsId: activeIps.id, serviceId, period, userId: user.id })
      await refreshRecord(nextRecord)
      setSuccess(nextRecord.estado === 'Borrador' ? 'Registro abierto en Borrador.' : `Registro ${nextRecord.estado}.`)
      setSummary(await getDddSummary(activeIps.id, services))
    } catch (openError) {
      setError(readableError(openError))
    } finally {
      setSaving(false)
    }
  }

  async function openSummaryDetail(row: DddSummaryRow) {
    setSaving(true)
    setError(null)
    try {
      const [nextConsumptions, catalog] = await Promise.all([getDddConsumptions(row.record.id), getAntimicrobialCatalog()])
      setDetail({
        row,
        consumptions: nextConsumptions,
        drafts: nextConsumptions.map((item) => consumptionDraftFromRow(item, catalog)),
      })
    } catch (detailError) {
      setError(readableError(detailError))
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    loadBase()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIps?.id])

  async function saveProgress() {
    if (!record || readOnly) return false
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const occupancyPreview = calculateOccupancy(occupancy.camasDisponibles, occupancy.camasDiaOcupadas, period)
      const savedRecord = await updateDddRecord(record.id, {
        ...occupancy,
        porcentajeOcupacion: occupancy.porcentajeOcupacion || (occupancyPreview === null ? '' : String(occupancyPreview)),
      })
      for (const draft of drafts) {
        if (!draft.antimicrobialId && !draft.via && !draft.cantidadConsumida) continue
        if (!draft.antimicrobialId || !draft.via.trim()) throw new Error('Cada consumo debe tener antimicrobiano y vía.')
        if (toNumber(draft.cantidadConsumida) === null || toNumber(draft.cantidadConsumida)! < 0) {
          throw new Error('La cantidad consumida no puede ser negativa ni inválida.')
        }
        await saveDddConsumption(savedRecord.id, draft)
      }
      await refreshRecord(savedRecord)
      if (activeIps) setSummary(await getDddSummary(activeIps.id, services))
      setSuccess('Progreso guardado. Cálculos recargados desde Supabase.')
      return true
    } catch (saveError) {
      setError(readableError(saveError))
      return false
    } finally {
      setSaving(false)
    }
  }

  async function confirmRecord() {
    if (!record || readOnly) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const saved = await saveProgress()
      if (!saved) return
      const confirmed = await confirmDddRecord(record.id)
      await refreshRecord(confirmed)
      if (activeIps) setSummary(await getDddSummary(activeIps.id, services))
      setSuccess('Periodo confirmado. El registro queda en modo lectura.')
    } catch (confirmError) {
      setError(readableError(confirmError))
    } finally {
      setSaving(false)
    }
  }

  function updateDraft(index: number, next: DddConsumptionDraft) {
    const nextDrafts = [...drafts]
    const grams = calculateGrams(next.concentracion, next.unidadConcentracion, next.cantidadConsumida)
    nextDrafts[index] = { ...next, gramosPreview: grams }
    setDrafts(nextDrafts)
  }

  if (loading) return <main className="page"><section className="panel">Cargando módulo DDD...</section></main>

  return (
    <main className="page round-form-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Uso de antimicrobianos</p>
          <h1>Consumo, ocupación y DDD</h1>
          <p className="muted">Los cálculos finales se recargan desde Supabase después de guardar.</p>
        </div>
        <div className="button-row">
          <button className="secondary-button" disabled={!record || saving || readOnly} onClick={saveProgress} type="button">
            <Save size={17} />
            Guardar progreso
          </button>
          <button className="primary-button" disabled={!record || saving || readOnly} onClick={confirmRecord} type="button">
            <ClipboardCheck size={17} />
            Confirmar periodo
          </button>
        </div>
      </section>

      {error ? <div className="alert error"><AlertCircle size={18} /> {error}</div> : null}
      {success ? <div className="alert success"><CheckCircle2 size={18} /> {success}</div> : null}

      <section className="continuous-form">
        {activeIps ? (
          <Suspense fallback={<section className="panel">Cargando analítica DDD...</section>}>
            <DddAnalyticsPanel ipsId={activeIps.id} />
          </Suspense>
        ) : null}

        <article className="panel">
          <div className="panel-title">
            <Database size={20} />
            <div>
              <h2>Periodo</h2>
              <p>La combinación IPS, servicio y periodo abre un único registro.</p>
            </div>
          </div>
          <div className="form-grid clinical-grid">
            <label>
              IPS
              <input disabled value={activeIps?.nombre ?? 'Sin IPS activa'} />
            </label>
            <label>
              Periodo
              <input type="month" value={periodMonth} onChange={(event) => setPeriodMonth(event.target.value)} />
            </label>
            <label>
              Servicio
              <select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
                <option value="">Seleccionar</option>
                {services.map((service) => <option key={service.id} value={service.id}>{service.nombre}</option>)}
              </select>
            </label>
            <SummaryItem label="Días del periodo" value={String(periodDays)} />
          </div>
          <div className="button-row">
            <button className="primary-button" disabled={!activeIps || !serviceId || saving} onClick={openSelectedRecord} type="button">
              Abrir registro
            </button>
            {record ? <span className="pill">{record.estado ?? 'Borrador'} · {formatDate(record.periodo)}</span> : null}
          </div>
        </article>

        {record ? (
          <>
            <article className="panel">
              <div className="panel-title">
                <BedDouble size={20} />
                <div>
                  <h2>Ocupación</h2>
                  <p>Camas-día ocupadas es el denominador principal.</p>
                </div>
              </div>
              <div className="form-grid clinical-grid">
                <label>
                  Camas disponibles
                  <input disabled={readOnly} min="0" type="number" value={occupancy.camasDisponibles} onChange={(event) => setOccupancy({ ...occupancy, camasDisponibles: event.target.value })} />
                </label>
                <label>
                  Camas-día ocupadas
                  <input disabled={readOnly} min="0" type="number" value={occupancy.camasDiaOcupadas} onChange={(event) => setOccupancy({ ...occupancy, camasDiaOcupadas: event.target.value })} />
                </label>
                <label>
                  % ocupación
                  <input disabled={readOnly} min="0" type="number" value={occupancy.porcentajeOcupacion} onChange={(event) => setOccupancy({ ...occupancy, porcentajeOcupacion: event.target.value })} />
                </label>
                <SummaryItem
                  label="Preview ocupación"
                  value={
                    calculateOccupancy(occupancy.camasDisponibles, occupancy.camasDiaOcupadas, period) === null
                      ? 'Sin cálculo'
                      : `${numberLabel(calculateOccupancy(occupancy.camasDisponibles, occupancy.camasDiaOcupadas, period), 1)}%`
                  }
                />
              </div>
              {!toNumber(occupancy.camasDiaOcupadas) ? <p className="muted">Denominador pendiente.</p> : null}
            </article>

            <article className="panel">
              <div className="panel-title">
                <Plus size={20} />
                <div>
                  <h2>Consumo</h2>
                  <p>Registra solo antimicrobianos consumidos durante el periodo.</p>
                </div>
              </div>
              <div className="subsection-heading">
                <h3>Antimicrobianos consumidos</h3>
                <button className="secondary-button" disabled={readOnly} onClick={() => setDrafts([...drafts, emptyConsumptionDraft()])} type="button">
                  <Plus size={16} />
                  Agregar antimicrobiano
                </button>
              </div>
              <div className="repeat-list">
                {drafts.map((draft, index) => (
                  <ConsumptionRow
                    draft={draft}
                    key={`${draft.id ?? 'new'}-${index}`}
                    onChange={(next) => updateDraft(index, next)}
                    onRemove={() => setDrafts(drafts.filter((_, itemIndex) => itemIndex !== index))}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-title">
                <BarChart3 size={20} />
                <div>
                  <h2>Resultados DDD</h2>
                  <p>Valores calculados por triggers de Supabase después del guardado.</p>
                </div>
              </div>
              {qualityAlerts.length ? (
                <div className="subtle-list">
                  {qualityAlerts.map((alert) => <span key={alert}>{alert}</span>)}
                </div>
              ) : null}
              <DddResultsTable consumptions={consumptions} drafts={drafts} record={record} />
            </article>
          </>
        ) : null}

        <article className="panel">
          <div className="panel-title">
            <Database size={20} />
            <div>
              <h2>Resumen del periodo</h2>
              <p>Control de calidad por IPS activa.</p>
            </div>
          </div>
          <DddSummaryTable onOpenDetail={openSummaryDetail} rows={summary} />
        </article>
        {detail ? <DddDetailPanel detail={detail} onClose={() => setDetail(null)} /> : null}
      </section>
    </main>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ConsumptionRow({
  draft,
  onChange,
  onRemove,
  readOnly,
}: {
  draft: DddConsumptionDraft
  onChange: (value: DddConsumptionDraft) => void
  onRemove: () => void
  readOnly: boolean
}) {
  async function resolveOms(next: DddConsumptionDraft) {
    onChange(next)
    if (!next.antimicrobialId || !next.via) return
    try {
      const oms = await getOmsDdd(next.antimicrobialId, next.via)
      onChange({ ...next, omsDdd: oms })
    } catch {
      onChange({ ...next, omsDdd: null })
    }
  }

  return (
    <div className="new-treatment-row ddd-consumption-row">
      <AntimicrobialDddAutocomplete
        readOnly={readOnly}
        value={draft.antimicrobialName}
        onSelect={(item) => resolveOms({ ...draft, antimicrobialId: item.id, antimicrobialName: catalogLabel(item), codigoAtc: item.codigo_atc ?? null })}
      />
      <div className="form-grid compact-treatment">
        <label>
          Vía
          <select disabled={readOnly} value={draft.via} onChange={(event) => resolveOms({ ...draft, via: event.target.value })}>
            <option value="">Seleccionar</option>
            {routes.map((route) => <option key={route}>{route}</option>)}
          </select>
        </label>
        <label>
          Presentación
          <input disabled={readOnly} value={draft.presentacion} onChange={(event) => onChange({ ...draft, presentacion: event.target.value })} />
        </label>
        <label>
          Concentración
          <input disabled={readOnly} min="0" type="number" value={draft.concentracion} onChange={(event) => onChange({ ...draft, concentracion: event.target.value })} />
        </label>
        <label>
          Unidad concentración
          <select disabled={readOnly} value={draft.unidadConcentracion} onChange={(event) => onChange({ ...draft, unidadConcentracion: event.target.value as DddConsumptionDraft['unidadConcentracion'] })}>
            <option value="">Seleccionar</option>
            <option value="g">g</option>
            <option value="mg">mg</option>
          </select>
        </label>
        <label>
          Cantidad consumida
          <input disabled={readOnly} min="0" type="number" value={draft.cantidadConsumida} onChange={(event) => onChange({ ...draft, cantidadConsumida: event.target.value })} />
        </label>
        <label>
          Unidad consumo
          <input disabled={readOnly} value={draft.unidadConsumo} onChange={(event) => onChange({ ...draft, unidadConsumo: event.target.value })} />
        </label>
      </div>
      <div className="treatment-derived">
        <span>Gramos preview: {draft.gramosPreview === null ? 'Sin cálculo' : numberLabel(draft.gramosPreview)}</span>
        <span>ATC: {draft.codigoAtc ?? 'Sin ATC'}</span>
        <span>{draft.omsDdd ? `DDD OMS: ${numberLabel(draft.omsDdd.ddd_oms)} ${draft.omsDdd.unidad_ddd ?? ''}` : 'Sin referencia DDD OMS'}</span>
        <button className="ghost-button" disabled={readOnly || Boolean(draft.id)} onClick={onRemove} type="button">
          <Trash2 size={16} />
          Quitar
        </button>
      </div>
    </div>
  )
}

function AntimicrobialDddAutocomplete({
  value,
  onSelect,
  readOnly,
}: {
  value: string
  onSelect: (item: AntimicrobialCatalogItem) => void
  readOnly: boolean
}) {
  const [query, setQuery] = useState(value)
  const [items, setItems] = useState<AntimicrobialCatalogItem[]>([])

  useEffect(() => {
    let mounted = true
    getAntimicrobialCatalog(query)
      .then((result) => {
        if (mounted) setItems(result)
      })
      .catch(() => {
        if (mounted) setItems([])
      })
    return () => {
      mounted = false
    }
  }, [query])

  return (
    <div className="autocomplete antimicrobial-search">
      <label>
        Antimicrobiano
        <input disabled={readOnly} placeholder="Buscar en catálogo" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {query && !readOnly ? (
        <div className="autocomplete-list">
          {items.map((item) => (
            <button key={item.id} onClick={() => onSelect(item)} type="button">
              <strong>{catalogLabel(item)}</strong>
              {item.codigo_atc ? <span>{item.codigo_atc}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function DddResultsTable({
  consumptions,
  drafts,
  record,
}: {
  consumptions: DddConsumption[]
  drafts: DddConsumptionDraft[]
  record: DddRecord
}) {
  if (!consumptions.length) return <p className="muted">Sin consumos guardados.</p>
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Antimicrobiano</th>
            <th>Vía</th>
            <th>Consumo</th>
            <th>Gramos</th>
            <th>DDD OMS</th>
            <th>DDD consumidas</th>
            <th>DDD/100 camas-día</th>
            <th>Estado dato</th>
          </tr>
        </thead>
        <tbody>
          {consumptions.map((consumption) => {
            const draft = drafts.find((item) => item.id === consumption.id)
            return (
              <tr key={consumption.id}>
                <td>{draft?.antimicrobialName ?? consumption.antimicrobiano_id}</td>
                <td>{consumption.via}</td>
                <td>{numberLabel(consumption.cantidad_consumida)} {consumption.unidad_consumo ?? ''}</td>
                <td>{numberLabel(consumption.gramos_consumidos)}</td>
                <td>{numberLabel(consumption.ddd_oms)}</td>
                <td>{numberLabel(consumption.ddd_calculadas)}</td>
                <td>{numberLabel(consumption.ddd_100_camas_dia)}</td>
                <td><span className="pill">{dddDataStatus(consumption, record)}</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function DddSummaryTable({ rows, onOpenDetail }: { rows: DddSummaryRow[]; onOpenDetail: (row: DddSummaryRow) => void }) {
  if (!rows.length) return <p className="muted">Sin registros DDD visibles para la IPS activa.</p>
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Periodo</th>
            <th>Servicio</th>
            <th>Estado</th>
            <th>Antimicrobianos</th>
            <th>DDD totales</th>
            <th>Ocupación</th>
            <th>Alertas</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.record.id}>
              <td>{formatDate(row.record.periodo)}</td>
              <td>{row.service?.nombre ?? row.record.servicio_id}</td>
              <td>{row.record.estado}</td>
              <td>{row.consumptionCount}</td>
              <td>{numberLabel(row.totalDdd)}</td>
              <td>{row.hasOccupancy ? `${numberLabel(row.record.camas_dia_ocupadas)} camas-día` : 'Denominador pendiente'}</td>
              <td>{row.qualityAlerts.length ? row.qualityAlerts.join(', ') : 'Completo'}</td>
              <td><button className="table-action button-link" onClick={() => onOpenDetail(row)} type="button">Ver detalle</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DddDetailPanel({
  detail,
  onClose,
}: {
  detail: { row: DddSummaryRow; consumptions: DddConsumption[]; drafts: DddConsumptionDraft[] }
  onClose: () => void
}) {
  const { row, consumptions, drafts } = detail
  return (
    <article className="panel detail-panel" aria-label="Detalle DDD">
      <div className="subsection-heading">
        <div>
          <h2>Detalle del registro DDD</h2>
          <p className="muted">
            {formatDate(row.record.periodo)} · {row.service?.nombre ?? row.record.servicio_id} · {numberLabel(row.record.camas_dia_ocupadas)} camas-día
          </p>
        </div>
        <button className="secondary-button" onClick={onClose} type="button">Cerrar</button>
      </div>
      <div className="summary-grid">
        <SummaryItem label="Servicio" value={row.service?.nombre ?? row.record.servicio_id} />
        <SummaryItem label="Periodo" value={formatDate(row.record.periodo)} />
        <SummaryItem label="Camas-día" value={numberLabel(row.record.camas_dia_ocupadas)} />
        <SummaryItem label="Ocupación" value={row.record.porcentaje_ocupacion ? `${numberLabel(row.record.porcentaje_ocupacion, 1)}%` : 'Pendiente'} />
      </div>
      <DddResultsTable consumptions={consumptions} drafts={drafts} record={row.record} />
    </article>
  )
}
