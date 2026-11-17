import type { MenuFile, PublicSpot } from '@nenm/shared';

/**
 * O que a página de ajuda mostra para quem olha a tela por cima do ombro.
 *
 * Pedido do Brian (16/11/2026): o disfarce é o cardápio do próprio local,
 * cadastrado pela equipe, "SE houver"; "Um cardapio falso não é uma boa opção
 * pois se as pessoas ao lado conhecem o local, sabem que não é o cardapio do
 * local".
 * - menu-images: fotos do cardápio (ou páginas do PDF), mostradas dentro da
 *   página, com o "Voltar" discreto por perto;
 * - menu-link: o cardápio digital que o local já usa. Abre em outra aba, porque
 *   quase todo cardápio digital proíbe ser mostrado dentro de outra página
 *   (X-Frame-Options ou CSP frame-ancestors); a aba da ajuda continua aberta.
 * - sem cardápio cadastrado: null, a página fica sem disfarce.
 *
 * Outra alternativa para o local sem cardápio (a escolher pelo Brian) entra
 * como um novo `kind` aqui, sem mexer no resto da página.
 */
export type Cover = { kind: 'menu-images'; files: MenuFile[]; url: string | null } | { kind: 'menu-link'; url: string };

export function coverFor(spot: PublicSpot): Cover | null {
  const { files, url } = spot.menu;
  if (files.length > 0) return { kind: 'menu-images', files, url };
  if (url) return { kind: 'menu-link', url };
  return null;
}
