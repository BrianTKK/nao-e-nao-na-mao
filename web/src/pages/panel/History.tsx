import { useState } from 'react';
import { KIND_STAFF_LABEL, OUTCOME_LABEL, displayCode, formatDuration, normalizeCode, responseSeconds } from '@nenm/shared';
import { StatusBadge } from '../../components/StatusBadge';
import { dateTime, useAlerts } from './usePanelData';

/** Registro de todos os alertas: o histórico que o protocolo pede. */
export function History() {
  const [days, setDays] = useState(30);
  const [word, setWord] = useState('');
  const { alerts: all, error } = useAlerts(days);
  // Busca pela palavra-código: para achar o alerta de quem volta ao bar ou liga depois.
  const query = normalizeCode(word);
  const alerts = all && query ? all.filter((a) => normalizeCode(a.shortCode).startsWith(query)) : all;

  return (
    <>
      <h1>Alertas</h1>
      <div className="field panel-filter">
        <label htmlFor="period">Período</label>
        <select id="period" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={1}>Últimas 24 horas</option>
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
        </select>
      </div>
      <div className="field panel-filter">
        <label htmlFor="word">Buscar pela palavra-código</label>
        <input id="word" type="search" value={word} onChange={(e) => setWord(e.target.value)} placeholder="ex.: borboleta" autoComplete="off" />
      </div>
      {error && <p className="error">Não foi possível carregar os alertas.</p>}
      {!alerts && !error && <p className="muted">Carregando…</p>}
      {alerts && query && alerts.length === 0 && <p className="muted">Nenhum alerta com essa palavra no período.</p>}
      {alerts && (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabela de alertas (role para os lados no celular)">
          <table className="table">
            <caption className="visually-hidden">{alerts.length} alertas no período</caption>
            <thead>
              <tr>
                <th scope="col">Quando</th>
                <th scope="col">Local</th>
                <th scope="col">Palavra</th>
                <th scope="col">Tipo</th>
                <th scope="col">Até alguém ir</th>
                <th scope="col">Quem atendeu</th>
                <th scope="col">Desfecho</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => {
                const r = responseSeconds(a);
                return (
                  <tr key={a.id}>
                    <td>{dateTime(a.createdAt)}</td>
                    <td>{a.spotLabel}</td>
                    <td>{displayCode(a.shortCode)}</td>
                    <td>{KIND_STAFF_LABEL[a.kind]}</td>
                    <td>{r === null ? '—' : formatDuration(r)}</td>
                    <td>{a.responderName ?? '—'}</td>
                    <td>{a.outcome ? OUTCOME_LABEL[a.outcome] : '—'}</td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
