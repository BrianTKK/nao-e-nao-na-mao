// Cartelas animadas (cenas 1, 2, 11 e 12): uma página HTML local, na identidade da Mariana,
// gravada como as telas do produto. Cada passo põe uma classe no <body> (s1, s2...), e o CSS
// da cartela faz o texto entrar. Sem som: o áudio é silêncio total.

/** Entrada padrão: sobe 24 px e aparece em 0,8 s. `.in-N` entra com a classe sN no body. */
export const enterCss = (n = 8) =>
  [
    '.in{opacity:0;transform:translateY(24px);transition:opacity .8s ease,transform .8s cubic-bezier(.2,.8,.2,1)}',
    ...Array.from({ length: n }, (_, i) => `body.s${i + 1} .in-${i + 1}{opacity:1;transform:none}`),
    // .out-N some com a classe sN (troca de cartela).
    '.out{transition:opacity .6s ease,transform .6s ease}',
    ...Array.from({ length: n }, (_, i) => `body.s${i + 1} .out-${i + 1}{opacity:0;transform:translateY(-16px)}`),
  ].join('\n');

/**
 * Clipe de cartela. `steps`: [{ hold, evento, fala }], na ordem; o passo i liga a classe s(i+1)
 * e espera `hold` ms. `lead`: tela só com o fundo antes do primeiro passo.
 */
export function cardClip({ html, css = '', steps, lead = 800, ...rest }) {
  return {
    ...rest,
    preset: 'card',
    panes: [{ html: `<style>${enterCss(steps.length)}\n${css}</style>${html}` }],
    async ready() {},
    async run({ act }) {
      act.mark('cartela', 'Início: só o fundo da Mariana');
      await act.pause(lead);
      for (const [i, s] of steps.entries()) {
        await act.stage('go', `s${i + 1}`);
        act.mark('cartela', s.evento, undefined, s.fala);
        await act.pause(s.hold);
      }
      act.mark('cartela', 'Fim');
      return { sounds: [] };
    },
  };
}
