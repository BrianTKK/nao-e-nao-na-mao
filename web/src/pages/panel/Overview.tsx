import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router';
import { OUTCOME_LABEL, computeStats, formatDuration, isActive, type AlertOutcome, type StaffMember } from '@nenm/shared';
import { dataSource } from '../../data/source';
import { useNow } from '../../hooks/hooks';
import { useAlerts } from './usePanelData';
import { LiveBoard } from './LiveBoard';
import { BarList, StatGrid } from './Stats';
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
  const outcomeRows = outcomes.map(([o, n]) => ({ label: OUTCOME_LABEL[o], value: n }));
  if (stats.cancelled > 0) outcomeRows.push({ label: 'Cancelados por quem pediu', value: stats.cancelled });

  return (
    <>
      <h1>Visão geral</h1>

      <section aria-labelledby="agora" className="panel-section">
        <div className="panel-section-head">
          <h2 id="agora">Agora</h2>
          <p className="muted" aria-live="polite">
            {active.length === 0 ? '' : `${active.length} ${active.length === 1 ? 'alerta' : 'alertas'} em aberto`}
          </p>
        </div>
        <LiveBoard alerts={active} staff={staff} me={me} now={now} />
      </section>

      <section aria-labelledby="mes" className="panel-section">
        <h2 id="mes">Últimos 30 dias</h2>
        <StatGrid
          stats={[
            { label: 'Alertas', value: stats.total },
            {
              label: 'Tempo até alguém ir (mediana)',
              value: stats.medianResponseSeconds === null ? '—' : formatDuration(stats.medianResponseSeconds),
            },
            { label: 'Atendidos até o fim', value: stats.total ? `${Math.round((stats.resolved / stats.total) * 100)}%` : '—' },
            { label: 'Equipe com o curso Não se Cale', value: `${trained} de ${staff.filter((s) => s.active).length}` },
          ]}
        />
      </section>

      <div className="panel-columns">
        <section aria-labelledby="locais" className="panel-section panel-block">
          <h2 id="locais">Alertas por local</h2>
          <BarList tone="alert" rows={spots.map(([label, n]) => ({ label, value: n }))} />
        </section>
        <section aria-labelledby="desfechos" className="panel-section panel-block">
          <h2 id="desfechos">Como terminaram</h2>
          <BarList tone="calm" rows={outcomeRows} />
        </section>
      </div>
    </>
  );
}
