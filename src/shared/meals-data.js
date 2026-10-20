/* merlin · o miolo da alimentação, sem tela
   a coleção `meals` é um documento por refeição (PRD saude-completa, D1):
   `{id, day, meal, text}`. `meal` é uma das quatro de MEALS; `text` é o que a
   pessoa comeu, como ela disse ("salada"). um dia pode ter várias.

   sem culpa: não há caloria, macro, peso, nota nem "bom ou ruim". só o que e
   em que refeição. o texto nunca vai ao retrato (D6): o portrait.js só conta
   os documentos pelo `day`.

   quem grava são três: a aba (meals.jsx), o cartão do início (index.jsx) e a
   caixa da conversa (assistant-actions.js). os três passam por `mealDoc`,
   para a regra do dia futuro e do texto vazio ser uma só. */
import { addDays, isDay, newId, foldKey } from "./core.js";

export const TEXT_MAX = 120;

/* na ordem do dia, que é a ordem da semana na tela */
export const MEALS = [
  { id: "breakfast", label: "café da manhã" },
  { id: "lunch", label: "almoço" },
  { id: "snack", label: "lanche" },
  { id: "dinner", label: "jantar" }
];
const ORDER = MEALS.map((m) => m.id);
/* o rótulo também vale, com e sem acento: a IA ou um documento antigo podem
   mandar "almoço" no lugar de "lunch" */
const SAID = { cafe: "breakfast", cafedamanha: "breakfast", almoco: "lunch", lanche: "snack", jantar: "dinner", janta: "dinner" };

/* a refeição válida; o que não é nenhuma das quatro vira lanche */
export function mealOf(v) {
  const s = String(v || "").trim();
  if (ORDER.includes(s)) return s;
  return SAID[foldKey(s)] || "snack";
}
export const mealLabel = (id) => (MEALS.find((m) => m.id === id) || MEALS[2]).label;

/* a refeição de um horário (7, "13:20"): a tela a usa para abrir a caixa, e
   a IA faz a mesma conta quando a pessoa não diz ("comi uma maçã") */
export function mealAt(hour) {
  const m = typeof hour === "number" ? null : String(hour == null ? "" : hour).trim().match(/^(\d{1,2})(?::([0-5]\d))?$/);
  const h = typeof hour === "number" ? hour : m ? +m[1] : NaN;
  if (!Number.isInteger(h) || h < 0 || h > 23) return "snack";
  if (h < 5) return "dinner";
  if (h < 11) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 18) return "snack";
  return "dinner";
}

const cleanText = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, TEXT_MAX).trim();
const dayField = (d) => (isDay(d.day) ? d.day : isDay(d.date) ? d.date : "");

export function normalize(d) {
  return {
    id: String(d.id || ""),
    day: dayField(d),
    meal: mealOf(d.meal),
    text: cleanText(d.text),
    createdAt: +d.createdAt || Date.now(),
    updatedAt: +d.updatedAt || +d.createdAt || Date.now()
  };
}

/* o dia da refeição: o dito, quando é um dia; senão hoje. o que ainda não
   chegou não se anota */
export function mealDay(spec, today) {
  const s = spec || {};
  const day = isDay(s.date) ? s.date : isDay(s.day) ? s.day : today;
  return day > today ? { day, error: "esse dia ainda não chegou" } : { day };
}

/* a linha da confirmação: "almoço · salada", com o dia no fim só quando não
   é hoje */
export const mealLine = (doc, today) =>
  [mealLabel(doc.meal), doc.text, doc.day && doc.day !== today ? doc.day.slice(8, 10) + "/" + doc.day.slice(5, 7) : ""].filter(Boolean).join(" · ");

/* o documento da refeição, pronto para gravar, ou o erro que a tela mostra.
   com `before` (a refeição que se corrige), mantém o id e a criação */
export function mealDoc(spec, before, today) {
  const s = spec || {};
  const { day, error } = mealDay(s, today);
  if (error) return { error };
  const text = cleanText(s.text);
  if (!text) return { error: "o que você comeu?" };
  const now = Date.now();
  return { doc: { id: (before && before.id) || newId(), day, meal: mealOf(s.meal), text, createdAt: (before && before.createdAt) || now, updatedAt: now } };
}

const live = (docs) => (docs || []).filter((d) => d && d.id && !d.deleted && dayField(d) && cleanText(d.text));

/* os sete dias da semana que começa em `monday`, de segunda a domingo, cada
   um com as refeições na ordem do dia (café, almoço, lanche, jantar) e, na
   mesma refeição, na ordem em que foram anotadas */
export function weekMeals(docs, monday) {
  const all = live(docs).slice().sort((a, b) =>
    ORDER.indexOf(mealOf(a.meal)) - ORDER.indexOf(mealOf(b.meal)) || (+a.createdAt || 0) - (+b.createdAt || 0));
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(monday, i);
    return { day, items: all.filter((d) => dayField(d) === day) };
  });
}
