# PROA V2 - Milestone 3 Schema Proposal

## Estado de inspección

En esta sesión no están disponibles `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `PROA_TEST_EMAIL` ni `PROA_TEST_PASSWORD`, por lo que no fue posible inspeccionar el esquema real de Supabase ni validar RLS desde Codex.

Antes de implementar frontend para Milestone 3 se debe confirmar si existen y cómo están definidas las tablas actuales relacionadas con DDD, incluyendo `oms_ddd`, `ddd_registros`, `ddd_consumos` y cualquier vista `mart_ddd`.

## Objetivo del esquema

Separar consumo institucional, ocupación y referencia OMS DDD, manteniendo los tratamientos clínicos PROA como fuente distinta. La relación analítica posterior se hará por `ips_id`, `periodo`, `servicio_id`, `antimicrobiano_id` y `via`.

## SQL propuesto

Este SQL es no destructivo y debe revisarse contra el esquema real antes de ejecutarse.

```sql
create table if not exists public.catalogo_ddd_oms (
  id uuid primary key default gen_random_uuid(),
  antimicrobiano_id uuid not null references public.catalogo_antimicrobianos(id),
  codigo_atc text not null,
  principio_activo text,
  via text not null,
  ddd_oms numeric not null check (ddd_oms > 0),
  unidad_ddd text not null default 'g',
  fuente text not null default 'OMS ATC/DDD',
  version text,
  estado text not null default 'Activo',
  fecha_creacion timestamptz not null default now(),
  unique (antimicrobiano_id, via, coalesce(version, ''))
);

create table if not exists public.consumo_antimicrobianos (
  id uuid primary key default gen_random_uuid(),
  ips_id uuid not null references public.ips(id),
  periodo date not null,
  servicio_id uuid references public.servicios_ips(id),
  antimicrobiano_id uuid not null references public.catalogo_antimicrobianos(id),
  via text not null,
  presentacion_cantidad numeric,
  presentacion_unidad text,
  cantidad_consumida numeric not null check (cantidad_consumida >= 0),
  unidad_consumo text,
  cantidad_total_gramos numeric not null check (cantidad_total_gramos >= 0),
  fuente text,
  estado text not null default 'Borrador',
  usuario_registra uuid references auth.users(id),
  fecha_registro timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  check (periodo = date_trunc('month', periodo)::date)
);

create index if not exists idx_consumo_antimicrobianos_periodo
  on public.consumo_antimicrobianos (ips_id, periodo, servicio_id, antimicrobiano_id, via);

create table if not exists public.ocupacion_servicios (
  id uuid primary key default gen_random_uuid(),
  ips_id uuid not null references public.ips(id),
  servicio_id uuid references public.servicios_ips(id),
  periodo date not null,
  camas_disponibles numeric check (camas_disponibles is null or camas_disponibles >= 0),
  camas_dia numeric not null check (camas_dia >= 0),
  pacientes_dia numeric check (pacientes_dia is null or pacientes_dia >= 0),
  fuente text,
  estado text not null default 'Borrador',
  usuario_registra uuid references auth.users(id),
  fecha_registro timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  check (periodo = date_trunc('month', periodo)::date)
);

create index if not exists idx_ocupacion_servicios_periodo
  on public.ocupacion_servicios (ips_id, periodo, servicio_id);
```

## Vista analítica propuesta

```sql
create or replace view public.mart_ddd
with (security_invoker = true)
as
select
  c.ips_id,
  i.nombre as ips,
  c.periodo,
  c.servicio_id,
  s.nombre as servicio,
  c.antimicrobiano_id,
  coalesce(a.nombre, a.descripcion, a.codigo, c.antimicrobiano_id::text) as antimicrobiano,
  d.codigo_atc,
  c.via,
  c.cantidad_total_gramos as gramos_consumidos,
  d.ddd_oms,
  c.cantidad_total_gramos / nullif(d.ddd_oms, 0) as ddd_consumidas,
  o.camas_dia,
  case
    when o.camas_dia is null or o.camas_dia = 0 then null
    else ((c.cantidad_total_gramos / nullif(d.ddd_oms, 0)) / o.camas_dia) * 100
  end as ddd_100_camas_dia,
  case
    when d.id is null then 'Referencia OMS pendiente'
    when o.id is null then 'Denominador pendiente'
    when o.camas_dia = 0 then 'Denominador inválido'
    else 'Calculable'
  end as estado_calculo
from public.consumo_antimicrobianos c
join public.ips i on i.id = c.ips_id
left join public.servicios_ips s on s.id = c.servicio_id
left join public.catalogo_antimicrobianos a on a.id = c.antimicrobiano_id
left join public.catalogo_ddd_oms d
  on d.antimicrobiano_id = c.antimicrobiano_id
 and lower(d.via) = lower(c.via)
 and d.estado = 'Activo'
left join public.ocupacion_servicios o
  on o.ips_id = c.ips_id
 and o.periodo = c.periodo
 and (
   o.servicio_id = c.servicio_id
   or (o.servicio_id is null and c.servicio_id is null)
 );
```

## RLS propuesta

Las políticas deben seguir el modelo Multi-IPS existente basado en `usuario_ips`.

```sql
alter table public.catalogo_ddd_oms enable row level security;
alter table public.consumo_antimicrobianos enable row level security;
alter table public.ocupacion_servicios enable row level security;

create policy "catalogo ddd oms lectura autenticada"
on public.catalogo_ddd_oms
for select
to authenticated
using (estado = 'Activo');

create policy "consumo select ips asignada"
on public.consumo_antimicrobianos
for select
to authenticated
using (
  exists (
    select 1 from public.usuario_ips ui
    where ui.usuario_id = (select auth.uid())
      and ui.ips_id = consumo_antimicrobianos.ips_id
      and ui.estado = 'Activo'
  )
);

create policy "consumo insert ips asignada"
on public.consumo_antimicrobianos
for insert
to authenticated
with check (
  exists (
    select 1 from public.usuario_ips ui
    where ui.usuario_id = (select auth.uid())
      and ui.ips_id = consumo_antimicrobianos.ips_id
      and ui.estado = 'Activo'
      and ui.rol in ('Administrador IPS', 'PROA')
  )
);

create policy "consumo update ips asignada"
on public.consumo_antimicrobianos
for update
to authenticated
using (
  exists (
    select 1 from public.usuario_ips ui
    where ui.usuario_id = (select auth.uid())
      and ui.ips_id = consumo_antimicrobianos.ips_id
      and ui.estado = 'Activo'
      and ui.rol in ('Administrador IPS', 'PROA')
  )
)
with check (
  exists (
    select 1 from public.usuario_ips ui
    where ui.usuario_id = (select auth.uid())
      and ui.ips_id = consumo_antimicrobianos.ips_id
      and ui.estado = 'Activo'
      and ui.rol in ('Administrador IPS', 'PROA')
  )
);

create policy "consumo delete borrador ips asignada"
on public.consumo_antimicrobianos
for delete
to authenticated
using (
  estado = 'Borrador'
  and exists (
    select 1 from public.usuario_ips ui
    where ui.usuario_id = (select auth.uid())
      and ui.ips_id = consumo_antimicrobianos.ips_id
      and ui.estado = 'Activo'
      and ui.rol in ('Administrador IPS', 'PROA')
  )
);
```

Repetir las políticas de `consumo_antimicrobianos` para `ocupacion_servicios`, cambiando el nombre de tabla.

## Reglas de cálculo

- `cantidad_total_gramos = cantidad_consumida * presentación_en_gramos`.
- `ddd_consumidas = cantidad_total_gramos / ddd_oms`.
- `ddd_100_camas_dia = (ddd_consumidas / camas_dia) * 100`.
- Si `ddd_oms` falta, mostrar `Referencia OMS pendiente`.
- Si `camas_dia` falta o es 0, mostrar `Denominador pendiente` o `Denominador inválido`.

## Decisión pendiente

Antes de implementar el módulo se debe decidir si reutilizar `oms_ddd`, `ddd_registros` y `ddd_consumos` existentes o migrar a los nombres normalizados propuestos. Esta decisión requiere inspección real del esquema y datos actuales.
