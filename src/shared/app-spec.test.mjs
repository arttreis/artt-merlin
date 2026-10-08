/* merlin · testes do projeto de app (shared/app-spec.js)
   puro: roda em node, sem navegador. `node src/shared/app-spec.test.mjs` */
import {
  normalizeApp, snake, problemsOf, unreachable, layoutEntities, layoutScreens,
  fromBlueprint, mergeDraft, toSQL, toMermaidER, toMermaidFlow, toMarkdown, toPrompt
} from "./app-spec.js";

let ok = 0, bad = 0;
const check = (name, cond, extra) => {
  if (cond) ok++;
  else { bad++; console.log("✗ " + name + (extra ? " — " + extra : "")); }
};
let n = 0;
const makeId = () => "id" + (++n);

/* ---- forma ---- */
const empty = normalizeApp({ id: "a" }, makeId);
check("app vazio ganha nome", empty.name === "app sem nome");
check("app vazio tem listas", Array.isArray(empty.entities) && Array.isArray(empty.screens) && Array.isArray(empty.flows) && Array.isArray(empty.features));
const odd = normalizeApp({ id: "a", features: [{ title: "x", phase: "inventada" }, { title: "" }],
  entities: [{ name: "E", fields: [{ name: "f", type: "nada", ref: "z" }, { name: "g", type: "text", ref: "z" }] }] }, makeId);
check("fase desconhecida vira primeira versão", odd.features[0].phase === "mvp");
check("funcionalidade sem título sai", odd.features.length === 1);
check("tipo desconhecido vira texto", odd.entities[0].fields[0].type === "text");
check("campo que não é relação não guarda alvo", odd.entities[0].fields[1].ref === "");
const lostFlow = normalizeApp({ id: "a", screens: [{ id: "s1", name: "a" }], flows: [{ from: "s1", to: "s9" }] }, makeId);
check("ação com ponta perdida sai", lostFlow.flows.length === 0);

/* ---- nomes ---- */
check("snake tira acento e espaço", snake("Pedido de Compra") === "pedido_de_compra");
check("snake não começa por número", snake("2fa") === "_2fa");
check("snake de nada", snake("  ") === "sem_nome");

/* ---- um app de verdade ---- */
const app = normalizeApp({
  id: "app1", name: "Loja", pitch: "vender sem planilha",
  features: [{ title: "catálogo", phase: "mvp" }, { title: "cupom", phase: "later" }],
  entities: [
    { id: "pedido", name: "Pedido", fields: [
      { name: "cliente", type: "ref", ref: "cliente", required: true },
      { name: "status", type: "enum", options: "aberto, pago, d'água" },
      { name: "total", type: "money" }
    ] },
    { id: "cliente", name: "Cliente", note: "quem compra", fields: [{ name: "e-mail", type: "email", unique: true, required: true }] }
  ],
  screens: [
    { id: "s1", name: "Entrar", start: true, entities: ["cliente"] },
    { id: "s2", name: "Catálogo", parts: "lista de produtos\nbusca" },
    { id: "s3", name: "Perdida" }
  ],
  flows: [{ from: "s1", to: "s2", action: "fez login" }]
}, makeId);

const sql = toSQL(app);
check("SQL cria a tabela apontada antes de quem aponta", sql.indexOf("create table cliente") < sql.indexOf("create table pedido"), sql);
check("SQL põe id quando não há chave", /create table cliente \(\n  id uuid primary key default gen_random_uuid\(\)/.test(sql), sql);
check("SQL nomeia a relação com _id", /cliente_id uuid not null references cliente\(id\)/.test(sql), sql);
check("SQL vira check na lista fixa e escapa aspas", /check \(status in \('aberto', 'pago', 'd''água'\)\)/.test(sql), sql);
check("SQL leva a nota como comentário", /-- quem compra\ncreate table cliente/.test(sql));
check("SQL marca único", /e_mail text not null unique/.test(sql), sql);

const stamped = toSQL(normalizeApp({ id: "t", entities: [{ name: "Log", fields: [{ name: "created_at", type: "timestamp", required: true }, { name: "quando", type: "timestamp" }] }] }, makeId));
check("created_at ganha default now()", /created_at timestamptz not null default now\(\)/.test(stamped) && !/quando timestamptz default/.test(stamped), stamped);

/* ciclo: a referência que não cabe vira ALTER no fim */
const cyc = normalizeApp({ id: "c", entities: [
  { id: "a", name: "A", fields: [{ name: "b", type: "ref", ref: "b" }] },
  { id: "b", name: "B", fields: [{ name: "a", type: "ref", ref: "a" }] }
] }, makeId);
const cycSql = toSQL(cyc);
check("ciclo vira alter table", /alter table \w+ add foreign key/.test(cycSql), cycSql);
check("ciclo cria as duas tabelas", (cycSql.match(/create table/g) || []).length === 2);
const self = normalizeApp({ id: "s", entities: [{ id: "a", name: "Pasta", fields: [{ name: "mãe", type: "ref", ref: "a" }] }] }, makeId);
check("relação consigo mesma vai inline", /mae_id uuid references pasta\(id\)/.test(toSQL(self)), toSQL(self));

const er = toMermaidER(app);
check("erDiagram tem a relação", /cliente \|\|--o\{ pedido : "cliente_id"/.test(er), er);
check("erDiagram tem a chave implícita", /uuid id PK/.test(er));
check("erDiagram marca FK", /uuid cliente_id FK/.test(er), er);

const flow = toMermaidFlow(app);
check("fluxo desenha a entrada arredondada", /t1\(\["Entrar"\]\)/.test(flow), flow);
check("fluxo leva o gesto", /t1 -- "fez login" --> t2/.test(flow), flow);

/* ---- o que falta ---- */
const probs = problemsOf(app).map((p) => p.text);
check("acusa tela sem caminho", probs.some((t) => /Perdida/.test(t)), probs.join(" | "));
check("não acusa o que está certo", !probs.some((t) => /primeira versão|entidade no banco|frase/.test(t)), probs.join(" | "));
check("unreachable acha a tela solta", unreachable(app).map((s) => s.id).join() === "s3");
const broken = normalizeApp({ id: "b", entities: [{ name: "X", fields: [{ name: "y", type: "ref", ref: "sumiu" }, { name: "z", type: "enum" }] }, { name: "x", fields: [] }] }, makeId);
const bp = problemsOf(broken).map((p) => p.text).join(" | ");
check("acusa relação sem alvo", /não aponta/.test(bp), bp);
check("acusa lista fixa sem opções", /sem opções/.test(bp), bp);
check("acusa tabela repetida", /mesma tabela/.test(bp), bp);
check("acusa entidade sem campos", /não tem campos/.test(bp), bp);
check("acusa falta de tela", /nenhuma tela/.test(bp), bp);

/* ---- palco ---- */
const placed = layoutEntities(app.entities);
const px = Object.fromEntries(placed.map((e) => [e.id, e.x]));
check("quem é apontado fica à esquerda", px.cliente < px.pedido, JSON.stringify(px));
const sp = layoutScreens(app.screens, app.flows);
const sx = Object.fromEntries(sp.map((s) => [s.id, s.x]));
check("a entrada fica na primeira coluna", sx.s1 === 0 && sx.s2 > 0, JSON.stringify(sx));
const loop = layoutScreens(
  [{ id: "a", start: true, name: "a" }, { id: "b", name: "b" }],
  [{ from: "a", to: "b" }, { from: "b", to: "a" }]
);
const round = layoutScreens(
  [{ id: "in", start: true, name: "entrar" }, { id: "ag", name: "agenda" }, { id: "nv", name: "novo" }],
  [{ from: "in", to: "ag" }, { from: "ag", to: "nv" }, { from: "nv", to: "ag" }]
);
const rx = Object.fromEntries(round.map((s) => [s.id, s.x]));
check("ida e volta não empurra a tela para a direita", rx.in < rx.ag && rx.ag < rx.nv, JSON.stringify(rx));
check("ação que volta não tira a entrada do começo", loop[0].x === 0 && loop[1].x > 0, JSON.stringify(loop));

/* ---- o rascunho do Merlin ---- */
const draft = fromBlueprint({
  pitch: "agenda para salão",
  features: [{ title: "agendar", phase: "mvp" }, { title: "" }],
  entities: [
    { name: "Cliente", fields: [{ name: "nome", type: "text", required: true }] },
    { name: "Agendamento", fields: [{ name: "cliente", type: "ref", ref: "cliente" }, { name: "sala", type: "ref", ref: "Sala Inexistente" }, { name: "quando", type: "timestamp" }] }
  ],
  screens: [{ name: "Agenda", parts: ["calendário", "botão novo"], entities: ["Agendamento", "Fantasma"] }, { name: "Novo agendamento" }],
  flows: [{ from: "agenda", to: "Novo agendamento", action: "clicou em novo" }, { from: "Agenda", to: "Nenhuma" }]
}, makeId);
const ag = draft.entities.find((e) => e.name === "Agendamento");
const cl = draft.entities.find((e) => e.name === "Cliente");
check("rascunho resolve relação pelo nome", ag.fields[0].type === "ref" && ag.fields[0].ref === cl.id);
check("relação para nome desconhecido vira uuid solto", ag.fields[1].type === "uuid" && ag.fields[1].ref === "");
check("rascunho liga tela à entidade e larga o fantasma", draft.screens[0].entities.length === 1 && draft.screens[0].entities[0] === ag.id);
check("rascunho junta as partes em linhas", draft.screens[0].parts === "calendário\nbotão novo");
check("rascunho marca uma entrada", draft.screens[0].start === true);
check("rascunho larga ação sem ponta", draft.flows.length === 1 && draft.flows[0].action === "clicou em novo");
check("rascunho larga funcionalidade vazia", draft.features.length === 1);
check("rascunho vem arrumado no palco", cl.x < ag.x);

/* ---- juntar o rascunho ao que existe ---- */
const base = normalizeApp({
  id: "m", pitch: "o que eu escrevi",
  features: [{ title: "Agendar" }],
  entities: [{ id: "c0", name: "cliente", x: 0, y: 0, fields: [{ name: "nome" }] }],
  screens: [{ id: "h0", name: "Agenda", start: true, x: 0, y: 0 }]
}, makeId);
const merged = mergeDraft(base, draft);
check("juntar não troca o que a pessoa escreveu", merged.pitch === "o que eu escrevi");
check("juntar não duplica entidade de mesmo nome", merged.entities.filter((e) => snake(e.name) === "cliente").length === 1);
const mAg = merged.entities.find((e) => e.name === "Agendamento");
check("juntar repassa a relação para a entidade que já existia", mAg.fields[0].ref === "c0", JSON.stringify(mAg.fields[0]));
check("juntar põe o novo à direita do que existe", mAg.x > 0);
check("juntar não duplica tela e mantém uma entrada só", merged.screens.filter((s) => s.start).length === 1 && merged.screens.filter((s) => s.name === "Agenda").length === 1);
check("juntar repassa a ação para a tela que já existia", merged.flows.length === 1 && merged.flows[0].from === "h0");
check("juntar não duplica funcionalidade", merged.features.length === 1);
check("juntar duas vezes não duplica ação", mergeDraft(merged, draft).flows.length === 1);

/* ---- markdown e prompt ---- */
const md = toMarkdown(app);
check("markdown tem título e frase", md.startsWith("# Loja\n\n> vender sem planilha"), md.slice(0, 80));
check("markdown separa as fases", /### Primeira versão[\s\S]*catálogo[\s\S]*### Depois[\s\S]*cupom/.test(md));
check("markdown descreve a relação", /`cliente_id` \| relação → \| obrigatório; → Cliente/.test(md), md);
check("markdown lista as ações da tela", /fez login → Catálogo/.test(md));
check("markdown leva os dois mermaid", (md.match(/```mermaid/g) || []).length === 2);
check("markdown sem seção vazia", !/## Problema/.test(md));
const prompt = toPrompt(app);
check("prompt leva a especificação e o SQL", prompt.includes("# Loja") && prompt.includes("```sql"));
check("prompt manda começar pela primeira versão", /primeira versão/.test(prompt));

console.log("app-spec: " + ok + " verificações ok" + (bad ? ", " + bad + " falharam" : ""));
if (bad) process.exit(1);
