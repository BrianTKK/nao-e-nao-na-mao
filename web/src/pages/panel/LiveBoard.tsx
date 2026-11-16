import { useState } from 'react';
import {
  ALERT_OUTCOMES,
  DataError,
  KIND_STAFF_LABEL,
  OUTCOME_LABEL,
  elapsedSeconds,
  formatDuration,
  type Alert,
  type AlertOutcome,
  type StaffMember,
} from '@nenm/shared';
import { dataSource } from '../../data/source';
import { StatusBadge } from '../../components/StatusBadge';

const ERRORS: Partial<Record<DataError['code'], string>> = {
  already_taken: 'Outra pessoa já está indo.',
  invalid_transition: 'Este pedido já mudou de estado.',
  staff_not_found: 'Essa pessoa não está ativa na equipe.',
};

/**
 * Quadro ao vivo de quem coordena. Cada pedido aberto tem as ações na ordem do
 * atendimento: "Vi o pedido", "Estou indo" (a própria gerência vai), "Mandar
 * alguém" (direciona para alguém da equipe) e "Resolvido". Cada ação muda na
 * hora a página da mulher e o app da equipe.
 */
export function LiveBoard({ alerts, staff, me, now }: { alerts: Alert[]; staff: StaffMember[]; me: StaffMember; now: number }) {
  if (alerts.length === 0) return <p className="muted">Nenhum pedido em aberto.</p>;
  const crew = staff.filter((s) => s.active && s.id !== me.id);
  return (
    <ul className="live-list">
      {alerts.map((a) => (
        <LiveItem key={a.id} alert={a} crew={crew} now={now} />
      ))}
    </ul>
  );
}

function whoLine(a: Alert): string {
  if (a.responderName) return `${a.responderName} está indo até ela`;
  if (a.assignedToName) return `${a.assignedByName?.split(' ')[0] ?? 'A gerência'} mandou ${a.assignedToName}; esperando o "Estou indo"`;
  if (a.status === 'seen') return 'Visto; ninguém foi mandado ainda';
  return 'Ninguém viu ainda';
}

function LiveItem({ alert: a, crew, now }: { alert: Alert; crew: StaffMember[]; now: number }) {
  const [target, setTarget] = useState('');
  const [outcome, setOutcome] = useState<AlertOutcome | ''>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>, doneText: string) => {
    setBusy(key);
    setError(null);
    setDone(null);
    try {
      await fn();
      setDone(doneText);
    } catch (err) {
      setError((err instanceof DataError && ERRORS[err.code]) || 'Não foi possível salvar. Tente de novo.');
    } finally {
      setBusy(null);
    }
  };

  const waiting = a.status === 'open' || a.status === 'seen';
  const place = a.spotLabel;
  const targetName = crew.find((s) => s.id === target)?.fullName.split(' ')[0];

  return (
    <li className={`live-item live-${a.status}`} aria-labelledby={`alert-${a.id}`}>
      {/* A faixa refaz a animação a cada troca de estado: o cartão "acende" quando muda. */}
      <span key={`${a.status}-${a.assignedToId ?? ''}`} className="live-flash" aria-hidden="true" />
      <div className="live-head">
        <StatusBadge status={a.status} />
        <strong id={`alert-${a.id}`}>{place}</strong>
        <span>{KIND_STAFF_LABEL[a.kind]}</span>
        <span className="muted">
          há {formatDuration(elapsedSeconds(a.createdAt, now), true)} · código {a.shortCode}
        </span>
      </div>
      <p className="live-who">{whoLine(a)}</p>

      <div className="live-actions">
        {a.status === 'open' && (
          <button
            type="button"
            className="btn"
            disabled={!!busy}
            aria-label={`Vi o pedido do ${place}`}
            onClick={() => run('ack', () => dataSource.staff.ackAlert(a.id), `Pedido do ${place} marcado como visto.`)}
          >
            {busy === 'ack' ? 'Salvando…' : 'Vi o pedido'}
          </button>
        )}
        {waiting && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!!busy}
            aria-label={`Estou indo ao ${place} (eu mesma vou)`}
            onClick={() => run('go', () => dataSource.staff.startResponse(a.id), `Você está indo ao ${place}. Ela já vê seu nome.`)}
          >
            {busy === 'go' ? 'Salvando…' : 'Estou indo'}
          </button>
        )}
        {waiting && (
          <span className="live-group">
            <label className="visually-hidden" htmlFor={`assign-${a.id}`}>
              Quem mandar ao {place}
            </label>
            <select id={`assign-${a.id}`} value={target} onChange={(e) => setTarget(e.target.value)} disabled={!!busy}>
              <option value="">Mandar alguém…</option>
              {crew.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                  {s.jobTitle ? ` (${s.jobTitle})` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              disabled={!!busy || !target}
              aria-label={targetName ? `Mandar ${targetName} ao ${place}` : `Mandar alguém ao ${place}`}
              onClick={() => run('assign', () => dataSource.manager.assignAlert(a.id, target), `${targetName} foi chamado no app.`)}
            >
              {busy === 'assign' ? 'Mandando…' : targetName ? `Mandar ${targetName}` : 'Mandar'}
            </button>
          </span>
        )}
        <span className="live-group">
          <label className="visually-hidden" htmlFor={`outcome-${a.id}`}>
            Como terminou o pedido do {place}
          </label>
          <select id={`outcome-${a.id}`} value={outcome} onChange={(e) => setOutcome(e.target.value as AlertOutcome)} disabled={!!busy}>
            <option value="">Como terminou…</option>
            {ALERT_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABEL[o]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn"
            disabled={!!busy || !outcome}
            aria-label={`Marcar o pedido do ${place} como resolvido`}
            onClick={() => outcome && run('done', () => dataSource.staff.resolveAlert(a.id, outcome), `Pedido do ${place} resolvido.`)}
          >
            {busy === 'done' ? 'Salvando…' : 'Resolvido'}
          </button>
        </span>
      </div>
      <div aria-live="polite" className="live-feedback">
        {error ? <p className="error">{error}</p> : done ? <p>{done}</p> : null}
      </div>
    </li>
  );
}
