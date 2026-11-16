import { useEffect, useRef } from 'react';
import type { MenuSection } from '@nenm/shared';

const price = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Disfarce: um cardápio comum do bar. Quem olhar a tela por cima do ombro vê
 * só preços de chope e petisco. O pedido continua ativo por trás.
 * "Voltar" fica no fim, discreto, como em qualquer cardápio.
 */
export function MenuDisguise({ venueName, menu, onBack }: { venueName: string; menu: MenuSection[]; onBack: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  return (
    <main className="menu">
      <h1 ref={titleRef} tabIndex={-1}>
        {venueName}
      </h1>
      <p className="muted">Cardápio</p>
      {menu.map((section) => (
        <section key={section.section} className="menu-section">
          <h2>{section.section}</h2>
          <ul>
            {section.items.map((item) => (
              <li key={item.name}>
                <span>{item.name}</span>
                <span className="menu-price">{price(item.price)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <button type="button" className="btn btn-ghost menu-back" onClick={onBack}>
        Voltar
      </button>
    </main>
  );
}
