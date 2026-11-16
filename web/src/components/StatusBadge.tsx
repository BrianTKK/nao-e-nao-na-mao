import { STATUS_LABEL, type AlertStatus } from '@nenm/shared';

/** Ícone + texto: o estado nunca depende só da cor. */
const ICON: Record<AlertStatus, string> = {
  open: '●',
  seen: '◉',
  on_the_way: '➜',
  resolved: '✓',
  cancelled: '×',
};

export function StatusBadge({ status }: { status: AlertStatus }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span aria-hidden="true">{ICON[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}
