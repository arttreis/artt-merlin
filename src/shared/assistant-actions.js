/* merlin · o que uma proposta do assistente vira quando confirmada
   logica pura, sem React: um actionType (do catalogo fechado que o worker
   ja valida em ASSISTANT_ACTIONS) e um payload viram um documento pronto
   para collection.save(). cada tipo aponta pra uma colecao que ja existe —
   o proprio normalize() dela, chamado na proxima leitura daquela pagina, e
   quem faz a validacao funda (arvore de mapa, no de funil etc.); aqui so
   se monta o documento minimo e se filtra o que o campo aceita. */
import { newId } from "./core.js";
import { journalEntry } from "./client-doc.js";
import { layoutNodes } from "./funnel-layout.js";

export const ACTION_COLLECTIONS = {
  task: "tasks",
  note: "notes",
  "routine-block": "routine",
  "lead-update": "clients",
  "onboarding-map": "maps",
  "onboarding-funnel": "funnels",
  script: "content",
  "wishlist-item": "wishlist"
};

export const ACTION_LABELS = {
  task: "nova tarefa",
  note: "nova nota",
  "routine-block": "novo bloco na rotina",
  "lead-update": "atualizar cliente",
  "onboarding-map": "novo mapa de onboarding",
  "onboarding-funnel": "novo funil de onboarding",
  script: "roteiro",
  "wishlist-item": "novo item na vitrine"
};

/* so os campos que fazem sentido editar antes de confirmar — o resto do
   payload (arvore do mapa, etapas do funil, id do cliente/conteudo) segue
   como a IA propos, sem virar campo de formulario */
export const ACTION_FIELDS = {
  task: [
    { key: "title", label: "título" },
    { key: "date", label: "data", type: "date" },
    { key: "min", label: "minutos", type: "number" },
    { key: "client", label: "cliente" }
  ],
  note: [
    { key: "title", label: "título" },
    { key: "body", label: "nota", type: "textarea" },
    { key: "client", label: "cliente" }
  ],
  "routine-block": [
    { key: "title", label: "título" },
    { key: "at", label: "horário (hh:mm)" },
    { key: "min", label: "minutos", type: "number" }
  ],
  "lead-update": [
    { key: "stage", label: "etapa" },
    { key: "temperature", label: "temperatura" },
    { key: "note", label: "nota (vira registro no histórico)", type: "textarea" }
  ],
  "onboarding-map": [{ key: "name", label: "nome" }],
  "onboarding-funnel": [{ key: "name", label: "nome" }],
  script: [{ key: "script", label: "roteiro", type: "textarea" }],
  "wishlist-item": [
    { key: "name", label: "nome" },
    { key: "qty", label: "quantidade" },
    { key: "bucket", label: "categoria" }
  ]
};

/* a linha extra debaixo do titulo do dialogo — o que da pra ver do payload
   sem abrir os campos, tipo "12/09/2026 · 30 min · cliente x" */
export function previewOf(actionType, payload) {
  const p = payload || {};
  switch (actionType) {
    case "task": return [p.date, p.min ? p.min + " min" : "", p.client].filter(Boolean).join(" · ");
    case "note": return p.client || "";
    case "routine-block": return [p.at, p.min ? p.min + " min" : ""].filter(Boolean).join(" · ");
    case "lead-update": return [p.stage, p.temperature].filter(Boolean).join(" · ");
    case "onboarding-map": return ((p.tree && p.tree.children) || []).length + " ramos";
    case "onboarding-funnel": return (p.stages || []).length + " etapas";
    case "script": return "entra no roteiro da peça de conteúdo";
    case "wishlist-item": return [p.qty, p.bucket].filter(Boolean).join(" · ");
    default: return "";
  }
}

export const hhmmToMin = (s) => {
  const m = String(s || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h >= 0 && h < 24 && mi >= 0 && mi < 60 ? h * 60 + mi : null;
};

/* monta o documento a partir do payload da IA + o que a pessoa editou no
   formulario (`v`, do useFields — so os campos de ACTION_FIELDS). `store` e
   a colecao alvo, ja aberta pelo chamador — so entra em uso para os dois
   tipos que EDITAM um documento existente em vez de criar um novo.
   devolve { doc } pra gravar, ou { error } quando falta uma referencia que
   a IA nao podia ter inventado (id de cliente, id de conteudo). */
export function buildDoc(actionType, payload, v, store) {
  const now = Date.now();
  const p = payload || {};
  switch (actionType) {
    case "task":
      return { doc: { id: newId(), title: v.title.trim(), date: v.date, min: +v.min || 0, client: v.client, done: false, createdAt: now, updatedAt: now } };
    case "note":
      return { doc: { id: newId(), title: v.title.trim(), body: v.body, client: v.client, stage: "seed", createdAt: now, updatedAt: now } };
    case "routine-block":
      return { doc: { id: newId(), title: v.title.trim(), days: Array.isArray(p.days) ? p.days : [], at: hhmmToMin(v.at), min: +v.min || 0, reserved: false, client: "", until: "", weeks: {}, createdAt: now, updatedAt: now } };
    case "lead-update": {
      const existing = p.id ? store.get(p.id) : null;
      if (!existing) return { error: "não achei esse cliente/prospecto" };
      const journal = Array.isArray(existing.journal) ? existing.journal.slice() : [];
      if (v.note && v.note.trim()) journal.push(journalEntry(v.note.trim(), "note"));
      return { doc: { ...existing, stage: v.stage || existing.stage, temperature: v.temperature || existing.temperature, journal, updatedAt: now } };
    }
    case "onboarding-map":
      return { doc: { id: newId(), name: v.name.trim(), root: p.tree && typeof p.tree === "object" ? p.tree : { title: v.name.trim() }, client: "", idea: "", funnel: "", createdAt: now, updatedAt: now } };
    case "onboarding-funnel": {
      const stages = Array.isArray(p.stages) ? p.stages : [];
      const nodes = stages.map((s) => ({ id: newId(), type: String((s && s.nodeType) || "custom"), title: String((s && s.title) || "").slice(0, 120), x: 0, y: 0, fields: {}, number: null, note: "" }));
      const edges = nodes.slice(1).map((n, i) => ({ id: newId(), from: nodes[i].id, to: n.id, label: "", avgRate: null }));
      return { doc: { id: newId(), name: v.name.trim(), client: "", channel: "", nodes: layoutNodes(nodes, edges), edges, creatives: [], automations: [], offers: [], triggers: [], period: { from: "", to: "" }, snapshots: [], createdAt: now, updatedAt: now } };
    }
    case "script": {
      const existing = p.contentId ? store.get(p.contentId) : null;
      if (!existing) return { error: "não achei essa peça de conteúdo" };
      return { doc: { ...existing, script: v.script, updatedAt: now } };
    }
    case "wishlist-item":
      return { doc: { id: newId(), type: "item", list: p.list || "", name: v.name.trim(), price: Math.round(Math.abs(+p.price)) || 0, url: "", photo: null, note: "", bought: null, bucket: v.bucket || "", qty: v.qty || "", order: now, createdAt: now, updatedAt: now } };
    default:
      return { error: "tipo de ação desconhecido" };
  }
}
