-- Imita o que o Supabase já traz pronto, para testar as migrações num
-- Postgres local (PGlite) sem conta e sem Docker:
-- papéis anon e authenticated, schema auth com auth.users e auth.uid(),
-- e as permissões padrão que o Supabase dá a esses papéis no schema public.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key, email text unique);

create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

-- Como no Supabase: tudo o que nasce em public é acessível a anon e
-- authenticated, e só a RLS (e os revokes da migração) protege.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
