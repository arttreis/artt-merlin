/* merlin · o miolo do sono, sem tela
   a coleção `sleep` é um documento por noite, com o id na data do dia em que
   a pessoa ACORDOU (PRD saude-completa, D1): "dormi 7h" às 8h é a noite que
   terminou hoje. `{id: AAAA-MM-DD, min, bed?, wake?}`: `min` são os minutos
   dormidos; `bed` e `wake` ("23:10", "06:30") são opcionais e, quando vêm os
   dois, as horas saem da conta. sono não tem qualidade nem nota (sem culpa).

   quem grava são três: a aba (sleep.jsx), o cartão do início (index.jsx) e a
   pílula da conversa (assistant-actions.js). os três passam por `sleepDoc`,
   para a regra do dia futuro e das horas que faltam ser uma só. */
import { addDays, isDay } from "./core.js";

export const SLEEP_MAX = 1440;

/* a meta mora no perfil (profile/me, `sleepGoal`, em minutos). 0 é "sem
   meta"; a chave ausente é quem nunca escolheu, e a aba pergunta */
export const SLEEP_GOALS = [
  { id: 420, label: "7h" },
  { id: 450, label: "7h30" },
  { id: 480, label: "8h" },
  { id: 0, label: "sem meta" }
];

const clampMin = (v) => {
  const n = Math.round(+v);
  return Number.isFinite(n) ? Math.max(0, Math.min(SLEEP_MAX, n)) : 0;
};

/* "6:30" vira "06:30"; o que não é hora de verdade vira "" */
export function clock(s) {
  const m = String(s || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m || +m[1] > 23 || +m[2] > 59) return "";
  return m[1].padStart(2, "0") + ":" + m[2];
}
const clockMin = (s) => { const c = clock(s); return c ? +c.slice(0, 2) * 60 + +c.slice(3) : null; };

export function normalize(d) {
  return {
    id: String(d.id || ""),
    min: clampMin(d.min),
    bed: clock(d.bed),
    wake: clock(d.wake),
    createdAt: +d.createdAt || Date.now(),
    updatedAt: +d.updatedAt || +d.createdAt || Date.now()
  };
}

/* "7h20", "7h", "45min": o rótulo da barra e da confirmação */
export function sleepLabel(min) {
  const n = Math.round(+min);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 60) return n + "min";
  const h = Math.floor(n / 60), m = n % 60;
  return h + "h" + (m ? String(m).padStart(2, "0") : "");
}

/* de deitar a acordar, passando da meia-noite: 23:10 → 06:30 são 440 */
export function sleptBetween(bed, wake) {
  const b = clockMin(bed), w = clockMin(wake);
  if (b == null || w == null || b === w) return null;
  return (w - b + SLEEP_MAX) % SLEEP_MAX;
}

/* as horas como se escrevem no campo: "7h30", "7h", "7", "7,5", "7:30",
   "450min", "7h e meia". o que não se lê é 0, e quem chama pede de novo */
export function readHours(text) {
  const t = String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
  let m;
  if ((m = t.match(/^(\d{1,2})\s*h(?:oras?)?\s*e\s*meia$/))) return clampMin(+m[1] * 60 + 30);
  if ((m = t.match(/^(\d{1,2})(?:[.,](\d+))?\s*(?:h(?:oras?)?)?$/))) return clampMin((+m[1] + (m[2] ? +("0." + m[2]) : 0)) * 60);
  if ((m = t.match(/^(\d{1,2})\s*(?:h|:)\s*(\d{1,2})\s*(?:m(?:in)?)?$/))) return clampMin(+m[1] * 60 + +m[2]);
  if ((m = t.match(/^(\d{1,4})\s*m(?:in(?:utos?)?)?$/))) return clampMin(+m[1]);
  return 0;
}

/* a data da noite: a dita, quando é um dia; senão hoje. a noite que ainda
   não terminou não se registra */
export function nightOf(spec, today) {
  const s = spec || {};
  const day = isDay(s.date) ? s.date : today;
  return day > today ? { day, error: "esse dia ainda não chegou" } : { day };
}

const live = (docs) => (docs || []).filter((d) => d && d.id && !d.deleted && +d.min > 0);

/* as sete noites da semana que começa em `monday`, de segunda a domingo,
   cada uma no dia em que se acordou. noite sem registro vem com min 0 */
export function weekNights(docs, monday) {
  const by = new Map(live(docs).map((d) => [d.id, d]));
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(monday, i);
    const doc = by.get(day) || null;
    return { day, min: doc ? clampMin(doc.min) : 0, doc };
  });
}

/* a média das noites registradas nos últimos 7 dias (hoje inclusive), em
   minutos. sem nenhuma, null: não há o que dizer, e não é zero */
export function weekAverage(docs, today) {
  const from = addDays(today, -6);
  const mins = live(docs).filter((d) => d.id >= from && d.id <= today).map((d) => clampMin(d.min));
  return mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null;
}

/* a linha da confirmação: "7h de sono", e a noite só quando não é a de hoje */
export const sleepLine = (min, day, today) =>
  sleepLabel(min) + " de sono" + (day && day !== today ? " · noite de " + day.slice(8, 10) + "/" + day.slice(5, 7) : "");

/* o documento da noite, pronto para gravar, ou o erro que a tela mostra.
   com deitou e acordou, as horas saem da conta. um documento por dia: quem
   registra de novo substitui, e `before` (o que havia) guarda a criação */
export function sleepDoc(spec, before, today) {
  const s = spec || {};
  const { day, error } = nightOf(s, today);
  if (error) return { error };
  const bed = clock(s.bed), wake = clock(s.wake);
  const counted = bed && wake ? sleptBetween(bed, wake) : null;
  const min = clampMin(counted != null ? counted : s.min);
  if (!min) return { error: "quantas horas você dormiu?" };
  const now = Date.now();
  return { doc: { id: day, min, bed, wake, createdAt: (before && before.createdAt) || now, updatedAt: now } };
}

/* o desfazer: a noite de antes volta, ou a nova sai. a forma do undoEntry */
export const undoSleep = (before, after) => (before ? { save: before } : { remove: after.id });
