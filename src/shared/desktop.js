/* merlin · o app de desktop
 *
 * o Merlin instalado no Windows (e depois no Mac) e uma casca Tauri que abre
 * ESTE site, e nao uma copia dele (desktop/README.md). por isso quase nada no
 * sistema sabe que o app existe: a sessao e o mesmo cookie, os dados sao o
 * mesmo localStorage, e o que sai num deploy aparece no app sem reinstalar.
 *
 * o que so o app tem — a bandeja, a janela do rastreador — chega por aqui.
 * fora dele cada funcao vira nada, e a tela que chamou nao precisa perguntar
 * onde esta: no navegador, `setStatus` simplesmente nao tem bandeja para pintar.
 */

const bridge = () => (typeof window !== "undefined" && window.__TAURI__ && window.__TAURI__.core) || null;

export const isDesktop = () => !!bridge();

/* um comando que falha (app antigo, permissao que mudou) nao derruba a tela:
   a bandeja ficar sem texto e melhor que o rastreador ficar em branco */
function call(cmd, args) {
  const b = bridge();
  if (!b) return Promise.resolve(null);
  return b.invoke(cmd, args || {}).catch((e) => { console.warn("desktop: " + cmd, e); return null; });
}

/* o que a bandeja diz: o tooltip no Windows, o texto ao lado do icone na
   barra de menus do Mac */
export const setStatus = (text) => call("set_status", { text: String(text || "").slice(0, 120) });

/* abre (ou traz para a frente) a janela inteira do Merlin, numa pagina */
export const openMain = (path) => call("open_main", { path: String(path || "") });

export const hideTracker = () => call("hide_tracker");

/* a janela do rastreador tem a altura do que ela mostra: a faixa recolhida ou
   o cartao aberto, sem vao embaixo. quem mede e a pagina, que sabe o que
   desenhou; o app so ajusta (e, perto do pe da tela, cresce para cima). */
export const fitTracker = (height) => call("fit_tracker", { height: Math.ceil(height) });
