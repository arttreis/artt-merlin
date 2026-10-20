/* merlin · o diário
   o histórico do "como foi o dia": a semana em cartões, um por dia, do mais
   novo para o mais velho, cada um com o texto editável ali mesmo. o diário saiu
   em 09/10/2026 (VISAO, 9.3) e o Hoje ficou com a pergunta do fim do dia; esta
   página voltou em 20/10/2026 como aba de saúde, porque o que se escreveu antes
   não se relia em lugar nenhum.

   é a coleção `journal` de sempre, um documento por data, a mesma do Hoje
   (shared/today-block.jsx): o que se escreve aqui aparece lá, e vice-versa. os
   dois gravam pelo mesmo gancho (shared/journal-draft.js). não tem "+": o dia é
   o "+". a busca leva ao cartão (journal.html#AAAA-MM-DD), na semana certa. */
import "./shared/base.css";
import "./journal.css";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { initPage, today, mondayOf, addDays, dateOf, dateLabel, weekdayOf, isDay, notify } from "./shared/core.js";
import { mount, useCollection, useHash, EmptyStart, PeriodNav, icon } from "./shared/ui.jsx";
import { useJournalDraft } from "./shared/journal-draft.js";
import { journalWeek, journalIsEmpty } from "./shared/journal-data.js";

initPage("journal");

/* "13–19 out" quando cabe no mesmo mês; "26 out–1 nov" quando vira o mês */
function weekRange(monday) {
  const end = addDays(monday, 6);
  if (dateOf(monday).getMonth() === dateOf(end).getMonth()) return dateOf(monday).getDate() + "–" + dateLabel(end);
  return dateLabel(monday) + "–" + dateLabel(end);
}

/* "seg 20/10" */
const dayTitle = (day) => weekdayOf(day) + " " + day.slice(8) + "/" + day.slice(5, 7);

/* ---------- um dia ---------- */
function DayCard({ day, future, now, journal, picked }) {
  const { draft, write, discard } = useJournalDraft(journal, day);
  const entry = journal.get(day);
  /* o campo cresce com o texto: reler o histórico não pode cortar o dia */
  const field = useRef(null);
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    const fit = () => { el.style.height = "auto"; el.style.height = el.scrollHeight + 2 + "px"; };
    fit();
    /* girar a tela ou redimensionar muda a largura do cartão, e a do texto junto */
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [draft]);
  const filled = !!draft.trim() || !!(entry && entry.body);
  /* apagar leva o texto que está na tela, gravado ou não: desfazer devolve o
     que a pessoa estava vendo */
  const erase = () => {
    const stamp = Date.now();
    const before = { id: day, body: draft, createdAt: (entry && entry.createdAt) || stamp, updatedAt: stamp };
    discard();
    if (entry) journal.remove(day);
    notify("nota do dia apagada", () => journal.save({ ...before, updatedAt: Date.now() }));
  };
  return (
    <section className={"block jcard" + (picked ? " is-picked" : "") + (future ? " is-future" : "")} data-day={day}>
      <p className="jcard__head">
        <span className="t-mono">{dayTitle(day)}{day === now ? " · hoje" : ""}</span>
        {filled && !future && <button className="action" type="button" title="apagar a nota do dia" aria-label={"Apagar a nota de " + dayTitle(day)} onClick={erase}>{icon("trash")}</button>}
      </p>
      <textarea ref={field} rows={4} aria-label={"Como foi " + dayTitle(day)} placeholder={future ? "esse dia ainda não chegou" : "o que fez, o que viveu…"}
                disabled={future} value={draft} onChange={(e) => write(e.target.value)} />
    </section>
  );
}

/* ---------- a página ---------- */
function Journal() {
  const journal = useCollection("journal");
  const now = today();
  const hash = useHash();
  const arrived = (h) => isDay(h) && h <= now;
  const [monday, setMonday] = useState(() => mondayOf(arrived(hashDay()) ? hashDay() : now));
  const [picked, setPicked] = useState(() => (arrived(hashDay()) ? hashDay() : ""));

  /* a busca (ou um link) chega com #AAAA-MM-DD: abre a semana do dia e põe o
     cartão em foco. um dia que ainda não chegou não tem o que mostrar */
  useEffect(() => {
    if (!arrived(hash)) { setPicked(""); return; }
    setMonday(mondayOf(hash));
    setPicked(hash);
  }, [hash]);
  useEffect(() => {
    if (!picked) return;
    const el = document.querySelector('[data-day="' + picked + '"]');
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    const box = el.querySelector("textarea");
    if (box && !box.disabled) box.focus({ preventScroll: true });
  }, [picked]);

  const week = journalWeek(journal.all(), monday, now);
  const current = monday === mondayOf(now);
  return (
    <>
      <div className="header">
        <div>
          <h1>diário</h1>
          <p className="sub">como foi cada dia, com o que você escreveu no Hoje</p>
        </div>
        <div className="actions">
          <PeriodNav label={weekRange(monday)} current={current} prevLabel="semana anterior" nextLabel="próxima semana"
            onPrev={() => setMonday((m) => addDays(m, -7))} onNext={() => setMonday((m) => addDays(m, 7))}
            onToday={() => setMonday(mondayOf(now))} />
        </div>
      </div>
      {journalIsEmpty(journal.all()) && <EmptyStart title="como foram seus dias?" groups={[]} />}
      <div className="jweek">
        {week.map((w) => <DayCard key={w.day} day={w.day} future={w.future} now={now} journal={journal} picked={picked === w.day} />)}
      </div>
    </>
  );
}

function hashDay() {
  try { return decodeURIComponent(location.hash.slice(1)); } catch (e) { return ""; }
}

mount(<Journal />, "app");
