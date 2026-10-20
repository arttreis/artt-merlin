/* merlin · o miolo da operação, sem tela
   a coleção `ops` (PRD meu-negocio, D6) guarda os processos recorrentes da
   empresa: emitir notas, pagar o DAS, o backup. operação é PRAZO, não tempo:
   a rotina diz quando se trabalha na semana; aqui só se diz até quando uma
   coisa tem de estar feita, e nada vira tarefa no calendário.

   `{id, title, freq, day, checklist: [{id, text}], done: ["AAAA-MM-DD"], …}`.
   `day` depende da frequência: mensal é o dia do mês (1 a 31; o 31 num mês de
   30 dias vence no último), semanal é o dia da semana (domingo = 0, como a
   rotina, numa semana ISO de segunda a domingo) e anual é "MM-DD".

   o "feito" vale pelo período: o mês, a semana ou o ano. `done` guarda o dia
   em que foi feito, e qualquer dia do período conta.

   quem lê são três: a aba (ops.jsx), o "o que falta hoje?" (quests.js) e a
   conversa (assistant-actions.js, "todo dia 5 emito as notas" e "emiti as
   notas"). */
import { dayOf, addDays, dateOf, mondayOf, isDay, foldKey } from "./core.js";

export const FREQS = [
  { id: "monthly", label: "todo mês" },
  { id: "weekly", label: "toda semana" },
  { id: "yearly", label: "todo ano" }
];

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const DEFAULT_DAY = { monthly: 1, weekly: 1, yearly: "01-01" };

const pad = (n) => String(n).padStart(2, "0");
const lastDay = (y, m) => new Date(y, m, 0).getDate(); // m de 1 a 12

/* "02-29" vale (o ano bissexto existe); "02-30" e "13-01", não */
function monthDay(v) {
  const m = String(v || "").match(/^(\d{2})-(\d{2})$/);
  if (!m || +m[1] < 1 || +m[1] > 12 || +m[2] < 1 || +m[2] > lastDay(2024, +m[1])) return null;
  return m[1] + "-" + m[2];
}

function dayFor(freq, v) {
  if (freq === "yearly") return monthDay(v) || DEFAULT_DAY.yearly;
  const n = Math.round(+v);
  if (v === "" || v == null || !Number.isFinite(n)) return DEFAULT_DAY[freq];
  return freq === "weekly" ? (n >= 0 && n <= 6 ? n : DEFAULT_DAY.weekly) : Math.max(1, Math.min(31, n));
}

let seq = 0;
const itemId = () => "c" + Date.now().toString(36) + (++seq).toString(36);

export function normalize(d) {
  const freq = FREQS.some((f) => f.id === d.freq) ? d.freq : "monthly";
  const done = [...new Set((Array.isArray(d.done) ? d.done : []).filter(isDay))].sort();
  const checklist = (Array.isArray(d.checklist) ? d.checklist : [])
    .map((c) => ({ id: String((c && c.id) || itemId()), text: String((c && c.text) || "").trim().slice(0, 120) }))
    .filter((c) => c.text);
  const out = {
    id: String(d.id || ""),
    title: String(d.title || "").trim().slice(0, 80),
    freq,
    day: dayFor(freq, d.day),
    checklist,
    done,
    createdAt: +d.createdAt || Date.now(),
    updatedAt: +d.updatedAt || +d.createdAt || Date.now()
  };
  if (d.deleted) out.deleted = true;
  return out;
}

const alive = (ops) => (ops || []).filter((o) => o && !o.deleted && o.title);

/* ---------- o período e o prazo ---------- */

/* a chave do período que contém `day`: o mês, a segunda da semana ou o ano */
export function periodOf(op, day) {
  if (op.freq === "weekly") return mondayOf(day);
  if (op.freq === "yearly") return day.slice(0, 4);
  return day.slice(0, 7);
}

/* o prazo no período de `day`. o dia que o mês não tem vence no último */
export function dueOn(op, day) {
  const y = +day.slice(0, 4);
  if (op.freq === "weekly") return addDays(mondayOf(day), (op.day + 6) % 7);
  if (op.freq === "yearly") {
    const [m, d] = String(op.day).split("-").map(Number);
    return y + "-" + pad(m) + "-" + pad(Math.min(d, lastDay(y, m)));
  }
  const m = +day.slice(5, 7);
  return day.slice(0, 7) + "-" + pad(Math.min(op.day, lastDay(y, m)));
}

export const isDone = (op, day) => {
  const key = periodOf(op, day);
  return (op.done || []).some((d) => periodOf(op, d) === key);
};

const byDue = (a, b) => a.due.localeCompare(b.due) || a.op.title.localeCompare(b.op.title);

/* todo prazo entre `from` e `to`, inclusive: a "esta semana" da aba */
export function dueBetween(ops, from, to) {
  const out = [];
  alive(ops).forEach((op) => {
    const seen = new Set();
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const due = dueOn(op, d);
      if (due < from || due > to || seen.has(due)) continue;
      seen.add(due);
      out.push({ op, due, done: isDone(op, due) });
    }
  });
  return out.sort(byDue);
}

/* o que está devendo no período de `day`: o prazo já chegou e não foi feito.
   o prazo de antes do processo existir não conta (quem cria "todo dia 5" no
   dia 20 não nasce devendo o mês) */
export function pendingOn(ops, day) {
  return alive(ops)
    .map((op) => ({ op, due: dueOn(op, day) }))
    .filter(({ op, due }) => due <= day && !isDone(op, day) && dayOf(new Date(op.createdAt)) <= due)
    .map((x) => ({ ...x, late: x.due < day }))
    .sort(byDue);
}

/* o primeiro dia do período seguinte ao de `day` */
export function nextPeriod(op, day) {
  if (op.freq === "weekly") return addDays(mondayOf(day), 7);
  if (op.freq === "yearly") return (+day.slice(0, 4) + 1) + "-01-01";
  const y = +day.slice(0, 4), m = +day.slice(5, 7);
  return m === 12 ? (y + 1) + "-01-01" : y + "-" + pad(m + 1) + "-01";
}

/* ---------- as palavras ---------- */

export function freqLabel(op) {
  if (op.freq === "weekly") return (op.day === 0 || op.day === 6 ? "todo " : "toda ") + WEEKDAYS[op.day];
  if (op.freq === "yearly") return "todo ano em " + String(op.day).slice(3) + "/" + String(op.day).slice(0, 2);
  return "todo dia " + op.day;
}

export function periodLabel(op, day) {
  if (op.freq === "weekly") { const m = mondayOf(day); return "semana de " + m.slice(8) + "/" + m.slice(5, 7); }
  if (op.freq === "yearly") return day.slice(0, 4);
  return MONTHS[+day.slice(5, 7) - 1];
}

export const doneLine = (op, day) => op.title + " · " + periodLabel(op, day);

/* a caixa escreve o dia como se fala: "5", "seg", "15/03" */
export function parseDay(freq, text) {
  const t = foldKey(String(text == null ? "" : text).replace(/-feira/i, ""));
  if (freq === "weekly") {
    if (/^[0-6]$/.test(t)) return +t;
    const i = t.length >= 3 ? WEEKDAYS.findIndex((w) => foldKey(w).startsWith(t)) : -1;
    return i >= 0 ? i : null;
  }
  if (freq === "yearly") {
    const m = String(text || "").trim().match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
    return m ? monthDay(pad(+m[2]) + "-" + pad(+m[1])) : monthDay(String(text || "").trim());
  }
  const m = String(text == null ? "" : text).trim().toLowerCase().match(/^(?:dia\s*)?(\d{1,2})$/);
  return m && +m[1] >= 1 && +m[1] <= 31 ? +m[1] : null;
}

export function dayText(freq, day) {
  if (day === "" || day == null) return "";
  if (freq === "weekly") return SHORT[day] || "";
  if (freq === "yearly") { const md = monthDay(day); return md ? md.slice(3) + "/" + md.slice(0, 2) : ""; }
  return String(day);
}

/* ---------- o que grava ---------- */

/* o processo novo: o dia vem no formato do documento ou como se escreve */
export function opDoc(spec, now) {
  const s = spec || {};
  const title = String(s.title || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!title) return { error: "o processo precisa de um nome" };
  const freq = FREQS.some((f) => f.id === s.freq) ? s.freq : "monthly";
  const day = (freq === "yearly" && monthDay(s.day)) || parseDay(freq, s.day);
  if (day == null) return { error: "qual dia? (5, seg ou 15/03)" };
  const at = +now || Date.now();
  return { doc: { id: itemId(), title, freq, day, checklist: [], done: [], createdAt: at, updatedAt: at } };
}

export function markDone(op, day, today) {
  if (day > today) return { error: "esse dia ainda não chegou" };
  if (isDone(op, day)) return { error: "já estava feito · " + doneLine(op, day) };
  return { doc: { ...op, done: [...op.done, day].sort(), updatedAt: Date.now() } };
}

export function unmarkDone(op, day) {
  const key = periodOf(op, day);
  return { ...op, done: op.done.filter((d) => periodOf(op, d) !== key), updatedAt: Date.now() };
}

/* ---------- o que a pessoa disse ----------
   "emiti as notas" é "emitir notas": sem acento, caixa e artigo, cada palavra
   vira as três primeiras letras, e casa o processo que tem todas as dele no
   que foi dito. com mais de um, o de mais palavras. na dúvida a caixa da
   conversa mostra o processo escolhido, e a pessoa troca */
const STOP = new Set(["a", "o", "as", "os", "de", "do", "da", "dos", "das", "e", "ao", "aos", "no", "na", "pro", "pra", "em"]);
const stems = (text) => String(text || "").toLowerCase().split(/[^a-zà-ÿ0-9]+/i).map(foldKey).filter((w) => w && !STOP.has(w)).map((w) => w.slice(0, 3));

export function findOp(ops, said) {
  const list = alive(ops);
  const key = foldKey(said);
  if (!key) return null;
  const exact = list.find((o) => foldKey(o.title) === key);
  if (exact) return exact;
  const words = new Set(stems(said));
  let best = null, size = 0;
  list.forEach((o) => {
    const own = stems(o.title);
    if (own.length && own.every((w) => words.has(w)) && own.length > size) { best = o; size = own.length; }
  });
  return best;
}

/* ---------- os modelos da tela vazia ---------- */
const model = (id, name, freq, day) => ({ id, name, freq, day, line: freqLabel({ freq, day }) });
export const OPS_TEMPLATES = [
  { key: "fiscal", label: "fiscal", items: [
    model("notes", "emitir notas", "monthly", 5),
    model("das", "pagar DAS", "monthly", 20),
    model("statement", "mandar extrato ao contador", "monthly", 10)
  ] },
  { key: "product", label: "produto", items: [
    model("backup", "backup", "weekly", 5),
    model("domain", "renovar domínio", "yearly", "01-10"),
    model("errors", "revisar erros", "weekly", 1)
  ] },
  { key: "client", label: "cliente", items: [
    model("report", "relatório mensal", "monthly", 1),
    model("billing", "cobrança", "monthly", 5)
  ] }
];
