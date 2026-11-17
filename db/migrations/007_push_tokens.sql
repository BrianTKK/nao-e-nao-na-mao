-- Push remoto no Android (pedido da Central, 17/11/2026, depois do teste do
-- Brian em 16/11: com o app minimizado no Expo Go, nenhum aviso chegava).
-- Cada celular com o app próprio (APK, não o Expo Go) registra aqui o token do
-- Firebase (FCM). A VPS manda o alarme direto ao FCM, sem o serviço da Expo.
--
-- O token identifica o aparelho, não a pessoa: se outra pessoa entrar no mesmo
-- celular, o token passa para ela (upsert pelo token, na API).
create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references staff (id) on delete cascade,
  token text not null unique
    check (length(token) between 20 and 4096 and token ~ '^[A-Za-z0-9_:-]+$'),
  platform text not null check (platform in ('android')),
  created_at timestamptz not null default now(),
  -- Última vez que o app confirmou o token (a cada login e abertura).
  updated_at timestamptz not null default now(),
  -- Fim do login com que o token foi registrado. Depois dele, o aparelho não
  -- recebe mais: quem teve a sessão vencida (sem tocar em "Sair") não fica
  -- recebendo, na tela bloqueada, os alertas do bar.
  expires_at timestamptz not null
);

create index push_tokens_user on push_tokens (user_id);
