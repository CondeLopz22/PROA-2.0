# PROA V2 - Milestone 1

Primera versión funcional de la WebApp Multi-IPS para gestión PROA.

## Estado implementado

- Login con Supabase Auth mediante `signInWithPassword`.
- Carga de IPS permitidas desde `usuario_ips` y selección automática si solo hay una visible.
- Indicador persistente de IPS activa en toda la interfaz.
- Layout responsive con navegación lateral: Inicio, Rondas PROA, Pacientes / Registros, Consumo / DDD, Indicadores y Administración.
- Búsqueda de paciente por tipo y número de identificación dentro de la IPS activa.
- Estado de paciente no encontrado con creación mínima.
- Resumen de paciente existente: nombre, sexo, edad, caso activo, última ronda, tratamientos activos y casos históricos visibles.
- Creación de nuevo caso PROA.
- Creación de ronda vacía en estado `borrador`.

## Configuración

Crear `.env.local` con:

```bash
VITE_SUPABASE_URL=https://taqwtptopgwbljmwcasv.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

Usar publishable key moderna (`sb_publishable_...`). No usar service role keys en el frontend.

## Milestone 1.1

Cambios de integración real:

- El cliente usa `VITE_SUPABASE_PUBLISHABLE_KEY`.
- La IPS activa vive solo en estado de aplicación; no se persiste como fuente de permisos.
- La sesión restaurada se valida con `supabase.auth.getUser()`.
- Se distingue usuario sin perfil (`perfiles_usuario`) de usuario sin IPS (`usuario_ips`).
- Se agregaron mensajes de error amigables para sesión expirada, RLS, red, duplicados y registros no encontrados.
- Se agregó `npm run validate:supabase` para probar login, IPS, paciente, caso, ronda y RLS contra Supabase real.

Ver:

- `docs/milestone-1-1-validation.md`
- `docs/supabase-milestone-1-1-setup.sql`

## Milestone 2A

Implementado el núcleo clínico de la ronda borrador en `/rondas/:roundId`:

- Contexto de ronda.
- Resumen paciente/caso.
- Contexto heredado longitudinal.
- Diagnósticos CIE-10 por filas en `diagnosticos_ronda`.
- Categoría PROA desde `catalogo_categorias_proa`.
- Tipo de terapia y evolución clínica en `rondas_proa`.
- Tratamientos antimicrobianos desde catálogo.
- Continuación, modificación y suspensión con `historial_tratamiento`.

Validación automatizada disponible:

```bash
npm run validate:2a
```

Ver `docs/milestone-2a.md`.

## Validación ejecutada

```bash
npm run build
npm run lint
```

También se levantó Vite en `http://127.0.0.1:5173/` y respondió HTTP 200.

## Nota sobre inspección Supabase

En esta sesión no estaban disponibles Supabase CLI, MCP de Supabase, publishable key ni credenciales de usuario de prueba. Por eso no fue posible completar todavía la prueba e2e real contra datos históricos.

La implementación queda preparada para usar Supabase real y delega el aislamiento a RLS: todas las consultas pasan por el cliente autenticado, con `ips_id` como contexto funcional, pero sin asumir que el filtro frontend sea el control de seguridad principal.

## Decisiones técnicas

- React + TypeScript + Vite por simplicidad y velocidad.
- Supabase JS como único cliente de datos.
- Servicios separados por dominio: IPS, pacientes/casos, rondas.
- Rondas usa el esquema real validado: `caso_id` y `fecha_hora_ronda`.
- Los módulos DDD, Indicadores y Administración quedan visibles como navegación, sin funcionalidad falsa en este milestone.
