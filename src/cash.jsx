/* merlin · o caixa da empresa
   o financeiro com o livro da empresa (PRD meu-negocio, D3): o mês dia a dia,
   os fixos e o que ainda vai entrar, com quatro números no topo. sem 50/30/20,
   cartão, dívidas nem investimentos, que são do dinheiro pessoal. o caixa e o
   financeiro não se veem: cada um abre o seu livro (bookCollection). tudo em
   centavos. */
import "./shared/base.css";
import "./finance.css";
import { initPage, today, brl } from "./shared/core.js";
import { useState } from "react";
import { CASH_TEMPLATES } from "./shared/templates.js";
import { mount, useCollection, useKeydown, isTyping, EmptyStart, icon } from "./shared/ui.jsx";
import {
  normalize, configOf, contextOf, bookCollection, adjacentMonth, cashMonth, runwayLabel, suggestionsBetween, daysInMonth
} from "./shared/finance-data.js";
import { EntryForm } from "./shared/entry-form.jsx";
import { MonthView, DayItem, SuggestionItem, FixedBlocks, FixedForm, ConfigForm, entryActions } from "./shared/finance-views.jsx";

initPage("cash");

const TABS = [
  { id: "month", label: "mês" },
  { id: "fixed", label: "fixos" },
  { id: "due", label: "a receber" }
];

/* o sinal vai no texto, e não só na cor */
const signed = (cents) => (cents > 0 ? "+" : cents < 0 ? "−" : "") + brl(cents);

/* um número do topo: a legenda e o texto já formatado */
const Figure = ({ label, text, cls, title }) => (
  <div className="meter" title={title}><span className="legend">{label}</span><span className={"num mono" + (cls || "")}>{text}</span></div>);

function Cash() {
  const finance = bookCollection(useCollection("finance", { normalize }), "business");
  const [tab, setTab] = useState("month");
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [openDay, setOpenDay] = useState("");
  const [form, setForm] = useState(null); // { type, id, day?, preset? } | null

  const cfg = configOf(finance);
  const ctx = contextOf(finance);
  const t = today();
  /* nada lançado, nada fixo e nenhum saldo: é aqui que os modelos entram */
  const virgin = !cfg.startBalance && !ctx.entries.length && !ctx.fixed.length;
  const sum = cashMonth(ctx, t);

  const openTab = (id) => { setTab(id); setOpenDay(""); };
  const shiftMonth = (delta) => { setMonth((m) => adjacentMonth(m, delta)); setOpenDay(""); };
  const closeForm = () => setForm(null);
  const newEntry = (day, preset) => setForm({ type: "entry", id: "", day: day || (month === t.slice(0, 7) ? t : month + "-01"), preset });
  const edit = (type, id) => setForm({ type, id });
  /* o fixo novo nasce na categoria que mais combina com o tipo; o modelo traz a dele */
  const newFixed = (kind) => setForm({ type: "fixed", id: "", preset: { kind, category: kind === "in" ? "Clientes" : "Ferramentas" } });
  const { save, removeWithUndo, launchSuggestion, togglePaid } = entryActions(finance, setForm);

  useKeydown((e) => {
    if (form) return;
    if (e.key === "n" && !isTyping() && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); newEntry(); return; }
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      setMonth((m) => adjacentMonth(m, e.key === "ArrowLeft" ? -1 : 1));
      setTab("month");
      setOpenDay("");
    }
  });

  const dayActions = { onNewEntry: newEntry, onEditEntry: (id) => edit("entry", id), onTogglePaid: togglePaid, onLaunch: launchSuggestion };
  const formProps = { finance, categories: cfg.categories, onClose: closeForm, onRemove: removeWithUndo, onSave: save };

  return (
    <>
      <div className="header">
        <div>
          <h1>caixa</h1>
        </div>
        <div className="actions">
          <button className="pill" type="button" onClick={() => setForm({ type: "config" })}>ajustes</button>
        </div>
      </div>

      {virgin && (
        <EmptyStart
          title="O caixa da empresa começa pelo que já é fixo"
          text={"Escolha o que a empresa paga todo mês, ou diga ao Merlin: \"recebi 2.400 da Acme\"."}
          groups={CASH_TEMPLATES}
          onPick={(it) => setForm({ type: "fixed", id: "", preset: it })}
          onBlank={() => setForm({ type: "config" })}
          blankLabel="começar sem modelo" />
      )}

      {!virgin && !cfg.startBalance && (
        <p className="invite">
          <span>ainda não tenho o saldo de onde o caixa parte — sem ele a conta começa do zero.</span>
          <button className="action" type="button" title="definir o saldo inicial" aria-label="Definir o saldo inicial" onClick={() => setForm({ type: "config" })}>{icon("pencil")}</button>
        </p>)}

      {!virgin && <>
        <div className="meters mb">
          <Figure label="entrou" text={signed(sum.inflow)} cls={sum.inflow ? " is-green" : ""} />
          <Figure label="saiu" text={signed(-sum.outflow)} />
          <Figure label="sobra do mês" text={signed(sum.left)} cls={sum.left < 0 ? " is-negative" : sum.left > 0 ? " is-green" : ""} />
          <Figure label="fôlego" text={runwayLabel(sum.runway)}
            title={"o saldo de hoje (" + brl(sum.balance, true) + ") dividido pela saída média dos últimos três meses"} />
        </div>

        <div className="tabs" role="tablist">
          {TABS.map((x) => <button key={x.id} className="tab" type="button" role="tab" data-tab={x.id} aria-selected={String(tab === x.id)} onClick={() => openTab(x.id)}>{x.label}</button>)}
        </div>

        <div id="view">
          {tab === "month" && <MonthView ctx={ctx} month={month} openDay={openDay} onToggleDay={(day) => setOpenDay((o) => (o === day ? "" : day))} onShift={shiftMonth} {...dayActions} />}
          {tab === "fixed" && <div className="grid"><FixedBlocks ctx={ctx} onEdit={edit} onNewFixed={newFixed}
            empty={{ out: "nenhuma saída fixa — hospedagem, contador, DAS…", in: "nenhuma entrada fixa — a mensalidade de um cliente" }} /></div>}
          {tab === "due" && <DueView ctx={ctx} onNew={() => newEntry(t, { kind: "in", paid: false, category: "Clientes" })} {...dayActions} />}
        </div>
      </>}

      {form && form.type === "entry" && <EntryForm key={"entry:" + form.id + ":" + form.day} id={form.id} presetDay={form.day} preset={form.preset} {...formProps} />}
      {form && form.type === "fixed" && <FixedForm key={"fixed:" + form.id} id={form.id} preset={form.preset} {...formProps} />}
      {form && form.type === "config" && <ConfigForm finance={finance} split={false} onClose={closeForm} />}
    </>
  );
}

/* ----- a receber -----
   o que um cliente ainda vai pagar: as entradas previstas, as atrasadas
   primeiro, e embaixo as entradas fixas do mês que ainda não foram lançadas
   (sugestões, que não contam em nada até virar lançamento) */
function DueView({ ctx, onNew, onEditEntry, onTogglePaid, onLaunch }) {
  const t = today();
  const month = t.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const open = ctx.entries.filter((e) => e.kind === "in" && !e.paid).sort((a, b) => a.day.localeCompare(b.day));
  const total = open.reduce((s, e) => s + e.amount, 0);
  const fixed = suggestionsBetween(month + "-01", month + "-" + daysInMonth(y, m), ctx).filter((p) => p.it.kind === "in");
  return (
    <section className="block">
      <p className="heading">
        <span className="t-mono">a receber</span>
        <span className="row">
          {total > 0 && <span className="total">≈ {brl(total)}</span>}
          <button className="action" type="button" title="nova entrada prevista" aria-label="nova entrada prevista" onClick={onNew}>{icon("plus")}</button>
        </span>
      </p>
      {open.length
        ? <ul className="list">{open.map((e) => <DayItem key={e.id} it={e} day={e.day} showDay onEditEntry={onEditEntry} onTogglePaid={onTogglePaid} />)}</ul>
        : <p className="empty">nada a receber — o que um cliente ainda vai pagar entra aqui como previsto.</p>}
      {fixed.length > 0 && (
        <div className="soon soon--suggest">
          <p className="heading"><span className="t-mono">dos fixos</span><span className="small weak">ainda não lançados · não contam em nada até você lançar</span></p>
          <ul className="list">{fixed.map((p) => <SuggestionItem key={p.it.id} it={p.it} day={p.day} onLaunch={onLaunch} />)}</ul>
        </div>)}
    </section>
  );
}

mount(<Cash />, "app");
