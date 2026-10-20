/* testa o time (ticket #78): as contas puras da página team.html e dos verbos de equipe.
 * o navegador de mentira sobe antes do import porque o team-data importa o core, que é
 * módulo de navegador. */

let passed = 0;
const failures = [];
const check = (name, cond, detail) => { if (cond) passed++; else failures.push(name + (detail ? " -> " + detail : "")); };

const map = new Map();
const noop = () => {};
globalThis.document = { documentElement: { classList: { add: noop, remove: noop, contains: () => false, toggle: () => false } }, addEventListener: noop, hidden: false, querySelector: () => null };
globalThis.window = { addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }) };
globalThis.location = { reload: noop };
globalThis.fetch = async (url) => { throw new Error("fetch nao previsto no teste: " + url); };
globalThis.localStorage = {
  get length() { return map.size; },
  key: (i) => [...map.keys()][i] ?? null,
  getItem: (k) => (map.has(k) ? map.get(k) : null),
  setItem: (k, v) => { map.set(k, String(v)); },
  removeItem: (k) => { map.delete(k); }
};

const T = await import("./team-data.js");
const { NAME_MAX, ROLE_MAX, TEXT_MAX, normalize, roleOf, activeTeam, teamTotal, findPerson, costLabel, personLine, personDoc, addDelivery, deliveriesOf, deliveryLine, archivePerson, fixedFor } = T;

const TODAY = "2026-10-20";
const FUTURE = "esse dia ainda não chegou";
const ASK_NAME = "qual é o nome?";
const ASK_TEXT = "o que foi entregue?";

/* o brl do core usa toLocaleString, que põe espaço não separável depois do "R$" */
const plain = (s) => String(s).replace(/ /g, " ");
const person = (id, name, extra) => ({ id, name, role: "", cost: 0, since: "", next: "", deliveries: [], archived: false, fixed: "", createdAt: 1, updatedAt: 1, ...extra });
const names = (list) => list.map((p) => p.name).join();

/* ---- as constantes ---- */
{
  check("o nome vai até 80 caracteres", NAME_MAX === 80, String(NAME_MAX));
  check("o papel vai até 40 caracteres", ROLE_MAX === 40, String(ROLE_MAX));
  check("o texto da entrega vai até 140 caracteres", TEXT_MAX === 140, String(TEXT_MAX));
}

/* ---- normalize ---- */
{
  const a = normalize({
    id: "t1", name: "Ana", role: "design", cost: 300000, since: "2026-01-10", next: "2026-10-27",
    deliveries: [{ id: "e1", day: "2026-10-18", text: "landing" }], archived: false, fixed: "f1", createdAt: 5, updatedAt: 6
  });
  check("normalize: guarda o que veio, com as chaves do documento",
    a.id === "t1" && a.name === "Ana" && a.role === "design" && a.cost === 300000 && a.since === "2026-01-10" && a.next === "2026-10-27"
      && a.archived === false && a.fixed === "f1" && a.createdAt === 5 && a.updatedAt === 6, JSON.stringify(a));
  check("normalize: a entrega fica como {id, day, text}",
    a.deliveries.length === 1 && a.deliveries[0].id === "e1" && a.deliveries[0].day === "2026-10-18" && a.deliveries[0].text === "landing", JSON.stringify(a.deliveries));

  check("normalize: o nome colapsa espaços e perde os das pontas", normalize({ id: "t", name: "  Ana   Souza  " }).name === "Ana Souza", normalize({ id: "t", name: "  Ana   Souza  " }).name);
  check("normalize: o nome é cortado em 80", normalize({ id: "t", name: "n".repeat(200) }).name.length === 80);
  check("normalize: o nome de 80 fica inteiro", normalize({ id: "t", name: "n".repeat(80) }).name === "n".repeat(80));
  check("normalize: o papel colapsa espaços e perde os das pontas", normalize({ id: "t", name: "Ana", role: "  head   de   vendas " }).role === "head de vendas", normalize({ id: "t", name: "Ana", role: "  head   de   vendas " }).role);
  check("normalize: o papel é cortado em 40", normalize({ id: "t", name: "Ana", role: "r".repeat(100) }).role.length === 40);
  check("normalize: sem nome nem papel ficam vazios", normalize({ id: "t" }).name === "" && normalize({ id: "t" }).role === "");

  check("normalize: custo vira inteiro arredondado", normalize({ id: "t", name: "Ana", cost: 1999.6 }).cost === 2000 && normalize({ id: "t", name: "Ana", cost: "1500" }).cost === 1500);
  check("normalize: custo negativo vira positivo", normalize({ id: "t", name: "Ana", cost: -500 }).cost === 500, String(normalize({ id: "t", name: "Ana", cost: -500 }).cost));
  check("normalize: custo inválido ou ausente vira 0",
    normalize({ id: "t", name: "Ana", cost: "abc" }).cost === 0 && normalize({ id: "t", name: "Ana" }).cost === 0 && normalize({ id: "t", name: "Ana", cost: NaN }).cost === 0 && normalize({ id: "t", name: "Ana", cost: null }).cost === 0);

  check("normalize: since e next só ficam se forem dia válido",
    normalize({ id: "t", name: "Ana", since: "ontem", next: "2026-10-1" }).since === "" && normalize({ id: "t", name: "Ana", since: "ontem", next: "2026-10-1" }).next === "");
  check("normalize: dia impossível (30/02) vira vazio", normalize({ id: "t", name: "Ana", since: "2026-02-30", next: "2026-13-01" }).since === "" && normalize({ id: "t", name: "Ana", since: "2026-02-30", next: "2026-13-01" }).next === "");
  check("normalize: since e next ausentes ficam vazios", normalize({ id: "t", name: "Ana" }).since === "" && normalize({ id: "t", name: "Ana" }).next === "");

  check("normalize: sem deliveries vira lista vazia", Array.isArray(normalize({ id: "t", name: "Ana" }).deliveries) && normalize({ id: "t", name: "Ana" }).deliveries.length === 0);
  check("normalize: deliveries que não é lista vira lista vazia", normalize({ id: "t", name: "Ana", deliveries: "x" }).deliveries.length === 0 && normalize({ id: "t", name: "Ana", deliveries: null }).deliveries.length === 0);
  const d = normalize({
    id: "t", name: "Ana", deliveries: [
      { id: "ok", day: "2026-10-18", text: "  landing   nova " },
      { id: "semdia", text: "x" },
      { id: "diaruim", day: "ontem", text: "x" },
      { id: "semtexto", day: "2026-10-18" },
      { id: "branco", day: "2026-10-18", text: "   " },
      { id: "longa", day: "2026-10-17", text: "z".repeat(400) },
      { day: "2026-10-16", text: "sem id" },
      { id: 9, day: "2026-10-15", text: "id numérico" }
    ]
  });
  check("normalize: só ficam as entregas com dia válido e texto não vazio", d.deliveries.length === 4 && d.deliveries.map((e) => e.text).includes("landing nova"), JSON.stringify(d.deliveries));
  check("normalize: o texto da entrega é limpo", d.deliveries[0].text === "landing nova", d.deliveries[0].text);
  check("normalize: o texto da entrega é cortado em 140", d.deliveries.find((e) => e.id === "longa").text.length === 140);
  const semId = d.deliveries.find((e) => e.text === "sem id");
  check("normalize: entrega sem id ganha um", semId && typeof semId.id === "string" && semId.id.length > 0, JSON.stringify(semId));
  const numId = d.deliveries.find((e) => e.text === "id numérico");
  check("normalize: o id da entrega vira texto", numId && numId.id === "9", JSON.stringify(numId));

  check("normalize: archived vira booleano", normalize({ id: "t", name: "Ana", archived: 1 }).archived === true && normalize({ id: "t", name: "Ana", archived: "" }).archived === false && normalize({ id: "t", name: "Ana" }).archived === false);
  check("normalize: fixed vira texto e o ausente vira vazio", normalize({ id: "t", name: "Ana", fixed: 12 }).fixed === "12" && normalize({ id: "t", name: "Ana" }).fixed === "" && normalize({ id: "t", name: "Ana", fixed: null }).fixed === "");
  const c = normalize({ id: "t", name: "Ana" });
  check("normalize: sem datas, createdAt e updatedAt vêm preenchidos", typeof c.createdAt === "number" && typeof c.updatedAt === "number", JSON.stringify(c));
  check("normalize: as chaves são as do documento",
    Object.keys(a).filter((k) => k !== "deleted").sort().join() === "archived,cost,createdAt,deliveries,fixed,id,name,next,role,since,updatedAt", Object.keys(a).sort().join());
}

/* ---- roleOf ---- */
{
  const cases = [
    ["designer", "design"], ["Designer", "design"], ["DESIGNER", "design"], ["desenho", "design"], ["  designer  ", "design"],
    ["desenvolvedor", "dev"], ["desenvolvedora", "dev"], ["Desenvolvedor", "dev"], ["programador", "dev"], ["programadora", "dev"], ["developer", "dev"], ["Developer", "dev"],
    ["vendedor", "vendas"], ["vendedora", "vendas"], ["comercial", "vendas"], ["Comercial", "vendas"],
    ["atendimento", "suporte"], ["atendente", "suporte"], ["Atendimento", "suporte"],
    ["freelancer", "freela"], ["freelá", "freela"], ["freela", "freela"], ["Freelá", "freela"], ["FREELA", "freela"],
    ["sócio", "sócio"], ["Sócio", "Sócio"], ["", ""], ["   ", ""], ["  head   de   vendas ", "head de vendas"]
  ];
  for (const [v, want] of cases) check("roleOf: '" + v + "' -> '" + want + "'", roleOf(v) === want, String(roleOf(v)));
  check("roleOf: texto desconhecido é cortado em 40", roleOf("q".repeat(100)).length === 40, String(roleOf("q".repeat(100)).length));
  check("roleOf: indefinido e nulo viram vazio", roleOf(undefined) === "" && roleOf(null) === "");
}

/* ---- activeTeam ---- */
{
  const list = [
    person("c", "Carla"),
    person("a", "Ana"),
    person("x", "Xavier", { archived: true }),
    person("m", "marcos"),
    person("d", "Dora", { deleted: true }),
    person("b", "Álvaro")
  ];
  check("activeTeam: tira arquivados e lápides", !activeTeam(list).some((p) => p.archived || p.deleted), names(activeTeam(list)));
  check("activeTeam: ordem alfabética do nome (pt-BR)", names(activeTeam(list)) === "Álvaro,Ana,Carla,marcos", names(activeTeam(list)));
  check("activeTeam: lista vazia dá lista vazia", activeTeam([]).length === 0);
  const before = JSON.stringify(list);
  activeTeam(list);
  check("activeTeam: não muda a lista de entrada", JSON.stringify(list) === before);
}

/* ---- teamTotal ---- */
{
  const list = [
    person("a", "Ana", { cost: 300000 }),
    person("b", "Beto", { cost: 150000 }),
    person("c", "Caio", { cost: 999999, archived: true }),
    person("d", "Dani")
  ];
  check("teamTotal: soma só os ativos, arquivado não conta", teamTotal(list) === 450000, String(teamTotal(list)));
  check("teamTotal: sem custo conta 0", teamTotal([person("d", "Dani")]) === 0);
  check("teamTotal: lista vazia dá 0", teamTotal([]) === 0);
  check("teamTotal: só arquivados dá 0", teamTotal([person("c", "Caio", { cost: 500, archived: true })]) === 0);
}

/* ---- findPerson ---- */
{
  const list = [person("a", "Ana"), person("j", "João"), person("b", "Beto Lima")];
  check("findPerson: 'ana' acha 'Ana'", findPerson(list, "ana")?.id === "a", JSON.stringify(findPerson(list, "ana")));
  check("findPerson: 'ANA' e ' Ana ' também acham", findPerson(list, "ANA")?.id === "a" && findPerson(list, " Ana ")?.id === "a");
  check("findPerson: 'Joao' acha 'João'", findPerson(list, "Joao")?.id === "j", JSON.stringify(findPerson(list, "Joao")));
  check("findPerson: nome inteiro exato", findPerson(list, "beto lima")?.id === "b");
  check("findPerson: pelo primeiro nome quando só há um", findPerson(list, "beto")?.id === "b");
  check("findPerson: nome desconhecido dá null", findPerson(list, "zeca") === null, String(findPerson(list, "zeca")));
  check("findPerson: nome vazio dá null", findPerson(list, "") === null && findPerson(list, "   ") === null && findPerson(list, undefined) === null);
  check("findPerson: lista vazia dá null", findPerson([], "ana") === null);

  const unica = [person("s", "Ana Souza"), person("p", "Paulo")];
  check("findPerson: 'ana' acha 'Ana Souza' quando é a única Ana", findPerson(unica, "ana")?.id === "s", JSON.stringify(findPerson(unica, "ana")));

  const duas = [person("s", "Ana Souza"), person("l", "Ana Lima")];
  check("findPerson: duas Anas pelo primeiro nome é ambíguo, null", findPerson(duas, "ana") === null, JSON.stringify(findPerson(duas, "ana")));
  check("findPerson: com duas Anas, o nome inteiro desambigua", findPerson(duas, "ana lima")?.id === "l" && findPerson(duas, "Ana Souza")?.id === "s");

  const exata = [person("a", "Ana"), person("s", "Ana Souza")];
  check("findPerson: o nome exato vence o primeiro nome", findPerson(exata, "ana")?.id === "a", JSON.stringify(findPerson(exata, "ana")));

  const arq = [person("a", "Ana", { archived: true }), person("p", "Paulo")];
  check("findPerson: arquivada nunca é achada", findPerson(arq, "ana") === null, JSON.stringify(findPerson(arq, "ana")));
  const arq2 = [person("a", "Ana", { archived: true }), person("s", "Ana Souza")];
  check("findPerson: arquivada não conta para a ambiguidade", findPerson(arq2, "ana")?.id === "s", JSON.stringify(findPerson(arq2, "ana")));
  const arq3 = [person("a", "Ana", { archived: true }), person("a2", "Ana")];
  check("findPerson: a ativa de mesmo nome é achada", findPerson(arq3, "ana")?.id === "a2");
}

/* ---- costLabel ---- */
{
  check("costLabel: 300000 -> 'R$ 3.000/mês'", plain(costLabel(300000)) === "R$ 3.000/mês", plain(costLabel(300000)));
  check("costLabel: centavos que não são zero ficam", plain(costLabel(150050)) === "R$ 1.500,50/mês", plain(costLabel(150050)));
  check("costLabel: valor pequeno", plain(costLabel(5000)) === "R$ 50/mês", plain(costLabel(5000)));
  check("costLabel: 0 dá vazio", costLabel(0) === "", JSON.stringify(costLabel(0)));
}

/* ---- personLine ---- */
{
  check("personLine: nome, papel e custo", plain(personLine(person("a", "Ana", { role: "design", cost: 300000 }))) === "Ana · design · R$ 3.000/mês", plain(personLine(person("a", "Ana", { role: "design", cost: 300000 }))));
  check("personLine: sem custo", personLine(person("a", "Ana", { role: "design" })) === "Ana · design", personLine(person("a", "Ana", { role: "design" })));
  check("personLine: sem papel e sem custo é só o nome", personLine(person("a", "Ana")) === "Ana", personLine(person("a", "Ana")));
  check("personLine: sem papel, com custo", plain(personLine(person("a", "Ana", { cost: 300000 }))) === "Ana · R$ 3.000/mês", plain(personLine(person("a", "Ana", { cost: 300000 }))));
}

/* ---- personDoc ---- */
{
  const r = personDoc({ name: "Ana", role: "designer", cost: 300000, since: "2026-01-10", next: "2026-10-27" }, null);
  check("personDoc: cria o documento", !r.error && r.doc, JSON.stringify(r));
  check("personDoc: guarda nome, custo e datas", r.doc.name === "Ana" && r.doc.cost === 300000 && r.doc.since === "2026-01-10" && r.doc.next === "2026-10-27", JSON.stringify(r.doc));
  check("personDoc: o papel passa por roleOf", r.doc.role === "design", r.doc.role);
  check("personDoc: novo nasce sem entregas, ativo e sem fixo",
    Array.isArray(r.doc.deliveries) && r.doc.deliveries.length === 0 && r.doc.archived === false && r.doc.fixed === "", JSON.stringify(r.doc));
  check("personDoc: id novo e datas iguais na criação", typeof r.doc.id === "string" && r.doc.id.length > 0 && typeof r.doc.createdAt === "number" && r.doc.createdAt === r.doc.updatedAt, JSON.stringify(r.doc));
  const r2 = personDoc({ name: "Ana" }, null);
  check("personDoc: cada criação ganha um id diferente", r.doc.id !== r2.doc.id, r.doc.id + " " + r2.doc.id);
  check("personDoc: só o nome basta", !r2.error && r2.doc.role === "" && r2.doc.cost === 0 && r2.doc.since === "" && r2.doc.next === "", JSON.stringify(r2));
  check("personDoc: o nome é limpo", personDoc({ name: "  Ana   Souza " }, null).doc.name === "Ana Souza");

  for (const name of ["", "   ", undefined, " \t "]) {
    const e = personDoc({ name, role: "design", cost: 100 }, null);
    check("personDoc: sem nome (" + JSON.stringify(name) + ") pergunta o nome", e.error === ASK_NAME && !e.doc, JSON.stringify(e));
  }

  check("personDoc: custo negativo vira positivo", personDoc({ name: "Ana", cost: -5000 }, null).doc.cost === 5000);
  check("personDoc: custo quebrado é arredondado", personDoc({ name: "Ana", cost: 1999.6 }, null).doc.cost === 2000);
  check("personDoc: custo inválido vira 0", personDoc({ name: "Ana", cost: "abc" }, null).doc.cost === 0 && personDoc({ name: "Ana", cost: NaN }, null).doc.cost === 0 && personDoc({ name: "Ana", cost: undefined }, null).doc.cost === 0);
  check("personDoc: dia inválido vira vazio", personDoc({ name: "Ana", since: "ontem", next: "2026-02-30" }, null).doc.since === "" && personDoc({ name: "Ana", since: "ontem", next: "2026-02-30" }, null).doc.next === "");
  check("personDoc: papel desconhecido fica como foi escrito", personDoc({ name: "Ana", role: "sócio" }, null).doc.role === "sócio");

  const before = person("keep", "Ana", {
    role: "design", cost: 100, since: "2026-01-01", next: "2026-10-21", archived: true, fixed: "fx1", createdAt: 100, updatedAt: 100,
    deliveries: [{ id: "e1", day: "2026-10-18", text: "landing" }]
  });
  const e = personDoc({ name: "Ana Souza", role: "desenvolvedora", cost: 400000, since: "2026-02-02", next: "" }, before);
  check("personDoc: com before mantém id, createdAt, entregas, arquivo e fixo",
    !e.error && e.doc.id === "keep" && e.doc.createdAt === 100 && e.doc.archived === true && e.doc.fixed === "fx1"
      && e.doc.deliveries.length === 1 && e.doc.deliveries[0].text === "landing", JSON.stringify(e));
  check("personDoc: com before troca nome, papel, custo e datas", e.doc.name === "Ana Souza" && e.doc.role === "dev" && e.doc.cost === 400000 && e.doc.since === "2026-02-02" && e.doc.next === "", JSON.stringify(e.doc));
  check("personDoc: com before renova updatedAt", e.doc.updatedAt > 100, JSON.stringify(e.doc));
  const ee = personDoc({ name: " ", role: "dev" }, before);
  check("personDoc: editar para nome vazio também pergunta o nome", ee.error === ASK_NAME && !ee.doc, JSON.stringify(ee));
  const antes = JSON.stringify(before);
  personDoc({ name: "Outro" }, before);
  check("personDoc: não muda o before", JSON.stringify(before) === antes);
}

/* ---- addDelivery ---- */
{
  const p = person("a", "Ana", { deliveries: [{ id: "e1", day: "2026-10-10", text: "logo" }], updatedAt: 1 });
  const antes = JSON.stringify(p);
  const r = addDelivery(p, { text: "landing", date: "2026-10-18" }, TODAY);
  check("addDelivery: anexa a entrega com a data dita", !r.error && r.doc && r.doc.deliveries.length === 2, JSON.stringify(r));
  const nova = r.doc.deliveries[r.doc.deliveries.length - 1];
  check("addDelivery: a entrega nova vai ao fim, como {id, day, text}", nova.day === "2026-10-18" && nova.text === "landing" && typeof nova.id === "string" && nova.id.length > 0, JSON.stringify(nova));
  check("addDelivery: as entregas anteriores ficam intactas", r.doc.deliveries[0].id === "e1" && r.doc.deliveries[0].day === "2026-10-10" && r.doc.deliveries[0].text === "logo");
  check("addDelivery: o resto da pessoa é igual e updatedAt é novo", r.doc.id === "a" && r.doc.name === "Ana" && r.doc.updatedAt > 1, JSON.stringify(r.doc));
  check("addDelivery: a pessoa original não é mutada", JSON.stringify(p) === antes && p.deliveries.length === 1);
  check("addDelivery: o id da entrega é novo, diferente do das outras", nova.id !== "e1");

  check("addDelivery: sem date usa hoje", addDelivery(p, { text: "landing" }, TODAY).doc.deliveries[1].day === TODAY);
  check("addDelivery: date inválida usa hoje", addDelivery(p, { text: "landing", date: "ontem" }, TODAY).doc.deliveries[1].day === TODAY);
  check("addDelivery: o próprio hoje não é futuro", !addDelivery(p, { text: "landing", date: TODAY }, TODAY).error);

  const f = addDelivery(p, { text: "landing", date: "2026-10-21" }, TODAY);
  check("addDelivery: dia futuro dá erro e não dá documento", f.error === FUTURE && !f.doc, JSON.stringify(f));
  for (const text of ["", "   ", undefined, " \t "]) {
    const e = addDelivery(p, { text, date: TODAY }, TODAY);
    check("addDelivery: texto vazio (" + JSON.stringify(text) + ") pergunta o que foi entregue", e.error === ASK_TEXT && !e.doc, JSON.stringify(e));
  }
  check("addDelivery: o texto vai aparado", addDelivery(p, { text: "  landing  " }, TODAY).doc.deliveries[1].text === "landing");
  check("addDelivery: o texto é cortado em 140", addDelivery(p, { text: "z".repeat(500) }, TODAY).doc.deliveries[1].text.length === 140);

  const vazia = addDelivery(person("v", "Vera"), { text: "primeira" }, TODAY);
  check("addDelivery: a primeira entrega de quem não tinha nenhuma", vazia.doc.deliveries.length === 1 && vazia.doc.deliveries[0].text === "primeira", JSON.stringify(vazia));
  const dupla = addDelivery(vazia.doc, { text: "segunda" }, TODAY);
  check("addDelivery: duas entregas seguidas ficam na ordem anexada", dupla.doc.deliveries.map((e) => e.text).join() === "primeira,segunda", JSON.stringify(dupla.doc.deliveries));
}

/* ---- deliveriesOf ---- */
{
  const p = person("a", "Ana", {
    deliveries: [
      { id: "e1", day: "2026-10-10", text: "um" },
      { id: "e2", day: "2026-10-18", text: "dois" },
      { id: "e3", day: "2026-10-12", text: "três" },
      { id: "e4", day: "2026-10-18", text: "quatro" }
    ]
  });
  const ids = (list) => list.map((e) => e.id).join();
  check("deliveriesOf: da mais nova para a mais antiga, no mesmo dia a anexada por último primeiro", ids(deliveriesOf(p)) === "e4,e2,e3,e1", ids(deliveriesOf(p)));
  check("deliveriesOf: sem entregas dá lista vazia", deliveriesOf(person("v", "Vera")).length === 0);
  const antes = JSON.stringify(p);
  deliveriesOf(p);
  check("deliveriesOf: não muda a pessoa", JSON.stringify(p) === antes);
}

/* ---- deliveryLine ---- */
{
  const p = person("a", "Ana");
  check("deliveryLine: de hoje, sem data", deliveryLine(p, { id: "e", day: TODAY, text: "landing" }, TODAY) === "Ana · landing", deliveryLine(p, { id: "e", day: TODAY, text: "landing" }, TODAY));
  check("deliveryLine: de outro dia, com dd/mm no fim", deliveryLine(p, { id: "e", day: "2026-10-18", text: "landing" }, TODAY) === "Ana · landing · 18/10", deliveryLine(p, { id: "e", day: "2026-10-18", text: "landing" }, TODAY));
  check("deliveryLine: dia e mês com zero à esquerda", deliveryLine(p, { id: "e", day: "2026-03-05", text: "logo" }, TODAY) === "Ana · logo · 05/03");
}

/* ---- archivePerson ---- */
{
  const p = person("a", "Ana", { role: "design", cost: 300000, fixed: "fx1", deliveries: [{ id: "e1", day: "2026-10-18", text: "landing" }], updatedAt: 1 });
  const antes = JSON.stringify(p);
  const r = archivePerson(p);
  check("archivePerson: marca como arquivada e renova updatedAt", r.archived === true && r.updatedAt > 1, JSON.stringify(r));
  check("archivePerson: mantém as entregas", r.deliveries.length === 1 && r.deliveries[0].text === "landing", JSON.stringify(r.deliveries));
  check("archivePerson: mantém id, nome, papel, custo e fixo", r.id === "a" && r.name === "Ana" && r.role === "design" && r.cost === 300000 && r.fixed === "fx1");
  check("archivePerson: não muda a pessoa original", JSON.stringify(p) === antes && p.archived === false);
  check("archivePerson: depois de arquivada, some do time e do total",
    activeTeam([r]).length === 0 && teamTotal([r]) === 0 && findPerson([r], "ana") === null);
}

/* ---- fixedFor ---- */
{
  const p = person("a", "Ana", { role: "design", cost: 300000 });
  const f = fixedFor(p, null);
  check("fixedFor: é um fixo de saída do caixa da empresa", f.type === "fixed" && f.book === "business" && f.kind === "out", JSON.stringify(f));
  check("fixedFor: nome 'Ana · design', valor do custo, categoria Outros, dia 5, ativo",
    f.name === "Ana · design" && f.amount === 300000 && f.category === "Outros" && f.dayOfMonth === 5 && f.active === true, JSON.stringify(f));
  check("fixedFor: id novo quando não há before", typeof f.id === "string" && f.id.length > 0, JSON.stringify(f));
  check("fixedFor: sem papel o nome é só o da pessoa", fixedFor(person("b", "Beto", { cost: 100 }), null).name === "Beto");
  const g = fixedFor(p, { id: "fx9", dayOfMonth: 15 });
  check("fixedFor: com before mantém o id e o dia do mês", g.id === "fx9" && g.dayOfMonth === 15, JSON.stringify(g));
  const h = fixedFor(person("a", "Ana Souza", { role: "dev", cost: 450000 }), { id: "fx9", dayOfMonth: 15 });
  check("fixedFor: com before o nome e o valor acompanham a pessoa", h.name === "Ana Souza · dev" && h.amount === 450000 && h.book === "business" && h.kind === "out", JSON.stringify(h));
  check("fixedFor: before sem dia do mês cai no dia 5", fixedFor(p, { id: "fx9" }).dayOfMonth === 5);
}

/* ---- gravar: joinTeam e noteDelivery ----
   com as coleções de verdade do core: o fixo da pessoa cai no livro da
   empresa e nunca no pessoal, e o desfazer apaga o que a gravação pôs */
{
  const { collection } = await import("./core.js");
  const F = await import("./finance-data.js");
  const team = collection("team", { normalize });
  const finance = collection("finance", { normalize: F.normalize });
  const cash = F.bookCollection(finance, "business");
  const personal = F.bookCollection(finance, "personal");
  const { joinTeam, noteDelivery } = T;

  const ana = personDoc({ name: "Ana", role: "designer", cost: 300000 }, null).doc;
  const res = joinTeam(team, cash, ana, true);
  const fx = cash.get(res.doc.fixed);
  check("joinTeam: a linha é a da confirmação", plain(res.line) === "Ana · design · R$ 3.000/mês", res.line);
  check("joinTeam: a pessoa fica no time", !!team.get(ana.id) && team.get(ana.id).name === "Ana");
  check("joinTeam: com launch, o fixo de saída cai no caixa da empresa", !!fx && fx.type === "fixed" && fx.kind === "out" && fx.amount === 300000 && fx.book === "business", JSON.stringify(fx));
  check("joinTeam: o fixo não aparece no financeiro pessoal", !personal.all().some((d) => d.id === res.doc.fixed) && personal.get(res.doc.fixed) === null);
  check("joinTeam: a pessoa guarda o id do fixo", team.get(ana.id).fixed === res.doc.fixed && !!res.doc.fixed);
  res.undo();
  check("joinTeam: o desfazer tira a pessoa", !team.get(ana.id));
  check("joinTeam: o desfazer tira o fixo", !finance.get(res.doc.fixed));

  const beto = personDoc({ name: "Beto", role: "dev", cost: 200000 }, null).doc;
  const r2 = joinTeam(team, cash, beto, false);
  check("joinTeam: sem launch, nenhum fixo", r2.doc.fixed === "" && !cash.all().some((d) => /Beto/.test(d.name)));
  const caio = personDoc({ name: "Caio", role: "sócio" }, null).doc;
  const r3 = joinTeam(team, cash, caio, true);
  check("joinTeam: sem custo, launch não cria fixo", r3.doc.fixed === "" && plain(r3.line) === "Caio · sócio", r3.line);

  const { doc: delivered } = addDelivery(team.get(beto.id), { text: "a landing", date: "2026-10-18" }, TODAY);
  const n = noteDelivery(team, delivered, TODAY);
  check("noteDelivery: a linha diz quem, o quê e o dia", n.line === "Beto · a landing · 18/10", n.line);
  check("noteDelivery: a entrega fica gravada na pessoa", team.get(beto.id).deliveries.length === 1 && team.get(beto.id).deliveries[0].text === "a landing");
  n.undo();
  check("noteDelivery: o desfazer devolve a pessoa sem a entrega, e ela continua no time", !!team.get(beto.id) && team.get(beto.id).deliveries.length === 0);

  const novo = addDelivery(personDoc({ name: "Duda" }, null).doc, { text: "o logo" }, TODAY).doc;
  const n2 = noteDelivery(team, novo, TODAY);
  check("noteDelivery: a pessoa que nasce com a entrega entra no time", !!team.get(novo.id) && n2.line === "Duda · o logo", n2.line);
  n2.undo();
  check("noteDelivery: o desfazer apaga a pessoa que nasceu com a entrega", !team.get(novo.id));
}

/* ---- as ações team-add e team-delivery da conversa (assistant-actions.js) ----
   o buildDoc e o previewOf usam o today() do core, o relógio de verdade */
{
  const { today, addDays } = await import("./core.js");
  const { ACTION_COLLECTIONS, ACTION_LABELS, ACTION_DONE, ACTION_FIELDS, previewOf, buildDoc } = await import("./assistant-actions.js");
  const t = today(), ontem = addDays(t, -1), amanha = addDays(t, 1);
  const list = [person("a1", "Ana", { role: "design" }), person("b1", "Beto"), person("x1", "Xavier", { archived: true })];
  const store = { all: () => list, get: (id) => list.find((p) => p.id === id) || null };

  check("team-add e team-delivery gravam na coleção team", ACTION_COLLECTIONS["team-add"] === "team" && ACTION_COLLECTIONS["team-delivery"] === "team");
  check("as pílulas confirmam 'no time' e 'anotado'", ACTION_DONE["team-add"] === "no time" && ACTION_DONE["team-delivery"] === "anotado" && !!ACTION_LABELS["team-add"] && !!ACTION_LABELS["team-delivery"]);

  const add = ACTION_FIELDS["team-add"] || [];
  check("team-add: a caixa tem nome, papel, custo e o fixo no caixa", add.map((f) => f.key).join() === "name,role,cost,launch", add.map((f) => f.key).join());
  const launch = add.find((f) => f.key === "launch");
  check("team-add: com custo, 'lançar como fixo no caixa' vem marcado", launch && launch.type === "check" && launch.initial({ cost: 300000 }) === true && launch.initial({ cost: 0 }) === false);
  check("previewOf: 'Ana · design · R$ 3.000/mês'", plain(previewOf("team-add", { name: "Ana", role: "designer", cost: 300000 })) === "Ana · design · R$ 3.000/mês", previewOf("team-add", { name: "Ana", role: "designer", cost: 300000 }));
  const novo = buildDoc("team-add", {}, { name: "Carla", role: "programadora", cost: 450000, launch: true }, store);
  check("buildDoc team-add: a pessoa nova, com o papel curto e o custo", novo.doc && novo.doc.name === "Carla" && novo.doc.role === "dev" && novo.doc.cost === 450000 && !novo.doc.archived, JSON.stringify(novo));
  check("buildDoc team-add: quem já está no time não entra duas vezes", buildDoc("team-add", {}, { name: "ana", role: "", cost: 0 }, store).error === "Ana já está no time");
  check("buildDoc team-add: quem saiu pode voltar como pessoa nova", !!buildDoc("team-add", {}, { name: "Xavier", role: "", cost: 0 }, store).doc);
  check("buildDoc team-add: sem nome, pergunta", buildDoc("team-add", {}, { name: " ", role: "", cost: 0 }, store).error === ASK_NAME);

  const dl = ACTION_FIELDS["team-delivery"] || [];
  check("team-delivery: a caixa tem quem, o que entregou e dia", dl.map((f) => f.key).join() === "person,text,date", dl.map((f) => f.key).join());
  const who = dl.find((f) => f.key === "person");
  check("team-delivery: 'ana' já vem escolhida", who && who.initial({ name: "ana" }, store) === "a1", who && who.initial({ name: "ana" }, store));
  check("team-delivery: pessoa não encontrada não vem escolhida", who && who.initial({ name: "Zé" }, store) === "");
  const opts = who ? who.options(store, {}, { name: "Zé" }) : [];
  check("team-delivery: o seletor oferece escolher alguém do time ou criar", opts.map((o) => o[0]).join() === ",a1,b1,new" && /Zé/.test(opts[opts.length - 1][1]), JSON.stringify(opts));
  const found = who ? who.options(store, {}, { name: "ana" }) : [];
  check("team-delivery: achada a pessoa, a caixa não oferece criar outra", found.map((o) => o[0]).join() === ",a1,b1", JSON.stringify(found));
  check("previewOf: 'Ana · landing' hoje", previewOf("team-delivery", { name: "Ana", text: "landing", date: t }) === "Ana · landing");
  const ok = buildDoc("team-delivery", { name: "Ana", text: "landing" }, { person: "a1", text: "landing", date: ontem }, store);
  check("buildDoc team-delivery: a entrega anexada com o dia", ok.doc && ok.doc.id === "a1" && ok.doc.deliveries.length === 1 && ok.doc.deliveries[0].day === ontem && ok.doc.deliveries[0].text === "landing", JSON.stringify(ok));
  const nasce = buildDoc("team-delivery", { name: "Zé", text: "o logo" }, { person: "new", text: "o logo", date: t }, store);
  check("buildDoc team-delivery: 'novo no time' cria a pessoa com a entrega", nasce.doc && nasce.doc.name === "Zé" && nasce.doc.deliveries.length === 1 && !store.get(nasce.doc.id), JSON.stringify(nasce));
  check("buildDoc team-delivery: sem escolher ninguém, pede", !!buildDoc("team-delivery", { name: "Zé" }, { person: "", text: "x", date: t }, store).error);
  check("buildDoc team-delivery: quem saiu do time não recebe entrega", !!buildDoc("team-delivery", {}, { person: "x1", text: "x", date: t }, store).error);
  check("buildDoc team-delivery: dia futuro é erro", buildDoc("team-delivery", {}, { person: "a1", text: "x", date: amanha }, store).error === FUTURE);
}

if (failures.length) {
  console.error(failures.length + " falhou(aram), " + passed + " ok:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("team.test.mjs: " + passed + " verificações ok");
