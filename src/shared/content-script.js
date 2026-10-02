/* merlin · conteudo, o nucleo puro
   entra texto, sai texto: sem React, sem store, sem rede. o que a tela de
   conteudo precisa decidir sobre o roteiro (qual molde, se ainda e o molde
   intocado, onde mora o gancho, onde entra uma secao) e sobre o ritmo (o que
   falta publicar na semana) mora aqui, para ter teste.

   o worker nao importa este modulo: quem precisa do molde la recebe o texto
   pelo contexto (contentContext). */

/* os formatos. se esta lista mudar, muda tambem FORMAT_IDS no worker
   (server/worker.js): sugestao com formato que nao existe do outro lado e
   descartada em silencio, e o Merlin parece ter ficado mudo. */
export const FORMATS = [
  { id: "youtube", label: "YouTube", one: "vídeo", many: "vídeos" },
  { id: "reels", label: "Reels", one: "reels", many: "reels" },
  { id: "carousel", label: "carrossel", one: "carrossel", many: "carrosséis" },
  { id: "story", label: "story", one: "story", many: "stories" },
  { id: "email", label: "e-mail", one: "e-mail", many: "e-mails" },
  { id: "other", label: "outro", one: "peça", many: "peças" }
];
export const FORMAT_IDS = FORMATS.map((f) => f.id);
export const formatLabel = (id) => (FORMATS.find((f) => f.id === id) || {}).label || id;

/* ---------- os moldes ----------
   bullets para falar, nao texto para ler. a linha em italico e a dica e pode
   ser apagada; os "- " vazios nao contam como topico no cartao. */
const MOLDS = {
  reels: [
    "*bullets para falar, não texto para ler · 30 a 60s, umas 150 palavras*",
    "## gancho · 0 a 3s", "*número, contraste ou case. nunca pergunta, nunca \"oi\"*", "- ",
    "## segurar", "*abre a curiosidade e só fecha no fim*", "- ",
    "## virada", "*o que faz salvar e mandar para alguém*", "- ",
    "## cta", "- "
  ],
  story: [
    "*uma tela, uma ideia · 3 a 5 telas*",
    "## tela 1 · gancho", "- ",
    "## tela 2", "- ",
    "## tela 3 · interação", "*enquete, caixa de pergunta ou quiz*", "- ",
    "## tela 4 · cta", "*link, dm ou \"responde aqui\"*", "- "
  ],
  carousel: [
    "*um ponto por slide · 6 a 10 slides*",
    "## capa", "*a promessa em até 8 palavras*", "- ",
    "## slide 2 · o problema", "- ",
    "## slides 3 a 7 · um ponto por slide", "- ",
    "## penúltimo · a virada", "- ",
    "## último · cta", "*salvar, comentar ou link*", "- "
  ],
  youtube: [
    "*bullets para falar, não texto para ler*",
    "## título e thumb", "*3 opções de título · texto da thumb em até 4 palavras*", "- ",
    "## gancho · 0 a 30s", "*o que a pessoa ganha se ficar até o fim*", "- ",
    "## capítulos", "- ",
    "## fechamento", "- ",
    "## cta", "- "
  ],
  email: [
    "## assunto", "*3 opções · até 45 caracteres*", "- ",
    "## preheader", "- ",
    "## abertura", "- ",
    "## corpo", "- ",
    "## cta", "- ",
    "## ps", "- "
  ],
  other: [
    "*bullets para falar, não texto para ler*",
    "## gancho", "- ",
    "## desenvolvimento", "- ",
    "## fechamento", "- "
  ]
};

export function moldFor(format, title) {
  const body = MOLDS[format] || MOLDS.other;
  return "# " + (String(title || "").trim() || "roteiro") + "\n" + body.join("\n") + "\n";
}

/* o roteiro sem a linha do titulo e sem espaco sobrando: e assim que se
   compara com o molde, porque o titulo da peca muda e o molde vem com ele */
const bodyOf = (script) => String(script || "").replace(/\r\n/g, "\n").split("\n")
  .filter((l, i, all) => !(i === all.findIndex((x) => x.trim()) && /^#\s/.test(l.trim())))
  .map((l) => l.replace(/\s+$/, "")).join("\n").trim();

/* ainda e o molde do formato, do jeito que nasceu? so entao trocar o formato
   pode trocar o molde junto — qualquer letra a mais e trabalho da pessoa */
export const isUntouchedMold = (script, format) =>
  !!String(script || "").trim() && bodyOf(script) === bodyOf(moldFor(format, ""));

/* ---------- as secoes ---------- */
const lines = (s) => String(s || "").replace(/\r\n/g, "\n").split("\n");
const isSection = (l) => /^##\s+\S/.test(l);
const isHeading = (l) => /^#{1,2}\s/.test(l);
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* onde mora o gancho em cada formato: no carrossel e a capa, no story e a
   primeira tela. o resto procura "gancho". */
const HOOK_KEYS = { carousel: ["capa", "gancho"], story: ["tela 1", "gancho"] };

/* troca a primeira linha "- " da secao do gancho pela frase. sem a secao,
   a frase entra numa "## gancho" logo depois do "# titulo". */
export function setHook(script, line, format) {
  const hook = String(line || "").trim();
  const ls = lines(script);
  const keys = HOOK_KEYS[format] || ["gancho"];
  let at = -1;
  for (const k of keys) { at = ls.findIndex((l) => isSection(l) && fold(l).includes(k)); if (at >= 0) break; }
  if (at >= 0) {
    let end = ls.findIndex((l, i) => i > at && isHeading(l));
    if (end < 0) end = ls.length;
    const bullet = ls.findIndex((l, i) => i > at && i < end && /^\s*[-*](\s|$)/.test(l));
    if (bullet >= 0) ls[bullet] = "- " + hook;
    else {
      /* a secao existe mas nao tem topico: entra depois do titulo e da dica */
      let i = at + 1;
      while (i < end && /^\s*\*[^*].*\*\s*$/.test(ls[i])) i++;
      ls.splice(i, 0, "- " + hook);
    }
    return ls.join("\n");
  }
  const title = ls.findIndex((l) => /^#\s/.test(l));
  const block = ["## gancho", "- " + hook];
  if (title >= 0) ls.splice(title + 1, 0, ...block);
  else if (!String(script || "").trim()) return block.join("\n") + "\n";
  else ls.unshift(...block, "");
  return ls.join("\n");
}

/* grava uma secao do roteiro: troca se ja existe, acrescenta no fim se nao.
   o corpo pode vir com o proprio "## titulo" (o Merlin as vezes manda): sai. */
export function upsertSection(script, heading, body) {
  const head = "## " + String(heading).trim();
  let text = String(body || "").replace(/\r\n/g, "\n").trim();
  const first = text.split("\n")[0];
  if (isSection(first) && fold(first).replace(/^##\s+/, "").trim() === fold(heading).trim()) text = text.split("\n").slice(1).join("\n").trim();
  const block = [head, ...(text ? text.split("\n") : [])];
  const ls = lines(script);
  const at = ls.findIndex((l) => isSection(l) && fold(l).replace(/^##\s+/, "").trim() === fold(heading).trim());
  if (at >= 0) {
    let end = ls.findIndex((l, i) => i > at && isHeading(l));
    if (end < 0) end = ls.length;
    const tail = ls.slice(end);
    /* uma linha em branco entre a secao e o que vem depois, como no resto */
    return [...ls.slice(0, at), ...block, ...(tail.length ? ["", ...tail] : [])].join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s*$/, "\n");
  }
  const base = String(script || "").replace(/\s+$/, "");
  return (base ? base + "\n\n" : "") + block.join("\n") + "\n";
}

/* quantos topicos de verdade o roteiro tem: "- " vazio do molde nao conta */
export const scriptLines = (s) => lines(s).filter((l) => /^\s*[-*]\s+\S/.test(l)).length;

/* ---------- o contexto que vai para o Merlin ----------
   o worker corta de novo, campo por campo — este corte e o da tela, para o
   pedido nao sair maior do que precisa. */
const STAGE_LABELS = { idea: "ideia", script: "roteiro", record: "gravar", edit: "editar", scheduled: "agendado", published: "publicado" };
export function contentContext(piece, client, pieces) {
  const p = piece || {};
  const c = client || null;
  const same = (Array.isArray(pieces) ? pieces : [])
    .filter((x) => x && x.id !== p.id && String(x.client || "") === String(p.client || ""))
    .sort((a, b) => (+b.createdAt || 0) - (+a.createdAt || 0))
    .slice(0, 30).map((x) => String(x.title || "").slice(0, 120)).filter(Boolean);
  return {
    title: String(p.title || "").slice(0, 200),
    format: formatLabel(p.format || "other"),
    formatId: FORMAT_IDS.includes(p.format) ? p.format : "other",
    stage: STAGE_LABELS[p.stage] || String(p.stage || ""),
    date: String(p.date || ""),
    script: String(p.script || "").slice(0, 4000),
    mold: moldFor(p.format, p.title).slice(0, 1500),
    ...clientContext(c),
    recent: same
  };
}

/* so o cliente, para quando nao ha peca (puxar pautas) */
export function clientContext(c) {
  if (!c) return { client: "", niche: "", sells: "", pain: "", offers: [], page: "" };
  return {
    client: String(c.name || "").slice(0, 120),
    niche: String(c.niche || "").slice(0, 80),
    sells: String(c.sells || "").slice(0, 120),
    pain: String(c.pain || "").slice(0, 600),
    offers: (Array.isArray(c.offers) ? c.offers : []).map((o) => String((o && o.name) || "").slice(0, 80)).filter(Boolean).slice(0, 12),
    page: String(c.summary || "").slice(0, 1200)
  };
}

/* ---------- o ritmo: o que falta publicar nesta semana ----------
   ritmo e quantas pecas se quer publicar, por dia ou por semana, por cliente
   e, se quiser, por formato. o conteudo proprio ("me") nasce com 1 por dia,
   em qualquer formato, todos os dias; cliente nasce sem ritmo.

   a conta e do que ainda cabe: dia que ja passou vazio nao vira cobranca. */
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]; // domingo = 0, como no getDay()
export const DEFAULT_RULE = { n: 1, per: "day", format: "", days: ALL_DAYS };
export const ME = "me";

export function normalizeRule(r) {
  r = r || {};
  const days = Array.isArray(r.days) ? [...new Set(r.days.map(Number).filter((d) => d >= 0 && d <= 6))].sort() : ALL_DAYS.slice();
  return {
    id: String(r.id || ""),
    n: Math.max(0, Math.min(50, Math.round(+r.n) || 0)),
    per: r.per === "week" ? "week" : "day",
    format: FORMAT_IDS.includes(r.format) ? r.format : "",
    days
  };
}
export function normalizeCadence(d) {
  d = d || {};
  return { ...d, id: String(d.id), rules: (Array.isArray(d.rules) ? d.rules : []).map(normalizeRule), updatedAt: +d.updatedAt || 0 };
}
/* o ritmo de um dono (cliente ou "me"): o documento gravado, ou o padrao —
   1 por dia para o proprio, nada para cliente. zerado e uma lista vazia
   gravada, e e diferente de "nunca mexeu". */
export function rulesOf(owner, doc) {
  if (doc) return normalizeCadence(doc).rules.filter((r) => r.n > 0 && r.days.length);
  return owner === ME ? [normalizeRule({ ...DEFAULT_RULE, id: "default" })] : [];
}

const pad = (n) => String(n).padStart(2, "0");
const dayStr = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const toDate = (day) => { const [y, m, d] = day.split("-").map(Number); return new Date(y, m - 1, d); };
/* a semana corre de segunda a domingo */
export function weekDays(today) {
  const d = toDate(today);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return dayStr(x); });
}
const weekdayOf = (day) => toDate(day).getDay();

/* as pecas de um dono que contam para uma regra: com data, do formato dela */
const owns = (owner) => (p) => String(p.client || "") === (owner === ME ? "" : owner);
const fits = (rule) => (p) => !!p.date && (!rule.format || p.format === rule.format);

/* a falta de uma regra nesta semana.
   diaria: os dias que contam, de hoje ate domingo, com menos de n pecas.
   semanal: n menos as pecas com data de segunda a domingo. */
export function ruleGap(rule, pieces, today) {
  const r = normalizeRule(rule);
  const week = weekDays(today);
  const mine = (pieces || []).filter(fits(r));
  const countOn = (day) => mine.filter((p) => p.date === day).length;
  const counted = (day) => r.days.includes(weekdayOf(day));
  if (r.n <= 0 || !r.days.length) return { per: r.per, format: r.format, missing: 0, today: 0, days: [] };
  if (r.per === "day") {
    const ahead = week.filter((d) => d >= today && counted(d));
    const open = ahead.filter((d) => countOn(d) < r.n);
    const todayMissing = counted(today) ? Math.max(0, r.n - countOn(today)) : 0;
    return { per: "day", format: r.format, n: r.n, missing: open.length, today: todayMissing, days: open };
  }
  const have = mine.filter((p) => p.date >= week[0] && p.date <= week[6]).length;
  const missing = Math.max(0, r.n - have);
  /* os dias livres para preencher: os que contam, de hoje em diante, sem
     nenhuma peca deste formato ainda */
  const free = week.filter((d) => d >= today && counted(d) && countOn(d) === 0);
  return { per: "week", format: r.format, n: r.n, missing, today: 0, days: free };
}

/* o que falta de um dono inteiro: uma linha por regra, so as que faltam */
export function cadenceGaps(owner, doc, pieces, today) {
  const rules = rulesOf(owner, doc);
  const mine = (pieces || []).filter(owns(owner));
  const gaps = rules.map((r) => ({ ...ruleGap(r, mine, today), rule: r })).filter((g) => g.missing > 0);
  return { owner, active: rules.length > 0, gaps };
}

/* as ideias escolhidas ganham o proximo dia vazio da semana, em ordem. com
   mais ideias que dias, as que sobram ficam no ultimo — melhor que sem data. */
export function assignDays(ids, gap, today) {
  const days = gap && gap.days && gap.days.length ? gap.days : [today];
  return ids.map((id, i) => ({ id, date: days[Math.min(i, days.length - 1)] }));
}

/* a frase de uma falta, sem o dono: "hoje ainda sem peça · faltam 4 dias",
   "faltam 2 reels". volta em pedacos {text, strong} para a tela pintar o
   numero em negrito sem montar html. */
const fmtWord = (format, n) => {
  const f = FORMATS.find((x) => x.id === format) || { one: "peça", many: "peças" };
  return n === 1 ? f.one : f.many;
};
export function gapParts(g) {
  if (g.per === "day") {
    const parts = [];
    if (g.today > 0) parts.push(g.n === 1 ? [{ text: "hoje ainda sem " + fmtWord(g.format, 1) }]
      : [{ text: "hoje " + (g.today === 1 ? "falta " : "faltam ") }, { strong: g.today + " " + fmtWord(g.format, g.today) }]);
    const rest = g.missing - (g.today > 0 ? 1 : 0);
    if (rest > 0) parts.push([{ text: (g.missing === 1 ? "falta " : "faltam ") }, { strong: g.missing + (g.missing === 1 ? " dia" : " dias") }, { text: " nesta semana" }]);
    return parts;
  }
  return [[{ text: g.missing === 1 ? "falta " : "faltam " }, { strong: g.missing + " " + fmtWord(g.format, g.missing) }, { text: " nesta semana" }]];
}
