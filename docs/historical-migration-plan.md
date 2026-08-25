# PROA V2 - Historical Migration Plan

## Alcance

Milestone 4 no migra la base histórica completa. Define estrategia, prevalidación y dry-run para un lote piloto de 10 a 20 registros desidentificados.

## Fuentes

### Fuente clínica histórica

Hoja clínica histórica principal. Se espera información de paciente, episodio, ronda, antimicrobianos, microbiología e intervención cuando exista.

### Fuente DDD

- `OUT_DDD`: resultados históricos ya consolidados.
- `OMS_DDD`: referencia histórica de DDD.
- `IN_CONSUMO`: fuente de consumo cuando exista.
- `IN_OCUPACION`: fuente de camas-día/ocupación cuando exista.

## Clasificación DDD histórica

- A. Recalculable: tiene consumo, concentración, cantidad, vía, OMS DDD y camas-día.
- B. Importable como resultado histórico: solo tiene resultado consolidado, sin fuente completa.
- C. Incompleto: faltan denominadores o referencia.

No se debe fingir exactitud cuando el histórico solo permite clase B o C.

## Flujo piloto

1. Leer lote local desidentificado.
2. Normalizar nombres de columnas.
3. Resolver paciente por `ips_id + tipo_identificacion + numero_identificacion`.
4. Mostrar preview:
   - pacientes a crear;
   - pacientes existentes;
   - casos a crear;
   - rondas;
   - tratamientos;
   - microbiología;
   - intervenciones;
   - errores;
   - campos omitidos.
5. Detener antes de escribir salvo confirmación explícita futura.

## Reglas conservadoras

- No duplicar pacientes.
- No crear episodios separados si no hay fecha o criterio claro.
- No inventar fechas de inicio, cierre ni resultados.
- Cada antimicrobiano histórico se modela como fila independiente.
- Microbiología solo se crea cuando hay evidencia.
- Intervención solo se crea cuando hay evidencia explícita.

## Limpieza

Los datos piloto deben marcarse con `VALIDACION-M4` o `HIST-M4`. Si se cargan en una fase futura, deben poder anularse sin DELETE físico.
