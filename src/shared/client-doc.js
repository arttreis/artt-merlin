/* merlin · o documento de cliente
 *
 * duas paginas gravam na colecao "clients": clientes (quem fechou) e
 * prospeccao (quem ainda esta no funil). o prospecto e o cliente sao o MESMO
 * documento em momentos diferentes — "fechou" so muda o status, e tudo que se
 * soube no funil continua ali quando ele vira cliente.
 *
 * por isso a forma mora aqui e nao em cada pagina. o normalizador de clientes
 * reconstruia o documento campo a campo: se a prospeccao tivesse o dela, cada
 * edicao numa tela apagaria em silencio os campos que so a outra conhece.
 *
 * sem React aqui: entra documento, sai documento.
 */
import { collection, newId, isDay, addDays } from "./core.js";
import { tasks, newTask, topOrder } from "./tasks.js";

/* ---------- status ----------
   prospect e o funil inteiro (a etapa diz onde). "proposal" era um status
   antigo, de quando nao havia etapa: vira prospect com etapa de proposta.
   lost e quem saiu do funil sem fechar — nao some, porque o motivo ensina. */
export const STATUSES = ["prospect", "active", "paused", "closed", "lost"];
export const STATUS_LABEL = { prospect: "prospecto", active: "ativo", paused: "pausado", closed: "encerrado", lost: "perdido" };
export const CLIENT_STATUSES = ["active", "paused", "closed"];
export const isPipeline = (c) => c.status === "prospect";
export const isClient = (c) => CLIENT_STATUSES.includes(c.status);

/* ---------- o funil ---------- */
export const STAGES = [
  { id: "lead", label: "lead" },
  { id: "qualified", label: "qualificado" },
  { id: "call", label: "call marcada" },
  { id: "proposal", label: "proposta enviada" },
  { id: "negotiation", label: "negociação" }
];
const STAGE_IDS = STAGES.map((s) => s.id);
export const stageLabel = (id) => (STAGES.find((s) => s.id === id) || {}).label || id;

export const TEMPERATURES = [
  { id: "hot", label: "quente" },
  { id: "warm", label: "morno" },
  { id: "cold", label: "frio" }
];
const TEMP_IDS = TEMPERATURES.map((t) => t.id);

export const SOURCES = ["indicação", "anúncio", "DM", "conteúdo", "evento", "networking", "outro"];

export const RECURRENCES = ["monthly", "project", "hourly", ""];
export const RECURRENCE_LABEL = { monthly: "mensal", project: "projeto", hourly: "hora" };

export const FILE_KINDS = ["contrato", "proposta", "briefing", "relatório", "nota fiscal", "outro"];
export function kindFromName(name) {
  const n = String(name || "").toLowerCase();
  if (/contrat/.test(n)) return "contrato";
  if (/propost/.test(n)) return "proposta";
  if (/brief/.test(n)) return "briefing";
  if (/relat/.test(n)) return "relatório";
  if (/\bnf\b|nota.?fiscal|nfe/.test(n)) return "nota fiscal";
  return "outro";
}

const list = (v) => (Array.isArray(v) ? v : []);
const text = (v, max) => String(v == null ? "" : v).slice(0, max);
const cents = (v) => Math.max(0, Math.round(+v) || 0);
const day = (v) => (isDay(v) ? v : "");

export function normalize(d) {
  d = d || {};
  const contract = d.contract || {};
  const proposal = d.proposal || {};
  const status = STATUSES.includes(d.status) ? d.status : "prospect";
  const legacyProposal = d.status === "proposal";
  return {
    /* o que nao e conhecido aqui atravessa intacto: um campo novo gravado por
       uma versao mais nova de outra aba nao pode morrer nesta */
    ...d,
    id: String(d.id),
    name: text(d.name, 120),
    status,
    brand: text(d.brand, 120),
    /* o texto livre do cliente. na ficha nova ele e a "pagina" — markdown —,
       e o nome antigo ficou porque e dado gravado */
    summary: String(d.summary || ""),
    whatsapp: text(d.whatsapp, 40),
    email: text(d.email, 120),
    instagram: text(d.instagram, 120),
    site: text(d.site, 300),
    contacts: list(d.contacts),
    links: list(d.links),
    contract: {
      scope: String(contract.scope || ""),
      value: Math.round(+contract.value) || 0,
      recurrence: RECURRENCES.includes(contract.recurrence) ? contract.recurrence : "",
      start: contract.start || "",
      end: contract.end || "",
      extras: String(contract.extras || "")
    },
    channels: list(d.channels).map((c) => ({ ...c, items: list(c.items) })),
    goals: list(d.goals).map((g) => ({ ...g, steps: list(g.steps) })),
    backlog: list(d.backlog),
    journal: list(d.journal),
    offers: list(d.offers),
    vault: { items: list(d.vault && d.vault.items) },
    /* contrato, proposta, nota fiscal: so o bilhete do R2, nunca o binario */
    files: list(d.files).map((f) => ({
      id: String(f.id || ""), name: text(f.name, 120), type: String(f.type || ""),
      size: +f.size || 0, at: +f.at || 0, kind: FILE_KINDS.includes(f.kind) ? f.kind : kindFromName(f.name)
    })).filter((f) => f.id),

    /* ---------- o funil ---------- */
    stage: STAGE_IDS.includes(d.stage) ? d.stage : (legacyProposal ? "proposal" : "lead"),
    stageAt: +d.stageAt || +d.createdAt || Date.now(),
    temperature: TEMP_IDS.includes(d.temperature) ? d.temperature : "warm",
    source: text(d.source, 40),
    referredBy: text(d.referredBy, 80),
    niche: text(d.niche, 80),
    sells: text(d.sells, 120),
    revenue: cents(d.revenue),        // faturamento por mes, em centavos
    ticket: cents(d.ticket),
    adBudget: cents(d.adBudget),
    team: text(d.team, 60),
    estimate: cents(d.estimate),      // quanto vale por mes, se fechar
    pain: String(d.pain || ""),
    proposal: {
      scope: String(proposal.scope || ""),
      value: cents(proposal.value),
      sentAt: day(proposal.sentAt),
      link: text(proposal.link, 500)
    },
    lostAt: +d.lostAt || 0,
    lostReason: text(d.lostReason, 300),
    wonAt: +d.wonAt || 0,

    /* ---------- o que move ----------
       uma frase e uma data. a data vira tarefa (ver syncNext), e e isso que
       tira o "proximo passo" do campo e o poe no calendario. */
    next: text(d.next, 200),
    nextDate: day(d.nextDate),

    ideaOrigin: d.ideaOrigin || "",
    createdAt: +d.createdAt || Date.now(),
    updatedAt: +d.updatedAt || Date.now()
  };
}

export const clientsStore = () => collection("clients", { normalize });

/* o registro do que aconteceu, com a data de agora */
export const journalEntry = (text, type = "event") => ({ id: newId(), at: Date.now(), type, text: String(text) });

/* ---------- o proximo passo no calendario ----------
   uma tarefa so por pessoa, achada pela origem. mudar a data move a tarefa;
   apagar a data apaga a tarefa; concluir a tarefa nao mexe no documento — o
   proximo passo seguinte e uma decisao, nao uma consequencia. */
export function syncNext(c) {
  const store = tasks();
  const found = store.all().find((t) => t.origin && t.origin.type === "next" && t.origin.id === c.id && !t.done);
  if (!c.nextDate || !(isPipeline(c) || c.status === "active" || c.status === "paused")) {
    if (found) store.remove(found.id);
    return;
  }
  const title = (c.next || "falar com") + " · " + (c.name || "sem nome");
  if (found) {
    if (found.title !== title || found.date !== c.nextDate) store.save({ ...found, title, date: c.nextDate, updatedAt: Date.now() });
    return;
  }
  store.save(newTask({ title, date: c.nextDate, min: 15, client: c.id, origin: { type: "next", id: c.id }, order: topOrder(store.all(), c.nextDate) }));
}

/* ---------- links de contato ---------- */
export const waUrl = (n) => { const d = String(n || "").replace(/\D/g, ""); return d ? "https://wa.me/" + (d.startsWith("55") ? d : "55" + d) : ""; };
export const igUrl = (h) => { const u = String(h || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, ""); return u ? "https://instagram.com/" + u : ""; };
export const siteUrl = (u) => { const s = String(u || "").trim(); return !s ? "" : /^https?:\/\//i.test(s) ? s : "https://" + s; };
export const daysSince = (ms, now = Date.now()) => Math.max(0, Math.floor((now - (+ms || now)) / 86400000));

/* ---------- ha quanto tempo ninguem fala com o cliente ----------
   a lista de clientes e o retrato do Merlin contam a mesma coisa: a conta mora
   aqui para as duas dizerem o mesmo "faz tempo". */
export const lastContact = (c) => c.journal.reduce((m, e) => Math.max(m, +e.at || 0), c.createdAt);
/* "faz tempo": so vale a pena avisar de quem esta ativo — cliente pausado
   ou encerrado nao precisa de contato, entao nao ganha o traço. */
export const isStale = (c, now = Date.now()) => c.status === "active" && (now - lastContact(c)) > 14 * 86400000;

/* ---------- o funil e os clientes, do jeito que o retrato le ----------
   o que as telas calculam cada uma por si (o cartao da prospeccao, o traço da
   lista) numa conta so, para o Merlin responder "quais leads estao parados?"
   sem abrir tela. `today` e o dia ("2026-10-19"), `now` os milissegundos de
   agora. perdido e encerrado ficam fora de tudo; pausado so entra no backlog.
   aceita documento cru: normaliza por dentro. */
const STUCK_DAYS = 7;
const SOON_DAYS = 7;
export function pipelineToday(clients, today, now = Date.now()) {
  const docs = list(clients).filter(Boolean).map(normalize);
  const leads = docs.filter(isPipeline);
  const byName = (a, b) => a.name.localeCompare(b.name, "pt-BR");
  const soon = addDays(today, SOON_DAYS);

  const backlog = [];
  docs.filter((c) => c.status === "active" || c.status === "paused").forEach((c) => {
    c.backlog.forEach((b) => {
      if (!b || b.done || !isDay(b.due) || b.due > soon) return;
      backlog.push({ id: String(b.id), clientId: c.id, client: c.name, text: String(b.text || ""), due: b.due, when: b.due < today ? "overdue" : b.due === today ? "today" : "soon" });
    });
  });

  return {
    stages: STAGES.map((s) => ({ id: s.id, label: s.label, count: leads.filter((c) => c.stage === s.id).length })),
    late: leads.filter((c) => c.nextDate && c.nextDate < today).sort((a, b) => a.nextDate.localeCompare(b.nextDate) || byName(a, b))
      .map((c) => ({ id: c.id, name: c.name, nextDate: c.nextDate })),
    noNext: leads.filter((c) => !c.nextDate).sort(byName).map((c) => ({ id: c.id, name: c.name })),
    stuck: leads.map((c) => ({ id: c.id, name: c.name, stage: c.stage, label: stageLabel(c.stage), days: daysSince(c.stageAt, now) }))
      .filter((c) => c.days >= STUCK_DAYS).sort((a, b) => b.days - a.days || byName(a, b)),
    stale: docs.filter((c) => isStale(c, now)).map((c) => ({ id: c.id, name: c.name, days: daysSince(lastContact(c), now) }))
      .sort((a, b) => b.days - a.days || byName(a, b)),
    backlog: backlog.sort((a, b) => a.due.localeCompare(b.due) || a.client.localeCompare(b.client, "pt-BR"))
  };
}
