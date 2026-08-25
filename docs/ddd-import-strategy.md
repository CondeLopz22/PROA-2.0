# PROA V2 - DDD Import Strategy

## Objetivo

Preparar una ruta de importación CSV/Excel para consumo y ocupación sin convertir Milestone 3 en un cargue masivo definitivo.

## Flujo propuesto

1. Cargar archivo CSV/XLSX en el navegador.
2. Detectar hojas disponibles.
3. Mapear columnas a un contrato intermedio.
4. Validar filas antes de escribir en Supabase.
5. Mostrar preview con errores y advertencias.
6. Insertar o actualizar solo filas aprobadas.
7. Generar resumen posterior: creadas, actualizadas, omitidas y con error.

## Contrato intermedio consumo

Campos mínimos:

- `periodo`: fecha o mes; se normaliza al primer día del mes.
- `servicio`: nombre o código; se resuelve contra `servicios_ips` de la IPS activa.
- `antimicrobiano`: nombre, código interno o id; se resuelve contra `catalogo_antimicrobianos`.
- `via`.
- `cantidad_consumida`.
- `presentacion_cantidad`.
- `presentacion_unidad`.
- `fuente`.

Campo calculado:

- `cantidad_total_gramos`.

## Contrato intermedio ocupación

Campos mínimos:

- `periodo`: fecha o mes; se normaliza al primer día del mes.
- `servicio`: opcional para denominador institucional global.
- `camas_dia`.
- `camas_disponibles`: opcional.
- `pacientes_dia`: opcional.
- `fuente`.

## Validaciones de consumo

- IPS activa obligatoria.
- Periodo mensual válido.
- Antimicrobiano resoluble.
- Vía informada.
- Cantidad no negativa.
- Presentación convertible a gramos cuando el usuario no entrega gramos directamente.
- Duplicado potencial por `ips_id + periodo + servicio_id + antimicrobiano_id + via`.
- Referencia OMS DDD faltante para `antimicrobiano_id + via`.

## Validaciones de ocupación

- IPS activa obligatoria.
- Servicio perteneciente a la IPS activa cuando aplique.
- Periodo mensual válido.
- `camas_dia` no nulo y mayor o igual a 0.
- Advertir si `camas_dia = 0`.
- Duplicado potencial por `ips_id + periodo + servicio_id`.

## Estrategia de duplicados

No imponer `unique` hasta confirmar fuentes reales. En el preview:

- `nuevo`: no existe registro equivalente.
- `actualiza`: existe registro en borrador con la misma clave conceptual.
- `conflicto`: existe más de un registro equivalente o existe registro confirmado.

## Auditoría mínima

Cada importación futura debería registrar:

- usuario autenticado;
- IPS activa;
- nombre del archivo;
- hash del archivo;
- fecha de importación;
- conteo de filas;
- resultado por fila.

## Fuera de alcance en Milestone 3

- Importador masivo definitivo.
- Parseo avanzado de plantillas variables.
- Corrección automática de nombres ambiguos.
- Creación automática de catálogos clínicos.
