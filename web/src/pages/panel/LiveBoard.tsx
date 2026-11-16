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
 * Quadro ao vivo de quem coordena: cada pedido aberto, com o tempo correndo,
 * quem foi direcionado e quem está indo. Daqui a gerência direciona o pedido
 * para alguém da equipe, assume ela mesma e encerra o que assumiu.
 */
export function LiveBoard({ alerts, staff, me, now }: { alerts: Alert[]; staff: StaffMember[]; me: StaffMember; now: number }) {
  if (alerts.length === 0) return <p className="muted">Nenhum pedido em aberto.</p>;
  const crew = staff.filter((s) => s.active);
  return (
    <ul className="live-list">
      {alerts.map((a) => (
        <LiveItem key={a.id} alert={a} crew={crew} me={me} now={now} />
      ))}
    </ul>
  );
}

function LiveItem({ alert: a, crew, me, now }: { alert: Alert; crew: StaffMember[]; me: StaffMember; now: number }) {
  const [target, setTarget] = useState(a.assignedToId ?? '');
  const [outcome, setOutcome] = useState<AlertOutcome | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err instanceof DataError && ERRORS[err.code]) || 'Não foi possível salvar. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  const canAssign = a.status === 'open' || a.status === 'seen';
  const mine = a.responderId === me.id;
  const labelId = `alert-${a.id}`;

  return (
    <li className={`live-item live-${a.status}`} aria-labelledby={labelId}>
      <div className="live-head">
        <StatusBadge status={a.status} />
        <strong id={labelId}>{a.spotLabel}</strong>
        <span>{KIND_STAFF_LABEL[a.kind]}</span>
        <span className="muted">
          há {formatDuration(elapsedSeconds(a.createdAt, now), true)} · código {a.shortCode}
        </span>
      </div>
      <p className="live-who">
        {a.responderName
          ? `${a.responderName} está indo`
          : a.assignedToName
            ? `Direcionado para ${a.assignedToName}, aguardando "Estou indo"`
            : 'Ninguém indo ainda'}
      </p>

      <div className="live-actions">
        {canAssign && (
          <>
            <label className="visually-hidden" htmlFor={`assign-${a.id}`}>
              Direcionar o pedido de {a.spotLabel} para
            </label>
            <select id={`assign-${a.id}`} value={target} onChange={(e) => setTarget(e.target.value)} disabled={busy}>
              <option value="">Direcionar para…</option>
              {crew.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                  {s.jobTitle ? ` (${s.jobTitle})` : ''}
                </option>
              ))}
            </select>
            <button type="button" className="btn" disabled={busy || !target} onClick={() => run(() => dataSource.manager.assignAlert(a.id, target))}>
              Direcionar
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => dataSource.staff.startResponse(a.id))}>
              Assumir (eu vou)
            </button>
          </>
        )}
        {(mine || canAssign) && (
          <>
            <label className="visually-hidden" htmlFor={`outcome-${a.id}`}>
              Como terminou o pedido de {a.spotLabel}
            </label>
            <select id={`outcome-${a.id}`} value={outcome} onChange={(e) => setOutcome(e.target.value as AlertOutcome)} disabled={busy}>
              <option value="">Encerrar como…</option>
              {ALERT_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {OUTCOME_LABEL[o]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              disabled={busy || !outcome}
              onClick={() => outcome && run(() => dataSource.staff.resolveAlert(a.id, outcome))}
            >
              Encerrar
            </button>
          </>
        )}
      </div>
      <div aria-live="assertive">{error && <p className="error">{error}</p>}</div>
    </li>
  );
}
