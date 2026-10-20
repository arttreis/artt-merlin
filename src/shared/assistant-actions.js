/* merlin · o que uma proposta do assistente vira quando confirmada
   logica pura, sem React: um actionType (do catalogo fechado que o worker
   ja valida em ASSISTANT_ACTIONS) e um payload viram um documento pronto
   para collection.save(). cada tipo aponta pra uma colecao que ja existe —
   o proprio normalize() dela, chamado na proxima leitura daquela pagina, e
   quem faz a validacao funda (arvore de mapa, no de funil etc.); aqui so
   se monta o documento minimo e se filtra o que o campo aceita. */
import { newId, today } from "./core.js";
import { journalEntry } from "./client-doc.js";
import { layoutNodes } from "./funnel-layout.js";
import { newEntry, entryLine, paidOf, configOf, contextOf, bookOf, bookCollection } from "./finance-data.js";
import { SOURCES } from "./portrait.js";
import { normalize as normalizeHabit, habitStatus, markOn } from "./habits-data.js";
import { sleepLabel, sleepLine, readHours, sleepDoc, nightOf } from "./sleep-data.js";
import { readMinutes, workoutDoc, workoutDay, workoutLine } from "./workouts-data.js";
import { MEALS, mealOf, mealDoc, mealDay, mealLine } from "./meals-data.js";

export const ACTION_COLLECTIONS = {
  task: "tasks",
  note: "notes",
  "routine-block": "routine",
  "lead-update": "clients",
  "onboarding-map": "maps",
  "onboarding-funnel": "funnels",
  script: "content",
  "finance-entry": "finance",
  "habit-mark": "habits",
  "sleep-log": "sleep",
  "workout-log": "workouts",
  "meal-log": "meals"
};

export const ACTION_LABELS = {
  task: "nova tarefa",
  note: "nova nota",
  "routine-block": "novo bloco na rotina",
  "lead-update": "atualizar cliente",
  "onboarding-map": "novo mapa de onboarding",
  "onboarding-funnel": "novo funil de onboarding",
  script: "roteiro",
  "finance-entry": "novo lançamento",
  "habit-mark": "marcar hábito",
  "sleep-log": "registrar sono",
  "workout-log": "registrar treino",
  "meal-log": "anotar refeição"
};

/* o que a pílula confirmada diz no lugar do título: "✓ lançado · …" */
export const ACTION_DONE = { "finance-entry": "lançado", "habit-mark": "marcado", "sleep-log": "registrado", "workout-log": "registrado", "meal-log": "anotado", task: "criada", note: "criada", "lead-update": "aplicado", script: "aplicado" };

/* so os campos que fazem sentido editar antes de confirmar — o resto do
   payload (arvore do mapa, etapas do funil, id do cliente/conteudo) segue
   como a IA propos, sem virar campo de formulario.
   alem de texto, numero, data e textarea, o campo pode ser `money` (centavos),
   `select` (as opcoes vem de `options(store, v)`: a colecao alvo e o que ja
   esta na caixa) e `check`.
   `initial(payload, store)` preenche o que a IA deixou em branco. */
export const ACTION_FIELDS = {
  task: [
    { key: "title", label: "título" },
    { key: "date", label: "data", type: "date" },
    { key: "min", label: "minutos", type: "number" },
    { key: "client", label: "cliente" }
  ],
  note: [
    { key: "title", label: "título" },
    { key: "body", label: "nota", type: "textarea" },
    { key: "client", label: "cliente" }
  ],
  "routine-block": [
    { key: "title", label: "título" },
    { key: "at", label: "horário (hh:mm)" },
    { key: "min", label: "minutos", type: "number" }
  ],
  "lead-update": [
    { key: "stage", label: "etapa" },
    { key: "temperature", label: "temperatura" },
    { key: "note", label: "nota (vira registro no histórico)", type: "textarea" }
  ],
  "onboarding-map": [{ key: "name", label: "nome" }],
  "onboarding-funnel": [{ key: "name", label: "nome" }],
  script: [{ key: "script", label: "roteiro", type: "textarea" }],
  /* o previsto confirmado e o fixo (confirm, fixed) seguem como a IA propos:
     sao ids, nao campo de formulario. o livro vem primeiro e sempre à vista:
     na dúvida a IA manda pessoal, e quem decide é a pessoa (PRD meu-negocio).
     `options` recebe também o que está na caixa, e as categorias seguem o livro */
  "finance-entry": [
    { key: "book", label: "de quem", type: "select", initial: (p) => bookOf(p.book), options: () => [["personal", "pessoal"], ["business", "empresa"]] },
    { key: "name", label: "o quê" },
    { key: "amount", label: "valor", type: "money" },
    { key: "day", label: "data", type: "date", initial: () => today() },
    { key: "kind", label: "entrada ou saída", type: "select", initial: () => "out", options: () => [["out", "saída"], ["in", "entrada"]] },
    { key: "category", label: "categoria", type: "select",
      initial: (p, store) => (configOf(bookCollection(store, p.book)).categories.includes(p.category) ? p.category : ""),
      options: (store, v) => [["", "sem categoria"], ...configOf(bookCollection(store, v && v.book)).categories] },
    { key: "paid", label: "já aconteceu", type: "check", initial: (p) => paidOf(p.day || today(), p.paid, today()) }
  ],
  /* as horas como se escrevem ("7h30"): a IA manda minutos, e a caixa os
     mostra do jeito que se lê. sem as horas, a caixa as pede antes de gravar */
  "sleep-log": [
    { key: "hours", label: "horas dormidas", initial: (p) => sleepLabel(p.min) },
    { key: "date", label: "dia em que acordou", type: "date", initial: () => today() }
  ],
  /* o que e quanto tempo; sem os minutos, a caixa os pede antes de gravar.
     o campo tem chave própria, como as horas do sono: o 0 da IA aparece
     vazio, e não "0" */
  "workout-log": [
    { key: "title", label: "o que treinou" },
    { key: "minutes", label: "minutos", initial: (p) => (+p.min > 0 ? String(Math.round(+p.min)) : "") },
    { key: "date", label: "dia", type: "date", initial: () => today() }
  ],
  /* a refeição, o que comeu e o dia; sem caloria (sem culpa). a escolha tem
     chave própria, como os minutos do treino: o que a IA mandar fora das
     quatro ("brunch", "almoço") aparece já como a refeição que vai gravar */
  "meal-log": [
    { key: "pick", label: "refeição", type: "select", initial: (p) => mealOf(p.meal), options: () => MEALS.map((m) => [m.id, m.label]) },
    { key: "text", label: "o que comeu" },
    { key: "date", label: "dia", type: "date", initial: () => today() }
  ]
};

/* a refeição de uma proposta: o que a pessoa deixou na caixa por cima do que
   a IA propôs */
const mealSpec = (p) => ({ date: p.date, meal: mealOf("pick" in p ? p.pick : p.meal), text: String(p.text || "").replace(/\s+/g, " ").trim() });

/* o treino de uma proposta: o que a pessoa deixou na caixa por cima do que a
   IA propôs, com os minutos como se escrevem ("40", "1h") */
const workoutSpec = (p) => ({ date: p.date, title: String(p.title || "").trim(), min: readMinutes("minutes" in p ? p.minutes : p.min) });

/* os minutos de uma proposta de sono: o que a pessoa escreveu na caixa, ou o
   que a IA propôs */
const sleepMin = (p) => (p.hours != null && p.hours !== "" ? readHours(p.hours) : Math.max(0, Math.round(+p.min || 0)));

/* a linha extra debaixo do titulo do dialogo — o que da pra ver do payload
   sem abrir os campos, tipo "12/09/2026 · 30 min · cliente x". `ctx` (o do
   financeiro, opcional) deixa o lancamento dizer de que previsto se trata */
export function previewOf(actionType, payload, ctx) {
  const p = payload || {};
  switch (actionType) {
    case "task": return [p.date, p.min ? p.min + " min" : "", p.client].filter(Boolean).join(" · ");
    case "note": return p.client || "";
    case "routine-block": return [p.at, p.min ? p.min + " min" : ""].filter(Boolean).join(" · ");
    case "lead-update": return [p.stage, p.temperature].filter(Boolean).join(" · ");
    case "onboarding-map": return ((p.tree && p.tree.children) || []).length + " ramos";
    case "onboarding-funnel": return (p.stages || []).length + " etapas";
    case "script": return "entra no roteiro da peça de conteúdo";
    case "finance-entry": return entryLine({ ...p, flow: p.kind, date: p.day }, today(), ctx);
    case "habit-mark": return [p.habit || p.name, p.date && p.date !== today() ? p.date.slice(8, 10) + "/" + p.date.slice(5, 7) : ""].filter(Boolean).join(" · ");
    case "sleep-log": {
      const t = today(), { day, error } = nightOf(p, t);
      if (error) return error;
      return sleepMin(p) ? sleepLine(sleepMin(p), day, t) : "faltam as horas";
    }
    case "workout-log": {
      const t = today(), w = workoutSpec(p), { day, error } = workoutDay(w, t);
      if (error) return error;
      return w.min ? workoutLine({ title: w.title || "treino", min: w.min, day }, t) : "faltam os minutos";
    }
    case "meal-log": {
      const t = today(), m = mealSpec(p), { day, error } = mealDay(m, t);
      if (error) return error;
      return m.text ? mealLine({ ...m, day }, t) : "falta o que comeu";
    }
    default: return "";
  }
}

export const hhmmToMin = (s) => {
  const m = String(s || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h >= 0 && h < 24 && mi >= 0 && mi < 60 ? h * 60 + mi : null;
};

/* monta o documento a partir do payload da IA + o que a pessoa editou no
   formulario (`v`, do useFields — so os campos de ACTION_FIELDS). `store` e
   a colecao alvo, ja aberta pelo chamador — so entra em uso para os dois
   tipos que EDITAM um documento existente em vez de criar um novo.
   devolve { doc } pra gravar, ou { error } quando falta uma referencia que
   a IA nao podia ter inventado (id de cliente, id de conteudo). `opts.chat`
   e o id da conversa, que vai na origem do lancamento. */
export function buildDoc(actionType, payload, v, store, opts) {
  const now = Date.now();
  const p = payload || {};
  switch (actionType) {
    case "task":
      return { doc: { id: newId(), title: v.title.trim(), date: v.date, min: +v.min || 0, client: v.client, done: false, createdAt: now, updatedAt: now } };
    case "note":
      return { doc: { id: newId(), title: v.title.trim(), body: v.body, client: v.client, stage: "seed", createdAt: now, updatedAt: now } };
    case "routine-block":
      return { doc: { id: newId(), title: v.title.trim(), days: Array.isArray(p.days) ? p.days : [], at: hhmmToMin(v.at), min: +v.min || 0, reserved: false, client: "", until: "", weeks: {}, createdAt: now, updatedAt: now } };
    case "lead-update": {
      const existing = p.id ? store.get(p.id) : null;
      if (!existing) return { error: "não achei esse cliente/prospecto" };
      const journal = Array.isArray(existing.journal) ? existing.journal.slice() : [];
      if (v.note && v.note.trim()) journal.push(journalEntry(v.note.trim(), "note"));
      return { doc: { ...existing, stage: v.stage || existing.stage, temperature: v.temperature || existing.temperature, journal, updatedAt: now } };
    }
    case "onboarding-map":
      return { doc: { id: newId(), name: v.name.trim(), root: p.tree && typeof p.tree === "object" ? p.tree : { title: v.name.trim() }, client: "", idea: "", funnel: "", createdAt: now, updatedAt: now } };
    case "onboarding-funnel": {
      const stages = Array.isArray(p.stages) ? p.stages : [];
      const nodes = stages.map((s) => ({ id: newId(), type: String((s && s.nodeType) || "custom"), title: String((s && s.title) || "").slice(0, 120), x: 0, y: 0, fields: {}, number: null, note: "" }));
      const edges = nodes.slice(1).map((n, i) => ({ id: newId(), from: nodes[i].id, to: n.id, label: "", avgRate: null }));
      return { doc: { id: newId(), name: v.name.trim(), client: "", channel: "", nodes: layoutNodes(nodes, edges), edges, creatives: [], automations: [], offers: [], triggers: [], period: { from: "", to: "" }, snapshots: [], createdAt: now, updatedAt: now } };
    }
    case "script": {
      const existing = p.contentId ? store.get(p.contentId) : null;
      if (!existing) return { error: "não achei essa peça de conteúdo" };
      return { doc: { ...existing, script: v.script, updatedAt: now } };
    }
    /* as contas e as referências (o previsto, o fixo) são as do livro
       escolhido: um "#id" do outro livro não confirma nada */
    case "finance-entry": {
      const book = bookCollection(store, v.book);
      const r = newEntry({
        title: v.name, amount: v.amount, flow: v.kind, category: v.category, date: v.day, paid: v.paid,
        confirm: p.confirm, fixed: p.fixed, chat: opts && opts.chat
      }, configOf(book), contextOf(book), today());
      return r.doc ? { doc: { ...r.doc, book: book.book } } : r;
    }
    /* a pílula marca sem caixa: `v` é o próprio payload. a coleção chega sem
       normalize na tela da conversa, então cada hábito é normalizado aqui.
       hábito que não existe não se cria por aqui: é a caixa de novo hábito */
    case "habit-mark": {
      const e = v || {};
      const { habit, day, error } = habitStatus(store.all().map(normalizeHabit), { name: e.habit || e.name || p.habit || p.name, date: e.date || p.date }, today());
      if (error) return { error };
      if (!habit) return { error: "não achei esse hábito" };
      return markOn(habit, day, today());
    }
    /* um documento por noite, com o id no dia em que acordou: registrar de
       novo substitui, e o desfazer da caixa devolve a noite de antes */
    case "sleep-log": {
      const t = today(), { day } = nightOf({ date: v.date || p.date }, t);
      return sleepDoc({ date: day, min: sleepMin({ ...p, ...v }) }, store.get(day), t);
    }
    /* um documento por treino; quem marca o hábito de treino do dia é a
       caixa (ui.jsx), com o mesmo applyWorkout da aba e do início */
    case "workout-log":
      return workoutDoc(workoutSpec({ ...p, ...v }), null, today());
    /* um documento por refeição; o desfazer da caixa o apaga */
    case "meal-log":
      return mealDoc(mealSpec({ ...p, ...v }), null, today());
    default:
      return { error: "tipo de ação desconhecido" };
  }
}

/* ---------- as conversas ----------
   ate 22/09/2026 o chat era so memoria: fechava, sumia. agora cada conversa
   e um documento da colecao `chats`, local-first como todo o resto — sobe
   pra nuvem, volta no outro aparelho, e apagar e apagar. so texto e proposta
   entram; o que a IA mandou alem disso ja foi descartado no worker. */
export const MAX_TURNS = 40;

function normalizeProposal(p) {
  if (!p || typeof p !== "object" || !ACTION_COLLECTIONS[p.actionType]) return null;
  return {
    actionType: String(p.actionType),
    title: String(p.title || "").slice(0, 120),
    note: String(p.note || "").slice(0, 300),
    payload: p.payload && typeof p.payload === "object" ? p.payload : {},
    /* confirmada: a pilula vira a linha "✓ lancado · …" e nao abre de novo,
       nem depois de recarregar a conversa */
    done: p.done && typeof p.done === "object" ? { line: String(p.done.line || "").slice(0, 200) } : null
  };
}

/* marca a proposta da mensagem `i` como confirmada, com a linha que ela vira;
   `line` vazio desmarca (o desfazer do aviso) */
export function markProposal(list, i, line) {
  return list.map((m, j) => (j === i && m.proposal ? { ...m, proposal: { ...m.proposal, done: line ? { line: String(line) } : null } } : m));
}

/* as falas de montar com o Merlin (shared/build.js): as perguntas antes de
   montar, o rascunho e o "criei". o rascunho pode ser um app inteiro, e so o
   ultimo vale — os anteriores chegam aqui sem `data` (quem grava a conversa
   tira), e ficam so com o titulo e o resumo do que mudou */
const BUILD_KINDS = ["funnel", "app", "map"];
const str = (v, n) => String(v == null ? "" : v).slice(0, n);
function normalizeBuildMsg(m) {
  if (m.brief && BUILD_KINDS.includes(m.brief.kind)) {
    const b = m.brief;
    return { from: "merlin", brief: {
      kind: b.kind, request: str(b.request, 1500), answered: !!b.answered,
      questions: (Array.isArray(b.questions) ? b.questions : []).slice(0, 6).map((q) => ({
        q: str(q && q.q, 200), options: (Array.isArray(q && q.options) ? q.options : []).slice(0, 4).map((o) => str(o, 60))
      }))
    } };
  }
  if (m.draft && BUILD_KINDS.includes(m.draft.kind)) {
    const d = m.draft;
    return { from: "merlin", draft: {
      kind: d.kind, request: str(d.request, 1500), answers: str(d.answers, 1500),
      title: str(d.title, 120), summary: str(d.summary, 400),
      data: d.data && typeof d.data === "object" ? d.data : null
    } };
  }
  if (m.built && BUILD_KINDS.includes(m.built.kind)) {
    return { from: "merlin", built: { kind: m.built.kind, id: str(m.built.id, 60), name: str(m.built.name, 120) } };
  }
  return null;
}

/* o que uma resposta do Merlin pode pedir para a tela desenhar além do texto.
   lista fechada, como as fontes: o Worker tem a sua (ASSISTANT_SHOW), e o que
   não está aqui é descartado ao guardar */
export const SHOWS = ["quests"];

export function normalizeChat(d) {
  const messages = (Array.isArray(d.messages) ? d.messages : []).slice(-MAX_TURNS).map((m) => {
    const built = m && normalizeBuildMsg(m);
    if (built) return built;
    const proposal = normalizeProposal(m && m.proposal);
    if (proposal) return { from: "merlin", proposal };
    if (m && m.from === "me") return { from: "me", text: String(m.text || "").slice(0, 4000) };
    const msg = { from: "merlin", text: String((m && m.text) || "").slice(0, 4000) };
    /* de onde a resposta saiu ("vi a agenda"): guardado com ela, para a linha
       não sumir ao recarregar nem ao continuar a conversa na outra tela. só o
       que está na lista fechada do retrato */
    const sources = Array.isArray(m && m.sources) ? SOURCES.filter((x) => m.sources.includes(x)) : [];
    if (sources.length) msg.sources = sources;
    /* o cartão do "o que falta hoje?": guarda só o pedido, e o cartão é
       desenhado ao vivo a partir das coleções. o texto fica como a linha */
    if (m && SHOWS.includes(m.show)) msg.show = m.show;
    return msg;
  });
  return {
    id: String(d.id || ""),
    title: String(d.title || "").slice(0, 80) || "conversa",
    messages,
    createdAt: Number.isFinite(+d.createdAt) ? +d.createdAt : Date.now(),
    updatedAt: Number.isFinite(+d.updatedAt) ? +d.updatedAt : Date.now()
  };
}

/* a pessoa estava no fim da conversa? é a conta que decide se o cartão que
   cresce depois de desenhado a acompanha (rola até o fim) ou a deixa em paz
   (ela subiu para reler). a folga de 48px perdoa o arredondamento da rolagem
   e o resto de uma linha; conteúdo que cabe na caixa conta como "no fim". */
export function atBottom({ scrollTop, clientHeight, scrollHeight }, slack = 48) {
  return scrollHeight - scrollTop - clientHeight <= slack;
}

/* o titulo e a primeira coisa que a pessoa escreveu — e assim que ela
   reconhece a conversa na lista, e nao por um resumo que a IA inventaria
   (e que custaria outra chamada) */
export function chatTitle(list) {
  const first = list.find((m) => m.from === "me" && m.text);
  return String(first ? first.text : "conversa").replace(/\s+/g, " ").trim().slice(0, 80);
}

/* o que ja foi dito, no formato que a API de mensagens espera. o worker
   monta os turnos de verdade com isto (buildMessages, em server/worker.js) em
   vez de colar a conversa dentro do texto do pedido — e ele quem corta por
   turno e por tamanho, entao aqui so se traduz. proposta vira uma linha:
   o que importa pro turno seguinte e que ela foi feita, nao o payload. */
export function turnsOf(list) {
  return list.map((m) => ({
    role: m.from === "me" ? "user" : "assistant",
    content: m.proposal
      ? "[propôs " + m.proposal.actionType + ": '" + m.proposal.title + "'" + (m.proposal.done ? ", e a pessoa confirmou" : "") + "]"
      : m.brief ? "[perguntou antes de montar: " + m.brief.questions.map((q) => q.q).join(" ") + "]"
      : m.draft ? "[mostrou o rascunho: " + m.draft.title + "]"
      : m.built ? "[criou: " + m.built.name + "]"
      : String(m.text || "")
  })).filter((t) => t.content);
}
