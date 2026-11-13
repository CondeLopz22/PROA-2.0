import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowLeft, CalendarPlus, ClipboardList, Dna, FolderClock, Pill, ShieldCheck, Stethoscope } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useIps } from '../features/ips/ipsContext'
import { ageFromBirthDate, formatDate, formatDateTime } from '../lib/date'
import { patientDisplayName } from '../services/patientService'
import { buildPatientTimeline, getPatientRecord, type PatientRecordBundle } from '../services/patientRecordService'
import { canWriteOperationalData } from '../services/permissionService'
import { startCaseRound } from '../services/roundService'
import { readableError } from '../services/supabaseErrors'
import { treatmentName } from '../services/treatmentService'
import type { CaseProa } from '../types/domain'

export function PatientRecordPage() {
  const { patientId } = useParams()
  const { activeIps, userType } = useIps()
  const canWrite = canWriteOperationalData(userType)
  const navigate = useNavigate()
  const [record, setRecord] = useState<PatientRecordBundle | null>(null)
  const [selectedCaseId, setSelectedCaseId] = useState('')
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeIpsId = activeIps?.id

  useEffect(() => {
    if (!activeIpsId || !patientId) return
    let mounted = true
    getPatientRecord(activeIpsId, patientId)
      .then((next) => {
        if (!mounted) return
        setRecord(next)
        const active = next.cases.find(isActiveCase)
        setSelectedCaseId(active?.id ?? next.cases[0]?.id ?? '')
      })
      .catch((loadError) => { if (mounted) setError(readableError(loadError)) })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [activeIpsId, patientId])

  const activeCases = useMemo(() => record?.cases.filter(isActiveCase) ?? [], [record])
  const activeCase = activeCases[0] ?? null
  const selectedCase = record?.cases.find((item) => item.id === selectedCaseId) ?? activeCase ?? record?.cases[0] ?? null
  const caseRounds = record?.rounds.filter((item) => item.caso_id === selectedCase?.id) ?? []
  const roundIds = new Set(caseRounds.map((item) => item.id))
  const caseTreatments = record?.treatments.filter((item) => item.caso_id === selectedCase?.id) ?? []
  const caseMicrobiology = record?.microbiology.filter((item) => item.caso_id === selectedCase?.id) ?? []
  const caseDiagnoses = record?.diagnoses.filter((item) => roundIds.has(item.ronda_id)) ?? []
  const caseInterventions = record?.interventions.filter((item) => item.ronda_id && roundIds.has(item.ronda_id)) ?? []
  const timeline = useMemo(() => record ? buildPatientTimeline(record).filter((item) => !selectedCaseId || item.caseId === selectedCaseId) : [], [record, selectedCaseId])
  const latestActiveRound = activeCase ? record?.rounds.find((item) => item.caso_id === activeCase.id) ?? null : null
  const services = new Map((record?.services ?? []).map((item) => [item.id, item]))

  async function continueCare() {
    if (!activeIps || !record || !canWrite) return
    setStarting(true)
    setError(null)
    try {
      const result = await startCaseRound({
        ipsId: activeIps.id,
        patientId: record.patient.id,
        caseId: activeCase?.id ?? null,
        serviceId: latestActiveRound?.servicio_id ?? null,
        bed: latestActiveRound?.cama ?? activeCase?.cama_actual ?? null,
      })
      navigate(`/rondas/${result.round.id}`)
    } catch (startError) {
      setError(readableError(startError, 'rondas_proa'))
    } finally {
      setStarting(false)
    }
  }

  if (loading) return <main className="page"><section className="panel">Cargando expediente clínico...</section></main>
  if (error && !record) return <main className="page"><div className="alert error"><AlertCircle size={18} /> {error}</div><Link className="secondary-button" to="/pacientes"><ArrowLeft size={16} /> Volver a pacientes</Link></main>
  if (!record) return null

  return (
    <main className="page patient-record-page">
      <section className="patient-record-hero">
        <div className="record-identity">
          <Link className="back-link" to="/pacientes"><ArrowLeft size={16} /> Pacientes</Link>
          <p className="eyebrow">Expediente longitudinal</p>
          <h1>{patientDisplayName(record.patient)}</h1>
          <p>{record.patient.tipo_identificacion} {record.patient.numero_identificacion} · {activeIps?.nombre}</p>
        </div>
        <div className="record-actions">
          <span className={`status-badge ${activeCase ? 'state-followup' : 'state-closed'}`}>{activeCase ? 'Caso activo' : record.cases.length ? 'Sin caso activo' : 'Sin casos'}</span>
          {canWrite ? <button className="primary-button" disabled={starting} onClick={continueCare} type="button"><CalendarPlus size={17} />{starting ? 'Abriendo...' : latestActiveRound?.estado === 'Borrador' ? 'Continuar borrador' : activeCase ? 'Nueva ronda' : 'Nuevo caso y primera valoración'}</button> : null}
        </div>
      </section>

      {error ? <div className="alert error"><AlertCircle size={18} /> {error}</div> : null}
      {activeCases.length > 1 ? <div className="alert warning">Este paciente tiene {activeCases.length} casos activos históricos. No se abrirá otro caso mientras persista la inconsistencia.</div> : null}

      <section className="record-summary-grid">
        <Summary icon={<Stethoscope size={18} />} label="Paciente" value={`${record.patient.sexo ?? 'Sexo sin registrar'} · ${ageLabel(record.patient.fecha_nacimiento)}`} />
        <Summary icon={<FolderClock size={18} />} label="Casos PROA" value={`${record.cases.length} registrados`} />
        <Summary icon={<ClipboardList size={18} />} label="Rondas" value={`${record.rounds.length} valoraciones`} />
        <Summary icon={<Pill size={18} />} label="Tratamientos activos" value={`${record.treatments.filter((item) => item.estado === 'Activo').length}`} />
      </section>

      <section className="patient-record-layout">
        <aside className="case-selector panel">
          <div><p className="eyebrow">Episodios</p><h2>Historial de casos</h2></div>
          {record.cases.length ? record.cases.map((item) => <button className={selectedCase?.id === item.id ? 'selected' : ''} key={item.id} onClick={() => setSelectedCaseId(item.id)} type="button"><strong>{item.estado ?? 'Sin estado'}</strong><span>Apertura {formatDate(item.fecha_apertura)}</span><span>{item.fecha_cierre ? `Cierre ${formatDate(item.fecha_cierre)}` : item.ubicacion_actual ?? 'En seguimiento'}</span></button>) : <p className="muted">Sin casos PROA.</p>}
        </aside>

        <div className="record-content">
          {selectedCase ? <section className="panel case-overview"><div className="subsection-heading"><div><p className="eyebrow">Caso seleccionado</p><h2>{selectedCase.estado ?? 'Sin estado'} · abierto {formatDate(selectedCase.fecha_apertura)}</h2></div><span className="pill">{selectedCase.id.slice(0, 8)}</span></div><div className="record-data-grid"><Data label="Servicio / ubicación" value={latestLocation(caseRounds, selectedCase, services)} /><Data label="Cama" value={caseRounds[0]?.cama ?? selectedCase.cama_actual ?? 'Sin registro'} /><Data label="Última valoración" value={formatDateTime(caseRounds[0]?.fecha_hora_ronda)} /><Data label="Motivo de cierre" value={selectedCase.motivo_cierre ?? 'No aplica'} /></div></section> : null}

          <section className="record-section-grid">
            <ClinicalSection icon={<Stethoscope size={18} />} title="Diagnósticos" empty="Sin diagnósticos en este caso.">{caseDiagnoses.map((item) => <RecordItem key={item.id} title={`${item.codigo_cie10 ?? 'Sin CIE-10'} · ${item.descripcion_cie10 ?? 'Sin descripción'}`} detail={item.tipo_diagnostico ?? 'Sin tipo'} roundId={item.ronda_id} />)}</ClinicalSection>
            <ClinicalSection icon={<Pill size={18} />} title="Tratamientos" empty="Sin tratamientos en este caso.">{caseTreatments.map((item) => <RecordItem key={item.id} title={treatmentName(item)} detail={`${item.estado ?? 'Sin estado'} · desde ${formatDate(item.fecha_inicio)} · ${[item.dosis, item.unidad, item.frecuencia, item.via].filter(Boolean).join(' ')}`} roundId={item.ronda_id} />)}</ClinicalSection>
            <ClinicalSection icon={<Dna size={18} />} title="Microbiología" empty="Sin microbiología en este caso.">{caseMicrobiology.map((item) => <RecordItem key={item.id} title={item.tipo_muestra ?? 'Muestra sin tipo'} detail={[item.resultado_general, item.microorganismo, item.tipo_germen].filter(Boolean).join(' · ') || 'Sin resultado'} roundId={item.ronda_id} />)}</ClinicalSection>
            <ClinicalSection icon={<ShieldCheck size={18} />} title="Intervenciones" empty="Sin intervenciones en este caso.">{caseInterventions.map((item) => <RecordItem key={item.id} title={item.hubo_intervencion ? item.tipo_intervencion ?? 'Intervención PROA' : 'Sin intervención'} detail={item.descripcion_recomendacion ?? item.recomendacion ?? item.motivo_no_intervencion ?? 'Sin detalle'} roundId={item.ronda_id} />)}</ClinicalSection>
          </section>

          <section className="panel timeline-panel"><div className="subsection-heading"><div><p className="eyebrow">Actividad clínica</p><h2>Línea de tiempo</h2><p className="muted">Eventos del caso seleccionado, del más reciente al más antiguo.</p></div></div>{timeline.length ? <ol className="clinical-timeline">{timeline.map((item) => <li key={item.id}><span className="timeline-dot" /><div><div className="timeline-meta"><span className="status-badge">{item.kind}</span><time>{formatDateTime(item.occurredAt)}</time></div><strong>{item.title}</strong><p>{item.summary}</p>{item.roundId ? <Link className="button-link" to={`/rondas/${item.roundId}`}>Ver ronda relacionada</Link> : null}</div></li>)}</ol> : <p className="muted">Sin eventos fechados para este caso.</p>}</section>
        </div>
      </section>
    </main>
  )
}

function isActiveCase(item: CaseProa) { return item.estado === 'Activo' && !item.fecha_cierre }
function ageLabel(value?: string | null) { const age = ageFromBirthDate(value); return age === null ? 'Edad sin registrar' : `${age} años` }
function latestLocation(rounds: PatientRecordBundle['rounds'], item: CaseProa, services: Map<string, PatientRecordBundle['services'][number]>) { const round = rounds[0]; return (round?.servicio_id ? services.get(round.servicio_id)?.nombre : null) ?? round?.ubicacion ?? item.ubicacion_actual ?? 'Sin registro' }
function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <article className="record-summary-card"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></article> }
function Data({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div> }
function ClinicalSection({ icon, title, empty, children }: { icon: React.ReactNode; title: string; empty: string; children: React.ReactNode[] }) { return <section className="panel clinical-record-section"><header>{icon}<h2>{title}</h2></header>{children.length ? <div className="record-item-list">{children}</div> : <p className="muted">{empty}</p>}</section> }
function RecordItem({ title, detail, roundId }: { title: string; detail: string; roundId?: string | null }) { return <article><strong>{title}</strong><p>{detail}</p>{roundId ? <Link to={`/rondas/${roundId}`}>Abrir ronda</Link> : null}</article> }
