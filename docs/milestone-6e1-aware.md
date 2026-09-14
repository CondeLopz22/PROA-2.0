# Milestone 6E.1 - WHO AWaRe

## Objetivo

Integrar la clasificacion WHO AWaRe 2023 al catalogo global de antimicrobianos y a la analitica DDD, sin agregar carga de diligenciamiento al usuario.

## Migracion propuesta

Archivo:

`supabase/migrations/20260914090000_milestone_6e1_aware.sql`

La migracion esta preparada para revision y no fue aplicada a Supabase real.

## Cambios de esquema propuestos

En `catalogo_antimicrobianos`:

- `aware_categoria`
- `aware_nombre_oms`
- `atc_codigo`
- `clase_farmacologica`
- `aware_version`

Constraint propuesto para `aware_categoria`:

- `Access`
- `Watch`
- `Reserve`
- `No aplica`
- `Sin clasificar`

## Datos poblados

Se conservan los 48 antimicrobianos actuales. La migracion actualiza unicamente campos de catalogo global:

- 16 `Access`
- 16 `Watch`
- 8 `Reserve`
- 7 `No aplica`
- 1 `Sin clasificar`

`aware_nombre_oms` se deja igual al nombre existente cuando existe clasificacion validada.

`atc_codigo` copia `codigo_atc` cuando exista. Actualmente el proyecto real tiene `codigo_atc` nulo en los 48 registros inspeccionados, por lo que no se inventan codigos ATC.

`clase_farmacologica` queda preparada para uso futuro. No se pobla en esta entrega porque no se entrego una fuente validada de clases.

## MART DDD

`mart_ddd` se extiende con:

- `atc_codigo`
- `aware_categoria`
- `aware_nombre_oms`
- `clase_farmacologica`
- `aware_version`

No se modifican calculos transaccionales DDD ni triggers existentes.

## Indicador principal

`% Access`:

```text
DDD Access / (DDD Access + DDD Watch + DDD Reserve) * 100
```

`No aplica` y `Sin clasificar` se excluyen del denominador AWaRe.

## UX

DDD incorpora:

- KPIs `DDD Access`, `DDD Watch`, `DDD Reserve`, `% Access`.
- Filtro por categoria AWaRe.
- Distribucion AWaRe.
- Tendencia temporal Access/Watch/Reserve.
- Desglose por antimicrobiano.

Indicadores PROA incorpora KPIs AWaRe con navegacion contextual al modulo DDD.

## Validacion posterior

Despues de aplicar la migracion, ejecutar:

```bash
npm run validate:6e1
```

La validacion requiere:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `PROA_TEST_ADMIN_EMAIL`
- `PROA_TEST_ADMIN_PASSWORD`
- `PROA_TEST_INFECTOMAG_EMAIL`
- `PROA_TEST_INFECTOMAG_PASSWORD`
- `PROA_TEST_CLIENT_EMAIL`
- `PROA_TEST_CLIENT_PASSWORD`

## Riesgos / pendientes

- `validate:6e1` no debe declararse aprobado antes de aplicar la migracion en Supabase real.
- Los codigos ATC y clases farmacologicas no deben poblarse por inferencia automatica.
- AWaRe no reemplaza estado `Activo/Inactivo` ni disponibilidad institucional.
