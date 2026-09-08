/* merlin · o dia
   a janela do dia, a fila com duracao obrigatoria e a barra que se gasta com
   o relogio. so o dia tem minutos. */
import "./shared/shell.css";
import "./day.css";
import {
  initPage, newId, today, isDay, mondayOf, api, cloud, setMerlinAsks,
  readInbox, writeInbox, parseMentions, clientName
} from "./shared/core.js";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import {
  mount, useCollection, useClients, useKeydown, isTyping,
  useDelegate, DelegateDialog, ClientBadge, icon
} from "./shared/ui.jsx";
/* o documento e a conta do dia moram em shared/day.js desde que o inicio
   passou a dizer quanto ainda cabe hoje: a sobra tem que ser a mesma nas duas
   telas, e duas copias da mesma conta e como ela deixa de ser. */
import {
  DAY_KEY, MINUTES, normalizeTask, loadFrom, loadDay as load,
  isStale, pendingOf, doneOf, reservesOf, GUESS, costOf, budget,
  fmt, longFmt, clock
} from "./shared/day.js";

initPage("day");

/* ---------- tempo ---------- */

/* escrito por extenso: so as formas que alguem realmente digita com pressa */
const SPELLED = [
  [/(?:^|\s)meia\s*hora(?=\s|$)/i, 30],
  [/(?:^|\s)uma\s*hora\s*e\s*meia(?=\s|$)/i, 90],
  [/(?:^|\s)(?:uma|1)\s*hora(?=\s|$)/i, 60],
  [/(?:^|\s)duas\s*horas(?=\s|$)/i, 120],
  [/(?:^|\s)tr[eê]s\s*horas(?=\s|$)/i, 180]
];

/* a duracao em qualquer ponto do texto. e mais estrita que o parseDuration
   do core de proposito: "revisar 1h 20 slides" vira 1h e "revisar 20 slides",
   porque minuto solto pode ser do titulo — o parser prefere nao entender a
   entender errado. */
function readDuration(text) {
  /* por extenso primeiro: "meia hora" nao tem digito para os padroes abaixo pegarem */
  for (const [re, value] of SPELLED) {
    const m = text.match(re);
    if (m) return sliceOut(text, m, value);
  }

  /* decimal com virgula ou ponto: "1,5h" e "1.5h" sao a mesma coisa aqui */
  const decimal = text.match(/(?:^|\s)(\d{1,2})[.,](\d{1,2})\s*h(?:oras?)?(?=\s|$)/i);
  if (decimal) {
    const fraction = +("0." + decimal[2]);
    return sliceOut(text, decimal, Math.round(((+decimal[1]) + fraction) * 60));
  }

  /* minutos so contam colados na hora ("1h30") ou com unidade ("1h 30m"):
     senao "revisar 1h 20 slides" viraria 1h20 e comeria o "20" do titulo.
     "1h 30" tambem nao conta, pela mesma razao — o 30 pode ser do titulo. */
  const withHour = text.match(/(?:^|\s)(\d{1,2})\s*h(?:oras?)?(?:(\d{1,2})|\s*(\d{1,2})\s*(?:m|min|mins|minutos?))?(?=\s|$)/i);
  const m = withHour || text.match(/(?:^|\s)(\d{1,3})\s*(?:m|min|mins|minutos?)(?=\s|$)/i);
  if (!m) return { min: 0, title: text.replace(/\s+/g, " ").trim() };
  const min = withHour ? (+m[1]) * 60 + (+(m[2] || m[3] || 0)) : +m[1];
  return sliceOut(text, m, min);
}

/* fatia pela posicao real do match: replace(string) apagaria a primeira
   ocorrencia literal, que pode nao ser a que casou */
function sliceOut(text, m, min) {
  const clean = text.slice(0, m.index) + " " + text.slice(m.index + m[0].length);
  return { min: Math.min(min, MINUTES), title: clean.replace(/\s+/g, " ").trim() };
}

/* link de tarefa do ClickUp colado junto do titulo. so a forma /t/<id> —
   que e a unica que identifica uma tarefa — e a URL sai do titulo como a
   duracao sai: o titulo fica sendo o que voce leria em voz alta. */
const CLICKUP_URL = /(?:^|\s)https?:\/\/(?:[a-z0-9-]+\.)*clickup\.com\/t\/(?:\d+\/)?([A-Za-z0-9]{1,32})\S*(?=\s|$)/i;

function readClickup(text) {
  const m = text.match(CLICKUP_URL);
  if (!m) return { clickup: "", title: text };
  return {
    clickup: m[1],
    title: text.slice(0, m.index) + " " + text.slice(m.index + m[0].length)
  };
}

/* o composer inteiro le a linha por aqui. a previa e o submit precisam
   entender exatamente a mesma coisa: se so o submit tirasse a URL, a previa
   mostraria o link cru como titulo e ainda acusaria "nao entendi o tempo"
   por causa dos digitos do id. o @cliente vem do core: e a mesma
   leitura em todo modulo. */
function readLine(text) {
  const l = readClickup(text);
  const m = parseMentions(l.title);
  const d = readDuration(m.title);
  /* noLink e o texto sem a URL: e sobre ele que a suspeita de tempo mal
     escrito tem que ser avaliada. */
  return { min: d.min, title: d.title, clickup: l.clickup, noLink: m.title, client: m.client };
}

/* o texto tem numero mas nada casou: provavelmente e tempo mal escrito.
   serve so para a previa avisar em vez de criar uma tarefa muda. */
const looksLikeBrokenTime = (text, min) =>
  !min && /\d/.test(text) && !/^\s*\d+\s*$/.test(text);

/* "2026-09-01" -> Date local ao meio-dia: sem hora, o parse de "YYYY-MM-DD"
   e tratado como UTC e volta um dia em fusos negativos */
const dateAtNoon = (day) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};

const dateStamp = (day) =>
  new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" })
    .format(dateAtNoon(day)).replace(/\./g, "").replace(",", " ·").toUpperCase();

/* so o dia da semana, para a faixa: "esta fila e de segunda" */
const weekdayName = (day) =>
  new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(dateAtNoon(day));

/* onde cada tarefa cai dentro do dia, e a partir de qual delas nao da mais tempo.
   tarefa sem estimativa entra pelo palpite: ela desloca o cursor e pode
   disparar o corte como qualquer outra — so aparece marcada como palpite. */
function distribute(doc, open) {
  const b = budget(doc, open);
  const slots = new Map();
  /* a reserva ocupa a frente do que resta: o trabalho comeca depois dela.
     nao e o horario real do almoco — e o espaco que ele tira do dia. */
  let cursor = b.elapsed + b.liveReserve;
  let cut = -1;
  b.open.forEach((t, i) => {
    const cost = costOf(t);
    const available = b.window - cursor;
    if (available <= 0) { if (cut < 0) cut = i; return; }
    const use = Math.min(cost, available);
    const partial = use < cost;
    if (partial && cut < 0) cut = i;
    slots.set(t.id, { from: cursor, min: use, partial, guess: !t.min });
    cursor += use;
  });
  return { b, slots, cut };
}

/* o que ocupa o dia sem ser trabalho seu. escrever "almoco 1h" nao deveria
   virar uma tarefa que voce conclui para ganhar tempo de volta que nunca
   esteve la — entao essas viram reserva, e o prefixo "-" forca qualquer uma. */
const RESERVE_RE = /^(?:-\s*|(?:almo[çc]o|caf[ée]|janta(?:r)?|reuni[ãa]o|call|daily|1:1|dentista|m[ée]dico|academia|deslocamento|transito|tr[âa]nsito)\b)/i;
const isReserve = (title) => RESERVE_RE.test(title.trim());
const stripPrefix = (title) => title.replace(/^-\s*/, "").trim();

const shortTitle = (s) => (s.length > 28 ? s.slice(0, 28) + "…" : s);
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* a tarefa nova no topo da fila, sem tocar no estado: quem chama grava.
   toda tarefa tem duracao — menos a que chega da semana sem uma: ela entra
   "contando o palpite" e pede o numero na propria linha, em vez de ficar de
   fora do dia por um detalhe. */
function withTask(doc, spec) {
  const title = String(spec.title).replace(/\s+/g, " ").trim();
  if (!title || (!spec.min && !spec.allowNoMin)) return null;
  let tasks = doc.tasks, day = doc.day;
  /* escrever numa fila de ontem ja e a decisao de comecar hoje: carimba o dia
     e leva junto o que estava aberto, em vez de misturar em silencio */
  if (isStale(doc)) { tasks = pendingOf(doc); day = today(); }
  const task = normalizeTask({
    id: newId(), title, min: spec.min, done: false, reserved: !!spec.reserved,
    clickup: spec.clickup, client: spec.client, origin: spec.origin
  });
  return { doc: { ...doc, day, tasks: [task, ...tasks] }, id: task.id };
}

/* ---------- a caixa de ideias, vista daqui ----------
   a caixa e a colecao "ideas" do merlin, a mesma de ideas.html: la a ideia
   ganha corpo, estagio e passos; aqui so aparece a ponta — as nao
   arquivadas, as mais recentes primeiro. */
const MAX_IDEAS = 30;
const normalizeIdea = (i) => ({ ...i, title: String(i.title || "").slice(0, 300), stage: i.stage || "seed" });
const liveIdeas = (col) => col.all()
  .filter((i) => i.title && i.stage !== "archived")
  .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
  .slice(0, MAX_IDEAS);

/* ---------- os cartoes de hoje, da semana ---------- */
const WEEKEND = "weekend:";
function todayKey() {
  const t = today();
  const dow = new Date().getDay();
  return (dow === 0 || dow === 6) ? WEEKEND + mondayOf(t) : t;
}

/* icones que nao moram no core por serem exclusivos desta tela */
const LogoIcon = () => (
  <svg viewBox="0 0 472.5 472.5" fill="currentColor"><path d="M236.31,236.23c-3.63,128.42,107.71,238.95,236.22,236.22v-118.11c-64.78,2.88-121-53.42-118.11-118.11h-118.11Z"/><path d="M236.22,0C239.85,128.42,128.52,238.95,0,236.22v-118.11C64.78,120.99,121,64.69,118.11,0h118.11Z"/><path d="M315.07,0h77.61c44.09,0,79.89,35.8,79.89,79.89v77.61h-157.5V0h0Z"/><path d="M79.96,315H.07v78.75h78.75v78.75h78.75v-79.89c0-42.86-34.75-77.61-77.61-77.61Z"/></svg>
);
const ChevronIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
);
const PlusThinIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
);
const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M12 5l7 7-7 7"/></svg>
);

const CHIPS = [15, 30, 60, 120];
const UNDO_DEPTH = 12;


/* ---------- a pagina ----------
   o documento do dia mora num useState e num ref espelho: os handlers que
   se registram uma vez (storage, nuvem, semana, arrasto) leem sempre o ref,
   e assim nunca enxergam um dia velho. tudo que grava passa por commit(),
   que carimba o v, salva no navegador e agenda a subida. o resto do estado
   (aviso, chips, editor da janela, arrasto) e de tela: some ao recarregar. */
function Day() {
  const [doc, setDoc] = useState(load);
  const docRef = useRef(doc);
  const week = useCollection("week");
  const ideasCol = useCollection("ideas", { normalize: normalizeIdea });
  useClients();
  const delegate = useDelegate();               /* "da pra fazer com Claude?" */
  const [, setTick] = useState(0);              /* o relogio: redesenha a cada 30s */
  const [toast, setToast] = useState(null);     /* texto do aviso | null */
  const [windowOpen, setWindowOpen] = useState(false);
  const [storageBroken, setStorageBroken] = useState(false);
  const [text, setText] = useState("");         /* o campo do composer */
  const [pending, setPending] = useState(null); /* o pedagio de duracao aberto */
  const [leaving, setLeaving] = useState(null); /* id da tarefa saindo (animacao) */
  const [dragging, setDragging] = useState(null);
  const [dragOrder, setDragOrder] = useState(null);
  const undoStack = useRef([]);
  const touchedCards = useRef([]);               /* cartoes da semana que o passo atual desvinculou */
  const toastTimer = useRef(null);
  const serverV = useRef(0);                    /* maior carimbo que ja vi vindo de la */
  const syncedV = useRef(0);                    /* carimbo deste dia que a nuvem ja tem */
  const uploadTimer = useRef(null);
  const drag = useRef(null);
  const dragOrderRef = useRef(null);
  const listRef = useRef(null);
  const fieldRef = useRef(null);
  const trackRef = useRef(null);
  const focusAfter = useRef(null);

  /* ---------- gravar ----------
     o navegador continua sendo a fonte de verdade da sessao: a nuvem e
     camada de sincronia, nao substituto. se ela falhar, o dia nao se perde. */
  const persist = (next) => {
    try { localStorage.setItem(DAY_KEY, JSON.stringify(next)); }
    catch (e) { setStorageBroken(true); }
  };
  const commit = (next) => {
    next = { ...next, v: Date.now() };
    docRef.current = next;
    persist(next);
    scheduleUpload();
    setDoc(next);
  };
  /* troca sem carimbar nem subir: e o que veio de fora (outra aba, nuvem) */
  const replace = (next) => { docRef.current = next; setDoc(next); };

  /* ---------- desfazer ----------
     uma pilha, e nao uma variavel unica: apagar duas coisas seguidas deixava
     so a ultima recuperavel. cada acao volta sozinha, na ordem. o retrato
     guarda tudo que uma acao desfazivel alcanca: a faixa de ontem mexe no
     dia, o editor troca a janela, e puxar uma ideia tira ela da caixa. */
  const showToast = (label) => {
    setToast(label);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(closeToast, reducedMotion() ? 9000 : 6000);
  };
  const closeToast = () => {
    setToast(null);
    undoStack.current = [];
    clearTimeout(toastTimer.current);
  };
  const withUndo = (label, action) => {
    const d = docRef.current;
    const before = {
      tasks: d.tasks.map((t) => ({ ...t })),
      day: d.day, start: d.start, end: d.end,
      ideas: ideasCol.all().map((i) => ({ ...i })),
      label
    };
    /* so os cartoes que a acao desvinculou entram no passo — a semana inteira
       em cada desfazer seria peso a toa. concluir tambem toca na semana e de
       proposito nao entra aqui: fechar o cartao e registro, nao espelho. */
    touchedCards.current = [];
    action();
    before.cards = touchedCards.current;
    undoStack.current.push(before);
    if (undoStack.current.length > UNDO_DEPTH) undoStack.current.shift();
    showToast(label);
  };
  const undo = () => {
    const stack = undoStack.current;
    if (!stack.length) return;
    const step = stack.pop();
    commit({ ...docRef.current, tasks: step.tasks, day: step.day, start: step.start, end: step.end });
    restoreIdeas(step.ideas);
    /* a tarefa voltou para a fila, entao o cartao volta a apontar para ela:
       sem isto o cartao ficaria puxavel e o dia ganharia a mesma tarefa duas
       vezes na proxima sincronizacao */
    (step.cards || []).forEach((c) => { if (week.has(c.id)) week.save({ ...c, updatedAt: Date.now() }); });
    /* ainda ha passos atras: o aviso continua, apontando para o proximo */
    if (stack.length) showToast(stack[stack.length - 1].label);
    else closeToast();
  };

  /* ---------- acoes na fila ---------- */
  const findIndex = (id) => docRef.current.tasks.findIndex((t) => t.id === id);

  /* titulo e duracao chegam ja resolvidos: quem decide o tempo e o composer,
     que nao deixa nascer tarefa sem ele */
  const create = (spec) => {
    const r = withTask(docRef.current, spec);
    if (!r) return false;
    commit(r.doc);
    return r.id;
  };

  const complete = (id) => {
    const i = findIndex(id);
    if (i < 0 || docRef.current.tasks[i].done) return;
    const t = docRef.current.tasks[i];
    const apply = () => {
      /* re-busca dentro da acao: entre capturar e aplicar, outra aba pode
         ter gravado e mexido na lista */
      const d = docRef.current;
      const j = d.tasks.findIndex((x) => x.id === id);
      if (j < 0) return;
      const done = { ...d.tasks[j], done: true };
      /* veio da semana: o cartao fecha junto. desfazer a conclusao aqui nao
         reabre o cartao — e um registro, nao um espelho, e reabrir na semana
         e um clique. */
      if (done.origin && done.origin.type === "week") markWeek(done.origin.id);
      const tasks = d.tasks.slice();
      tasks.splice(j, 1);
      tasks.push(done);
      commit({ ...d, tasks });
      flashReceipt();
    };
    const label = t.min ? "+" + longFmt(t.min) + " de volta pro dia" : "feita.";
    if (!reducedMotion()) {
      setLeaving(id);
      setTimeout(() => { setLeaving(null); withUndo(label, apply); }, 140);
    } else withUndo(label, apply);
  };

  /* voce ve o dia devolvendo o tempo: e o unico recibo que importa */
  const flashReceipt = () => {
    if (reducedMotion()) return;
    requestAnimationFrame(() => {
      const free = trackRef.current && trackRef.current.querySelector(".free");
      if (!free) return;
      free.classList.add("receipt");
      setTimeout(() => free.classList.remove("receipt"), 180);
    });
  };

  const reopen = (id) => {
    const d = docRef.current;
    const i = d.tasks.findIndex((t) => t.id === id);
    if (i < 0) return;
    const tasks = d.tasks.slice();
    const [t] = tasks.splice(i, 1);
    tasks.unshift({ ...t, done: false });
    commit({ ...d, tasks });
  };

  const remove = (id) => {
    const i = findIndex(id);
    if (i < 0) return;
    const { title, origin } = docRef.current.tasks[i];
    withUndo("apaguei “" + shortTitle(title) + "”", () => {
      const d = docRef.current;
      if (!d.tasks.some((t) => t.id === id)) return;
      commit({ ...d, tasks: d.tasks.filter((t) => t.id !== id) });
      if (origin && origin.type === "week") unlinkWeek(origin.id, id);
    });
  };

  const rename = (id, value) => {
    const d = docRef.current;
    const t = d.tasks.find((x) => x.id === id);
    if (!t) return;
    const clean = value.replace(/\s+/g, " ").trim();
    if (!clean) { remove(id); return; }
    if (clean === t.title) return;
    commit({ ...d, tasks: d.tasks.map((x) => (x.id === id ? { ...x, title: clean.slice(0, 300) } : x)) });
  };

  const reorder = (fromId, toId) => {
    const d = docRef.current;
    const from = d.tasks.findIndex((t) => t.id === fromId);
    const to = d.tasks.findIndex((t) => t.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const tasks = d.tasks.slice();
    const [t] = tasks.splice(from, 1);
    tasks.splice(to, 0, t);
    commit({ ...d, tasks });
  };

  /* `part` diz o que recebe o foco depois: a linha (Alt+setas) ou a alca (setas) */
  const move = (id, step, part) => {
    const open = pendingOf(docRef.current);
    const pos = open.findIndex((t) => t.id === id);
    const dest = pos + step;
    if (pos < 0 || dest < 0 || dest >= open.length) return;
    reorder(id, open[dest].id);
    focusAfter.current = '.task[data-id="' + cssEscape(id) + '"]' + (part === "grip" ? " .grip" : "");
  };

  const setDuration = (id, min) => {
    const t = docRef.current.tasks.find((x) => x.id === id);
    if (!t) return;
    withUndo("duração de “" + shortTitle(t.title) + "” era " + fmt(t.min), () => {
      const d = docRef.current;
      commit({ ...d, tasks: d.tasks.map((x) => (x.id === id ? { ...x, min } : x)) });
    });
  };

  /* uma ordem nova para a fila: o que nao esta na lista (feitas, reservas)
     continua atras, na ordem em que estava */
  const applyOrder = (ids) => {
    const d = docRef.current;
    const byId = new Map(d.tasks.map((t) => [t.id, t]));
    const seen = new Set(ids);
    commit({ ...d, tasks: ids.map((id) => byId.get(id)).filter(Boolean).concat(d.tasks.filter((t) => !seen.has(t.id))) });
  };

  const toggleDoneOpen = () => commit({ ...docRef.current, doneOpen: !docRef.current.doneOpen });

  const clearDone = () => {
    const n = doneOf(docRef.current).length;
    if (!n) return;
    withUndo("removi " + n + (n === 1 ? " concluída" : " concluídas"), () => {
      commit({ ...docRef.current, tasks: pendingOf(docRef.current) });
    });
  };

  /* ---------- a fila de outro dia ----------
     trazer: as abertas passam a ser a fila de hoje, na mesma ordem. as
     concluidas de ontem saem — elas sao registro daquele dia, nao deste.
     fechar: o dia anterior acaba como ficou, aberto e tudo. comeca limpo. */
  const bringYesterday = () => {
    if (!isStale(docRef.current)) return;
    const n = pendingOf(docRef.current).length;
    withUndo(n ? "trouxe " + n + (n === 1 ? " tarefa" : " tarefas") + " pra hoje" : "dia começado", () => {
      commit({ ...docRef.current, tasks: pendingOf(docRef.current), day: today() });
    });
  };
  const closeYesterday = () => {
    if (!isStale(docRef.current)) return;
    const n = pendingOf(docRef.current).length;
    withUndo(n ? "fechei o dia com " + n + (n === 1 ? " aberta" : " abertas") : "dia fechado", () => {
      commit({ ...docRef.current, tasks: [], day: today() });
    });
  };

  /* ---------- editor do dia ---------- */
  const closeWindow = () => {
    setWindowOpen(false);
    const b = document.getElementById("window");
    if (b) b.focus();
  };
  const saveWindow = (startText, endText) => {
    const read = (v) => { const p = /^(\d{1,2}):(\d{2})$/.exec(v || ""); return p ? (+p[1]) * 60 + (+p[2]) : null; };
    const s = read(startText), e = read(endText);
    if (s !== null && e !== null && e > s) commit({ ...docRef.current, start: s, end: e });
    closeWindow();
  };

  /* ---------- composer ----------
     toda tarefa tem duracao. quando o texto nao traz uma, o Enter nao cria:
     ele pergunta. a tarefa so existe depois que o tempo dela existe. */
  const submitLine = (e) => {
    e.preventDefault();
    const raw = text.replace(/\s+/g, " ").trim();
    if (!raw) return;
    const { min, title, clickup, client } = readLine(text);
    const name = title || raw;
    const reserved = isReserve(name);
    if (min) { createAndClose({ title: stripPrefix(name), min, reserved, clickup, client, ideaId: null }); return; }
    /* o link e o @ lidos do campo sobrevivem ao pedagio: a tarefa so nasce
       depois dos chips, e a URL ja saiu do campo. digitar no campo e uma
       intencao nova: uma ideia que esperava duracao nao tem a ver com isso. */
    setPending({ title: stripPrefix(name), reserved, clickup, client, ideaId: null });
  };

  const createAndClose = (spec) => {
    /* promocao de ideia: sair da caixa e entrar na fila sao o mesmo gesto,
       entao um desfazer so devolve os dois. criar tarefa do zero continua sem
       desfazer — o que ganha desfazer aqui e a ideia ter sumido. a ideia traz
       o cliente dela, se o @ nao disse outra coisa. */
    const idea = spec.ideaId ? ideasCol.get(spec.ideaId) : null;
    const client = spec.client || (idea && idea.client) || "";
    const task = { title: spec.title, min: spec.min, reserved: spec.reserved, clickup: spec.clickup, client };
    if (idea) {
      withUndo("puxei “" + shortTitle(spec.title) + "” pro dia", () => {
        create(task);
        ideasCol.remove(idea.id);
      });
    } else create(task);
    setText("");
    setPending(null);
    if (fieldRef.current) fieldRef.current.focus();
  };

  const pickChip = (min) => { if (pending) createAndClose({ ...pending, min }); };
  /* o chip "outro": pergunta um tempo livre sem sair do fluxo */
  const pickOther = () => {
    if (!pending) return;
    const r = prompt("Quanto tempo leva “" + pending.title + "”? (ex: 45m, 1h30)", "");
    if (r === null) return;
    const min = readDuration(" " + r.trim() + " ").min;
    if (min) createAndClose({ ...pending, min });
  };
  const closeChips = () => {
    setPending(null);
    if (fieldRef.current) fieldRef.current.focus();
  };

  /* ---------- caixa de ideias ----------
     o que ainda nao e tarefa. entra sem duracao de proposito: ideia nao
     ocupa minuto nenhum, e por isso nao aparece na chamada, no trilho nem na
     conta. virar tarefa passa pelo mesmo pedagio de duracao do composer — e
     ai, sim, ela custa espaco como qualquer outra. */
  const ideas = liveIdeas(ideasCol);
  const createIdea = (title, extra) => {
    const clean = String(title).replace(/\s+/g, " ").trim();
    if (!clean) return false;
    const now = Date.now();
    ideasCol.save({
      id: newId(), title: clean.slice(0, 300), body: "", stage: "seed",
      client: (extra && extra.client) || "",
      steps: [], outputs: [], history: [], createdAt: now, updatedAt: now
    });
    return true;
  };
  const removeIdea = (id) => {
    const i = ideasCol.get(id);
    if (!i) return;
    withUndo("apaguei “" + shortTitle(i.title) + "”", () => { ideasCol.remove(id); });
  };
  /* ideia nao tem duracao, e tarefa sem duracao nao existe: puxar abre o
     mesmo pedagio do composer. a ideia so sai da caixa quando o tempo dela
     for respondido — desistir dos chips deixa tudo como estava. */
  const pullIdea = (id) => {
    const i = ideasCol.get(id);
    if (!i) return;
    setPending({ title: i.title, reserved: isReserve(i.title), clickup: "", client: "", ideaId: id });
  };
  /* o desfazer guarda um retrato da caixa; voltar e gravar de novo o que
     sumiu e apagar o que nasceu depois — a colecao carimba tudo como novo. */
  const restoreIdeas = (snapshot) => {
    const now = new Set(ideasCol.all().map((i) => i.id));
    const before = new Set(snapshot.map((i) => i.id));
    snapshot.forEach((i) => { if (!now.has(i.id)) ideasCol.save(i); });
    ideasCol.all().forEach((i) => { if (!before.has(i.id)) ideasCol.remove(i.id); });
  };

  /* ---------- caixa de entrada ----------
     os outros modulos nao tocam no documento do dia: eles deixam um bilhete
     em merlin:inbox e o dia recolhe. com duracao vira tarefa na hora; sem
     duracao cai na caixa de ideias, onde paga o pedagio como qualquer outra. */
  const emptyInbox = () => {
    const list = readInbox();
    if (!list.length) return;
    writeInbox([]);
    let d = docRef.current, tasks = 0, newIdeas = 0;
    list.forEach((it) => {
      if (!it || !it.title) return;
      const title = String(it.title);
      if (it.min) {
        /* a origem viaja junto: e ela que faz concluir a tarefa fechar o
           cartao da semana de onde ela veio */
        const r = withTask(d, { title, min: it.min, reserved: isReserve(title), client: it.client, origin: it.origin });
        if (r) { d = r.doc; tasks++; }
      } else if (createIdea(title, it)) newIdeas++;
    });
    if (tasks) commit(d);
    const parts = [];
    if (tasks) parts.push(tasks + (tasks === 1 ? " tarefa" : " tarefas") + " na fila");
    if (newIdeas) parts.push(newIdeas + (newIdeas === 1 ? " ideia" : " ideias") + " na caixa");
    if (parts.length) showToast("chegou de outro módulo: " + parts.join(" e "));
  };

  /* ---------- os cartoes de hoje, da semana ----------
     decisao do arthur: o que esta na coluna de hoje na semana entra na fila
     sozinho ao abrir o dia. e a unica excecao ao "nada entra sozinho", e ela
     vale porque o cartao ja foi uma decisao dele — colocar algo em "seg 7" e
     dizer que aquilo e de segunda. o cartao ganha inDay com o id da tarefa,
     entao nao entra duas vezes; concluir aqui fecha o cartao la. */
  const pullFromWeek = () => {
    const key = todayKey();
    const cards = week.all()
      .filter((c) => c.day === key && !c.done && !c.inDay && c.title)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    if (!cards.length) return;
    let d = docRef.current;
    const updates = [];
    /* na ordem inversa porque a tarefa nova entra no topo: o primeiro cartao
       da coluna termina no topo da fila */
    cards.slice().reverse().forEach((c) => {
      const title = String(c.title);
      const r = withTask(d, {
        title, min: +c.min || 0, reserved: isReserve(title), client: c.client,
        origin: { type: "week", id: c.id }, allowNoMin: true
      });
      if (r) { d = r.doc; updates.push({ ...c, inDay: r.id }); }
    });
    if (!updates.length) return;
    commit(d);
    week.saveMany(updates);
    showToast(updates.length === 1 ? "1 cartão de hoje entrou na fila" : updates.length + " cartões de hoje entraram na fila");
  };
  /* ---------- o dia tambem escuta a semana ----------
     ate aqui o vinculo so valia num sentido: concluir no dia fechava o
     cartao, mas fechar o cartao na semana deixava a tarefa aberta na fila —
     e as duas telas passavam a discordar sobre a mesma coisa. o vinculo e um
     so, entao ele vale nos dois lados. o que nao volta e a conclusao: cartao
     reaberto na semana nao ressuscita tarefa concluida, porque concluir e
     registro, nao espelho. */
  const syncFromWeek = () => {
    const d = docRef.current;
    const closing = new Set();
    d.tasks.forEach((t) => {
      if (t.done || !t.origin || t.origin.type !== "week") return;
      const c = week.get(t.origin.id);
      if (c && c.done) closing.add(t.id);
    });
    if (closing.size) {
      /* concluida vai para o fim da fila, como em qualquer conclusao daqui */
      const rest = d.tasks.filter((t) => !closing.has(t.id));
      const done = d.tasks.filter((t) => closing.has(t.id)).map((t) => ({ ...t, done: true }));
      commit({ ...d, tasks: rest.concat(done) });
      showToast(closing.size === 1
        ? "1 tarefa fechou junto com o cartão da semana"
        : closing.size + " tarefas fecharam junto com os cartões da semana");
    }
    /* o outro lado do mesmo fio. `inDay` e uma afirmacao — "isto esta na fila
       de hoje" — e so o dia sabe se ela ainda e verdade, entao e o dia quem a
       escreve e quem a apaga. um cartao apontando para tarefa que ja foi
       embora fica com o selo "no dia" para sempre e sem o gesto de puxar; um
       cartao sem selo cuja tarefa esta viva deixa puxar de novo e o dia ganha
       a mesma coisa duas vezes. as duas se corrigem na mesma passada. */
    const now = docRef.current;
    const live = new Map();
    now.tasks.forEach((t) => {
      if (t.done || !t.origin || t.origin.type !== "week") return;
      live.set(t.origin.id, t.id);
    });
    const fixes = week.all()
      .filter((c) => !c.done && c.inDay !== (live.get(c.id) || ""))
      .map((c) => ({ ...c, inDay: live.get(c.id) || "", updatedAt: Date.now() }));
    if (fixes.length) week.saveMany(fixes);
  };

  const markWeek = (cardId) => {
    const c = week.get(cardId);
    if (c && !c.done) week.save({ ...c, done: true, updatedAt: Date.now() });
  };
  /* o contrario: a tarefa saiu da fila sem ser concluida, entao o cartao volta
     a poder ser puxado. quem escreveu `inDay` foi o dia, e e o dia quem apaga
     — sem isto o cartao fica para sempre com o selo "no dia" apontando para
     uma tarefa que nao existe mais, e o gesto de puxar nunca mais aparece. */
  const unlinkWeek = (cardId, taskId) => {
    const c = week.get(cardId);
    if (!c || c.inDay !== taskId) return;
    touchedCards.current.push({ ...c });
    week.save({ ...c, inDay: "", updatedAt: Date.now() });
  };

  /* ---------- matriz: aplicar e uma reordenacao em lote ----------
     ao contrario do arrasto da fila, que move uma linha por vez e voce ve
     acontecer, aqui a fila inteira muda de uma vez — entao passa pelo desfazer. */
  const applyMatrix = (ids) => withUndo("apliquei a ordem da matriz", () => applyOrder(ids));

  /* ---------- a nuvem ----------
     o mesmo dia em qualquer navegador. sobe o dia atual; o servidor recusa
     se ele estiver na frente — e ai quem adota e o cliente, em vez dos dois
     discordarem em silencio. */
  const uploadDay = async () => {
    if (!cloud.signedIn) return;
    const d = docRef.current;
    /* dia sem carimbo e dia que ninguem tocou: nao ha o que guardar, e o
       servidor recusaria com 400 ("documento sem carimbo"). */
    if (!d.v) return;
    /* a nuvem ja tem exatamente este documento: subir de novo so renderia um
       409 de "versao igual", que o cliente contaria como novidade. abrir o dia
       sem mexer em nada nao e uma sincronizacao — e o silencio. */
    if (d.v === syncedV.current) { cloud.setStatus("synced"); return; }
    try {
      const r = await api("/days", { method: "POST", body: JSON.stringify({ day: d.day, v: d.v, doc: d }) });
      /* o marcador so avanca no download: avancar com o carimbo daqui faria
         o proximo `since` pular um dia que o outro aparelho gravou no meio */
      if (r.ok) { syncedV.current = d.v; cloud.setStatus("synced"); return; }
      if (r.status === 409 && r.body.server) {
        /* recusa por carimbo igual e o mesmo dia dos dois lados, nao um dia
           que veio de fora: nada a adotar e nada a anunciar. */
        if (r.body.server.v > d.v) adoptFromCloud(r.body.server);
        else { syncedV.current = r.body.server.v; cloud.setStatus("synced"); }
        return;
      }
      if (r.status === 401) { cloud.signedIn = false; cloud.setStatus("local"); cloud.emit(); return; }
      cloud.setStatus("error");
    } catch (e) {
      /* sem rede: o dia esta salvo aqui e sobe na proxima */
      cloud.setStatus("offline");
    }
  };

  /* baixa o que mudou desde a ultima vez. so troca a tela se o dia de la for
     o mesmo dia daqui e estiver na frente — dia antigo do servidor nao
     sequestra a fila de hoje. */
  const downloadDays = async () => {
    if (!cloud.signedIn) return;
    try {
      const r = await api("/days?since=" + serverV.current, { method: "GET" });
      if (r.status === 401) { cloud.signedIn = false; cloud.setStatus("local"); cloud.emit(); return; }
      if (!r.ok) { cloud.setStatus("error"); return; }
      const days = r.body.days || [];
      days.forEach((d) => { serverV.current = Math.max(serverV.current, d.v); });
      const mine = days.filter((d) => d.day === docRef.current.day).sort((a, b) => b.v - a.v)[0];
      if (mine && mine.v > docRef.current.v) adoptFromCloud(mine);
      else {
        if (mine) syncedV.current = mine.v;
        cloud.setStatus("synced");
      }
    } catch (e) { cloud.setStatus("offline"); }
  };

  /* troca o documento inteiro pelo da nuvem, que esta na frente. nao e merge
     por tarefa: vale porque quem escreve e uma pessoa so, e quem gravou por
     ultimo teve o dia mais recente. */
  const adoptFromCloud = (server) => {
    const next = loadFrom(server.doc);
    serverV.current = Math.max(serverV.current, server.v);
    syncedV.current = server.v;
    try { localStorage.setItem(DAY_KEY, JSON.stringify(next)); } catch (e) {}
    replace(next);
    cloud.setStatus("synced");
    showToast("atualizei com o que veio do outro aparelho");
  };

  /* debounce: digitar tres tarefas seguidas e uma subida, nao tres */
  const scheduleUpload = () => {
    if (!cloud.signedIn) return;
    clearTimeout(uploadTimer.current);
    uploadTimer.current = setTimeout(uploadDay, 1500);
  };

  /* ---------- arrastar para reordenar ----------
     pointer events: o drag do HTML5 nao dispara em toque, e este app abre no
     celular. a alca captura o ponteiro; enquanto dura o arrasto a fila e
     desenhada a partir de dragOrder, e ao soltar essa ordem vira o estado. os
     listeners vao para o documento, para o arrasto nao morrer se o ponteiro
     sair da lista. */
  const dragStart = (e, id) => {
    if (e.button > 0) return;
    e.preventDefault();
    const li = e.currentTarget.closest(".task");
    if (!li) return;
    drag.current = { id, y: e.clientY, li };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* toque antigo */ }
    dragOrderRef.current = pendingOf(docRef.current).map((t) => t.id);
    setDragOrder(dragOrderRef.current);
    setDragging(id);
  };
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const d = drag.current;
      if (!d) return;
      const li = d.li;
      li.style.transform = "translateY(" + (e.clientY - d.y) + "px)";
      const rows = listRef.current ? [...listRef.current.querySelectorAll(".task")] : [];
      const target = rows.find((n) => {
        if (n === li) return false;
        const r = n.getBoundingClientRect();
        return e.clientY >= r.top && e.clientY <= r.bottom;
      });
      if (!target) return;
      const r = target.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      const order = dragOrderRef.current;
      if (!order) return;
      const o = order.filter((x) => x !== d.id);
      const i = o.indexOf(target.dataset.id);
      if (i < 0) return;
      o.splice(after ? i + 1 : i, 0, d.id);
      dragOrderRef.current = o;
      setDragOrder(o);
      d.y = e.clientY;
      li.style.transform = "translateY(0px)";
    };
    const onUp = () => {
      const d = drag.current;
      if (!d) return;
      d.li.style.transform = "";
      drag.current = null;
      const order = dragOrderRef.current;
      dragOrderRef.current = null;
      setDragging(null);
      setDragOrder(null);
      if (order) applyOrder(order);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, [dragging]);

  /* ---------- efeitos ---------- */

  /* ao abrir: recolhe a caixa de entrada e os cartoes de hoje. uma vez;
     depois so por evento. */
  useEffect(() => { emptyInbox(); pullFromWeek(); syncFromWeek(); }, []);

  /* no dia o merlin só responde sobre UMA tarefa: qual é a pergunta de quem
     está olhando a fila. por isso ele não roda daqui — ele diz onde está o
     botão que escolhe a tarefa. */
  useEffect(() => setMerlinAsks([
    { id: "delegate", label: "dá pra fazer com o Claude?", where: "na faísca de cada linha da fila — ele lê a tarefa e diz o que daria para montar" }
  ]), []);

  /* outra aba, ou a nuvem, mexeu na semana: cartao novo de hoje entra, e o
     que fechou la fecha aqui */
  useEffect(() => week.onChange((origin) => {
    if (origin === "local") return;
    pullFromWeek();
    syncFromWeek();
  }), [week]);

  /* outra aba gravou o dia: recarrega em vez de sobrescrever o trabalho
     dela. o desfazer pendente virou lixo: restauraria um retrato anterior ao
     que a outra aba acabou de gravar. */
  useEffect(() => {
    const f = (e) => {
      if (e.key === DAY_KEY) {
        replace(load());
        if (undoStack.current.length) closeToast();
      } else if (e.key === "merlin:inbox") emptyInbox();
    };
    window.addEventListener("storage", f);
    return () => window.removeEventListener("storage", f);
  }, []);

  /* a sessao e do core (barra, dialogo de entrar, sair). o dia so precisa
     saber quando ela muda: entrou, baixa antes de subir — o outro aparelho
     pode ter o dia mais novo; saiu, esquece o carimbo do servidor. voltar
     pra aba e quando o outro aparelho pode ter gravado. */
  useEffect(() => {
    const off = cloud.onChange(async () => {
      if (cloud.signedIn) { await downloadDays(); await uploadDay(); }
      else serverV.current = 0;
    });
    const vis = () => {
      if (!cloud.signedIn) return;
      if (document.hidden) { clearTimeout(uploadTimer.current); uploadDay(); }
      else downloadDays();
    };
    document.addEventListener("visibilitychange", vis);
    /* a sessao pode ter sido retomada antes de a tela montar */
    if (cloud.signedIn) downloadDays().then(uploadDay);
    return () => { off(); document.removeEventListener("visibilitychange", vis); };
  }, []);

  /* ---------- o dia encolhendo ----------
     o tick nao tem transicao: tempo passando e um fato seco, nao um efeito.
     virar a meia-noite com a aba aberta muda a fila de categoria — e o
     redesenho e inteiro de qualquer jeito. */
  useEffect(() => {
    const tick = () => setTick((n) => n + 1);
    const id = setInterval(tick, 30000);
    const vis = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, []);

  /* ---------- teclado global ---------- */
  useKeydown((e) => {
    const el = document.activeElement;
    if (e.key === "/" && !isTyping()) { e.preventDefault(); if (fieldRef.current) fieldRef.current.focus(); }
    else if (e.key === "Escape") {
      if (el === fieldRef.current) el.blur();
      else if (toast != null) closeToast();
    }
  });

  /* quem pediu foco para depois do redesenho (mover uma linha) recebe aqui,
     antes da pintura */
  useLayoutEffect(() => {
    const sel = focusAfter.current;
    if (!sel) return;
    focusAfter.current = null;
    const el = document.querySelector(sel);
    if (el) el.focus();
  });

  /* ---------- a tela ---------- */
  const stale = isStale(doc);
  const byId = new Map(doc.tasks.map((t) => [t.id, t]));
  const open = dragOrder ? dragOrder.map((id) => byId.get(id)).filter(Boolean) : pendingOf(doc);
  const { b, slots, cut } = distribute(doc, open);
  const done = doneOf(doc);
  const reserves = reservesOf(doc);
  /* a pergunta do merlin sobre uma tarefa da fila: ele so responde, e o que
     precisar ser montado volta pela caixa de entrada como qualquer outra coisa */
  const askDelegate = (t) => delegate.ask({
    id: t.id, title: t.title, min: t.min, client: t.client,
    where: "a fila de hoje", origin: { type: "task", id: t.id }
  });
  const rowActions = { complete, remove, rename, move, setDuration, dragStart, delegate: askDelegate, thinking: delegate.busy };

  /* uma lista plana com chave por linha: e assim que a linha arrastada
     sobrevive ao redesenho em vez de ser recriada */
  const rows = [];
  open.forEach((t, i) => {
    /* a régua: daqui pra baixo o dia nao alcanca */
    if (cut >= 0 && i === cut) rows.push(<li key="cut" className="cut"><span className="t-mono">daqui não dá tempo hoje</span></li>);
    rows.push(<TaskRow key={t.id} t={t} start={doc.start} slot={slots.get(t.id)} fits={!(cut >= 0 && i >= cut)}
      dragging={dragging === t.id} leaving={leaving === t.id} actions={rowActions} />);
  });

  return (
    <>
      <main className="device">
        <div className="top">
          <span className="t-mono" id="date">{dateStamp(doc.day)}</span>
          <button className="window" id="window" type="button" title="Mudar o começo e o fim do seu dia" onClick={() => setWindowOpen(true)}>{clock(doc.start) + " → " + clock(doc.end)}</button>
        </div>

        <div className="scroll">
          <div className="logo-tile" aria-hidden="true"><LogoIcon /></div>
          <Headline doc={doc} b={b} done={done} />
          <Track b={b} slots={slots} trackRef={trackRef} />
          {windowOpen && <WindowEditor doc={doc} onSave={saveWindow} onClose={closeWindow} />}
          {stale && <StaleStrip doc={doc} onBring={bringYesterday} onClose={closeYesterday} />}
          {reserves.length > 0 && <Reserves list={reserves} onRemove={remove} />}
          {open.length > 0 && <p className="section-label"><span className="t-mono">{open.length + (open.length === 1 ? " coisa na fila" : " coisas na fila")}</span></p>}
          <ul className="queue" ref={listRef}>{rows}</ul>
          {!open.length && <EmptyState doc={doc} b={b} />}
          {done.length > 0 && <DoneList doc={doc} done={done} onToggle={toggleDoneOpen} onClear={clearDone} onReopen={reopen} />}
        </div>

        <Composer b={b} text={text} setText={setText} pending={pending} fieldRef={fieldRef} storageBroken={storageBroken}
          onSubmit={submitLine} onPick={pickChip} onOther={pickOther} onEscape={closeChips} />

        {toast != null && (
          <div className="toast" role="status" aria-live="polite">
            <span>{toast}</span>
            <button type="button" onClick={undo}>desfazer</button>
          </div>
        )}
      </main>

      <div className="side" id="side-left">
        <IdeasBox ideas={ideas} onCreate={createIdea} onPull={pullIdea} onRemove={removeIdea} />
      </div>
      <div className="side" id="side-right">
        <Matrix doc={doc} open={pendingOf(doc)} onApply={applyMatrix} />
      </div>

      {/* o que ha para montar cai no campo do dia, sem duracao: o pedagio e
          perguntado ali, como em qualquer coisa que entra na fila */}
      {delegate.answer && (
        <DelegateDialog answer={delegate.answer} onClose={delegate.close}
          onBuild={(setup) => { setText(setup); if (fieldRef.current) fieldRef.current.focus(); }} />
      )}
    </>
  );
}


const cssEscape = (id) => (window.CSS && CSS.escape ? CSS.escape(id) : id);

/* ---------- chamada ----------
   o carimbo e a data DA FILA, nao a de hoje: enquanto o estado for de ontem,
   dizer "hoje" aqui seria afirmar algo falso sobre o que esta na tela */
function Headline({ doc, b, done }) {
  const stale = isStale(doc);
  const n = done.length;
  let tone = "normal", l1, measure, rest, context;
  if (!b.open.length) {
    l1 = n ? "Tudo fechado." : "Dia limpo.";
    measure = fmt(Math.max(0, b.remaining));
    rest = b.overtime ? "— o dia já acabou" : (n ? "ainda de dia" : "pela frente");
    if (n) {
      const total = done.reduce((s, t) => s + t.min, 0);
      /* enquanto a fila for de ontem, "N fechadas" e trabalho de ontem:
         dizer de quando sem tirar o credito do que foi feito */
      context = n + (n === 1 ? " fechada" : " fechadas") +
        (total ? " · " + longFmt(total) + " de trabalho" : "") +
        (stale ? " — de " + weekdayName(doc.day) : "");
    } else context = "o dia acaba às " + clock(doc.end) + ".";
  } else if (b.slack >= 0) {
    l1 = "Ainda cabem";
    /* "~" so aqui: a sobra e o unico numero que o palpite pode INFLAR.
       no estouro ele e piso — palpite so pode aumentar o debito, nunca reduzi-lo. */
    measure = (b.unestimated ? "~" : "") + fmt(b.slack);
    rest = "no seu dia";
    context = longFmt(b.committed) + " na fila" +
      (b.liveReserve ? " · " + longFmt(b.liveReserve) + " reservado" : "") +
      " · o dia acaba às " + clock(doc.end);
  } else {
    /* passar das 19:00 qualifica o estouro, nao substitui a pergunta: o
       numero nao pode encolher justamente quando cortar algo e mais urgente */
    tone = "overflow";
    l1 = "Não cabe.";
    measure = fmt(b.overflow);
    rest = "além do que resta";
    context = b.overtime
      ? "passou das " + clock(doc.end) + " · " + longFmt(b.committed) + " ainda na fila. Algo tem que sair."
      : longFmt(b.committed) + " na fila para " + longFmt(b.remaining) + " de dia. Algo tem que sair.";
  }
  /* nao ha vermelho neste sistema: quando nao cabe, o verde simplesmente some */
  return (
    <>
      <h1 className="headline" data-tone={tone}>
        <span className="headline__l1">{l1}</span>
        <span className="headline__l2"><span className="measure">{measure}</span> <span>{rest}</span></span>
      </h1>
      <p className="context">{context}</p>
    </>
  );
}

/* ---------- trilho do dia ----------
   tudo e % da mesma janela: sem px fixo, sem gap, sem min-width — e por isso
   que o desenho nao pode divergir da conta */
function Track({ b, slots, trackRef }) {
  const width = (min) => ({ flex: "0 0 " + ((min / b.window) * 100) + "%", minWidth: "0" });
  const note = b.unestimated
    ? b.unestimated + (b.unestimated === 1 ? " sem duração · conta " : " sem duração · contam ") +
      fmt(GUESS) + (b.unestimated === 1 ? "" : " cada")
    : "";
  return (
    <>
      <div className="track" ref={trackRef} aria-hidden="true">
        {b.elapsed > 0 && <div key="spent" className="band spent" style={width(b.elapsed)}></div>}
        {b.liveReserve > 0 && <div key="reserved" className="band reserved" style={width(b.liveReserve)} title={"reservado · " + longFmt(b.liveReserve)}></div>}
        {b.open.map((t) => {
          const s = slots.get(t.id);
          if (!s) return null;
          return <div key={t.id} className={"band slot" + (s.guess ? " guess" : "")} style={width(s.min)} data-id={t.id}
            title={t.title + " · " + (s.guess ? "palpite de " + fmt(GUESS) : fmt(t.min))}></div>;
        })}
        {b.committed < b.remaining && <div key="free" className="band free"></div>}
      </div>
      {b.overflow > 0 && <div className="overflow" aria-hidden="true" style={{ width: Math.min(100, (b.overflow / b.window) * 100) + "%" }}></div>}
      <span className="note t-mono">{note}</span>
    </>
  );
}

/* ---------- editor do dia ---------- */
function WindowEditor({ doc, onSave, onClose }) {
  const startRef = useRef(null);
  const [start, setStart] = useState(clock(doc.start));
  const [end, setEnd] = useState(clock(doc.end));
  useLayoutEffect(() => { startRef.current.focus(); }, []);
  return (
    <div className="window-editor" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <label>de <input ref={startRef} type="time" id="window-start" step="300" value={start} onChange={(e) => setStart(e.currentTarget.value)} /></label>
      <label>até <input type="time" id="window-end" step="300" value={end} onChange={(e) => setEnd(e.currentTarget.value)} /></label>
      <button type="button" id="window-save" onClick={() => onSave(start, end)}>salvar</button>
    </div>
  );
}

/* ---------- a fila e de outro dia ----------
   nada acontece sozinho: a fila velha continua exatamente como ficou, e a
   unica coisa que muda e a tela parar de chamar aquilo de hoje. */
function StaleStrip({ doc, onBring, onClose }) {
  const open = pendingOf(doc);
  const total = open.reduce((s, t) => s + t.min, 0);
  const when = weekdayName(doc.day);
  return (
    <div className="stale">
      <p className="stale__text">Esta fila é de <b>{when}</b>{open.length
        ? " · " + open.length + (open.length === 1 ? " aberta" : " abertas") + (total ? " · " + longFmt(total) : "")
        : " e não sobrou nada aberto"}</p>
      <div className="stale__actions">
        <button className="pill" type="button" onClick={onBring}>trazer pra hoje</button>
        <button className="pill" type="button" onClick={onClose}><span>{"fechar " + when}</span></button>
      </div>
    </div>
  );
}

/* o vinculo e um <a> de verdade: abre em outra aba e e o meio do caminho
   entre "eu sei que existe la" e "o planner virou cliente do ClickUp".
   nada e lido de la, nada e escrito la. o href se monta aqui, a partir do
   id — nunca de texto que alguem digitou. */
const clickupLink = (t) => t.clickup && (
  <a className="action" href={"https://app.clickup.com/t/" + t.clickup} target="_blank" rel="noopener noreferrer" aria-label={"Abrir no ClickUp: " + t.title}>{icon("link")}</a>
);

/* ---------- o que ocupa o dia sem ser trabalho ----------
   fica acima da fila porque acontece antes dela na conta: e o dia que voce
   ja nao tem. sem check, porque nao se conclui almoco para ganhar tempo. */
function Reserves({ list, onRemove }) {
  const total = list.reduce((s, t) => s + t.min, 0);
  return (
    <section className="reserves">
      <p className="section-label"><span className="t-mono">{longFmt(total) + " fora do trabalho"}</span></p>
      <ul className="reserve-list">
        {list.map((t) => (
          <li key={t.id} className="reserve" data-id={t.id}>
            <span className="reserve__mark">{icon("clock")}</span>
            <span className="reserve__name">{t.title}</span>
            <span className="reserve__time">{fmt(t.min)}</span>
            <div className="actions">
              {clickupLink(t)}
              <button className="action" type="button" aria-label={"Remover reserva: " + t.title} onClick={() => onRemove(t.id)}>{icon("trash")}</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- a linha da tarefa ----------
   o titulo e um campo controlado por um rascunho local: uma sincronizacao
   que chega no meio da digitacao nao apaga o que esta sendo escrito, e o
   change (blur ou Enter) e quem grava. */
function TaskRow({ t, start, slot, fits, dragging, leaving, actions }) {
  const [draft, setDraft] = useState(t.title);
  useEffect(() => { setDraft(t.title); }, [t.title]);
  const [editingTime, setEditingTime] = useState(false);
  const client = t.client ? clientName(t.client) : "";
  const partial = slot && slot.partial ? " · só " + fmt(slot.min) + " hoje" : "";

  const onKeyDown = (e) => {
    const li = e.currentTarget;
    const inTitle = e.target.classList.contains("task__title");
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      /* a linha vai mudar de lugar: salva a edicao antes */
      if (inTitle) actions.rename(t.id, draft);
      actions.move(t.id, e.key === "ArrowUp" ? -1 : 1, "row");
      return;
    }
    if (inTitle) {
      if (e.key === "Enter") { e.preventDefault(); e.target.blur(); li.focus(); }
      else if (e.key === "Escape") {
        /* o valor volta no DOM antes do blur, senao o change gravaria a
           edicao que o Esc quis jogar fora */
        e.target.value = t.title;
        setDraft(t.title);
        e.target.blur();
        li.focus();
      }
      return;
    }
    /* com o foco na alca, as setas sozinhas ja reordenam */
    if (e.target.classList.contains("grip") && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      actions.move(t.id, e.key === "ArrowUp" ? -1 : 1, "grip");
      return;
    }
    /* os atalhos valem so na linha em si: dentro de um <button> eles roubariam
       a ativacao nativa e Enter concluiria a tarefa em vez de acionar o botao */
    if (e.target !== li) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); actions.complete(t.id); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); actions.remove(t.id); }
  };

  return (
    <li className={"task" + (dragging ? " is-dragging" : "") + (leaving ? " is-leaving" : "")} data-id={t.id}
        data-fits={fits ? null : "no"} tabIndex="0"
        title={slot ? clock(start + slot.from) + "–" + clock(start + slot.from + slot.min) : null}
        onKeyDown={onKeyDown}>
      <button className="mark" type="button" aria-label={"Concluir: " + t.title} onClick={() => actions.complete(t.id)}>{icon("check")}</button>
      <div className="task__body">
        <input className="task__title" value={draft} aria-label="Título da tarefa"
          onChange={(e) => setDraft(e.currentTarget.value)}
          onBlur={(e) => actions.rename(t.id, e.currentTarget.value)} />
        <div className="task__foot">
          {editingTime
            ? <DurationEditor t={t} onDone={(min) => { setEditingTime(false); if (min) actions.setDuration(t.id, min); }} />
            : <button className="task__time" type="button" data-missing={t.min ? null : "yes"}
                aria-label={t.min ? "Duração: " + longFmt(t.min) + ". Alterar" : "Sem duração, contando " + longFmt(GUESS) + " como palpite. Definir"}
                onClick={() => setEditingTime(true)}>{icon("clock")}<span>{(t.min ? fmt(t.min) : "definir duração · contando " + fmt(GUESS)) + partial}</span></button>}
          {!!client && <div className="task__badges"><ClientBadge id={t.client} /></div>}
        </div>
      </div>
      <div className="actions">
        {clickupLink(t)}
        <button className="action" type="button" disabled={!!actions.thinking} data-thinking={actions.thinking === t.id ? "yes" : null}
          title={actions.thinking === t.id ? "pensando…" : "perguntar ao merlin: dá pra fazer com o Claude?"}
          aria-label={"Perguntar ao merlin se dá para fazer com o Claude: " + t.title} onClick={() => actions.delegate(t)}>{icon("spark")}</button>
        <button className="action" type="button" aria-label={"Excluir: " + t.title} onClick={() => actions.remove(t.id)}>{icon("trash")}</button>
      </div>
      <button className="grip" type="button" aria-label={"Arrastar para reordenar: " + t.title} onPointerDown={(e) => actions.dragStart(e, t.id)}>{icon("grip")}</button>
    </li>
  );
}

/* ---------- editar duracao na propria linha ----------
   no lugar exato onde ela e lida. Enter e blur aplicam; Esc cancela. so
   grava o que foi entendido: "45" sem unidade nao apaga a estimativa que ja
   existia. o `closed` evita que o blur do input saindo da tela aplique duas vezes. */
function DurationEditor({ t, onDone }) {
  const ref = useRef(null);
  const closed = useRef(false);
  const [value, setValue] = useState(t.min ? fmt(t.min) : "");
  useLayoutEffect(() => { ref.current.focus(); ref.current.select(); }, []);
  const finish = (apply) => {
    if (closed.current) return;
    closed.current = true;
    const min = apply ? readDuration(" " + value.trim() + " ").min : 0;
    onDone(apply && min && min !== t.min ? min : 0);
  };
  return (
    <input ref={ref} className="task__time-input" value={value} placeholder="45m, 1h30" aria-label={"Duração de " + t.title}
      onChange={(e) => setValue(e.currentTarget.value)} onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); finish(true); }
        else if (e.key === "Escape") { e.preventDefault(); finish(false); }
      }} />
  );
}

/* ---------- dia vazio ----------
   os dois cartoes so na estreia — depois eles pareceriam fila de verdade. o
   rodape, nao: ele e a unica explicacao de como a duracao e lida, e volta
   toda vez que a fila esvazia. */
function EmptyState({ doc, b }) {
  const debut = doc.tasks.length === 0;
  const sub = b.overtime
    ? "Passou das " + clock(doc.end) + " e não sobrou nada na fila."
    : (!debut ? "Nada na fila. Dá pra puxar mais alguma coisa, ou parar por aqui." : "Escreve embaixo a primeira coisa que precisa caber hoje.");
  return (
    <div className="empty">
      <p className="empty__sub">{sub}</p>
      {debut && (
        <ul className="examples" aria-hidden="true">
          <li>
            <span className="examples__mark"></span>
            <span className="examples__body">
              <span className="examples__name">fechar o relatório da Vibra</span>
              <span className="examples__sub"><b>1h30</b></span>
            </span>
          </li>
          <li>
            <span className="examples__mark"></span>
            <span className="examples__body">
              <span className="examples__name">ligar pro contador</span>
              <span className="examples__sub"><b>15m</b></span>
            </span>
          </li>
        </ul>
      )}
      <p className="empty__foot">{debut
        ? "Escreve assim, com a duração no fim: ela sai do título e entra na barra do dia."
        : "Com a duração no fim — “revisar proposta 45m”, “gravar 1h30”, “almoço 1h”. Sem ela, eu pergunto."}</p>
    </div>
  );
}

/* ---------- concluidas ---------- */
function DoneList({ doc, done, onToggle, onClear, onReopen }) {
  return (
    <section className="done" data-open={doc.doneOpen ? "yes" : "no"}>
      <p className="section-label">
        <button className="pill" type="button" id="done-toggle" aria-expanded={String(!!doc.doneOpen)} onClick={onToggle}>
          <ChevronIcon /><span>{done.length + (done.length === 1 ? " concluída" : " concluídas")}</span>
        </button>
        <button className="pill" type="button" id="done-clear" onClick={onClear}>limpar</button>
      </p>
      <ul className="done-list">
        {done.map((t) => (
          <li key={t.id} className="done-item" data-id={t.id}>
            <button className="mark" type="button" aria-label={"Reabrir: " + t.title} onClick={() => onReopen(t.id)}>{icon("check")}</button>
            <span className="done-item__name">{t.title}</span>
            <span className="done-item__time">{fmt(t.min)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}


/* ---------- composer ----------
   a previa fantasma mostra o que o parser entendeu antes de confirmar; os
   chips sao o pedagio de duracao; a pilula e o campo. */
function Composer({ b, text, setText, pending, fieldRef, storageBroken, onSubmit, onPick, onOther, onEscape }) {
  const [focused, setFocused] = useState(false);
  const raw = text.replace(/\s+/g, " ").trim();
  let ghost = null;
  if (focused && !pending && raw) {
    const { min, title, clickup, noLink, client } = readLine(text);
    const fits = !min || min <= b.slack;
    /* o link e o @ reconhecidos sao ditos na previa: senao a URL some do
       campo e voce nao sabe se ela virou vinculo ou se foi engolida. numero
       no texto que o parser nao entendeu quase sempre e tempo mal escrito. */
    const tag = (clickup ? " · clickup" : "") + (client ? " · " + clientName(client) : "");
    ghost = {
      name: title || raw,
      fits,
      time: (min
        ? fmt(min) + (fits ? "" : " · não cabe hoje")
        : (looksLikeBrokenTime(noLink, min) ? "não entendi o tempo · 45m, 1h30" : "o tempo vem a seguir")) + tag
    };
  }
  return (
    <div className="composer">
      {ghost && (
        <div className="ghost" aria-hidden="true" data-fits={ghost.fits ? "yes" : "no"}>
          <span className="ghost__name">{ghost.name}</span>
          <span className="ghost__time">{ghost.time}</span>
        </div>
      )}
      {pending && <Chips pending={pending} slack={b.slack} onPick={onPick} onOther={onOther} onEscape={onEscape} />}
      <form className="entry" autoComplete="off" onSubmit={onSubmit}>
        <span className="entry__plus" aria-hidden="true"><PlusThinIcon /></span>
        <input id="field" ref={fieldRef} placeholder="o que precisa caber?" aria-label="Nova tarefa" value={text}
          onChange={(e) => setText(e.currentTarget.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
        <button className="entry__send" type="submit" aria-label="Adicionar tarefa"><SendIcon /></button>
      </form>
      {storageBroken && <p className="storage-warning">não consegui salvar neste navegador — o que você fizer agora some ao fechar</p>}
    </div>
  );
}

/* ---------- os chips de duracao ----------
   toda tarefa tem duracao: quando o texto nao traz uma, ela e perguntada
   aqui antes de a tarefa existir. e um passo, nao um erro. o chip que nao
   cabe hoje continua clicavel: a tela informa, nao proibe. setas andam
   entre os chips; Esc volta pro campo sem criar nada. */
function Chips({ pending, slack, onPick, onOther, onEscape }) {
  const rowRef = useRef(null);
  /* foco no primeiro chip a cada pedagio aberto: quem apertou Enter ja esta
     com o dedo no teclado */
  useLayoutEffect(() => {
    const first = rowRef.current && rowRef.current.querySelector(".chip");
    if (first) first.focus();
  }, [pending]);
  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.preventDefault(); onEscape(); return; }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const all = [...rowRef.current.querySelectorAll(".chip")];
    const i = all.indexOf(e.target.closest(".chip"));
    if (i < 0) return;
    all[(i + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length].focus();
  };
  return (
    <div className="chips">
      <p className="chips__text"><b>{pending.title}</b> — {pending.reserved ? "quanto tempo isso tira do dia?" : "quanto tempo isso leva?"}</p>
      <div className="chips__row" ref={rowRef} role="group" aria-label="Quanto tempo isso leva" onKeyDown={onKeyDown}>
        {CHIPS.map((min) => <button key={min} className="chip" type="button" data-fits={min <= slack ? "yes" : "no"} onClick={() => onPick(min)}>{fmt(min)}</button>)}
        <button className="chip chip--other" type="button" onClick={onOther}>outro</button>
      </div>
    </div>
  );
}

/* ---------- caixa de ideias ----------
   linha mais leve que a da tarefa de proposito: ideia nao tem duracao, entao
   ela nao tem a coluna de medida que toda tarefa tem. */
function IdeasBox({ ideas, onCreate, onPull, onRemove }) {
  const [text, setText] = useState("");
  const submit = (e) => {
    e.preventDefault();
    const m = parseMentions(text);
    if (onCreate(m.title, m)) setText("");
  };
  return (
    <section className="block" id="ideas">
      <p className="section-label">
        <span className="t-mono">{ideas.length ? ideas.length + (ideas.length === 1 ? " ideia" : " ideias") : "ideias"}</span>
        <a className="text-link" href="ideas.html">todas</a>
      </p>
      <p className="ideas__note">não custam minuto nenhum até virarem tarefa</p>
      {!ideas.length && <p className="ideas__empty">Nada aqui. Escreve embaixo o que ainda não é tarefa.</p>}
      <ul className="idea-list">
        {ideas.map((i) => (
          <li key={i.id} className="idea" data-id={i.id}>
            <span className="idea__name">{i.title}</span>
            <span className="idea__actions">
              <a className="idea__action" href={"ideas.html#" + encodeURIComponent(i.id)} title="abrir a ideia" aria-label={'Abrir "' + i.title + '"'}>{icon("link")}</a>
              <button className="idea__action" type="button" title="apagar" aria-label={'Apagar "' + i.title + '"'} onClick={() => onRemove(i.id)}>{icon("trash")}</button>
            </span>
            <button className="idea__pull" type="button" title="puxar para o dia — ela vai pedir a duração"
              aria-label={'Puxar "' + i.title + '" para o dia'} onClick={() => onPull(i.id)}>{icon("clock")}<span>puxar</span></button>
          </li>
        ))}
      </ul>
      <form className="idea-form" autoComplete="off" onSubmit={submit}>
        <input id="idea-field" maxLength="300" placeholder="uma ideia" aria-label="Nova ideia" value={text} onChange={(e) => setText(e.currentTarget.value)} />
      </form>
    </section>
  );
}

/* ---------- matriz de eisenhower ----------
   um instrumento de ordenacao, e so isso: o quadrante NAO e gravado. ele
   existe enquanto a folha esta aberta e morre ao fechar. o que sobra e a
   unica ordenacao que o produto tem, que e a ordem da fila. um quadrante
   gravado seria um segundo eixo de ordenacao — foi exatamente esse eixo que
   saiu do produto quando a fila ganhou ordem e linha de corte.

   a previa da fila resultante e o que impede a matriz de virar quatro
   baldes de capacidade infinita: arrastar mais uma coisa para "faz agora"
   empurra outra para baixo da linha, no mesmo gesto e a vista. */
const ZONES = ["q1", "q2", "q3", "q4", "pool"];
const ZONE_LABELS = { pool: "na fila, sem classificar", q1: "faz agora", q2: "agenda", q3: "delega", q4: "fica pra depois" };

function Matrix({ doc, open, onApply }) {
  const [zones, setZones] = useState(null);   /* null = fechada; {pool, q1..q4: [ids]} */
  const [dragId, setDragId] = useState(null);
  const [target, setTarget] = useState(null);
  const focusId = useRef(null);
  const fieldRef = useRef(null);

  /* abre sempre do zero, com tudo sem classificar: e o que "efemera" quer
     dizer. a fila de hoje ja e a sua ordem — a matriz e para revisita-la. */
  const openMatrix = () => setZones({ pool: open.map((t) => t.id), q1: [], q2: [], q3: [], q4: [] });
  const close = () => { setZones(null); setDragId(null); setTarget(null); };
  /* a ordem que sai da matriz: os quadrantes na ordem canonica, e no fim o
     que voce nao classificou — que continua exatamente na ordem em que estava. */
  const orderOf = (z) => ZONES.flatMap((k) => z[k]);
  const byId = new Map(doc.tasks.map((t) => [t.id, t]));

  const moveTo = (id, zone, beforeId) => setZones((z) => {
    if (!z) return z;
    const next = {};
    for (const k in z) next[k] = z[k].filter((x) => x !== id);
    const list = next[zone];
    const i = beforeId ? list.indexOf(beforeId) : -1;
    if (i >= 0) list.splice(i, 0, id); else list.push(id);
    return next;
  });

  /* ---- arrasto 2D ----
     os listeners vao para o documento enquanto dura o arrasto: o chip troca
     de <ul> quando muda de quadrante, e um listener preso a ele morreria
     junto. o chip arrastado esta com pointer-events:none, entao
     elementFromPoint enxerga a zona por baixo dele — e por isso quadrante
     vazio e alcancavel. */
  const startDrag = (e, id) => {
    if (e.button > 0) return;
    e.preventDefault();
    setDragId(id);
  };
  useEffect(() => {
    if (!dragId) return;
    const onMove = (e) => {
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const zoneEl = under && under.closest ? under.closest("[data-zone]") : null;
      setTarget(zoneEl ? zoneEl.dataset.zone : null);
      if (!zoneEl) return;
      const sibling = [...zoneEl.querySelectorAll(".matrix-chip")].find((c) => {
        if (c.dataset.id === dragId) return false;
        const r = c.getBoundingClientRect();
        return e.clientY < r.top + r.height / 2;
      });
      moveTo(dragId, zoneEl.dataset.zone, sibling ? sibling.dataset.id : null);
    };
    const onUp = () => { setDragId(null); setTarget(null); };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, [dragId]);

  /* teclado: o produto inteiro e navegavel sem mouse, e uma folha que so
     aceita arrasto seria a unica tela que nao e. */
  const onChipKey = (e, id, zone) => {
    const i = ZONES.indexOf(zone);
    let dest = null;
    if (e.key === "ArrowRight") dest = ZONES[(i + 1) % ZONES.length];
    else if (e.key === "ArrowLeft") dest = ZONES[(i + ZONES.length - 1) % ZONES.length];
    else return;
    e.preventDefault();
    moveTo(id, dest, null);
    focusId.current = id;
  };
  /* o chip renasce em outro <ul>: o foco volta para ele antes da pintura */
  useLayoutEffect(() => {
    if (!focusId.current || !fieldRef.current) return;
    const el = fieldRef.current.querySelector('[data-id="' + cssEscape(focusId.current) + '"]');
    focusId.current = null;
    if (el) el.focus();
  });

  const apply = () => {
    const ids = zones ? orderOf(zones) : [];
    if (ids.length) onApply(ids);
    close();
  };

  const zone = (z) => (
    <div key={z} className={"zone" + (z === "pool" ? " zone--pool" : "")} data-zone={z} data-target={target === z ? "yes" : "no"}>
      <span className="t-mono matrix__label">{ZONE_LABELS[z]}</span>
      <ul className="zone__chips">
        {zones[z].map((id) => {
          const t = byId.get(id);
          if (!t) return null;
          return (
            <li key={id} className={"matrix-chip" + (dragId === id ? " is-dragging" : "")} data-id={id} tabIndex="0" role="listitem"
                aria-label={t.title + ", " + fmt(costOf(t)) + ". Setas movem entre os quadrantes."}
                onPointerDown={(e) => startDrag(e, id)} onKeyDown={(e) => onChipKey(e, id, z)}>
              <span className="matrix-chip__name">{t.title}</span>
              <span className="matrix-chip__min">{fmt(costOf(t))}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  /* a MESMA conta da tela principal, so que sobre a ordem hipotetica */
  const tasks = zones ? orderOf(zones).map((id) => byId.get(id)).filter(Boolean) : [];
  const { slots, cut } = zones ? distribute(doc, tasks) : { slots: new Map(), cut: -1 };

  return (
    <section className="block" id="matrix">
      <p className="section-label">
        <span className="t-mono">ordenar</span>
        <button className="pill" type="button" id="matrix-toggle" aria-expanded={String(!!zones)} onClick={() => (zones ? close() : openMatrix())}>{zones ? "fechar" : "abrir"}</button>
      </p>
      <p className="matrix__note">Arruma a fila por urgência e importância. O que sair daqui vira a ordem do dia.</p>
      {zones && (
        <>
          <div className="matrix__field" ref={fieldRef}>
            {zone("pool")}
            <div className="matrix__grid">{zone("q1")}{zone("q2")}{zone("q3")}{zone("q4")}</div>
          </div>
          <p className="matrix__label t-mono preview-label">a fila que sai daqui</p>
          <ol className="preview">
            {tasks.length
              ? tasks.map((t, i) => <li key={t.id} data-fits={slots.has(t.id) && !slots.get(t.id).partial ? "yes" : "no"} data-cut={i === cut ? "yes" : null}><span className="preview__name">{t.title}</span></li>)
              : <li className="preview__empty">a fila está vazia.</li>}
          </ol>
          <div className="matrix__actions">
            <button className="pill" type="button" id="matrix-apply" onClick={apply}>aplicar</button>
            <button className="text-link" type="button" id="matrix-discard" onClick={close}>descartar</button>
          </div>
        </>
      )}
    </section>
  );
}

mount(<Day />, "app");
