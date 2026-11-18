# Notificações tipo alarme

Pedido do Brian (16/11/2026): "Habilitar notificações no app android e IOS, de preferencia aquelas notificações semelhantes a alarme".

O app roda de dois jeitos:

- no **Expo Go (SDK 58)**, que só faz o que o Expo Go deixa fazer: o alarme chega com o app aberto ou em segundo plano recente;
- desde 17/11/2026, no **app próprio do Android (APK)**, com **push remoto pelo Firebase (FCM)**: o alarme chega com o app minimizado ou fechado. Ver a seção "App próprio (APK) com push remoto".

## O que já funciona no Expo Go (implementado)

| O quê | Android | iOS | Onde |
| --- | --- | --- | --- |
| Notificação local na hora em que o alerta chega | ✅ | ✅ | `mobile/src/notifications/alarm.ts` |
| Canal de prioridade máxima (`alerts-alarm`) com o som tocando no volume de **alarme** (`AndroidAudioUsage.ALARM`), vibração longa e aviso na tela bloqueada | ✅ | não se aplica | idem |
| Passar pelo "Não perturbe" (`bypassDnd`) | ✅ só se a pessoa permitir, no canal "Alertas (alarme)" das notificações do Expo Go | não | idem |
| Nível "time sensitive" (`interruptionLevel`) | não se aplica | 🟡 pedido; o iOS só respeita com o direito no app, então no Expo Go provavelmente vira notificação comum com som | idem |
| **Repete como despertador**: mais 5 toques agendados no sistema (20, 40, 60, 90 e 120 s), cancelados assim que alguém vê o alerta | ✅ | ✅ | idem |
| Vibração contínua com o app aberto enquanto houver alerta que ninguém viu | ✅ | 🟡 o iOS ignora as durações do padrão (pulsos fixos de cerca de 0,4 s) | idem |
| Tocar na notificação abre o alerta | ✅ | ✅ | `mobile/src/app/_layout.tsx` |
| Botão "Testar o alarme" nos Ajustes | ✅ | ✅ | `mobile/src/app/settings.tsx` |
| **Painel web**: bipe a cada 2,5 s enquanto houver alerta que ninguém viu, aviso do navegador e anúncio para leitor de tela | ✅ | ✅ | `web/src/pages/panel/useWebAlarm.ts` |

A palavra-código **não vai na notificação**, porque ela aparece na tela bloqueada e é o que prova a ela que a pessoa é da equipe.

**Limite que continua**: o alerta chega por WebSocket. Com o app fechado (ou o iPhone suspenso em segundo plano), nada chega, porque acordar o celular fechado precisa de **push remoto**, e o Expo Go do Android não tem push desde a SDK 53 (o próprio `expo-notifications` lança erro, em `warnOfExpoGoPushUsage.ts`). As repetições já agendadas tocam mesmo com o app fechado, mas o primeiro aviso só chega com o app aberto ou em segundo plano recente.

## App próprio (APK) com push remoto

Pedido da Central (17/11/2026), depois do teste do Brian em 16/11 no Android pelo Expo Go: com o app aberto, o celular vibrava; minimizado, nenhum aviso chegava.

### Como funciona

- **Envio direto ao FCM HTTP v1**, da VPS, sem o serviço de push da Expo e sem conta Expo (`server/src/push.ts`). O servidor assina um JWT com a conta de serviço do Firebase, troca por um token de acesso OAuth (vale 1 h e é reaproveitado) e chama `projects/<projeto>/messages:send`.
- **Quem recebe**:
  - alerta novo: toda a equipe ativa do bar;
  - alerta designado pela gerência: só a pessoa escolhida, até ela tocar em "Estou indo".
- **Repetição no servidor**: 20, 40, 60, 90 e 120 s depois do primeiro aviso. Antes de cada repetição o servidor confere no banco, e o "Vi o alerta" (ou o "Estou indo", no designado) cancela.
- **Token inválido** é apagado do banco:
  - 404 ou `UNREGISTERED`: app desinstalado ou dados apagados;
  - 403 `SENDER_ID_MISMATCH`: token de outro projeto do Firebase;
  - 400 que fala do token (não é um token do FCM).

  Erro passageiro (500, rede) e 400 de mensagem malformada não apagam.
- **O ciclo de um toque**: depois da última repetição, o toque não recomeça por qualquer mudança no alerta (um "vi" de outra pessoa, por exemplo). Uma nova designação da mesma pessoa toca de novo. Antes de cada envio, o servidor confere se o toque ainda vale, para não mandar "Ninguém viu ainda" depois que alguém viu.
- **Tokens**: tabela `push_tokens` (migração 007).
  - O app registra o token ao entrar e a cada abertura com login (`PUT /api/me/push-token`) e remove ao sair (`DELETE /api/me/push-token`). Sem rede na abertura, ele tenta de novo quando a pessoa volta ao app.
  - O token é do aparelho: se outra pessoa entrar no mesmo celular, ele passa para ela. No máximo 5 aparelhos por pessoa.
  - **O token vence junto com o login** (`expires_at`, tirado do token de login). Quem teve a sessão vencida sem tocar em "Sair" não fica recebendo, na tela bloqueada, os alertas do bar.
  - Quem é desativada pela gerência deixa de receber na hora.
  - A resposta do `PUT` diz se o servidor manda push (`pushEnabled`). **Só com `true` o app deixa as repetições para o servidor.** Com o servidor sem a chave, o app repete sozinho, como no Expo Go.
- **A mensagem é só de dados** (sem o bloco `notification`), com `android.priority: high` e `ttl: 120s`. Os campos são os que o `expo-notifications` 58.1.9 lê (`NotificationData.kt` e `FirebaseMessagingDelegate.kt`, conferidos no código):
  - `title` e `message`;
  - `body`, um JSON com o `alertId`, para abrir o alerta ao tocar;
  - `channelId`: `alerts-alarm-v2`;
  - `tag`: o id do alerta. Vira o identificador da notificação, e a repetição substitui a anterior em vez de empilhar;
  - `sound`, `vibrate` e `color`.

  Com o bloco `notification`, o Android mostraria o aviso sozinho com o app em segundo plano, e o JavaScript não teria como evitar o aviso em dobro com o app aberto.
- **Sem aviso em dobro**:
  - com o app aberto, o `expo-notifications` não mostra a mensagem só de dados, e o aviso vem do próprio app, pelo WebSocket, como antes;
  - o primeiro aviso local usa o id do alerta como identificador, o mesmo `tag` do push, então um substitui o outro;
  - com o push ativo, o app não agenda as repetições locais, porque o servidor já repete.
- **Ao abrir o app**, ele tira da bandeja os avisos de alertas que alguém já viu. O push não apaga sozinho o aviso dos outros celulares.
- **A palavra-código nunca vai na mensagem.** Há um teste que confere isso.
- **Ícone e cor da notificação** (desde o visual novo, 17/11/2026, `versionCode` 2): o ícone pequeno é a silhueta do símbolo B2 (`mobile/assets/notification-icon.png`, 96x96, branco com transparência, porque o Android pinta de branco o que não é transparente), e a cor é o latão `#FFB840` (plugin `expo-notifications` no `app.json`, `lightColor` do canal e `color` da mensagem do servidor). Antes era rosa (`#FF7EAD`). A cor da mensagem do servidor só muda na VPS com o próximo deploy.
- **Som próprio**: `mobile/assets/sounds/mariana_alarme.wav`, de 2,9 s, com dois tons alternados.
  - Foi sintetizado no projeto, sem amostra de terceiros, por `mobile/scripts/make-alarm-sound.py`.
  - Entra no APK pelo plugin `expo-notifications` (`sounds`).
  - O canal do app próprio é novo (`alerts-alarm-v2`), porque o Android não deixa mudar o som de um canal que já existe. **Se o som mudar, o canal precisa de outro id** (`shared/src/alarm.ts`).
  - O Expo Go continua no canal `alerts-alarm`, com o som padrão.
- **iOS**: fora desta fatia. O push no iPhone exige APNs, com a conta Apple Developer paga.

### Variáveis e onde ficam as chaves

| O quê | Onde | Observação |
| --- | --- | --- |
| Conta de serviço do Firebase (chave privada) | PC: `D:\segredos\mariana\fcm-service-account.json`. VPS: `/etc/naoenao/fcm-service-account.json`, montada só leitura no contêiner | `FCM_SERVICE_ACCOUNT_FILE=/run/secrets/naoenao/fcm-service-account.json` no `.env` da VPS (ver `docs/DEPLOY.md`). Sem ela, o push fica desligado, com um aviso no log |
| `google-services.json` (configuração do app no Firebase, pacote `me.obrian.mariana`) | PC: `D:\segredos\mariana\google-services.json` | O `build-apk.sh` aponta para ele por `MARIANA_GOOGLE_SERVICES_FILE`, lida pelo `mobile/app.config.js`, sem copiar para a pasta do projeto. O prebuild o põe em `mobile/android/app/`, fora do git. Sem ele (ou com `MARIANA_SEM_FIREBASE=1`), o APK sai sem push |
| Chave de assinatura do APK | PC: `D:\segredos\mariana\mariana-release.keystore`, com as senhas em `mariana-release.properties` ao lado | Gerada no PC em 17/11/2026 (RSA 4096, alias `mariana`). **Sem ela, não dá para atualizar o app já instalado por cima**: o Android exige a mesma assinatura. Vale ter uma cópia fora do PC, num lugar seguro e nunca no git |

### Gerar o APK no PC

```bash
bash mobile/scripts/build-apk.sh
```

- As ferramentas ficam no D:, porque o C: tem pouco espaço: JDK 17 (Temurin, da Adoptium) em `D:\Android\jdk-17`, Android SDK em `D:\Android\sdk` e o cache do Gradle em `D:\Android\gradle`.
- A pasta `mobile/android/` é gerada pelo `expo prebuild` e fica fora do git. A assinatura release entra pelo plugin `mobile/plugins/withReleaseSigning.js`, que lê o `.properties` apontado por `MARIANA_KEYSTORE_PROPERTIES`.
- O APK sai em `D:\Android\apk\mariana-<versão>-<commit>.apk`, só com ARM (`armeabi-v7a` e `arm64-v8a`, os celulares de verdade). `MARIANA_ARCHS` muda isso; com x86, o APK quase dobra.
- **Caminho longo no Windows**: o `ninja` do CMake 3.22 não passa de 260 caracteres, e um arquivo de objeto do `react-native-gesture-handler` chegou a 354. O plugin `mobile/plugins/withShortObjectPaths.js` resolve sem mexer no registro do Windows:
  - `CMAKE_OBJECT_PATH_MAX=250` faz o CMake encurtar com um hash;
  - `MARIANA_CXX_DIR` (`D:\Android\cxx`) tira o build nativo de dentro do projeto.
- O primeiro build leva uns 25 min, porque baixa o Gradle, as dependências, o SDK 37 e o CMake e compila o código nativo. Os seguintes usam o cache em `D:\Android\gradle`.
- **Espaço no C:**: o build deixa uns 7 GB no C: (`mobile/android/` e as pastas `android/build` e `.cxx` das bibliotecas em `node_modules`). Por isso o script apaga tudo no fim; o próximo build compila o nativo de novo (uns 10 min a mais). `MARIANA_KEEP_BUILD=1` mantém.
- Para instalar, baixar em https://naoenao.obrian.me/download/mariana.apk (ou pelo botão da página `/testar`) e abrir, permitindo "instalar apps desconhecidos". Depois:
  - entrar com a conta;
  - aceitar as notificações;
  - nos ajustes do canal "Alertas (alarme)", permitir passar pelo "Não perturbe".

### Teste de ponta a ponta, antes do deploy

Sugestão da Central (17/11/2026). Prova a entrega do Firebase sem depender da VPS:

1. Instalar o APK e entrar com uma conta da **gerência**.
2. Em **Ajustes → Teste do push**, compartilhar o token do aparelho com o PC. O token aparece mesmo antes do deploy, quando o servidor no ar ainda não aceita registrá-lo.
3. Fechar o app (tirar dos recentes) e bloquear a tela.
4. No PC:

   ```bash
   npm run push:test -w server -- <token-do-aparelho> --repetir
   ```

   O script manda a mesma mensagem de um alerta, com as 5 repetições e o mesmo `tag`. Ele lê a chave de `FCM_SERVICE_ACCOUNT_FILE`, por padrão `D:/segredos/mariana/fcm-service-account.json`, e só mostra o resultado de cada envio.
5. **Passou** se:
   - tocou como alarme, com o som da Mariana e a vibração longa, com o app fechado;
   - cada repetição substituiu a anterior na bandeja, em vez de empilhar;
   - tocar no aviso abriu o app.

### Testado e não testado (17/11/2026)

- **Testado no PC**:
  - 14 testes novos do servidor com o FCM simulado (`server/test/push.test.ts`):
    - registro e remoção do token, e o token que passa a outra pessoa;
    - a equipe do bar recebe e o outro bar não;
    - canal, `tag` e `alertId` na mensagem, e a palavra-código fora dela;
    - a repetição, o "vi" que cancela e a parada depois da última repetição;
    - o designado, que recebe até o "Estou indo";
    - o token `UNREGISTERED`, o de outro projeto e o malformado apagados, e o erro passageiro mantido;
    - o token com o login vencido, que deixa de receber;
    - o ciclo terminado, que não recomeça com o "vi" de outra pessoa, e a nova designação, que toca;
    - o servidor sem a chave, que responde `pushEnabled: false`;
    - a pessoa desativada, que deixa de receber;
    - o OAuth (JWT RS256 conferido com a chave pública) e o token de acesso reaproveitado;
    - sem a conta de serviço, o push desliga sem a chave no log;
  - todos os testes do repositório passam (100: 20 do shared, 13 do banco, 60 do servidor e 7 do deploy), e o typecheck dos quatro pacotes também;
  - uma revisão sobre o diff, com cada achado verificado por um segundo leitor. Ela achou 7 defeitos reais, todos corrigidos. Um oitavo foi refutado: "com o app aberto, o push toca de novo". No `expo-notifications` 58.1.9, o `NotificationsHandler` não mostra mensagem só de dados com o app aberto;
  - **com o Google de verdade**, usando a conta de serviço de `D:\segredos\mariana`:
    - o OAuth devolveu o token de acesso (200);
    - um envio `validate_only` a um token falso foi aceito na autenticação e recusado só pelo token (400 `INVALID_ARGUMENT`). A API do FCM está ligada e a conta tem permissão;
  - o `google-services.json` é do mesmo projeto (`mariana-c86f0`) e do pacote `me.obrian.mariana`;
  - o bundle Android compila (`expo export`);
  - o `expo prebuild` gera o `android/` com o som em `res/raw`, o `google-services.json` e a assinatura release;
  - o Gradle 9.4.1 baixou e configurou o projeto;
  - o `push:test` do PC chegou ao FCM de verdade: com um token falso, a resposta foi 400, a recusa do token.
- **Licença do Android SDK**: aceita pela Central em 17/11/2026, com o ok do Brian dado na Central ("Sim, aceitar"). Depois disso, o Gradle baixou sozinho o SDK 37, o build-tools e o CMake.
- **APK gerado e conferido** (17/11/2026):
  - assinado pela chave da Mariana (`CN=Mariana, O=GS CitizenTech`, `apksigner verify`);
  - pacote `me.obrian.mariana`, versão 1.0.0 (código 1), alvo Android 16 (SDK 36), mínimo Android 7 (SDK 24);
  - com as permissões `POST_NOTIFICATIONS`, `c2dm RECEIVE` (FCM), `VIBRATE` e `WAKE_LOCK`;
  - com o Firebase (`google_app_id` e `project_id`) e o som `raw/mariana_alarme`, de 129.686 bytes, igual ao arquivo do repositório.
- **Teste de ponta a ponta sem a VPS e sem celular**, feito no PC:
  - `npm run push:test -w server -- --validar`: o FCM de verdade validou (`validate_only`) as três mensagens que o servidor manda, o alerta novo, a repetição e o designado, e aceitou as três;
  - o servidor rodando no PC com a chave de verdade e o banco em memória:
    - o login de teste do seed;
    - o registro de um token, que respondeu `pushEnabled: true`;
    - um alerta novo, que o servidor mandou ao FCM de verdade;
    - o FCM recusou o token falso (sem celular não há token de verdade), e o servidor o apagou sozinho ("1 token(s) inválido(s) apagado(s)").
- **Emulador Android**: não deu. A virtualização está desligada no firmware (BIOS) deste PC ("Virtualização Habilitada no Firmware: Não", no `systeminfo`), e o emulador precisa dela. Ligar é mudança de BIOS, coisa do Brian, se ele quiser.
- **Publicado na VPS** (17/11/2026, pela Central, com o ok do Brian: "Sim, publicar"):
  - deploy de `31ad9bf`, com a migração 007 aplicada;
  - a chave da conta de serviço em `/etc/naoenao`, com dono `root:naoenao-segredos` e modo 640, e o `FCM_SERVICE_ACCOUNT_FILE` no `.env`;
  - o log do app diz "Push remoto ligado (FCM, projeto mariana-c86f0)";
  - o APK pode ser baixado em https://naoenao.obrian.me/download/mariana.apk (ver `docs/DEPLOY.md`, "APK para baixar") e pelo botão da página `/testar`.
- **Testado num celular em 18/11/2026**, com o APK `versionCode` 4 baixado pelo link: app fechado, tela bloqueada, alerta criado pelo QR code e toque na notificação, que abre o alerta e marca "Visto". Nas palavras de quem testou: "Deu certo o alarme". É o primeiro push saindo da VPS até um aparelho de verdade.
- **Não testado**:
  - no celular, um a um: o aviso com o app só minimizado, a repetição na tela bloqueada, o "Não perturbe" e o aviso que não sai em dobro;
  - celulares que matam apps em segundo plano (Xiaomi, Samsung com economia de bateria): neles, o push pode atrasar se o app não estiver liberado da otimização de bateria.

## O que exige build próprio (fora do APK atual, nenhuma conta criada)

| O quê | Para quê | Custo e o que pede |
| --- | --- | --- |
| ~~Push remoto no Android~~ | Feito em 17/11/2026 (FCM direto, APK gerado no PC) | Ver "App próprio (APK) com push remoto" |
| ~~Som de alarme próprio~~ | Feito em 17/11/2026 | idem |
| Push remoto no iOS (APNs) | Acordar o iPhone com o app fechado | Conta Apple Developer (US$ 99 por ano) e build pelo Xcode ou EAS |
| Tela cheia por cima da tela bloqueada (`USE_FULL_SCREEN_INTENT`) | Comportamento de despertador de verdade no Android | Build próprio. Desde o Android 14, a Play Store só libera essa permissão para apps de alarme e chamada; fora da loja (APK direto), funciona |
| **Critical Alerts** no iOS | Tocar com o iPhone no silencioso e no "Não perturbe" | Conta Apple Developer (US$ 99 por ano) e um pedido de autorização à Apple, que só aprova casos de saúde, segurança pública e parecidos. Não há garantia de aprovação |
| Time Sensitive de verdade no iOS | Furar o "Foco" do iPhone | Conta Apple Developer (US$ 99 por ano) e build próprio, com o direito `time-sensitive` no app (sem pedido especial à Apple) |
| Publicar na Play Store | Instalar sem o Expo Go | Conta Google Play Console: US$ 25, uma vez |

## Testado e não testado (16/11/2026)

- **Testado no PC**:
  - o app compila para Android (`npx expo export --platform android`) com o módulo de alarme;
  - typecheck dos quatro pacotes;
  - no navegador, o alarme do painel: o bipe tocou 2 vezes em 5 s com um alerta aberto, o leitor de tela anunciou "Alerta novo: Mesa 12" e o bipe parou depois do "Vi o alerta";
  - no navegador do app do Claude, o aviso do navegador veio bloqueado, e o painel mostrou o aviso de que o bipe só toca com a aba aberta.
- **Não testado**: nada disso num celular. Falta conferir o som no volume de alarme, a repetição com a tela bloqueada, o "Não perturbe" e o comportamento do iPhone no Expo Go.
