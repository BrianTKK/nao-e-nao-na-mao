# Não é Não na Mão

Pedido de ajuda discreto no bar. A mulher lê um QR code no banheiro ou na mesa e pede ajuda **sem instalar nada**. O celular da equipe vibra na hora, com o local. Quem toca em "Estou indo" aparece para ela: "Diego, de camisa preta, está indo até você". O bar fica com o registro que o protocolo Não se Cale (Lei estadual 17.621/2023, SP) e a Lei federal 14.786/2023 pedem.

Projeto da Global Solution CitizenTech (FIAP, Web Design).

> **Estado: fatia F0.** O banco, as regras de acesso e as telas existem, e as telas rodam com **dados simulados**. A ligação real entre o app e a web, pelo backend, chega na F1. O README completo (integrantes, link do deploy e do Expo, vídeo) fica para a F4.

## Como as partes se dividem

| Quem | Onde | O que faz |
| --- | --- | --- |
| Mulher no bar | **Web**, pelo QR code (`/q/<código>`) | Escolhe o que está acontecendo, acompanha a resposta, cancela, esconde a tela atrás do cardápio, liga para o 190 ou o 180 |
| Equipe (segurança, garçom) | **App** (Expo, React Native) | Recebe o pedido com vibração e notificação, toca em "Estou indo" e registra como terminou |
| Gerência | **Web**, no painel (`/painel`) | Pedidos ao vivo, números do mês (tempo de resposta, desfechos, equipe com o curso), histórico, equipe e QR codes para imprimir |

## Estrutura

```
shared/    tokens visuais, tipos do domínio e a camada de dados (interfaces + simulada)
web/       Vite + React: página do QR code e painel da gerência
mobile/    Expo SDK 58 + Expo Router: app da equipe
supabase/  migrações SQL (tabelas, RLS e funções), seed e testes das regras
```

- **Uma identidade visual nas duas partes**: `shared/src/tokens.ts`. A web transforma esse arquivo em variáveis CSS, e o app usa os valores direto. Os contrastes são testados (`shared/src/__tests__/tokens.test.ts`).
- **Camada de dados trocável**: as telas só conhecem as interfaces de `shared/src/data/ports.ts`. Hoje roda a implementação simulada (`mock.ts`). O backend real, Supabase ou próprio, entra sem mexer nas telas.
- **Por que Vite + React na web**: o app já é React (React Native). Com React nos dois, os tipos, os textos, as regras (`domain.ts`) e a camada de dados são o mesmo código, e o grupo trabalha num modelo só. O Vite gera um site estático, que publica em Vercel, Netlify ou GitHub Pages.

## Rodar

Requisitos: Node 20 ou mais novo (testado no 24) e, para o celular, o app **Expo Go** (SDK 58).

```bash
npm install          # na raiz: instala shared, web e mobile (npm workspaces)
npm run web          # web em http://localhost:5173
npm run mobile       # app: leia o QR code do terminal com o Expo Go
```

### Demonstração (bar fictício)

- **Página do QR code**: `http://localhost:5173/q/ESQBF7K2` (banheiro feminino). Os outros códigos estão em `supabase/seed.sql`.
- **Painel**: `/painel`, com o botão "Preencher com a conta de teste da gerente".
- **App**: o botão "Preencher com a conta de teste do Diego". Em seguida, "Simular um pedido" cria um pedido como se alguém tivesse lido o QR code.
- As contas de teste e a senha de demonstração estão em `supabase/test-users.json`. Elas não valem para nada real.

Com os dados simulados, duas abas do mesmo navegador conversam entre si (a página do QR code numa e o painel na outra). Entre o celular e a web, só o backend da F1 liga.

## Testes

```bash
npm test             # testes da camada compartilhada (Vitest) + regras do banco
npm run test:db      # só as regras do banco
npm run typecheck    # TypeScript nas três pastas
```

Os testes do banco rodam as migrações num **Postgres de verdade, embutido** (PGlite), com os papéis do Supabase imitados (`supabase/tests/supabase-shim.sql`). Eles conferem que:

- sem login não se lê nenhuma tabela;
- a mulher só acompanha o próprio pedido, pelo token, que vale 12 horas e fica no banco só como hash;
- a equipe só vê o próprio bar e não altera um pedido fora das funções;
- há um limite de 3 pedidos por local e 10 por bar a cada minuto;
- os horários de criado, visto, a caminho e resolvido são gravados.

## Segurança das chaves

- Só os `.env.example` entram no git.
- A chave pública (anon) do Supabase vai no `.env` de cada parte.
- A chave de serviço (service role) **nunca** vai para o app, a web ou o repositório.
