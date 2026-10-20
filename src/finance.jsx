/* merlin · o financeiro
   o mes dia a dia com saldo, os doze meses do ano lado a lado e o painel dos
   fixos, do cartao e das dividas. tudo em centavos. */
import "./shared/base.css";
import "./finance.css";
import {
  initPage, newId, today, notify, brl, parseMoney,
  addDays, monthLabel, dateLabel
} from "./shared/core.js";
import { useState } from "react";
import { FINANCE_TEMPLATES, financeGroups, buildFinance } from "./shared/templates.js";
import {
  mount, useCollection, useKeydown, isTyping,
  useFields, Form, Field, EmptyStart, icon
} from "./shared/ui.jsx";
/* o saldo e a normalizacao moram no shared desde 22/09/2026: o assistente
   tambem os usa, de qualquer tela */
import {
  pad, INVEST_CATEGORIES, adjacentMonth,
  cardInstallment, installmentNumber,
  balanceUntil, realBalanceUntil,
  pendingBefore, suggestionsBetween, buildMonth, spentByCategory, categoryOrder,
  normalize, configOf, saveConfig, contextOf, bookCollection
} from "./shared/finance-data.js";
/* a caixa do lancamento e os campos de dinheiro moram no shared desde
   19/10/2026: o cartao do inicio abre a mesma caixa para o previsto que
   passou ("nao aconteceu") */
import { EntryForm, MoneyInput, inReais } from "./shared/entry-form.jsx";
/* o mês, os fixos e os ajustes moram no shared desde 20/10/2026: o caixa da
   empresa (cash.jsx) usa os mesmos */
import {
  balanceStyle, isForecast, Meter, SplitBar, MonthView, DayItem, SuggestionItem,
  PanelTable, PanelBlock, FixedBlocks, fixedOf, FixedForm, ConfigForm, UnitInput, DayOfMonthInput, entryActions
} from "./shared/finance-views.jsx";

initPage("finance");

const SHORT_MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];


const TABS = [
  { id: "today", label: "hoje" },
  { id: "month", label: "mês" },
  { id: "year", label: "ano" },
  { id: "panel", label: "fixos" },
  { id: "invest", label: "investimentos" }
];

/* negativo entre parenteses, como na planilha */
const brlBalance = (cents) => cents < 0 ? "(" + brl(cents) + ")" : brl(cents);

/* ---------- a pagina ----------
   o estado de tela mora aqui: a aba, o mes e o ano abertos, o dia expandido
   e qual caixa esta aberta. nada disso e documento — some ao recarregar. */
function Finance() {
  /* o livro pessoal: o da empresa é o caixa (cash.jsx), e um não vê o outro */
  const finance = bookCollection(useCollection("finance", { normalize }), "personal");
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
  const newFixed = (kind) => setForm({ type: "fixed", id: "", preset: { kind } });

  /* ---------- gravar, apagar e as acoes do dia ---------- */
  const { save, removeWithUndo, launchSuggestion, togglePaid } = entryActions(finance, setForm);
  /* abater uma parcela so anda o "ja pago" da divida: nao cria lancamento,
     porque a divida e registro e nao movimento do saldo */
  const payInstallment = (id) => {
    const d = finance.get(id);
    if (!d) return;
    const amount = Math.min(d.installment || (d.total - d.paid), d.total - d.paid);
    if (amount <= 0) return;
    finance.save({ ...d, paid: d.paid + amount, updatedAt: Date.now() });
    notify("abati " + brl(amount) + " de " + d.name, () => finance.save({ ...d, updatedAt: Date.now() }));
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

  const dayActions = { onNewEntry: newEntry, onEditEntry: (id) => edit("entry", id), onTogglePaid: togglePaid, onLaunch: launchSuggestion };
  const formProps = { finance, categories: cfg.categories, onClose: closeForm, onRemove: removeWithUndo, onSave: save };

  return (
    <>
      <div className="header">
        <div>
          <h1>financeiro</h1>
        </div>
        <div className="actions">
          <button className="pill" type="button" onClick={() => setForm({ type: "config" })}>ajustes</button>
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
          <button className="action" type="button" title="definir o saldo inicial" aria-label="Definir o saldo inicial" onClick={() => setForm({ type: "config" })}>{icon("pencil")}</button>
        </p>)}

      {!virgin && <>
      <div className="tabs" role="tablist">
        {TABS.map((t) => <button key={t.id} className="tab" type="button" role="tab" data-tab={t.id} aria-selected={String(tab === t.id)} onClick={() => openTab(t.id)}>{t.label}</button>)}
      </div>

      <div id="view">
        {tab === "today" && <TodayView ctx={ctx} cfg={cfg} finance={finance} month={month}
          onOpenMonth={() => openTab("month")} onConfig={() => setForm({ type: "config" })}
          onCategory={(name) => setForm({ type: "category", name })} {...dayActions}/>}
        {tab === "month" && <MonthView ctx={ctx} month={month} openDay={openDay} onToggleDay={toggleDay} onShift={shiftMonth} {...dayActions}/>}
        {tab === "year" && <YearView ctx={ctx} year={year} onShift={shiftYear} onOpenMonth={openMonth}/>}
        {tab === "panel" && <PanelView ctx={ctx} cfg={cfg} onEdit={edit} onNewFixed={newFixed} onNewCard={() => setForm({ type: "card", id: "" })} onNewDebt={() => setForm({ type: "debt", id: "" })} onPay={payInstallment}/>}
        {tab === "invest" && <InvestView ctx={ctx} onEdit={(id) => edit("invest", id)} onNew={() => setForm({ type: "invest", id: "" })}/>}
      </div>
      </>}

      {form && form.type === "entry" && <EntryForm key={"entry:" + form.id + ":" + form.day} id={form.id} presetDay={form.day} preset={form.preset} {...formProps}/>}
      {form && form.type === "category" && <CategoryForm key={"category:" + form.name} finance={finance} name={form.name} onClose={closeForm}/>}
      {form && form.type === "fixed" && <FixedForm key={"fixed:" + form.id} id={form.id} preset={form.preset} {...formProps}/>}
      {form && form.type === "card" && <CardForm key={"card:" + form.id} id={form.id} {...formProps}/>}
      {form && form.type === "debt" && <DebtForm key={"debt:" + form.id} id={form.id} {...formProps}/>}
      {form && form.type === "invest" && <InvestForm key={"invest:" + form.id} id={form.id} {...formProps}/>}
      {form && form.type === "config" && <ConfigForm finance={finance} onClose={closeForm}/>}
    </>
  );
}

/* ----- hoje: a primeira tela do dinheiro -----
   três perguntas, nessa ordem: quanto tem na conta agora (real), onde ela
   chega no fim do mês (previsto), e o que falta acontecer. antes eram três
   ladrilhos iguais com o real e o previsto somados no mesmo número — "hoje"
   já contava o aluguel que ainda não saiu, e nada na tela dizia qual número
   era fato e qual era conta (13/09/2026).

   nenhuma conta nova de previsão mora aqui: o fim do mês sai do buildMonth,
   o mesmo do mês e do ano. */
function TodayView({ ctx, cfg, month, onOpenMonth, onNewEntry, onEditEntry, onTogglePaid, onLaunch, onConfig, onCategory }) {
  const t = today();
  const days = buildMonth(month, ctx, null, t);
  const inMonth = days.filter((d) => !d.before);
  const real = realBalanceUntil(t, ctx);
  const last = days[days.length - 1];
  const all = inMonth.flatMap((d) => d.items);
  const sum = (kind, pred) => all.filter((it) => it.kind === kind && pred(it)).reduce((s, it) => s + it.amount, 0);
  const inReal = sum("in", (it) => !isForecast(it)), inAll = sum("in", () => true);
  const outReal = sum("out", (it) => !isForecast(it)), outAll = sum("out", () => true);

  const pending = pendingBefore(t, ctx);
  const pendingNet = pending.reduce((s, p) => s + (p.it.kind === "in" ? p.it.amount : -p.it.amount), 0);

  /* o que vence nos próximos sete dias: é o que muda uma decisão hoje */
  const horizon = addDays(t, 7);
  const soon = days.filter((d) => d.day >= t && d.day <= horizon && d.items.length);
  /* as sugestões do mês até daqui a sete dias, ainda não lançadas. mostra
     seis; o resto está no mês, dia a dia */
  const SHOWN = 6;
  const suggested = suggestionsBetween(month + "-01", [horizon, days[days.length - 1].day].sort()[0], ctx);

  /* o menor saldo previsto daqui pra frente: um mês que fecha no azul pode
     passar por baixo de zero no meio, e o "fim do mês" sozinho não conta */
  const ahead = days.filter((d) => d.day >= t && !d.before);
  const low = ahead.length ? ahead.reduce((m, d) => (d.balance < m.balance ? d : m), ahead[0]) : null;

  return (
    <>
      <section className="block fin-sum">
        <div className="fin-sum__cell">
          <p className="fin-sum__label">na conta hoje</p>
          <p className={"fin-sum__num" + (real < 0 ? " is-negative" : "")}>{brl(real, true)}</p>
          <p className={"note" + (!cfg.startBalance ? " note--act" : "")}>{!cfg.startBalance
            ? <>sem saldo inicial a conta parte do zero. <button className="action" type="button" title="definir o saldo inicial" aria-label="Definir o saldo inicial" onClick={onConfig}>{icon("pencil")}</button></>
            : pending.length
              ? pending.length + (pending.length === 1 ? " item" : " itens") + " a confirmar (" + brl(pendingNet, true) + ")"
              : "só o que já aconteceu"}</p>
        </div>
        <div className="fin-sum__cell">
          <p className="fin-sum__label">previsto no fim de {monthLabel(month)}</p>
          <p className={"fin-sum__num is-forecast" + (last.balance < 0 ? " is-negative" : "")}>≈ {brl(last.balance, true)}</p>
          <p className="note">{low && low.balance < 0
            ? "passa por " + brl(low.balance, true) + " em " + dateLabel(low.day) + " antes de fechar"
            : suggested.length
              ? "só com o que foi lançado — " + suggested.length + (suggested.length === 1 ? " sugestão fica" : " sugestões ficam") + " de fora"
              : "o que já aconteceu mais o previsto que você lançou"}</p>
        </div>
        <div className="fin-sum__cell fin-sum__cell--flow">
          <p className="fin-sum__label">o mês</p>
          <div className="flow">
            <span className="flow__name">entrou</span>
            <SplitBar real={inReal} forecast={inAll - inReal} />
            <span className="flow__val"><b>{brl(inReal)}</b> <small>de {brl(inAll)}</small></span>
          </div>
          <div className="flow">
            <span className="flow__name">saiu</span>
            <SplitBar real={outReal} forecast={outAll - outReal} />
            <span className="flow__val"><b>{brl(outReal)}</b> <small>de {brl(outAll)}</small></span>
          </div>
          <p className="legend-line"><i className="lg lg--real" />aconteceu <i className="lg lg--forecast" />previsto</p>
        </div>
      </section>

      <div className="grid mt">
        <section className="block col-7">
          {pending.length > 0 && (
            <div className="soon soon--pending">
              <p className="heading"><span className="t-mono">a confirmar</span><span className="small weak">o dia já passou — aconteceu?</span></p>
              <ul className="list">
                {pending.map((p) => <DayItem key={p.it.id} it={p.it} day={p.day} showDay onEditEntry={onEditEntry} onTogglePaid={onTogglePaid} />)}
              </ul>
            </div>)}
          <p className="heading">
            <span className="t-mono">próximos sete dias</span>
            <span className="heading__acts">
              <button className="action" type="button" title="ver o mês dia a dia" aria-label="Ver o mês dia a dia" onClick={onOpenMonth}>{icon("calendar")}</button>
              <button className="action" type="button" title="novo lançamento (n)" aria-label="novo lançamento" onClick={() => onNewEntry(t)}>{icon("plus")}</button>
            </span>
          </p>
          {soon.length
            ? soon.map((d) => (
                <div key={d.day} className="soon">
                  <p className="soon__day t-mono">{d.day === t ? "hoje" : dateLabel(d.day)}</p>
                  <ul className="list">
                    {d.items.map((it) => <DayItem key={it.id} it={it} day={d.day} onEditEntry={onEditEntry} onTogglePaid={onTogglePaid} />)}
                  </ul>
                </div>))
            : <p className="empty">nada lançado para os próximos sete dias.</p>}
          {suggested.length > 0 && (
            <div className="soon soon--suggest">
              <p className="heading"><span className="t-mono">sugestões</span><span className="small weak">dos fixos e parcelas · não contam em nada até você lançar</span></p>
              <ul className="list">
                {suggested.slice(0, SHOWN).map((p) => <SuggestionItem key={p.it.id} it={p.it} day={p.day} onLaunch={onLaunch} />)}
              </ul>
              {suggested.length > SHOWN && <p className="note note--act mt2">mais {suggested.length - SHOWN} no mês
                <button className="action" type="button" title="ver no mês, dia a dia" aria-label="Ver as outras sugestões no mês" onClick={onOpenMonth}>{icon("calendar")}</button></p>}
            </div>)}
        </section>

        <section className="block col-5">
          <Categories cfg={cfg} days={inMonth} month={month} onCategory={onCategory} />
        </section>
      </div>
    </>
  );
}

/* ----- as categorias, com a meta de gasto -----
   cada categoria diz quanto já saiu por ela no mês (cheio), quanto ainda
   está previsto (tracejado) e, se tiver meta, contra quanto. clicar na linha
   abre a caixa da categoria — nome e meta —, como todo "editar" do sistema;
   o campo solto de "nova categoria" e o renomear no meio da lista saíram. */
function Categories({ cfg, days, month, onCategory }) {
  const moved = spentByCategory(days);
  /* a lista da config mais as etiquetas órfãs, na ordem do categoryOrder:
     com meta primeiro, a mais apertada no topo; sem meta, a que mais gastou */
  const sorted = categoryOrder(cfg, moved);
  const budgets = cfg.budgets || {};
  const out = (n) => (moved[n] ? moved[n].outAll : 0);
  const biggest = Math.max(1, ...sorted.map((n) => Math.max(out(n), budgets[n] || 0)));
  const withGoal = sorted.filter((n) => budgets[n]);
  const totalBudget = withGoal.reduce((s, n) => s + budgets[n], 0);
  const totalUse = withGoal.reduce((s, n) => s + out(n), 0);

  return (
    <>
      <p className="heading">
        <span className="t-mono">gasto por categoria · {monthLabel(month)}</span>
        <button className="action" type="button" title="nova categoria" aria-label="nova categoria" onClick={() => onCategory("")}>{icon("plus")}</button>
      </p>
      {totalBudget > 0
        ? <p className="note">nas categorias com meta: ≈ {brl(totalUse)} de {brl(totalBudget)}</p>
        : <p className="note">clique numa categoria para dar uma meta de gasto por mês.</p>}
      {sorted.length ? (
        <ul className="cats">
          {sorted.map((name) => {
            const m = moved[name] || { outReal: 0, outAll: 0, in: 0 };
            const goal = budgets[name] || 0;
            const orphan = !cfg.categories.includes(name);
            const over = goal > 0 && m.outAll > goal;
            const isIn = m.in > m.outAll;
            return (
              <li key={name}>
                <button type="button" className={"cat" + (orphan ? " is-orphan" : "") + (over ? " is-over" : "")}
                        title={orphan ? "não está na lista, mas há lançamentos com ela" : "editar nome e meta"}
                        onClick={() => onCategory(name)}>
                  <span className="cat__name">{name}</span>
                  <span className="cat__bar">{!isIn && <SplitBar real={m.outReal} forecast={m.outAll - m.outReal} of={goal || biggest} />}</span>
                  <span className="cat__value">
                    {isIn ? "+" + brl(m.in)
                      : goal ? <><b>{brl(m.outAll)}</b> <small>de {brl(goal)}</small></>
                      : m.outAll ? brl(m.outAll) : <small>—</small>}
                  </span>
                </button>
                {over && <p className="cat__over">passou {brl(m.outAll - goal)} da meta{m.outReal <= goal ? ", contando o previsto" : ""}</p>}
              </li>);
          })}
        </ul>
      ) : <p className="empty">nenhuma categoria ainda.</p>}
    </>
  );
}

/* a caixa da categoria: nome e meta. renomear arrasta junto tudo que estava
   marcado com o nome antigo — lançamentos, fixos e a meta; tirar da lista
   avisa quantos ficam com a etiqueta antiga, e volta atrás. */
function CategoryForm({ finance, name, onClose }) {
  const cfg = configOf(finance);
  const isNew = !name;
  const [v, bind] = useFields({ name: name || "", budget: inReais((cfg.budgets || {})[name]) });
  const usedBy = (n) => finance.all().filter((d) => (d.type === "entry" || d.type === "fixed") && d.category === n);
  const submit = () => {
    const to = v.name.trim().slice(0, 30);
    if (!to) { notify("a categoria precisa de um nome"); return false; }
    const now = configOf(finance);
    if ((isNew || to !== name) && now.categories.includes(to)) { notify("já existe a categoria " + to); return false; }
    const budgets = { ...(now.budgets || {}) };
    if (name) delete budgets[name];
    const goal = parseMoney(v.budget);
    if (goal > 0) budgets[to] = goal;
    let categories = now.categories;
    if (isNew) categories = categories.concat([to]);
    else if (to !== name) {
      const touched = usedBy(name);
      finance.saveMany(touched.map((d) => ({ ...d, category: to, updatedAt: Date.now() })));
      categories = categories.includes(name) ? categories.map((c) => (c === name ? to : c)) : categories.concat([to]);
    } else if (!categories.includes(name)) categories = categories.concat([name]);
    saveConfig(finance, { categories, budgets });
    notify(isNew ? "categoria criada" : "categoria salva");
  };
  const remove = () => {
    const before = configOf(finance);
    const n = usedBy(name).length;
    const budgets = { ...(before.budgets || {}) };
    delete budgets[name];
    saveConfig(finance, { categories: before.categories.filter((c) => c !== name), budgets });
    notify(n ? "tirei da lista — " + n + (n === 1 ? " lançamento fica" : " lançamentos ficam") + " com a etiqueta" : "categoria apagada",
      () => saveConfig(finance, { categories: before.categories, budgets: before.budgets }));
  };
  return (
    <Form title={isNew ? "nova categoria" : "categoria"} sub="a meta é quanto pode sair por ela em cada mês"
        submit={isNew ? "criar" : "salvar"} remove={!isNew && cfg.categories.includes(name) ? "tirar da lista" : ""}
        onRemove={remove} onClose={onClose} onSubmit={submit}>
      <Field label="nome"><input className="input" required maxLength="30" {...bind("name")} /></Field>
      <Field label="meta por mês"><MoneyInput placeholder="sem meta" {...bind("budget")} /></Field>
    </Form>
  );
}

/* ----- ano ----- */
function YearView({ ctx, year, onShift, onOpenMonth }) {
  const t = today();
  /* o saldo entra em janeiro uma vez e desce mes a mes: doze buildMonth
     encadeados, em vez de doze balanceUntil() que recalculariam do inicio */
  /* os fixos e as parcelas ainda nao lancados somam de hoje em diante (igual
     no mes) — o que ja passou sem lancar fica de fora, porque nao se sabe se
     aconteceu */
  let balance = balanceUntil(addDays(year + "-01-01", -1), ctx, t);
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const yyyymm = year + "-" + pad(m);
    const days = buildMonth(yyyymm, ctx, balance, t);
    balance = days[days.length - 1].balance;
    months.push({ yyyymm, days });
  }
  /* o teto da escala de cor: o maior saldo de verdade do ano inteiro, pra
     doze meses lado a lado ficarem comparaveis entre si */
  const maxAbs = Math.max(0, ...months.flatMap((mo) => mo.days.filter((d) => !d.before).map((d) => d.balance)));
  return (
    <>
      <div className="row mb">
        <button className="pill pill--icon" type="button" aria-label="Ano anterior" onClick={() => onShift(-1)}>{icon("arrowLeft")}</button>
        <strong className="mono" id="year-label">{year}</strong>
        <button className="pill pill--icon" type="button" aria-label="Ano seguinte" onClick={() => onShift(1)}>{icon("arrow")}</button>
        <span className="small weak">o saldo no fim de cada dia — de hoje em diante, previsto e com os fixos · clique no mês para abrir</span>
      </div>
      <div className="year-scroll"><div className="year">
        {months.map((mo, i) => <YearMonth key={mo.yyyymm} mo={mo} index={i} today={t} maxAbs={maxAbs} onOpen={() => onOpenMonth(mo.yyyymm)}/>)}
      </div></div>
    </>
  );
}

/* uma coluna do ano: o mes no cabecalho (que abre a aba do mes) e os 31
   dias embaixo, os que o mes nao tem ficam invisiveis para alinhar */
function YearMonth({ mo, index, today: t, maxAbs, onOpen }) {
  const end = mo.days[mo.days.length - 1].balance;
  const rows = [];
  for (let n = 1; n <= 31; n++) {
    const day = mo.days[n - 1];
    if (!day) { rows.push(<div key={n} className="year__day is-empty"><i>{pad(n)}</i><span>—</span></div>); continue; }
    if (day.before) { rows.push(<div key={n} className="year__day"><i>{pad(n)}</i><span className="weak">—</span></div>); continue; }
    const moves = day.inflow || day.outflow;
    const tone = balanceStyle(day.balance, maxAbs);
    const cls = tone.cls + (moves ? " has-moves" : "") + (day.day === t ? " is-today" : "") + (day.day > t ? " is-future" : "");
    const title = dateLabel(day.day, true) + (day.inflow ? " · +" + brl(day.inflow) : "") + (day.outflow ? " · −" + brl(day.outflow) : "");
    rows.push(<div key={n} className={"year__day" + cls} style={tone.style} title={title}><i>{pad(n)}</i><span>{brlBalance(day.balance)}</span></div>);
  }
  return (
    <div className={"year__month" + (mo.yyyymm === t.slice(0, 7) ? " is-current" : "")}>
      <div className="year__head" title={"abrir " + SHORT_MONTHS[index]} onClick={onOpen}><b>{SHORT_MONTHS[index]}</b><span>{brlBalance(end)}</span></div>
      {rows}
    </div>
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
        ? <span className="badge badge--accent">pago</span>
        : <span className="bar" title={brl(d.paid) + " de " + brl(d.total)}><i style={{ width: pct + "%" }}></i></span>}</td>
      <td className="num">{!settled && <span className="row-actions"><button className="pill pill--mini" type="button" title={"abate " + brl(Math.min(d.installment || (d.total - d.paid), d.total - d.paid)) + " do que falta"} onClick={(e) => { e.stopPropagation(); onPay(d.id); }}>abater</button></span>}</td>
    </tr>
  );
}

function PanelView({ ctx, cfg, onEdit, onNewFixed, onNewCard, onNewDebt, onPay }) {
  const thisMonth = today().slice(0, 7);
  const pct = cfg.percents;

  const totalOut = fixedOf(ctx, "out").reduce((s, f) => s + f.amount, 0);
  const totalIn = fixedOf(ctx, "in").reduce((s, f) => s + f.amount, 0);

  const cards = ctx.cards.slice().sort((a, b) => a.start.localeCompare(b.start) || a.dayOfMonth - b.dayOfMonth);
  const cardRemaining = (c) => { const n = Math.max(0, Math.min(c.installments, installmentNumber(c, thisMonth) - 1)); return c.total - n * cardInstallment(c); };
  const totalCard = cards.reduce((s, c) => s + Math.max(0, cardRemaining(c)), 0);

  const debts = ctx.debts.slice().sort((a, b) => (a.paid >= a.total) - (b.paid >= b.total) || b.total - a.total);
  const totalOwed = debts.reduce((s, d) => s + Math.max(0, d.total - d.paid), 0);

  const leftover = totalIn - totalOut;

  return (
    <>
      <div className="grid">
        <FixedBlocks ctx={ctx} onEdit={onEdit} onNewFixed={onNewFixed}/>
        <PanelBlock title="compras parceladas" total={"faltam " + brl(totalCard)} addTitle="nova compra parcelada" onAdd={onNewCard}>
          <PanelTable headers={[{ text: "nome" }, { text: "cartão" }, { text: "parcelamento", num: true }, { text: "total", num: true }]} empty="nenhuma compra parcelada"
            rows={cards.map((c) => <CardRow key={c.id} c={c} thisMonth={thisMonth} onEdit={() => onEdit("card", c.id)}/>)}/>
        </PanelBlock>
        <PanelBlock title="dívidas · não entram no saldo" total={"deve " + brl(totalOwed)} addTitle="nova dívida" onAdd={onNewDebt}>
          <PanelTable headers={[{ text: "nome" }, { text: "pessoa" }, { text: "valor", num: true }, { text: "pago", num: true }, { text: "", num: true }]} empty="nenhuma dívida"
            rows={debts.map((d) => <DebtRow key={d.id} d={d} onEdit={() => onEdit("debt", d.id)} onPay={onPay}/>)}/>
        </PanelBlock>
      </div>

      <div className="block mt">
        <p className="heading"><span className="t-mono">como as entradas fixas se dividem · {pct.expenses}/{pct.spending}/{pct.assets}</span><span className="small weak">muda em ajustes</span></p>
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

/* ----- investimentos: so aporte e saldo atual, na mao -----
   sem cotacao automatica, sem historico por periodo — a diferenca entre o
   que entrou e o que esta valendo hoje e o unico numero calculado. */
function InvestRow({ it, onEdit }) {
  const diff = it.current - it.contributed;
  return (
    <tr className="editable" data-id={it.id} onClick={onEdit}>
      <td>{it.name}</td>
      <td className="weak">{it.category}</td>
      <td className="num">{brl(it.contributed)}</td>
      <td className="num">{brl(it.current)}</td>
      <td className={"num" + (diff < 0 ? " is-negative" : diff > 0 ? " is-green" : "")}>{diff ? (diff > 0 ? "+" : "") + brl(diff, true) : "—"}</td>
    </tr>
  );
}
function InvestView({ ctx, onEdit, onNew }) {
  const invests = ctx.invests.slice().sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  const totalContributed = invests.reduce((s, it) => s + it.contributed, 0);
  const totalCurrent = invests.reduce((s, it) => s + it.current, 0);
  const totalDiff = totalCurrent - totalContributed;
  return (
    <>
      <div className="meters mb">
        <Meter label="total aportado" value={totalContributed}/>
        <Meter label="valendo hoje" value={totalCurrent}/>
        <Meter label="diferença" value={totalDiff} cls={totalDiff < 0 ? " is-negative" : totalDiff > 0 ? " is-green" : ""}/>
      </div>
      <div className="block">
        <p className="heading">
          <span className="t-mono">investimentos</span>
          <button className="action" type="button" title="novo investimento" aria-label="novo investimento" onClick={onNew}>{icon("plus")}</button>
        </p>
        <PanelTable headers={[{ text: "nome" }, { text: "categoria" }, { text: "aportado", num: true }, { text: "hoje", num: true }, { text: "diferença", num: true }]}
          empty="nenhum investimento ainda — o que você aportou e o que está valendo agora, sem conta automática"
          rows={invests.map((it) => <InvestRow key={it.id} it={it} onEdit={() => onEdit(it.id)}/>)}/>
      </div>
    </>
  );
}

/* ---------- formularios (todos em pop-up) ----------
   o mesmo <Form> do ui: criar e editar sao a mesma caixa, a diferenca e
   ter ou nao um documento por baixo. */
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
        sub="a parcela cai todo mês no dia do vencimento, até acabar"
        submit={c ? "salvar" : "adicionar"} remove={c ? "apagar" : ""}
        onRemove={() => onRemove(id, "compra apagada")} onClose={onClose} onSubmit={submit}>
      <Field label="compra" full><input className="input" required maxLength="140" {...bind("name")}/></Field>
      <Field label="cartão"><input className="input" maxLength="40" placeholder="Nubank, C6…" {...bind("card")}/></Field>
      <Field label="total"><MoneyInput {...bind("total")}/></Field>
      <Field label="parcelas"><UnitInput unit="x" min="1" max="120" {...bind("installments")}/></Field>
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
        sub="só um registro do que você deve — não desconta do saldo"
        submit={d ? "salvar" : "adicionar"} remove={d ? "apagar" : ""}
        onRemove={() => onRemove(id, "dívida apagada")} onClose={onClose} onSubmit={submit}>
      <Field label="nome" full><input className="input" required maxLength="140" {...bind("name")}/></Field>
      <Field label="credor"><input className="input" maxLength="80" placeholder="pessoa ou empresa" {...bind("creditor")}/></Field>
      <Field label="total"><MoneyInput {...bind("total")}/></Field>
      <Field label="já pago"><MoneyInput {...bind("paid")}/></Field>
      <Field label="parcela por mês"><MoneyInput placeholder="opcional" {...bind("installment")}/></Field>
      <Field label="vencimento"><DayOfMonthInput {...bind("dayOfMonth")}/></Field>
    </Form>
  );
}

function InvestForm({ finance, id, onClose, onRemove, onSave }) {
  const it = id ? finance.get(id) : null;
  const [v, bind] = useFields({
    name: it ? it.name : "",
    category: it ? it.category : INVEST_CATEGORIES[0],
    contributed: inReais(it && it.contributed),
    current: inReais(it && it.current)
  });
  if (id && !it) return null;
  const submit = () => {
    if (!v.name.trim()) { notify("preciso de um nome"); return false; }
    onSave({
      id: it ? it.id : newId(), type: "invest", name: v.name.trim(), category: v.category,
      contributed: parseMoney(v.contributed), current: parseMoney(v.current)
    }, it, it ? "investimento atualizado" : "investimento criado");
  };
  return (
    <Form title={it ? "investimento" : "novo investimento"}
        sub="quanto entrou e quanto está valendo hoje — editado à mão, sem cotação automática"
        submit={it ? "salvar" : "adicionar"} remove={it ? "apagar" : ""}
        onRemove={() => onRemove(id, "investimento apagado")} onClose={onClose} onSubmit={submit}>
      <Field label="nome" full><input className="input" required maxLength="140" placeholder="tesouro selic, ações XPTO…" {...bind("name")}/></Field>
      <Field label="categoria">
        <select className="select" {...bind("category")}>{INVEST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      </Field>
      <Field label="total aportado"><MoneyInput {...bind("contributed")}/></Field>
      <Field label="saldo atual"><MoneyInput {...bind("current")}/></Field>
    </Form>
  );
}

mount(<Finance />, "app");
