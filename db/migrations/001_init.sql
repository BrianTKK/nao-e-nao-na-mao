-- Não é Não na Mão: esquema inicial (Postgres 17).
--
-- Quem controla o acesso é a API (server/): ela autentica a equipe, sabe o
-- bar de cada pessoa e só consulta o que pertence a ele. O banco guarda as
-- regras que precisam ser atômicas, nas funções abaixo:
-- * criar o pedido com limite por local e por bar, e devolver um token
--   aleatório que só a página da mulher conhece (o banco guarda só o hash);
-- * as mudanças de estado (visto, a caminho, resolvido, cancelado), que
--   conferem o bar de quem age e a ordem dos estados, e gravam o horário de
--   cada passo (é daí que sai o tempo de resposta do painel).
-- Ninguém altera um pedido fora dessas funções.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  neighborhood text,
  city text not null default 'São Paulo',
  -- Código combinado do bar para pedir ajuda no balcão (usado quando a
  -- página fica sem conexão).
  help_phrase text not null,
  -- Cardápio do antigo disfarce "Ver cardápio", retirado em 16/11/2026.
  -- A coluna fica, sem uso: apagar só se o Brian confirmar que o disfarce não volta.
  menu jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Contas de login (equipe e gerência). Senha só em hash (bcrypt).
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table staff (
  id uuid primary key references users (id) on delete cascade,
  venue_id uuid not null references venues (id) on delete cascade,
  full_name text not null,
  role text not null default 'staff' check (role in ('staff', 'manager')),
  job_title text,
  -- Como a pessoa está vestida hoje ("camisa preta"): aparece para a mulher
  -- quando alguém da equipe está a caminho.
  appearance text check (char_length(appearance) <= 60),
  -- Data do curso do protocolo Não se Cale.
  trained_at date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table spots (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues (id) on delete cascade,
  -- Código impresso no QR code (URL /q/<code>). Gerado ao acaso pela API.
  code text not null unique check (code ~ '^[A-Z0-9]{6,12}$'),
  label text not null check (char_length(label) between 2 and 40),
  kind text not null default 'other'
    check (kind in ('restroom', 'table', 'bar', 'outdoor', 'other')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues (id) on delete cascade,
  spot_id uuid not null references spots (id) on delete cascade,
  kind text not null check (kind in ('unsafe', 'leave', 'talk')),
  status text not null default 'open'
    check (status in ('open', 'seen', 'on_the_way', 'resolved', 'cancelled')),
  -- Código curto que a mulher e a equipe veem para se reconhecerem.
  short_code text not null,
  -- Só o hash do token fica no banco.
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  on_the_way_at timestamptz,
  resolved_at timestamptz,
  cancelled_at timestamptz,
  responder_id uuid references staff (id) on delete set null,
  outcome text check (outcome in (
    'escorted',          -- acompanhou até um lugar seguro ou até o carro
    'aggressor_removed', -- a pessoa que incomodava foi retirada
    'ride_called',       -- chamou um carro ou um contato dela
    'police_called',     -- acionou o 190
    'talk_resolved',     -- a conversa resolveu
    'not_found',         -- não encontrou a pessoa
    'false_alarm'        -- pedido indevido
  )),
  note text check (char_length(note) <= 500),
  constraint resolved_has_outcome check (status <> 'resolved' or outcome is not null)
);

create index alerts_venue_created_idx on alerts (venue_id, created_at desc);
create index alerts_spot_created_idx on alerts (spot_id, created_at desc);
create index staff_venue_idx on staff (venue_id);
create index spots_venue_idx on spots (venue_id);

-- ---------------------------------------------------------------------------
-- Funções de apoio
-- ---------------------------------------------------------------------------

create function hash_token(p_token text)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
$$;

-- Quatro caracteres sem os que se confundem (0/O, 1/I/L, 2/Z, 5/S, 8/B).
create function random_short_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ACDEFHJKMNPRTWXY34679';
  bytes bytea := uuid_send(gen_random_uuid());
  result text := '';
begin
  for i in 0..3 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Página do QR code (sem login)
-- ---------------------------------------------------------------------------

-- Cria o pedido e devolve o token. Limites: 3 por local e 10 por bar a cada
-- minuto (o limite por IP fica na API).
create function create_alert(p_spot_code text, p_kind text)
returns table (alert_id uuid, venue_id uuid, token text, short_code text)
language plpgsql
volatile
as $$
declare
  v_spot spots%rowtype;
  v_token text;
  v_code text;
  v_id uuid;
  v_spot_recent int;
  v_venue_recent int;
begin
  if p_kind is null or p_kind not in ('unsafe', 'leave', 'talk') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;

  select * into v_spot from spots s where s.code = upper(p_spot_code) and s.active;
  if not found then
    raise exception 'spot_not_found' using errcode = 'P0002';
  end if;

  -- Um pedido por vez em cada bar, para a contagem do limite ser exata.
  perform pg_advisory_xact_lock(hashtext(v_spot.venue_id::text));

  select count(*) into v_spot_recent from alerts a
  where a.spot_id = v_spot.id and a.created_at > clock_timestamp() - interval '1 minute';
  select count(*) into v_venue_recent from alerts a
  where a.venue_id = v_spot.venue_id and a.created_at > clock_timestamp() - interval '1 minute';
  if v_spot_recent >= 3 or v_venue_recent >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  -- Dois UUID v4 = 244 bits aleatórios.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_code := random_short_code();

  insert into alerts (venue_id, spot_id, kind, short_code, token_hash, created_at)
  values (v_spot.venue_id, v_spot.id, p_kind, v_code, hash_token(v_token), clock_timestamp())
  returning id into v_id;

  return query select v_id, v_spot.venue_id, v_token, v_code;
end;
$$;

-- O que a mulher vê do próprio pedido. O token vale por 12 horas.
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
  responder_appearance text
)
language sql
stable
as $$
  select a.status, a.kind, sp.label, v.name, a.short_code,
         a.created_at, a.seen_at, a.on_the_way_at, a.resolved_at, a.cancelled_at,
         split_part(st.full_name, ' ', 1), st.appearance
  from alerts a
  join spots sp on sp.id = a.spot_id
  join venues v on v.id = a.venue_id
  left join staff st on st.id = a.responder_id
  where a.token_hash = hash_token(p_token)
    and a.created_at > now() - interval '12 hours'
$$;

-- Devolve o id e o bar, para a API avisar a equipe em tempo real.
create function cancel_alert_by_token(p_token text)
returns table (alert_id uuid, venue_id uuid)
language plpgsql
volatile
as $$
declare
  v_id uuid;
  v_venue uuid;
begin
  update alerts a
  set status = 'cancelled', cancelled_at = clock_timestamp()
  where a.token_hash = hash_token(p_token)
    and a.status in ('open', 'seen', 'on_the_way')
    and a.created_at > now() - interval '12 hours'
  returning a.id, a.venue_id into v_id, v_venue;
  if v_id is null then
    raise exception 'alert_not_found' using errcode = 'P0002';
  end if;
  return query select v_id, v_venue;
end;
$$;

-- ---------------------------------------------------------------------------
-- Equipe (a API passa o id de quem está logado em p_actor)
-- ---------------------------------------------------------------------------

-- Busca o pedido do bar de quem age, travado para a mudança de estado.
create function lock_alert_for(p_actor uuid, p_alert_id uuid)
returns alerts
language plpgsql
volatile
as $$
declare
  v_alert alerts%rowtype;
  v_venue uuid;
begin
  select s.venue_id into v_venue from staff s where s.id = p_actor and s.active;
  if v_venue is null then
    raise exception 'not_staff' using errcode = '42501';
  end if;
  select * into v_alert from alerts a
  where a.id = p_alert_id and a.venue_id = v_venue
  for update;
  if not found then
    raise exception 'alert_not_found' using errcode = 'P0002';
  end if;
  return v_alert;
end;
$$;

-- "Vi o pedido" (o painel mostra quanto tempo levou para alguém ver).
create function ack_alert(p_actor uuid, p_alert_id uuid)
returns void
language plpgsql
volatile
as $$
declare
  v_alert alerts%rowtype := lock_alert_for(p_actor, p_alert_id);
begin
  if v_alert.status = 'open' then
    update alerts set status = 'seen', seen_at = clock_timestamp() where id = v_alert.id;
  end if;
end;
$$;

-- "Estou indo": quem tocou primeiro assume o pedido.
create function start_response(p_actor uuid, p_alert_id uuid)
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
  if v_alert.status = 'on_the_way' then
    if v_alert.responder_id = p_actor then
      return;
    end if;
    raise exception 'already_taken' using errcode = 'P0001';
  end if;
  update alerts
  set status = 'on_the_way',
      seen_at = coalesce(seen_at, clock_timestamp()),
      on_the_way_at = clock_timestamp(),
      responder_id = p_actor
  where id = v_alert.id;
end;
$$;

create function resolve_alert(p_actor uuid, p_alert_id uuid, p_outcome text, p_note text default null)
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

-- A pessoa da equipe diz como está vestida hoje.
create function set_appearance(p_actor uuid, p_appearance text)
returns void
language plpgsql
volatile
as $$
begin
  update staff set appearance = nullif(trim(p_appearance), '')
  where id = p_actor and active;
  if not found then
    raise exception 'not_staff' using errcode = '42501';
  end if;
end;
$$;
