-- Milestone 6D.1 - modelo definitivo de usuarios y RLS PROA.
-- PENDIENTE DE APLICAR tras revisión operativa.
--
-- Modelo final:
-- - Administrador: public.perfiles_usuario.es_admin_global = true.
-- - Usuario INFECTOMAG: public.usuario_ips.rol = 'Usuario INFECTOMAG'.
-- - IPS Cliente: public.usuario_ips.rol = 'IPS Cliente'.
--
-- Esta migración no toca datos clínicos. Homologa roles, promueve
-- explícitamente al administrador actual definido por producto y endurece RLS.

begin;

alter table public.usuario_ips
  drop constraint if exists usuario_ips_rol_check;

update public.perfiles_usuario
set es_admin_global = true
where usuario_id = '0820c02c-0879-4dfb-a53e-9d6dfe894edb';

update public.usuario_ips
set rol = 'Usuario INFECTOMAG'
where rol in ('Administrador IPS', 'PROA');

update public.usuario_ips
set rol = 'IPS Cliente'
where rol = 'Consulta';

alter table public.usuario_ips
  add constraint usuario_ips_rol_check
  check (rol = any (array['Usuario INFECTOMAG'::text, 'IPS Cliente'::text]));

create or replace function public.es_admin_global()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.es_admin_global
    from public.perfiles_usuario p
    where p.usuario_id = auth.uid()
      and p.estado = 'Activo'
  ), false);
$$;

create or replace function public.puede_leer_ips(target_ips_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_admin_global()
  or exists (
    select 1
    from public.usuario_ips ui
    where ui.usuario_id = auth.uid()
      and ui.ips_id = target_ips_id
      and ui.estado = 'Activo'
  );
$$;

create or replace function public.puede_escribir_operacion_ips(target_ips_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_admin_global()
  or exists (
    select 1
    from public.usuario_ips ui
    where ui.usuario_id = auth.uid()
      and ui.ips_id = target_ips_id
      and ui.estado = 'Activo'
      and ui.rol = 'Usuario INFECTOMAG'
  );
$$;

create or replace function public.puede_administrar_proa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_admin_global();
$$;

create or replace function public.tiene_acceso_ips(p_ips_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.puede_leer_ips(p_ips_id);
$$;

drop policy if exists ips_admin_insert on public.ips;
drop policy if exists ips_ver on public.ips;
drop policy if exists ips_admin_update on public.ips;
create policy ips_admin_insert on public.ips for insert to authenticated
with check (public.puede_administrar_proa());
create policy ips_ver on public.ips for select to authenticated
using (public.puede_leer_ips(id));
create policy ips_admin_update on public.ips for update to authenticated
using (public.puede_administrar_proa())
with check (public.puede_administrar_proa());

drop policy if exists perfiles_ver_propio on public.perfiles_usuario;
drop policy if exists perfiles_insert_admin on public.perfiles_usuario;
drop policy if exists perfiles_update_admin on public.perfiles_usuario;
drop policy if exists perfiles_delete_admin on public.perfiles_usuario;
create policy perfiles_ver_propio on public.perfiles_usuario for select to authenticated
using ((usuario_id = auth.uid()) or public.puede_administrar_proa());
create policy perfiles_insert_admin on public.perfiles_usuario for insert to authenticated
with check (public.puede_administrar_proa());
create policy perfiles_update_admin on public.perfiles_usuario for update to authenticated
using (public.puede_administrar_proa())
with check (public.puede_administrar_proa());
create policy perfiles_delete_admin on public.perfiles_usuario for delete to authenticated
using (public.puede_administrar_proa());

drop policy if exists usuario_ips_ver on public.usuario_ips;
drop policy if exists usuario_ips_insert_admin on public.usuario_ips;
drop policy if exists usuario_ips_update_admin on public.usuario_ips;
drop policy if exists usuario_ips_delete_admin on public.usuario_ips;
create policy usuario_ips_ver on public.usuario_ips for select to authenticated
using ((usuario_id = auth.uid()) or public.puede_administrar_proa());
create policy usuario_ips_insert_admin on public.usuario_ips for insert to authenticated
with check (public.puede_administrar_proa());
create policy usuario_ips_update_admin on public.usuario_ips for update to authenticated
using (public.puede_administrar_proa())
with check (public.puede_administrar_proa());
create policy usuario_ips_delete_admin on public.usuario_ips for delete to authenticated
using (public.puede_administrar_proa());

drop policy if exists pacientes_crear on public.pacientes;
drop policy if exists pacientes_ver on public.pacientes;
drop policy if exists pacientes_editar on public.pacientes;
create policy pacientes_crear on public.pacientes for insert to authenticated
with check (public.puede_escribir_operacion_ips(ips_id));
create policy pacientes_ver on public.pacientes for select to authenticated
using (public.puede_leer_ips(ips_id));
create policy pacientes_editar on public.pacientes for update to authenticated
using (public.puede_escribir_operacion_ips(ips_id))
with check (public.puede_escribir_operacion_ips(ips_id));

drop policy if exists casos_crear on public.casos_proa;
drop policy if exists casos_ver on public.casos_proa;
drop policy if exists casos_editar on public.casos_proa;
create policy casos_crear on public.casos_proa for insert to authenticated
with check (public.puede_escribir_operacion_ips(ips_id));
create policy casos_ver on public.casos_proa for select to authenticated
using (public.puede_leer_ips(ips_id));
create policy casos_editar on public.casos_proa for update to authenticated
using (public.puede_escribir_operacion_ips(ips_id))
with check (public.puede_escribir_operacion_ips(ips_id));

drop policy if exists rondas_crear on public.rondas_proa;
drop policy if exists rondas_ver on public.rondas_proa;
drop policy if exists rondas_editar on public.rondas_proa;
create policy rondas_crear on public.rondas_proa for insert to authenticated
with check (public.puede_escribir_operacion_ips(ips_id));
create policy rondas_ver on public.rondas_proa for select to authenticated
using (public.puede_leer_ips(ips_id));
create policy rondas_editar on public.rondas_proa for update to authenticated
using (public.puede_escribir_operacion_ips(ips_id))
with check (public.puede_escribir_operacion_ips(ips_id));

drop policy if exists diagnosticos_eliminar on public.diagnosticos_ronda;
drop policy if exists diagnosticos_crear on public.diagnosticos_ronda;
drop policy if exists diagnosticos_ver on public.diagnosticos_ronda;
drop policy if exists diagnosticos_editar on public.diagnosticos_ronda;
create policy diagnosticos_eliminar on public.diagnosticos_ronda for delete to authenticated
using (exists (select 1 from public.rondas_proa r where r.id = diagnosticos_ronda.ronda_id and public.puede_escribir_operacion_ips(r.ips_id)));
create policy diagnosticos_crear on public.diagnosticos_ronda for insert to authenticated
with check (exists (select 1 from public.rondas_proa r where r.id = diagnosticos_ronda.ronda_id and public.puede_escribir_operacion_ips(r.ips_id)));
create policy diagnosticos_ver on public.diagnosticos_ronda for select to authenticated
using (exists (select 1 from public.rondas_proa r where r.id = diagnosticos_ronda.ronda_id and public.puede_leer_ips(r.ips_id)));
create policy diagnosticos_editar on public.diagnosticos_ronda for update to authenticated
using (exists (select 1 from public.rondas_proa r where r.id = diagnosticos_ronda.ronda_id and public.puede_escribir_operacion_ips(r.ips_id)))
with check (exists (select 1 from public.rondas_proa r where r.id = diagnosticos_ronda.ronda_id and public.puede_escribir_operacion_ips(r.ips_id)));

drop policy if exists tratamientos_crear on public.tratamientos_antimicrobianos;
drop policy if exists tratamientos_ver on public.tratamientos_antimicrobianos;
drop policy if exists tratamientos_editar on public.tratamientos_antimicrobianos;
create policy tratamientos_crear on public.tratamientos_antimicrobianos for insert to authenticated
with check (public.puede_escribir_operacion_ips(ips_id));
create policy tratamientos_ver on public.tratamientos_antimicrobianos for select to authenticated
using (public.puede_leer_ips(ips_id));
create policy tratamientos_editar on public.tratamientos_antimicrobianos for update to authenticated
using (public.puede_escribir_operacion_ips(ips_id))
with check (public.puede_escribir_operacion_ips(ips_id));

drop policy if exists historial_crear on public.historial_tratamiento;
drop policy if exists historial_ver on public.historial_tratamiento;
create policy historial_crear on public.historial_tratamiento for insert to authenticated
with check (exists (select 1 from public.tratamientos_antimicrobianos t where t.id = historial_tratamiento.tratamiento_id and public.puede_escribir_operacion_ips(t.ips_id)));
create policy historial_ver on public.historial_tratamiento for select to authenticated
using (exists (select 1 from public.tratamientos_antimicrobianos t where t.id = historial_tratamiento.tratamiento_id and public.puede_leer_ips(t.ips_id)));

drop policy if exists microbiologia_delete on public.microbiologia;
drop policy if exists microbiologia_insert on public.microbiologia;
drop policy if exists microbiologia_all_select on public.microbiologia;
drop policy if exists microbiologia_update on public.microbiologia;
create policy microbiologia_delete on public.microbiologia for delete to authenticated
using (public.puede_escribir_operacion_ips(ips_id));
create policy microbiologia_insert on public.microbiologia for insert to authenticated
with check (public.puede_escribir_operacion_ips(ips_id));
create policy microbiologia_all_select on public.microbiologia for select to authenticated
using (public.puede_leer_ips(ips_id));
create policy microbiologia_update on public.microbiologia for update to authenticated
using (public.puede_escribir_operacion_ips(ips_id))
with check (public.puede_escribir_operacion_ips(ips_id));

drop policy if exists resistencia_delete on public.resistencia_microbiologica;
drop policy if exists resistencia_insert on public.resistencia_microbiologica;
drop policy if exists resistencia_select on public.resistencia_microbiologica;
create policy resistencia_delete on public.resistencia_microbiologica for delete to authenticated
using (exists (select 1 from public.microbiologia m where m.id = resistencia_microbiologica.muestra_id and public.puede_escribir_operacion_ips(m.ips_id)));
create policy resistencia_insert on public.resistencia_microbiologica for insert to authenticated
with check (exists (select 1 from public.microbiologia m where m.id = resistencia_microbiologica.muestra_id and public.puede_escribir_operacion_ips(m.ips_id)));
create policy resistencia_select on public.resistencia_microbiologica for select to authenticated
using (exists (select 1 from public.microbiologia m where m.id = resistencia_microbiologica.muestra_id and public.puede_leer_ips(m.ips_id)));

drop policy if exists sensibilidad_delete on public.sensibilidad_microbiologica;
drop policy if exists sensibilidad_insert on public.sensibilidad_microbiologica;
drop policy if exists sensibilidad_select on public.sensibilidad_microbiologica;
create policy sensibilidad_delete on public.sensibilidad_microbiologica for delete to authenticated
using (exists (select 1 from public.microbiologia m where m.id = sensibilidad_microbiologica.muestra_id and public.puede_escribir_operacion_ips(m.ips_id)));
create policy sensibilidad_insert on public.sensibilidad_microbiologica for insert to authenticated
with check (exists (select 1 from public.microbiologia m where m.id = sensibilidad_microbiologica.muestra_id and public.puede_escribir_operacion_ips(m.ips_id)));
create policy sensibilidad_select on public.sensibilidad_microbiologica for select to authenticated
using (exists (select 1 from public.microbiologia m where m.id = sensibilidad_microbiologica.muestra_id and public.puede_leer_ips(m.ips_id)));

drop policy if exists paraclinicos_insert on public.paraclinicos_ronda;
drop policy if exists paraclinicos_select on public.paraclinicos_ronda;
create policy paraclinicos_insert on public.paraclinicos_ronda for insert to authenticated
with check (exists (select 1 from public.rondas_proa r where r.id = paraclinicos_ronda.ronda_id and public.puede_escribir_operacion_ips(r.ips_id)));
create policy paraclinicos_select on public.paraclinicos_ronda for select to authenticated
using (exists (select 1 from public.rondas_proa r where r.id = paraclinicos_ronda.ronda_id and public.puede_leer_ips(r.ips_id)));

drop policy if exists estudios_insert on public.estudios_relevantes_ronda;
drop policy if exists estudios_select on public.estudios_relevantes_ronda;
create policy estudios_insert on public.estudios_relevantes_ronda for insert to authenticated
with check (exists (select 1 from public.rondas_proa r where r.id = estudios_relevantes_ronda.ronda_id and public.puede_escribir_operacion_ips(r.ips_id)));
create policy estudios_select on public.estudios_relevantes_ronda for select to authenticated
using (exists (select 1 from public.rondas_proa r where r.id = estudios_relevantes_ronda.ronda_id and public.puede_leer_ips(r.ips_id)));

drop policy if exists intervenciones_delete on public.intervenciones_proa;
drop policy if exists intervenciones_insert on public.intervenciones_proa;
drop policy if exists intervenciones_select on public.intervenciones_proa;
drop policy if exists intervenciones_update on public.intervenciones_proa;
create policy intervenciones_delete on public.intervenciones_proa for delete to authenticated
using (public.puede_escribir_operacion_ips(ips_id));
create policy intervenciones_insert on public.intervenciones_proa for insert to authenticated
with check (public.puede_escribir_operacion_ips(ips_id));
create policy intervenciones_select on public.intervenciones_proa for select to authenticated
using (public.puede_leer_ips(ips_id));
create policy intervenciones_update on public.intervenciones_proa for update to authenticated
using (public.puede_escribir_operacion_ips(ips_id))
with check (public.puede_escribir_operacion_ips(ips_id));

drop policy if exists int_trat_delete on public.intervencion_tratamiento;
drop policy if exists int_trat_insert on public.intervencion_tratamiento;
drop policy if exists int_trat_select on public.intervencion_tratamiento;
create policy int_trat_delete on public.intervencion_tratamiento for delete to authenticated
using (exists (select 1 from public.intervenciones_proa i where i.id = intervencion_tratamiento.intervencion_id and public.puede_escribir_operacion_ips(i.ips_id)));
create policy int_trat_insert on public.intervencion_tratamiento for insert to authenticated
with check (exists (select 1 from public.intervenciones_proa i where i.id = intervencion_tratamiento.intervencion_id and public.puede_escribir_operacion_ips(i.ips_id)));
create policy int_trat_select on public.intervencion_tratamiento for select to authenticated
using (exists (select 1 from public.intervenciones_proa i where i.id = intervencion_tratamiento.intervencion_id and public.puede_leer_ips(i.ips_id)));

drop policy if exists notas_delete on public.notas_proa;
drop policy if exists notas_insert on public.notas_proa;
drop policy if exists notas_select on public.notas_proa;
drop policy if exists notas_update on public.notas_proa;
create policy notas_delete on public.notas_proa for delete to authenticated
using (exists (select 1 from public.rondas_proa r where r.id = notas_proa.ronda_id and public.puede_escribir_operacion_ips(r.ips_id)));
create policy notas_insert on public.notas_proa for insert to authenticated
with check (exists (select 1 from public.rondas_proa r where r.id = notas_proa.ronda_id and public.puede_escribir_operacion_ips(r.ips_id)));
create policy notas_select on public.notas_proa for select to authenticated
using (exists (select 1 from public.rondas_proa r where r.id = notas_proa.ronda_id and public.puede_leer_ips(r.ips_id)));
create policy notas_update on public.notas_proa for update to authenticated
using (exists (select 1 from public.rondas_proa r where r.id = notas_proa.ronda_id and public.puede_escribir_operacion_ips(r.ips_id)))
with check (exists (select 1 from public.rondas_proa r where r.id = notas_proa.ronda_id and public.puede_escribir_operacion_ips(r.ips_id)));

drop policy if exists servicios_insert on public.servicios_ips;
drop policy if exists servicios_select on public.servicios_ips;
drop policy if exists servicios_update on public.servicios_ips;
create policy servicios_insert on public.servicios_ips for insert to authenticated
with check (public.puede_administrar_proa());
create policy servicios_select on public.servicios_ips for select to authenticated
using (public.puede_leer_ips(ips_id));
create policy servicios_update on public.servicios_ips for update to authenticated
using (public.puede_administrar_proa())
with check (public.puede_administrar_proa());

drop policy if exists ddd_reg_insert on public.ddd_registros;
drop policy if exists ddd_reg_select on public.ddd_registros;
drop policy if exists ddd_reg_update on public.ddd_registros;
create policy ddd_reg_insert on public.ddd_registros for insert to authenticated
with check (public.puede_escribir_operacion_ips(ips_id));
create policy ddd_reg_select on public.ddd_registros for select to authenticated
using (public.puede_leer_ips(ips_id));
create policy ddd_reg_update on public.ddd_registros for update to authenticated
using (public.puede_escribir_operacion_ips(ips_id))
with check (public.puede_escribir_operacion_ips(ips_id));

drop policy if exists ddd_consumos_insert on public.ddd_consumos;
drop policy if exists ddd_consumos_select on public.ddd_consumos;
drop policy if exists ddd_consumos_update on public.ddd_consumos;
create policy ddd_consumos_insert on public.ddd_consumos for insert to authenticated
with check (exists (select 1 from public.ddd_registros d where d.id = ddd_consumos.registro_id and public.puede_escribir_operacion_ips(d.ips_id)));
create policy ddd_consumos_select on public.ddd_consumos for select to authenticated
using (exists (select 1 from public.ddd_registros d where d.id = ddd_consumos.registro_id and public.puede_leer_ips(d.ips_id)));
create policy ddd_consumos_update on public.ddd_consumos for update to authenticated
using (exists (select 1 from public.ddd_registros d where d.id = ddd_consumos.registro_id and public.puede_escribir_operacion_ips(d.ips_id)))
with check (exists (select 1 from public.ddd_registros d where d.id = ddd_consumos.registro_id and public.puede_escribir_operacion_ips(d.ips_id)));

drop policy if exists cat_antimicrobianos_select on public.catalogo_antimicrobianos;
drop policy if exists cat_antimicrobianos_insert_admin on public.catalogo_antimicrobianos;
drop policy if exists cat_antimicrobianos_update_admin on public.catalogo_antimicrobianos;
create policy cat_antimicrobianos_select on public.catalogo_antimicrobianos for select to authenticated
using ((estado = 'Activo'::text) or public.puede_administrar_proa());
create policy cat_antimicrobianos_insert_admin on public.catalogo_antimicrobianos for insert to authenticated
with check (public.puede_administrar_proa());
create policy cat_antimicrobianos_update_admin on public.catalogo_antimicrobianos for update to authenticated
using (public.puede_administrar_proa())
with check (public.puede_administrar_proa());

drop policy if exists cat_micro_select on public.catalogo_microorganismos;
drop policy if exists cat_micro_insert_admin on public.catalogo_microorganismos;
drop policy if exists cat_micro_update_admin on public.catalogo_microorganismos;
create policy cat_micro_select on public.catalogo_microorganismos for select to authenticated
using ((estado = 'Activo'::text) or public.puede_administrar_proa());
create policy cat_micro_insert_admin on public.catalogo_microorganismos for insert to authenticated
with check (public.puede_administrar_proa());
create policy cat_micro_update_admin on public.catalogo_microorganismos for update to authenticated
using (public.puede_administrar_proa())
with check (public.puede_administrar_proa());

drop policy if exists cat_muestra_select on public.catalogo_tipos_muestra;
drop policy if exists cat_muestra_insert_admin on public.catalogo_tipos_muestra;
drop policy if exists cat_muestra_update_admin on public.catalogo_tipos_muestra;
create policy cat_muestra_select on public.catalogo_tipos_muestra for select to authenticated
using ((estado = 'Activo'::text) or public.puede_administrar_proa());
create policy cat_muestra_insert_admin on public.catalogo_tipos_muestra for insert to authenticated
with check (public.puede_administrar_proa());
create policy cat_muestra_update_admin on public.catalogo_tipos_muestra for update to authenticated
using (public.puede_administrar_proa())
with check (public.puede_administrar_proa());

drop policy if exists cat_interv_select on public.catalogo_intervenciones;
drop policy if exists cat_interv_insert_admin on public.catalogo_intervenciones;
drop policy if exists cat_interv_update_admin on public.catalogo_intervenciones;
create policy cat_interv_select on public.catalogo_intervenciones for select to authenticated
using ((estado = 'Activo'::text) or public.puede_administrar_proa());
create policy cat_interv_insert_admin on public.catalogo_intervenciones for insert to authenticated
with check (public.puede_administrar_proa());
create policy cat_interv_update_admin on public.catalogo_intervenciones for update to authenticated
using (public.puede_administrar_proa())
with check (public.puede_administrar_proa());

drop policy if exists cat_categoria_select on public.catalogo_categorias_proa;
drop policy if exists cat_categoria_insert_admin on public.catalogo_categorias_proa;
drop policy if exists cat_categoria_update_admin on public.catalogo_categorias_proa;
create policy cat_categoria_select on public.catalogo_categorias_proa for select to authenticated
using ((estado = 'Activo'::text) or public.puede_administrar_proa());
create policy cat_categoria_insert_admin on public.catalogo_categorias_proa for insert to authenticated
with check (public.puede_administrar_proa());
create policy cat_categoria_update_admin on public.catalogo_categorias_proa for update to authenticated
using (public.puede_administrar_proa())
with check (public.puede_administrar_proa());

drop policy if exists oms_ddd_select on public.oms_ddd;
drop policy if exists oms_ddd_insert_admin on public.oms_ddd;
drop policy if exists oms_ddd_update_admin on public.oms_ddd;
create policy oms_ddd_select on public.oms_ddd for select to authenticated
using (true);
create policy oms_ddd_insert_admin on public.oms_ddd for insert to authenticated
with check (public.puede_administrar_proa());
create policy oms_ddd_update_admin on public.oms_ddd for update to authenticated
using (public.puede_administrar_proa())
with check (public.puede_administrar_proa());

commit;

-- Auditoría posterior sugerida, ejecutar manualmente después de aplicar:
--
-- select rol, estado, count(*) from public.usuario_ips group by rol, estado order by rol, estado;
-- select usuario_id, nombre, estado, es_admin_global from public.perfiles_usuario order by es_admin_global desc, nombre;
-- select p.usuario_id, p.nombre, p.es_admin_global, ui.ips_id, i.nombre as ips, ui.rol, ui.estado
-- from public.perfiles_usuario p
-- left join public.usuario_ips ui on ui.usuario_id = p.usuario_id
-- left join public.ips i on i.id = ui.ips_id
-- order by p.nombre, i.nombre;
-- select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname = 'public' order by tablename, cmd, policyname;
-- select proname, pg_get_functiondef(oid) from pg_proc where pronamespace = 'public'::regnamespace and proname in (
--   'es_admin_global', 'tiene_acceso_ips', 'puede_leer_ips', 'puede_escribir_operacion_ips', 'puede_administrar_proa'
-- );
