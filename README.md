# Não é Não na Mão

Pedido de ajuda discreto no bar. A mulher lê um QR code no banheiro ou na mesa e pede ajuda **sem instalar nada**. O celular da equipe vibra na hora, com o local. Quem toca em "Estou indo" aparece para ela: "Diego, de camisa preta, está indo até você". O bar fica com o registro que o protocolo Não se Cale (Lei estadual 17.621/2023, SP) e a Lei federal 14.786/2023 pedem.

Projeto da Global Solution CitizenTech (FIAP, Web Design).

> **Estado: fatia F2.** No ar em **https://naoenao.obrian.me** (a F1; a F2 sobe no próximo deploy). O laço real funciona: a página do QR cria o pedido, o app da equipe recebe em tempo real e toca em "Estou indo", e a página da mulher e o quadro da gerência mudam juntos. O painel da gerência faz quatro coisas: direciona ou assume um pedido, cadastra e desativa a equipe, imprime os QR codes e gera o relatório do mês para o Procon. O README completo (integrantes e vídeo) fica para a F4. O estado de cada requisito está em [`docs/ENTREGA.md`](docs/ENTREGA.md).

## Como as partes se dividem

| Quem | Onde | O que faz |
| --- | --- | --- |
| Mulher no bar | **Web**, pelo QR code (`/q/<código>`) | Escolhe o que está acontecendo, acompanha a resposta, cancela, liga para o 190 ou o 180 |
| Equipe (segurança, garçom) | **App** (Expo, React Native) | Recebe o pedido com vibração e notificação, vê se está conectada, toca em "Estou indo" e registra como terminou |
| Gerência e caixa (quem coordena) | **Web**, no painel (`/painel`) | Quadro ao vivo, direcionar ou assumir um pedido, cadastro da equipe e dos locais, QR codes para imprimir, histórico, tempo de resposta e relatório do mês para o Procon |

O estabelecimento usa as duas plataformas, e uma não copia a outra: o app é de quem anda pelo salão; a web é de quem coordena e precisa provar que cumpre o protocolo.

## Como a integração funciona

```
página do QR (web) ──POST /api/alerts──▶ servidor ──WebSocket "venue:<bar>"──▶ app da equipe
        ▲                                   │                                   e quadro da gerência
        └──WebSocket "alert:<token>"────────┘◀──POST /api/staff/alerts/:id/start── (app)
```

1. **O pedido**: a página do QR chama `POST /api/alerts` com o código do local e o tipo de pedido. O servidor cria o pedido no banco e devolve um **token aleatório** (244 bits), que só aquela página conhece. O banco guarda apenas o hash.
2. **O aviso**: o servidor avisa, por **WebSocket (Socket.IO)**, a sala do bar. O app da equipe vibra e mostra o pedido, e o quadro da gerência atualiza.
3. **A resposta**: quem toca em "Estou indo" no app chama a API. O servidor grava o horário e avisa duas salas:
   - a do bar (app e quadro);
   - a do pedido, que é a da página da mulher: "Diego, de camisa preta, está indo até você".
4. **Sem sinal**: se o WebSocket da página cair, ela consulta o servidor a cada 3 segundos até voltar. Sem nenhuma conexão, a página mostra um cartão para levar ao balcão.

**Quem vê o quê**:

- a página da mulher só lê o próprio pedido, pelo token;
- a equipe e a gerência entram com login (senha em bcrypt, token que vence) e só enxergam o próprio bar;
- as rotas da gerência exigem o papel `manager`.

## Estrutura

```
shared/    tokens visuais, tipos, textos e a camada de dados (servidor ou simulada)
server/    Node (Express 5): API em /api, WebSocket em /socket.io e a web compilada, na mesma origem
db/        migrações SQL (tabelas e funções), seed do bar de demonstração e testes
web/       Vite + React: página do QR code e painel da gerência
mobile/    Expo SDK 58 + Expo Router: app da equipe
deploy/    Nginx, cron e modelo do .env da VPS (ver docs/DEPLOY.md)
```

- **Servidor próprio na VPS**: Postgres 17 no Docker Compose, sem porta publicada. No PC, sem Docker, o servidor usa o mesmo Postgres embutido (PGlite).
- **Onde ficam as regras**: o controle de acesso fica na API. As regras que precisam ser atômicas ficam em funções do banco: o limite de pedidos, a ordem dos estados e o horário de cada etapa.
- **Uma identidade visual nas duas partes**: `shared/src/tokens.ts`. A web transforma esse arquivo em variáveis CSS, e o app usa os valores direto. Os contrastes são testados.
- **Camada de dados trocável**: as telas só conhecem as interfaces de `shared/src/data/ports.ts`. A implementação `api.ts` fala com o servidor, e a `mock.ts` simula tudo sem servidor (para desenhar telas).
- **Por que Vite + React na web**: o app já é React (React Native). Com React nos dois lados, os tipos, os textos, as regras (`domain.ts`) e a camada de dados são o mesmo código.

## Rodar o laço no PC

Requisitos: Node 20 ou mais novo (testado no 24) e, para o celular, o app **Expo Go** (SDK 58).

```bash
npm install
```

Em três terminais:

```bash
npm run server       # servidor e banco embutido em http://localhost:8080, com o bar de demonstração
npm run web          # web em http://localhost:5173 (repassa /api e /socket.io ao servidor)
npm run mobile       # app (Expo)
```

Para o servidor criar o bar de demonstração, copie `server/.env.example` para `server/.env`; ele já vem com `SEED_DEMO=1`.

### Testar no celular, sem PC (para o grupo e para quem avalia)

1. Instale o **Expo Go** (SDK 58) no celular.
2. Abra **https://naoenao.obrian.me/testar** e leia o QR code. No próprio celular, use o botão "abrir no Expo Go".
3. Entre com o botão "Preencher com a conta de teste do Diego" (conta só do bar de demonstração).

O app vem de um Metro em modo de produção na VPS (`expo-naoenao.obrian.me`) e fala com o servidor publicado. O detalhe está em `docs/DEPLOY.md`.

### O app no celular (Expo Go), pelo PC

- **Com o servidor publicado**: o app aponta para `https://naoenao.obrian.me` por padrão. Basta ler o QR code que o `npm run mobile` mostra.
- **Com o servidor no PC**: crie `mobile/.env` com `EXPO_PUBLIC_API_URL=http://<IP-do-PC-na-rede>:8080`. O celular precisa estar no mesmo Wi-Fi.
- **No navegador** (Expo web): `EXPO_PUBLIC_API_URL=http://localhost:8080`, e o servidor com `CORS_ORIGINS=http://localhost:8081`.

### Demonstração (bar fictício)

1. **Página do QR code**: `http://localhost:5173/q/ESQBF7K2` (banheiro feminino). Os outros códigos estão em `db/seed.sql`.
2. **App**: "Preencher com a conta de teste do Diego" e "Entrar". O botão "Simular um alerta" faz o papel do QR code.
3. **Painel**: `/painel`, com "Preencher com a conta de teste da gerente".

As contas de teste estão em `db/test-users.json`.

- Elas pertencem só ao bar de demonstração, que volta ao estado inicial todo dia.
- Nenhuma conta tem poder fora desse bar.
- Elas não valem para nada real.

Para desenhar telas sem servidor, use `VITE_DATA_SOURCE=mock` na web ou `EXPO_PUBLIC_DATA_SOURCE=mock` no app.

## Testes

```bash
npm test             # shared (Vitest) + funções do banco + servidor (API, tempo real e camada de dados)
npm run typecheck    # TypeScript em todas as pastas
```

- **Banco** (Postgres 17 embutido):
  - o token do pedido só é guardado como hash e vale 12 horas;
  - a equipe não age sobre o pedido de outro bar;
  - o limite é de 3 pedidos por local e 10 por bar a cada minuto;
  - os horários de cada etapa são gravados na ordem certa.
- **API**:
  - login errado: a senha errada e o e-mail inexistente têm a mesma resposta;
  - um token falso, vencido ou de alguém desativado é recusado;
  - leitura indevida: um token errado ou de outro bar não lê nada;
  - validação de entrada e limite por IP;
  - o laço com o tempo real: o outro bar não recebe nada;
  - o reinício do bar de demonstração não toca em outro bar.
- **Camada de dados**: as três telas juntas, a queda do WebSocket com a consulta de reserva, e o login errado.

## Segurança

- **Senhas**: guardadas só em hash (bcrypt).
- **Login**: o token vence (16 h). Quem é desativado perde o acesso na hora.
- **Segredo dos tokens** (`JWT_SECRET`): fica só no `.env` do servidor e é obrigatório em produção.
- **Entrada e consultas**: entrada validada (zod) e consultas sempre parametrizadas.
- **Requisições**: corpo limitado a 10 kB, limite por IP nos pedidos e no login, cabeçalhos de segurança (helmet) e CORS só para as origens configuradas.
- **Contêiner**: roda sem root. Só os `.env.example` entram no git.

## Notificação com o celular no bolso

- **No MVP**: o app recebe o pedido em tempo real enquanto está aberto, com vibração forte, notificação local e o cartão pulsando.
- **Push remoto**: é o que acorda o celular com o app fechado. Ele **não funciona no Expo Go do Android desde a SDK 53** (documentação do `expo-notifications`) e exige um development build (`eas build --profile development`). Fica como o próximo passo do produto.

## Deploy

Ver [`docs/DEPLOY.md`](docs/DEPLOY.md).
