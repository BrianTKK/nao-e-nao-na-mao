import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useSession } from '@/hooks/useSession';
import { color, ui } from '@/theme/theme';

export default function Index() {
  const { me } = useSession();
  if (me === undefined) {
    return (
      <View style={[ui.screen, { justifyContent: 'center' }]}>
        <ActivityIndicator color={color.accent} accessibilityLabel="Carregando" />
      </View>
    );
  }
  return <Redirect href={me ? '/alerts' : '/login'} />;
}
