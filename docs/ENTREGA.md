# Checklist da entrega (FIAP · Global Solution CitizenTech)

Atualizado a cada fatia. Legenda: ✅ feito e testado · 🟡 em parte · ⬜ falta.

Última atualização: **F0** (16/11/2026).

## O que desenvolver

| Item | Estado | Onde / observação |
| --- | --- | --- |
| App mobile em React Native, funcional | 🟡 | `mobile/` (Expo SDK 58, Expo Router). Telas: login, pedidos ao vivo, pedido (Estou indo, desfecho), ajustes. Roda com dados simulados; testado no navegador (Expo web), ainda não no celular |
| Navegação entre telas seguindo a jornada | 🟡 | Login → pedidos → pedido → encerrar; ajustes |
| Web em HTML, CSS e JS (frameworks permitidos) | 🟡 | `web/` (Vite + React). Página do QR code (`/q/:code`) e painel (`/painel`) |
| Web responsiva (celular, tablet, computador) | 🟡 | Layout fluido e grades com `auto-fit`; falta conferir em cada tamanho (F3) |
| Web publicada | ⬜ | `naoenao.obrian.me` na VPS, pela Central (F1 em diante) |
| Cada plataforma com um motivo próprio | ✅ | A mulher usa só a web (sem instalar). A equipe que vai até ela usa o app. A gerência coordena pela web |
| Integração: ação numa parte aparece na outra | ⬜ | Hoje só entre abas do mesmo navegador (dados simulados). O backend real liga o app e a web na F1 |
| Dados iniciais simulados, fluxo real | 🟡 | Seed do bar fictício pronto (`supabase/seed.sql`), mesmos dados na camada simulada |

## Motion design (com função)

| Item | Estado | Onde |
| --- | --- | --- |
| Retorno de toque nos botões | ✅ | App: o botão encolhe ao toque (Reanimated). Web: `:active` |
| Pedido novo pulsa no app até alguém ver | ✅ | `mobile/src/components/AlertCard.tsx` |
| Linha do tempo do pedido na página da mulher, lenta e sem piscar | ✅ | `web/src/pages/help/StatusSteps.tsx` |
| Pedido entrando no quadro ao vivo do painel | ✅ | `panel.css` (`slide-in`) |
| Respeitar quem pede menos movimento | 🟡 | Web: `prefers-reduced-motion`. App: sistema + chave "Reduzir movimento" nos ajustes. Falta testar no celular |
| Documentar onde e por quê | ⬜ | PDF e vídeo (F4) |

## Acessibilidade (nas duas partes)

| Item | Estado | Onde |
| --- | --- | --- |
| Contraste adequado | ✅ | Testado em `shared/src/__tests__/tokens.test.ts` (texto principal acima de 7:1; o resto acima de 4,5:1; bordas de campo 3:1) |
| Texto que aumenta | 🟡 | Web em rem. App com o tamanho de fonte do sistema. Falta testar com fonte grande (F3) |
| Informação que não depende só de cor | ✅ | Estados sempre com ícone e texto |
| Rótulos para leitor de tela | 🟡 | Rótulos nos botões, campos e cartões. Falta rodar com o TalkBack e o NVDA (F3) |
| App: áreas de toque confortáveis | ✅ | Mínimo de 48 px (`touchTarget`) |
| Web: HTML semântico, teclado e foco visível | 🟡 | Foco amarelo, link para pular ao conteúdo, Esc esconde a página do QR code. Falta a rodada de teclado completa (F3) |
| Animações que respeitam sensibilidade a movimento | 🟡 | Ver motion |
| Linguagem simples | ✅ | Textos curtos, em `shared/src/domain.ts` |

## Requisitos próprios do produto

| Item | Estado | Onde |
| --- | --- | --- |
| Página da mulher anônima; só ela acompanha o próprio pedido (token) | ✅ | Funções `create_alert` e `get_alert_by_token`. Testado com tentativa de leitura indevida (`supabase/tests/rls.test.mjs`) |
| A equipe só vê o próprio bar | ✅ | RLS, testada com dois bares |
| Limite de pedidos por local por minuto | ✅ | 3 por local e 10 por bar, dentro de `create_alert`, testado |
| Horários de criado, visto, a caminho e resolvido; quem atendeu; desfecho | ✅ | Tabela `alerts` e funções da equipe, testadas |
| Disfarce (título neutro, "Ver cardápio") | ✅ | Testado no navegador. Falta teste com usuárias |
| Sem sinal: cartão para o balcão | 🟡 | `CounterCard.tsx`. Aparece sem conexão, com o limite e com erro. Falta o teste com o modo avião (F3) |
| Celular no bolso: vibração, notificação local, alerta visual | 🟡 | Escrito. Testado só no navegador, onde não há vibração. O push remoto exige development build: o Expo Go no Android não tem desde a SDK 53, conferido na documentação. Vai como próximo passo no README e no PDF |

## Entregas

| Entrega | Estado |
| --- | --- |
| Repositório público com as duas partes | 🟡 Privado por enquanto; público só com o ok do Brian |
| README completo (nome, integrantes, descrição, integração, como rodar o app ou link do Expo, link do deploy) | 🟡 Versão da F0 |
| PDF com os 10 itens | ⬜ F4 |
| Vídeo-pitch de 2 a 3 minutos | ⬜ Roteiro na F4; a gravação é do grupo |
| Tabela dos 12 critérios e onde cada um é atendido | ⬜ F4 |
