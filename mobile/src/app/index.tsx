import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { LogoSymbol } from '@/components/Logo';
import { useSession } from '@/hooks/useSession';
import { color, space, ui } from '@/theme/theme';

export default function Index() {
  const { me } = useSession();
  if (me === undefined) {
    return (
      <View style={[ui.screen, { justifyContent: 'center', alignItems: 'center', gap: space.md }]}>
        <LogoSymbol size={48} />
        <ActivityIndicator color={color.accent} accessibilityLabel="Carregando" />
      </View>
    );
  }
  return <Redirect href={me ? '/alerts' : '/login'} />;
}
