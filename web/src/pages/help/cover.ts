import type { MenuFile, PublicSpot } from '@nenm/shared';

/**
 * O que a página de ajuda mostra para quem olha a tela por cima do ombro.
 * Cada disfarce vem do próprio local e só aparece se ele cadastrou.
 *
 * - menu-images: fotos do cardápio (ou páginas do PDF), mostradas dentro da
 *   página, com o "Voltar" discreto por perto. Pedido do Brian (16/11/2026):
 *   "Um cardapio falso não é uma boa opção pois se as pessoas ao lado
 *   conhecem o local, sabem que não é o cardapio do local".
 * - menu-link: o cardápio digital que o local já usa. Abre em outra aba, porque
 *   quase todo cardápio digital proíbe ser mostrado dentro de outra página
 *   (X-Frame-Options ou CSP frame-ancestors); a aba da ajuda continua aberta.
 * - wifi: a rede e a senha do Wi-Fi do local, como quem pediu a senha ao
 *   garçom. Decisão do Brian (16/11/2026): "Vamos adicionar a opção de wi-fi,
 *   como opção opcional dentro do wi-fi do local também".
 * - nada cadastrado: lista vazia, a página fica sem disfarce.
 *
 * Outro disfarce entra como um novo `kind` aqui e uma tela em HelpPage.
 */
export type Cover =
  | { kind: 'menu-images'; files: MenuFile[]; url: string | null }
  | { kind: 'menu-link'; url: string }
  | { kind: 'wifi'; ssid: string; password: string | null };

export type InPageCover = Exclude<Cover, { kind: 'menu-link' }>;

export function coversFor(spot: PublicSpot): Cover[] {
  const covers: Cover[] = [];
  const { files, url } = spot.menu;
  if (files.length > 0) covers.push({ kind: 'menu-images', files, url });
  else if (url) covers.push({ kind: 'menu-link', url });
  if (spot.wifi) covers.push({ kind: 'wifi', ssid: spot.wifi.ssid, password: spot.wifi.password });
  return covers;
}

/** O disfarce que o Esc abre: o primeiro que fica dentro da página (o link abre outra aba). */
export function firstInPage(covers: Cover[]): InPageCover | null {
  return (covers.find((c) => c.kind !== 'menu-link') as InPageCover | undefined) ?? null;
}
