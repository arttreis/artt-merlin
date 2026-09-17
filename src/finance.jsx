/* merlin · o financeiro
   o mes dia a dia com saldo, os doze meses do ano lado a lado e o painel dos
   fixos, do cartao e das dividas. tudo em centavos. */
import "./shared/base.css";
import "./finance.css";
import {
  initPage, newId, today, notify, brl, parseMoney,
  isDay, addDays, weekdayOf, monthLabel, dateLabel, setPageContext
} from "./shared/core.js";
import { useState, useEffect } from "react";
import { FINANCE_TEMPLATES, financeGroups, buildFinance } from "./shared/templates.js";
import {
  mount, useCollection, useKeydown, isTyping,
  useFields, Form, Field, EmptyStart, icon, DateField, DayOfMonthField
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
  { id: "panel", label: "fixos" },
  { id: "invest", label: "investimentos" }
];
/* categorias do investimento: so o suficiente pra separar por tipo de ativo,
   sem cotacao automatica nem historico — aporte e saldo atual, na mao */
const INVEST_CATEGORIES = ["renda fixa", "ações", "fundos", "cripto", "outros"];

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

/* as SUGESTOES do dia: o que os fixos e as parcelas do cartao dizem que
   cairia em `day` e ainda nao foi lancado. desde 13/09/2026 elas nao entram
   em conta nenhuma — nem saldo, nem previsto, nem categoria. o Arthur: "pode
   sugerir, mas nao pode considerar previsao". previsao e so o que a pessoa
   lancou como nao pago; a sugestao vira lancamento quando ela lanca.
   em 14/09/2026 isso mudou em parte: de hoje em diante a sugestao soma no
   saldo do mes e do ano (ver balanceUntil). o real, as categorias e as
   somas de entrada/saida do hoje continuam sem ela.

   tudo que o dia `day` teria alem dos lancamentos ja gravados: a
   recorrencia dos fixos e a parcela de uma compra no cartao (enquanto houver
   parcela). a divida NAO entra: desde 13/09/2026 ela e so um registro do que
   se deve, que a pessoa regula a mao no painel — nao desconta do saldo, nao
   aparece nos proximos dias nem nas categorias.
   nada aqui grava documento nenhum — e so a pergunta "o que cai neste
   dia?" respondida sem efeito colateral, pra poder chamar de novo a
   vontade (o mes inteiro, o balanceUntil, o ano). */
function projectionsOf(day, ctx) {
  const [year, month, dayNum] = day.split("-").map(Number);
  const yyyymm = day.slice(0, 7);
  const proj = [];

  (ctx.fixed || []).forEach((f) => {
    if (!f.active || !f.amount) return; /* fixo sem valor nao sugere nada */
    if (effectiveDay(year, month, f.dayOfMonth) !== dayNum) return;
    if (alreadyEntered(ctx.entries, "fixed", f.id, day)) return;
    proj.push({
      id: "proj-fixed-" + f.id + "-" + day, name: f.name, amount: f.amount, kind: f.kind,
      category: f.category, origin: { type: "fixed", id: f.id }
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

/* saldo previsto no fim do dia `day`: parte do saldo inicial e anda dia a
   dia, somando os lancamentos, pagos ou nao — um lancamento nao pago ja e a
   propria previsao. sugestao nao entra. e dia a dia, e nao "soma tudo com data <= dia",
   porque so assim o effectiveDay se aplica mes a mes igual um calendario.
   `suggestFrom` (um dia, opcional): dali em diante as sugestoes tambem somam.
   o ano, o mes e o hoje passam `today()` — o Arthur, em 14/09/2026: "na
   visualizacao de ano ele tem que considerar os fixos", e o mes foi junto
   pra os dois nao discordarem. */
function balanceUntil(day, ctx, suggestFrom) {
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
    if (suggestFrom && d >= suggestFrom) {
      projectionsOf(d, ctx).forEach((p) => { balance += p.kind === "in" ? p.amount : -p.amount; });
    }
    d = addDays(d, 1);
  }
  return balance;
}

/* a cor do saldo escala com o proprio conjunto visivel (o mes ou o ano
   aberto), nao com faixas fixas — senao um saldo de R$ 3 mil e um de
   R$ 300 mil pintam igual so por passarem os dois de um teto absoluto.
   raiz quadrada pra nao achatar os valores do meio quando um unico dia
   dispara bem acima do resto. em centavos. */
function balanceStyle(cents, maxAbs) {
  if (cents < 0) return { cls: " is-negative" };
  const t = maxAbs > 0 ? Math.min(1, Math.sqrt(cents / maxAbs)) : 0;
  return { cls: " is-positive", style: { "--tone": t } };
}
/* negativo entre parenteses, como na planilha */
const brlBalance = (cents) => cents < 0 ? "(" + brl(cents) + ")" : brl(cents);

/* tres coisas, tres desenhos:
   - REAL: lancamento pago. cheio.
   - PREVISTO: lancamento que a pessoa gravou como nao pago. tracejado, com
     o "≈" — a mesma regra do funil, tracejado e o que ainda nao aconteceu.
   - SUGESTAO: fixo ou parcela ainda nao lancado. nao tem numero nas contas;
     aparece apagado, com o botao de lancar.
   somados num numero so, eles faziam o "saldo de hoje" mentir. */
const isForecast = (it) => !it.paid;

/* o que esta na conta no fim do dia `day`: o saldo inicial e so o que foi
   pago de verdade. o balanceUntil soma as projecoes tambem, e responde outra
   pergunta — onde a conta vai estar. */
function realBalanceUntil(day, ctx) {
  const oldest = oldestDay(ctx.entries);
  const cfg = ctx.startBalance || (oldest ? { day: oldest, amount: 0 } : null);
  if (!cfg) return 0;
  return (ctx.entries || [])
    .filter((e) => e.paid && e.day >= cfg.day && e.day <= day)
    .reduce((s, e) => s + (e.kind === "in" ? e.amount : -e.amount), cfg.amount);
}

/* o previsto cujo dia ja passou: a pessoa disse que ia acontecer, e ninguem
   confirmou se aconteceu */
const pendingBefore = (day, ctx) => (ctx.entries || [])
  .filter((e) => !e.paid && e.day < day)
  .sort((a, b) => a.day.localeCompare(b.day))
  .map((e) => ({ day: e.day, it: e }));

/* as sugestoes de um intervalo, dia a dia */
function suggestionsBetween(from, to, ctx) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) projectionsOf(d, ctx).forEach((it) => out.push({ day: d, it }));
  return out;
}

/* o mes inteiro, dia a dia: um balanceUntil() so pro dia anterior ao 1,
   depois anda dia a dia — em vez de chamar balanceUntil() pra cada linha */
function buildMonth(yyyymm, ctx, balanceBefore, suggestFrom) {
  const [year, month] = yyyymm.split("-").map(Number);
  const nDays = daysInMonth(year, month);
  let balance = balanceBefore != null ? balanceBefore : balanceUntil(addDays(yyyymm + "-01", -1), ctx, suggestFrom);
  /* antes do marco (saldo inicial, ou o lancamento mais antigo) nao ha
     conta: o dia aparece vazio, e o saldo fica parado no valor inicial —
     a mesma regra do balanceUntil, senao o ano e o mes discordariam */
  const marker = (ctx.startBalance || {}).day || oldestDay(ctx.entries) || "";
  const days = [];
  for (let i = 1; i <= nDays; i++) {
    const day = yyyymm + "-" + pad(i);
    if (marker && day < marker) { days.push({ day, inflow: 0, outflow: 0, balance, items: [], suggestions: projectionsOf(day, ctx), before: true }); continue; }
    const items = ctx.entries.filter((e) => e.day === day);
    const suggestions = projectionsOf(day, ctx);
    const counted = suggestFrom && day >= suggestFrom ? items.concat(suggestions) : items;
    const inflow = counted.filter((x) => x.kind === "in").reduce((s, x) => s + x.amount, 0);
    const outflow = counted.filter((x) => x.kind === "out").reduce((s, x) => s + x.amount, 0);
    balance += inflow - outflow;
    days.push({ day, inflow, outflow, balance, items, suggestions });
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
    case "invest":
      return {
        ...base,
        name: String(d.name || "").slice(0, 140),
        category: INVEST_CATEGORIES.includes(d.category) ? d.category : INVEST_CATEGORIES[0],
        contributed: Math.round(Math.abs(+d.contributed)) || 0,
        current: Math.round(Math.abs(+d.current)) || 0,
        order: Number.isFinite(+d.order) ? +d.order : 0
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
        categories: Array.isArray(d.categories) && d.categories.length ? d.categories.map(String) : DEFAULT_CATEGORIES.slice(),
        /* a meta de gasto do mes por categoria, em centavos: { "Lazer": 50000 }.
           vale para todo mes igual — meta que muda todo mes vira planilha. */
        budgets: Object.fromEntries(Object.entries(d.budgets && typeof d.budgets === "object" ? d.budgets : {})
          .map(([k, v]) => [String(k), Math.round(Math.abs(+v)) || 0]).filter(([, v]) => v > 0))
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
    invests: byType(finance, "invest"),
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

  /* o que o assistente sabe sem perguntar de novo, quando a pergunta for do
     financeiro ("posso gastar X?") — so o que ja esta na tela, nunca uma
     simulacao nova por conta propria */
  useEffect(() => {
    if (virgin) { setPageContext(null); return () => setPageContext(null); }
    const t = today();
    const balanceToday = realBalanceUntil(t, ctx);
    const [y, m] = t.slice(0, 7).split("-").map(Number);
    const monthEnd = t.slice(0, 7) + "-" + String(daysInMonth(y, m)).padStart(2, "0");
    const balanceEnd = balanceUntil(monthEnd, ctx, t);
    const fixedLines = ctx.fixed.filter((f) => f.active).map((f) => f.name + " · " + f.category + " · " + (f.kind === "in" ? "+" : "−") + brl(f.amount));
    setPageContext(() =>
      "Financeiro. Saldo hoje: " + brl(balanceToday) + ". Previsto fim do mês: " + brl(balanceEnd) + ". " +
      (fixedLines.length ? "Fixos do mês: " + fixedLines.join("; ") + "." : "sem fixos cadastrados.")
    );
    return () => setPageContext(null);
  }, [ctx, cfg, virgin]);

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
  /* lancar uma sugestao: a caixa de lancamento ja preenchida com o que o
     fixo ou a parcela diz. quem decide o valor, o dia e se ja foi pago e a
     pessoa — a sugestao so poupa a digitacao. */
  const launchSuggestion = (day, it) => setForm({ type: "entry", id: "", day,
    preset: { name: it.name, amount: it.amount, kind: it.kind, category: it.category, origin: it.origin, paid: day <= today() } });
  const togglePaid = (id) => {
    const doc = finance.get(id);
    if (doc) finance.save({ ...doc, paid: !doc.paid, updatedAt: Date.now() });
  };
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
      {form && form.type === "fixed" && <FixedForm key={"fixed:" + form.id} id={form.id} presetKind={form.kind} {...formProps}/>}
      {form && form.type === "card" && <CardForm key={"card:" + form.id} id={form.id} {...formProps}/>}
      {form && form.type === "debt" && <DebtForm key={"debt:" + form.id} id={form.id} {...formProps}/>}
      {form && form.type === "invest" && <InvestForm key={"invest:" + form.id} id={form.id} {...formProps}/>}
      {form && form.type === "config" && <ConfigForm finance={finance} onClose={closeForm}/>}
    </>
  );
}

/* um medidor: legenda em cima, numero embaixo. `forecast` desenha o numero
   como previsao: tinta mais leve, sublinhado tracejado e o "≈" na frente */
const Meter = ({ label, value, cls, forecast }) => (
  <div className="meter"><span className="legend">{label}</span><span className={"num mono" + (forecast ? " is-forecast" : "") + (cls || "")}>{forecast ? "≈ " : ""}{brl(value, true)}</span></div>);

/* a barra de dois tempos: o cheio e o que ja aconteceu, o tracejado e o que
   ainda vai, sobre o total `of`. passar do total nao some: a barra enche e
   a legenda diz quanto passou. */
const SplitBar = ({ real, forecast, of }) => {
  const base = Math.max(1, of || real + forecast);
  const r = Math.min(100, (real / base) * 100);
  const f = Math.min(100 - r, (forecast / base) * 100);
  return <span className="split"><i style={{ width: r + "%" }} /><b style={{ width: f + "%" }} /></span>;
};

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
  const moved = {};
  days.forEach((d) => d.items.forEach((it) => {
    const k = it.category || "sem categoria";
    const m = moved[k] || (moved[k] = { outReal: 0, outAll: 0, in: 0 });
    if (it.kind === "in") m.in += it.amount;
    else { m.outAll += it.amount; if (!isForecast(it)) m.outReal += it.amount; }
  }));
  /* a lista da config mais as etiquetas órfãs: escondê-las faria as somas não fecharem */
  const names = cfg.categories.concat(Object.keys(moved).filter((k) => k !== "sem categoria" && !cfg.categories.includes(k)));
  const budgets = cfg.budgets || {};
  const out = (n) => (moved[n] ? moved[n].outAll : 0);
  const biggest = Math.max(1, ...names.map((n) => Math.max(out(n), budgets[n] || 0)));
  const withGoal = names.filter((n) => budgets[n]);
  const totalBudget = withGoal.reduce((s, n) => s + budgets[n], 0);
  const totalUse = withGoal.reduce((s, n) => s + out(n), 0);
  /* com meta vem primeiro, a mais apertada no topo; sem meta, a que mais gastou */
  const rank = (n) => (budgets[n] ? 1e9 * (out(n) / budgets[n]) : out(n) / 1e3);
  const sorted = names.slice().sort((a, b) => rank(b) - rank(a));

  return (
    <>
      <p className="heading">
        <span className="t-mono">gasto por categoria · {monthLabel(month)}</span>
        <button className="action" type="button" title="nova categoria" aria-label="nova categoria" onClick={() => onCategory("")}>{icon("plus")}</button>
      </p>
      {totalBudget > 0
        ? <p className="note">nas categorias com meta: ≈ {brl(totalUse)} de {brl(totalBudget)}</p>
        : <p className="note">clique numa categoria para dar uma meta de gasto por mês.</p>}
      {names.length ? (
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

/* ----- mês ----- */
function MonthView({ ctx, month, openDay, onToggleDay, onShift, onNewEntry, onEditEntry, onTogglePaid, onLaunch }) {
  const t = today();
  /* simular: uma lista de lancamentos hipoteticos, so em memoria — nunca
     grava na colecao. o saldo/entradas/saidas do mes saem do ctx simulado;
     o detalhe de cada dia (o que abre ao clicar) continua mostrando so os
     lancamentos de verdade, com as acoes de sempre (editar, confirmar). */
  const [sim, setSim] = useState([]);
  const [simOpen, setSimOpen] = useState(false);
  const realDays = buildMonth(month, ctx, null, t);
  const days = sim.length
    ? buildMonth(month, { ...ctx, entries: ctx.entries.concat(sim) }, null, t)
        .map((d, i) => ({ ...d, items: realDays[i].items, suggestions: realDays[i].suggestions }))
    : realDays;
  const [year, monthNum] = month.split("-").map(Number);
  const nDays = daysInMonth(year, monthNum);
  const isThisMonth = month === t.slice(0, 7);
  const todayNum = isThisMonth ? +t.slice(8, 10) : 0;

  const balanceToday = realBalanceUntil(t, ctx);
  const balanceEnd = days[days.length - 1].balance;
  /* o "diario" da planilha: o que sobra no fim do mes dividido pelos dias
     que ainda faltam — mesma logica da barra do dia */
  const daysLeft = isThisMonth ? (nDays - todayNum + 1) : nDays;
  const daily = daysLeft > 0 ? Math.round(balanceEnd / daysLeft) : 0;
  const monthIn = days.reduce((s, d) => s + d.inflow, 0);
  const monthOut = days.reduce((s, d) => s + d.outflow, 0);
  /* o teto da escala de cor: o maior saldo de verdade do mes (o "antes do
     marco" fica de fora, ele nem pinta) */
  const maxAbs = Math.max(0, ...days.filter((d) => !d.before).map((d) => d.balance));

  const addSim = (entry) => setSim((s) => s.concat([{ ...entry, id: newId(), paid: false, category: "", origin: { type: "sim", id: "" } }]));
  const removeSim = (id) => setSim((s) => s.filter((e) => e.id !== id));
  const clearSim = () => { setSim([]); setSimOpen(false); };

  return (
    <>
      <div className="row mb">
        <button className="pill pill--icon" type="button" aria-label="Mês anterior" onClick={() => onShift(-1)}>{icon("arrowLeft")}</button>
        <strong className="mono" id="month-label">{monthLabel(month)}</strong>
        <button className="pill pill--icon" type="button" aria-label="Mês seguinte" onClick={() => onShift(1)}>{icon("arrow")}</button>
        <span className="spacer"></span>
        <button className={"pill" + (sim.length || simOpen ? " is-on" : "")} type="button" aria-pressed={String(simOpen)} onClick={() => setSimOpen((v) => !v)}>
          {icon("spark")}simular{sim.length > 0 ? " · " + sim.length : ""}
        </button>
        <button className="pill pill--green" type="button" onClick={() => onNewEntry()}>{icon("plus")}lançamento</button>
      </div>

      {simOpen && <SimPanel month={month} entries={sim} onAdd={addSim} onRemove={removeSim} onClear={clearSim} onClose={() => setSimOpen(false)} />}

      <div className="meters mb">
        <Meter label="na conta hoje" value={balanceToday} cls={balanceToday < 0 ? " is-negative" : ""}/>
        <Meter label="fim do mês" value={balanceEnd} forecast cls={balanceEnd < 0 ? " is-negative" : ""}/>
        <Meter label={daily < 0 ? "não fecha" : "por dia até o fim"} value={daily} forecast cls={daily < 0 ? " is-negative" : ""}/>
        <Meter label="entradas do mês" value={monthIn} forecast/>
        <Meter label="saídas do mês" value={monthOut} forecast/>
      </div>

      <div className="table-scroll"><table className="table">
        <thead><tr><th>dia</th><th className="num">entradas</th><th className="num">saídas</th><th className="num">saldo</th></tr></thead>
        <tbody>
          {days.map((d) => <DayRow key={d.day} d={d} today={t} isToday={isThisMonth && d.day === t} open={openDay === d.day} maxAbs={maxAbs}
            onToggle={() => onToggleDay(d.day)} onNewEntry={onNewEntry} onEditEntry={onEditEntry} onTogglePaid={onTogglePaid} onLaunch={onLaunch}/>)}
        </tbody>
      </table></div>
    </>
  );
}

/* ----- simular: um "e se" que nunca grava -----
   uma lista hipotetica em memoria, somada aos lancamentos de verdade so na
   hora de calcular o saldo projetado. fechar a aba ou limpar a simulacao
   nao deixa rastro nenhum na colecao. */
function SimPanel({ month, entries, onAdd, onRemove, onClear, onClose }) {
  const [v, bind, set] = useFields({ name: "", amount: "", kind: "out", day: today() > month + "-01" ? today() : month + "-01" });
  const add = () => {
    const amount = parseMoney(v.amount);
    if (!v.name.trim() || !amount) { notify("preciso de um nome e um valor pra simular"); return; }
    onAdd({ day: isDay(v.day) ? v.day : today(), name: v.name.trim(), amount, kind: v.kind });
    set("name", ""); set("amount", "");
  };
  const total = entries.reduce((s, e) => s + (e.kind === "in" ? e.amount : -e.amount), 0);
  return (
    <div className="block sim-panel mb">
      <p className="heading">
        <span className="t-mono">simulação · e se</span>
        <span className="row">
          {entries.length > 0 && <span className={"total" + (total < 0 ? " is-negative" : total > 0 ? " is-green" : "")}>{(total > 0 ? "+" : "") + brl(total, true)}</span>}
          {entries.length > 0 && <button className="action" type="button" title="limpar simulação" aria-label="limpar simulação" onClick={onClear}>{icon("trash")}</button>}
          <button className="action" type="button" title="fechar" aria-label="fechar" onClick={onClose}>{icon("x")}</button>
        </span>
      </p>
      <p className="small weak sim-panel__hint">lançamentos hipotéticos, só nesta tela — não gravam em nada, e somem se você sair sem limpar</p>
      {entries.length > 0 && (
        <ul className="list mb">
          {entries.slice().sort((a, b) => a.day.localeCompare(b.day)).map((e) => (
            <li key={e.id} className="line fin-item is-forecast">
              <span className="name"><small className="fin-item__day">{dateLabel(e.day)}</small>{e.name}</span>
              <span className={"measure mono" + (e.kind === "in" ? " positive" : "")}>{e.kind === "in" ? "+" : "−"} {brl(e.amount)}</span>
              <span className="fin-item__acts"><button className="action" type="button" title="tirar da simulação" aria-label="tirar da simulação" onClick={() => onRemove(e.id)}>{icon("x")}</button></span>
            </li>
          ))}
        </ul>
      )}
      <div className="row sim-panel__add">
        <input className="input" placeholder="o que aconteceria?" maxLength="140" {...bind("name")} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}/>
        <MoneyInput {...bind("amount")}/>
        <KindChips {...bind("kind")}/>
        <DateField {...bind("day")}/>
        <button className="pill" type="button" onClick={add}>{icon("plus")}simular</button>
      </div>
    </div>
  );
}

/* a linha do dia e, embaixo dela, o detalhe quando esta aberta */
/* o dia que ainda não chegou é previsão inteira: tinta leve e o "≈". o que
   já passou com item sem confirmar ganha o ponto de "a confirmar". */
function DayRow({ d, today: t, isToday, open, maxAbs, onToggle, onNewEntry, onEditEntry, onTogglePaid, onLaunch }) {
  const label = weekdayOf(d.day) + " " + (+d.day.slice(8, 10));
  const future = d.day > t;
  const unconfirmed = !future && !d.before && d.items.some(isForecast);
  const money = (v) => (future ? "≈ " : "") + brl(v, true);
  const tone = balanceStyle(d.balance, maxAbs);
  return (
    <>
      <tr className={"day-row" + (isToday ? " is-today" : "") + (future ? " is-future" : "")} data-day={d.day} onClick={onToggle}>
        <td>{label}{unconfirmed && <i className="dot-pending" title="tem previsto a confirmar" />}{d.suggestions.length > 0 && <i className="dot-suggest" title={d.suggestions.length + (d.suggestions.length === 1 ? " sugestão" : " sugestões") + " para lançar"} />}</td>
        <td className="num">{d.inflow ? money(d.inflow) : "—"}</td>
        <td className="num">{d.outflow ? money(-d.outflow) : "—"}</td>
        <td className={"num" + (d.before ? " weak" : " balance-cell" + tone.cls)} style={d.before ? undefined : tone.style}>{d.before ? "—" : money(d.balance)}</td>
      </tr>
      {open && (
        <tr className="day-detail"><td colSpan="4">
          {d.items.length > 0 && <ul className="list">{d.items.map((it) => <DayItem key={it.id} it={it} day={d.day} onEditEntry={onEditEntry} onTogglePaid={onTogglePaid}/>)}</ul>}
          {d.suggestions.length > 0 && <ul className="list mt2">{d.suggestions.map((it) => <SuggestionItem key={it.id} it={it} day={d.day} onLaunch={onLaunch}/>)}</ul>}
          {!d.items.length && !d.suggestions.length && <p className="empty">nada neste dia</p>}
          <p className="mt2"><button className="pill pill--mini" type="button" onClick={() => onNewEntry(d.day)}>+ lançamento neste dia</button></p>
        </td></tr>)}
    </>
  );
}

/* um lançamento do dia. o previsto vem tracejado, com o "aconteceu" que o
   confirma; o real vem cheio, e o check dele volta para previsto. */
function DayItem({ it, day, showDay, onEditEntry, onTogglePaid }) {
  const forecast = isForecast(it);
  const sign = it.kind === "in" ? "+" : "−";
  return (
    <li className={"line fin-item" + (forecast ? " is-forecast" : "")}>
      <span className="name">
        {showDay && <small className="fin-item__day">{dateLabel(day)}</small>}
        {it.name}{it.category && <>{" "}<small>#{it.category}</small></>}
      </span>
      <span className={"measure mono" + (it.kind === "in" ? " positive" : "")}>{forecast ? "≈ " : ""}{sign} {brl(it.amount)}</span>
      <span className="fin-item__acts">
        {forecast
          ? <button className="pill pill--mini" type="button" title={it.kind === "in" ? "entrou de verdade" : "saiu de verdade"} onClick={() => onTogglePaid(it.id)}>{icon("check")}aconteceu</button>
          : <button className="action" type="button" title="voltar para previsto" aria-label="voltar para previsto" onClick={() => onTogglePaid(it.id)}>{icon("check")}</button>}
        <button className="action" type="button" title="editar" aria-label="editar" onClick={() => onEditEntry(it.id)}>{icon("pencil")}</button>
      </span>
    </li>
  );
}

/* uma sugestão: apagada, sem sinal de conta, e o "lançar" que abre a caixa
   preenchida. o valor aparece porque ajuda a decidir — mas não soma. */
function SuggestionItem({ it, day, onLaunch }) {
  return (
    <li className="line fin-item is-suggestion">
      <span className="name"><small className="fin-item__day">{dateLabel(day)}</small>{it.name}{it.category && <>{" "}<small>#{it.category}</small></>}</span>
      <span className="measure">{brl(it.amount)}</span>
      <span className="fin-item__acts">
        <button className="pill pill--mini" type="button" title="abre o lançamento preenchido" onClick={() => onLaunch(day, it)}>{icon("plus")}lançar</button>
      </span>
    </li>
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
      <td className="num">{!settled && <span className="row-actions"><button className="pill pill--mini" type="button" title={"abate " + brl(Math.min(d.installment || (d.total - d.paid), d.total - d.paid)) + " do que falta"} onClick={(e) => { e.stopPropagation(); onPay(d.id); }}>abater</button></span>}</td>
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
        <PanelBlock title="saídas fixas" total={brl(totalOut) + " por mês"} addTitle="nova saída fixa" onAdd={() => onNewFixed("out")}>
          <PanelTable headers={fixedHeaders("saída")} empty="nenhuma saída fixa — aluguel, luz, academia…"
            rows={outs.map((f) => <FixedRow key={f.id} f={f} onEdit={() => onEdit("fixed", f.id)}/>)}/>
        </PanelBlock>
        <PanelBlock title="entradas fixas" total={brl(totalIn) + " por mês"} addTitle="nova entrada fixa" onAdd={() => onNewFixed("in")}>
          <PanelTable headers={fixedHeaders("entrada")} empty="nenhuma entrada fixa — o que entra todo mês"
            rows={ins.map((f) => <FixedRow key={f.id} f={f} onEdit={() => onEdit("fixed", f.id)}/>)}/>
        </PanelBlock>
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
/* a unidade mora no campo ("R$" antes, "%" e "x" depois), e nao no rotulo */
const MoneyInput = (props) => <span className="affix affix--pre"><i>R$</i><input className="input input--num" inputMode="decimal" placeholder="0,00" {...props}/></span>;
const UnitInput = ({ unit, ...props }) => <span className="affix affix--post"><input className="input input--num" type="number" {...props}/><i>{unit}</i></span>;
const DayOfMonthInput = (props) => <DayOfMonthField required {...props}/>;
/* entrada ou saida: duas opcoes cabem num par de chips, sem abrir lista */
const KindChips = ({ value, onChange }) => (
  <div className="chips" role="radiogroup">
    {[["out", "saída"], ["in", "entrada"]].map(([k, label]) => (
      <button key={k} type="button" className="chip" role="radio" aria-checked={String(value === k)} aria-pressed={String(value === k)}
              onClick={() => onChange({ currentTarget: { value: k } })}>{label}</button>
    ))}
  </div>
);
const CategorySelect = ({ categories, ...props }) => <select className="select" {...props}>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>;

function EntryForm({ finance, categories, id, presetDay, preset, onClose, onRemove, onSave }) {
  const l = id ? finance.get(id) : null;
  const pre = preset || {};
  const [v, bind] = useFields({
    name: l ? l.name : (pre.name || ""),
    amount: inReais(l ? l.amount : pre.amount),
    day: l ? l.day : (presetDay || today()),
    kind: l ? l.kind : (pre.kind || "out"),
    category: pickCategory(categories, l ? l.category : (pre.category || "")),
    paid: l ? l.paid : (pre.paid != null ? pre.paid : true)
  });
  if (id && !l) return null;
  const submit = () => {
    const amount = parseMoney(v.amount);
    if (!v.name.trim() || !amount) { notify("preciso de um nome e um valor"); return false; }
    onSave({
      id: l ? l.id : newId(), type: "entry", name: v.name.trim(), amount,
      day: isDay(v.day) ? v.day : today(), kind: v.kind, category: v.category,
      paid: v.paid, origin: l ? l.origin : (pre.origin || null)
    }, l, l ? "lançamento atualizado" : "lançamento criado");
  };
  return (
    <Form title={l ? "lançamento" : (pre.origin ? "lançar a sugestão" : "novo lançamento")}
        sub={l ? "" : "pago é real; não pago é previsto e entra no fim do mês com ≈"} submit={l ? "salvar" : "adicionar"} remove={l ? "apagar" : ""}
        onRemove={() => onRemove(id, "lançamento apagado")} onClose={onClose} onSubmit={submit}>
      <Field label="nome" full><input className="input" required maxLength="140" {...bind("name")}/></Field>
      <Field label="valor"><MoneyInput {...bind("amount")}/></Field>
      <Field label="data"><DateField {...bind("day")} /></Field>
      <Field label="tipo"><KindChips {...bind("kind")}/></Field>
      <Field label="categoria"><CategorySelect categories={categories} {...bind("category")}/></Field>
      <label className="row full"><input type="checkbox" {...bind("paid", "check")}/> já aconteceu (desmarcado, fica previsto)</label>
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
        sub="cai todo mês no mesmo dia, como previsto até você confirmar"
        submit={f ? "salvar" : "adicionar"} remove={f ? "apagar" : ""}
        onRemove={() => onRemove(id, "fixo apagado")} onClose={onClose} onSubmit={submit}>
      <Field label="nome" full><input className="input" required maxLength="140" {...bind("name")}/></Field>
      <Field label="valor"><MoneyInput {...bind("amount")}/></Field>
      <Field label="dia do mês"><DayOfMonthInput {...bind("dayOfMonth")}/></Field>
      <Field label="categoria"><CategorySelect categories={categories} {...bind("category")}/></Field>
      {f && <label className="row full" title="desmarque para pausar sem apagar"><input type="checkbox" {...bind("active", "check")}/> ativo</label>}
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
  const submit = () => {
    saveConfig(finance, {
      startBalance: isDay(v.day) ? { day: v.day, amount: parseMoney(v.amount) } : null,
      percents: { expenses: +v.expenses || 0, spending: +v.spending || 0, assets: +v.assets || 0 }
    });
    notify("configuração salva");
  };
  return (
    <Form title="ajustes" sub="de onde o saldo parte e como as entradas se dividem — as categorias e as metas moram na aba hoje" onClose={onClose} onSubmit={submit}>
      <Field label="saldo inicial em"><DateField {...bind("day")} /></Field>
      <Field label="saldo inicial"><MoneyInput {...bind("amount")}/></Field>
      <Field label="despesas"><UnitInput unit="%" min="0" max="100" {...bind("expenses")}/></Field>
      <Field label="gastos"><UnitInput unit="%" min="0" max="100" {...bind("spending")}/></Field>
      <Field label="ativos"><UnitInput unit="%" min="0" max="100" {...bind("assets")}/></Field>
    </Form>
  );
}

mount(<Finance />, "app");
