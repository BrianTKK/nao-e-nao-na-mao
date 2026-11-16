-- Dados de teste: um bar fictício, os locais com QR code, a equipe e um
-- histórico simulado de 30 dias. Nada aqui é real.
--
-- Ordem: 1) migrações; 2) contas da equipe criadas no Auth
-- (scripts/create-test-users.mjs, a partir de supabase/test-users.json);
-- 3) este arquivo. A equipe é ligada às contas pelo e-mail: se a conta não
-- existir, a linha é pulada.

insert into public.venues (id, name, neighborhood, city, help_phrase, menu)
values (
  '0b7a2f1e-5c3d-4e8a-9f10-3a2b1c0d9e01',
  'Bar Esquina da Vila',
  'Vila Madalena',
  'São Paulo',
  'Pedir um "drink Margarida" no balcão',
  '[
    {"section": "Chopes e cervejas", "items": [
      {"name": "Chope claro 300 ml", "price": 12.9},
      {"name": "Chope escuro 300 ml", "price": 14.9},
      {"name": "Long neck", "price": 13.0}
    ]},
    {"section": "Drinks", "items": [
      {"name": "Caipirinha de limão", "price": 24.0},
      {"name": "Gin tônica", "price": 32.0},
      {"name": "Drink sem álcool da casa", "price": 18.0}
    ]},
    {"section": "Petiscos", "items": [
      {"name": "Batata frita", "price": 29.0},
      {"name": "Pastel de queijo (6 un.)", "price": 26.0},
      {"name": "Bolinho de mandioca", "price": 31.0}
    ]}
  ]'::jsonb
)
on conflict (id) do nothing;

insert into public.spots (venue_id, code, label, kind) values
  ('0b7a2f1e-5c3d-4e8a-9f10-3a2b1c0d9e01', 'ESQBF7K2', 'Banheiro feminino', 'restroom'),
  ('0b7a2f1e-5c3d-4e8a-9f10-3a2b1c0d9e01', 'ESQBM4P9', 'Banheiro masculino', 'restroom'),
  ('0b7a2f1e-5c3d-4e8a-9f10-3a2b1c0d9e01', 'ESQM12T3', 'Mesa 12', 'table'),
  ('0b7a2f1e-5c3d-4e8a-9f10-3a2b1c0d9e01', 'ESQM07H6', 'Mesa 7', 'table'),
  ('0b7a2f1e-5c3d-4e8a-9f10-3a2b1c0d9e01', 'ESQBAL3W', 'Balcão', 'bar'),
  ('0b7a2f1e-5c3d-4e8a-9f10-3a2b1c0d9e01', 'ESQEXT9R', 'Área externa', 'outdoor')
on conflict (code) do nothing;

insert into public.staff (id, venue_id, full_name, role, job_title, appearance, trained_at)
select u.id, '0b7a2f1e-5c3d-4e8a-9f10-3a2b1c0d9e01', t.full_name, t.role, t.job_title, t.appearance, t.trained_at
from (values
  ('diego@bar-esquina.test', 'Diego Santos', 'staff', 'Segurança', 'camisa preta', date '2026-08-12'),
  ('ana@bar-esquina.test', 'Ana Lima', 'staff', 'Garçonete', 'avental verde', date '2026-08-12'),
  ('rafael@bar-esquina.test', 'Rafael Souza', 'staff', 'Bartender', 'boné vermelho', date '2026-09-03'),
  ('marta@bar-esquina.test', 'Marta Ribeiro', 'manager', 'Gerente', 'blazer azul', date '2026-07-28')
) as t (email, full_name, role, job_title, appearance, trained_at)
join auth.users u on u.email = t.email
on conflict (id) do nothing;

-- Histórico simulado: 42 pedidos nos últimos 30 dias, das 20h às 2h.
-- setseed deixa o histórico igual a cada vez que o seed roda.
select setseed(0.42);

with params as (
  select
    g as n,
    (now() - make_interval(days => (g * 30 / 42)))::date as day,
    random() as r_hour, random() as r_spot, random() as r_kind,
    random() as r_seen, random() as r_go, random() as r_done,
    random() as r_out, random() as r_staff
  from generate_series(1, 42) as g
),
timed as (
  select p.*,
    (p.day + time '20:00' + make_interval(mins => floor(p.r_hour * 360)::int)) as created,
    (4 + floor(p.r_seen * 22))::int as secs_seen,
    (5 + floor(p.r_go * 36))::int as secs_go,
    (120 + floor(p.r_done * 720))::int as secs_done
  from params p
),
spots as (
  select id, row_number() over (order by code) as rn, count(*) over () as total
  from public.spots where venue_id = '0b7a2f1e-5c3d-4e8a-9f10-3a2b1c0d9e01'
),
crew as (
  select id, row_number() over (order by full_name) as rn, count(*) over () as total
  from public.staff where venue_id = '0b7a2f1e-5c3d-4e8a-9f10-3a2b1c0d9e01' and role = 'staff'
)
insert into public.alerts (
  venue_id, spot_id, kind, status, short_code, token_hash,
  created_at, seen_at, on_the_way_at, resolved_at, cancelled_at, responder_id, outcome
)
select
  '0b7a2f1e-5c3d-4e8a-9f10-3a2b1c0d9e01',
  s.id,
  case when t.r_kind < 0.5 then 'unsafe' when t.r_kind < 0.8 then 'leave' else 'talk' end,
  case when t.r_out < 0.05 then 'cancelled' else 'resolved' end,
  public.random_short_code(),
  public.hash_token('seed-' || t.n || '-' || gen_random_uuid()),
  t.created,
  case when t.r_out < 0.05 then null else t.created + make_interval(secs => t.secs_seen) end,
  case when t.r_out < 0.05 then null else t.created + make_interval(secs => t.secs_seen + t.secs_go) end,
  case when t.r_out < 0.05 then null else t.created + make_interval(secs => t.secs_seen + t.secs_go + t.secs_done) end,
  case when t.r_out < 0.05 then t.created + interval '40 seconds' else null end,
  case when t.r_out < 0.05 then null else c.id end,
  case
    when t.r_out < 0.05 then null
    when t.r_out < 0.40 then 'escorted'
    when t.r_out < 0.60 then 'aggressor_removed'
    when t.r_out < 0.75 then 'ride_called'
    when t.r_out < 0.88 then 'talk_resolved'
    when t.r_out < 0.92 then 'police_called'
    when t.r_out < 0.96 then 'not_found'
    else 'false_alarm'
  end
from timed t
join spots s on s.rn = 1 + floor(t.r_spot * s.total)
left join crew c on c.rn = 1 + floor(t.r_staff * c.total)
where t.created < now() - interval '1 hour'
  and not exists (
    select 1 from public.alerts a where a.venue_id = '0b7a2f1e-5c3d-4e8a-9f10-3a2b1c0d9e01'
  );
