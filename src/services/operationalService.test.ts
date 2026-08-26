import { describe, expect, it } from 'vitest'
import { matchesOperationalFilter, matchesRoundSearch, type ActiveCaseRow, type RoundsActivityRow } from './operationalService'

function activeRow(overrides: Partial<ActiveCaseRow>): ActiveCaseRow {
  return {
    case: { id: 'c1', ips_id: 'ips1', paciente_id: 'p1', estado: 'Activo' },
    patient: { id: 'p1', ips_id: 'ips1', tipo_identificacion: 'CC', numero_identificacion: '123', nombres: 'Ana', apellidos: 'Perez' },
    service: null,
    latestRound: null,
    activeTreatments: [],
    microbiology: [],
    latestIntervention: null,
    status: 'Al día',
    requiresFollowUp: false,
    maxTreatmentDay: null,
    ...overrides,
  }
}

describe('operational filters', () => {
  it('aplica KPI seguimiento requerido sin alterar la población base', () => {
    const rows = [
      activeRow({ case: { id: 'c1', ips_id: 'ips1', paciente_id: 'p1' }, requiresFollowUp: true }),
      activeRow({ case: { id: 'c2', ips_id: 'ips1', paciente_id: 'p2' }, requiresFollowUp: false }),
    ]

    expect(rows.filter((row) => matchesOperationalFilter(row, 'Seguimiento requerido'))).toHaveLength(1)
    expect(rows.filter((row) => matchesOperationalFilter(row, 'Todos'))).toHaveLength(2)
  })

  it('combina búsqueda de rondas por paciente, identificación, servicio o profesional', () => {
    const row = {
      round: { id: 'r1', ips_id: 'ips1', paciente_id: 'p1', servicio_id: 's1' },
      patient: { id: 'p1', ips_id: 'ips1', tipo_identificacion: 'CC', numero_identificacion: 'VAL-1', nombres: 'Validacion', apellidos: 'Seis' },
      service: { id: 's1', ips_id: 'ips1', nombre: 'UCI' },
      professional: { usuario_id: 'u1', nombre: 'Dra PROA' },
      intervention: null,
    } satisfies RoundsActivityRow

    expect(matchesRoundSearch(row, 'validacion')).toBe(true)
    expect(matchesRoundSearch(row, 'VAL-1')).toBe(true)
    expect(matchesRoundSearch(row, 'uci')).toBe(true)
    expect(matchesRoundSearch(row, 'proa')).toBe(true)
    expect(matchesRoundSearch(row, 'cirugia')).toBe(false)
  })
})
