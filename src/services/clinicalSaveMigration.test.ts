import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261013160959_est_01_atomic_clinical_round_save.sql'),
  'utf8',
)

describe('contrato SQL EST-01', () => {
  it('define una única transacción y una RPC security invoker', () => {
    expect(migration.trimStart().startsWith('begin;')).toBe(true)
    expect(migration.trimEnd().endsWith('commit;')).toBe(true)
    expect(migration).toContain('create or replace function public.guardar_ronda_clinica(p_payload jsonb)')
    expect(migration).toContain('security invoker')
    expect(migration).toContain('for update;')
  })

  it('preserva la descripción clínica que causaba PGRST204', () => {
    expect(migration).toContain('add column if not exists descripcion_motivo_no_intervencion text')
    expect(migration).toContain('descripcion_motivo_no_intervencion')
  })

  it('protege contexto, permisos, rondas confirmadas e idempotencia', () => {
    expect(migration).toContain('public.puede_escribir_operacion_ips(v_round.ips_id)')
    expect(migration).toContain("v_round.estado <> 'Borrador'")
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('on conflict do nothing')
    expect(migration).toContain("h.accion = 'Continuación'")
  })

  it('limita la ejecución a sesiones autenticadas', () => {
    expect(migration).toContain('revoke all on function public.guardar_ronda_clinica(jsonb) from public')
    expect(migration).toContain('revoke all on function public.guardar_ronda_clinica(jsonb) from anon')
    expect(migration).toContain('grant execute on function public.guardar_ronda_clinica(jsonb) to authenticated')
  })
})
