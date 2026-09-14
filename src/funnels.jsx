/* merlin · os funis
   o funil como grafo: uma lista com miniatura do fluxo e um editor de tela
   cheia com palco svg, biblioteca de tipos, painel por tipo de nó e gaveta. */
import "./shared/base.css";
import "./funnels.css";
import {
  initPage, newId, today, dayOf, dateLabel, notify, sendToDay, api, brl, parseMoney, parseMentions, foldKey,
  clients, clientName, debounce
} from "./shared/core.js";
import { useState, useEffect, useLayoutEffect, useRef, useMemo, createElement } from "react";
import {
  mount, useCollection, useClients, useHash, useKeydown, isTyping, useFields,
  Form, Field, Dialog, Markdown, ClientBadge, clientOptionList, EmptyStart, FunnelThumb, ShareDialog, icon, DateField
} from "./shared/ui.jsx";
import { FUNNEL_TEMPLATES, funnelGroups, funnelChain, funnelShape, funnelSize, buildFunnel } from "./shared/templates.js";
import { NODE_W, NODE_H, computeLayers, layoutNodes } from "./shared/funnel-layout.js";
/* o cartão, a aresta e os tipos de etapa moram no funnel-draw: a página
   pública (share.html) pinta o funil com o mesmo desenho */
import {
  PORT_Y, NODE_TYPES, typeOf, labelOf, formatNumber, formatRate, formatAvg, truncate,
  LINKED_GROUPS, AUTOMATION_TOOLS, linkedCounts, computeProjections, nodeCaption, svgEl, svgText, drawNode, drawEdge
} from "./shared/funnel-draw.js";

initPage("funnels");

/* ---------- tipos de etapa ----------
   uma etapa é um lugar onde dá para dizer "N pessoas estiveram aqui" e
   "X% passaram daqui para a próxima". o que não passa nesse teste não é
   etapa: o CTA é um elemento dentro da página (o clique nele é a aresta,
   não o nó), o bump acontece na mesma tela do checkout, e o remarketing é
   caminho de volta — os três moram nos campos, nas ofertas e nas
   automações, e `migrateNodes` leva para lá o que ficou de funis antigos.

   cada tipo carrega o próprio ícone e os campos que aparecem no painel
   quando uma etapa desse tipo está selecionada. o ícone é dado, não HTML:
   uma lista de [tag, atributos] em viewBox 24x24, que vira <path> de
   verdade tanto no svg do fluxo (createElementNS) quanto no html comum
   (elemento react). quem usa escolhe o tamanho.
   "conversion" marca as etapas onde entra dinheiro: são as únicas que
   ganham o verde do sistema, pra que o olho ache o fim do funil de longe —
   a página de obrigado ficou fora, porque ela confirma a venda que já
   entrou no checkout, e pintar as duas contava a mesma venda duas vezes.
   "group" é só a prateleira da biblioteca, na ordem em que o lead anda. */
const TYPE_ORDER = Object.keys(NODE_TYPES);
/* as prateleiras da biblioteca, na ordem em que o lead anda */
const TYPE_GROUPS = TYPE_ORDER.reduce((acc, t) => {
  const g = NODE_TYPES[t].group;
  const last = acc[acc.length - 1];
  if (last && last.name === g) last.types.push(t);
  else acc.push({ name: g, types: [t] });
  return acc;
}, []);
const typeLabel = (n) => typeOf(n).label;
const nodeLabel = (n) => n.title || typeLabel(n);

/* ---------- o que vem depois ----------
   a gramática do funil: para cada tipo de etapa, os tipos que costumam vir
   em seguida, do mais provável para o menos. é isso que pinta os fantasmas
   no palco no mesmo quadro em que a etapa nasce — sem rede, sem espera e
   sem custo. o Merlin entra depois, e só se for chamado, para trocar o
   genérico ("checkout") pelo concreto daquele funil ("checkout Stripe do
   plano anual"). a segunda linha de cada entrada é o porquê, que vira o
   texto de ajuda do fantasma: um funil só ensina se disser por que aquela
   etapa deveria existir. */
const NEXT_STAGES = {
  traffic:    [["impression", "quem viu"], ["ad", "o criativo que recebe a verba"], ["lp", "onde a verba cai"]],
  impression: [["click", "o ctr mora nesta passagem"], ["ad", "o criativo por trás da impressão"]],
  ad:         [["click", "quantos clicaram no que viram"], ["lp", "a página que recebe o clique"], ["product", "o anúncio do marketplace"]],
  click:      [["lp", "a página que recebe o clique"], ["vsl", "o vídeo que recebe o clique"], ["product", "a página do produto"], ["capture", "captura direta, sem página"]],
  lp:         [["capture", "a página sem formulário não vira lead"], ["checkout", "venda direta, sem captura"], ["vsl", "o vídeo que sustenta a oferta"], ["quiz", "qualificar antes de gastar time de venda"]],
  vsl:        [["capture", "quem assistiu e deixou contato"], ["checkout", "o botão embaixo do vídeo"], ["booking", "vsl de serviço termina em agenda"]],
  webinar:    [["capture", "inscrição na aula"], ["checkout", "a oferta no fim da aula"], ["booking", "quem quer conversar depois"]],
  product:    [["cart", "quem pôs no carrinho"], ["checkout", "compra direta, sem carrinho"]],
  capture:    [["email", "lead sem sequência esfria"], ["whatsapp", "onde a conversa continua"], ["quiz", "separar quem tem perfil"], ["thanks", "a confirmação do cadastro"]],
  quiz:       [["booking", "quem passou no corte vai para a agenda"], ["capture", "guardar quem não passou"], ["whatsapp", "seguir a conversa"]],
  dm:         [["whatsapp", "tirar da rede social e levar pro fluxo"], ["booking", "marcar a conversa"], ["capture", "pegar o contato de verdade"]],
  group:      [["whatsapp", "o disparo para o grupo"], ["webinar", "o evento que o grupo assiste"], ["checkout", "a oferta para dentro do grupo"]],
  email:      [["lp", "a página para onde a sequência manda"], ["checkout", "a oferta da sequência"], ["booking", "a call que a sequência pede"], ["webinar", "a aula que a sequência convida"]],
  whatsapp:   [["booking", "a agenda que sai da conversa"], ["checkout", "o link de pagamento"], ["proposal", "a proposta que sai da conversa"]],
  booking:    [["call", "marcar não é acontecer: o show-up é aqui"]],
  call:       [["proposal", "a proposta que sai da call"], ["closing", "call que já fecha"]],
  proposal:   [["closing", "proposta enviada não é contrato"], ["call", "a call de negociação"]],
  closing:    [["onboarding", "contrato assinado sem ativação vira churn"]],
  cart:       [["checkout", "carrinho abandonado é o vazamento mais barato de tapar"]],
  checkout:   [["payment", "iniciar não é pagar: pix e boleto caem aqui"], ["upsell", "a oferta seguinte, no calor da compra"], ["thanks", "a confirmação"]],
  payment:    [["thanks", "a confirmação"], ["upsell", "a oferta seguinte"], ["onboarding", "a primeira entrega"]],
  thanks:     [["upsell", "a página de obrigado é a mais barata para ofertar"], ["onboarding", "o começo da entrega"]],
  upsell:     [["downsell", "quem disse não ao upsell"], ["thanks", "a confirmação"], ["onboarding", "o começo da entrega"]],
  downsell:   [["thanks", "a confirmação"], ["onboarding", "o começo da entrega"]],
  onboarding: [["repurchase", "o cliente que ativa é o que compra de novo"]],
  repurchase: [],
  custom:     []
};
/* funil vazio: por onde ele começa */
const FIRST_STAGES = [["traffic", "de onde vem a gente"], ["ad", "o criativo que puxa"], ["lp", "a página que recebe"]];
const MAX_GHOSTS = 3;

/* os fantasmas de uma etapa: o que a gramática sugere, menos o que já sai
   dela. quem já tem três saídas não precisa de palpite — o funil ali já
   está decidido, e um fantasma a mais só sujaria o palco. */
function ghostsFor(doc, node) {
  const taken = new Set(doc.edges.filter((a) => a.from === node.id)
    .map((a) => doc.nodes.find((n) => n.id === a.to)).filter(Boolean).map((n) => n.type));
  if (taken.size >= MAX_GHOSTS) return [];
  return (NEXT_STAGES[node.type] || [])
    .filter(([type]) => !taken.has(type))
    .slice(0, MAX_GHOSTS)
    .map(([type, why]) => ({ type, title: "", note: why }));
}


/* valores gravados em inglês; o que aparece na tela, em português */
const CREATIVE_FORMATS = [["image", "imagem"], ["video", "video"], ["carousel", "carrossel"], ["text", "texto"], ["other", "outro"]];
const CREATIVE_STATUS = [["idea", "ideia"], ["producing", "produzindo"], ["live", "no-ar"], ["paused", "pausado"]];
const AUTOMATION_STATUS = [["idea", "ideia"], ["active", "ativa"], ["paused", "pausada"]];
const OFFER_TYPES = [["main", "principal"], ["bump", "bump"], ["upsell", "upsell"], ["downsell", "downsell"], ["recurring", "recorrencia"]];

/* o que nasce ao clicar em "+ novo": os mesmos textos de antes */
const NEW_ITEM = {
  creatives: () => ({ title: "novo criativo", format: "image", angle: "", url: "", status: "idea" }),
  automations: () => ({ name: "nova automação", trigger: "", action: "", tool: "", status: "idea" }),
  offers: () => ({ name: "nova oferta", price: 0, type: "main", promise: "", guarantee: "" }),
  triggers: () => ({ name: "novo gatilho", usage: "" })
};

const DRAWERS = { creatives: "criativos", automations: "automações", offers: "ofertas", triggers: "gatilhos", numbers: "números" };

/* ---------- geometria do fluxo ----------
   o cartão tem três faixas: ícone + tipo + título, o número do período, e
   os chips do que está ligado à etapa (criativos, automações...). a altura
   é fixa para as portas ficarem sempre no meio e as arestas não pularem. */
const GRID = 24; // passo da grade de pontos do palco, em px de tela a 100%
const MIN_K = 0.2, MAX_K = 2.5; // limites do zoom, os mesmos para botão, roda e pinça
/* enquadrar tem piso: numa tela estreita, caber o funil inteiro dava 10% —
   letra de formiga e etapa de dois pixels, impossível de tocar. abaixo deste
   piso o enquadrar prefere encostar no começo do funil e deixar o resto para
   o arrasto. */
const MIN_FIT_K = 0.62;
const GHOSTS_KEY = "merlin:funnels:ghosts"; // a tira de próximas etapas, ligada ou desligada neste aparelho
const LOCK_KEY = "merlin:funnels:lock";     // o palco travado: navegar e ler sem mover, ligar nem apagar etapa
const MINI_W = 168, MINI_H = 108;          // o minimapa, em px de tela

/* ---------- ícones só desta página ---------- */
const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
);
const MinusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
);
const FitIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4H5a1 1 0 00-1 1v4M15 4h4a1 1 0 011 1v4M9 20H5a1 1 0 01-1-1v-4M15 20h4a1 1 0 001-1v-4" /></svg>
);
const LayoutIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="6" height="5" rx="1.5" /><rect x="15" y="3" width="6" height="5" rx="1.5" /><rect x="15" y="16" width="6" height="5" rx="1.5" /><path d="M9 7.5h3v-2h3M12 7.5v11h3" /></svg>
);
const PanelIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></svg>
);
/* a próxima etapa: um retângulo tracejado com um "+" dentro — o mesmo
   desenho que o palco usa, em 24px */
const GhostIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="7" width="17" height="10" rx="2.5" strokeDasharray="3.4 2.6" /><path d="M9 12h6M12 9v6" /></svg>
);
const SparkIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l1.9 6.1 6.1 1.9-6.1 1.9L12 18.5l-1.9-6.1-6.1-1.9 6.1-1.9z" /></svg>
);
const MoreIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
);
const LockIcon = ({ open }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d={open ? "M8 10.5V7.5a4 4 0 017.6-1.7" : "M8 10.5V7.5a4 4 0 018 0v3"} /></svg>
);
const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4" y="4" width="12" height="12" rx="2" /><path d="M9 16v2a2 2 0 002 2h7a2 2 0 002-2v-7a2 2 0 00-2-2h-2" /></svg>
);

/* o ícone de um tipo em html comum (biblioteca, painel): 16px, como antes */
function TypeIcon({ def }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {def.icon.map(([tag, attrs], i) => createElement(tag, { ...attrs, key: i }))}
    </svg>
  );
}

/* ---------- formatação ---------- */
const orderedNodes = (doc) => [...doc.nodes].sort((a, b) => a.x - b.x || a.y - b.y);
const trafficCost = (doc) => doc.nodes.filter((n) => n.type === "traffic").reduce((s, n) => s + (+n.fields.cost || 0), 0);

/* onde entra um nó novo vindo de sugestão: à direita do último nó da última
   camada, sem ligar aresta nenhuma — é material solto até o Arthur decidir
   onde encaixar de verdade. */
function nextFreePosition(doc) {
  if (!doc.nodes.length) return { x: 60, y: 60 };
  const layer = computeLayers(doc.nodes, doc.edges);
  let maxLayer = -1, refX = 0, refY = 0;
  doc.nodes.forEach((n) => {
    const c = layer.get(n.id) || 0;
    if (c > maxLayer || (c === maxLayer && n.x > refX)) { maxLayer = c; refX = n.x; refY = n.y; }
  });
  return { x: refX + NODE_W + 96, y: refY };
}

/* o número que um retrato guardou para uma etapa, quando se está comparando */
function comparedNumber(doc, comparing, nodeId) {
  if (!comparing) return null;
  const s = doc.snapshots.find((r) => r.id === comparing);
  if (!s) return null;
  const v = s.numbers[nodeId];
  return v == null ? null : v;
}

/* ---------- coleção ---------- */
function normalizeNode(n) {
  return {
    id: n.id || newId(),
    type: NODE_TYPES[n.type] ? n.type : "custom",
    title: String(n.title || ""),
    x: Number.isFinite(+n.x) ? +n.x : 0,
    y: Number.isFinite(+n.y) ? +n.y : 0,
    fields: n.fields && typeof n.fields === "object" ? { ...n.fields } : {},
    number: n.number === null || n.number === undefined || n.number === "" ? null : +n.number,
    note: String(n.note || "")
  };
}
function normalizeEdge(a) {
  return {
    id: a.id || newId(), from: a.from, to: a.to, label: String(a.label || ""),
    avgRate: a.avgRate === null || a.avgRate === undefined || a.avgRate === "" ? null : +a.avgRate
  };
}
const normalizeList = (list) => (Array.isArray(list) ? list.map((x) => ({ ...x, id: x.id || newId() })) : []);

/* ---------- funis de antes da limpeza ----------
   houve um tempo em que cta, bump e remarketing eram etapas. nenhum dos
   três é: o cta é um elemento da página (o clique nele é a aresta), o bump
   acontece na mesma tela do checkout e o remarketing é caminho de volta.
   ao abrir um funil antigo, cada um vai para onde é a casa dele — campo,
   oferta, automação — e a aresta se costura por cima, multiplicando as
   taxas médias para o caminho continuar valendo o mesmo (lp>cta 30% e
   cta>checkout 90% viram lp>checkout 27%). nada se perde: um nó desses sem
   pai nenhum vira etapa livre em vez de sumir.
   é idempotente de graça — depois de rodar não sobra nó legado, e a
   primeira linha devolve o documento intacto. */
const LEGACY_NODES = { cta: "field", bump: "offer", remarketing: "automation" };
const PAGE_TYPES = new Set(["lp", "vsl", "webinar", "product"]);

/* tira um nó do meio do caminho e liga quem entrava nele a quem saía */
function stitchAround(edges, id) {
  const incoming = edges.filter((a) => a.to === id && a.from !== id);
  const outgoing = edges.filter((a) => a.from === id && a.to !== id);
  const rest = edges.filter((a) => a.from !== id && a.to !== id);
  incoming.forEach((i) => outgoing.forEach((o) => {
    if (i.from === o.to) return; // costurar isso faria um laço de um nó só
    if (rest.some((a) => a.from === i.from && a.to === o.to)) return;
    const rate = i.avgRate != null && o.avgRate != null ? Math.round(i.avgRate * o.avgRate) / 100
      : i.avgRate != null ? i.avgRate : o.avgRate == null ? null : o.avgRate;
    rest.push({ id: newId(), from: i.from, to: o.to, label: i.label || o.label || "", avgRate: rate });
  }));
  return rest;
}

function migrateLegacy(d) {
  const raw = Array.isArray(d.nodes) ? d.nodes : [];
  if (!raw.some((n) => n && LEGACY_NODES[n.type])) return d; // o caminho de todo dia sai por aqui
  const nodes = raw.map((n) => ({ ...n, fields: { ...(n.fields || {}) } })); // nada de mexer no documento de quem chamou
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const lists = {
    creatives: Array.isArray(d.creatives) ? d.creatives.map((x) => ({ ...x })) : [],
    automations: Array.isArray(d.automations) ? d.automations.map((x) => ({ ...x })) : [],
    offers: Array.isArray(d.offers) ? d.offers.map((x) => ({ ...x })) : [],
    triggers: Array.isArray(d.triggers) ? d.triggers.map((x) => ({ ...x })) : []
  };
  let edges = Array.isArray(d.edges) ? d.edges.map((a) => ({ ...a })) : [];
  const keep = [];

  nodes.forEach((n) => {
    const kind = LEGACY_NODES[n.type];
    if (!kind) { keep.push(n); return; }
    const title = String(n.title || "").trim();
    const parents = edges.filter((a) => a.to === n.id && a.from !== n.id).map((a) => byId.get(a.from)).filter(Boolean);
    const page = parents.find((p) => PAGE_TYPES.has(p.type));
    const host = page || parents.find((p) => p.type === "checkout") || parents[0] || null;

    /* o que estava pendurado no nó que vai embora passa a morar no hospedeiro
       — e se a oferta (ou a automação) já existia apontando pra cá, ela é a
       própria migração: escrever outra igual só daria linha repetida. */
    const hosted = { creatives: 0, automations: 0, offers: 0, triggers: 0 };
    Object.keys(lists).forEach((k) => lists[k].forEach((it) => {
      if (it.node !== n.id) return;
      hosted[k]++;
      it.node = host ? host.id : "";
    }));

    if (kind === "field") {
      const text = String(n.fields.text || "").trim() || title;
      const target = String(n.fields.target || "").trim();
      if (page) {
        if (text && !page.fields.cta) page.fields.cta = text;
        if (target && !page.fields.ctaTarget) page.fields.ctaTarget = target;
      } else if (host && (text || target)) {
        /* o pai não tem campo de cta (um e-mail, um whatsapp): vira nota dele */
        host.note = [String(host.note || "").trim(), "cta: " + [text, target].filter(Boolean).join(" → ")].filter(Boolean).join("\n");
      } else {
        keep.push({ ...n, type: "custom" }); // órfão: fica no palco como etapa livre
        return;
      }
    } else if (kind === "offer") {
      if (!hosted.offers) lists.offers.push({
        id: newId(), name: title || "bump", price: +n.fields.price || 0, type: "bump",
        promise: String(n.note || ""), guarantee: "", node: host ? host.id : ""
      });
    } else if (!hosted.automations) {
      const days = n.fields.window;
      lists.automations.push({
        id: newId(), name: title || "remarketing",
        trigger: days ? "não avançou em " + days + " dias" : "",
        action: String(n.note || n.fields.audience || ""),
        tool: String(n.fields.channel || ""), status: "idea", node: host ? host.id : ""
      });
    }
    edges = stitchAround(edges, n.id);
  });
  return { ...d, nodes: keep, edges, ...lists };
}
function normalize(raw) {
  const d = migrateLegacy(raw);
  return {
    id: d.id,
    name: String(d.name || ""),
    client: d.client || "",
    channel: d.channel || "",
    nodes: Array.isArray(d.nodes) ? d.nodes.map(normalizeNode) : [],
    edges: Array.isArray(d.edges) ? d.edges.map(normalizeEdge) : [],
    creatives: normalizeList(d.creatives),
    automations: normalizeList(d.automations),
    offers: normalizeList(d.offers),
    triggers: normalizeList(d.triggers),
    period: d.period && typeof d.period === "object" ? { from: d.period.from || "", to: d.period.to || "" } : { from: "", to: "" },
    snapshots: Array.isArray(d.snapshots) ? d.snapshots : [],
    createdAt: d.createdAt || Date.now(),
    updatedAt: d.updatedAt || Date.now(),
    v: d.v
  };
}

/* ---------- o que vai para o merlin ----------
   resumo em texto do funil como ele está agora — é só o que o worker manda
   pro modelo, então fica curto e sem nada que não ajude a sugerir. */
function funnelContext(doc) {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const stages = orderedNodes(doc).map((n) => typeLabel(n) + ": " + nodeLabel(n) + (n.number != null ? " (" + n.number + ")" : ""));
  const client = doc.client ? clients().get(doc.client) : null;
  const channel = client && doc.channel ? (client.channels || []).find((c) => c.id === doc.channel) : null;
  const rates = [];
  doc.edges.forEach((a) => {
    const from = byId.get(a.from), to = byId.get(a.to);
    if (!from || !to || !from.number || to.number == null) return;
    rates.push(nodeLabel(from) + " → " + nodeLabel(to) + " " + Math.round((to.number / from.number) * 100) + "%");
  });
  return {
    name: doc.name || "",
    client: clientName(doc.client) || "",
    channel: channel ? (channel.name || channel.type || "") : "",
    stages,
    automations: doc.automations.map((a) => a.name || ""),
    creatives: doc.creatives.map((c) => c.title || ""),
    offers: doc.offers.map((o) => (o.name || "") + " " + brl(o.price || 0)),
    triggers: doc.triggers.map((g) => g.name || ""),
    numbers: rates.join(", ") || "sem números lançados ainda"
  };
}

/* o contexto de uma etapa só, para o Merlin dizer o que vem depois DELA.
   é bem menor que o do funil inteiro de propósito: a pergunta é estreita
   ("o que sai daqui?") e a resposta tem que caber em três cartões. */
function nextStageContext(doc, node) {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const around = (dir, mine) => doc.edges.filter((a) => a[dir] === node.id).map((a) => byId.get(a[mine])).filter(Boolean).map(nodeLabel);
  return {
    name: doc.name || "",
    client: clientName(doc.client) || "",
    stage: typeLabel(node) + ": " + nodeLabel(node),
    fields: typeOf(node).fields.map((f) => (node.fields[f.key] ? f.label + ": " + node.fields[f.key] : "")).filter(Boolean),
    before: around("to", "from"),
    after: around("from", "to"),
    stages: orderedNodes(doc).map((n) => typeLabel(n) + ": " + nodeLabel(n)),
    offers: doc.offers.map((o) => o.name || ""),
    types: TYPE_ORDER.join(", ")
  };
}

/* um resumo em texto dos números como estão — o worker manda pro modelo e
   volta com uma leitura em markdown. só isso: nada aqui grava no funil. */
function numbersContext(doc) {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const order = orderedNodes(doc);
  const stages = order.map((n) => typeLabel(n) + " · " + nodeLabel(n) + " · " + (n.number == null ? "—" : n.number));
  const rates = doc.edges.map((a) => {
    const from = byId.get(a.from), to = byId.get(a.to);
    if (!from || !to) return null;
    let real = "—";
    if (from.number != null && from.number > 0 && to.number != null) real = Math.round((to.number / from.number) * 100) + "%";
    const avg = a.avgRate != null ? String(a.avgRate).replace(".", ",") + "%" : "—";
    return nodeLabel(from) + " → " + nodeLabel(to) + " · real " + real + " · média " + avg;
  }).filter(Boolean);
  const cost = trafficCost(doc);
  const capture = order.find((n) => n.type === "capture" && n.number);
  const checkout = order.find((n) => n.type === "checkout" && n.number);
  return {
    name: doc.name || "",
    period: "de " + (doc.period.from || "?") + " até " + (doc.period.to || "?"),
    stages, rates,
    cost: brl(cost),
    cpl: cost && capture ? brl(Math.round(cost / capture.number)) : "—",
    cac: cost && checkout ? brl(Math.round(cost / checkout.number)) : "—"
  };
}

/* os avisos do merlin são os mesmos nas duas tarefas; só a frase de "não
   conseguiu" muda */
async function askMerlin(task, context, failText) {
  try {
    const r = await api("/merlin", { method: "POST", body: JSON.stringify({ task, context }) });
    if (r.status === 401) { notify("entre para usar o Merlin"); return null; }
    if (r.status === 503) { notify(r.body.error || "falta configurar a chave do Merlin"); return null; }
    if (!r.ok) { notify(r.body.error || failText); return null; }
    return r.body;
  } catch (e) {
    notify("não consegui falar com o Merlin agora");
    return null;
  }
}

/* ================================================================
   o fluxo — svg desenhado à mão
   o desenho é imperativo (createElementNS, nunca HTML por string) e mora
   dentro do componente Stage, que só o envolve: redesenha quando o
   documento, a seleção, a comparação ou a projeção mudam; pan, zoom,
   arrasto de nó e ligação tocam o DOM direto, sem passar pelo estado, e
   só o resultado (posição nova, aresta nova) sobe para o documento.
   ================================================================ */
/* ---------- o fantasma ----------
   a etapa que ainda não existe, desenhada à direita da que está
   selecionada: tracejada, apagada, e com um "+" que diz que ela é um
   convite e não um dado. um clique nela vira etapa de verdade, ligada à
   anterior — e a etapa nova, já selecionada, mostra os fantasmas dela.
   é assim que o funil se desenha quase sozinho, um clique por etapa.
   o fantasma é menor que o cartão real de propósito: ele não tem número,
   não tem chip e não tem o que mostrar nas duas faixas de baixo. */
const GHOST_H = 58, GHOST_GAP = 14, GHOST_DX = 96;

/* a tira de fantasmas, centrada na etapa de origem. se ela cair em cima de
   uma etapa que já existe, desce até achar chão livre — palpite nenhum vale
   esconder o que o Arthur já desenhou. */
function placeGhosts(doc, node, list) {
  if (!list.length) return [];
  const total = list.length * GHOST_H + (list.length - 1) * GHOST_GAP;
  /* funil vazio: a tira nasce sozinha no canto, sem etapa de origem */
  if (!node) return list.map((g, i) => ({ ...g, x: 60, y: Math.round(60 + i * (GHOST_H + GHOST_GAP)) }));
  const x = node.x + NODE_W + GHOST_DX;
  const others = doc.nodes.filter((n) => n.id !== node.id);
  const busy = (top) => others.some((o) => o.x < x + NODE_W && o.x + NODE_W > x && o.y < top + total && o.y + NODE_H > top);
  let top = node.y + NODE_H / 2 - total / 2;
  for (let i = 0; i < 8 && busy(top); i++) top += NODE_H + 28;
  return list.map((g, i) => ({ ...g, x, y: Math.round(top + i * (GHOST_H + GHOST_GAP)) }));
}

function drawGhost(g, i, from) {
  const def = NODE_TYPES[g.type] || NODE_TYPES.custom;
  const cy = GHOST_H / 2;
  const x1 = from ? from.x + NODE_W + 5 : 0, y1 = from ? from.y + PORT_Y : 0, x2 = g.x - 5, y2 = g.y + cy;
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
  return svgEl("g", { class: "ghost", "data-ghost": String(i) }, [
    from ? svgEl("path", { class: "ghost-link", d: "M " + x1 + " " + y1 + " C " + (x1 + dx) + " " + y1 + " " + (x2 - dx) + " " + y2 + " " + x2 + " " + y2 }) : null,
    svgEl("g", { class: "ghost-card", transform: "translate(" + g.x + "," + g.y + ")" }, [
      svgEl("rect", { class: "ghost-box", width: NODE_W, height: GHOST_H, rx: 12 }),
      svgEl("g", { class: "ghost-icon" + (def.conversion ? " is-conversion" : ""), transform: "translate(17," + (cy - 7) + ") scale(.5833)" }, def.icon.map(([tag, attrs]) => svgEl(tag, attrs))),
      svgText("ghost-type", 46, cy - 5, def.label),
      svgText("ghost-why", 46, cy + 10, truncate(g.title || g.note || "", 27)),
      svgEl("g", { class: "ghost-plus", transform: "translate(" + (NODE_W - 19) + "," + cy + ")" }, [
        svgEl("circle", { r: 9 }),
        svgEl("path", { d: "M-4.5 0h9M0 -4.5v9" })
      ])
    ])
  ]);
}

/* a única porta da tira para a rede: trocar o palpite genérico da gramática
   pelo palpite deste funil, com nome de produto e de ferramenta dentro. */
function askRow(x, y, thinking) {
  return svgEl("g", { class: "ghost-ask" + (thinking ? " is-thinking" : "") }, [
    svgEl("rect", { class: "ghost-ask-box", x, y, width: NODE_W, height: 26, rx: 13 }),
    svgText("ghost-ask-text", x + NODE_W / 2, y + 17, thinking ? "pensando…" : "✦ pedir ao Merlin", { "text-anchor": "middle" })
  ]);
}

/* o palco. `api` é um ref que o editor usa para pedir zoom, enquadrar e
   converter coordenadas — a vista mora aqui, e só aqui. */
function Stage(props) {
  const { api, doc, selected, comparing, projections, ghosts, empty } = props;
  const wrapRef = useRef(null), svgRef = useRef(null), worldRef = useRef(null);
  const edgesRef = useRef(null), nodesRef = useRef(null), ghostsRef = useRef(null), tempRef = useRef(null);
  const viewRef = useRef(null);
  const miniRef = useRef(null), miniSvgRef = useRef(null), miniNodesRef = useRef(null), miniViewRef = useRef(null);
  const miniDrag = useRef(false);
  const liveRef = useRef({ nodes: [], edges: [] }); // cópia de trabalho: o arrasto mexe nela, nunca no documento
  const latest = useRef(props);
  latest.current = props;
  const [dropping, setDropping] = useState(false);

  /* escala mínima entre 1 e a que faz o grafo inteiro caber com margem de
     40px — nunca amplia além do tamanho real dos nós, só reduz quando precisa.
     a margem da direita conta o painel, que fica por cima do palco:
     enquadrar num palco "cheio" esconderia as pontas. a biblioteca não conta
     — ela é um pop-up que abre e fecha, não uma coluna. */
  const freeArea = () => {
    const r = wrapRef.current.getBoundingClientRect();
    const p = latest.current;
    const wide = window.innerWidth >= 900;
    const right = wide && p.panelOpen ? 344 : 0;
    const bottom = p.drawerOpen ? Math.min(r.height * 0.46, 440) + 76 : 64;
    return { left: 0, top: 64, width: Math.max(120, r.width - right), height: Math.max(120, r.height - 64 - bottom) };
  };
  /* `readable` e a vista de quando o funil abre: ali o que importa e enxergar
     o comeco, nao caber tudo. o "enquadrar tudo" do menu passa sem ela e
     mostra o funil inteiro — mas nem ai desce abaixo do piso numa tela
     estreita, onde uma etapa de dois pixels nao se toca. */
  const fitView = (area, nodes, readable) => {
    if (!nodes.length) return { x: area.left + 60, y: area.top + 60, k: 1 };
    const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs) - 40, minY = Math.min(...ys) - 40;
    const maxX = Math.max(...xs.map((x) => x + NODE_W)) + 40;
    const maxY = Math.max(...ys.map((y) => y + NODE_H)) + 40;
    const worldW = Math.max(1, maxX - minX), worldH = Math.max(1, maxY - minY);
    const floor = readable || area.width < 700 ? MIN_FIT_K : MIN_K;
    const k = Math.max(floor, Math.min(1, area.width / worldW, area.height / worldH));
    /* o que couber fica centrado; o que não couber começa no canto de cima à
       esquerda — que num funil é a primeira etapa, por onde se lê */
    const restX = area.width - worldW * k, restY = area.height - worldH * k;
    return {
      x: area.left - minX * k + (restX > 0 ? restX / 2 : 24),
      y: area.top - minY * k + (restY > 0 ? restY / 2 : 16),
      k
    };
  };

  /* a grade de pontos do palco anda junto com o mundo: é css no fundo do
     palco, deslocado pela mesma vista — barato e dá a sensação de chão. em
     zoom muito baixo os pontos ficariam colados, então a grade dobra o passo. */
  const applyView = () => {
    const v = viewRef.current;
    worldRef.current.setAttribute("transform", "translate(" + v.x + "," + v.y + ") scale(" + v.k + ")");
    let step = GRID * v.k;
    while (step < 14) step *= 2;
    while (step > 60) step /= 2;
    wrapRef.current.style.backgroundSize = step + "px " + step + "px";
    wrapRef.current.style.backgroundPosition = v.x + "px " + v.y + "px";
    drawMiniView();
    latest.current.onZoom(v.k);
  };

  /* ---------- o minimapa ----------
     o funil inteiro em miniatura, no canto de baixo, com o retângulo do que
     está à vista. só aparece quando serve: quando alguma etapa ficou fora da
     tela. com o painel ou a gaveta abertos ele sai, porque ali o olho está
     numa etapa, não no funil. tocar ou arrastar nele leva a vista junto. */
  /* o que está à vista, em coordenadas do mundo: a área livre, sem o que a
     biblioteca e o painel cobrem */
  const visibleWorld = () => {
    const a = freeArea(), v = viewRef.current;
    return { x: (a.left - v.x) / v.k, y: (a.top - v.y) / v.k, w: a.width / v.k, h: a.height / v.k };
  };
  /* o recorte do minimapa é o funil somado ao que está à vista: assim o
     retângulo da vista nunca sai para fora da miniatura */
  const miniBounds = () => {
    const nodes = liveRef.current.nodes;
    if (!nodes.length || !viewRef.current) return null;
    const s = visibleWorld();
    const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
    const x = Math.min(s.x, ...xs.map((v) => v - 60)), y = Math.min(s.y, ...ys.map((v) => v - 60));
    const x2 = Math.max(s.x + s.w, ...xs.map((v) => v + NODE_W + 60)), y2 = Math.max(s.y + s.h, ...ys.map((v) => v + NODE_H + 60));
    return { x, y, w: x2 - x, h: y2 - y };
  };
  const drawMiniNodes = () => {
    if (!miniSvgRef.current) return;
    miniNodesRef.current.replaceChildren(...liveRef.current.nodes.map((n) =>
      svgEl("rect", { class: typeOf(n).conversion ? "is-conversion" : null, x: n.x, y: n.y, width: NODE_W, height: NODE_H, rx: 16 })));
  };
  const drawMiniView = () => {
    const box = miniRef.current, v = viewRef.current;
    if (!box || !v || !wrapRef.current) return;
    const p = latest.current;
    const nodes = liveRef.current.nodes;
    const a = freeArea();
    const outside = nodes.some((n) => {
      const x1 = v.x + n.x * v.k, y1 = v.y + n.y * v.k;
      return x1 < a.left || y1 < a.top || x1 + NODE_W * v.k > a.left + a.width || y1 + NODE_H * v.k > a.top + a.height;
    });
    const show = miniDrag.current || (outside && !p.panelOpen && !p.drawerOpen);
    box.classList.toggle("is-shown", show);
    if (!show) return;
    /* arrastando no minimapa o recorte fica parado, senão ele fugiria da mão */
    if (!miniDrag.current) {
      const b = miniBounds();
      miniSvgRef.current.setAttribute("viewBox", b.x + " " + b.y + " " + b.w + " " + b.h);
    }
    const s = visibleWorld(), rect = miniViewRef.current;
    rect.setAttribute("x", s.x); rect.setAttribute("y", s.y);
    rect.setAttribute("width", s.w); rect.setAttribute("height", s.h);
  };
  /* o ponto tocado no minimapa vai para o meio da área livre */
  const miniGo = (e) => {
    const svg = miniSvgRef.current, b = miniBounds();
    if (!svg || !b) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const w = pt.matrixTransform(svg.getScreenCTM().inverse());
    const a = freeArea(), v = viewRef.current;
    viewRef.current = { ...v, x: a.left + a.width / 2 - w.x * v.k, y: a.top + a.height / 2 - w.y * v.k };
    applyView();
  };
  const miniDown = (e) => { e.preventDefault(); miniDrag.current = true; e.currentTarget.setPointerCapture(e.pointerId); miniGo(e); };
  const miniMove = (e) => { if (miniDrag.current) miniGo(e); };
  const miniUp = () => { if (!miniDrag.current) return; miniDrag.current = false; drawMiniView(); };
  const toWorld = (clientX, clientY) => {
    const r = svgRef.current.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - r.left - v.x) / v.k, y: (clientY - r.top - v.y) / v.k };
  };
  /* zoom pelos botões: em torno do centro da área livre, não do canto */
  const zoomBy = (factor) => {
    const a = freeArea(), v = viewRef.current;
    const cx = a.left + a.width / 2, cy = a.top + a.height / 2;
    const wx = (cx - v.x) / v.k, wy = (cy - v.y) / v.k;
    const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
    viewRef.current = { x: cx - wx * k, y: cy - wy * k, k };
    applyView();
  };
  const fit = (nodes) => {
    viewRef.current = fitView(freeArea(), nodes || latest.current.doc.nodes);
    applyView();
  };
  /* traz um retângulo do mundo para dentro da área livre com o menor
     empurrão que resolve — sem mexer no zoom e sem reenquadrar. é o que
     mantém a corrente de fantasmas andando: a etapa nova abre o painel da
     direita, e a tira seguinte nasceria justo atrás dele. */
  const ensureVisible = (box) => {
    const a = freeArea(), v = viewRef.current, M = 24;
    const x1 = v.x + box.x * v.k, x2 = v.x + (box.x + box.w) * v.k;
    const y1 = v.y + box.y * v.k, y2 = v.y + (box.y + box.h) * v.k;
    let dx = 0, dy = 0;
    if (x2 > a.left + a.width - M) dx = a.left + a.width - M - x2;
    if (x1 + dx < a.left + M) dx = a.left + M - x1; // não cabe inteiro: o começo é que importa
    if (y2 > a.top + a.height - M) dy = a.top + a.height - M - y2;
    if (y1 + dy < a.top + M) dy = a.top + M - y1;
    if (!dx && !dy) return;
    viewRef.current = { ...v, x: v.x + dx, y: v.y + dy };
    applyView();
  };

  const contextOf = () => {
    const p = latest.current;
    const byId = new Map(liveRef.current.nodes.map((n) => [n.id, n]));
    const vals = liveRef.current.nodes.map((n) => n.number).filter((v) => v != null && v > 0);
    return {
      nodeById: (id) => byId.get(id),
      selectedNode: p.selected && p.selected.kind === "node" ? p.selected.id : null,
      selectedEdge: p.selected && p.selected.kind === "edge" ? p.selected.id : null,
      projections: p.projections,
      maxVolume: vals.length ? Math.max(...vals) : 1,
      compared: (id) => comparedNumber(p.doc, p.comparing, id),
      linked: (id) => linkedCounts(p.doc, id)
    };
  };
  const drawEdges = (ctx) => { edgesRef.current.replaceChildren(...liveRef.current.edges.map((a) => drawEdge(a, ctx)).filter(Boolean)); };
  /* os fantasmas moram numa camada só deles: aparecem e somem sem tocar
     no resto do desenho, e saem da frente assim que um arrasto começa. */
  const drawGhosts = () => {
    const g = latest.current.ghosts;
    if (!g || !g.list.length) { ghostsRef.current.replaceChildren(); return; }
    const from = g.from ? liveRef.current.nodes.find((n) => n.id === g.from) : null;
    if (g.from && !from) { ghostsRef.current.replaceChildren(); return; }
    const list = placeGhosts({ nodes: liveRef.current.nodes }, from, g.list);
    const drawn = list.map((x, i) => drawGhost(x, i, from));
    /* a gramática já respondeu; quem quiser o palpite deste funil em vez do
       palpite de qualquer funil pede aqui, e só aqui é que a rede é usada. */
    if (from && !g.merlin) {
      const last = list[list.length - 1];
      drawn.push(askRow(last.x, last.y + GHOST_H + 10, g.thinking));
    }
    ghostsRef.current.replaceChildren(...drawn);
  };
  const redraw = () => {
    const ctx = contextOf();
    nodesRef.current.replaceChildren(...liveRef.current.nodes.map((n) => drawNode(n, ctx)));
    drawEdges(ctx);
    drawGhosts();
    drawMiniNodes();
    drawMiniView();
  };
  /* durante o arrasto só o nó que anda e as arestas dele são refeitos */
  const patchNode = (id) => {
    const n = liveRef.current.nodes.find((x) => x.id === id);
    if (!n) return;
    const ctx = contextOf();
    const g = nodesRef.current.querySelector('.node[data-id="' + id + '"]');
    if (g) g.replaceWith(drawNode(n, ctx));
    drawEdges(ctx);
  };

  /* o documento mudou: copia as posições e redesenha tudo. na primeira vez
     (o funil acabou de abrir) enquadra o fluxo, com o palco já visível —
     medir antes disso daria retângulo zero e uma escala degenerada. depois
     disso a vista é de quem mexe: editar não reenquadra. */
  useEffect(() => {
    liveRef.current = { nodes: doc.nodes.map((n) => ({ ...n })), edges: doc.edges };
    if (!viewRef.current) { viewRef.current = fitView(freeArea(), doc.nodes, true); applyView(); }
    redraw();
  }, [doc, selected, comparing, projections, ghosts]);
  /* abrir o painel ou a gaveta muda a área livre: o minimapa confere de novo */
  useEffect(() => { drawMiniView(); }, [props.panelOpen, props.drawerOpen]);
  useEffect(() => {
    const onResize = () => drawMiniView();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    api.current = {
      zoomBy, fit, ensureVisible,
      resetZoom: () => zoomBy(1 / viewRef.current.k),
      toWorld,
      center: () => { const r = wrapRef.current.getBoundingClientRect(); return toWorld(r.left + r.width / 2, r.top + r.height / 2); }
    };
  }, []);

  /* ---------- pan, zoom, arrasto de nó, ligação ---------- */
  useEffect(() => {
    const el = svgRef.current;
    let dragNode = null, pan = null, linking = null;
    /* os dedos na tela. com dois, quem manda e a pinca: o que estava
       comecando (arrastar o palco, arrastar a etapa, puxar uma ligacao) e
       encerrado ali mesmo, senao a etapa viajava junto com o zoom. */
    const pointers = new Map();
    let pinch = null;
    const commitDrag = () => {
      if (!dragNode) return;
      if (dragNode.moved) {
        const n = liveRef.current.nodes.find((x) => x.id === dragNode.id);
        if (n) {
          n.x = Math.round(n.x / 12) * 12; n.y = Math.round(n.y / 12) * 12;
          patchNode(n.id);
          latest.current.onMoveNode(n.id, n.x, n.y);
        }
      }
      dragNode = null;
    };
    const startPinch = () => {
      const [a, b] = [...pointers.values()];
      commitDrag();
      linking = null; tempRef.current.replaceChildren();
      if (pan) { pan = null; el.classList.remove("is-panning"); }
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, view: { ...viewRef.current } };
    };
    const down = (e) => {
      if (e.button > 0) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) { e.preventDefault(); startPinch(); return; }
      if (pointers.size > 2) return;
      /* tocar no palco tira o cursor de qualquer campo: os atalhos (Tab,
         Del, +/-) passam a valer no fluxo. o preventDefault abaixo engole o
         mousedown que faria isso sozinho. */
      const active = document.activeElement;
      if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) active.blur();
      const p = latest.current;
      /* o fantasma é um convite, não um objeto: um toque nele já vira etapa */
      if (e.target.closest(".ghost-ask")) { e.preventDefault(); p.onAskMerlin(); return; }
      const ghostEl = e.target.closest(".ghost");
      if (ghostEl) { e.preventDefault(); p.onAcceptGhost(+ghostEl.dataset.ghost); return; }
      const handle = e.target.closest(".node-handle");
      const nodeEl = e.target.closest(".node");
      const edgeEl = e.target.closest(".edge");
      if (handle && !p.locked) { linking = { from: handle.dataset.id }; el.setPointerCapture(e.pointerId); return; }
      if (nodeEl) {
        e.preventDefault();
        const id = nodeEl.dataset.id;
        p.onSelect({ kind: "node", id });
        if (p.locked) return; // travado: tocar seleciona e mostra, mas não arrasta
        const n = liveRef.current.nodes.find((x) => x.id === id);
        if (!n) return;
        const m = toWorld(e.clientX, e.clientY);
        dragNode = { id, dx: m.x - n.x, dy: m.y - n.y, moved: false };
        ghostsRef.current.replaceChildren(); // a tira ficaria no lugar antigo enquanto a etapa anda
        el.setPointerCapture(e.pointerId);
        return;
      }
      if (edgeEl) { p.onSelect({ kind: "edge", id: edgeEl.dataset.id }); return; }
      p.onSelect(null);
      pan = { x: e.clientX, y: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y };
      el.classList.add("is-panning");
      el.setPointerCapture(e.pointerId);
    };
    const move = (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      /* pinca: a escala segue a distancia entre os dedos, e o ponto do mundo
         que estava entre eles continua entre eles enquanto a mao anda. */
      if (pinch) {
        if (pointers.size < 2) return;
        const [a, b] = [...pointers.values()];
        const r = el.getBoundingClientRect();
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const k = Math.min(MAX_K, Math.max(MIN_K, pinch.view.k * (dist / pinch.dist)));
        const wx = (pinch.cx - r.left - pinch.view.x) / pinch.view.k;
        const wy = (pinch.cy - r.top - pinch.view.y) / pinch.view.k;
        viewRef.current = { x: (a.x + b.x) / 2 - r.left - wx * k, y: (a.y + b.y) / 2 - r.top - wy * k, k };
        applyView();
        return;
      }
      if (linking) {
        const m = toWorld(e.clientX, e.clientY);
        const from = liveRef.current.nodes.find((x) => x.id === linking.from);
        if (from) {
          const x1 = from.x + NODE_W, y1 = from.y + PORT_Y;
          const dx = Math.max(40, Math.abs(m.x - x1) * 0.5);
          tempRef.current.replaceChildren(svgEl("path", { class: "temp-link", d: "M " + x1 + " " + y1 + " C " + (x1 + dx) + " " + y1 + " " + (m.x - dx) + " " + m.y + " " + m.x + " " + m.y }));
        }
        return;
      }
      if (dragNode) {
        const m = toWorld(e.clientX, e.clientY);
        const n = liveRef.current.nodes.find((x) => x.id === dragNode.id);
        if (!n) return;
        n.x = Math.round(m.x - dragNode.dx);
        n.y = Math.round(m.y - dragNode.dy);
        dragNode.moved = true;
        patchNode(n.id);
        return;
      }
      if (pan) {
        viewRef.current = { ...viewRef.current, x: pan.vx + (e.clientX - pan.x), y: pan.vy + (e.clientY - pan.y) };
        applyView();
      }
    };
    const up = (e) => {
      pointers.delete(e.pointerId);
      if (pinch) {
        if (pointers.size < 2) { pinch = null; }
        return;
      }
      const p = latest.current;
      if (linking) {
        tempRef.current.replaceChildren();
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const nodeEl = under && under.closest && under.closest(".node");
        if (nodeEl && nodeEl.dataset.id !== linking.from) p.onLink(linking.from, nodeEl.dataset.id);
        linking = null;
      }
      commitDrag(); // encaixa na grade ao soltar: o fluxo fica alinhado sem régua
      if (pan) { pan = null; el.classList.remove("is-panning"); }
    };
    /* dois cliques no vazio: uma etapa nova ali mesmo, sem ir até a biblioteca */
    const dbl = (e) => {
      if (latest.current.locked || e.target.closest(".node") || e.target.closest(".edge")) return;
      const m = toWorld(e.clientX, e.clientY);
      latest.current.onCreateNode("custom", Math.round(m.x - NODE_W / 2), Math.round(m.y - NODE_H / 2));
    };
    /* ctrl/pinça ou roda: zoom no cursor. shift + roda: pan horizontal;
       trackpad com dois dedos manda deltaX e deltaY, que viram pan. */
    const wheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(), v = viewRef.current;
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      if (e.ctrlKey || e.metaKey || (!e.shiftKey && Math.abs(e.deltaX) < 1 && !e.deltaMode && Math.abs(e.deltaY) >= 40)) {
        const wx = (mx - v.x) / v.k, wy = (my - v.y) / v.k;
        const k = Math.min(MAX_K, Math.max(MIN_K, v.k * (1 - e.deltaY * 0.0012)));
        viewRef.current = { x: mx - wx * k, y: my - wy * k, k };
      } else if (e.shiftKey) {
        viewRef.current = { ...v, x: v.x - e.deltaY };
      } else {
        viewRef.current = { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY };
      }
      applyView();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("dblclick", dbl);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("dblclick", dbl);
      el.removeEventListener("wheel", wheel);
    };
  }, []);

  /* arrasto de um tipo da biblioteca: cai onde soltou */
  const onDrop = (e) => {
    e.preventDefault();
    setDropping(false);
    const data = e.dataTransfer.getData("text/plain") || "";
    if (!data.startsWith("type:")) return;
    if (latest.current.locked) { latest.current.onLocked(); return; }
    const m = toWorld(e.clientX, e.clientY);
    latest.current.onCreateNode(data.slice(5), Math.round(m.x - NODE_W / 2), Math.round(m.y - NODE_H / 2));
  };

  return (
    <div className={"fe-stage" + (dropping ? " is-dropping" : "")} id="stage" ref={wrapRef}
         onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDropping(true); }}
         onDragLeave={() => setDropping(false)} onDrop={onDrop}>
      <svg id="flow-svg" ref={svgRef} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="context-stroke" />
          </marker>
        </defs>
        <g ref={worldRef}><g ref={edgesRef} /><g ref={nodesRef} /><g ref={ghostsRef} /><g ref={tempRef} /></g>
      </svg>
      <div className="fe-minimap glass" ref={miniRef} aria-hidden="true"
           onPointerDown={miniDown} onPointerMove={miniMove} onPointerUp={miniUp} onPointerCancel={miniUp}>
        <svg ref={miniSvgRef} width={MINI_W} height={MINI_H} preserveAspectRatio="xMidYMid meet">
          <g ref={miniNodesRef} />
          <rect className="fe-minimap__view" ref={miniViewRef} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      {empty && <p className="empty fe-empty">{ghosts
        ? <>nenhuma etapa ainda — clique num dos cartões tracejados para começar, ou escolha um tipo no <b>+</b> lá em cima.</>
        : <>nenhuma etapa ainda — escolha um tipo no <b>+</b> lá em cima, dê dois cliques no palco, ou selecione uma etapa e aperte <kbd>Tab</kbd> para ligar a próxima.</>}</p>}
    </div>
  );
}

/* ================================================================
   o editor: um funil aberto
   o estado de tela mora aqui: o documento em edição, o que está
   selecionado, qual gaveta está aberta, o retrato em comparação, a
   biblioteca e o painel. o documento é imutável — toda mudança gera um
   objeto novo por `update`, que também empilha para desfazer e agenda a
   gravação. o palco (Stage) só recebe o documento e devolve gestos.
   ================================================================ */
function Editor({ id, funnels }) {
  const [doc, setDoc] = useState(() => funnels.get(id));
  const docRef = useRef(doc);
  const undoRef = useRef([]);        // documentos anteriores, até 50, para Ctrl+Z
  const pendingFocus = useRef(null); // id da etapa recém-criada, cujo título deve ganhar o cursor
  const stage = useRef({});          // a api do palco: zoom, enquadrar, coordenadas
  const [selected, setSelected] = useState(null);   // {kind:"node"|"edge", id} | null
  const [drawer, setDrawer] = useState(null);        // chave de DRAWERS | null (fechada)
  const [comparing, setComparing] = useState(null);  // id do retrato em comparação, ou null
  const [libraryOpen, setLibraryOpen] = useState(false); // a biblioteca é pop-up do "+": abre quando se vai criar
  const [panelOpen, setPanelOpen] = useState(false); // começa fechado: o palco inteiro à vista; selecionar algo abre
  const [zoom, setZoom] = useState(100);
  const [snapshotForm, setSnapshotForm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [reading, setReading] = useState(null);      // a leitura dos números, em markdown
  const [thinking, setThinking] = useState(false);
  const [readingNumbers, setReadingNumbers] = useState(false);
  useClients();

  const projections = useMemo(() => computeProjections(doc), [doc]);

  /* ---------- gravar, desfazer, sincronizar ---------- */
  const setDocBoth = (d) => { docRef.current = d; setDoc(d); };
  const saveSoon = useMemo(() => debounce(() => {
    const d = docRef.current;
    if (d) funnels.save({ ...d, updatedAt: Date.now() });
  }, 400), [funnels]);
  const update = (fn, opts = {}) => {
    const before = docRef.current;
    const next = typeof fn === "function" ? fn(before) : fn;
    if (!next || next === before) return;
    if (opts.undo) { undoRef.current.push(before); if (undoRef.current.length > 50) undoRef.current.shift(); }
    setDocBoth(next);
    saveSoon();
  };
  const undo = () => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    setDocBoth(funnels.save(prev));
    setSelected(null);
    notify("desfeito");
  };
  /* alguém mais gravou (nuvem ou outra aba): adota a versão nova. se o
     funil sumiu, a raiz já volta para a lista sozinha. */
  useEffect(() => funnels.onChange((origin) => {
    if (origin === "local") return;
    const fresh = funnels.get(id);
    if (fresh) setDocBoth(fresh);
  }), [funnels, id]);

  /* ---------- folhas por cima do palco ---------- */
  /* no celular só cabe uma folha por vez em cima do palco */
  const showLibrary = (on) => { setLibraryOpen(on); if (on && window.innerWidth < 900) setPanelOpen(false); };
  const showPanel = (on) => { setPanelOpen(on); if (on && window.innerWidth < 900) setLibraryOpen(false); };
  const select = (sel) => { setSelected(sel); if (sel && !panelOpen) showPanel(true); }; // selecionar é pedir pra ver: o painel volta

  /* ---------- etapas e ligações ---------- */
  const patchNode = (nid, patch, opts) => update((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === nid ? { ...n, ...patch } : n)) }), opts);
  const patchEdge = (eid, patch, opts) => update((d) => ({ ...d, edges: d.edges.map((a) => (a.id === eid ? { ...a, ...patch } : a)) }), opts);
  const setNodeField = (nid, key, value) =>
    update((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === nid ? { ...n, fields: { ...n.fields, [key]: value } } : n)) }));
  const createNode = (type, x, y, seed) => {
    const def = NODE_TYPES[type] || NODE_TYPES.custom;
    const n = normalizeNode({ id: newId(), type, title: (seed && seed.title) || "", x, y, fields: {}, number: null, note: (seed && seed.note) || "" });
    def.fields.forEach((f) => { if (f.preset != null) n.fields[f.key] = f.preset; });
    update((d) => ({ ...d, nodes: [...d.nodes, n] }), { undo: true });
    pendingFocus.current = n.id; // a etapa nasce sem nome: o cursor já cai no título, pra digitar direto
    select({ kind: "node", id: n.id });
    return n;
  };
  const linkNodes = (from, to) => {
    if (docRef.current.edges.some((a) => a.from === from && a.to === to)) return;
    update((d) => ({ ...d, edges: [...d.edges, { id: newId(), from, to, label: "", avgRate: null }] }), { undo: true });
  };
  const moveNode = (nid, x, y) => patchNode(nid, { x, y }, { undo: true });
  const removeNode = (nid) => {
    const d = docRef.current;
    const node = d.nodes.find((n) => n.id === nid);
    if (!node) return;
    const cut = d.edges.filter((a) => a.from === nid || a.to === nid);
    update((x) => ({ ...x, nodes: x.nodes.filter((n) => n.id !== nid), edges: x.edges.filter((a) => a.from !== nid && a.to !== nid) }), { undo: true });
    setSelected(null);
    notify("etapa apagada", () => update((x) => ({ ...x, nodes: [...x.nodes, node], edges: [...x.edges, ...cut] })));
  };
  const removeEdge = (eid) => {
    update((x) => ({ ...x, edges: x.edges.filter((a) => a.id !== eid) }), { undo: true });
    setSelected(null);
  };
  const arrange = () => {
    if (locked) { warnLocked(); return; }
    const nodes = layoutNodes(docRef.current.nodes, docRef.current.edges);
    update((d) => ({ ...d, nodes }), { undo: true });
    stage.current.fit(nodes);
  };
  /* clique na biblioteca: vai pro centro do que está à vista, e o pop-up
     sai da frente — criar é um gesto só */
  const pickType = (type) => {
    if (locked) { warnLocked(); return; }
    const c = stage.current.center();
    createNode(type, Math.round(c.x - NODE_W / 2), Math.round(c.y - NODE_H / 2));
    setLibraryOpen(false);
  };

  /* ---------- a próxima etapa ----------
     o fantasma não é sugestão de IA: é a gramática do funil respondendo na
     hora "o que costuma vir depois disto". por isso ele aparece sozinho,
     sem botão, sem espera e sem custo — a etapa nasce já selecionada, e a
     tira dela já está lá. o Merlin entra só se for chamado, e o que ele faz
     é trocar o genérico ("checkout") pelo concreto deste funil. como toda
     tira é um palpite, ela não grava nada: só clicar num cartão cria etapa.
     quem achar que atrapalha desliga, e a escolha fica no aparelho. */
  const [ghostsOn, setGhostsOn] = useState(() => {
    try { return localStorage.getItem(GHOSTS_KEY) !== "off"; } catch (e) { return true; }
  });
  const [merlinGhosts, setMerlinGhosts] = useState(null); // {from, list} — vale só para a etapa que pediu
  const [ghosting, setGhosting] = useState(false);
  const toggleGhosts = () => setGhostsOn((on) => {
    try { localStorage.setItem(GHOSTS_KEY, on ? "off" : "on"); } catch (e) {}
    return !on;
  });
  /* o cadeado: o palco continua navegável e a etapa continua abrindo no
     painel, mas nada anda, liga, nasce ou some pelo palco. vale neste
     aparelho, como a tira de fantasmas. */
  const [locked, setLocked] = useState(() => {
    try { return localStorage.getItem(LOCK_KEY) === "on"; } catch (e) { return false; }
  });
  const toggleLock = () => setLocked((on) => {
    try { localStorage.setItem(LOCK_KEY, on ? "off" : "on"); } catch (e) {}
    notify(on ? "palco destravado" : "palco travado: dá para navegar, não para mexer");
    return !on;
  });
  const warnLocked = () => notify("o palco está travado — destrave no cadeado para mexer");

  const ghostFrom = selected && selected.kind === "node" ? doc.nodes.find((n) => n.id === selected.id) : null;
  const ghosts = useMemo(() => {
    if (!ghostsOn || locked) return null;
    if (!doc.nodes.length) return { from: null, list: FIRST_STAGES.map(([type, why]) => ({ type, title: "", note: why })) };
    if (!ghostFrom) return null;
    const mine = merlinGhosts && merlinGhosts.from === ghostFrom.id;
    const list = mine ? merlinGhosts.list : ghostsFor(doc, ghostFrom);
    return list.length ? { from: ghostFrom.id, list, merlin: mine, thinking: ghosting } : null;
  }, [doc, ghostFrom, ghostsOn, merlinGhosts, ghosting, locked]);

  /* aceitar é criar: a etapa nasce onde o fantasma estava, ligada à
     anterior, e o lote inteiro é um passo só de desfazer. */
  const acceptGhost = (i) => {
    if (!ghosts) return;
    const d = docRef.current;
    const from = ghosts.from ? d.nodes.find((n) => n.id === ghosts.from) : null;
    if (ghosts.from && !from) return;
    const g = placeGhosts(d, from, ghosts.list)[i];
    if (!g) return;
    /* o porquê da gramática é texto de ajuda, não conteúdo da etapa; o do
       Merlin é conselho sobre este funil, e esse vale guardar na nota. */
    const n = createNode(g.type, g.x, g.y, { title: g.title, note: ghosts.merlin ? g.note : "" });
    if (from) update((x) => ({ ...x, edges: [...x.edges, { id: newId(), from: from.id, to: n.id, label: "", avgRate: null }] }));
    setMerlinGhosts(null); // a tira era daquela etapa; a nova pede a dela
    /* no quadro seguinte, porque é lá que o painel da direita já abriu e a
       área livre passa a ser a de verdade */
    const strip = MAX_GHOSTS * GHOST_H + (MAX_GHOSTS - 1) * GHOST_GAP;
    requestAnimationFrame(() => stage.current.ensureVisible({
      x: g.x, y: g.y + NODE_H / 2 - strip / 2,
      w: NODE_W + GHOST_DX + NODE_W, h: Math.max(NODE_H, strip)
    }));
  };

  const askGhosts = async () => {
    if (ghosting || !ghosts || !ghosts.from) return;
    const node = docRef.current.nodes.find((n) => n.id === ghosts.from);
    if (!node) return;
    setGhosting(true);
    const body = await askMerlin("nextStage", nextStageContext(docRef.current, node), "o Merlin não conseguiu pensar na próxima etapa");
    setGhosting(false);
    if (!body) return;
    const list = (Array.isArray(body.suggestions) ? body.suggestions : [])
      .filter((s) => NODE_TYPES[s.nodeType])
      .slice(0, MAX_GHOSTS)
      .map((s) => ({ type: s.nodeType, title: s.title || "", note: s.note || "" }));
    if (!list.length) { notify("o Merlin não viu por onde continuar"); return; }
    setMerlinGhosts({ from: node.id, list });
  };

  /* ---------- criativos, automações, ofertas, gatilhos ---------- */
  const addItem = (group, item, opts) => update((d) => ({ ...d, [group]: [...d[group], item] }), opts);
  const patchItem = (group, iid, patch) => update((d) => ({ ...d, [group]: d[group].map((it) => (it.id === iid ? { ...it, ...patch } : it)) }));
  const removeItem = (group, iid) => update((d) => ({ ...d, [group]: d[group].filter((it) => it.id !== iid) }), { undo: true });
  const addHere = (group) => {
    if (!selected || selected.kind !== "node") return;
    addItem(group, { id: newId(), node: selected.id, ...NEW_ITEM[group]() }, { undo: true });
    setDrawer(group); // e a gaveta sobe já na linha nova, pra preencher
  };
  const pullCreative = (c) => {
    const d = docRef.current;
    sendToDay({ title: "produzir criativo: " + (c.title || "sem título"), client: d.client, origin: { type: "funnel", id: d.id } });
  };

  /* ---------- o funil em si (painel sem seleção) ---------- */
  const setClient = (cid) => update((d) => {
    const c = cid && clients().get(cid);
    return { ...d, client: cid, channel: "" }; // trocar de cliente derruba o canal, que era dele
  }, { undo: true });
  const setFunnelField = (key, value) => update((d) => ({ ...d, [key]: value }), { undo: true });
  const setPeriod = (key, value) => update((d) => ({ ...d, period: { ...d.period, [key]: value } }), { undo: true });
  const saveSnapshot = (label) => {
    const numbers = {};
    docRef.current.nodes.forEach((n) => { numbers[n.id] = n.number; });
    update((d) => ({ ...d, snapshots: [...d.snapshots, { id: newId(), at: Date.now(), label: label.trim() || dateLabel(today(), true), numbers }] }));
    notify("retrato salvo");
  };

  /* ---------- merlin ----------
     a sugestão nunca entra direto no funil: quem respondeu foi um modelo de
     linguagem lendo um resumo em texto do funil, não o Arthur — pode chutar
     errado, repetir algo que já existe, ou sugerir uma etapa que não faz
     sentido pra esse cliente. o diálogo com checkbox é o ponto em que um
     palpite vira decisão: cada item começa marcado (é uma aposta razoável),
     mas nada vira nó/automação/oferta real sem passar por esse crivo. */
  const suggest = async () => {
    if (thinking) return;
    setThinking(true);
    const body = await askMerlin("funnel", funnelContext(docRef.current), "o Merlin não conseguiu pensar nisso agora");
    setThinking(false);
    if (!body) return;
    const list = Array.isArray(body.suggestions) ? body.suggestions.slice(0, 12) : [];
    if (!list.length) { notify("o Merlin não teve sugestões desta vez"); return; }
    setSuggestions(list);
  };
  const addSuggestions = (picked) => {
    if (!picked.length) return;
    const d = docRef.current;
    const base = nextFreePosition(d);
    const next = { ...d, nodes: [...d.nodes], automations: [...d.automations], creatives: [...d.creatives], offers: [...d.offers], triggers: [...d.triggers] };
    let count = 0;
    picked.forEach((s) => {
      const title = s.title || "sugestão do Merlin";
      if (s.type === "node") {
        const type = NODE_TYPES[s.nodeType] ? s.nodeType : "custom";
        const n = normalizeNode({ id: newId(), type, title: s.title || "", fields: {}, number: null, note: s.note || "", x: base.x, y: base.y + count * (NODE_H + 30) });
        NODE_TYPES[type].fields.forEach((f) => { if (f.preset != null) n.fields[f.key] = f.preset; });
        next.nodes.push(n);
        count++;
      } else if (s.type === "automation") {
        next.automations.push({ id: newId(), name: title, trigger: "", action: s.note || "", tool: "", status: "idea", node: "" });
      } else if (s.type === "creative") {
        next.creatives.push({ id: newId(), title, format: "image", angle: s.note || "", url: "", status: "idea", node: "" });
      } else if (s.type === "offer") {
        const t = /bump/i.test(s.title || "") ? "bump" : /upsell/i.test(s.title || "") ? "upsell" : /downsell/i.test(s.title || "") ? "downsell" : "main";
        next.offers.push({ id: newId(), name: title, price: 0, type: t, promise: s.note || "", guarantee: "", node: "" });
      } else if (s.type === "trigger") {
        next.triggers.push({ id: newId(), name: title, usage: s.note || "", node: "" });
      }
    });
    update(next, { undo: true }); // o lote inteiro é uma entrada só de desfazer (ctrl+z ou o botão do aviso)
    setSuggestions(null);
    notify(picked.length === 1 ? "1 sugestão adicionada" : picked.length + " sugestões adicionadas", undo);
  };
  const readNumbers = async () => {
    if (readingNumbers) return;
    setReadingNumbers(true);
    const body = await askMerlin("numbers", numbersContext(docRef.current), "o Merlin não conseguiu ler os números agora");
    setReadingNumbers(false);
    if (body) setReading(body.text || "");
  };

  /* ---------- atalhos ----------
     Esc dos diálogos é deles (fecham sozinhos e seguram a tecla); aqui Esc
     fecha a gaveta e depois limpa a seleção. */
  useKeydown((e) => {
    if (e.key === "Escape") {
      if (libraryOpen) { setLibraryOpen(false); return; }
      if (drawer) { setDrawer(null); return; }
      if (selected) setSelected(null);
      return;
    }
    const typing = isTyping();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { if (!typing) { e.preventDefault(); undo(); } return; }
    if (typing) return;
    if (locked && selected && (e.key === "Delete" || e.key === "Backspace" || e.key === "Tab")) { e.preventDefault(); warnLocked(); return; }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (selected && selected.kind === "node") { e.preventDefault(); removeNode(selected.id); }
      else if (selected && selected.kind === "edge") { e.preventDefault(); removeEdge(selected.id); }
    } else if (e.key === "Tab" && selected && selected.kind === "node") {
      e.preventDefault();
      const from = docRef.current.nodes.find((n) => n.id === selected.id);
      if (!from) return;
      const node = createNode("custom", from.x + NODE_W + 96, from.y);
      update((d) => ({ ...d, edges: [...d.edges, { id: newId(), from: from.id, to: node.id, label: "", avgRate: null }] }));
    } else if (e.key === "+" || e.key === "=") stage.current.zoomBy(1.2);
    else if (e.key === "-") stage.current.zoomBy(1 / 1.2);
    else if (e.key === "0") stage.current.fit();
  });

  /* ---------- a tela ---------- */
  const node = selected && selected.kind === "node" ? doc.nodes.find((n) => n.id === selected.id) : null;
  const edge = selected && selected.kind === "edge" ? doc.edges.find((a) => a.id === selected.id) : null;
  let panel;
  if (edge) {
    panel = <EdgePanel key={"edge-" + edge.id} edge={edge} doc={doc}
      onRate={(v) => patchEdge(edge.id, { avgRate: v })} onRemove={() => removeEdge(edge.id)} onClose={() => showPanel(false)} />;
  } else if (node) {
    panel = <NodePanel key={"node-" + node.id} node={node} doc={doc} comparing={comparing} pendingFocus={pendingFocus}
      onPatch={(patch) => patchNode(node.id, patch)} onType={(t) => patchNode(node.id, { type: t }, { undo: true })}
      onNumber={(v) => patchNode(node.id, { number: v })} onField={(key, v) => setNodeField(node.id, key, v)}
      onRate={(eid, v) => patchEdge(eid, { avgRate: v })} onAdd={addHere} onRemove={() => removeNode(node.id)} onClose={() => showPanel(false)} />;
  } else {
    panel = <FunnelPanel key="funnel" doc={doc} comparing={comparing}
      onClient={setClient} onChannel={(v) => setFunnelField("channel", v)} onPeriod={setPeriod}
      onCompare={setComparing} onSnapshot={() => setSnapshotForm(true)} onClose={() => showPanel(false)} />;
  }
  const listActions = { addItem, patchItem, removeItem, pullCreative };

  return (
    <main className={"fe" + (drawer ? " is-drawer" : "") + (locked ? " is-locked" : "")} id="editor">
      <Stage api={stage} doc={doc} selected={selected} comparing={comparing} projections={projections} ghosts={ghosts}
        panelOpen={panelOpen} drawerOpen={!!drawer} empty={!doc.nodes.length}
        locked={locked} onLocked={warnLocked}
        onSelect={select} onCreateNode={createNode} onMoveNode={moveNode} onLink={linkNodes}
        onAcceptGhost={acceptGhost} onAskMerlin={askGhosts} onZoom={(k) => setZoom(Math.round(k * 100))} />

      {/* a barra de cima e so o indispensavel: voltar, o nome, o que abre
          (o "+" da biblioteca e o painel), o merlin e o "mais". zoom, enquadrar, arrumar
          e os fantasmas moram no "mais" — a roda, a pinca e as teclas +, - e 0
          ja fazem o mesmo, e o palco nao precisa de uma regua por cima. */}
      <div className="fe-top">
        <div className="fe-group glass fe-trail">
          <button className="action" id="back-btn" type="button" title="voltar para a lista" aria-label="Voltar" onClick={() => { location.hash = ""; }}><BackIcon /></button>
          <input className="fe-name" id="funnel-name" placeholder="nome do funil" maxLength="80" value={doc.name} onChange={(e) => update((d) => ({ ...d, name: e.currentTarget.value }))} />
        </div>
        <div className="fe-group glass">
          {/* o cadeado só mora na barra enquanto está fechado: é aviso e é a
              saída. aberto, ele fica no "mais", como o resto da vista. */}
          {locked && <><button className="action" id="lock-btn" type="button" title="palco travado — clique para destravar" aria-label="Destravar o palco" aria-pressed="true" onClick={toggleLock}><LockIcon /></button><span className="sep" /></>}
          {/* um botão cheio só: o "+" é criar, e criar é a biblioteca. o
              Merlin fica como os outros ícones, para não haver dois azuis. */}
          <button className="action" id="panel-toggle" type="button" title="painel do funil" aria-label="Painel" aria-pressed={String(panelOpen)} onClick={() => showPanel(!panelOpen)}><PanelIcon /></button>
          <button className="action" id="suggest-btn" type="button" disabled={thinking}
            title={thinking ? "pensando…" : "pedir sugestões ao Merlin para este funil"} aria-label="Sugerir" aria-busy={thinking} onClick={suggest}><SparkIcon /></button>
          <button className="action" id="share-btn" type="button" title="compartilhar um link só de leitura" aria-label="Compartilhar" onClick={() => setSharing(true)}>{icon("link")}</button>
          <button className="action" id="more-btn" type="button" title="mais" aria-label="Mais" onClick={() => setMenuOpen(true)}><MoreIcon /></button>
          <button className="pill pill--mini pill--green pill--icon" id="library-toggle" type="button" title="nova etapa — biblioteca de tipos" aria-label="Nova etapa" aria-haspopup="dialog" aria-expanded={String(libraryOpen)} onClick={() => showLibrary(!libraryOpen)}>{icon("plus")}</button>
        </div>
      </div>

      {libraryOpen && <Library onPick={pickType} onClose={() => setLibraryOpen(false)} />}
      {panelOpen && <aside className="fe-panel glass" id="panel">{panel}</aside>}
      {drawer && <Drawer which={drawer} doc={doc} projections={projections} comparing={comparing} actions={listActions}
        onNumber={(nid, v) => patchNode(nid, { number: v })} onRead={readNumbers} reading={readingNumbers} onClose={() => setDrawer(null)} />}
      <Dock doc={doc} drawer={drawer} onToggle={(k) => setDrawer(drawer === k ? null : k)} />

      {menuOpen && (
        <Dialog title="mais" sub={"zoom em " + zoom + "% · a roda e a pinça também dão zoom"} onClose={() => setMenuOpen(false)}>
          <div className="fe-menu">
            <button className="pill" type="button" onClick={() => { setMenuOpen(false); stage.current.fit(); }}><FitIcon />enquadrar tudo</button>
            <button className="pill" type="button" onClick={() => { setMenuOpen(false); arrange(); }}><LayoutIcon />arrumar em camadas</button>
            <button className="pill" type="button" aria-pressed={String(ghostsOn)} onClick={() => { setMenuOpen(false); toggleGhosts(); }}><GhostIcon />{ghostsOn ? "esconder" : "mostrar"} a próxima etapa sugerida</button>
            <button className="pill" type="button" aria-pressed={String(locked)} onClick={() => { setMenuOpen(false); toggleLock(); }}><LockIcon open={locked} />{locked ? "destravar o palco" : "travar o palco"}</button>
            <div className="fe-menu__zoom">
              <button className="action" type="button" aria-label="Afastar" onClick={() => stage.current.zoomBy(1 / 1.2)}><MinusIcon /></button>
              <output>{zoom}%</output>
              <button className="action" type="button" aria-label="Aproximar" onClick={() => stage.current.zoomBy(1.2)}>{icon("plus")}</button>
              <button className="pill pill--mini" type="button" onClick={() => stage.current.resetZoom()}>100%</button>
            </div>
          </div>
        </Dialog>
      )}
      {sharing && <ShareDialog type="funnels" id={doc.id} name={doc.name} onClose={() => setSharing(false)} />}
      {snapshotForm && <SnapshotForm onSave={saveSnapshot} onClose={() => setSnapshotForm(false)} />}
      {suggestions && <SuggestionsDialog list={suggestions} onAdd={addSuggestions} onClose={() => setSuggestions(null)} />}
      {reading != null && <ReadingDialog text={reading} onClose={() => setReading(null)} />}
    </main>
  );
}

/* ================================================================
   campos com memória própria
   um campo de número ou de dinheiro não pode ser controlado direto pelo
   documento: "12," viraria 1200 centavos e voltaria como "12,00" no meio
   da digitação. o texto fica no campo; o documento recebe o valor lido, e
   o texto só é refeito quando o valor muda por fora (desfazer, nuvem).
   ================================================================ */
function BufferedInput({ value, format, parse, onValue, ...rest }) {
  const [text, setText] = useState(() => format(value));
  const known = useRef(value);
  useEffect(() => {
    if (value !== known.current) { known.current = value; setText(format(value)); }
  }, [value]);
  return <input {...rest} value={text} onChange={(e) => {
    const t = e.currentTarget.value;
    setText(t);
    const v = parse(t);
    known.current = v;
    onValue(v);
  }} />;
}
const numberText = (v) => (v == null ? "" : String(v));
const parseNumber = (t) => (t === "" ? null : +t);
const NumberInput = (props) => <BufferedInput type="number" format={numberText} parse={parseNumber} {...props} />;
const moneyText = (c) => (c ? (c / 100).toFixed(2).replace(".", ",") : "");
const MoneyInput = (props) => <BufferedInput placeholder="0,00" format={moneyText} parse={parseMoney} {...props} />;

/* ================================================================
   biblioteca de tipos: o pop-up do "+"
   ================================================================ */
/* a biblioteca vem em prateleiras, na ordem em que o lead anda: com 27
   tipos, uma grade única viraria um caça-palavras. buscar achata tudo de
   volta numa lista só — quem já sabe o nome não quer saber de prateleira.
   ela não mora mais aberta na tela: abre no "+", já com o cursor na busca,
   e fecha ao criar. Enter põe o primeiro (ou o marcado pelas setas), Esc
   fecha, e arrastar um tipo para o palco continua valendo. */
const PICK_HINT = "clique para pôr no centro, ou arraste para o palco";
function Library({ onPick, onClose }) {
  const [term, setTerm] = useState("");
  const [active, setActive] = useState(0);
  const [dragging, setDragging] = useState(false);
  const boxRef = useRef(null), inputRef = useRef(null);
  const q = foldKey(term);
  const matches = (t) => !q || foldKey(NODE_TYPES[t].label).includes(q) || t.includes(q);
  const shelves = (q ? [{ name: "", types: TYPE_ORDER.filter(matches) }] : TYPE_GROUPS).filter((s) => s.types.length);
  const flat = shelves.flatMap((s) => s.types);
  const current = flat[Math.min(active, flat.length - 1)];

  useEffect(() => { inputRef.current.focus(); }, []);
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    const el = boxRef.current.querySelector(".fe-type.is-active");
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [active, q]);
  /* clicar fora fecha; o próprio "+" fica de fora da conta, senão o clique
     nele fecharia e reabriria na mesma hora */
  useEffect(() => {
    const down = (e) => {
      if (boxRef.current.contains(e.target) || e.target.closest("#library-toggle")) return;
      onClose();
    };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, []);

  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
    else if (e.key === "Enter") { e.preventDefault(); if (current) onPick(current); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!flat.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (Math.min(i, flat.length - 1) + step + flat.length) % flat.length);
    }
  };
  const typeButton = (t) => (
    <button key={t} type="button" draggable="true" title={PICK_HINT} tabIndex={-1}
        className={"fe-type" + (NODE_TYPES[t].conversion ? " is-conversion" : "") + (t === current ? " is-active" : "")}
        onClick={() => onPick(t)} onPointerEnter={() => setActive(flat.indexOf(t))}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", "type:" + t); e.dataTransfer.effectAllowed = "copy";
          /* o pop-up sai da frente para o palco receber o solto — no quadro
             seguinte, porque esconder a origem dentro do dragstart cancela o arrasto */
          setTimeout(() => setDragging(true), 0);
        }}
        onDragEnd={onClose}>
      <TypeIcon def={NODE_TYPES[t]} /><span>{NODE_TYPES[t].label}</span>
    </button>
  );
  return (
    <div className={"fe-library glass" + (dragging ? " is-dragging" : "")} id="library" role="dialog" aria-label="Biblioteca de tipos" ref={boxRef}>
      <input className="input input--pill fe-library__search" id="library-search" ref={inputRef} placeholder="buscar tipo…" autoComplete="off"
        value={term} onChange={(e) => setTerm(e.currentTarget.value)} onKeyDown={onKey} />
      <div className="fe-library__shelves">
        {shelves.map((s) => (
          <div key={s.name || "busca"} className="fe-shelf">
            {s.name && <p className="fe-shelf__name">{s.name}</p>}
            {s.types.map(typeButton)}
          </div>))}
        {!flat.length && <p className="empty">nenhum tipo com esse nome.</p>}
      </div>
    </div>
  );
}

/* ================================================================
   painel da direita: funil, etapa ou ligação
   ================================================================ */
function PanelHead({ icon: iconNode, kind, title, actions, onClose }) {
  return (
    <div className="fe-panel__top">
      {iconNode}
      <div className="fe-panel__title"><span className="t-mono">{kind}</span><h3>{title}</h3></div>
      {actions}
      <button className="action" type="button" id="panel-close" title="fechar painel" aria-label="Fechar painel" onClick={onClose}>{icon("x")}</button>
    </div>
  );
}

/* nada selecionado: o painel é do funil — cliente, canal, período, retratos */
function FunnelPanel({ doc, comparing, onClient, onChannel, onPeriod, onCompare, onSnapshot, onClose }) {
  const client = doc.client && clients().get(doc.client);
  const channels = client && Array.isArray(client.channels) ? client.channels : [];
  const snapshots = [...doc.snapshots].sort((a, b) => b.at - a.at);
  const nodes = doc.nodes.length, edges = doc.edges.length;
  return (
    <>
      <PanelHead kind="funil" title={doc.name || "sem nome"} onClose={onClose} />
      <div className="fe-panel__body">
        <label className="field-label">cliente</label>
        <select className="select" id="funnel-client" value={doc.client} onChange={(e) => onClient(e.currentTarget.value)}>{clientOptionList("sem cliente")}</select>
        <label className="field-label">canal</label>
        <select className="select" id="funnel-channel" value={doc.channel} disabled={!channels.length} onChange={(e) => onChannel(e.currentTarget.value)}>
          <option value="">{channels.length ? "sem canal" : "o cliente não tem canais"}</option>
          {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name || ch.type || "canal"}</option>)}
        </select>
        <label className="field-label">período dos números</label>
        <div className="pn-period">
          <DateField value={doc.period.from} onChange={(e) => onPeriod("from", e.currentTarget.value)} />
          <DateField value={doc.period.to} onChange={(e) => onPeriod("to", e.currentTarget.value)} />
        </div>
        <div className="pn-section"><h4>retratos</h4>
          {snapshots.length ? (
            <>
              {snapshots.map((s) => (
                <label key={s.id} className="pn-snapshot">
                  <input type="radio" name="compare" value={s.id} checked={s.id === comparing} onChange={() => onCompare(s.id)} />
                  <span className="pn-snapshot__name">{s.label}</span><span className="pn-snapshot__when">{dateLabel(dayOf(new Date(s.at)), true)}</span>
                </label>))}
              <label className="pn-snapshot">
                <input type="radio" name="compare" value="" checked={!comparing} onChange={() => onCompare(null)} />
                <span className="pn-snapshot__name t-mute">não comparar</span>
              </label>
            </>
          ) : <p className="pn-item t-mute">nenhum retrato — salve um pra comparar os números depois.</p>}
          <button type="button" className="pn-add" id="new-snapshot" onClick={onSnapshot}>+ novo retrato</button>
        </div>
        <div className="pn-section"><h4>no palco</h4>
          <p className="pn-item">{nodes}{nodes === 1 ? " etapa" : " etapas"} · {edges}{edges === 1 ? " ligação" : " ligações"}</p>
          <table className="pn-shortcuts"><tbody>
            <tr><td><kbd>Tab</kbd></td><td>liga uma etapa nova à selecionada</td></tr>
            <tr><td><kbd>Del</kbd></td><td>apaga o que está selecionado</td></tr>
            <tr><td><kbd>Ctrl</kbd> <kbd>Z</kbd></td><td>desfaz</td></tr>
            <tr><td><kbd>0</kbd> <kbd>+</kbd> <kbd>-</kbd></td><td>enquadra, aproxima, afasta</td></tr>
            <tr><td>2 cliques</td><td>etapa nova no lugar</td></tr>
            <tr><td>arrastar a bolinha</td><td>liga a outra etapa</td></tr>
          </tbody></table>
        </div>
      </div>
    </>
  );
}

/* painel de uma aresta selecionada: pra onde ela vai e a taxa média esperada. */
function EdgePanel({ edge, doc, onRate, onRemove, onClose }) {
  const from = doc.nodes.find((n) => n.id === edge.from), to = doc.nodes.find((n) => n.id === edge.to);
  return (
    <>
      <PanelHead kind="ligação" title={(from ? nodeLabel(from) : "?") + " → " + (to ? nodeLabel(to) : "?")} onClose={onClose}
        actions={<button className="action" type="button" id="edge-remove" title="apagar ligação" aria-label="Apagar ligação" onClick={onRemove}>{icon("trash")}</button>} />
      <div className="fe-panel__body">
        <label className="field-label">taxa média esperada (%)</label>
        <NumberInput className="input input--num" id="edge-rate" step="0.1" min="0" max="100" placeholder="ex.: 2,5" value={edge.avgRate} onValue={onRate} />
        <p className="small weak">usada quando ainda não há número real nos dois lados — aparece com "~" no fluxo.</p>
      </div>
    </>
  );
}

/* escolher da lista OU escrever outro. valor fora da lista (e nao vazio) e
   "outro": o select mostra "outro…" e o campo de texto aparece com ele.
   `blank` deixa escolher "nada ainda"; sem ele, vazio cai na primeira opcao. */
const OTHER = "__other";
function Choice({ options, value, onValue, blank, other = true, className = "select", placeholder = "qual?" }) {
  const known = options.some(([val]) => val === value);
  const [typing, setTyping] = useState(!!value && !known);
  const [picked, setPicked] = useState(false); // o cursor so pula pro texto quando a pessoa escolheu "outro" agora
  const shown = typing ? OTHER : (known ? value : (blank ? "" : options[0][0]));
  return (
    <div className="choice">
      <select className={className} value={shown} onChange={(e) => {
        const val = e.currentTarget.value;
        if (val === OTHER) { setTyping(true); setPicked(true); onValue(""); return; }
        setTyping(false);
        onValue(val);
      }}>
        {blank && <option value="">—</option>}
        {options.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
        {other && <option value={OTHER}>outro…</option>}
      </select>
      {typing && <input className="input" autoFocus={picked} value={known ? "" : (value || "")} placeholder={placeholder} onChange={(e) => onValue(e.currentTarget.value)} />}
    </div>
  );
}

/* um campo do tipo da etapa (origem do tráfego, url, preço...) */
function TypeField({ def, value, onValue }) {
  const v = value != null ? value : (def.preset || "");
  let control;
  if (def.kind === "select") {
    control = <Choice options={def.options} value={v} onValue={onValue} blank={def.blank} other={!!def.other} />;
  } else if (def.kind === "money") {
    control = <MoneyInput className="input input--num" value={+v || 0} onValue={onValue} />;
  } else if (def.kind === "number") {
    control = <input className="input input--num" type="number" value={v} onChange={(e) => onValue(e.currentTarget.value)} />;
  } else {
    control = <input className="input" value={v} onChange={(e) => onValue(e.currentTarget.value)} />;
  }
  return <><label className="field-label">{def.label}</label>{control}</>;
}

function NodePanel({ node, doc, comparing, pendingFocus, onPatch, onType, onNumber, onField, onRate, onAdd, onRemove, onClose }) {
  const def = typeOf(node);
  const outgoing = doc.edges.filter((a) => a.from === node.id);
  const compared = comparedNumber(doc, comparing, node.id);
  const titleRef = useRef(null);
  /* a etapa acabou de nascer: o cursor cai no título antes da pintura */
  useLayoutEffect(() => {
    if (pendingFocus.current === node.id) { pendingFocus.current = null; titleRef.current.focus(); }
  }, []);
  return (
    <>
      <PanelHead icon={<span className={"ico" + (def.conversion ? " is-conversion" : "")}><TypeIcon def={def} /></span>}
        kind={def.label} title={node.title || def.label} onClose={onClose}
        actions={<button className="action" type="button" id="node-remove" title="apagar etapa" aria-label="Apagar etapa" onClick={onRemove}>{icon("trash")}</button>} />
      <div className="fe-panel__body">
        <label className="field-label">título</label>
        <input ref={titleRef} className="input" id="node-title" value={node.title} placeholder={def.label} onChange={(e) => onPatch({ title: e.currentTarget.value })} />
        <label className="field-label">tipo</label>
        <select className="select" id="node-type" value={node.type} onChange={(e) => onType(e.currentTarget.value)}>
          {TYPE_ORDER.map((t) => <option key={t} value={t}>{NODE_TYPES[t].label}</option>)}
        </select>
        <label className="field-label">número no período</label>
        <div className="pn-number">
          <NumberInput className="input input--num" id="node-number" min="0" placeholder="—" value={node.number} onValue={onNumber} />
          {compared != null && <span className="small weak">antes {formatNumber(compared)}</span>}
        </div>
        {def.fields.map((f) => <TypeField key={node.id + ":" + node.type + ":" + f.key} def={f} value={node.fields[f.key]} onValue={(v) => onField(f.key, v)} />)}
        <label className="field-label">nota</label>
        <textarea className="textarea" id="node-note" rows="2" value={node.note} onChange={(e) => onPatch({ note: e.currentTarget.value })}></textarea>
        <div className="pn-section"><h4>taxas médias de saída</h4>
          {outgoing.length ? outgoing.map((a) => {
            const to = doc.nodes.find((n) => n.id === a.to);
            return (
              <div key={a.id} className="pn-rate">
                <span className="pn-rate-target">{"→ " + truncate(to ? nodeLabel(to) : "?", 22)}</span>
                <NumberInput className="input input--num pn-rate-input" step="0.1" min="0" max="100" placeholder="0,0" value={a.avgRate} onValue={(v) => onRate(a.id, v)} />
              </div>
            );
          }) : <p className="pn-item t-mute">nada sai daqui ainda — arraste a bolinha da direita até outra etapa.</p>}
        </div>
        {LINKED_GROUPS.map((g) => {
          const items = doc[g.key].filter((x) => x.node === node.id);
          return (
            <div key={g.key} className="pn-section"><h4>{g.label}</h4>
              {items.length ? items.map((it) => <div key={it.id} className="pn-item">{it[g.field] || "sem título"}</div>) : <div className="pn-item t-mute">nada ligado</div>}
              <button type="button" className="pn-add" onClick={() => onAdd(g.key)}>+ adicionar aqui</button>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ================================================================
   a gaveta: criativos, automações, ofertas, gatilhos, números
   ================================================================ */
function StatusChips({ options, green, value, onPick }) {
  return (
    <div className="chips">
      {options.map(([v, label]) => <button key={v} type="button" className={"chip" + (v === green ? " chip--green" : "")} aria-pressed={String(v === value)} onClick={() => onPick(v)}>{label}</button>)}
    </div>
  );
}
const TrashButton = ({ onClick }) => <button className="action" type="button" title="apagar" aria-label="Apagar" onClick={onClick}>{icon("trash")}</button>;

/* ---------- o que cada tipo de etapa costuma pedir ----------
   a gaveta era uma tabela solta, com a etapa numa coluna do fim: nada dizia
   o que faltava onde. agora cada etapa e uma coluna, e a coluna sugere o que
   aquele tipo de etapa quase sempre tem — um clique cria ja ligado a ela. */
const STAGE_SUGGESTIONS = {
  automations: {
    capture: [{ name: "boas-vindas ao lead", trigger: "entrou na lista", action: "entregar o prometido e apresentar a marca" }],
    quiz: [{ name: "resposta por perfil", trigger: "terminou a qualificação", action: "mandar a mensagem do perfil dele" }],
    dm: [{ name: "resposta por palavra-chave", trigger: "comentou ou mandou a palavra", action: "responder na DM com o link", tool: "Manychat" }],
    group: [{ name: "boas-vindas no grupo", trigger: "entrou no grupo", action: "mensagem de regras e próximo passo" }],
    webinar: [{ name: "lembretes do webinar", trigger: "1 dia, 1 hora e ao vivo", action: "lembrete por e-mail e whatsapp" }],
    lp: [{ name: "remarketing de quem viu e não avançou", trigger: "visitou e não converteu em 7 dias", action: "reimpactar com prova social" }],
    vsl: [{ name: "remarketing de quem assistiu", trigger: "viu mais de 50% e não clicou", action: "reimpactar com a oferta" }],
    product: [{ name: "remarketing de quem viu o produto", trigger: "viu e não comprou em 3 dias", action: "anúncio dinâmico do produto" }],
    booking: [{ name: "lembrete da call", trigger: "24h e 1h antes", action: "lembrete com link da reunião" }],
    call: [{ name: "follow-up pós-call", trigger: "call terminou", action: "resumo e próximo passo por escrito" }],
    proposal: [{ name: "follow-up da proposta", trigger: "3 dias sem resposta", action: "mensagem de acompanhamento" }],
    cart: [{ name: "carrinho abandonado", trigger: "adicionou e não finalizou em 1h", action: "e-mail e whatsapp com o carrinho" }],
    checkout: [
      { name: "recuperação de checkout", trigger: "iniciou e não pagou em 1h", action: "whatsapp e e-mail com o link" },
      { name: "pix ou boleto pendente", trigger: "gerou e não pagou", action: "lembrete antes de vencer" }
    ],
    thanks: [{ name: "acesso e boas-vindas", trigger: "compra aprovada", action: "entregar acesso e o primeiro passo" }],
    onboarding: [{ name: "sequência de ativação", trigger: "comprou e não ativou em 3 dias", action: "empurrão até o marco de ativação" }],
    repurchase: [{ name: "lembrete de recompra", trigger: "perto do fim do ciclo", action: "oferta de recompra" }]
  },
  creatives: {
    traffic: [{ title: "vídeo de dor", format: "video", angle: "a dor que o produto resolve" }, { title: "depoimento", format: "video", angle: "prova social de cliente" }],
    impression: [{ title: "carrossel de objeções", format: "carousel", angle: "responder as 3 maiores dúvidas" }],
    ad: [{ title: "antes e depois", format: "image", angle: "a transformação" }, { title: "ugc", format: "video", angle: "gente comum usando" }],
    click: [{ title: "criativo de oferta", format: "image", angle: "a oferta e o prazo" }]
  },
  offers: {
    product: [{ name: "oferta principal", type: "main" }],
    checkout: [{ name: "order bump", type: "bump" }],
    cart: [{ name: "order bump", type: "bump" }],
    proposal: [{ name: "oferta principal", type: "main" }],
    upsell: [{ name: "upsell", type: "upsell" }],
    downsell: [{ name: "downsell", type: "downsell" }],
    repurchase: [{ name: "recorrência", type: "recurring" }]
  },
  triggers: {
    lp: [{ name: "prova social" }, { name: "autoridade" }],
    vsl: [{ name: "autoridade" }, { name: "prova social" }],
    product: [{ name: "prova social" }, { name: "escassez" }],
    checkout: [{ name: "garantia" }, { name: "urgência" }],
    cart: [{ name: "urgência" }],
    upsell: [{ name: "ancoragem" }],
    webinar: [{ name: "reciprocidade" }, { name: "escassez" }],
    proposal: [{ name: "ancoragem" }, { name: "garantia" }]
  }
};
const ITEM_NAME = { creatives: "title", automations: "name", offers: "name", triggers: "name" };
const DRAG_TYPE = "application/x-merlin-item";

/* o quadro: uma coluna por etapa, na ordem do funil, e "sem etapa" no fim so
   quando tem alguem la. arrastar o cartão pela alça muda a etapa. */
function StageBoard({ doc, group, actions, renderCard, addLabel }) {
  const [over, setOver] = useState(null);
  const list = doc[group];
  const nameKey = ITEM_NAME[group];
  const loose = (x) => !x.node || !doc.nodes.some((n) => n.id === x.node);
  const columns = orderedNodes(doc).map((n) => ({ id: n.id, node: n }));
  if (list.some(loose)) columns.push({ id: "", node: null });
  const add = (node, seed) => actions.addItem(group, { id: newId(), ...NEW_ITEM[group](), ...(seed || {}), node }, { undo: true });
  if (!columns.length) return <p className="empty">o funil ainda não tem etapas — crie as etapas no palco e elas viram colunas aqui.</p>;
  return (
    <div className="fb">
      {columns.map(({ id, node }) => {
        const items = list.filter((x) => (id ? x.node === id : loose(x)));
        const def = node ? typeOf(node) : null;
        const taken = new Set(items.map((x) => String(x[nameKey] || "").toLowerCase()));
        const ideas = node ? ((STAGE_SUGGESTIONS[group] || {})[node.type] || []).filter((s) => !taken.has(s[nameKey].toLowerCase())) : [];
        return (
          <section key={id || "none"} className={"fb__col" + (over === id ? " is-over" : "")}
                   onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); setOver(id); } }}
                   onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver((o) => (o === id ? null : o)); }}
                   onDrop={(e) => {
                     e.preventDefault(); setOver(null);
                     const iid = e.dataTransfer.getData(DRAG_TYPE);
                     if (iid) actions.patchItem(group, iid, { node: id });
                   }}>
            <header className="fb__head">
              {def && <span className={"ico" + (def.conversion ? " is-conversion" : "")}><TypeIcon def={def} /></span>}
              <span className="fb__name">
                <small>{def ? def.label : "solto"}</small>
                <b>{node ? truncate(node.title || def.label, 26) : "sem etapa"}</b>
              </span>
              {items.length > 0 && <span className="fb__count">{items.length}</span>}
            </header>
            <div className="fb__cards">
              {items.map((it) => (
                <article key={it.id} className="fb__card">
                  <span className="fb__grip" draggable="true" title="arrastar para outra etapa" aria-hidden="true"
                        onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, it.id); e.dataTransfer.effectAllowed = "move"; }}>⋮⋮</span>
                  {renderCard(it, (p) => actions.patchItem(group, it.id, p))}
                </article>
              ))}
            </div>
            {ideas.length > 0 && (
              <div className="fb__ideas">
                {ideas.map((s) => (
                  <button key={s[nameKey]} type="button" className="fb__idea"
                          title={s.trigger ? "quando: " + s.trigger + " · faz: " + s.action : (s.angle || "")}
                          onClick={() => add(id, s)}>{icon("plus")}<span>{s[nameKey]}</span></button>
                ))}
              </div>
            )}
            <button type="button" className="fb__add" onClick={() => add(id)}>+ {addLabel}</button>
          </section>
        );
      })}
    </div>
  );
}

/* o nome do cartão: um campo sem moldura, que parece título e se edita no lugar */
const CardTitle = ({ value, placeholder, onValue }) => (
  <input className="fb__title" value={value || ""} placeholder={placeholder} onChange={(e) => onValue(e.currentTarget.value)} />
);
const CardLine = ({ label, children }) => <div className="fb__line"><span>{label}</span>{children}</div>;

function CreativesTab({ doc, actions }) {
  return (
    <StageBoard doc={doc} group="creatives" actions={actions} addLabel="criativo" renderCard={(c, patch) => (
      <>
        <div className="fb__top">
          <CardTitle value={c.title} placeholder="nome do criativo" onValue={(v) => patch({ title: v })} />
          <div className="row-actions">
            <button className="action" type="button" title="puxar para o dia" aria-label="Puxar para o dia" onClick={() => actions.pullCreative(c)}>{icon("clock")}</button>
            <TrashButton onClick={() => actions.removeItem("creatives", c.id)} />
          </div>
        </div>
        <CardLine label="formato"><select className="select" value={c.format} onChange={(e) => patch({ format: e.currentTarget.value })}>{CREATIVE_FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></CardLine>
        <CardLine label="ângulo"><input className="input" value={c.angle || ""} placeholder="a ideia por trás" onChange={(e) => patch({ angle: e.currentTarget.value })} /></CardLine>
        <CardLine label="link"><input className="input" value={c.url || ""} placeholder="drive, meta, figma…" onChange={(e) => patch({ url: e.currentTarget.value })} /></CardLine>
        <StatusChips options={CREATIVE_STATUS} green="live" value={c.status} onPick={(s) => patch({ status: s })} />
      </>
    )} />
  );
}

function AutomationsTab({ doc, actions }) {
  return (
    <StageBoard doc={doc} group="automations" actions={actions} addLabel="automação" renderCard={(a, patch) => (
      <>
        <div className="fb__top">
          <CardTitle value={a.name} placeholder="nome da automação" onValue={(v) => patch({ name: v })} />
          <div className="row-actions"><TrashButton onClick={() => actions.removeItem("automations", a.id)} /></div>
        </div>
        <CardLine label="quando"><input className="input" value={a.trigger || ""} placeholder="o que dispara" onChange={(e) => patch({ trigger: e.currentTarget.value })} /></CardLine>
        <CardLine label="faz"><input className="input" value={a.action || ""} placeholder="o que acontece" onChange={(e) => patch({ action: e.currentTarget.value })} /></CardLine>
        <CardLine label="com"><Choice options={AUTOMATION_TOOLS} value={a.tool || ""} blank onValue={(v) => patch({ tool: v })} placeholder="qual ferramenta?" /></CardLine>
        <StatusChips options={AUTOMATION_STATUS} green="active" value={a.status} onPick={(s) => patch({ status: s })} />
      </>
    )} />
  );
}

function OffersTab({ doc, actions }) {
  const list = doc.offers;
  const order = (t) => OFFER_TYPES.findIndex(([v]) => v === t);
  const ladder = [...list].sort((a, b) => order(a.type) - order(b.type));
  return (
    <div className="fb-offers">
      <StageBoard doc={doc} group="offers" actions={actions} addLabel="oferta" renderCard={(o, patch) => (
        <>
          <div className="fb__top">
            <CardTitle value={o.name} placeholder="nome da oferta" onValue={(v) => patch({ name: v })} />
            <div className="row-actions"><TrashButton onClick={() => actions.removeItem("offers", o.id)} /></div>
          </div>
          <div className="fb__pair">
            <select className="select" value={o.type} aria-label="tipo" onChange={(e) => patch({ type: e.currentTarget.value })}>{OFFER_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <MoneyInput className="input input--num" aria-label="preço" value={+o.price || 0} onValue={(c) => patch({ price: c })} />
          </div>
          <CardLine label="promessa"><input className="input" value={o.promise || ""} placeholder="o que ele ganha" onChange={(e) => patch({ promise: e.currentTarget.value })} /></CardLine>
          <CardLine label="garantia"><input className="input" value={o.guarantee || ""} placeholder="7 dias, dinheiro de volta…" onChange={(e) => patch({ guarantee: e.currentTarget.value })} /></CardLine>
        </>
      )} />
      {/* a escada: o que o cliente pode comprar, do principal ao recorrente */}
      <aside className="fb-ladder" id="offer-ladder">
        <p className="fb-ladder__title">escada de ofertas</p>
        {ladder.length ? ladder.map((o) => <div key={o.id} className="ladder-item"><span className="badge type">{labelOf(OFFER_TYPES, o.type)}</span><span className="name">{o.name}</span><span className="price">{brl(o.price)}</span></div>)
          : <p className="empty">sem ofertas ainda.</p>}
        <div className="meter"><span className="num" id="offer-ticket">{ladder.length ? brl(ladder.reduce((s, o) => s + (+o.price || 0), 0)) : "—"}</span><span className="legend">ticket máximo</span></div>
      </aside>
    </div>
  );
}

function TriggersTab({ doc, actions }) {
  return (
    <StageBoard doc={doc} group="triggers" actions={actions} addLabel="gatilho" renderCard={(g, patch) => (
      <>
        <div className="fb__top">
          <CardTitle value={g.name} placeholder="gatilho" onValue={(v) => patch({ name: v })} />
          <div className="row-actions"><TrashButton onClick={() => actions.removeItem("triggers", g.id)} /></div>
        </div>
        <CardLine label="como"><input className="input" value={g.usage || ""} placeholder="como aparece nesta etapa" onChange={(e) => patch({ usage: e.currentTarget.value })} /></CardLine>
      </>
    )} />
  );
}

function NumbersTab({ doc, projections, comparing, onNumber, onRead, reading }) {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const order = orderedNodes(doc);
  const cost = trafficCost(doc);
  const capture = order.find((n) => n.type === "capture" && n.number);
  const checkout = order.find((n) => n.type === "checkout" && n.number);
  return (
    <>
      <button className="pill fe-add-row" type="button" id="read-numbers" disabled={reading} onClick={onRead}>
        {reading ? "pensando…" : <><SparkIcon /> ler números</>}
      </button>
      <div className="meters mb">
        <div className="meter"><span className="num" id="meter-cost">{cost ? brl(cost) : "—"}</span><span className="legend">custo total de tráfego</span></div>
        <div className="meter"><span className="num" id="meter-cpl">{cost && capture ? brl(Math.round(cost / capture.number)) : "—"}</span><span className="legend">CPL (custo ÷ captura)</span></div>
        <div className="meter"><span className="num" id="meter-cac">{cost && checkout ? brl(Math.round(cost / checkout.number)) : "—"}</span><span className="legend">CAC (custo ÷ checkout)</span></div>
      </div>
      <div className="table-scroll"><table className="table">
        <thead><tr><th>etapa</th><th>tipo</th><th className="num">número</th><th className="num">taxa real · média</th></tr></thead>
        <tbody>{order.map((n) => {
          /* "próximo" aqui é a primeira aresta que sai deste nó — num funil com
             ramos, é uma simplificação; o desenho completo com todas as saídas
             fica no palco. */
          const out = doc.edges.find((a) => a.from === n.id);
          const to = out ? byId.get(out.to) : null;
          let real = "—";
          if (to && n.number != null && n.number > 0 && to.number != null) real = formatRate(to.number / n.number);
          const avg = out && out.avgRate != null ? formatAvg(out.avgRate) : "—";
          const compared = comparedNumber(doc, comparing, n.id);
          const projection = n.number == null ? projections.get(n.id) : null;
          return (
            <tr key={n.id}>
              <td>{n.title || typeLabel(n) || "sem título"}</td>
              <td className="t-mute">{typeLabel(n)}</td>
              <td className="num"><NumberInput className="input input--num" min="0" value={n.number} onValue={(v) => onNumber(n.id, v)} />
                {projection && <span className="weak small"> ~{projection.value}</span>}
                {compared != null && <span className="weak small"> antes {compared}</span>}</td>
              <td className="num">{real} <span className="weak small">{avg}</span></td>
            </tr>
          );
        })}</tbody>
      </table></div>
      {doc.snapshots.length > 0 && (
        <>
          <div className="heading mt"><span className="t-mono">retratos</span></div>
          <div className="table-scroll"><table className="table" id="snapshot-table">
            <thead><tr><th>quando</th>{order.map((n) => <th key={n.id}>{truncate(n.title || typeLabel(n), 14)}</th>)}</tr></thead>
            <tbody>{doc.snapshots.map((s) => (<tr key={s.id}>
              <td>{s.label} · {dateLabel(dayOf(new Date(s.at)), true)}</td>
              {order.map((n) => <td key={n.id} className="num">{s.numbers[n.id] == null ? "—" : s.numbers[n.id]}</td>)}
            </tr>))}</tbody>
          </table></div>
        </>
      )}
    </>
  );
}

function Drawer({ which, doc, projections, comparing, actions, onNumber, onRead, reading, onClose }) {
  let tab;
  if (which === "creatives") tab = <CreativesTab doc={doc} actions={actions} />;
  else if (which === "automations") tab = <AutomationsTab doc={doc} actions={actions} />;
  else if (which === "offers") tab = <OffersTab doc={doc} actions={actions} />;
  else if (which === "triggers") tab = <TriggersTab doc={doc} actions={actions} />;
  else tab = <NumbersTab doc={doc} projections={projections} comparing={comparing} onNumber={onNumber} onRead={onRead} reading={reading} />;
  return (
    <div className="fe-drawer glass" id="drawer">
      <div className="fe-drawer__top">
        <h3 id="drawer-title">{DRAWERS[which]}</h3>
        <button className="action" type="button" id="drawer-close" title="fechar" aria-label="Fechar" onClick={onClose}>{icon("x")}</button>
      </div>
      <div className="fe-drawer__body">{tab}</div>
    </div>
  );
}

/* o dock embaixo: as abas viraram botões que sobem a gaveta */
function Dock({ doc, drawer, onToggle }) {
  const button = (k) => (
    <button type="button" data-drawer={k} aria-pressed={String(drawer === k)} onClick={() => onToggle(k)}>
      {DRAWERS[k]}{doc[k] && doc[k].length ? <span className="count">{doc[k].length}</span> : null}
    </button>
  );
  return (
    <nav className="fe-dock glass" id="dock" aria-label="Seções do funil">
      {button("creatives")}{button("automations")}{button("offers")}{button("triggers")}
      <span className="sep"></span>
      {button("numbers")}
    </nav>
  );
}

/* ================================================================
   diálogos
   ================================================================ */
function SnapshotForm({ onSave, onClose }) {
  const [v, bind] = useFields({ label: "retrato de " + dateLabel(today(), true) });
  return (
    <Form title="novo retrato" sub="guarda o número atual de cada etapa para comparar depois" submit="salvar retrato" onClose={onClose} onSubmit={() => { onSave(v.label); }}>
      <div className="full"><input className="input" maxLength="80" placeholder="rótulo (ex.: antes da campanha de black friday)" {...bind("label")} /></div>
    </Form>
  );
}

const SUGGESTION_GROUPS = [["node", "etapas"], ["automation", "automações"], ["creative", "criativos"], ["offer", "ofertas"], ["trigger", "gatilhos"]];
function SuggestionsDialog({ list, onAdd, onClose }) {
  const [checked, setChecked] = useState(() => list.map((s) => SUGGESTION_GROUPS.some(([t]) => t === s.type)));
  const n = checked.filter(Boolean).length;
  const groups = SUGGESTION_GROUPS
    .map(([type, label]) => ({ type, label, items: list.map((s, i) => [s, i]).filter(([s]) => s.type === type) }))
    .filter((g) => g.items.length);
  return (
    <Dialog title="o Merlin sugere" sub="olhou o funil como está e achou isto — desmarque o que não serve" wide onClose={onClose}
        actions={<>
          <button className="pill" type="button" onClick={onClose}>descartar</button>
          <button className="pill pill--green" type="button" id="add-suggestions" disabled={!n} onClick={() => onAdd(list.filter((s, i) => checked[i]))}>adicionar {n}</button></>}>
      {groups.length ? groups.map((g) => (
        <div key={g.type} className="sug-group"><h4>{g.label}</h4>
          {g.items.map(([s, i]) => (
            <label key={i} className="sug-item">
              <input type="checkbox" checked={checked[i]} onChange={(e) => { const on = e.currentTarget.checked; setChecked((arr) => arr.map((x, j) => (j === i ? on : x))); }} />
              <span><span className="sug-title">{s.title || ""}</span>{s.note && <span className="sug-note">{s.note}</span>}</span>
            </label>))}
        </div>)) : <p className="empty">nada para sugerir agora — o funil já está bem coberto.</p>}
    </Dialog>
  );
}

function ReadingDialog({ text, onClose }) {
  return (
    <Dialog title="o Merlin leu os números" wide onClose={onClose} actions={<button className="pill" type="button" onClick={onClose}>fechar</button>}>
      <Markdown className="dlg-md" text={text} />
    </Dialog>
  );
}

/* ================================================================
   a lista de funis
   ================================================================ */
/* miniatura do fluxo: só caixas e linhas, no mesmo lugar em que estão no
   palco, pra reconhecer o funil pela forma antes de ler o nome. */
function Thumbnail({ f }) {
  if (!f.nodes.length) return <p className="empty">sem etapas</p>;
  const xs = f.nodes.map((n) => n.x), ys = f.nodes.map((n) => n.y);
  const minX = Math.min(...xs) - 20, minY = Math.min(...ys) - 20;
  const w = Math.max(...xs) + NODE_W + 20 - minX, h = Math.max(...ys) + NODE_H + 20 - minY;
  const byId = new Map(f.nodes.map((n) => [n.id, n]));
  return (
    <svg viewBox={minX + " " + minY + " " + w + " " + h} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {f.edges.map((a) => {
        const from = byId.get(a.from), to = byId.get(a.to);
        if (!from || !to) return null;
        const x1 = from.x + NODE_W, y1 = from.y + PORT_Y, x2 = to.x, y2 = to.y + PORT_Y;
        const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
        return <path key={a.id} d={"M" + x1 + " " + y1 + " C" + (x1 + dx) + " " + y1 + " " + (x2 - dx) + " " + y2 + " " + x2 + " " + y2} vectorEffect="non-scaling-stroke" />;
      })}
      {f.nodes.map((n) => <rect key={n.id} x={n.x} y={n.y} width={NODE_W} height={NODE_H} rx="22" className={typeOf(n).conversion ? "is-conversion" : null} vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}

function FunnelCard({ f, onDuplicate, onRemove }) {
  const stages = f.nodes.length;
  const numbered = [...f.nodes].sort((a, b) => a.x - b.x).filter((n) => n.number != null && n.number > 0);
  const total = numbered.length >= 2 ? formatRate(numbered[numbered.length - 1].number / numbered[0].number) + " total" : "";
  const open = () => { location.hash = f.id; };
  return (
    <div className="fl-card" data-id={f.id} tabIndex="0" role="link" onClick={open} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) open(); }}>
      <div className="fl-thumb"><Thumbnail f={f} /></div>
      <p className="fl-name">{f.name || "sem nome"}</p>
      <div className="fl-badges"><ClientBadge id={f.client} /></div>
      <div className="fl-foot">
        <span>{stages}{stages === 1 ? " etapa" : " etapas"}</span>
        {total && <span>{total}</span>}
        <div className="row-actions">
          <button className="action" type="button" title="duplicar" aria-label="Duplicar" onClick={(e) => { e.stopPropagation(); onDuplicate(); }}><CopyIcon /></button>
          <button className="action" type="button" title="apagar" aria-label="Apagar" onClick={(e) => { e.stopPropagation(); onRemove(); }}>{icon("trash")}</button>
        </div>
      </div>
    </div>
  );
}

/* o modelo escolhido, em duas linhas: o que ele é e por onde passa. a mesma
   dupla aparece no cliente, na hora de criar o funil de um canal. */
function TemplateNote({ tpl }) {
  return (
    <>
      <p className="tpl-note">{tpl.summary}</p>
      <p className="tpl-chain">{funnelChain(tpl).join(" → ")}</p>
    </>
  );
}

/* o modelo virando funil de verdade: etapas, ligações e o que fica pendurado
   nelas. o layout roda aqui — o modelo não guarda posição, só a estrutura. */
function applyTemplate(doc, tpl) {
  const parts = buildFunnel(tpl);
  doc.nodes = layoutNodes(parts.nodes, parts.edges);
  doc.edges = parts.edges;
  doc.creatives = parts.creatives;
  doc.automations = parts.automations;
  doc.offers = parts.offers;
  doc.triggers = parts.triggers;
  /* se o cliente já tem um canal desse tipo, o funil nasce ligado a ele */
  const client = doc.client ? clients().get(doc.client) : null;
  const channel = tpl.channel && client ? (client.channels || []).find((c) => c.type === tpl.channel) : null;
  if (channel) doc.channel = channel.id;
  return doc;
}

/* criar é um botão e uma caixa, como em todo o sistema. no nome, "@cliente"
   continua valendo (a mesma gramática do dia); o campo ao lado ganha quando
   preenchido. o modelo é opcional: em branco, o funil nasce vazio como
   sempre nasceu. */
function FunnelForm({ funnels, template, onClose }) {
  const tpl = template ? FUNNEL_TEMPLATES.find((t) => t.id === template) : null;
  const [v, bind] = useFields({ name: tpl ? tpl.name : "", client: "" });
  const submit = () => {
    const parsed = parseMentions(v.name);
    const name = (parsed.title || v.name).trim().slice(0, 80);
    if (!name) { notify("o funil precisa de um nome"); return false; }
    const now = Date.now();
    const doc = {
      id: newId(), name,
      client: v.client || parsed.client || "", channel: "",
      nodes: [], edges: [], creatives: [], automations: [], offers: [], triggers: [],
      period: { from: "", to: "" }, snapshots: [],
      createdAt: now, updatedAt: now
    };
    if (tpl) applyTemplate(doc, tpl);
    funnels.save(doc);
    location.hash = doc.id;
  };
  /* o modelo já foi escolhido na tela de antes: aqui ele só se apresenta, e a
     caixa pede o que nenhum modelo sabe — o nome e de quem é o funil */
  return (
    <Form title="novo funil" sub={tpl ? "modelo: " + tpl.name : "em branco"} submit="criar e abrir" onClose={onClose} onSubmit={submit}>
      <Field label="nome" full><input className="input" maxLength="80" required placeholder="funil da lojax · @cliente" {...bind("name")} /></Field>
      <Field label="cliente" full><select className="select" {...bind("client")}>{clientOptionList("sem cliente")}</select></Field>
      {tpl && <div className="full"><TemplateNote tpl={tpl} /></div>}
    </Form>
  );
}

function FunnelList({ funnels }) {
  const [form, setForm] = useState(false);
  /* escolher o modelo é uma tela, e a caixa de criar pede só o nome: com a
     lista dentro da caixa, desistir de um modelo era rolar tudo de volta */
  const [choosing, setChoosing] = useState(false);
  const list = funnels.all().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const picking = choosing || !list.length;
  /* "n" abre a escolha de um funil novo; no editor a tecla não vale, e a lista nem está montada lá */
  useKeydown((e) => {
    if (e.key === "Escape" && choosing && !form) { setChoosing(false); return; }
    if (e.key !== "n" || e.ctrlKey || e.metaKey || e.altKey || form || isTyping()) return;
    e.preventDefault();
    setChoosing(true);
  });
  const duplicate = (id) => {
    const original = funnels.get(id);
    if (!original) return;
    const copy = JSON.parse(JSON.stringify(original));
    copy.id = newId();
    copy.name = (original.name || "sem nome") + " (cópia)";
    copy.createdAt = Date.now(); copy.updatedAt = Date.now();
    const ids = new Map();
    copy.nodes.forEach((n) => { const fresh = newId(); ids.set(n.id, fresh); n.id = fresh; });
    copy.edges.forEach((a) => { a.id = newId(); a.from = ids.get(a.from) || a.from; a.to = ids.get(a.to) || a.to; });
    [copy.creatives, copy.automations, copy.offers, copy.triggers].forEach((group) => {
      group.forEach((item) => { item.id = newId(); if (item.node) item.node = ids.get(item.node) || ""; });
    });
    copy.snapshots = [];
    funnels.save(copy);
    notify("funil duplicado");
  };
  const remove = (id) => {
    const before = funnels.remove(id);
    if (!before) return;
    notify("funil apagado", () => funnels.save(before));
  };
  return (
    <main className="page" id="list">
      <div className="header">
        <div><h1>funis</h1>{list.length > 0 && <p className="sub">{list.length === 1 ? "1 funil" : list.length + " funis"}</p>}</div>
        <div className="actions">{choosing && list.length
          ? <button className="pill pill--icon" type="button" id="new-funnel-back" title="voltar para a lista (esc)" aria-label="Voltar" onClick={() => setChoosing(false)}>{icon("chevronLeft")}</button>
          : <button className="pill pill--green" type="button" id="new-funnel" title="novo funil (n)" onClick={() => setChoosing(true)}>{icon("plus")}funil</button>}</div>
      </div>
      {!picking && <div className="fl-grid">{list.map((f) => <FunnelCard key={f.id} f={f} onDuplicate={() => duplicate(f.id)} onRemove={() => remove(f.id)} />)}</div>}
      {/* eram trinta e nove modelos prontos, com as taxas médias já
          preenchidas, escondidos dentro do <select> da caixa de criar — e a
          tela vazia era uma frase cinza mandando descobrir sozinho que eles
          existiam. descobrir uma feature clicando nela é a resposta da casa;
          um tour que explica não é. */}
      {picking && (
        <EmptyStart
          title={list.length ? "de que tipo é o novo funil?" : "de que tipo é o primeiro funil?"}
          text="Cada modelo já traz as etapas na ordem, quem liga em quem e a taxa média esperada em cada passagem — o suficiente para você comparar o seu número com o que costuma acontecer. Tudo editável depois."
          groups={funnelGroups().map((g) => ({
            ...g,
            items: g.items.map((t) => ({ ...t, hint: funnelChain(t).join(" → ") }))
          }))}
          thumb={(t) => <FunnelThumb shape={funnelShape(t)} size={funnelSize(t)} />}
          onPick={(t) => setForm({ template: t.id })}
          onBlank={() => setForm({ template: "" })}
          blankRow blankLabel="funil em branco" blankNote="desenhar as etapas você mesmo" />
      )}
      {form && <FunnelForm funnels={funnels} template={form.template} onClose={() => setForm(false)} />}
    </main>
  );
}

/* ================================================================
   a raiz: lista sem hash, editor com hash de um funil que existe
   ================================================================ */
function Funnels() {
  const funnels = useCollection("funnels", { normalize });
  const hash = useHash();
  const open = !!(hash && funnels.has(hash));
  /* o palco é a página: nada rola por baixo dele */
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  return open ? <Editor key={hash} id={hash} funnels={funnels} /> : <FunnelList funnels={funnels} />;
}

mount(<Funnels />, "app");
