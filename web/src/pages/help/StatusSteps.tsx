import type { PublicAlert } from '@nenm/shared';
import { Icon } from '../../components/Icon';

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
 * Linha do tempo do pedido, vertical. Cada etapa tem forma e texto, não só cor:
 * feito = check, atual = ponto cheio sálvia (o "carimbo"), futuro = círculo
 * vazio. O único movimento da página é o carimbo do passo atual ao avançar
 * (a tela não pode chamar a atenção de quem estiver por perto).
 */
export function StatusSteps({ alert }: { alert: PublicAlert }) {
  if (alert.status === 'cancelled') return null;
  const current = reached(alert);
  const times = [alert.createdAt, alert.seenAt, alert.onTheWayAt, alert.resolvedAt];
  return (
    <ol className="steps" aria-label="Andamento do pedido">
      {STEPS.map((step, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        const at = times[i] && i <= current ? time(times[i]) : null;
        return (
          <li key={step.key} className={`step step-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="step-mark" aria-hidden="true">
              {state === 'done' && <Icon name="check" size={18} />}
              {state === 'current' && <span className="step-stamp" />}
            </span>
            <span className="step-label">
              {step.label}
              {state === 'done' && <span className="visually-hidden"> (concluído)</span>}
              {state === 'todo' && <span className="visually-hidden"> (ainda não)</span>}
            </span>
            {at && <span className="step-time tabular">{at}</span>}
          </li>
        );
      })}
    </ol>
  );
}
