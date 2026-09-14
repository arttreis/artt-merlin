/* merlin · o calendario
   as tarefas, e tres jeitos de olhar para elas: o dia, a semana, o mes.

   era duas paginas. o dia (`day.html`) tinha uma fila com minutos guardada
   num documento so, e a semana (`week.html`) tinha cartoes com data guardados
   numa colecao. o cartao virava tarefa por um gesto de "puxar", que criava
   uma SEGUNDA coisa e deixava um fio entre as duas — e esse fio precisava ser
   costurado nos dois sentidos, toda vez, em todo caminho.

   o Arthur pediu que as duas fossem sincronizadas. a resposta honesta nao e
   mais costura: e nao haver duas coisas. hoje ha uma colecao (`shared/tasks.js`)
   e tres visoes dela — e "sincronizar" deixou de ser uma tarefa do codigo
   porque deixou de existir a pergunta.

   o principio nao mudou: **so o dia tem minutos**. a visao do dia e a unica
   que faz conta com duracao, cobra o pedagio e desenha a barra que se gasta.
   a semana e o mes mostram o que ha em cada data, sem prometer que cabe. */
import "./shared/base.css";
import "./calendar.css";
import "./shared/week-grid.css";
import {
  initPage, newId, today, isDay, dateOf, dayOf, addDays, sundayOf, dateLabel, monthLabel,
  api, cloud, notify, readDuration, formatMin, parseDuration, readPrefs, savePrefs,
  readInbox, writeInbox, parseMentions, clientName, clients
} from "./shared/core.js";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import {
  mount, useCollection, useClients, useKeydown, isTyping, useHash, setHash, useFields,
  Form, Field, Dialog, Markdown, ClientBadge, clientOptionList,
  useDelegate, DelegateDialog, icon, DateField
} from "./shared/ui.jsx";
import {
  normalize, onDate, inRange, overdue, dayDoc, topOrder, newTask, migrateTasks, layoutDay, readClock
} from "./shared/tasks.js";
import { normalize as normalizeBlock, copyRoutine } from "./shared/routine.js";
import {
  pendingOf, doneOf, reservesOf, costOf, guessMin, budget, fmt, longFmt, clock
} from "./shared/day.js";

initPage("calendar");

/* ================================================================
   leitura de texto: a gramatica e a mesma em toda visao
   ================================================================ */

/* link de tarefa do ClickUp colado junto do titulo. so a forma /t/<id> —
   que e a unica que identifica uma tarefa — e a URL sai do titulo como a
   duracao sai: o titulo fica sendo o que voce leria em voz alta. */
const CLICKUP_URL = /(?:^|\s)https?:\/\/(?:[a-z0-9-]+\.)*clickup\.com\/t\/(?:\d+\/)?([A-Za-z0-9]{1,32})\S*(?=\s|$)/i;

function readClickup(text) {
  const m = text.match(CLICKUP_URL);
  if (!m) return { clickup: "", title: text };
  return { clickup: m[1], title: text.slice(0, m.index) + " " + text.slice(m.index + m[0].length) };
}

/* o composer inteiro le a linha por aqui. a previa e o submit precisam
   entender exatamente a mesma coisa: se so o submit tirasse a URL, a previa
   mostraria o link cru como titulo e ainda acusaria "nao entendi o tempo" por
   causa dos digitos do id. */
function readLine(text) {
  const l = readClickup(text);
  const m = parseMentions(l.title);
  const d = readDuration(m.title);
  return { min: d.min, title: d.title, clickup: l.clickup, noLink: m.title, client: m.client };
}

const looksLikeBrokenTime = (text, min) =>
  !min && /\d/.test(text) && !/^\s*\d+\s*$/.test(text);

/* o que ocupa o dia sem ser trabalho seu. escrever "almoco 1h" nao deveria
   virar uma tarefa que voce conclui para ganhar tempo de volta que nunca
   esteve la — entao essas viram reserva, e o prefixo "-" forca qualquer uma.

   as cerimonias estao aqui por inteiro: "daily" vivia sozinha, e uma lista que
   reconhece a reuniao de todo dia mas nao a da semana obriga voce a escrever
   "reuniao weekly" para o Merlin entender o que "weekly" ja diz. */
const RESERVE_RE = /^(?:-\s*|(?:almo[çc]o|caf[ée]|janta(?:r)?|reuni[ãa]o|call|daily|weekly|monthly|stand ?-?up|planning|refinement|retro(?:spectiva)?|kick ?-?off|alinhamento|mentoria|1:1|1x1|dentista|m[ée]dico|academia|deslocamento|transito|tr[âa]nsito)\b)/i;
const isReserve = (title) => RESERVE_RE.test(title.trim());
const stripPrefix = (title) => title.replace(/^-\s*/, "").trim();

const shortTitle = (s) => (s.length > 28 ? s.slice(0, 28) + "…" : s);
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ================================================================
   datas
   ================================================================ */

const dateAtNoon = (day) => { const [y, m, d] = day.split("-").map(Number); return new Date(y, m - 1, d, 12); };
const dateStamp = (day) =>
  new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" })
    .format(dateAtNoon(day)).replace(/\./g, "").replace(",", " ·").toUpperCase();
const weekdayName = (day) => new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(dateAtNoon(day));
const monthOf = (day) => day.slice(0, 7);
const dayNumber = (day) => dateOf(day).getDate();

/* "8–14 set" quando cabe no mesmo mes; "29 ago–4 set" quando vira o mes */
function weekRange(weekStart) {
  const end = addDays(weekStart, 6);
  if (dateOf(weekStart).getMonth() === dateOf(end).getMonth()) return dayNumber(weekStart) + "–" + dateLabel(end);
  return dateLabel(weekStart) + "–" + dateLabel(end);
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const WEEK_DAYS = (weekStart) => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

/* a grade do mes comeca no domingo da semana do dia 1 e vai ate o sabado da
   semana do ultimo dia: e por isso que ela sempre tem semanas inteiras, e por
   isso que as pontas mostram dias do mes vizinho. */
function monthGrid(month) {
  const first = month + "-01";
  const start = sundayOf(first);
  const last = new Date(dateOf(first).getFullYear(), dateOf(first).getMonth() + 1, 0);
  const end = sundayOf(dayOf(last));
  const weeks = [];
  for (let m = start; m <= end; m = addDays(m, 7)) weeks.push(WEEK_DAYS(m));
  return weeks;
}

/* ================================================================
/* ================================================================
   as agendas: cada cliente e uma
   ================================================================
   a semana e o mes pintam cada tarefa na cor do cliente dela, e a barra do
   lado liga e desliga cada um — "so a loja x esta semana" vira um clique. o
   que nao tem cliente e a agenda pessoal, no verde da casa.

   a cor sai da ordem de cadastro (contando encerrados), e nao da ordem
   alfabetica: cliente novo pega a proxima cor e nao repinta os outros. um
   sorteio pelo id seria mais estavel, mas com oito cores dois clientes em
   tres ja caiam na mesma. o que fica escondido e preferencia desta tela neste
   aparelho, e por isso mora no localStorage e nao na nuvem. o dia nao filtra
   nada: a conta dele e sobre o dia inteiro, e esconder uma tarefa ali
   mentiria sobre o tempo que sobra. */
const AGENDA_COLORS = ["#8b5cf6", "#f59e0b", "#14b8a6", "#f43f5e", "#3b82f6", "#ec4899", "#f97316", "#06b6d4"];
const agendaColor = (client) => {
  const c = clients().get(client);
  if (c && c.color) return c.color;
  const order = clients().all().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id)));
  const i = order.findIndex((x) => x.id === client);
  return AGENDA_COLORS[(i < 0 ? 0 : i) % AGENDA_COLORS.length];
};
/* o estilo que leva a cor: sem cliente nao ha variavel, e o CSS cai no verde */
const agendaStyle = (client) => (client ? { "--c": agendaColor(client) } : {});
const HIDDEN_KEY = "merlin:calendar:hidden";
const SIDE_KEY = "merlin:calendar:side";
const readHidden = () => { try { const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
const readSide = () => { try { const v = localStorage.getItem(SIDE_KEY); return v ? v === "open" : window.innerWidth >= 1000; } catch (e) { return true; } };

   onde cada tarefa cai dentro do dia
   ================================================================
   e a partir de qual delas nao da mais tempo. tarefa sem estimativa entra
   pelo palpite: ela desloca o cursor e pode disparar o corte como qualquer
   outra — so aparece marcada como palpite. */
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

/* ================================================================
   as notas, vistas daqui
   ================================================================
   a caixa e a colecao "notes" do merlin, a mesma de notes.html: la a nota
   ganha corpo, estagio e passos; aqui so aparece a ponta. */
const MAX_NOTES = 30;
const normalizeNote = (i) => ({ ...i, title: String(i.title || "").slice(0, 300), stage: i.stage || "seed" });
const liveNotes = (col) => col.all()
  .filter((i) => i.title && i.stage !== "archived")
  .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
  .slice(0, MAX_NOTES);

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
const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5" /><path d="M15.5 8.5V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7.5a2 2 0 002 2h2.5" />
  </svg>
);

const CHIPS = [15, 30, 60, 120];
const UNDO_DEPTH = 12;
const VIEWS = [["day", "dia"], ["week", "semana"], ["month", "mês"]];
const VIEW_KEY = "merlin:calendar:view";
const readView = () => {
  try { const v = localStorage.getItem(VIEW_KEY); return VIEWS.some(([id]) => id === v) ? v : "day"; }
  catch (e) { return "day"; }
};

/* de onde uma tarefa pode ter vindo. o selo anuncia o FIO, nao "isto entrou
   sozinho": e o que separa uma tarefa que voce escreveu de uma que tem um
   objetivo, uma nota ou um cliente preso do outro lado. */
const ORIGIN_LABEL = { note: "nota", habit: "hábito", client: "cliente", plan: "plano", funnel: "funil", routine: "rotina", next: "próximo passo", content: "conteúdo" };

/* ================================================================
   a pagina
   ================================================================ */
function Calendar() {
  const store = useCollection("tasks", { normalize });
  const routineCol = useCollection("routine", { normalize: normalizeBlock });
  const notesCol = useCollection("notes", { normalize: normalizeNote });
  /* o conteudo com dia de ir ao ar: so leitura aqui. a peca nao e tarefa (nao
     tem duracao, nao se conclui no dia) — ela aparece como marca do dia, e o
     trabalho de gravar e editar vira tarefa la em conteudo. */
  const contentCol = useCollection("content");
  const pieces = contentCol.all().filter((c) => c.date && c.title);
  const clientList = useClients();
  const hash = useHash();
  const delegate = useDelegate();
  const prefs = readPrefs();

  const [view, setView] = useState(readView);
  const [anchor, setAnchor] = useState(today);
  const [, setTick] = useState(0);              /* o relogio: redesenha a cada 30s */
  const [toast, setToast] = useState(null);
  const [windowOpen, setWindowOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(null); /* o pedagio de duracao aberto */
  const [leaving, setLeaving] = useState(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [dragOrder, setDragOrder] = useState(null);
  const [form, setForm] = useState(null);       /* a caixa de tarefa (semana/mes) */
  const [summary, setSummary] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [target, setTarget] = useState("");     /* a data sob o arrasto */
  const [editing, setEditing] = useState(null);

  const [hidden, setHidden] = useState(readHidden);   /* as agendas desligadas: "" e a pessoal */
  const [side, setSide] = useState(readSide);
  const undoStack = useRef([]);
  const toastTimer = useRef(null);
  const drag = useRef(null);
  const dragOrderRef = useRef(null);
  const dragId = useRef(null);
  const listRef = useRef(null);
  const fieldRef = useRef(null);
  const trackRef = useRef(null);
  const focusAfter = useRef(null);

  const all = store.all();

  /* a visao tambem vem do endereco: `calendar.html#week` e o que os enderecos
  /* ---------- as agendas ----------
     so vale esconder o que ainda tem botao para voltar: cliente encerrado
     some da barra, e as tarefas dele nao podem sumir junto sem saida. */
  const off = new Set(hidden.filter((k) => k === "" || clientList.some((c) => c.id === k)));
  const visible = off.size ? all.filter((t) => !off.has(t.client || "")) : all;
  const saveHidden = (list) => {
    setHidden(list);
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(list)); } catch (e) {}
  };
  const toggleAgenda = (key) => saveHidden(off.has(key) ? [...off].filter((k) => k !== key) : [...off, key]);
  const onlyAgenda = (key) => saveHidden(["", ...clientList.map((c) => c.id)].filter((k) => k !== key));
  const toggleSide = () => setSide((v) => {
    try { localStorage.setItem(SIDE_KEY, v ? "closed" : "open"); } catch (e) {}
    return !v;
  });
  /* com uma agenda de cliente so ligada, tarefa nova ja nasce dela */
  const soloClient = (() => {
    const on = ["", ...clientList.map((c) => c.id)].filter((k) => !off.has(k));
    return on.length === 1 ? on[0] : "";
  })();

     antigos (day.html, week.html) apontam depois de a pagina virar uma so.
     uma DATA no lugar da visao abre aquele dia — e o que a busca da barra usa
     para levar a uma tarefa, e o que um link mandado para si mesmo faz. */
  useEffect(() => {
    const v = String(hash || "").toLowerCase();
    if (VIEWS.some(([id]) => id === v)) { if (v !== view) { setView(v); persistView(v); } return; }
    if (isDay(v)) { setAnchor(v); setView("day"); persistView("day"); }
  }, [hash]);

  const persistView = (v) => { try { localStorage.setItem(VIEW_KEY, v); } catch (e) {} };
  const chooseView = (v) => {
    setView(v);
    persistView(v);
    if (hash) setHash("");
  };

  /* a raiz ganha a classe da visao: e ela que faz o corpo centrar o aparelho
     do dia e soltar a largura nas outras duas. */
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("cal-day", view === "day");
  }, [view]);

  /* ---------- desfazer ----------
     uma pilha, e nao uma variavel unica: apagar duas coisas seguidas deixava
     so a ultima recuperavel. o retrato e a colecao inteira de tarefas mais a
     caixa de notas — e barato porque so o que MUDOU volta a ser gravado. */
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
    const before = { tasks: store.all().map((t) => ({ ...t })), notes: notesCol.all().map((n) => ({ ...n })), label };
    action();
    undoStack.current.push(before);
    if (undoStack.current.length > UNDO_DEPTH) undoStack.current.shift();
    showToast(label);
  };
  const undo = () => {
    const stack = undoStack.current;
    if (!stack.length) return;
    const step = stack.pop();
    restore(store, step.tasks);
    restore(notesCol, step.notes);
    if (stack.length) showToast(stack[stack.length - 1].label);
    else closeToast();
  };
  /* gravar de volta so o que difere: um desfazer que regravasse a colecao
     inteira carimbaria todo documento e mandaria tudo para a nuvem de novo. */
  const restore = (col, snapshot) => {
    const now = new Map(col.all().map((d) => [d.id, d]));
    const before = new Set(snapshot.map((d) => d.id));
    const back = snapshot.filter((d) => JSON.stringify(now.get(d.id)) !== JSON.stringify(d));
    if (back.length) col.saveMany(back);
    col.all().forEach((d) => { if (!before.has(d.id)) col.remove(d.id); });
  };

  /* ---------- as acoes, uma so para as tres visoes ---------- */
  const save = (t) => store.save({ ...t, updatedAt: Date.now() });

  const create = (spec) => {
    const date = spec.date || anchor;
    const t = newTask({ ...spec, date, order: spec.order != null ? spec.order : topOrder(store.all(), date) });
    store.save(t);
    return t.id;
  };

  const complete = (id) => {
    const t = store.get(id);
    if (!t || t.done) return;
    const apply = () => { const now = store.get(id); if (now && !now.done) save({ ...now, done: true }); flashReceipt(); };
    const label = t.min ? "+" + longFmt(t.min) + " de volta pro dia" : "feita.";
    if (!reducedMotion() && view === "day") {
      setLeaving(id);
      setTimeout(() => { setLeaving(null); withUndo(label, apply); }, 140);
    } else withUndo(label, apply);
  };
  const reopen = (id) => {
    const t = store.get(id);
    if (t) save({ ...t, done: false, order: topOrder(store.all(), t.date) });
  };
  const toggleDone = (t, value) => (value ? complete(t.id) : reopen(t.id));

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

  const remove = (id) => {
    const t = store.get(id);
    if (!t) return;
    withUndo("apaguei “" + shortTitle(t.title) + "”", () => { store.remove(id); });
  };

  const rename = (id, value) => {
    const t = store.get(id);
    if (!t) return;
    const clean = value.replace(/\s+/g, " ").trim();
    if (!clean) { remove(id); return; }
    if (clean !== t.title) save({ ...t, title: clean.slice(0, 300) });
  };

  const setDuration = (id, min) => {
    const t = store.get(id);
    if (!t) return;
    withUndo("duração de “" + shortTitle(t.title) + "” era " + fmt(t.min), () => {
      const now = store.get(id);
      if (now) save({ ...now, min });
    });
  };

  /* mudar de data e a operacao que so existe porque agora ha uma colecao: na
     vida antiga, mover um cartao de dia e mover uma tarefa do dia eram coisas
     diferentes em telas diferentes. */
  const setDate = (id, date, order) => {
    const t = store.get(id);
    if (!t || (t.date === date && order == null)) return;
    save({ ...t, date, order: order != null ? order : topOrder(store.all(), date) });
  };

  /* uma ordem nova para a fila de uma data */
  const applyOrder = (ids) => {
    const changed = [];
    ids.forEach((id, i) => {
      const t = store.get(id);
      if (t && t.order !== i) changed.push({ ...t, order: i, updatedAt: Date.now() });
    });
    if (changed.length) store.saveMany(changed);
  };

  /* `part` diz o que recebe o foco depois: a linha (Alt+setas) ou a alca */
  const move = (id, step, part) => {
    const open = pendingOf(dayDoc(store.all(), anchor, prefs));
    const pos = open.findIndex((t) => t.id === id);
    const dest = pos + step;
    if (pos < 0 || dest < 0 || dest >= open.length) return;
    const order = open.map((t) => t.id);
    order.splice(dest, 0, order.splice(pos, 1)[0]);
    applyOrder(order);
    focusAfter.current = '.task[data-id="' + cssEscape(id) + '"]' + (part === "grip" ? " .grip" : "");
  };

  const clearDone = () => {
    const list = doneOf(dayDoc(store.all(), anchor, prefs));
    if (!list.length) return;
    withUndo("removi " + list.length + (list.length === 1 ? " concluída" : " concluídas"), () => {
      list.forEach((t) => store.remove(t.id));
    });
  };

  /* ---------- copiar, colar, duplicar ----------
     a copia nasce como tarefa nova: id novo, aberta, e sem o "toda semana" —
     uma copia de uma tarefa recorrente que tambem fosse recorrente espalharia
     duas de cada na semana seguinte. o horario e a duracao vao junto, porque
     e isso que se quer repetir quando se copia a reuniao de terca para quinta.

     colar vai para o dia sob o ponteiro (a coluna da semana, a celula do
     mes); na visao do dia, para o dia aberto. */
  const clip = useRef(null);
  const pointed = useRef({ task: "", day: "" });
  /* a copia de uma copia da rotina nao leva o fio: o bloco trataria as duas
     como dele, e mudar o bloco mexeria na que voce criou a mao */
  const copyOf = (t, date, order) => newTask({
    title: t.title, date, at: t.at, min: t.min, reserved: t.reserved,
    clickup: t.clickup, client: t.client, origin: t.origin && t.origin.type === "routine" ? null : t.origin, order
  });
  const copyTask = (id) => {
    const t = store.get(id);
    if (!t) return;
    clip.current = { ...t };
    if (navigator.clipboard) navigator.clipboard.writeText(t.title).catch(() => {});
    notify("copiei “" + shortTitle(t.title) + "” — Ctrl+V cola no dia sob o ponteiro");
  };
  const pasteTask = () => {
    const t = clip.current;
    if (!t) return;
    const date = view === "day" ? anchor : (pointed.current.day || anchor);
    withUndo("colei “" + shortTitle(t.title) + "” em " + (date === today() ? "hoje" : dateLabel(date)), () => {
      store.save(copyOf(t, date, topOrder(store.all(), date)));
    });
  };
  const duplicate = (id) => {
    const t = store.get(id);
    if (!t) return;
    /* logo depois do original na fila, e nao no topo: duplicar e "mais uma
       dessa", e ela aparece onde o olho ja esta */
    const next = store.all().filter((x) => x.date === t.date && x.order > t.order).sort((a, b) => a.order - b.order)[0];
    const order = next ? (t.order + next.order) / 2 : t.order + 1;
    withUndo("dupliquei “" + shortTitle(t.title) + "”", () => { store.save(copyOf(t, t.date, order)); });
  };
  /* soltar na grade da semana: o dia e a hora onde o bloco caiu */
  const moveTo = (id, date, at) => {
    const t = store.get(id);
    if (!t || (t.date === date && t.at === at)) return;
    save({ ...t, date, at, order: t.date === date ? t.order : topOrder(store.all(), date) });
  };
  useEffect(() => {
    const track = (e) => {
      const el = e.target && e.target.closest ? e.target : null;
      if (!el) return;
      const task = el.closest("[data-task]"), day = el.closest("[data-day]");
      pointed.current = { task: task ? task.dataset.task : "", day: day ? day.dataset.day : "" };
    };
    document.addEventListener("mouseover", track);
    document.addEventListener("focusin", track);
    return () => { document.removeEventListener("mouseover", track); document.removeEventListener("focusin", track); };
  }, []);

  /* ---------- o que ficou para tras ----------
     era a "fila de ontem" do dia e os "cartoes atrasados" da semana: a mesma
     pergunta feita sobre duas listas diferentes. agora e uma so. */
  const late = overdue(all, today());
  const bringLate = () => {
    if (!late.length) return;
    const to = anchor < today() ? today() : anchor;
    withUndo("trouxe " + late.length + (late.length === 1 ? " tarefa" : " tarefas") + " para " + (to === today() ? "hoje" : dateLabel(to)), () => {
      store.saveMany(late.map((t, i) => ({ ...t, date: to, order: topOrder(store.all(), to) - late.length + i, updatedAt: Date.now() })));
    });
  };
  const closeLate = () => {
    if (!late.length) return;
    withUndo("fechei " + late.length + (late.length === 1 ? " tarefa aberta" : " tarefas abertas"), () => {
      store.saveMany(late.map((t) => ({ ...t, done: true, updatedAt: Date.now() })));
    });
  };

  /* ---------- a janela do dia ---------- */
  const closeWindow = () => {
    setWindowOpen(false);
    const b = document.getElementById("window");
    if (b) b.focus();
  };
  const saveWindow = (startText, endText) => {
    const read = (v) => { const p = /^(\d{1,2}):(\d{2})$/.exec(v || ""); return p ? (+p[1]) * 60 + (+p[2]) : null; };
    const s = read(startText), e = read(endText);
    if (s !== null && e !== null && e > s) savePrefs({ dayStart: s, dayEnd: e });
    closeWindow();
  };

  /* ---------- composer ----------
     toda tarefa que entra em HOJE tem duracao. quando o texto nao traz uma,
     o Enter nao cria: ele pergunta. e o pedagio, e ele so existe aqui porque
     so o dia tem minutos — a semana e o mes aceitam tarefa sem duracao. */
  const submitLine = (e) => {
    e.preventDefault();
    const raw = text.replace(/\s+/g, " ").trim();
    if (!raw) return;
    const { min, title, clickup, client } = readLine(text);
    const name = title || raw;
    const reserved = isReserve(name);
    if (min) { createAndClose({ title: stripPrefix(name), min, reserved, clickup, client, noteId: null }); return; }
    setPending({ title: stripPrefix(name), reserved, clickup, client, noteId: null });
  };

  const createAndClose = (spec) => {
    /* promocao de nota: sair da caixa e entrar na fila sao o mesmo gesto,
       entao um desfazer so devolve os dois. */
    const note = spec.noteId ? notesCol.get(spec.noteId) : null;
    const client = spec.client || (note && note.client) || "";
    const task = { title: spec.title, min: spec.min, reserved: spec.reserved, clickup: spec.clickup, client, date: anchor };
    if (note) {
      withUndo("puxei “" + shortTitle(spec.title) + "” pro dia", () => { create(task); notesCol.remove(note.id); });
    } else create(task);
    setText("");
    setPending(null);
    if (fieldRef.current) fieldRef.current.focus();
  };

  const pickChip = (min) => { if (pending) createAndClose({ ...pending, min }); };
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

  /* ---------- caixa de notas ----------
     o que ainda nao e tarefa. entra sem duracao de proposito: nota nao ocupa
     minuto nenhum, e por isso nao aparece na chamada, no trilho nem na conta. */
  const notes = liveNotes(notesCol);
  const createNote = (title, extra) => {
    const clean = String(title).replace(/\s+/g, " ").trim();
    if (!clean) return false;
    const now = Date.now();
    notesCol.save({
      id: newId(), title: clean.slice(0, 300), body: "", stage: "seed",
      client: (extra && extra.client) || "",
      steps: [], outputs: [], history: [], createdAt: now, updatedAt: now
    });
    return true;
  };
  const removeNote = (id) => {
    const i = notesCol.get(id);
    if (!i) return;
    withUndo("apaguei “" + shortTitle(i.title) + "”", () => { notesCol.remove(id); });
  };
  const pullNote = (id) => {
    const i = notesCol.get(id);
    if (!i) return;
    setPending({ title: i.title, reserved: isReserve(i.title), clickup: "", client: "", noteId: id });
  };

  /* ---------- caixa de entrada ----------
     os outros modulos nao escrevem na colecao: eles deixam um bilhete em
     merlin:inbox e o calendario recolhe. com duracao vira tarefa de hoje; sem
     duracao cai na caixa de notas, onde paga o pedagio como qualquer outra. */
  const emptyInbox = () => {
    const list = readInbox();
    if (!list.length) return;
    writeInbox([]);
    let made = 0, newNotes = 0;
    const t = today();
    const fresh = [];
    list.forEach((it) => {
      if (!it || !it.title) return;
      const title = String(it.title);
      if (it.min) {
        fresh.push(newTask({
          title, min: it.min, reserved: isReserve(title), client: it.client,
          origin: it.origin, date: t, order: topOrder(store.all(), t) - list.length + made
        }));
        made++;
      } else if (createNote(title, it)) newNotes++;
    });
    if (fresh.length) store.saveMany(fresh);
    const parts = [];
    if (made) parts.push(made + (made === 1 ? " tarefa" : " tarefas") + " na fila");
    if (newNotes) parts.push(newNotes + (newNotes === 1 ? " nota" : " notas") + " na caixa");
    if (parts.length) showToast("chegou de outro módulo: " + parts.join(" e "));
  };

  /* ---------- resumir a semana com o merlin ---------- */
  const weekStart = sundayOf(anchor);
  const askSummary = async () => {
    if (thinking) return;
    setThinking(true);
    const list = inRange(store.all(), weekStart, addDays(weekStart, 6));
    const line = (t) => [dateStamp(t.date), clientName(t.client), t.title, t.min ? formatMin(t.min) : null, t.done ? "feito" : null]
      .filter(Boolean).join(" · ");
    try {
      const r = await api("/merlin", { method: "POST", body: JSON.stringify({ task: "week", context: { range: weekRange(weekStart), cards: list.map(line) } }) });
      if (r.ok) setSummary(r.body.text || "");
      else if (r.status === 401) notify("entre para usar o Merlin");
      else notify(r.body.error || "não consegui falar com o Merlin");
    } catch (e) {
      notify("não consegui falar com o Merlin");
    } finally { setThinking(false); }
  };

  /* ---------- arrastar na fila do dia ----------
     pointer events: o drag do HTML5 nao dispara em toque, e este app abre no
     celular. */
  const dragStart = (e, id) => {
    if (e.button > 0) return;
    e.preventDefault();
    const li = e.currentTarget.closest(".task");
    if (!li) return;
    drag.current = { id, y: e.clientY, li };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* toque antigo */ }
    dragOrderRef.current = pendingOf(dayDoc(store.all(), anchor, prefs)).map((t) => t.id);
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
      const hit = rows.find((n) => {
        if (n === li) return false;
        const r = n.getBoundingClientRect();
        return e.clientY >= r.top && e.clientY <= r.bottom;
      });
      if (!hit) return;
      const r = hit.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      const order = dragOrderRef.current;
      if (!order) return;
      const o = order.filter((x) => x !== d.id);
      const i = o.indexOf(hit.dataset.id);
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

  /* ---------- arrastar entre datas (semana e mes) ----------
     arrasto nativo: aqui o que muda e a DATA, e nao a ordem dentro de uma
     fila — e mudar de data e o gesto que as duas visoes existem para dar. */
  const onDragStart = (e, t) => {
    if (e.target.tagName === "INPUT") { e.preventDefault(); return; }
    dragId.current = t.id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", t.id);
    requestAnimationFrame(() => setDragging(t.id));
  };
  const onDragEnd = () => { dragId.current = null; setDragging(null); setTarget(""); };
  const onDropOn = (e, date) => {
    e.preventDefault();
    setTarget("");
    const original = dragId.current && store.get(dragId.current);
    dragId.current = null;
    if (!original) return;
    const card = e.target.closest && e.target.closest(".card");
    const siblings = store.all()
      .filter((t) => t.date === date && t.id !== original.id && !t.done)
      .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    let order;
    if (card && card.dataset.id !== original.id) {
      const idx = siblings.findIndex((t) => t.id === card.dataset.id);
      const r = card.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      const pos = idx < 0 ? siblings.length : (before ? idx : idx + 1);
      const prev = siblings[pos - 1], next = siblings[pos];
      order = prev && next ? (prev.order + next.order) / 2
        : prev ? prev.order + 1
        : next ? next.order - 1
        : 0;
    } else {
      order = siblings.length ? siblings[siblings.length - 1].order + 1 : Date.now();
    }
    setDate(original.id, date, order);
  };

  /* ---------- efeitos ---------- */

  /* ao abrir: recolhe a caixa de entrada. uma vez; depois so por evento. */
  useEffect(() => { emptyInbox(); }, []);
  /* a segunda passada da juncao: com sessao, ela so pode fechar depois de a
     semana ter baixado e de os dias do servidor terem sido lidos. */
  useEffect(() => {
    migrateTasks(true);
    return cloud.onChange(() => migrateTasks(true));
  }, []);
  /* a rotina: os blocos moram em routine.html, e o calendario os copia para
     a semana aberta (quem decide o que copiar e o shared/routine.js). de novo
     a cada mudanca: a volta da nuvem e o que destrava a primeira copia, e um
     bloco criado em outra aba tem que chegar sem recarregar. a segunda
     passada nao acha nada — a semana ja esta marcada. */
  useEffect(() => {
    const run = () => copyRoutine(routineCol, store, weekStart);
    run();
    const offs = [store.onChange(run), routineCol.onChange(run), cloud.onStatus(run)];
    return () => offs.forEach((off) => off());
  }, [weekStart, store]);
  useEffect(() => {
    const f = (e) => { if (e.key === "merlin:inbox") emptyInbox(); };
    window.addEventListener("storage", f);
    return () => window.removeEventListener("storage", f);
  }, []);

  /* o dia encolhendo: o tick nao tem transicao, tempo passando e um fato
     seco. virar a meia-noite com a aba aberta muda a fila de categoria. */
  useEffect(() => {
    const tick = () => setTick((n) => n + 1);
    const id = setInterval(tick, 30000);
    const vis = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, []);

  /* ---------- teclado ---------- */
  useKeydown((e) => {
    const el = document.activeElement;
    if (e.key === "Escape") {
      if (el === fieldRef.current) el.blur();
      else if (toast != null) closeToast();
      return;
    }
    if (form || summary != null || isTyping()) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
      const k = e.key.toLowerCase();
      const focused = el && el.closest ? el.closest("[data-task]") : null;
      const id = (focused && focused.dataset.task) || pointed.current.task;
      /* texto selecionado na tela e copia de texto, e nao de tarefa */
      if (k === "c" && id && store.get(id) && !String(window.getSelection ? window.getSelection() : "")) { e.preventDefault(); copyTask(id); return; }
      if (k === "d" && id && store.get(id)) { e.preventDefault(); duplicate(id); return; }
      if (k === "v" && clip.current) { e.preventDefault(); pasteTask(); return; }
    }
    if (e.key === "/" && view === "day") { e.preventDefault(); if (fieldRef.current) fieldRef.current.focus(); return; }
    if (e.key === "n" && view !== "day" && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setForm({ id: "", date: anchor }); return; }
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); shift(e.key === "ArrowLeft" ? -1 : 1); }
  });

  useLayoutEffect(() => {
    const sel = focusAfter.current;
    if (!sel) return;
    focusAfter.current = null;
    const el = document.querySelector(sel);
    if (el) el.focus();
  });

  /* ---------- andar no tempo ----------
     o passo e o da visao: um dia, uma semana, um mes. e sempre a mesma seta. */
  const shift = (n) => setAnchor((a) => {
    if (view === "day") return addDays(a, n);
    if (view === "week") return addDays(a, n * 7);
    const d = dateOf(a);
    return dayOf(new Date(d.getFullYear(), d.getMonth() + n, 1));
  });

  const askDelegate = (t) => delegate.ask({
    id: t.id, title: t.title, min: t.min, client: t.client,
    where: "a fila de hoje", origin: { type: "task", id: t.id }
  });

  const actions = {
    complete, reopen, remove, rename, move, setDuration, applyOrder, dragStart,
    delegate: askDelegate, thinking: delegate.busy, toggleDone, setDate,
    edit: (id) => setForm({ id }), editing, setEditing, store, dragging,
    onDragStart, onDragEnd, save, duplicate, copy: copyTask
  };

  const period = view === "day" ? dateStamp(anchor).toLowerCase()
    : view === "week" ? weekRange(weekStart)
    : monthLabel(monthOf(anchor));
  const isNow = view === "day" ? anchor === today()
    : view === "week" ? weekStart === sundayOf(today())
    : monthOf(anchor) === monthOf(today());

  return (
    <>
      <div className="calbar">
        <div>
          <h1 className="calbar__title">{period}</h1>
          <p className="calbar__sub">{isNow ? "o período de agora" : (view === "day" ? weekdayName(anchor) : "")}</p>
        </div>
        <span className="calbar__gap" />
        {view !== "day" && (
          <button className={"action calbar__side"} type="button" aria-pressed={String(side)}
                  title={side ? "esconder as agendas" : "mostrar as agendas"} aria-label="Agendas" onClick={toggleSide}>{icon("menu")}</button>
        )}
        <div className="calbar__nav">
          <button className="action" type="button" title="anterior (Alt+←)" aria-label="Período anterior" onClick={() => shift(-1)}>{icon("chevronLeft")}</button>
          <button className="pill" type="button" disabled={isNow} onClick={() => setAnchor(today())}>hoje</button>
          <button className="action" type="button" title="próximo (Alt+→)" aria-label="Próximo período" onClick={() => shift(1)}>{icon("chevronRight")}</button>
        </div>
        <div className="calview" role="group" aria-label="Como ver">
          {VIEWS.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={String(view === id)} onClick={() => chooseView(id)}>{label}</button>
          ))}
        </div>
        {view === "week" && (
          <button className="pill" type="button" id="merlin-btn" disabled={thinking} onClick={askSummary}>
            {icon("spark")}<span>{thinking ? "pensando…" : "resumir com o merlin"}</span>
          </button>
        )}
        {view !== "day" && (
          <button className="pill pill--green pill--icon" type="button" title="nova tarefa (n)" aria-label="Nova tarefa"
                  onClick={() => setForm({ id: "", date: anchor })}>{icon("plus")}</button>
        )}
      </div>

      {/* a faixa do que ficou para tras vale nas tres visoes: e a mesma
          pergunta, e ela nao pode depender de qual delas esta aberta. */}
      {late.length > 0 && (
        <div className="late">
          <p className="late__text">
            <b>{late.length}</b> {late.length === 1 ? "tarefa aberta" : "tarefas abertas"} de antes de hoje
          </p>
          <div className="late__actions">
            <button className="pill" type="button" onClick={bringLate}>trazer para hoje</button>
            <button className="pill" type="button" onClick={closeLate}>fechar como está</button>
          </div>
        </div>
      )}

      {view === "day" && (
        <DayView
          all={all} date={anchor} prefs={prefs} notes={notes} actions={actions}
          dragOrder={dragOrder} dragging={dragging} leaving={leaving}
          doneOpen={doneOpen} onToggleDone={() => setDoneOpen((v) => !v)} onClearDone={clearDone}
          windowOpen={windowOpen} onOpenWindow={() => setWindowOpen(true)} onSaveWindow={saveWindow} onCloseWindow={closeWindow}
          text={text} setText={setText} pending={pending} fieldRef={fieldRef} listRef={listRef} trackRef={trackRef}
          onSubmit={submitLine} onPick={pickChip} onOther={pickOther} onEscape={closeChips}
          onCreateNote={createNote} onPullNote={pullNote} onRemoveNote={removeNote} />
      )}

      {view !== "day" && (
        <div className={"calbody" + (side ? " has-side" : "")}>
          {side && (
            <CalSide anchor={anchor} view={view} weekStart={weekStart} all={all} clients={clientList} off={off}
              onPick={setAnchor} onToggle={toggleAgenda} onOnly={onlyAgenda} onShowAll={() => saveHidden([])} />
          )}
          <div className="calbody__main">
            {view === "week" && (
              <WeekGrid all={visible} pieces={pieces} weekStart={weekStart} prefs={prefs} actions={actions}
                onNew={(date, at) => setForm({ id: "", date, at })} onOpenDay={(date) => { setAnchor(date); chooseView("day"); }}
                onMove={moveTo} />
            )}
            {view === "month" && (
              <MonthView all={visible} pieces={pieces} month={monthOf(anchor)} target={target} actions={actions}
                onNew={(date) => setForm({ id: "", date })} onOpenDay={(date) => { setAnchor(date); chooseView("day"); }}
                onEnter={setTarget} onLeave={(d) => setTarget((cur) => (cur === d ? "" : cur))} onDrop={onDropOn} />
            )}
          </div>
        </div>
      )}

      {toast != null && (
        <div className="toast" role="status" aria-live="polite">
          <span>{toast}</span>
          <button type="button" onClick={undo}>desfazer</button>
        </div>
      )}

      {form && <TaskForm store={store} id={form.id} presetDate={form.date || anchor} presetAt={form.at} presetClient={view === "day" ? "" : soloClient} onClose={() => setForm(null)} onRemove={remove} onDuplicate={duplicate} />}
      {summary != null && <MerlinDialog text={summary} onClose={() => setSummary(null)} />}

      {delegate.answer && (
        <DelegateDialog answer={delegate.answer} onClose={delegate.close}
          onBuild={(setup) => { chooseView("day"); setText(setup); if (fieldRef.current) fieldRef.current.focus(); }} />
      )}
    </>
  );
}

const cssEscape = (id) => (window.CSS && CSS.escape ? CSS.escape(id) : id);

/* ================================================================
   a visao do dia — o aparelho
   ================================================================
   e a unica das tres que faz conta com minutos, e por isso e a unica com
   barra, com linha de corte e com pedagio de duracao. */
function DayView({
  all, date, prefs, notes, actions, dragOrder, dragging, leaving,
  doneOpen, onToggleDone, onClearDone, windowOpen, onOpenWindow, onSaveWindow, onCloseWindow,
  text, setText, pending, fieldRef, listRef, trackRef, onSubmit, onPick, onOther, onEscape,
  onCreateNote, onPullNote, onRemoveNote
}) {
  const doc = dayDoc(all, date, prefs);
  const byId = new Map(doc.tasks.map((t) => [t.id, t]));
  const open = dragOrder ? dragOrder.map((id) => byId.get(id)).filter(Boolean) : pendingOf(doc);
  const { b, slots, cut } = distribute(doc, open);
  const done = doneOf(doc);
  const reserves = reservesOf(doc);

  const rows = [];
  open.forEach((t, i) => {
    /* a régua: daqui pra baixo o dia nao alcanca */
    if (cut >= 0 && i === cut) rows.push(<li key="cut" className="cut"><span className="t-mono">daqui não dá tempo hoje</span></li>);
    rows.push(<TaskRow key={t.id} t={t} start={doc.start} slot={slots.get(t.id)} fits={!(cut >= 0 && i >= cut)}
      dragging={dragging === t.id} leaving={leaving === t.id} actions={actions} />);
  });

  return (
    <div className="dayv">
      <main className="device">
        <div className="top">
          <span className="t-mono" id="date">{dateStamp(date)}</span>
          <button className="window" id="window" type="button" title="mudar o começo e o fim do dia" onClick={onOpenWindow}>{clock(doc.start) + " → " + clock(doc.end)}</button>
        </div>

        <div className="scroll">
          <div className="logo-tile" aria-hidden="true"><LogoIcon /></div>
          <Headline doc={doc} b={b} done={done} date={date} />
          <Track b={b} slots={slots} trackRef={trackRef} />
          {windowOpen && <WindowEditor doc={doc} onSave={onSaveWindow} onClose={onCloseWindow} />}
          {reserves.length > 0 && <Reserves list={reserves} onRemove={actions.remove} onDuplicate={actions.duplicate} onEdit={actions.edit} />}
          {open.length > 0 && <p className="section-label"><span className="t-mono">{open.length + (open.length === 1 ? " coisa na fila" : " coisas na fila")}</span></p>}
          <ul className="queue" ref={listRef}>{rows}</ul>
          {!open.length && <EmptyState doc={doc} b={b} />}
          {done.length > 0 && <DoneList done={done} isOpen={doneOpen} onToggle={onToggleDone} onClear={onClearDone} onReopen={actions.reopen} />}
        </div>

        <Composer b={b} text={text} setText={setText} pending={pending} fieldRef={fieldRef}
          onSubmit={onSubmit} onPick={onPick} onOther={onOther} onEscape={onEscape} />
      </main>

      <div className="side" id="side-left">
        <NotesBox notes={notes} onCreate={onCreateNote} onPull={onPullNote} onRemove={onRemoveNote} />
      </div>
      <div className="side" id="side-right">
        <Matrix doc={doc} open={pendingOf(doc)} onApply={actions.applyOrder} />
      </div>
    </div>
  );
}

/* ---------- chamada ---------- */
function Headline({ doc, b, done, date }) {
  const past = date < today();
  const n = done.length;
  let tone = "normal", l1, measure, rest, context;
  if (!b.open.length) {
    l1 = n ? "Tudo fechado." : "Dia limpo.";
    measure = fmt(Math.max(0, b.remaining));
    rest = b.overtime ? "— o dia já acabou" : (n ? "ainda de dia" : "pela frente");
    if (n) {
      const total = done.reduce((s, t) => s + t.min, 0);
      context = n + (n === 1 ? " fechada" : " fechadas") + (total ? " · " + longFmt(total) + " de trabalho" : "");
    } else context = past ? "esse dia já passou." : "o dia acaba às " + clock(doc.end) + ".";
  } else if (b.slack >= 0) {
    l1 = "Ainda cabem";
    /* "~" so aqui: a sobra e o unico numero que o palpite pode INFLAR. no
       estouro ele e piso — palpite so pode aumentar o debito, nunca reduzi-lo. */
    measure = (b.unestimated ? "~" : "") + fmt(b.slack);
    rest = "no seu dia";
    context = longFmt(b.committed) + " na fila" +
      (b.liveReserve ? " · " + longFmt(b.liveReserve) + " reservado" : "") +
      " · o dia acaba às " + clock(doc.end);
  } else {
    /* passar das 19:00 qualifica o estouro, nao substitui a pergunta */
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
  const guess = guessMin();
  const note = b.unestimated
    ? b.unestimated + (b.unestimated === 1 ? " sem duração · conta " : " sem duração · contam ") +
      fmt(guess) + (b.unestimated === 1 ? "" : " cada")
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
            title={t.title + " · " + (s.guess ? "palpite de " + fmt(guess) : fmt(t.min))}></div>;
        })}
        {b.committed < b.remaining && <div key="free" className="band free"></div>}
      </div>
      {b.overflow > 0 && <div className="overflow" aria-hidden="true" style={{ width: Math.min(100, (b.overflow / b.window) * 100) + "%" }}></div>}
      <span className="track__note t-mono">{note}</span>
    </>
  );
}

/* ---------- a janela do dia ---------- */
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

/* o vinculo e um <a> de verdade: abre em outra aba e e o meio do caminho entre
   "eu sei que existe la" e "o planner virou cliente do ClickUp". o href se
   monta aqui, a partir do id — nunca de texto que alguem digitou. */
const clickupLink = (t) => t.clickup && (
  <a className="action" href={"https://app.clickup.com/t/" + t.clickup} target="_blank" rel="noopener noreferrer" aria-label={"Abrir no ClickUp: " + t.title}>{icon("link")}</a>
);

/* ---------- o que ocupa o dia sem ser trabalho ----------
   fica acima da fila porque acontece antes dela na conta: e o dia que voce ja
   nao tem. sem check, porque nao se conclui almoco para ganhar tempo. */
function Reserves({ list, onRemove, onDuplicate, onEdit }) {
  const total = list.reduce((s, t) => s + t.min, 0);
  /* com horario, na ordem do relogio; sem, na ordem da fila, depois */
  list = list.slice().sort((a, b) => (a.at ?? 9999) - (b.at ?? 9999));
  return (
    <section className="reserves">
      <p className="section-label"><span className="t-mono">{longFmt(total) + " fora do trabalho"}</span></p>
      <ul className="reserve-list">
        {list.map((t) => (
          <li key={t.id} className="reserve" data-id={t.id} data-task={t.id} tabIndex="0"
              onKeyDown={(e) => { if (e.target === e.currentTarget && e.key === "Enter") onEdit(t.id); }}>
            <span className="reserve__mark">{icon("clock")}</span>
            {t.at != null && <span className="reserve__time">{clock(t.at)}</span>}
            <span className="reserve__name">{t.title}</span>
            <span className="reserve__time">{fmt(t.min)}</span>
            <div className="actions">
              {clickupLink(t)}
              <button className="action" type="button" title="editar" aria-label={"Editar reserva: " + t.title} onClick={() => onEdit(t.id)}>{icon("pencil")}</button>
              <button className="action" type="button" title="duplicar (Ctrl+D)" aria-label={"Duplicar reserva: " + t.title} onClick={() => onDuplicate(t.id)}><CopyIcon /></button>
              <button className="action" type="button" aria-label={"Remover reserva: " + t.title} onClick={() => onRemove(t.id)}>{icon("trash")}</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- a linha da tarefa ----------
   o titulo e um campo controlado por um rascunho local: uma sincronizacao que
   chega no meio da digitacao nao apaga o que esta sendo escrito, e o change
   (blur ou Enter) e quem grava. */
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
      if (inTitle) actions.rename(t.id, draft);
      actions.move(t.id, e.key === "ArrowUp" ? -1 : 1, "row");
      return;
    }
    if (inTitle) {
      if (e.key === "Enter") { e.preventDefault(); e.target.blur(); li.focus(); }
      else if (e.key === "Escape") {
        /* o valor volta no DOM antes do blur, senao o change gravaria a edicao
           que o Esc quis jogar fora */
        e.target.value = t.title;
        setDraft(t.title);
        e.target.blur();
        li.focus();
      }
      return;
    }
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
    <li className={"task" + (dragging ? " is-dragging" : "") + (leaving ? " is-leaving" : "")} data-id={t.id} data-task={t.id}
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
                aria-label={t.min ? "Duração: " + longFmt(t.min) + ". Alterar" : "Sem duração, contando " + longFmt(guessMin()) + " como palpite. Definir"}
                onClick={() => setEditingTime(true)}>{icon("clock")}<span>{(t.min ? fmt(t.min) : "definir duração · contando " + fmt(guessMin())) + partial}</span></button>}
          {(!!client || !!t.origin) && (
            <div className="task__badges">
              <ClientBadge id={t.client} />
              {t.origin && ORIGIN_LABEL[t.origin.type] && <span className="badge">{ORIGIN_LABEL[t.origin.type]}</span>}
            </div>
          )}
        </div>
      </div>
      <div className="actions">
        {clickupLink(t)}
        <button className="action" type="button" disabled={!!actions.thinking} data-thinking={actions.thinking === t.id ? "yes" : null}
          title={actions.thinking === t.id ? "pensando…" : "perguntar ao Merlin: dá para fazer com o Claude?"}
          aria-label={"Perguntar ao Merlin se dá para fazer com o Claude: " + t.title} onClick={() => actions.delegate(t)}>{icon("spark")}</button>
        <button className="action" type="button" title="duplicar (Ctrl+D)" aria-label={"Duplicar: " + t.title} onClick={() => actions.duplicate(t.id)}><CopyIcon /></button>
        <button className="action" type="button" aria-label={"Apagar: " + t.title} onClick={() => actions.remove(t.id)}>{icon("trash")}</button>
      </div>
      <button className="grip" type="button" aria-label={"Arrastar para reordenar: " + t.title} onPointerDown={(e) => actions.dragStart(e, t.id)}>{icon("grip")}</button>
    </li>
  );
}

/* ---------- editar duracao na propria linha ----------
   no lugar exato onde ela e lida. Enter e blur aplicam; Esc cancela. so grava
   o que foi entendido: "45" sem unidade nao apaga a estimativa que ja existia. */
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

/* ---------- dia vazio ---------- */
function EmptyState({ doc, b }) {
  const debut = doc.tasks.length === 0;
  const sub = b.overtime
    ? "Passou das " + clock(doc.end) + " e não sobrou nada na fila."
    : (!debut ? "Nada na fila. Dá para puxar mais alguma coisa, ou parar por aqui." : "Escreva embaixo a primeira coisa que precisa caber hoje.");
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
        ? "Escreva assim, com a duração no fim: ela sai do título e entra na barra do dia."
        : "Com a duração no fim — “revisar proposta 45m”, “gravar 1h30”, “almoço 1h”. Sem ela, eu pergunto."}</p>
    </div>
  );
}

/* ---------- concluidas ---------- */
function DoneList({ done, isOpen, onToggle, onClear, onReopen }) {
  return (
    <section className="done" data-open={isOpen ? "yes" : "no"}>
      <p className="section-label">
        <button className="pill" type="button" id="done-toggle" aria-expanded={String(!!isOpen)} onClick={onToggle}>
          <ChevronIcon /><span>{done.length + (done.length === 1 ? " concluída" : " concluídas")}</span>
        </button>
        <button className="pill pill--icon" type="button" id="done-clear" title="limpar as concluídas" aria-label="Limpar as concluídas" onClick={onClear}>{icon("trash")}</button>
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
function Composer({ b, text, setText, pending, fieldRef, onSubmit, onPick, onOther, onEscape }) {
  const [focused, setFocused] = useState(false);
  const raw = text.replace(/\s+/g, " ").trim();
  let ghost = null;
  if (focused && !pending && raw) {
    const { min, title, clickup, noLink, client } = readLine(text);
    const fits = !min || min <= b.slack;
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
    </div>
  );
}

/* ---------- os chips de duracao ----------
   toda tarefa que entra em hoje tem duracao: quando o texto nao traz uma, ela
   e perguntada aqui antes de a tarefa existir. e um passo, nao um erro. */
function Chips({ pending, slack, onPick, onOther, onEscape }) {
  const rowRef = useRef(null);
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

/* ---------- caixa de notas ----------
   linha mais leve que a da tarefa de proposito: nota nao tem duracao, entao
   ela nao tem a coluna de medida que toda tarefa tem. */
function NotesBox({ notes, onCreate, onPull, onRemove }) {
  const [text, setText] = useState("");
  const submit = (e) => {
    e.preventDefault();
    const m = parseMentions(text);
    if (onCreate(m.title, m)) setText("");
  };
  return (
    <section className="block" id="notes">
      <p className="section-label">
        <span className="t-mono">{notes.length ? notes.length + (notes.length === 1 ? " nota" : " notas") : "notas"}</span>
        <a className="text-link" href="notes.html">todas</a>
      </p>
      <p className="notes__note">não custam minuto nenhum até virarem tarefa</p>
      {!notes.length && <p className="notes__empty">Nada aqui. Escreva embaixo o que ainda não é tarefa.</p>}
      <ul className="note-list">
        {notes.map((i) => (
          <li key={i.id} className="note" data-id={i.id}>
            <span className="note__name">{i.title}</span>
            <span className="note__actions">
              <a className="note__action" href={"notes.html#" + encodeURIComponent(i.id)} title="abrir a nota" aria-label={'Abrir "' + i.title + '"'}>{icon("link")}</a>
              <button className="note__action" type="button" title="apagar" aria-label={'Apagar "' + i.title + '"'} onClick={() => onRemove(i.id)}>{icon("trash")}</button>
            </span>
            <button className="note__pull" type="button" title="puxar para o dia — ela vai pedir a duração"
              aria-label={'Puxar "' + i.title + '" para o dia'} onClick={() => onPull(i.id)}>{icon("clock")}<span>puxar</span></button>
          </li>
        ))}
      </ul>
      <form className="note-form" autoComplete="off" onSubmit={submit}>
        <input id="note-field" maxLength="300" placeholder="uma nota" aria-label="Nova nota" value={text} onChange={(e) => setText(e.currentTarget.value)} />
      </form>
    </section>
  );
}

/* ================================================================
   a visao da semana — uma grade de horas
   ================================================================
   era um quadro de sete colunas com cartoes empilhados: dava para ver o que
   havia em cada dia, mas nao QUANDO, e uma reuniao das 15h e uma tarefa sem
   hora eram o mesmo retangulo. agora e a grade de uma agenda: uma coluna por
   dia, uma linha por hora, e cada coisa com a altura do tempo que ocupa.

   quem tem hora fica na hora; quem nao tem entra em fila a partir do comeco
   da janela do dia e desvia de quem tem (a conta e o layoutDay do tasks.js).
   o horario de quem esta em fila aparece com "~", porque e onde ela CAIRIA, e
   nao um compromisso.

   reunioes e pausas tem outra cara: fundo apagado, relogio e sem caixa de
   marcar — elas nao se concluem, so ocupam.

   arrastar um bloco grava o dia e a hora onde ele caiu; puxar a borda de
   baixo muda a duracao. clicar num espaco vazio cria ali. */
const HOUR_H = 44;
const SNAP = 15;
const snap = (min) => Math.round(min / SNAP) * SNAP;
const clampMin = (min) => Math.max(0, Math.min(1440 - SNAP, min));
const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

function WeekGrid({ all, pieces = [], weekStart, prefs, actions, onNew, onOpenDay, onMove }) {
  const days = WEEK_DAYS(weekStart);
  const t = today();
  const scrollRef = useRef(null);
  const grab = useRef(null);
  const [drop, setDrop] = useState(null);

  /* abre na hora em que o dia comeca, com uma hora de folga acima: a
     madrugada existe, mas nao e onde se olha primeiro */
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, (prefs.dayStart / 60 - 1) * HOUR_H);
  }, [weekStart]);

  const minuteAt = (lane, clientY) => (clientY - lane.getBoundingClientRect().top) / HOUR_H * 60;

  return (
    <div className="wk">
      <div className="wk__scroll" ref={scrollRef}>
      <div className="wk__head">
        <div className="wk__corner" />
        {days.map((day, i) => {
          const list = onDate(all, day);
          const meetings = list.filter((x) => x.reserved);
          const open = list.filter((x) => !x.reserved && !x.done);
          const meetMin = meetings.reduce((s, x) => s + (x.min || 0), 0);
          return (
            <div key={day} className={"wk__day" + (day === t ? " is-today" : "")} data-day={day}>
              <button className="wk__dayname" type="button" title="abrir esse dia" onClick={() => onOpenDay(day)}>
                <span className="t-mono">{WEEKDAYS[i]}</span><b>{dayNumber(day)}</b>
              </button>
              <p className="wk__sum t-mono">
                <span>{open.length ? open.length + (open.length === 1 ? " tarefa" : " tarefas") : " "}</span>
                <span className="wk__sum-meet">{meetings.length ? fmt(meetMin || meetings.length * 30) + " em reuniões" : " "}</span>
              </p>
              {pieces.filter((p) => p.date === day).map((p) => <PieceMark key={p.id} p={p} />)}
            </div>
          );
        })}
      </div>
        <div className="wk__body" style={{ height: 24 * HOUR_H }}>
          <div className="wk__hours" aria-hidden="true">
            {Array.from({ length: 24 }, (_, h) => <span key={h} style={{ top: h * HOUR_H }}>{h ? String(h).padStart(2, "0") + ":00" : ""}</span>)}
          </div>
          {days.map((day) => {
            const blocks = layoutDay(onDate(all, day), { start: prefs.dayStart, guess: guessMin() });
            const isToday = day === t;
            return (
              <div key={day} className={"wk__lane" + (isToday ? " is-today" : "")} data-day={day}
                   style={{ "--win-from": (prefs.dayStart / 60 * HOUR_H) + "px", "--win-to": (prefs.dayEnd / 60 * HOUR_H) + "px" }}
                   onClick={(e) => { if (e.target === e.currentTarget) onNew(day, clampMin(Math.floor(minuteAt(e.currentTarget, e.clientY) / 30) * 30)); }}
                   onDragOver={(e) => {
                     if (!grab.current) return;
                     e.preventDefault();
                     e.dataTransfer.dropEffect = "move";
                     const from = clampMin(snap(minuteAt(e.currentTarget, e.clientY) - grab.current.offset));
                     setDrop((d) => (d && d.day === day && d.from === from ? d : { day, from, len: grab.current.len }));
                   }}
                   onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrop((d) => (d && d.day === day ? null : d)); }}
                   onDrop={(e) => {
                     e.preventDefault();
                     const g = grab.current;
                     setDrop(null);
                     if (!g) return;
                     onMove(g.id, day, clampMin(snap(minuteAt(e.currentTarget, e.clientY) - g.offset)));
                   }}>
                {blocks.map((b) => (
                  <WeekBlock key={b.t.id} b={b} actions={actions}
                    onGrab={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      grab.current = { id: b.t.id, offset: (e.clientY - r.top) / HOUR_H * 60, len: b.to - b.from };
                    }}
                    onRelease={() => { grab.current = null; setDrop(null); }} />
                ))}
                {drop && drop.day === day && (
                  <div className="wk__drop" style={{ top: drop.from / 60 * HOUR_H, height: drop.len / 60 * HOUR_H - 2 }}>
                    <span className="t-mono">{clock(drop.from)}</span>
                  </div>
                )}
                {isToday && <div className="wk__now" style={{ top: nowMinutes() / 60 * HOUR_H }} aria-hidden="true" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* um bloco da grade. a borda de baixo e a alca de duracao: arrastar para
   baixo aumenta, para cima diminui, de quinze em quinze minutos. */
function WeekBlock({ b, actions, onGrab, onRelease }) {
  const x = b.t;
  const [resize, setResize] = useState(null);
  const to = resize ? resize.to : b.to;
  const height = Math.max(14, (to - b.from) / 60 * HOUR_H - 2);
  const short = height < 34;
  const time = (b.fixed ? "" : "~") + clock(b.from) + (short ? "" : "–" + clock(to));

  const startResize = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const y0 = e.clientY, base = b.to;
    let last = base;
  /* o nome do cliente em cima, na cor dele, so quando sobra altura: num bloco
     de meia hora a cor ja diz de quem e */
  const client = clientName(x.client);
  const tall = height >= 52;
    const move = (ev) => {
      last = Math.max(b.from + SNAP, Math.min(1440, b.from + snap(base - b.from + (ev.clientY - y0) / HOUR_H * 60)));
      setResize({ to: last });
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      setResize(null);
      if (last !== base) actions.setDuration(x.id, last - b.from);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

  return (
    <div className={"wk__block" + (x.reserved ? " is-reserved" : " is-task") + (x.done ? " is-done" : "") + (b.fixed ? "" : " is-loose") + (short ? " is-short" : "") + (b.cols > 1 ? " is-narrow" : "") + (actions.dragging === x.id ? " is-dragging" : "")}
         data-task={x.id} tabIndex="0" draggable={resize ? "false" : "true"}
         title={(client ? client + " · " : "") + x.title + " · " + time + (b.fixed ? "" : " (na fila, sem horário)")}
         style={{ ...agendaStyle(x.client), top: b.from / 60 * HOUR_H, height, left: "calc(" + (b.col / b.cols * 100) + "% + 2px)", width: "calc(" + (100 / b.cols) + "% - 4px)" }}
         onDragStart={(e) => { onGrab(e); actions.onDragStart(e, x); }}
         onDragEnd={() => { onRelease(); actions.onDragEnd(); }}
         onClick={(e) => { if (!e.target.closest("button")) actions.edit(x.id); }}
         onKeyDown={(e) => { if (e.target === e.currentTarget && e.key === "Enter") { e.preventDefault(); actions.edit(x.id); } }}>
      {x.reserved
        ? <span className="wk__icon" aria-hidden="true">{icon("clock")}</span>
        : <button className="mark wk__check" type="button" role="checkbox" aria-checked={String(x.done)}
                  aria-label={"Concluir: " + x.title} onClick={() => actions.toggleDone(x, !x.done)}>{icon("check")}</button>}
      <span className="wk__text">
        <b>{x.title}</b>
        <span className="t-mono">{time}</span>
      </span>
      <span className="wk__resize" onPointerDown={startResize} aria-hidden="true" />
    </div>
  );
        {client && tall && <span className="wk__client">{client}</span>}
}

/* ================================================================
   a visao do mes
   ================================================================
   a unica das tres que nao existia. ela nao faz conta nenhuma de propósito:
   um mes que somasse horas estaria prometendo capacidade para trinta dias de
   uma vez, e a promessa do produto e sobre UM dia. aqui o que se ve e onde as
   coisas estao — e o gesto que ela da e mudar isso de lugar.

   reunioes e pausas moram numa faixa propria, acima das tarefas: elas nao
   sao o que voce tem para fazer, sao o que tira tempo de fazer, e na mesma
   lista disputavam as tres vagas da celula com o trabalho. */
const MONTH_MAX = 3;

/* a peca de conteudo que vai ao ar naquele dia: um link para ela, com o play
   no lugar da bolinha. publicada fica apagada, como tarefa feita. */
const PLAY = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>;
function PieceMark({ p }) {
  return (
    <a className={"piece-mark" + (p.stage === "published" ? " is-done" : "")} href={"content.html#" + encodeURIComponent(p.id)} title={"conteúdo: " + p.title}>
      {PLAY}<span>{p.title}</span>
    </a>
  );
}

function MonthView({ all, pieces = [], month, target, actions, onNew, onOpenDay, onEnter, onLeave, onDrop }) {
  const weeks = monthGrid(month);
  const t = today();
  const item = (x) => (
    <button key={x.id} type="button" draggable="true" data-id={x.id} data-task={x.id}
            className={"month__item" + (x.done ? " is-done" : "") + (x.reserved ? " is-reserved" : "")}
            style={agendaStyle(x.client)}
            title={(x.client ? clientName(x.client) + " · " : "") + x.title + (x.at != null ? " · " + clock(x.at) : "") + (x.min ? " · " + fmt(x.min) : "")}
            onDragStart={(e) => actions.onDragStart(e, x)} onDragEnd={actions.onDragEnd}
            onClick={() => actions.edit(x.id)}>
      {x.reserved ? <span className="month__clock" aria-hidden="true">{icon("clock")}</span> : <i aria-hidden="true" />}
      {x.at != null && <span className="month__at t-mono">{clock(x.at)}</span>}
      <span className="month__title">{x.title}</span>
    </button>
  );
  return (
    <div className="month">
      {WEEKDAYS.map((w) => <div key={w} className="month__head">{w}</div>)}
      {weeks.map((week) => week.map((day) => {
        const list = onDate(all, day);
        const meetings = list.filter((x) => x.reserved).sort((a, b) => (a.at ?? 9999) - (b.at ?? 9999));
        const work = list.filter((x) => !x.reserved);
        const out = monthOf(day) !== month;
        const openWork = work.filter((x) => !x.done).length;
        return (
          <div key={day} data-day={day}
               className={"month__cell" + (out ? " is-out" : "") + (day === t ? " is-today" : "") + (target === day ? " is-over" : "")}
               onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
               onDragEnter={() => onEnter(day)}
               onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) onLeave(day); }}
               onDrop={(e) => onDrop(e, day)}
               onDoubleClick={(e) => { if (e.target === e.currentTarget) onNew(day); }}>
            <button className="month__day" type="button" title={"abrir " + dateLabel(day)} onClick={() => onOpenDay(day)}>
              <span className="month__n">{dayNumber(day)}</span>
              {work.length > 0 && <span className="month__count">{openWork || "✓"}</span>}
            </button>
            {pieces.filter((p) => p.date === day).map((p) => <PieceMark key={p.id} p={p} />)}
            {meetings.length > 0 && (
              <div className="month__meetings">
                {meetings.slice(0, 2).map(item)}
                {meetings.length > 2 && <button className="month__more" type="button" onClick={() => onOpenDay(day)}>{"+" + (meetings.length - 2) + " reuniões"}</button>}
              </div>
            )}
            {work.slice(0, MONTH_MAX).map(item)}
            {work.length > MONTH_MAX && (
              <button className="month__more" type="button" onClick={() => onOpenDay(day)}>
                {"e mais " + (work.length - MONTH_MAX)}
              </button>
            )}
          </div>
        );
      }))}
    </div>
  );
}

/* ================================================================
   a caixa da tarefa: criar e editar sao a mesma
   ================================================================
   no titulo, "@cliente" e a duracao no fim continuam valendo — e a mesma
   gramatica do campo do dia — mas os campos ao lado ganham quando preenchidos.

/* ================================================================
   a barra das agendas
   ================================================================
   um mes pequeno para pular de data, e a lista das agendas com a caixa na
   cor de cada uma. o numero ao lado e quantas tarefas ela tem no periodo
   aberto — conta, nao duracao: so o dia tem minutos. */
function CalSide({ anchor, view, weekStart, all, clients, off, onPick, onToggle, onOnly, onShowAll }) {
  const [month, setMonth] = useState(monthOf(anchor));
  useEffect(() => { setMonth(monthOf(anchor)); }, [anchor]);
  const shiftMonth = (n) => {
    const d = dateOf(month + "-01");
    setMonth(monthOf(dayOf(new Date(d.getFullYear(), d.getMonth() + n, 1))));
  };
  const t = today();
  const weekEnd = addDays(weekStart, 6);
  const grid = monthGrid(monthOf(anchor));
  const [from, to] = view === "week" ? [weekStart, weekEnd] : [grid[0][0], grid[grid.length - 1][6]];
  const counts = new Map();
  inRange(all, from, to).forEach((x) => { const k = x.client || ""; counts.set(k, (counts.get(k) || 0) + 1); });
  const busy = new Set(all.filter((x) => monthOf(x.date || "") === month).map((x) => x.date));
  const agendas = [{ key: "", name: "pessoal" }, ...clients.map((c) => ({ key: c.id, name: c.name }))];
  const y = month.slice(0, 4);

  return (
    <aside className="calside" aria-label="Agendas">
      <div className="mini">
        <div className="mini__head">
          <button className="action" type="button" aria-label="Mês anterior" onClick={() => shiftMonth(-1)}>{icon("chevronLeft")}</button>
          <b>{monthLabel(month).replace(/\s*\d{4}$/, "")} <span>{y}</span></b>
          <button className="action" type="button" aria-label="Próximo mês" onClick={() => shiftMonth(1)}>{icon("chevronRight")}</button>
        </div>
        <div className="mini__grid">
          {WEEKDAYS.map((w) => <span key={w} className="mini__wd" aria-hidden="true">{w.slice(0, 1)}</span>)}
          {monthGrid(month).flat().map((day) => (
            <button key={day} type="button" data-day={day} aria-label={dateLabel(day)} aria-pressed={String(day === anchor)}
                    className={"mini__day" + (day.slice(0, 7) !== month ? " is-out" : "") + (day === t ? " is-today" : "")
                      + (view === "week" && day >= weekStart && day <= weekEnd ? " is-in" : "") + (busy.has(day) ? " is-busy" : "")}
                    onClick={() => onPick(day)}>{dayNumber(day)}</button>
          ))}
        </div>
      </div>

      <div className="agendas">
        <p className="agendas__title">
          <span>agendas</span>
          {off.size > 0 && <button className="text-link" type="button" onClick={onShowAll}>mostrar todas</button>}
        </p>
        <ul>
          {agendas.map((a) => (
            <li key={a.key || "pessoal"} className={"agenda" + (off.has(a.key) ? " is-off" : "")} style={agendaStyle(a.key)}>
              <label>
                <input type="checkbox" checked={!off.has(a.key)} onChange={() => onToggle(a.key)} />
                <span className="agenda__box" aria-hidden="true">{icon("check")}</span>
                <span className="agenda__name">{a.name}</span>
              </label>
              <button className="agenda__only" type="button" title={"mostrar só " + a.name} onClick={() => onOnly(a.key)}>só</button>
              <span className="agenda__n t-mono">{counts.get(a.key) || ""}</span>
            </li>
          ))}
        </ul>
        {!clients.length && <p className="agendas__hint">cada cliente vira uma agenda com cor própria. <a href="clients.html">cadastrar clientes</a></p>}
      </div>
    </aside>
  );
}

   o horario e opcional: sem ele a tarefa e so uma posicao na fila do dia. e
   "reuniao ou pausa" deixou de ser so um palpite pelo titulo — o palpite
   continua marcando a caixa, mas agora da para desmarcar. */
function TaskForm({ store, id, presetDate, presetAt, presetClient, onClose, onRemove, onDuplicate }) {
  const c = id ? store.get(id) : null;
  const [v, bind, set] = useFields({
    title: c ? c.title : "",
    date: c ? c.date : presetDate,
    at: c ? (c.at != null ? clock(c.at) : "") : (presetAt != null ? clock(presetAt) : ""),
    duration: c && c.min ? formatMin(c.min) : "",
    client: c ? c.client : (presetClient || ""),
    reserved: !!(c && c.reserved)
  });
  const touchedReserve = useRef(!!c);
  if (id && !c) return null;
  const submit = () => {
    const found = parseMentions(v.title);
    const parsed = parseDuration(found.title);
    const title = parsed.title.trim().slice(0, 300);
    if (!title) { notify("a tarefa precisa de um título"); return false; }
    if (!isDay(v.date)) { notify("preciso de uma data"); return false; }
    const at = readClock(v.at);
    if (at === undefined) { notify("não entendi o horário — escreva como 9h30 ou 14:00"); return false; }
    const min = parseDuration(v.duration).min || parsed.min;
    const client = v.client || found.client;
    const reserved = touchedReserve.current ? v.reserved : (v.reserved || isReserve(title));
    if (c) store.save({ ...c, title, date: v.date, at, client, min, reserved, updatedAt: Date.now() });
    else store.save(newTask({ title, date: v.date, at, client, min, reserved }));
  };
  return (
    <Form title={c ? "tarefa" : "nova tarefa"} submit={c ? "salvar" : "adicionar"} remove={c ? "apagar" : ""}
          onRemove={() => { onRemove(id); onClose(); }} onClose={onClose} onSubmit={submit}
          aside={c && <button className="link" type="button" title="Ctrl+D duplica · Ctrl+C e Ctrl+V copiam e colam"
                              onClick={() => { onDuplicate(id); onClose(); }}>duplicar</button>}>
      <input className="input task-form__title full" maxLength="300" required aria-label="título"
             placeholder="o que fazer · @cliente · 45m" {...bind("title")}
             onBlur={(e) => { if (!touchedReserve.current) set("reserved", isReserve(e.currentTarget.value)); }} />
      <div className="full task-form__when">
        <Field label="dia"><DateField required {...bind("date")} /></Field>
        <Field label="horário"><input className="input input--mono" placeholder="—" inputMode="numeric" {...bind("at")} /></Field>
        <Field label="duração"><input className="input input--mono" placeholder="45m" {...bind("duration")} /></Field>
      </div>
      <Field label="cliente" full><select className="select" {...bind("client")}>{clientOptionList("sem cliente")}</select></Field>
      <div className="full chips">
        <button className="chip" type="button" aria-pressed={v.reserved} title="ocupa o tempo, mas não é trabalho para concluir"
                onClick={() => { touchedReserve.current = true; set("reserved", !v.reserved); }}>reunião ou pausa</button>
        {/* o que se repete toda semana mora na rotina, e nao numa tarefa: a
            copia so aponta para la */}
        {c && c.origin && c.origin.type === "routine" && <a className="chip" href="routine.html" title="mudar aqui muda só esta semana">vem da rotina</a>}
      </div>
    </Form>
  );
}

function MerlinDialog({ text, onClose }) {
  return (
    <Dialog title="a semana, pelo merlin" label="Resumo da semana" wide onClose={onClose}
        actions={<button className="pill" type="button" onClick={onClose}>fechar</button>}>
      <Markdown className="merlin-text" text={text} />
    </Dialog>
  );
}

/* ================================================================
   a matriz de eisenhower
   ================================================================
   um instrumento de ordenacao, e so isso: o quadrante NAO e gravado. ele
   existe enquanto a folha esta aberta e morre ao fechar. o que sobra e a
   unica ordenacao que o produto tem, que e a ordem da fila. */
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

/* a juncao das duas colecoes antigas roda antes da primeira pintura: uma tela
   que nascesse vazia e se corrigisse um instante depois seria pior que uma que
   demora um quadro a mais para existir. */
migrateTasks();

mount(<Calendar />, "app");
