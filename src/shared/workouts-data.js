/* merlin · o miolo do treino, sem tela
   a coleção `workouts` é um documento por treino (PRD saude-completa, D1):
   `{id, day, title, min}`. `title` é o que treinou, curto ("perna",
   "corrida"); `min` são os minutos. um dia pode ter mais de um treino. não
   há série, carga, distância nem caloria: só o que e quanto tempo.

   registrar um treino marca, no mesmo dia, o hábito de treino, se existir
   (D4): o citado, ou o primeiro cujo nome começa com "trein". não cria
   hábito, e o desfazer desfaz os dois, sem tirar a marca que já estava lá.

   quem grava são três: a aba (training.jsx), o cartão do início (index.jsx)
   e a caixa da conversa (ui.jsx). os três passam por `logWorkout` e
   `applyWorkout`, para a regra do dia futuro, dos minutos e da marca ser uma
   só. */
import { addDays, isDay, newId, foldKey } from "./core.js";
import { findHabit, markOn } from "./habits-data.js";

export const WORKOUT_MAX = 600;
export const TITLE_MAX = 60;

/* os modelos da tela vazia: o nome e os minutos de costume */
export const WORKOUT_MODELS = [
  ["musculação", 60], ["corrida", 30], ["caminhada", 40],
  ["bicicleta", 45], ["yoga", 30], ["funcional", 45]
].map(([name, min]) => ({ id: name, name, min }));

const clampMin = (v) => {
  const n = Math.round(+v);
  return Number.isFinite(n) ? Math.max(0, Math.min(WORKOUT_MAX, n)) : 0;
};
const cleanTitle = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, TITLE_MAX).trim();

export function normalize(d) {
  return {
    id: String(d.id || ""),
    day: isDay(d.day) ? d.day : "",
    title: cleanTitle(d.title),
    min: clampMin(d.min),
    createdAt: +d.createdAt || Date.now(),
    updatedAt: +d.updatedAt || +d.createdAt || Date.now()
  };
}

/* os minutos como se escrevem no campo: "40", "40min", "1h", "1h30",
   "1h 30min", "1,5h". o que não se lê é 0, e quem chama pede de novo */
export function readMinutes(text) {
  const t = String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
  let m;
  if ((m = t.match(/^(\d{1,4})\s*(?:m|min|minutos?)?$/))) return clampMin(+m[1]);
  if ((m = t.match(/^(\d{1,2})(?:[.,](\d+))?\s*h(?:oras?)?$/))) return clampMin((+m[1] + (m[2] ? +("0." + m[2]) : 0)) * 60);
  if ((m = t.match(/^(\d{1,2})\s*(?:h|:)\s*(\d{1,2})\s*(?:m|min|minutos?)?$/))) return clampMin(+m[1] * 60 + +m[2]);
  return 0;
}

/* o dia do treino: o dito, quando é um dia; senão hoje. o que ainda não
   chegou não se registra */
export function workoutDay(spec, today) {
  const s = spec || {};
  const day = isDay(s.date) ? s.date : isDay(s.day) ? s.day : today;
  return day > today ? { day, error: "esse dia ainda não chegou" } : { day };
}

/* a linha da confirmação: "perna · 40 min", com o hábito que ele marcou e,
   no fim, o dia, só quando não é hoje */
export const workoutLine = (doc, today, marked) =>
  [doc.title, doc.min + " min", marked ? "hábito " + marked + " marcado" : "",
   doc.day && doc.day !== today ? doc.day.slice(8, 10) + "/" + doc.day.slice(5, 7) : ""].filter(Boolean).join(" · ");

const live = (docs) => (docs || []).filter((d) => d && d.id && !d.deleted && isDay(d.day) && +d.min > 0);

/* os sete dias da semana que começa em `monday`, de segunda a domingo, cada
   um com os treinos dele (na ordem em que foram registrados) e a soma */
export function weekWorkouts(docs, monday) {
  const all = live(docs).slice().sort((a, b) => (+a.createdAt || 0) - (+b.createdAt || 0));
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(monday, i);
    const items = all.filter((d) => d.day === day);
    return { day, items, min: items.reduce((s, d) => s + clampMin(d.min), 0) };
  });
}

/* os minutos da semana inteira */
export const weekTotal = (docs, monday) => weekWorkouts(docs, monday).reduce((s, d) => s + d.min, 0);

/* o hábito de treino: o citado, se existe; senão o primeiro vivo cujo nome
   começa com "trein" ("treinar", "Treino de força"). sem nenhum, null */
export function trainingHabit(habits, said) {
  return findHabit(habits, said)
    || (habits || []).find((h) => h && !h.archived && foldKey(h.name).startsWith("trein"))
    || null;
}

/* o documento do treino, pronto para gravar, ou o erro que a tela mostra.
   com `before` (o treino que se corrige), mantém o id e a criação */
export function workoutDoc(spec, before, today) {
  const s = spec || {};
  const { day, error } = workoutDay(s, today);
  if (error) return { error };
  const min = clampMin(s.min);
  if (!min) return { error: "quantos minutos você treinou?" };
  const now = Date.now();
  return { doc: { id: (before && before.id) || newId(), day, title: cleanTitle(s.title) || "treino", min, createdAt: (before && before.createdAt) || now, updatedAt: now } };
}

/* um treino novo e a marca que ele põe: o documento, o hábito marcado (ou
   `already`, quando o dia já tinha marca) e a linha da confirmação */
export function logWorkout(spec, habits, today) {
  const { doc, error } = workoutDoc(spec, null, today);
  if (error) return { error };
  const h = trainingHabit(habits, (spec && spec.habit) || doc.title);
  const marked = h ? markOn(h, doc.day, today) : null;
  const mark = marked && marked.doc ? { habit: marked.doc, name: h.name, already: marked.already } : null;
  return { doc, mark, line: workoutLine(doc, today, mark && !mark.already ? mark.name : "") };
}

/* grava o que o `logWorkout` devolveu e devolve o desfazer: apaga o treino e
   tira só a marca que ele pôs, do hábito como estiver na hora (outra marca
   feita depois fica). `workouts` e `habits` são coleções (get, save, remove) */
export function applyWorkout(workouts, habits, res) {
  const { doc, mark } = res;
  workouts.save(doc);
  const put = mark && !mark.already ? mark.habit : null;
  if (put) habits.save(put);
  return () => {
    workouts.remove(doc.id);
    const h = put && habits.get(put.id);
    if (!h || !h.marks || !h.marks[doc.day]) return;
    const marks = { ...h.marks };
    delete marks[doc.day];
    habits.save({ ...h, marks, updatedAt: Date.now() });
  };
}
