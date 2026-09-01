# Milestone 6D.1 - Auditoria RLS y permisos

## Matriz objetivo

| Recurso | Administrador | Usuario INFECTOMAG | IPS Cliente |
| --- | --- | --- | --- |
| Administracion | RW | NO | NO |
| IPS/configuracion | RW | R | R propia |
| Usuarios y accesos | RW | NO | NO |
| Servicios | RW | R | R propia |
| Pacientes | RW | RW | R |
| Casos | RW | RW | R |
| Rondas | RW | RW | R |
| Tratamientos | RW | RW | R |
| Microbiologia | RW | RW | R |
| Intervenciones | RW | RW | R |
| Notas | RW | RW | R |
| DDD operativo | RW | RW | R |
| Indicadores/MARTs | R | R | R |
| Calidad de Datos | R | R | R |
| Catalogos | RW | R | R |
| OMS DDD | RW | R | R |

## Validacion esperada

`npm run validate:6d1` prueba con tres usuarios reales:

- Administrador: lectura de configuracion y escritura administrativa reversible.
- Usuario INFECTOMAG: consulta analitica, rechazo al modificar servicios/catalogos y rechazo de autoescalamiento.
- IPS Cliente: lectura de su IPS, rechazo de insercion/actualizacion operativa y rechazo de acceso a otra IPS.

## Riesgos

- Si RLS aun permite escritura a `IPS Cliente`, ocultar botones en UI no es suficiente.
- Si `Usuario INFECTOMAG` puede modificar `usuario_ips`, existe riesgo de escalamiento.
- Si vistas analiticas usan `security definer`, deben exponerse solo mediante filtros o usuario analitico restringido.
- Si Administrador necesita ver todas las IPS sin asignaciones explicitas, las politicas de `ips` y funciones de acceso deben reconocer `perfiles_usuario.es_admin_global`.

## Estado

El frontend implementa controles de experiencia y proteccion de ruta, pero la aprobacion de seguridad depende de ejecutar `validate:6d1` contra Supabase real con las tres cuentas.
