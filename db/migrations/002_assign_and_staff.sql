-- F2: a gerência direciona um pedido para alguém da equipe.
--
-- Direcionar não é "estar a caminho": a pessoa escolhida recebe o pedido em
-- destaque no app, e a página da mulher só muda quando alguém toca em
-- "Estou indo". Assim a mulher nunca lê "está indo" de quem ainda não saiu.

alter table alerts
  add column assigned_to uuid references staff (id) on delete set null,
  add column assigned_by uuid references staff (id) on delete set null,
  add column assigned_at timestamptz;

create function assign_alert(p_actor uuid, p_alert_id uuid, p_staff uuid)
returns void
language plpgsql
volatile
as $$
declare
  v_alert alerts%rowtype := lock_alert_for(p_actor, p_alert_id);
begin
  if not exists (select 1 from staff s where s.id = p_actor and s.active and s.role = 'manager') then
    raise exception 'not_manager' using errcode = '42501';
  end if;
  if not exists (select 1 from staff s where s.id = p_staff and s.active and s.venue_id = v_alert.venue_id) then
    raise exception 'staff_not_found' using errcode = 'P0002';
  end if;
  if v_alert.status not in ('open', 'seen') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  update alerts
  set assigned_to = p_staff,
      assigned_by = p_actor,
      assigned_at = clock_timestamp(),
      -- Quem coordena já viu o pedido.
      status = 'seen',
      seen_at = coalesce(seen_at, clock_timestamp())
  where id = v_alert.id;
end;
$$;
