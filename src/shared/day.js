/* merlin · a conta do dia
 *
 * saiu de dentro do `day.jsx` quando o inicio passou a existir: as duas telas
 * precisam responder "quanto ainda cabe hoje", e a conta so vale se for a
 * MESMA — uma sobra calculada de dois jeitos e duas verdades sobre o mesmo
 * dia, e a que aparece primeiro e a que a pessoa acredita.
 *
 * ate 09/09/2026 este arquivo tambem era o DONO do documento do dia: ele lia
 * e validava o `merlin:day`, uma fila de hoje guardada a parte da colecao da
 * semana. essa parte morreu quando as duas viraram uma colecao so
 * (`shared/tasks.js`) e o dia virou uma consulta por data. o que sobrou aqui e
 * o que sempre foi o valor deste modulo: a aritmetica.
 *
 * entra um objeto com `{tasks, start, end}` — o `dayDoc()` do tasks.js monta
 * um — e sai um numero. nao ha React, nao ha pixel e nao ha localStorage.
 */
import { readPrefs } from "./core.js";

export const MINUTES = 1440;

/* ---------- tempo ---------- */

export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* a fila e so trabalho: reserva ocupa a janela mas nunca e "coisa na fila" */
export const pendingOf = (doc) => doc.tasks.filter((t) => !t.done && !t.reserved);
export const doneOf = (doc) => doc.tasks.filter((t) => t.done && !t.reserved);
export const reservesOf = (doc) => doc.tasks.filter((t) => t.reserved);
/* reuniao finalizada (14/09/2026) continua na lista, riscada, mas para de
   ocupar o dia: acabou antes da hora, o tempo que sobrou volta */
export const liveReservesOf = (doc) => reservesOf(doc).filter((t) => !t.done);

/* ---------- a conta inteira do produto, em minutos ----------
   nenhum pixel entra aqui. */

/* toda tarefa que entra em hoje ocupa espaco. o composer nao deixa nascer
   nenhuma sem duracao, mas a que chega de outra data (ou de outro modulo) pode
   nao ter — e essas custam um palpite visivel em vez de zero: valer zero e o
   que fazia 20 tarefas reais exibirem folga. */
export const GUESS = 30;
/* o palpite virou preferencia: 30 minutos era o numero de uma pessoa so, e a
   tarefa que chega sem duracao custa o que a SUA hora costuma custar. o GUESS
   continua exportado como o piso de quem le sem preferencia nenhuma. */
export const guessMin = () => readPrefs().guess;
export const costOf = (t) => t.min || guessMin();

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
  const reserved = liveReservesOf(doc).reduce((s, t) => s + t.min, 0);
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
