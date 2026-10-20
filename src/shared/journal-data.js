/* merlin · o miolo do diário, sem tela
   a semana de cartões da página do diário (journal.jsx): quem monta a lista
   dos sete dias, do mais novo para o mais velho, é esta conta — pura, sem
   coleção nem DOM, para o teste passar as datas na mão.

   a coleção `journal` é um documento por data, `{id: AAAA-MM-DD, body}`, a
   mesma que o "como foi o dia" do Hoje grava (today-block.jsx). */
import { addDays } from "./core.js";

/* os sete dias da semana que começa em `monday`. os que já chegaram vêm do
   mais novo para o mais velho — hoje primeiro, na semana atual —, e os que
   ainda não chegaram vão para o fim, do mais próximo ao mais distante: eles
   estão desabilitados e não podem empurrar o hoje para baixo da tela.
   `docs` é a lista da coleção (journal.all()); dia sem documento vem com o
   texto vazio. `future` marca o dia que ainda não chegou: ali não se escreve. */
export function journalWeek(docs, monday, today) {
  const bodies = new Map();
  (docs || []).forEach((d) => { if (d && d.id && !d.deleted) bodies.set(d.id, String(d.body || "")); });
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(monday, i);
    return { day, body: bodies.get(day) || "", future: day > today };
  });
  return days.filter((d) => !d.future).reverse().concat(days.filter((d) => d.future));
}

/* a coleção ainda não tem texto nenhum: é quando a página pergunta "como
   foram seus dias?". documento com o texto apagado à mão não conta. */
export const journalIsEmpty = (docs) => !(docs || []).some((d) => d && !d.deleted && String(d.body || "").trim());
