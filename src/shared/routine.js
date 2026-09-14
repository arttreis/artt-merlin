/* merlin · a rotina
 *
 * a semana de sempre: blocos com dia da semana e hora, sem data. antes de
 * 13/09/2026 isso existia espalhado — o botao "toda semana" de uma tarefa
 * fazia dela uma "mae" que se copiava para a semana aberta. tinha tres
 * defeitos: nao havia onde ver a rotina inteira, mudar a mae nao mudava as
 * copias, e a copia era reconhecida pelo TITULO.
 *
 * aqui o bloco e a mae, e mora fora do calendario. a copia e uma tarefa comum
 * com `origin: {type: "routine", id}` — e o fio, e nao o titulo, que diz de
 * onde ela veio.
 *
 * tres regras:
 * - o bloco se copia uma vez por semana. `weeks` guarda os domingos em que ja
 *   se copiou: apagar a copia de uma quinta nao a faz renascer, e mover a
 *   copia para outra semana nao cria uma segunda.
 * - dia que ja passou nao ganha copia. um bloco criado na quarta nao inventa
 *   uma tarefa atrasada na segunda.
 * - mudar o bloco muda as copias de hoje em diante que voce NAO mexeu. mexer
 *   e ter um titulo, hora, duracao, cliente ou "reuniao" diferente do bloco
 *   de antes: a reuniao que voce empurrou para as 11h numa quinta fica la.
 *
 * sem React e sem pixel aqui, como o tasks.js: entra documento, sai documento.
 */
import { newId, today, isDay, dateOf, addDays, sundayOf, cloud } from "./core.js";
import { newTask, MINUTES } from "./tasks.js";

/* quantas semanas para tras `weeks` guarda. so a atual e as futuras ganham
   copia; o resto e historia que ninguem consulta, e um documento que so
   cresce e um documento que um dia nao cabe. */
const KEEP_WEEKS = 4;

/* ---------- rotina x evento que se repete ----------
   o Arthur, em 14/09/2026: "uma coisa e ROTINA outra coisa e eventos que se
   repetem". rotina e o proprio dia (acordar, almoco, dormir) e nao aparece no
   calendario; evento e compromisso (daily, weekly) e aparece.
   bloco sem `kind` gravado decide pelo que ele e: o que veio do antigo botao
   "toda semana" (id "r-"), tem cliente ou e reuniao que nao e pausa (daily,
   weekly, 1:1) e evento; o resto e rotina. */
export const BLOCK_KINDS = ["routine", "event"];
const PAUSE = /almo[cç]|pausa|jantar|caf[eé]|lanche|intervalo|descanso|academia|treino/i;
const SELF = /acordar|dormir|almo[cç]|jantar|caf[eé] da manh|academia|treino|banho|medita/i;
export function kindOf(b) {
  if (b.kind === "routine" || b.kind === "event") return b.kind;
  /* acordar e dormir sao rotina mesmo tendo vindo do antigo "toda semana" */
  if (SELF.test(String(b.title || ""))) return "routine";
  if (String(b.id || "").startsWith("r-") || b.client) return "event";
  return b.reserved && !PAUSE.test(String(b.title || "")) ? "event" : "routine";
}

export function normalize(b) {
  b = b || {};
  const days = Array.isArray(b.days) ? b.days.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : [];
  const weeks = {};
  if (b.weeks && typeof b.weeks === "object") Object.keys(b.weeks).forEach((k) => { if (isDay(k) && b.weeks[k]) weeks[k] = true; });
  return {
    id: String(b.id),
    title: String(b.title || "").slice(0, 300),
    days: [...new Set(days)].sort(),
    at: b.at == null || b.at === "" || !Number.isFinite(+b.at) || +b.at < 0 || +b.at >= MINUTES ? null : Math.round(+b.at),
    min: Number.isFinite(+b.min) && +b.min > 0 ? Math.min(Math.round(+b.min), MINUTES) : 0,
    reserved: !!b.reserved,
    client: String(b.client || "").slice(0, 64),
    kind: kindOf(b),
    /* o ultimo dia que ainda gera copia fica ANTES deste: "apagar este e os
       proximos" grava aqui o dia apagado. vazio e para sempre */
    until: isDay(b.until) ? b.until : "",
    weeks,
    createdAt: +b.createdAt || Date.now(),
    updatedAt: +b.updatedAt || +b.createdAt || Date.now()
  };
}

export function newBlock(spec) {
  const now = Date.now();
  return normalize({ ...spec, id: spec.id || newId(), weeks: spec.weeks || {}, createdAt: now, updatedAt: now });
}

/* ---------- o fio entre o bloco e a copia ---------- */

export const isCopyOf = (t, id) => !!(t.origin && t.origin.type === "routine" && t.origin.id === id);
const weekdayOf = (date) => dateOf(date).getDay();
const inWeek = (date, weekStart) => date >= weekStart && date <= addDays(weekStart, 6);

/* o que o bloco decide na copia. a data nao entra: ela e o dia da semana, e
   quem arrastou a copia para outro dia mexeu nela de um jeito que o bloco
   nao tem como desfazer sem apagar a decisao. */
const FIELDS = ["title", "at", "min", "reserved", "client"];
const sameAs = (t, b) => FIELDS.every((k) => t[k] === b[k]);
const fieldsOf = (b) => ({ title: b.title, at: b.at, min: b.min, reserved: b.reserved, client: b.client });

function copyOf(b, date) {
  return newTask({ ...fieldsOf(b), date, origin: { type: "routine", id: b.id } });
}

function prune(weeks, now) {
  const floor = addDays(sundayOf(now), -7 * KEEP_WEEKS);
  const out = {};
  Object.keys(weeks).forEach((k) => { if (k >= floor) out[k] = true; });
  return out;
}

/* ---------- copiar a rotina para uma semana ----------
   devolve as tarefas novas e os blocos que ganharam a marca da semana. o
   calendario grava os dois; esta funcao nao grava nada. */
export function spawnWeek(blocks, tasks, weekStart, now) {
  now = now || today();
  const out = { tasks: [], blocks: [] };
  if (weekStart < sundayOf(now)) return out;
  blocks.forEach((b) => {
    if (b.weeks[weekStart] || !b.days.length) return;
    b.days.forEach((d) => {
      const date = addDays(weekStart, d);
      if (date < now || (b.until && date >= b.until)) return;
      /* outro aparelho pode ter copiado antes de a marca chegar aqui */
      if (tasks.some((t) => isCopyOf(t, b.id) && t.date === date)) return;
      out.tasks.push(copyOf(b, date));
    });
    out.blocks.push({ ...b, weeks: prune({ ...b.weeks, [weekStart]: true }, now), updatedAt: Date.now() });
  });
  return out;
}

/* ---------- mudar o bloco ----------
   o que a mudanca faz nas copias de hoje em diante. `before` e o bloco como
   estava; `after` e como ficou (com as mesmas `weeks`). */
export function propagate(before, after, tasks, now) {
  now = now || today();
  const out = { save: [], remove: [], create: [] };
  const live = tasks.filter((t) => isCopyOf(t, after.id) && t.date >= now && !t.done);
  live.forEach((t) => {
    if (!sameAs(t, before)) return;
    if (!after.days.includes(weekdayOf(t.date))) out.remove.push(t.id);
    else if (!sameAs(t, after)) out.save.push({ ...t, ...fieldsOf(after), updatedAt: Date.now() });
  });
  /* dia que entrou no bloco: as semanas que ja foram copiadas nao voltam a
     ser copiadas, entao ganham o dia novo aqui */
  const added = after.days.filter((d) => !before.days.includes(d));
  Object.keys(after.weeks).filter((w) => w >= sundayOf(now)).forEach((w) => {
    added.forEach((d) => {
      const date = addDays(w, d);
      if (date < now || (after.until && date >= after.until) || tasks.some((t) => isCopyOf(t, after.id) && t.date === date)) return;
      out.create.push(copyOf(after, date));
    });
  });
  return out;
}

/* ---------- apagar algo que se repete ----------
   a pergunta do calendario (14/09/2026): so este, este e os proximos, ou
   todos. "so este" e apagar a tarefa, e nao passa por aqui.
   - daqui em diante: o bloco ganha `until` e para de copiar a partir do dia;
     as copias desse dia em diante que nao foram concluidas saem.
   - todos: o bloco sai, e todas as copias nao concluidas saem junto. a
     concluida fica — e registro do que aconteceu. */
export function endFrom(b, tasks, date) {
  return {
    block: { ...b, until: b.until && b.until < date ? b.until : date, updatedAt: Date.now() },
    remove: tasks.filter((t) => isCopyOf(t, b.id) && t.date >= date && !t.done).map((t) => t.id)
  };
}
export const allCopiesOf = (b, tasks) => tasks.filter((t) => isCopyOf(t, b.id) && !t.done).map((t) => t.id);

/* apagar o bloco leva junto as copias de hoje em diante que ninguem mexeu.
   o que ja passou e o que foi mexido ficam: sao historia, ou sao decisao. */
export const orphansOf = (b, tasks, now) =>
  tasks.filter((t) => isCopyOf(t, b.id) && t.date >= (now || today()) && !t.done && sameAs(t, b)).map((t) => t.id);

/* ---------- gravar ----------
   o unico pedaco daqui que grava. o calendario chama ao abrir uma semana, e
   a rotina chama ao criar um bloco, para ele aparecer em hoje sem esperar
   alguem abrir o calendario.

   com sessao, espera as duas colecoes baixarem: copiar antes de a marca da
   semana chegar do outro aparelho e duplicar a reuniao de segunda. `signedIn`
   so vira verdade depois do /me, entao quem ja entrou neste navegador espera
   tambem durante essa volta. sem rede, copia com o que tem. */
export function copyRoutine(blocksCol, tasksCol, weekStart) {
  let known = false;
  try { known = !!localStorage.getItem("merlin:who"); } catch (e) {}
  const waiting = (cloud.signedIn || known) && cloud.status !== "offline" && cloud.status !== "error";
  if (waiting && (!tasksCol.hasDownloaded() || !blocksCol.hasDownloaded())) return;
  /* o botao "toda semana" que vivia na tarefa: a migracao roda aqui porque
     e aqui que as maes estao, e nao acha mais nada depois da primeira vez */
  const legacy = fromRecurring(tasksCol.all());
  if (legacy.tasks.length) {
    blocksCol.saveMany(legacy.blocks.map((b) => {
      const had = blocksCol.get(b.id);
      return had ? { ...had, days: [...new Set(had.days.concat(b.days))], weeks: { ...b.weeks, ...had.weeks } } : b;
    }));
    tasksCol.saveMany(legacy.tasks);
  }
  const s = spawnWeek(blocksCol.all(), tasksCol.all(), weekStart || sundayOf(today()));
  if (s.tasks.length) tasksCol.saveMany(s.tasks);
  if (s.blocks.length) blocksCol.saveMany(s.blocks);
}

/* ---------- o botao "toda semana" vira rotina ----------
   a tarefa-mae (recurring, sem recurringSource) vira bloco; as copias ganham
   o fio. maes com o mesmo titulo, hora, duracao, cliente e tipo viram UM
   bloco com varios dias — e o "daily" marcado em cinco dias.

   o id do bloco sai da mae ("r-" + id): dois aparelhos migrando ao mesmo
   tempo gravam o mesmo documento em vez de dois blocos iguais. por isso nao
   precisa de marca de "ja fiz" — rodar de novo nao encontra mais mae nenhuma. */
export function fromRecurring(tasks) {
  const sources = tasks.filter((t) => t.recurring && !t.recurringSource).sort((a, b) => (a.id < b.id ? -1 : 1));
  const groups = new Map();
  sources.forEach((t) => {
    const key = JSON.stringify(FIELDS.map((k) => t[k]));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });
  const blocks = [], changed = [];
  groups.forEach((list) => {
    const first = list[0];
    const id = ("r-" + first.id).slice(0, 64);
    const family = tasks.filter((t) => list.includes(t) || list.some((s) => t.recurringSource === s.id));
    const weeks = {};
    family.forEach((t) => { weeks[sundayOf(t.date)] = true; });
    blocks.push(normalize({
      ...fieldsOf(first), id, days: list.map((t) => weekdayOf(t.date)), weeks,
      createdAt: Math.min(...list.map((t) => t.createdAt)), updatedAt: Date.now()
    }));
    family.forEach((t) => changed.push({
      ...t, recurring: false, recurringSource: "", origin: { type: "routine", id }, updatedAt: Date.now()
    }));
  });
  /* copia cuja mae ja foi apagada: nao ha bloco para ela, so perde o selo */
  tasks.forEach((t) => {
    if (!t.recurring || !t.recurringSource || changed.some((c) => c.id === t.id)) return;
    changed.push({ ...t, recurring: false, recurringSource: "", updatedAt: Date.now() });
  });
  return { blocks, tasks: changed };
}
