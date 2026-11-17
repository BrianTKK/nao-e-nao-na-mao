import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { BackButton } from './BackButton';

/**
 * Disfarce do Wi-Fi do local: a tela mostra a rede e a senha, como quem pediu
 * a senha do Wi-Fi. O alerta continua por trás. A senha é do bar e só aparece
 * para quem abriu a página do QR dele.
 */
export function WifiView({ venueName, ssid, password, onBack }: { venueName: string; ssid: string; password: string | null; onBack: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  useEffect(() => titleRef.current?.focus(), []);

  const copy = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied('ok');
    } catch {
      // Reserva para navegador sem a API de área de transferência: seleciona e copia.
      const el = document.getElementById('wifi-password');
      const selection = window.getSelection();
      if (el && selection) {
        const range = document.createRange();
        range.selectNodeContents(el);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setCopied(document.execCommand?.('copy') ? 'ok' : 'fail');
    }
  };

  return (
    <main className="wifi">
      <h1 ref={titleRef} tabIndex={-1} className="menu-title">
        {venueName} · Wi-Fi
      </h1>
      <dl className="wifi-card">
        <div>
          <dt>Rede</dt>
          <dd className="wifi-value">{ssid}</dd>
        </div>
        <div>
          <dt>Senha</dt>
          <dd className="wifi-value" id={password ? 'wifi-password' : undefined}>
            {password ?? 'Rede aberta, sem senha'}
          </dd>
        </div>
      </dl>
      {password && (
        <button type="button" className="btn btn-calm btn-lg btn-block wifi-copy" onClick={copy}>
          <Icon name={copied === 'ok' ? 'check' : 'copy'} size={22} />
          {copied === 'ok' ? 'Senha copiada' : 'Copiar a senha'}
        </button>
      )}
      <p className="muted wifi-hint" aria-live="polite">
        {copied === 'fail' ? 'Não deu para copiar: toque e segure a senha para selecionar.' : 'Nas configurações do celular, escolha a rede e cole a senha.'}
      </p>
      <BackButton onBack={onBack} />
    </main>
  );
}
