/* merlin · o diario
   uma pagina por dia, e so. a nota e o que ainda vai virar alguma coisa (uma
   tarefa, um projeto); a pagina do diario nao vira nada — ela e o registro do
   que o dia foi, escrito por quem viveu.

   por isso a forma e a de um caderno, e nao a de uma lista: a folhinha do mes
   do lado (com a bolinha nos dias escritos), as paginas recentes embaixo dela,
   e a pagina aberta ocupando o resto. escrever grava sozinho; pagina apagada
   ate o fim deixa de existir.

   o documento tem o proprio dia como id: "um dia, uma pagina" nao precisa de
   regra no codigo, porque dois documentos com o mesmo dia nao existem. dois
   aparelhos escrevendo o mesmo dia ao mesmo tempo ficam com a ultima gravacao,
   como todo o resto do sistema.

   do lado da pagina, so leitura, o que o calendario sabe daquele dia: o que
   foi feito e as reunioes. e a memoria que ajuda a escrever, nao outra lista
   para cuidar. */
import "./shared/base.css";
import "./journal.css";
import { initPage, today, isDay, addDays, dateOf, dateLabel } from "./shared/core.js";
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { mount, useCollection, useHash, setHash, useKeydown, isTyping, icon, ClientBadge } from "./shared/ui.jsx";
import { MiniMonth } from "./shared/mini-month.jsx";
import { normalize as normalizeTask, onDate } from "./shared/tasks.js";
import { fmt } from "./shared/day.js";

initPage("journal");

const MAX_BODY = 50000;
const RECENT = 12;
const SAVE_DELAY = 700;

function normalize(d) {
  const id = isDay(d.id) ? d.id : (isDay(d.date) ? d.date : "");
  return {
    id,
    body: String(d.body || "").slice(0, MAX_BODY),
    createdAt: +d.createdAt || Date.now(),
    updatedAt: +d.updatedAt || +d.createdAt || Date.now()
  };
}

const atNoon = (day) => { const d = dateOf(day); d.setHours(12); return d; };
const weekday = (day) => new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(atNoon(day));
const longDate = (day) => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(atNoon(day));
const words = (text) => (String(text).trim().match(/\S+/g) || []).length;
const firstLine = (text) => String(text).trim().split(/\n/)[0].slice(0, 90);

/* a pergunta do papel em branco muda com o dia, e nao a cada abertura: o
   mesmo dia pergunta sempre a mesma coisa */
const PROMPTS = [
  "como foi o dia?",
  "o que ficou na cabeça hoje?",
  "o que deu certo, e o que não deu?",
  "o que você quer lembrar deste dia?",
  "o que te tirou do eixo hoje, e o que te trouxe de volta?",
  "pelo que vale agradecer hoje?",
  "o que você faria diferente amanhã?"
];
const promptOf = (day) => PROMPTS[Math.floor(dateOf(day).getTime() / 864e5) % PROMPTS.length];

/* dias seguidos com pagina, contando de hoje (ou de ontem, se hoje ainda nao
   foi escrito — o dia nao acabou) para tras */
function streakOf(written) {
  let d = written.has(today()) ? today() : addDays(today(), -1);
  let n = 0;
  while (written.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

function Journal() {
  const store = useCollection("journal", { normalize });
  const tasks = useCollection("tasks", { normalize: normalizeTask });
  const hash = useHash();
  const day = isDay(hash) && hash <= today() ? hash : today();
  const open = (d) => setHash(d === today() ? "" : d);

  const pages = store.all().filter((p) => isDay(p.id) && p.body.trim()).sort((a, b) => b.id.localeCompare(a.id));
  const written = new Set(pages.map((p) => p.id));
  const streak = streakOf(written);

  useKeydown((e) => {
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const next = addDays(day, e.key === "ArrowLeft" ? -1 : 1);
      if (next <= today()) open(next);
      return;
    }
    if (isTyping()) return;
    if (e.key === "/" || e.key === "e") { e.preventDefault(); const f = document.getElementById("page-body"); if (f) f.focus(); }
  });

  return (
    <>
      <div className="header">
        <div>
          <h1>diário</h1>
          <p className="sub">
            {pages.length ? pages.length + (pages.length === 1 ? " página escrita" : " páginas escritas") : "nenhuma página ainda"}
            {streak > 1 ? " · " + streak + " dias seguidos" : ""}
          </p>
        </div>
      </div>

      <div className="jr">
        <aside className="jr__side" aria-label="Páginas">
          <MiniMonth anchor={day} pick busy={(d) => written.has(d)} onPick={(d) => { if (d <= today()) open(d); }} />
          {pages.length > 0 && (
            <div className="jr__recent">
              <p className="jr__side-title">recentes</p>
              <ul>
                {pages.slice(0, RECENT).map((p) => (
                  <li key={p.id}>
                    <button type="button" className={"jr__entry" + (p.id === day ? " is-open" : "")} onClick={() => open(p.id)}>
                      <span className="jr__entry-date t-mono">{dateLabel(p.id)}</span>
                      <span className="jr__entry-text">{firstLine(p.body)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <Page key={day} day={day} store={store} tasks={tasks.all()} onOpen={open} />
      </div>
    </>
  );
}

/* ---------- a pagina aberta ----------
   o texto e um rascunho local que grava depois de uma pausa na digitacao (e
   ao sair do campo). a nuvem que chega no meio da escrita nao atropela: o
   rascunho so segue o documento enquanto nao ha nada por gravar. */
function Page({ day, store, tasks, onOpen }) {
  const doc = store.get(day);
  const [draft, setDraft] = useState(doc ? doc.body : "");
  const [state, setState] = useState("idle"); // idle | dirty | saved
  const timer = useRef(null);
  const ref = useRef(null);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) setDraft(doc ? doc.body : "");
  }, [doc ? doc.updatedAt : 0]);

  const flush = (value) => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    const text = value.slice(0, MAX_BODY);
    const now = store.get(day);
    if (!text.trim()) { if (now) store.remove(day); }
    else if (!now || now.body !== text) store.save({ id: day, body: text, createdAt: now ? now.createdAt : Date.now(), updatedAt: Date.now() });
    setState("saved");
  };
  /* trocar de dia (ou fechar a aba) com algo por gravar: grava antes */
  const latest = useRef(draft);
  latest.current = draft;
  useEffect(() => () => flush(latest.current), []);
  useEffect(() => {
    const f = () => flush(latest.current);
    window.addEventListener("pagehide", f);
    return () => window.removeEventListener("pagehide", f);
  }, []);

  const change = (value) => {
    setDraft(value);
    dirty.current = true;
    setState("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(value), SAVE_DELAY);
  };

  /* o campo cresce com o texto: a pagina rola, e nao uma caixa dentro dela */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [draft]);

  const isToday = day === today();
  const n = words(draft);
  const list = onDate(tasks, day);
  const done = list.filter((t) => t.done && !t.reserved);
  const meetings = list.filter((t) => t.reserved);

  return (
    <article className="jr__page">
      <div className="jr__top">
        <div className="jr__when">
          <p className="jr__weekday">{isToday ? "hoje · " + weekday(day) : weekday(day)}</p>
          <h2 className="jr__date">{longDate(day)} <span>{day.slice(0, 4)}</span></h2>
        </div>
        <div className="jr__nav">
          <button className="action" type="button" title="dia anterior (Alt+←)" aria-label="Dia anterior" onClick={() => onOpen(addDays(day, -1))}>{icon("chevronLeft")}</button>
          <button className="action" type="button" title="próximo dia (Alt+→)" aria-label="Próximo dia" disabled={isToday} onClick={() => onOpen(addDays(day, 1))}>{icon("chevronRight")}</button>
          {!isToday && <button className="action" type="button" title="voltar para hoje" aria-label="Voltar para hoje" onClick={() => onOpen(today())}>{icon("calendar")}</button>}
        </div>
      </div>

      <textarea id="page-body" ref={ref} className="jr__body" value={draft} maxLength={MAX_BODY}
                placeholder={promptOf(day)} aria-label={"Página de " + dateLabel(day)} spellCheck="true"
                autoFocus={isToday && !draft}
                onChange={(e) => change(e.currentTarget.value)} onBlur={(e) => flush(e.currentTarget.value)} />

      <p className="jr__foot t-mono" aria-live="polite">
        <span>{n ? n + (n === 1 ? " palavra" : " palavras") : ""}</span>
        <span>{state === "dirty" ? "escrevendo…" : state === "saved" ? "guardado" : ""}</span>
      </p>

      {(done.length > 0 || meetings.length > 0) && (
        <section className="jr__day" aria-label="O que o calendário sabe deste dia">
          <p className="jr__side-title">o que o dia teve</p>
          <ul>
            {meetings.map((t) => (
              <li key={t.id} className={t.done ? "is-done" : ""}>
                <span className="jr__day-icon">{icon("clock")}</span>
                <span className="jr__day-name">{t.title}</span>
                <ClientBadge id={t.client} />
                <span className="jr__day-min t-mono">{fmt(t.min)}</span>
              </li>
            ))}
            {done.map((t) => (
              <li key={t.id}>
                <span className="jr__day-icon is-check">{icon("check")}</span>
                <span className="jr__day-name">{t.title}</span>
                <ClientBadge id={t.client} />
                <span className="jr__day-min t-mono">{fmt(t.min)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

mount(<Journal />, "app");
