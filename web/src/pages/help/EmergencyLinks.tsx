import { Icon } from '../../components/Icon';

const NUMBERS = [
  { tel: '190', name: 'Polícia' },
  { tel: '180', name: 'Central da Mulher' },
] as const;

/**
 * 190 e 180 lado a lado, como rodapé: linhas só com borda, sem cor viva, para
 * não disputar com o pedido à equipe (proposta 2). O nome do serviço fica na
 * linha de baixo; no zoom de texto grande os dois empilham.
 */
export function EmergencyLinks({ prompt = true }: { prompt?: boolean }) {
  return (
    <nav className="help-emergency" aria-label="Telefones de emergência">
      {prompt && <p className="help-emergency-prompt">Em perigo agora?</p>}
      <div className="help-emergency-grid">
        {NUMBERS.map((n) => (
          <a key={n.tel} className="help-call" href={`tel:${n.tel}`}>
            <span className="help-call-number">
              <Icon name="phone" size={20} className="help-call-icon" />
              Ligar {n.tel}
            </span>{' '}
            <span className="help-call-name">{n.name}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
