/* merlin · os dados do financeiro
   ---------------------------------------------------------------
   saiu de dentro de finance.jsx em 22/09/2026, pelo mesmo motivo que o
   tasks.js e o habits-data.js sairam das paginas deles: quem precisa da
   conta nem sempre e a tela do financeiro. o assistente, que abre por cima
   de qualquer pagina, precisa saber o saldo pra responder "posso gastar x?"
   sem que a pessoa tenha que navegar ate o financeiro primeiro.

   e tudo puro — recebe `ctx` e devolve numero. nada aqui le o DOM, e so o
   financeBrief() do fim abre a colecao.
   --------------------------------------------------------------- */
import { collection, today, isDay, addDays, brl } from "./core.js";

export const pad = (n) => String(n).padStart(2, "0");

/* categorias padrao: as da planilha, ate a config guardar a lista propria */
export const DEFAULT_CATEGORIES = ["Básicas/PF", "Básicas/PJ", "Lazer", "Recorrente", "Ferramentas", "Freela", "Investimento", "Outros"];

/* categorias do investimento: so o suficiente pra separar por tipo de ativo,
   sem cotacao automatica nem historico — aporte e saldo atual, na mao */
export const INVEST_CATEGORIES = ["renda fixa", "ações", "fundos", "cripto", "outros"];

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

export function daysInMonth(year, month) {
  /* dia 0 do mes seguinte (1-based) e o ultimo dia do mes atual — cobre
     fevereiro de ano bissexto sem precisar de tabela de excecoes */
  return new Date(year, month, 0).getDate();
}
export function effectiveDay(year, month, dayOfMonth) {
  /* fixo/divida/parcela com dayOfMonth 31 cai no ultimo dia do mes nos
     meses que nao tem 31 — nunca "vaza" pro dia 1 do mes seguinte */
  return Math.min(dayOfMonth, daysInMonth(year, month));
}
/* meses entre "2026-09" e "2026-12" = 3; negativo se `to` vem antes */
export function monthsBetween(from, to) {
  const [y1, m1] = from.split("-").map(Number), [y2, m2] = to.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}
export const cardInstallment = (c) => c.installments ? Math.round(c.total / c.installments) : 0;
/* que numero de parcela cai no mes `yyyymm`: 1 na primeira, 0 antes dela,
   acima de `installments` depois da ultima */
export const installmentNumber = (c, yyyymm) => c.start ? monthsBetween(c.start, yyyymm) + 1 : 0;

/* uma projecao ja virou lancamento real naquele mes? sem isso, confirmar
   um fixo faria ele contar duas vezes: uma como lancamento pago, outra
   como projecao do mesmo dia */
export function alreadyEntered(entries, originType, id, day) {
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
export function projectionsOf(day, ctx) {
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
export function oldestDay(entries) {
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
export function balanceUntil(day, ctx, suggestFrom) {
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

/* o que esta na conta no fim do dia `day`: o saldo inicial e so o que foi
   pago de verdade. o balanceUntil soma as projecoes tambem, e responde outra
   pergunta — onde a conta vai estar. */
export function realBalanceUntil(day, ctx) {
  const oldest = oldestDay(ctx.entries);
  const cfg = ctx.startBalance || (oldest ? { day: oldest, amount: 0 } : null);
  if (!cfg) return 0;
  return (ctx.entries || [])
    .filter((e) => e.paid && e.day >= cfg.day && e.day <= day)
    .reduce((s, e) => s + (e.kind === "in" ? e.amount : -e.amount), cfg.amount);
}

/* ---------- colecao e normalizacao ----------
   uma colecao so, varios tipos — o proprio documento diz o que ele e, e a
   normalizacao decide os campos por tipo. os tipos sao os quatro blocos da
   planilha (fixo de saida/entrada, cartao, divida), mais o lancamento do
   dia a dia e a config. */

export function normalizeOrigin(o) {
  if (!o || !o.type) return null;
  return { type: String(o.type), id: String(o.id || "") };
}

export function normalize(d) {
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

export const byType = (finance, type) => finance.all().filter((d) => d.type === type);
export const configOf = (finance) => finance.get("config") || normalize({ id: "config", type: "config" });
export function saveConfig(finance, partial) {
  const current = configOf(finance);
  finance.save({ ...current, ...partial, id: "config", type: "config", updatedAt: Date.now() });
}
export function contextOf(finance) {
  return {
    entries: byType(finance, "entry"),
    fixed: byType(finance, "fixed"),
    debts: byType(finance, "debt"),
    cards: byType(finance, "card"),
    invests: byType(finance, "invest"),
    startBalance: configOf(finance).startBalance
  };
}

/* ---------- o resumo que o assistente leva ----------
   a mesma frase que a pagina do financeiro registra como contexto quando
   esta aberta, montada aqui pra valer de qualquer tela. devolve "" quando
   ainda nao ha financeiro nenhum: melhor o Merlin dizer que falta dado do
   que responder sobre um saldo inventado. */
export function financeBrief() {
  const finance = collection("finance", { normalize });
  const ctx = contextOf(finance);
  if (!ctx.entries.length && !ctx.fixed.length && !ctx.startBalance) return "";
  const t = today();
  const [y, m] = t.slice(0, 7).split("-").map(Number);
  const monthEnd = t.slice(0, 7) + "-" + pad(daysInMonth(y, m));
  const fixedLines = ctx.fixed.filter((f) => f.active)
    .map((f) => f.name + " · " + f.category + " · " + (f.kind === "in" ? "+" : "−") + brl(f.amount));
  return "Financeiro. Saldo hoje: " + brl(realBalanceUntil(t, ctx)) +
    ". Previsto fim do mês: " + brl(balanceUntil(monthEnd, ctx, t)) + ". " +
    (fixedLines.length ? "Fixos do mês: " + fixedLines.join("; ") + "." : "sem fixos cadastrados.");
}
