/* merlin · o que se repete todo dia, ao lado da fila
   os hábitos esperados do dia, com um toque para marcar, e o "como foi o dia"
   escrito sem sair dele. morava na home (o bloco "hoje" do bento); quando o
   dia virou a primeira tela (09/10/2026, VISAO 9), veio para o lado da fila,
   que é onde o dia é vivido.

   o "como foi o dia" é o que restou do diário: a página saiu sem nunca ter tido
   um documento, mas a pergunta do fim do dia ficou — é a coleção `journal`, um
   documento por data, a mesma de sempre.

   segue a data aberta no calendário: voltar para ontem mostra os hábitos e o
   texto de ontem. o dia que ainda não chegou não se marca (toggleMark). */
import "./today-block.css";
import { useState, useEffect, useRef } from "react";
import { today } from "./core.js";
import { useCollection } from "./ui.jsx";
import { icon } from "./icons.jsx";
import { normalize as normalizeHabit, isExpected, toggleMark } from "./habits-data.js";

export function TodayBlock({ date }) {
  const habits = useCollection("habits", { normalize: normalizeHabit });
  const journal = useCollection("journal");
  const now = today();
  const list = habits.all()
    .filter((h) => !h.archived && isExpected(h, date))
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);

  const entry = journal.get(date);
  const [draft, setDraft] = useState(() => (entry && entry.body) || "");
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const timer = useRef(null);
  /* o que falta gravar, e de QUE dia: andar para outro dia no meio da
     digitacao grava o texto no dia em que ele foi escrito, e nao no novo */
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
    timer.current = setTimeout(flush, 700);
  };

  return (
    <section className="block todayb">
      <p className="section-label">
        <span className="t-mono">{date === now ? "hoje" : "neste dia"}</span>
        <a className="action" href="habits.html" title="ver o mês dos hábitos" aria-label="Ver o mês dos hábitos">{icon("arrow")}</a>
      </p>
      {list.length
        ? <ul className="todayb__habits">
            {list.map((h) => (
              <li key={h.id}>
                <button type="button" className={"todayb__check" + (h.marks[date] ? " is-done" : "")}
                        disabled={date > now}
                        aria-label={(h.marks[date] ? "desmarcar " : "marcar ") + h.name}
                        onClick={() => toggleMark(habits, h, date, now)}>
                  {h.marks[date] && icon("check")}
                </button>
                <span className="todayb__name">{h.name}</span>
              </li>))}
          </ul>
        : <p className="todayb__empty">nenhum hábito para este dia · <a href="habits.html">criar um</a></p>}
      <label className="todayb__journal">
        <span className="t-mono">como foi o dia</span>
        <textarea rows={2} placeholder={date > now ? "esse dia ainda não chegou" : "o que fez, o que viveu…"}
                  disabled={date > now} value={draft} onChange={(e) => write(e.target.value)} />
      </label>
    </section>
  );
}
