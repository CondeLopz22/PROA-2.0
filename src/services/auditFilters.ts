import type { AuditInboxRow } from './auditService'

export type AuditStatusFilter = 'Activos' | 'Abierto' | 'En seguimiento' | 'Resuelto' | 'Descartado' | 'Todos'

export type AuditFilters = {
  status: AuditStatusFilter
  severity: string
  service: string
  antimicrobial: string
  aware: string
  type: string
  search: string
}

export function filterAuditRows(rows: AuditInboxRow[], filters: AuditFilters) {
  const search = normalize(filters.search)
  return rows.filter((row) => {
    if (filters.status === 'Activos' && row.estado !== 'Abierto' && row.estado !== 'En seguimiento') return false
    if (filters.status !== 'Activos' && filters.status !== 'Todos' && row.estado !== filters.status) return false
    if (filters.severity && row.severidad !== filters.severity) return false
    if (filters.service && row.servicio !== filters.service) return false
    if (filters.antimicrobial && row.antimicrobiano !== filters.antimicrobial) return false
    if (filters.aware && row.aware_categoria !== filters.aware) return false
    if (filters.type && row.tipo_hallazgo !== filters.type) return false
    if (!search) return true
    return normalize([
      row.patient?.nombres,
      row.patient?.apellidos,
      row.patient?.tipo_identificacion,
      row.patient?.numero_identificacion,
    ].filter(Boolean).join(' ')).includes(search)
  })
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
