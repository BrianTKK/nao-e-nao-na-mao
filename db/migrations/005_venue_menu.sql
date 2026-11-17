-- Cardápio do próprio local (pedido do Brian, 16/11/2026): "vamos deixar uma
-- opção dentro do painel/app, para a equipe do restaurante cadastrar cardapio
-- digital SE houver [...] Um cardapio falso não é uma boa opção".
-- Substitui o cardápio inventado do disfarce (coluna venues.menu).
-- Duas formas, as duas opcionais:
-- - menu_files: fotos do cardápio (ou páginas do PDF, convertidas em imagem no
--   painel), que a página de ajuda mostra dentro dela;
-- - menu_url: o link do cardápio digital que o local já usa, aberto à parte.

alter table venues drop column menu;
alter table venues add column menu_url text
  check (menu_url is null or (menu_url ~ '^https://[^\s]+$' and length(menu_url) <= 500));

create table menu_files (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues (id) on delete cascade,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  data bytea not null,
  size int not null check (size between 1 and 3145728),
  position int not null,
  created_at timestamptz not null default now()
);
create index menu_files_venue on menu_files (venue_id, position);
