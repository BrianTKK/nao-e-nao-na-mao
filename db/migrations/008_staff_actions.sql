-- Fila de toques sem sinal (F3, 18/11/2026). O app guarda "Vi o alerta",
-- "Estou indo" e "Encerrar" no aparelho quando a conexão cai e reenvia quando
-- ela volta. Cada toque tem um id gerado no aparelho; o servidor guarda aqui os
-- ids que já aplicou, para o reenvio do mesmo toque não repetir a transição
-- (nem o aviso em tempo real, nem o push).
create table staff_actions (
  id uuid primary key,
  user_id uuid not null references staff (id) on delete cascade,
  alert_id uuid not null references alerts (id) on delete cascade,
  kind text not null check (kind in ('ack', 'start', 'resolve')),
  -- Quanto tempo o toque esperou no aparelho até chegar (informado pelo app).
  -- Fica só como registro: os horários do alerta continuam sendo os do
  -- servidor, que o aparelho não consegue alterar.
  queued_ms integer not null default 0 check (queued_ms >= 0),
  created_at timestamptz not null default clock_timestamp()
);

create index staff_actions_alert on staff_actions (alert_id);

-- Encerrar: quem é da equipe comum não encerra o alerta que outra pessoa
-- assumiu ("a caminho" com outro responsável). O app já não mostrava o botão
-- nesse caso; a regra passa a valer no servidor, porque um toque guardado sem
-- sinal chega depois e não pode passar por cima de quem assumiu. A gerência
-- continua podendo encerrar pelo painel.
create or replace function resolve_alert(p_actor uuid, p_alert_id uuid, p_outcome text, p_note text default null)
returns void
language plpgsql
volatile
as $$
declare
  v_alert alerts%rowtype := lock_alert_for(p_actor, p_alert_id);
begin
  if v_alert.status not in ('open', 'seen', 'on_the_way') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if p_outcome is null then
    raise exception 'outcome_required' using errcode = '22023';
  end if;
  if v_alert.status = 'on_the_way'
     and v_alert.responder_id is distinct from p_actor
     and not exists (select 1 from staff s where s.id = p_actor and s.role = 'manager') then
    raise exception 'already_taken' using errcode = 'P0001';
  end if;
  update alerts
  set status = 'resolved',
      outcome = p_outcome,
      note = nullif(trim(p_note), ''),
      seen_at = coalesce(seen_at, clock_timestamp()),
      resolved_at = clock_timestamp(),
      responder_id = coalesce(responder_id, p_actor)
  where id = v_alert.id;
end;
$$;

-- Aplica um toque da equipe uma vez só. Devolve true se aplicou agora e false
-- se o id já tinha sido aplicado (reenvio): nesse caso nada muda.
-- O alerta fica travado do começo ao fim, então dois envios do mesmo toque ao
-- mesmo tempo entram em fila: o segundo já encontra o id gravado.
-- Se a transição falhar (ex.: outra pessoa já encerrou), nada é gravado.
create function apply_staff_action(
  p_actor uuid,
  p_alert_id uuid,
  p_kind text,
  p_action_id uuid,
  p_queued_ms integer default 0,
  p_outcome text default null,
  p_note text default null
)
returns boolean
language plpgsql
volatile
as $$
declare
  v_alert alerts%rowtype := lock_alert_for(p_actor, p_alert_id);
  v_prev staff_actions%rowtype;
begin
  select * into v_prev from staff_actions where id = p_action_id;
  if found then
    -- O mesmo id só vale para o mesmo toque, da mesma pessoa, no mesmo alerta.
    if v_prev.user_id <> p_actor or v_prev.alert_id <> p_alert_id or v_prev.kind <> p_kind then
      raise exception 'action_id_reused' using errcode = 'P0001';
    end if;
    return false;
  end if;

  if p_kind = 'ack' then
    perform ack_alert(p_actor, p_alert_id);
  elsif p_kind = 'start' then
    perform start_response(p_actor, p_alert_id);
  elsif p_kind = 'resolve' then
    perform resolve_alert(p_actor, p_alert_id, p_outcome, p_note);
  else
    raise exception 'invalid_kind' using errcode = '22023';
  end if;

  insert into staff_actions (id, user_id, alert_id, kind, queued_ms)
  values (p_action_id, p_actor, p_alert_id, p_kind, greatest(0, coalesce(p_queued_ms, 0)));
  return true;
end;
$$;
