import { Text, View } from 'react-native';
import { Icon, type IconName } from '@/components/Icon';
import { color, space, ui } from '@/theme/theme';

/** Título de cartão (Fraunces 22) com ícone de traço em sálvia à esquerda. */
export function CardTitle({ icon, children }: { icon?: IconName; children: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
      {icon && <Icon name={icon} size={24} color={color.accent} />}
      <Text style={[ui.h2, { flex: 1 }]} accessibilityRole="header">
        {children}
      </Text>
    </View>
  );
}
