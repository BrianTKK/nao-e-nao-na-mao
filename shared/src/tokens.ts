/**
 * Identidade visual comum ao app da equipe e à web (página do QR code e
 * painel da gerência). Os dois lados importam daqui: a web transforma em
 * variáveis CSS (web/src/styles/tokens.ts) e o app usa direto no StyleSheet.
 *
 * Direção "Comanda" (decisão de 17/11/2026): verde-garrafa escuro com latão,
 * sálvia para a ação calma, como a comanda de um bar. Escuro por padrão: o bar
 * é à meia-luz, e uma tela clara no banheiro chama atenção. Nada de rosa.
 * Os contrastes estão conferidos em tokens.test.ts (texto 4,5:1; gráfico e
 * borda 3:1; o texto principal passa do AAA).
 */

export const color = {
  /** Garrafa: fundo de toda tela. */
  bg: '#0E1512',
  surface: '#16201B',
  /** Um degrau acima da superfície (menu aberto, item em destaque, hover). */
  surfaceRaised: '#1E2A24',
  /** Linha decorativa (divisórias, picote). Não serve de borda de campo. */
  border: '#33433A',
  /** Borda de campo e de botão secundário: 3:1 contra o fundo (WCAG 1.4.11). */
  borderStrong: '#6F8478',
  text: '#EEEBE1',
  /** Texto de apoio. */
  textMuted: '#A9B3AA',
  /** Sálvia: ação calma (botão com texto `onAccent`, ícone, link). */
  accent: '#A8D5B8',
  onAccent: '#0E1512',
  /** Latão: só alerta novo e a ação principal da tela (texto `onAlert`). */
  alert: '#FFB840',
  onAlert: '#1A1200',
  focus: '#FFD866',
  danger: '#FF8F80',
  /** Folha: verde escuro para fundo claro (placa impressa, logo positivo). */
  leaf: '#2E5E48',
  /** Papel: fundo claro da placa impressa (o QR é escuro sobre claro). */
  paper: '#EEEBE1',
  /** Legenda sobre o papel. */
  paperMuted: '#4A5A50',
  status: {
    open: '#FFB840',
    seen: '#C3B1F5',
    on_the_way: '#7CC4F0',
    resolved: '#A8D5B8',
    cancelled: '#A9B3AA',
  },
} as const;

/** Espaçamento em px (base 4). */
export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

/** Cantos de 6 a 8 px. `pill` só para o ponto de status. */
export const radius = { sm: 6, md: 8, lg: 8, pill: 999 } as const;

/** Tamanhos de fonte em px. A web converte para rem, para acompanhar o zoom do navegador. */
export const fontSize = { xs: 14, sm: 16, md: 18, lg: 22, xl: 28, xxl: 36 } as const;

export const fontWeight = { regular: '400', medium: '500', semibold: '600', bold: '700' } as const;

export const lineHeight = { tight: 1.2, normal: 1.45 } as const;

/**
 * Pilhas de fonte da web: Fraunces 600 em títulos, números e no nome;
 * Instrument Sans no texto e nos botões. As duas vêm do próprio site, com
 * reserva do sistema (Georgia e system-ui) para quando o sinal do bar não
 * deixar baixar. `web` é o corpo (nome antigo, mantido).
 * O app não usa estas pilhas: fonte nativa se carrega no próprio app.
 */
const bodyStack =
  '"Instrument Sans", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const displayStack = 'Fraunces, Georgia, "Times New Roman", serif';

export const fontFamily = {
  web: bodyStack,
  body: bodyStack,
  display: displayStack,
} as const;

/** Área mínima de toque em px (48 = Material; a Apple pede 44). */
export const touchTarget = 48;

/**
 * Movimento. Cada duração tem uma função: `fast` para retorno de toque,
 * `base` para troca de estado, `slow` para o status "a caminho" que anda
 * devagar na página da mulher, `pulse` para o alerta no app da equipe.
 * Com "reduzir movimento" ligado, tudo vira troca instantânea.
 */
export const motion = {
  duration: { fast: 150, base: 250, slow: 600, pulse: 1200 },
  easing: {
    standard: [0.2, 0, 0, 1] as const,
    exit: [0.4, 0, 1, 1] as const,
  },
} as const;

export const tokens = { color, space, radius, fontSize, fontWeight, lineHeight, fontFamily, touchTarget, motion };
export type Tokens = typeof tokens;
