# Checklist da entrega · Mariana (FIAP · Global Solution CitizenTech)

O projeto se chamava **Não é Não na Mão** até 16/11/2026.

Atualizado a cada fatia. Legenda: ✅ feito e testado · 🟡 parcial · ⬜ falta.

Última atualização: **F2** (16/11/2026): o painel da gerência está completo. A F1 está em produção em https://naoenao.obrian.me.

## Quem usa o quê

| Ator | Plataforma | Estado |
| --- | --- | --- |
| Mulher no bar | **Só a web**, pelo QR code (`/q/<código>`), sem login e sem instalar nada | ✅ Ligada ao servidor; testada no navegador |
| Quem vai até ela (garçom, segurança) | **App**: recebe o alerta, toca em "Estou indo" e em "Resolvido" com o desfecho | 🟡 Ligado ao servidor, com o estado da conexão. Testado no Expo web; falta o celular. A fila de toques feitos sem sinal fica para a F3 |
| Quem coordena e prova (gerência, caixa) | **Web** (`/painel`): quadro ao vivo, direcionar ou assumir, cadastro da equipe e dos locais, QR codes, histórico, tempo de resposta e relatório do mês para o Procon | ✅ Tudo feito na F2 e testado no navegador e pela API |
| Integração | Web da mulher → app da equipe → web da gerência, com a volta à página dela | ✅ Testada no PC nas três telas, à mão e em teste automático |

## App

| Item | Estado | Onde / observação |
| --- | --- | --- |
| React Native funcional | 🟡 | `mobile/` (Expo SDK 58, Expo Router), ligado à API. Testado no Expo web; falta o celular |
| App acessível no celular de qualquer pessoa, sem PC | 🟡 | Serviço `expo` (Metro de produção na VPS) e página `/testar` com o QR. No PC foram testados o manifesto como o Expo Go pede, as URLs dentro das regras do Nginx e os bundles. Falta o deploy e a leitura real pelo Expo Go |
| Navegação seguindo a jornada | 🟡 | Login → pedidos → pedido (Estou indo, desfecho) → ajustes |
| Motion com função clara | 🟡 | Pedido novo pulsa até alguém ver; botão encolhe ao toque; cartões entram com fade. Falta a mudança de estado no detalhe (F3) |

## Web

| Item | Estado | Onde / observação |
| --- | --- | --- |
| HTML, CSS e JS | ✅ | `web/` (Vite + React, CSS próprio a partir dos tokens) |
| Navegação funcional | ✅ | Início, página do QR, painel com quatro seções. Testado no navegador |
| Responsiva (celular, tablet, computador) | 🟡 | Layout fluido. Falta conferir nos três tamanhos (F3) |
| Publicada | ✅ | https://naoenao.obrian.me, no ar desde a F1 e testada em produção pela Central. A F2 sobe com o próximo deploy |

## Papéis e integração

| Item | Estado | Onde / observação |
| --- | --- | --- |
| Papéis nascem das jornadas; a web não copia o app | ✅ | Tabela "Quem usa o quê" acima |
| Dados compartilhados de verdade (ação numa parte tem efeito na outra) | ✅ | API e Socket.IO no `server/`, com salas por bar e por pedido. Testado (`server/test/api.test.ts` e `datasource.test.ts`) |
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

## Painel da gerência (F2)

| Item | Estado | Onde |
| --- | --- | --- |
| Quadro ao vivo com quem está indo e o tempo correndo | ✅ | `web/src/pages/panel/LiveBoard.tsx` |
| "Vi o alerta" pelo painel | ✅ | A página dela passa a "A equipe viu o seu pedido" na hora. Testado no PC com as três telas |
| "Mandar alguém" (direcionar) | ✅ | `POST /api/manager/alerts/:id/assign`, só para alguém ativo do mesmo bar. O app da pessoa mostra "Marta pediu que você vá" e vibra de novo. A página dela mostra "Diego, de camisa preta, foi chamado para ir até você" e, quando ele toca em "Estou indo", "está indo até você". Testado no PC com as três telas |
| Motion e acessibilidade das ações do painel | 🟡 | O cartão "acende" a cada troca de estado. Os botões têm rótulo com o local para o leitor de tela, o retorno da ação fica numa região viva e o foco é visível. Falta a rodada com o NVDA (F3) |
| Assumir (a gerência vai) e encerrar pelo painel | ✅ | Usa as mesmas rotas da equipe. Testado: a página mostrou "Marta, de blazer azul, está indo até você" |
| Cadastrar e desativar a equipe, com a data do curso | ✅ | `POST/PATCH /api/manager/staff`, com senha provisória (bcrypt). Ninguém tira o próprio acesso |
| QR codes com código aleatório, troca de código e página para imprimir | ✅ | `/painel/qr-codes` e `/painel/qr-codes/imprimir` (cartazes A4, dois por folha) |
| Relatório do mês para o Procon | ✅ | `/painel/relatorio`. Traz acionamentos, tempos (mediana e 9 em cada 10), tipo, local, desfecho, equipe capacitada e o registro de cada pedido. Imprime ou salva em PDF |
| Um bar não age sobre a equipe nem os locais de outro | ✅ | `server/test/manager.test.ts` |

## Requisitos próprios do produto

| Item | Estado | Onde |
| --- | --- | --- |
| Página da mulher anônima; só ela lê o próprio pedido (token) | ✅ | `POST /api/alerts` devolve o token; a leitura é por cabeçalho. Testados o token errado, o malformado, o ausente e o de outro bar |
| `spot_code` do QR aleatório | ✅ | Locais novos ganham 10 caracteres ao acaso (`POST /api/manager/spots`), testado. Os códigos do seed são fixos só para a demonstração |
| Login da equipe com senha em hash e token com validade, papéis `staff` e `manager`, cada um no próprio bar | ✅ | bcrypt + JWT de 16 h. Quem é desativado perde o acesso na hora. A equipe comum recebe 403 nas rotas da gerência. Testado |
| Limite de pedidos | ✅ | Por local e por bar no banco; por IP nos pedidos (6/min) e no login (10 a cada 5 min). Testado |
| Horários de cada etapa, quem atendeu, desfecho | ✅ | Tabela `alerts` + funções, testadas |
| Validação de entrada, consultas parametrizadas, limite do corpo, helmet, CORS fechado | ✅ | zod em todas as rotas (campos extras recusados), `$1` em todas as consultas, 10 kB, helmet, CORS por lista. Testado |
| Contêiner sem root; segredo do token só no `.env` | ✅ | `USER node` no Dockerfile; o servidor não sobe sem `JWT_SECRET` em produção. A imagem foi construída e roda na VPS (F1) |
| CSP: WebSocket só para a própria origem | ✅ | `connect-src 'self' ws(s)://<host>` (F2). Testado na API e no navegador: o Socket.IO conecta sem erro, e a página não cai na consulta de reserva |
| Quem é desativado perde o tempo real na hora | ✅ | Sala `user:<id>`; o servidor derruba os sockets ao desativar. Testado |
| Discrição: título da aba só com o nome do bar e **o cardápio do próprio local** (fotos ou PDF cadastrados no painel ou fotografados no app; ou o link do cardápio digital, que abre em outra aba). Sem cardápio cadastrado, fica sem disfarce. O cardápio falso saiu em 16/11 a pedido do Brian | ✅ | Testado no navegador com a CSP de produção: PDF de 2 páginas e foto viram imagens de até 1600 px e aparecem na página dela, a 375 px. Falta o app no celular e teste com usuárias |
| Sem sinal: cartão para o balcão | 🟡 | Feito; falta o teste com o modo avião (F3) |
| Celular no bolso | 🟡 | Alarme no Expo Go: canal de prioridade máxima com som de alarme no Android, repetição por 2 min até alguém ver, vibração contínua e "Testar o alarme" nos Ajustes. O painel web também bipa. Compila para Android; **não testado num celular**. O push remoto (app fechado) exige build próprio: ver [`NOTIFICACOES.md`](NOTIFICACOES.md) |
| WebSocket com reconexão; a página da mulher consulta a cada 3 s se cair | ✅ | Socket.IO com reconexão; a queda é testada derrubando o WebSocket pelo servidor |
| Conta de demonstração inofensiva | ✅ | As contas só agem no bar de demonstração. O cron diário volta o bar ao seed, e o teste confere que o outro bar fica intacto. A Central pergunta ao Brian se a senha pode ficar pública |

## GitHub e README

| Item | Estado |
| --- | --- |
| Repositório público | ⬜ Privado; público só com o ok do Brian, pedido pela Central |
| As duas partes integradas | ✅ Pelo servidor; testado no PC |
| Identidade visual comum | ✅ `shared/src/tokens.ts` nas duas partes |
| Hierarquia clara e código organizado | 🟡 `shared/`, `server/`, `web/`, `mobile/`, `db/` |
| README: nome e integrantes | 🟡 Nome feito; integrantes pendentes |
| README: descrição e como a integração funciona | ✅ Com o desenho do fluxo |
| README: rodar o app (passo a passo com o Expo Go e a URL pública) | 🟡 Passos escritos; a URL pública vale depois do deploy |
| README: link do deploy | 🟡 URL conhecida (https://naoenao.obrian.me); entra no README final (F4) |

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
| 4 | Integração mobile e web, papel de cada plataforma | Servidor + Socket.IO, três atores | ✅ |
| 5 | Design visual, hierarquia, consistência | Tokens compartilhados | 🟡 |
| 6 | Motion design | Ver motion | 🟡 |
| 7 | Acessibilidade e responsividade | Ver acessibilidade | 🟡 |
| 8 | Qualidade técnica, código, deploy funcionando | 60 testes (15 do shared, 12 do banco, 33 da API e do tempo real), typecheck, deploy em produção | ✅ |
| 9 | ODS justificado | PDF (F4) | ⬜ |
| 10 | GitHub e documentação | README, este checklist | 🟡 |
| 11 | Vídeo-pitch e argumentação | Roteiro (F4) | ⬜ |
| 12 | Solução disruptiva | Liga a lei que já existe à equipe do bar; ninguém faz isso hoje (buscas na Rodada 2) | 🟡 |
