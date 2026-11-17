import { useEffect, useRef } from 'react';
import type { MenuFile } from '@nenm/shared';
import { BackButton } from './BackButton';

/**
 * O cardápio do próprio local, cadastrado pela equipe, ocupando a tela. Quem
 * olhar por cima do ombro vê o cardápio que conhece; o alerta continua por
 * trás. O "Voltar" fica fixo no canto, pequeno, como em qualquer visualizador.
 */
export function MenuView({ venueName, files, url, onBack }: { venueName: string; files: MenuFile[]; url: string | null; onBack: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  return (
    <main className="menu">
      <h1 ref={titleRef} tabIndex={-1} className="menu-title">
        {venueName} · Cardápio
      </h1>
      <div className="menu-pages">
        {files.map((f, i) => (
          <img key={f.id} src={f.url} alt={`Cardápio, página ${i + 1} de ${files.length}`} loading={i < 2 ? 'eager' : 'lazy'} decoding="async" />
        ))}
      </div>
      {url && (
        <p className="menu-more">
          <a href={url} target="_blank" rel="noopener noreferrer">
            Cardápio digital do local
          </a>
        </p>
      )}
      <BackButton onBack={onBack} />
    </main>
  );
}
