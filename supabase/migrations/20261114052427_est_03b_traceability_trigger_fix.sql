begin;

-- Corrective replacement only: the same trigger function is shared by
-- tratamientos_valoracion, decisiones_intervencion and
-- implementaciones_intervencion.  Access table-specific fields only inside
-- the matching branch so PostgreSQL never resolves a column that is absent
-- from the current trigger row type.
create or replace function public.validar_integridad_trazabilidad_est03b()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_round public.rondas_proa%rowtype;
  v_previous_round public.rondas_proa%rowtype;
  v_treatment public.tratamientos_antimicrobianos%rowtype;
  v_intervention public.intervenciones_proa%rowtype;
  v_origin_round public.rondas_proa%rowtype;
  v_resulting_treatment_id uuid;
begin
  if tg_op = 'UPDATE' then
    if new.ips_id is distinct from old.ips_id
       or new.caso_id is distinct from old.caso_id
       or new.ronda_id is distinct from old.ronda_id then
      raise exception 'EST03B_CONTEXT: No se puede trasladar trazabilidad entre IPS, casos o rondas';
    end if;

    if tg_table_name = 'tratamientos_valoracion' then
      if new.paciente_id is distinct from old.paciente_id
         or new.tratamiento_id is distinct from old.tratamiento_id then
        raise exception 'EST03B_CONTEXT: No se puede cambiar el paciente o tratamiento de una valoración';
      end if;
    else
      if new.intervencion_id is distinct from old.intervencion_id
         or new.profesional_id is distinct from old.profesional_id then
        raise exception 'EST03B_CONTEXT: No se puede cambiar la intervención o autor de un registro histórico';
      end if;
    end if;

    select * into v_previous_round
    from public.rondas_proa
    where id = old.ronda_id;
    if not found or v_previous_round.estado <> 'Borrador' then
      raise exception 'EST03B_CONFIRMED: Los registros de una ronda confirmada son inmutables';
    end if;
  end if;

  select * into v_round
  from public.rondas_proa
  where id = new.ronda_id;
  if not found or v_round.estado <> 'Borrador'
     or v_round.ips_id <> new.ips_id
     or v_round.caso_id <> new.caso_id then
    raise exception 'EST03B_CONTEXT: La ronda no pertenece a la IPS y caso indicados o no admite cambios';
  end if;

  if tg_table_name = 'tratamientos_valoracion' then
    if v_round.paciente_id <> new.paciente_id then
      raise exception 'EST03B_CONTEXT: El paciente de la valoración no coincide con la ronda';
    end if;
    select * into v_treatment
    from public.tratamientos_antimicrobianos
    where id = new.tratamiento_id;
    if not found
       or v_treatment.ips_id <> new.ips_id
       or v_treatment.paciente_id <> new.paciente_id
       or v_treatment.caso_id <> new.caso_id then
      raise exception 'EST03B_CONTEXT: El tratamiento valorado no pertenece al mismo paciente, caso e IPS';
    end if;
  else
    if auth.uid() is not null and new.profesional_id <> auth.uid() then
      raise exception 'EST03B_ACCESS: El profesional debe corresponder a la sesión autenticada';
    end if;
    select * into v_intervention
    from public.intervenciones_proa
    where id = new.intervencion_id;
    if not found then
      raise exception 'EST03B_CONTEXT: La intervención no existe';
    end if;
    select * into v_origin_round
    from public.rondas_proa
    where id = v_intervention.ronda_id;
    if not found
       or v_intervention.ips_id <> new.ips_id
       or v_origin_round.ips_id <> new.ips_id
       or v_origin_round.caso_id <> new.caso_id then
      raise exception 'EST03B_CONTEXT: La intervención no pertenece al mismo caso e IPS';
    end if;

    if tg_table_name = 'implementaciones_intervencion' then
      v_resulting_treatment_id := nullif(to_jsonb(new) ->> 'tratamiento_resultante_id', '')::uuid;
      if v_resulting_treatment_id is not null then
        select * into v_treatment
        from public.tratamientos_antimicrobianos
        where id = v_resulting_treatment_id;
        if not found
           or v_treatment.ips_id <> new.ips_id
           or v_treatment.caso_id <> new.caso_id then
          raise exception 'EST03B_CONTEXT: El tratamiento implementado no pertenece al mismo caso e IPS';
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$function$;

comment on function public.validar_integridad_trazabilidad_est03b() is
  'Valida integridad Multi-IPS y contexto clínico de EST-03B sin resolver campos ajenos al tipo de fila del trigger.';

commit;
