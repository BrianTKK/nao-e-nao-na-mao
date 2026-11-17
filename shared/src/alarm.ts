/**
 * O que o app e o servidor precisam combinar sobre o alarme de alerta (ver
 * docs/NOTIFICACOES.md): o canal do Android, o som, a vibração e quando repete.
 */

/** Canal do Expo Go: som padrão do sistema, porque o Expo Go não carrega som próprio. */
export const ALARM_CHANNEL_EXPO_GO = 'alerts-alarm';
/**
 * Canal do app próprio (APK), com o som da Mariana. O Android não deixa mudar
 * o som de um canal que já existe: se o som mudar, o canal precisa de outro id.
 */
export const ALARM_CHANNEL = 'alerts-alarm-v2';
/** Arquivo de som (mobile/assets/sounds), feito no projeto, sem direito de terceiros. */
export const ALARM_SOUND = 'mariana_alarme.wav';

/** Padrão de vibração do Android, em ms (espera, vibra, espera, vibra...). */
export const ALARM_VIBRATION = [0, 800, 300, 800, 300, 800, 300, 800];
/** Segundos depois do primeiro toque em que o alarme toca de novo, se ninguém tiver visto. */
export const ALARM_REPEAT_AT_S = [20, 40, 60, 90, 120];
