import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.resolve('supabase/migrations/20261113064602_est_03b_therapeutic_traceability.sql'),
  'utf8',
).toLowerCase()
const hardeningMigration = fs.readFileSync(
  path.resolve('supabase/migrations/20261113143350_est_03b_intervention_hardening.sql'),
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
    expect(migration).toContain('public.puede_leer_ips(tratamientos_valoracion.ips_id)')
    expect(migration).toContain('public.puede_escribir_operacion_ips(decisiones_intervencion.ips_id)')
    expect(migration).toContain('public.puede_escribir_operacion_ips(implementaciones_intervencion.ips_id)')
    expect(migration).toContain('create or replace function public.validar_integridad_trazabilidad_est03b()')
    expect(migration).toContain("v_previous_round.estado <> 'borrador'")
    expect(migration).toContain('with (security_invoker = true)')
  })

  it('califica las relaciones clínicas sin comparaciones ambiguas', () => {
    expect(migration).toContain('r.ips_id = tratamientos_valoracion.ips_id')
    expect(migration).toContain('origin_round.ips_id = decisiones_intervencion.ips_id')
    expect(migration).toContain('origin_round.ips_id = implementaciones_intervencion.ips_id')
    expect(migration).not.toMatch(/r\.ips_id\s*=\s*ips_id/)
    expect(migration).not.toMatch(/origin_round\.caso_id\s*=\s*caso_id/)
  })

  it('endurece intervenciones confirmadas en una migración independiente', () => {
    expect(hardeningMigration).toContain('create or replace function public.validar_intervencion_clinica_est03b()')
    expect(hardeningMigration).toContain("v_old_round.estado <> 'borrador'")
    expect(hardeningMigration).toContain('create policy intervenciones_update')
    expect(hardeningMigration).toContain('create policy int_trat_insert')
    expect(hardeningMigration).toContain('with (security_invoker = true)')
    expect(hardeningMigration.trim().endsWith('commit;')).toBe(true)
  })
})
