/* merlin · os habitos
   a grade do mes: habitos nas linhas, dias nas colunas, uma marca por celula.
   a frequencia diz o que e esperado; a sequencia e a taxa saem das marcas. */
import "./shared/base.css";
import "./habits.css";
import {
  initPage, newId, today, dayOf, dateOf, addDays, mondayOf, monthLabel, notify, sendToDay, api, formatMin, parseDuration, foldKey
} from "./shared/core.js";
import { useState } from "react";
import {
  mount, useCollection, useKeydown, isTyping,
  useFields, Form, Field, Dialog, Markdown, EmptyStart, PeriodNav, icon
} from "./shared/ui.jsx";
import { HABIT_SUGGESTIONS, habitGroups } from "./shared/templates.js";

initPage("habits");

/* ---------- o habito ----------
   nao e tarefa: nao tem hora nem duracao obrigatoria, tem frequencia e um
   registro por dia. as marcas moram dentro do documento porque um mes cabe em
   poucos bytes e um habito e editado por uma pessoa so. */
const SCHEDULES = [
  { id: "daily", label: "todo dia" },
  { id: "perWeek", label: "vezes por semana" },
  { id: "weekdays", label: "dias da semana" }
];
const WEEKDAY_NAMES = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const COLORS = [
  { id: 5, label: "verde" }, { id: 1, label: "azul" }, { id: 2, label: "laranja" },
  { id: 3, label: "rosa" }, { id: 4, label: "roxo" }, { id: 6, label: "ciano" }
];

function normalize(d) {
  const s = d.schedule && typeof d.schedule === "object" ? d.schedule : {};
  return {
    id: d.id,
    name: String(d.name || "").slice(0, 80),
    schedule: {
      type: SCHEDULES.some((x) => x.id === s.type) ? s.type : "daily",
      times: Math.min(7, Math.max(1, Math.round(+s.times || 3))),
      weekdays: Array.isArray(s.weekdays) ? s.weekdays.map(Number).filter((n) => n >= 0 && n <= 6) : [1, 2, 3, 4, 5]
    },
    min: Math.max(0, Math.round(+d.min || 0)),
    color: +d.color || 5,
    order: Number.isFinite(+d.order) ? +d.order : 0,
    archived: !!d.archived,
    marks: d.marks && typeof d.marks === "object" ? d.marks : {},
    createdAt: +d.createdAt || Date.now(),
    updatedAt: +d.updatedAt || +d.createdAt || Date.now()
  };
}


/* ---------- meses e dias ---------- */
const monthOf = (day) => day.slice(0, 7);
function monthDays(ym) {
  const [y, m] = ym.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => ym + "-" + String(i + 1).padStart(2, "0"));
}
function shiftMonth(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  return monthOf(dayOf(new Date(y, m - 1 + n, 1)));
}
const dayNumber = (day) => dateOf(day).getDate();
const weekdayLetter = (day) => WEEKDAY_NAMES[dateOf(day).getDay()][0];

function scheduleLabel(h) {
  const s = h.schedule;
  if (s.type === "daily") return "todo dia";
  if (s.type === "perWeek") return s.times + "× por semana";
  return s.weekdays.slice().sort().map((n) => WEEKDAY_NAMES[n]).join(" ") || "nenhum dia";
}

/* ---------- sugerir hábitos ----------
   a grade vazia não dá ideia nenhuma, e "que hábito eu deveria ter" é uma
   pergunta muito pior de responder do que "qual destes é o meu". as
   sugestões vêm de shared/templates.js com frequência e duração já
   escolhidas — a mesma lista serve a tela vazia e o botão do cabeçalho,
   porque são a mesma pergunta feita em momentos diferentes.

   escolher não cria na hora: marca. criar um por clique faria a lista
   sumir embaixo do dedo assim que o primeiro entrasse. */
function suggestionGroups(existing) {
  const taken = new Set(existing.map((h) => foldKey(h.name)));
  return habitGroups()
    .map((g) => ({
      ...g,
      items: g.items
        .filter((s) => !taken.has(foldKey(s.name)))
        .map((s) => ({ ...s, line: scheduleLabel(s) + (s.min ? " · " + formatMin(s.min) : "") }))
    }))
    .filter((g) => g.items.length);
}

/* o dia e "esperado" quando a frequencia pede marca nele. quem e N vezes por
   semana nao tem dia fixo: nenhum e esperado, e a conta e por semana. */
function isExpected(h, day) {
  const s = h.schedule;
  if (s.type === "daily") return true;
  if (s.type === "weekdays") return s.weekdays.includes(dateOf(day).getDay());
  return false;
}

/* feitos e esperados no mes, do dia 1 ate hoje (ou o mes inteiro, se ja
   passou). para N por semana, o esperado de cada semana e min(N, dias da
   semana que ja passaram dentro do mes).

   corrigido em 13/09/2026, por dois erros que davam 60% para 3 marcas em
   13 dias e 133% num habito de dias uteis:
   - o esperado comecava na data de criacao do habito, e nao no dia 1: quem
     cria no dia 9 tinha um "mes" de cinco dias;
   - o feito contava marca em dia que nao era esperado (o sabado de um habito
     de seg a sex), e passava do esperado.
   agora so conta como feito a marca em dia esperado — e, no N por semana,
   no maximo N por semana. o numero nunca passa de 100%. */
function monthStats(h, ym) {
  const t = today();
  const days = monthDays(ym).filter((d) => d <= t);
  let done = 0, expected = 0;
  if (h.schedule.type === "perWeek") {
    const weeks = new Map();
    days.forEach((d) => {
      const k = mondayOf(d);
      const w = weeks.get(k) || { n: 0, marks: 0 };
      w.n++; if (h.marks[d]) w.marks++;
      weeks.set(k, w);
    });
    weeks.forEach((w) => {
      const goal = Math.min(h.schedule.times, w.n);
      expected += goal;
      done += Math.min(goal, w.marks);
    });
  } else {
    const due = days.filter((d) => isExpected(h, d));
    expected = due.length;
    done = due.filter((d) => h.marks[d]).length;
  }
  return { done, expected, rate: expected ? Math.round((done / expected) * 100) : 0 };
}

/* a sequencia: dias esperados seguidos com marca, contando para tras a partir
   de hoje (hoje sem marca ainda nao quebra). para N por semana, semanas
   seguidas que bateram a meta, contando a atual so se ja bateu. */
function streakOf(h) {
  const t = today();
  if (h.schedule.type === "perWeek") {
    const weekCount = (mon) => { let c = 0; for (let i = 0; i < 7; i++) if (h.marks[addDays(mon, i)]) c++; return c; };
    let n = 0, monday = mondayOf(t);
    if (weekCount(monday) >= h.schedule.times) n++;
    monday = addDays(monday, -7);
    while (n < 520 && weekCount(monday) >= h.schedule.times) { n++; monday = addDays(monday, -7); }
    return n;
  }
  let n = 0, day = h.marks[t] ? t : addDays(t, -1);
  for (let guard = 0; guard < 3000; guard++) {
    if (!isExpected(h, day)) { day = addDays(day, -1); continue; }
    if (!h.marks[day]) break;
    n++; day = addDays(day, -1);
  }
  return n;
}

/* ---------- a pagina ---------- */
function Habits() {
  const habits = useCollection("habits", { normalize });
  const [month, setMonth] = useState(() => monthOf(today()));
  const [form, setForm] = useState(null);       // { id } | null
  const [suggesting, setSuggesting] = useState(false);
  const [chosen, setChosen] = useState([]);     // ids das sugestoes marcadas
  const [summary, setSummary] = useState(null); // texto do merlin | null
  const [thinking, setThinking] = useState(false);
  const t = today();
  const days = monthDays(month);
  const list = habits.all().filter((h) => !h.archived).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  const totals = list.reduce((acc, h) => { const s = monthStats(h, month); acc.done += s.done; acc.expected += s.expected; return acc; }, { done: 0, expected: 0 });

  /* ---------- acoes ---------- */
  const toggle = (h, day) => {
    if (day > t) return;
    const marks = { ...h.marks };
    if (marks[day]) delete marks[day]; else marks[day] = true;
    habits.save({ ...h, marks, updatedAt: Date.now() });
  };
  const archive = (h) => {
    habits.save({ ...h, archived: true, updatedAt: Date.now() });
    notify("hábito arquivado", () => habits.save({ ...h, archived: false, updatedAt: Date.now() }));
  };
  const pull = (h) => sendToDay({ title: h.name, min: h.min, client: "", origin: { type: "habit", id: h.id } });

  /* as escolhidas viram habitos de uma vez so: um saveMany, um aviso. depois
     disso sao habitos comuns — nada lembra que vieram de uma sugestao. */
  const toggleChosen = (s) => setChosen((c) => c.includes(s.id) ? c.filter((x) => x !== s.id) : c.concat([s.id]));
  const addChosen = () => {
    const now = Date.now();
    const docs = HABIT_SUGGESTIONS.filter((s) => chosen.includes(s.id)).map((s, i) => normalize({
      id: newId(), name: s.name, schedule: s.schedule, min: s.min, color: s.color,
      order: now + i, archived: false, marks: {}, createdAt: now, updatedAt: now
    }));
    if (!docs.length) return;
    habits.saveMany(docs);
    setChosen([]); setSuggesting(false);
    notify(docs.length === 1 ? "1 hábito criado" : docs.length + " hábitos criados");
  };

  /* ---------- ler o mes com o merlin ---------- */
  const askSummary = async () => {
    if (thinking) return;
    setThinking(true);
    try {
      const lines = list.map((h) => { const s = monthStats(h, month); return h.name + " · " + scheduleLabel(h) + " · " + s.done + "/" + s.expected + " · sequência " + streakOf(h); });
      const r = await api("/merlin", { method: "POST", body: JSON.stringify({ task: "habits", context: { month: monthLabel(month), habits: lines } }) });
      if (r.ok) setSummary(r.body.text || "");
      else if (r.status === 401) notify("entre para usar o Merlin");
      else notify(r.body.error || "não consegui falar com o Merlin");
    } catch (e) {
      notify("não consegui falar com o Merlin");
    } finally { setThinking(false); }
  };

  useKeydown((e) => {
    if (form || summary != null) return;
    if (e.key === "n" && !isTyping() && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setForm({ id: "" }); return; }
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); setMonth((m) => shiftMonth(m, e.key === "ArrowLeft" ? -1 : 1)); }
  });

  return (
    <>
      <div className="header">
        <div>
          <h1>hábitos</h1>
          {totals.expected > 0 && <p className="sub">{totals.done + " de " + totals.expected + " feitos"}</p>}
        </div>
        {/* eram seis pílulas escritas. o mês virou "‹ set 2026 ›", o merlin um
            ícone, e "sugerir" mora dentro da caixa de criar (13/09/2026) */}
        <div className="actions">
          {list.length > 0 && <PeriodNav label={monthLabel(month)} current={month === monthOf(t)}
            prevLabel="mês anterior" nextLabel="próximo mês"
            onPrev={() => setMonth((m) => shiftMonth(m, -1))} onNext={() => setMonth((m) => shiftMonth(m, 1))}
            onToday={() => setMonth(monthOf(today()))} />}
          {list.length > 0 && <button className={"pill pill--icon merlin-btn" + (thinking ? " is-thinking" : "")} type="button" id="merlin-btn"
                  disabled={thinking || !list.length} onClick={askSummary}
                  title={thinking ? "pensando…" : "ler o mês com o merlin"} aria-label="ler o mês com o merlin">
            <span className="merlin-btn__icon" aria-hidden="true">{icon("spark")}</span>
          </button>}
          <button className="pill pill--green" type="button" title="novo hábito (n)" onClick={() => setForm({ id: "" })}>{icon("plus")}hábito</button>
        </div>
      </div>

      {!list.length && (
        <EmptyStart
          title="quais destes são seus?"
          text="Um hábito não tem estrutura para montar: tem um nome e uma frequência. Estes já vêm com as duas escolhidas. Marque os que forem seus — dá para mudar tudo depois, e o “+” cria qualquer outro."
          groups={suggestionGroups(list)}
          picked={(s) => chosen.includes(s.id)}
          onPick={toggleChosen}
          note={chosen.length ? "" : "Nenhum é seu?"}
          onBlank={chosen.length ? addChosen : () => setForm({ id: "" })}
          blankLabel={chosen.length
            ? (chosen.length === 1 ? "criar o hábito escolhido" : "criar os " + chosen.length + " escolhidos")
            : "criar um do zero"} />
      )}

      {list.length > 0 && (
        <div className="table-scroll">
          <table className="table habit-table">
            <thead>
              <tr>
                <th className="habit-name">hábito</th>
                {days.map((d) => (
                  <th key={d} className={"habit-day" + (d === t ? " is-today" : "") + (d > t ? " is-future" : "")}>
                    <span className="habit-day__weekday">{weekdayLetter(d)}</span>{dayNumber(d)}
                  </th>))}
                <th className="num" title="dias seguidos">seq</th>
                <th className="num" title="feitos ÷ dias esperados, do dia 1 até hoje">mês</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((h) => <HabitRow key={h.id} h={h} days={days} today={t} onToggle={toggle} onEdit={() => setForm({ id: h.id })} onArchive={() => archive(h)} onPull={() => pull(h)} />)}
            </tbody>
          </table>
        </div>)}

      {suggesting && (
        <Dialog title="sugerir hábitos" sub="frequência e duração já vêm escolhidas; tudo editável depois" wide
                label="Sugestões de hábito" onClose={() => { setSuggesting(false); setChosen([]); }}
                actions={<>
                  <button className="pill" type="button" onClick={() => { setSuggesting(false); setChosen([]); }}>fechar</button>
                  {!!chosen.length && <button className="pill pill--green" type="button" onClick={addChosen}>
                    {chosen.length === 1 ? "criar o escolhido" : "criar os " + chosen.length + " escolhidos"}
                  </button>}
                </>}>
          {suggestionGroups(list).length
            ? <EmptyStart title="" groups={suggestionGroups(list)} picked={(s) => chosen.includes(s.id)} onPick={toggleChosen} />
            : <p className="empty">Você já tem todos os que eu sugeriria. O "+" cria qualquer outro.</p>}
        </Dialog>
      )}
      {form && <HabitForm habits={habits} id={form.id} onClose={() => setForm(null)} onArchive={archive}
        onSuggest={list.length ? () => { setForm(null); setSuggesting(true); } : null} />}
      {summary != null && <MerlinDialog text={summary} onClose={() => setSummary(null)} />}
    </>
  );
}

/* ---------- uma linha da grade ---------- */
function HabitRow({ h, days, today: t, onToggle, onEdit, onArchive, onPull }) {
  const stats = monthStats(h, days[0].slice(0, 7));
  const streak = streakOf(h);
  return (
    <tr>
      <td className="habit-name">
        <div className="habit-name__row">
          <i className="habit-dot" data-color={h.color}></i>
          <div className="habit-name__text" title={h.name}>
            {h.name}
            <span className="habit-name__schedule">{scheduleLabel(h)}{h.min ? " · " + formatMin(h.min) : ""}</span>
          </div>
        </div>
      </td>
      {days.map((d) => (
        <td key={d} className="habit-cell">
          <button type="button" className={"mark" + (h.marks[d] ? " is-done" : "") + (isExpected(h, d) ? " is-expected" : "")}
                  disabled={d > t} aria-pressed={!!h.marks[d]} aria-label={h.name + " em " + dayNumber(d)}
                  onClick={() => onToggle(h, d)}>{h.marks[d] ? icon("check") : null}</button>
        </td>))}
      <td className={"num" + (streak > 0 ? " is-green" : "")}>{streak}</td>
      <td className="num" title={stats.expected ? stats.done + " de " + stats.expected + " dias esperados até hoje" : "nenhum dia esperado ainda"}>
        {stats.expected ? <>{stats.rate}%<small className="habit-frac">{stats.done}/{stats.expected}</small></> : "—"}
      </td>
      <td className="habit-actions">
        <span className="row-actions">
          {h.min > 0 && !h.marks[t] && <button className="action" type="button" title="puxar para o dia" onClick={onPull}>{icon("clock")}</button>}
          <button className="action" type="button" title="editar" onClick={onEdit}>{icon("pencil")}</button>
          <button className="action" type="button" title="arquivar" onClick={onArchive}>{icon("archive")}</button>
        </span>
      </td>
    </tr>
  );
}

/* ---------- a caixa do habito: criar e editar sao a mesma ---------- */
function HabitForm({ habits, id, onClose, onArchive, onSuggest }) {
  const h = id ? habits.get(id) : null;
  const [v, bind, set] = useFields({
    name: h ? h.name : "",
    type: h ? h.schedule.type : "daily",
    times: h ? h.schedule.times : 3,
    weekdays: h ? h.schedule.weekdays : [1, 2, 3, 4, 5],
    duration: h && h.min ? formatMin(h.min) : "",
    color: h ? h.color : 5
  });
  if (id && !h) return null;
  const toggleWeekday = (n) => set("weekdays", v.weekdays.includes(n) ? v.weekdays.filter((x) => x !== n) : [...v.weekdays, n]);
  const submit = () => {
    const name = v.name.trim().slice(0, 80);
    if (!name) { notify("o hábito precisa de um nome"); return false; }
    if (v.type === "weekdays" && !v.weekdays.length) { notify("escolha pelo menos um dia"); return false; }
    const now = Date.now();
    const schedule = { type: v.type, times: Math.min(7, Math.max(1, Math.round(+v.times || 1))), weekdays: v.weekdays.slice().sort() };
    const min = parseDuration(v.duration).min;
    if (h) habits.save({ ...h, name, schedule, min, color: +v.color, updatedAt: now });
    else habits.save({ id: newId(), name, schedule, min, color: +v.color, order: now, archived: false, marks: {}, createdAt: now, updatedAt: now });
  };
  return (
    <Form title={h ? "hábito" : "novo hábito"} submit={h ? "salvar" : "criar"} remove={h ? "arquivar" : ""} removeIcon="archive"
        aside={!h && onSuggest ? <button className="dialog__remove" type="button" title="ver sugestões" aria-label="Ver sugestões" onClick={onSuggest}>{icon("spark")}</button> : null}
        onRemove={() => onArchive(h)} onClose={onClose} onSubmit={submit}>
      <Field label="nome" full><input className="input" maxLength="80" required placeholder="treino, leitura, água…" {...bind("name")} /></Field>
      <Field label="frequência">
        <select className="select" {...bind("type")}>{SCHEDULES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
      </Field>
      {v.type === "perWeek" && <Field label="quantas vezes"><input className="input input--num" type="number" min="1" max="7" {...bind("times")} /></Field>}
      {v.type === "weekdays" && (
        <Field label="quais dias" full>
          <div className="weekday-picker">
            {[1, 2, 3, 4, 5, 6, 0].map((n) => (
              <label key={n} className={v.weekdays.includes(n) ? "is-on" : ""}>
                <input type="checkbox" checked={v.weekdays.includes(n)} onChange={() => toggleWeekday(n)} />{WEEKDAY_NAMES[n]}
              </label>))}
          </div>
        </Field>)}
      <Field label="duração sugerida"><input className="input input--mono" placeholder="30m, 1h" {...bind("duration")} /></Field>
      <Field label="cor">
        <select className="select" {...bind("color")}>{COLORS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
      </Field>
    </Form>
  );
}

/* ---------- a leitura do merlin ---------- */
function MerlinDialog({ text, onClose }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); notify("copiado"); }
    catch (e) { notify("não consegui copiar"); }
  };
  return (
    <Dialog title="o merlin lê o mês" wide onClose={onClose}
        actions={<>
          <button className="pill" type="button" onClick={copy}>copiar</button>
          <button className="pill pill--green" type="button" onClick={onClose}>fechar</button>
        </>}>
      <Markdown className="merlin-body" text={text} />
    </Dialog>
  );
}

mount(<Habits />, "app");
