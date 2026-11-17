import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { Spot, Venue } from '@nenm/shared';
import { dataSource } from '../../data/source';
import { QrCode } from '../../components/QrCode';
import { useDocumentTitle } from '../../hooks/hooks';
import './print.css';

/**
 * Página para imprimir os QR codes: um cartaz por local, em preto e branco,
 * com o texto que a mulher entende de longe. Na tela, os botões; no papel,
 * só os cartazes (dois por folha A4).
 */
export function PrintSpots() {
  useDocumentTitle('QR codes para imprimir · Não é Não na Mão');
  const [spots, setSpots] = useState<Spot[] | null>(null);
  const [venue, setVenue] = useState<Venue | null>(null);
  useEffect(() => {
    dataSource.manager.listSpots().then((s) => setSpots(s.filter((x) => x.active)));
    dataSource.manager.getVenue().then(setVenue);
  }, []);

  if (!spots || !venue) return <p className="muted">Carregando…</p>;
  return (
    <div className="print-page">
      <div className="no-print print-toolbar">
        <h1>QR codes para imprimir</h1>
        <p className="muted">
          {spots.length} locais ativos. Imprima em A4 (dois por folha) e cole no banheiro, nas mesas e no balcão, junto do cartaz do protocolo.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Imprimir
        </button>{' '}
        <Link className="btn" to="/painel/qr-codes">
          Voltar
        </Link>
      </div>
      <div className="poster-grid">
        {spots.map((s) => (
          <section key={s.id} className="poster" aria-label={`Cartaz do local ${s.label}`}>
            <p className="poster-title">Precisa de ajuda?</p>
            <p className="poster-sub">Leia o QR code. A nossa equipe vem até você, sem chamar atenção.</p>
            <QrCode value={`${window.location.origin}/q/${s.code}`} label={`QR code do local ${s.label}`} size={220} />
            <p className="poster-spot">{s.label}</p>
            <p className="poster-foot">
              {venue.name} · Não precisa instalar nada · Em perigo, ligue 190 · Central da Mulher, 180
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
