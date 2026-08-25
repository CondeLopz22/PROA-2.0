import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ClipboardPlus,
  History,
  Pill,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { searchCie10, type Cie10Item } from '../data/cie10'
import { useAuth } from '../features/auth/authContext'
import { useIps } from '../features/ips/ipsContext'
import { ageFromBirthDate, formatDate, formatDateTime } from '../lib/date'
import { getProaCategories, getAntimicrobialCatalog, catalogLabel } from '../services/catalogService'
import {
  getRoundClinicalBundle,
  replaceRoundDiagnoses,
  saveRoundContext,
  type DiagnosisDraft,
} from '../services/clinicalRoundService'
import { getIpsServices } from '../services/ipsService'
import { patientDisplayName } from '../services/patientService'
import { readableError } from '../services/supabaseErrors'
import {
  continueTreatment,
  createTreatment,
  estimatedEndDate,
  modifyTreatment,
  suspendTreatment,
  treatmentDay,
  treatmentName,
  type NewTreatmentDraft,
  type TreatmentActionDraft,
} from '../services/treatmentService'
import type {
  AntimicrobialCatalogItem,
  CatalogItem,
  DiagnosisRound,
  RoundClinicalBundle,
  ServiceIps,
  Treatment,
} from '../types/domain'

const therapyTypes = ['Empírica', 'Dirigida', 'Profiláctica'] as const
const evolutionOptions = ['Mejoría', 'Estable', 'Deterioro', 'No valorable'] as const
const prophylaxisTypes = ['Quirúrgica', 'Médica', 'Otra'] as const
const modificationReasons = [
  'Ajuste por función renal',
  'Ajuste por función hepática',
  'Ajuste farmacocinético/farmacodinámico',
  'Cambio de vía',
  'Intervención PROA',
  'Otro',
]
const suspensionReasons = [
  'Fin de tratamiento',
  'Intervención PROA',
  'Resultado microbiológico',
  'Evento adverso',
  'Cambio de tratamiento',
  'Falta de indicación',
  'Otro',
]

function toDateTimeLocal(value?: string | null) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 16)
}

function fromDateTimeLocal(value: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function diagnosisDraftFromRow(row: DiagnosisRound): DiagnosisDraft {
  return {
    id: row.id,
    codigo_cie10: row.codigo_cie10 ?? '',
    descripcion_cie10: row.descripcion_cie10 ?? '',
    tipo_diagnostico:
      row.tipo_diagnostico === 'Relacionado' || row.tipo_diagnostico === 'Infeccioso'
        ? row.tipo_diagnostico
        : 'Principal',
    categoria_proa: row.categoria_proa ?? null,
    categoria_proa_id: row.categoria_proa_id ?? null,
  }
}

function blankDiagnosis(tipo: DiagnosisDraft['tipo_diagnostico']): DiagnosisDraft {
  return { codigo_cie10: '', descripcion_cie10: '', tipo_diagnostico: tipo, categoria_proa: null, categoria_proa_id: null }
}

function emptyTreatmentDraft(): NewTreatmentDraft {
  return {
    antimicrobialId: '',
    antimicrobialName: '',
    dosis: '',
    unidad: '',
    frecuencia: '',
    via: '',
    fechaInicio: new Date().toISOString().slice(0, 10),
    duracionPrevistaDias: '',
  }
}

export function RoundEditorPage() {
  const { roundId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { activeIps } = useIps()
  const [bundle, setBundle] = useState<RoundClinicalBundle | null>(null)
  const [services, setServices] = useState<ServiceIps[]>([])
  const [categories, setCategories] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [fechaRonda, setFechaRonda] = useState('')
  const [servicioId, setServicioId] = useState('')
  const [cama, setCama] = useState('')
  const [tipoValoracion, setTipoValoracion] = useState<'Primera valoración' | 'Seguimiento'>('Primera valoración')
  const [clinicalChanged, setClinicalChanged] = useState<'No' | 'Sí'>('Sí')
  const [tipoTerapia, setTipoTerapia] = useState<(typeof therapyTypes)[number] | ''>('')
  const [terapiaMicro, setTerapiaMicro] = useState<boolean | null>(null)
  const [tipoProfilaxis, setTipoProfilaxis] = useState<(typeof prophylaxisTypes)[number] | ''>('')
  const [evolucion, setEvolucion] = useState<(typeof evolutionOptions)[number] | ''>('')
  const [principalDiagnosis, setPrincipalDiagnosis] = useState<DiagnosisDraft>(blankDiagnosis('Principal'))
  const [infectiousDiagnosis, setInfectiousDiagnosis] = useState<DiagnosisDraft>(blankDiagnosis('Infeccioso'))
  const [relatedDiagnoses, setRelatedDiagnoses] = useState<DiagnosisDraft[]>([])
  const [newTreatments, setNewTreatments] = useState<NewTreatmentDraft[]>([])
  const [treatmentActions, setTreatmentActions] = useState<Record<string, TreatmentActionDraft | undefined>>({})

  const roundDateForCalculations = fromDateTimeLocal(fechaRonda) ?? bundle?.round.fecha_hora_ronda
  const casoId = bundle?.round.caso_id ?? bundle?.caseProa.id
  const age = ageFromBirthDate(bundle?.patient.fecha_nacimiento)
  const activeTreatments = useMemo(
    () =>
      (bundle?.treatments ?? []).filter(
        (treatment) => treatment.estado === 'Activo',
      ),
    [bundle?.treatments],
  )

  async function load() {
    if (!roundId || !user) return
    setLoading(true)
    setError(null)
    try {
      const [nextBundle, nextCategories] = await Promise.all([
        getRoundClinicalBundle(roundId, user.id),
        getProaCategories(),
      ])
      const nextServices = await getIpsServices(nextBundle.round.ips_id)
      setBundle(nextBundle)
      setCategories(nextCategories)
      setServices(nextServices)

      setFechaRonda(toDateTimeLocal(nextBundle.round.fecha_hora_ronda))
      setServicioId(nextBundle.round.servicio_id ?? '')
      setCama(nextBundle.round.cama ?? nextBundle.caseProa.cama_actual ?? '')
      setTipoValoracion(
        nextBundle.round.tipo_valoracion === 'Seguimiento' || nextBundle.previousRound
          ? 'Seguimiento'
          : 'Primera valoración',
      )
      setTipoTerapia(
        (nextBundle.round.tipo_terapia as (typeof therapyTypes)[number] | null) ??
          (nextBundle.previousRound?.tipo_terapia as (typeof therapyTypes)[number] | null) ??
          '',
      )
      setTerapiaMicro(nextBundle.round.terapia_dirigida_por_microbiologia ?? null)
      setTipoProfilaxis(
        (nextBundle.round.tipo_profilaxis as (typeof prophylaxisTypes)[number] | null) ??
          (nextBundle.previousRound?.tipo_profilaxis as (typeof prophylaxisTypes)[number] | null) ??
          '',
      )
      setEvolucion((nextBundle.round.evolucion_clinica as (typeof evolutionOptions)[number] | null) ?? '')

      const rows = nextBundle.diagnoses.length ? nextBundle.diagnoses : nextBundle.previousDiagnoses
      const principal = rows.find((row) => row.tipo_diagnostico === 'Principal')
      const infectious = rows.find((row) => row.tipo_diagnostico === 'Infeccioso')
      setPrincipalDiagnosis(principal ? diagnosisDraftFromRow(principal) : blankDiagnosis('Principal'))
      setInfectiousDiagnosis(infectious ? diagnosisDraftFromRow(infectious) : blankDiagnosis('Infeccioso'))
      setRelatedDiagnoses(rows.filter((row) => row.tipo_diagnostico === 'Relacionado').map(diagnosisDraftFromRow))
      setClinicalChanged(nextBundle.round.tipo_valoracion === 'Seguimiento' && !nextBundle.diagnoses.length ? 'No' : 'Sí')
      setNewTreatments([])
      setTreatmentActions({})
    } catch (loadError) {
      setError(readableError(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId, user?.id])

  function validateForm() {
    if (!bundle || !activeIps || !user || !casoId) return 'La ronda no tiene contexto completo.'
    if (bundle.round.ips_id !== activeIps.id) return 'La ronda no pertenece a la IPS activa.'
    if (bundle.patient.ips_id !== activeIps.id) return 'El paciente no pertenece a la IPS activa.'
    if (bundle.caseProa.paciente_id !== bundle.patient.id) return 'El caso no corresponde al paciente seleccionado.'

    for (const draft of newTreatments) {
      if (!draft.antimicrobialId) return 'Selecciona el antimicrobiano desde el catálogo.'
      const dose = Number(draft.dosis)
      if (draft.dosis && (!Number.isFinite(dose) || dose < 0)) return 'La dosis no puede ser negativa.'
      const duration = draft.duracionPrevistaDias ? Number(draft.duracionPrevistaDias) : null
      if (duration !== null && (!Number.isInteger(duration) || duration < 0)) {
        return 'La duración prevista no puede ser negativa.'
      }
    }

    for (const action of Object.values(treatmentActions)) {
      if (action?.kind === 'Suspender') {
        const treatment = activeTreatments.find((item) => treatmentActions[item.id] === action)
        if (treatment?.fecha_inicio && action.suspension.fechaFin < treatment.fecha_inicio.slice(0, 10)) {
          return 'La fecha de suspensión no puede ser anterior a la fecha de inicio.'
        }
      }
    }

    return null
  }

  async function saveProgress() {
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }
    if (!bundle || !user || !casoId) return

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const inherited = clinicalChanged === 'No'
      const previous = bundle.previousRound
      const savedRound = await saveRoundContext({
        roundId: bundle.round.id,
        ipsId: bundle.round.ips_id,
        pacienteId: bundle.patient.id,
        casoId,
        servicioId,
        cama,
        fechaRonda: fromDateTimeLocal(fechaRonda),
        profesionalId: user.id,
        tipoValoracion,
        tipoTerapia: inherited ? ((previous?.tipo_terapia as typeof tipoTerapia) ?? tipoTerapia) : tipoTerapia,
        terapiaDirigidaPorMicrobiologia: tipoTerapia === 'Dirigida' ? terapiaMicro : null,
        tipoProfilaxis: tipoTerapia === 'Profiláctica' ? tipoProfilaxis : '',
        evolucionClinica: evolucion,
      })

      const diagnosisPayload =
        inherited && bundle.previousDiagnoses.length
          ? bundle.previousDiagnoses.map(diagnosisDraftFromRow)
          : [principalDiagnosis, infectiousDiagnosis, ...relatedDiagnoses]
      await replaceRoundDiagnoses({ round: savedRound, diagnoses: diagnosisPayload })

      for (const draft of newTreatments) {
        await createTreatment({
          ipsId: bundle.round.ips_id,
          pacienteId: bundle.patient.id,
          casoId,
          rondaId: bundle.round.id,
          draft,
        })
      }

      for (const treatment of activeTreatments) {
        const action = treatmentActions[treatment.id]
        if (!action) continue
        if (action.kind === 'Continuar') await continueTreatment(treatment.id, bundle.round.id)
        if (action.kind === 'Modificar') {
          await modifyTreatment({ treatment, rondaId: bundle.round.id, modification: action.modification })
        }
        if (action.kind === 'Suspender') {
          await suspendTreatment({ treatment, rondaId: bundle.round.id, suspension: action.suspension })
        }
      }

      setSuccess('Progreso guardado. La ronda permanece en Borrador.')
      await load()
    } catch (saveError) {
      setError(readableError(saveError))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <main className="page"><div className="panel">Cargando ronda...</div></main>

  if (!bundle) {
    return (
      <main className="page">
        <section className="panel empty-state">
          <h1>No se pudo cargar la ronda</h1>
          {error ? <p>{error}</p> : null}
          <button className="secondary-button" onClick={() => navigate('/rondas')} type="button">Volver</button>
        </section>
      </main>
    )
  }

  return (
    <main className="page round-form-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Ronda PROA</p>
          <h1>Formulario clínico</h1>
          <p className="muted">Ronda {bundle.round.estado ?? 'Borrador'} · {bundle.patient.tipo_identificacion} {bundle.patient.numero_identificacion}</p>
        </div>
        <button className="primary-button" disabled={saving} onClick={saveProgress} type="button">
          <Save size={17} />
          {saving ? 'Guardando...' : 'Guardar progreso'}
        </button>
      </section>

      {error ? <div className="alert error"><AlertCircle size={18} /> {error}</div> : null}
      {success ? <div className="alert success"><CheckCircle2 size={18} /> {success}</div> : null}

      <section className="continuous-form">
        <article className="panel">
          <div className="panel-title">
            <CalendarClock size={20} />
            <div>
              <h2>Contexto de ronda</h2>
              <p>IPS y profesional salen del contexto autenticado.</p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              IPS
              <input value={activeIps?.nombre ?? bundle.round.ips_id} disabled />
            </label>
            <label>
              Profesional
              <input value={bundle.profile?.nombre ?? user?.email ?? bundle.round.profesional_id ?? ''} disabled />
            </label>
            <label>
              Fecha/hora de ronda
              <input type="datetime-local" value={fechaRonda} onChange={(event) => setFechaRonda(event.target.value)} />
            </label>
            <label>
              Servicio
              <select value={servicioId} onChange={(event) => setServicioId(event.target.value)}>
                <option value="">Sin seleccionar</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>{service.nombre}</option>
                ))}
              </select>
            </label>
            <label>
              Cama
              <input value={cama} onChange={(event) => setCama(event.target.value)} />
            </label>
            <label>
              Tipo de valoración
              <select value={tipoValoracion} onChange={(event) => setTipoValoracion(event.target.value as typeof tipoValoracion)}>
                <option>Primera valoración</option>
                <option>Seguimiento</option>
              </select>
            </label>
          </div>
        </article>

        <article className="panel">
          <div className="panel-title">
            <ClipboardPlus size={20} />
            <div>
              <h2>Paciente y caso</h2>
              <p>Resumen de solo lectura. No duplica registro demográfico.</p>
            </div>
          </div>
          <div className="summary-grid">
            <SummaryItem label="Paciente" value={patientDisplayName(bundle.patient)} />
            <SummaryItem label="Identificación" value={`${bundle.patient.tipo_identificacion} ${bundle.patient.numero_identificacion}`} />
            <SummaryItem label="Sexo" value={bundle.patient.sexo ?? 'Sin registro'} />
            <SummaryItem label="Edad" value={age === null ? 'Sin registro' : `${age} años`} />
            <SummaryItem label="Caso" value={bundle.caseProa.estado ?? 'Sin estado'} />
            <SummaryItem label="Ubicación/cama" value={[services.find((item) => item.id === servicioId)?.nombre ?? bundle.caseProa.ubicacion_actual, cama].filter(Boolean).join(' · ') || 'Sin registro'} />
            <SummaryItem label="Última ronda" value={formatDateTime(bundle.previousRound?.fecha_hora_ronda)} />
            <SummaryItem label="Ronda actual" value={formatDateTime(fromDateTimeLocal(fechaRonda))} />
          </div>
        </article>

        {tipoValoracion === 'Seguimiento' ? (
          <article className="panel inherited-panel">
            <div className="panel-title">
              <History size={20} />
              <div>
                <h2>Información heredada de la ronda anterior</h2>
                <p>Se reutiliza si no hubo cambios clínicos.</p>
              </div>
            </div>
            <InheritedContext bundle={bundle} activeTreatments={activeTreatments} />
            <fieldset className="segmented-field">
              <legend>¿Hubo cambios en el contexto clínico?</legend>
              <label><input checked={clinicalChanged === 'No'} onChange={() => setClinicalChanged('No')} type="radio" /> No</label>
              <label><input checked={clinicalChanged === 'Sí'} onChange={() => setClinicalChanged('Sí')} type="radio" /> Sí</label>
            </fieldset>
          </article>
        ) : null}

        {clinicalChanged === 'Sí' || tipoValoracion === 'Primera valoración' ? (
          <ClinicalContextBlock
            categories={categories}
            principalDiagnosis={principalDiagnosis}
            infectiousDiagnosis={infectiousDiagnosis}
            relatedDiagnoses={relatedDiagnoses}
            setPrincipalDiagnosis={setPrincipalDiagnosis}
            setInfectiousDiagnosis={setInfectiousDiagnosis}
            setRelatedDiagnoses={setRelatedDiagnoses}
            tipoTerapia={tipoTerapia}
            setTipoTerapia={setTipoTerapia}
            terapiaMicro={terapiaMicro}
            setTerapiaMicro={setTerapiaMicro}
            tipoProfilaxis={tipoProfilaxis}
            setTipoProfilaxis={setTipoProfilaxis}
            evolucion={evolucion}
            setEvolucion={setEvolucion}
          />
        ) : (
          <article className="panel compact-note">
            <p>Se reutilizarán los diagnósticos y tipo de terapia de la ronda anterior. Registra la evolución clínica actual antes de guardar.</p>
            <label>
              Evolución clínica
              <select value={evolucion} onChange={(event) => setEvolucion(event.target.value as typeof evolucion)}>
                <option value="">Sin seleccionar</option>
                {evolutionOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
          </article>
        )}

        <AntimicrobialBlock
          activeTreatments={activeTreatments}
          newTreatments={newTreatments}
          setNewTreatments={setNewTreatments}
          treatmentActions={treatmentActions}
          setTreatmentActions={setTreatmentActions}
          roundDate={roundDateForCalculations}
        />

        <article className="panel compact-note">
          <h2>Paraclínicos</h2>
          <p>Reservado para el siguiente bloque. No se captura información adicional en Milestone 2A.</p>
        </article>
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

function InheritedContext({ bundle, activeTreatments }: { bundle: RoundClinicalBundle; activeTreatments: Treatment[] }) {
  const principal = bundle.previousDiagnoses.find((diagnosis) => diagnosis.tipo_diagnostico === 'Principal')
  const infectious = bundle.previousDiagnoses.find((diagnosis) => diagnosis.tipo_diagnostico === 'Infeccioso')
  return (
    <div className="inherited-grid">
      <SummaryItem label="Diagnóstico principal" value={principal?.descripcion_cie10 ?? 'Sin registro'} />
      <SummaryItem label="Indicación infecciosa" value={infectious?.descripcion_cie10 ?? 'Sin registro'} />
      <SummaryItem label="Tipo terapia" value={bundle.previousRound?.tipo_terapia ?? 'Sin registro'} />
      <SummaryItem label="Última evolución" value={bundle.previousRound?.evolucion_clinica ?? 'Sin registro'} />
      <div className="summary-item wide">
        <span>Tratamientos activos</span>
        <strong>{activeTreatments.length ? activeTreatments.map(treatmentName).join(', ') : 'Sin tratamientos activos'}</strong>
      </div>
    </div>
  )
}

function ClinicalContextBlock(props: {
  categories: CatalogItem[]
  principalDiagnosis: DiagnosisDraft
  infectiousDiagnosis: DiagnosisDraft
  relatedDiagnoses: DiagnosisDraft[]
  setPrincipalDiagnosis: (value: DiagnosisDraft) => void
  setInfectiousDiagnosis: (value: DiagnosisDraft) => void
  setRelatedDiagnoses: (value: DiagnosisDraft[]) => void
  tipoTerapia: (typeof therapyTypes)[number] | ''
  setTipoTerapia: (value: (typeof therapyTypes)[number] | '') => void
  terapiaMicro: boolean | null
  setTerapiaMicro: (value: boolean | null) => void
  tipoProfilaxis: (valueofProfilaxis) | ''
  setTipoProfilaxis: (value: (typeof prophylaxisTypes)[number] | '') => void
  evolucion: (typeof evolutionOptions)[number] | ''
  setEvolucion: (value: (typeof evolutionOptions)[number] | '') => void
}) {
  const {
    categories,
    principalDiagnosis,
    infectiousDiagnosis,
    relatedDiagnoses,
    setPrincipalDiagnosis,
    setInfectiousDiagnosis,
    setRelatedDiagnoses,
    tipoTerapia,
    setTipoTerapia,
    terapiaMicro,
    setTerapiaMicro,
    tipoProfilaxis,
    setTipoProfilaxis,
    evolucion,
    setEvolucion,
  } = props

  return (
    <article className="panel">
      <div className="panel-title">
        <ClipboardPlus size={20} />
        <div>
          <h2>Contexto clínico</h2>
          <p>Diagnósticos como filas independientes y variables analíticas estructuradas.</p>
        </div>
      </div>

      <div className="diagnosis-grid">
        <DiagnosisInput
          diagnosis={principalDiagnosis}
          label="Diagnóstico principal"
          onChange={(next) => setPrincipalDiagnosis({ ...next, tipo_diagnostico: 'Principal' })}
        />
        <DiagnosisInput
          diagnosis={infectiousDiagnosis}
          label="Diagnóstico/indicación infecciosa"
          onChange={(next) => setInfectiousDiagnosis({ ...next, tipo_diagnostico: 'Infeccioso' })}
        />
        <label>
          Categoría PROA
          <select
            value={infectiousDiagnosis.categoria_proa_id ?? ''}
            onChange={(event) =>
              setInfectiousDiagnosis({
                ...infectiousDiagnosis,
                categoria_proa_id: event.target.value || null,
                categoria_proa: categories.find((category) => category.id === event.target.value)
                  ? catalogLabel(categories.find((category) => category.id === event.target.value)!)
                  : null,
              })
            }
          >
            <option value="">Sin seleccionar</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{catalogLabel(category)}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="subsection">
        <div className="subsection-heading">
          <h3>Diagnósticos relacionados</h3>
          <button
            className="secondary-button"
            onClick={() => setRelatedDiagnoses([...relatedDiagnoses, blankDiagnosis('Relacionado')])}
            type="button"
          >
            <Plus size={16} />
            Agregar diagnóstico
          </button>
        </div>
        {relatedDiagnoses.length ? (
          <div className="repeat-list">
            {relatedDiagnoses.map((diagnosis, index) => (
              <div className="repeat-row" key={`${diagnosis.id ?? 'new'}-${index}`}>
                <DiagnosisInput
                  diagnosis={diagnosis}
                  label={`Relacionado ${index + 1}`}
                  onChange={(next) => {
                    const copy = [...relatedDiagnoses]
                    copy[index] = { ...next, tipo_diagnostico: 'Relacionado' }
                    setRelatedDiagnoses(copy)
                  }}
                />
                <button
                  className="icon-button"
                  onClick={() => setRelatedDiagnoses(relatedDiagnoses.filter((_, itemIndex) => itemIndex !== index))}
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Sin diagnósticos relacionados agregados.</p>
        )}
      </div>

      <div className="form-grid clinical-grid">
        <label>
          Tipo de terapia
          <select value={tipoTerapia} onChange={(event) => setTipoTerapia(event.target.value as typeof tipoTerapia)}>
            <option value="">Sin seleccionar</option>
            {therapyTypes.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
        {tipoTerapia === 'Dirigida' ? (
          <label>
            ¿Basada en resultado microbiológico?
            <select
              value={terapiaMicro === null ? '' : terapiaMicro ? 'Sí' : 'No'}
              onChange={(event) => setTerapiaMicro(event.target.value === '' ? null : event.target.value === 'Sí')}
            >
              <option value="">Sin seleccionar</option>
              <option>Sí</option>
              <option>No</option>
            </select>
          </label>
        ) : null}
        {tipoTerapia === 'Profiláctica' ? (
          <label>
            Tipo de profilaxis
            <select value={tipoProfilaxis} onChange={(event) => setTipoProfilaxis(event.target.value as typeof tipoProfilaxis)}>
              <option value="">Sin seleccionar</option>
              {prophylaxisTypes.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
        ) : null}
        <label>
          Evolución clínica
          <select value={evolucion} onChange={(event) => setEvolucion(event.target.value as typeof evolucion)}>
            <option value="">Sin seleccionar</option>
            {evolutionOptions.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
      </div>
    </article>
  )
}

type valueofProfilaxis = (typeof prophylaxisTypes)[number]

function DiagnosisInput({
  diagnosis,
  label,
  onChange,
}: {
  diagnosis: DiagnosisDraft
  label: string
  onChange: (value: DiagnosisDraft) => void
}) {
  return (
    <div className="diagnosis-input">
      <span className="field-label">{label}</span>
      <Cie10Autocomplete
        key={`${diagnosis.codigo_cie10}-${diagnosis.descripcion_cie10}`}
        value={{ codigo: diagnosis.codigo_cie10, descripcion: diagnosis.descripcion_cie10 }}
        onSelect={(item) => onChange({ ...diagnosis, codigo_cie10: item.codigo, descripcion_cie10: item.descripcion })}
      />
    </div>
  )
}

function Cie10Autocomplete({
  value,
  onSelect,
}: {
  value: { codigo: string; descripcion: string }
  onSelect: (item: Cie10Item) => void
}) {
  const [query, setQuery] = useState([value.codigo, value.descripcion].filter(Boolean).join(' - '))
  const results = searchCie10(query)

  return (
    <div className="autocomplete">
      <input
        placeholder="Buscar por código o texto, ej. neumo"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {query ? (
        <div className="autocomplete-list">
          {results.map((item) => (
            <button key={item.codigo} onClick={() => onSelect(item)} type="button">
              <strong>{item.codigo}</strong>
              <span>{item.descripcion}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function AntimicrobialBlock({
  activeTreatments,
  newTreatments,
  setNewTreatments,
  treatmentActions,
  setTreatmentActions,
  roundDate,
}: {
  activeTreatments: Treatment[]
  newTreatments: NewTreatmentDraft[]
  setNewTreatments: (value: NewTreatmentDraft[]) => void
  treatmentActions: Record<string, TreatmentActionDraft | undefined>
  setTreatmentActions: (value: Record<string, TreatmentActionDraft | undefined>) => void
  roundDate?: string | null
}) {
  return (
    <article className="panel">
      <div className="panel-title">
        <Pill size={20} />
        <div>
          <h2>Antimicrobianos</h2>
          <p>Solo tratamientos utilizados. Cada antimicrobiano se guarda como fila independiente.</p>
        </div>
      </div>

      {activeTreatments.length ? (
        <div className="treatment-grid">
          {activeTreatments.map((treatment) => (
            <TreatmentCard
              key={treatment.id}
              action={treatmentActions[treatment.id]}
              onActionChange={(action) => setTreatmentActions({ ...treatmentActions, [treatment.id]: action })}
              roundDate={roundDate}
              treatment={treatment}
            />
          ))}
        </div>
      ) : (
        <p className="muted">No hay tratamientos activos visibles para el caso.</p>
      )}

      <div className="subsection">
        <div className="subsection-heading">
          <h3>Nuevos tratamientos</h3>
          <button
            className="secondary-button"
            disabled={newTreatments.length >= 3}
            onClick={() => setNewTreatments([...newTreatments, emptyTreatmentDraft()])}
            type="button"
          >
            <Plus size={16} />
            Agregar antimicrobiano
          </button>
        </div>
        {newTreatments.length >= 3 ? <p className="muted">Máximo visual inicial: 3 tratamientos simultáneos.</p> : null}
        <div className="repeat-list">
          {newTreatments.map((draft, index) => (
            <NewTreatmentRow
              draft={draft}
              key={index}
              onChange={(next) => {
                const copy = [...newTreatments]
                copy[index] = next
                setNewTreatments(copy)
              }}
              onRemove={() => setNewTreatments(newTreatments.filter((_, itemIndex) => itemIndex !== index))}
              roundDate={roundDate}
            />
          ))}
        </div>
      </div>
    </article>
  )
}

function TreatmentCard({
  treatment,
  action,
  onActionChange,
  roundDate,
}: {
  treatment: Treatment
  action?: TreatmentActionDraft
  onActionChange: (value: TreatmentActionDraft | undefined) => void
  roundDate?: string | null
}) {
  const day = treatmentDay(treatment.fecha_inicio, roundDate)

  return (
    <div className="treatment-card">
      <div>
        <h3>{treatmentName(treatment)}</h3>
        <p>
          {[treatment.dosis, treatment.unidad, treatment.via, treatment.frecuencia].filter(Boolean).join(' · ') || 'Sin pauta completa'}
        </p>
        <span>Inicio: {formatDate(treatment.fecha_inicio)} {day ? `· Día ${day}` : ''}</span>
      </div>
      <div className="segmented-actions">
        <button className={action?.kind === 'Continuar' ? 'selected' : ''} onClick={() => onActionChange({ kind: 'Continuar' })} type="button">Continuar</button>
        <button
          className={action?.kind === 'Modificar' ? 'selected' : ''}
          onClick={() =>
            onActionChange({
              kind: 'Modificar',
              modification: {
                dosis: treatment.dosis === null || treatment.dosis === undefined ? '' : String(treatment.dosis),
                unidad: treatment.unidad ?? '',
                frecuencia: treatment.frecuencia ?? '',
                via: treatment.via ?? '',
                motivo: 'Intervención PROA',
              },
            })
          }
          type="button"
        >
          Modificar
        </button>
        <button
          className={action?.kind === 'Suspender' ? 'selected danger' : ''}
          onClick={() =>
            onActionChange({
              kind: 'Suspender',
              suspension: {
                fechaFin: new Date().toISOString().slice(0, 10),
                motivo: 'Fin de tratamiento',
              },
            })
          }
          type="button"
        >
          Suspender
        </button>
      </div>

      {action?.kind === 'Modificar' ? (
        <div className="form-grid compact-treatment">
          <label>Dosis<input value={action.modification.dosis ?? ''} onChange={(event) => onActionChange({ kind: 'Modificar', modification: { ...action.modification, dosis: event.target.value } })} /></label>
          <label>Unidad<input value={action.modification.unidad ?? ''} onChange={(event) => onActionChange({ kind: 'Modificar', modification: { ...action.modification, unidad: event.target.value } })} /></label>
          <label>Frecuencia<input value={action.modification.frecuencia ?? ''} onChange={(event) => onActionChange({ kind: 'Modificar', modification: { ...action.modification, frecuencia: event.target.value } })} /></label>
          <label>Vía<input value={action.modification.via ?? ''} onChange={(event) => onActionChange({ kind: 'Modificar', modification: { ...action.modification, via: event.target.value } })} /></label>
          <label>
            Motivo
            <select value={action.modification.motivo} onChange={(event) => onActionChange({ kind: 'Modificar', modification: { ...action.modification, motivo: event.target.value } })}>
              {modificationReasons.map((reason) => <option key={reason}>{reason}</option>)}
            </select>
          </label>
          {action.modification.motivo === 'Otro' ? (
            <label>Descripción breve<input value={action.modification.motivoOtro ?? ''} onChange={(event) => onActionChange({ kind: 'Modificar', modification: { ...action.modification, motivoOtro: event.target.value } })} /></label>
          ) : null}
        </div>
      ) : null}

      {action?.kind === 'Suspender' ? (
        <div className="form-grid compact-treatment">
          <label>Fecha suspensión<input type="date" value={action.suspension.fechaFin} onChange={(event) => onActionChange({ kind: 'Suspender', suspension: { ...action.suspension, fechaFin: event.target.value } })} /></label>
          <label>
            Motivo
            <select value={action.suspension.motivo} onChange={(event) => onActionChange({ kind: 'Suspender', suspension: { ...action.suspension, motivo: event.target.value } })}>
              {suspensionReasons.map((reason) => <option key={reason}>{reason}</option>)}
            </select>
          </label>
          {action.suspension.motivo === 'Otro' ? (
            <label>Descripción breve<input value={action.suspension.motivoOtro ?? ''} onChange={(event) => onActionChange({ kind: 'Suspender', suspension: { ...action.suspension, motivoOtro: event.target.value } })} /></label>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function NewTreatmentRow({
  draft,
  onChange,
  onRemove,
  roundDate,
}: {
  draft: NewTreatmentDraft
  onChange: (value: NewTreatmentDraft) => void
  onRemove: () => void
  roundDate?: string | null
}) {
  const day = treatmentDay(draft.fechaInicio, roundDate)
  const end = estimatedEndDate(draft.fechaInicio, draft.duracionPrevistaDias ? Number(draft.duracionPrevistaDias) : null)

  return (
    <div className="new-treatment-row">
      <AntimicrobialAutocomplete
        key={draft.antimicrobialId || draft.antimicrobialName}
        value={draft.antimicrobialName}
        onSelect={(item) => onChange({ ...draft, antimicrobialId: item.id, antimicrobialName: catalogLabel(item) })}
      />
      <div className="form-grid compact-treatment">
        <label>Dosis<input value={draft.dosis} onChange={(event) => onChange({ ...draft, dosis: event.target.value })} /></label>
        <label>Unidad<input value={draft.unidad} onChange={(event) => onChange({ ...draft, unidad: event.target.value })} /></label>
        <label>Frecuencia<input value={draft.frecuencia} onChange={(event) => onChange({ ...draft, frecuencia: event.target.value })} /></label>
        <label>Vía<input value={draft.via} onChange={(event) => onChange({ ...draft, via: event.target.value })} /></label>
        <label>Fecha inicio<input type="date" value={draft.fechaInicio} onChange={(event) => onChange({ ...draft, fechaInicio: event.target.value })} /></label>
        <label>Duración prevista (días)<input min="0" type="number" value={draft.duracionPrevistaDias ?? ''} onChange={(event) => onChange({ ...draft, duracionPrevistaDias: event.target.value })} /></label>
      </div>
      <div className="treatment-derived">
        {day ? <span>Día {day} de tratamiento</span> : null}
        {end ? <span>Fin estimado: {formatDate(end)}</span> : null}
        <button className="ghost-button" onClick={onRemove} type="button"><Trash2 size={16} /> Quitar</button>
      </div>
    </div>
  )
}

function AntimicrobialAutocomplete({
  value,
  onSelect,
}: {
  value: string
  onSelect: (item: AntimicrobialCatalogItem) => void
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
        <input placeholder="Buscar en catálogo" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {query ? (
        <div className="autocomplete-list">
          {items.map((item) => (
            <button key={item.id} onClick={() => onSelect(item)} type="button">
              <strong>{catalogLabel(item)}</strong>
              {item.codigo ? <span>{item.codigo}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
