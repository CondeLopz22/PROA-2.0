import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('../lib/supabase', () => ({ supabase: { rpc } }))

import { assessmentTypeFromCaseHistory, diagnosisSourceForRound } from './clinicalRoundService'
import { assessmentTypeForRoundCount, startCaseRound } from './roundService'
import type { DiagnosisRound, RoundProa } from '../types/domain'

const firstRound = { id: 'round-1', ips_id: 'ips-1', caso_id: 'case-1', tipo_valoracion: 'Primera valoración' } as RoundProa
const followUp = { id: 'round-2', ips_id: 'ips-1', caso_id: 'case-1', tipo_valoracion: 'Seguimiento' } as RoundProa
const diagnosis = { id: 'diagnosis-1', ronda_id: 'round-1', tipo_diagnostico: 'Principal' } as DiagnosisRound

describe('flujo de casos y rondas EST-02', () => {
  beforeEach(() => rpc.mockReset())

  it('determina primera valoración y seguimiento solo por las rondas del caso', () => {
    expect(assessmentTypeForRoundCount(0)).toBe('Primera valoración')
    expect(assessmentTypeForRoundCount(1)).toBe('Seguimiento')
    expect(assessmentTypeFromCaseHistory(firstRound, followUp)).toBe('Primera valoración')
    expect(assessmentTypeFromCaseHistory({ ...followUp, tipo_valoracion: null }, firstRound)).toBe('Seguimiento')
  })

  it('no hereda diagnósticos en una primera valoración y sí los ofrece en seguimiento', () => {
    expect(diagnosisSourceForRound('Primera valoración', [], [diagnosis])).toEqual({ rows: [], inherited: false })
    expect(diagnosisSourceForRound('Seguimiento', [], [diagnosis])).toEqual({ rows: [diagnosis], inherited: true })
    expect(diagnosisSourceForRound('Seguimiento', [{ ...diagnosis, id: 'current' }], [diagnosis])).toEqual({
      rows: [{ ...diagnosis, id: 'current' }],
      inherited: false,
    })
  })

  it('inicia la ronda con paciente, caso e IPS explícitos y reutiliza el borrador devuelto', async () => {
    rpc.mockResolvedValue({
      data: {
        case: { id: 'case-1', ips_id: 'ips-1', paciente_id: 'patient-1' },
        round: { id: 'round-1', ips_id: 'ips-1', paciente_id: 'patient-1', caso_id: 'case-1' },
        case_created: false,
        draft_reused: true,
      },
      error: null,
    })

    const result = await startCaseRound({ ipsId: 'ips-1', patientId: 'patient-1', caseId: 'case-1' })

    expect(rpc).toHaveBeenCalledWith('iniciar_ronda_proa', {
      p_ips_id: 'ips-1',
      p_paciente_id: 'patient-1',
      p_caso_id: 'case-1',
      p_servicio_id: null,
      p_cama: null,
    })
    expect(result.draftReused).toBe(true)
  })
})
