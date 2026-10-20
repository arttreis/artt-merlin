/* merlin · montar com o Merlin (funil, app, mapa e planilha)
   logica pura, sem React. ate 10/10/2026 o Merlin montava essas coisas numa
   resposta so, a partir de uma frase, e tinha que adivinhar o negocio. agora
   a tela do assistente conduz uma conversa curta (a tarefa `build` do
   worker): o Merlin pergunta o que muda o desenho, mostra o rascunho, ajusta
   pelo que a pessoa escreve e so cria quando ela pede.

   aqui mora o que nao depende da tela: juntar as respostas, resumir o
   rascunho e transformar o rascunho no documento que a colecao de cada um ja
   sabe ler. reconhecer o pedido mora em build-intent.js, que e leve. */
import { layoutNodes } from "./funnel-layout.js";
import { NODE_TYPES } from "./funnel-draw.js";
import { fromBlueprint, normalizeApp } from "./app-spec.js";
import { normalizeSheet, buildSheet, evaluateSheet } from "./sheet.js";
import { SECTIONS } from "./portrait.js";
import { BUILD } from "./build-intent.js";

export { BUILD, buildIntent } from "./build-intent.js";

/* as respostas viram o texto que sobe ao Merlin e a fala da pessoa na
   conversa: so o que foi respondido, uma linha por pergunta */
export function answersText(questions, answers) {
  return (questions || [])
    .map((q, i) => [q.q, String((answers || {})[i] || "").trim()])
    .filter(([, a]) => a)
    .map(([q, a]) => q + " " + a)
    .join("\n");
}

/* a planilha que fala do caixa ("planilha do meu fluxo de caixa") nasce com
   os números de hoje: o dinheiro e o negócio do retrato vão junto do pedido,
   como cópia — a planilha não se atualiza sozinha depois (PRD desenhos, D3) */
const CASH = /(?:^|[^\p{L}])(?:caixa|saldo|financeiro|finanças|fôlego)(?![\p{L}])/iu;
export const citesCash = (text) => CASH.test(String(text || ""));
const CASH_SECTIONS = SECTIONS.filter((s) => s.id === "money" || s.id === "business").map((s) => s.label + ":");
export function cashPortrait(text) {
  return String(text || "").split("\n\n").filter((s) => CASH_SECTIONS.some((h) => s.startsWith(h + "\n"))).join("\n\n");
}

/* ---------- o que mostrar do rascunho ---------- */
const plural = (n, one, many) => n + " " + (n === 1 ? one : many);
const typeLabel = (t) => (NODE_TYPES[t] ? NODE_TYPES[t].label : "etapa");
const priceLabel = (reais) => {
  if (!reais) return "";
  const cents = reais % 1 ? 2 : 0;
  return Number(reais).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: cents, maximumFractionDigits: cents }).replace(/\s/g, " ");
};

/* o rascunho da planilha é o mesmo {name, cols, rows: [[…]]} dos modelos
   (sheet.js): vira documento pela mesma porta, e o normalizeSheet acerta o
   resto */
const SHOWN_ROWS = 8;
const counter = () => { let n = 0; return () => "d" + ++n; };
const sheetOf = (d, makeId) => normalizeSheet(buildSheet({ name: d.name || "planilha", cols: d.cols || [], rows: d.rows || [] }, makeId));
const sheetSize = (s) => plural(s.rows.length, "linha", "linhas") + " · " + plural(s.cols.length, "coluna", "colunas");

/* a linha que fica na conversa depois de criar ("✓ planilha pronta · 14
   linhas · 5 colunas · abrir"). vazia para quem ainda vai direto para a tela
   do que foi criado (funil, app, mapa) */
export function builtLine(kind, doc) {
  if (kind === "sheet" && doc) return "planilha pronta · " + sheetSize(normalizeSheet(doc));
  return "";
}

/* { title, lines: [{ label, text }], table? } — a carta do rascunho na conversa.
   curta de proposito: e para conferir de relance, o detalhe esta na tela de
   cada um depois de criar */
export function draftView(kind, d) {
  if (!d) return { title: "", lines: [] };
  if (kind === "funnel") {
    const lines = [{ label: "etapas", text: d.stages.map((s) => s.title || typeLabel(s.nodeType)).join(" → ") }];
    if (d.offers.length) lines.push({ label: plural(d.offers.length, "oferta", "ofertas"), text: d.offers.map((o) => [o.name, priceLabel(o.price)].filter(Boolean).join(" · ")).join("; ") });
    if (d.creatives.length) lines.push({ label: plural(d.creatives.length, "criativo", "criativos"), text: d.creatives.map((c) => c.title).join("; ") });
    if (d.automations.length) lines.push({ label: plural(d.automations.length, "automação", "automações"), text: d.automations.map((a) => a.name).join("; ") });
    if (d.triggers.length) lines.push({ label: plural(d.triggers.length, "gatilho", "gatilhos"), text: d.triggers.map((t) => t.name).join("; ") });
    return { title: d.name || "funil", sub: d.channel || "", lines };
  }
  if (kind === "app") {
    const mvp = d.features.filter((f) => (f.phase || "mvp") === "mvp");
    const lines = [];
    if (d.features.length) lines.push({ label: plural(d.features.length, "funcionalidade", "funcionalidades"), text: (mvp.length ? mvp.length + " na primeira versão: " + mvp.map((f) => f.title).join("; ") : d.features.map((f) => f.title).join("; ")) });
    if (d.entities.length) lines.push({ label: plural(d.entities.length, "tabela", "tabelas"), text: d.entities.map((e) => e.name).join(", ") });
    if (d.screens.length) lines.push({ label: plural(d.screens.length, "tela", "telas"), text: d.screens.map((s) => s.name).join(", ") });
    if (d.stack) lines.push({ label: "stack", text: d.stack });
    return { title: d.name || "app", sub: d.pitch || "", lines };
  }
  /* a planilha se confere na grade: as primeiras linhas, com a fórmula já
     calculada pela mesma conta do editor. `right`: a coluna de número, R$ ou
     data alinha à direita, como no editor */
  if (kind === "sheet") {
    const sheet = sheetOf(d, counter());
    const values = evaluateSheet(sheet);
    return {
      title: d.name || "planilha", sub: sheetSize(sheet), lines: [],
      table: {
        head: sheet.cols.map((c) => c.name),
        right: sheet.cols.map((c) => c.type !== "text"),
        rows: sheet.rows.slice(0, SHOWN_ROWS).map((r) => sheet.cols.map((c) => values[r.id][c.id].text)),
        more: Math.max(0, sheet.rows.length - SHOWN_ROWS)
      }
    };
  }
  const branches = (d.tree && d.tree.children) || [];
  return {
    title: d.name || (d.tree && d.tree.title) || "mapa",
    sub: d.tree ? d.tree.title : "",
    lines: branches.map((b) => ({ label: b.title, text: (b.children || []).map((c) => c.title).join("; ") }))
  };
}

/* ---------- o rascunho vira documento ----------
   devolve { collection, doc, href }. cada colecao continua sendo quem valida
   fundo (o normalize da propria tela, na proxima leitura); aqui se monta o
   documento no formato que ela le, como o ProposalDialog ja fazia com o
   funil e o mapa de uma frase. */
export function docFromDraft(kind, d, makeId) {
  const now = Date.now();
  const id = makeId();
  const base = BUILD[kind];
  if (kind === "map") {
    const tree = (n) => ({ id: makeId(), title: String(n.title || ""), note: String(n.note || ""), children: (n.children || []).map(tree) });
    return { collection: base.collection, href: base.href + id, doc: { id, name: String(d.name || (d.tree && d.tree.title) || "mapa"), root: tree(d.tree || { title: d.name }), client: "", idea: "", funnel: "", createdAt: now, updatedAt: now } };
  }
  if (kind === "app") {
    const doc = normalizeApp({ id, name: d.name, ...fromBlueprint(d, makeId), createdAt: now, updatedAt: now }, makeId);
    return { collection: base.collection, href: base.href + id, doc };
  }
  if (kind === "sheet") {
    const doc = normalizeSheet({ ...sheetOf(d, makeId), id, createdAt: now, updatedAt: now });
    return { collection: base.collection, href: base.href + id, doc };
  }
  /* o funil: a etapa liga na anterior, ou na que o Merlin apontou em `after`
     (o ramo do downsell). o que fica pendurado numa etapa (criativo, oferta)
     acha a dela pelo titulo; sem achar, fica no funil sem etapa */
  const nodes = d.stages.map((s) => {
    const type = NODE_TYPES[s.nodeType] ? s.nodeType : "custom";
    const fields = {};
    (NODE_TYPES[type].fields || []).forEach((f) => { if (f.preset != null) fields[f.key] = f.preset; });
    return { id: makeId(), type, title: String(s.title || ""), x: 0, y: 0, fields, number: null, note: String(s.note || "") };
  });
  const key = (t) => String(t || "").trim().toLowerCase();
  const byTitle = new Map(nodes.map((n) => [key(n.title), n.id]));
  const edges = [];
  d.stages.forEach((s, i) => {
    if (!i) return;
    const from = (s.after && byTitle.get(key(s.after))) || nodes[i - 1].id;
    if (from !== nodes[i].id) edges.push({ id: makeId(), from, to: nodes[i].id, label: "", avgRate: null });
  });
  const node = (t) => byTitle.get(key(t)) || "";
  const doc = {
    id, name: String(d.name || "funil"), client: "", channel: "",
    nodes: layoutNodes(nodes, edges), edges,
    creatives: d.creatives.map((c) => ({ id: makeId(), title: c.title, format: c.format || "image", angle: c.angle || "", url: "", status: "idea", node: node(c.stage) })),
    automations: d.automations.map((a) => ({ id: makeId(), name: a.name, trigger: a.trigger || "", action: a.action || "", tool: a.tool || "", status: "idea", node: node(a.stage) })),
    offers: d.offers.map((o) => ({ id: makeId(), name: o.name, price: Math.round((+o.price || 0) * 100), type: o.type || "main", promise: o.promise || "", guarantee: o.guarantee || "", node: node(o.stage) })),
    triggers: d.triggers.map((t) => ({ id: makeId(), name: t.name, usage: t.usage || "", node: node(t.stage) })),
    period: { from: "", to: "" }, snapshots: [],
    createdAt: now, updatedAt: now
  };
  return { collection: base.collection, href: base.href + id, doc };
}
