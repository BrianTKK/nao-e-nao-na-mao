import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useOutletContext } from 'react-router';
import { DataError, type StaffMember } from '@nenm/shared';
import { dataSource } from '../../data/source';
import { Icon } from '../../components/Icon';
import type { PanelContext } from './PanelLayout';

const date = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : 'Pendente');

const ERRORS: Partial<Record<DataError['code'], string>> = {
  email_taken: 'Já existe uma conta com esse e-mail.',
  cannot_change_self: 'Você não pode tirar o próprio acesso de gerência.',
  staff_not_found: 'Pessoa não encontrada.',
};
const message = (err: unknown) => (err instanceof DataError && ERRORS[err.code]) || 'Não foi possível salvar. Confira os campos e tente de novo.';

/** Equipe do bar: quem recebe os alertas, o curso Não se Cale e quem está ativo. */
export function Staff() {
  const { me } = useOutletContext<PanelContext>();
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => dataSource.manager.listStaff().then(setStaff), []);
  useEffect(() => {
    load();
  }, [load]);

  const update = async (s: StaffMember, patch: Parameters<typeof dataSource.manager.updateStaff>[1]) => {
    setError(null);
    try {
      await dataSource.manager.updateStaff(s.id, patch);
      await load();
    } catch (err) {
      setError(message(err));
    }
  };

  return (
    <>
      <h1>Equipe</h1>
      <p className="muted">
        Quem está ativo recebe os alertas no app. Desativar tira o acesso na hora, inclusive do celular que estiver aberto.
      </p>
      <NewStaffForm onCreated={load} />
      <div aria-live="assertive">{error && <p className="error">{error}</p>}</div>
      {!staff ? (
        <p className="muted">Carregando…</p>
      ) : (
        <ul className="staff-list">
          {staff.map((s) => (
            <li key={s.id} className={`card staff-card${s.active ? '' : ' staff-inactive'}`}>
              <h2>{s.fullName}</h2>
              <p className="muted">
                {s.jobTitle ?? (s.role === 'manager' ? 'Gerência' : 'Equipe')} · {s.role === 'manager' ? 'gerência' : 'equipe'}
              </p>
              <dl>
                <dt>E-mail</dt>
                <dd className="staff-email">{s.email ?? '—'}</dd>
                <dt>Curso Não se Cale</dt>
                <dd>{date(s.trainedAt)}</dd>
                <dt>Roupa de hoje</dt>
                <dd>{s.appearance ?? 'Não informada'}</dd>
                <dt>Situação</dt>
                <dd>{s.active ? 'Ativa' : 'Desativada'}</dd>
              </dl>
              <div className="staff-actions">
                <label htmlFor={`trained-${s.id}`}>Data do curso</label>
                <input
                  id={`trained-${s.id}`}
                  type="date"
                  defaultValue={s.trainedAt?.slice(0, 10) ?? ''}
                  onBlur={(e) => e.target.value !== (s.trainedAt?.slice(0, 10) ?? '') && update(s, { trainedAt: e.target.value || null })}
                />
                {s.id !== me.id && (
                  <button type="button" className={`btn${s.active ? ' btn-danger' : ''}`} onClick={() => update(s, { active: !s.active })}>
                    {s.active ? `Desativar ${s.fullName.split(' ')[0]}` : `Reativar ${s.fullName.split(' ')[0]}`}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function NewStaffForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ fullName: '', email: '', jobTitle: '', role: 'staff' as StaffMember['role'], trainedAt: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(null);
    if (form.password.length < 8) return setError('A senha provisória precisa de 8 caracteres ou mais.');
    setBusy(true);
    try {
      const created = await dataSource.manager.createStaff({
        fullName: form.fullName,
        email: form.email,
        jobTitle: form.jobTitle || undefined,
        role: form.role,
        trainedAt: form.trainedAt || null,
        password: form.password,
      });
      setDone(`Cadastro de ${created.fullName} feito. Entregue o e-mail e a senha provisória à pessoa.`);
      setForm({ fullName: '', email: '', jobTitle: '', role: 'staff', trainedAt: '', password: '' });
      onCreated();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="card staff-form">
      <summary>
        <Icon name="plus" size={20} />
        Cadastrar alguém na equipe
      </summary>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="sf-name">Nome completo</label>
            <input id="sf-name" required minLength={3} maxLength={80} value={form.fullName} onChange={set('fullName')} />
          </div>
          <div className="field">
            <label htmlFor="sf-email">E-mail</label>
            <input id="sf-email" type="email" required autoComplete="off" value={form.email} onChange={set('email')} />
          </div>
          <div className="field">
            <label htmlFor="sf-job">Função</label>
            <input id="sf-job" maxLength={40} placeholder="Ex.: Segurança" value={form.jobTitle} onChange={set('jobTitle')} />
          </div>
          <div className="field">
            <label htmlFor="sf-role">Acesso</label>
            <select id="sf-role" value={form.role} onChange={set('role')}>
              <option value="staff">Equipe (app)</option>
              <option value="manager">Gerência (app e painel)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="sf-trained">Data do curso Não se Cale</label>
            <input id="sf-trained" type="date" value={form.trainedAt} onChange={set('trainedAt')} />
          </div>
          <div className="field">
            <label htmlFor="sf-pass">Senha provisória</label>
            <input id="sf-pass" type="text" autoComplete="new-password" minLength={8} value={form.password} onChange={set('password')} aria-describedby="sf-pass-hint" />
            <small id="sf-pass-hint" className="muted">
              8 caracteres ou mais.
            </small>
          </div>
        </div>
        <div aria-live="polite">
          {error && <p className="error">{error}</p>}
          {done && <p>{done}</p>}
        </div>
        <button type="submit" className="btn btn-calm" aria-busy={busy || undefined} disabled={busy}>
          {busy ? 'Salvando…' : 'Cadastrar'}
        </button>
      </form>
    </details>
  );
}
