/* merlin · o miolo do plano, sem tela
   os planos saíram em 09/10/2026 (VISAO, 9.3) porque eram checklists sem
   verbo e sem nada que se medisse sozinho. voltam em 20/10/2026 (PRD
   meu-negocio, D4) com três horizontes e com o número no lugar do checklist:
   uma meta-norte no ano, uma no semestre e até três no trimestre. mês e
   semana ficam com o calendário.

   a coleção é a mesma `plans`, um documento por meta:
   `{id, kind: "year"|"half"|"quarter", period, text, source, target, current,
   done, createdAt, updatedAt}`. `period` é "2026", "2026-H2" ou "2026-Q4".
   a meta escolhe uma fonte e se mede sozinha (`progressOf`); "à mão" é
   permitido, e a tela o marca como tal.

   quem grava são dois: a aba (plans.jsx) e a pílula da conversa
   (assistant-actions.js, `goal-set`). os dois passam por `goalDoc`, para o
   limite por período ser uma regra só. */
import { newId, isDay, dayOf, brl, parseMoney } from "./core.js";
import { bookOf } from "./finance-data.js";
import { activeTeam } from "./team-data.js";

export const KINDS = ["year", "half", "quarter"];
export const LIMITS = { year: 1, half: 1, quarter: 3 };
const PERIOD_RE = { year: /^\d{4}$/, half: /^\d{4}-H[12]$/, quarter: /^\d{4}-Q[1-4]$/ };

/* de onde o número vem. "à mão" é a última, e é a única que a pessoa move */
export const GOAL_SOURCES = [
  { id: "clients", label: "clientes ativos" },
  { id: "revenue", label: "faturamento do caixa" },
  { id: "won", label: "leads fechados" },
  { id: "launched", label: "produto lançado" },
  { id: "team", label: "pessoas no time" },
  { id: "manual", label: "à mão" }
];
const SOURCE_IDS = GOAL_SOURCES.map((s) => s.id);
export const sourceLabel = (id) => (GOAL_SOURCES.find((s) => s.id === id) || {}).label || "";

const count = (v) => Math.max(0, Math.round(+v) || 0);

/* ---------- o documento ----------
   o que não é ano, semestre ou trimestre some: os documentos antigos de mês e
   de semana, e o trimestre do plano antigo, que guardava um checklist em
   `goals` (um documento por período, sem número nenhum) */
export function normalize(d) {
  if (!d || !KINDS.includes(d.kind) || Array.isArray(d.goals)) return null;
  const period = String(d.period || "");
  if (!PERIOD_RE[d.kind].test(period)) return null;
  const source = SOURCE_IDS.includes(d.source) ? d.source : "manual";
  return {
    id: String(d.id || ""),
    kind: d.kind,
    period,
    text: String(d.text || "").replace(/\s+/g, " ").trim().slice(0, 140),
    source,
    target: source === "launched" ? 1 : count(d.target),
    current: source === "manual" ? count(d.current) : 0,
    done: !!d.done,
    createdAt: +d.createdAt || Date.now(),
    updatedAt: +d.updatedAt || +d.createdAt || Date.now()
  };
}

/* ---------- os períodos ---------- */
export function periodOf(day, kind) {
  const y = day.slice(0, 4), m = +day.slice(5, 7);
  if (kind === "year") return y;
  if (kind === "half") return y + "-H" + (m <= 6 ? 1 : 2);
  return y + "-Q" + Math.ceil(m / 3);
}

const LAST_DAY = { 3: "31", 6: "30", 9: "30", 12: "31" };
export function periodBounds(period) {
  const p = String(period || "");
  let m;
  if (/^\d{4}$/.test(p)) return { from: p + "-01-01", to: p + "-12-31" };
  if ((m = p.match(/^(\d{4})-H([12])$/))) return m[2] === "1" ? { from: m[1] + "-01-01", to: m[1] + "-06-30" } : { from: m[1] + "-07-01", to: m[1] + "-12-31" };
  if ((m = p.match(/^(\d{4})-Q([1-4])$/))) {
    const first = (+m[2] - 1) * 3 + 1, last = first + 2;
    return { from: m[1] + "-" + String(first).padStart(2, "0") + "-01", to: m[1] + "-" + String(last).padStart(2, "0") + "-" + LAST_DAY[last] };
  }
  return null;
}

export function shiftQuarter(period, n) {
  const [y, q] = period.split("-Q").map(Number);
  const total = y * 4 + (q - 1) + n;
  return Math.floor(total / 4) + "-Q" + ((total % 4) + 1);
}
/* o semestre e o ano que contêm um trimestre: é o que a página mostra acima */
export const halfOf = (quarter) => quarter.slice(0, 4) + "-H" + (+quarter.slice(-1) <= 2 ? 1 : 2);
export const yearOf = (period) => period.slice(0, 4);

/* "4º tri 2026": o rótulo do PeriodNav */
export const quarterLabel = (quarter) => quarter.slice(-1) + "º tri " + quarter.slice(0, 4);

export function goalPrefix(kind, period) {
  if (kind === "year") return "meta de " + yearOf(period);
  if (kind === "half") return "meta do " + period.slice(-1) + "º semestre";
  return "meta do " + period.slice(-1) + "º tri";
}

/* ---------- as metas de um período ---------- */
export function goalsOf(docs, kind, period) {
  return (docs || []).map((d) => (d && d.kind === kind && d.period === period ? normalize(d) : null))
    .filter(Boolean).sort((a, b) => a.createdAt - b.createdAt);
}
export const canAdd = (docs, kind, period) => goalsOf(docs, kind, period).length < LIMITS[kind];

/* ---------- a medida ----------
   `data` são as coleções cruas que a meta lê: { finance, clients, team }.
   coleção vazia é zero, e não erro. o time conta como a aba do time conta
   (activeTeam, team-data.js): quem saiu não entra */
const list = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
const inside = (day, b) => !!b && isDay(day) && day >= b.from && day <= b.to;

function measure(goal, data, period) {
  const d = data || {};
  const b = periodBounds(period);
  switch (goal.source) {
    case "clients": return list(d.clients).filter((c) => c.status === "active").length;
    /* só o livro da empresa, só o que entrou de fato, só dentro do período */
    case "revenue": return list(d.finance)
      .filter((e) => e.type === "entry" && e.kind === "in" && e.paid && bookOf(e.book) === "business" && inside(e.day, b))
      .reduce((s, e) => s + Math.abs(Math.round(+e.amount) || 0), 0);
    case "won": return list(d.clients).filter((c) => +c.wonAt > 0 && inside(dayOf(new Date(+c.wonAt)), b)).length;
    case "team": return activeTeam(list(d.team)).length;
    case "launched": return goal.done ? 1 : 0;
    default: return goal.current;
  }
}

const money = (cents) => brl(cents).replace(/,00$/, "");
const amount = (source, n) => (source === "revenue" ? money(n) : String(n));

export function progressOf(goal, data, period) {
  const value = measure(goal, data, period || goal.period);
  const target = goal.source === "launched" ? 1 : goal.target;
  return {
    value,
    target,
    pct: target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0,
    manual: goal.source === "manual",
    text: goal.source === "launched" ? (value ? "lançado" : "ainda não") : amount(goal.source, value) + "/" + amount(goal.source, target)
  };
}

/* o que a meta é, numa frase: "10 clientes ativos (hoje 6)". é a confirmação
   da conversa (D8), e por isso diz onde a meta está agora */
export function goalLine(goal, data) {
  const n = measure(goal, data, goal.period);
  const what = goal.source === "clients" ? goal.target + " clientes ativos (hoje " + n + ")"
    : goal.source === "revenue" ? "faturar " + money(goal.target) + " (hoje " + money(n) + ")"
    : goal.source === "won" ? goal.target + " leads fechados (hoje " + n + ")"
    : goal.source === "team" ? goal.target + " pessoas no time (hoje " + n + ")"
    : goal.source === "manual" ? (goal.text || "meta") + " (à mão)"
    : goal.text || "lançar";
  return goalPrefix(goal.kind, goal.period) + " · " + what;
}

/* ---------- o alvo como se escreve ----------
   o faturamento é dinheiro ("30.000", em centavos por dentro); o resto é
   um número inteiro */
export const readTarget = (text, source) => (source === "revenue" ? Math.max(0, parseMoney(text)) : count(String(text || "").replace(/\D/g, "")));
export const targetText = (target, source) => (!target ? "" : source === "revenue" ? money(target).replace(/^R\$\s?/, "") : String(target));

/* ---------- a meta nova ----------
   o período é o de hoje, a não ser que venha um (a página grava no trimestre
   que está aberto). período cheio não grava: "três já é muito" é a regra, e
   não um aviso */
export function goalDoc(spec, docs, today) {
  const s = spec || {};
  const kind = KINDS.includes(s.kind) ? s.kind : "quarter";
  const period = s.period && PERIOD_RE[kind].test(s.period) ? s.period : periodOf(today, kind);
  if (!canAdd(docs, kind, period)) {
    return { error: kind === "quarter" ? "três já é muito para um trimestre" : "já há uma " + goalPrefix(kind, period) + ": mude a de lá" };
  }
  const source = SOURCE_IDS.includes(s.source) ? s.source : "manual";
  const now = Date.now();
  const doc = normalize({
    id: newId(), kind, period, source,
    text: String(s.text || "").trim() || sourceLabel(source),
    target: s.target, current: s.current, done: false, createdAt: now, updatedAt: now
  });
  return { doc };
}
