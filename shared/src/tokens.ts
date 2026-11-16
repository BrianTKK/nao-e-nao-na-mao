/**
 * Identidade visual comum ao app da equipe e à web (página do QR code e
 * painel da gerência). Os dois lados importam daqui: a web transforma em
 * variáveis CSS (web/src/styles/tokens.ts) e o app usa direto no StyleSheet.
 *
 * Escuro por padrão: o bar é à meia-luz, e uma tela clara no banheiro chama
 * atenção. Os contrastes estão conferidos em tokens.test.ts (WCAG AA no
 * mínimo; o texto principal passa do AAA).
 */

export const color = {
  bg: '#141118',
  surface: '#1F1A24',
  surfaceRaised: '#2B2432',
  /** Linha decorativa (divisórias). Não serve de borda de campo. */
  border: '#4A4152',
  /** Borda de campo e de botão secundário: 3:1 contra o fundo (WCAG 1.4.11). */
  borderStrong: '#8A7E94',
  text: '#F5F1F7',
  textMuted: '#BDB3C4',
  /** Ação principal (fundo de botão, com texto `onAccent`). */
  accent: '#FF7EAD',
  onAccent: '#141118',
  focus: '#FFD54A',
  danger: '#FF7A7A',
  status: {
    open: '#FFB648',
    seen: '#C9A7FF',
    on_the_way: '#72BDFF',
    resolved: '#5FD39A',
    cancelled: '#BDB3C4',
  },
} as const;

/** Espaçamento em px (base 4). */
export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 8, md: 14, lg: 24, pill: 999 } as const;

/** Tamanhos de fonte em px. A web converte para rem, para acompanhar o zoom do navegador. */
export const fontSize = { xs: 14, sm: 16, md: 18, lg: 22, xl: 28, xxl: 36 } as const;

export const fontWeight = { regular: '400', medium: '500', bold: '700' } as const;

export const lineHeight = { tight: 1.2, normal: 1.45 } as const;

/**
 * Fonte do sistema de propósito: não depende de download (sinal fraco no
 * bar) e é a que o leitor de tela e o aumento de fonte do aparelho já tratam bem.
 */
export const fontFamily = {
  web: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
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
