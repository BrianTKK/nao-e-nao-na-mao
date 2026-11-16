# Não é Não na Mão

Pedido de ajuda discreto no bar. A mulher lê um QR code no banheiro ou na mesa e pede ajuda **sem instalar nada**. O celular da equipe vibra na hora, com o local. Quem toca em "Estou indo" aparece para ela: "Diego, de camisa preta, está indo até você". O bar fica com o registro que o protocolo Não se Cale (Lei estadual 17.621/2023, SP) e a Lei federal 14.786/2023 pedem.

Projeto da Global Solution CitizenTech (FIAP, Web Design).

> **Estado: fatia F0.** O banco, o esqueleto do servidor e as telas existem; as telas ainda rodam com **dados simulados**. A ligação real entre a web e o app, pelo servidor, chega na F1. O README completo (integrantes, link do deploy e do Expo, vídeo) fica para a F4. O estado de cada requisito está em [`docs/ENTREGA.md`](docs/ENTREGA.md).

## Como as partes se dividem

| Quem | Onde | O que faz |
| --- | --- | --- |
| Mulher no bar | **Web**, pelo QR code (`/q/<código>`) | Escolhe o que está acontecendo, acompanha a resposta, cancela, esconde a tela atrás do cardápio, liga para o 190 ou o 180 |
| Equipe (segurança, garçom) | **App** (Expo, React Native) | Recebe o pedido com vibração e notificação, toca em "Estou indo" e registra como terminou |
| Gerência e caixa (quem coordena) | **Web**, no painel (`/painel`) | Quadro ao vivo, direcionar ou assumir um pedido, cadastro da equipe e dos locais, QR codes para imprimir, histórico, tempo de resposta e relatório do mês para o Procon |

O estabelecimento usa as duas plataformas, e uma não copia a outra: o app é de quem anda pelo salão; a web é de quem coordena e precisa provar que cumpre o protocolo.

## Estrutura

```
shared/    tokens visuais, tipos do domínio e a camada de dados (interfaces + simulada)
server/    Node (Express 5): API em /api, WebSocket e a web compilada, na mesma origem
db/        migrações SQL (tabelas e funções), seed do bar fictício e testes
web/       Vite + React: página do QR code e painel da gerência
mobile/    Expo SDK 58 + Expo Router: app da equipe
```

- **Servidor próprio na VPS**: Postgres 17 no Docker Compose, sem porta publicada. No PC, sem Docker, o servidor usa o mesmo Postgres embutido (PGlite). O controle de acesso fica na API; as regras que precisam ser atômicas (limite de pedidos, ordem dos estados, horário de cada etapa) ficam em funções do banco.

- **Uma identidade visual nas duas partes**: `shared/src/tokens.ts`. A web transforma esse arquivo em variáveis CSS, e o app usa os valores direto. Os contrastes são testados (`shared/src/__tests__/tokens.test.ts`).
- **Camada de dados trocável**: as telas só conhecem as interfaces de `shared/src/data/ports.ts`. Hoje roda a implementação simulada (`mock.ts`). A implementação que fala com o servidor entra na F1 sem mexer nas telas.
- **Por que Vite + React na web**: o app já é React (React Native). Com React nos dois, os tipos, os textos, as regras (`domain.ts`) e a camada de dados são o mesmo código, e o grupo trabalha num modelo só. O Vite gera um site estático, que publica em Vercel, Netlify ou GitHub Pages.

## Rodar

Requisitos: Node 20 ou mais novo (testado no 24) e, para o celular, o app **Expo Go** (SDK 58).

```bash
npm install          # na raiz: instala tudo (npm workspaces)
npm run server       # servidor em http://localhost:8080 (copie server/.env.example para server/.env)
npm run web          # web em http://localhost:5173
npm run mobile       # app: leia o QR code do terminal com o Expo Go
```

### Demonstração (bar fictício)

- **Página do QR code**: `http://localhost:5173/q/ESQBF7K2` (banheiro feminino). Os outros códigos estão em `db/seed.sql`.
- **Painel**: `/painel`, com o botão "Preencher com a conta de teste da gerente".
- **App**: o botão "Preencher com a conta de teste do Diego". Em seguida, "Simular um pedido" cria um pedido como se alguém tivesse lido o QR code.
- As contas de teste e a senha de demonstração estão em `db/test-users.json`. Elas não valem para nada real.

Com os dados simulados, duas abas do mesmo navegador conversam entre si (a página do QR code numa e o painel na outra). Entre o celular e a web, só o servidor liga (F1).

## Testes

```bash
npm test             # shared (Vitest) + funções do banco + servidor
npm run test:db      # só as funções do banco
npm run typecheck    # TypeScript em todas as pastas
```

Os testes do banco rodam as migrações num **Postgres de verdade, embutido** (PGlite, Postgres 17). Eles conferem que:

- a mulher só acompanha o próprio pedido, pelo token, que vale 12 horas e fica no banco só como hash;
- a equipe de um bar não age sobre o pedido de outro;
- uma conta sem cadastro ativo na equipe não age sobre nada;
- há um limite de 3 pedidos por local e 10 por bar a cada minuto;
- os horários de criado, visto, a caminho e resolvido são gravados, na ordem certa.

Os testes do servidor conferem a migração, o seed com as senhas em hash, os cabeçalhos de segurança, o limite do corpo e as exigências de produção.

## Segurança

- **Senhas**: guardadas só em hash (bcrypt).
- **Segredo dos tokens de login** (`JWT_SECRET`): fica só no `.env` do servidor e é obrigatório em produção.
- **Arquivos de configuração**: só os `.env.example` entram no git.
- **Consultas**: sempre parametrizadas.
- **Requisições**: corpo limitado a 10 kB, cabeçalhos de segurança (helmet) e CORS só para as origens configuradas.
