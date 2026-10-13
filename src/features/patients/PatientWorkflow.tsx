import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CalendarClock, FilePlus2, Search, Stethoscope, UserPlus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { useIps } from '../ips/ipsContext'
import { ageFromBirthDate, formatDate, formatDateTime } from '../../lib/date'
import { getIpsServices } from '../../services/ipsService'
import {
  createPatient,
  findPatientInIps,
  patientDisplayName,
} from '../../services/patientService'
import { startCaseRound } from '../../services/roundService'
import { readableError } from '../../services/supabaseErrors'
import { canWriteOperationalData } from '../../services/permissionService'
import { getCaseReevaluation } from '../../services/reevaluationService'
import type { CaseProa, Patient, PatientLookupResult, ReevaluationMartRow, RoundProa, ServiceIps } from '../../types/domain'

type Mode = 'round' | 'records'

const identificationTypes = ['CC', 'TI', 'RC', 'CE', 'PA', 'MS', 'AS']

export function PatientWorkflow({ mode }: { mode: Mode }) {
  const { activeIps, status: ipsStatus, userType } = useIps()
  const { user } = useAuth()
  const canWrite = canWriteOperationalData(userType)
  const navigate = useNavigate()
  const [tipo, setTipo] = useState('CC')
  const [numero, setNumero] = useState('')
  const [lookup, setLookup] = useState<PatientLookupResult | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function searchPatient(event?: FormEvent) {
    event?.preventDefault()
    if (!activeIps || !numero.trim()) return
    setLoading(true)
    setError(null)
    setLookup(null)
    setNotFound(false)

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
      activeCaseCount: 0,
      historicalCases: [],
      latestRound: null,
      latestActiveCaseRound: null,
      activeTreatments: [],
    })
    setNotFound(false)
  }

  return (
    <section className="workflow-grid">
      <article className="panel">
        <div className="panel-title">
          <Search size={20} />
          <div>
            <h2>Identificación</h2>
            <p>{mode === 'round' ? 'Selecciona un paciente para continuar su caso o iniciar una primera valoración.' : 'La búsqueda se ejecuta dentro de la IPS activa.'}</p>
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

      {notFound && activeIps && canWrite ? (
        <CreatePatientCard
          ipsId={activeIps.id}
          numero={numero}
          tipo={tipo}
          onCreated={handlePatientCreated}
        />
      ) : null}
      {notFound && activeIps && !canWrite ? (
        <article className="panel">
          <div className="alert info">Paciente no encontrado. Tu perfil es de solo lectura y no permite crear nuevos registros.</div>
        </article>
      ) : null}

      {lookup && activeIps && user ? (
        <PatientSummary
          key={lookup.patient.id}
          lookup={lookup}
          ipsId={activeIps.id}
          onRoundCreated={(round) => {
            navigate(`/rondas/${round.id}`)
          }}
          canWrite={canWrite}
        />
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
  ipsId,
  onRoundCreated,
  canWrite,
}: {
  lookup: PatientLookupResult
  ipsId: string
  onRoundCreated: (round: RoundProa) => void
  canWrite: boolean
}) {
  const [selectedCaseId, setSelectedCaseId] = useState(lookup.activeCase?.id ?? '')
  const [services, setServices] = useState<ServiceIps[]>([])
  const [serviceId, setServiceId] = useState('')
  const [cama, setCama] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reevaluations, setReevaluations] = useState<ReevaluationMartRow[]>([])

  const allCases = useMemo(
    () => [lookup.activeCase, ...lookup.historicalCases].filter(Boolean) as CaseProa[],
    [lookup.activeCase, lookup.historicalCases],
  )
  const selectedCase = allCases.find((caso) => caso.id === selectedCaseId) ?? lookup.activeCase
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

  useEffect(() => {
    let mounted = true
    const request = selectedCase?.id ? getCaseReevaluation(selectedCase.id) : Promise.resolve([])
    request
      .then((rows) => { if (mounted) setReevaluations(rows) })
      .catch(() => { if (mounted) setReevaluations([]) })
    return () => { mounted = false }
  }, [selectedCase?.id])

  async function createNewCase() {
    if (lookup.activeCase) {
      setError('Este paciente ya tiene un caso PROA activo. Continúa ese caso antes de abrir otro episodio.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await startCaseRound({
        ipsId,
        patientId: lookup.patient.id,
        serviceId: serviceId || null,
        bed: cama,
      })
      onRoundCreated(result.round)
    } catch (caseError) {
      setError(readableError(caseError))
    } finally {
      setLoading(false)
    }
  }

  async function openRound() {
    const caseForRound = lookup.activeCase
    if (!caseForRound) return createNewCase()

    setLoading(true)
    setError(null)
    try {
      const result = await startCaseRound({
        ipsId,
        patientId: lookup.patient.id,
        caseId: caseForRound.id,
        serviceId: serviceId || null,
        bed: cama,
      })
      onRoundCreated(result.round)
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

      {lookup.activeCaseCount > 1 ? (
        <div className="alert warning">
          Se detectaron {lookup.activeCaseCount} casos activos históricos para este paciente. Se usará el más reciente; la inconsistencia debe revisarse antes de abrir otro caso.
        </div>
      ) : null}

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

      {selectedCase ? (
        <div className="subsection">
          <h3>Reevaluación terapéutica</h3>
          {reevaluations.length ? (
            <div className="subtle-list">
              {reevaluations.slice(0, 8).map((row) => (
                <span key={row.oportunidad_id}>
                  <strong>{row.codigo_regla}</strong> · {row.tipo_hallazgo} · {row.estado}
                  <small>{row.decision ? `Decisión: ${row.decision}` : 'Pendiente de decisión profesional'}</small>
                </span>
              ))}
              <Link className="button-link" to="/auditoria">Abrir Auditoría PROA</Link>
            </div>
          ) : <p className="muted">Sin oportunidades de reevaluación registradas para el caso seleccionado.</p>}
        </div>
      ) : null}

      {canWrite ? (
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
              lookup.latestActiveCaseRound?.estado === 'Borrador' ? (
                <button className="primary-button" disabled={loading} onClick={() => onRoundCreated(lookup.latestActiveCaseRound!)} type="button">
                  <CalendarClock size={16} />
                  Continuar caso activo
                </button>
              ) : (
                <button className="primary-button" disabled={loading} onClick={openRound} type="button">
                  <CalendarClock size={16} />
                  Nueva ronda
                </button>
              )
            ) : (
              <button className="primary-button" disabled={loading} onClick={createNewCase} type="button">
                <FilePlus2 size={16} />
                Nuevo caso y primera valoración
              </button>
            )}
          </div>
          {selectedCase && selectedCase.id !== lookup.activeCase?.id ? (
            <div className="alert info">El caso histórico seleccionado es de solo consulta. Para registrar una ronda, continúa el caso activo o abre un nuevo caso cuando no exista uno activo.</div>
          ) : null}
        </div>
      ) : null}
      {!canWrite ? (
        <div className="alert info">Tu perfil permite consultar este paciente, pero no crear casos ni rondas.</div>
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
