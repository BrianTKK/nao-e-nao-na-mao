# Vídeos da Mariana: gravação automática

Clipes sem voz, para dublar depois ou usar na apresentação. O único som é o do produto: o alarme do app e o bipe do painel, nos instantes em que tocariam. No resto, silêncio total.

O produto roda **local** (servidor, web compilada e app no Expo web). Nada vai à produção: o gravador bloqueia qualquer pedido a `naoenao.obrian.me` e para com erro se a página tentar.

## Clipes

Um clipe por cena de `docs/pdf/Roteiro_Video.md`, mais o da integração. Todos prontos, cada um com a folha de marcação em `marcacao/<clipe>.md` (tempos, o que aparece, o som e a fala sugerida do roteiro).

| Arquivo | Cena | Duração | O que mostra |
| --- | --- | --- | --- |
| `mariana-cena-01.mp4` | 1, Problema | 15,9 s | Cartela: "11,3%", a frase da pesquisa e a fonte |
| `mariana-cena-02.mp4` | 2, Solução | 16,0 s | Cartela: logo e as três partes ligadas por setas |
| `mariana-cena-03.mp4` | 3, Três telas | 11,1 s | As três telas paradas, no estado inicial |
| `mariana-cena-04.mp4` | 4, Pedido e alarme | 17,6 s | O toque dela, a palavra-código, o alarme, o bipe e o pulso |
| `mariana-cena-05.mp4` | 5, Visto e "Estou indo" | 16,5 s | O Diego abre (Visto), toca em "Estou indo"; a página dela e o painel mudam |
| `mariana-cena-06.mp4` | 6, Painel | 15,4 s | Painel grande: o cartão passa a "A caminho" e acende; "há 1 min ..." correndo |
| `mariana-cena-07.mp4` | 7, Encerrar | 15,2 s | "Encerrar…", o desfecho, "Pedido encerrado" e o painel vazio |
| `mariana-cena-08.mp4` | 8, Sem sinal | 22,4 s | Só o app sem rede: o toque fica guardado e sai quando a rede volta |
| `mariana-cena-09.mp4` | 9, Design e UX | 20,8 s | A página dela e o detalhe do alerta, com realces; depois o antes e depois do visual |
| `mariana-cena-10.mp4` | 10, Acessibilidade | 40,6 s | Texto a 200%, painel no teclado, selos com ícone e texto, "Reduzir movimento" |
| `mariana-cena-11.mp4` | 11, Lei e ODS | 20,4 s | Duas cartelas: a lei 17.621/2023 e as metas 5.2 e 11.7 |
| `mariana-cena-12.mp4` | 12, Fecho | 11,7 s | Cartela: logo, links e o espaço vazio para os nomes |
| `mariana-integracao.mp4` | 3 a 7 | 46,1 s | As três telas numa tomada só, do pedido ao encerramento |

Todo clipe tem pelo menos o tempo da cena no roteiro (quem edita corta). `clipes.json` lista os clipes (arquivo, cena, duração, resumo e os sons com início e fim em segundos). O gravador atualiza esse arquivo e a folha a cada gravação.

## O que precisa estar instalado

- Node 24 e as dependências do repositório (`npm install` na raiz). O Playwright e o Chromium dele já vêm com o pacote `web`.
- ffmpeg: o do pacote Python `imageio-ffmpeg`, se existir (ver `lib/env.mjs`), ou o do PATH. Para usar outro: `FFMPEG=<caminho do ffmpeg.exe>`.
- Um disco com espaço: a gravação bruta do clipe da integração ocupa cerca de 170 MB de quadros.

## Portas

| Porta | O quê |
| --- | --- |
| 8150 | Servidor local: API, tempo real, página do QR e painel (a web compilada) |
| 8151 | App da equipe no Expo web |
| 8153 | Palco (aberto e fechado pelo próprio gravador) |

## Como rodar

Três terminais no Git Bash, na raiz do repositório.

1. Web compilada e servidor local, com o bar de demonstração:
   ```bash
   npm run build -w web
   cd server && PORT=8150 PGLITE_DIR=memory SEED_DEMO=1 CORS_ORIGINS=http://localhost:8151 npx tsx src/index.ts
   ```
2. App da equipe, sem os atalhos de demonstração ("Simular um alerta"), para a tela ficar como a de um bar de verdade:
   ```bash
   cd mobile && EXPO_PUBLIC_API_URL=http://localhost:8150 EXPO_PUBLIC_SHOW_DEMO=0 npx expo start --web --port 8151
   ```
   O primeiro pacote leva uns 10 s para compilar.
3. Gravar:
   ```bash
   node docs/video/gravar.mjs todos                   # todos os clipes de clips/, um depois do outro
   node docs/video/gravar.mjs mariana-cena-01         # um clipe (nome do arquivo em clips/, sem .mjs)
   node docs/video/gravar.mjs mariana-cena-02
   node docs/video/gravar.mjs mariana-cena-03
   node docs/video/gravar.mjs mariana-cena-04
   node docs/video/gravar.mjs mariana-cena-05
   node docs/video/gravar.mjs mariana-cena-06         # espera 1 min 33 s antes de gravar (o tempo do cartão)
   node docs/video/gravar.mjs mariana-cena-07
   node docs/video/gravar.mjs mariana-cena-08
   node docs/video/gravar.mjs mariana-cena-09
   node docs/video/gravar.mjs mariana-cena-10
   node docs/video/gravar.mjs mariana-cena-11
   node docs/video/gravar.mjs mariana-cena-12
   node docs/video/gravar.mjs mariana-integracao
   node docs/video/gravar.mjs <clipe> --previa        # só monta o palco e salva uma captura, sem gravar
   node docs/video/gravar.mjs <clipe> --remontar      # refaz o MP4 a partir da última gravação bruta
   node docs/video/gravar.mjs <clipe> --folha         # refaz só a folha de marcação e o clipes.json
   ```
4. Conferir um clipe pronto (formato, quadros, pico real, silêncio e quadros extraídos nos instantes dados):
   ```bash
   node docs/video/conferir.mjs mariana-cena-04 3.6 9 17.5
   ```

Um clipe de 46 s leva cerca de 1 min para gravar e 1 min para montar. Rode um de cada vez: o PC fica mais livre, e os tempos ficam mais limpos. As cenas 4 a 10 criam pedidos, um ou dois por clipe, em locais diferentes quando podem. O limite do servidor é de 3 pedidos por local e 6 por IP a cada minuto. Os clipes foram gravados um a um; o `todos` em sequência não foi rodado.

## Onde saem os arquivos

Tudo fora do git, em `D:\Video\Mariana` (ou em `VIDEO_OUT=<pasta>`):

| Pasta | O quê |
| --- | --- |
| `final\<clipe>.mp4` | O clipe final |
| `final\<clipe>.sons.json` | Os sons do clipe (início e fim em ms), o ganho aplicado e o pico real medido |
| `bruto\<clipe>\quadros\` e `registro.json` | Os quadros JPEG da captura e o registro (carimbos, marcas, sons) |
| `trabalho\<clipe>\` | A trilha de áudio, a lista de quadros do ffmpeg, a prévia e os quadros de conferência |
| `trabalho\sessoes.json` | Os tokens das contas de demonstração (valem enquanto o servidor local estiver no ar) |

## Formato final

MP4, 1920x1080, 30 fps constantes, H.264 High yuv420p (libx264, CRF 18, BT.709, com a cor marcada no arquivo), `+faststart`. Áudio AAC 48 kHz estéreo, 192 kb/s.

Ganho da trilha fixo em +4,5 dB (`TRACK_GAIN_DB` em `lib/compose.mjs`), o mesmo em todos os clipes: o alarme e o bipe têm o mesmo volume em qualquer clipe. O trecho mais alto (alarme e bipe juntos) fica em cerca de -1,5 dBTP; o bipe sozinho, em -7,7 dBTP. Se o AAC passar do teto de -1 dBTP, o gravador refaz com menos ganho.

## Como funciona

### Palco (`lib/stage.mjs`)

Uma página de 1920x1080 com as telas do produto em iframes, cada uma numa moldura: celular (tela de 390x844) ou janela de computador. Cada tela tem um rótulo pequeno em cima. O fundo usa as cores de `shared/src/tokens.ts`, lidas do arquivo. Layouts prontos (`layout(preset, panes)`):

- `trio`: página dela, app da equipe e painel, lado a lado;
- `pair`: dois celulares;
- `phone`: um celular no centro;
- `desktop`: o painel grande (tela de 1600x860);
- `card`: cartela de texto em tela cheia, com as classes `card-big` (número grande em latão), `card-title`, `card-text` e `card-small` (fonte). As cartelas das cenas 1, 2, 11 e 12 saem de `lib/cards.mjs` (`cardClip`): cada passo liga uma classe `sN` no body, e o texto com `.in .in-N` entra subindo;
- `custom`: posições dadas pelo clipe (`x`, `y`, `w`, `h`, `kind`), para cenas com mais de um arranjo (a cena 10).

Opções de cada tela: `group` (as telas do mesmo grupo aparecem e somem juntas, com `__stage.showGroup`), `hidden` (começa invisível), `zoom` (a página abre com largura `w / zoom` e é ampliada: `zoom: 2` é o texto a 200%) e `overlay: true` (uma cartela por cima de qualquer preset, como o antes e depois da cena 9).

O palco serve em `/assets/<nome>` o logo (`web/public/brand`) e as imagens do PDF (`docs/pdf/imagens`).

Ajudantes do palco, chamados por `act.stage(nome, ...args)`: `showGroup`, `show(seletor, ligado)`, `setLabel(id, texto)`, `zoom(id, k, x, y)` (aproximação da moldura, com o ponto x, y no centro), `highlight(x, y, w, h)` e `clearHighlights()` (contorno de realce), `go(classe)`.

Só na gravação, e sem mudar o produto:

- os cabeçalhos que impedem iframe (`X-Frame-Options` e `frame-ancestors`) saem das páginas locais, por `context.route`;
- o Chromium abre com `--disable-features=LocalNetworkAccessChecks`. Sem isso, o app (8151) não fala com o servidor (8150) de dentro do iframe;
- as sessões entram direto no `localStorage` de cada origem: a tela de login nunca aparece, e a senha (que o botão de teste mostra) não vai a quadro nenhum. O login é feito pela API, fora da tela (`lib/session.mjs`), com a senha lida de `shared/src/data/demo.ts`;
- no painel, o aviso do navegador (`Notification`) vira um objeto vazio com permissão concedida. Num iframe de outra origem, o Chrome negaria, e o painel mostraria "O navegador bloqueou os avisos deste site". Na operação real, a gerência permite os avisos;
- com `offlineSwitch: true` (cena 8), o `fetch` e o `WebSocket` do app para o servidor local passam por uma chave (`window.__videoNet.set(true | false)` dentro do iframe do app). Ligada, o pedido falha como sem sinal (`TypeError`) e o tempo real cai; a página dela continua com rede. É a forma de cortar a rede de uma tela só: o `context.setOffline` do Playwright corta todas, e o `context.route` não pega o WebSocket.

### Captura (`lib/recorder.mjs`)

O screencast do Chrome (CDP `Page.startScreencast`), em JPEG qualidade 95, quadro a quadro, com o carimbo de tempo de cada um. Não usamos o `recordVideo` do Playwright: ele grava VP8 com taxa baixa, e o texto fica mole. A captura não usa a tela física do PC.

O Chrome só manda quadro quando a imagem muda: cerca de 60 por segundo durante as animações, e nenhum com a tela parada. Na montagem, cada quadro dura até o carimbo do seguinte, e o ffmpeg reamostra para 30 fps constantes.

Há um relógio só: o zero do clipe é o carimbo do primeiro quadro, e `rec.now()` e `rec.clipMs(Date.now())` dão o tempo do clipe em ms. Toques, mudanças de tela e sons usam esse relógio.

### Ajudantes do roteiro (`lib/actions.mjs`)

- `act.pause(ms)`: pausa para a dublagem (padrão: 2 s).
- `act.tap(locator, { tela, evento, pauseMs })`: toque num celular. Faz a pausa (padrão 2 s), mostra o círculo no ponto, aperta, clica de verdade, e o círculo some. Registra a marca.
- `act.click(locator, {...})`: clique no painel. O cursor desenhado anda até o ponto em 0,7 s, faz um anel e clica de verdade.
- `act.cursorShow(x, y)` e `act.cursorMove(x, y, ms)`: cursor visível no painel. O cursor de verdade do Chromium não aparece na captura; este é desenhado no palco.
- `act.when(frame, cond.text | cond.noText | cond.content | cond.noContent | cond.selector | cond.noSelector, valor, { tela, evento })`: espera uma condição dentro de um iframe e devolve o instante em que ela ficou verdadeira. O instante é medido na própria página, a cada quadro, e não na volta ao Node. `text` lê o texto como a tela mostra (com caixa alta, se o CSS puser); `content` lê o texto do documento, sem o efeito do `text-transform`.
- `act.key('Tab', { tela, evento })` e `act.keyHide()`: tecla de verdade, com a tecla desenhada embaixo, no centro do palco.
- `act.mark(tela, evento, ms?, fala?)`: marca livre para a folha. `tap`, `click`, `key` e `when` também aceitam `fala`, que vai para a coluna "Fala sugerida".

Os iframes se pegam por id: `page.frameLocator('#app')` para clicar e `frames.app` para `when`.

### Sons (`lib/sounds.mjs`)

O roteiro só informa quando o alerta apareceu e quando virou "Visto". As regras vêm do código do produto, lido na hora:

- **Alarme do app** (`mobile/src/notifications/alarm.ts` e `mobile/src/hooks/useActiveAlerts.ts`): `alarmEvents(chegou, visto)`. O `mobile/assets/sounds/mariana_alarme.wav` (2,94 s) toca inteiro quando o alerta novo chega. Toca de novo em `ALARM_REPEAT_AT_S` (20, 40, 60, 90 e 120 s) se ninguém viu. Para quando alguém vê, com corte de 5 ms.
- **Bipe do painel** (`web/src/pages/panel/useWebAlarm.ts`): `beepEvents(apareceu, visto)`. Só com "Alarme ligado". São três tons de onda quadrada (880, 660 e 880 Hz), 0,2 s cada, um a cada 0,22 s, com ganho 0,25 e as mesmas rampas exponenciais. O primeiro toca logo que o alerta novo aparece, e os outros a cada `BEEP_EVERY_MS` (2,5 s), enquanto houver alerta novo. O instante certo vem da classe `.panel-alarm-ringing` do botão do alarme, que existe exatamente enquanto o painel bipa.

`renderTrack()` mistura a trilha em 48 kHz estéreo (zeros fora dos sons). `composeClip()` mede o pico real e ajusta o ganho. Se o AAC passar de -1 dBTP, ele refaz com menos ganho.

### Composição (`lib/compose.mjs`)

Quadros, lista `ffconcat` com a duração de cada quadro, `fps=30`, conversão de cor (JPEG full range BT.601 para TV BT.709), libx264 com 4 threads e prioridade baixa, e a trilha em AAC. `inspect()`, `silences()`, `measureTruePeak()` e `extractFrames()` servem para a conferência.

## Escrever um clipe novo

Crie `clips/mariana-cena-NN.mjs`, que exporta `clip`:

```js
export const clip = {
  file: 'mariana-cena-05.mp4',
  summary: 'Uma linha para o manifesto.',
  preset: 'trio',                       // trio | pair | phone | desktop | card
  panes: [{ id: 'ela', url: `${API}/q/ESQBF7K2`, label: 'Página dela, pelo QR code' }, ...],
  sessions: { app: 'diego', panel: 'marta' },  // quem entra em cada tela, sem login na tela
  panelAlarm: true,                     // painel começa com "Alarme ligado"
  async ready({ page, frames }) { ... }, // antes de gravar: esperar telas e preparar o estado
  async run({ page, frames, act }) { ...; return { sounds: [...] }; },
};
```

Tudo o que acontece em `ready()` fica fora do clipe. É ali que entra a preparação: criar o alerta, abrir o detalhe, mudar Ajustes. `before()` (opcional) roda antes de as telas abrirem: a cena 10 cria ali os alertas, para o app abrir com eles já na lista (o app não toca alarme para o que já estava na lista ao abrir).

Outros campos: `scene` (a cena do roteiro), `speech` (a fala do roteiro, para a folha), `notes` (observações da folha) e `offlineSwitch`. Peças comuns dos clipes de produto em `lib/trio.mjs`: as três telas, `waitInitial`, `herRequest` (o pedido dela pela página dela, fora da gravação), `waitSoundGap` (começa a gravar entre dois bipes) e `inClip` (guarda só os sons que ainda tocam depois do zero do clipe).

## Como cada cena foi gravada

Antes de cada tomada, o gravador encerra os alertas abertos do bar. O que cada clipe deixou de fora, e por quê, está nas observações da folha dele.

| Clipe | Como |
| --- | --- |
| `mariana-cena-01.mp4` | `card` (`lib/cards.mjs`): "11,3%", a frase e a fonte, copiadas do roteiro. A imagem do bar ou da equipe que o roteiro prevê depois da cartela entra na edição. |
| `mariana-cena-02.mp4` | `card`: o logo e as três partes, com as setas se desenhando. |
| `mariana-cena-03.mp4` | `trio` parado no estado inicial, sem toque e sem som. |
| `mariana-cena-04.mp4` | `trio`: o toque dela; `alarmEvents` e `beepEvents` até o fim do clipe, porque o alerta continua novo. |
| `mariana-cena-05.mp4` | `trio`. O pedido dela é feito no `ready()`, pela página dela (`herRequest`); a gravação começa entre dois bipes (`waitSoundGap`). Os bipes seguem o relógio do alerta, que começou antes do clipe (`inClip`). |
| `mariana-cena-06.mp4` | `desktop`. O alerta é criado e visto pela API no `ready()`, 1 min 33 s antes de gravar (o tempo do cartão já em "há 1 min ..."); na gravação, o "Estou indo" do Diego (pela API, com a conta dele) faz o cartão acender. O cursor só aponta. |
| `mariana-cena-07.mp4` | `trio`. Pedido, "Visto" e "Estou indo" no `ready()`; na gravação, "Encerrar…" e o desfecho. |
| `mariana-cena-08.mp4` | `pair` com `offlineSwitch`: só o app perde a rede. Sem barra de status nem ícone do avião (o navegador não tem); o rótulo acima do celular diz "App da equipe, sem rede" durante o corte. |
| `mariana-cena-09.mp4` | `pair`: a página dela no início e o detalhe de um alerta da Mesa 12 (criado pela API), com realces; no fim, a cartela do antes e depois (`overlay`). |
| `mariana-cena-10.mp4` | `custom`, em quatro grupos: (a) dois celulares, 100% e 200% (`zoom: 2`); (b) o painel com Tab; (c) aproximação do palco nos selos; (d) o app, Ajustes, "Reduzir movimento". Alarme do painel desligado e alertas criados no `before()`: sem som. |
| `mariana-cena-11.mp4` | `card`: duas cartelas seguidas, com os textos do roteiro (a lei) e o texto oficial das metas. |
| `mariana-cena-12.mp4` | `card`: logo e links. As faixas de y = 410 a 500 px (nome do grupo) e de 720 a 960 px (integrantes) ficam vazias para a edição. |

O que o PC não grava fica para o grupo filmar no celular, e as folhas dizem onde: o alarme com o app fechado e a tela bloqueada (cena 4), o alarme calando no celular (cena 5), o encontro com a palavra dita em voz baixa (cena 7), o ícone do avião na barra de status (cena 8) e a leitura do QR code no cartaz impresso (cena 4).

Cuidados:

- Limite de pedidos de alerta: 3 por local e 10 por bar a cada minuto, e 6 por minuto por IP. Entre duas tomadas no mesmo QR, espere 1 minuto, ou use outro QR (os códigos estão em `shared/src/data/demo.ts`).
- Limite de login: 10 por 5 minutos por IP. Os tokens ficam guardados. Se estourar, reinicie o servidor local: o banco em memória volta ao início, e os tokens antigos deixam de valer sozinhos.
- Sem "Reduzir movimento": o contexto grava com `reducedMotion: 'no-preference'`, e o app começa com a chave desligada. Cada clipe abre um navegador novo: a chave ligada na cena 10 não passa para os outros.
- O som não é gravado do navegador: no Expo web o app não toca o alarme (a função `ring()` sai cedo no navegador), e o bipe do painel não é capturado. A trilha é montada a partir do registro, nos instantes em que as telas mostraram o alerta.
- Depois de gravar: `ffmpeg -i`, quadros extraídos e olhados, `silencedetect=noise=-90dB` e o pico real (`ffmpeg -i <mp4> -vn -af ebur128=peak=true -f null -`).
