# PROA V2 - Milestone 2A

## Funcionalidades implementadas

- Ruta `/rondas/:roundId` para abrir una ronda en estado `Borrador`.
- Formulario clínico continuo, sin wizard:
  - contexto de ronda;
  - resumen paciente/caso de solo lectura;
  - contexto heredado de ronda anterior;
  - diagnósticos CIE-10 por filas;
  - categoría PROA desde catálogo;
  - tipo de terapia, condición dirigida por microbiología y profilaxis;
  - evolución clínica;
  - antimicrobianos activos, nuevos tratamientos, modificaciones y suspensiones.
- Guardado con estado `Borrador`; no confirma ronda ni genera nota.
- CIE-10 desacoplado con catálogo local estructurado temporal.
- Antimicrobianos desde `catalogo_antimicrobianos`.
- Historial de tratamiento para inicio, continuación, modificación y suspensión.

## Archivos principales

- `src/pages/RoundEditorPage.tsx`
- `src/services/clinicalRoundService.ts`
- `src/services/treatmentService.ts`
- `src/services/catalogService.ts`
- `src/data/cie10.ts`
- `src/types/domain.ts`
- `scripts/validate-milestone-2a.mjs`

## Validación local

```bash
npm run build
npm run lint
npm run validate:2a
```

## Validación Supabase real

Configurar las mismas variables de Milestone 1.1 y ejecutar:

```powershell
$env:VITE_SUPABASE_URL="https://taqwtptopgwbljmwcasv.supabase.co"
$env:VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
$env:PROA_TEST_EMAIL="<correo_usuario_prueba>"
$env:PROA_TEST_PASSWORD="<password_usuario_prueba>"
$env:PROA_FORBIDDEN_IPS_ID="<ips_hujmb_o_no_permitida>"
npm run validate:2a
```

## Discrepancias / propuestas

- El código fue ajustado al esquema real informado: `usuario_ips.estado`, `perfiles_usuario.usuario_id/nombre`, `casos_proa.fecha_apertura`, `rondas_proa.fecha_hora_ronda`, `diagnosticos_ronda` sin `ips_id/paciente_id/caso_id`, `tratamientos_antimicrobianos.antimicrobiano` y suspensión con `fecha_fin`.
- En esta sesión no hay `.env.local` ni variables `VITE_SUPABASE_*` / `PROA_*` visibles para el proceso, por lo que `npm run validate:2a` se detiene antes de conectarse a Supabase.
- No se proponen migraciones para Milestone 2A con el esquema real entregado.

## Pendiente para Milestone 2B

- Microbiología completa.
- Intervención PROA formal.
- Asociación `intervencion_tratamiento`.
- Generación, edición y confirmación de Nota de Evolución PROA.
- DDD.
