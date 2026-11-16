import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  KIND_STAFF_LABEL,
  OUTCOME_LABEL,
  STATUS_LABEL,
  computeStats,
  formatDuration,
  percentile,
  responseSeconds,
  type Alert,
  type AlertKind,
  type StaffMember,
  type Venue,
} from '@nenm/shared';
import { dataSource } from '../../data/source';
import { useDocumentTitle } from '../../hooks/hooks';
import './print.css';

const monthInput = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthName = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const day = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : 'pendente');

/**
 * Relatório do mês para o Procon: acionamentos, tempo de resposta, desfechos
 * e equipe capacitada no protocolo Não se Cale. Imprime ou salva em PDF pelo
 * navegador (Ctrl+P → "Salvar como PDF").
 */
export function Report() {
  const [month, setMonth] = useState(monthInput());
  useDocumentTitle(`Relatório ${month} · Não é Não na Mão`);
  // Pedidos guardados com o mês a que pertencem: trocar o mês mostra "Carregando…" sem apagar no efeito.
  const [loaded, setLoaded] = useState<{ month: string; alerts: Alert[] } | null>(null);
  const alerts = loaded?.month === month ? loaded.alerts : null;
  const [generatedAt] = useState(() => new Date().toLocaleString('pt-BR'));
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [venue, setVenue] = useState<Venue | null>(null);

  useEffect(() => {
    dataSource.manager.getVenue().then(setVenue);
    dataSource.manager.listStaff().then(setStaff);
  }, []);

  useEffect(() => {
    const [y, m] = month.split('-').map(Number);
    const from = new Date(y, m - 1, 1).toISOString();
    const to = new Date(y, m, 1).toISOString();
    dataSource.manager
      .listAlerts({ from, to })
      .then((a) => setLoaded({ month, alerts: [...a].sort((x, z) => x.createdAt.localeCompare(z.createdAt)) }));
  }, [month]);

  const stats = useMemo(() => (alerts ? computeStats(alerts) : null), [alerts]);
  const p90 = useMemo(() => percentile(alerts?.map(responseSeconds).filter((v): v is number => v !== null) ?? [], 90), [alerts]);
  const byKind = useMemo(() => {
    const out: Partial<Record<AlertKind, number>> = {};
    for (const a of alerts ?? []) out[a.kind] = (out[a.kind] ?? 0) + 1;
    return out;
  }, [alerts]);
  const activeStaff = staff.filter((s) => s.active);
  const trained = activeStaff.filter((s) => s.trainedAt);

  return (
    <div className="print-page report">
      <div className="no-print print-toolbar">
        <div className="field" style={{ maxWidth: 240 }}>
          <label htmlFor="report-month">Mês</label>
          <input id="report-month" type="month" value={month} max={monthInput()} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </div>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Imprimir ou salvar em PDF
        </button>{' '}
        <Link className="btn" to="/painel">
          Voltar ao painel
        </Link>
      </div>

      <header className="report-header">
        <p className="report-kicker">Protocolo Não se Cale (Lei estadual 17.621/2023) · Lei federal 14.786/2023</p>
        <h1>Relatório de pedidos de ajuda · {monthName(month)}</h1>
        {venue && (
          <p>
            {venue.name}
            {venue.neighborhood ? ` · ${venue.neighborhood}` : ''} · {venue.city}
          </p>
        )}
        <p className="muted">Gerado em {generatedAt} pelo sistema Não é Não na Mão. Nenhum dado pessoal de quem pediu ajuda é guardado.</p>
      </header>

      {!alerts || !stats ? (
        <p className="muted">Carregando…</p>
      ) : (
        <>
          <section aria-labelledby="r-numeros">
            <h2 id="r-numeros">Resumo</h2>
            <table className="report-table">
              <tbody>
                <tr>
                  <th scope="row">Pedidos de ajuda (acionamentos)</th>
                  <td>{stats.total}</td>
                </tr>
                <tr>
                  <th scope="row">Atendidos até o fim</th>
                  <td>
                    {stats.resolved} {stats.total ? `(${Math.round((stats.resolved / stats.total) * 100)}%)` : ''}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Cancelados por quem pediu</th>
                  <td>{stats.cancelled}</td>
                </tr>
                <tr>
                  <th scope="row">Tempo até a equipe ver (mediana)</th>
                  <td>{stats.medianSeenSeconds === null ? '—' : formatDuration(stats.medianSeenSeconds, true)}</td>
                </tr>
                <tr>
                  <th scope="row">Tempo até alguém ir (mediana)</th>
                  <td>{stats.medianResponseSeconds === null ? '—' : formatDuration(stats.medianResponseSeconds, true)}</td>
                </tr>
                <tr>
                  <th scope="row">Tempo até alguém ir (9 em cada 10 pedidos, até)</th>
                  <td>{p90 === null ? '—' : formatDuration(p90, true)}</td>
                </tr>
                <tr>
                  <th scope="row">Equipe ativa com o curso Não se Cale</th>
                  <td>
                    {trained.length} de {activeStaff.length}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <div className="report-cols">
            <section aria-labelledby="r-tipo">
              <h2 id="r-tipo">Por tipo de pedido</h2>
              <table className="report-table">
                <tbody>
                  {(Object.entries(byKind) as [AlertKind, number][]).map(([k, n]) => (
                    <tr key={k}>
                      <th scope="row">{KIND_STAFF_LABEL[k]}</th>
                      <td>{n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section aria-labelledby="r-local">
              <h2 id="r-local">Por local</h2>
              <table className="report-table">
                <tbody>
                  {Object.entries(stats.bySpot)
                    .sort((a, b) => b[1] - a[1])
                    .map(([label, n]) => (
                      <tr key={label}>
                        <th scope="row">{label}</th>
                        <td>{n}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </section>
            <section aria-labelledby="r-desfecho">
              <h2 id="r-desfecho">Desfechos</h2>
              <table className="report-table">
                <tbody>
                  {Object.entries(stats.byOutcome)
                    .sort((a, b) => b[1] - a[1])
                    .map(([o, n]) => (
                      <tr key={o}>
                        <th scope="row">{OUTCOME_LABEL[o as keyof typeof OUTCOME_LABEL]}</th>
                        <td>{n}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </section>
          </div>

          <section aria-labelledby="r-equipe">
            <h2 id="r-equipe">Equipe capacitada</h2>
            <table className="report-table">
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col">Função</th>
                  <th scope="col">Curso Não se Cale</th>
                </tr>
              </thead>
              <tbody>
                {activeStaff.map((s) => (
                  <tr key={s.id}>
                    <td>{s.fullName}</td>
                    <td>{s.jobTitle ?? (s.role === 'manager' ? 'Gerência' : 'Equipe')}</td>
                    <td>{day(s.trainedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section aria-labelledby="r-lista" className="report-break">
            <h2 id="r-lista">Registro de cada pedido</h2>
            {alerts.length === 0 ? (
              <p>Nenhum pedido no mês.</p>
            ) : (
              <table className="report-table report-list">
                <thead>
                  <tr>
                    <th scope="col">Quando</th>
                    <th scope="col">Local</th>
                    <th scope="col">Pedido</th>
                    <th scope="col">Até alguém ir</th>
                    <th scope="col">Quem atendeu</th>
                    <th scope="col">Desfecho</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => {
                    const r = responseSeconds(a);
                    return (
                      <tr key={a.id}>
                        <td>{dateTime(a.createdAt)}</td>
                        <td>{a.spotLabel}</td>
                        <td>{KIND_STAFF_LABEL[a.kind]}</td>
                        <td>{r === null ? '—' : formatDuration(r, true)}</td>
                        <td>{a.responderName ?? '—'}</td>
                        <td>{a.outcome ? OUTCOME_LABEL[a.outcome] : STATUS_LABEL[a.status]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
