# Pilot Readiness Checklist

## Técnica

- [ ] `npm run build` pasa.
- [ ] `npm run lint` pasa.
- [ ] `npm run validate:e2e` pasa contra Supabase real.
- [ ] `npm run validate:rls` pasa con dos usuarios reales.
- [ ] Variables de entorno configuradas fuera del repositorio.
- [ ] HTTPS/SSL activo.
- [ ] Backup Supabase verificado.
- [ ] Dominio o URL piloto aprobado.

## Funcional

- [ ] Login y selección IPS.
- [ ] Búsqueda/creación de paciente.
- [ ] Crear/continuar/cerrar caso.
- [ ] Ronda clínica completa.
- [ ] Tratamientos e historial.
- [ ] Microbiología.
- [ ] Intervenciones.
- [ ] Nota y confirmación.
- [ ] DDD y ocupación.
- [ ] Estados confirmados/cerrados/anulados solo lectura.

## Analítica

- [ ] MARTs revisadas.
- [ ] `mart_ddd` incluye `antimicrobiano_id` y `codigo_atc`.
- [ ] `mart_casos_proa` disponible.
- [ ] Modelo Looker con filtros IPS/periodo/servicio.
- [ ] Diccionario de indicadores disponible.

## Seguridad

- [ ] Usuarios nominales creados.
- [ ] Roles `Administrador IPS`, `PROA`, `Consulta` auditados.
- [ ] RLS Multi-IPS validado.
- [ ] Sin `service_role` en frontend.
- [ ] Credenciales Looker definidas con mínimo privilegio.

## Operación

- [ ] Responsable PROA asignado.
- [ ] Responsable técnico asignado.
- [ ] Canal de incidencias definido.
- [ ] Capacitación breve realizada.
- [ ] Periodo piloto definido.
- [ ] Criterios de éxito acordados.
- [ ] Plan de reversa documentado.
