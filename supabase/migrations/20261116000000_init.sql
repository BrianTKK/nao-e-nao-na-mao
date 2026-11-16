-- Não é Não na Mão: esquema inicial.
--
-- Regras de acesso (resumo):
-- * Quem não tem login (a mulher que leu o QR code) NÃO lê nenhuma tabela.
--   Ela só usa quatro funções: ver o local do QR, criar um pedido, acompanhar
--   o próprio pedido pelo token que recebeu e cancelar esse pedido.
-- * A equipe (login) só enxerga o bar em que trabalha.
-- * Ninguém altera um pedido direto na tabela: as mudanças de estado passam
--   pelas funções abaixo, que conferem o bar, a ordem dos estados e gravam
--   o horário de cada passo (é daí que sai o tempo de resposta do painel).

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  neighborhood text,
  city text not null default 'São Paulo',
  -- Código combinado do bar para pedir ajuda no balcão (usado quando a
  -- página fica sem conexão).
  help_phrase text not null,
  -- Cardápio mostrado quando a mulher toca em "esconder" (disfarce).
  menu jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.staff (
  id uuid primary key references auth.users (id) on delete cascade,
  venue_id uuid not null references public.venues (id) on delete cascade,
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

create table public.spots (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  -- Código impresso no QR code (URL /q/<code>).
  code text not null unique check (code ~ '^[A-Z0-9]{6,12}$'),
  label text not null check (char_length(label) between 2 and 40),
  kind text not null default 'other'
    check (kind in ('restroom', 'table', 'bar', 'outdoor', 'other')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  spot_id uuid not null references public.spots (id) on delete cascade,
  kind text not null check (kind in ('unsafe', 'leave', 'talk')),
  status text not null default 'open'
    check (status in ('open', 'seen', 'on_the_way', 'resolved', 'cancelled')),
  -- Código curto que a mulher e a equipe veem para se reconhecerem.
  short_code text not null,
  -- Só o hash do token fica no banco: quem ler a tabela não consegue
  -- acompanhar o pedido de ninguém.
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  on_the_way_at timestamptz,
  resolved_at timestamptz,
  cancelled_at timestamptz,
  responder_id uuid references public.staff (id) on delete set null,
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

create index alerts_venue_created_idx on public.alerts (venue_id, created_at desc);
create index alerts_spot_created_idx on public.alerts (spot_id, created_at desc);
create index staff_venue_idx on public.staff (venue_id);
create index spots_venue_idx on public.spots (venue_id);

-- ---------------------------------------------------------------------------
-- Funções de apoio às regras
-- ---------------------------------------------------------------------------

-- Bar da pessoa logada (nulo para quem não é da equipe ou está inativo).
create function public.my_venue_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.venue_id from public.staff s where s.id = auth.uid() and s.active
$$;

create function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff s
    where s.id = auth.uid() and s.active and s.role = 'manager'
  )
$$;

create function public.hash_token(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
$$;

-- Quatro caracteres sem os que se confundem (0/O, 1/I/L, 2/Z, 5/S, 8/B).
create function public.random_short_code()
returns text
language plpgsql
volatile
set search_path = ''
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
-- RLS
-- ---------------------------------------------------------------------------

alter table public.venues enable row level security;
alter table public.staff enable row level security;
alter table public.spots enable row level security;
alter table public.alerts enable row level security;

create policy "equipe lê o próprio bar" on public.venues
  for select to authenticated
  using (id = public.my_venue_id());

create policy "gerência edita o próprio bar" on public.venues
  for update to authenticated
  using (id = public.my_venue_id() and public.is_manager())
  with check (id = public.my_venue_id());

create policy "equipe lê a equipe do bar" on public.staff
  for select to authenticated
  using (venue_id = public.my_venue_id());

create policy "gerência edita a equipe do bar" on public.staff
  for update to authenticated
  using (venue_id = public.my_venue_id() and public.is_manager())
  with check (venue_id = public.my_venue_id());

create policy "equipe lê os locais do bar" on public.spots
  for select to authenticated
  using (venue_id = public.my_venue_id());

create policy "gerência cria locais" on public.spots
  for insert to authenticated
  with check (venue_id = public.my_venue_id() and public.is_manager());

create policy "gerência edita locais" on public.spots
  for update to authenticated
  using (venue_id = public.my_venue_id() and public.is_manager())
  with check (venue_id = public.my_venue_id());

-- Pedidos: a equipe só lê os do próprio bar. Não há política de insert,
-- update ou delete: as mudanças passam pelas funções.
create policy "equipe lê os pedidos do bar" on public.alerts
  for select to authenticated
  using (venue_id = public.my_venue_id());

-- Defesa extra: quem não tem login não tem nem permissão de tabela.
revoke all on public.venues, public.staff, public.spots, public.alerts from anon;
-- A equipe não insere nem apaga pedidos direto.
revoke insert, delete on public.alerts from authenticated;

-- ---------------------------------------------------------------------------
-- Funções da página do QR code (sem login)
-- ---------------------------------------------------------------------------

create function public.get_spot_public(p_code text)
returns table (code text, label text, venue_name text, help_phrase text, menu jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select s.code, s.label, v.name, v.help_phrase, v.menu
  from public.spots s
  join public.venues v on v.id = s.venue_id
  where s.code = upper(p_code) and s.active
$$;

-- Cria o pedido e devolve o token (só a página da mulher o conhece).
-- Limites: 3 pedidos por local e 10 por bar a cada minuto.
create function public.create_alert(p_spot_code text, p_kind text)
returns table (token text, short_code text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_spot public.spots%rowtype;
  v_token text;
  v_code text;
  v_spot_recent int;
  v_venue_recent int;
begin
  if p_kind is null or p_kind not in ('unsafe', 'leave', 'talk') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;

  select * into v_spot from public.spots s where s.code = upper(p_spot_code) and s.active;
  if not found then
    raise exception 'spot_not_found' using errcode = 'P0002';
  end if;

  -- Um pedido por vez em cada bar, para a contagem do limite ser exata.
  perform pg_advisory_xact_lock(hashtext(v_spot.venue_id::text));

  select count(*) into v_spot_recent from public.alerts a
  where a.spot_id = v_spot.id and a.created_at > clock_timestamp() - interval '1 minute';
  select count(*) into v_venue_recent from public.alerts a
  where a.venue_id = v_spot.venue_id and a.created_at > clock_timestamp() - interval '1 minute';
  if v_spot_recent >= 3 or v_venue_recent >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  -- Dois UUID v4 = 244 bits aleatórios.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_code := public.random_short_code();

  insert into public.alerts (venue_id, spot_id, kind, short_code, token_hash, created_at)
  values (v_spot.venue_id, v_spot.id, p_kind, v_code, public.hash_token(v_token), clock_timestamp());

  return query select v_token, v_code;
end;
$$;

-- O que a mulher vê do próprio pedido. O token vale por 12 horas.
create function public.get_alert_by_token(p_token text)
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
security definer
set search_path = ''
as $$
  select a.status, a.kind, sp.label, v.name, a.short_code,
         a.created_at, a.seen_at, a.on_the_way_at, a.resolved_at, a.cancelled_at,
         split_part(st.full_name, ' ', 1), st.appearance
  from public.alerts a
  join public.spots sp on sp.id = a.spot_id
  join public.venues v on v.id = a.venue_id
  left join public.staff st on st.id = a.responder_id
  where a.token_hash = public.hash_token(p_token)
    and a.created_at > now() - interval '12 hours'
$$;

create function public.cancel_alert_by_token(p_token text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.alerts a
  set status = 'cancelled', cancelled_at = clock_timestamp()
  where a.token_hash = public.hash_token(p_token)
    and a.status in ('open', 'seen', 'on_the_way')
    and a.created_at > now() - interval '12 hours';
  if not found then
    raise exception 'alert_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Funções da equipe (com login)
-- ---------------------------------------------------------------------------

-- Busca o pedido do bar da pessoa logada, travado para a mudança de estado.
create function public.lock_my_alert(p_alert_id uuid)
returns public.alerts
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alert public.alerts%rowtype;
  v_venue uuid := public.my_venue_id();
begin
  if v_venue is null then
    raise exception 'not_staff' using errcode = '42501';
  end if;
  select * into v_alert from public.alerts a
  where a.id = p_alert_id and a.venue_id = v_venue
  for update;
  if not found then
    raise exception 'alert_not_found' using errcode = 'P0002';
  end if;
  return v_alert;
end;
$$;

-- "Vi o pedido" (o painel mostra quanto tempo levou para alguém ver).
create function public.ack_alert(p_alert_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alert public.alerts%rowtype := public.lock_my_alert(p_alert_id);
begin
  if v_alert.status = 'open' then
    update public.alerts set status = 'seen', seen_at = clock_timestamp()
    where id = v_alert.id;
  end if;
end;
$$;

-- "Estou indo": quem tocou primeiro assume o pedido.
create function public.start_response(p_alert_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alert public.alerts%rowtype := public.lock_my_alert(p_alert_id);
begin
  if v_alert.status not in ('open', 'seen', 'on_the_way') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if v_alert.status = 'on_the_way' then
    if v_alert.responder_id = auth.uid() then
      return;
    end if;
    raise exception 'already_taken' using errcode = 'P0001';
  end if;
  update public.alerts
  set status = 'on_the_way',
      seen_at = coalesce(seen_at, clock_timestamp()),
      on_the_way_at = clock_timestamp(),
      responder_id = auth.uid()
  where id = v_alert.id;
end;
$$;

create function public.resolve_alert(p_alert_id uuid, p_outcome text, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alert public.alerts%rowtype := public.lock_my_alert(p_alert_id);
begin
  if v_alert.status not in ('open', 'seen', 'on_the_way') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if p_outcome is null then
    raise exception 'outcome_required' using errcode = '22023';
  end if;
  update public.alerts
  set status = 'resolved',
      outcome = p_outcome,
      note = nullif(trim(p_note), ''),
      seen_at = coalesce(seen_at, clock_timestamp()),
      resolved_at = clock_timestamp(),
      responder_id = coalesce(responder_id, auth.uid())
  where id = v_alert.id;
end;
$$;

-- A pessoa da equipe diz como está vestida hoje.
create function public.set_my_appearance(p_appearance text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.staff set appearance = nullif(trim(p_appearance), '')
  where id = auth.uid() and active;
  if not found then
    raise exception 'not_staff' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões das funções
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.get_spot_public(text),
  public.create_alert(text, text),
  public.get_alert_by_token(text),
  public.cancel_alert_by_token(text)
to anon, authenticated;

grant execute on function
  public.my_venue_id(),
  public.is_manager(),
  public.ack_alert(uuid),
  public.start_response(uuid),
  public.resolve_alert(uuid, text, text),
  public.set_my_appearance(text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Tempo real: o app da equipe escuta as mudanças dos pedidos (respeitando a
-- RLS acima). Só existe no Supabase; no teste local o bloco é ignorado.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.alerts;
  end if;
end;
$$;
