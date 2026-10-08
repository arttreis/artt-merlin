/* merlin · o projeto de app
 *
 * o mapa mental servia para pensar solto, mas desenhar um app nele dava num
 * monte de caixa que nao sabia o que era: uma "tela" e uma "tabela" eram o
 * mesmo retangulo, e nada saia dali pronto para construir. o projeto de app e
 * o mesmo desenho com forma: o conceito, as funcionalidades com fase, as
 * entidades do banco com campos e relacoes, as telas com o que mostram e as
 * acoes que levam de uma para a outra.
 *
 * aqui fica so o que e puro: a forma do documento, o que esta faltando, o
 * arranjo no palco e as saidas (SQL, mermaid, markdown e o prompt para o
 * Claude Code). sem React e sem navegador — testado em node (app-spec.test.mjs).
 *
 * referencias sao por id (o campo aponta para a entidade, a acao para a
 * tela); o Merlin fala em nomes, e `fromBlueprint` resolve nome em id.
 */

export const PHASES = [
  { id: "mvp", label: "primeira versão" },
  { id: "later", label: "depois" },
  { id: "maybe", label: "talvez" }
];
const PHASE_IDS = PHASES.map((p) => p.id);
export const phaseLabel = (id) => (PHASES.find((p) => p.id === id) || PHASES[0]).label;

/* os tipos de campo falam a lingua de quem constroi, e cada um sabe o seu SQL.
   "ref" e a relacao: o campo guarda o id de uma linha de outra entidade. */
export const FIELD_TYPES = [
  { id: "uuid", label: "uuid", sql: "uuid" },
  { id: "text", label: "texto", sql: "text" },
  { id: "int", label: "inteiro", sql: "integer" },
  { id: "decimal", label: "decimal", sql: "numeric" },
  { id: "money", label: "dinheiro (centavos)", sql: "integer" },
  { id: "bool", label: "sim/não", sql: "boolean" },
  { id: "date", label: "data", sql: "date" },
  { id: "timestamp", label: "data e hora", sql: "timestamptz" },
  { id: "email", label: "e-mail", sql: "text" },
  { id: "enum", label: "lista fixa", sql: "text" },
  { id: "json", label: "json", sql: "jsonb" },
  { id: "file", label: "arquivo (url)", sql: "text" },
  { id: "ref", label: "relação →", sql: "uuid" }
];
const TYPE_IDS = FIELD_TYPES.map((t) => t.id);
export const typeLabel = (id) => (FIELD_TYPES.find((t) => t.id === id) || FIELD_TYPES[1]).label;

/* o tamanho de cada coisa no palco. a entidade cresce com os campos. */
export const ENTITY_W = 240, FIELD_H = 26, ENTITY_HEAD = 40;
export const SCREEN_W = 230, SCREEN_H = 128;
export const entityHeight = (e) => ENTITY_HEAD + Math.max(1, e.fields.length) * FIELD_H + 10;

const str = (v, n) => String(v == null ? "" : v).slice(0, n);
const num = (v) => (Number.isFinite(+v) ? Math.round(+v) : 0);
const list = (v) => (Array.isArray(v) ? v : []);

/* ---------- a forma do documento ---------- */
function normalizeField(raw, makeId) {
  const f = raw && typeof raw === "object" ? raw : {};
  const type = TYPE_IDS.includes(f.type) ? f.type : "text";
  return {
    id: f.id ? String(f.id) : makeId(),
    name: str(f.name, 60),
    type,
    pk: !!f.pk,
    required: !!f.required,
    unique: !!f.unique,
    /* so a relacao aponta; os outros tipos nunca carregam um alvo esquecido */
    ref: type === "ref" ? str(f.ref, 40) : "",
    /* as opcoes da lista fixa, separadas por virgula */
    options: type === "enum" ? str(f.options, 300) : "",
    note: str(f.note, 200)
  };
}
function normalizeEntity(raw, makeId) {
  const e = raw && typeof raw === "object" ? raw : {};
  return {
    id: e.id ? String(e.id) : makeId(),
    name: str(e.name, 60) || "entidade",
    note: str(e.note, 600),
    x: num(e.x), y: num(e.y),
    fields: list(e.fields).slice(0, 80).map((f) => normalizeField(f, makeId))
  };
}
function normalizeScreen(raw, makeId) {
  const s = raw && typeof raw === "object" ? raw : {};
  return {
    id: s.id ? String(s.id) : makeId(),
    name: str(s.name, 60) || "tela",
    goal: str(s.goal, 300),
    /* o que a tela tem, uma coisa por linha: "lista de pedidos", "botão pagar" */
    parts: str(s.parts, 2000),
    entities: [...new Set(list(s.entities).map(String))].slice(0, 30),
    start: !!s.start,
    x: num(s.x), y: num(s.y)
  };
}
function normalizeFeature(raw, makeId) {
  const f = raw && typeof raw === "object" ? raw : {};
  return {
    id: f.id ? String(f.id) : makeId(),
    title: str(f.title, 200),
    note: str(f.note, 600),
    phase: PHASE_IDS.includes(f.phase) ? f.phase : "mvp",
    done: !!f.done
  };
}

export function normalizeApp(raw, makeId) {
  const d = raw && typeof raw === "object" ? raw : {};
  const entities = list(d.entities).slice(0, 120).map((e) => normalizeEntity(e, makeId));
  const screens = list(d.screens).slice(0, 200).map((s) => normalizeScreen(s, makeId));
  const screenIds = new Set(screens.map((s) => s.id));
  return {
    id: d.id,
    name: str(d.name, 120) || "app sem nome",
    pitch: str(d.pitch, 300),
    problem: str(d.problem, 3000),
    audience: str(d.audience, 3000),
    value: str(d.value, 3000),
    stack: str(d.stack, 3000),
    notes: str(d.notes, 20000),
    features: list(d.features).slice(0, 300).map((f) => normalizeFeature(f, makeId)).filter((f) => f.title),
    entities,
    screens,
    /* acao que perdeu uma das pontas nao tem o que desenhar: sai */
    flows: list(d.flows).slice(0, 600).map((f) => ({
      id: f && f.id ? String(f.id) : makeId(),
      from: str(f && f.from, 40), to: str(f && f.to, 40),
      action: str(f && f.action, 120)
    })).filter((f) => screenIds.has(f.from) && screenIds.has(f.to)),
    funnel: str(d.funnel, 40),
    client: str(d.client, 40),
    createdAt: +d.createdAt || Date.now(),
    updatedAt: +d.updatedAt || +d.createdAt || Date.now()
  };
}

/* ---------- nomes de banco ----------
   "Pedido de compra" vira pedido_de_compra: sem acento, sem espaco, sem
   comecar por numero. a tabela e o nome da entidade, no singular que a
   pessoa escreveu — o projeto nao inventa plural em portugues. */
export function snake(text) {
  const s = String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return !s ? "sem_nome" : /^[0-9]/.test(s) ? "_" + s : s;
}

const entityById = (app) => new Map(app.entities.map((e) => [e.id, e]));
const screenById = (app) => new Map(app.screens.map((s) => [s.id, s]));
/* o campo de relacao vira <nome>_id quando a pessoa escreveu so "cliente" */
const columnOf = (f) => {
  const c = snake(f.name);
  return f.type === "ref" && !/_id$/.test(c) ? c + "_id" : c;
};
const pkOf = (e) => e.fields.find((f) => f.pk) || null;

/* ---------- o que esta faltando ----------
   nao e erro que impede salvar: e a lista que a aba de exportar mostra antes
   de entregar a especificacao, para ninguem descobrir no meio da obra. */
export function problemsOf(app) {
  const out = [];
  const ents = entityById(app);
  if (!app.pitch.trim()) out.push({ where: "conceito", text: "falta a frase que explica o app" });
  if (!app.features.some((f) => f.phase === "mvp")) out.push({ where: "conceito", text: "nenhuma funcionalidade marcada como primeira versão" });
  if (!app.entities.length) out.push({ where: "dados", text: "nenhuma entidade no banco" });
  const seen = new Map();
  app.entities.forEach((e) => {
    const k = snake(e.name);
    if (seen.has(k)) out.push({ where: "dados", text: "duas entidades viram a mesma tabela: " + k });
    seen.set(k, e);
    if (!e.fields.length) out.push({ where: "dados", text: e.name + " não tem campos" });
    const cols = new Set();
    e.fields.forEach((f) => {
      if (!f.name.trim()) out.push({ where: "dados", text: e.name + " tem um campo sem nome" });
      const c = columnOf(f);
      if (f.name.trim() && cols.has(c)) out.push({ where: "dados", text: e.name + " tem dois campos " + c });
      cols.add(c);
      if (f.type === "ref" && !ents.has(f.ref)) out.push({ where: "dados", text: e.name + "." + (f.name || "?") + " não aponta para nenhuma entidade" });
      if (f.type === "enum" && !f.options.trim()) out.push({ where: "dados", text: e.name + "." + (f.name || "?") + " é lista fixa sem opções" });
    });
  });
  if (!app.screens.length) out.push({ where: "fluxos", text: "nenhuma tela desenhada" });
  else {
    const starts = app.screens.filter((s) => s.start);
    if (!starts.length) out.push({ where: "fluxos", text: "nenhuma tela marcada como entrada" });
    else {
      const lost = unreachable(app);
      if (lost.length) out.push({ where: "fluxos", text: "sem caminho a partir da entrada: " + lost.map((s) => s.name).join(", ") });
    }
    app.screens.forEach((s) => {
      s.entities.forEach((id) => { if (!ents.has(id)) out.push({ where: "fluxos", text: s.name + " usa uma entidade que não existe mais" }); });
    });
  }
  return out;
}

/* as telas a que nenhum caminho leva, saindo das telas de entrada */
export function unreachable(app) {
  const starts = app.screens.filter((s) => s.start).map((s) => s.id);
  const seen = new Set(starts);
  const queue = [...starts];
  while (queue.length) {
    const at = queue.shift();
    app.flows.forEach((f) => { if (f.from === at && !seen.has(f.to)) { seen.add(f.to); queue.push(f.to); } });
  }
  return app.screens.filter((s) => !seen.has(s.id));
}

/* ---------- o palco ----------
   entidades: as que mais sao apontadas ficam a esquerda (sao a base), as que
   apontam ficam a direita. telas: camadas pelo caminho a partir da entrada.
   devolve copias: o documento nunca muda no lugar. */
function layers(ids, edges) {
  const depth = new Map(ids.map((id) => [id, 0]));
  /* relaxa no maximo n vezes: ciclo nao vira laco infinito */
  for (let i = 0; i < ids.length; i++) {
    let moved = false;
    edges.forEach(([a, b]) => {
      if (a === b || !depth.has(a) || !depth.has(b)) return;
      if (depth.get(b) < depth.get(a) + 1 && depth.get(a) + 1 < ids.length) { depth.set(b, depth.get(a) + 1); moved = true; }
    });
    if (!moved) break;
  }
  return depth;
}
function place(items, depth, w, h, gapX, gapY) {
  const cols = new Map();
  items.forEach((it) => {
    const c = depth.get(it.id) || 0;
    if (!cols.has(c)) cols.set(c, []);
    cols.get(c).push(it);
  });
  const out = new Map();
  [...cols.keys()].sort((a, b) => a - b).forEach((c) => {
    let y = 0;
    cols.get(c).forEach((it) => { out.set(it.id, { x: c * (w + gapX), y }); y += h(it) + gapY; });
  });
  return out;
}
export function layoutEntities(entities) {
  /* a seta vai de quem e apontado para quem aponta: cliente -> pedido */
  const edges = [];
  entities.forEach((e) => e.fields.forEach((f) => { if (f.type === "ref" && f.ref) edges.push([f.ref, e.id]); }));
  const at = place(entities, layers(entities.map((e) => e.id), edges), ENTITY_W, entityHeight, 90, 40);
  return entities.map((e) => ({ ...e, ...at.get(e.id) }));
}
export function layoutScreens(screens, flows) {
  /* a coluna e a distancia a partir da entrada, pelo caminho mais curto: e
     assim que a pessoa le o app. a ida e volta entre duas telas (agenda ->
     novo -> agenda) nao empurra ninguem para a direita. o que nenhum caminho
     alcanca fica na primeira coluna, embaixo — e a aba exportar avisa. */
  const depth = new Map();
  const queue = screens.filter((s) => s.start).map((s) => s.id);
  queue.forEach((id) => depth.set(id, 0));
  while (queue.length) {
    const at = queue.shift();
    flows.forEach((f) => {
      if (f.from === at && !depth.has(f.to)) { depth.set(f.to, depth.get(at) + 1); queue.push(f.to); }
    });
  }
  const ordered = screens.filter((s) => depth.has(s.id)).concat(screens.filter((s) => !depth.has(s.id)));
  const at = place(ordered, depth, SCREEN_W, () => SCREEN_H, 110, 36);
  return screens.map((s) => ({ ...s, ...at.get(s.id) }));
}

/* ---------- o que o Merlin rascunha ----------
   a IA fala em nomes ("pedido.cliente aponta para Cliente"); aqui o nome
   vira id, o que nao fecha e descartado em silencio e o palco e arrumado.
   devolve as partes do documento, nao o documento: quem chama decide se
   cria um app novo ou junta com o que ja existe. */
export function fromBlueprint(data, makeId) {
  const b = data && typeof data === "object" ? data : {};
  const key = (s) => snake(s);
  const entities = list(b.entities).slice(0, 60).map((e) => normalizeEntity({
    name: e && e.name, note: e && e.note,
    fields: list(e && e.fields).map((f) => ({ ...f, ref: "" , refName: f && f.ref }))
  }, makeId));
  const byName = new Map(entities.map((e) => [key(e.name), e.id]));
  list(b.entities).slice(0, 60).forEach((raw, i) => {
    list(raw && raw.fields).slice(0, 80).forEach((f, j) => {
      const field = entities[i].fields[j];
      if (!field) return;
      const target = f && f.ref ? byName.get(key(f.ref)) : null;
      if (target) { field.type = "ref"; field.ref = target; }
      else if (field.type === "ref") field.type = "uuid";
    });
  });
  const screens = list(b.screens).slice(0, 80).map((s) => normalizeScreen({
    name: s && s.name, goal: s && s.goal, start: s && s.start,
    parts: Array.isArray(s && s.parts) ? s.parts.map((p) => str(p, 120)).join("\n") : s && s.parts,
    entities: list(s && s.entities).map((n) => byName.get(key(n))).filter(Boolean)
  }, makeId));
  if (screens.length && !screens.some((s) => s.start)) screens[0].start = true;
  const screenByName = new Map(screens.map((s) => [key(s.name), s.id]));
  const flows = list(b.flows).slice(0, 200).map((f) => ({
    id: makeId(),
    from: screenByName.get(key(f && f.from)) || "",
    to: screenByName.get(key(f && f.to)) || "",
    action: str(f && f.action, 120)
  })).filter((f) => f.from && f.to);
  return {
    pitch: str(b.pitch, 300),
    problem: str(b.problem, 3000),
    audience: str(b.audience, 3000),
    value: str(b.value, 3000),
    stack: str(b.stack, 3000),
    features: list(b.features).slice(0, 60).map((f) => normalizeFeature(f, makeId)).filter((f) => f.title),
    entities: layoutEntities(entities),
    screens: layoutScreens(screens, flows),
    flows
  };
}

/* juntar o rascunho a um projeto que ja tem coisa: o que a pessoa escreveu
   ganha sempre. campo de conceito so e preenchido se estava vazio; entidade e
   tela com o mesmo nome nao entram de novo (e o que apontava para a do
   rascunho passa a apontar para a que ja existia); o que e novo entra a
   direita do que ja esta no palco, para nao cair por cima. */
export function mergeDraft(app, parts) {
  const fill = (k) => (app[k].trim() ? app[k] : parts[k] || "");
  const right = (items, w) => (items.length ? Math.max(...items.map((i) => i.x + w)) + 140 : 0);

  const entityKey = new Map(app.entities.map((e) => [snake(e.name), e.id]));
  const entityAlias = new Map();
  const newEntities = [];
  parts.entities.forEach((e) => {
    const same = entityKey.get(snake(e.name));
    if (same) entityAlias.set(e.id, same); else newEntities.push(e);
  });
  const ent = (id) => entityAlias.get(id) || id;
  const dxE = right(app.entities, ENTITY_W);
  const entities = app.entities.concat(newEntities.map((e) => ({
    ...e, x: e.x + dxE,
    fields: e.fields.map((f) => (f.type === "ref" ? { ...f, ref: ent(f.ref) } : f))
  })));

  const screenKey = new Map(app.screens.map((s) => [snake(s.name), s.id]));
  const screenAlias = new Map();
  const newScreens = [];
  parts.screens.forEach((s) => {
    const same = screenKey.get(snake(s.name));
    if (same) screenAlias.set(s.id, same); else newScreens.push(s);
  });
  const scr = (id) => screenAlias.get(id) || id;
  const hasStart = app.screens.some((s) => s.start);
  const dxS = right(app.screens, SCREEN_W);
  const screens = app.screens.concat(newScreens.map((s) => ({
    ...s, x: s.x + dxS, start: hasStart ? false : s.start,
    entities: [...new Set(s.entities.map(ent))]
  })));

  const flowKey = (f) => f.from + ">" + f.to + ">" + f.action.trim().toLowerCase();
  const seenFlows = new Set(app.flows.map(flowKey));
  const flows = app.flows.slice();
  parts.flows.forEach((f) => {
    const g = { ...f, from: scr(f.from), to: scr(f.to) };
    if (!seenFlows.has(flowKey(g))) { seenFlows.add(flowKey(g)); flows.push(g); }
  });

  const seenFeatures = new Set(app.features.map((f) => f.title.trim().toLowerCase()));
  const features = app.features.concat(parts.features.filter((f) => !seenFeatures.has(f.title.trim().toLowerCase())));

  return {
    ...app,
    pitch: fill("pitch"), problem: fill("problem"), audience: fill("audience"), value: fill("value"), stack: fill("stack"),
    features, entities, screens, flows
  };
}

/* ---------- as saidas ---------- */

/* SQL de Postgres (Supabase, Neon): e o banco que um app novo usa por padrao.
   a ordem das tabelas respeita as relacoes, para o arquivo rodar de uma vez;
   o que forma ciclo vira ALTER TABLE no fim. */
export function toSQL(app) {
  const ents = entityById(app);
  const order = [];
  const done = new Set();
  const visiting = new Set();
  const late = [];
  const visit = (e) => {
    if (done.has(e.id) || visiting.has(e.id)) return;
    visiting.add(e.id);
    e.fields.forEach((f) => { if (f.type === "ref" && ents.has(f.ref) && f.ref !== e.id) visit(ents.get(f.ref)); });
    visiting.delete(e.id);
    done.add(e.id);
    order.push(e);
  };
  app.entities.forEach(visit);
  const created = new Set();
  const blocks = order.map((e) => {
    const table = snake(e.name);
    const lines = [];
    if (!pkOf(e)) lines.push("  id uuid primary key default gen_random_uuid()");
    e.fields.forEach((f) => {
      const t = FIELD_TYPES.find((x) => x.id === f.type) || FIELD_TYPES[1];
      let line = "  " + columnOf(f) + " " + t.sql;
      if (f.pk) line += " primary key" + (f.type === "uuid" ? " default gen_random_uuid()" : "");
      else {
        if (f.required) line += " not null";
        if (f.unique) line += " unique";
        /* o carimbo de criacao se preenche sozinho: ninguem escreve a hora a mao */
        if (f.type === "timestamp" && /^(created|updated)_at$/.test(columnOf(f))) line += " default now()";
      }
      if (f.type === "ref" && ents.has(f.ref)) {
        const target = ents.get(f.ref);
        const ref = "references " + snake(target.name) + "(" + (pkOf(target) ? columnOf(pkOf(target)) : "id") + ")";
        if (created.has(target.id) || target.id === e.id) line += " " + ref;
        else late.push("alter table " + table + " add foreign key (" + columnOf(f) + ") " + ref + ";");
      }
      if (f.type === "enum" && f.options.trim()) {
        const opts = f.options.split(",").map((o) => o.trim()).filter(Boolean).map((o) => "'" + o.replace(/'/g, "''") + "'");
        line += " check (" + columnOf(f) + " in (" + opts.join(", ") + "))";
      }
      lines.push(line);
    });
    created.add(e.id);
    const head = e.note.trim() ? "-- " + e.note.trim().replace(/\s*\n\s*/g, " ") + "\n" : "";
    return head + "create table " + table + " (\n" + lines.join(",\n") + "\n);";
  });
  return ["-- " + app.name + " · gerado pelo Merlin", ...blocks, ...late].join("\n\n") + "\n";
}

/* o erDiagram do mermaid: as tabelas e, para cada relacao, "muitos daqui
   para um de la". o nome no mermaid nao aceita acento nem espaco. */
export function toMermaidER(app) {
  const ents = entityById(app);
  const out = ["erDiagram"];
  app.entities.forEach((e) => e.fields.forEach((f) => {
    if (f.type !== "ref" || !ents.has(f.ref)) return;
    out.push("  " + snake(ents.get(f.ref).name) + ' ||--o{ ' + snake(e.name) + ' : "' + columnOf(f) + '"');
  }));
  app.entities.forEach((e) => {
    out.push("  " + snake(e.name) + " {");
    if (!pkOf(e)) out.push("    uuid id PK");
    e.fields.forEach((f) => {
      const t = (FIELD_TYPES.find((x) => x.id === f.type) || FIELD_TYPES[1]).sql;
      const keys = [f.pk ? "PK" : "", f.type === "ref" ? "FK" : "", f.unique && !f.pk ? "UK" : ""].filter(Boolean).join(",");
      out.push("    " + t + " " + columnOf(f) + (keys ? " " + keys : ""));
    });
    out.push("  }");
  });
  return out.join("\n") + "\n";
}

/* o fluxo das telas: cada tela um no, cada acao uma seta com o gesto escrito */
export function toMermaidFlow(app) {
  const ids = new Map(app.screens.map((s, i) => [s.id, "t" + (i + 1)]));
  const label = (t) => String(t).replace(/["\[\]{}|<>]/g, " ").trim() || " ";
  const out = ["flowchart LR"];
  app.screens.forEach((s) => out.push("  " + ids.get(s.id) + (s.start ? '(["' : '["') + label(s.name) + (s.start ? '"])' : '"]')));
  app.flows.forEach((f) => out.push("  " + ids.get(f.from) + (f.action.trim() ? ' -- "' + label(f.action) + '" --> ' : " --> ") + ids.get(f.to)));
  return out.join("\n") + "\n";
}

const para = (title, text) => (String(text || "").trim() ? "## " + title + "\n\n" + String(text).trim() + "\n" : "");

/* a especificacao inteira, em markdown: e o documento que se entrega a quem
   vai construir — gente ou IA. */
export function toMarkdown(app) {
  const ents = entityById(app);
  const scr = screenById(app);
  const parts = ["# " + app.name + "\n"];
  if (app.pitch.trim()) parts.push("> " + app.pitch.trim() + "\n");
  parts.push(para("Problema", app.problem), para("Para quem", app.audience), para("Proposta de valor", app.value), para("Stack", app.stack));
  if (app.features.length) {
    const lines = ["## Funcionalidades\n"];
    PHASES.forEach((p) => {
      const fs = app.features.filter((f) => f.phase === p.id);
      if (!fs.length) return;
      lines.push("### " + p.label[0].toUpperCase() + p.label.slice(1) + "\n");
      fs.forEach((f) => lines.push("- [" + (f.done ? "x" : " ") + "] **" + f.title + "**" + (f.note.trim() ? " — " + f.note.trim() : "")));
      lines.push("");
    });
    parts.push(lines.join("\n"));
  }
  if (app.entities.length) {
    const lines = ["## Banco de dados\n"];
    app.entities.forEach((e) => {
      lines.push("### " + e.name + " (`" + snake(e.name) + "`)\n");
      if (e.note.trim()) lines.push(e.note.trim() + "\n");
      lines.push("| campo | tipo | regras |", "| --- | --- | --- |");
      if (!pkOf(e)) lines.push("| `id` | uuid | chave |");
      e.fields.forEach((f) => {
        const rules = [
          f.pk ? "chave" : "", f.required ? "obrigatório" : "", f.unique ? "único" : "",
          f.type === "ref" && ents.has(f.ref) ? "→ " + ents.get(f.ref).name : "",
          f.type === "enum" && f.options.trim() ? "um de: " + f.options.trim() : "",
          f.note.trim()
        ].filter(Boolean).join("; ");
        lines.push("| `" + columnOf(f) + "` | " + typeLabel(f.type) + " | " + (rules || "—").replace(/\|/g, "/") + " |");
      });
      lines.push("");
    });
    lines.push("```mermaid\n" + toMermaidER(app) + "```\n");
    parts.push(lines.join("\n"));
  }
  if (app.screens.length) {
    const lines = ["## Telas e fluxos\n"];
    app.screens.forEach((s) => {
      lines.push("### " + s.name + (s.start ? " (entrada)" : "") + "\n");
      if (s.goal.trim()) lines.push(s.goal.trim() + "\n");
      const items = s.parts.split("\n").map((p) => p.trim()).filter(Boolean);
      if (items.length) lines.push(items.map((p) => "- " + p).join("\n") + "\n");
      const used = s.entities.map((id) => ents.get(id)).filter(Boolean).map((e) => e.name);
      if (used.length) lines.push("Dados: " + used.join(", ") + "\n");
      const out = app.flows.filter((f) => f.from === s.id).map((f) => "- " + (f.action.trim() || "segue") + " → " + scr.get(f.to).name);
      if (out.length) lines.push("Ações:\n" + out.join("\n") + "\n");
    });
    lines.push("```mermaid\n" + toMermaidFlow(app) + "```\n");
    parts.push(lines.join("\n"));
  }
  parts.push(para("Notas", app.notes));
  return parts.filter(Boolean).join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/* o pedido pronto para colar no Claude Code: a especificacao inteira e o
   jeito de trabalhar — primeira versao antes, uma coisa de cada vez. */
export function toPrompt(app) {
  return [
    "Vamos construir o app abaixo. A especificação foi desenhada no Merlin e é a fonte da verdade: se algo nela estiver ambíguo ou contraditório, pergunte antes de decidir.",
    "",
    "Como trabalhar:",
    "1. Leia a especificação inteira e proponha a estrutura do projeto e a stack (se não estiver definida) antes de escrever código.",
    "2. Construa só o que está em \"primeira versão\". O que está em \"depois\" e \"talvez\" não entra agora, mas o banco não deve impedir que entre.",
    "3. Comece pelo banco (o SQL abaixo é o ponto de partida), depois as telas na ordem do fluxo, a partir da entrada.",
    "4. Ao fim de cada tela, diga como testar o que foi feito.",
    "",
    "---",
    "",
    toMarkdown(app),
    "## SQL inicial (Postgres)",
    "",
    "```sql",
    toSQL(app).trim(),
    "```",
    ""
  ].join("\n");
}

/* o resumo que vai para o Merlin quando ele revisa o projeto: curto, porque
   o pedido tem teto e a especificacao inteira pode ser grande */
export function digestOf(app) {
  return toMarkdown(app).slice(0, 9000);
}
