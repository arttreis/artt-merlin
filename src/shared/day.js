/* merlin · o documento do dia e a conta dele
 *
 * saiu de dentro do `day.jsx` quando o inicio passou a existir: as duas telas
 * precisam responder "quanto ainda cabe hoje", e a conta so vale se for a
 * MESMA — uma sobra calculada de dois jeitos e duas verdades sobre o mesmo
 * dia, e a que aparece primeiro e a que a pessoa acredita.
 *
 * aqui nao ha React nem pixel: entra um documento, sai um numero. o dia usa
 * isto para desenhar a barra; o inicio, para dizer uma frase.
 */
import { newId, today, isDay } from "./core.js";

export const DAY_KEY = "merlin:day";
export const MINUTES = 1440;
const CLICKUP_ID = /^[A-Za-z0-9]{1,32}$/;

/* ---------- o documento ---------- */

export function normalizeTask(t) {
  t = t || {};
  /* de onde a tarefa veio (o cartao da semana), para o cartao ser marcado
     feito quando a tarefa for concluida aqui. so id: nada e copiado. */
  const origin = t.origin && typeof t.origin === "object" && t.origin.type && t.origin.id
    ? { type: String(t.origin.type).slice(0, 32), id: String(t.origin.id).slice(0, 64) }
    : null;
  return {
    id: t.id ? String(t.id) : newId(),
    title: String(t.title || "").slice(0, 300),
    min: Number.isFinite(+t.min) && +t.min > 0 ? Math.min(Math.round(+t.min), MINUTES) : 0,
    done: !!t.done,
    /* reserva ocupa a janela sem ser trabalho: almoco, reuniao, bloco fixo.
       nao se conclui, nao devolve tempo, nao entra na fila — so encolhe o dia. */
    reserved: !!t.reserved,
    /* id da tarefa no ClickUp, nao a URL: o href se monta na tela, e assim
       nao existe caminho para um "javascript:" entrar por um titulo. o
       formato e conferido aqui porque documento vindo do disco ou da nuvem
       nao e confiavel so por ter chegado. */
    clickup: CLICKUP_ID.test(String(t.clickup || "")) ? String(t.clickup) : "",
    /* de qual cliente e o trabalho. so o id: o nome vem do cadastro na hora
       de desenhar, e some se o cadastro sumir. */
    client: String(t.client || "").slice(0, 64),
    origin
  };
}

const validMinute = (v, fallback) =>
  Number.isFinite(+v) && +v >= 0 && +v <= MINUTES ? Math.round(+v) : fallback;

/* a mesma validacao para tudo que entra: localStorage e nuvem. nada chega ao
   estado sem passar por aqui. */
export function loadFrom(raw) {
  const empty = { tasks: [], start: 540, end: 1140, doneOpen: false, day: today(), v: 0 };
  if (!raw || !Array.isArray(raw.tasks)) return empty;
  const start = validMinute(raw.start, 540);
  let end = validMinute(raw.end, 1140);
  if (end <= start) end = Math.min(start + 600, MINUTES);
  return {
    tasks: raw.tasks.map(normalizeTask).filter((t) => t.title),
    start,
    end,
    doneOpen: !!raw.doneOpen,
    /* estado gravado sem o campo: tratar como hoje na primeira carga, em vez
       de acusar um atraso inventado */
    day: isDay(raw.day) ? raw.day : today(),
    /* carimbo de escrita: e por ele que dois aparelhos decidem quem esta na
       frente */
    v: Number.isFinite(+raw.v) && +raw.v > 0 ? Math.round(+raw.v) : 0
  };
}
export function loadDay() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(DAY_KEY)); }
  catch (e) { /* storage bloqueado ou corrompido: comeca limpo */ }
  return loadFrom(raw);
}

/* ---------- tempo ---------- */

export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const isStale = (doc) => doc.day !== today();

/* a fila e so trabalho: reserva ocupa a janela mas nunca e "coisa na fila" */
export const pendingOf = (doc) => doc.tasks.filter((t) => !t.done && !t.reserved);
export const doneOf = (doc) => doc.tasks.filter((t) => t.done && !t.reserved);
export const reservesOf = (doc) => doc.tasks.filter((t) => t.reserved);

/* ---------- a conta inteira do produto, em minutos ----------
   nenhum pixel entra aqui. */

/* toda tarefa ocupa espaco. o composer nao deixa nascer nenhuma sem duracao,
   mas a que chega da semana pode nao ter — e essas custam um palpite visivel
   em vez de zero: valer zero e o que fazia 20 tarefas reais exibirem folga. */
export const GUESS = 30;
export const costOf = (t) => t.min || GUESS;

/* recebe a fila em vez de le-la quando alguem quer a conta de uma ordem que
   ainda nao existe — e o que a matriz usa para mostrar, ao vivo, onde o dia
   pararia se voce aplicasse aquela arrumacao. sem argumento, e a fila real. */
export function budget(doc, open) {
  const window = doc.end - doc.start;
  const now = nowMin();
  const elapsed = clamp(now - doc.start, 0, window);
  open = open || pendingOf(doc);
  const committed = open.reduce((s, t) => s + costOf(t), 0);
  /* reserva sai da janela ANTES de qualquer promessa de folga: a diferenca
     entre "cabem 4h" e "cabem 4h se voce nao almocar" e o que separa um
     medidor de um otimista. so a reserva que ainda nao passou e descontada. */
  const reserved = reservesOf(doc).reduce((s, t) => s + t.min, 0);
  const liveReserve = Math.max(0, Math.min(reserved, window - elapsed));
  const remaining = window - elapsed - liveReserve;
  return {
    window, now, elapsed, remaining, open, committed,
    reserved, liveReserve,
    unestimated: open.filter((t) => !t.min).length,
    slack: remaining - committed,
    overflow: Math.max(0, committed - remaining),
    overtime: now > doc.end
  };
}

/* ---------- como um punhado de minutos se escreve ---------- */

/* "—" para zero: e assim que a chamada diz "nao sobrou nada" sem um numero */
export function fmt(min) {
  if (!min) return "—";
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return m + "m";
  if (!m) return h + "h";
  return h + "h" + String(m).padStart(2, "0");
}

export function longFmt(min) {
  if (!min) return "0m";
  const h = Math.floor(min / 60), m = min % 60;
  return (h ? h + "h" : "") + (h && m ? " " : "") + (m ? m + "m" : "");
}
export const clock = (min) =>
  String(Math.floor(min / 60) % 24).padStart(2, "0") + ":" + String(Math.round(min) % 60).padStart(2, "0");
