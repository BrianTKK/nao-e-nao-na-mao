import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import {
  ALERT_KINDS,
  DataError,
  KIND_LABEL,
  isActive,
  calledMessage,
  displayCode,
  onTheWayMessage,
  type AlertKind,
  type PublicAlert,
  type PublicSpot,
} from '@nenm/shared';
import { dataSource } from '../../data/source';
import { session, useDocumentTitle, useOnline } from '../../hooks/hooks';
import { MenuDisguise } from './MenuDisguise';
import { StatusSteps } from './StatusSteps';
import { CounterCard } from './CounterCard';
import './help.css';

type Phase =
  | { name: 'loading' }
  | { name: 'not_found' }
  | { name: 'choose' }
  | { name: 'sending'; kind: AlertKind }
  | { name: 'tracking'; token: string }
  | { name: 'counter'; reason: 'offline' | 'rate_limited' | 'error' };

const tokenKey = (code: string) => `nenm.alert.${code.toUpperCase()}`;

/**
 * Página que o QR code do banheiro ou da mesa abre. Sem login, sem instalar.
 * - O título da aba é sempre "Cardápio · <bar>" (neutro).
 * - "Ver cardápio" troca a tela pelo cardápio do bar, para quem estiver olhando.
 * - Sem conexão, a página vira um cartão para mostrar no balcão.
 */
export function HelpPage() {
  const { code = '' } = useParams();
  const online = useOnline();
  const [spot, setSpot] = useState<PublicSpot | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });
  const [alert, setAlert] = useState<PublicAlert | null>(null);
  const [hidden, setHidden] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useDocumentTitle(spot ? `Cardápio · ${spot.venueName}` : 'Cardápio');

  // Carrega o local e retoma um pedido em andamento (se a página recarregou).
  useEffect(() => {
    let alive = true;
    dataSource.public
      .getSpot(code)
      .then((s) => {
        if (!alive) return;
        if (!s) return setPhase({ name: 'not_found' });
        setSpot(s);
        const saved = session.get(tokenKey(code));
        setPhase(saved ? { name: 'tracking', token: saved } : { name: 'choose' });
      })
      .catch(() => alive && setPhase({ name: 'counter', reason: 'offline' }));
    return () => {
      alive = false;
    };
  }, [code]);

  // Acompanha o pedido.
  const token = phase.name === 'tracking' ? phase.token : null;
  useEffect(() => {
    if (!token) return;
    return dataSource.public.watchAlert(token, (a) => {
      setAlert(a);
      if (!a) {
        session.set(tokenKey(code), null);
        setPhase({ name: 'choose' });
      }
    });
  }, [token, code]);

  // Leva o foco ao título a cada troca de etapa (leitor de tela acompanha).
  useEffect(() => {
    if (!hidden) headingRef.current?.focus();
  }, [phase.name, hidden]);

  // Esc esconde a tela na hora.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHidden(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const send = useCallback(
    async (kind: AlertKind) => {
      if (!online) return setPhase({ name: 'counter', reason: 'offline' });
      setPhase({ name: 'sending', kind });
      try {
        const res = await dataSource.public.createAlert(code, kind);
        session.set(tokenKey(code), res.token);
        setPhase({ name: 'tracking', token: res.token });
      } catch (err) {
        const reason = err instanceof DataError && err.code === 'rate_limited' ? 'rate_limited' : err instanceof DataError ? 'error' : 'offline';
        setPhase({ name: 'counter', reason });
      }
    },
    [code, online],
  );

  const cancel = useCallback(async () => {
    if (!token) return;
    if (!window.confirm('Cancelar o pedido? A equipe deixa de vir.')) return;
    try {
      await dataSource.public.cancelAlert(token);
    } catch {
      // já encerrado: o acompanhamento mostra o estado final
    }
  }, [token]);

  const restart = useCallback(() => {
    session.set(tokenKey(code), null);
    setAlert(null);
    setPhase({ name: 'choose' });
  }, [code]);

  if (hidden && spot) {
    return <MenuDisguise venueName={spot.venueName} menu={spot.menu} onBack={() => setHidden(false)} />;
  }

  return (
    <div className="help">
      <header className="help-header">
        <span className="help-venue">{spot?.venueName ?? ' '}</span>
        {spot && (
          <button
            type="button"
            className="btn help-hide"
            onClick={() => setHidden(true)}
            aria-label="Esconder esta tela e mostrar o cardápio do bar"
          >
            Ver cardápio
          </button>
        )}
      </header>

      <main className="help-main" aria-busy={phase.name === 'loading' || phase.name === 'sending'}>
        {phase.name === 'loading' && <p className="muted">Carregando…</p>}

        {phase.name === 'not_found' && (
          <>
            <h1 ref={headingRef} tabIndex={-1}>
              Este QR code não está ativo
            </h1>
            <p>Procure alguém da equipe do bar ou ligue para o 190 se estiver em perigo.</p>
            <EmergencyLinks />
          </>
        )}

        {(phase.name === 'choose' || phase.name === 'sending') && spot && (
          <>
            <h1 ref={headingRef} tabIndex={-1}>
              Precisa de ajuda? A equipe do bar vem até você.
            </h1>
            <p className="muted">
              Você está em: <strong className="help-spot">{spot.label}</strong>. Só a equipe do bar recebe o pedido.
            </p>
            <div className="help-options" role="group" aria-label="O que está acontecendo?">
              {ALERT_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className="btn btn-primary help-option"
                  disabled={phase.name === 'sending'}
                  aria-busy={phase.name === 'sending' && phase.kind === kind}
                  onClick={() => send(kind)}
                >
                  {phase.name === 'sending' && phase.kind === kind ? 'Enviando…' : KIND_LABEL[kind]}
                </button>
              ))}
            </div>
            <EmergencyLinks />
          </>
        )}

        {phase.name === 'tracking' && alert && (
          <>
            <h1 ref={headingRef} tabIndex={-1}>
              {headline(alert)}
            </h1>
            <div aria-live="polite" className="help-live">
              {alert.status === 'on_the_way' && (
                <p className="help-onway">{onTheWayMessage(alert.responderFirstName, alert.responderAppearance)}</p>
              )}
              {alert.status === 'seen' && alert.assignedFirstName && (
                <p className="help-onway help-called">{calledMessage(alert.assignedFirstName, alert.assignedAppearance)}</p>
              )}
            </div>
            <StatusSteps alert={alert} />
            <p className="help-code">
              Sua palavra-código: <strong className="help-word">{displayCode(alert.shortCode)}</strong>
              <span className="muted"> Quem vier da equipe vai dizer essa palavra.</span>
            </p>
            {isActive(alert.status) ? (
              <div className="help-actions">
                <button type="button" className="btn" onClick={cancel}>
                  Cancelar pedido
                </button>
              </div>
            ) : (
              <div className="help-actions">
                <button type="button" className="btn" onClick={restart}>
                  Fazer um novo pedido
                </button>
              </div>
            )}
            <EmergencyLinks />
          </>
        )}

        {phase.name === 'counter' && (
          <CounterCard
            headingRef={headingRef}
            reason={phase.reason}
            spotLabel={spot?.label ?? null}
            helpPhrase={spot?.helpPhrase ?? null}
            onRetry={spot ? () => setPhase({ name: 'choose' }) : undefined}
          />
        )}
      </main>
    </div>
  );
}

function headline(a: PublicAlert): string {
  switch (a.status) {
    case 'open':
      return 'Pedido enviado à equipe';
    case 'seen':
      return a.assignedFirstName ? 'A equipe chamou alguém para você' : 'A equipe viu o seu pedido';
    case 'on_the_way':
      return 'Alguém está indo até você';
    case 'resolved':
      return 'Pedido encerrado';
    case 'cancelled':
      return 'Pedido cancelado';
  }
}

function EmergencyLinks() {
  return (
    <nav className="help-emergency" aria-label="Telefones de emergência">
      <p className="muted">Em perigo agora?</p>
      <a className="btn" href="tel:190">
        Ligar 190 · Polícia
      </a>
      <a className="btn" href="tel:180">
        Ligar 180 · Central da Mulher
      </a>
    </nav>
  );
}
