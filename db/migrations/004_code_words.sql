-- Código do alerta vira uma palavra (borboleta, chuva, toalha...), pedido do
-- Brian em 16/11/2026. A mesma lista está em shared/src/codeWords.ts; o teste
-- codeWords.test.ts confere que as duas são iguais.
-- Os alertas antigos ficam com o código de 4 letras.

-- Sorteia uma palavra que nenhum alerta aberto do bar está usando. Com todas em
-- uso (mais de 60 abertos ao mesmo tempo), repete. Sem bar, sorteia de todas.
create function random_code_word(p_venue_id uuid default null)
returns text
language plpgsql
volatile
as $$
declare
  words constant text[] := array[
    'borboleta', 'chuva', 'toalha', 'janela', 'cadeira', 'panela', 'girassol', 'abacate',
    'caneta', 'escada', 'tomate', 'sapato', 'bicicleta', 'garrafa', 'farol', 'ponte',
    'nuvem', 'montanha', 'floresta', 'cachoeira', 'estrela', 'tijolo', 'tapete', 'almofada',
    'lanterna', 'mochila', 'pipoca', 'castelo', 'jardim', 'oceano', 'planeta', 'foguete',
    'tesoura', 'martelo', 'violino', 'piano', 'tambor', 'semente', 'palmeira', 'cogumelo',
    'tartaruga', 'girafa', 'coruja', 'golfinho', 'esquilo', 'abelha', 'joaninha', 'caracol',
    'canguru', 'pinguim', 'elefante', 'navio', 'barco', 'cometa', 'moinho', 'chaleira',
    'vassoura', 'peteca', 'sorvete', 'pudim', 'morango', 'ameixa'
  ];
  pool text[];
  bytes bytea := uuid_send(gen_random_uuid());
begin
  select array_agg(w) into pool
  from unnest(words) as w
  where p_venue_id is null or not exists (
    select 1 from alerts a
    where a.venue_id = p_venue_id
      and a.status in ('open', 'seen', 'on_the_way')
      and a.short_code = w
  );
  if pool is null then
    pool := words;
  end if;
  return pool[1 + ((get_byte(bytes, 0) * 256 + get_byte(bytes, 1)) % array_length(pool, 1))];
end;
$$;

-- O seed e quem mais chamar a função antiga também recebem palavras.
create or replace function random_short_code()
returns text
language sql
volatile
as $$
  select random_code_word(null)
$$;

create or replace function create_alert(p_spot_code text, p_kind text)
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
  -- Palavra que nenhum outro alerta aberto do bar usa (a trava acima evita corrida).
  v_code := random_code_word(v_spot.venue_id);

  insert into alerts (venue_id, spot_id, kind, short_code, token_hash, created_at)
  values (v_spot.venue_id, v_spot.id, p_kind, v_code, hash_token(v_token), clock_timestamp())
  returning id into v_id;

  return query select v_id, v_spot.venue_id, v_token, v_code;
end;
$$;
