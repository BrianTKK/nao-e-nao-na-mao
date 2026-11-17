import { Link } from 'react-router';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { useDocumentTitle } from '../hooks/hooks';
import './home.css';

export function NotFound() {
  useDocumentTitle('Página não encontrada');
  return (
    <main className="home notfound">
      <Link className="home-logo-link" to="/">
        <Logo variant="negativo" size={40} clearSpace={false} label="Mariana, voltar ao início" />
      </Link>
      <h1>Página não encontrada</h1>
      <p className="muted">O endereço pode ter mudado.</p>
      <Link className="btn" to="/">
        <Icon name="arrow-left" size={20} />
        Voltar ao início
      </Link>
    </main>
  );
}
