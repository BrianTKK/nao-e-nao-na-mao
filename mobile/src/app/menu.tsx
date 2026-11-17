import { useCallback, useEffect, useState } from 'react';
import { Alert as Confirm, Image, ScrollView, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { DataError, MENU_LIMITS, type VenueMenu } from '@nenm/shared';
import { Button } from '@/components/Button';
import { CardTitle } from '@/components/CardTitle';
import { FocusInput } from '@/components/FocusInput';
import { useSession } from '@/hooks/useSession';
import { dataSource } from '@/data/source';
import { color, radius, space, ui } from '@/theme/theme';

/**
 * Cardápio do bar pelo app: a gerência fotografa o cardápio de papel (ou
 * escolhe fotos da galeria) e cola o link do cardápio digital. O PDF entra
 * pelo painel web, que converte as páginas em imagem.
 */
export default function MenuScreen() {
  const { me } = useSession();
  const [menu, setMenu] = useState<VenueMenu | null>(null);
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (me?.role !== 'manager') return;
    dataSource.manager
      .getMenu()
      .then((m) => {
        setMenu(m);
        setUrl(m.url ?? '');
      })
      .catch(() => setStatus('Não foi possível carregar o cardápio.'));
  }, [me?.role]);

  const send = useCallback(
    async (assets: ImagePicker.ImagePickerAsset[]) => {
      if (!menu) return;
      setBusy(true);
      let current = menu;
      try {
        for (const [i, asset] of assets.entries()) {
          if (current.files.length >= MENU_LIMITS.maxFiles) throw new DataError('menu_full');
          setStatus(`Enviando ${assets.length > 1 ? `${i + 1} de ${assets.length}` : 'a foto'}…`);
          // Reduz para no máximo 1600 px no lado maior e regrava em JPEG (tira também os metadados, como o GPS).
          const side = asset.width >= asset.height ? { width: Math.min(asset.width, MENU_LIMITS.maxSide) } : { height: Math.min(asset.height, MENU_LIMITS.maxSide) };
          const ref = await ImageManipulator.manipulate(asset.uri).resize(side).renderAsync();
          const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
          if (!saved.base64) throw new Error('no_base64');
          current = await dataSource.manager.addMenuFile({ contentType: 'image/jpeg', base64: saved.base64 });
          setMenu(current);
        }
        setStatus('Cardápio atualizado.');
      } catch (err) {
        setStatus(
          err instanceof DataError && err.code === 'menu_full'
            ? `O cardápio já tem ${MENU_LIMITS.maxFiles} fotos. Remova alguma para enviar outra.`
            : 'Não foi possível enviar. Tente de novo.',
        );
      } finally {
        setBusy(false);
      }
    },
    [menu],
  );

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setStatus('Sem acesso à câmera. Libere nas configurações do celular.');
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!res.canceled) await send(res.assets);
  };

  const pickPhotos = async () => {
    const room = MENU_LIMITS.maxFiles - (menu?.files.length ?? 0);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: room, quality: 0.9 });
    if (!res.canceled) await send(res.assets.slice(0, room));
  };

  const remove = (id: string, n: number) =>
    Confirm.alert('Remover foto', `Remover a página ${n} do cardápio?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          setMenu(await dataSource.manager.removeMenuFile(id));
          setStatus(`Página ${n} removida.`);
        },
      },
    ]);

  const saveUrl = async () => {
    const value = url.trim();
    if (value && !/^https:\/\/\S+$/.test(value)) return setStatus('O link precisa começar com https://');
    try {
      setMenu(await dataSource.manager.setMenuUrl(value || null));
      setStatus(value ? 'Link salvo.' : 'Link removido.');
    } catch {
      setStatus('Não foi possível salvar o link.');
    }
  };

  if (me?.role !== 'manager') {
    return (
      <View style={[ui.screen, ui.content]}>
        <Text style={ui.body}>Só a gerência cadastra o cardápio do bar.</Text>
      </View>
    );
  }

  const full = (menu?.files.length ?? 0) >= MENU_LIMITS.maxFiles;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <Text style={ui.muted}>
        Opcional. Na página de ajuda, o botão "Ver cardápio" troca a tela pelo cardápio do bar para quem estiver olhando. Use o cardápio de verdade:
        quem conhece o bar percebe um diferente.
      </Text>

      <View style={ui.card}>
        <CardTitle icon="menu-book">Fotos do cardápio</CardTitle>
        <Text style={ui.muted}>
          {menu ? `${menu.files.length} de ${MENU_LIMITS.maxFiles} fotos.` : 'Carregando…'} O PDF entra pelo painel web.
        </Text>
        <Button label="Fotografar o cardápio" variant="primary" icon="plus" disabled={!menu || busy || full} onPress={takePhoto} />
        <Button label="Escolher da galeria" variant="secondary" disabled={!menu || busy || full} onPress={pickPhotos} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {menu?.files.map((f, i) => (
            <View key={f.id} style={{ width: 104, gap: space.xs }}>
              <Image source={{ uri: f.url }} style={{ width: 104, height: 138, borderRadius: radius.sm, borderWidth: 1, borderColor: color.border, backgroundColor: color.paper }} accessibilityLabel={`Página ${i + 1} do cardápio`} />
              <Button label="Remover" variant="danger" onPress={() => remove(f.id, i + 1)} accessibilityLabel={`Remover a página ${i + 1} do cardápio`} />
            </View>
          ))}
        </View>
      </View>

      <View style={ui.card}>
        <CardTitle>Link do cardápio digital</CardTitle>
        <Text style={ui.muted}>Se o bar já usa um cardápio digital. Abre em outra aba, e a página de ajuda continua aberta.</Text>
        <FocusInput
          value={url}
          onChangeText={setUrl}
          placeholder="https://"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          maxLength={500}
          accessibilityLabel="Link do cardápio digital"
        />
        <Button label="Salvar link" variant="calm" onPress={saveUrl} disabled={!menu} />
      </View>

      {status && (
        <Text style={ui.body} accessibilityLiveRegion="polite">
          {status}
        </Text>
      )}
    </ScrollView>
  );
}
