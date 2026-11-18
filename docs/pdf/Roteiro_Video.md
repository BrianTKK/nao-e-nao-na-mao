# Roteiro do vídeo-pitch: Mariana

Duração total prevista: **2 min 47 s** (limite do briefing: 3 min; margem de segurança: 2 min 50 s). Cálculo das falas: cerca de 2,5 palavras por segundo. Cada FALA cabe no tempo da cena, já descontando os toques e as pausas da tela.

Legenda: ⬜ PREENCHER = depende do grupo. F3 = fatia de 18/11/2026 (fila sem sinal, motion no detalhe, rodada de acessibilidade), commitada na `main` e testada. O servidor, o site e o app com a F3 estão publicados desde 18/11/2026: o app pelo Expo Go e o APK `versionCode` 4 no link público. O APK 4 já foi instalado num celular, e o alarme tocou com o app fechado e a tela bloqueada. Para gravar as cenas 5 e 8 como estão aqui, o celular da equipe precisa do APK `versionCode` 4.

## Mapa do vídeo

| Bloco | Cenas | Tempo |
| --- | --- | --- |
| Problema e cidadã | 1 | 0:00 a 0:13 |
| Solução | 2 | 0:13 a 0:27 |
| Integração ao vivo, numa tomada só, três telas | 3 a 7 | 0:27 a 1:32 |
| Modo avião (tomada à parte) | 8 | 1:32 a 1:50 |
| Design e UX | 9 | 1:50 a 2:03 |
| Acessibilidade | 10 | 2:03 a 2:21 |
| Lei e ODS | 11 | 2:21 a 2:39 |
| Fecho | 12 | 2:39 a 2:47 |

## Cena a cena

Quem fala: ⬜ PREENCHER em todas as cenas (sugestão: uma voz para o problema e o fecho, outra para a demonstração, outra para as justificativas; decidam entre vocês).

| Nº | Tempo | Quem fala | FALA (texto exato) | NA TELA | Observação de gravação |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:00 a 0:13 | ⬜ PREENCHER | "Pesquisa de 2025: 11,3% das mulheres relataram abordagem agressiva numa festa. Pedir ajuda em voz alta, no bar, expõe quem pede. Ela quer sair, ou só falar com alguém, sem escândalo." | Cartela de texto com "11,3%" grande e a fonte pequena ("Fórum Brasileiro de Segurança Pública e Datafolha, Visível e Invisível, 5ª edição, 2025"). Depois, ⬜ PREENCHER: imagem do bar ou da equipe de vocês no local (só se for de vocês; sem foto de banco que finja ser real). | O número é nacional e de "festa", não de bar: não dizer "em bares". Fonte: https://forumseguranca.org.br/wp-content/uploads/2025/03/visiveleinvisivel-2025-infografico.pdf . Se quiserem a cidadã com mais cara, citem as duas conversas de campo do grupo (⬜ PREENCHER: o que ouviram). Sem isso, não inventar depoimento. |
| 2 | 0:13 a 0:27 | ⬜ PREENCHER | "Esta é a Mariana. A mulher lê o QR code do local e pede ajuda pela web, sem login e sem instalar nada. A equipe recebe no app. A gerência vê tudo no painel." | Logo e nome "Mariana". Desenho simples das três partes (web da mulher, app da equipe, painel da gerência) com setas, ou o diagrama do README ("Como a integração funciona"). | Fazer o desenho em tela cheia, limpo. Dizer "Mariana" sem sobrenome (decisão do projeto: nada da imagem de Mariana Ferrer na tela). |
| 3 | 0:27 a 0:35 | ⬜ PREENCHER | "Agora, ao vivo, três telas ao mesmo tempo: a web dela, o app da equipe e o painel da gerência." | **Início da tomada única.** Plano aberto com as três telas visíveis: celular dela na página do QR (aberta em `/q/ESQBF7K2`, banheiro feminino do bar de demonstração, título "Precisa de ajuda? A nossa equipe vem até você."), celular da equipe no app em "Nenhum alerta agora", computador no `/painel` com o quadro ao vivo ("Nenhum alerta em aberto."). | Posição das três telas: ⬜ PREENCHER (sugestão: dela à esquerda, equipe no centro, painel à direita, na ordem da jornada). Não cortar a tomada até o fim da cena 7. Câmera parada, sem zoom. Início só com a página dela limpa: sem pedido em andamento (ver "Antes de gravar"). |
| 4 | 0:35 a 0:52 | ⬜ PREENCHER | "Ela lê o QR code e toca em "Estou me sentindo insegura". Recebe uma palavra-código. No app, o alarme toca. O alerta novo pulsa até alguém ver: o pulso diz que ninguém atendeu ainda." | Celular dela: toca na opção "Estou me sentindo insegura"; a tela vira "Pedido enviado à equipe", com "Sua palavra-código:" e a palavra grande, e a linha do tempo "Pedido enviado" marcada. Celular da equipe: o alarme toca e o alerta novo aparece na lista ("1 alerta em aberto"), com o pulso. Painel: cartão novo, o único cheio, em latão, com "Ninguém viu ainda"; o painel também bipa. | **Motion 1: pulso do alerta novo.** Deixar o pulso rodar 3 a 4 segundos antes de continuar. Se o alarme (som) não tocar na hora: plano B no fim deste arquivo. **O alarme com o app fechado (push) foi validado contra o Firebase, mas ainda não foi testado em celular real: testar antes de gravar.** Para a mulher "ler o QR code" de verdade, filmar o celular dela lendo o cartaz impresso (`/painel/qr-codes/imprimir`); se não der, abrir o link direto e dizer "lê" mesmo assim, sem fingir leitor. Atenção ao limite de pedidos (ver preparação). |
| 5 | 0:52 a 1:08 | ⬜ PREENCHER | "A equipe toca em "Estou indo". No app, o estado muda com uma transição curta, que confirma o toque e mostra o que mudou. Na página dela: "Diego, de camisa preta, está indo até você". Ele diz a palavra-código dela." | Celular da equipe: toca no cartão do alerta, o detalhe abre com o tempo "há ..." correndo e "Diga esta palavra a ela", e o app marca "Visto" sozinho (o estado sai de "Novo" para "Visto"); toca no botão grande "Estou indo". Estado passa de "Visto" para "A caminho" com a transição: os trechos enchem, a linha do estado entra subindo e o celular dá um toque háptico. Celular dela: título muda para "Alguém está indo até você" e aparece "Diego, de camisa preta, está indo até você." (a roupa vem de Ajustes no app: ver preparação). Painel: o cartão, que estava em "Visto; ninguém foi mandado ainda", passa a "Diego está indo até ela". | **Motion 2: mudança de estado no detalhe do alerta** (F3: `StatusSteps.tsx` e `alerts/[id].tsx`: três trechos, visto, a caminho e encerrado, enchem quando o alerta avança, a linha do estado entra subindo e há um toque háptico; com "Reduzir movimento", nada disso se mexe). Abrir o detalhe marca "Visto" sozinho (o "Vi" é automático: o app não tem botão "Vi o alerta") e o alarme daquele alerta para; "A caminho" só vem depois do toque em "Estou indo". Isso é bom: mostra o alarme calando (o alarme ainda não foi testado em celular real: testar antes de gravar). Dizer a fala enquanto o dedo vai ao botão. A página dela anuncia a mudança numa região viva (leitor de tela). |
| 6 | 1:08 a 1:18 | ⬜ PREENCHER | "No painel, o tempo corre. O cartão acende a cada mudança de estado, para a gerência ver o que mudou." | Painel no computador: cartão em "A caminho", com "Diego está indo até ela" e "há 1 min 42 s" (o número vai mudando), e a faixa que "acende" quando o estado troca. Nesse estado o cartão só tem o botão "Encerrar": "Estou indo", "Vi o alerta" e "Mandar alguém" não aparecem. Se der, apontar com o dedo ou com um realce de edição. | **Motion 3: cartão que acende na troca de estado** (`live-flash` no `LiveBoard.tsx`). O acendimento é rápido e já aconteceu na cena 5, quando o cartão virou "Visto" e depois "A caminho". Para mostrá-lo com calma, a edição pode repetir em câmera lenta esse trecho da cena 5 (opcional, não entra na fala). Não pedir "Mandar alguém" aqui: esse botão só existe com o alerta "Novo" ou "Visto", nunca em "A caminho". |
| 7 | 1:18 a 1:32 | ⬜ PREENCHER | "Ele diz a palavra-código a ela e encerra, escolhendo o desfecho. A linha do tempo dela avança devagar, de propósito: a tela não deve chamar atenção." | Quem faz a equipe fala a palavra em voz baixa à mulher (a de verdade da tela, ex.: a que o app mostra em "Diga esta palavra a ela"). Celular da equipe: toca em "Encerrar…", abre a folha de desfechos; toca em "Acompanhei até um lugar seguro ou até o carro". Celular dela: "Pedido encerrado" e a linha do tempo chega a "Encerrado" (o último passo leva o carimbo, e os anteriores, o check). Painel: o cartão sai do quadro. **Fim da tomada única.** | **Motion 4: linha do tempo calma na página dela** (`StatusSteps.tsx`: só o passo atual faz um carimbo, nada mais se mexe). Frase dita enquanto a linha avança. Atenção: uma pessoa da equipe chega perto da outra; ensaiar o encontro para caber nos 14 s. |
| 8 | 1:32 a 1:50 | ⬜ PREENCHER | "Se faltar sinal? Com o modo avião ligado, a equipe toca em "Estou indo". O app avisa: "Sem sinal: vai enviar quando voltar", e o estado fica "A caminho, ainda não enviado". Quando o sinal volta, o toque é enviado e a página dela muda." | Tomada à parte (cria um novo alerta antes). Celular da equipe com o alerta aberto; barra de status mostrando o avião; toca em "Estou indo"; aparece o aviso "Sem sinal: vai enviar quando voltar" (com ícone de Wi-Fi riscado e texto) e o estado "A caminho, ainda não enviado". Desliga o modo avião; o aviso some; o estado vira "A caminho". Celular dela (com sinal): troca para "Alguém está indo até você". | Os textos do aviso e do estado são os da F3, testados no app aberto no navegador, com a rede cortada (`npm run test:offline -w mobile`, 28 verificações). **Em celular real, a fila não foi testada**: ensaiar antes. O toque guardado há mais de 12 horas é descartado com aviso. Cuidado: se outra pessoa assumir ou encerrar o alerta enquanto o aparelho está sem sinal, o toque guardado é descartado e o app avisa (O seu "Estou indo" não foi enviado: outra pessoa da equipe assumiu o alerta enquanto você estava sem sinal), até a pessoa tocar em "Entendi". Não precisa dizer isso no vídeo, mas não deixar outra pessoa mexer no alerta durante a tomada. Como ligar o modo avião sem perder a gravação: ver "Antes de gravar". |
| 9 | 1:50 a 2:03 | ⬜ PREENCHER | "Identidade visual nas duas partes. A página dela não tem logo e o título é o nome do bar, para passar despercebida. No app, a ação principal fica ao alcance do polegar." | Duas imagens lado a lado: a página do QR (sem logo, com o nome do bar no cabeçalho) e o detalhe do alerta no app com a barra de baixo ("Estou indo" e "Encerrar…"). Opcional: o botão "Ver cardápio" do cabeçalho (só se o bar de demonstração tiver cardápio cadastrado; conferir antes). | A identidade vem de `shared/src/tokens.ts`, usada na web e no app. Gravar de tela, sem câmera. Esta cena cobre design e UX; o motion e a acessibilidade têm cenas próprias. |
| 10 | 2:03 a 2:21 | ⬜ PREENCHER | "Acessibilidade desde o início: contraste testado; texto a 200%, que vira 195 pixels de largura, sem quebrar o layout; navegação só pelo teclado; estados com ícone e texto, não só cor; e "Reduzir movimento", que desliga animações e pulso." | Sequência rápida, 3 a 4 segundos cada: (a) a página dela a 195 px de largura (celular de 390 px com zoom de 200%), sem texto sobreposto; (b) o painel só com o teclado, com o foco visível passando pelos botões; (c) o selo de estado com ícone e texto ("Novo", "A caminho"); (d) Ajustes do app, chave "Reduzir movimento" ligada, e o alerta novo sem pulso. | Contraste: o teste automático está em `shared/src/__tests__/tokens.test.ts` (não citar número de razão sem abrir o teste). A rodada de acessibilidade da F3 foi rodada: teclado (604 passos), axe, texto a 200%, três tamanhos e cartão do balcão sem rede. Mostrar só isso. **Leitor de tela não foi testado com TalkBack, VoiceOver nem NVDA: no vídeo, não afirmar que foi.** Não pôr "rótulos para leitor de tela" na fala. O item (b), do painel só com o teclado, fica: foi testado. |
| 11 | 2:21 a 2:39 | ⬜ PREENCHER | "A lei paulista 17.621, de 2023, permite outros mecanismos de comunicação entre a mulher e o estabelecimento, e o nosso QR code se encaixa aí. Contribui para o ODS 5, meta 5.2, e o ODS 11, meta 11.7: bares mais seguros para as mulheres." | Duas cartelas: (1) "Lei estadual (SP) 17.621/2023, art. 2º, §2º: outros mecanismos de comunicação entre a mulher e o estabelecimento" com o link; (2) "ODS 5, meta 5.2" e "ODS 11, meta 11.7" com o texto oficial da meta e o link. | Fontes na seção "Fontes das afirmações". **Honestidade nas cartelas**: a meta 5.2 fala em esferas públicas e privadas; a 11.7 fala em espaços públicos, e bar é espaço privado de uso público, então a ligação é por analogia (dizer isso no PDF, não precisa na fala). O ODS 11 é o único dos dois que está entre os mostrados no briefing. Não citar "Procon exige relatório", "bar é obrigado pela lei federal 14.786" nem "registro que a lei pede": as três afirmações foram corrigidas. |
| 12 | 2:39 a 2:47 | ⬜ PREENCHER | "Mariana: pedir ajuda sem dar na vista, e a equipe vai até você. Repositório e site na descrição." | Logo, o nome do grupo e os links na tela (endereço do site: https://naoenao.obrian.me; repositório: https://github.com/BrianTKK/nao-e-nao-na-mao). Nomes dos integrantes: ⬜ PREENCHER. | O repositório é público desde 18/11/2026; a descrição do vídeo deve ter os dois links no ar. |

## Onde cada coisa aparece (para o editor)

| Item | Cena | Texto real na interface |
| --- | --- | --- |
| Opções da mulher | 4 | "Estou me sentindo insegura", "Quero sair daqui com segurança", "Quero falar com alguém da equipe" |
| Etapas na página dela | 4, 5, 7 | "Pedido enviado à equipe", "A equipe viu o seu pedido", "Alguém está indo até você", "Pedido encerrado"; linha: "Pedido enviado", "A equipe viu", "A caminho", "Encerrado" |
| Palavra | 4, 5, 7 | "Sua palavra-código:" (web); "Diga esta palavra a ela" (app); "Palavra" (painel) |
| Estados | 4 a 7 | "Novo", "Visto", "A caminho", "Resolvido", "Cancelado" |
| App, lista | 4 | "1 alerta em aberto" |
| App, ações | 5, 7 | "Estou indo", "Encerrar…" |
| Desfecho mostrado | 7 | "Acompanhei até um lugar seguro ou até o carro" |
| Painel, quem | 5, 6 | "Visto; ninguém foi mandado ainda" (antes do toque) e "Diego está indo até ela" (depois) |
| Ajustes do app | 5, 10 | "Como você está vestido hoje?", "Reduzir movimento", "Testar o alarme" |
| Modo avião | 8 | "Sem sinal: vai enviar quando voltar" e "A caminho, ainda não enviado" (F3) |

## Os quatro movimentos que o vídeo aponta (função em uma frase)

1. **Pulso do alerta novo (app e painel):** chama a atenção de quem anda pelo salão até alguém ver; com "Reduzir movimento", não pulsa.
2. **Mudança de estado no detalhe do alerta (app):** confirma que o toque valeu e mostra o que mudou: três trechos enchem, a linha do estado entra subindo e há um toque háptico (F3; tudo desligado com "Reduzir movimento").
3. **Cartão que acende no painel:** mostra à gerência o que acabou de mudar, sem ter de reler o quadro.
4. **Linha do tempo calma na página dela:** só o passo atual faz um carimbo; a tela não chama a atenção de quem está ao redor dela.

## Antes de gravar (lista de preparação)

**Contas e dados (todas do bar de demonstração, fictício; nenhuma serve para nada real)**
- [ ] Equipe: conta do Diego. No app, tocar em "Preencher com a conta de teste do Diego" e "Entrar". Não digitar nem mostrar senha na tela: o botão preenche.
- [ ] Gerência: conta da Marta. No `/painel`, tocar em "Preencher com a conta de teste da gerente". Mesma regra: sem mostrar senha.
- [ ] Nos Ajustes do app (Diego), em "Como você está vestido hoje?", escrever "camisa preta" e tocar em "Salvar". Sem isso a página dela diz só "Diego está indo até você".
- [ ] O bar de demonstração volta ao estado inicial todo dia às 06:00 (Brasília). Gravar depois desse horário e não deixar a tomada atravessar o reinício.
- [ ] Limite de pedidos: 3 por local e 10 por bar a cada minuto, e 6 por minuto por IP. Nos ensaios, esperar 1 minuto entre pedidos do mesmo QR; na tomada valendo, não criar mais de 2.
- [ ] Antes de cada tomada, a página dela precisa estar limpa: se sobrou um pedido ativo no mesmo QR, a página volta direto ao acompanhamento. Encerrar o anterior (botão "Fazer um novo pedido") ou abrir uma aba anônima.

**Aparelhos**
- [ ] Celular dela: o link da página do QR aberto no navegador (sem instalar nada: faz parte da prova). Preferir o cartaz impresso de `/painel/qr-codes/imprimir` para a cena de "ler o QR code".
- [ ] Celular da equipe: APK próprio para o push. O link público (`/testar`) entrega o `versionCode` 4, com a F3, desde 18/11/2026 (instalado e com o alarme testado num celular em 18/11/2026); instalar por cima do anterior antes das cenas 5 e 8; com o app aberto, em primeiro plano, durante a tomada. Expo Go serve como reserva, mas o alarme com app fechado só vale no APK.
- [ ] Computador: `/painel` aberto, logado como gerência, com o som ligado (o painel bipa).
- [ ] Câmera num tripé que enquadre os três aparelhos de uma vez, ou três gravações de tela iniciadas juntas com uma batida de palma (sincronia), a escolher: ⬜ PREENCHER.
- [ ] Som do alarme: um microfone ou a câmera perto do celular da equipe. **NÃO CONFIRMADO** que o gravador de tela do Android capture o som do alarme; testar antes.
- [ ] Alarme no celular de verdade: o alarme foi testado num celular em 18/11/2026, com o app fechado e a tela bloqueada. No celular da gravação, rodar "Testar o alarme" nos Ajustes e um alerta completo antes do dia da gravação. Permitir o "Não perturbe" no canal "Alertas (alarme)" e deixar o volume de alarme alto.
- [ ] Notificações, brilho e "Não perturbe" do celular de gravação: desligar o que não é da cena (mensagens pessoais).

**O que deixar aberto**
- [ ] Celular dela: página do QR `/q/ESQBF7K2`.
- [ ] Celular da equipe: lista "Alertas", sem alerta ativo.
- [ ] Computador: `/painel`, quadro ao vivo.
- [ ] Outra aba: `/painel/qr-codes/imprimir`, para mostrar o cartaz.

**Modo avião sem perder a tomada (cena 8, tomada à parte)**
- [ ] Preparar o celular da equipe com um alerta novo aberto, ainda com sinal.
- [ ] Gravar a tela do próprio celular da equipe com o gravador do sistema (grava local, não depende de rede) **ou** filmar o aparelho com outra câmera. O modo avião não interrompe gravação local.
- [ ] Ligar e desligar o modo avião pelo painel rápido do Android, sem sair do app; deve aparecer o ícone do avião na barra de status. O Wi-Fi costuma voltar sozinho ao desligar o avião (**NÃO CONFIRMADO** no aparelho de vocês; ensaiar).
- [ ] Só o celular da equipe fica sem sinal. O celular dela e o painel ficam com sinal para mostrar a página mudando quando o toque é enviado.
- [ ] Duração: uns 5 s sem sinal bastam. Mais que isso gasta o tempo da cena.

**Ensaio**
- [ ] Ler cada fala em voz alta com o relógio. Se uma fala passar do tempo, cortar palavra, não acelerar.
- [ ] Ensaiar a tomada única (cenas 3 a 7) até caber em 1 min 5 s.

## Plano B se o alarme não tocar na hora

1. **Antes de gravar:** abrir Ajustes e tocar em "Testar o alarme". Se não tocar, abrir as configurações do canal "Alertas (alarme)" e conferir volume de alarme, "Não perturbe" e permissão de notificações.
2. **Durante a tomada, se o som falhar mas o alerta aparecer:** seguir sem parar. O alerta novo ainda pulsa na lista do app, e o painel também bipa. Dizer a fala mesmo assim ("o alarme toca" vira "o alerta novo pulsa e chama a atenção da equipe").
3. **Se o alerta não aparecer no app:** o app vê a lista em tempo real; abrir o app de novo e puxar a lista. Se continuar, usar "Simular um alerta" (rodapé da lista, aparece só no modo de demonstração) para criar o alerta no mesmo bar. A cena 4 perde a prova de que a página dela chegou ao app; refazer a tomada assim que o app voltar.
4. **Se a página dela não atualizar:** ela consulta o servidor a cada 3 segundos quando o WebSocket cai; esperar uns 3 s antes de refazer.
5. **Edição:** gravar o som do alarme à parte (de perto, com o microfone) e encaixar na pós-produção, sobre a imagem real do alerta. Se editarem, avisem na descrição que o som foi acrescentado.
6. **Último recurso:** refazer a tomada, e, se o limite de pedidos travar, esperar 1 minuto.

## Fontes das afirmações (todas conferidas em 18/11/2026)

| Afirmação no vídeo | Texto seguro | Fonte |
| --- | --- | --- |
| 11,3% das mulheres, abordagem agressiva numa festa (cena 1) | Pesquisa nacional de 10 a 14/02/2025 (2.007 entrevistas, 126 municípios). O item de festa vem do módulo de autopreenchimento, aplicado só às mulheres: 1.040 mulheres, das quais 793 respondentes, com margem de erro de 3,0 pontos. Ao menos 5,7 milhões de mulheres (a projeção usa o valor mínimo da margem de erro). Período da pergunta: o infográfico agrupa o item em "Foi vítima de assédio no último ano"; a fala não precisa citar período. Não é número de bar nem de São Paulo. | https://forumseguranca.org.br/wp-content/uploads/2025/03/visiveleinvisivel-2025-infografico.pdf |
| Lei paulista 17.621/2023 permite outros mecanismos de comunicação (cena 11) | Art. 2º, §2º: "outros mecanismos que viabilizem a efetiva comunicação entre a mulher e o estabelecimento". A frase "o nosso QR code se encaixa aí" é leitura do grupo, não do texto da lei. | https://www.al.sp.gov.br/repositorio/legislacao/lei/2023/lei-17621-03.02.2023.html |
| ODS 5, meta 5.2 (cena 11) | "Eliminar todas as formas de violência contra todas as mulheres e meninas nas esferas públicas e privadas, incluindo o tráfico e exploração sexual e de outros tipos" | https://brasil.un.org/pt-br/sdgs/5 e https://sdgs.un.org/goals/goal5 |
| ODS 11, meta 11.7 (cena 11) | "Até 2030, proporcionar o acesso universal a espaços públicos seguros, inclusivos, acessíveis e verdes, particularmente para as mulheres e crianças, pessoas idosas e pessoas com deficiência" | https://brasil.un.org/pt-br/sdgs/11 e https://sdgs.un.org/goals/goal11 |

## O que ficou de fora de propósito, e por quê

- **Lei 14.786/2023 e Lei 14.245/2021 (Mariana Ferrer):** a de 2023 obriga casas noturnas, boates, espetáculos musicais em locais fechados e shows, com venda de bebida alcoólica, não "bares". Só o PDF cabe nelas, com a correção.
- **"O Procon exige o relatório do mês":** NÃO CONFIRMADO. Nenhuma norma pede esse relatório. Se o painel aparecer, dizer só "relatório do mês".
- **37,5% das mulheres sofreram violência:** o mesmo infográfico mostra o local da violência mais grave que cada mulher sofreu (um local por mulher, não o total de casos), e só 3,3% foi em bar ou balada; sem essa ressalva o número engana. Fora.
- **ODS 16 e meta 5.b:** conferidos, mas não cabem em uma frase de 5 segundos; ficam para o PDF.
- **Mariana Ferrer e a origem do nome:** a história precisa da correção "beach club" e de fonte para qualquer adjetivo; deixar para o PDF.

## O que ficou sem confirmar (resumo)

1. O som do alarme sendo captado na gravação (o alarme em si tocou num celular em 18/11/2026).
2. Fila sem sinal e motion no celular real: testados só no app aberto no navegador.
3. Leitor de tela: não foi testado com TalkBack, VoiceOver nem NVDA; no vídeo, não afirmar que foi.
4. Quem fala, onde grava, posição das telas, endereço do repositório público e nomes: ⬜ PREENCHER.
