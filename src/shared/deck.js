/* merlin · a apresentação (PRD desenhos, D4)

   slides 16:9 de texto, em quatro layouts fixos: capa, título + tópicos,
   número grande e duas colunas. não é PowerPoint: sem posição livre, imagem,
   animação nem tema — a conversa monta, a página ajusta.

   todo slide guarda todos os campos, use o layout ou não: trocar de "número
   grande" para "duas colunas" e voltar não perde o que estava escrito.

   tudo puro, sem DOM e sem o core: o editor (slides.jsx), a lista
   (drawings.jsx) e o teste (deck.test.mjs) usam o mesmo. nenhuma função
   pública lança exceção, e as que mexem devolvem a mesma referência quando não
   há o que fazer (o editor usa isso para não gravar passo vazio no desfazer). */

export const DECK_SLIDES = 30, SLIDE_ITEMS = 8;
export const SLIDE_LAYOUTS = [
  { id: "cover", label: "capa" },
  { id: "bullets", label: "título + tópicos" },
  { id: "number", label: "número grande" },
  { id: "columns", label: "duas colunas" }
];
const LAYOUT_IDS = SLIDE_LAYOUTS.map((l) => l.id);

/* o tamanho de cada campo: o bastante para um slide, pouco para virar documento */
const LIMITS = { title: 160, body: 600, left: 1200, right: 1200, number: 24, caption: 160, notes: 2000 };
const FIELDS = Object.keys(LIMITS);

export function blankSlide(layout, id) {
  const out = { id: id == null ? "" : String(id), layout: LAYOUT_IDS.includes(layout) ? layout : "bullets", items: [] };
  FIELDS.forEach((f) => { out[f] = ""; });
  return out;
}

const text = (v, max) => (typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : "").slice(0, max);
const firstFree = (used) => { let n = 1; while (used.has("s" + n)) n++; return "s" + n; };

function normalizeSlide(raw, used) {
  const s = raw && typeof raw === "object" ? raw : {};
  let id = s.id == null ? "" : String(s.id);
  if (!id || used.has(id)) id = firstFree(used);
  used.add(id);
  const out = blankSlide(s.layout, id);
  FIELDS.forEach((f) => { out[f] = text(s[f], LIMITS[f]); });
  out.items = (Array.isArray(s.items) ? s.items : []).filter((x) => typeof x === "string").slice(0, SLIDE_ITEMS).map((x) => x.slice(0, 200));
  return out;
}

/* ---------- a forma do documento ----------
   {id, name, app, slides: [{id, layout, title, body, items, left, right,
   number, caption, notes}], createdAt, updatedAt}. quem cria de fora (a
   conversa, um modelo) só precisa acertar o grosso; o resto se acerta aqui.
   uma apresentação tem sempre pelo menos um slide. */
export function normalizeDeck(raw) {
  const d = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const used = new Set();
  let slides = (Array.isArray(d.slides) ? d.slides : []).filter((s) => s && typeof s === "object" && !Array.isArray(s))
    .slice(0, DECK_SLIDES).map((s) => normalizeSlide(s, used));
  if (!slides.length) slides = [blankSlide("cover", "s1")];
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    id: d.id == null ? "" : String(d.id),
    name: (typeof d.name === "string" ? d.name : "").trim().slice(0, 120) || "apresentação sem nome",
    app: typeof d.app === "string" ? d.app : "",
    slides,
    createdAt: num(d.createdAt),
    updatedAt: num(d.updatedAt)
  };
}

/* ---------- mexer nos slides ---------- */
const at = (deck, index) => (Number.isInteger(index) && index >= 0 && index < deck.slides.length ? index : -1);
const withSlides = (deck, slides) => normalizeDeck({ ...deck, slides });

export function moveSlide(raw, index, delta) {
  const deck = normalizeDeck(raw);
  const i = at(deck, index), j = i + Math.round(+delta || 0);
  if (i < 0 || j === i || j < 0 || j >= deck.slides.length) return raw;
  const slides = deck.slides.slice();
  const [s] = slides.splice(i, 1);
  slides.splice(j, 0, s);
  return withSlides(deck, slides);
}

export function duplicateSlide(raw, index, makeId) {
  const deck = normalizeDeck(raw);
  const i = at(deck, index);
  if (i < 0 || deck.slides.length >= DECK_SLIDES) return raw;
  const used = new Set(deck.slides.map((s) => s.id));
  let id = typeof makeId === "function" ? makeId() : "";
  id = id == null ? "" : String(id);
  if (!id || used.has(id)) id = firstFree(used);
  const slides = deck.slides.slice();
  slides.splice(i + 1, 0, { ...deck.slides[i], id, items: deck.slides[i].items.slice() });
  return withSlides(deck, slides);
}

export function removeSlide(raw, index) {
  const deck = normalizeDeck(raw);
  const i = at(deck, index);
  if (i < 0 || deck.slides.length <= 1) return raw;
  return withSlides(deck, deck.slides.filter((_, k) => k !== i));
}

export function insertSlide(raw, index, slide) {
  const deck = normalizeDeck(raw);
  if (deck.slides.length >= DECK_SLIDES) return raw;
  const i = Math.max(0, Math.min(deck.slides.length, Math.round(+index) || 0));
  const used = new Set(deck.slides.map((s) => s.id));
  const fresh = normalizeSlide(slide && typeof slide === "object" ? slide : {}, used);
  const slides = deck.slides.slice();
  slides.splice(i, 0, fresh);
  return withSlides(deck, slides);
}

export function setLayout(raw, index, layout) {
  const deck = normalizeDeck(raw);
  const i = at(deck, index);
  if (i < 0 || !LAYOUT_IDS.includes(layout) || deck.slides[i].layout === layout) return raw;
  return withSlides(deck, deck.slides.map((s, k) => (k === i ? { ...s, layout } : s)));
}

export function updateSlide(raw, index, patch) {
  const deck = normalizeDeck(raw);
  const i = at(deck, index);
  if (i < 0) return raw;
  const p = patch && typeof patch === "object" ? { ...patch } : {};
  delete p.id;
  return withSlides(deck, deck.slides.map((s, k) => (k === i ? { ...s, ...p } : s)));
}

/* ---------- os modelos da tela vazia (D5) ----------
   o roteiro de cada conversa, com a pergunta que cada slide responde: a
   pessoa troca o texto em vez de encarar um slide em branco. */
export const DECK_TEMPLATES = [
  {
    id: "pitch", name: "pitch do produto",
    summary: "o problema, a solução, para quem é, o número que prova e o pedido",
    slides: [
      { layout: "cover", title: "nome do produto", body: "a frase que diz o que ele faz, para quem" },
      { layout: "bullets", title: "o problema", items: ["quem sofre com isso", "quanto custa hoje", "por que as saídas de hoje não resolvem"] },
      { layout: "bullets", title: "a solução", items: ["o que o produto faz", "como funciona, em um passo", "o que muda para quem usa"] },
      { layout: "number", title: "o tamanho da dor", number: "70%", caption: "de quem tem o problema ainda resolve na mão" },
      { layout: "columns", title: "por que nós", left: "hoje\n\no jeito que todo mundo faz, e onde ele falha", right: "com o produto\n\no que fica mais rápido, mais barato ou mais certo" },
      { layout: "bullets", title: "como ganhamos dinheiro", items: ["o preço e o plano", "quem paga", "o custo de atender um cliente"] },
      { layout: "cover", title: "o próximo passo", body: "o que você pede a quem está assistindo" }
    ]
  },
  {
    id: "launch", name: "lançamento",
    summary: "a data, a oferta, os canais e o que precisa estar pronto antes",
    slides: [
      { layout: "cover", title: "lançamento de …", body: "a data e a promessa em uma linha" },
      { layout: "number", title: "a meta", number: "100", caption: "vendas na semana de abertura" },
      { layout: "bullets", title: "a oferta", items: ["o que está à venda", "o preço de lançamento e até quando", "o bônus de quem entra primeiro"] },
      { layout: "columns", title: "antes e durante", left: "antes da abertura\n\naquecimento, lista de espera, conteúdo", right: "na abertura\n\ne-mails, anúncios, ao vivo" },
      { layout: "bullets", title: "o que precisa estar pronto", items: ["página de vendas", "checkout testado", "sequência de e-mails", "peças de conteúdo"] },
      { layout: "cover", title: "contagem regressiva", body: "quem faz o quê até o dia" }
    ]
  },
  {
    id: "month", name: "resultado do mês",
    summary: "o número do mês, o que deu certo, o que não deu e o foco do próximo",
    slides: [
      { layout: "cover", title: "resultado de …", body: "o mês em uma frase" },
      { layout: "number", title: "faturamento", number: "R$ 0", caption: "contra a meta de R$ …" },
      { layout: "columns", title: "o mês", left: "deu certo\n\no que repetir", right: "não deu\n\no que mudar" },
      { layout: "bullets", title: "os números", items: ["clientes ativos", "vendas", "custo por venda", "cancelamentos"] },
      { layout: "bullets", title: "o foco do próximo mês", items: ["uma prioridade", "a meta que mede ela", "o que fica de fora"] }
    ]
  },
  {
    id: "proposal", name: "proposta para cliente",
    summary: "o que entendemos, o que vamos fazer, em quanto tempo e por quanto",
    slides: [
      { layout: "cover", title: "proposta para …", body: "o resultado que o cliente quer" },
      { layout: "bullets", title: "o que entendemos", items: ["onde o cliente está hoje", "aonde quer chegar", "o que impede"] },
      { layout: "bullets", title: "o que vamos fazer", items: ["entrega 1", "entrega 2", "entrega 3"] },
      { layout: "columns", title: "como trabalhamos", left: "da nossa parte\n\no que entregamos e quando", right: "da sua parte\n\no que precisamos de você" },
      { layout: "number", title: "o investimento", number: "R$ 0", caption: "por mês, durante … meses" },
      { layout: "cover", title: "próximos passos", body: "aceite, início e a primeira reunião" }
    ]
  }
];

/* o modelo vira slides com id; `makeId` vem de quem grava (newId do core),
   para este arquivo continuar puro. sem modelo: uma capa, e só */
export function buildDeck(template, makeId) {
  const mk = typeof makeId === "function" ? makeId : () => "";
  const t = template && typeof template === "object" && Array.isArray(template.slides) && template.slides.length
    ? template : { name: "apresentação", slides: [{ layout: "cover" }] };
  return {
    name: typeof t.name === "string" && t.name ? t.name : "apresentação",
    slides: t.slides.filter((s) => s && typeof s === "object").map((s) => {
      const out = blankSlide(s.layout, mk());
      FIELDS.forEach((f) => { if (typeof s[f] === "string") out[f] = s[f]; });
      if (Array.isArray(s.items)) out.items = s.items.slice();
      return out;
    })
  };
}
