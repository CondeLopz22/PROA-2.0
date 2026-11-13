import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.resolve('supabase/migrations/20261113064602_est_03b_therapeutic_traceability.sql'),
  'utf8',
).toLowerCase()

describe('migración EST-03B', () => {
  it('extiende EST-01 dentro de una sola transacción', () => {
    expect(migration).toContain('begin;')
    expect(migration).toContain('v_result := public.guardar_ronda_clinica(p_payload)')
    expect(migration).toContain("jsonb_set(p_payload, '{confirm}', 'false'::jsonb, true)")
    expect(migration).toContain('if v_confirm then')
    expect(migration).toContain('create or replace function public.guardar_ronda_clinica_trazable')
    expect(migration.trim().endsWith('commit;')).toBe(true)
  })

  it('preserva historia y no habilita borrado físico', () => {
    expect(migration).toContain('create table if not exists public.tratamientos_valoracion')
    expect(migration).toContain('create table if not exists public.decisiones_intervencion')
    expect(migration).toContain('create table if not exists public.implementaciones_intervencion')
    expect(migration).not.toMatch(/create policy .* for delete/)
  })

  it('mantiene RLS Multi-IPS y MART security invoker', () => {
    expect(migration).toContain('public.puede_leer_ips(ips_id)')
    expect(migration).toContain('public.puede_escribir_operacion_ips(ips_id)')
    expect(migration).toContain('with (security_invoker = true)')
  })
})
