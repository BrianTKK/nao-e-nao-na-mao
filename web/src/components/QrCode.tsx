import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** QR code em SVG (nítido na impressão). */
export function QrCode({ value, label, size = 160 }: { value: string; label: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#FFFFFF' } })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(null));
    return () => {
      alive = false;
    };
  }, [value]);

  return (
    <div
      role="img"
      aria-label={label}
      style={{ width: size, height: size, background: '#fff', borderRadius: 8, padding: 4 }}
      // O SVG é gerado localmente pela biblioteca qrcode a partir da URL do local.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
