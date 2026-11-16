import { useEffect, useState, type FormEvent } from 'react';
import { SPOT_KIND_LABEL, type Spot, type SpotKind } from '@nenm/shared';
import { dataSource } from '../../data/source';
import { QrCode } from '../../components/QrCode';

const spotUrl = (code: string) => `${window.location.origin}/q/${code}`;

/** Locais com QR code: criar, ver e imprimir. */
export function Spots() {
  const [spots, setSpots] = useState<Spot[] | null>(null);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<SpotKind>('table');
  const [error, setError] = useState<string | null>(null);

  const load = () => dataSource.manager.listSpots().then(setSpots);
  useEffect(() => {
    load();
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (label.trim().length < 2) return setError('Dê um nome ao local, como "Mesa 20".');
    setError(null);
    await dataSource.manager.createSpot({ label, kind });
    setLabel('');
    load();
  };

  return (
    <>
      <h1>QR codes</h1>
      <p className="muted">Um QR code por local: banheiros, mesas, balcão. Imprima e cole com o cartaz do protocolo.</p>
      <form className="card spot-form" onSubmit={create} noValidate>
        <h2>Novo local</h2>
        <div className="field">
          <label htmlFor="spot-label">Nome do local</label>
          <input id="spot-label" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} aria-describedby="spot-error" />
        </div>
        <div className="field">
          <label htmlFor="spot-kind">Tipo</label>
          <select id="spot-kind" value={kind} onChange={(e) => setKind(e.target.value as SpotKind)}>
            {Object.entries(SPOT_KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <p id="spot-error" className="error" aria-live="assertive">
          {error}
        </p>
        <button type="submit" className="btn btn-primary">
          Criar QR code
        </button>
      </form>

      <div className="spots-toolbar">
        <button type="button" className="btn" onClick={() => window.print()}>
          Imprimir QR codes
        </button>
      </div>

      {!spots ? (
        <p className="muted">Carregando…</p>
      ) : (
        <ul className="spot-grid">
          {spots.map((s) => (
            <li key={s.id} className="card spot-card">
              <QrCode value={spotUrl(s.code)} label={`QR code do local ${s.label}`} />
              <h2>{s.label}</h2>
              <p className="muted">{SPOT_KIND_LABEL[s.kind]}</p>
              <p className="spot-print-hint">Precisa de ajuda? Leia o QR code. A equipe vem até você.</p>
              <a href={`/q/${s.code}`} target="_blank" rel="noreferrer" className="spot-link">
                Abrir a página deste QR code
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
