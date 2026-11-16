import { useState, type RefObject } from 'react';

const ALPHABET = 'ACDEFHJKMNPRTWXY34679';
const localCode = () =>
  Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

const REASON_TEXT = {
  offline: 'Sem conexão no momento.',
  rate_limited: 'Muitos pedidos deste local agora.',
  error: 'Não foi possível enviar o pedido.',
} as const;

/**
 * Plano B quando o pedido não sai (sem sinal, limite de pedidos ou erro):
 * um cartão grande para mostrar no balcão, com o código combinado do bar.
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
        {spotLabel && <p>Local: {spotLabel}</p>}
        <p>
          Código: <strong>{code.split('').join(' ')}</strong>
        </p>
        {helpPhrase && <p className="muted">Ou use o código combinado do bar: {helpPhrase}.</p>}
      </div>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Tentar enviar de novo
        </button>
      )}
      <nav className="help-emergency" aria-label="Telefones de emergência">
        <a className="btn" href="tel:190">
          Ligar 190 · Polícia
        </a>
        <a className="btn" href="tel:180">
          Ligar 180 · Central da Mulher
        </a>
      </nav>
    </section>
  );
}
