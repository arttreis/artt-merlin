/* merlin · testes do projeto de app (shared/app-spec.js)
   puro: roda em node, sem navegador. `node src/shared/app-spec.test.mjs` */
import {
  normalizeApp, snake, problemsOf, unreachable, layoutEntities, layoutScreens,
  fromBlueprint, mergeDraft, toSQL, toMermaidER, toMermaidFlow, toMarkdown, toPrompt,
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
