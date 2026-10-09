import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261009100000_milestone_6e3_therapeutic_reevaluation.sql'),
  'utf8',
)
const interventionService = readFileSync(resolve(process.cwd(), 'src/services/interventionService.ts'), 'utf8')

describe('contrato SQL de reevaluación terapéutica', () => {
  it('rechaza decisiones sobre hallazgos Resueltos o Descartados por RPC, trigger y RLS', () => {
    expect(migration.match(/estado (?:not )?in \('Abierto', 'En seguimiento'\)/g)?.length).toBeGreaterThanOrEqual(3)
    expect(migration).toContain('Solo se pueden registrar decisiones sobre hallazgos abiertos o en seguimiento')
  })

  it('valida caso e IPS en la relación hallazgo-tratamiento dentro de base de datos', () => {
    expect(migration).toContain('create or replace function public.validar_hallazgo_tratamiento()')
    expect(migration).toContain('before insert or update on public.hallazgo_tratamiento')
    expect(migration).toContain('v_tratamiento_caso_id is distinct from v_hallazgo_caso_id')
    expect(migration).toContain('v_tratamiento_ips_id is distinct from v_hallazgo_ips_id')
  })

  it('deriva el profesional, bloquea la fila y valida la intervención antes del cierre atómico', () => {
    expect(migration).toContain('new.profesional_id := auth.uid()')
    expect(migration).toContain('new.fecha_decision := now()')
    expect(migration).toContain('for update;')
    expect(migration).toContain('La intervencion no pertenece al mismo caso e IPS')
    expect(migration).toContain('after insert on public.decisiones_reevaluacion')
    expect(migration).toContain('hallazgo_id uuid not null unique')
  })

  it('mantiene el MART con seguridad invocadora', () => {
    expect(migration).toContain('create or replace view public.mart_reevaluacion_terapeutica')
    expect(migration).toContain('with (security_invoker = true)')
  })

  it('preserva intervenciones existentes durante la edición de ronda', () => {
    expect(interventionService).not.toMatch(/from\('intervenciones_proa'\)\.delete\(/)
    expect(interventionService).toContain("supabase.from('intervenciones_proa').update(payload)")
    expect(interventionService).toContain(".from('decisiones_reevaluacion')")
    expect(interventionService).toContain('if (!preservesHistoricalRelations)')
    expect(interventionService).toContain("onConflict: 'intervencion_id,tratamiento_id'")
  })
})
