import { useState } from 'react';
import { KIND_STAFF_LABEL, OUTCOME_LABEL, formatDuration, responseSeconds } from '@nenm/shared';
import { StatusBadge } from '../../components/StatusBadge';
import { dateTime, useAlerts } from './usePanelData';

/** Registro de todos os pedidos: o histórico que o protocolo pede. */
export function History() {
  const [days, setDays] = useState(30);
  const { alerts, error } = useAlerts(days);

  return (
    <>
      <h1>Pedidos</h1>
      <div className="field panel-filter">
        <label htmlFor="period">Período</label>
        <select id="period" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={1}>Últimas 24 horas</option>
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
        </select>
      </div>
      {error && <p className="error">Não foi possível carregar os pedidos.</p>}
      {!alerts && !error && <p className="muted">Carregando…</p>}
      {alerts && (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabela de pedidos (role para os lados no celular)">
          <table className="table">
            <caption className="visually-hidden">{alerts.length} pedidos no período</caption>
            <thead>
              <tr>
                <th scope="col">Quando</th>
                <th scope="col">Local</th>
                <th scope="col">Pedido</th>
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
