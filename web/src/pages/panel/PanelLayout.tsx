import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { NavLink, Outlet } from 'react-router';
import { DEMO_PASSWORD, DataError, type StaffMember } from '@nenm/shared';
import { dataSource } from '../../data/source';
import { useDocumentTitle } from '../../hooks/hooks';
import './panel.css';

export interface PanelContext {
  me: StaffMember;
}

/** Painel da gerência: login, navegação e as páginas filhas. */
export function PanelLayout() {
  useDocumentTitle('Painel do bar · Não é Não na Mão');
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

  return (
    <div className="panel">
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      <header className="panel-header">
        <div>
          <p className="panel-brand">Não é Não na Mão</p>
          <p className="muted panel-who">
            {me.fullName} · {me.role === 'manager' ? 'Gerência' : 'Equipe'}
          </p>
        </div>
        <button type="button" className="btn" onClick={signOut}>
          Sair
        </button>
      </header>
      <nav className="panel-nav" aria-label="Seções do painel">
        <NavLink to="/painel" end>
          Visão geral
        </NavLink>
        <NavLink to="/painel/pedidos">Pedidos</NavLink>
        <NavLink to="/painel/equipe">Equipe</NavLink>
        <NavLink to="/painel/qr-codes">QR codes</NavLink>
      </nav>
      <main id="conteudo" className="panel-main" tabIndex={-1}>
        {me.role === 'manager' ? (
          <Outlet context={{ me } satisfies PanelContext} />
        ) : (
          <section className="card">
            <h1>Este painel é da gerência</h1>
            <p>A equipe usa o app no celular para receber e atender os pedidos.</p>
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
      setError(err instanceof DataError && err.code === 'invalid_credentials' ? 'E-mail ou senha incorretos.' : 'Não foi possível entrar. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="panel-login">
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
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      {dataSource.kind === 'mock' && (
        <aside className="panel-demo">
          <p>
            <strong>Demonstração (bar fictício)</strong>
          </p>
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
