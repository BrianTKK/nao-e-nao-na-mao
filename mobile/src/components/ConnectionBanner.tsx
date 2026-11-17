import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ConnectionState } from '@nenm/shared';
import { dataSource } from '@/data/source';
import { Icon } from '@/components/Icon';
import { color, font, fontSize, radius, space } from '@/theme/theme';

const TEXT: Record<ConnectionState, string> = {
  online: 'Conectado: os alertas chegam na hora',
  connecting: 'Reconectando…',
  offline: 'Sem conexão: os alertas novos não estão chegando',
};

/**
 * Estado da ligação em tempo real, sempre visível no topo da lista: quem está
 * de plantão precisa saber se o celular vai mesmo avisar. Discreto quando está
 * tudo certo (sálvia e apoio); só a falta de conexão usa o perigo. O estado
 * nunca depende só da cor: ponto cheio, anel e ícone de alerta, mais o texto.
 */
export function ConnectionBanner() {
  const [state, setState] = useState<ConnectionState>('connecting');
  useEffect(() => dataSource.watchConnection(setState), []);
  const offline = state === 'offline';
  return (
    <View
      style={[styles.banner, offline && { borderColor: color.danger }]}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={TEXT[state]}
    >
      <View style={styles.mark} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {state === 'online' && <View style={[styles.dot, { backgroundColor: color.accent }]} />}
        {state === 'connecting' && <View style={[styles.dot, { borderColor: color.textMuted, borderWidth: 2 }]} />}
        {offline && <Icon name="alert-circle" size={16} color={color.danger} />}
      </View>
      <Text style={[styles.text, offline && { color: color.danger, fontFamily: font.bodyMedium }]}>{TEXT[state]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    alignSelf: 'flex-start',
  },
  mark: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  text: { color: color.textMuted, fontFamily: font.body, fontSize: fontSize.xs },
});
