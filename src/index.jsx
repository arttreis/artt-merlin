/* merlin · o início
   a primeira tela de quem entra, e desde 10/10/2026 ela é uma CONVERSA
   (VISAO, 10): o Merlin é um assistente pessoal, e o início é onde ele
   pergunta. de manhã, o que precisa caber hoje; à tarde, como está indo; à
   noite, como fechamos o dia — e, no fim da semana e do mês, como foram. as
   respostas viram tarefa, nota, o "como foi o dia" e as revisões, e os blocos
   embaixo mostram o que essa conversa já sabe.

   quem chega pela primeira vez passa por um onboarding que é a mesma
   conversa: o nome, com o que trabalha, o que está construindo, a janela do
   dia e um hábito. cada resposta cria o documento na hora (o perfil, o
   produto, a janela, o hábito), e o perfil vai junto em todo pedido ao
   conselheiro (worker.js, profileOf) — é isso que o faz falar com uma pessoa.

   em volta, a floresta (shared/forest.jsx), que acompanha a hora.

   quem nunca esteve aqui e não entrou vê antes a porta (o <Landing/>). */
import "./shared/base.css";
import "./index.css";
import {
  initPage, signIn, seen, markSeen, isNewHere, today, addDays, dateOf, notify, newId,
  newNote, askMerlin, readPrefs, savePrefs, formatMin, collection, api
} from "./shared/core.js";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { mount, useCloud, useCollection, icon } from "./shared/ui.jsx";
import { LOGO, NAV_ICONS } from "./shared/icons.jsx";
import { normalize as normalizeTask, dayDoc, overdue, topOrder, newTask, readLine, isReserve, stripPrefix, readClock } from "./shared/tasks.js";
import { normalize as normalizeHabit, isExpected, toggleMark } from "./shared/habits-data.js";
import { distribute, fmt, longFmt, clock, costOf } from "./shared/day.js";
import { Forest, phaseOf } from "./shared/forest.jsx";

const door = isNewHere() && !seen("landing");
initPage("home");

const CHIPS = [15, 30, 60, 120];

/* ================================================================
   o tempo da conversa
   ================================================================ */
const hourNow = () => new Date().getHours();
const greet = (h) => (h < 5 ? "Boa madrugada" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite");
/* a pergunta segue a hora: começar, acompanhar, fechar */
const momentOf = (h) => (h >= 5 && h < 12 ? "start" : h >= 12 && h < 17 ? "during" : "close");
const QUESTION = {
  start: "O que precisa caber hoje?",
  during: "Como está indo o dia?",
  close: "Como fechamos o dia?"
};

/* a semana se revisa de sexta à noite até domingo; o mês, nos três últimos
   dias. a chave da semana é o domingo em que ela começou, como no calendário */
function weekKey(day) {
  const d = dateOf(day);
  d.setDate(d.getDate() - d.getDay());
  return "w-" + d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
const monthKey = (day) => "m-" + day.slice(0, 7);
function reviewsDue(day, h) {
  const d = dateOf(day);
  const due = [];
  if ((d.getDay() === 5 && h >= 17) || d.getDay() === 6 || d.getDay() === 0) due.push({ id: weekKey(day), kind: "week" });
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  if (d.getDate() >= last - 2) due.push({ id: monthKey(day), kind: "month" });
  return due;
}

/* a sequência: dias seguidos com o dia fechado. hoje ainda aberto não quebra
   a conta — ela conta a partir de ontem até a noite chegar */
function streakOf(closes, day) {
  let n = 0;
  let d = closes.get(day) ? day : addDays(day, -1);
  while (closes.get(d)) { n++; d = addDays(d, -1); }
  return n;
}

/* ================================================================
   a porta
   ================================================================ */
function Landing({ onGuest }) {
  return (
    <div className="lg">
      <div className="lg__art">
        <span className="lg__logo">{LOGO}<b>merlin</b></span>
        <div className="lg__grade" aria-hidden="true" />
        <div className="lg__words">
          <p className="lg__badge"><i />um assistente de uma pessoa só</p>
          <h1>o dia é o único lugar com <em>minutos</em></h1>
          <p className="lg__sub">
            O Merlin pergunta pelo seu dia, pela sua semana e pelo seu mês, e guarda o que
            você responde: as tarefas, as ideias, o produto que você está construindo e quem
            chega até ele. O trabalho entra no dia quando cabe — é por isso que o número
            grande é confiável.
          </p>
        </div>
      </div>
      <div className="lg__door">
        <h2>comece agora</h2>
        <p className="lg__lead">Sem cadastro, sem cartão, sem espera. O Merlin nasce
        neste navegador e é seu no primeiro clique.</p>
        <button className="lg__cta" type="button" onClick={onGuest}>abrir o meu Merlin</button>
        <p className="lg__fine">Fica só aqui. Nada sobe para lugar nenhum enquanto você não entrar.</p>
        <div className="lg__or"><span>já tem acesso?</span></div>
        <button className="lg__ghost" type="button" onClick={() => signIn.show()}>entrar com e-mail</button>
        <p className="lg__fine">Um código de seis dígitos, sem senha para decorar.</p>
      </div>
    </div>
  );
}

/* ================================================================
   o onboarding: a primeira conversa
   ================================================================
   cinco perguntas, e cada resposta vira alguma coisa NA HORA — o Merlin diz
   o que anotou, e a pessoa vê o sistema se montar. tudo menos o nome pode ser
   pulado. sem rede e sem IA: é roteiro, e funciona no primeiro minuto. */
function parseWindow(text) {
  const parts = String(text || "").toLowerCase().split(/\s*(?:às|as|a|até|ate|-|–|—)\s*/).filter(Boolean);
  if (parts.length < 2) return null;
  const s = readClock(parts[0]), e = readClock(parts[1]);
  return s != null && e != null && e > s ? { dayStart: s, dayEnd: e } : null;
}

const STEPS = [
  { key: "name", ask: () => "Oi. Eu sou o Merlin. Vou te ajudar a fazer o dia caber — e, para isso, preciso te conhecer. Como posso te chamar?", placeholder: "seu nome", required: true },
  { key: "work", ask: (a) => "Prazer, " + a.name + ". Com o que você trabalha?", placeholder: "ex.: sou dev, faço SaaS sozinho e atendo dois clientes" },
  { key: "building", ask: () => "E o que você está construindo agora? Me diz o nome e, se quiser, uma frase.", placeholder: "ex.: Agenda do salão — agendamento pelo WhatsApp" },
  { key: "window", ask: () => "Que horas o seu dia de trabalho começa e termina?", placeholder: "ex.: 9 às 18" },
  { key: "habit", ask: () => "Um hábito que você quer manter todo dia?", placeholder: "ex.: treinar, ler 20 páginas, dormir 7h" }
];

function Onboarding({ profile, apps, habits, onDone }) {
  const [answers, setAnswers] = useState({});
  const [log, setLog] = useState([{ from: "merlin", text: STEPS[0].ask({}) }]);
  const [i, setI] = useState(0);
  const [text, setText] = useState("");
  const field = useRef(null);
  const end = useRef(null);
  useEffect(() => { if (field.current) field.current.focus(); }, [i]);
  useEffect(() => { if (end.current) end.current.scrollIntoView({ block: "end", behavior: "smooth" }); }, [log]);

  const now = Date.now();
  const saveProfile = (patch) => {
    const cur = profile.get("me") || { id: "me", createdAt: now };
    profile.save({ ...cur, ...patch, updatedAt: Date.now() });
  };

  /* o que cada resposta vira, e o que o Merlin diz que anotou */
  const apply = (key, value) => {
    if (key === "name") { saveProfile({ name: value }); return "anotei: " + value; }
    if (key === "work") { saveProfile({ work: value }); return "anotei no seu perfil"; }
    if (key === "building") {
      const [name, ...rest] = value.split(/\s+[—–-]\s+|:\s+/);
      const app = { id: newId(), name: name.trim().slice(0, 120), pitch: rest.join(" — ").trim().slice(0, 300), createdAt: Date.now(), updatedAt: Date.now() };
      apps.save(app);
      saveProfile({ building: value });
      return "criei o produto “" + app.name + "” em Produtos";
    }
    if (key === "window") {
      const w = parseWindow(value);
      if (!w) return null;
      savePrefs(w);
      return "seu dia vai de " + clock(w.dayStart) + " a " + clock(w.dayEnd);
    }
    if (key === "habit") {
      habits.save(normalizeHabit({ id: newId(), name: value.slice(0, 80), schedule: { type: "daily" }, order: 0, createdAt: Date.now() }));
      saveProfile({ habit: value });
      return "o hábito “" + value + "” entrou na sua lista de hoje";
    }
    return "";
  };

  const next = (value) => {
    const step = STEPS[i];
    const out = [...log, { from: "me", text: value || "pular" }];
    if (value) {
      const note = apply(step.key, value);
      if (note === null) {
        setLog([...out, { from: "merlin", text: "Não entendi o horário. Me diz assim: 9 às 18." }]);
        setText("");
        return;
      }
      if (note) out.push({ from: "merlin", note: true, text: note });
    }
    const a = { ...answers, [step.key]: value };
    setAnswers(a);
    setText("");
    if (i + 1 < STEPS.length) {
      out.push({ from: "merlin", text: STEPS[i + 1].ask(a) });
      setLog(out);
      setI(i + 1);
    } else {
      out.push({ from: "merlin", text: "Pronto, " + (a.name || "") + ". A partir de agora eu pergunto pelo seu dia toda vez que você chegar. Vamos começar: o que precisa caber hoje?" });
      setLog(out);
      saveProfile({ onboarded: true });
      setTimeout(onDone, 1600);
    }
  };

  const step = STEPS[i];
  return (
    <div className="ob">
      <div className="ob__log" aria-live="polite">
        {log.map((m, n) => (
          <p key={n} className={"ob__msg ob__msg--" + m.from + (m.note ? " is-note" : "")}>
            {m.note && icon("check")}{m.text}
          </p>
        ))}
        <span ref={end} />
      </div>
      <form className="ob__form" onSubmit={(e) => { e.preventDefault(); const v = text.trim(); if (v || !step.required) next(v); }}>
        <input ref={field} className="ob__field" value={text} maxLength="200" placeholder={step.placeholder}
               onChange={(e) => setText(e.currentTarget.value)} aria-label={step.ask(answers)} />
        {!step.required && <button type="button" className="ob__skip" onClick={() => next("")}>pular</button>}
        <button type="submit" className="ob__send" aria-label="Responder" disabled={step.required && !text.trim()}>{icon("arrow")}</button>
      </form>
    </div>
  );
}

/* ================================================================
   o campo do meio: tarefa, perguntar, nota
   ================================================================ */
const MODES = [
  { id: "task", label: "tarefa", icon: "check", placeholder: "o que precisa ser feito? ex.: revisar a landing 45m" },
  { id: "ask", label: "perguntar ao Merlin", icon: "spark", placeholder: "pergunte qualquer coisa sobre o seu dia, o produto ou o lançamento" },
  { id: "note", label: "nota", icon: "pencil", placeholder: "o que apareceu e ainda não é tarefa" }
];

function Composer({ tasks, b, moment }) {
  const [mode, setMode] = useState("task");
  const [text, setText] = useState("");
  const [pending, setPending] = useState(null);
  const field = useRef(null);
  const m = MODES.find((x) => x.id === mode);
  const date = today();

  const create = (spec) => {
    const t = newTask({ ...spec, date, order: topOrder(tasks.all(), date) });
    tasks.save(t);
    notify((spec.reserved ? "reservado em hoje · " : "entrou em hoje · ") + formatMin(spec.min), () => tasks.remove(t.id));
    setText(""); setPending(null);
    if (field.current) field.current.focus();
  };
  const submit = () => {
    const raw = text.replace(/\s+/g, " ").trim();
    if (!raw) return;
    if (mode === "ask") { askMerlin(raw); return; }
    if (mode === "note") {
      const n = newNote({ title: raw });
      if (n) notify("guardado em ideias", () => collection("notes").remove(n.id));
      setText("");
      return;
    }
    if (pending) { const min = readLine(" " + raw + " ").min; if (min) create({ ...pending, min }); return; }
    const l = readLine(raw);
    const name = String(l.title || raw).replace(/\s+/g, " ").trim();
    const spec = { title: stripPrefix(name), reserved: isReserve(name), clickup: l.clickup, client: l.client || "" };
    if (l.min) create({ ...spec, min: l.min });
    else { setPending(spec); setText(""); }
  };
  const read = mode === "task" && !pending && text.trim() ? readLine(text) : null;

  return (
    <form className="hm-field" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="hm-field__modes" role="tablist">
        {MODES.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={mode === x.id}
                  onClick={() => { setMode(x.id); setPending(null); if (field.current) field.current.focus(); }}>
            {icon(x.icon)}{x.label}
          </button>
        ))}
      </div>
      {pending && (
        <div className="hm-field__chips">
          <span><b>{pending.title}</b> — quanto leva?</span>
          {CHIPS.map((min) => <button key={min} type="button" className="t-mono" data-fits={min <= b.slack ? "yes" : "no"} onClick={() => create({ ...pending, min })}>{fmt(min)}</button>)}
          <button type="button" onClick={() => { const n = newNote({ title: pending.title }); if (n) notify("guardado em ideias"); setPending(null); }}>guardar como ideia</button>
        </div>
      )}
      <textarea ref={field} rows={2} maxLength="300" value={text} autoFocus={moment === "start"}
                placeholder={pending ? "ou escreva o tempo: 45m, 1h30…" : m.placeholder}
                onChange={(e) => setText(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } if (e.key === "Escape") setPending(null); }} />
      <div className="hm-field__foot">
        <span className="hm-field__hint">
          {read && read.min ? <>{fmt(read.min)}{read.min > b.slack ? " · não cabe hoje" : " · cabe"}</> :
            mode === "task" ? "escreva a duração no fim: 45m, 1h30" : mode === "ask" ? "a resposta abre na conversa com o Merlin" : "vai para Ideias"}
        </span>
        <button type="submit" className="hm-field__send" aria-label="Enviar">{icon("arrow")}</button>
      </div>
    </form>
  );
}

/* ================================================================
   fechar o dia
   ================================================================
   a pergunta da noite tem forma: o que ficou aberto hoje passa uma a uma —
   feito, amanhã ou largar — e depois o "como foi o dia". só então o dia
   conta na sequência. nada rola sozinho: é a pessoa que decide cada uma. */
function Closing({ tasks, journal, closes, date, onClose }) {
  const doc = dayDoc(tasks.all(), date, readPrefs());
  const open = doc.tasks.filter((t) => !t.done && !t.reserved);
  const [fate, setFate] = useState({});
  const entry = journal.get(date);
  const [body, setBody] = useState((entry && entry.body) || "");
  const tally = { done: 0, moved: 0, dropped: 0 };
  Object.values(fate).forEach((f) => { tally[f]++; });

  const finish = () => {
    const tomorrow = addDays(date, 1);
    open.forEach((t) => {
      const f = fate[t.id];
      if (f === "done") tasks.save({ ...t, done: true, updatedAt: Date.now() });
      else if (f === "moved") tasks.save({ ...t, date: tomorrow, order: topOrder(tasks.all(), tomorrow), updatedAt: Date.now() });
      else if (f === "dropped") tasks.remove(t.id);
    });
    if (body.trim()) journal.save({ id: date, body: body.trim(), createdAt: (entry && entry.createdAt) || Date.now(), updatedAt: Date.now() });
    const done = doc.tasks.filter((t) => t.done && !t.reserved).length + tally.done;
    closes.save({ id: date, date, done, moved: tally.moved, dropped: tally.dropped, createdAt: Date.now(), updatedAt: Date.now() });
    notify("dia fechado. até amanhã.");
    onClose();
  };

  return (
    <div className="cl" role="dialog" aria-modal="true" aria-label="Fechar o dia" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cl__box">
        <p className="cl__eyebrow t-mono">fechar o dia</p>
        <h2>{open.length ? "O que ficou aberto, e o que fazemos com cada um?" : "Nada ficou aberto hoje."}</h2>
        {open.length > 0 && (
          <ul className="cl__list">
            {open.map((t) => (
              <li key={t.id}>
                <span className="cl__title">{t.title}<small className="t-mono">{fmt(costOf(t))}</small></span>
                <span className="cl__fates">
                  {[["done", "feito"], ["moved", "amanhã"], ["dropped", "largar"]].map(([id, label]) => (
                    <button key={id} type="button" aria-pressed={fate[t.id] === id} onClick={() => setFate({ ...fate, [t.id]: fate[t.id] === id ? undefined : id })}>{label}</button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
        <label className="cl__journal">
          <span>e como foi o dia?</span>
          <textarea rows={3} value={body} placeholder="o que fez, o que viveu, o que aprendeu…" onChange={(e) => setBody(e.currentTarget.value)} />
        </label>
        <div className="cl__actions">
          <button type="button" className="pill" onClick={onClose}>depois</button>
          <button type="button" className="pill pill--accent" onClick={finish}
                  disabled={open.some((t) => !fate[t.id])} title={open.some((t) => !fate[t.id]) ? "decida cada tarefa aberta" : ""}>
            fechar o dia
          </button>
        </div>
      </div>
    </div>
  );
}

/* a revisão da semana e do mês: a mesma pergunta, num horizonte maior */
function Review({ reviews, due }) {
  const cur = reviews.get(due.id);
  const [body, setBody] = useState((cur && cur.body) || "");
  const [open, setOpen] = useState(false);
  if (cur && cur.body && !open) return null;
  const isWeek = due.kind === "week";
  const save = () => {
    if (!body.trim()) return;
    reviews.save({ id: due.id, kind: due.kind, body: body.trim(), createdAt: (cur && cur.createdAt) || Date.now(), updatedAt: Date.now() });
    notify(isWeek ? "semana revisada" : "mês revisado");
    setOpen(false);
  };
  return (
    <section className="hm-card hm-review">
      <p className="hm-card__head">{isWeek ? NAV_ICONS.calendar : NAV_ICONS.plans}{isWeek ? "a semana" : "o mês"}</p>
      <p className="hm-review__q">{isWeek ? "Como foi a semana? O que muda na próxima?" : "Como foi o mês? O que fica e o que sai no próximo?"}</p>
      <textarea rows={3} value={body} onFocus={() => setOpen(true)} onChange={(e) => setBody(e.currentTarget.value)}
                placeholder={isWeek ? "o que andou, o que travou, a única coisa da próxima semana" : "o que o mês construiu, o que ficou pelo caminho"} />
      <div className="hm-review__actions">
        <button type="button" className="pill" onClick={() => askMerlin((isWeek ? "Me ajuda a revisar a minha semana. " : "Me ajuda a revisar o meu mês. ") + body)}>{icon("spark")}pensar com o Merlin</button>
        <button type="button" className="pill pill--accent" onClick={save} disabled={!body.trim()}>guardar</button>
      </div>
    </section>
  );
}

/* ================================================================
   os blocos do hoje
   ================================================================ */
function DayCard({ tasks, doc, b, slots, cut }) {
  const open = b.open;
  const done = doc.tasks.filter((t) => t.done && !t.reserved).length;
  const width = (min) => ({ flex: "0 0 " + ((min / b.window) * 100) + "%" });
  const complete = (t) => {
    const cur = tasks.get(t.id);
    if (!cur || cur.done) return;
    tasks.save({ ...cur, done: true, updatedAt: Date.now() });
    notify(t.min ? "+" + longFmt(t.min) + " de volta pro dia" : "feita.", () => { const back = tasks.get(t.id); if (back) tasks.save({ ...back, done: false, updatedAt: Date.now() }); });
  };
  return (
    <section className="hm-card hm-day">
      <p className="hm-card__head">{NAV_ICONS.calendar}o dia <span className="hm-card__aside t-mono">{open.length} na fila · {done} feitas</span><a href="calendar.html" className="hm-card__go" aria-label="Abrir o dia">{icon("arrow")}</a></p>
      <p className="hm-day__n" data-tone={b.slack < 0 || b.overtime ? "over" : ""}>
        <b className="t-mono">{b.overtime ? clock(doc.end) : b.slack >= 0 ? (b.unestimated ? "~" : "") + fmt(b.slack) : fmt(b.overflow)}</b>
        <span>{b.overtime ? (open.length ? "passou, e ainda há fila" : "o dia acabou") : b.slack >= 0 ? "ainda cabe" : "além do que cabe"}</span>
      </p>
      {b.window > 0 && (
        <div className="hm-track" aria-hidden="true">
          {b.elapsed > 0 && <i className="is-spent" style={width(b.elapsed)} />}
          {b.liveReserve > 0 && <i className="is-reserved" style={width(b.liveReserve)} />}
          {open.map((t) => { const s = slots.get(t.id); return s ? <i key={t.id} className={"is-slot" + (s.guess ? " is-guess" : "")} style={width(s.min)} /> : null; })}
          {b.committed < b.remaining && <i className="is-free" />}
        </div>
      )}
      <ul className="hm-list">
        {open.slice(0, 6).map((t, i) => (
          <li key={t.id} className={cut >= 0 && i >= cut ? "is-out" : ""}>
            <button type="button" className="hm-check" aria-label={"Concluir " + t.title} onClick={() => complete(t)} />
            <span className="hm-list__title">{t.title}</span>
            <span className="t-mono hm-list__min">{fmt(costOf(t))}</span>
          </li>
        ))}
        {!open.length && <li className="hm-empty">nada na fila — escreva acima o que precisa caber</li>}
      </ul>
    </section>
  );
}

function habitStreak(h, day) {
  let n = 0, d = h.marks[day] ? day : addDays(day, -1);
  while (h.marks[d]) { n++; d = addDays(d, -1); }
  return n;
}

function HabitsCard({ habits, date }) {
  const list = habits.all().filter((h) => !h.archived && isExpected(h, date)).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  const marked = list.filter((h) => h.marks[date]).length;
  return (
    <section className="hm-card">
      <p className="hm-card__head">{NAV_ICONS.habits}hábitos de hoje <span className="hm-card__aside t-mono">{marked}/{list.length}</span><a href="habits.html" className="hm-card__go" aria-label="Abrir os hábitos">{icon("arrow")}</a></p>
      <ul className="hm-list">
        {list.map((h) => (
          <li key={h.id}>
            <button type="button" className={"hm-check" + (h.marks[date] ? " is-done" : "")} aria-label={(h.marks[date] ? "desmarcar " : "marcar ") + h.name}
                    onClick={() => toggleMark(habits, h, date, date)}>{h.marks[date] && icon("check")}</button>
            <span className="hm-list__title">{h.name}</span>
            <span className="t-mono hm-list__min">{habitStreak(h, date) ? habitStreak(h, date) + "d" : ""}</span>
          </li>
        ))}
        {!list.length && <li className="hm-empty">nenhum hábito para hoje — <a href="habits.html">criar um</a></li>}
      </ul>
    </section>
  );
}

function AgendaCard({ doc }) {
  const timed = doc.tasks.filter((t) => t.at != null && !t.done).sort((a, b) => a.at - b.at);
  return (
    <section className="hm-card">
      <p className="hm-card__head">{NAV_ICONS.routine}agenda <a href="calendar.html#week" className="hm-card__go" aria-label="Abrir a semana">{icon("arrow")}</a></p>
      <ul className="hm-list">
        {timed.map((t) => (
          <li key={t.id}>
            <span className="t-mono hm-list__at">{clock(t.at)}</span>
            <span className="hm-list__title">{t.title}</span>
            <span className="t-mono hm-list__min">{t.min ? fmt(t.min) : ""}</span>
          </li>
        ))}
        {!timed.length && <li className="hm-empty">nada com hora marcada hoje</li>}
      </ul>
    </section>
  );
}

/* ================================================================
   a fala do Merlin
   ================================================================
   a pergunta do alto é fixa; embaixo dela o Merlin fala do dia de VERDADE —
   a fila, a sobra, os hábitos, a sequência — escrito pela IA (a tarefa
   "checkin" do worker, que já recebe o perfil). uma vez por momento do dia
   (manhã, tarde, noite), guardada no navegador: voltar ao início não gasta
   outro conselho. sem sessão, sem rede ou sem chave, fica só a pergunta. */
const CHECKIN_KEY = "merlin:checkin";
function useCheckin(signedIn, key, buildContext) {
  const [text, setText] = useState(() => {
    try { const c = JSON.parse(localStorage.getItem(CHECKIN_KEY)); return c && c.key === key ? c.text : ""; } catch (e) { return ""; }
  });
  const asked = useRef("");
  useEffect(() => {
    if (!signedIn || text || asked.current === key) return;
    asked.current = key;
    api("/merlin", { method: "POST", body: JSON.stringify({ task: "checkin", context: buildContext() }) })
      .then((r) => {
        const t = r && r.ok && r.body && String(r.body.text || "").trim();
        if (!t) return;
        setText(t);
        try { localStorage.setItem(CHECKIN_KEY, JSON.stringify({ key, text: t })); } catch (e) {}
      })
      .catch(() => {});
  }, [signedIn, key]);
  return text;
}

/* ================================================================
   o início
   ================================================================ */
function Home() {
  const c = useCloud();
  const profile = useCollection("profile");
  const tasks = useCollection("tasks", { normalize: normalizeTask });
  const habits = useCollection("habits", { normalize: normalizeHabit });
  const journal = useCollection("journal");
  const closes = useCollection("closes");
  const reviews = useCollection("reviews");
  const apps = useCollection("apps");
  useCollection("prefs");
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  const [closing, setClosing] = useState(false);
  const [, redraw] = useState(0);

  const me = profile.get("me");
  const h = hourNow();
  const phase = phaseOf(h);
  const date = today();

  if (!me || !me.onboarded) {
    return (
      <div className="hm hm--onboarding">
        <div className="hm-scene"><Forest phase={phase} /></div>
        <Onboarding profile={profile} apps={apps} habits={habits} onDone={() => redraw((n) => n + 1)} />
      </div>
    );
  }

  const moment = momentOf(h);
  const doc = dayDoc(tasks.all(), date, readPrefs());
  const { b, slots, cut } = distribute(doc);
  const closed = closes.get(date);
  const streak = streakOf(closes, date);
  const late = overdue(tasks.all(), date).length;
  const name = me.name || (c.email ? String(c.email).split("@")[0] : "");
  const due = reviewsDue(date, h);
  const saying = useCheckin(c.signedIn, date + ":" + moment + (closed ? ":closed" : ""), () => ({
    moment: closed ? "close" : moment,
    hour: clock(h * 60 + new Date().getMinutes()),
    window: clock(doc.start) + "–" + clock(doc.end),
    slack: b.overtime ? "o dia já acabou" : b.slack >= 0 ? "cabem " + fmt(b.slack) : "passa " + fmt(b.overflow) + " do que cabe",
    open: b.open.map((t) => t.title + " · " + fmt(costOf(t))),
    done: doc.tasks.filter((t) => t.done && !t.reserved).map((t) => t.title),
    late,
    habits: habits.all().filter((x) => !x.archived && isExpected(x, date)).map((x) => x.name + (x.marks[date] ? " (feito)" : "")),
    streak,
    products: apps.all().map((a) => a.name).slice(0, 5)
  }));

  return (
    <div className="hm">
      <div className="hm-scene"><Forest phase={phase} /></div>
      <header className="hm-hero">
        <h1>{greet(h)}{name ? ", " + name : ""}. {closed ? "Dia fechado." : QUESTION[moment]}</h1>
        <p className="hm-hero__sub">
          {streak > 0
            ? <>{streak} {streak === 1 ? "dia fechado" : "dias seguidos fechando o dia"}</>
            : "feche o dia hoje à noite para começar a sua sequência"}
          {late > 0 && <> · <a href="calendar.html#day">{late} {late === 1 ? "aberta" : "abertas"} de antes de hoje</a></>}
        </p>
        {saying && <p className="hm-hero__merlin">{icon("spark")}{saying}</p>}
      </header>

      <div className="hm-center">
        <Composer tasks={tasks} b={b} moment={moment} />
        {moment === "close" && !closed && (
          <button type="button" className="hm-close" onClick={() => setClosing(true)}>{icon("check")}fechar o dia</button>
        )}
        {closed && <p className="hm-closed t-mono">fechado às {new Date(closed.createdAt).toTimeString().slice(0, 5)} · {closed.done} feitas · {closed.moved} para amanhã</p>}
      </div>

      <p className="hm-label t-mono">hoje</p>
      <div className="hm-grid">
        <DayCard tasks={tasks} doc={doc} b={b} slots={slots} cut={cut} />
        <HabitsCard habits={habits} date={date} />
        <AgendaCard doc={doc} />
        {due.map((d) => <Review key={d.id} reviews={reviews} due={d} />)}
      </div>

      {closing && <Closing tasks={tasks} journal={journal} closes={closes} date={date} onClose={() => setClosing(false)} />}
    </div>
  );
}

function Root() {
  const c = useCloud();
  const [bare, setBare] = useState(door);
  const showDoor = bare && !c.signedIn;
  useLayoutEffect(() => { document.documentElement.classList.toggle("bare", showDoor); }, [showDoor]);
  useEffect(() => { if (bare && c.signedIn) { markSeen("landing"); setBare(false); } }, [bare, c.signedIn]);
  return showDoor ? <Landing onGuest={() => { markSeen("landing"); setBare(false); }} /> : <Home />;
}

mount(<Root />, "app");
