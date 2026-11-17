import { useState, type RefObject } from 'react';
import { displayCode, pickCodeWord } from '@nenm/shared';
import { EmergencyLinks } from './EmergencyLinks';

const localCode = () => displayCode(pickCodeWord([]));

const REASON_TEXT = {
  offline: 'Sem conexão no momento.',
  rate_limited: 'Muitos pedidos deste local agora.',
  error: 'Não foi possível enviar o pedido.',
} as const;

/**
 * Plano B quando o pedido não sai (sem sinal, limite de pedidos ou erro):
 * um cartão grande para mostrar no balcão, com o código combinado do bar.
 * O cartão é "papel" (claro, com a Folha), para ser lido de longe por quem
 * está do outro lado do balcão.
 */
export function CounterCard({
  headingRef,
  reason,
  spotLabel,
  helpPhrase,
  onRetry,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  reason: keyof typeof REASON_TEXT;
  spotLabel: string | null;
  helpPhrase: string | null;
  onRetry?: () => void;
}) {
  const [code] = useState(localCode);
  return (
    <section className="counter" aria-labelledby="counter-title">
      <p className="muted">{REASON_TEXT[reason]}</p>
      <h1 id="counter-title" ref={headingRef} tabIndex={-1}>
        Mostre esta tela a alguém da equipe ou no balcão
      </h1>
      <div className="counter-card">
        <p className="counter-big">PEDIDO DE AJUDA</p>
        {spotLabel && <p className="counter-line">Local: {spotLabel}</p>}
        <hr className="perforation" />
        <p className="counter-line">
          Palavra-código: <strong className="counter-word">{code}</strong>
        </p>
        {helpPhrase && <p className="counter-muted">Ou use o código combinado do bar: {helpPhrase}.</p>}
      </div>
      {onRetry && (
        <button type="button" className="btn btn-block help-retry" onClick={onRetry}>
          Tentar enviar de novo
        </button>
      )}
      <EmergencyLinks prompt={false} />
    </section>
  );
}
