/* merlin · montar com o Merlin (funil, app, mapa, planilha e apresentação)
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
import { normalizeSheet, buildSheet, evaluateSheet, colLetter } from "./sheet.js";
import { normalizeDeck, SLIDE_LAYOUTS } from "./deck.js";
import { KINDS as GOAL_KINDS, goalsOf, goalLine, periodOf } from "./plans-data.js";
import { brl } from "./core.js";
import { SECTIONS } from "./portrait.js";
import { BUILD } from "./build-intent.js";

export { BUILD, buildIntent, adjustPrefix } from "./build-intent.js";

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
const layoutLabel = (id) => (SLIDE_LAYOUTS.find((l) => l.id === id) || SLIDE_LAYOUTS[1]).label;
const sheetSize = (s) => plural(s.rows.length, "linha", "linhas") + " · " + plural(s.cols.length, "coluna", "colunas");

/* a linha que fica na conversa depois de criar ("✓ planilha pronta · 14
   linhas · 5 colunas · abrir"). vazia para quem ainda vai direto para a tela
   do que foi criado (funil, app, mapa) */
export function builtLine(kind, doc) {
  if (kind === "sheet" && doc) return "planilha pronta · " + sheetSize(normalizeSheet(doc));
  if (kind === "deck" && doc) return "apresentação pronta · " + plural(normalizeDeck(doc).slides.length, "slide", "slides");
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
  /* a apresentação se confere pelos títulos, um por slide */
  if (kind === "deck") {
    const slides = Array.isArray(d.slides) ? d.slides : [];
    return {
      title: d.name || "apresentação", sub: plural(slides.length, "slide", "slides"),
      lines: slides.map((x, i) => ({ label: "slide " + (i + 1), text: (x && x.title) || layoutLabel(x && x.layout) }))
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
  /* a apresentação já nasce ligada ao produto que o pedido nomeou (`app`) */
  if (kind === "deck") {
    const slides = (Array.isArray(d.slides) ? d.slides : []).map((x) => ({ ...x, id: makeId() }));
    const doc = normalizeDeck({ id, name: d.name || "apresentação", app: typeof d.app === "string" ? d.app : "", slides, createdAt: now, updatedAt: now });
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

/* ---------- o que o Merlin sabe do produto (ticket #94) ----------
   "monta uma apresentação do Agenda": o pedido que nomeia um produto leva o
   conceito e a primeira versão do projeto de app, o funil e a oferta ligados
   e as metas do plano, como texto curto. só vai quando a pessoa pede o
   rascunho (PRD desenhos, D8). */
const PRODUCT_MAX = 6000;
const fold = (v) => String(v == null ? "" : v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const escapeRe = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* o produto cujo nome está no pedido, como palavra inteira, sem caixa nem
   acento; com dois, o de nome mais longo ("Agenda Pro" vence "Agenda") */
export function productNamed(text, apps) {
  const t = fold(text);
  let best = null;
  for (const a of apps || []) {
    const name = fold(a && a.name);
    if (!name) continue;
    const re = new RegExp("(?:^|[^\\p{L}\\p{N}])" + escapeRe(name) + "(?![\\p{L}\\p{N}])", "u");
    if (re.test(t) && (!best || name.length > best.n)) best = { app: a, n: name.length };
  }
  return best ? best.app : null;
}

/* `data`: { funnels, plans, finance (já normalizado), clients, team }, as
   coleções cruas; `today`: "AAAA-MM-DD", para as metas do período */
export function productContext(app, data, today) {
  if (!app) return "";
  const d = data || {};
  const one = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
  const lines = ["produto: " + one(app.name, 120)];
  [["em uma frase", app.pitch], ["problema", app.problem], ["para quem", app.audience], ["o que entrega", app.value]]
    .forEach(([label, v]) => { if (one(v, 1)) lines.push(label + ": " + one(v, 900)); });
  const first = (Array.isArray(app.features) ? app.features : []).filter((f) => f && one(f.title, 1) && (f.phase || "mvp") === "mvp");
  if (first.length) lines.push("primeira versão: " + first.slice(0, 30).map((f) => one(f.title, 120)).join("; "));
  const funnel = app.funnel ? (d.funnels || []).find((f) => f && f.id === app.funnel) : null;
  if (funnel) {
    const stages = (Array.isArray(funnel.nodes) ? funnel.nodes : []).map((n) => one(n && n.title, 60)).filter(Boolean);
    lines.push("funil ligado: " + (one(funnel.name, 120) || "funil") + (stages.length ? " · etapas: " + stages.slice(0, 14).join(" → ") : ""));
    (Array.isArray(funnel.offers) ? funnel.offers : []).filter((o) => o && one(o.name, 1)).slice(0, 6).forEach((o) => {
      lines.push("oferta: " + one(o.name, 120) + (+o.price > 0 ? " · " + brl(+o.price).replace(/,00$/, "").replace(/\s/g, " ") : "") + (one(o.promise, 1) ? " · " + one(o.promise, 300) : ""));
    });
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(today || ""))) {
    const goals = GOAL_KINDS.flatMap((k) => goalsOf(d.plans, k, periodOf(today, k)));
    goals.forEach((g) => lines.push(goalLine(g, { finance: d.finance, clients: d.clients, team: d.team })));
  }
  return lines.join("\n").slice(0, PRODUCT_MAX);
}

/* ---------- pedir ao Merlin de dentro do editor (ticket #94) ----------
   o botão do editor abre a conversa com "na apresentação X, slide 3: " já no
   campo; o que a pessoa completa é o ajuste daquele documento. o Merlin
   devolve o documento inteiro, a conversa mostra o antes e o depois, e só o
   toque em "aplicar" leva a mudança ao editor, onde ela é um passo do
   desfazer. */
/* o teto do ajuste é o mesmo do rascunho da conversa: o Merlin devolve o
   documento inteiro, e um maior seria cortado */
const ADJUST_SLIDES = 12, ADJUST_ROWS = 40, ADJUST_COLS = 10;
const ADJUST_RE = /^\s*na (apresenta[çc][ãa]o|planilha) (.+?)(?:, slide (\d{1,2}))?:\s*(\S[\s\S]*?)\s*$/i;
export function adjustOf(text) {
  const m = ADJUST_RE.exec(String(text || ""));
  if (!m) return null;
  const kind = /^planilha$/i.test(m[1]) ? "sheet" : "deck";
  return { kind, name: m[2].trim(), slide: kind === "deck" && m[3] ? +m[3] : 0, change: m[4] };
}

const SLIDE_KEYS = ["layout", "title", "body", "items", "left", "right", "number", "caption", "notes"];
const slideDraft = (x) => Object.fromEntries(SLIDE_KEYS.map((k) => [k, k === "items" ? x.items.slice() : x[k]]));
/* o documento aberto no formato do rascunho, que é o que o Merlin lê */
export function draftOfDoc(kind, doc) {
  if (kind === "deck") {
    const d = normalizeDeck(doc);
    return { name: d.name, slides: d.slides.map(slideDraft) };
  }
  const s = normalizeSheet(doc);
  return { name: s.name, cols: s.cols.map((c) => ({ name: c.name, type: c.type })), rows: s.rows.map((r) => s.cols.map((c) => r.cells[c.id] || "")) };
}
export function fitsAdjust(kind, doc) {
  if (kind === "deck") return normalizeDeck(doc).slides.length <= ADJUST_SLIDES;
  const s = normalizeSheet(doc);
  return s.rows.length <= ADJUST_ROWS && s.cols.length <= ADJUST_COLS;
}

/* o rascunho ajustado vira o documento de novo: o mesmo id, o mesmo produto,
   e cada slide, linha e coluna fica com o id que tinha na mesma posição */
export function applyDraft(kind, doc, data, makeId) {
  const keep = { id: doc.id, app: typeof doc.app === "string" ? doc.app : "", createdAt: doc.createdAt, updatedAt: Date.now() };
  const d = data || {};
  if (kind === "deck") {
    const before = normalizeDeck(doc);
    const slides = (Array.isArray(d.slides) ? d.slides : []).map((x, i) => ({ ...x, id: before.slides[i] ? before.slides[i].id : makeId() }));
    return normalizeDeck({ ...keep, name: d.name || before.name, slides });
  }
  const before = normalizeSheet(doc);
  const fresh = sheetOf({ ...d, name: d.name || before.name }, makeId);
  const colId = fresh.cols.map((c, j) => (before.cols[j] ? before.cols[j].id : c.id));
  const cols = fresh.cols.map((c, j) => ({ ...c, id: colId[j] }));
  const rows = fresh.rows.map((r, i) => {
    const cells = {};
    fresh.cols.forEach((c, j) => { if (r.cells[c.id]) cells[colId[j]] = r.cells[c.id]; });
    return { id: before.rows[i] ? before.rows[i].id : r.id, cells };
  });
  return normalizeSheet({ ...keep, name: fresh.name, cols, rows });
}

/* o antes e o depois na conversa, e a frase do aviso no editor ("o Merlin
   mudou o slide 3 · desfazer"). `at`: o primeiro slide que mudou, para o
   editor abrir nele */
const flat = (v) => String(v || "").replace(/\s+/g, " ").trim();
function slideText(x) {
  if (!x) return "";
  const rest = x.layout === "cover" ? [x.body]
    : x.layout === "number" ? [x.number, x.caption]
    : x.layout === "columns" ? [x.left, x.right]
    : [x.items.filter((it) => flat(it)).join("; ")];
  return [x.title, ...rest].map(flat).filter(Boolean).join(" · ") || layoutLabel(x.layout);
}
export function adjustView(kind, beforeDoc, afterDoc) {
  if (kind === "deck") {
    const b = normalizeDeck(beforeDoc).slides, a = normalizeDeck(afterDoc).slides;
    const key = (x) => (x ? JSON.stringify(slideDraft(x)) : "");
    const changed = [];
    for (let i = 0; i < Math.max(b.length, a.length); i++) if (key(b[i]) !== key(a[i])) changed.push(i);
    const pairs = changed.map((i) => {
      let before = slideText(b[i]), after = slideText(a[i]);
      /* mudou só a nota (ou um campo que o layout não mostra): a nota diz */
      if (b[i] && a[i] && before === after) { before += " · notas: " + (flat(b[i].notes) || "—"); after += " · notas: " + (flat(a[i].notes) || "—"); }
      return { label: "slide " + (i + 1), before: b[i] ? before : "", after: a[i] ? after : "" };
    });
    const line = changed.length === 1 && b.length === a.length ? "o Merlin mudou o slide " + (changed[0] + 1) : "o Merlin mudou a apresentação";
    return { line, at: changed.length ? Math.min(changed[0], a.length - 1) : 0, pairs: pairs.slice(0, 3), more: Math.max(0, pairs.length - 3) };
  }
  /* a planilha: o nome da coluna e o valor mostrado de cada célula, com a
     fórmula já calculada */
  const b = normalizeSheet(beforeDoc), a = normalizeSheet(afterDoc);
  const vb = evaluateSheet(b), va = evaluateSheet(a);
  const cell = (s, v, i, j) => {
    const r = s.rows[i], c = s.cols[j];
    return r && c ? { raw: r.cells[c.id] || "", text: v[r.id][c.id].text } : { raw: "", text: "" };
  };
  const nCols = Math.max(b.cols.length, a.cols.length);
  const pairs = [];
  for (let j = 0; j < nCols; j++) {
    const nb = b.cols[j] ? b.cols[j].name : "", na = a.cols[j] ? a.cols[j].name : "";
    if (nb !== na) pairs.push({ label: "coluna " + colLetter(j), before: nb, after: na });
  }
  for (let i = 0; i < Math.max(b.rows.length, a.rows.length); i++) {
    for (let j = 0; j < nCols; j++) {
      const x = cell(b, vb, i, j), y = cell(a, va, i, j);
      if (x.raw !== y.raw || x.text !== y.text) pairs.push({ label: colLetter(j) + (i + 1), before: x.text, after: y.text });
    }
  }
  return { line: "o Merlin mudou a planilha", at: 0, pairs: pairs.slice(0, 8), more: Math.max(0, pairs.length - 8) };
}
