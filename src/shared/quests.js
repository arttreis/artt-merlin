/* merlin · o que falta hoje (a secretária, D3 e D4)
 *
 * "o que falta hoje?" responde com UMA coisa: a próxima. a lista tem só dois
 * grupos, nessa ordem — o que é agora (a sessão de foco rodando, ou um
 * compromisso com hora que começa em até 30 minutos ou já está em curso) e o
 * que ficou para trás (as atrasadas). a fila do dia, os hábitos, o que vence
 * hoje e o conteúdo não entram: o dia inteiro mora no calendário, e uma lista
 * que repetisse a fila viraria a segunda fila.
 *
 * é a conta de três telas: o cartão da conversa no início, o "agora" do
 * rastreador e o cartão que o Merlin pede com `show:"quests"`. uma verdade só
 * (PRD da secretária): as três leem daqui, e nenhuma monta a lista sozinha.
 *
 * cada grupo vem de uma fonte em SOURCES. fonte nova é uma linha ali (as
 * contas previstas de dias passados, #15, entram assim). mais de dois itens da
 * mesma fonte viram um item só, que abre a tela deles (`many`).
 *
 * a palavra "quest" fica no código: na tela, nunca (VISAO, 11). */
import { dayOf } from "./core.js";
import { overdue, onDate, dayTasks, topOrder } from "./tasks.js";
import { runningOf, minutesOf } from "./focus.js";
import { costOf } from "./day.js";

/* quantos minutos antes o compromisso já é "agora" */
export const SOON = 30;
export const DAY_HREF = "calendar.html#day";

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

export const SOURCES = [
  { key: "session", group: "now", list: sessionNow },
  { key: "appointment", group: "now", list: appointmentsNow },
  { key: "overdue", group: "behind", list: lateTasks, many: lateGroup }
];

/* ---------- a lista ---------- */

/* data = { tasks, sessions, blocks? }: as coleções inteiras, como `all()` as
   devolve. now é Date ou epoch ms. a conta do dia é a mesma do calendário e do
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
   recebem a coleção de tarefas e devolvem o desfazer: o documento de antes,
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

export function doneTask(store, task) {
  const before = store.get(task.id);
  if (!before || before.done) return null;
  store.save({ ...before, done: true, updatedAt: Date.now() });
  return restore(store, before);
}
