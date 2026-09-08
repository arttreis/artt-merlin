/* merlin · o financeiro
   o mes dia a dia com saldo, os doze meses do ano lado a lado e o painel dos
   fixos, do cartao e das dividas. tudo em centavos. */
import "./shared/base.css";
import "./finance.css";
import {
  initPage, newId, today, notify, brl, parseMoney,
  isDay, addDays, weekdayOf, monthLabel, dateLabel
} from "./shared/core.js";
import { useState } from "react";
import { FINANCE_TEMPLATES, financeGroups, buildFinance } from "./shared/templates.js";
import {
  mount, useCollection, useKeydown, isTyping,
  useFields, Form, Field, EmptyStart, icon
} from "./shared/ui.jsx";

initPage("finance");

const pad = (n) => String(n).padStart(2, "0");
const inReais = (cents) => cents ? (cents / 100).toFixed(2).replace(".", ",") : "";
const SHORT_MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/* categorias padrao: as da planilha, ate a config guardar a lista propria */
const DEFAULT_CATEGORIES = ["Básicas/PF", "Básicas/PJ", "Lazer", "Recorrente", "Ferramentas", "Freela", "Investimento", "Outros"];

const TABS = [
  { id: "today", label: "hoje" },
  { id: "month", label: "mês" },
  { id: "year", label: "ano" },
  { id: "panel", label: "painel" }
];

/* ================================================================
   o coracao do modulo: saldo e projecoes
   ================================================================
   estas funcoes sao puras — recebem tudo que precisam em `ctx` e nao leem
   a colecao nem o DOM. e o que permite chamar a mesma conta de varios
   lugares (o medidor do mes, a tabela dia a dia, os doze meses do ano) sem
   arriscar que cada um implemente sua propria versao e um dia elas
   divirjam; e testar com `node` puro, porque um numero errado aqui e
   dinheiro errado.
   ================================================================ */

function daysInMonth(year, month) {
  /* dia 0 do mes seguinte (1-based) e o ultimo dia do mes atual — cobre
     fevereiro de ano bissexto sem precisar de tabela de excecoes */
  return new Date(year, month, 0).getDate();
}
function effectiveDay(year, month, dayOfMonth) {
  /* fixo/divida/parcela com dayOfMonth 31 cai no ultimo dia do mes nos
     meses que nao tem 31 — nunca "vaza" pro dia 1 do mes seguinte */
  return Math.min(dayOfMonth, daysInMonth(year, month));
}
/* meses entre "2026-09" e "2026-12" = 3; negativo se `to` vem antes */
function monthsBetween(from, to) {
  const [y1, m1] = from.split("-").map(Number), [y2, m2] = to.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}
const cardInstallment = (c) => c.installments ? Math.round(c.total / c.installments) : 0;
/* que numero de parcela cai no mes `yyyymm`: 1 na primeira, 0 antes dela,
   acima de `installments` depois da ultima */
const installmentNumber = (c, yyyymm) => c.start ? monthsBetween(c.start, yyyymm) + 1 : 0;

/* uma projecao ja virou lancamento real naquele mes? sem isso, confirmar
   um fixo faria ele contar duas vezes: uma como lancamento pago, outra
   como projecao do mesmo dia */
function alreadyEntered(entries, originType, id, day) {
  const month = day.slice(0, 7);
  return (entries || []).some((e) =>
    e.origin && e.origin.type === originType && e.origin.id === id && e.day.slice(0, 7) === month);
}

/* tudo que o dia `day` teria alem dos lancamentos ja gravados: a
   recorrencia dos fixos, a parcela de uma divida (enquanto ela nao
   quitar) e a parcela de uma compra no cartao (enquanto houver parcela).
   nada aqui grava documento nenhum — e so a pergunta "o que cai neste
   dia?" respondida sem efeito colateral, pra poder chamar de novo a
   vontade (o mes inteiro, o balanceUntil, o ano). */
function projectionsOf(day, ctx) {
  const [year, month, dayNum] = day.split("-").map(Number);
  const yyyymm = day.slice(0, 7);
  const proj = [];

  (ctx.fixed || []).forEach((f) => {
    if (!f.active) return;
    if (effectiveDay(year, month, f.dayOfMonth) !== dayNum) return;
    if (alreadyEntered(ctx.entries, "fixed", f.id, day)) return;
    proj.push({
      id: "proj-fixed-" + f.id + "-" + day, name: f.name, amount: f.amount, kind: f.kind,
      category: f.category, origin: { type: "fixed", id: f.id }
    });
  });

  (ctx.debts || []).forEach((d) => {
    if (d.paid >= d.total) return; /* quitada: para de projetar */
    if (effectiveDay(year, month, d.dayOfMonth) !== dayNum) return;
    if (alreadyEntered(ctx.entries, "debt", d.id, day)) return;
    const remaining = d.total - d.paid;
    proj.push({
      id: "proj-debt-" + d.id + "-" + day, name: d.name, amount: Math.min(d.installment || remaining, remaining),
      kind: "out", category: "Dívida", origin: { type: "debt", id: d.id }
    });
  });

  (ctx.cards || []).forEach((c) => {
    const n = installmentNumber(c, yyyymm);
    if (n < 1 || n > c.installments) return;
    if (effectiveDay(year, month, c.dayOfMonth) !== dayNum) return;
    if (alreadyEntered(ctx.entries, "card", c.id, day)) return;
    proj.push({
      id: "proj-card-" + c.id + "-" + day, name: c.name + " · " + n + "/" + c.installments, amount: cardInstallment(c),
      kind: "out", category: "Cartão", origin: { type: "card", id: c.id }
    });
  });

  return proj;
}

/* a data mais antiga entre os lancamentos: usada so quando ainda nao existe
   startBalance, pra a tela nao ficar zerada por falta de configuracao */
function oldestDay(entries) {
  let oldest = null;
  (entries || []).forEach((e) => { if (!oldest || e.day < oldest) oldest = e.day; });
  return oldest;
}

/* saldo no fim do dia `day`: parte do saldo inicial e anda dia a dia,
   somando lancamentos (pago ou nao — um lancamento nao pago ja e a propria
   previsao) e as projecoes. e dia a dia, e nao "soma tudo com data <= dia",
   porque so assim o effectiveDay se aplica mes a mes igual um calendario. */
function balanceUntil(day, ctx) {
  const oldest = oldestDay(ctx.entries);
  const cfg = ctx.startBalance || (oldest ? { day: oldest, amount: 0 } : null);
  if (!cfg) return 0;
  if (day < cfg.day) return cfg.amount;
  let balance = cfg.amount;
  let d = cfg.day;
  while (d <= day) {
    (ctx.entries || []).forEach((e) => {
      if (e.day !== d) return;
      balance += e.kind === "in" ? e.amount : -e.amount;
    });
    projectionsOf(d, ctx).forEach((p) => { balance += p.kind === "in" ? p.amount : -p.amount; });
    d = addDays(d, 1);
  }
  return balance;
}

/* o mes inteiro, dia a dia: um balanceUntil() so pro dia anterior ao 1,
   depois anda dia a dia — em vez de chamar balanceUntil() pra cada linha */
function buildMonth(yyyymm, ctx, balanceBefore) {
  const [year, month] = yyyymm.split("-").map(Number);
  const nDays = daysInMonth(year, month);
  let balance = balanceBefore != null ? balanceBefore : balanceUntil(addDays(yyyymm + "-01", -1), ctx);
  /* antes do marco (saldo inicial, ou o lancamento mais antigo) nao ha
     conta: o dia aparece vazio, e o saldo fica parado no valor inicial —
     a mesma regra do balanceUntil, senao o ano e o mes discordariam */
  const marker = (ctx.startBalance || {}).day || oldestDay(ctx.entries) || "";
  const days = [];
  for (let i = 1; i <= nDays; i++) {
    const day = yyyymm + "-" + pad(i);
    if (marker && day < marker) { days.push({ day, inflow: 0, outflow: 0, balance, items: [], before: true }); continue; }
    const items = ctx.entries.filter((e) => e.day === day).concat(projectionsOf(day, ctx));
    const inflow = items.filter((x) => x.kind === "in").reduce((s, x) => s + x.amount, 0);
    const outflow = items.filter((x) => x.kind === "out").reduce((s, x) => s + x.amount, 0);
    balance += inflow - outflow;
    days.push({ day, inflow, outflow, balance, items });
  }
  return days;
}
function adjacentMonth(yyyymm, delta) {
  const [year, month] = yyyymm.split("-").map(Number);
  let m = month + delta, y = year;
  if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
  return y + "-" + pad(m);
}

/* ---------- colecao e normalizacao ----------
   uma colecao so, varios tipos — o proprio documento diz o que ele e, e a
   normalizacao decide os campos por tipo. os tipos sao os quatro blocos da
   planilha (fixo de saida/entrada, cartao, divida), mais o lancamento do
   dia a dia e a config. */

function normalizeOrigin(o) {
  if (!o || !o.type) return null;
  return { type: String(o.type), id: String(o.id || "") };
}

function normalize(d) {
  const base = {
    id: String(d.id || ""),
    type: String(d.type || ""),
    createdAt: Number.isFinite(+d.createdAt) ? +d.createdAt : Date.now(),
    updatedAt: Number.isFinite(+d.updatedAt) ? +d.updatedAt : Date.now()
  };
  const clampDay = (v, fallback) => Math.min(31, Math.max(1, Math.round(+v) || fallback));
  switch (base.type) {
    case "entry":
      return {
        ...base,
        day: isDay(d.day) ? d.day : today(),
        name: String(d.name || "").slice(0, 140),
        amount: Math.round(Math.abs(+d.amount)) || 0,
        kind: d.kind === "in" ? "in" : "out",
        category: String(d.category || ""),
        paid: !!d.paid,
        origin: normalizeOrigin(d.origin)
      };
    case "fixed":
      return {
        ...base,
        name: String(d.name || "").slice(0, 140),
        amount: Math.round(Math.abs(+d.amount)) || 0,
        kind: d.kind === "in" ? "in" : "out",
        category: String(d.category || ""),
        dayOfMonth: clampDay(d.dayOfMonth, 1),
        active: d.active !== false
      };
    case "card":
      /* uma compra parcelada no cartao: total, quantas parcelas, em que mes
         cai a primeira e em que dia vence — a parcela sai do total */
      return {
        ...base,
        name: String(d.name || "").slice(0, 140),
        card: String(d.card || "").slice(0, 40),
        total: Math.round(Math.abs(+d.total)) || 0,
        installments: Math.max(1, Math.round(+d.installments) || 1),
        start: /^\d{4}-\d{2}$/.test(d.start) ? d.start : today().slice(0, 7),
        dayOfMonth: clampDay(d.dayOfMonth, 10)
      };
    case "debt":
      return {
        ...base,
        name: String(d.name || "").slice(0, 140),
        creditor: String(d.creditor || "").slice(0, 80),
        total: Math.round(Math.abs(+d.total)) || 0,
        paid: Math.max(0, Math.round(+d.paid) || 0),
        installment: Math.round(Math.abs(+d.installment)) || 0,
        dayOfMonth: clampDay(d.dayOfMonth, 1)
      };
    case "config":
      return {
        ...base,
        id: "config",
        startBalance: d.startBalance && isDay(d.startBalance.day)
          ? { day: d.startBalance.day, amount: Math.round(+d.startBalance.amount) || 0 }
          : null,
        percents: {
          expenses: Number.isFinite(+((d.percents || {}).expenses)) ? +d.percents.expenses : 50,
          spending: Number.isFinite(+((d.percents || {}).spending)) ? +d.percents.spending : 30,
          assets: Number.isFinite(+((d.percents || {}).assets)) ? +d.percents.assets : 20
        },
        categories: Array.isArray(d.categories) && d.categories.length ? d.categories.map(String) : DEFAULT_CATEGORIES.slice()
      };
    default:
      return { ...base, ...d };
  }
}

const byType = (finance, type) => finance.all().filter((d) => d.type === type);
const configOf = (finance) => finance.get("config") || normalize({ id: "config", type: "config" });
function saveConfig(finance, partial) {
  const current = configOf(finance);
  finance.save({ ...current, ...partial, id: "config", type: "config", updatedAt: Date.now() });
}
function contextOf(finance) {
  return {
    entries: byType(finance, "entry"),
    fixed: byType(finance, "fixed"),
    debts: byType(finance, "debt"),
    cards: byType(finance, "card"),
    startBalance: configOf(finance).startBalance
  };
}
/* o <select> de categoria e controlado: quando o valor pedido nao esta na
   lista (categoria apagada, ou nenhuma ainda), fica a primeira — que e o
   que o navegador fazia sozinho no formulario por string */
const pickCategory = (categories, wanted) => categories.includes(wanted) ? wanted : (categories[0] || "");

/* ---------- a pagina ----------
   o estado de tela mora aqui: a aba, o mes e o ano abertos, o dia expandido
   e qual caixa esta aberta. nada disso e documento — some ao recarregar. */
function Finance() {
  const finance = useCollection("finance", { normalize });
  const [tab, setTab] = useState("today");
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [year, setYear] = useState(() => +today().slice(0, 4));
  const [openDay, setOpenDay] = useState("");
  const [form, setForm] = useState(null); // { type, id, day?, kind? } | null

  const cfg = configOf(finance);
  const ctx = contextOf(finance);
  /* nunca tocado: nem saldo de partida, nem uma linha lancada, nem nada fixo.
     tres abas de zeros nao ensinam nada — e aqui que o modelo entra. */
  const virgin = !cfg.startBalance && !ctx.entries.length && !ctx.fixed.length && !ctx.debts.length && !ctx.cards.length;

  /* ---------- navegacao ---------- */
  const openTab = (id) => { setTab(id); setOpenDay(""); };
  const shiftMonth = (delta) => { setMonth((m) => adjacentMonth(m, delta)); setOpenDay(""); };
  const shiftYear = (delta) => setYear((y) => y + delta);
  const openMonth = (yyyymm) => { setMonth(yyyymm); setTab("month"); setOpenDay(""); };
  const toggleDay = (day) => setOpenDay((open) => open === day ? "" : day);

  /* ---------- caixas ---------- */
  const closeForm = () => setForm(null);
  const newEntry = (day) => setForm({ type: "entry", id: "", day: day || (month === today().slice(0, 7) ? today() : month + "-01") });
  const edit = (type, id) => setForm({ type, id });
  const newFixed = (kind) => setForm({ type: "fixed", id: "", kind });

  /* ---------- gravar e apagar ---------- */
  const save = (doc, existing, text) => {
    finance.save({ ...doc, createdAt: existing ? existing.createdAt : Date.now(), updatedAt: Date.now() });
    notify(text);
  };
  const removeWithUndo = (id, text) => {
    const before = finance.remove(id);
    notify(text, before ? () => finance.save(before) : null);
  };

  /* ---------- acoes do dia ---------- */
  const confirmProjection = (day, originType, originId) => {
    const proj = projectionsOf(day, contextOf(finance)).find((p) => p.origin.type === originType && p.origin.id === originId);
    if (!proj) return;
    finance.save({
      id: newId(), type: "entry", day, name: proj.name, amount: proj.amount,
      kind: proj.kind, category: proj.category,
      paid: true, origin: proj.origin, createdAt: Date.now(), updatedAt: Date.now()
    });
    if (originType === "debt") {
      const d = finance.get(originId);
      if (d) finance.save({ ...d, paid: Math.min(d.total, d.paid + proj.amount), updatedAt: Date.now() });
    }
    notify("confirmado — virou lançamento");
  };
  const togglePaid = (id) => {
    const doc = finance.get(id);
    if (doc) finance.save({ ...doc, paid: !doc.paid, updatedAt: Date.now() });
  };
  const payInstallment = (id) => {
    const d = finance.get(id);
    if (!d) return;
    const amount = Math.min(d.installment || (d.total - d.paid), d.total - d.paid);
    if (amount <= 0) return;
    finance.save({
      id: newId(), type: "entry", day: today(), name: "parcela · " + d.name, amount,
      kind: "out", category: "Dívida", paid: true,
      origin: { type: "debt", id: d.id }, createdAt: Date.now(), updatedAt: Date.now()
    });
    finance.save({ ...d, paid: d.paid + amount, updatedAt: Date.now() });
    notify("parcela paga — virou lançamento de hoje");
  };

  /* atalhos: n abre um lancamento novo, alt+setas troca de mes ou de ano —
     os mesmos habitos do resto do sistema. Esc e das caixas, que se fecham
     sozinhas. */
  useKeydown((e) => {
    if (form) return;
    if (e.key === "n" && !isTyping() && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); newEntry(); return; }
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const delta = e.key === "ArrowLeft" ? -1 : 1;
      if (tab === "year") shiftYear(delta);
      else { setMonth((m) => adjacentMonth(m, delta)); setTab("month"); }
      setOpenDay("");
    }
  });

  /* o modelo monta o ESQUELETO do mes: as linhas fixas com dia de
     vencimento e categoria, e o valor em branco. o saldo inicial fica
     carimbado em hoje com zero, para a conta ter de onde partir — e a tela
     abre no painel, que e onde os valores se preenchem. */
  const applyTemplate = (tplId) => {
    const tpl = FINANCE_TEMPLATES.find((t) => t.id === tplId);
    if (!tpl) return;
    const seed = buildFinance(tpl);
    const now = Date.now();
    finance.saveMany(seed.fixed.map((f) => normalize({ ...f, id: newId(), createdAt: now, updatedAt: now })));
    saveConfig(finance, {
      startBalance: { day: today(), amount: 0 },
      categories: seed.categories
    });
    setTab("panel");
    notify("montei o esqueleto — agora os valores");
  };

  const dayActions = { onNewEntry: newEntry, onEditEntry: (id) => edit("entry", id), onTogglePaid: togglePaid, onConfirm: confirmProjection };
  const formProps = { finance, categories: cfg.categories, onClose: closeForm, onRemove: removeWithUndo, onSave: save };

  return (
    <>
      <div className="header">
        <div>
          <h1>financeiro</h1>
          <p className="sub">o mês dia a dia, e o que é fixo — do jeito da planilha</p>
        </div>
        <div className="actions">
          <button className="pill" type="button" onClick={() => setForm({ type: "config" })}>config</button>
        </div>
      </div>

      {/* nada lancado, nada fixo e nenhum saldo: as tres abas mostrariam tres
          tabelas de zeros. o que trava aqui nao e a ferramenta, e lembrar de
          tudo que se repete todo mes — entao o modelo lembra por voce e
          deixa so os valores em branco. */}
      {virgin && (
        <EmptyStart
          title="como é o seu mês?"
          text="Escolha o que mais parece com a sua vida e eu monto as linhas fixas com o dia de vencimento e a categoria de cada uma — com o valor em branco, que é a única coisa que ninguém pode adivinhar por você. Dá para apagar, renomear e acrescentar tudo depois."
          groups={financeGroups().map((g) => ({
            ...g,
            items: g.items.map((t) => ({ ...t, line: (t.out.length + t.in.length) + " linhas fixas" }))
          }))}
          onPick={(t) => applyTemplate(t.id)}
          onBlank={() => setForm({ type: "config" })}
          note="Prefere do zero?"
          blankLabel="só definir o saldo inicial" />
      )}

      {!virgin && !cfg.startBalance && (
        <p className="invite" id="invite">
          <span>ainda não tenho um saldo inicial pra partir a conta — sem ele o saldo começa do zero.</span>
          <button className="link" type="button" onClick={() => setForm({ type: "config" })}>definir agora</button>
        </p>)}

      {!virgin && <>
      <div className="tabs" role="tablist">
        {TABS.map((t) => <button key={t.id} className="tab" type="button" role="tab" data-tab={t.id} aria-selected={String(tab === t.id)} onClick={() => openTab(t.id)}>{t.label}</button>)}
      </div>

      <div id="view">
        {tab === "today" && <TodayView ctx={ctx} cfg={cfg} finance={finance} month={month}
          onOpenMonth={() => openTab("month")} onConfig={() => setForm({ type: "config" })} {...dayActions}/>}
        {tab === "month" && <MonthView ctx={ctx} month={month} openDay={openDay} onToggleDay={toggleDay} onShift={shiftMonth} {...dayActions}/>}
        {tab === "year" && <YearView ctx={ctx} year={year} onShift={shiftYear} onOpenMonth={openMonth}/>}
        {tab === "panel" && <PanelView ctx={ctx} cfg={cfg} onEdit={edit} onNewFixed={newFixed} onNewCard={() => setForm({ type: "card", id: "" })} onNewDebt={() => setForm({ type: "debt", id: "" })} onPay={payInstallment}/>}
      </div>
      </>}

      {form && form.type === "entry" && <EntryForm key={"entry:" + form.id} id={form.id} presetDay={form.day} {...formProps}/>}
      {form && form.type === "fixed" && <FixedForm key={"fixed:" + form.id} id={form.id} presetKind={form.kind} {...formProps}/>}
      {form && form.type === "card" && <CardForm key={"card:" + form.id} id={form.id} {...formProps}/>}
      {form && form.type === "debt" && <DebtForm key={"debt:" + form.id} id={form.id} {...formProps}/>}
      {form && form.type === "config" && <ConfigForm finance={finance} onClose={closeForm}/>}
    </>
  );
}

/* um medidor: legenda em cima, numero embaixo */
const Meter = ({ label, value, cls }) => (
  <div className="meter"><span className="legend">{label}</span><span className={"num mono" + (cls || "")}>{brl(value)}</span></div>);

/* ----- hoje: a primeira tela do dinheiro -----
   o financeiro abria no mês dia a dia, que é uma planilha de 30 linhas: para
   saber quanto tem hoje era preciso achar a linha de hoje no meio dela. esta
   aba responde as três perguntas que se faz antes de qualquer outra — quanto
   tenho, quanto sobra no fim do mês, e o que vence agora — e só depois abre
   a planilha para quem quiser o dia a dia.

   nenhuma conta nova mora aqui: saldo e projeção saem de balanceUntil e
   buildMonth, os mesmos do mês e do ano. duas contas para o mesmo saldo
   seriam dois saldos. */
function TodayView({ ctx, cfg, finance, month, onOpenMonth, onNewEntry, onEditEntry, onTogglePaid, onConfirm, onConfig }) {
  const t = today();
  const days = buildMonth(month, ctx);
  const balanceToday = balanceUntil(t, ctx);
  const last = days[days.length - 1];
  const inflow = days.reduce((s, d) => s + d.inflow, 0);
  const outflow = days.reduce((s, d) => s + d.outflow, 0);
  const isThisMonth = month === t.slice(0, 7);

  /* o que vence nos próximos sete dias, projeção junto: é o que muda uma
     decisão hoje. mais que isso já é o mês, e o mês tem aba própria. */
  const horizon = addDays(t, 7);
  const soon = days
    .filter((d) => d.day >= t && d.day <= horizon && d.items.length)
    .map((d) => ({ day: d.day, items: d.items.filter((it) => it.kind === "out" || it.kind === "in") }))
    .filter((d) => d.items.length);

  /* o menor saldo do mês daqui pra frente: o buraco antes dele fechar. um
     mês que termina no azul pode passar por vermelho no meio, e é isso que
     nenhum "previsto para o fim do mês" conta sozinho. */
  const ahead = days.filter((d) => d.day >= t && !d.before);
  const low = ahead.length ? ahead.reduce((m, d) => (d.balance < m.balance ? d : m), ahead[0]) : null;

  return (
    <>
      <div className="grid">
        <section className="block col-4">
          <p className="heading"><span className="t-mono">{isThisMonth ? "hoje" : "no fim do mês"}</span></p>
          <Meter label={isThisMonth ? dateLabel(t) : monthLabel(month)}
                 value={isThisMonth ? balanceToday : last.balance}
                 cls={(isThisMonth ? balanceToday : last.balance) < 0 ? " is-negative" : ""} />
          {!cfg.startBalance && (
            <p className="note mt2">sem saldo inicial a conta parte do zero.{" "}
              <button className="link" type="button" onClick={onConfig}>definir</button></p>)}
        </section>

        <section className="block col-4">
          <p className="heading"><span className="t-mono">previsto · fim de {monthLabel(month)}</span></p>
          <Meter label={last.balance >= balanceToday ? "sobe no que falta do mês" : "desce no que falta do mês"}
                 value={last.balance} cls={last.balance < 0 ? " is-negative" : ""} />
          {low && low.balance < 0 && (
            <p className="note mt2">passa por {brl(low.balance)} em {dateLabel(low.day)} antes de fechar.</p>)}
        </section>

        <section className="block col-4">
          <p className="heading"><span className="t-mono">o mês</span></p>
          {/* dois numeros lado a lado no mesmo ladrilho estouravam a coluna:
             aqui eles sao uma linha cada, e a barra embaixo e que compara. */}
          <div className="money-pair">
            <span><b className="mono is-green">{brl(inflow, true)}</b><small>entra</small></span>
            <span><b className="mono">{brl(-outflow)}</b><small>sai</small></span>
          </div>
          <div className="bar mt2"><i style={{ width: (inflow ? Math.min(100, Math.round((outflow / inflow) * 100)) : 100) + "%" }} /></div>
          <p className="note mt2">{inflow
            ? (outflow <= inflow
                ? "sai " + Math.round((outflow / inflow) * 100) + "% do que entra"
                : "sai mais do que entra neste mês")
            : "nada entrou neste mês ainda"}</p>
        </section>

        <section className="block col-7">
          <p className="heading">
            <span className="t-mono">os próximos sete dias</span>
            <button className="pill pill--mini" type="button" onClick={() => onNewEntry(t)}>{icon("plus")}lançamento</button>
          </p>
          {soon.length
            ? soon.map((d) => (
                <div key={d.day} className="soon">
                  <p className="soon__day t-mono">{d.day === t ? "hoje" : dateLabel(d.day)}</p>
                  <ul className="list">
                    {d.items.map((it) => <DayItem key={it.id} it={it} day={d.day} onEditEntry={onEditEntry} onTogglePaid={onTogglePaid} onConfirm={onConfirm} />)}
                  </ul>
                </div>))
            : <p className="empty">nada vence nos próximos sete dias.</p>}
          <p className="note mt2"><button className="link" type="button" onClick={onOpenMonth}>ver o mês dia a dia</button></p>
        </section>

        <section className="block col-5">
          <Categories finance={finance} cfg={cfg} days={days} month={month} />
        </section>
      </div>
    </>
  );
}

/* ----- as categorias -----
   elas existiam só dentro da caixa de config, como uma fileira de chips em
   que um clique apagava sem perguntar e sem desfazer — e, fora do <select>
   do formulário, não queriam dizer nada. aqui elas ganham a única coisa que
   torna uma categoria útil: quanto passou por ela neste mês. renomear
   arrasta junto tudo que estava marcado com o nome antigo; apagar avisa
   quantos lançamentos ficam sem etiqueta, e volta atrás. */
function Categories({ finance, cfg, days, month }) {
  const [adding, setAdding] = useState("");
  const [renaming, setRenaming] = useState(null); // { from, to } | null

  /* o que passou por cada categoria neste mês, projeção incluída: é a mesma
     lista que a tabela do mês mostra, agrupada por etiqueta em vez de por dia */
  const moved = {};
  days.forEach((d) => d.items.forEach((it) => {
    const k = it.category || "sem categoria";
    const m = moved[k] || (moved[k] = { out: 0, in: 0, n: 0 });
    m[it.kind === "in" ? "in" : "out"] += it.amount;
    m.n++;
  }));
  /* a lista da config mais as etiquetas que aparecem nos lançamentos e não
     estão nela: categoria órfã existe (a lista mudou depois), e escondê-la
     faria as somas não fecharem */
  const names = cfg.categories.concat(Object.keys(moved).filter((k) => k !== "sem categoria" && !cfg.categories.includes(k)));
  const biggest = Math.max(1, ...names.map((n) => (moved[n] ? moved[n].out : 0)));

  /* quantos documentos carregam esta etiqueta — a resposta para "posso
     apagar?" antes de apagar, e não depois */
  const usedBy = (name) => finance.all().filter((d) => (d.type === "entry" || d.type === "fixed") && d.category === name);

  const add = () => {
    const name = adding.trim().slice(0, 30);
    if (!name || cfg.categories.includes(name)) { setAdding(""); return; }
    saveConfig(finance, { categories: cfg.categories.concat([name]) });
    setAdding("");
  };
  const rename = () => {
    const from = renaming.from, to = renaming.to.trim().slice(0, 30);
    setRenaming(null);
    if (!to || to === from) return;
    const touched = usedBy(from);
    finance.saveMany(touched.map((d) => ({ ...d, category: to, updatedAt: Date.now() })));
    saveConfig(finance, { categories: cfg.categories.map((c) => (c === from ? to : c)) });
    notify(touched.length ? "renomeada em " + touched.length + (touched.length === 1 ? " lançamento" : " lançamentos") : "renomeada");
  };
  const remove = (name) => {
    const before = cfg.categories;
    const n = usedBy(name).length;
    saveConfig(finance, { categories: before.filter((c) => c !== name) });
    notify(n ? "apaguei — " + n + (n === 1 ? " lançamento fica" : " lançamentos ficam") + " com a etiqueta antiga" : "categoria apagada",
      () => saveConfig(finance, { categories: before }));
  };

  return (
    <>
      <p className="heading"><span className="t-mono">as categorias · {monthLabel(month)}</span></p>
      {names.length ? (
        <ul className="cats">
          {names.map((name) => {
            const m = moved[name] || { out: 0, in: 0, n: 0 };
            const orphan = !cfg.categories.includes(name);
            return (
              <li key={name} className={"cat" + (orphan ? " is-orphan" : "")}>
                {renaming && renaming.from === name ? (
                  <input className="input" autoFocus maxLength="30" value={renaming.to}
                    onChange={(e) => setRenaming({ from: name, to: e.currentTarget.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); rename(); } if (e.key === "Escape") { e.preventDefault(); setRenaming(null); } }}
                    onBlur={rename} />
                ) : (
                  <>
                    <span className="cat__name">{name}{orphan && <small title="não está na lista, mas há lançamentos com ela">fora da lista</small>}</span>
                    <span className="cat__bar"><i style={{ width: Math.round((m.out / biggest) * 100) + "%" }} /></span>
                    <span className="cat__value mono">{m.out || m.in ? (m.in > m.out ? brl(m.in, true) : brl(-m.out)) : "—"}</span>
                    <span className="row-actions">
                      <button className="action" type="button" title="renomear" onClick={() => setRenaming({ from: name, to: name })}>{icon("pencil")}</button>
                      {!orphan && <button className="action" type="button" title="tirar da lista" onClick={() => remove(name)}>{icon("trash")}</button>}
                    </span>
                  </>)}
              </li>);
          })}
        </ul>
      ) : <p className="empty">nenhuma categoria ainda.</p>}
      <div className="form-row mt2">
        <input className="input" placeholder="nova categoria" maxLength="30" value={adding}
          onChange={(e) => setAdding(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button className="pill pill--mini" type="button" onClick={add}>adicionar</button>
      </div>
      <p className="note mt2">renomear arrasta junto tudo que está marcado com o nome antigo.</p>
    </>
  );
}

/* ----- mês ----- */
function MonthView({ ctx, month, openDay, onToggleDay, onShift, onNewEntry, onEditEntry, onTogglePaid, onConfirm }) {
  const days = buildMonth(month, ctx);
  const [year, monthNum] = month.split("-").map(Number);
  const nDays = daysInMonth(year, monthNum);
  const t = today();
  const isThisMonth = month === t.slice(0, 7);
  const todayNum = isThisMonth ? +t.slice(8, 10) : 0;

  const balanceToday = balanceUntil(t, ctx);
  const balanceEnd = days[days.length - 1].balance;
  /* o "diario" da planilha: o que sobra no fim do mes dividido pelos dias
     que ainda faltam — mesma logica da barra do dia */
  const daysLeft = isThisMonth ? (nDays - todayNum + 1) : nDays;
  const daily = daysLeft > 0 ? Math.round(balanceEnd / daysLeft) : 0;
  const monthIn = days.reduce((s, d) => s + d.inflow, 0);
  const monthOut = days.reduce((s, d) => s + d.outflow, 0);

  return (
    <>
      <div className="row mb">
        <button className="pill pill--icon" type="button" aria-label="mês anterior" onClick={() => onShift(-1)}>{icon("arrowLeft")}</button>
        <strong className="mono" id="month-label">{monthLabel(month)}</strong>
        <button className="pill pill--icon" type="button" aria-label="mês seguinte" onClick={() => onShift(1)}>{icon("arrow")}</button>
        <span className="spacer"></span>
        <button className="pill pill--green" type="button" onClick={() => onNewEntry()}>{icon("plus")}lançamento</button>
      </div>

      <div className="meters mb">
        <Meter label="saldo hoje" value={balanceToday} cls={balanceToday < 0 ? " is-negative" : ""}/>
        <Meter label="fim do mês" value={balanceEnd} cls={balanceEnd < 0 ? " is-negative" : ""}/>
        <Meter label={daily < 0 ? "não fecha" : "diário"} value={daily} cls={daily < 0 ? " is-negative" : " is-green"}/>
        <Meter label="entradas" value={monthIn}/>
        <Meter label="saídas" value={monthOut}/>
      </div>

      <div className="table-scroll"><table className="table">
        <thead><tr><th>dia</th><th className="num">entradas</th><th className="num">saídas</th><th className="num">saldo</th></tr></thead>
        <tbody>
          {days.map((d) => <DayRow key={d.day} d={d} isToday={isThisMonth && d.day === t} open={openDay === d.day}
            onToggle={() => onToggleDay(d.day)} onNewEntry={onNewEntry} onEditEntry={onEditEntry} onTogglePaid={onTogglePaid} onConfirm={onConfirm}/>)}
        </tbody>
      </table></div>
    </>
  );
}

/* a linha do dia e, embaixo dela, o detalhe quando esta aberta */
function DayRow({ d, isToday, open, onToggle, onNewEntry, onEditEntry, onTogglePaid, onConfirm }) {
  const label = weekdayOf(d.day) + " " + (+d.day.slice(8, 10));
  return (
    <>
      <tr className={"day-row" + (isToday ? " is-today" : "")} data-day={d.day} onClick={onToggle}>
        <td>{label}</td>
        <td className="num">{d.inflow ? brl(d.inflow, true) : "—"}</td>
        <td className="num">{d.outflow ? brl(-d.outflow) : "—"}</td>
        <td className={"num" + (d.balance < 0 ? " negative" : "") + (d.before ? " weak" : "")}>{d.before ? "—" : brl(d.balance)}</td>
      </tr>
      {open && (
        <tr className="day-detail"><td colSpan="4">
          {d.items.length
            ? <ul className="list">{d.items.map((it) => <DayItem key={it.id} it={it} day={d.day} onEditEntry={onEditEntry} onTogglePaid={onTogglePaid} onConfirm={onConfirm}/>)}</ul>
            : <p className="empty">nada neste dia</p>}
          <p className="mt2"><button className="pill pill--mini" type="button" onClick={() => onNewEntry(d.day)}>+ lançamento neste dia</button></p>
        </td></tr>)}
    </>
  );
}

/* um item do dia: lancamento gravado ou projecao (id "proj-…"), que so
   tem o "confirmar" */
function DayItem({ it, day, onEditEntry, onTogglePaid, onConfirm }) {
  const proj = it.id.startsWith("proj-");
  const sign = it.kind === "in" ? "+" : "−";
  return (
    <li className="line">
      <span className={"name" + (proj ? " weak" : "")}>{it.name}{it.category && <>{" "}<small>#{it.category}</small></>}{!proj && !it.paid && <>{" "}<small>previsto</small></>}</span>
      <span className="measure mono">{sign} {brl(it.amount)}</span>
      <span className="row-actions">
        {proj
          ? <button className="action" type="button" title="confirmar: virou lançamento" onClick={() => onConfirm(day, it.origin.type, it.origin.id)}>{icon("check")}</button>
          : <>
            <button className="action" type="button" title={it.paid ? "marcar como previsto" : "marcar como pago"} onClick={() => onTogglePaid(it.id)}>{icon("check")}</button>
            <button className="action" type="button" title="editar" onClick={() => onEditEntry(it.id)}>{icon("pencil")}</button>
          </>}
      </span>
    </li>
  );
}

/* ----- ano ----- */
function YearView({ ctx, year, onShift, onOpenMonth }) {
  const t = today();
  /* o saldo entra em janeiro uma vez e desce mes a mes: doze buildMonth
     encadeados, em vez de doze balanceUntil() que recalculariam do inicio */
  let balance = balanceUntil(addDays(year + "-01-01", -1), ctx);
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const yyyymm = year + "-" + pad(m);
    const days = buildMonth(yyyymm, ctx, balance);
    balance = days[days.length - 1].balance;
    months.push({ yyyymm, days });
  }
  return (
    <>
      <div className="row mb">
        <button className="pill pill--icon" type="button" aria-label="ano anterior" onClick={() => onShift(-1)}>{icon("arrowLeft")}</button>
        <strong className="mono" id="year-label">{year}</strong>
        <button className="pill pill--icon" type="button" aria-label="ano seguinte" onClick={() => onShift(1)}>{icon("arrow")}</button>
        <span className="small weak">saldo previsto no fim de cada dia · clique no mês para abrir</span>
      </div>
      <div className="year-scroll"><div className="year">
        {months.map((mo, i) => <YearMonth key={mo.yyyymm} mo={mo} index={i} today={t} onOpen={() => onOpenMonth(mo.yyyymm)}/>)}
      </div></div>
    </>
  );
}

/* uma coluna do ano: o mes no cabecalho (que abre a aba do mes) e os 31
   dias embaixo, os que o mes nao tem ficam invisiveis para alinhar */
function YearMonth({ mo, index, today: t, onOpen }) {
  const end = mo.days[mo.days.length - 1].balance;
  const rows = [];
  for (let n = 1; n <= 31; n++) {
    const day = mo.days[n - 1];
    if (!day) { rows.push(<div key={n} className="year__day is-empty"><i>{pad(n)}</i><span>—</span></div>); continue; }
    if (day.before) { rows.push(<div key={n} className="year__day"><i>{pad(n)}</i><span className="weak">—</span></div>); continue; }
    const moves = day.inflow || day.outflow;
    const cls = (day.balance < 0 ? " is-negative" : (moves ? " is-positive" : "")) + (moves ? " has-moves" : "") + (day.day === t ? " is-today" : "");
    const title = dateLabel(day.day, true) + (day.inflow ? " · +" + brl(day.inflow) : "") + (day.outflow ? " · −" + brl(day.outflow) : "");
    rows.push(<div key={n} className={"year__day" + cls} title={title}><i>{pad(n)}</i><span>{brl(day.balance)}</span></div>);
  }
  return (
    <div className={"year__month" + (mo.yyyymm === t.slice(0, 7) ? " is-current" : "")}>
      <div className="year__head" title={"abrir " + SHORT_MONTHS[index]} onClick={onOpen}><b>{SHORT_MONTHS[index]}</b><span>{brl(end)}</span></div>
      {rows}
    </div>
  );
}

/* ----- painel: as quatro tabelas da planilha ----- */
function PanelTable({ headers, rows, empty }) {
  if (!rows.length) return <p className="empty">{empty}</p>;
  return (
    <div className="table-scroll"><table className="table">
      <thead><tr>{headers.map((h, i) => <th key={i} className={h.num ? "num" : null}>{h.text}</th>)}</tr></thead>
      <tbody>{rows}</tbody>
    </table></div>
  );
}
function PanelBlock({ title, total, addTitle, onAdd, children }) {
  return (
    <div className="col-6"><div className="block panel-block">
      <p className="heading">
        <span className="t-mono">{title}</span>
        <span className="row"><span className="total">{total}</span><button className="action" type="button" title={addTitle} aria-label={addTitle} onClick={onAdd}>{icon("plus")}</button></span>
      </p>
      {children}
    </div></div>
  );
}
const fixedHeaders = (amountLabel) => [{ text: "nome" }, { text: "categoria" }, { text: "dia", num: true }, { text: amountLabel, num: true }];

function FixedRow({ f, onEdit }) {
  return (
    <tr className="editable" data-id={f.id} onClick={onEdit}>
      <td>{f.name}{!f.active && <>{" "}<span className="badge">pausado</span></>}</td>
      <td className="weak">{f.category}</td>
      <td className="num weak">{f.dayOfMonth}/mês</td>
      <td className="num">{brl(f.amount)}</td>
    </tr>
  );
}
/* cartao: a parcela que cai neste mes, e quantas ainda faltam */
function CardRow({ c, thisMonth, onEdit }) {
  const n = installmentNumber(c, thisMonth);
  const progress = n < 1 ? "começa " + SHORT_MONTHS[+c.start.slice(5, 7) - 1] : (n > c.installments ? "quitado" : n + "/" + c.installments);
  return (
    <tr className="editable" data-id={c.id} onClick={onEdit}>
      <td>{c.name}</td>
      <td className="weak">{c.card}</td>
      <td className="num weak">{progress}</td>
      <td className="num">{brl(c.total)}</td>
    </tr>
  );
}
function DebtRow({ d, onEdit, onPay }) {
  const pct = d.total ? Math.min(100, Math.round(d.paid / d.total * 100)) : 0;
  const settled = d.paid >= d.total;
  return (
    <tr className="editable" data-id={d.id} onClick={onEdit}>
      <td>{d.name}</td>
      <td className="weak">{d.creditor}</td>
      <td className="num">{brl(d.total)}</td>
      <td className="num">{settled
        ? <span className="badge badge--green">pago</span>
        : <span className="bar" title={brl(d.paid) + " de " + brl(d.total)}><i style={{ width: pct + "%" }}></i></span>}</td>
      <td className="num">{!settled && <span className="row-actions"><button className="pill pill--mini" type="button" title="paga uma parcela hoje" onClick={(e) => { e.stopPropagation(); onPay(d.id); }}>pagar</button></span>}</td>
    </tr>
  );
}

function PanelView({ ctx, cfg, onEdit, onNewFixed, onNewCard, onNewDebt, onPay }) {
  const thisMonth = today().slice(0, 7);
  const pct = cfg.percents;

  const fixedOf = (kind) => ctx.fixed.filter((f) => f.kind === kind).sort((a, b) => a.dayOfMonth - b.dayOfMonth);
  const outs = fixedOf("out"), ins = fixedOf("in");
  const totalOut = outs.reduce((s, f) => s + f.amount, 0);
  const totalIn = ins.reduce((s, f) => s + f.amount, 0);

  const cards = ctx.cards.slice().sort((a, b) => a.start.localeCompare(b.start) || a.dayOfMonth - b.dayOfMonth);
  const cardRemaining = (c) => { const n = Math.max(0, Math.min(c.installments, installmentNumber(c, thisMonth) - 1)); return c.total - n * cardInstallment(c); };
  const totalCard = cards.reduce((s, c) => s + Math.max(0, cardRemaining(c)), 0);

  const debts = ctx.debts.slice().sort((a, b) => (a.paid >= a.total) - (b.paid >= b.total) || b.total - a.total);
  const totalOwed = debts.reduce((s, d) => s + Math.max(0, d.total - d.paid), 0);

  const leftover = totalIn - totalOut;

  return (
    <>
      <div className="grid">
        <PanelBlock title="saídas fixas" total={brl(totalOut)} addTitle="nova saída fixa" onAdd={() => onNewFixed("out")}>
          <PanelTable headers={fixedHeaders("saída")} empty="nenhuma saída fixa — aluguel, luz, academia…"
            rows={outs.map((f) => <FixedRow key={f.id} f={f} onEdit={() => onEdit("fixed", f.id)}/>)}/>
        </PanelBlock>
        <PanelBlock title="entradas fixas" total={brl(totalIn)} addTitle="nova entrada fixa" onAdd={() => onNewFixed("in")}>
          <PanelTable headers={fixedHeaders("entrada")} empty="nenhuma entrada fixa — o que entra todo mês"
            rows={ins.map((f) => <FixedRow key={f.id} f={f} onEdit={() => onEdit("fixed", f.id)}/>)}/>
        </PanelBlock>
        <PanelBlock title="cartão de crédito" total={brl(totalCard)} addTitle="nova compra parcelada" onAdd={onNewCard}>
          <PanelTable headers={[{ text: "nome" }, { text: "cartão" }, { text: "parcelamento", num: true }, { text: "total", num: true }]} empty="nenhuma compra parcelada"
            rows={cards.map((c) => <CardRow key={c.id} c={c} thisMonth={thisMonth} onEdit={() => onEdit("card", c.id)}/>)}/>
        </PanelBlock>
        <PanelBlock title="dívidas" total={brl(totalOwed)} addTitle="nova dívida" onAdd={onNewDebt}>
          <PanelTable headers={[{ text: "nome" }, { text: "pessoa" }, { text: "valor", num: true }, { text: "pago", num: true }, { text: "", num: true }]} empty="nenhuma dívida"
            rows={debts.map((d) => <DebtRow key={d.id} d={d} onEdit={() => onEdit("debt", d.id)} onPay={onPay}/>)}/>
        </PanelBlock>
      </div>

      <div className="block mt">
        <p className="heading"><span className="t-mono">divisão {pct.expenses}/{pct.spending}/{pct.assets}</span><span className="small weak">sobre as entradas fixas</span></p>
        <div className="meters">
          <Meter label={"despesas · " + pct.expenses + "%"} value={Math.round(totalIn * pct.expenses / 100)}/>
          <Meter label={"gastos · " + pct.spending + "%"} value={Math.round(totalIn * pct.spending / 100)}/>
          <Meter label={"ativos · " + pct.assets + "%"} value={Math.round(totalIn * pct.assets / 100)}/>
          <Meter label="sobra dos fixos" value={leftover} cls={leftover < 0 ? " is-negative" : " is-green"}/>
        </div>
      </div>
    </>
  );
}

/* ---------- formularios (todos em pop-up) ----------
   o mesmo <Form> do ui: criar e editar sao a mesma caixa, a diferenca e
   ter ou nao um documento por baixo. */
const MoneyInput = (props) => <input className="input input--num" inputMode="decimal" placeholder="0,00" {...props}/>;
const DayOfMonthInput = (props) => <input className="input input--num" type="number" min="1" max="31" {...props}/>;
const CategorySelect = ({ categories, ...props }) => <select className="select" {...props}>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>;

function EntryForm({ finance, categories, id, presetDay, onClose, onRemove, onSave }) {
  const l = id ? finance.get(id) : null;
  const [v, bind] = useFields({
    name: l ? l.name : "",
    amount: inReais(l && l.amount),
    day: l ? l.day : (presetDay || today()),
    kind: l ? l.kind : "out",
    category: pickCategory(categories, l ? l.category : ""),
    paid: l ? l.paid : true
  });
  if (id && !l) return null;
  const submit = () => {
    const amount = parseMoney(v.amount);
    if (!v.name.trim() || !amount) { notify("preciso de um nome e um valor"); return false; }
    onSave({
      id: l ? l.id : newId(), type: "entry", name: v.name.trim(), amount,
      day: isDay(v.day) ? v.day : today(), kind: v.kind, category: v.category,
      paid: v.paid, origin: l ? l.origin : null
    }, l, l ? "lançamento atualizado" : "lançamento criado");
  };
  return (
    <Form title={l ? "lançamento" : "novo lançamento"} submit={l ? "salvar" : "adicionar"} remove={l ? "apagar" : ""}
        onRemove={() => onRemove(id, "lançamento apagado")} onClose={onClose} onSubmit={submit}>
      <Field label="nome" full><input className="input" required maxLength="140" {...bind("name")}/></Field>
      <Field label="valor"><MoneyInput {...bind("amount")}/></Field>
      <Field label="data"><input className="input" type="date" {...bind("day")}/></Field>
      <Field label="tipo"><select className="select" {...bind("kind")}><option value="out">saída</option><option value="in">entrada</option></select></Field>
      <Field label="categoria"><CategorySelect categories={categories} {...bind("category")}/></Field>
      <label className="row full"><input type="checkbox" {...bind("paid", "check")}/> já pago</label>
    </Form>
  );
}

function FixedForm({ finance, categories, id, presetKind, onClose, onRemove, onSave }) {
  const f = id ? finance.get(id) : null;
  const kind = f ? f.kind : (presetKind || "out");
  const [v, bind] = useFields({
    name: f ? f.name : "",
    amount: inReais(f && f.amount),
    dayOfMonth: f ? f.dayOfMonth : "",
    category: pickCategory(categories, f ? f.category : (kind === "in" ? "Recorrente" : "")),
    active: f ? f.active : true
  });
  if (id && !f) return null;
  const submit = () => {
    const amount = parseMoney(v.amount);
    if (!v.name.trim() || !amount) { notify("preciso de um nome e um valor"); return false; }
    onSave({
      id: f ? f.id : newId(), type: "fixed", name: v.name.trim(), amount, kind,
      category: v.category, dayOfMonth: +v.dayOfMonth || 1, active: f ? !!v.active : true
    }, f, f ? "fixo atualizado" : "fixo criado");
  };
  return (
    <Form title={f ? (kind === "in" ? "entrada fixa" : "saída fixa") : (kind === "in" ? "nova entrada fixa" : "nova saída fixa")}
        sub="cai todo mês no mesmo dia; na tabela do mês aparece como previsto até você confirmar"
        submit={f ? "salvar" : "adicionar"} remove={f ? "apagar" : ""}
        onRemove={() => onRemove(id, "fixo apagado")} onClose={onClose} onSubmit={submit}>
      <Field label="nome" full><input className="input" required maxLength="140" {...bind("name")}/></Field>
      <Field label="valor"><MoneyInput {...bind("amount")}/></Field>
      <Field label="dia do mês"><DayOfMonthInput {...bind("dayOfMonth")}/></Field>
      <Field label="categoria"><CategorySelect categories={categories} {...bind("category")}/></Field>
      {f && <label className="row full"><input type="checkbox" {...bind("active", "check")}/> ativo (desmarque para pausar sem apagar)</label>}
    </Form>
  );
}

function CardForm({ finance, id, onClose, onRemove, onSave }) {
  const c = id ? finance.get(id) : null;
  const [v, bind] = useFields({
    name: c ? c.name : "",
    card: c ? c.card : "",
    total: inReais(c && c.total),
    installments: c ? c.installments : 1,
    start: c ? c.start : today().slice(0, 7),
    dayOfMonth: c ? c.dayOfMonth : 10,
  });
  if (id && !c) return null;
  const submit = () => {
    const total = parseMoney(v.total);
    if (!v.name.trim() || !total) { notify("preciso do que foi comprado e do total"); return false; }
    onSave({
      id: c ? c.id : newId(), type: "card", name: v.name.trim(), card: v.card.trim(), total,
      installments: +v.installments || 1, start: v.start, dayOfMonth: +v.dayOfMonth || 10
    }, c, c ? "compra atualizada" : "compra parcelada criada");
  };
  return (
    <Form title={c ? "compra no cartão" : "nova compra parcelada"}
        sub="a parcela sai do total e cai todo mês no dia do vencimento, até acabar"
        submit={c ? "salvar" : "adicionar"} remove={c ? "apagar" : ""}
        onRemove={() => onRemove(id, "compra apagada")} onClose={onClose} onSubmit={submit}>
      <Field label="o que" full><input className="input" required maxLength="140" {...bind("name")}/></Field>
      <Field label="cartão"><input className="input" maxLength="40" placeholder="Nubank, C6…" {...bind("card")}/></Field>
      <Field label="total"><MoneyInput {...bind("total")}/></Field>
      <Field label="parcelas"><input className="input input--num" type="number" min="1" max="120" {...bind("installments")}/></Field>
      <Field label="primeira parcela"><input className="input" type="month" {...bind("start")}/></Field>
      <Field label="dia do vencimento"><DayOfMonthInput {...bind("dayOfMonth")}/></Field>
    </Form>
  );
}

function DebtForm({ finance, id, onClose, onRemove, onSave }) {
  const d = id ? finance.get(id) : null;
  const [v, bind] = useFields({
    name: d ? d.name : "",
    creditor: d ? d.creditor : "",
    total: inReais(d && d.total),
    paid: inReais(d && d.paid),
    installment: inReais(d && d.installment),
    dayOfMonth: d ? d.dayOfMonth : "",
  });
  if (id && !d) return null;
  const submit = () => {
    const total = parseMoney(v.total);
    if (!v.name.trim() || !total) { notify("preciso de um nome e do total"); return false; }
    onSave({
      id: d ? d.id : newId(), type: "debt", name: v.name.trim(), creditor: v.creditor.trim(), total,
      paid: Math.min(total, parseMoney(v.paid)), installment: parseMoney(v.installment), dayOfMonth: +v.dayOfMonth || 1
    }, d, d ? "dívida atualizada" : "dívida criada");
  };
  return (
    <Form title={d ? "dívida" : "nova dívida"}
        sub="com parcela e dia, ela cai todo mês como previsto até quitar; sem parcela, é só o que você deve"
        submit={d ? "salvar" : "adicionar"} remove={d ? "apagar" : ""}
        onRemove={() => onRemove(id, "dívida apagada")} onClose={onClose} onSubmit={submit}>
      <Field label="nome" full><input className="input" required maxLength="140" {...bind("name")}/></Field>
      <Field label="pessoa / credor"><input className="input" maxLength="80" {...bind("creditor")}/></Field>
      <Field label="total"><MoneyInput {...bind("total")}/></Field>
      <Field label="já pago"><MoneyInput {...bind("paid")}/></Field>
      <Field label="parcela (opcional)"><MoneyInput {...bind("installment")}/></Field>
      <Field label="dia do mês"><DayOfMonthInput {...bind("dayOfMonth")}/></Field>
    </Form>
  );
}

/* a config: saldo inicial, divisao e categorias. as categorias gravam na
   hora, sem esperar o salvar: sao uma lista, nao um campo — e o Enter no
   campo delas nao pode fechar a caixa. */
function ConfigForm({ finance, onClose }) {
  const cfg = configOf(finance);
  const [v, bind] = useFields({
    day: cfg.startBalance ? cfg.startBalance.day : today(),
    amount: inReais(cfg.startBalance && cfg.startBalance.amount),
    expenses: cfg.percents.expenses,
    spending: cfg.percents.spending,
    assets: cfg.percents.assets
  });
  const [newCategory, setNewCategory] = useState("");
  const addCategory = () => {
    const name = newCategory.trim();
    if (!name) return;
    const current = configOf(finance).categories;
    if (!current.includes(name)) saveConfig(finance, { categories: current.concat([name]) });
    setNewCategory("");
  };
  const removeCategory = (name) => saveConfig(finance, { categories: configOf(finance).categories.filter((c) => c !== name) });
  const submit = () => {
    saveConfig(finance, {
      startBalance: isDay(v.day) ? { day: v.day, amount: parseMoney(v.amount) } : null,
      percents: { expenses: +v.expenses || 0, spending: +v.spending || 0, assets: +v.assets || 0 }
    });
    notify("configuração salva");
  };
  return (
    <Form title="config" sub="o ponto de partida do saldo, a divisão das entradas e as categorias" onClose={onClose} onSubmit={submit}>
      <Field label="saldo inicial · data"><input className="input" type="date" {...bind("day")}/></Field>
      <Field label="saldo inicial · valor"><MoneyInput {...bind("amount")}/></Field>
      <Field label="despesas %"><input className="input input--num" type="number" min="0" max="100" {...bind("expenses")}/></Field>
      <Field label="gastos %"><input className="input input--num" type="number" min="0" max="100" {...bind("spending")}/></Field>
      <Field label="ativos %"><input className="input input--num" type="number" min="0" max="100" {...bind("assets")}/></Field>
      <div className="full">
        <label className="field-label">categorias</label>
        <div className="cfg-categories" id="cfg-categories">
          {cfg.categories.map((c) => <button key={c} className="chip" type="button" title="remover" onClick={() => removeCategory(c)}>{c} ✕</button>)}
        </div>
        <div className="cfg-new">
          <input className="input" id="cfg-new" placeholder="nova categoria" maxLength="30" value={newCategory}
            onChange={(e) => setNewCategory(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(); } }}/>
          <button className="pill pill--icon" type="button" id="cfg-add" aria-label="adicionar categoria" onClick={addCategory}>+</button>
        </div>
      </div>
    </Form>
  );
}

mount(<Finance />, "app");
