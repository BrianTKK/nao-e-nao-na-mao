import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { DataError, MENU_LIMITS, type Spot, type VenueMenu } from '@nenm/shared';
import { dataSource } from '../../data/source';
import { toMenuImages } from './menuImages';

const ERRORS: Partial<Record<DataError['code'], string>> = {
  menu_full: `O cardápio já tem ${MENU_LIMITS.maxFiles} imagens. Remova alguma para enviar outra.`,
  invalid_image: 'Esse arquivo não é uma imagem válida.',
};

/**
 * Cardápio do próprio local. É o que a mulher mostra a quem olhar a tela por
 * cima do ombro: um cardápio que quem frequenta o bar reconhece. Opcional: sem
 * cardápio, a página de ajuda fica sem o botão "Ver cardápio".
 */
export function Menu() {
  const [menu, setMenu] = useState<VenueMenu | null>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dataSource.manager.getMenu().then((m) => {
      setMenu(m);
      setUrl(m.url ?? '');
    });
    dataSource.manager.listSpots().then((s) => setSpots(s.filter((x) => x.active)));
  }, []);

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!menu || files.length === 0) return;
    setBusy(true);
    setError(null);
    let current = menu;
    try {
      for (const file of files) {
        const room = MENU_LIMITS.maxFiles - current.files.length;
        if (room <= 0) throw new DataError('menu_full');
        setStatus(`Preparando "${file.name}"…`);
        const images = await toMenuImages(file, room);
        for (const [i, image] of images.entries()) {
          setStatus(`Enviando ${images.length > 1 ? `a página ${i + 1} de ${images.length} de ` : ''}"${file.name}"…`);
          current = await dataSource.manager.addMenuFile(image);
          setMenu(current);
        }
      }
      setStatus('Cardápio atualizado.');
    } catch (err) {
      setStatus(null);
      setError(
        (err instanceof DataError && ERRORS[err.code]) ||
          (err instanceof Error && err.message === 'unsupported' ? 'Envie fotos (JPEG, PNG ou WebP) ou um PDF.' : 'Não foi possível enviar. Tente de novo.'),
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, n: number) => {
    if (!window.confirm(`Remover a página ${n} do cardápio?`)) return;
    setMenu(await dataSource.manager.removeMenuFile(id));
    setStatus(`Página ${n} removida.`);
  };

  const saveUrl = async (e: FormEvent) => {
    e.preventDefault();
    const value = url.trim();
    if (value && !/^https:\/\/\S+$/.test(value)) return setError('O link precisa começar com https://');
    setError(null);
    try {
      const m = await dataSource.manager.setMenuUrl(value || null);
      setMenu(m);
      setStatus(value ? 'Link do cardápio salvo.' : 'Link do cardápio removido.');
    } catch {
      setError('Não foi possível salvar o link. Confira se ele começa com https://');
    }
  };

  const preview = spots[0];

  return (
    <>
      <h1>Cardápio</h1>
      <p className="muted panel-intro">
        Opcional. Se o local tem cardápio, cadastre aqui: a página de ajuda ganha o botão "Ver cardápio", que troca a tela pelo cardápio do local
        para quem estiver olhando por cima do ombro. Use o cardápio de verdade: quem conhece o bar percebe um cardápio diferente. Sem cardápio
        cadastrado, a página fica sem esse botão.
      </p>
      {!menu && <p className="muted">Carregando…</p>}
      {menu && (
        <>
          <section className="card panel-section" aria-labelledby="menu-files">
            <h2 id="menu-files">Fotos ou PDF do cardápio</h2>
            <p className="muted">
              Aparecem dentro da página de ajuda, uma embaixo da outra. O PDF vira uma imagem por página. Até {MENU_LIMITS.maxFiles} imagens (
              {menu.files.length} usadas).
            </p>
            <div className="field">
              <label htmlFor="menu-upload">Enviar fotos ou PDF</label>
              <input
                id="menu-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                multiple
                disabled={busy || menu.files.length >= MENU_LIMITS.maxFiles}
                onChange={upload}
              />
            </div>
            {menu.files.length > 0 && (
              <ol className="menu-grid">
                {menu.files.map((f, i) => (
                  <li key={f.id} className="menu-thumb">
                    <img src={f.url} alt={`Página ${i + 1} do cardápio`} loading="lazy" />
                    <button type="button" className="btn" onClick={() => remove(f.id, i + 1)} aria-label={`Remover a página ${i + 1} do cardápio`}>
                      Remover
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <form className="card panel-section" aria-labelledby="menu-link" onSubmit={saveUrl} noValidate>
            <h2 id="menu-link">Link do cardápio digital</h2>
            <p className="muted">
              Se o local já usa um cardápio digital, cole o link. Ele abre em outra aba: quase todo cardápio digital não deixa ser mostrado
              dentro de outra página. Com fotos cadastradas, o link aparece no fim delas.
            </p>
            <div className="field">
              <label htmlFor="menu-url">Link (https://)</label>
              <input id="menu-url" type="url" inputMode="url" value={url} maxLength={500} placeholder="https://" onChange={(e) => setUrl(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary">
              Salvar link
            </button>
          </form>

          {preview && (
            <p>
              <a href={`/q/${preview.code}`} target="_blank" rel="noreferrer">
                Ver como fica na página do QR ({preview.label.toLowerCase()})
              </a>
            </p>
          )}
        </>
      )}
      <div aria-live="polite" className="live-feedback">
        {error ? <p className="error">{error}</p> : status ? <p>{status}</p> : null}
      </div>
    </>
  );
}
