import { Link } from 'react-router';
import { DEMO_SPOTS } from '@nenm/shared';
import { QrCode } from '../components/QrCode';
import { useDocumentTitle } from '../hooks/hooks';
import './home.css';

/** Endereço que o Expo Go abre (o Metro na VPS, atrás de expo-naoenao.obrian.me). */
const EXPO_URL = import.meta.env.VITE_EXPO_URL ?? 'exps://expo-naoenao.obrian.me';

/**
 * Página pública para o grupo e para quem avalia testarem o app da equipe no
 * próprio celular, sem depender do PC de ninguém. O QR é gerado aqui mesmo.
 */
export function TryApp() {
  useDocumentTitle('Testar o app no celular · Não é Não na Mão');
  const restroom = DEMO_SPOTS[0];
  return (
    <main className="home try">
      <p className="home-kicker">Não é Não na Mão · demonstração</p>
      <h1>Testar o app da equipe no celular</h1>
      <p className="home-lead">O app é de quem trabalha no bar: recebe o alerta e avisa que está indo.</p>

      <section className="try-grid" aria-labelledby="passos">
        <div>
          <h2 id="passos">Passo a passo</h2>
          <ol className="try-steps">
            <li>
              <strong>Instale o Expo Go</strong> (grátis):{' '}
              <a href="https://play.google.com/store/apps/details?id=host.exp.exponent" target="_blank" rel="noreferrer">
                Android (Google Play)
              </a>{' '}
              ou{' '}
              <a href="https://apps.apple.com/app/expo-go/id982107779" target="_blank" rel="noreferrer">
                iPhone (App Store)
              </a>
              . Se já tiver, atualize: o app usa a versão SDK 58.
            </li>
            <li>
              <strong>Leia o QR code desta página.</strong> No Android, abra o Expo Go e toque em "Scan QR code". No iPhone, use a câmera e toque no aviso que
              aparece.
            </li>
            <li>
              <strong>Espere carregar.</strong> A primeira vez pode levar até 1 minuto.
            </li>
            <li>
              <strong>Entre com a conta de teste:</strong> toque em "Preencher com a conta de teste do Diego" e em "Entrar". É uma conta só do bar
              de demonstração, que volta ao estado inicial todo dia.
            </li>
            <li>
              <strong>Dispare um alerta</strong> pelo botão "Simular um alerta" no fim da lista, ou abrindo{' '}
              <Link to={`/q/${restroom.code}`}>a página do QR do {restroom.label.toLowerCase()}</Link> em outro aparelho. O celular vibra e o
              alerta aparece. Toque nele e em "Estou indo".
            </li>
          </ol>
        </div>

        <figure className="card try-qr">
          <QrCode value={EXPO_URL} label="QR code para abrir o app no Expo Go" size={220} />
          <figcaption>
            <p>Leia com o Expo Go ou com a câmera.</p>
            {/* No próprio celular, ler o QR é impossível: o link abre direto no Expo Go. */}
            <a className="btn btn-primary" href={EXPO_URL}>
              Já estou no celular: abrir no Expo Go
            </a>
            <p className="muted try-url">{EXPO_URL}</p>
          </figcaption>
        </figure>
      </section>

      <section aria-labelledby="nao-abriu" className="try-help">
        <h2 id="nao-abriu">Se não abrir</h2>
        <ul>
          <li>Confira se o Expo Go está atualizado. Uma versão antiga mostra um aviso de versão incompatível.</li>
          <li>Feche o Expo Go por completo e leia o QR de novo.</li>
          <li>Teste com os dados móveis, se o Wi-Fi bloquear o endereço.</li>
          <li>Se aparecer erro de carregamento, espere 1 minuto e tente de novo: o servidor pode estar reiniciando.</li>
        </ul>
      </section>

      <section aria-labelledby="outras" className="try-help">
        <h2 id="outras">As outras partes do sistema (no navegador)</h2>
        <ul>
          <li>
            <Link to={`/q/${restroom.code}`}>Página que a mulher abre pelo QR do bar</Link>: sem login e sem instalar nada.
          </li>
          <li>
            <Link to="/painel">Painel da gerência</Link>: quadro ao vivo, equipe, QR codes e relatório (login de gerência, também com o Brian).
          </li>
        </ul>
      </section>
    </main>
  );
}
