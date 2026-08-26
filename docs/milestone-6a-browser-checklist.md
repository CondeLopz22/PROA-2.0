# Milestone 6A Browser Checklist

Ejecutar en navegador real contra Supabase real. Milestone 6A no se aprueba solo con build/lint.

- [ ] Login correcto.
- [ ] Seleccionar IPS activa.
- [ ] Abrir paciente de prueba visible por RLS.
- [ ] Confirmar que existe caso activo o crear uno.
- [ ] Si ya hay caso activo, pulsar `Crear nuevo caso` y comprobar advertencia de episodio independiente.
- [ ] Continuar caso activo sin crear un caso adicional.
- [ ] Abrir ronda en `Borrador`.
- [ ] Registrar diagnóstico principal.
- [ ] Pulsar `+ Agregar antimicrobiano`.
- [ ] Hacer foco en `Antimicrobiano`.
- [ ] Escribir parte del nombre.
- [ ] Seleccionar una opción del catálogo.
- [ ] Comprobar que quedan guardados ID y nombre visible al guardar.
- [ ] Guardar progreso.
- [ ] Recargar navegador.
- [ ] Comprobar que el tratamiento persiste y no se duplicó.
- [ ] En microbiología seleccionar `Sí`.
- [ ] Hacer foco en `Tipo de muestra`.
- [ ] Buscar y seleccionar tipo de muestra activo.
- [ ] Seleccionar `Resultado general = Positivo`.
- [ ] Hacer foco en `Microorganismo`.
- [ ] Buscar y seleccionar microorganismo.
- [ ] Comprobar que `tipo_germen` se deriva del catálogo si existe.
- [ ] Registrar sensibilidad relevante si aplica.
- [ ] Registrar intervención PROA.
- [ ] Pulsar `Actualizar nota`.
- [ ] Comprobar que aparece texto de nota sin `null`, `undefined` ni encabezados vacíos.
- [ ] Editar manualmente la nota.
- [ ] Guardar progreso.
- [ ] Recargar navegador.
- [ ] Comprobar persistencia de microbiología, intervención y nota editada.
- [ ] Confirmar ronda.
- [ ] Comprobar que la ronda confirmada queda solo lectura.

## Evidencias sugeridas

- Captura del autocomplete de antimicrobiano abierto.
- Captura del microorganismo seleccionado con tipo de germen derivado.
- Captura de nota generada y editada.
- Conteo antes/después de tratamientos para confirmar que no se duplicó.
