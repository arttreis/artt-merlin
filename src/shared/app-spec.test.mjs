/* merlin · testes do projeto de app (shared/app-spec.js)
   puro: roda em node, sem navegador. `node src/shared/app-spec.test.mjs` */
import {
  normalizeApp, snake, problemsOf, unreachable, layoutEntities, layoutScreens,
  fromBlueprint, fromPrototype, mergeDraft, mergePrototype, toSQL, toMermaidER, toMermaidFlow, toMarkdown, toPrompt,
  FRAME_W, FRAME_H, BLOCK_KINDS, wireframeOf, placeWireframe, wireframeLabel, toWireframes
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

/* ---- o protótipo: só telas e ações (ticket #95) ---- */
const protoApp = () => normalizeApp({
  id: "ag", name: "Agenda", pitch: "o que eu escrevi", problem: "meu problema", audience: "salões", value: "menos faltas",
  stack: "react", notes: "anotação minha", funnel: "f1", client: "c1", createdAt: 1000, updatedAt: 2000,
  features: [{ id: "ft1", title: "Agendar", note: "n" }],
  entities: [{ id: "e1", name: "Cliente", x: 10, y: 20, fields: [{ name: "nome", type: "text" }] }],
  screens: [
    { id: "in", name: "Início", goal: "ver o dia", start: true, x: 0, y: 0, entities: ["e1"], parts: "- Lista de Horários\nbotão novo" },
    { id: "cfg", name: "Ajustes", x: 300, y: 40, parts: "Tema escuro" }
  ],
  flows: [{ id: "fl1", from: "in", to: "cfg", action: "abriu ajustes" }]
}, makeId);
const protoData = () => ({
  screens: [
    { name: "inicio", goal: "outro objetivo", parts: ["lista de horários", "BOTÃO NOVO", "• filtro por dia", "busca"], start: true },
    { name: "Cadastro", goal: "criar conta", parts: ["campo e-mail", "botão criar conta"], start: true },
    { name: "Confirmação", goal: "", parts: "mensagem de sucesso" }
  ],
  flows: [
    { from: "Início", to: "Cadastro", action: "tocou em criar conta" },
    { from: "Cadastro", to: "Confirmação", action: "enviou" },
    { from: "Cadastro", to: "Não existe", action: "x" },
    { from: "Fantasma", to: "Cadastro", action: "y" },
    { from: "Ajustes", to: "Cadastro", action: "foi se cadastrar" },
    { from: "Início", to: "Cadastro", action: "tocou em criar conta" },
    { from: "Início", to: "Ajustes", action: "abriu ajustes" }
  ]
});
const nonScreens = (a) => JSON.stringify({ ...a, screens: undefined, flows: undefined });
const pa = protoApp();
const paBefore = JSON.stringify(pa);

const pd = fromPrototype(protoData(), pa, makeId);
check("fromPrototype devolve só telas e ações", Object.keys(pd).sort().join() === "flows,screens", Object.keys(pd).join());
check("fromPrototype traz uma tela por tela do rascunho", pd.screens.length === 3 && pd.screens.map((s) => s.name).join() === "inicio,Cadastro,Confirmação", pd.screens.map((s) => s.name).join());
check("fromPrototype junta as partes em linhas", pd.screens[1].parts === "campo e-mail\nbotão criar conta" && pd.screens[2].parts === "mensagem de sucesso", JSON.stringify(pd.screens.map((s) => s.parts)));
check("fromPrototype descarta a ação para tela que não existe, de qualquer ponta", pd.flows.every((f) => f.action !== "x" && f.action !== "y"), JSON.stringify(pd.flows));
const protoIds = new Set(pd.screens.map((s) => s.id).concat(pa.screens.map((s) => s.id)));
check("fromPrototype só deixa ação com as duas pontas em tela conhecida", pd.flows.length >= 3 && pd.flows.every((f) => protoIds.has(f.from) && protoIds.has(f.to)), JSON.stringify(pd.flows));
check("fromPrototype liga a tela que só existe no app (Ajustes → Cadastro)", pd.flows.some((f) => f.from === "cfg" && f.to === pd.screens[1].id && f.action === "foi se cadastrar"), JSON.stringify(pd.flows));
check("fromPrototype não mexe no app que recebeu", JSON.stringify(pa) === paBefore);
check("fromPrototype: com entrada no app, não inventa outra", pd.screens.filter((s) => s.start).length <= 2 && !pd.screens[2].start);
check("fromPrototype de nada", JSON.stringify(fromPrototype(null, pa, makeId)) === JSON.stringify({ screens: [], flows: [] }) && fromPrototype({}, pa, makeId).screens.length === 0);
check("fromPrototype larga tela sem objeto e com no máximo 12", fromPrototype({ screens: Array.from({ length: 15 }, (_, i) => ({ name: "t" + i })) }, pa, makeId).screens.length === 12);
const noEntry = normalizeApp({ id: "ne", name: "Sem entrada", screens: [{ id: "x1", name: "Solta" }] }, makeId);
const noEntryDraft = fromPrototype({ screens: [{ name: "Primeira" }, { name: "Segunda" }] }, noEntry, makeId);
check("sem entrada no rascunho nem no app, a primeira tela vira a entrada", noEntryDraft.screens[0].start === true && noEntryDraft.screens[1].start === false, JSON.stringify(noEntryDraft.screens.map((s) => s.start)));
const hasEntryDraft = fromPrototype({ screens: [{ name: "Primeira" }, { name: "Segunda", start: true }] }, noEntry, makeId);
check("o rascunho que já marca uma entrada não ganha outra", hasEntryDraft.screens[0].start === false && hasEntryDraft.screens[1].start === true, JSON.stringify(hasEntryDraft.screens.map((s) => s.start)));
const draftOnlyFlow = fromPrototype({ screens: [{ name: "A" }, { name: "B" }], flows: [{ from: "a", to: "b", action: "foi" }] }, null, makeId);
check("fromPrototype sem app resolve só entre as telas do rascunho", draftOnlyFlow.flows.length === 1 && draftOnlyFlow.flows[0].action === "foi", JSON.stringify(draftOnlyFlow));

/* juntar: telas novas entram, a de mesmo nome ganha só o que falta */
const pm = mergePrototype(pa, protoData(), makeId);
const byName = (a, name) => a.screens.find((s) => snake(s.name) === snake(name));
check("protótipo: nada fora de telas e ações muda", nonScreens(pm) === nonScreens(pa), nonScreens(pm).slice(0, 200));
check("protótipo: o app de antes não é mexido", JSON.stringify(pa) === paBefore);
check("protótipo: entram as duas telas novas e a de mesmo nome não duplica", pm.screens.length === 4 && pm.screens.filter((s) => snake(s.name) === "inicio").length === 1, pm.screens.map((s) => s.name).join());
const pIn = byName(pm, "Início");
check("protótipo: a tela existente mantém id, nome, objetivo, entrada, lugar e entidades", pIn.id === "in" && pIn.name === "Início" && pIn.goal === "ver o dia" && pIn.start === true && pIn.x === 0 && pIn.y === 0 && pIn.entities.join() === "e1", JSON.stringify(pIn));
const inLines = pIn.parts.split("\n");
check("protótipo: o texto antigo continua sendo o começo exato do novo", pIn.parts.startsWith("- Lista de Horários\nbotão novo"), JSON.stringify(pIn.parts));
check("protótipo: a tela existente ganha só as linhas que faltam, no fim", inLines.length === 4 && /filtro por dia/.test(inLines[2]) && inLines[3] === "busca", JSON.stringify(inLines));
check("protótipo: a linha repetida (caixa, acento e marcador à parte) não entra de novo", !/BOTÃO NOVO/.test(pIn.parts) && pIn.parts.toLowerCase().split("lista de horários").length === 2, JSON.stringify(pIn.parts));
const pCfg = byName(pm, "Ajustes");
check("protótipo: a tela que o rascunho não cita fica igual", JSON.stringify(pCfg) === JSON.stringify(pa.screens[1]), JSON.stringify(pCfg));
const pCad = byName(pm, "Cadastro"), pCon = byName(pm, "Confirmação");
check("protótipo: a tela nova leva nome, objetivo e partes", pCad && pCad.goal === "criar conta" && pCad.parts === "campo e-mail\nbotão criar conta" && pCon && pCon.parts === "mensagem de sucesso", JSON.stringify([pCad, pCon]));
check("protótipo: a tela nova ganha id próprio", pCad.id && pCon.id && pCad.id !== pCon.id && !["in", "cfg"].includes(pCad.id) && !["in", "cfg"].includes(pCon.id));
check("protótipo: a tela nova entra à direita de tudo o que já estava no palco", pCad.x > 300 && pCon.x > 300, pCad.x + "," + pCon.x);
check("protótipo: tela nova não vira entrada se o app já tem uma", pm.screens.filter((s) => s.start).length === 1 && pIn.start === true && pCad.start === false, JSON.stringify(pm.screens.map((s) => [s.name, s.start])));
check("protótipo: as ações antigas ficam, na ordem, antes das novas", pm.flows[0].id === "fl1" && pm.flows[0].from === "in" && pm.flows[0].to === "cfg" && pm.flows[0].action === "abriu ajustes", JSON.stringify(pm.flows[0]));
const flowOf = (a, from, to, action) => a.flows.filter((f) => f.from === from && f.to === to && f.action === action);
check("protótipo: a ação que saía da tela do rascunho sai da que já existia", flowOf(pm, "in", pCad.id, "tocou em criar conta").length === 1, JSON.stringify(pm.flows));
check("protótipo: ação entre duas telas novas entra", flowOf(pm, pCad.id, pCon.id, "enviou").length === 1);
check("protótipo: ação de uma tela que só existe no app para uma nova entra", flowOf(pm, "cfg", pCad.id, "foi se cadastrar").length === 1);
check("protótipo: ação repetida no rascunho, ou já existente, não duplica", flowOf(pm, "in", "cfg", "abriu ajustes").length === 1 && pm.flows.length === 4, pm.flows.length + " " + JSON.stringify(pm.flows.map((f) => f.action)));
check("protótipo: ação para tela que não existe não entra", !pm.flows.some((f) => f.action === "x" || f.action === "y"));
const screenSet = new Set(pm.screens.map((s) => s.id));
check("protótipo: toda ação juntada liga duas telas do app", pm.flows.every((f) => screenSet.has(f.from) && screenSet.has(f.to)), JSON.stringify(pm.flows));
check("protótipo: o resultado é um app válido (normalizeApp não muda nada)", JSON.stringify(normalizeApp(pm, makeId)) === JSON.stringify(pm));

/* juntar duas vezes o mesmo rascunho não muda nada */
const pm2 = mergePrototype(pm, protoData(), makeId);
check("protótipo: juntar duas vezes não duplica tela, linha nem ação", JSON.stringify(pm2.screens) === JSON.stringify(pm.screens) && JSON.stringify(pm2.flows) === JSON.stringify(pm.flows), pm2.screens.length + " telas, " + pm2.flows.length + " ações");

/* mergeDraft com a opção: o que o rascunho trouxer fora de telas e ações não entra */
const loud = { ...fromBlueprint({
  pitch: "invadiu", problem: "invadiu", audience: "invadiu", value: "invadiu", stack: "invadiu",
  features: [{ title: "Intrusa" }], entities: [{ name: "Intrusa", fields: [{ name: "x", type: "text" }] }],
  screens: [{ name: "Cadastro", parts: ["campo e-mail"], entities: ["Intrusa"] }, { name: "Início", parts: ["linha nova"] }]
}, makeId), name: "invadiu", funnel: "outro", client: "outro" };
const lm = mergeDraft(pa, loud, { screensOnly: true });
check("screensOnly: pitch, conceito, stack, funcionalidades e entidades ficam idênticos", nonScreens(lm) === nonScreens(pa), nonScreens(lm).slice(0, 200));
check("screensOnly: ainda junta as telas", lm.screens.length === 3 && /linha nova/.test(byName(lm, "Início").parts) && !!byName(lm, "Cadastro"));
check("screensOnly: tela nova não carrega entidade do rascunho", byName(lm, "Cadastro").entities.length === 0, JSON.stringify(byName(lm, "Cadastro").entities));
check("sem a opção, o mergeDraft segue juntando tudo", mergeDraft(pa, loud).entities.length === 2 && mergeDraft(pa, loud).features.length === 2 && mergeDraft(pa, loud).pitch === "o que eu escrevi");
check("sem a opção, a tela de mesmo nome não ganha linha", byName(mergeDraft(pa, loud), "Início").parts === "- Lista de Horários\nbotão novo", JSON.stringify(byName(mergeDraft(pa, loud), "Início").parts));

/* bordas */
check("protótipo vazio não muda o app", JSON.stringify(mergePrototype(pa, { screens: [], flows: [] }, makeId)) === paBefore && JSON.stringify(mergePrototype(pa, null, makeId)) === paBefore);
const flowsOnly = mergePrototype(pa, { flows: [{ from: "Ajustes", to: "Início", action: "voltou" }] }, makeId);
check("protótipo só com ação liga telas que já existem", flowsOnly.screens.length === 2 && flowOf(flowsOnly, "cfg", "in", "voltou").length === 1 && flowsOnly.flows.length === 2, JSON.stringify(flowsOnly.flows));
const blankApp = normalizeApp({ id: "vz", name: "Vazio" }, makeId);
const blankMerged = mergePrototype(blankApp, { screens: [{ name: "Primeira", parts: ["botão ok"] }, { name: "Segunda" }], flows: [{ from: "Primeira", to: "Segunda", action: "ok" }] }, makeId);
check("app sem telas: as do rascunho entram e a primeira vira a entrada", blankMerged.screens.length === 2 && blankMerged.screens.filter((s) => s.start).length === 1 && blankMerged.screens[0].start === true && blankMerged.flows.length === 1, JSON.stringify(blankMerged.screens.map((s) => [s.name, s.start])));
const loneStart = mergePrototype(protoApp(), { screens: [{ name: "Cadastro", start: true }, { name: "Ajustes", start: true, parts: ["tema escuro", "avisos"] }] }, makeId);
check("o rascunho que marca entrada não tira nem troca a que o app tem", loneStart.screens.filter((s) => s.start).map((s) => s.name).join() === "Início", JSON.stringify(loneStart.screens.map((s) => [s.name, s.start])));
check("a tela existente que não é entrada continua não sendo", byName(loneStart, "Ajustes").start === false && byName(loneStart, "Ajustes").parts === "Tema escuro\navisos", JSON.stringify(byName(loneStart, "Ajustes")));
const fullParts = Array.from({ length: 19 }, (_, i) => String(i % 10).repeat(99)).join("\n") + "\n" + "k".repeat(90);
const fullApp = normalizeApp({ id: "fu", name: "Cheio", screens: [{ id: "f1", name: "Cheia", start: true, parts: fullParts }] }, makeId);
check("(preparo) a tela cheia tem 1990 caracteres", fullApp.screens[0].parts.length === 1990, String(fullApp.screens[0].parts.length));
const fullMerged = mergePrototype(fullApp, { screens: [{ name: "Cheia", parts: ["z".repeat(60)] }] }, makeId);
check("a linha que não cabe em 2000 caracteres não entra", fullMerged.screens[0].parts === fullApp.screens[0].parts, String(fullMerged.screens[0].parts.length));
const roomMerged = mergePrototype(fullApp, { screens: [{ name: "Cheia", parts: ["curta"] }] }, makeId);
check("a linha que cabe entra, e o total nunca passa de 2000", roomMerged.screens[0].parts === fullApp.screens[0].parts + "\ncurta" && roomMerged.screens[0].parts.length <= 2000, String(roomMerged.screens[0].parts.length));
const emptyParts = mergePrototype(normalizeApp({ id: "ep", name: "x", screens: [{ id: "e1", name: "Vazia", start: true }] }, makeId), { screens: [{ name: "Vazia", parts: ["botão salvar", "lista de itens"] }] }, makeId);
check("a tela existente sem partes ganha todas as linhas", emptyParts.screens[0].parts === "botão salvar\nlista de itens", JSON.stringify(emptyParts.screens[0].parts));
const dupInDraft = mergePrototype(protoApp(), { screens: [{ name: "Ajustes", parts: ["avisos", "- Avisos", "AVISOS "] }] }, makeId);
check("linha repetida dentro do próprio rascunho entra uma vez só", byName(dupInDraft, "Ajustes").parts === "Tema escuro\navisos", JSON.stringify(byName(dupInDraft, "Ajustes").parts));

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

/* ---- wireframe: do texto das partes ao desenho ---- */
const kindsOf = (s) => wireframeOf(s).map((b) => b.kind).join();

check("o quadro do wireframe é de pé", FRAME_W > 0 && FRAME_H > FRAME_W, FRAME_W + "x" + FRAME_H);
check("BLOCK_KINDS traz os seis tipos com o rótulo em português",
  BLOCK_KINDS.map((k) => k.id + ":" + k.label).join() === "button:botão,list:lista,input:campo,heading:título,image:imagem,text:texto",
  JSON.stringify(BLOCK_KINDS));

/* cada palavra-chave leva ao seu tipo */
const keywords = {
  button: ["botão", "botao", "btn"],
  list: ["lista", "tabela", "feed"],
  input: ["campo", "filtro", "busca", "input", "formulário", "formulario"],
  heading: ["título", "titulo", "cabeçalho", "cabecalho"],
  image: ["imagem", "foto", "avatar"]
};
for (const [kind, words] of Object.entries(keywords)) {
  for (const w of words) {
    check("palavra-chave \"" + w + "\" vira " + kind, kindsOf(w + " do pedido") === kind, kindsOf(w + " do pedido"));
  }
}
check("o que não casa vira texto", kindsOf("total\nrodapé com avisos") === "text,text", kindsOf("total\nrodapé com avisos"));
check("exemplos do ticket", kindsOf("botão pagar\nlista de pedidos\nfiltro por status") === "button,list,input",
  kindsOf("botão pagar\nlista de pedidos\nfiltro por status"));

/* maiúscula e acento não atrapalham */
check("maiúscula e acento: BOTÃO", kindsOf("BOTÃO SALVAR") === "button");
check("maiúscula e acento: Título", kindsOf("Título da página") === "heading");
check("maiúscula e acento: FORMULARIO sem acento", kindsOf("FORMULARIO de entrada") === "input");
check("maiúscula e acento: Cabeçalho", kindsOf("Cabeçalho fixo") === "heading");
check("maiúscula e acento: LISTA", kindsOf("LISTA de clientes") === "list");

/* só no começo de palavra */
check("subtítulo não é título", kindsOf("subtítulo da página") === "text", kindsOf("subtítulo da página"));
check("prefixo casa: listagem", kindsOf("listagem de contas") === "list");
check("prefixo casa: fotos", kindsOf("fotos do produto") === "image");
check("prefixo casa: buscar", kindsOf("buscar cliente") === "input");
check("palavra-chave no meio da linha também vale", kindsOf("ver lista de pedidos") === "list", kindsOf("ver lista de pedidos"));
check("palavra-chave grudada no fim de outra não vale", kindsOf("minilista") === "text", kindsOf("minilista"));

/* a primeira regra da ordem vence */
check("botão vence lista e campo: \"botão filtrar\"", kindsOf("botão filtrar") === "button");
check("botão vence lista: \"botão lista\"", kindsOf("botão lista") === "button");
check("lista vence campo: \"lista com filtro\"", kindsOf("lista com filtro") === "list");
check("campo vence título: \"campo de título\"", kindsOf("campo de título") === "input");
check("título vence imagem: \"título com foto\"", kindsOf("título com foto") === "heading");

/* limpeza das linhas */
const messy = wireframeOf("  botão pagar  \n\n   \r\n- lista de pedidos\r\n* filtro por status\n• Total\n");
check("linha vazia e só de espaços são ignoradas", messy.length === 4, JSON.stringify(messy));
check("aceita \\r\\n e tira o marcador de lista",
  messy.map((b) => b.label).join("|") === "botão pagar|lista de pedidos|filtro por status|Total", JSON.stringify(messy));
check("o tipo vem depois de tirar o marcador", messy.map((b) => b.kind).join() === "button,list,input,text");
check("o rótulo guarda acento e maiúscula como foi escrito", wireframeOf("Botão Pagar")[0].label === "Botão Pagar");
check("o bloco tem só tipo e rótulo", Object.keys(wireframeOf("total")[0]).sort().join() === "kind,label");
check("o rótulo tem no máximo 120 caracteres", wireframeOf("botão " + "a".repeat(200))[0].label.length <= 120);
check("linha longa mantém o tipo", wireframeOf("botão " + "a".repeat(200))[0].kind === "button");
check("a ordem das linhas é mantida", wireframeOf("c\nb\na").map((b) => b.label).join() === "c,b,a");

/* entrada que não é texto */
check("parts vazio dá lista vazia", wireframeOf("").length === 0);
check("parts só com espaços e quebras dá lista vazia", wireframeOf("  \n \r\n\t").length === 0);
check("undefined dá lista vazia", Array.isArray(wireframeOf(undefined)) && wireframeOf(undefined).length === 0);
check("null dá lista vazia", Array.isArray(wireframeOf(null)) && wireframeOf(null).length === 0);
check("número dá lista vazia", Array.isArray(wireframeOf(42)) && wireframeOf(42).length === 0);
check("lista de textos vale como se fosse juntada por quebra de linha",
  JSON.stringify(wireframeOf(["botão novo", "calendário"])) === JSON.stringify(wireframeOf("botão novo\ncalendário")),
  JSON.stringify(wireframeOf(["botão novo", "calendário"])));

/* ---- wireframe: empilhar dentro do quadro ---- */
const stackOk = (items) => items.every((it, i) =>
  it.y >= 0 && it.h > 0 && it.y + it.h <= FRAME_H && (i === 0 || it.y >= items[i - 1].y + items[i - 1].h));

const nothing = placeWireframe([]);
check("placeWireframe de nada", nothing.items.length === 0 && nothing.hidden === 0, JSON.stringify(nothing));

const few = wireframeOf("título\nbotão pagar\nlista de pedidos\nfiltro por status\nfoto\ntotal");
const fewPlaced = placeWireframe(few);
check("poucos blocos cabem todos", fewPlaced.items.length === few.length && fewPlaced.hidden === 0, JSON.stringify(fewPlaced));
check("empilha de cima para baixo, sem sobrepor e dentro do quadro", stackOk(fewPlaced.items), JSON.stringify(fewPlaced.items));
check("mantém tipo, rótulo e ordem de cada bloco",
  fewPlaced.items.every((it, i) => it.kind === few[i].kind && it.label === few[i].label));

const alone = (text) => placeWireframe(wireframeOf(text)).items[0];
check("lista é mais alta que texto", alone("lista de pedidos").h > alone("total").h);
check("imagem é mais alta que botão", alone("foto do produto").h > alone("botão pagar").h);
check("um bloco sozinho começa dentro do quadro", alone("total").y >= 0 && alone("total").y + alone("total").h <= FRAME_H);

const many = Array.from({ length: 40 }, (_, i) => ({ kind: "text", label: "linha " + i }));
const manyPlaced = placeWireframe(many);
check("o que não cabe é contado em hidden", manyPlaced.hidden > 0, JSON.stringify(manyPlaced.hidden));
check("nada se perde: itens + escondidos = blocos", manyPlaced.items.length + manyPlaced.hidden === many.length);
check("cabe pelo menos um", manyPlaced.items.length > 0);
check("com excesso, ainda empilha dentro do quadro", stackOk(manyPlaced.items), JSON.stringify(manyPlaced.items));
check("com excesso, saem os do fim e a ordem se mantém",
  manyPlaced.items.every((it, i) => it.label === "linha " + i));

const bigLists = Array.from({ length: 12 }, (_, i) => ({ kind: "list", label: "lista " + i }));
const bigPlaced = placeWireframe(bigLists);
check("listas altas estouram o quadro antes dos textos", bigPlaced.hidden > 0 && bigPlaced.items.length < manyPlaced.items.length,
  bigPlaced.items.length + " vs " + manyPlaced.items.length);
check("itens + escondidos = blocos também com listas", bigPlaced.items.length + bigPlaced.hidden === bigLists.length);

/* ---- wireframe: descrição para leitor de tela ---- */
check("wireframeLabel junta os rótulos",
  wireframeLabel({ name: "Checkout", parts: "botão pagar\nlista de pedidos" }) === "tela Checkout: botão pagar, lista de pedidos",
  wireframeLabel({ name: "Checkout", parts: "botão pagar\nlista de pedidos" }));
check("wireframeLabel ignora linha vazia e marcador",
  wireframeLabel({ name: "Agenda", parts: "- calendário\n\n* botão novo" }) === "tela Agenda: calendário, botão novo");
check("wireframeLabel de tela sem parts", wireframeLabel({ name: "Perdida" }) === "tela Perdida: vazia");
check("wireframeLabel de parts vazio", wireframeLabel({ name: "Perdida", parts: "" }) === "tela Perdida: vazia");
check("wireframeLabel de parts só com espaços", wireframeLabel({ name: "Perdida", parts: "  \n " }) === "tela Perdida: vazia");

/* ---- wireframe: markdown e prompt ---- */
const wfApp = normalizeApp({
  id: "wf", name: "Pedidos", pitch: "acompanhar pedidos",
  screens: [
    { id: "w1", name: "Checkout", start: true, parts: "botão pagar\nlista de pedidos\n\nfiltro por status\ntotal" },
    { id: "w2", name: "Sem nada" },
    { id: "w3", name: "Painel", parts: "- Título do painel\nfoto do perfil" }
  ],
  flows: [{ from: "w1", to: "w3", action: "pagou" }]
}, makeId);
const wf = toWireframes(wfApp);
check("toWireframes começa pelo título da seção", wf.startsWith("## Wireframe das telas"), wf.slice(0, 60));
check("toWireframes tem um título por tela com blocos", wf.includes("### Checkout") && wf.includes("### Painel"), wf);
check("toWireframes não mostra tela sem parts", !wf.includes("Sem nada"), wf);
check("toWireframes lista o bloco com o rótulo do tipo",
  wf.includes("- [botão] botão pagar") && wf.includes("- [lista] lista de pedidos") &&
  wf.includes("- [campo] filtro por status") && wf.includes("- [texto] total"), wf);
check("toWireframes traduz título e imagem", wf.includes("- [título] Título do painel") && wf.includes("- [imagem] foto do perfil"), wf);
check("toWireframes segue a ordem das telas", wf.indexOf("### Checkout") < wf.indexOf("### Painel"));
check("toWireframes mantém a ordem dos blocos da tela",
  wf.indexOf("- [botão] botão pagar") < wf.indexOf("- [lista] lista de pedidos") &&
  wf.indexOf("- [lista] lista de pedidos") < wf.indexOf("- [campo] filtro por status"));
check("toWireframes não conta a linha vazia", (wf.match(/^- \[/gm) || []).length === 6, wf);

const bare = normalizeApp({ id: "bare", name: "Nu", screens: [{ id: "b1", name: "Só nome", start: true }, { id: "b2", name: "Outra", parts: "  \n " }] }, makeId);
check("toWireframes sem nenhum bloco é vazio", toWireframes(bare) === "", JSON.stringify(toWireframes(bare)));
check("toWireframes de app sem telas é vazio", toWireframes(empty) === "");

const wfPrompt = toPrompt(wfApp);
check("prompt com blocos leva a seção do wireframe", wfPrompt.includes("## Wireframe das telas") && wfPrompt.includes("- [lista] lista de pedidos"));
check("prompt põe o wireframe antes do SQL", wfPrompt.indexOf("## Wireframe das telas") < wfPrompt.indexOf("```sql"));
check("prompt sem blocos não fala de wireframe", !/Wireframe/.test(toPrompt(bare)), toPrompt(bare));

console.log("app-spec: " + ok + " verificações ok" + (bad ? ", " + bad + " falharam" : ""));
if (bad) process.exit(1);
