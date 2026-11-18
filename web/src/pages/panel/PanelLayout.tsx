import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { NavLink, Outlet } from 'react-router';
import { DEMO_PASSWORD, DataError, type StaffMember } from '@nenm/shared';
import { dataSource, showDemo } from '../../data/source';
import { useDocumentTitle } from '../../hooks/hooks';
import { Icon } from '../../components/Icon';
import { Logo } from '../../components/Logo';
import { useWebAlarm } from './useWebAlarm';
import './panel.css';

export interface PanelContext {
  me: StaffMember;
}

/** Painel da gerência: login, navegação e as páginas filhas. */
export function PanelLayout() {
  useDocumentTitle('Painel do bar · Mariana');
  const [me, setMe] = useState<StaffMember | null | undefined>(undefined);

  useEffect(() => {
    dataSource.staff.currentStaff().then(setMe);
  }, []);

  const signOut = useCallback(async () => {
    await dataSource.staff.signOut();
    setMe(null);
  }, []);

  if (me === undefined) return <p className="panel-loading">Carregando…</p>;
  if (me === null) return <Login onSignedIn={setMe} />;
  return <Panel me={me} signOut={signOut} />;
}

function Panel({ me, signOut }: { me: StaffMember; signOut: () => void }) {
  const alarm = useWebAlarm(me.role === 'manager');

  return (
    <div className="panel">
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      <header className="panel-header">
        <p className="panel-brand">
          <Logo variant="negativo" size={28} clearSpace={false} label="Mariana, painel do bar" />
        </p>
        <div className="panel-header-actions">
          <p className="panel-who">
            {me.fullName} · {me.role === 'manager' ? 'Gerência' : 'Equipe'}
          </p>
          <button type="button" className="btn panel-signout" onClick={signOut}>
            <Icon name="log-out" size={20} />
            Sair
          </button>
          {me.role === 'manager' && (
            <button
              type="button"
              className={`btn panel-alarm${alarm.enabled ? ' panel-alarm-on' : ''}${alarm.ringingCount > 0 && alarm.enabled ? ' panel-alarm-ringing' : ''}`}
              aria-pressed={alarm.enabled}
              onClick={alarm.toggle}
              title="Bipe repetido e aviso do navegador enquanto houver alerta que ninguém viu"
            >
              <Icon name="bell" size={20} />
              {alarm.enabled ? (alarm.needsTap ? 'Alarme: toque na página para liberar o som' : 'Alarme ligado') : 'Ligar o alarme'}
            </button>
          )}
        </div>
      </header>
      {alarm.enabled && alarm.notifications === 'denied' && (
        <p className="panel-alarm-note">
          <Icon name="info" size={20} />
          O navegador bloqueou os avisos deste site: o bipe toca só com a aba aberta.
        </p>
      )}
      <div className="visually-hidden" aria-live="assertive">
        {alarm.announcement}
      </div>
      <nav className="panel-nav" aria-label="Seções do painel">
        <NavLink to="/painel" end>
          Visão geral
        </NavLink>
        <NavLink to="/painel/alertas">Alertas</NavLink>
        <NavLink to="/painel/equipe">Equipe</NavLink>
        <NavLink to="/painel/qr-codes">QR codes</NavLink>
        <NavLink to="/painel/cardapio">Cardápio e Wi-Fi</NavLink>
        <NavLink to="/painel/relatorio">Relatório do mês</NavLink>
      </nav>
      <main id="conteudo" className="panel-main" tabIndex={-1}>
        {me.role === 'manager' ? (
          <Outlet context={{ me } satisfies PanelContext} />
        ) : (
          <section className="card">
            <h1>Este painel é da gerência</h1>
            <p>A equipe usa o app no celular para receber e atender os alertas.</p>
          </section>
        )}
      </main>
    </div>
  );
}

function Login({ onSignedIn }: { onSignedIn: (m: StaffMember) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await dataSource.staff.signIn(email, password));
    } catch (err) {
      setError(
        err instanceof DataError && err.code === 'invalid_credentials'
          ? 'E-mail ou senha incorretos.'
          : err instanceof DataError && err.code === 'rate_limited'
            ? 'Muitas tentativas. Espere alguns minutos.'
            : 'Não foi possível entrar. Tente de novo.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="panel-login">
      <Logo variant="negativo" size={36} clearSpace={false} className="panel-login-logo" />
      <h1>Painel do bar</h1>
      <p className="muted">Entre com a conta da gerência.</p>
      <form onSubmit={submit} className="card" noValidate>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div aria-live="assertive">{error && <p className="error">{error}</p>}</div>
        <button type="submit" className="btn btn-calm btn-block" aria-busy={busy || undefined} disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      {showDemo && (
        <aside className="panel-demo">
          <p className="label-caps muted">Demonstração · bar fictício</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setEmail('marta@bar-esquina.test');
              setPassword(DEMO_PASSWORD);
            }}
          >
            Preencher com a conta de teste da gerente
          </button>
        </aside>
      )}
    </main>
  );
}
