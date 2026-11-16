# Checklist da entrega (FIAP · Global Solution CitizenTech)

Atualizado a cada fatia. Legenda: ✅ feito e testado · 🟡 parcial · ⬜ falta.

Última atualização: **F0 ajustada para a VPS** (16/11/2026).

## Quem usa o quê

| Ator | Plataforma | Estado |
| --- | --- | --- |
| Mulher no bar | **Só a web**, pelo QR code (`/q/<código>`), sem login e sem instalar nada | 🟡 Telas prontas com dados simulados |
| Quem vai até ela (garçom, segurança) | **App**: recebe o alerta, toca em "Estou indo" e em "Resolvido" com o desfecho | 🟡 Telas prontas. Faltam o estado da conexão e a fila de toques feitos sem sinal (F1 e F3) |
| Quem coordena e prova (gerência, caixa) | **Web** (`/painel`): quadro ao vivo, direcionar ou assumir, cadastro da equipe e dos locais, QR codes, histórico, tempo de resposta e relatório do mês para o Procon | 🟡 Quadro, números, histórico, equipe (só leitura) e QR codes feitos. Faltam direcionar ou assumir, o cadastro da equipe e o relatório (F2) |
| Integração | Web da mulher → app da equipe → web da gerência, com a volta à página dela | ⬜ F1 |

## App

| Item | Estado | Onde / observação |
| --- | --- | --- |
| React Native funcional | 🟡 | `mobile/` (Expo SDK 58, Expo Router). Testado no Expo web, ainda não no celular |
| Navegação seguindo a jornada | 🟡 | Login → pedidos → pedido (Estou indo, desfecho) → ajustes |
| Motion com função clara | 🟡 | Pedido novo pulsa até alguém ver; botão encolhe ao toque; cartões entram com fade. Falta a mudança de estado no detalhe (F3) |

## Web

| Item | Estado | Onde / observação |
| --- | --- | --- |
| HTML, CSS e JS | ✅ | `web/` (Vite + React, CSS próprio a partir dos tokens) |
| Navegação funcional | ✅ | Início, página do QR, painel com quatro seções. Testado no navegador |
| Responsiva (celular, tablet, computador) | 🟡 | Layout fluido. Falta conferir nos três tamanhos (F3) |
| Publicada | ⬜ | `naoenao.obrian.me` na VPS, servida pelo `server/` na mesma origem. A Central sobe; o compose e o Nginx são preparados na F1 |

## Papéis e integração

| Item | Estado | Onde / observação |
| --- | --- | --- |
| Papéis nascem das jornadas; a web não copia o app | ✅ | Tabela "Quem usa o quê" acima |
| Dados compartilhados de verdade (ação numa parte tem efeito na outra) | ⬜ | F1: API + WebSocket no `server/`. Hoje, só entre abas do mesmo navegador (dados simulados) |
| Dados iniciais simulados, fluxo real | 🟡 | Seed do bar fictício (`db/seed.sql`) carregado pelo servidor com `SEED_DEMO=1`; testado |

## Motion nas duas partes (orientar, dar retorno, mostrar estado, personalidade)

| Item | Estado | Onde |
| --- | --- | --- |
| Retorno de toque | ✅ | App: botão (Reanimated). Web: `:active` |
| Mudança de estado | 🟡 | Web: linha do tempo lenta na página da mulher e o quadro ao vivo. App: pulso do pedido novo |
| Orientação | 🟡 | Foco levado ao título a cada etapa (web); entrada dos cartões (app e painel) |
| Personalidade | 🟡 | Discreto na página da mulher (de propósito) e urgente no app. Explicar no PDF |
| Movimento reduzido | 🟡 | Web: `prefers-reduced-motion`. App: sistema + chave "Reduzir movimento". Falta testar no celular |

## Acessibilidade nas duas partes

| Item | Estado | Onde |
| --- | --- | --- |
| Contraste | ✅ | Testado em `shared/src/__tests__/tokens.test.ts` |
| Texto que aumenta | 🟡 | Web em rem; app com a fonte do sistema. Falta testar com fonte grande (F3) |
| Informação que não depende só de cor | ✅ | Estados com ícone e texto |
| Rótulos para leitor de tela | 🟡 | Rótulos escritos. Falta rodar com o TalkBack e o NVDA (F3) |
| App: área de toque confortável | ✅ | Mínimo de 48 px |
| Web: HTML semântico, teclado, foco visível | 🟡 | Foco amarelo, link para pular ao conteúdo, Esc esconde a página do QR. Falta a rodada só com teclado (F3) |
| Movimento reduzido | 🟡 | Ver motion |
| Linguagem simples | ✅ | Textos em `shared/src/domain.ts` |

## Requisitos próprios do produto

| Item | Estado | Onde |
| --- | --- | --- |
| Página da mulher anônima; só ela lê o próprio pedido (token) | 🟡 | Banco testado (`db/tests`): token de 244 bits, só o hash guardado, validade de 12 h. A rota `POST /api/alerts` e o teste de leitura indevida pela API são da F1 |
| `spot_code` do QR aleatório | 🟡 | Seed com códigos fixos de demonstração. A geração aleatória pela API é da F2 (cadastro de locais) |
| Login da equipe com senha em hash e token com validade, papéis `staff` e `manager`, cada um no próprio bar | 🟡 | Tabela `users` com bcrypt (seed testado); as funções conferem o bar de quem age (testado). O login e o token são da F1 |
| Limite de pedidos | 🟡 | Por local e por bar no banco (testado). Por IP na API (F1) |
| Horários de cada etapa, quem atendeu, desfecho | ✅ | Tabela `alerts` + funções, testadas |
| Validação de entrada, consultas parametrizadas, limite do corpo, helmet, CORS fechado | 🟡 | Helmet, limite de 10 kB e CORS por lista feitos e testados; consultas sempre com `$1`. A validação com zod nas rotas vem com as rotas (F1) |
| Contêiner sem root; segredo do token só no `.env` | 🟡 | O servidor exige `JWT_SECRET` em produção (testado). O Dockerfile é da F1 |
| Disfarce (título neutro, "Ver cardápio") | ✅ | Testado no navegador. Falta teste com usuárias |
| Sem sinal: cartão para o balcão | 🟡 | Feito; falta o teste com o modo avião (F3) |
| Celular no bolso | 🟡 | Vibração, notificação local e alerta visual escritos. O push remoto exige development build (Expo Go no Android sem push desde a SDK 53, conferido na documentação): vai como próximo passo no README e no PDF |
| WebSocket com reconexão; a página da mulher consulta a cada 3 s se cair | ⬜ | F1 |

## GitHub e README

| Item | Estado |
| --- | --- |
| Repositório público | ⬜ Privado; público só com o ok do Brian, pedido pela Central |
| As duas partes integradas | ⬜ F1 |
| Identidade visual comum | ✅ `shared/src/tokens.ts` nas duas partes |
| Hierarquia clara e código organizado | 🟡 `shared/`, `server/`, `web/`, `mobile/`, `db/` |
| README: nome e integrantes | 🟡 Nome feito; integrantes pendentes |
| README: descrição e como a integração funciona | 🟡 Descrição feita; a integração entra na F1 |
| README: rodar o app (passo a passo com o Expo Go e a URL pública) | 🟡 Passos locais feitos; a URL pública entra depois do deploy |
| README: link do deploy | ⬜ |

## PDF

| Item | Estado |
| --- | --- |
| Nomes completos e RMs em ordem alfabética | ⬜ Pendente com o Brian |
| Problema e cidadã beneficiada, com a justificativa | ⬜ F4 (base em `GS_CitizenTech_Ideias_Rodada2` no cofre) |
| Jornada de cada ator, com o papel do app e da web em cada etapa | ⬜ F4 |
| Descrição da solução | ⬜ F4 |
| Explicação da integração | ⬜ F4 |
| Justificativa visual, de UX, de motion e de acessibilidade | ⬜ F4 |
| ODS justificados (5, 11 e 16) | ⬜ F4 |
| Links do GitHub, do deploy e do vídeo | ⬜ |

## Vídeo de 2 a 3 minutos

| Item | Estado |
| --- | --- |
| Problema e cidadã | ⬜ Roteiro na F4; gravação do grupo |
| Solução | ⬜ |
| App e web funcionando juntos, com integração e motion | ⬜ |
| Justificativas de design, UX, motion e acessibilidade | ⬜ |

## Processo

| Item | Estado |
| --- | --- |
| Pesquisa de campo (duas conversas, do grupo), com lugar no PDF para o que foi perguntado, o que ouviram e o que mudou na interface | ⬜ Roteiro das conversas no cofre; a pergunta-chave é "você instalaria um app para pedir ajuda no bar?" |
| Não ser projeto de outro desafio (distância do ReUse) | ✅ Repositório, domínio e código novos; nada copiado do ReUse |

## Os 12 critérios

| # | Critério | Onde é atendido | Estado |
| --- | --- | --- | --- |
| 1 | Clareza e criatividade, ligação com o problema real | Ideia com dado e lei (Rodada 2); página inicial `/` | 🟡 |
| 2 | Foco no usuário: usuários, jornadas e interface coerentes | Três atores, cada um na plataforma que faz sentido | 🟡 |
| 3 | Navegação, usabilidade e UX no app e na web | Telas das duas partes | 🟡 |
| 4 | Integração mobile e web, papel de cada plataforma | F1 | ⬜ |
| 5 | Design visual, hierarquia, consistência | Tokens compartilhados | 🟡 |
| 6 | Motion design | Ver motion | 🟡 |
| 7 | Acessibilidade e responsividade | Ver acessibilidade | 🟡 |
| 8 | Qualidade técnica, código, deploy funcionando | Testes (banco, shared, server), typecheck; deploy pendente | 🟡 |
| 9 | ODS justificado | PDF (F4) | ⬜ |
| 10 | GitHub e documentação | README, este checklist | 🟡 |
| 11 | Vídeo-pitch e argumentação | Roteiro (F4) | ⬜ |
| 12 | Solução disruptiva | Liga a lei que já existe à equipe do bar; ninguém faz isso hoje (buscas na Rodada 2) | 🟡 |
