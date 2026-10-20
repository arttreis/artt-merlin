/* merlin · o texto de um dia do diário, gravado com calma
   o "como foi o dia" do Hoje (today-block.jsx) e os cartões da página do diário
   (journal.jsx) escrevem na mesma coleção `journal`, um documento por data. o
   campo guarda o que se digita e grava depois de 700ms parados — gravar a cada
   tecla encheria a fila de sincronização com um documento por letra.

   o que falta gravar leva junto o DIA em que foi escrito: andar para outro dia
   no meio da digitação grava o texto no dia dele, e não no novo. */
import { useState, useEffect, useRef } from "react";

export const JOURNAL_SAVE_DELAY = 700;

/* `journal` é a coleção (useCollection("journal")), `date` o dia do campo.
   devolve o texto do campo, quem o escreve e quem o descarta (apagar o dia). */
export function useJournalDraft(journal, date) {
  const entry = journal.get(date);
  const [draft, setDraft] = useState(() => (entry && entry.body) || "");
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const timer = useRef(null);
  const pending = useRef(null);
  const flush = () => {
    clearTimeout(timer.current);
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    journal.save({ id: p.date, body: draftRef.current, createdAt: p.createdAt, updatedAt: Date.now() });
  };
  useEffect(() => flush, [date]);
  /* trocou de dia, ou o texto chegou de outro aparelho: o campo segue */
  useEffect(() => { setDraft((entry && entry.body) || ""); }, [date, entry && entry.body]);
  const write = (v) => {
    setDraft(v);
    pending.current = { date, createdAt: (entry && entry.createdAt) || Date.now() };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, JOURNAL_SAVE_DELAY);
  };
  /* apagar o dia: o que estava na fila não pode ressuscitar o texto depois */
  const discard = () => {
    clearTimeout(timer.current);
    pending.current = null;
    setDraft("");
  };
  return { draft, write, discard };
}
