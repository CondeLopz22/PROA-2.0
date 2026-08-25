import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ClipboardPlus,
  FileText,
  History,
  Pill,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  TestTube2,
  Trash2,
} from 'lucide-react'
import { searchCie10, type Cie10Item } from '../data/cie10'
import { useAuth } from '../features/auth/authContext'
import { useIps } from '../features/ips/ipsContext'
import { ageFromBirthDate, formatDate, formatDateTime } from '../lib/date'
import {
  getProaCategories,
  getAntimicrobialCatalog,
  getInterventionCatalog,
  getMicroorganismCatalog,
  getSampleTypes,
  catalogLabel,
} from '../services/catalogService'
import {
  getRoundClinicalBundle,
  replaceRoundDiagnoses,
  saveRoundContext,
  type DiagnosisDraft,
} from '../services/clinicalRoundService'
import {
  calculateSavedDays,
  emptyInterventionDraft,
  interventionDraftFromBundle,
  interventionOrigins,
  noInterventionReasons,
  recommendationOptions,
  getRoundIntervention,
  replaceRoundIntervention,
  type InterventionDraft,
} from '../services/interventionService'
import { getIpsServices } from '../services/ipsService'
import {
  emptyMicrobiologyDraft,
  getCaseMicrobiology,
  getRoundMicrobiology,
  microbiologyDraftFromBundle,
  replaceRoundMicrobiology,
  type MicrobiologyBundle,
  type MicrobiologyDraft,
  type SensitivityDraft,
} from '../services/microbiologyService'
import { confirmRoundWithNote, generateProaNote, getLatestRoundNote, saveRoundNoteDraft } from '../services/noteService'
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
  MicroorganismCatalogItem,
  ProaNote,
  RoundClinicalBundle,
  SampleTypeCatalogItem,
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
const microbiologyResults = ['Positivo', 'Negativo', 'Contaminado', 'Sin crecimiento', 'Pendiente'] as const
const resistanceOptions = ['BLEE', 'AmpC', 'KPC', 'NDM', 'VIM', 'OXA-48', 'MRSA', 'SAMS', 'Otro']
const sensitivityResults = ['Sensible', 'Intermedio', 'Resistente', 'Susceptible con mayor exposición', 'No disponible'] as const
const acceptanceOptions = ['Sí', 'No', 'Parcialmente', 'Pendiente'] as const
const complianceOptions = ['Cumple', 'No cumple', 'No aplica', 'No evaluable'] as const

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
  const [interventionCatalog, setInterventionCatalog] = useState<CatalogItem[]>([])
  const [previousMicrobiology, setPreviousMicrobiology] = useState<MicrobiologyBundle[]>([])
  const [currentMicrobiology, setCurrentMicrobiology] = useState<MicrobiologyBundle[]>([])
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
  const [microbiology, setMicrobiology] = useState<MicrobiologyDraft>(emptyMicrobiologyDraft())
  const [intervention, setIntervention] = useState<InterventionDraft>(emptyInterventionDraft())
  const [note, setNote] = useState<ProaNote | null>(null)
  const [generatedNote, setGeneratedNote] = useState('')
  const [finalNote, setFinalNote] = useState('')

  const roundDateForCalculations = fromDateTimeLocal(fechaRonda) ?? bundle?.round.fecha_hora_ronda
  const casoId = bundle?.round.caso_id ?? bundle?.caseProa.id
  const age = ageFromBirthDate(bundle?.patient.fecha_nacimiento)
  const readOnly = bundle?.round.estado === 'Confirmada'
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
      const [nextBundle, nextCategories, nextInterventionCatalog] = await Promise.all([
        getRoundClinicalBundle(roundId, user.id),
        getProaCategories(),
        getInterventionCatalog(),
      ])
      const nextServices = await getIpsServices(nextBundle.round.ips_id)
      const nextCasoId = nextBundle.round.caso_id ?? nextBundle.caseProa.id
      const [roundMicrobiology, caseMicrobiology, roundIntervention, latestNote] = await Promise.all([
        getRoundMicrobiology(nextBundle.round.id),
        getCaseMicrobiology(nextCasoId, nextBundle.round.id),
        getRoundIntervention(nextBundle.round.id),
        getLatestRoundNote(nextBundle.round.id),
      ])
      setBundle(nextBundle)
      setCategories(nextCategories)
      setInterventionCatalog(nextInterventionCatalog)
      setServices(nextServices)
      setPreviousMicrobiology(caseMicrobiology)
      setCurrentMicrobiology(roundMicrobiology)
      setMicrobiology(microbiologyDraftFromBundle(roundMicrobiology[0]))
      setIntervention(interventionDraftFromBundle(roundIntervention))
      setNote(latestNote)
      setGeneratedNote(latestNote?.texto_generado ?? '')
      setFinalNote(latestNote?.texto_final ?? latestNote?.texto_generado ?? '')

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
    if (readOnly) return 'La ronda confirmada es de solo lectura.'
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

    if (microbiology.status !== 'No') {
      if (!microbiology.tipoMuestraId && !microbiology.tipoMuestra.trim()) return 'Selecciona o registra el tipo de muestra.'
      if (!microbiology.fechaToma) return 'Registra la fecha/hora de toma microbiológica.'
      if (microbiology.status === 'Sí' && !microbiology.resultadoGeneral) return 'Selecciona el resultado general de microbiología.'
      if (microbiology.resultadoGeneral === 'Positivo' && !microbiology.microorganismo.trim()) {
        return 'Selecciona el microorganismo del catálogo cuando el resultado es positivo.'
      }
      if (
        microbiology.esMuestraControl &&
        microbiology.muestraPreviaId &&
        !previousMicrobiology.some((item) => item.microbiology.id === microbiology.muestraPreviaId)
      ) {
        return 'La muestra de control debe relacionarse con una muestra previa del mismo caso.'
      }
    }

    if (intervention.huboIntervencion === 'Sí') {
      if (!intervention.tipoIntervencionId && !intervention.tipoIntervencion.trim()) return 'Selecciona el tipo de intervención.'
      const treatmentIds = new Set((bundle.treatments ?? []).map((treatment) => treatment.id))
      if (intervention.tratamientosRelacionados.some((id) => !treatmentIds.has(id))) {
        return 'La intervención solo puede relacionarse con tratamientos del mismo caso.'
      }
    }

    return null
  }

  function noteDiagnoses(rows: DiagnosisRound[]) {
    if (rows.length) return rows
    return [principalDiagnosis, infectiousDiagnosis, ...relatedDiagnoses]
      .filter((diagnosis) => diagnosis.codigo_cie10.trim() && diagnosis.descripcion_cie10.trim())
      .map((diagnosis, index) => ({
        id: diagnosis.id ?? `draft-${index}`,
        ronda_id: bundle?.round.id ?? '',
        codigo_cie10: diagnosis.codigo_cie10,
        descripcion_cie10: diagnosis.descripcion_cie10,
        tipo_diagnostico: diagnosis.tipo_diagnostico,
        categoria_proa: diagnosis.categoria_proa,
        categoria_proa_id: diagnosis.categoria_proa_id,
      }))
  }

  async function saveAllBlocks() {
    const validationError = validateForm()
    if (validationError) throw new Error(validationError)
    if (!bundle || !user || !casoId) throw new Error('La ronda no tiene contexto completo.')

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
    const savedDiagnoses = await replaceRoundDiagnoses({ round: savedRound, diagnoses: diagnosisPayload })

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

    await replaceRoundMicrobiology({ round: savedRound, draft: microbiology })
    await replaceRoundIntervention({
      round: savedRound,
      draft: {
        ...intervention,
        diasAhorrados: intervention.diasAhorrados ?? calculateSavedDays(bundle.treatments, intervention.tratamientosRelacionados),
      },
    })

    if (generatedNote || finalNote) {
      await saveRoundNoteDraft({ roundId: savedRound.id, generatedText: generatedNote, finalText: finalNote || generatedNote })
    }

    return { savedRound, savedDiagnoses }
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
      await saveAllBlocks()
      setSuccess('Progreso guardado. La ronda permanece en Borrador.')
      await load()
    } catch (saveError) {
      setError(readableError(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function refreshNote() {
    if (!bundle || !user) return
    if (finalNote && generatedNote && finalNote !== generatedNote) {
      const confirmed = window.confirm('La nota contiene modificaciones manuales. Regenerarla reemplazará esas modificaciones en el editor.')
      if (!confirmed) return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const { savedRound, savedDiagnoses } = await saveAllBlocks()
      const freshBundle = await getRoundClinicalBundle(savedRound.id, user.id)
      const freshMicrobiology = await getRoundMicrobiology(savedRound.id)
      const freshIntervention = await getRoundIntervention(savedRound.id)
      const freshInterventionDraft = interventionDraftFromBundle(freshIntervention)
      const text = generateProaNote({
        round: freshBundle.round,
        patient: freshBundle.patient,
        services,
        diagnoses: noteDiagnoses(savedDiagnoses),
        treatments: freshBundle.treatments,
        microbiology: freshMicrobiology,
        intervention: freshInterventionDraft,
      })
      const savedNote = await saveRoundNoteDraft({ roundId: savedRound.id, generatedText: text, finalText: text })
      setNote(savedNote)
      setGeneratedNote(text)
      setFinalNote(text)
      setSuccess('Nota actualizada desde datos estructurados.')
      await load()
    } catch (noteError) {
      setError(readableError(noteError))
    } finally {
      setSaving(false)
    }
  }

  async function confirmRound() {
    if (!bundle || !user) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const { savedRound, savedDiagnoses } = await saveAllBlocks()
      const freshBundle = await getRoundClinicalBundle(savedRound.id, user.id)
      const freshMicrobiology = await getRoundMicrobiology(savedRound.id)
      const freshIntervention = await getRoundIntervention(savedRound.id)
      const freshInterventionDraft = interventionDraftFromBundle(freshIntervention)
      const text =
        generatedNote ||
        generateProaNote({
          round: freshBundle.round,
          patient: freshBundle.patient,
          services,
          diagnoses: noteDiagnoses(savedDiagnoses),
          treatments: freshBundle.treatments,
          microbiology: freshMicrobiology,
          intervention: freshInterventionDraft,
        })
      await confirmRoundWithNote({
        roundId: savedRound.id,
        userId: user.id,
        generatedText: text,
        finalText: finalNote || text,
      })
      setSuccess('Ronda confirmada con nota PROA.')
      await load()
    } catch (confirmError) {
      setError(readableError(confirmError))
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
        <div className="button-row">
          <button className="secondary-button" disabled={saving || readOnly} onClick={refreshNote} type="button">
            <RefreshCw size={17} />
            Actualizar nota
          </button>
          <button className="primary-button" disabled={saving || readOnly} onClick={saveProgress} type="button">
            <Save size={17} />
            {saving ? 'Guardando...' : 'Guardar progreso'}
          </button>
        </div>
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
              <input disabled={readOnly} type="datetime-local" value={fechaRonda} onChange={(event) => setFechaRonda(event.target.value)} />
            </label>
            <label>
              Servicio
              <select disabled={readOnly} value={servicioId} onChange={(event) => setServicioId(event.target.value)}>
                <option value="">Sin seleccionar</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>{service.nombre}</option>
                ))}
              </select>
            </label>
            <label>
              Cama
              <input disabled={readOnly} value={cama} onChange={(event) => setCama(event.target.value)} />
            </label>
            <label>
              Tipo de valoración
              <select disabled={readOnly} value={tipoValoracion} onChange={(event) => setTipoValoracion(event.target.value as typeof tipoValoracion)}>
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
              <label><input checked={clinicalChanged === 'No'} disabled={readOnly} onChange={() => setClinicalChanged('No')} type="radio" /> No</label>
              <label><input checked={clinicalChanged === 'Sí'} disabled={readOnly} onChange={() => setClinicalChanged('Sí')} type="radio" /> Sí</label>
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
            readOnly={readOnly}
          />
        ) : (
          <article className="panel compact-note">
            <p>Se reutilizarán los diagnósticos y tipo de terapia de la ronda anterior. Registra la evolución clínica actual antes de guardar.</p>
            <label>
              Evolución clínica
              <select disabled={readOnly} value={evolucion} onChange={(event) => setEvolucion(event.target.value as typeof evolucion)}>
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
          readOnly={readOnly}
        />

        <MicrobiologyBlock
          currentMicrobiology={currentMicrobiology}
          draft={microbiology}
          previousMicrobiology={previousMicrobiology}
          readOnly={readOnly}
          setDraft={setMicrobiology}
        />

        <InterventionBlock
          catalog={interventionCatalog}
          draft={intervention}
          readOnly={readOnly}
          setDraft={setIntervention}
          treatmentActions={treatmentActions}
          treatments={bundle.treatments}
        />

        <NoteBlock
          finalNote={finalNote}
          generatedNote={generatedNote}
          note={note}
          onConfirm={confirmRound}
          onFinalNoteChange={setFinalNote}
          onRefresh={refreshNote}
          readOnly={readOnly}
          saving={saving}
        />
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

function MicrobiologyBlock({
  draft,
  setDraft,
  previousMicrobiology,
  currentMicrobiology,
  readOnly,
}: {
  draft: MicrobiologyDraft
  setDraft: (value: MicrobiologyDraft) => void
  previousMicrobiology: MicrobiologyBundle[]
  currentMicrobiology: MicrobiologyBundle[]
  readOnly: boolean
}) {
  const positive = draft.status === 'Sí' && draft.resultadoGeneral === 'Positivo'

  return (
    <article className="panel">
      <div className="panel-title">
        <TestTube2 size={20} />
        <div>
          <h2>Microbiología</h2>
          <p>Solo se registran estudios relacionados con la ronda.</p>
        </div>
      </div>

      {previousMicrobiology.length ? (
        <div className="subtle-list">
          {previousMicrobiology.slice(0, 4).map((item) => (
            <span key={item.microbiology.id}>
              {formatDate(item.microbiology.fecha_toma)} · {item.microbiology.tipo_muestra ?? 'Muestra'} ·{' '}
              {item.microbiology.microorganismo ?? item.microbiology.resultado_general ?? 'Sin resultado'}
              {item.resistances.length ? ` · ${item.resistances.map((row) => row.mecanismo).filter(Boolean).join(', ')}` : ''}
            </span>
          ))}
        </div>
      ) : null}

      {currentMicrobiology.length && readOnly ? (
        <div className="subtle-list">
          {currentMicrobiology.map((item) => (
            <span key={item.microbiology.id}>
              {item.microbiology.tipo_muestra ?? 'Muestra'} · {item.microbiology.resultado_general ?? 'Sin resultado'}
            </span>
          ))}
        </div>
      ) : null}

      <fieldset className="segmented-field">
        <legend>¿Tiene estudio microbiológico relacionado?</legend>
        {(['No', 'Pendiente', 'Sí'] as const).map((option) => (
          <label key={option}>
            <input checked={draft.status === option} disabled={readOnly} onChange={() => setDraft({ ...emptyMicrobiologyDraft(), status: option })} type="radio" />
            {option}
          </label>
        ))}
      </fieldset>

      {draft.status !== 'No' ? (
        <div className="form-grid clinical-grid">
          <SampleTypeAutocomplete
            readOnly={readOnly}
            value={draft.tipoMuestra}
            onSelect={(item) => setDraft({ ...draft, tipoMuestraId: item.id, tipoMuestra: catalogLabel(item) })}
          />
          <label>
            Fecha/hora de toma
            <input disabled={readOnly} type="datetime-local" value={draft.fechaToma} onChange={(event) => setDraft({ ...draft, fechaToma: event.target.value })} />
          </label>
          {draft.status === 'Sí' ? (
            <>
              <label>
                Fecha/hora de resultado
                <input disabled={readOnly} type="datetime-local" value={draft.fechaResultado} onChange={(event) => setDraft({ ...draft, fechaResultado: event.target.value })} />
              </label>
              <label>
                Resultado general
                <select disabled={readOnly} value={draft.resultadoGeneral} onChange={(event) => setDraft({ ...draft, resultadoGeneral: event.target.value as MicrobiologyDraft['resultadoGeneral'] })}>
                  <option value="">Sin seleccionar</option>
                  {microbiologyResults.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
            </>
          ) : null}
          <label>
            ¿El resultado modificó la conducta?
            <select disabled={readOnly} value={draft.impactoConducta} onChange={(event) => setDraft({ ...draft, impactoConducta: event.target.value as MicrobiologyDraft['impactoConducta'] })}>
              <option value="">Sin seleccionar</option>
              <option>Sí</option>
              <option>No</option>
              <option>Pendiente</option>
            </select>
          </label>
          <label className="checkbox-field">
            <input checked={draft.esMuestraControl} disabled={readOnly} onChange={(event) => setDraft({ ...draft, esMuestraControl: event.target.checked, muestraPreviaId: '' })} type="checkbox" />
            Es muestra de control
          </label>
          {draft.esMuestraControl ? (
            <label>
              Muestra previa
              <select disabled={readOnly} value={draft.muestraPreviaId} onChange={(event) => setDraft({ ...draft, muestraPreviaId: event.target.value })}>
                <option value="">Sin seleccionar</option>
                {previousMicrobiology.map((item) => (
                  <option key={item.microbiology.id} value={item.microbiology.id}>
                    {formatDate(item.microbiology.fecha_toma)} · {item.microbiology.tipo_muestra ?? item.microbiology.resultado_general}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      {positive ? (
        <div className="subsection">
          <div className="form-grid clinical-grid">
            <MicroorganismAutocomplete
              readOnly={readOnly}
              value={draft.microorganismo}
              onSelect={(item) =>
                setDraft({
                  ...draft,
                  microorganismoId: item.id,
                  microorganismo: catalogLabel(item),
                  tipoGermen: item.tipo_germen ?? '',
                })
              }
            />
            <label>
              Tipo de germen
              <input disabled value={draft.tipoGermen || 'Derivado del catálogo cuando existe'} onChange={() => undefined} />
            </label>
          </div>

          <RepeatHeading
            disabled={readOnly}
            label="Mecanismos de resistencia"
            onAdd={() => setDraft({ ...draft, resistencias: [...draft.resistencias, { mecanismo: '' }] })}
          />
          <div className="repeat-list">
            {draft.resistencias.map((item, index) => (
              <div className="repeat-row" key={`${item.id ?? 'new-resistance'}-${index}`}>
                <label>
                  Mecanismo
                  <select
                    disabled={readOnly}
                    value={resistanceOptions.includes(item.mecanismo) ? item.mecanismo : 'Otro'}
                    onChange={(event) => {
                      const copy = [...draft.resistencias]
                      copy[index] = { ...item, mecanismo: event.target.value === 'Otro' ? '' : event.target.value }
                      setDraft({ ...draft, resistencias: copy })
                    }}
                  >
                    <option value="">Sin seleccionar</option>
                    {resistanceOptions.map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
                <button className="icon-button" disabled={readOnly} onClick={() => setDraft({ ...draft, resistencias: draft.resistencias.filter((_, itemIndex) => itemIndex !== index) })} type="button">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <RepeatHeading
            disabled={readOnly}
            label="Sensibilidad relevante"
            onAdd={() => setDraft({ ...draft, sensibilidades: [...draft.sensibilidades, { antimicrobianoId: '', antimicrobiano: '', resultado: '' }] })}
          />
          <div className="repeat-list">
            {draft.sensibilidades.map((item, index) => (
              <SensitivityRow
                draft={item}
                key={`${item.id ?? 'new-sensitivity'}-${index}`}
                onChange={(next) => {
                  const copy = [...draft.sensibilidades]
                  copy[index] = next
                  setDraft({ ...draft, sensibilidades: copy })
                }}
                onRemove={() => setDraft({ ...draft, sensibilidades: draft.sensibilidades.filter((_, itemIndex) => itemIndex !== index) })}
                readOnly={readOnly}
              />
            ))}
          </div>
        </div>
      ) : null}
    </article>
  )
}

function InterventionBlock({
  catalog,
  draft,
  setDraft,
  treatments,
  treatmentActions,
  readOnly,
}: {
  catalog: CatalogItem[]
  draft: InterventionDraft
  setDraft: (value: InterventionDraft) => void
  treatments: Treatment[]
  treatmentActions: Record<string, TreatmentActionDraft | undefined>
  readOnly: boolean
}) {
  const calculatedDays = calculateSavedDays(treatments, draft.tratamientosRelacionados)
  const actions = Object.entries(treatmentActions).filter(([, action]) => Boolean(action))

  return (
    <article className="panel">
      <div className="panel-title">
        <ShieldCheck size={20} />
        <div>
          <h2>Intervención PROA</h2>
          <p>Intervención, aceptación y adherencia se registran por separado.</p>
        </div>
      </div>

      {actions.length ? (
        <div className="subtle-list">
          {actions.map(([treatmentId, action]) => (
            <span key={treatmentId}>
              Durante esta ronda: {action?.kind} · {treatmentName(treatments.find((item) => item.id === treatmentId) ?? { id: treatmentId })}
            </span>
          ))}
        </div>
      ) : null}

      <fieldset className="segmented-field">
        <legend>¿Hubo intervención PROA?</legend>
        <label><input checked={draft.huboIntervencion === 'Sí'} disabled={readOnly} onChange={() => setDraft({ ...draft, huboIntervencion: 'Sí' })} type="radio" /> Sí</label>
        <label><input checked={draft.huboIntervencion === 'No'} disabled={readOnly} onChange={() => setDraft({ ...draft, huboIntervencion: 'No' })} type="radio" /> No</label>
      </fieldset>

      {draft.huboIntervencion === 'No' ? (
        <div className="form-grid clinical-grid">
          <label>
            Motivo de no intervención
            <select disabled={readOnly} value={draft.motivoNoIntervencion} onChange={(event) => setDraft({ ...draft, motivoNoIntervencion: event.target.value })}>
              <option value="">Sin seleccionar</option>
              {noInterventionReasons.map((reason) => <option key={reason}>{reason}</option>)}
            </select>
          </label>
          {draft.motivoNoIntervencion === 'Otro' ? (
            <label>
              Descripción breve
              <input disabled={readOnly} value={draft.descripcionMotivoNoIntervencion} onChange={(event) => setDraft({ ...draft, descripcionMotivoNoIntervencion: event.target.value })} />
            </label>
          ) : null}
          <FollowUpFields draft={draft} readOnly={readOnly} setDraft={setDraft} />
        </div>
      ) : null}

      {draft.huboIntervencion === 'Sí' ? (
        <div className="form-grid clinical-grid">
          <label>
            Tipo de intervención
            <select
              disabled={readOnly}
              value={draft.tipoIntervencionId}
              onChange={(event) => {
                const item = catalog.find((candidate) => candidate.id === event.target.value)
                setDraft({ ...draft, tipoIntervencionId: event.target.value, tipoIntervencion: item ? catalogLabel(item) : '' })
              }}
            >
              <option value="">Sin seleccionar</option>
              {catalog.map((item) => <option key={item.id} value={item.id}>{catalogLabel(item)}</option>)}
            </select>
          </label>
          <label>
            Origen/motivo
            <select disabled={readOnly} value={draft.origenIntervencion} onChange={(event) => setDraft({ ...draft, origenIntervencion: event.target.value })}>
              <option value="">Sin seleccionar</option>
              {interventionOrigins.map((origin) => <option key={origin}>{origin}</option>)}
            </select>
          </label>
          <label>
            Recomendación
            <select disabled={readOnly} value={draft.recomendacion} onChange={(event) => setDraft({ ...draft, recomendacion: event.target.value })}>
              <option value="">Sin seleccionar</option>
              {recommendationOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>
            Aceptación
            <select disabled={readOnly} value={draft.aceptacion} onChange={(event) => setDraft({ ...draft, aceptacion: event.target.value as InterventionDraft['aceptacion'] })}>
              <option value="">Sin seleccionar</option>
              {acceptanceOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          {(draft.aceptacion === 'No' || draft.aceptacion === 'Parcialmente') ? (
            <label>
              Motivo no aceptación
              <input disabled={readOnly} value={draft.motivoNoAceptacion} onChange={(event) => setDraft({ ...draft, motivoNoAceptacion: event.target.value })} />
            </label>
          ) : null}
          <label className="full-span">
            Descripción opcional
            <textarea disabled={readOnly} value={draft.descripcionRecomendacion} onChange={(event) => setDraft({ ...draft, descripcionRecomendacion: event.target.value })} />
          </label>
          <div className="full-span treatment-selector">
            {treatments.map((treatment) => (
              <label key={treatment.id} className="checkbox-field">
                <input
                  checked={draft.tratamientosRelacionados.includes(treatment.id)}
                  disabled={readOnly}
                  onChange={(event) => {
                    const selected = event.target.checked
                      ? [...draft.tratamientosRelacionados, treatment.id]
                      : draft.tratamientosRelacionados.filter((id) => id !== treatment.id)
                    setDraft({ ...draft, tratamientosRelacionados: Array.from(new Set(selected)) })
                  }}
                  type="checkbox"
                />
                {treatmentName(treatment)}
              </label>
            ))}
          </div>
          {calculatedDays !== null ? <p className="muted full-span">Días ahorrados calculados: {calculatedDays}</p> : null}
          <FollowUpFields draft={draft} readOnly={readOnly} setDraft={setDraft} />
        </div>
      ) : null}

      {draft.huboIntervencion ? (
        <div className="form-grid clinical-grid">
          <label>
            Cumplimiento de guía/protocolo
            <select disabled={readOnly} value={draft.cumplimientoGuia} onChange={(event) => setDraft({ ...draft, cumplimientoGuia: event.target.value as InterventionDraft['cumplimientoGuia'] })}>
              <option value="">Sin seleccionar</option>
              {complianceOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          {draft.cumplimientoGuia === 'No cumple' ? (
            <label>
              Motivo no cumplimiento
              <input disabled={readOnly} value={draft.motivoNoCumplimiento} onChange={(event) => setDraft({ ...draft, motivoNoCumplimiento: event.target.value })} />
            </label>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function NoteBlock({
  generatedNote,
  finalNote,
  note,
  onFinalNoteChange,
  onRefresh,
  onConfirm,
  saving,
  readOnly,
}: {
  generatedNote: string
  finalNote: string
  note: ProaNote | null
  onFinalNoteChange: (value: string) => void
  onRefresh: () => void
  onConfirm: () => void
  saving: boolean
  readOnly: boolean
}) {
  return (
    <article className="panel">
      <div className="panel-title">
        <FileText size={20} />
        <div>
          <h2>Nota de Evolución PROA</h2>
          <p>Texto generado por plantilla y editable antes de confirmar.</p>
        </div>
      </div>
      <textarea
        className="note-editor"
        disabled={readOnly}
        placeholder="Actualiza la nota para generarla desde los datos de la ronda."
        value={finalNote}
        onChange={(event) => onFinalNoteChange(event.target.value)}
      />
      {note?.version ? <p className="muted">Versión {note.version}{note.fecha_confirmacion ? ` · Confirmada ${formatDateTime(note.fecha_confirmacion)}` : ''}</p> : null}
      {generatedNote && finalNote !== generatedNote ? <p className="muted">La nota tiene edición manual sobre el texto generado.</p> : null}
      <div className="button-row">
        <button className="secondary-button" disabled={saving || readOnly} onClick={onRefresh} type="button">
          <RefreshCw size={16} />
          Actualizar nota
        </button>
        <button className="primary-button" disabled={saving || readOnly || !finalNote.trim()} onClick={onConfirm} type="button">
          <CheckCircle2 size={16} />
          Confirmar ronda
        </button>
      </div>
    </article>
  )
}

function RepeatHeading({ label, onAdd, disabled }: { label: string; onAdd: () => void; disabled: boolean }) {
  return (
    <div className="subsection-heading">
      <h3>{label}</h3>
      <button className="secondary-button" disabled={disabled} onClick={onAdd} type="button">
        <Plus size={16} />
        Agregar
      </button>
    </div>
  )
}

function FollowUpFields({
  draft,
  setDraft,
  readOnly,
}: {
  draft: InterventionDraft
  setDraft: (value: InterventionDraft) => void
  readOnly: boolean
}) {
  return (
    <>
      <label className="checkbox-field">
        <input checked={draft.requiereSeguimiento} disabled={readOnly} onChange={(event) => setDraft({ ...draft, requiereSeguimiento: event.target.checked })} type="checkbox" />
        Requiere seguimiento
      </label>
      {draft.requiereSeguimiento ? (
        <>
          <label>
            Fecha seguimiento
            <input disabled={readOnly} type="date" value={draft.fechaSeguimiento} onChange={(event) => setDraft({ ...draft, fechaSeguimiento: event.target.value })} />
          </label>
          <label>
            Motivo seguimiento
            <input disabled={readOnly} value={draft.motivoSeguimiento} onChange={(event) => setDraft({ ...draft, motivoSeguimiento: event.target.value })} />
          </label>
        </>
      ) : null}
    </>
  )
}

function SensitivityRow({
  draft,
  onChange,
  onRemove,
  readOnly,
}: {
  draft: SensitivityDraft
  onChange: (value: SensitivityDraft) => void
  onRemove: () => void
  readOnly: boolean
}) {
  return (
    <div className="repeat-row">
      <div className="form-grid compact-treatment">
        <AntimicrobialAutocomplete
          readOnly={readOnly}
          value={draft.antimicrobiano}
          onSelect={(item) => onChange({ ...draft, antimicrobianoId: item.id, antimicrobiano: catalogLabel(item) })}
        />
        <label>
          Resultado
          <select disabled={readOnly} value={draft.resultado} onChange={(event) => onChange({ ...draft, resultado: event.target.value as SensitivityDraft['resultado'] })}>
            <option value="">Sin seleccionar</option>
            {sensitivityResults.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
      </div>
      <button className="icon-button" disabled={readOnly} onClick={onRemove} type="button">
        <Trash2 size={16} />
      </button>
    </div>
  )
}

function SampleTypeAutocomplete({
  value,
  onSelect,
  readOnly,
}: {
  value: string
  onSelect: (item: SampleTypeCatalogItem) => void
  readOnly: boolean
}) {
  const [query, setQuery] = useState(value)
  const [items, setItems] = useState<SampleTypeCatalogItem[]>([])

  useEffect(() => {
    let mounted = true
    getSampleTypes(query)
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
    <div className="autocomplete">
      <label>
        Tipo de muestra
        <input disabled={readOnly} placeholder="Buscar tipo de muestra" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {query && !readOnly ? (
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

function MicroorganismAutocomplete({
  value,
  onSelect,
  readOnly,
}: {
  value: string
  onSelect: (item: MicroorganismCatalogItem) => void
  readOnly: boolean
}) {
  const [query, setQuery] = useState(value)
  const [items, setItems] = useState<MicroorganismCatalogItem[]>([])

  useEffect(() => {
    let mounted = true
    getMicroorganismCatalog(query)
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
    <div className="autocomplete">
      <label>
        Microorganismo
        <input disabled={readOnly} placeholder="Buscar microorganismo" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {query && !readOnly ? (
        <div className="autocomplete-list">
          {items.map((item) => (
            <button key={item.id} onClick={() => onSelect(item)} type="button">
              <strong>{catalogLabel(item)}</strong>
              {item.tipo_germen ? <span>{item.tipo_germen}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
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
  readOnly: boolean
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
    readOnly,
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
          readOnly={readOnly}
        />
        <DiagnosisInput
          diagnosis={infectiousDiagnosis}
          label="Diagnóstico/indicación infecciosa"
          onChange={(next) => setInfectiousDiagnosis({ ...next, tipo_diagnostico: 'Infeccioso' })}
          readOnly={readOnly}
        />
        <label>
          Categoría PROA
          <select
            disabled={readOnly}
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
            disabled={readOnly}
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
                  readOnly={readOnly}
                />
                <button
                  className="icon-button"
                  disabled={readOnly}
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
          <select disabled={readOnly} value={tipoTerapia} onChange={(event) => setTipoTerapia(event.target.value as typeof tipoTerapia)}>
            <option value="">Sin seleccionar</option>
            {therapyTypes.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
        {tipoTerapia === 'Dirigida' ? (
          <label>
            ¿Basada en resultado microbiológico?
            <select
              value={terapiaMicro === null ? '' : terapiaMicro ? 'Sí' : 'No'}
              disabled={readOnly}
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
            <select disabled={readOnly} value={tipoProfilaxis} onChange={(event) => setTipoProfilaxis(event.target.value as typeof tipoProfilaxis)}>
              <option value="">Sin seleccionar</option>
              {prophylaxisTypes.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
        ) : null}
        <label>
          Evolución clínica
          <select disabled={readOnly} value={evolucion} onChange={(event) => setEvolucion(event.target.value as typeof evolucion)}>
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
  readOnly,
}: {
  diagnosis: DiagnosisDraft
  label: string
  onChange: (value: DiagnosisDraft) => void
  readOnly: boolean
}) {
  return (
    <div className="diagnosis-input">
      <span className="field-label">{label}</span>
      <Cie10Autocomplete
        key={`${diagnosis.codigo_cie10}-${diagnosis.descripcion_cie10}`}
        value={{ codigo: diagnosis.codigo_cie10, descripcion: diagnosis.descripcion_cie10 }}
        onSelect={(item) => onChange({ ...diagnosis, codigo_cie10: item.codigo, descripcion_cie10: item.descripcion })}
        readOnly={readOnly}
      />
    </div>
  )
}

function Cie10Autocomplete({
  value,
  onSelect,
  readOnly,
}: {
  value: { codigo: string; descripcion: string }
  onSelect: (item: Cie10Item) => void
  readOnly: boolean
}) {
  const [query, setQuery] = useState([value.codigo, value.descripcion].filter(Boolean).join(' - '))
  const results = searchCie10(query)

  return (
    <div className="autocomplete">
      <input
        placeholder="Buscar por código o texto, ej. neumo"
        disabled={readOnly}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {query && !readOnly ? (
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
  readOnly,
}: {
  activeTreatments: Treatment[]
  newTreatments: NewTreatmentDraft[]
  setNewTreatments: (value: NewTreatmentDraft[]) => void
  treatmentActions: Record<string, TreatmentActionDraft | undefined>
  setTreatmentActions: (value: Record<string, TreatmentActionDraft | undefined>) => void
  roundDate?: string | null
  readOnly: boolean
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
              readOnly={readOnly}
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
            disabled={readOnly || newTreatments.length >= 3}
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
              readOnly={readOnly}
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
  readOnly,
}: {
  treatment: Treatment
  action?: TreatmentActionDraft
  onActionChange: (value: TreatmentActionDraft | undefined) => void
  roundDate?: string | null
  readOnly: boolean
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
        <button className={action?.kind === 'Continuar' ? 'selected' : ''} disabled={readOnly} onClick={() => onActionChange({ kind: 'Continuar' })} type="button">Continuar</button>
        <button
          className={action?.kind === 'Modificar' ? 'selected' : ''}
          disabled={readOnly}
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
          disabled={readOnly}
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
          <label>Dosis<input disabled={readOnly} value={action.modification.dosis ?? ''} onChange={(event) => onActionChange({ kind: 'Modificar', modification: { ...action.modification, dosis: event.target.value } })} /></label>
          <label>Unidad<input disabled={readOnly} value={action.modification.unidad ?? ''} onChange={(event) => onActionChange({ kind: 'Modificar', modification: { ...action.modification, unidad: event.target.value } })} /></label>
          <label>Frecuencia<input disabled={readOnly} value={action.modification.frecuencia ?? ''} onChange={(event) => onActionChange({ kind: 'Modificar', modification: { ...action.modification, frecuencia: event.target.value } })} /></label>
          <label>Vía<input disabled={readOnly} value={action.modification.via ?? ''} onChange={(event) => onActionChange({ kind: 'Modificar', modification: { ...action.modification, via: event.target.value } })} /></label>
          <label>
            Motivo
            <select disabled={readOnly} value={action.modification.motivo} onChange={(event) => onActionChange({ kind: 'Modificar', modification: { ...action.modification, motivo: event.target.value } })}>
              {modificationReasons.map((reason) => <option key={reason}>{reason}</option>)}
            </select>
          </label>
          {action.modification.motivo === 'Otro' ? (
            <label>Descripción breve<input disabled={readOnly} value={action.modification.motivoOtro ?? ''} onChange={(event) => onActionChange({ kind: 'Modificar', modification: { ...action.modification, motivoOtro: event.target.value } })} /></label>
          ) : null}
        </div>
      ) : null}

      {action?.kind === 'Suspender' ? (
        <div className="form-grid compact-treatment">
          <label>Fecha suspensión<input disabled={readOnly} type="date" value={action.suspension.fechaFin} onChange={(event) => onActionChange({ kind: 'Suspender', suspension: { ...action.suspension, fechaFin: event.target.value } })} /></label>
          <label>
            Motivo
            <select disabled={readOnly} value={action.suspension.motivo} onChange={(event) => onActionChange({ kind: 'Suspender', suspension: { ...action.suspension, motivo: event.target.value } })}>
              {suspensionReasons.map((reason) => <option key={reason}>{reason}</option>)}
            </select>
          </label>
          {action.suspension.motivo === 'Otro' ? (
            <label>Descripción breve<input disabled={readOnly} value={action.suspension.motivoOtro ?? ''} onChange={(event) => onActionChange({ kind: 'Suspender', suspension: { ...action.suspension, motivoOtro: event.target.value } })} /></label>
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
  readOnly,
}: {
  draft: NewTreatmentDraft
  onChange: (value: NewTreatmentDraft) => void
  onRemove: () => void
  roundDate?: string | null
  readOnly: boolean
}) {
  const day = treatmentDay(draft.fechaInicio, roundDate)
  const end = estimatedEndDate(draft.fechaInicio, draft.duracionPrevistaDias ? Number(draft.duracionPrevistaDias) : null)

  return (
    <div className="new-treatment-row">
      <AntimicrobialAutocomplete
        key={draft.antimicrobialId || draft.antimicrobialName}
        value={draft.antimicrobialName}
        onSelect={(item) => onChange({ ...draft, antimicrobialId: item.id, antimicrobialName: catalogLabel(item) })}
        readOnly={readOnly}
      />
      <div className="form-grid compact-treatment">
        <label>Dosis<input disabled={readOnly} value={draft.dosis} onChange={(event) => onChange({ ...draft, dosis: event.target.value })} /></label>
        <label>Unidad<input disabled={readOnly} value={draft.unidad} onChange={(event) => onChange({ ...draft, unidad: event.target.value })} /></label>
        <label>Frecuencia<input disabled={readOnly} value={draft.frecuencia} onChange={(event) => onChange({ ...draft, frecuencia: event.target.value })} /></label>
        <label>Vía<input disabled={readOnly} value={draft.via} onChange={(event) => onChange({ ...draft, via: event.target.value })} /></label>
        <label>Fecha inicio<input disabled={readOnly} type="date" value={draft.fechaInicio} onChange={(event) => onChange({ ...draft, fechaInicio: event.target.value })} /></label>
        <label>Duración prevista (días)<input disabled={readOnly} min="0" type="number" value={draft.duracionPrevistaDias ?? ''} onChange={(event) => onChange({ ...draft, duracionPrevistaDias: event.target.value })} /></label>
      </div>
      <div className="treatment-derived">
        {day ? <span>Día {day} de tratamiento</span> : null}
        {end ? <span>Fin estimado: {formatDate(end)}</span> : null}
        <button className="ghost-button" disabled={readOnly} onClick={onRemove} type="button"><Trash2 size={16} /> Quitar</button>
      </div>
    </div>
  )
}

function AntimicrobialAutocomplete({
  value,
  onSelect,
  readOnly = false,
}: {
  value: string
  onSelect: (item: AntimicrobialCatalogItem) => void
  readOnly?: boolean
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
              {item.codigo ? <span>{item.codigo}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
