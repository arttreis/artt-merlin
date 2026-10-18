/* merlin · o miolo dos habitos, sem tela
   normalize, os tipos de frequencia e "o que e esperado hoje" — extraidos de
   habits.jsx para a home poder marcar um habito direto no bento sem puxar a
   pagina inteira (que monta seu proprio initPage/mount). funcoes puras, sem
   colecao nem DOM: quem chama passa o documento e recebe de volta o que
   precisa saber ou gravar.
   desde 18/10/2026 também é daqui que a secretária marca e acha o hábito
   (markOn, findHabit, habitStatus): o início e a conversa. */
import { dateOf, addDays, mondayOf, foldKey } from "./core.js";

export const WEEKDAY_NAMES = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const SCHEDULES = [
  { id: "daily", label: "todo dia" },
  { id: "perWeek", label: "vezes por semana" },
  { id: "weekdays", label: "dias da semana" }
];
export const COLORS = [
  { id: 5, label: "verde" }, { id: 1, label: "azul" }, { id: 2, label: "laranja" },
  { id: 3, label: "rosa" }, { id: 4, label: "roxo" }, { id: 6, label: "ciano" }
];

export function normalize(d) {
  const s = d.schedule && typeof d.schedule === "object" ? d.schedule : {};
  return {
    id: d.id,
    name: String(d.name || "").slice(0, 80),
    schedule: {
      type: SCHEDULES.some((x) => x.id === s.type) ? s.type : "daily",
      times: Math.min(7, Math.max(1, Math.round(+s.times || 3))),
      weekdays: Array.isArray(s.weekdays) ? s.weekdays.map(Number).filter((n) => n >= 0 && n <= 6) : [1, 2, 3, 4, 5]
    },
    min: Math.max(0, Math.round(+d.min || 0)),
    color: +d.color || 5,
    order: Number.isFinite(+d.order) ? +d.order : 0,
    archived: !!d.archived,
    marks: d.marks && typeof d.marks === "object" ? d.marks : {},
    /* o hábito criado pela conversa guarda de onde veio (ticket #10) */
    ...(d.origin && typeof d.origin === "object" ? { origin: { type: String(d.origin.type || "").slice(0, 20) } } : {}),
    createdAt: +d.createdAt || Date.now(),
    updatedAt: +d.updatedAt || +d.createdAt || Date.now()
  };
}

/* o dia e "esperado" quando a frequencia pede marca nele. quem e N vezes por
   semana nao tem dia fixo: nenhum e esperado, e a conta e por semana. */
export function isExpected(h, day) {
  const s = h.schedule;
  if (s.type === "daily") return true;
  if (s.type === "weekdays") return s.weekdays.includes(dateOf(day).getDay());
  return false;
}

/* marca/desmarca o dia: a mesma acao de habits.jsx, pronta pra qualquer
   tela chamar com a colecao que ja tem em mao. */
export function toggleMark(habits, h, day, today) {
  if (day > today) return;
  const marks = { ...h.marks };
  if (marks[day]) delete marks[day]; else marks[day] = true;
  habits.save({ ...h, marks, updatedAt: Date.now() });
}

/* ---------- marcar pela secretária (ticket #10) ----------
   "treinei" escrito no início ou dito na conversa. o toggleMark alterna, e
   falar "treinei" duas vezes desmarcaria: daqui só se marca. */
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

/* marca o dia e nunca desmarca. dia já marcado devolve o mesmo documento, com
   `already`: não há o que gravar. dia que ainda não chegou é erro */
export function markOn(h, day, today) {
  if (day > today) return { error: "esse dia ainda não chegou" };
  if (h.marks[day]) return { doc: h, already: true };
  return { doc: { ...h, marks: { ...h.marks, [day]: true }, updatedAt: Date.now() }, already: false };
}

/* o hábito pelo nome que a pessoa disse: "Treinar" acha "treinar", "ler" acha
   "ler 20 páginas". primeiro o nome exato, depois o começo do nome */
export function findHabit(list, name) {
  const k = foldKey(name);
  if (!k) return null;
  const live = (list || []).filter((h) => h && !h.archived);
  return live.find((h) => foldKey(h.name) === k) || live.find((h) => foldKey(h.name).startsWith(k)) || null;
}

/* o hábito que não existe, como a caixa de novo hábito o recebe */
export const habitDraft = (name) => ({ name: String(name || "").trim().slice(0, 80), schedule: { type: "daily" } });

/* o desfazer: a marca devolve o documento de antes (as marcas de antes); o
   "criar e marcar" apaga o hábito. a mesma forma do undoEntry (finance-data.js) */
export const undoHabit = (before, after) => (before ? { save: before } : { remove: after.id });

/* o dia da marca no aviso e no cartão: "hoje", "ontem" ou "15/10" */
export const markWhen = (day, today) => (day === today ? "hoje" : day === addDays(today, -1) ? "ontem" : day.slice(8, 10) + "/" + day.slice(5, 7));

/* o que o cartão do início e a pílula da conversa mostram para um hábito lido:
   qual é, que dia, se já estava marcado, ou o erro do dia que não chegou */
export function habitStatus(list, spec, today) {
  const s = spec || {};
  const day = isDay(s.date) ? s.date : today;
  const habit = findHabit(list, s.habit || s.name);
  return { habit, day, already: !!(habit && habit.marks[day]), error: day > today ? "esse dia ainda não chegou" : "" };
}

/* ---------- as contas do mes ----------
   moravam em habits.jsx; o retrato (portrait.js) faz as mesmas contas para o
   Merlin, e a tela e o chat nao podem discordar da taxa nem da sequencia.
   `today` entra por parametro: a conta e pura e o teste escolhe o dia. */

export function monthDays(ym) {
  const [y, m] = ym.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => ym + "-" + String(i + 1).padStart(2, "0"));
}

/* feitos e esperados no mes, do dia 1 ate hoje (ou o mes inteiro, se ja
   passou). para N por semana, o esperado de cada semana e min(N, dias da
   semana que ja passaram dentro do mes).

   corrigido em 13/09/2026, por dois erros que davam 60% para 3 marcas em
   13 dias e 133% num habito de dias uteis:
   - o esperado comecava na data de criacao do habito, e nao no dia 1: quem
     cria no dia 9 tinha um "mes" de cinco dias;
   - o feito contava marca em dia que nao era esperado (o sabado de um habito
     de seg a sex), e passava do esperado.
   agora so conta como feito a marca em dia esperado — e, no N por semana,
   no maximo N por semana. o numero nunca passa de 100%. */
export function monthStats(h, ym, today) {
  const days = monthDays(ym).filter((d) => d <= today);
  let done = 0, expected = 0;
  if (h.schedule.type === "perWeek") {
    const weeks = new Map();
    days.forEach((d) => {
      const k = mondayOf(d);
      const w = weeks.get(k) || { n: 0, marks: 0 };
      w.n++; if (h.marks[d]) w.marks++;
      weeks.set(k, w);
    });
    weeks.forEach((w) => {
      const goal = Math.min(h.schedule.times, w.n);
      expected += goal;
      done += Math.min(goal, w.marks);
    });
  } else {
    const due = days.filter((d) => isExpected(h, d));
    expected = due.length;
    done = due.filter((d) => h.marks[d]).length;
  }
  return { done, expected, rate: expected ? Math.round((done / expected) * 100) : 0 };
}

/* a sequencia: dias esperados seguidos com marca, contando para tras a partir
   de hoje (hoje sem marca ainda nao quebra). para N por semana, semanas
   seguidas que bateram a meta, contando a atual so se ja bateu. */
export function streakOf(h, today) {
  if (h.schedule.type === "perWeek") {
    const weekCount = (mon) => { let c = 0; for (let i = 0; i < 7; i++) if (h.marks[addDays(mon, i)]) c++; return c; };
    let n = 0, monday = mondayOf(today);
    if (weekCount(monday) >= h.schedule.times) n++;
    monday = addDays(monday, -7);
    while (n < 520 && weekCount(monday) >= h.schedule.times) { n++; monday = addDays(monday, -7); }
    return n;
  }
  let n = 0, day = h.marks[today] ? today : addDays(today, -1);
  for (let guard = 0; guard < 3000; guard++) {
    if (!isExpected(h, day)) { day = addDays(day, -1); continue; }
    if (!h.marks[day]) break;
    n++; day = addDays(day, -1);
  }
  return n;
}

/* N por semana: quantas marcas a semana de `today` ja tem, ate a meta */
export function weekProgress(h, today) {
  const monday = mondayOf(today);
  let marks = 0;
  for (let i = 0; i < 7; i++) if (h.marks[addDays(monday, i)]) marks++;
  const goal = h.schedule.times;
  return { done: Math.min(marks, goal), goal };
}
