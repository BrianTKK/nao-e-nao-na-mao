import { STATUS_LABEL, type AlertStatus } from '@nenm/shared';
import { Icon, type IconName } from './Icon';

/**
 * Forma de cada estado: o estado nunca depende só da cor (cor + ícone + rótulo).
 * Novo = triângulo, visto = olho, a caminho = pessoa andando, resolvido = check.
 */
const ICON: Record<AlertStatus, IconName> = {
  open: 'alert',
  seen: 'eye',
  on_the_way: 'walking',
  resolved: 'check-circle',
  cancelled: 'x',
};

type StatusBadgeProps = {
  status: AlertStatus;
  /**
   * 'badge' (padrão): selo com contorno, para tabelas e listas ("Novo" é o único cheio).
   * 'label': ícone e rótulo em maiúsculas na cor do estado, sem selo (topo do cartão do alerta).
   */
  variant?: 'badge' | 'label';
  /** Faz o ícone pulsar (1,2 s): só no alerta novo. */
  pulse?: boolean;
};

export function StatusBadge({ status, variant = 'badge', pulse = false }: StatusBadgeProps) {
  const label = variant === 'label';
  return (
    <span className={`${label ? 'status-label' : 'status-badge'} status-${status}`}>
      <Icon name={ICON[status]} size={label ? 22 : 16} className={pulse ? 'pulse' : undefined} />
      {STATUS_LABEL[status]}
    </span>
  );
}
