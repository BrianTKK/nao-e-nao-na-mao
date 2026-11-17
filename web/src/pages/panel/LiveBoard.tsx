import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import {
  ALERT_OUTCOMES,
  DataError,
  KIND_STAFF_LABEL,
  OUTCOME_LABEL,
  displayCode,
  elapsedSeconds,
  formatDuration,
  type Alert,
  type AlertOutcome,
  type StaffMember,
} from '@nenm/shared';
import { dataSource } from '../../data/source';
import { StatusBadge } from '../../components/StatusBadge';
import { Icon } from '../../components/Icon';

const ERRORS: Partial<Record<DataError['code'], string>> = {
  already_taken: 'Outra pessoa já está indo.',
  invalid_transition: 'Este alerta já mudou de estado.',
  staff_not_found: 'Essa pessoa não está ativa na equipe.',
};

/**
 * Quadro ao vivo de quem coordena. Cada alerta aberto tem até quatro controles,
 * nenhum desabilitado: "Estou indo" (a própria gerência vai, ação principal),
 * "Vi o alerta", "Mandar alguém ▾" (tocar na pessoa já manda) e "Encerrar ▾"
 * (tocar no desfecho já encerra). Cada ação muda na hora a página da mulher e
 * o app da equipe. O alerta novo é o único cartão cheio, em latão, com os
 * entalhes do tíquete.
 */
export function LiveBoard({ alerts, staff, me, now }: { alerts: Alert[]; staff: StaffMember[]; me: StaffMember; now: number }) {
  const crew = staff.filter((s) => s.active && s.id !== me.id);
  const boardRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const [said, setSaid] = useState('');

  // Uma ação pode tirar da tela o controle que estava com o foco ("Vi o alerta"
  // some quando o alerta vira Visto; o cartão some quando é encerrado). O foco
  // volta ao nome do local do mesmo cartão ou, se o cartão saiu, ao quadro.
  useLayoutEffect(() => {
    const last = lastFocused.current;
    if (!last || last.isConnected) return;
    lastFocused.current = null;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const cardId = last.closest<HTMLElement>('[data-alert-id]')?.dataset.alertId;
    const heading = cardId ? document.getElementById(`alert-${cardId}`) : null;
    (heading?.isConnected ? heading : boardRef.current)?.focus();
  });

  return (
    <div
      ref={boardRef}
      className="live-board"
      tabIndex={-1}
      onFocus={(e) => {
        if (e.target !== boardRef.current) lastFocused.current = e.target as HTMLElement;
      }}
      onBlur={(e) => {
        // Clique fora, num ponto sem controle: não há foco para devolver depois.
        if (!e.relatedTarget && e.target.isConnected) lastFocused.current = null;
      }}
    >
      <div className="visually-hidden" aria-live="polite">
        {said}
      </div>
      {alerts.length === 0 ? (
        <p className="muted">Nenhum alerta em aberto.</p>
      ) : (
        <ul className="live-list">
          {alerts.map((a) => (
            <LiveItem key={a.id} alert={a} crew={crew} now={now} announce={setSaid} />
          ))}
        </ul>
      )}
    </div>
  );
}

function whoLine(a: Alert): ReactNode {
  if (a.responderName)
    return (
      <>
        <strong>{a.responderName}</strong> está indo até ela
      </>
    );
  if (a.assignedToName)
    return (
      <>
        {a.assignedByName?.split(' ')[0] ?? 'A gerência'} mandou <strong>{a.assignedToName}</strong>; esperando o "Estou indo"
      </>
    );
  if (a.status === 'seen') return <strong>Visto; ninguém foi mandado ainda</strong>;
  return <strong>Ninguém viu ainda</strong>;
}

function LiveItem({
  alert: a,
  crew,
  now,
  announce,
}: {
  alert: Alert;
  crew: StaffMember[];
  now: number;
  announce: (text: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const itemRef = useRef<HTMLLIElement>(null);
  const perforationRef = useRef<HTMLHRElement>(null);
  const [notchY, setNotchY] = useState<number | null>(null);

  const isNew = a.status === 'open';
  const waiting = a.status === 'open' || a.status === 'seen';
  const place = a.spotLabel;

  // Os entalhes do tíquete ficam na altura do picote, que desce quando o nome do local quebra a linha.
  useLayoutEffect(() => {
    const item = itemRef.current;
    const perforation = perforationRef.current;
    if (!isNew || !item || !perforation) return;
    const update = () => setNotchY(Math.round(perforation.offsetTop + perforation.offsetHeight / 2));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(item);
    return () => ro.disconnect();
  }, [isNew]);

  const run = async (key: string, fn: () => Promise<void>, doneText: string) => {
    if (busy) return; // nada fica desabilitado: um segundo toque durante o envio é ignorado
    setBusy(key);
    setError(null);
    setDone(null);
    try {
      await fn();
      setDone(doneText);
      announce(doneText);
    } catch (err) {
      const text = (err instanceof DataError && ERRORS[err.code]) || 'Não foi possível salvar. Tente de novo.';
      setError(text);
      announce(text);
    } finally {
      setBusy(null);
    }
  };

  const crewItems: MenuItem[] = crew.map((s) => ({
    value: s.id,
    label: s.fullName.split(' ')[0],
    detail: s.jobTitle ?? undefined,
  }));
  const outcomeItems: MenuItem[] = ALERT_OUTCOMES.map((o) => ({ value: o, label: OUTCOME_LABEL[o] }));

  const bgStyle = notchY === null ? undefined : ({ '--notch-y': `${notchY}px` } as CSSProperties);

  return (
    <li
      ref={itemRef}
      data-alert-id={a.id}
      className={`live-item live-${a.status}${isNew ? ' alert-new ticket-arrive' : ''}`}
      aria-labelledby={`alert-${a.id}`}
    >
      {/* Fundo do cartão numa camada própria: o recorte dos entalhes não corta a lista dos menus. */}
      <span className={`live-bg${isNew ? ' ticket' : ''}`} style={bgStyle} aria-hidden="true">
        {/* A faixa refaz a animação a cada troca de estado: o cartão "acende" quando muda. */}
        <span key={`${a.status}-${a.assignedToId ?? ''}`} className="live-flash" />
      </span>

      <div className="live-top">
        <StatusBadge status={a.status} variant="label" pulse={isNew} />
        <span className="num live-time">há {formatDuration(elapsedSeconds(a.createdAt, now), true)}</span>
      </div>
      <h3 id={`alert-${a.id}`} className="live-place" tabIndex={-1}>
        {place}
      </h3>
      <p className="live-kind">{KIND_STAFF_LABEL[a.kind]}</p>

      <hr ref={perforationRef} className="perforation live-perforation" />

      <p className="live-word" title="Quem for diz esta palavra a ela">
        <span className="live-word-label">Palavra</span> <span className="display live-word-value">{displayCode(a.shortCode)}</span>
      </p>
      <p className="live-who">{whoLine(a)}</p>

      <div className="live-actions">
        {waiting && (
          <button
            type="button"
            className="btn btn-primary"
            aria-busy={busy === 'go' || undefined}
            aria-label={`Estou indo ao ${place}: vou pessoalmente`}
            onClick={() => run('go', () => dataSource.staff.startResponse(a.id), `Você está indo ao ${place}. Ela já vê seu nome.`)}
          >
            <Icon name="walking" size={20} />
            {busy === 'go' ? 'Salvando…' : 'Estou indo'}
          </button>
        )}
        {a.status === 'open' && (
          <button
            type="button"
            className="btn"
            aria-busy={busy === 'ack' || undefined}
            aria-label={`Vi o alerta do ${place}`}
            onClick={() => run('ack', () => dataSource.staff.ackAlert(a.id), `Alerta do ${place} marcado como visto.`)}
          >
            <Icon name="eye" size={20} />
            {busy === 'ack' ? 'Salvando…' : 'Vi o alerta'}
          </button>
        )}
        {waiting && crewItems.length > 0 && (
          <ActionMenu
            label={busy === 'assign' ? 'Mandando…' : 'Mandar alguém'}
            buttonName={`Mandar alguém ao ${place}`}
            menuName={`Quem mandar ao ${place}`}
            items={crewItems}
            onPick={(item) => run('assign', () => dataSource.manager.assignAlert(a.id, item.value), `${item.label} foi chamado no app.`)}
          />
        )}
        <ActionMenu
          className={a.status === 'on_the_way' ? 'btn-calm' : undefined}
          label={busy === 'done' ? 'Salvando…' : 'Encerrar'}
          buttonName={`Encerrar o alerta do ${place}`}
          menuName={`Como terminou o alerta do ${place}`}
          align="end"
          items={outcomeItems}
          onPick={(item) =>
            run('done', () => dataSource.staff.resolveAlert(a.id, item.value as AlertOutcome), `Alerta do ${place} encerrado: ${item.label}.`)
          }
        />
      </div>
      {(error || done) && (
        <div className="live-feedback">
          {error ? (
            <p className="error">
              <Icon name="alert-circle" size={20} /> {error}
            </p>
          ) : (
            <p>{done}</p>
          )}
        </div>
      )}
    </li>
  );
}

type MenuItem = { value: string; label: string; detail?: string };

/**
 * Botão que abre uma lista de escolhas; tocar numa escolha já executa.
 * Teclado: Enter, espaço ou seta para baixo abre com o foco na primeira (seta
 * para cima, na última); setas, Home e End andam pela lista; Tab também anda e,
 * ao sair da lista, fecha; Esc fecha e devolve o foco ao botão.
 */
function ActionMenu({
  label,
  buttonName,
  menuName,
  items,
  onPick,
  align = 'start',
  className,
}: {
  label: string;
  buttonName: string;
  menuName: string;
  items: MenuItem[];
  onPick: (item: MenuItem) => void;
  align?: 'start' | 'end';
  className?: string;
}) {
  const [open, setOpen] = useState<false | 'first' | 'last'>(false);
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const menuItems = () => Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);

  useEffect(() => {
    if (!open) return;
    const all = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    (open === 'last' ? all[all.length - 1] : all[0])?.focus();
    // Toque fora do botão e da lista fecha.
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen('first');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen('last');
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const all = menuItems();
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    const go = (n: number) => {
      e.preventDefault();
      all[(n + all.length) % all.length]?.focus();
    };
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(all.length - 1);
  };

  return (
    <div
      ref={wrapRef}
      className={`live-menu live-menu-${align}`}
      onBlur={(e) => {
        // Tab para fora da lista (ou do botão com a lista aberta) fecha.
        if (open && e.relatedTarget && !wrapRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className={`btn live-menu-button${className ? ` ${className}` : ''}`}
        aria-haspopup="menu"
        aria-expanded={!!open}
        aria-controls={open ? id : undefined}
        aria-label={buttonName}
        onClick={() => setOpen(open ? false : 'first')}
        onKeyDown={onButtonKeyDown}
      >
        {label}
        <Icon name="chevron-down" size={20} className="live-menu-chevron" />
      </button>
      {open && (
        <div ref={listRef} id={id} role="menu" aria-label={menuName} className={`live-menu-pop live-menu-pop-${align}`} onKeyDown={onListKeyDown}>
          {items.map((item) => (
            <button
              key={item.value}
              type="button"
              role="menuitem"
              className="live-menu-item"
              onClick={() => {
                close();
                onPick(item);
              }}
            >
              <span>{item.label}</span>
              {item.detail && <span className="muted live-menu-detail">{item.detail}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
