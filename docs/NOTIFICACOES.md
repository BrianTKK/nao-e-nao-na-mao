# Notificações tipo alarme

Pedido do Brian (16/11/2026): "Habilitar notificações no app android e IOS, de preferencia aquelas notificações semelhantes a alarme".

O app roda no **Expo Go (SDK 58)**. Por isso ele só faz o que o Expo Go deixa fazer. O resto exige um build próprio do app.

## O que já funciona no Expo Go (implementado)

| O quê | Android | iOS | Onde |
| --- | --- | --- | --- |
| Notificação local na hora em que o alerta chega | ✅ | ✅ | `mobile/src/notifications/alarm.ts` |
| Canal de prioridade máxima (`alerts-alarm`) com o som tocando no volume de **alarme** (`AndroidAudioUsage.ALARM`), vibração longa e aviso na tela bloqueada | ✅ | não se aplica | idem |
| Passar pelo "Não perturbe" (`bypassDnd`) | ✅ só se a pessoa permitir, no canal "Alertas (alarme)" das notificações do Expo Go | não | idem |
| Nível "time sensitive" (`interruptionLevel`) | não se aplica | 🟡 pedido; o iOS só respeita com o direito no app, então no Expo Go provavelmente vira notificação comum com som | idem |
| **Repete como despertador**: mais 5 toques agendados no sistema (20, 40, 60, 90 e 120 s), cancelados assim que alguém vê o alerta | ✅ | ✅ | idem |
| Vibração contínua com o app aberto enquanto houver alerta que ninguém viu | ✅ | 🟡 o iOS vibra uma vez por chamada | idem |
| Tocar na notificação abre o alerta | ✅ | ✅ | `mobile/src/app/_layout.tsx` |
| Botão "Testar o alarme" nos Ajustes | ✅ | ✅ | `mobile/src/app/settings.tsx` |
| **Painel web**: bipe a cada 2,5 s enquanto houver alerta que ninguém viu, aviso do navegador e anúncio para leitor de tela | ✅ | ✅ | `web/src/pages/panel/useWebAlarm.ts` |

A palavra-código **não vai na notificação**, porque ela aparece na tela bloqueada e é o que prova a ela que a pessoa é da equipe.

**Limite que continua**: o alerta chega por WebSocket. Com o app fechado (ou o iPhone suspenso em segundo plano), nada chega, porque acordar o celular fechado precisa de **push remoto**, e o Expo Go do Android não tem push desde a SDK 53 (o próprio `expo-notifications` lança erro, em `warnOfExpoGoPushUsage.ts`). As repetições já agendadas tocam mesmo com o app fechado, mas o primeiro aviso só chega com o app aberto ou em segundo plano recente.

## O que exige build próprio (não feito, nenhuma conta criada)

| O quê | Para quê | Custo e o que pede |
| --- | --- | --- |
| **Push remoto** (FCM no Android, APNs no iOS, pelo serviço de push da Expo) | Acordar o celular com o app fechado | Development build ou build de loja pelo EAS. O serviço de push da Expo é grátis; o EAS Build tem plano grátis com cota mensal de builds (conferir os números atuais em expo.dev/pricing). No servidor: guardar o token de push de cada pessoa e enviar a cada alerta. Estimativa: meio dia de código, mais o build |
| Som de alarme próprio (arquivo de som) | Um toque reconhecível, diferente das outras notificações | Build próprio (o som entra pelo plugin `expo-notifications`, `sounds`). Sem custo extra além do build |
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
