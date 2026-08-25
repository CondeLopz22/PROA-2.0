-- PROA V2 Milestone 1.1
-- Ejecutar en Supabase Dashboard > SQL Editor con valores reales.
-- No deshabilita RLS. Solo prepara un usuario Auth existente para pruebas.

-- 1) Confirmar auth user. Reemplaza el correo.
select id, email
from auth.users
where email = '<correo_usuario_prueba>';

-- 2) Ver IPS disponibles para elegir una IPS A y, si aplica, una IPS B para pruebas RLS negativas.
select id, nombre, nit, codigo_reps, estado
from public.ips
where estado = 'Activa'
order by nombre;

-- 3) Crear/verificar perfil. Reemplaza <auth_user_id>.
insert into public.perfiles_usuario (usuario_id, nombre, estado, es_admin_global)
values ('<auth_user_id>', 'Usuario PROA Prueba', 'Activo', false)
on conflict (usuario_id) do update
set nombre = excluded.nombre,
    estado = 'Activo',
    es_admin_global = false;

-- 4) Asignar IPS A al usuario. Reemplaza <ips_a_id>.
insert into public.usuario_ips (usuario_id, ips_id, rol, estado)
values ('<auth_user_id>', '<ips_a_id>', 'PROA', 'Activo')
on conflict do nothing;

-- 5) Verificar membresías.
select ui.usuario_id, ui.ips_id, ui.rol, ui.estado, i.nombre
from public.usuario_ips ui
join public.ips i on i.id = ui.ips_id
where ui.usuario_id = '<auth_user_id>';

-- 6) Elegir un paciente visible de IPS A para la prueba e2e.
select id, tipo_identificacion, numero_identificacion, nombres, apellidos
from public.pacientes
where ips_id = '<ips_a_id>'
limit 10;

-- 7) Elegir un paciente/IPS B para prueba negativa de RLS, si existe otra IPS con datos.
select id, ips_id, tipo_identificacion, numero_identificacion
from public.pacientes
where ips_id <> '<ips_a_id>'
limit 10;
