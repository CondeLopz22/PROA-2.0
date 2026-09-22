import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Clock3, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../features/auth/authContext'
import { useIps } from '../features/ips/ipsContext'
import { formatDateTime } from '../lib/date'
import { getAuditInbox, updateAuditFindingStatus, type AuditInboxRow } from '../services/auditService'
import { patientDisplayName } from '../services/patientService'
import { canWriteOperationalData } from '../services/permissionService'
import { readableError } from '../services/supabaseErrors'
import { filterAuditRows, type AuditFilters, type AuditStatusFilter } from '../services/auditFilters'
import type { AuditFindingSeverity, AuditFindingStatus } from '../types/domain'

const statusOptions = ['Activos', 'Abierto', 'En seguimiento', 'Resuelto', 'Descartado', 'Todos'] as const

const defaultFilters: AuditFilters = {
  status: 'Activos',
  severity: '',
  service: '',
  antimicrobial: '',
  aware: '',
  type: '',
  search: '',
}

export function AuditPage() {
  const { user } = useAuth()
  const { activeIps, userType } = useIps()
  const canManage = canWriteOperationalData(userType)
  const [params] = useSearchParams()
  const [rows, setRows] = useState<AuditInboxRow[]>([])
  const [filters, setFilters] = useState<AuditFilters>(() => ({
    ...defaultFilters,
    status: statusOptions.includes(params.get('estado') as AuditStatusFilter) ? (params.get('estado') as AuditStatusFilter) : 'Activos',
    severity: params.get('severidad') ?? '',
  }))
  const [selectedId, setSelectedId] = useState<string | null>(params.get('hallazgo'))
  const [discarding, setDiscarding] = useState(false)
  const [discardReason, setDiscardReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function load() {
    if (!activeIps) return
    setLoading(true)
    setError(null)
    try {
      const nextRows = await getAuditInbox(activeIps.id)
      setRows(nextRows)
      if (selectedId && !nextRows.some((row) => row.id === selectedId)) setSelectedId(null)
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

  useEffect(() => {
    if (!selectedId) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') closeDetail()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const visibleRows = useMemo(() => filterAuditRows(rows, filters), [filters, rows])
  const selected = rows.find((row) => row.id === selectedId) ?? null
  const kpis = useMemo(() => ({
    open: rows.filter((row) => row.estado === 'Abierto').length,
    priority: rows.filter((row) => row.severidad === 'Prioritario' && ['Abierto', 'En seguimiento'].includes(row.estado)).length,
    followUp: rows.filter((row) => row.estado === 'En seguimiento').length,
    resolved: rows.filter((row) => row.estado === 'Resuelto').length,
  }), [rows])
  const options = useMemo(() => ({
    services: values(rows.map((row) => row.servicio)),
    antimicrobials: values(rows.map((row) => row.antimicrobiano)),
    aware: values(rows.map((row) => row.aware_categoria)),
    types: values(rows.map((row) => row.tipo_hallazgo)),
  }), [rows])

  function patchFilter<K extends keyof AuditFilters>(key: K, value: AuditFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  function closeDetail() {
    setSelectedId(null)
    setDiscarding(false)
    setDiscardReason('')
  }

  async function changeStatus(status: AuditFindingStatus) {
    if (!selected || !canManage) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const updated = await updateAuditFindingStatus({
        findingId: selected.id,
        status,
        userId: user?.id,
        discardReason: status === 'Descartado' ? discardReason : undefined,
      })
      setRows((current) => current.map((row) => row.id === selected.id ? { ...row, ...updated } : row))
      setDiscarding(false)
      setDiscardReason('')
      setSuccess(`Hallazgo actualizado a ${status}.`)
    } catch (saveError) {
      setError(readableError(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="page operational-page audit-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Gestión operativa</p>
          <h1>Auditoría PROA</h1>
          <p className="muted">Hallazgos que requieren revisión y seguimiento por el equipo PROA.</p>
        </div>
        <button className="secondary-button" disabled={loading} onClick={load} type="button">
          <RefreshCw size={17} />
          Actualizar
        </button>
      </section>

      {error ? <div className="alert error"><AlertCircle size={18} /> {error}</div> : null}
      {success ? <div className="alert success"><CheckCircle2 size={18} /> {success}</div> : null}

      <section className="metrics-grid audit-metrics" aria-label="Resumen de auditoría">
        <AuditMetric label="Hallazgos abiertos" value={kpis.open} onClick={() => patchFilter('status', 'Abierto')} />
        <AuditMetric label="Prioritarios" value={kpis.priority} onClick={() => { patchFilter('status', 'Activos'); patchFilter('severity', 'Prioritario') }} priority />
        <AuditMetric label="En seguimiento" value={kpis.followUp} onClick={() => patchFilter('status', 'En seguimiento')} />
        <AuditMetric label="Resueltos" value={kpis.resolved} onClick={() => patchFilter('status', 'Resuelto')} />
      </section>

      <section className="panel">
        <div className="panel-title">
          <ShieldCheck size={20} />
          <div>
            <h2>Bandeja de hallazgos</h2>
            <p>{visibleRows.length} de {rows.length} hallazgos visibles.</p>
          </div>
        </div>
        <div className="audit-filter-grid">
          <label className="audit-search">
            Buscar paciente o identificación
            <div className="input-with-icon">
              <Search size={16} />
              <input value={filters.search} onChange={(event) => patchFilter('search', event.target.value)} placeholder="Nombre o identificación" />
            </div>
          </label>
          <FilterSelect includeEmpty={false} label="Estado" value={filters.status} options={[...statusOptions]} onChange={(value) => patchFilter('status', value as AuditStatusFilter)} />
          <FilterSelect label="Prioridad" value={filters.severity} options={['Informativo', 'Revisión', 'Prioritario']} onChange={(value) => patchFilter('severity', value)} />
          <FilterSelect label="Servicio" value={filters.service} options={options.services} onChange={(value) => patchFilter('service', value)} />
          <FilterSelect label="Antimicrobiano" value={filters.antimicrobial} options={options.antimicrobials} onChange={(value) => patchFilter('antimicrobial', value)} />
          <FilterSelect label="AWaRe" value={filters.aware} options={options.aware} onChange={(value) => patchFilter('aware', value)} />
          <FilterSelect label="Tipo de hallazgo" value={filters.type} options={options.types} onChange={(value) => patchFilter('type', value)} />
          <button className="ghost-button audit-clear" onClick={() => setFilters(defaultFilters)} type="button">Limpiar filtros</button>
        </div>

        {loading ? <p className="muted">Cargando hallazgos...</p> : null}
        {!loading && !rows.length ? <div className="empty-state"><h3>Sin hallazgos</h3><p>No existen hallazgos de auditoría para la IPS activa.</p></div> : null}
        {!loading && rows.length > 0 && !visibleRows.length ? <p className="muted">Sin hallazgos que coincidan con los filtros seleccionados.</p> : null}
        {!loading && visibleRows.length ? <AuditInbox rows={visibleRows} onReview={setSelectedId} /> : null}
      </section>

      {selected ? (
        <div aria-labelledby="audit-detail-title" aria-modal="true" className="audit-drawer-layer" role="dialog">
          <button aria-label="Cerrar detalle de auditoría" className="audit-drawer-backdrop" onClick={closeDetail} type="button" />
          <div className="audit-drawer">
            <AuditDetail
              canManage={canManage}
              discarding={discarding}
              discardReason={discardReason}
              finding={selected}
              saving={saving}
              onClose={closeDetail}
              onDiscard={() => setDiscarding(true)}
              onDiscardReason={setDiscardReason}
              onStatus={changeStatus}
            />
          </div>
        </div>
      ) : null}
    </main>
  )
}

function AuditInbox({ rows, onReview }: { rows: AuditInboxRow[]; onReview: (id: string) => void }) {
  return (
    <>
      <div className="table-wrap desktop-table">
        <table className="data-table audit-table">
          <thead><tr><th>Paciente</th><th>Servicio</th><th>Antimicrobiano</th><th>Día</th><th>AWaRe</th><th>Hallazgo</th><th>Prioridad</th><th>Estado</th><th>Detección</th><th>Acción</th></tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={row.id}>
              <td><strong>{row.patient ? patientDisplayName(row.patient) : 'Paciente no visible'}</strong><small>{patientIdentification(row)}</small></td>
              <td>{row.servicio ?? 'Sin servicio'}</td>
              <td>{row.antimicrobiano ?? 'Sin antimicrobiano'}</td>
              <td>{row.treatmentDay ? `Día ${row.treatmentDay}` : 'No calculable'}</td>
              <td><span className="pill">{row.aware_categoria ?? 'Sin clasificar'}</span></td>
              <td>{row.tipo_hallazgo}</td>
              <td><SeverityBadge severity={row.severidad} /></td>
              <td><span className="pill">{row.estado}</span></td>
              <td>{formatDateTime(row.fecha_deteccion)}</td>
              <td><button className="table-action" onClick={() => onReview(row.id)} type="button">Revisar</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="mobile-card-list audit-card-list">
        {rows.map((row) => (
          <article className={`mobile-record-card audit-card severity-${severityClass(row.severidad)}`} key={row.id}>
            <div className="mobile-card-header"><strong>{row.patient ? patientDisplayName(row.patient) : 'Paciente no visible'}</strong><SeverityBadge severity={row.severidad} /></div>
            <span>{patientIdentification(row)}</span>
            <span>{row.servicio ?? 'Sin servicio'} · {row.antimicrobiano ?? 'Sin antimicrobiano'}</span>
            <span>{row.treatmentDay ? `Día ${row.treatmentDay}` : 'Día no calculable'} · AWaRe {row.aware_categoria ?? 'Sin clasificar'}</span>
            <strong>{row.tipo_hallazgo}</strong>
            <span>Estado: {row.estado} · Detectado: {formatDateTime(row.fecha_deteccion)}</span>
            <button className="secondary-button mobile-card-action" onClick={() => onReview(row.id)} type="button">Revisar</button>
          </article>
        ))}
      </div>
    </>
  )
}

function AuditDetail({ finding, canManage, saving, discarding, discardReason, onClose, onDiscard, onDiscardReason, onStatus }: {
  finding: AuditInboxRow
  canManage: boolean
  saving: boolean
  discarding: boolean
  discardReason: string
  onClose: () => void
  onDiscard: () => void
  onDiscardReason: (value: string) => void
  onStatus: (status: AuditFindingStatus) => void
}) {
  const active = finding.estado === 'Abierto' || finding.estado === 'En seguimiento'
  return (
    <section className="panel audit-detail" aria-labelledby="audit-detail-title">
      <div className="subsection-heading">
        <div><p className="eyebrow">Detalle del hallazgo</p><h2 id="audit-detail-title">{finding.tipo_hallazgo}</h2></div>
        <button className="ghost-button" onClick={onClose} type="button">Cerrar detalle</button>
      </div>
      <div className="audit-detail-grid">
        <Detail label="Paciente" value={finding.patient ? patientDisplayName(finding.patient) : 'Paciente no visible'} />
        <Detail label="Identificación" value={patientIdentification(finding)} />
        <Detail label="Caso PROA" value={`Caso ${finding.caso_id.slice(0, 8)}`} />
        <Detail label="Servicio" value={finding.servicio ?? 'Sin servicio'} />
        <Detail label="Antimicrobiano" value={finding.antimicrobiano ?? 'Sin antimicrobiano'} />
        <Detail label="Día de tratamiento" value={finding.treatmentDay ? `Día ${finding.treatmentDay}` : 'No calculable'} />
        <Detail label="Clasificación AWaRe" value={finding.aware_categoria ?? 'Sin clasificar'} />
        <Detail label="Severidad" value={finding.severidad} />
        <Detail label="Estado" value={finding.estado} />
        <Detail label="Fecha de detección" value={formatDateTime(finding.fecha_deteccion)} />
        <Detail label="Fecha de resolución" value={finding.fecha_resolucion ? formatDateTime(finding.fecha_resolucion) : 'Pendiente'} />
        <Detail label="Motivo de descarte" value={finding.motivo_descarte ?? 'No aplica'} />
      </div>
      <div className="audit-description"><strong>Descripción</strong><p>{finding.descripcion || 'Sin descripción disponible.'}</p></div>
      <div className="audit-intervention">
        <strong>Intervención PROA</strong>
        {finding.intervention ? (
          <p>{finding.intervention.tipo_intervencion ?? finding.intervention.recomendacion ?? 'Intervención vinculada'} · Aceptación: {finding.intervention.aceptacion ?? 'Pendiente'}</p>
        ) : (
          <div><p className="muted">Este hallazgo no tiene intervención vinculada.</p>{finding.ronda_detectada_id ? <Link className="secondary-button" to={`/rondas/${finding.ronda_detectada_id}#intervencion`}>Ir a la ronda</Link> : null}</div>
        )}
      </div>
      <div className="button-row">
        {finding.patient ? <Link className="ghost-button" to={`/pacientes?documento=${encodeURIComponent(finding.patient.numero_identificacion)}`}>Ver paciente / caso</Link> : null}
        {finding.ronda_detectada_id ? <Link className="ghost-button" to={`/rondas/${finding.ronda_detectada_id}`}>Ver ronda relacionada</Link> : null}
      </div>
      {canManage && active ? (
        <div className="audit-actions">
          <div className="button-row">
            {finding.estado === 'Abierto' ? <button className="secondary-button" disabled={saving} onClick={() => onStatus('En seguimiento')} type="button"><Clock3 size={16} /> En seguimiento</button> : null}
            <button className="primary-button" disabled={saving} onClick={() => onStatus('Resuelto')} type="button"><CheckCircle2 size={16} /> Resolver</button>
            <button className="ghost-button" disabled={saving} onClick={onDiscard} type="button">Descartar</button>
          </div>
          {discarding ? (
            <div className="discard-form">
              <label>Motivo de descarte (obligatorio)<textarea value={discardReason} onChange={(event) => onDiscardReason(event.target.value)} rows={3} /></label>
              <button className="secondary-button" disabled={saving || !discardReason.trim()} onClick={() => onStatus('Descartado')} type="button">Confirmar descarte</button>
            </div>
          ) : null}
        </div>
      ) : null}
      {!canManage ? <div className="alert info">Tu perfil puede consultar este hallazgo, pero no modificarlo.</div> : null}
    </section>
  )
}

function AuditMetric({ label, value, onClick, priority = false }: { label: string; value: number; onClick: () => void; priority?: boolean }) {
  return <button className={`metric-card metric-button audit-metric ${priority ? 'priority' : ''}`} onClick={onClick} type="button"><ShieldCheck size={20} /><span>{label}</span><strong>{value}</strong></button>
}

function FilterSelect({ label, value, options, onChange, includeEmpty = true }: { label: string; value: string; options: string[]; onChange: (value: string) => void; includeEmpty?: boolean }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{includeEmpty ? <option value="">Todos</option> : null}{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
}

function SeverityBadge({ severity }: { severity: AuditFindingSeverity }) {
  return <span className={`audit-severity severity-${severityClass(severity)}`}>{severity}</span>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>
}

function patientIdentification(row: AuditInboxRow) {
  return row.patient ? `${row.patient.tipo_identificacion} ${row.patient.numero_identificacion}` : 'Sin identificación visible'
}

function values(entries: Array<string | null | undefined>) {
  return [...new Set(entries.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'es'))
}

function severityClass(severity: AuditFindingSeverity) {
  if (severity === 'Prioritario') return 'priority'
  if (severity === 'Revisión') return 'review'
  return 'info'
}
