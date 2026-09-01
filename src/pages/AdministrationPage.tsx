import { useEffect, useState } from 'react'
import {
  AlertCircle,
  Beaker,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FlaskConical,
  KeyRound,
  Microscope,
  RefreshCw,
  Search,
  ShieldCheck,
  Stethoscope,
  Users,
} from 'lucide-react'
import { useAuth } from '../features/auth/authContext'
import { useIps } from '../features/ips/ipsContext'
import { formatDate } from '../lib/date'
import {
  assignUserToIps,
  createServiceForIps,
  getAdminAccessRows,
  getAdminContext,
  getAdminSummary,
  getAllServicesForIps,
  getCatalogAdminRows,
  getDuplicateActiveTreatments,
  getInstitution,
  getOmsDddAdminRows,
  updateCatalogState,
  updateInstitutionName,
  updateService,
  updateUserIpsAccess,
  type AdminAccessRow,
  type AdminCatalogKind,
  type AdminContext,
  type AdminSummary,
  type CatalogAdminRow,
  type DuplicateTreatmentGroup,
} from '../services/administrationService'
import { catalogLabel } from '../services/catalogService'
import { patientDisplayName } from '../services/patientService'
import { productRoleLabels, productRoleValues, type ProductRoleValue } from '../services/permissionService'
import { readableError } from '../services/supabaseErrors'
import type { Ips, OmsDdd, ServiceIps, UUID } from '../types/domain'

type AdminSection =
  | 'overview'
  | 'institution'
  | 'users'
  | 'services'
  | 'antimicrobials'
  | 'microbiology'
  | 'proa'
  | 'ddd'
  | 'audit'

const roles = productRoleValues

const sectionCards: Array<{
  id: AdminSection
  title: string
  description: string
  icon: typeof Building2
  countKey?: keyof AdminSummary
}> = [
  { id: 'institution', title: 'Institución', description: 'Datos visibles de la IPS activa.', icon: Building2 },
  { id: 'users', title: 'Usuarios y accesos', description: 'Asignaciones por IPS, tipo de usuario y estado.', icon: Users, countKey: 'users' },
  { id: 'services', title: 'Servicios', description: 'Servicios activos e inactivos de la IPS.', icon: Stethoscope, countKey: 'services' },
  { id: 'antimicrobials', title: 'Antimicrobianos', description: 'Catálogo maestro global.', icon: Beaker, countKey: 'antimicrobials' },
  { id: 'microbiology', title: 'Microbiología', description: 'Microorganismos y tipos de muestra.', icon: Microscope, countKey: 'microorganisms' },
  { id: 'proa', title: 'Configuración PROA', description: 'Intervenciones y categorías analíticas.', icon: ClipboardCheck, countKey: 'interventions' },
  { id: 'ddd', title: 'DDD / OMS', description: 'Referencia OMS DDD y vías.', icon: Database, countKey: 'omsDdd' },
  { id: 'audit', title: 'Auditoría de datos', description: 'Inconsistencias administrativas detectadas.', icon: ShieldCheck, countKey: 'duplicateTreatmentGroups' },
]

function canWrite(context: AdminContext | null) {
  return Boolean(context?.canManageServices || context?.canManageUsers || context?.canManageCatalogs)
}

export function AdministrationPage() {
  const { user } = useAuth()
  const { activeIps } = useIps()
  const [section, setSection] = useState<AdminSection>('overview')
  const [context, setContext] = useState<AdminContext | null>(null)
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [institution, setInstitution] = useState<Ips | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function load() {
    if (!activeIps || !user) return
    setLoading(true)
    setError(null)
    try {
      const [nextContext, nextInstitution, nextSummary] = await Promise.all([
        getAdminContext(user.id, activeIps.id),
        getInstitution(activeIps.id),
        getAdminSummary(activeIps.id),
      ])
      setContext(nextContext)
      setInstitution(nextInstitution)
      setSummary(nextSummary)
    } catch (loadError) {
      setError(readableError(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIps?.id, user?.id])

  function notifySuccess(message: string) {
    setSuccess(message)
    window.setTimeout(() => setSuccess(null), 3500)
  }

  return (
    <main className="page admin-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Administración</p>
          <h1>Parametrización Multi-IPS</h1>
          <p className="muted">Configuración operativa visible para {activeIps?.nombre ?? 'la IPS activa'}.</p>
        </div>
        <div className="button-row">
          <button className="secondary-button" disabled={loading} onClick={load} type="button">
            <RefreshCw size={17} />
            Actualizar
          </button>
        </div>
      </section>

      {error ? <div className="alert error"><AlertCircle size={18} /> {error}</div> : null}
      {success ? <div className="alert success"><CheckCircle2 size={18} /> {success}</div> : null}

      <section className="admin-shell">
        <aside className="admin-section-nav" aria-label="Secciones de administración">
          <button className={section === 'overview' ? 'selected' : ''} onClick={() => setSection('overview')} type="button">
            <ShieldCheck size={17} />
            Resumen
          </button>
          {sectionCards.map((card) => (
            <button className={section === card.id ? 'selected' : ''} key={card.id} onClick={() => setSection(card.id)} type="button">
              <card.icon size={17} />
              {card.title}
            </button>
          ))}
        </aside>

        <div className="admin-content">
          <PermissionBanner context={context} />
          {loading ? <section className="panel">Cargando administración...</section> : null}
          {!loading && section === 'overview' ? (
            <AdminOverview context={context} summary={summary} onOpen={setSection} />
          ) : null}
          {!loading && section === 'institution' ? (
            <InstitutionPanel context={context} institution={institution} onReload={load} onSuccess={notifySuccess} />
          ) : null}
          {!loading && section === 'users' && activeIps ? (
            <UsersPanel activeIpsId={activeIps.id} context={context} onReloadSummary={load} onSuccess={notifySuccess} />
          ) : null}
          {!loading && section === 'services' && activeIps ? (
            <ServicesPanel activeIpsId={activeIps.id} context={context} onReloadSummary={load} onSuccess={notifySuccess} />
          ) : null}
          {!loading && section === 'antimicrobials' ? <CatalogPanel context={context} kind="antimicrobials" title="Antimicrobianos" /> : null}
          {!loading && section === 'microbiology' ? <MicrobiologyCatalogPanel context={context} /> : null}
          {!loading && section === 'proa' ? <ProaCatalogPanel context={context} /> : null}
          {!loading && section === 'ddd' ? <DddOmsPanel context={context} /> : null}
          {!loading && section === 'audit' && activeIps ? <AuditPanel activeIpsId={activeIps.id} /> : null}
        </div>
      </section>
    </main>
  )
}

function PermissionBanner({ context }: { context: AdminContext | null }) {
  const label = productRoleLabels[context?.capability ?? 'sin_acceso']
  return (
    <section className="panel admin-permission-banner">
      <KeyRound size={19} />
      <div>
        <h2>{label}</h2>
        <p className="muted">Permisos aplicados para la IPS activa. La seguridad final se valida en Supabase.</p>
      </div>
      <span className="pill">{context?.membership?.estado ?? context?.profile?.estado ?? 'Sin acceso IPS'}</span>
    </section>
  )
}

function AdminOverview({
  context,
  summary,
  onOpen,
}: {
  context: AdminContext | null
  summary: AdminSummary | null
  onOpen: (section: AdminSection) => void
}) {
  return (
    <section className="admin-card-grid">
      {sectionCards.map((card) => {
        const count = card.countKey && summary ? summary[card.countKey] : null
        return (
          <article className="panel admin-module-card" key={card.id}>
            <div className="panel-title">
              <card.icon size={20} />
              <div>
                <h2>{card.title}</h2>
                <p>{card.description}</p>
              </div>
            </div>
            <strong>{count === null ? 'Disponible' : count}</strong>
            <span className="muted">{card.id === 'audit' ? 'Hallazgos por revisar' : 'Registros disponibles'}</span>
            <button className="secondary-button" onClick={() => onOpen(card.id)} type="button">Administrar</button>
          </article>
        )
      })}
      {!canWrite(context) ? (
        <article className="panel admin-note">
          <h2>Modo consulta</h2>
          <p className="muted">Solo el perfil Administrador puede modificar parametrización.</p>
        </article>
      ) : null}
    </section>
  )
}

function InstitutionPanel({
  context,
  institution,
  onReload,
  onSuccess,
}: {
  context: AdminContext | null
  institution: Ips | null
  onReload: () => void
  onSuccess: (message: string) => void
}) {
  const [name, setName] = useState(institution?.nombre ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editable = Boolean(context?.canManageInstitution && institution)

  useEffect(() => {
    setName(institution?.nombre ?? '')
  }, [institution?.nombre])

  async function save() {
    if (!institution || !editable) return
    if (!window.confirm('¿Guardar cambio de nombre visible de la IPS?')) return
    setSaving(true)
    setError(null)
    try {
      await updateInstitutionName(institution.id, name.trim())
      onSuccess('Institución actualizada.')
      onReload()
    } catch (saveError) {
      setError(readableError(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <Building2 size={20} />
        <div>
          <h2>Institución</h2>
          <p>Datos institucionales disponibles; identificadores críticos quedan solo lectura.</p>
        </div>
      </div>
      {error ? <div className="alert error"><AlertCircle size={18} /> {error}</div> : null}
      <div className="form-grid">
        <label>
          Nombre
          <input disabled={!editable} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <Readonly label="NIT" value={institution?.nit} />
        <Readonly label="Código REPS" value={institution?.codigo_reps} />
        <Readonly label="Estado" value={institution?.estado} />
      </div>
      <div className="button-row">
        <button className="primary-button" disabled={!editable || saving || !name.trim()} onClick={save} type="button">
          {saving ? 'Guardando...' : 'Guardar institución'}
        </button>
      </div>
    </section>
  )
}

function UsersPanel({
  activeIpsId,
  context,
  onReloadSummary,
  onSuccess,
}: {
  activeIpsId: UUID
  context: AdminContext | null
  onReloadSummary: () => void
  onSuccess: (message: string) => void
}) {
  const [rows, setRows] = useState<AdminAccessRow[]>([])
  const [usuarioId, setUsuarioId] = useState('')
  const [rol, setRol] = useState<ProductRoleValue>('Usuario INFECTOMAG')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canManage = Boolean(context?.canManageUsers)

  async function load() {
    setError(null)
    try {
      setRows(await getAdminAccessRows(activeIpsId))
    } catch (loadError) {
      setError(readableError(loadError))
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIpsId])

  async function assign() {
    if (!canManage || !usuarioId.trim()) return
    setSaving(true)
    setError(null)
    try {
      await assignUserToIps({ usuarioId: usuarioId.trim(), ipsId: activeIpsId, rol })
      setUsuarioId('')
      await load()
      onReloadSummary()
      onSuccess('Usuario asignado a la IPS.')
    } catch (assignError) {
      setError(readableError(assignError))
    } finally {
      setSaving(false)
    }
  }

  async function update(row: AdminAccessRow, updates: { rol?: ProductRoleValue; estado?: 'Activo' | 'Inactivo' }) {
    if (!canManage) return
    const sensitive = updates.estado === 'Inactivo' ? '¿Retirar/desactivar acceso de este usuario a la IPS?' : '¿Actualizar acceso del usuario?'
    if (!window.confirm(sensitive)) return
    setSaving(true)
    setError(null)
    try {
      await updateUserIpsAccess({ usuarioId: row.membership.usuario_id, ipsId: activeIpsId, ...updates })
      await load()
      onReloadSummary()
      onSuccess('Acceso actualizado.')
    } catch (updateError) {
      setError(readableError(updateError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <Users size={20} />
        <div>
          <h2>Usuarios y accesos</h2>
          <p>Correo e invitación de usuarios requieren backend seguro; aquí se administran asignaciones existentes.</p>
        </div>
      </div>
      {error ? <div className="alert error"><AlertCircle size={18} /> {error}</div> : null}
      <div className="admin-inline-form">
        <label>
          Usuario existente ID
          <input disabled={!canManage || saving} placeholder="auth.users.id" value={usuarioId} onChange={(event) => setUsuarioId(event.target.value)} />
        </label>
        <label>
          Rol
          <select disabled={!canManage || saving} value={rol} onChange={(event) => setRol(event.target.value as ProductRoleValue)}>
            {roles.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <button className="primary-button" disabled={!canManage || saving || !usuarioId.trim()} onClick={assign} type="button">Asignar</button>
      </div>
      <AdminAccessTable canManage={canManage} onUpdate={update} rows={rows} saving={saving} />
    </section>
  )
}

function AdminAccessTable({
  canManage,
  onUpdate,
  rows,
  saving,
}: {
  canManage: boolean
  onUpdate: (row: AdminAccessRow, updates: { rol?: ProductRoleValue; estado?: 'Activo' | 'Inactivo' }) => void
  rows: AdminAccessRow[]
  saving: boolean
}) {
  if (!rows.length) return <p className="muted">Sin usuarios visibles para esta IPS.</p>
  return (
    <>
      <div className="table-wrap desktop-table">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Usuario ID</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.membership.usuario_id}-${row.membership.ips_id}`}>
                <td>{row.profile?.nombre ?? 'Perfil sin nombre'}</td>
                <td>{row.email ?? 'No disponible desde cliente'}</td>
                <td>
                  <select disabled={!canManage || saving} value={roleValue(row.membership.rol)} onChange={(event) => onUpdate(row, { rol: event.target.value as ProductRoleValue })}>
                    {roles.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </td>
                <td><span className="pill">{row.membership.estado ?? 'Sin estado'}</span></td>
                <td>{row.membership.usuario_id}</td>
                <td>
                  <button
                    className="table-action button-link"
                    disabled={!canManage || saving}
                    onClick={() => onUpdate(row, { estado: row.membership.estado === 'Activo' ? 'Inactivo' : 'Activo' })}
                    type="button"
                  >
                    {row.membership.estado === 'Activo' ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-card-list">
        {rows.map((row) => (
          <article className="mobile-record-card" key={`${row.membership.usuario_id}-${row.membership.ips_id}`}>
            <div className="mobile-card-header">
              <strong>{row.profile?.nombre ?? 'Perfil sin nombre'}</strong>
              <span className="pill">{row.membership.estado ?? 'Sin estado'}</span>
            </div>
            <span>{roleValue(row.membership.rol)}</span>
            <span>{row.email ?? 'Correo no disponible desde cliente'}</span>
            <span>{row.membership.usuario_id}</span>
          </article>
        ))}
      </div>
    </>
  )
}

function ServicesPanel({
  activeIpsId,
  context,
  onReloadSummary,
  onSuccess,
}: {
  activeIpsId: UUID
  context: AdminContext | null
  onReloadSummary: () => void
  onSuccess: (message: string) => void
}) {
  const [rows, setRows] = useState<ServiceIps[]>([])
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canManage = Boolean(context?.canManageServices)

  async function load() {
    setError(null)
    try {
      setRows(await getAllServicesForIps(activeIpsId))
    } catch (loadError) {
      setError(readableError(loadError))
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIpsId])

  async function create() {
    if (!canManage || !newName.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createServiceForIps(activeIpsId, newName.trim())
      setNewName('')
      await load()
      onReloadSummary()
      onSuccess('Servicio creado.')
    } catch (createError) {
      setError(readableError(createError))
    } finally {
      setSaving(false)
    }
  }

  async function toggle(row: ServiceIps) {
    if (!canManage) return
    if (!window.confirm(`${row.estado === 'Activo' ? 'Desactivar' : 'Activar'} servicio ${row.nombre}?`)) return
    setSaving(true)
    setError(null)
    try {
      await updateService(row.id, { nombre: row.nombre, estado: row.estado === 'Activo' ? 'Inactivo' : 'Activo' })
      await load()
      onReloadSummary()
      onSuccess('Servicio actualizado.')
    } catch (updateError) {
      setError(readableError(updateError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <Stethoscope size={20} />
        <div>
          <h2>Servicios</h2>
          <p>Inactivar conserva históricos y evita uso futuro en catálogos activos.</p>
        </div>
      </div>
      {error ? <div className="alert error"><AlertCircle size={18} /> {error}</div> : null}
      <div className="admin-inline-form">
        <label>
          Nuevo servicio
          <input disabled={!canManage || saving} value={newName} onChange={(event) => setNewName(event.target.value)} />
        </label>
        <button className="primary-button" disabled={!canManage || saving || !newName.trim()} onClick={create} type="button">Crear</button>
      </div>
      <SimpleRows
        action={(row) => <button className="table-action button-link" disabled={!canManage || saving} onClick={() => toggle(row)} type="button">{row.estado === 'Activo' ? 'Desactivar' : 'Activar'}</button>}
        columns={['Servicio', 'Estado', 'Acción']}
        rows={rows}
        render={(row) => [row.nombre, <span className="pill" key="state">{row.estado ?? 'Sin estado'}</span>]}
      />
    </section>
  )
}

function MicrobiologyCatalogPanel({ context }: { context: AdminContext | null }) {
  return (
    <div className="admin-stacked">
      <CatalogPanel context={context} kind="sampleTypes" title="Tipos de muestra" />
      <CatalogPanel context={context} kind="microorganisms" title="Microorganismos" />
    </div>
  )
}

function ProaCatalogPanel({ context }: { context: AdminContext | null }) {
  return (
    <div className="admin-stacked">
      <CatalogPanel context={context} kind="interventions" title="Intervenciones PROA" />
      <CatalogPanel context={context} kind="categories" title="Categorías PROA" />
    </div>
  )
}

function CatalogPanel({ context, kind, title }: { context: AdminContext | null; kind: AdminCatalogKind; title: string }) {
  const [rows, setRows] = useState<CatalogAdminRow[]>([])
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canManage = Boolean(context?.canManageCatalogs)

  async function load() {
    setError(null)
    try {
      setRows(await getCatalogAdminRows(kind, query))
    } catch (loadError) {
      setError(readableError(loadError))
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])

  async function toggle(row: CatalogAdminRow) {
    if (!canManage) return
    const nextState = row.estado === 'Activo' ? 'Inactivo' : 'Activo'
    if (!window.confirm(`${nextState === 'Inactivo' ? 'Desactivar' : 'Activar'} ${catalogLabel(row)}?`)) return
    setSaving(true)
    setError(null)
    try {
      await updateCatalogState(kind, row.id, nextState)
      await load()
    } catch (updateError) {
      setError(readableError(updateError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <FlaskConical size={20} />
        <div>
          <h2>{title}</h2>
          <p>{canManage ? 'Catálogo maestro global administrable.' : 'Catálogo maestro en modo consulta para esta sesión.'}</p>
        </div>
      </div>
      {error ? <div className="alert error"><AlertCircle size={18} /> {error}</div> : null}
      <form className="admin-inline-form" onSubmit={(event) => { event.preventDefault(); load() }}>
        <label>
          Buscar
          <div className="input-with-icon">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        </label>
        <button className="secondary-button" type="submit">Buscar</button>
      </form>
      <SimpleRows
        action={(row) => <button className="table-action button-link" disabled={!canManage || saving} onClick={() => toggle(row)} type="button">{row.estado === 'Activo' ? 'Desactivar' : 'Activar'}</button>}
        columns={['Nombre', 'Código/ATC', 'Estado', 'Acción']}
        rows={rows}
        render={(row) => [
          catalogLabel(row),
          (row as { codigo_atc?: string | null }).codigo_atc ?? row.codigo ?? 'Sin código',
          <span className="pill" key="state">{row.estado ?? 'Sin estado'}</span>,
        ]}
      />
    </section>
  )
}

function DddOmsPanel({ context }: { context: AdminContext | null }) {
  const [rows, setRows] = useState<Array<OmsDdd & { antimicrobial: { nombre?: string | null; codigo_atc?: string | null } | null }>>([])
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setError(null)
    try {
      setRows(await getOmsDddAdminRows())
    } catch (loadError) {
      setError(readableError(loadError))
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <section className="panel">
      <div className="panel-title">
        <Database size={20} />
        <div>
          <h2>DDD / OMS</h2>
          <p>{context?.canManageOmsDdd ? 'Referencia sensible administrable por Administrador.' : 'Referencia OMS en modo consulta para esta sesión.'}</p>
        </div>
      </div>
      {error ? <div className="alert error"><AlertCircle size={18} /> {error}</div> : null}
      <SimpleRows
        columns={['Antimicrobiano', 'ATC', 'Vía', 'DDD OMS', 'Fuente']}
        rows={rows}
        render={(row) => [
          row.antimicrobial?.nombre ?? row.antimicrobiano_id,
          row.antimicrobial?.codigo_atc ?? 'Sin ATC',
          row.via,
          `${row.ddd_oms} ${row.unidad_ddd ?? ''}`,
          row.version_fuente ?? formatDate(row.fecha_actualizacion),
        ]}
      />
    </section>
  )
}

function AuditPanel({ activeIpsId }: { activeIpsId: UUID }) {
  const [duplicates, setDuplicates] = useState<DuplicateTreatmentGroup[]>([])
  const [selected, setSelected] = useState<DuplicateTreatmentGroup | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setError(null)
    try {
      setDuplicates(await getDuplicateActiveTreatments(activeIpsId))
    } catch (loadError) {
      setError(readableError(loadError))
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIpsId])

  return (
    <div className="admin-stacked">
      <section className="panel">
        <div className="panel-title">
          <ShieldCheck size={20} />
          <div>
            <h2>Tratamientos activos duplicados</h2>
            <p>No corrige automáticamente; solo identifica grupos históricos para revisión.</p>
          </div>
        </div>
        {error ? <div className="alert error"><AlertCircle size={18} /> {error}</div> : null}
        <SimpleRows
          action={(row) => <button className="table-action button-link" onClick={() => setSelected(row)} type="button">Revisar</button>}
          columns={['Paciente', 'Caso', 'Antimicrobiano', 'Duplicados', 'Acción']}
          rows={duplicates}
          render={(row) => [
            row.patient ? `${patientDisplayName(row.patient)} · ${row.patient.numero_identificacion}` : 'Paciente no visible',
            row.caseId,
            row.antimicrobialName,
            row.count,
          ]}
        />
        {!duplicates.length ? <div className="alert success"><CheckCircle2 size={18} /> Sin duplicados activos detectados en los primeros registros visibles.</div> : null}
      </section>
      {selected ? (
        <section className="panel detail-panel">
          <div className="subsection-heading">
            <div>
              <h2>{selected.antimicrobialName}</h2>
              <p className="muted">IDs involucrados para revisión manual segura.</p>
            </div>
            <button className="secondary-button" onClick={() => setSelected(null)} type="button">Cerrar</button>
          </div>
          <div className="subtle-list">
            {selected.treatments.map((treatment) => (
              <span key={treatment.id}>{treatment.id} · inicio {formatDate(treatment.fecha_inicio)} · vía {treatment.via ?? 'sin vía'}</span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function SimpleRows<T>({
  action,
  columns,
  render,
  rows,
}: {
  action?: (row: T) => React.ReactNode
  columns: string[]
  render: (row: T) => React.ReactNode[]
  rows: T[]
}) {
  if (!rows.length) return <p className="muted">Sin registros visibles.</p>
  return (
    <>
      <div className="table-wrap desktop-table">
        <table className="data-table">
          <thead>
            <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const values = render(row)
              return (
                <tr key={'id' in Object(row) ? String((row as { id?: UUID }).id ?? index) : index}>
                  {values.map((value, valueIndex) => <td key={valueIndex}>{value}</td>)}
                  {action ? <td>{action(row)}</td> : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mobile-card-list">
        {rows.map((row, index) => {
          const values = render(row)
          return (
            <article className="mobile-record-card" key={'id' in Object(row) ? String((row as { id?: UUID }).id ?? index) : index}>
              <div className="mobile-card-header">
                <strong>{values[0]}</strong>
                {values[2] ? <span>{values[2]}</span> : null}
              </div>
              {values.slice(1).map((value, valueIndex) => <span key={valueIndex}>{value}</span>)}
              {action ? <div className="mobile-card-action">{action(row)}</div> : null}
            </article>
          )
        })}
      </div>
    </>
  )
}

function Readonly({ label, value }: { label: string; value?: string | null }) {
  return (
    <label>
      {label}
      <input disabled value={value ?? 'Sin registro'} />
    </label>
  )
}

function roleValue(value?: string | null): ProductRoleValue {
  if (value === 'Usuario INFECTOMAG' || value === 'PROA' || value === 'Administrador IPS') return 'Usuario INFECTOMAG'
  if (value === 'IPS Cliente' || value === 'Consulta') return 'IPS Cliente'
  return 'IPS Cliente'
}
