/* merlin · reconhecer o pedido de montar (funil, app, mapa, planilha, apresentação, protótipo)
   separado de build.js de proposito: o campo da home e o Ctrl+K, que estao em
   toda tela, so precisam saber SE e um pedido de montar — o resto (o desenho
   do funil, o projeto de app) so carrega na tela do assistente. */

/* `the` e `of` levam o artigo de cada um: "antes de montar a planilha",
   "rascunho do funil". `cash`: o pedido que cita o caixa leva os números
   dele junto (build.js, citesCash); `product`: o que nomeia um produto leva o
   que o Merlin sabe dele (build.js, productContext); `spec`: o protótipo
   leva o app como está (build.js, prototypeContext), e não cria documento —
   junta telas e ações a um app que já existe, por isso o "abrir" vai direto
   ao modo telas da aba fluxos (`?ver=telas`, apps.jsx) */
export const BUILD = {
  funnel: { label: "funil", collection: "funnels", href: "funnels.html#", create: "criar o funil", the: "o funil", of: "do funil" },
  app: { label: "app", collection: "apps", href: "apps.html#", create: "criar o app", the: "o app", of: "do app" },
  map: { label: "mapa", collection: "maps", href: "maps.html#", create: "criar o mapa", the: "o mapa", of: "do mapa" },
  sheet: { label: "planilha", collection: "sheets", href: "sheets.html#", create: "criar a planilha", the: "a planilha", of: "da planilha", cash: true },
  deck: { label: "apresentação", collection: "decks", href: "slides.html#", create: "criar a apresentação", the: "a apresentação", of: "da apresentação", product: true },
  prototype: { label: "protótipo", collection: "apps", href: "apps.html?ver=telas#", create: "juntar ao app", the: "o protótipo", of: "do protótipo", spec: true }
};

/* "monta um funil pra minha consultoria", "quero um app de agenda", "me ajuda
   a desenhar um mapa mental do lançamento". o verbo de montar (ou o "quero")
   tem que vir antes do que se monta: "revisar o funil" e "o app caiu" nao sao
   pedido. com dois do mesmo verbo, vale o que vem mais perto dele: "faz uma
   planilha de custos do app" e planilha. a duracao continua mandando — "montar o funil 2h" e tarefa, e quem
   chama decide isso antes de perguntar aqui. */
const VERB = "(?:mont[ae]r?|desenh[ae]r?|cri[ae]r?|fa[zç]a?|fazer|ger[ae]r?|estrutur[ae]r?|planej[ae]r?|rascunh[ae]r?|esbo[çc][ae]r?|quero|preciso de|me ajud[ae] a \\w+)";
const WHAT = [
  ["map", "mapa(?:s)?(?: mental| mentais)?"],
  ["sheet", "planilhas?"],
  ["deck", "apresenta[çc](?:ão|ao|ões|oes)|slides?|ppt|deck"],
  ["prototype", "prot[óo]tipos?|wireframes?"],
  ["funnel", "funil|funis"],
  ["app", "app|aplicativo|saas|sistema|plataforma"]
];
const INTENT = WHAT.map(([kind, noun]) => [kind, new RegExp("(?:^|\\s)" + VERB + "\\s+(?:\\S+\\s+){0,3}?(?:" + noun + ")(?=$|[\\s,.;:!?])", "i")]);
/* o começo do pedido de ajuste, escrito pelo botão "pedir ao Merlin" do
   editor: "na apresentação X, slide 3: " e "na planilha X: ". mora aqui, e
   não em build.js, porque o editor só precisa disto (build.js, adjustOf, lê) */
export function adjustPrefix(kind, name, slide) {
  return "na " + BUILD[kind].label + " " + String(name || "").trim() + (kind === "deck" && slide > 0 ? ", slide " + slide : "") + ": ";
}

export function buildIntent(text) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const hit = INTENT
    .map(([kind, re]) => { const m = re.exec(raw); return m ? { kind, at: m.index, end: m.index + m[0].length } : null; })
    .filter(Boolean)
    .sort((a, b) => a.at - b.at || a.end - b.end)[0];
  return hit ? hit.kind : null;
}
