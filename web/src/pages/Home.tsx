import { Link } from 'react-router';
import { DEMO_SPOTS } from '@nenm/shared';
import { useDocumentTitle } from '../hooks/hooks';
import './home.css';

/** Página inicial do projeto: o que é e por onde testar. */
export function Home() {
  useDocumentTitle('Não é Não na Mão · pedido de ajuda discreto no bar');
  const restroom = DEMO_SPOTS[0];
  return (
    <main className="home">
      <p className="home-kicker">FIAP · Global Solution CitizenTech</p>
      <h1>Não é Não na Mão</h1>
      <p className="home-lead">
        Um QR code no banheiro ou na mesa do bar. A mulher pede ajuda sem instalar nada, e o celular da equipe vibra na hora com o local.
      </p>

      <ol className="home-steps">
        <li className="card">
          <h2>1. Ela lê o QR code</h2>
          <p>Escolhe o que está acontecendo. Sem login, sem app, com o 190 e o 180 sempre à mão.</p>
        </li>
        <li className="card">
          <h2>2. A equipe recebe</h2>
          <p>O app do segurança ou do garçom vibra com o local. Quem toca em "Estou indo" assume o pedido.</p>
        </li>
        <li className="card">
          <h2>3. Ela vê quem vem</h2>
          <p>"Diego, de camisa preta, está indo até você." O bar fica com o registro que o protocolo Não se Cale pede.</p>
        </li>
      </ol>

      <section className="home-demo" aria-labelledby="demo">
        <h2 id="demo">Testar a demonstração</h2>
        <p className="muted">Bar, equipe e histórico fictícios.</p>
        <div className="home-actions">
          <Link className="btn btn-primary" to={`/q/${restroom.code}`}>
            Abrir o QR code do {restroom.label.toLowerCase()}
          </Link>
          <Link className="btn" to="/painel">
            Abrir o painel da gerência
          </Link>
        </div>
      </section>
    </main>
  );
}
