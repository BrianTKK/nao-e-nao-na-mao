import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ConnectionState } from '@nenm/shared';
import { dataSource } from '@/data/source';
import { color, fontSize, radius, space } from '@/theme/theme';

const TEXT: Record<ConnectionState, string> = {
  online: 'Conectado: os alertas chegam na hora',
  connecting: 'Reconectando…',
  offline: 'Sem conexão: os alertas novos não estão chegando',
};

/**
 * Estado da ligação em tempo real, sempre visível no topo da lista: quem está
 * de plantão precisa saber se o celular vai mesmo avisar.
 */
export function ConnectionBanner() {
  const [state, setState] = useState<ConnectionState>('connecting');
  useEffect(() => dataSource.watchConnection(setState), []);
  const tone = state === 'online' ? color.status.resolved : state === 'connecting' ? color.status.open : color.danger;
  return (
    <View
      style={[styles.banner, { borderColor: tone }]}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={TEXT[state]}
    >
      <Text style={[styles.dot, { color: tone }]} aria-hidden>
        {state === 'online' ? '●' : state === 'connecting' ? '◌' : '×'}
      </Text>
      <Text style={styles.text}>{TEXT[state]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderWidth: 2,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    alignSelf: 'flex-start',
  },
  dot: { fontSize: fontSize.sm, fontWeight: '700' },
  text: { color: color.text, fontSize: fontSize.xs },
});
