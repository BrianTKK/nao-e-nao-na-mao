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
import { Icon, type IconName } from '../../components/Icon';
import { StatusSteps } from './StatusSteps';
import { CounterCard } from './CounterCard';
import { MenuView } from './MenuView';
import { WifiView } from './WifiView';
import { EmergencyLinks } from './EmergencyLinks';
import { coversFor, firstInPage, type InPageCover } from './cover';
import './help.css';

type Phase =
  | { name: 'loading' }
  | { name: 'not_found' }
  | { name: 'choose' }
  | { name: 'sending'; kind: AlertKind }
  | { name: 'tracking'; token: string }
  | { name: 'counter'; reason: 'offline' | 'rate_limited' | 'error' };

const tokenKey = (code: string) => `nenm.alert.${code.toUpperCase()}`;

/** Ícone de traço de cada opção (sálvia só no ícone; as três têm o mesmo peso). */
const KIND_ICON: Record<AlertKind, IconName> = {
  unsafe: 'alert-circle',
  leave: 'door',
  talk: 'message',
};

/**
 * Página que o QR code do banheiro ou da mesa abre. Sem login, sem instalar.
 * - O título da aba é só o nome do bar (neutro): não diz "ajuda".
 * - Sem logo da Mariana: para quem olha por cima do ombro, a página tem de
 *   parecer coisa do bar (a marca já está na placa do QR).
 * - "Ver cardápio" e "Wi-Fi do local" (só se o local cadastrou) trocam a tela
 *   pelo cardápio ou pelo Wi-Fi do próprio local, para quem estiver olhando;
 *   ver cover.ts.
 * - Sem conexão, a página vira um cartão para mostrar no balcão.
 */
export function HelpPage() {
  const { code = '' } = useParams();
  const online = useOnline();
  const [spot, setSpot] = useState<PublicSpot | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });
  const [alert, setAlert] = useState<PublicAlert | null>(null);
  const [shown, setShown] = useState<InPageCover['kind'] | null>(null);
  const hidden = shown !== null;
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Cancelar tem um segundo passo na própria tela (nada de diálogo do sistema).
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmTitleRef = useRef<HTMLParagraphElement>(null);

  // Título da aba: o nome do bar. Sem o local (carregando, QR inativo ou sem rede) um aviso
  // curto e neutro; nunca "Carregando…" para sempre.
  useDocumentTitle(spot ? spot.venueName : phase.name === 'loading' ? 'Carregando…' : phase.name === 'counter' ? 'Sem conexão' : 'Página indisponível');

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
  // No acompanhamento o título só existe quando o pedido chega: `hasAlert` cobre isso.
  const hasAlert = alert !== null;
  useEffect(() => {
    if (!hidden) headingRef.current?.focus();
  }, [phase.name, hidden, hasAlert]);

  const covers = spot ? coversFor(spot) : [];
  const escCover = firstInPage(covers)?.kind ?? null;

  // Esc troca a tela na hora pelo primeiro disfarce que fica dentro da página.
  useEffect(() => {
    if (!escCover) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShown(escCover);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [escCover]);

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

  // A pergunta de confirmação recebe o foco quando aparece (leitor de tela lê).
  useEffect(() => {
    if (confirming) confirmTitleRef.current?.focus();
  }, [confirming]);

  const keepAlert = useCallback(() => {
    setConfirming(false);
    // Devolve o foco ao botão que abriu a confirmação.
    requestAnimationFrame(() => cancelButtonRef.current?.focus());
  }, []);

  const cancel = useCallback(async () => {
    if (!token) return;
    setCancelling(true);
    try {
      await dataSource.public.cancelAlert(token);
    } catch {
      // já encerrado: o acompanhamento mostra o estado final
    }
    setCancelling(false);
    setConfirming(false);
    // A confirmação some com o pedido encerrado: o foco volta ao título.
    requestAnimationFrame(() => headingRef.current?.focus());
  }, [token]);

  const restart = useCallback(() => {
    session.set(tokenKey(code), null);
    setAlert(null);
    setConfirming(false);
    setPhase({ name: 'choose' });
  }, [code]);

  const showing = hidden ? covers.find((c) => c.kind === shown) : undefined;
  if (spot && showing?.kind === 'menu-images') {
    return <MenuView venueName={spot.venueName} files={showing.files} url={showing.url} onBack={() => setShown(null)} />;
  }
  if (spot && showing?.kind === 'wifi') {
    return <WifiView venueName={spot.venueName} ssid={showing.ssid} password={showing.password} onBack={() => setShown(null)} />;
  }

  return (
    <div className="help">
      <header className="help-header">
        <span className="help-venue">{spot?.venueName ?? ' '}</span>
        {covers.length > 0 && (
          <span className="help-covers">
            {covers.map((c) =>
              c.kind === 'menu-link' ? (
                // Abre em outra aba: o cardápio digital quase nunca aceita ser mostrado dentro desta página.
                <a
                  key={c.kind}
                  className="btn help-hide"
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Ver cardápio: abre o cardápio digital do local em outra aba; esta página continua aberta"
                >
                  <Icon name="menu-book" size={20} />
                  Ver cardápio
                </a>
              ) : (
                <button
                  key={c.kind}
                  type="button"
                  className="btn help-hide"
                  onClick={() => setShown(c.kind)}
                  aria-label={
                    c.kind === 'wifi'
                      ? 'Wi-Fi do local: mostra a rede e a senha no lugar desta tela'
                      : 'Ver cardápio: mostra o cardápio do local no lugar desta tela'
                  }
                >
                  <Icon name={c.kind === 'wifi' ? 'wifi' : 'menu-book'} size={20} />
                  {c.kind === 'wifi' ? 'Wi-Fi do local' : 'Ver cardápio'}
                </button>
              ),
            )}
          </span>
        )}
      </header>

      <main className="help-main" aria-busy={phase.name === 'loading' || phase.name === 'sending'}>
        {phase.name === 'loading' && <p className="muted">Carregando…</p>}

        {phase.name === 'not_found' && (
          <>
            <h1 ref={headingRef} tabIndex={-1}>
              Este QR code não está ativo
            </h1>
            <p className="help-lede">Procure alguém da equipe do bar ou ligue para o 190 se estiver em perigo.</p>
            <EmergencyLinks />
          </>
        )}

        {(phase.name === 'choose' || phase.name === 'sending') && spot && (
          <>
            <h1 ref={headingRef} tabIndex={-1}>
              Precisa de ajuda? A nossa equipe vem até você.
            </h1>
            <p className="help-lede">
              Você está em: <strong className="help-spot">{spot.label}</strong>. Só a nossa equipe recebe o pedido.
            </p>
            <div className="help-options" role="group" aria-label="O que está acontecendo?">
              {ALERT_KINDS.map((kind) => {
                const busy = phase.name === 'sending' && phase.kind === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    className="btn help-option"
                    disabled={phase.name === 'sending'}
                    aria-busy={busy}
                    onClick={() => send(kind)}
                  >
                    <Icon name={KIND_ICON[kind]} size={28} className="help-option-icon" />
                    <span className="help-option-label">{busy ? 'Enviando…' : KIND_LABEL[kind]}</span>
                    <span className="help-option-chevron" aria-hidden="true">
                      <Icon name="chevron-right" size={20} />
                    </span>
                  </button>
                );
              })}
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
            <div className="help-code">
              <p className="help-code-label">Sua palavra-código:</p>
              <p className="help-word">{displayCode(alert.shortCode)}</p>
              <div className="help-code-perforation" aria-hidden="true" />
              <p className="help-code-note">Quem vier da equipe vai dizer essa palavra.</p>
            </div>
            <StatusSteps alert={alert} />
            <div className="help-actions">
              {!isActive(alert.status) ? (
                <button type="button" className="btn btn-block" onClick={restart}>
                  Fazer um novo pedido
                </button>
              ) : confirming ? (
                <div className="help-confirm" role="group" aria-labelledby="help-confirm-title">
                  <p id="help-confirm-title" ref={confirmTitleRef} tabIndex={-1} className="help-confirm-title">
                    Cancelar o pedido?
                  </p>
                  <p className="help-confirm-note">A equipe deixa de vir.</p>
                  <div className="help-confirm-actions">
                    <button type="button" className="btn help-confirm-yes" onClick={cancel} disabled={cancelling} aria-busy={cancelling}>
                      {cancelling ? 'Cancelando…' : 'Sim, cancelar'}
                    </button>
                    <button type="button" className="btn" onClick={keepAlert} disabled={cancelling}>
                      Não
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" ref={cancelButtonRef} className="btn btn-danger btn-block" onClick={() => setConfirming(true)}>
                  Cancelar pedido
                </button>
              )}
            </div>
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
