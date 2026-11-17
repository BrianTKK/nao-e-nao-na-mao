import { Icon } from '../../components/Icon';

/** "Voltar" dos disfarces: fixo no canto de baixo, pequeno, como em qualquer visualizador. */
export function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="btn menu-back" onClick={onBack} aria-label="Voltar: volta à página de ajuda">
      <Icon name="arrow-left" size={18} />
      Voltar
    </button>
  );
}
