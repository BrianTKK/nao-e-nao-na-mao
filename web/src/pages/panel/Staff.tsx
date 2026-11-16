import { useEffect, useState } from 'react';
import type { StaffMember } from '@nenm/shared';
import { dataSource } from '../../data/source';

const date = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : 'Pendente');

/** Equipe do bar: quem recebe os pedidos, o curso e a roupa do dia. */
export function Staff() {
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  useEffect(() => {
    dataSource.manager.listStaff().then(setStaff);
  }, []);

  return (
    <>
      <h1>Equipe</h1>
      <p className="muted">Quem está no app recebe os pedidos de ajuda. A roupa do dia aparece para quem pediu, quando alguém está a caminho.</p>
      {!staff ? (
        <p className="muted">Carregando…</p>
      ) : (
        <ul className="staff-list">
          {staff.map((s) => (
            <li key={s.id} className="card staff-card">
              <h2>{s.fullName}</h2>
              <p className="muted">{s.jobTitle ?? (s.role === 'manager' ? 'Gerência' : 'Equipe')}</p>
              <dl>
                <dt>Curso Não se Cale</dt>
                <dd>{date(s.trainedAt)}</dd>
                <dt>Roupa de hoje</dt>
                <dd>{s.appearance ?? 'Não informada'}</dd>
                <dt>Situação</dt>
                <dd>{s.active ? 'Ativa' : 'Inativa'}</dd>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
