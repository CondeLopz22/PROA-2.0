import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CalendarClock, CheckCircle2, FilePlus2, Search, Stethoscope, UserPlus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { useIps } from '../ips/ipsContext'
import { ageFromBirthDate, formatDate, formatDateTime } from '../../lib/date'
import { getIpsServices } from '../../services/ipsService'
import {
  createCase,
  createPatient,
  findPatientInIps,
  patientDisplayName,
} from '../../services/patientService'
import { createEmptyRound } from '../../services/roundService'
import { readableError } from '../../services/supabaseErrors'
import type { CaseProa, Patient, PatientLookupResult, RoundProa, ServiceIps } from '../../types/domain'

type Mode = 'round' | 'records'

const identificationTypes = ['CC', 'TI', 'RC', 'CE', 'PA', 'MS', 'AS']

export function PatientWorkflow({ mode }: { mode: Mode }) {
  const { activeIps, status: ipsStatus } = useIps()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tipo, setTipo] = useState('CC')
  const [numero, setNumero] = useState('')
  const [lookup, setLookup] = useState<PatientLookupResult | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdRound, setCreatedRound] = useState<RoundProa | null>(null)

  async function searchPatient(event?: FormEvent) {
    event?.preventDefault()
    if (!activeIps || !numero.trim()) return
    setLoading(true)
    setError(null)
    setLookup(null)
    setNotFound(false)
    setCreatedRound(null)

    try {
      const result = await findPatientInIps(activeIps.id, tipo, numero)
      setLookup(result)
      setNotFound(!result)
    } catch (searchError) {
      setError(readableError(searchError))
    } finally {
      setLoading(false)
    }
  }

  function handlePatientCreated(patient: Patient) {
    setLookup({
      patient,
      activeCase: null,
      historicalCases: [],
      latestRound: null,
      activeTreatments: [],
    })
    setNotFound(false)
  }

  async function handleCaseCreated(caso: CaseProa) {
    if (!lookup) return
    setLookup({
      ...lookup,
      activeCase: caso,
      historicalCases: lookup.historicalCases,
    })
  }

  return (
    <section className="workflow-grid">
      <article className="panel">
        <div className="panel-title">
          <Search size={20} />
          <div>
            <h2>Identificación</h2>
            <p>La búsqueda se ejecuta dentro de la IPS activa.</p>
          </div>
        </div>

        <form className="inline-form" onSubmit={searchPatient}>
          <label>
            Tipo
            <select value={tipo} onChange={(event) => setTipo(event.target.value)}>
              {identificationTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="grow">
            Número de identificación
            <input value={numero} onChange={(event) => setNumero(event.target.value)} required />
          </label>
          <button className="primary-button" disabled={loading || ipsStatus !== 'ready'} type="submit">
            {loading ? 'Buscando...' : 'Buscar paciente'}
          </button>
        </form>
        {error ? <div className="alert error">{error}</div> : null}
      </article>

      {notFound && activeIps ? (
        <CreatePatientCard
          ipsId={activeIps.id}
          numero={numero}
          tipo={tipo}
          onCreated={handlePatientCreated}
        />
      ) : null}

      {lookup && activeIps && user ? (
        <PatientSummary
          key={lookup.patient.id}
          lookup={lookup}
          mode={mode}
          ipsId={activeIps.id}
          userId={user.id}
          onCaseCreated={handleCaseCreated}
          onRoundCreated={(round) => {
            setCreatedRound(round)
            if (mode === 'round') navigate(`/rondas/${round.id}`)
          }}
        />
      ) : null}

      {createdRound ? (
        <article className="panel success-panel">
          <CheckCircle2 size={24} />
          <div>
            <h2>Ronda vacía creada</h2>
            <p>ID de ronda: {createdRound.id}</p>
            <p>Estado: {createdRound.estado ?? 'borrador'}</p>
            <Link className="primary-button" to={`/rondas/${createdRound.id}`}>
              Abrir formulario clínico
            </Link>
          </div>
        </article>
      ) : null}
    </section>
  )
}

function CreatePatientCard({
  ipsId,
  numero,
  tipo,
  onCreated,
}: {
  ipsId: string
  numero: string
  tipo: string
  onCreated: (patient: Patient) => void
}) {
  const [nombres, setNombres] = useState('')
  const [apellidos, setApellidos] = useState('')
  const [sexo, setSexo] = useState('')
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const patient = await createPatient({
        ipsId,
        tipoIdentificacion: tipo,
        numeroIdentificacion: numero,
        nombres,
        apellidos,
        sexo,
        fechaNacimiento,
      })
      onCreated(patient)
    } catch (createError) {
      setError(readableError(createError))
    } finally {
      setLoading(false)
    }
  }

  return (
    <article className="panel">
      <div className="panel-title">
        <UserPlus size={20} />
        <div>
          <h2>Paciente no encontrado</h2>
          <p>Crea el registro mínimo para iniciar seguimiento.</p>
        </div>
      </div>
      <form className="form-grid" onSubmit={submit}>
        <label>
          Nombres
          <input value={nombres} onChange={(event) => setNombres(event.target.value)} required />
        </label>
        <label>
          Apellidos
          <input value={apellidos} onChange={(event) => setApellidos(event.target.value)} required />
        </label>
        <label>
          Sexo
          <select value={sexo} onChange={(event) => setSexo(event.target.value)}>
            <option value="">Sin registrar</option>
            <option value="F">Femenino</option>
            <option value="M">Masculino</option>
            <option value="Otro">Otro</option>
          </select>
        </label>
        <label>
          Fecha de nacimiento
          <input type="date" value={fechaNacimiento} onChange={(event) => setFechaNacimiento(event.target.value)} />
        </label>
        {error ? <div className="alert error full-span">{error}</div> : null}
        <button className="primary-button full-span" disabled={loading} type="submit">
          {loading ? 'Creando...' : 'Crear paciente'}
        </button>
      </form>
    </article>
  )
}

function PatientSummary({
  lookup,
  mode,
  ipsId,
  userId,
  onCaseCreated,
  onRoundCreated,
}: {
  lookup: PatientLookupResult
  mode: Mode
  ipsId: string
  userId: string
  onCaseCreated: (caso: CaseProa) => void
  onRoundCreated: (round: RoundProa) => void
}) {
  const [selectedCaseId, setSelectedCaseId] = useState(lookup.activeCase?.id ?? '')
  const [services, setServices] = useState<ServiceIps[]>([])
  const [serviceId, setServiceId] = useState('')
  const [cama, setCama] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allCases = useMemo(
    () => [lookup.activeCase, ...lookup.historicalCases].filter(Boolean) as CaseProa[],
    [lookup.activeCase, lookup.historicalCases],
  )
  const selectedCase = allCases.find((caso) => caso.id === selectedCaseId) ?? lookup.activeCase
  const hasActiveCase = Boolean(lookup.activeCase)
  const age = ageFromBirthDate(lookup.patient.fecha_nacimiento)

  useEffect(() => {
    let mounted = true
    getIpsServices(ipsId)
      .then((items) => {
        if (mounted) setServices(items)
      })
      .catch(() => {
        if (mounted) setServices([])
      })
    return () => {
      mounted = false
    }
  }, [ipsId])

  async function createNewCase() {
    setLoading(true)
    setError(null)
    try {
      const caso = await createCase({ ipsId, pacienteId: lookup.patient.id })
      setSelectedCaseId(caso.id)
      onCaseCreated(caso)
      return caso
    } catch (caseError) {
      setError(readableError(caseError))
      return null
    } finally {
      setLoading(false)
    }
  }

  async function openRound() {
    let caseForRound = selectedCase ?? lookup.activeCase
    if (!caseForRound) {
      caseForRound = await createNewCase()
      if (!caseForRound) return
    }

    setLoading(true)
    setError(null)
    try {
      const round = await createEmptyRound({
        ipsId,
        pacienteId: lookup.patient.id,
        casoId: caseForRound.id,
        servicioId: serviceId || undefined,
        cama,
        tipoValoracion: hasActiveCase ? 'Seguimiento' : 'Primera valoración',
        profesionalId: userId,
      })
      onRoundCreated(round)
    } catch (roundError) {
      setError(readableError(roundError))
    } finally {
      setLoading(false)
    }
  }

  return (
    <article className="panel">
      <div className="panel-title">
        <Stethoscope size={20} />
        <div>
          <h2>{patientDisplayName(lookup.patient)}</h2>
          <p>
            {lookup.patient.tipo_identificacion} {lookup.patient.numero_identificacion}
          </p>
        </div>
      </div>

      <div className="summary-grid">
        <SummaryItem label="Sexo" value={lookup.patient.sexo ?? 'Sin registro'} />
        <SummaryItem label="Edad" value={age === null ? 'Sin registro' : `${age} años`} />
        <SummaryItem label="Caso activo" value={lookup.activeCase ? 'Sí' : 'No'} />
        <SummaryItem label="Última ronda" value={formatDateTime(lookup.latestRound?.fecha_hora_ronda)} />
      </div>

      {lookup.activeTreatments.length ? (
        <div className="subsection">
          <h3>Tratamientos activos</h3>
          <div className="pill-list">
            {lookup.activeTreatments.map((treatment) => (
              <span key={treatment.id} className="pill">
                {treatment.antimicrobiano ?? 'Antimicrobiano'} desde{' '}
                {formatDate(treatment.fecha_inicio)}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="subsection">
        <h3>Casos PROA</h3>
        {allCases.length ? (
          <div className="case-list">
            {allCases.map((caso) => (
              <label key={caso.id} className="case-row">
                <input
                  checked={selectedCaseId === caso.id}
                  name="selected-case"
                  onChange={() => setSelectedCaseId(caso.id)}
                  type="radio"
                />
                <span>
                  {caso.estado ?? 'Sin estado'} - apertura {formatDate(caso.fecha_apertura)}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="muted">Paciente sin casos PROA registrados.</p>
        )}
      </div>

      {mode === 'round' ? (
        <div className="round-actions">
          <div className="form-grid compact">
            <label>
              Servicio
              <select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
                <option value="">Sin seleccionar</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cama
              <input value={cama} onChange={(event) => setCama(event.target.value)} />
            </label>
          </div>
          <div className="button-row">
            {lookup.activeCase ? (
              <button className="primary-button" disabled={loading} onClick={openRound} type="button">
                <CalendarClock size={16} />
                Continuar caso activo
              </button>
            ) : null}
            <button className="secondary-button" disabled={loading} onClick={createNewCase} type="button">
              <FilePlus2 size={16} />
              Crear nuevo caso
            </button>
            <button
              className="primary-button"
              disabled={loading || !selectedCase}
              onClick={openRound}
              type="button"
            >
              <CalendarClock size={16} />
              Crear nueva ronda vacía
            </button>
          </div>
        </div>
      ) : null}

      {lookup.historicalCases.length ? (
        <div className="subsection">
          <h3>Histórico</h3>
          <p className="muted">{lookup.historicalCases.length} caso(s) histórico(s) visibles para la IPS activa.</p>
        </div>
      ) : null}
      {error ? <div className="alert error">{error}</div> : null}
    </article>
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
