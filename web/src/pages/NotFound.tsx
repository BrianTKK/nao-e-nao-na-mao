import { Link } from 'react-router';
import { useDocumentTitle } from '../hooks/hooks';

export function NotFound() {
  useDocumentTitle('Página não encontrada');
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: 'var(--s-xl) var(--s-md)' }}>
      <h1>Página não encontrada</h1>
      <p className="muted">O endereço pode ter mudado.</p>
      <Link to="/">Voltar ao início</Link>
    </main>
  );
}
