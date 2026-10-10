/* merlin · reconhecer o pedido de montar (funil, app, mapa)
   separado de build.js de proposito: o campo da home e o Ctrl+K, que estao em
   toda tela, so precisam saber SE e um pedido de montar — o resto (o desenho
   do funil, o projeto de app) so carrega na tela do assistente. */

export const BUILD = {
  funnel: { label: "funil", collection: "funnels", href: "funnels.html#", create: "criar o funil" },
  app: { label: "app", collection: "apps", href: "apps.html#", create: "criar o app" },
  map: { label: "mapa", collection: "maps", href: "maps.html#", create: "criar o mapa" }
};

/* "monta um funil pra minha consultoria", "quero um app de agenda", "me ajuda
   a desenhar um mapa mental do lançamento". o verbo de montar (ou o "quero")
   tem que vir antes do que se monta: "revisar o funil" e "o app caiu" nao sao
   pedido. a duracao continua mandando — "montar o funil 2h" e tarefa, e quem
   chama decide isso antes de perguntar aqui. */
const VERB = "(?:mont[ae]r?|desenh[ae]r?|cri[ae]r?|fa[zç]a?|fazer|ger[ae]r?|estrutur[ae]r?|planej[ae]r?|rascunh[ae]r?|esbo[çc][ae]r?|quero|preciso de|me ajud[ae] a \\w+)";
const WHAT = [
  ["map", "mapa(?:s)?(?: mental| mentais)?"],
  ["funnel", "funil|funis"],
  ["app", "app|aplicativo|saas|sistema|plataforma"]
];
const INTENT = WHAT.map(([kind, noun]) => [kind, new RegExp("(?:^|\\s)" + VERB + "\\s+(?:\\S+\\s+){0,3}?(?:" + noun + ")(?=$|[\\s,.;:!?])", "i")]);
export function buildIntent(text) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const hit = INTENT
    .map(([kind, re]) => { const m = re.exec(raw); return m ? { kind, at: m.index } : null; })
    .filter(Boolean)
    .sort((a, b) => a.at - b.at)[0];
  return hit ? hit.kind : null;
}
