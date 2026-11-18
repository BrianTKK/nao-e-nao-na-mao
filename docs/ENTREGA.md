# Checklist da entrega · Mariana (FIAP · Global Solution CitizenTech)

O projeto se chamava **Não é Não na Mão** até 16/11/2026.

Atualizado a cada fatia. Legenda: ✅ feito e testado · 🟡 parcial · ⬜ falta.

Última atualização: **F3** (18/11/2026). A F3 está commitada na `main` (privada), nos commits `d373a10`, `f0fd89e`, `a18433d` e `29f9dea`. **A produção em https://naoenao.obrian.me continua no commit `dfc9054`** (visual "Comanda", reflow a 195 px e CSP): a F3 ainda não foi publicada, porque o deploy é um passo separado. O APK novo (`versionCode` 3) foi gerado no PC e não foi publicado: o link público continua com o `versionCode` 2.

## O que foi testado e o que não foi

**Testado (18/11/2026)**

- `npm test`: 159 testes automáticos (60 em shared, 13 do banco, 79 do servidor, 7 do deploy), mais `npm run typecheck` nos quatro pacotes.
- `npm run test:reflow -w web` (Playwright, Chromium): 90 verificações, sem rolagem lateral a 195, 260, 320, 390 e 1440 px, em 18 telas.
- `npm run test:a11y -w web`:
    - axe (WCAG 2.1 A e AA) em 18 telas e 3 tamanhos (390x844, 820x1180, 1440x900), mais o menu aberto e o cartão do balcão (60 telas/tamanhos);
    - rodada só com teclado na página dela e no painel, a 390 e 1440 px (604 passos: foco visível, ordem do Tab igual à ordem visual, sem armadilha, Esc, menus com setas);
    - texto a 200% nas 18 telas a 390 px e espaçamento de texto (WCAG 1.4.12);
    - cartão do balcão com a rede desligada, contra o servidor de verdade (32 conferências).
- `npm run test:offline -w mobile`: 28 verificações da fila sem sinal, com o app aberto no navegador (Expo web) contra o servidor de verdade e a rede cortada pelo Playwright.
- `npm run test:a11y -w mobile`: 463 verificações no app pelo Expo web, em 13 telas/estados e 3 larguras (390, 260 e 195 px, que simulam fonte grande): axe, nome acessível de todo controle, regiões vivas, alvos de 48 px, texto não cortado, palavra-código inteira, "Reduzir movimento".
- Revisão da F3: um painel adversarial leu o diff commitado, com segundo leitor para cada achado. Foram duas rodadas, e os 24 achados confirmados foram corrigidos com teste (`a18433d` e `29f9dea`).
- O push (FCM) foi validado contra o Firebase de verdade (`validate_only`), sem celular.

**Não testado**

- Leitor de tela de verdade (TalkBack, VoiceOver, NVDA): só nomes, papéis e regiões vivas foram conferidos, no código e no navegador.
- Celular real: o APK `versionCode` 3 não foi instalado em aparelho, e um alerta saindo da VPS até um celular de verdade também não foi testado.
- Fonte grande do sistema Android: foi simulada por largura de tela no navegador.
- Firefox e Safari.
- Impressão A4.
- Usuárias e bares reais.

**Limite conhecido, de propósito:** abrir a página do QR já sem conexão não funciona, porque a página dela não instala nada no celular nem guarda nada além do próprio pedido. O cartão do balcão aparece quando a conexão cai depois de a página abrir, ou quando o servidor não responde.

## Quem usa o quê

| Ator | Plataforma | Estado |
| --- | --- | --- |
| Mulher no bar | **Só a web**, pelo QR code (`/q/<código>`), sem login e sem instalar nada | ✅ Ligada ao servidor; testada no navegador, com axe, teclado e texto a 200% |
| Quem vai até ela (garçom, segurança) | **App**: recebe o alerta, toca em "Vi o alerta", "Estou indo" e "Encerrar" com o desfecho | 🟡 Ligado ao servidor, com o estado da conexão e a fila de toques sem sinal (F3). Testado no Expo web; falta o celular |
| Quem coordena e prova (gerência, caixa) | **Web** (`/painel`): quadro ao vivo, direcionar ou assumir, cadastro da equipe e dos locais, QR codes, histórico, tempo de resposta e relatório do mês | ✅ Testado no navegador e pela API |
| Integração | Web da mulher → app da equipe → web da gerência, com a volta à página dela | ✅ Testada no PC nas três telas, à mão e em teste automático; medida em produção na F1 (69 ms até o app e o painel, 99 ms na volta) |

## App

| Item | Estado | Onde / observação |
| --- | --- | --- |
| React Native funcional | 🟡 | `mobile/` (Expo SDK 58, Expo Router), ligado à API. Testado no Expo web; falta o celular |
| App acessível no celular de qualquer pessoa, sem PC | 🟡 | Expo Go pela página `/testar` e APK próprio em https://naoenao.obrian.me/download/mariana.apk. O link entrega o `versionCode` 2; o 3, com a F3, foi gerado no PC e não foi publicado. Nenhum deles foi instalado e testado num celular real |
| APK Android próprio, com push | 🟡 | Gerado e assinado no PC (`mobile/scripts/build-apk.sh`), conferido com `apksigner`. Instalação, som, vibração e aviso com o app fechado: **não testados em celular** (ver `NOTIFICACOES.md`) |
| Navegação seguindo a jornada | 🟡 | Login → alertas → alerta (Vi o alerta, Estou indo, desfecho) → ajustes |
| Fila de toques sem sinal | ✅ no navegador, 🟡 no celular | "Vi o alerta", "Estou indo" e "Encerrar" ficam guardados no aparelho e saem na ordem quando a conexão volta. A tela mostra, com ícone de Wi-Fi riscado e texto, "Sem sinal: vai enviar quando voltar", e o estado "A caminho, ainda não enviado". Arquivos: `shared/src/data/outbox.ts`, `mobile/src/data/outbox.ts`. Testada por `test:offline` (28 verificações) |
| Motion com função clara | ✅ no navegador, 🟡 no celular | Pulso do alerta novo, botão que encolhe, cartões com fade e, na F3, a mudança de estado no detalhe (`mobile/src/components/StatusSteps.tsx`). Falta ver no celular |

## Fila de toques sem sinal (F3)

| Regra | Como funciona | Onde |
| --- | --- | --- |
| Guardar e enviar | Sem conexão, o toque fica no aparelho. Quando a conexão volta, os toques saem na ordem | `mobile/src/data/outbox.ts`, `mobile/src/hooks/useOutbox.ts` |
| Sem duplicar | Cada toque tem um id. O servidor aplica cada id uma vez só: o reenvio não repete a transição nem o aviso | `db/migrations/008_staff_actions.sql`, `server/test/outbox.test.ts` |
| Conflito não é sobrescrito | Se outra pessoa assumiu ou encerrou enquanto o aparelho estava sem sinal, o toque guardado é descartado e o app mostra o aviso 'O seu "Estou indo" não foi enviado: outra pessoa da equipe assumiu o alerta enquanto você estava sem sinal'. O aviso fica até a pessoa tocar em "Entendi" | `db/migrations/009_staff_actions_review.sql`, `shared/src/__tests__/outbox.test.ts` |
| Prazo | Toque guardado há mais de 12 horas é descartado, com aviso | `shared/src/domain.ts`, `mobile/src/components/OutboxNotices.tsx` |
| De quem é o toque | O toque é de quem o fez: não sai com o login de outra pessoa | `mobile/src/data/outbox.ts` |
| Regra no servidor | Quem é da equipe comum não encerra o alerta que outra pessoa assumiu. A gerência encerra, pelo painel ou pelo app com sinal. Toque que ficou guardado sem sinal nunca passa por cima de quem assumiu, nem o da gerência | `server/test/outbox.test.ts` |

Não testado: a fila no celular real, com o APK `versionCode` 3.

## Web

| Item | Estado | Onde / observação |
| --- | --- | --- |
| HTML, CSS e JS | ✅ | `web/` (Vite + React, CSS próprio a partir dos tokens) |
| Navegação funcional | ✅ | Início, página do QR, painel com seis seções (Início, Alertas, Equipe, QR codes, Cardápio e Wi-Fi, Relatório do mês). Testado no navegador |
| Responsiva (celular, tablet, computador) | ✅ | Reflow a 195, 260, 320, 390 e 1440 px, em 18 telas, sem rolagem lateral (`npm run test:reflow -w web`, 90 verificações). Axe nos tamanhos 390x844, 820x1180 e 1440x900. Firefox e Safari não foram testados |
| Publicada | ✅ | https://naoenao.obrian.me, no commit `dfc9054`. A F3 ainda não foi publicada |

## Papéis e integração

| Item | Estado | Onde / observação |
| --- | --- | --- |
| Papéis nascem das jornadas; a web não copia o app | ✅ | Tabela "Quem usa o quê" acima |
| Dados compartilhados de verdade (ação numa parte tem efeito na outra) | ✅ | API e Socket.IO no `server/`, com salas por bar e por pedido. Testado (`server/test/api.test.ts` e `datasource.test.ts`) |
| Dados iniciais simulados, fluxo real | 🟡 | Seed do bar fictício (`db/seed.sql`) carregado pelo servidor com `SEED_DEMO=1`; testado |

## Visual "Comanda" (depois da F2)

| Item | Estado | Onde |
| --- | --- | --- |
| Direção visual | ✅ | Verde-garrafa escuro (`#0E1512`) como fundo, latão (`#FFB840`) só no alerta novo e na ação principal, sálvia (`#A8D5B8`) na ação calma, sem rosa. Fraunces e Instrument Sans hospedadas no próprio site |
| Logo | ✅ | B2 "Comanda": um M vazado num tíquete com dois entalhes. Usado no app e no painel; a página da mulher não leva logo, de propósito |
| Mesmos tokens nas duas plataformas | ✅ | `shared/src/tokens.ts`; contraste de todos os pares testado em `shared/src/__tests__/tokens.test.ts` |
| No celular | 🟡 | Fontes, ícones, folha de desfecho e barra fixa não foram vistos num celular real |

## Reflow a 195 px

| Item | Estado | Onde |
| --- | --- | --- |
| Nenhuma rolagem lateral a 195, 260, 320, 390 e 1440 px | ✅ | `npm run test:reflow -w web` (`web/scripts/reflow-check.mjs`): 90 verificações em 18 telas (públicas, ajuda com disfarces e todas as abas do painel). 195 px é um celular de 390 px com zoom de 200% |
| Opções da ajuda com 72 px ou mais | ✅ | Conferido pelo mesmo verificador |

## CSP

| Item | Estado | Onde |
| --- | --- | --- |
| WebSocket só para a própria origem, fontes e conexões da própria origem | ✅ | `connect-src 'self' ws(s)://<host>` e `font-src 'self'` (`server/src/app.ts`). Testado na API e no navegador: o Socket.IO conecta sem erro. Em produção, atrás do Nginx com HTTPS, foi conferido só no PC, em HTTP |

## Push com o Firebase e APK próprio

Detalhes em [`NOTIFICACOES.md`](NOTIFICACOES.md) e [`DEPLOY.md`](DEPLOY.md).

| Item | Estado | Onde / observação |
| --- | --- | --- |
| Push remoto no Android (FCM) | 🟡 | Envio direto ao FCM HTTP v1, da VPS (`server/src/push.ts`). Repete 5 vezes em 2 minutos até alguém ver. A palavra-código **não** vai na notificação. Validado contra o Firebase de verdade (`validate_only`), sem celular; o servidor em produção está com o push ligado. **Um alerta saindo da VPS até um celular real não foi testado** |
| APK próprio | 🟡 | Assinado, pacote `me.obrian.mariana`. `versionCode` 2 no link público; `versionCode` 3 (com a F3) gerado no PC e não publicado. Não testado num celular real: instalação pelo link, som de alarme, vibração, aviso com o app fechado, repetição na tela bloqueada, "Não perturbe" |
| Celulares que matam apps em segundo plano (Xiaomi, Samsung com economia de bateria) | ⬜ | Não testado. O push pode atrasar se o app não estiver liberado da otimização de bateria |
| iPhone | ⬜ | Push no iOS não existe nesta entrega (exige conta Apple Developer paga). No iPhone, o app só avisa com o app aberto ou em segundo plano recente, pelo Expo Go |
| Chaves e credenciais | ✅ | Ficam fora do git e da pasta do deploy. O `.gitignore` bloqueia `google-services.json`, conta de serviço, keystore, chaves e APK |

## Motion nas duas partes (orientar, dar retorno, mostrar estado, personalidade)

| Item | Estado | Onde |
| --- | --- | --- |
| Retorno de toque | ✅ | App: botão (Reanimated). Web: `:active` |
| Mudança de estado | ✅ no navegador | Web: linha do tempo lenta na página da mulher e quadro ao vivo. App, detalhe do alerta (F3): três trechos (visto, a caminho, encerrado) enchem quando o alerta avança, a linha do estado entra subindo e há um toque háptico (`mobile/src/components/StatusSteps.tsx`, `mobile/src/app/alerts/[id].tsx`). Confirma que o toque valeu e mostra o que mudou |
| Orientação | 🟡 | Foco levado ao título a cada etapa (web); entrada dos cartões (app e painel) |
| Personalidade | 🟡 | Discreto na página da mulher (de propósito) e urgente no app. Explicar no PDF |
| Movimento reduzido | ✅ no navegador, 🟡 no celular | Web: `prefers-reduced-motion`. App: sistema e chave "Reduzir movimento" nos Ajustes, que desliga o motion e o toque háptico. Conferido no verificador do app; não visto no celular |

## Acessibilidade nas duas partes

| Item | Estado | Onde |
| --- | --- | --- |
| Contraste | ✅ | Testado em `shared/src/__tests__/tokens.test.ts` |
| Texto que aumenta | ✅ no navegador | Web em rem; texto a 200% nas 18 telas a 390 px e espaçamento de texto (WCAG 1.4.12), em `web/scripts/a11y-check.mjs`. App: 3 larguras (390, 260 e 195 px) simulam fonte grande, em `mobile/scripts/a11y-check.mjs`. **Fonte grande do sistema Android não testada** |
| Informação que não depende só de cor | ✅ | Estados com ícone e texto |
| Rótulos para leitor de tela | 🟡 | Nomes, papéis e regiões vivas conferidos no código e no navegador (axe; nome acessível de todo controle no app). **Não testado com TalkBack, VoiceOver nem NVDA** |
| App: área de toque confortável | ✅ | Mínimo de 48 px, conferido pelo verificador do app |
| Web: HTML semântico, teclado, foco visível | ✅ | Rodada só com teclado na página dela e no painel, a 390 e 1440 px (604 passos); axe em 60 telas/tamanhos |
| Movimento reduzido | ✅ no navegador | Ver motion |
| Linguagem simples | ✅ | Textos em `shared/src/domain.ts` |
| Quando não há rede | ✅ no navegador | Cartão para o balcão, testado com a rede desligada contra o servidor de verdade (32 conferências). Limite conhecido, de propósito: abrir a página do QR já sem conexão não funciona |

Correções feitas na rodada de acessibilidade da F3:

- links 190 e 180 com nome acessível igual ao texto visível;
- tabelas do relatório que rolam recebem foco do teclado;
- ordem do Tab no topo do painel igual à ordem visual;
- o título da aba deixa de ficar em "Carregando…";
- no app, o estado do alerta e "quem está indo" são região viva fixa: o leitor de tela anuncia a mudança;
- a palavra-código e o nome do local encolhem em tela estreita em vez de quebrar no meio da palavra;
- com sinal fraco, o app tem teto de espera de 8 s e abre com o último login em vez de ficar carregando.

## Painel da gerência

| Item | Estado | Onde |
| --- | --- | --- |
| Quadro ao vivo com quem está indo e o tempo correndo | ✅ | `web/src/pages/panel/LiveBoard.tsx` |
| "Vi o alerta" pelo painel | ✅ | A página dela passa a "A equipe viu o seu pedido" na hora. Testado no PC com as três telas |
| "Mandar alguém" (direcionar) | ✅ | `POST /api/manager/alerts/:id/assign`, só para alguém ativo do mesmo bar. O app da pessoa mostra "Marta pediu que você vá" e vibra de novo. A página dela mostra "Diego, de camisa preta, foi chamado para ir até você" e, quando ele toca em "Estou indo", "está indo até você". Testado no PC com as três telas |
| Motion e acessibilidade das ações do painel | ✅ no navegador | O cartão "acende" a cada troca de estado. Os botões têm rótulo com o local, o retorno da ação fica numa região viva e o foco é visível. Rodada de teclado e axe na F3. Sem leitor de tela de verdade |
| Assumir (a gerência vai) e encerrar pelo painel | ✅ | Usa as mesmas rotas da equipe. A gerência encerra o alerta que outra pessoa assumiu; a equipe comum não |
| Cadastrar e desativar a equipe, com a data do curso | ✅ | `POST/PATCH /api/manager/staff`, com senha provisória (bcrypt). Ninguém tira o próprio acesso |
| QR codes com código aleatório, troca de código e página para imprimir | ✅ | `/painel/qr-codes` e `/painel/qr-codes/imprimir` (cartazes A4, dois por folha). Impressão A4 em papel real: não testada |
| Relatório do mês | ✅ | `/painel/relatorio`. Traz acionamentos, tempos (mediana e 9 em cada 10), tipo, local, desfecho, equipe capacitada e o registro de cada pedido. Imprime ou salva em PDF. É uma ferramenta do bar para mostrar o que fez numa fiscalização: nenhuma das normas conferidas exige esse relatório, e o Procon-SP não o recebe automaticamente |
| Um bar não age sobre a equipe nem os locais de outro | ✅ | `server/test/manager.test.ts` |

## Requisitos próprios do produto

| Item | Estado | Onde |
| --- | --- | --- |
| Página da mulher anônima; só ela lê o próprio pedido (token) | ✅ | `POST /api/alerts` devolve o token; a leitura é por cabeçalho. Testados o token errado, o malformado, o ausente e o de outro bar |
| `spot_code` do QR aleatório | ✅ | Locais novos ganham 10 caracteres ao acaso (`POST /api/manager/spots`), testado. Os códigos do seed são fixos só para a demonstração |
| Login da equipe com senha em hash e token com validade, papéis `staff` e `manager`, cada um no próprio bar | ✅ | bcrypt + JWT de 16 h. Quem é desativado perde o acesso na hora. A equipe comum recebe 403 nas rotas da gerência. Testado |
| Limite de pedidos | ✅ | Por local e por bar no banco; por IP nos pedidos (6/min) e no login (10 a cada 5 min). Testado |
| Horários de cada etapa, quem atendeu, desfecho | ✅ | Tabela `alerts` + funções, testadas |
| Validação de entrada, consultas parametrizadas, limite do corpo, helmet, CORS fechado, CSP | ✅ | zod em todas as rotas (campos extras recusados), `$1` em todas as consultas, 10 kB, helmet, CORS por lista. Testado |
| Contêiner sem root; segredo do token só no `.env` | ✅ | `USER node` no Dockerfile; o servidor não sobe sem `JWT_SECRET` em produção. A imagem foi construída e roda na VPS |
| Quem é desativado perde o tempo real na hora | ✅ | Sala `user:<id>`; o servidor derruba os sockets ao desativar. Testado |
| Discrição: título da aba só com o nome do bar e **o cardápio do próprio local** (fotos ou PDF cadastrados no painel ou fotografados no app; ou o link do cardápio digital). Também o **Wi-Fi do local**, opcional. Sem nenhum dos dois, fica sem disfarce | ✅ | Testado no navegador com a CSP de produção: PDF de 2 páginas e foto viram imagens de até 1600 px e aparecem na página dela; o Wi-Fi aparece sozinho ou junto do cardápio, com Voltar e Esc. Falta o app no celular, o copiar com toque de verdade e teste com usuárias |
| Sem sinal: cartão para o balcão | ✅ no navegador | Testado com a rede desligada (32 conferências). Ver o limite conhecido no começo |
| Celular no bolso | 🟡 | Alarme no Expo Go (canal de prioridade máxima, repetição por 2 min, vibração, "Testar o alarme" nos Ajustes) e, no APK, push pelo Firebase. **Não testado num celular** |
| WebSocket com reconexão; a página da mulher consulta a cada 3 s se cair | ✅ | Socket.IO com reconexão; a queda é testada derrubando o WebSocket pelo servidor |
| Com sinal fraco, o app não fica carregando | ✅ no navegador | Teto de espera de 8 s; o app abre com o último login |
| Conta de demonstração inofensiva | ✅ | As contas só agem no bar de demonstração. O cron diário volta o bar ao seed, e o teste confere que o outro bar fica intacto. O botão de teste mostra a senha na tela (decisão do grupo de 16/11), só do bar fictício |

## GitHub e README

| Item | Estado |
| --- | --- |
| Repositório público | ⬜ Privado; público só com a decisão do grupo |
| As duas partes integradas | ✅ Pelo servidor; testado no PC |
| Identidade visual comum | ✅ `shared/src/tokens.ts` nas duas partes |
| Hierarquia clara e código organizado | 🟡 `shared/`, `server/`, `web/`, `mobile/`, `db/` |
| README: nome e integrantes | 🟡 Nome feito; integrantes pendentes |
| README: descrição e como a integração funciona | ✅ Com o desenho do fluxo |
| README: rodar o app (passo a passo com o Expo Go e a URL pública) | ✅ Passos escritos, com a URL pública no ar |
| README: testes | ✅ Os seis comandos (`npm test`, `npm run typecheck`, `npm run test:reflow -w web`, `npm run test:a11y -w web`, `npm run test:a11y -w mobile` e `npm run test:offline -w mobile`) e o que cada um cobre |
| README: link do deploy | ✅ https://naoenao.obrian.me |

## PDF

| Item | Estado |
| --- | --- |
| Nomes completos e RMs em ordem alfabética | ⬜ Pendente com o grupo |
| Problema e cidadã beneficiada, com a justificativa | 🟡 Rascunho escrito, com fontes conferidas; falta a revisão do grupo |
| Jornada de cada ator, com o papel do app e da web em cada etapa | 🟡 Rascunho escrito |
| Descrição da solução | 🟡 Rascunho escrito |
| Explicação da integração | 🟡 Rascunho escrito |
| Justificativa visual, de UX, de motion e de acessibilidade | 🟡 Rascunho escrito, com o que foi testado e o que não foi |
| ODS justificados (5, 11 e 16) | 🟡 Rascunho escrito, com as metas conferidas na fonte |
| Links do GitHub, do deploy e do vídeo | ⬜ Faltam o repositório público e o vídeo |

## Vídeo de 2 a 3 minutos

| Item | Estado |
| --- | --- |
| Problema e cidadã | 🟡 Roteiro escrito; gravação do grupo |
| Solução | 🟡 Roteiro escrito |
| App e web funcionando juntos, com integração e motion | 🟡 Roteiro escrito. Para as cenas 5 e 8, o celular da equipe precisa do APK `versionCode` 3, que ainda não foi publicado nem instalado em aparelho |
| Justificativas de design, UX, motion e acessibilidade | 🟡 Roteiro escrito. No vídeo, não afirmar que o leitor de tela foi testado |

## Processo

| Item | Estado |
| --- | --- |
| Pesquisa de campo (duas conversas, do grupo), com lugar no PDF para o que foi perguntado, o que ouviram e o que mudou na interface | ⬜ O roteiro das conversas está na seção 8 do PDF; a pergunta-chave é "você instalaria um app para pedir ajuda no bar?" |
| Não ser projeto de outro desafio (distância do ReUse) | ✅ Repositório, domínio e código novos; nada copiado do ReUse |

## Os 12 critérios

| # | Critério | Onde é atendido | Estado |
| --- | --- | --- | --- |
| 1 | Clareza e criatividade, ligação com o problema real | Ideia com dado e lei (seções 2.1 e 2.2 do PDF); página inicial `/` | 🟡 |
| 2 | Foco no usuário: usuários, jornadas e interface coerentes | Três atores, cada um na plataforma que faz sentido; fila sem sinal para quem anda pelo salão | 🟡 |
| 3 | Navegação, usabilidade e UX no app e na web | Telas das duas partes | 🟡 |
| 4 | Integração mobile e web, papel de cada plataforma | Servidor + Socket.IO, três atores, idempotência da fila sem sinal | ✅ |
| 5 | Design visual, hierarquia, consistência | Visual "Comanda" e tokens compartilhados | 🟡 |
| 6 | Motion design | Ver motion | 🟡 |
| 7 | Acessibilidade e responsividade | Ver acessibilidade e reflow | 🟡 |
| 8 | Qualidade técnica, código, deploy funcionando | 159 testes e typecheck, quatro verificadores de ponta a ponta, F3 commitada e revisada; falta o deploy da F3 (produção em `dfc9054`) | 🟡 |
| 9 | ODS justificado | PDF | 🟡 |
| 10 | GitHub e documentação | README, este checklist | 🟡 |
| 11 | Vídeo-pitch e argumentação | Roteiro | ⬜ |
| 12 | Solução disruptiva | Liga a lei que já existe à equipe do bar; em duas buscas, não achamos ferramenta que faça esse elo (seção 2.2 do PDF) | 🟡 |
