import type { ReactNode } from 'react';

export type Stat = { label: string; value: ReactNode; note?: ReactNode };

/**
 * Números do painel e do relatório: uma grade só com filetes (sem cartões),
 * o número em Fraunces com algarismos tabulares. Com quantidade ímpar, a
 * última célula ocupa duas colunas para a grade fechar sem buraco.
 */
export function StatGrid({ stats }: { stats: Stat[] }) {
  return (
    <dl className={`stat-grid${stats.length % 2 ? ' stat-grid-odd' : ''}`}>
      {stats.map((s) => (
        <div key={s.label} className="stat">
          <dt>{s.label}</dt>
          <dd>
            <span className="num stat-value">{s.value}</span>
            {s.note && <span className="muted stat-note">{s.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Barras finas (4 px): rótulo e número na linha, a barra embaixo. 'alert'
 * (latão) para contagem de alertas; 'calm' (sálvia) para desfechos.
 */
export function BarList({ rows, tone }: { rows: { label: string; value: number }[]; tone: 'alert' | 'calm' }) {
  if (rows.length === 0) return <p className="muted">Nada no período.</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className={`bars bars-${tone}`}>
      {rows.map((r) => (
        <li key={r.label}>
          <span className="bar-label">{r.label}</span>
          <span className="num bar-value">{r.value}</span>
          <span className="bar-track" aria-hidden="true">
            <span className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
