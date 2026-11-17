/**
 * Abrir o alerta tocado na notificação.
 *
 * Com o app aberto, o toque navega na hora. Com o app fechado (cold start), o
 * toque chega antes de o app estar pronto: o layout ainda espera as fontes e a
 * tela inicial ainda vai trocar a rota (Redirect para /alerts ou /login). Uma
 * navegação feita nesse momento se perde ou é substituída. Por isso o alerta
 * fica pendente aqui, e a lista de alertas o abre quando monta, já com a
 * sessão resolvida (também depois do login).
 */
let pending: string | null = null;

export function setPendingAlert(alertId: string): void {
  pending = alertId;
}

/** Devolve o alerta pendente (uma vez só) ou null. */
export function takePendingAlert(): string | null {
  const id = pending;
  pending = null;
  return id;
}
