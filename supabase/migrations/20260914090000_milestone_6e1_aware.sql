-- Milestone 6E.1 - WHO AWaRe para catalogo global y mart_ddd.
-- PENDIENTE DE APLICAR tras revision. No modifica datos clinicos historicos.
-- Fuente declarada: WHO AWaRe Classification 2023, clasificacion PROA validada.

begin;

alter table public.catalogo_antimicrobianos
  add column if not exists aware_categoria text,
  add column if not exists aware_nombre_oms text,
  add column if not exists atc_codigo text,
  add column if not exists clase_farmacologica text,
  add column if not exists aware_version text;

alter table public.catalogo_antimicrobianos
  drop constraint if exists catalogo_antimicrobianos_aware_categoria_check;

alter table public.catalogo_antimicrobianos
  add constraint catalogo_antimicrobianos_aware_categoria_check
  check (
    aware_categoria is null
    or aware_categoria = any (array[
      'Access'::text,
      'Watch'::text,
      'Reserve'::text,
      'No aplica'::text,
      'Sin clasificar'::text
    ])
  );

update public.catalogo_antimicrobianos
set
  aware_categoria = case
    when upper(nombre) = any (array[
      'AMIKACINA',
      'AMOXACILINA',
      'AMOXACILINA + INHIBIDOR',
      'AMPICILINA',
      'AMPICILINA + INHIBIDOR',
      'CEFALEXINA',
      'CEFALOTINA',
      'CEFAZOLINA',
      'CEFRADINA',
      'CLINDAMICINA',
      'DOXICICLINA',
      'GENTAMICINA',
      'METRONIDAZOL',
      'NITROFURANTOINA',
      'OXACILINA',
      'TRIMETOPRIM SULFA'
    ]) then 'Access'
    when upper(nombre) = any (array[
      'AZITROMICINA',
      'CEFEPIME',
      'CEFOTAXIME',
      'CEFTAZIDIME',
      'CEFTRIAXONA',
      'CEFUROXIMA',
      'CIPROFLOXACINO',
      'CLARITROMICINA',
      'ERITROMICINA',
      'ERTAPENEM',
      'IMIPENEM',
      'LEVOFLOXACINO',
      'MEROPENEM',
      'MOXIFLOXACINO',
      'PIPERACILINA',
      'VANCOMICINA'
    ]) then 'Watch'
    when upper(nombre) = any (array[
      'AZTREONAN',
      'CEFTAROLINA',
      'CEFTAZIDIME+INHIB',
      'COLISTINA',
      'DAPTOMICINA',
      'LINEZOLID',
      'POLIMIXINA',
      'TIGECICLINA'
    ]) then 'Reserve'
    when upper(nombre) = any (array[
      'ACICLOVIR',
      'ALBENDAZOL',
      'ANFOTERICINA',
      'CASPOFUNGINA',
      'FLUCONAZOL',
      'GANCICLOVIR',
      'VORICONAZOL'
    ]) then 'No aplica'
    when upper(nombre) = 'PENICILINA' then 'Sin clasificar'
    else coalesce(aware_categoria, 'Sin clasificar')
  end,
  aware_nombre_oms = case
    when upper(nombre) in (
      'AMIKACINA','AMOXACILINA','AMOXACILINA + INHIBIDOR','AMPICILINA',
      'AMPICILINA + INHIBIDOR','CEFALEXINA','CEFALOTINA','CEFAZOLINA',
      'CEFRADINA','CLINDAMICINA','DOXICICLINA','GENTAMICINA',
      'METRONIDAZOL','NITROFURANTOINA','OXACILINA','TRIMETOPRIM SULFA',
      'AZITROMICINA','CEFEPIME','CEFOTAXIME','CEFTAZIDIME','CEFTRIAXONA',
      'CEFUROXIMA','CIPROFLOXACINO','CLARITROMICINA','ERITROMICINA',
      'ERTAPENEM','IMIPENEM','LEVOFLOXACINO','MEROPENEM','MOXIFLOXACINO',
      'PIPERACILINA','VANCOMICINA','AZTREONAN','CEFTAROLINA',
      'CEFTAZIDIME+INHIB','COLISTINA','DAPTOMICINA','LINEZOLID',
      'POLIMIXINA','TIGECICLINA','ACICLOVIR','ALBENDAZOL','ANFOTERICINA',
      'CASPOFUNGINA','FLUCONAZOL','GANCICLOVIR','VORICONAZOL','PENICILINA'
    ) then nombre
    else aware_nombre_oms
  end,
  atc_codigo = coalesce(atc_codigo, codigo_atc),
  aware_version = case
    when upper(nombre) in (
      'AMIKACINA','AMOXACILINA','AMOXACILINA + INHIBIDOR','AMPICILINA',
      'AMPICILINA + INHIBIDOR','CEFALEXINA','CEFALOTINA','CEFAZOLINA',
      'CEFRADINA','CLINDAMICINA','DOXICICLINA','GENTAMICINA',
      'METRONIDAZOL','NITROFURANTOINA','OXACILINA','TRIMETOPRIM SULFA',
      'AZITROMICINA','CEFEPIME','CEFOTAXIME','CEFTAZIDIME','CEFTRIAXONA',
      'CEFUROXIMA','CIPROFLOXACINO','CLARITROMICINA','ERITROMICINA',
      'ERTAPENEM','IMIPENEM','LEVOFLOXACINO','MEROPENEM','MOXIFLOXACINO',
      'PIPERACILINA','VANCOMICINA','AZTREONAN','CEFTAROLINA',
      'CEFTAZIDIME+INHIB','COLISTINA','DAPTOMICINA','LINEZOLID',
      'POLIMIXINA','TIGECICLINA','ACICLOVIR','ALBENDAZOL','ANFOTERICINA',
      'CASPOFUNGINA','FLUCONAZOL','GANCICLOVIR','VORICONAZOL','PENICILINA'
    ) then 'WHO AWaRe 2023'
    else aware_version
  end;

create or replace view public.mart_ddd
with (security_invoker = true) as
select
  r.id as registro_ddd_id,
  c.id as consumo_id,
  r.ips_id,
  i.nombre as ips,
  r.periodo,
  r.servicio_id,
  s.nombre as servicio,
  r.camas_disponibles,
  r.camas_dia_ocupadas,
  r.porcentaje_ocupacion,
  c.antimicrobiano_id,
  a.nombre as antimicrobiano,
  a.codigo_atc,
  c.via,
  c.gramos_consumidos,
  c.ddd_oms,
  c.ddd_calculadas,
  c.ddd_100_camas_dia,
  r.estado as estado_registro,
  -- `codigo_atc` se conserva arriba por compatibilidad con consumidores actuales.
  -- `atc_codigo` se anexa como campo AWaRe canonico sin reordenar la vista existente.
  coalesce(a.atc_codigo, a.codigo_atc) as atc_codigo,
  a.aware_categoria,
  a.aware_nombre_oms,
  a.clase_farmacologica,
  a.aware_version
from public.ddd_registros r
join public.ddd_consumos c on c.registro_id = r.id
join public.ips i on i.id = r.ips_id
left join public.servicios_ips s on s.id = r.servicio_id
left join public.catalogo_antimicrobianos a on a.id = c.antimicrobiano_id;

commit;

-- Auditoria posterior sugerida:
--
-- select aware_categoria, count(*)
-- from public.catalogo_antimicrobianos
-- group by aware_categoria
-- order by aware_categoria;
--
-- select count(*) from public.catalogo_antimicrobianos;
--
-- select column_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'mart_ddd'
--   and column_name in ('aware_categoria','atc_codigo','clase_farmacologica','aware_version');
