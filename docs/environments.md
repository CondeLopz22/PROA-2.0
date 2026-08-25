# Environments

## Desarrollo

- Base de datos: Supabase `taqwtptopgwbljmwcasv` con datos de prueba desidentificados.
- Frontend: Vite local.
- Datos permitidos: únicamente datos desidentificados o registros marcados de validación.
- Credenciales: variables locales `.env.local`, nunca en repositorio.
- Logs: consola estructurada en desarrollo, sin datos clínicos sensibles.
- Backups: gestionados desde Supabase.
- Propósito: construcción y validación técnica.

## Piloto

- Base de datos: Supabase controlado, idealmente rama/proyecto separado antes de datos reales.
- Frontend: despliegue HTTPS con variables de entorno gestionadas por plataforma.
- Datos permitidos: datos institucionales del piloto con autorización.
- Credenciales: usuarios nominales de Supabase Auth, sin cuentas compartidas.
- Logs: sanitizados, sin notas clínicas ni identificadores directos innecesarios.
- Backups: política diaria y punto de restauración documentado.
- Propósito: validación operativa con usuarios PROA.

## Producción

- Base de datos: entorno separado de desarrollo y piloto.
- Frontend: dominio institucional con SSL.
- Datos permitidos: datos reales bajo políticas institucionales.
- Credenciales: mínimo privilegio, MFA cuando aplique, rotación documentada.
- Logs: centralizados, sanitizados y con retención definida.
- Backups: plan probado de restauración.
- Propósito: operación asistencial estable.
