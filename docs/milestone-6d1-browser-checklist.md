# Milestone 6D.1 - Checklist navegador

## Administrador

- [ ] Ve `Administracion` en el sidebar.
- [ ] Puede abrir `/administracion`.
- [ ] Puede ver Institucion, Usuarios y accesos, Servicios, Catalogos, DDD/OMS y Auditoria.
- [ ] Puede crear/activar/desactivar servicios si RLS lo permite.
- [ ] Puede cambiar rol/estado de una asignacion existente si RLS lo permite.
- [ ] No usa credenciales `service_role` en frontend.

## Usuario INFECTOMAG

- [ ] No ve `Administracion` en el sidebar.
- [ ] Al navegar manualmente a `/administracion`, ve acceso denegado.
- [ ] Puede buscar pacientes y crear rondas en IPS asignada.
- [ ] Puede registrar tratamientos, microbiologia, intervencion, nota y DDD.
- [ ] No puede modificar servicios ni catalogos administrativos.

## IPS Cliente

- [ ] No ve `Administracion` en el sidebar.
- [ ] Al navegar manualmente a `/administracion`, ve acceso denegado.
- [ ] Ve Cockpit, Rondas, Pacientes, DDD, Calidad e Indicadores de su IPS.
- [ ] No ve botones de crear, guardar, confirmar o editar.
- [ ] Intentos directos de escritura son rechazados por RLS.
- [ ] No ve informacion de otra IPS.
