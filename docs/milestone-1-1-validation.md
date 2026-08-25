# PROA V2 - Milestone 1.1 Validation

## Variables requeridas

Crear `.env.local` para la app:

```bash
VITE_SUPABASE_URL=https://taqwtptopgwbljmwcasv.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Para el script de validación:

```powershell
$env:VITE_SUPABASE_URL="https://taqwtptopgwbljmwcasv.supabase.co"
$env:VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
$env:PROA_TEST_EMAIL="<correo_usuario_prueba>"
$env:PROA_TEST_PASSWORD="<password_usuario_prueba>"
$env:PROA_TEST_PATIENT_TYPE="<tipo_id_opcional>"
$env:PROA_TEST_PATIENT_NUMBER="<numero_id_opcional>"
$env:PROA_FORBIDDEN_IPS_ID="<ips_b_id_opcional>"
npm run validate:supabase
```

## Preparación manual si `perfiles_usuario` o `usuario_ips` están vacías

Usar `docs/supabase-milestone-1-1-setup.sql` en Supabase Dashboard > SQL Editor.

No usar service role en frontend. No deshabilitar RLS.

## Criterios que reporta el script

- Login incorrecto rechazado.
- Login correcto.
- Usuario autenticado con `getUser`.
- Perfil visible en `perfiles_usuario`.
- IPS permitidas desde `usuario_ips`.
- Paciente visible por RLS en IPS activa.
- Casos, rondas y tratamientos consultables.
- Caso nuevo creado.
- Ronda borrador creada y consultada nuevamente.
- Consulta cruzada a otra IPS sin filas visibles o bloqueada.
- Insert cruzado a otra IPS bloqueado.
- Logout.
