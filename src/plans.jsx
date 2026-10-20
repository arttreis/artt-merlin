/* merlin · o plano
   saiu em 09/10/2026 (VISAO, 9.3) como três colunas de checklist, sem verbo
   e sem nada que se medisse sozinho, e volta em 20/10/2026 como a primeira
   aba de meu negócio (PRD meu-negocio, D4): uma meta-norte no ano, uma no
   semestre e até três no trimestre. o trimestre fica aberto, com PeriodNav;
   o ano e o semestre que o contêm são uma linha cada, em cima.

   a meta escolhe de onde vem o número (clientes ativos, faturamento do
   caixa, leads fechados, produto lançado, pessoas no time) e se mede sozinha;
   "à mão" é permitido e fica marcado. o miolo é shared/plans-data.js, e o
   verbo é "meta do tri: 10 clientes" na conversa (goal-set). mês e semana
   ficam com o calendário. */
import "./shared/base.css";
import "./plans.css";
import { useState } from "react";
import { initPage, today, notify } from "./shared/core.js";
import { mount, useCollection, useFields, useKeydown, isTyping, EmptyStart, PeriodNav, Form, Field, icon } from "./shared/ui.jsx";
import { normalize as normalizeFinance } from "./shared/finance-data.js";
import {
  normalize, GOAL_SOURCES, periodOf, shiftQuarter, halfOf, yearOf, quarterLabel, goalPrefix,
  goalsOf, canAdd, progressOf, goalLine, goalDoc, readTarget, targetText, sourceLabel
} from "./shared/plans-data.js";

initPage("plans");

/* os modelos da tela vazia: escolher abre a caixa com a fonte certa */
const TEMPLATES = [{
  key: "goals", label: "modelos", note: "os com número o Merlin acompanha sozinho",
  items: [
    { id: "clients", name: "chegar a N clientes ativos", summary: "conta os clientes ativos" },
    { id: "revenue", name: "faturar R$ X no tri", summary: "soma as entradas do caixa" },
    { id: "launched", name: "lançar [produto]", summary: "sim ou não" },
    { id: "won", name: "fechar N leads", summary: "conta os leads fechados" }
  ]
}];

/* a meta sem texto ganha o do modelo, com o alvo no lugar do N */
const HORIZON = { year: "no ano", half: "no semestre", quarter: "no tri" };
function textOf(source, target, kind) {
  const n = targetText(target, source);
  if (source === "clients") return "chegar a " + (n || "N") + " clientes ativos";
  if (source === "revenue") return "faturar R$ " + (n || "X") + " " + HORIZON[kind];
  if (source === "won") return "fechar " + (n || "N") + " leads";
  if (source === "team") return "ter " + (n || "N") + " pessoas no time";
  if (source === "launched") return "lançar um produto";
  return "";
}

/* ---------- a caixa da meta ----------
   `form` é { kind, period, id?, source? }: com id, edita; sem, é a nova, já
   com a fonte do modelo escolhido */
function GoalForm({ plans, form, data, onClose }) {
  const editing = form.id ? plans.get(form.id) : null;
  const kind = editing ? editing.kind : form.kind;
  const period = editing ? editing.period : form.period;
  const [v, bind, set] = useFields({
    text: editing ? editing.text : "",
    source: editing ? editing.source : form.source || "manual",
    target: editing ? targetText(editing.target, editing.source) : "",
    current: editing && editing.current ? String(editing.current) : "",
    done: editing ? editing.done : false
  });
  const target = v.source === "launched" ? 1 : readTarget(v.target, v.source);
  const draft = normalize({ id: "draft", kind, period, source: v.source, text: v.text.trim() || textOf(v.source, target, kind), target, current: readTarget(v.current, "manual"), done: v.done });
  const sub = draft.source === "manual" ? "à mão: você move o número" : draft.source === "launched" ? "sim ou não: você marca quando lançar" : "o Merlin mede sozinho · hoje " + progressOf(draft, data).text;
  const changeSource = (source) => { if (source !== v.source) { set("source", source); set("target", ""); } };

  const submit = () => {
    if (editing) {
      const doc = { ...editing, text: draft.text, source: draft.source, target: draft.target, current: draft.current, done: draft.done, updatedAt: Date.now() };
      plans.save(doc);
      notify("✓ " + goalLine(doc, data), () => plans.save({ ...editing, updatedAt: Date.now() }));
      return;
    }
    const { doc, error } = goalDoc({ kind, period, text: draft.text, source: draft.source, target: draft.target, current: draft.current }, plans.all(), today());
    if (error) { notify(error); return false; }
    plans.save({ ...doc, done: draft.done });
    notify("✓ " + goalLine(doc, data), () => plans.remove(doc.id));
  };
  const erase = () => {
    plans.remove(editing.id);
    notify("meta apagada", () => plans.save({ ...editing, updatedAt: Date.now() }));
  };

  return (
    <Form title={(editing ? "" : "nova ") + goalPrefix(kind, period)} sub={sub} submit={editing ? "salvar" : "definir"}
          remove={editing ? "apagar a meta" : undefined} onRemove={erase} onSubmit={submit} onClose={onClose}>
      <Field label="o que precisa ser verdade" full>
        <input className="input" maxLength={140} placeholder={textOf(v.source, target, kind) || "a meta, numa frase"} {...bind("text")} />
      </Field>
      <Field label="como se mede">
        <select className="select" value={v.source} onChange={(e) => changeSource(e.currentTarget.value)}>
          {GOAL_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </Field>
      {v.source === "launched"
        ? <label className="row pl-check"><input type="checkbox" {...bind("done", "check")} /> já lançou</label>
        : <Field label={v.source === "revenue" ? "alvo (R$)" : "alvo"}>
            <input className="input input--num" inputMode={v.source === "revenue" ? "decimal" : "numeric"} required placeholder={v.source === "revenue" ? "30.000" : "10"} {...bind("target")} />
          </Field>}
      {v.source === "manual" && (
        <Field label="hoje">
          <input className="input input--num" inputMode="numeric" placeholder="0" {...bind("current")} />
        </Field>)}
    </Form>
  );
}

/* ---------- uma meta ----------
   o texto abre a caixa; embaixo, a barra e "6/10". a meta de lançar não tem
   número: a marca de lançado é um toque */
function Goal({ goal, data, label, onOpen, onToggle }) {
  const p = progressOf(goal, data);
  return (
    <li className="pl-goal">
      <div className="pl-goal__head">
        {label && <span className="pl-goal__when t-mono">{label}</span>}
        <button className="pl-goal__open" type="button" aria-label={"editar a meta: " + goal.text} onClick={onOpen}>{goal.text}</button>
        {p.manual
          ? <span className="pl-tag" title="o número desta meta é você quem move">à mão</span>
          : <span className="pl-goal__src">{sourceLabel(goal.source)}</span>}
      </div>
      <div className="pl-goal__meter">
        <span className="bar" role="progressbar" aria-label={goal.text} aria-valuemin={0} aria-valuenow={p.value} aria-valuemax={p.target}><i style={{ width: p.pct + "%" }} /></span>
        {goal.source === "launched"
          ? <button className={"chip" + (goal.done ? " is-on" : "")} type="button" aria-pressed={String(goal.done)} onClick={onToggle}>{p.text}</button>
          : <span className="pl-goal__num t-mono">{p.text}</span>}
      </div>
    </li>
  );
}

/* ---------- a página ---------- */
function Plans() {
  const plans = useCollection("plans", { normalize });
  const finance = useCollection("finance", { normalize: normalizeFinance });
  const clients = useCollection("clients");
  const team = useCollection("team");
  const t = today();
  const now = periodOf(t, "quarter");
  const [quarter, setQuarter] = useState(now);
  const [form, setForm] = useState(null);

  const data = { finance: finance.all(), clients: clients.all(), team: team.all() };
  const docs = plans.all();
  const half = halfOf(quarter), year = yearOf(quarter);
  const tri = goalsOf(docs, "quarter", quarter);
  const room = canAdd(docs, "quarter", quarter);
  const past = quarter < now;

  const add = (kind, period, source) => setForm({ kind, period, source });
  const open = (id) => setForm({ id });
  const toggle = (goal) => {
    plans.save({ ...goal, done: !goal.done, updatedAt: Date.now() });
    notify(goal.done ? "marcado como não lançado" : "✓ lançado · " + goal.text, () => plans.save({ ...goal, updatedAt: Date.now() }));
  };

  useKeydown((e) => {
    if (form) return;
    if (e.key === "n" && !isTyping() && !e.ctrlKey && !e.metaKey && !e.altKey && room) { e.preventDefault(); add("quarter", quarter); return; }
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); setQuarter((q) => shiftQuarter(q, e.key === "ArrowLeft" ? -1 : 1)); }
  });

  /* o ano e o semestre: uma linha cada, com a barra, ou o convite a definir */
  const north = (kind, period, label) => {
    const goal = goalsOf(docs, kind, period)[0];
    if (goal) return <Goal key={kind} goal={goal} data={data} label={label} onOpen={() => open(goal.id)} onToggle={() => toggle(goal)} />;
    return (
      <li key={kind} className="pl-goal pl-goal--empty">
        <div className="pl-goal__head">
          <span className="pl-goal__when t-mono">{label}</span>
          <span className="pl-goal__none">sem meta-norte</span>
          <button className="action" type="button" title={"definir a " + goalPrefix(kind, period)} aria-label={"Definir a " + goalPrefix(kind, period)} onClick={() => add(kind, period)}>{icon("plus")}</button>
        </div>
      </li>
    );
  };

  return (
    <>
      <div className="header">
        <div>
          <h1>plano</h1>
          <p className="sub">o que precisa ser verdade no fim do período</p>
        </div>
        <div className="actions">
          <PeriodNav label={quarterLabel(quarter)} current={quarter === now} prevLabel="trimestre anterior" nextLabel="próximo trimestre"
            onPrev={() => setQuarter((q) => shiftQuarter(q, -1))} onNext={() => setQuarter((q) => shiftQuarter(q, 1))} onToday={() => setQuarter(now)} />
        </div>
      </div>

      <ul className="pl-list pl-north" aria-label="ano e semestre">
        {north("year", year, year)}
        {north("half", half, half.slice(-1) + "º sem")}
      </ul>

      <section className="block">
        <p className="heading">
          <span className="t-mono">{quarterLabel(quarter)}</span>
          <span className="row">
            {tri.length > 0 && (room
              ? <button className="action" type="button" title="nova meta do trimestre" aria-label="Nova meta do trimestre" onClick={() => add("quarter", quarter)}>{icon("plus")}</button>
              : <span className="pl-full">três já é muito para um trimestre</span>)}
          </span>
        </p>
        {tri.length > 0
          ? <ul className="pl-list">{tri.map((g) => <Goal key={g.id} goal={g} data={data} onOpen={() => open(g.id)} onToggle={() => toggle(g)} />)}</ul>
          : past
          ? <p className="empty">nenhuma meta neste trimestre.</p>
          : <EmptyStart
              title="O que precisa ser verdade no fim do trimestre?"
              text="Até três metas. As que têm número o Merlin acompanha sozinho."
              groups={TEMPLATES}
              onPick={(it) => add("quarter", quarter, it.id)}
              onBlank={() => add("quarter", quarter, "manual")}
              blankRow blankLabel="escrever a minha" blankNote="à mão, ou com a fonte que quiser" />}
      </section>

      {form && <GoalForm key={form.id || form.kind + form.period + form.source} plans={plans} form={form} data={data} onClose={() => setForm(null)} />}
    </>
  );
}

mount(<Plans />, "app");
