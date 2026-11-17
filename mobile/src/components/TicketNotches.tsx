import { useCallback, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { color } from '@/theme/theme';

/*
 * Forma de tíquete da comanda, a mesma da web (.ticket e .perforation em
 * web/src/styles/global.css): um picote tracejado e dois semicírculos
 * recortados nas laterais, na altura do picote.
 *
 * O React Native não tem máscara, então o "recorte" é um meio círculo na cor
 * do fundo da tela, desenhado por cima da borda do cartão. Só funciona com o
 * cartão sobre o fundo da tela (color.bg), que é o caso das telas de alerta.
 */

const NOTCH = 9;

/** Picote: linha tracejada de 2 px (SVG, porque borda tracejada de um lado só falha no Android). */
export function Perforation({
  tint = color.border,
  onLayout,
  style,
}: {
  tint?: string;
  onLayout?: (e: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View onLayout={onLayout} style={[styles.perforation, style]} aria-hidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height={2}>
        <Line x1="0" y1="1" x2="100%" y2="1" stroke={tint} strokeWidth={2} strokeDasharray="6 5" />
      </Svg>
    </View>
  );
}

/**
 * Guarda a altura do picote dentro do cartão: passe `onLayout` ao
 * <Perforation> e `y` ao <TicketNotches>. O picote precisa ser filho direto
 * do cartão, para a posição medida ser a do cartão.
 */
export function useNotchY(): [number | null, (e: LayoutChangeEvent) => void] {
  const [y, setY] = useState<number | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { y: top, height } = e.nativeEvent.layout;
    setY(Math.round(top + height / 2));
  }, []);
  return [y, onLayout];
}

/**
 * Os dois entalhes. `borderWidth` e `borderColor` são os do cartão: o meio
 * círculo cobre a borda reta e desenha a borda em arco, como um recorte.
 */
export function TicketNotches({
  y,
  borderWidth = 0,
  borderColor = 'transparent',
  background = color.bg,
}: {
  y: number | null;
  borderWidth?: number;
  borderColor?: string;
  background?: string;
}) {
  if (y === null) return null;
  const half = NOTCH + borderWidth;
  // `y` vem do onLayout (medido da borda externa); `top` absoluto conta de dentro da borda.
  const top = y - half - borderWidth;
  const circle = {
    width: half * 2,
    height: half * 2,
    borderRadius: half,
    backgroundColor: background,
    borderWidth,
    borderColor,
  };
  return (
    <>
      <View pointerEvents="none" aria-hidden style={[styles.holder, { top, left: -borderWidth, width: half, height: half * 2 }]}>
        <View style={[circle, { marginLeft: -half }]} />
      </View>
      <View pointerEvents="none" aria-hidden style={[styles.holder, { top, right: -borderWidth, width: half, height: half * 2 }]}>
        <View style={circle} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  perforation: { height: 2, alignSelf: 'stretch' },
  holder: { position: 'absolute', overflow: 'hidden' },
});
