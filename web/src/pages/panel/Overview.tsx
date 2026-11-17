import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router';
import { OUTCOME_LABEL, computeStats, formatDuration, isActive, type AlertOutcome, type StaffMember } from '@nenm/shared';
import { dataSource } from '../../data/source';
import { useNow } from '../../hooks/hooks';
import { useAlerts } from './usePanelData';
import { LiveBoard } from './LiveBoard';
import type { PanelContext } from './PanelLayout';

/** Visão geral: o que está acontecendo agora e os números do mês (prova diante do Procon). */
export function Overview() {
  const { me } = useOutletContext<PanelContext>();
  const { alerts, error } = useAlerts(30);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const now = useNow(1000);

  useEffect(() => {
    dataSource.manager.listStaff().then(setStaff);
  }, []);

  const stats = useMemo(() => (alerts ? computeStats(alerts) : null), [alerts]);
  const active = alerts?.filter((a) => isActive(a.status)) ?? [];
  const trained = staff.filter((s) => s.active && s.trainedAt).length;

  if (error) return <p className="error">Não foi possível carregar os alertas.</p>;
  if (!alerts || !stats) return <p className="muted">Carregando…</p>;

  const outcomes = Object.entries(stats.byOutcome).sort((a, b) => b[1] - a[1]) as [AlertOutcome, number][];
  const spots = Object.entries(stats.bySpot).sort((a, b) => b[1] - a[1]);
  const maxSpot = Math.max(1, ...spots.map(([, n]) => n));

  return (
    <>
      <h1>Visão geral</h1>

      <section aria-labelledby="agora" className="panel-section">
        <h2 id="agora">Agora</h2>
        <p className="muted" aria-live="polite">
          {active.length === 0 ? '' : `${active.length} alerta(s) em aberto`}
        </p>
        <LiveBoard alerts={active} staff={staff} me={me} now={now} />
      </section>

      <section aria-labelledby="mes" className="panel-section">
        <h2 id="mes">Últimos 30 dias</h2>
        <dl className="kpis">
          <div className="kpi">
            <dt>Alertas</dt>
            <dd>{stats.total}</dd>
          </div>
          <div className="kpi">
            <dt>Tempo até alguém ir (mediana)</dt>
            <dd>{stats.medianResponseSeconds === null ? '—' : formatDuration(stats.medianResponseSeconds)}</dd>
          </div>
          <div className="kpi">
            <dt>Atendidos até o fim</dt>
            <dd>{stats.total ? `${Math.round((stats.resolved / stats.total) * 100)}%` : '—'}</dd>
          </div>
          <div className="kpi">
            <dt>Equipe com o curso Não se Cale</dt>
            <dd>
              {trained} de {staff.filter((s) => s.active).length}
            </dd>
          </div>
        </dl>
      </section>

      <div className="panel-grid">
        <section aria-labelledby="locais" className="panel-section card">
          <h2 id="locais">Alertas por local</h2>
          <ul className="bars">
            {spots.map(([label, n]) => (
              <li key={label}>
                <span className="bar-label">{label}</span>
                <span className="bar-track" aria-hidden="true">
                  <span className="bar-fill" style={{ width: `${(n / maxSpot) * 100}%` }} />
                </span>
                <span className="bar-value">{n}</span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="desfechos" className="panel-section card">
          <h2 id="desfechos">Como terminaram</h2>
          <ul className="plain-list">
            {outcomes.map(([o, n]) => (
              <li key={o}>
                <span>{OUTCOME_LABEL[o]}</span>
                <strong>{n}</strong>
              </li>
            ))}
            {stats.cancelled > 0 && (
              <li>
                <span>Cancelados por quem pediu</span>
                <strong>{stats.cancelled}</strong>
              </li>
            )}
          </ul>
        </section>
      </div>
    </>
  );
}
