-- A página da mulher mostra quem a gerência chamou ("Diego, de camisa preta,
-- foi chamado para ir até você") antes de a pessoa tocar em "Estou indo".
-- O tipo de retorno muda, então a função é recriada.

drop function get_alert_by_token(text);

create function get_alert_by_token(p_token text)
returns table (
  status text,
  kind text,
  spot_label text,
  venue_name text,
  short_code text,
  created_at timestamptz,
  seen_at timestamptz,
  on_the_way_at timestamptz,
  resolved_at timestamptz,
  cancelled_at timestamptz,
  responder_first_name text,
  responder_appearance text,
  assigned_first_name text,
  assigned_appearance text
)
language sql
stable
as $$
  select a.status, a.kind, sp.label, v.name, a.short_code,
         a.created_at, a.seen_at, a.on_the_way_at, a.resolved_at, a.cancelled_at,
         split_part(st.full_name, ' ', 1), st.appearance,
         split_part(asg.full_name, ' ', 1), asg.appearance
  from alerts a
  join spots sp on sp.id = a.spot_id
  join venues v on v.id = a.venue_id
  left join staff st on st.id = a.responder_id
  left join staff asg on asg.id = a.assigned_to
  where a.token_hash = hash_token(p_token)
    and a.created_at > now() - interval '12 hours'
$$;
