-- Correções da revisão da fila de toques sem sinal (F3, 18/11/2026).
--
-- 1. Toque que ficou guardado no aparelho (p_queued_ms > 0) não encerra o
--    alerta que outra pessoa assumiu, nem quando vem da gerência: quem tocou
--    viu o alerta antes de a outra pessoa assumir, e o encerramento chegaria
--    por cima de quem está indo. A gerência continua podendo encerrar com o
--    alerta atual na tela: pelo painel, ou pelo app com sinal (p_queued_ms = 0).
-- 2. "Vi o alerta" que não muda nada (o alerta já não está "aberto") não é
--    gravado e devolve false: a rota não repete o aviso em tempo real nem o
--    push a cada vez que alguém abre a tela do alerta.
create or replace function apply_staff_action(
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
    if v_alert.status <> 'open' then
      return false;
    end if;
    perform ack_alert(p_actor, p_alert_id);
  elsif p_kind = 'start' then
    perform start_response(p_actor, p_alert_id);
  elsif p_kind = 'resolve' then
    if coalesce(p_queued_ms, 0) > 0
       and v_alert.status = 'on_the_way'
       and v_alert.responder_id is distinct from p_actor then
      raise exception 'already_taken' using errcode = 'P0001';
    end if;
    perform resolve_alert(p_actor, p_alert_id, p_outcome, p_note);
  else
    raise exception 'invalid_kind' using errcode = '22023';
  end if;

  insert into staff_actions (id, user_id, alert_id, kind, queued_ms)
  values (p_action_id, p_actor, p_alert_id, p_kind, greatest(0, coalesce(p_queued_ms, 0)));
  return true;
end;
$$;
