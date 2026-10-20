/* merlin · o que falta hoje (a secretária, D3 e D4)
 *
 * "o que falta hoje?" responde com UMA coisa: a próxima. a lista tem só dois
 * grupos, nessa ordem — o que é agora (a sessão de foco rodando, um
 * compromisso com hora que começa em até 30 minutos ou já está em curso, o
 * treino do dia que ainda não aconteceu e o processo da empresa que vence
 * hoje ou venceu no período) e o que ficou para trás (as atrasadas
 * e as contas previstas de dias passados). a fila do dia, o que vence hoje e o
 * conteúdo não entram: o dia inteiro mora no calendário, e uma lista que
 * repetisse a fila viraria a segunda fila.
 *
 * os hábitos também não entram, com UMA exceção (D8 do PRD saude-completa,
 * sobre a D4 da secretária): o treino. quem treina em dia de treino só
 * descobre que esqueceu à noite; os outros hábitos continuam na grade. a
 * exceção é só o treino, e nenhum outro hábito entra por aqui.
 *
 * é a conta de três telas: o cartão da conversa no início, o "agora" do
 * rastreador e o cartão que o Merlin pede com `show:"quests"`. uma verdade só
 * (PRD da secretária): as três leem daqui, e nenhuma monta a lista sozinha.
 *
 * cada grupo vem de uma fonte em SOURCES. fonte nova é uma linha ali (as
 * contas previstas de dias passados entraram assim). mais de dois itens da
 * mesma fonte viram um item só, que abre a tela deles (`many`).
 *
 * a palavra "quest" fica no código: na tela, nunca (VISAO, 11). */
import { dayOf } from "./core.js";
import { overdue, onDate, dayTasks, topOrder } from "./tasks.js";
import { runningOf, minutesOf } from "./focus.js";
import { costOf } from "./day.js";
import { pendingBefore } from "./finance-data.js";
import { isExpected, weekProgress } from "./habits-data.js";
import { trainingHabit } from "./workouts-data.js";
import { pendingOn } from "./ops-data.js";

/* quantos minutos antes o compromisso já é "agora" */
export const SOON = 30;
export const DAY_HREF = "calendar.html#day";
export const FINANCE_HREF = "finance.html";

/* ---------- as fontes ---------- */

function sessionNow(data, ctx) {
  const s = runningOf(data.sessions || []);
  if (!s) return [];
  return [{ type: "session", id: "session:" + s.id, title: s.title, session: s, task: s.task || "", elapsed: minutesOf(s, ctx.at), min: +s.planned || 0 }];
}

/* a tarefa ou a reserva de hoje com hora: começa em até SOON minutos ou está
   em curso (at <= agora < at + duração). a que está em foco não aparece de
   novo como compromisso */
function appointmentsNow(data, ctx) {
  const s = runningOf(data.sessions || []);
  return onDate(ctx.count, ctx.date)
    .filter((t) => !t.done && t.at != null && !(s && s.task === t.id))
    .filter((t) => ctx.minute >= t.at - SOON && ctx.minute < t.at + costOf(t))
    .sort((a, b) => a.at - b.at)
    .map((t) => ({ type: "appointment", id: "task:" + t.id, title: t.title, task: t, at: t.at, min: t.min, live: ctx.minute >= t.at, wait: Math.max(0, t.at - ctx.minute) }));
}

/* as atrasadas, da mais antiga para a mais nova. a reserva de ontem não
   está aqui: ela passa com o dia, não fica devendo (overdue já tira) */
const lateTasks = (data, ctx) =>
  overdue(data.tasks || [], ctx.date).map((t) => ({ type: "overdue", id: "task:" + t.id, title: t.title, task: t, date: t.date, min: t.min }));
const lateGroup = (items) =>
  ({ type: "overdue-group", id: "overdue-group", title: items.length + " atrasadas", count: items.length, href: DAY_HREF, items });

/* as contas previstas cujo dia já passou: aconteceu ou não? a de hoje e a do
   futuro não entram (D4), e a conta é a mesma da aba hoje do financeiro */
const lateBills = (data, ctx) =>
  pendingBefore(ctx.date, { entries: (data.entries || []).filter((e) => e.type === "entry") })
    .map(({ it: e }) => ({ type: "bill", id: "entry:" + e.id, title: e.name, entry: e, date: e.day, amount: e.amount, kind: e.kind }));
const billGroup = (items) =>
  ({ type: "bill-group", id: "bill-group", title: items.length + " contas a confirmar", count: items.length, href: FINANCE_HREF, items });

/* o treino de hoje que ainda não houve (D8). há hábito de treino, hoje é dia
   dele — todo dia, ou um dos dias marcados, ou "N por semana" com a meta da
   semana ainda por bater — e não há treino registrado nem marca hoje */
function trainingNow(data, ctx) {
  const h = trainingHabit(data.habits, "");
  if (!h || h.marks[ctx.date]) return [];
  if ((data.workouts || []).some((w) => w && !w.deleted && w.day === ctx.date)) return [];
  const week = h.schedule.type === "perWeek" ? weekProgress(h, ctx.date) : null;
  if (week ? week.done >= week.goal : !isExpected(h, ctx.date)) return [];
  return [{ type: "workout", id: "workout:" + ctx.date, title: "treinar", habit: h, min: h.min, week }];
}

/* o processo da empresa que vence hoje, ou que venceu no período e não foi
   feito (PRD meu-negocio, D6). é prazo e não tempo: entra aqui, e nunca vira
   tarefa no calendário */
const opsNow = (data, ctx) =>
  pendingOn(data.ops, ctx.date).map(({ op, due, late }) => ({ type: "op", id: "op:" + op.id + ":" + due, title: op.title, op, due, late }));

export const SOURCES = [
  { key: "session", group: "now", list: sessionNow },
  { key: "appointment", group: "now", list: appointmentsNow },
  { key: "workout", group: "now", list: trainingNow },
  { key: "op", group: "now", list: opsNow },
  { key: "overdue", group: "behind", list: lateTasks, many: lateGroup },
  { key: "bill", group: "behind", list: lateBills, many: billGroup }
];

/* ---------- a lista ---------- */

/* data = { tasks, sessions, blocks?, entries?, habits?, workouts?, ops? }: as
   coleções inteiras, como `all()` as devolve (`entries` é a coleção `finance`;
   só os lançamentos contam; `habits` e `workouts` só servem ao treino do dia, e
   `ops` aos processos da empresa). now é Date ou epoch ms. a conta do dia é a mesma do calendário e do
   rastreador (dayTasks): a cópia da rotina conta. */
export function questsOf(data, now) {
  const at = now instanceof Date ? now.getTime() : +now || Date.now();
  const d = new Date(at);
  const ctx = { at, date: dayOf(d), minute: d.getHours() * 60 + d.getMinutes(), count: dayTasks((data && data.tasks) || [], data && data.blocks).count };
  const out = { now: [], behind: [] };
  SOURCES.forEach((src) => {
    const items = src.list(data || {}, ctx);
    out[src.group].push(...(src.many && items.length > 2 ? [src.many(items, ctx)] : items));
  });
  const done = onDate(ctx.count, ctx.date).filter((t) => t.done && !t.reserved).length;
  const left = out.now.concat(out.behind).reduce((n, q) => n + (q.count || 1), 0);
  return { now: out.now, behind: out.behind, done, left };
}

/* a primeira que não foi pulada ("agora não"), e o título da seguinte. pular
   é estado da página: nada aqui grava */
export function nextQuest(state, skipped) {
  const skip = skipped instanceof Set ? skipped : new Set(skipped || []);
  const open = state.now.concat(state.behind).filter((q) => !skip.has(q.id));
  return { quest: open[0] || null, next: open[1] ? open[1].title : "" };
}

/* "agora não" vale até a lista mudar: quem pula guarda junto esta chave, e
   chave diferente zera os pulos */
export const listKey = (state) => state.now.concat(state.behind).map((q) => q.id).join("|");

export const countLine = (state) => "faltam " + state.left + " · " + state.done + (state.done === 1 ? " feita" : " feitas");

/* o cartão em uma linha, para a conversa guardada (a coleção `chats` não sabe
   desenhar cartão) e para o histórico que vai ao Merlin na próxima pergunta */
export function questsText(state) {
  const { quest, next } = nextQuest(state, []);
  if (!quest) return "nada agora nem para trás · o dia está no calendário";
  return [(state.now.includes(quest) ? "agora: " : "ficou para trás: ") + quest.title, next && "a seguir: " + next, countLine(state)].filter(Boolean).join(" · ");
}

/* ---------- as ações que gravam ----------
   recebem a coleção (de tarefas ou, nas contas, a `finance`) e devolvem o desfazer: o documento de antes,
   gravado de volta. "agora não" não está aqui porque não grava. */
const restore = (store, before) => () => store.save({ ...before, updatedAt: Date.now() });

/* outro dia, amanhã ou hoje: entra no topo da fila daquele dia. para hoje,
   quem chama cobra a duração antes (só o dia tem minutos) e a passa em `min` */
export function moveTask(store, task, date, min) {
  const before = store.get(task.id);
  if (!before) return null;
  store.save({ ...before, date, ...(min ? { min } : {}), order: topOrder(store.all(), date), updatedAt: Date.now() });
  return restore(store, before);
}

export function dropTask(store, task) {
  const before = store.remove(task.id);
  return before ? () => store.save(before) : null;
}

/* reserva não se conclui: concluir devolveria a hora dela à sobra do dia */
export function doneTask(store, task) {
  const before = store.get(task.id);
  if (!before || before.done || before.reserved) return null;
  store.save({ ...before, done: true, updatedAt: Date.now() });
  return restore(store, before);
}

/* "sim, aconteceu": o previsto vira real no mesmo dia, como o "aconteceu" da
   aba hoje do financeiro */
export function paidEntry(store, entry) {
  const before = store.get(entry.id);
  if (!before || before.paid) return null;
  store.save({ ...before, paid: true, updatedAt: Date.now() });
  return restore(store, before);
}

/* "amanhã": o previsto continua previsto, em outro dia */
export function moveEntry(store, entry, day) {
  const before = store.get(entry.id);
  if (!before) return null;
  store.save({ ...before, day, updatedAt: Date.now() });
  return restore(store, before);
}
