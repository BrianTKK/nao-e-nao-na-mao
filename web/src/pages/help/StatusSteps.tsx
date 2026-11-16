import type { PublicAlert } from '@nenm/shared';

const STEPS = [
  { key: 'sent', label: 'Pedido enviado' },
  { key: 'seen', label: 'A equipe viu' },
  { key: 'on_the_way', label: 'A caminho' },
  { key: 'resolved', label: 'Encerrado' },
] as const;

function reached(a: PublicAlert): number {
  if (a.status === 'resolved') return 3;
  if (a.status === 'on_the_way') return 2;
  if (a.status === 'seen') return 1;
  return 0;
}

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;

/**
 * Linha do tempo do pedido. Avança devagar e sem piscar (motion discreto de
 * propósito: a tela não pode chamar a atenção de quem estiver por perto).
 * Cada etapa tem texto e marcador, não só cor.
 */
export function StatusSteps({ alert }: { alert: PublicAlert }) {
  if (alert.status === 'cancelled') return null;
  const current = reached(alert);
  const times = [alert.createdAt, alert.seenAt, alert.onTheWayAt, alert.resolvedAt];
  return (
    <ol className="steps" aria-label="Andamento do pedido">
      {STEPS.map((step, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={step.key} className={`step step-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="step-dot" aria-hidden="true">
              {state === 'done' ? '✓' : ''}
            </span>
            <span className="step-label">
              {step.label}
              {state === 'done' && <span className="visually-hidden"> (concluído)</span>}
            </span>
            {times[i] && i <= current && <span className="step-time">{time(times[i])}</span>}
          </li>
        );
      })}
    </ol>
  );
}
