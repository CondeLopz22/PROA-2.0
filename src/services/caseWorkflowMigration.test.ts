import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261013183925_est_02_case_workflow.sql'),
  'utf8',
)

describe('contrato SQL EST-02', () => {
  it('es atómica, invocadora y restringe la RPC a sesiones autenticadas', () => {
    expect(migration.trimStart().startsWith('begin;')).toBe(true)
    expect(migration.trimEnd().endsWith('commit;')).toBe(true)
    expect(migration).toContain('create or replace function public.iniciar_ronda_proa(')
    expect(migration).toContain('security invoker')
    expect(migration).toContain('grant execute on function public.iniciar_ronda_proa(uuid, uuid, uuid, uuid, text) to authenticated')
  })

  it('bloquea nuevos casos activos duplicados sin borrar o reescribir históricos', () => {
    expect(migration).toContain('trg_est02_caso_activo_unico')
    expect(migration).toContain('EST02_ACTIVE_CASE:')
    expect(migration).not.toMatch(/delete\s+from\s+public\.casos_proa/i)
    expect(migration).not.toMatch(/update\s+public\.casos_proa\s+set\s+estado/i)
  })

  it('rechaza rondas en casos cerrados, deriva el tipo y reutiliza borradores', () => {
    expect(migration).toContain('EST02_CLOSED_CASE:')
    expect(migration).toContain('EST02_DRAFT_EXISTS:')
    expect(migration).toContain("case when v_round_count = 0 then 'Primera valoración' else 'Seguimiento' end")
    expect(migration).toContain("and r.estado = 'Borrador'")
    expect(migration).toContain("'draft_reused', v_draft_reused")
  })
})
