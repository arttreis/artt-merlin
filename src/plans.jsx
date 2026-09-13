/* merlin · os planos
   trimestre, mes e semana lado a lado. desdobrar leva um
   objetivo do horizonte de cima para o de baixo; puxar leva para a semana. */
import "./shared/base.css";
import "./plans.css";
import {
  initPage, newId, today, dayOf, dateOf, addDays, mondayOf, monthLabel, dateLabel, notify, api, clientName
} from "./shared/core.js";
import { useState, useEffect } from "react";
import { newTask, normalize as normalizeTask } from "./shared/tasks.js";
import {
  mount, useCollection, useClients, useKeydown, isTyping,
  useFields, Form, Field, Dialog, Markdown, ClientBadge, clientOptionList, icon
} from "./shared/ui.jsx";

initPage("plans");

/* ---------- periodos ----------
   um documento por periodo, com id previsivel (kind:period): quem abre um
   trimestre que nunca teve objetivo le null e mostra vazio, sem criar nada. */
const KINDS = [
  { id: "quarter", label: "trimestre", newLabel: "objetivo do trimestre" },
  { id: "month", label: "mês", newLabel: "objetivo do mês" },
  { id: "week", label: "semana", newLabel: "objetivo da semana" }
];
const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function periodOf(kind, day) {
  const d = dateOf(day);
  if (kind === "quarter") return d.getFullYear() + "-Q" + (Math.floor(d.getMonth() / 3) + 1);
  if (kind === "month") return day.slice(0, 7);
  return mondayOf(day);
}
function shiftPeriod(kind, period, n) {
  if (kind === "quarter") {
    const [y, q] = period.split("-Q").map(Number);
    const total = y * 4 + (q - 1) + n;
    return Math.floor(total / 4) + "-Q" + ((total % 4) + 1);
  }
  if (kind === "month") {
    const [y, m] = period.split("-").map(Number);
    return dayOf(new Date(y, m - 1 + n, 1)).slice(0, 7);
  }
  return addDays(period, n * 7);
}
function periodLabel(kind, period) {
  if (kind === "quarter") {
    const [y, q] = period.split("-Q").map(Number);
    return q + "º trimestre · " + y;
  }
  if (kind === "month") return monthLabel(period);
  const end = addDays(period, 6);
  const same = dateOf(period).getMonth() === dateOf(end).getMonth();
  return "semana de " + (same ? dateOf(period).getDate() + "–" + dateLabel(end) : dateLabel(period) + "–" + dateLabel(end));
}
function periodSub(kind, period) {
  if (kind === "quarter") {
    const q = +period.split("-Q")[1];
    return MONTHS_SHORT[(q - 1) * 3] + "–" + MONTHS_SHORT[(q - 1) * 3 + 2];
  }
  return "";
}
/* o periodo "de baixo" que cabe dentro deste: o mes atual do trimestre, a
   semana atual do mes. desdobrar cria o filho la. */
function childPeriod(kind, period) {
  const t = today();
  if (kind === "quarter") {
    const cur = periodOf("month", t);
    return cur.startsWith(period.split("-Q")[0]) && periodOf("quarter", cur + "-01") === period ? cur : period.split("-Q")[0] + "-" + String((+period.split("-Q")[1] - 1) * 3 + 1).padStart(2, "0");
  }
  const cur = mondayOf(t);
  return cur.slice(0, 7) === period ? cur : mondayOf(period + "-01") < period + "-01" ? addDays(mondayOf(period + "-01"), 7) : mondayOf(period + "-01");
}
const docId = (kind, period) => kind + ":" + period;

function normalize(d) {
  return {
    id: d.id,
    kind: KINDS.some((k) => k.id === d.kind) ? d.kind : "week",
    period: String(d.period || ""),
    goals: (Array.isArray(d.goals) ? d.goals : []).map((g) => ({
      id: g.id, text: String(g.text || "").slice(0, 200), client: g.client || "",
      done: !!g.done, parent: g.parent || "", card: g.card || "", order: +g.order || 0, createdAt: +g.createdAt || 0
    })),
    review: { went: String((d.review && d.review.went) || ""), didnt: String((d.review && d.review.didnt) || ""), next: String((d.review && d.review.next) || "") },
    createdAt: +d.createdAt || Date.now(),
    updatedAt: +d.updatedAt || +d.createdAt || Date.now()
  };
}


/* ---------- a pagina ---------- */
function Plans() {
  const plans = useCollection("plans", { normalize });
  /* o objetivo da semana vira TAREFA, e nao mais "cartao da semana": desde
     que o dia e a semana viraram duas visoes da mesma colecao, cartao deixou
     de ser uma categoria de coisa. */
  const tasks = useCollection("tasks", { normalize: normalizeTask });
  useClients();
  const t = today();
  const [periods, setPeriods] = useState(() => ({ quarter: periodOf("quarter", t), month: periodOf("month", t), week: periodOf("week", t) }));
  const [form, setForm] = useState(null);       // { kind, period, id?, parent? } | null
  const [summary, setSummary] = useState(null); // { title, text } | null
  const [reviewing, setReviewing] = useState(""); // id do horizonte com a revisao aberta
  /* o objetivo aceso. e so estado de tela: some ao recarregar, e nao existe
     campo nenhum no documento para "estou olhando este". */
  const [focus, setFocus] = useState("");

  const docOf = (kind) => plans.get(docId(kind, periods[kind])) || normalize({ id: docId(kind, periods[kind]), kind, period: periods[kind] });
  const allGoals = plans.all().flatMap((d) => d.goals.map((g) => ({ ...g, kind: d.kind, period: d.period, docId: d.id })));
  const childrenOf = (id) => allGoals.filter((g) => g.parent === id);
  const parentOf = (id) => allGoals.find((g) => g.id === id);

  const saveDoc = (doc) => plans.save({ ...doc, updatedAt: Date.now() });
  const saveGoals = (kind, period, goals) => {
    const id = docId(kind, period);
    const doc = plans.get(id) || normalize({ id, kind, period });
    saveDoc({ ...doc, goals });
  };

  /* ---------- acoes ---------- */
  const toggleDone = (kind, g, value) => {
    const doc = docOf(kind);
    saveGoals(kind, doc.period, doc.goals.map((x) => x.id === g.id ? { ...x, done: value } : x));
  };
  const removeGoal = (kind, g) => {
    const doc = docOf(kind);
    const before = doc.goals;
    saveGoals(kind, doc.period, doc.goals.filter((x) => x.id !== g.id));
    notify("objetivo apagado", () => saveGoals(kind, doc.period, before));
  };
  /* desdobrar: cria um filho no periodo de baixo, apontando para o pai.
     concluir todos os filhos nao fecha o pai sozinho: fechar e decisao. */
  const unfold = (kind, g) => {
    const childKind = kind === "quarter" ? "month" : "week";
    setForm({ kind: childKind, period: childPeriod(kind, periods[kind]), parent: g.id, prefill: { text: g.text, client: g.client } });
  };
  /* puxar para a semana: vira uma tarefa com data, que aparece na coluna
     daquele dia e na fila do dia quando a data for hoje. sem duracao — o
     pedagio de minutos e cobrado quando ela entra em hoje, e nao aqui. */
  const pullToWeek = (g) => {
    const monday = periods.week;
    const date = mondayOf(t) === monday ? t : monday;
    const task = newTask({ title: g.text, date, client: g.client, origin: { type: "plan", id: g.id } });
    tasks.save(task);
    const doc = docOf("week");
    saveGoals("week", doc.period, doc.goals.map((x) => x.id === g.id ? { ...x, card: task.id } : x));
    notify("virou tarefa da semana", () => { tasks.remove(task.id); saveGoals("week", doc.period, doc.goals.map((x) => x.id === g.id ? { ...x, card: "" } : x)); });
  };
  const saveReview = (kind, review) => {
    const doc = docOf(kind);
    if (JSON.stringify(doc.review) === JSON.stringify(review)) return;
    saveDoc({ ...doc, review });
  };

  /* ---------- revisar com o merlin ---------- */
  const askReview = async (kind) => {
    const doc = docOf(kind);
    const lines = doc.goals.map((g) =>
      [g.text, clientName(g.client) || null, g.done ? "feito" : "aberto"].filter(Boolean).join(" · "));
    const weekDone = kind === "week"
      ? tasks.all().filter((x) => x.done && mondayOf(x.date) === doc.period).map((x) => x.title)
      : [];
    const r = await api("/merlin", { method: "POST", body: JSON.stringify({ task: "review", context: { kind: KINDS.find((k) => k.id === kind).label, period: periodLabel(kind, doc.period), goals: lines, weekDone, review: doc.review } }) }).catch(() => null);
    if (!r) { notify("não consegui falar com o Merlin"); return; }
    if (r.ok) setSummary({ title: "o merlin revisa " + (kind === "week" ? "a semana" : kind === "month" ? "o mês" : "o trimestre"), text: r.body.text || "" });
    else if (r.status === 401) notify("entre para usar o Merlin");
    else notify(r.body.error || "não consegui falar com o Merlin");
  };

  useKeydown((e) => {
    if (form || summary || reviewing) return;
    if (e.key === "Escape" && focus) { e.preventDefault(); setFocus(""); return; }
    if (e.key === "n" && !isTyping() && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setForm({ kind: "week", period: periods.week }); }
  });

  /* com um objetivo aceso, as outras colunas ficam com o parentesco dele em
     tinta cheia e o resto apagado. e o unico jeito de ver, sem cruzar tres
     listas na cabeca, de onde uma semana veio e onde um trimestre aterrissa. */
  const shade = (id) => {
    if (!focus) return "";
    if (id === focus) return " is-focus";
    const f = allGoals.find((g) => g.id === focus);
    if (!f) return "";
    if (f.parent === id) return " is-kin";
    const g = allGoals.find((x) => x.id === id);
    if (g && g.parent === focus) return " is-kin";
    /* neto e avo: o trimestre acende junto com a semana que saiu dele */
    if (g && f.parent && g.id === (allGoals.find((x) => x.id === f.parent) || {}).parent) return " is-kin";
    if (g && g.parent && f.id === (allGoals.find((x) => x.id === g.parent) || {}).parent) return " is-kin";
    return " is-dim";
  };

  const shift = (kind, n) => setPeriods((p) => ({ ...p, [kind]: shiftPeriod(kind, p[kind], n) }));
  const goToday = () => setPeriods({ quarter: periodOf("quarter", t), month: periodOf("month", t), week: periodOf("week", t) });
  const openCount = (kind) => docOf(kind).goals.filter((g) => !g.done).length;

  return (
    <>
      <div className="header">
        <div>
          <h1>planos</h1>
          <p className="sub">{focus
            ? "acesso: só o que tem parentesco com ele — Esc apaga"
            : openCount("quarter") + " abertos no trimestre · " + openCount("month") + " no mês · " + openCount("week") + " na semana"}</p>
        </div>
        <div className="actions">
          <button className="pill" type="button" onClick={goToday}>hoje</button>
          <button className="pill pill--green" type="button" title="novo objetivo da semana (n)" onClick={() => setForm({ kind: "week", period: periods.week })}>{icon("plus")}objetivo</button>
        </div>
      </div>

      <div className="horizons">
        {KINDS.map((k) => <Horizon key={k.id} kind={k} doc={docOf(k.id)} period={periods[k.id]} today={t}
          childrenOf={childrenOf} parentOf={parentOf} focus={focus} onFocus={setFocus} shade={shade}
          onShift={(n) => shift(k.id, n)} onNew={() => setForm({ kind: k.id, period: periods[k.id] })}
          onToggle={(g, v) => toggleDone(k.id, g, v)} onEdit={(g) => setForm({ kind: k.id, period: periods[k.id], id: g.id })}
          onRemove={(g) => removeGoal(k.id, g)} onUnfold={k.id === "week" ? null : (g) => unfold(k.id, g)}
          onPull={k.id === "week" ? pullToWeek : null} onReview={() => setReviewing(k.id)} />)}
      </div>

      {reviewing && <ReviewDialog kind={KINDS.find((k) => k.id === reviewing)} doc={docOf(reviewing)}
        onSave={(r) => saveReview(reviewing, r)} onAsk={() => askReview(reviewing)} onClose={() => setReviewing("")} />}
      {form && <GoalForm plans={plans} form={form} onClose={() => setForm(null)} onRemove={(g) => removeGoal(form.kind, g)} parentOf={parentOf} />}
      {summary && <MerlinDialog title={summary.title} text={summary.text} onClose={() => setSummary(null)} />}
    </>
  );
}

/* ---------- uma coluna: um horizonte ---------- */
function Horizon({ kind, doc, period, today: t, childrenOf, parentOf, focus, onFocus, onShift, onNew, onToggle, onEdit, onRemove, onUnfold, onPull, onReview, shade }) {
  const isCurrent = period === periodOf(kind.id, t);
  const open = doc.goals.filter((g) => !g.done).length;
  /* uma lista so: feitos no fim, e a ordem que a pessoa deu no resto */
  const goals = doc.goals.slice().sort((a, b) => (a.done - b.done) || a.order - b.order || a.createdAt - b.createdAt);
  const written = doc.review.went || doc.review.didnt || doc.review.next;
  return (
    <section className={"block block--flat horizon horizon--" + kind.id + (isCurrent ? " is-current" : "")}>
      <div className="horizon__head">
        <div className="horizon__title">
          <p className="horizon__period">
            {isCurrent && <i className="horizon__now" title="o período de agora" />}
            {periodLabel(kind.id, period)}
          </p>
          <p className="horizon__open">
            <span className="t-mono">{kind.label}</span>
            {periodSub(kind.id, period) ? " · " + periodSub(kind.id, period) : ""}
            {" · "}
            {open ? open + (open === 1 ? " aberto" : " abertos") : (doc.goals.length ? "tudo feito" : "nada planejado")}
          </p>
        </div>
        <div className="horizon__nav">
          <button className="action" type="button" title="anterior" onClick={() => onShift(-1)}>{icon("chevronLeft")}</button>
          <button className="action" type="button" title="próximo" onClick={() => onShift(1)}>{icon("chevronRight")}</button>
        </div>
      </div>
      <div className="horizon__body">
        {!doc.goals.length && <p className="empty">{kind.id === "quarter" ? "O que este trimestre precisa entregar." : kind.id === "month" ? "Desdobre o trimestre, ou escreva direto." : "O que fecha esta semana. Daqui vira cartão."}</p>}
        {!!goals.length && (
          <ul className="list">
            {goals.map((goal) => <Goal key={goal.id} g={goal} kind={kind.id} kids={childrenOf(goal.id)} parent={goal.parent ? parentOf(goal.parent) : null}
              shade={shade(goal.id)} focused={focus === goal.id} onFocus={onFocus}
              onToggle={onToggle} onEdit={onEdit} onRemove={onRemove} onUnfold={onUnfold} onPull={onPull} />)}
          </ul>)}
      </div>
      {/* o pé da coluna: as duas coisas que se faz com um horizonte. a revisão
          era três campos abertos aqui dentro, sempre — nove caixas vazias na
          tela para um gesto de fim de período. virou botão e caixa, como todo
          o resto do sistema. */}
      <div className="horizon__foot">
        <button className="pill pill--mini" type="button" onClick={onNew}>{icon("plus")}{kind.newLabel}</button>
        <button className={"pill pill--mini" + (written ? " is-on" : "")} type="button" onClick={onReview}>
          {written ? "revisão escrita" : "revisão"}
        </button>
      </div>
    </section>
  );
}

/* ---------- um objetivo ----------
   clicar no texto acende o objetivo e apaga tudo que não tem parentesco com
   ele nas outras colunas. é a única coisa que esta tela sabe fazer e que uma
   lista não faria: mostrar de onde uma semana vem e onde um trimestre
   aterrissa, sem ter que ler três listas e cruzar na cabeça. */
function Goal({ g, kind, kids, parent, shade, focused, onFocus, onToggle, onEdit, onRemove, onUnfold, onPull }) {
  const doneKids = kids.filter((c) => c.done).length;
  return (
    <li className={"line goal" + (g.done ? " is-done" : "") + shade}>
      <input type="checkbox" className="goal__check" checked={g.done} aria-label={"Concluir " + g.text} onChange={(e) => onToggle(g, e.currentTarget.checked)} />
      <button className="goal__main" type="button" aria-pressed={String(focused)}
              title={kids.length || parent ? "ver o parentesco nas outras colunas" : "sem desdobramento"}
              onClick={() => onFocus(focused ? "" : g.id)}>
        <span className="goal__text">{g.text}</span>
        {(g.client || parent || kids.length > 0 || g.card) && (
          <span className="goal__meta">
            <ClientBadge id={g.client} />
            {g.card && <span className="badge badge--green">na semana</span>}
            {kids.length > 0 && (
              <span className="goal__children" title="desdobrado">
                <i className="goal__bar"><i style={{ width: Math.round((doneKids / kids.length) * 100) + "%" }} /></i>
                {doneKids}/{kids.length} {kind === "quarter" ? "no mês" : "na semana"}
              </span>)}
            {parent && <span className="goal__parent" title={parent.text}>↳ {parent.text}</span>}
          </span>)}
      </button>
      <span className="row-actions">
        {onPull && !g.done && !g.card && <button className="action" type="button" title="puxar para a semana" onClick={() => onPull(g)}>{icon("arrow")}</button>}
        {onUnfold && !g.done && <button className="action" type="button" title={kind === "quarter" ? "desdobrar no mês" : "desdobrar na semana"} onClick={() => onUnfold(g)}>{icon("unfold")}</button>}
        <button className="action" type="button" title="editar" onClick={() => onEdit(g)}>{icon("pencil")}</button>
        <button className="action" type="button" title="apagar" onClick={() => onRemove(g)}>{icon("trash")}</button>
      </span>
    </li>
  );
}

/* ---------- a revisao do periodo ----------
   tres campos livres, gravados ao fechar. o merlin propoe; quem escreve e o
   arthur. mora numa caixa porque revisar e um gesto de fim de periodo — e
   nao o que a tela deve estar dizendo o tempo todo. */
function ReviewDialog({ kind, doc, onSave, onAsk, onClose }) {
  const [v, bind] = useFields(doc.review);
  const [thinking, setThinking] = useState(false);
  const close = () => { onSave({ went: v.went, didnt: v.didnt, next: v.next }); onClose(); };
  const ask = async () => { if (thinking) return; setThinking(true); try { await onAsk(); } finally { setThinking(false); } };
  return (
    <Dialog title={"revisão · " + periodLabel(kind.id, doc.period)} wide label="Revisão do período" onClose={close}
        sub="o que foi, o que não foi e o que muda — três frases, não um relatório"
        actions={<>
          <button className="pill merlin-btn" type="button" disabled={thinking || !doc.goals.length} onClick={ask}>
            {icon("spark")}{thinking ? "pensando…" : "revisar com o merlin"}
          </button>
          <button className="pill pill--green" type="button" onClick={close}>guardar</button>
        </>}>
      <div className="review">
        <div><label className="field-label">o que foi</label><textarea className="textarea" rows="3" {...bind("went")}></textarea></div>
        <div><label className="field-label">o que não foi</label><textarea className="textarea" rows="3" {...bind("didnt")}></textarea></div>
        <div><label className="field-label">o que muda</label><textarea className="textarea" rows="3" {...bind("next")}></textarea></div>
      </div>
    </Dialog>
  );
}

/* ---------- a caixa do objetivo: criar, editar e desdobrar sao a mesma ---------- */
function GoalForm({ plans, form, onClose, onRemove, parentOf }) {
  const kind = KINDS.find((k) => k.id === form.kind);
  const id = docId(form.kind, form.period);
  const doc = plans.get(id) || normalize({ id, kind: form.kind, period: form.period });
  const g = form.id ? doc.goals.find((x) => x.id === form.id) : null;
  const pre = form.prefill || {};
  const [v, bind] = useFields({
    text: g ? g.text : (pre.text || ""),
    client: g ? g.client : (pre.client || "")
  });
  if (form.id && !g) return null;
  const parent = form.parent ? parentOf(form.parent) : (g && g.parent ? parentOf(g.parent) : null);
  const submit = () => {
    const text = v.text.trim().slice(0, 200);
    if (!text) { notify("o objetivo precisa de um texto"); return false; }
    const now = Date.now();
    const goals = g
      ? doc.goals.map((x) => x.id === g.id ? { ...x, text, client: v.client } : x)
      : [...doc.goals, { id: newId(), text, client: v.client, done: false, parent: form.parent || "", card: "", order: now, createdAt: now }];
    plans.save({ ...doc, goals, updatedAt: now });
  };
  return (
    <Form title={g ? kind.newLabel.replace("objetivo", "objetivo") : (form.parent ? "desdobrar em " + kind.label : kind.newLabel)}
        sub={periodLabel(form.kind, form.period) + (parent ? " · de: " + parent.text : "")}
        submit={g ? "salvar" : "adicionar"} remove={g ? "apagar" : ""} onRemove={() => onRemove(g)} onClose={onClose} onSubmit={submit}>
      <Field label="objetivo" full><input className="input" maxLength="200" required placeholder="o que precisa estar feito" {...bind("text")} /></Field>
      <Field label="cliente"><select className="select" {...bind("client")}>{clientOptionList("sem cliente")}</select></Field>
    </Form>
  );
}

/* ---------- a revisao do merlin ---------- */
function MerlinDialog({ title, text, onClose }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); notify("copiado"); }
    catch (e) { notify("não consegui copiar"); }
  };
  return (
    <Dialog title={title} wide onClose={onClose}
        actions={<>
          <button className="pill" type="button" onClick={copy}>copiar</button>
          <button className="pill pill--green" type="button" onClick={onClose}>fechar</button>
        </>}>
      <Markdown className="merlin-body" text={text} />
    </Dialog>
  );
}

mount(<Plans />, "app");
