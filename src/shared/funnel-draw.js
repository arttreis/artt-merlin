/* merlin · o desenho do funil
   o que o editor (funnels.html) e a página pública (share.html) pintam do
   MESMO jeito: os tipos de etapa, o cartão e a aresta. mora aqui e não no
   editor porque o link compartilhado tem que ser o funil de verdade — o
   mesmo palco, só sem a mão de quem edita —, e duas cópias do desenho
   divergiriam na primeira mudança de uma delas. */
import { brl } from "./core.js";
import { NODE_W, NODE_H } from "./funnel-layout.js";
import { brandOf } from "./brands.js";

export const PORT_Y = NODE_H / 2;

/* ---------- tipos de etapa (o porquê de cada um está no topo do funnels.jsx) ---------- */
export const CTA_FIELDS = [
  { key: "cta", label: "texto do botão", kind: "text" },
  { key: "ctaTarget", label: "destino do botão", kind: "text" }
];
/* campo de escolha com "outro": a lista cobre o comum, e o que nao esta nela
   se escreve. o valor gravado de uma opcao pronta e a chave; o de "outro" e o
   proprio texto — por isso o labelOf devolve o valor quando nao acha a chave,
   e o texto livre de antes (quando o campo era "text") continua valendo. */
const pick = (...names) => names.map((n) => [n, n]);

export const NODE_TYPES = {
  /* ---- aquisição: onde o lead ainda nem é lead ---- */
  traffic: { label: "tráfego", group: "aquisição", icon: [["path", { d: "M5 19V13M12 19V9M19 19V5" }]],
    fields: [
      { key: "source", label: "origem", kind: "select", other: true, options: [["meta", "meta"], ["google", "google"], ["tiktok", "tiktok"], ["youtube", "youtube"], ["linkedin", "linkedin"], ["organic", "organico"], ["email", "email"], ["referral", "indicacao"]] },
      { key: "campaign", label: "campanha", kind: "text" },
      { key: "cost", label: "custo no período", kind: "money" }
    ] },
  impression: { label: "impressão", group: "aquisição", icon: [["path", { d: "M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" }], ["circle", { cx: 12, cy: 12, r: 2.6 }]],
    fields: [{ key: "placement", label: "posicionamento", kind: "select", other: true, blank: true, options: pick("feed", "stories", "reels", "busca", "youtube", "display") }, { key: "frequency", label: "frequência", kind: "text" }] },
  ad: { label: "anúncio", group: "aquisição", icon: [["path", { d: "M4 10v4h3l5 4V6l-5 4H4z" }], ["path", { d: "M16.5 9a4 4 0 010 6" }]],
    fields: [{ key: "creative", label: "criativo", kind: "text" }, { key: "link", label: "link do anúncio", kind: "text" }] },
  click: { label: "clique", group: "aquisição", icon: [["path", { d: "M7 4l11 8-4.6 1.3L16 19l-2.4 1-2.6-5.6L7 17z" }]],
    fields: [{ key: "destination", label: "destino", kind: "text" }, { key: "cost", label: "custo por clique", kind: "money" }] },

  /* ---- página: onde ele lê, assiste ou olha o produto ---- */
  lp: { label: "lp", group: "página", icon: [["rect", { x: 4, y: 5, width: 16, height: 14, rx: 2 }], ["path", { d: "M4 9h16" }]],
    fields: [{ key: "url", label: "url", kind: "text" }, ...CTA_FIELDS] },
  vsl: { label: "vsl", group: "página", icon: [["circle", { cx: 12, cy: 12, r: 8.5 }], ["path", { d: "M10 8.5l6 3.5-6 3.5z" }]],
    fields: [{ key: "url", label: "url", kind: "text" }, { key: "duration", label: "duração", kind: "text" }, ...CTA_FIELDS] },
  webinar: { label: "webinar", group: "página", icon: [["rect", { x: 3, y: 5, width: 18, height: 12, rx: 2 }], ["path", { d: "M10 9.5l4.5 2.5-4.5 2.5z" }], ["path", { d: "M9 20h6" }]],
    fields: [{ key: "url", label: "url", kind: "text" }, { key: "when", label: "quando", kind: "text" }, ...CTA_FIELDS] },
  product: { label: "produto", group: "página", icon: [["path", { d: "M12 3l8 4.2v9.6L12 21l-8-4.2V7.2z" }], ["path", { d: "M4 7.2l8 4.2 8-4.2M12 11.4V21" }]],
    fields: [
      { key: "marketplace", label: "canal", kind: "select", other: true, options: [["own", "site proprio"], ["mercadolivre", "mercado livre"], ["shopee", "shopee"], ["tiktok", "tiktok shop"], ["amazon", "amazon"], ["magalu", "magalu"], ["shein", "shein"]] },
      { key: "sku", label: "sku", kind: "text" },
      { key: "price", label: "preço", kind: "money" },
      ...CTA_FIELDS
    ] },

  /* ---- captura: onde ele deixa de ser anônimo ---- */
  capture: { label: "captura", group: "captura", icon: [["rect", { x: 5, y: 4, width: 14, height: 16, rx: 1.5 }], ["path", { d: "M8 9h8M8 13h8M8 17h4" }]],
    fields: [{ key: "what", label: "o que captura", kind: "text" }, { key: "tool", label: "ferramenta", kind: "select", other: true, blank: true, options: pick("RD Station", "ActiveCampaign", "HubSpot", "Typeform", "Tally", "Google Forms", "Elementor") }] },
  quiz: { label: "qualificação", group: "captura", icon: [["path", { d: "M4 5h16l-6 7v6l-4 2v-8z" }]],
    fields: [{ key: "tool", label: "ferramenta", kind: "select", other: true, blank: true, options: pick("Typeform", "Tally", "Inlead", "Respondi", "Google Forms") }, { key: "criteria", label: "critério de corte", kind: "text" }] },
  dm: { label: "dm", group: "captura", icon: [["path", { d: "M21 4L3 11l7 3 3 7z" }], ["path", { d: "M21 4l-11 10" }]],
    fields: [
      { key: "channel", label: "canal", kind: "select", other: true, options: [["instagram", "instagram"], ["whatsapp", "whatsapp"], ["linkedin", "linkedin"], ["tiktok", "tiktok"], ["messenger", "messenger"]] },
      { key: "opener", label: "abertura", kind: "text" }
    ] },
  group: { label: "grupo", group: "captura", icon: [["circle", { cx: 9, cy: 9, r: 3 }], ["path", { d: "M3.5 19a5.5 5.5 0 0111 0" }], ["path", { d: "M16 7.2a3 3 0 010 5.6M17.5 19a5.6 5.6 0 00-2-4.3" }]],
    fields: [{ key: "platform", label: "plataforma", kind: "select", other: true, blank: true, options: pick("WhatsApp", "Telegram", "Discord", "Skool", "Circle", "canal do Instagram") }, { key: "link", label: "link", kind: "text" }] },

  /* ---- relacionamento: onde ele é aquecido ---- */
  email: { label: "e-mail", group: "relacionamento", icon: [["rect", { x: 3.5, y: 5.5, width: 17, height: 13, rx: 1.5 }], ["path", { d: "M4 6.5l8 6.5 8-6.5" }]],
    fields: [{ key: "sequence", label: "sequência", kind: "text" }, { key: "tool", label: "ferramenta", kind: "select", other: true, blank: true, options: pick("ActiveCampaign", "RD Station", "Mailchimp", "Brevo", "Klaviyo", "Kit", "Resend") }] },
  whatsapp: { label: "whatsapp", group: "relacionamento", icon: [["path", { d: "M4 5.5A2.5 2.5 0 016.5 3h11A2.5 2.5 0 0120 5.5v8a2.5 2.5 0 01-2.5 2.5H9l-4 3.5v-3.5H6.5A2.5 2.5 0 014 13.5v-8z" }]],
    fields: [{ key: "number", label: "número", kind: "text" }, { key: "flow", label: "fluxo", kind: "text" }] },

  /* ---- venda: o funil de serviço, quando tem gente vendendo ---- */
  booking: { label: "agendamento", group: "venda", icon: [["rect", { x: 3.5, y: 5, width: 17, height: 15, rx: 2 }], ["path", { d: "M3.5 10h17M8 3.5v3M16 3.5v3" }], ["path", { d: "M9.5 14.5l2 2 3.5-3.5" }]],
    fields: [{ key: "tool", label: "ferramenta", kind: "select", other: true, blank: true, options: pick("Calendly", "Cal.com", "Google Agenda", "Zcal", "TidyCal") }, { key: "duration", label: "duração", kind: "text" }] },
  call: { label: "call", group: "venda", icon: [["path", { d: "M5 4.5h3l1.5 4-2 1.5a11 11 0 005.5 5.5l1.5-2 4 1.5v3a1.5 1.5 0 01-1.6 1.5A15.5 15.5 0 013.5 6.1 1.5 1.5 0 015 4.5z" }]],
    fields: [{ key: "owner", label: "quem faz", kind: "text" }, { key: "script", label: "roteiro", kind: "text" }] },
  proposal: { label: "proposta", group: "venda", icon: [["path", { d: "M6 3h7l5 5v13H6z" }], ["path", { d: "M13 3v5h5" }], ["path", { d: "M9 13h6M9 17h4" }]],
    fields: [{ key: "scope", label: "escopo", kind: "text" }, { key: "ticket", label: "ticket", kind: "money" }] },
  closing: { label: "fechamento", group: "venda", conversion: true, icon: [["circle", { cx: 12, cy: 10, r: 5.5 }], ["path", { d: "M9.6 10.2l1.8 1.8 3.2-3.4" }], ["path", { d: "M8.5 15l-1 6 4.5-2.2L16.5 21l-1-6" }]],
    fields: [{ key: "contract", label: "contrato", kind: "text" }, { key: "value", label: "valor fechado", kind: "money" }] },

  /* ---- compra: onde o dinheiro entra ---- */
  cart: { label: "carrinho", group: "compra", icon: [["circle", { cx: 10, cy: 19, r: 1.4 }], ["circle", { cx: 17, cy: 19, r: 1.4 }], ["path", { d: "M3 4h2.2l2.4 11h10.2l1.8-8H6.2" }]],
    fields: [{ key: "platform", label: "plataforma", kind: "select", other: true, blank: true, options: pick("Shopify", "Nuvemshop", "WooCommerce", "Yampi", "VTEX", "Tray", "Loja Integrada") }, { key: "ticket", label: "ticket médio", kind: "money" }] },
  checkout: { label: "checkout", group: "compra", conversion: true, icon: [["rect", { x: 3, y: 6, width: 18, height: 13, rx: 2 }], ["path", { d: "M3 10h18" }], ["path", { d: "M7 15h4" }]],
    fields: [
      { key: "platform", label: "plataforma", kind: "select", other: true, preset: "Stripe", options: pick("Stripe", "Hotmart", "Kiwify", "Eduzz", "Ticto", "Mercado Pago", "Pagar.me", "Asaas", "Yampi", "Shopify") },
      { key: "product", label: "produto", kind: "text" },
      { key: "price", label: "preço", kind: "money" }
    ] },
  payment: { label: "pagamento", group: "compra", conversion: true, icon: [["rect", { x: 3.5, y: 6.5, width: 17, height: 11, rx: 2 }], ["circle", { cx: 12, cy: 12, r: 2.4 }], ["path", { d: "M7 12h.01M17 12h.01" }]],
    fields: [
      { key: "method", label: "meio", kind: "select", other: true, options: [["card", "cartao"], ["pix", "pix"], ["boleto", "boleto"], ["mixed", "misto"]] },
      { key: "revenue", label: "receita no período", kind: "money" }
    ] },
  thanks: { label: "obrigado", group: "compra", icon: [["circle", { cx: 12, cy: 12, r: 8.5 }], ["path", { d: "M8 12.5l2.5 2.5L16 9.5" }]],
    fields: [{ key: "url", label: "url", kind: "text" }] },

  /* ---- depois: o funil que continua ---- */
  upsell: { label: "upsell", group: "depois", conversion: true, icon: [["path", { d: "M7 17L17 7M9 7h8v8" }]],
    fields: [{ key: "offer", label: "oferta", kind: "text" }, { key: "price", label: "preço", kind: "money" }] },
  downsell: { label: "downsell", group: "depois", conversion: true, icon: [["path", { d: "M7 7l10 10M17 7v10H7" }]],
    fields: [{ key: "offer", label: "oferta", kind: "text" }, { key: "price", label: "preço", kind: "money" }] },
  onboarding: { label: "ativação", group: "depois", icon: [["path", { d: "M13 3l-7 9h5l-1 9 7-9h-5z" }]],
    fields: [{ key: "milestone", label: "marco de ativação", kind: "text" }, { key: "window", label: "janela (dias)", kind: "number" }] },
  repurchase: { label: "recompra", group: "depois", conversion: true, icon: [["path", { d: "M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3" }], ["path", { d: "M18 4v4h-4M6 20v-4h4" }]],
    fields: [{ key: "window", label: "janela (dias)", kind: "number" }, { key: "revenue", label: "receita no período", kind: "money" }] },

  custom: { label: "personalizado", group: "livre", icon: [["path", { d: "M12 3l2.6 5.6L21 9.3l-4.5 4.2L17.6 20 12 16.9 6.4 20l1.1-6.5L3 9.3l6.4-.7z" }]], fields: [] }
};
/* as ferramentas de automacao, na gaveta do funil */
export const AUTOMATION_TOOLS = pick("Manychat", "Make", "Zapier", "n8n", "ActiveCampaign", "RD Station", "Klaviyo", "Botconversa");
export const typeOf = (n) => NODE_TYPES[n.type] || NODE_TYPES.custom;
export const labelOf = (list, value) => { const o = list.find(([v]) => v === value); return o ? o[1] : String(value || ""); };

/* ---------- formatação ---------- */
export const formatNumber = (v) => Number(v).toLocaleString("pt-BR");
/* taxa em %: inteira quando dá, uma casa quando é miúda (0,3% em vez de 0%) */
export const formatRate = (t) => (t * 100 < 1 && t > 0 ? (t * 100).toFixed(1).replace(".", ",") : String(Math.round(t * 100))) + "%";
export const formatAvg = (v) => "~" + String(v).replace(".", ",") + "%";
export const truncate = (t, n) => { t = String(t || ""); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

/* o que está pendurado numa etapa (criativos, automações, ofertas, gatilhos) */
export const LINKED_GROUPS = [
  { key: "creatives", label: "criativos", singular: "criativo", field: "title" },
  { key: "automations", label: "automações", singular: "automação", field: "name" },
  { key: "offers", label: "ofertas", singular: "oferta", field: "name" },
  { key: "triggers", label: "gatilhos", singular: "gatilho", field: "name" }
];
export const linkedCounts = (doc, nodeId) =>
  LINKED_GROUPS.map((g) => ({ ...g, n: doc[g.key].filter((x) => x.node === nodeId).length })).filter((g) => g.n > 0);

/* ---------- média x real ----------
   a média (por aresta) é o que se espera: uma taxa de conversão que o
   Arthur digita porque conhece o funil, antes de ter um número de verdade
   no período. o real é o que aconteceu: calculado a partir dos números
   lançados nos dois nós de uma aresta. a tela sempre mostra o real quando
   ele existe; a média só aparece — com "~" e em --ink-30, pra não ser
   confundida com dado — pra preencher o vazio: tanto na própria aresta
   (a taxa esperada) quanto projetando um número onde ainda não há um real,
   em cascata por quantas etapas seguidas fizer falta. */
export function computeProjections(doc) {
  const map = new Map(); // nodeId -> {value, projected}
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  doc.nodes.forEach((n) => { if (n.number != null) map.set(n.id, { value: n.number, projected: false }); });
  for (let step = 0; step <= doc.nodes.length; step++) {
    let changed = false;
    doc.edges.forEach((a) => {
      if (a.avgRate == null || map.has(a.to)) return; // sem média, ou destino já resolvido (real ou projetado)
      const from = map.get(a.from);
      const to = byId.get(a.to);
      if (!from || !to || to.number != null) return;
      map.set(a.to, { value: Math.round(from.value * (a.avgRate / 100)), projected: true });
      changed = true;
    });
    if (!changed) break; // nada de novo propagou: para antes de rodar à toa (e antes de um ciclo virar loop)
  }
  return map;
}

/* a "linha de baixo" do cartão: chips do que está ligado; se não há nada,
   o campo mais falante do tipo (origem do tráfego, url da lp...) ou a nota. */
export function nodeCaption(n, def) {
  const filled = def.fields.filter((f) => n.fields[f.key]).slice(0, 2);
  if (filled.length) {
    return filled.map((f) => {
      const v = n.fields[f.key];
      if (f.kind === "money") return f.label + " " + brl(v);
      if (f.kind === "number") return f.label.replace(/\s*\(.*\)$/, "") + " " + v; // "janela 7", sem o "(dias)" do rótulo
      if (f.kind === "select") return labelOf(f.options, v);
      return String(v);
    }).join(" · ");
  }
  return n.note || "";
}

/* ---------- o cartão e a aresta ---------- */
export const SVG_NS = "http://www.w3.org/2000/svg";
export function svgEl(tag, attrs, children) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const k in attrs) { const v = attrs[k]; if (v != null && v !== false) el.setAttribute(k, v); }
  if (children) children.forEach((c) => { if (c != null && c !== false) el.append(c); });
  return el;
}
export const svgText = (cls, x, y, text, extra) => svgEl("text", { class: cls, x, y, ...extra }, [String(text)]);

export function drawNode(n, ctx) {
  const def = typeOf(n);
  const projection = n.number == null ? ctx.projections.get(n.id) : null;
  const numberText = n.number != null ? formatNumber(n.number) : (projection ? "~" + formatNumber(projection.value) : "—");
  const numberClass = n.number != null ? "" : (projection ? " is-projected" : " is-empty");
  const compared = ctx.compared(n.id);
  const conv = def.conversion ? " is-conversion" : "";
  const numberWidth = numberText.length * (n.number != null ? 11.5 : 9) + 12;

  const linked = ctx.linked(n.id);
  const chips = [];
  let x = 16;
  linked.forEach((g) => {
    const txt = g.n + " " + (g.n === 1 ? g.singular : g.label);
    const w = txt.length * 5.9 + 12;
    if (x + w > NODE_W - 16) return; // não cabe: os que sobram ficam só no painel
    chips.push(svgEl("rect", { class: "node-chip", x, y: 80, width: w.toFixed(0), height: 16, rx: 8 }));
    chips.push(svgText("node-chip-text", x + 6, 91, txt));
    x += w + 4;
  });
  const caption = linked.length ? "" : truncate(nodeCaption(n, def), 34);
  /* com marca, o quadradinho é da marca: cheio na cor dela e o desenho
     vazado por cima. sem marca, o ícone do tipo de sempre. */
  const brand = brandOf(n, def);
  const mark = brand
    ? [svgEl("g", { class: "node-brand" }, [
        svgEl("title", null, [brand.label]),
        svgEl("rect", { x: 12, y: 12, width: 28, height: 28, rx: 8, fill: brand.color }),
        brand.path
          ? svgEl("path", { d: brand.path, fill: brand.ink, transform: "translate(18,18) scale(.6667)" })
          : svgText("node-brand-mono", 26, 30, brand.mono, { fill: brand.ink, "text-anchor": "middle" })
      ])]
    : [
        svgEl("rect", { class: "node-icon-bg" + conv, x: 12, y: 12, width: 28, height: 28, rx: 8 }),
        svgEl("g", { class: "node-icon" + conv, transform: "translate(19,19) scale(.5833)" }, def.icon.map(([tag, attrs]) => svgEl(tag, attrs)))
      ];

  return svgEl("g", { class: "node" + (n.id === ctx.selectedNode ? " is-selected" : ""), "data-id": n.id, transform: "translate(" + n.x + "," + n.y + ")" }, [
    svgEl("rect", { class: "node-box", width: NODE_W, height: NODE_H, rx: 14 }),
    ...mark,
    svgText("node-type", 50, 22, def.label),
    svgText("node-title", 50, 37, truncate(n.title || def.label, 24)),
    svgEl("circle", { class: "node-dot" + (n.number != null ? " has-number" : ""), cx: NODE_W - 16, cy: 20, r: 3 }),
    svgEl("rect", { class: "node-body", x: 8, y: 50, width: NODE_W - 16, height: NODE_H - 58, rx: 10 }),
    svgText("node-number" + numberClass, 16, 73, numberText),
    compared != null ? svgText("node-compare", 16 + numberWidth, 73, "antes " + formatNumber(compared)) : null,
    ...chips,
    caption ? svgText("node-caption", 16, 92, caption) : null,
    svgEl("circle", { class: "node-port", cx: 0, cy: PORT_Y, r: 4 }),
    /* a saída diz o que é: "próxima etapa", embaixo do canto direito do
       cartão, só enquanto o ponteiro está nele. no vão entre dois cartões
       ela brigaria com a taxa da aresta; embaixo, não encosta em nada. */
    svgText("node-next", NODE_W - 6, NODE_H + 15, "puxe a bolinha para a próxima etapa", { "text-anchor": "end" }),
    svgEl("g", { class: "node-handle", "data-id": n.id }, [
      svgEl("circle", { class: "hit", cx: NODE_W, cy: PORT_Y, r: 14 }),
      svgEl("circle", { class: "vis", cx: NODE_W, cy: PORT_Y, r: 5.5 })
    ])
  ]);
}

export function edgeGeometry(from, to) {
  const x1 = from.x + NODE_W + 5, y1 = from.y + PORT_Y;
  const x2 = to.x - 5, y2 = to.y + PORT_Y;
  const dx = Math.max(50, Math.abs(x2 - x1) * 0.5);
  const c1x = x1 + dx, c1y = y1, c2x = x2 - dx, c2y = y2;
  const d = "M " + x1 + " " + y1 + " C " + c1x + " " + c1y + " " + c2x + " " + c2y + " " + x2 + " " + y2;
  const midX = (x1 + 3 * c1x + 3 * c2x + x2) / 8, midY = (y1 + 3 * c1y + 3 * c2y + y2) / 8;
  return { d, midX, midY };
}

export function drawEdge(a, ctx) {
  const from = ctx.nodeById(a.from), to = ctx.nodeById(a.to);
  if (!from || !to) return null;
  const { d, midX, midY } = edgeGeometry(from, to);
  /* real (do que foi lançado) vence sempre; a média só aparece — com "~" —
     quando falta um dos dois números pra calcular o real. */
  let label = "", weak = false, isAvg = false;
  if (from.number != null && from.number > 0 && to.number != null) {
    const rate = to.number / from.number;
    label = formatRate(rate);
    weak = rate < 0.1;
  } else if (a.avgRate != null) {
    label = formatAvg(a.avgRate);
    isAvg = true;
    weak = a.avgRate < 10;
  }
  const volume = to.number != null ? to.number : (from.number != null ? from.number : 0);
  const width = volume > 0 ? Math.min(7, Math.max(1.2, 1.2 + 6 * (volume / ctx.maxVolume))) : 1.2;
  const labelWidth = label.length * 6.2 + 14;
  /* tracejada é a passagem que ainda não tem número de verdade (só a média,
     ou nada): de longe se vê até onde o funil já foi medido */
  const real = label && !isAvg;
  return svgEl("g", { class: "edge" + (a.id === ctx.selectedEdge ? " is-selected" : ""), "data-id": a.id }, [
    svgEl("path", { class: "edge-hit", "data-id": a.id, d }),
    svgEl("path", { class: "edge-line" + (weak ? " is-weak" : "") + (real ? "" : " is-estimate"), d, "stroke-width": width.toFixed(2), "marker-end": "url(#flow-arrow)" }),
    label ? svgEl("rect", { class: "edge-label-bg", x: midX - labelWidth / 2, y: midY - 9, width: labelWidth, height: 18, rx: 9 }) : null,
    label ? svgText("edge-label" + (weak ? " is-weak" : "") + (isAvg ? " is-avg" : ""), midX, midY + 3.5, label, { "text-anchor": "middle" }) : null
  ]);
}

