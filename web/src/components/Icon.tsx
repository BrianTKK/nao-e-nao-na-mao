import type { CSSProperties } from 'react';

/*
 * Ícones de traço da Mariana, desenhados à mão numa grade de 24 (sem
 * biblioteca): traço de 1,75 px que não engrossa com o tamanho, pontas e
 * junções redondas, cor de currentColor. Decorativos por padrão (aria-hidden);
 * com `label`, viram imagem com nome (use só quando o ícone estiver sozinho,
 * sem texto ao lado). A marca evita pin de mapa, escudo e cadeado.
 */

/** Círculo como path (para tudo ser uma lista de `d`). */
const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/** Retângulo de canto arredondado como path. */
const rect = (x: number, y: number, w: number, h: number, r = 0) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}` +
  `h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;

/** Ponto (traço de comprimento quase zero com ponta redonda). */
const dot = (x: number, y: number) => `M${x} ${y}h.01`;

const ICONS = {
  /** Triângulo com "!": alerta novo. */
  alert: [
    'M10.27 4.5a2 2 0 0 1 3.46 0l7.53 13a2 2 0 0 1-1.73 3H4.47a2 2 0 0 1-1.73-3z',
    'M12 9.5v4.5',
    dot(12, 17.25),
  ],
  /** Círculo com "!": "estou me sentindo insegura". */
  'alert-circle': [circle(12, 12, 9), 'M12 7.75v5', dot(12, 16.25)],
  info: [circle(12, 12, 9), 'M12 11v5.25', dot(12, 7.75)],
  /** Visto. */
  eye: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', circle(12, 12, 3)],
  /** Alguém a caminho (pessoa andando). */
  walking: [
    circle(13.5, 4.5, 1.75),
    'M12.75 8.5 10.5 14l3.25 3 .75 4',
    'M10.5 14 8 21',
    'M6.5 12.5 9 9.25l3.75-.75 2 3.25 3 1.25',
  ],
  'arrow-right': ['M4 12h16', 'M14 6l6 6-6 6'],
  'arrow-left': ['M20 12H4', 'M10 6l-6 6 6 6'],
  check: ['M4.5 12.5l5 5 10-11'],
  'check-circle': [circle(12, 12, 9), 'M8 12.5l2.75 2.75L16 9.5'],
  x: ['M6 6l12 12', 'M18 6 6 18'],
  plus: ['M12 5v14', 'M5 12h14'],
  phone: [
    'M5 3.5h3.25l1.6 4.25-2.1 1.3a11 11 0 0 0 5.2 5.2l1.3-2.1 4.25 1.6V17a2.5 2.5 0 0 1-2.5 2.5A15 15 0 0 1 2.5 6 2.5 2.5 0 0 1 5 3.5z',
  ],
  /** Cardápio (livro aberto). */
  'menu-book': [
    'M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z',
    'M12 6.5v13',
  ],
  wifi: ['M2.5 9a14 14 0 0 1 19 0', 'M5.5 12.5a9.5 9.5 0 0 1 13 0', 'M8.75 16a5 5 0 0 1 6.5 0', dot(12, 19.5)],
  /** Sem sinal: o Wi-Fi riscado. */
  'wifi-off': ['M2.5 9a14 14 0 0 1 19 0', 'M5.5 12.5a9.5 9.5 0 0 1 13 0', 'M8.75 16a5 5 0 0 1 6.5 0', dot(12, 19.5), 'M4.5 3.5l15 17.5'],
  clock: [circle(12, 12, 9), 'M12 7v5l3.5 2'],
  user: [circle(12, 8, 3.75), 'M4.5 20.5a7.5 7.5 0 0 1 15 0'],
  users: [
    circle(9, 8, 3.25),
    'M2.5 20a6.5 6.5 0 0 1 13 0',
    'M15.5 4.9a3.25 3.25 0 0 1 0 6.2',
    'M18 14a6.5 6.5 0 0 1 3.5 6',
  ],
  'chevron-down': ['M6 9l6 6 6-6'],
  'chevron-right': ['M9 6l6 6-6 6'],
  'chevron-left': ['M15 6l-6 6 6 6'],
  /** Porta: "quero sair daqui com segurança". */
  door: ['M5 21V4h10v17', 'M15 8h4v13', 'M3 21h18', dot(11.75, 12.75)],
  /** Balão: "quero falar com alguém da equipe". */
  message: ['M4.5 4.5h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10l-4.5 3.5v-3.5h-1a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z'],
  qr: [
    rect(3.5, 3.5, 6.5, 6.5, 1),
    rect(14, 3.5, 6.5, 6.5, 1),
    rect(3.5, 14, 6.5, 6.5, 1),
    dot(6.75, 6.75),
    dot(17.25, 6.75),
    dot(6.75, 17.25),
    'M14 14h3v3',
    'M20.5 14v.01',
    'M14 20.5h.01',
    'M17.5 20.5h3v-3',
  ],
  printer: [
    'M7 9V3.5h10V9',
    'M6.5 17.5h-2a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-2',
    rect(7, 14, 10, 6.5, 0.5),
  ],
  bell: ['M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z', 'M10 21a2.25 2.25 0 0 0 4 0'],
  'bar-chart': ['M4 20.5h16', 'M7 17v-6', 'M12 17V6', 'M17 17v-4'],
  list: ['M9 6h11', 'M9 12h11', 'M9 18h11', dot(4.5, 6), dot(4.5, 12), dot(4.5, 18)],
  /** Ajustes (controles deslizantes). */
  settings: ['M4 7h9', 'M17 7h3', circle(15, 7, 2), 'M4 17h3', 'M11 17h9', circle(9, 17, 2)],
  'log-out': ['M9.5 20.5H5a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1h4.5', 'M15.5 16.5 20 12l-4.5-4.5', 'M20 12H9.5'],
  copy: [rect(8.5, 8.5, 12, 12, 1.5), 'M15.5 8.5V5A1.5 1.5 0 0 0 14 3.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5'],
} as const satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof ICONS;

type IconProps = {
  name: IconName;
  /** Lado em px. Padrão 24. */
  size?: number;
  /** Nome acessível. Sem ele o ícone é decorativo (aria-hidden). */
  label?: string;
  className?: string;
  style?: CSSProperties;
};

export function Icon({ name, size = 24, label, className, style }: IconProps) {
  const a11y = label
    ? { role: 'img', 'aria-label': label }
    : { 'aria-hidden': true as const, focusable: 'false' as const };
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flex: 'none', ...style }}
      {...a11y}
    >
      {ICONS[name].map((d) => (
        <path key={d} d={d} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
