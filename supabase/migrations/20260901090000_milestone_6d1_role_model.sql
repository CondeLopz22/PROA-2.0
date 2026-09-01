-- Milestone 6D.1 - modelo definitivo de usuarios PROA.
-- PENDIENTE DE APLICAR tras revisión operativa.
-- Objetivo: homologar los roles visibles y proveer funciones auxiliares para políticas RLS.

begin;

update public.usuario_ips
set rol = 'Administrador'
where rol = 'Administrador IPS';

update public.usuario_ips
set rol = 'Usuario INFECTOMAG'
where rol = 'PROA';

update public.usuario_ips
set rol = 'IPS Cliente'
where rol = 'Consulta';

create or replace function public.es_administrador_proa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfiles_usuario p
    where p.usuario_id = auth.uid()
      and p.estado = 'Activo'
      and p.es_admin_global = true
  )
  or exists (
    select 1
    from public.usuario_ips ui
    where ui.usuario_id = auth.uid()
      and ui.estado = 'Activo'
      and ui.rol = 'Administrador'
  );
$$;

create or replace function public.es_usuario_infectomag_en_ips(target_ips_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_administrador_proa()
  or exists (
    select 1
    from public.usuario_ips ui
    where ui.usuario_id = auth.uid()
      and ui.ips_id = target_ips_id
      and ui.estado = 'Activo'
      and ui.rol = 'Usuario INFECTOMAG'
  );
$$;

create or replace function public.es_ips_cliente_en_ips(target_ips_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuario_ips ui
    where ui.usuario_id = auth.uid()
      and ui.ips_id = target_ips_id
      and ui.estado = 'Activo'
      and ui.rol = 'IPS Cliente'
  );
$$;

commit;
