/* testa a alimentação (ticket #65): as contas puras da página meals.html e do verbo
 * "almocei salada". o navegador de mentira sobe antes do import porque o meals-data
 * importa o core, que é módulo de navegador. */

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

const M = await import("./meals-data.js");
const { MEALS, TEXT_MAX, mealOf, mealLabel, normalize, mealDay, mealLine, mealDoc, weekMeals, mealAt } = M;

const TODAY = "2026-10-20";   /* uma terça */
const MONDAY = "2026-10-19";
const FUTURE = "esse dia ainda não chegou";
const ASK_TEXT = "o que você comeu?";

const meal = (id, day, mealId, text, extra) => ({ id, day, meal: mealId, text, createdAt: 1, updatedAt: 1, ...extra });
const ids = (items) => items.map((i) => i.id).join();

/* ---- as constantes ---- */
{
  check("as refeições, na ordem do dia: café, almoço, lanche, jantar",
    MEALS.map((m) => m.id + ":" + m.label).join() === "breakfast:café da manhã,lunch:almoço,snack:lanche,dinner:jantar", JSON.stringify(MEALS));
  check("o texto vai até 120 caracteres", TEXT_MAX === 120, String(TEXT_MAX));
  check("nada de caloria nas refeições", !/calori/i.test(JSON.stringify(MEALS)), JSON.stringify(MEALS));
  check("nada de caloria nos rótulos", MEALS.every((m) => !/calori/i.test(m.label) && !/calori/i.test(m.id)));
}

/* ---- mealOf ---- */
{
  const cases = [
    ["breakfast", "breakfast"], ["lunch", "lunch"], ["snack", "snack"], ["dinner", "dinner"],
    ["almoço", "lunch"], ["Almoco", "lunch"], ["ALMOÇO", "lunch"], ["  almoço  ", "lunch"],
    ["café da manhã", "breakfast"], ["cafe", "breakfast"], ["Café", "breakfast"],
    ["lanche", "snack"], ["Lanche", "snack"],
    ["jantar", "dinner"], ["janta", "dinner"], ["Janta", "dinner"],
    ["", "snack"], ["   ", "snack"], ["brunch", "snack"], ["xyz", "snack"]
  ];
  for (const [v, want] of cases) check("mealOf: '" + v + "' -> " + want, mealOf(v) === want, String(mealOf(v)));
  check("mealOf: indefinido, nulo e número viram lanche", mealOf(undefined) === "snack" && mealOf(null) === "snack" && mealOf(3) === "snack");
}

/* ---- mealLabel ---- */
{
  check("mealLabel: lunch -> almoço", mealLabel("lunch") === "almoço", mealLabel("lunch"));
  check("mealLabel: breakfast -> café da manhã", mealLabel("breakfast") === "café da manhã", mealLabel("breakfast"));
  check("mealLabel: snack -> lanche", mealLabel("snack") === "lanche", mealLabel("snack"));
  check("mealLabel: dinner -> jantar", mealLabel("dinner") === "jantar", mealLabel("dinner"));
  check("mealLabel: id desconhecido -> lanche", mealLabel("brunch") === "lanche" && mealLabel(undefined) === "lanche" && mealLabel("") === "lanche");
}

/* ---- normalize ---- */
{
  const a = normalize({ id: "m1", day: "2026-10-20", meal: "lunch", text: "salada", createdAt: 5, updatedAt: 6 });
  check("normalize: guarda o que veio, com as chaves do documento",
    a.id === "m1" && a.day === "2026-10-20" && a.meal === "lunch" && a.text === "salada" && a.createdAt === 5 && a.updatedAt === 6, JSON.stringify(a));
  check("normalize: o id vira texto", normalize({ id: 7, day: TODAY, meal: "lunch", text: "x" }).id === "7");
  check("normalize: refeição desconhecida vira lanche", normalize({ id: "m", day: TODAY, meal: "brunch", text: "x" }).meal === "snack");
  check("normalize: sem refeição vira lanche", normalize({ id: "m", day: TODAY, text: "x" }).meal === "snack");
  check("normalize: refeição pelo rótulo em português", normalize({ id: "m", day: TODAY, meal: "Almoço", text: "x" }).meal === "lunch");
  check("normalize: dia inválido vira vazio", normalize({ id: "m", day: "ontem", text: "x" }).day === "" && normalize({ id: "m", day: "2026-10-1", text: "x" }).day === "" && normalize({ id: "m", text: "x" }).day === "");
  check("normalize: date vale de reserva quando day não é válido", normalize({ id: "m", date: "2026-10-18", text: "x" }).day === "2026-10-18" && normalize({ id: "m", day: "ontem", date: "2026-10-18", text: "x" }).day === "2026-10-18");
  check("normalize: day válido vence o date", normalize({ id: "m", day: TODAY, date: "2026-10-18", text: "x" }).day === TODAY);
  check("normalize: o texto perde os espaços das pontas", normalize({ id: "m", day: TODAY, text: "  salada  " }).text === "salada");
  check("normalize: o texto colapsa espaços repetidos", normalize({ id: "m", day: TODAY, text: "arroz   com \t feijão" }).text === "arroz com feijão");
  check("normalize: o texto é cortado em 120", normalize({ id: "m", day: TODAY, text: "x".repeat(300) }).text.length === 120);
  check("normalize: o texto de 120 fica inteiro", normalize({ id: "m", day: TODAY, text: "y".repeat(120) }).text === "y".repeat(120));
  check("normalize: sem texto é texto vazio", normalize({ id: "m", day: TODAY }).text === "");
  const c = normalize({ id: "m", day: TODAY, text: "x" });
  check("normalize: sem datas, createdAt e updatedAt vêm preenchidos", typeof c.createdAt === "number" && typeof c.updatedAt === "number", JSON.stringify(c));
  const d = normalize({ id: "m", day: TODAY, text: "x", createdAt: 9 });
  check("normalize: sem updatedAt, usa o createdAt", d.createdAt === 9 && d.updatedAt === 9, JSON.stringify(d));
}

/* ---- mealDay ---- */
{
  check("mealDay: sem dia dito é hoje", mealDay({}, TODAY).day === TODAY && !mealDay({}, TODAY).error, JSON.stringify(mealDay({}, TODAY)));
  check("mealDay: date dito vale", mealDay({ date: MONDAY }, TODAY).day === MONDAY && !mealDay({ date: MONDAY }, TODAY).error, JSON.stringify(mealDay({ date: MONDAY }, TODAY)));
  check("mealDay: day dito vale", mealDay({ day: MONDAY }, TODAY).day === MONDAY, JSON.stringify(mealDay({ day: MONDAY }, TODAY)));
  check("mealDay: dia inválido vira hoje", mealDay({ date: "ontem" }, TODAY).day === TODAY && !mealDay({ date: "ontem" }, TODAY).error);
  check("mealDay: o próprio hoje não é futuro", !mealDay({ date: TODAY }, TODAY).error);
  const f = mealDay({ date: "2026-10-21" }, TODAY);
  check("mealDay: dia futuro dá erro, com o dia", f.day === "2026-10-21" && f.error === FUTURE, JSON.stringify(f));
  check("mealDay: day futuro também dá erro", mealDay({ day: "2026-11-01" }, TODAY).error === FUTURE);
}

/* ---- mealLine ---- */
{
  check("mealLine: de hoje, sem data", mealLine(meal("a", TODAY, "lunch", "salada"), TODAY) === "almoço · salada", mealLine(meal("a", TODAY, "lunch", "salada"), TODAY));
  check("mealLine: de outro dia, com dd/mm no fim", mealLine(meal("a", "2026-10-19", "lunch", "salada"), TODAY) === "almoço · salada · 19/10", mealLine(meal("a", "2026-10-19", "lunch", "salada"), TODAY));
  check("mealLine: usa o rótulo da refeição", mealLine(meal("a", TODAY, "breakfast", "pão"), TODAY) === "café da manhã · pão", mealLine(meal("a", TODAY, "breakfast", "pão"), TODAY));
  check("mealLine: refeição desconhecida aparece como lanche", mealLine(meal("a", TODAY, "brunch", "bolo"), TODAY) === "lanche · bolo", mealLine(meal("a", TODAY, "brunch", "bolo"), TODAY));
  check("mealLine: dia e mês com zero à esquerda", mealLine(meal("a", "2026-03-05", "dinner", "sopa"), TODAY) === "jantar · sopa · 05/03", mealLine(meal("a", "2026-03-05", "dinner", "sopa"), TODAY));
}

/* ---- mealDoc ---- */
{
  const r = mealDoc({ date: TODAY, meal: "lunch", text: "salada" }, null, TODAY);
  check("mealDoc: cria o documento, só com as chaves combinadas",
    !r.error && r.doc && Object.keys(r.doc).sort().join() === "createdAt,day,id,meal,text,updatedAt", JSON.stringify(r));
  check("mealDoc: o documento guarda dia, refeição e texto", r.doc.day === TODAY && r.doc.meal === "lunch" && r.doc.text === "salada", JSON.stringify(r.doc));
  check("mealDoc: id novo e datas preenchidas", typeof r.doc.id === "string" && r.doc.id.length > 0 && typeof r.doc.createdAt === "number" && typeof r.doc.updatedAt === "number", JSON.stringify(r.doc));
  const r2 = mealDoc({ date: TODAY, meal: "lunch", text: "salada" }, null, TODAY);
  check("mealDoc: cada criação ganha um id diferente", r.doc.id !== r2.doc.id, r.doc.id + " " + r2.doc.id);

  check("mealDoc: sem dia dito grava hoje", mealDoc({ meal: "dinner", text: "sopa" }, null, TODAY).doc.day === TODAY);
  check("mealDoc: aceita day no lugar de date", mealDoc({ day: MONDAY, meal: "dinner", text: "sopa" }, null, TODAY).doc.day === MONDAY);
  check("mealDoc: dia passado vale", mealDoc({ date: MONDAY, meal: "dinner", text: "sopa" }, null, TODAY).doc.day === MONDAY);
  check("mealDoc: refeição pelo rótulo", mealDoc({ date: TODAY, meal: "janta", text: "sopa" }, null, TODAY).doc.meal === "dinner");
  check("mealDoc: refeição desconhecida vira lanche", mealDoc({ date: TODAY, meal: "brunch", text: "bolo" }, null, TODAY).doc.meal === "snack");
  check("mealDoc: sem refeição vira lanche", mealDoc({ date: TODAY, text: "bolo" }, null, TODAY).doc.meal === "snack");
  check("mealDoc: o texto é limpo", mealDoc({ date: TODAY, meal: "lunch", text: "  arroz   e  feijão " }, null, TODAY).doc.text === "arroz e feijão");
  check("mealDoc: o texto é cortado em 120", mealDoc({ date: TODAY, meal: "lunch", text: "z".repeat(500) }, null, TODAY).doc.text.length === 120);

  const fut = mealDoc({ date: "2026-10-21", meal: "lunch", text: "salada" }, null, TODAY);
  check("mealDoc: dia futuro dá erro e não dá documento", fut.error === FUTURE && !fut.doc, JSON.stringify(fut));
  const fut2 = mealDoc({ date: "2026-10-21", meal: "lunch", text: "" }, null, TODAY);
  check("mealDoc: futuro vence texto vazio", fut2.error === FUTURE && !fut2.doc, JSON.stringify(fut2));

  for (const text of ["", "   ", undefined, " \t "]) {
    const e = mealDoc({ date: TODAY, meal: "lunch", text }, null, TODAY);
    check("mealDoc: texto vazio (" + JSON.stringify(text) + ") pergunta o que comeu", e.error === ASK_TEXT && !e.doc, JSON.stringify(e));
  }

  const before = { id: "keep", day: "2026-10-18", meal: "lunch", text: "velho", createdAt: 100, updatedAt: 100 };
  const e = mealDoc({ date: MONDAY, meal: "dinner", text: "novo" }, before, TODAY);
  check("mealDoc: com before mantém id e createdAt", !e.error && e.doc.id === "keep" && e.doc.createdAt === 100, JSON.stringify(e));
  check("mealDoc: com before renova updatedAt", e.doc.updatedAt > 100, JSON.stringify(e.doc));
  check("mealDoc: com before troca dia, refeição e texto", e.doc.day === MONDAY && e.doc.meal === "dinner" && e.doc.text === "novo", JSON.stringify(e.doc));
  check("mealDoc: com before ainda só as chaves combinadas", Object.keys(e.doc).sort().join() === "createdAt,day,id,meal,text,updatedAt", JSON.stringify(e.doc));
  const ef = mealDoc({ date: "2026-10-21", meal: "dinner", text: "novo" }, before, TODAY);
  check("mealDoc: editar para o futuro também dá erro", ef.error === FUTURE && !ef.doc);
  const ee = mealDoc({ date: MONDAY, meal: "dinner", text: " " }, before, TODAY);
  check("mealDoc: editar para texto vazio também pergunta", ee.error === ASK_TEXT && !ee.doc);
}

/* ---- weekMeals ---- */
{
  const docs = [
    meal("jan", MONDAY, "dinner", "sopa", { createdAt: 4 }),
    meal("lan", MONDAY, "snack", "fruta", { createdAt: 3 }),
    meal("alm", MONDAY, "lunch", "arroz", { createdAt: 2 }),
    meal("caf", MONDAY, "breakfast", "pão", { createdAt: 1 })
  ];
  const w = weekMeals(docs, MONDAY);
  check("weekMeals: devolve 7 dias, de segunda a domingo",
    w.length === 7 && w.map((d) => d.day).join() === "2026-10-19,2026-10-20,2026-10-21,2026-10-22,2026-10-23,2026-10-24,2026-10-25", w.map((d) => d.day).join());
  check("weekMeals: cada dia tem a lista items", w.every((d) => Array.isArray(d.items)));
  check("weekMeals: ordena café, almoço, lanche, jantar, mesmo inserido fora de ordem", ids(w[0].items) === "caf,alm,lan,jan", ids(w[0].items));
  check("weekMeals: dias sem refeição ficam com lista vazia", w.slice(1).every((d) => d.items.length === 0));

  const same = weekMeals([
    meal("c", TODAY, "lunch", "terceiro", { createdAt: 30 }),
    meal("a", TODAY, "lunch", "primeiro", { createdAt: 10 }),
    meal("b", TODAY, "lunch", "segundo", { createdAt: 20 })
  ], MONDAY);
  check("weekMeals: na mesma refeição ordena por createdAt", ids(same[1].items) === "a,b,c", ids(same[1].items));

  const mix = weekMeals([
    meal("j2", TODAY, "dinner", "b", { createdAt: 1 }),
    meal("l2", TODAY, "lunch", "b", { createdAt: 9 }),
    meal("l1", TODAY, "lunch", "a", { createdAt: 2 }),
    meal("c1", TODAY, "breakfast", "a", { createdAt: 50 })
  ], MONDAY);
  check("weekMeals: a refeição pesa mais que a hora de criação", ids(mix[1].items) === "c1,l1,l2,j2", ids(mix[1].items));

  const bounds = weekMeals([
    meal("seg", MONDAY, "lunch", "x"),
    meal("dom", "2026-10-25", "lunch", "x"),
    meal("antes", "2026-10-18", "lunch", "x"),
    meal("depois", "2026-10-26", "lunch", "x")
  ], MONDAY);
  check("weekMeals: segunda e domingo entram", ids(bounds[0].items) === "seg" && ids(bounds[6].items) === "dom", ids(bounds[0].items) + " " + ids(bounds[6].items));
  check("weekMeals: outra semana não entra", bounds.reduce((n, d) => n + d.items.length, 0) === 2, JSON.stringify(bounds.map((d) => ids(d.items))));

  const tomb = weekMeals([
    meal("vivo", TODAY, "lunch", "x"),
    meal("morto", TODAY, "lunch", "x", { deleted: true }),
    meal("morto2", TODAY, "dinner", "x", { deleted: 1700000000000 })
  ], MONDAY);
  check("weekMeals: lápide não entra", ids(tomb[1].items) === "vivo", ids(tomb[1].items));

  const junk = weekMeals([
    meal("vazio", TODAY, "lunch", ""),
    meal("branco", TODAY, "lunch", "   "),
    { day: TODAY, meal: "lunch", text: "sem id" },
    meal("diaruim", "ontem", "lunch", "x"),
    meal("sodia", undefined, "lunch", "x"),
    meal("ok", TODAY, "lunch", "x")
  ], MONDAY);
  check("weekMeals: sem texto, sem id ou sem dia válido não entra", ids(junk[1].items) === "ok" && junk.reduce((n, d) => n + d.items.length, 0) === 1, JSON.stringify(junk.map((d) => ids(d.items))));

  const reserve = weekMeals([{ id: "r", date: TODAY, meal: "lunch", text: "x", createdAt: 1 }], MONDAY);
  check("weekMeals: date vale de reserva para day", ids(reserve[1].items) === "r", JSON.stringify(reserve.map((d) => ids(d.items))));

  const unk = weekMeals([
    meal("desc", TODAY, "brunch", "x", { createdAt: 1 }),
    meal("jan", TODAY, "dinner", "x", { createdAt: 1 }),
    meal("alm", TODAY, "lunch", "x", { createdAt: 1 }),
    meal("lan", TODAY, "snack", "x", { createdAt: 2 })
  ], MONDAY);
  check("weekMeals: refeição desconhecida conta como lanche", ids(unk[1].items) === "alm,desc,lan,jan", ids(unk[1].items));

  const mes = weekMeals([meal("a", "2026-10-26", "lunch", "x"), meal("b", "2026-11-01", "dinner", "x"), meal("c", "2026-10-25", "lunch", "x")], "2026-10-26");
  check("weekMeals: a semana vira o mês (26/10 a 01/11)", mes.map((d) => d.day).join() === "2026-10-26,2026-10-27,2026-10-28,2026-10-29,2026-10-30,2026-10-31,2026-11-01", mes.map((d) => d.day).join());
  check("weekMeals: virada de mês pega o dia 01/11 e deixa 25/10 de fora", ids(mes[0].items) === "a" && ids(mes[6].items) === "b" && mes.reduce((n, d) => n + d.items.length, 0) === 2, JSON.stringify(mes.map((d) => ids(d.items))));

  check("weekMeals: sem lista não quebra", weekMeals(undefined, MONDAY).length === 7 && weekMeals(null, MONDAY).every((d) => d.items.length === 0));
  check("weekMeals: lista vazia dá 7 dias vazios", weekMeals([], MONDAY).length === 7 && weekMeals([], MONDAY).every((d) => d.items.length === 0));

  const before = JSON.stringify(docs);
  weekMeals(docs, MONDAY);
  check("weekMeals: não muda a lista de entrada", JSON.stringify(docs) === before);
}

/* ---- mealAt ---- */
{
  const cases = [
    [0, "dinner"], [3, "dinner"], [4, "dinner"], [5, "breakfast"], [7, "breakfast"], [10, "breakfast"],
    [11, "lunch"], [12, "lunch"], [14, "lunch"], [15, "snack"], [16, "snack"], [17, "snack"],
    [18, "dinner"], [20, "dinner"], [23, "dinner"],
    ["07:30", "breakfast"], ["10:59", "breakfast"], ["11:00", "lunch"], ["12:30", "lunch"], ["14:59", "lunch"],
    ["15:00", "snack"], ["17:45", "snack"], ["18:00", "dinner"], ["21:15", "dinner"], ["02:00", "dinner"], ["05:00", "breakfast"],
    ["9:05", "breakfast"]
  ];
  for (const [h, want] of cases) check("mealAt: " + JSON.stringify(h) + " -> " + want, mealAt(h) === want, String(mealAt(h)));
  const bad = [undefined, null, "", "abc", "25:00", 24, -1, NaN, "12:99"];
  for (const h of bad) check("mealAt: inválido " + String(h) + " -> snack", mealAt(h) === "snack", String(mealAt(h)));
}

/* ---- a ação meal-log da conversa (assistant-actions.js) ----
   o buildDoc e o previewOf usam o today() do core, o relógio de verdade */
{
  const { today, addDays } = await import("./core.js");
  const { ACTION_COLLECTIONS, ACTION_LABELS, ACTION_DONE, ACTION_FIELDS, previewOf, buildDoc } = await import("./assistant-actions.js");
  const t = today(), ontem = addDays(t, -1), amanha = addDays(t, 1);
  const dm = ontem.slice(8, 10) + "/" + ontem.slice(5, 7);
  check("meal-log: grava na coleção meals", ACTION_COLLECTIONS["meal-log"] === "meals", String(ACTION_COLLECTIONS["meal-log"]));
  check("meal-log: o rótulo e o 'anotado' da pílula", ACTION_LABELS["meal-log"] === "anotar refeição" && ACTION_DONE["meal-log"] === "anotado");
  const fields = ACTION_FIELDS["meal-log"] || [];
  check("meal-log: a caixa tem refeição, o que comeu e dia", fields.map((f) => f.label).join() === "refeição,o que comeu,dia", fields.map((f) => f.label).join());
  const pick = fields.find((f) => f.key === "pick");
  check("meal-log: a refeição é um seletor com as quatro, na ordem do dia", pick && pick.type === "select" && pick.options().map((o) => o[1]).join() === "café da manhã,almoço,lanche,jantar");
  check("meal-log: o que a IA manda fora das quatro abre a caixa como lanche", pick && pick.initial({ meal: "brunch" }) === "snack" && pick.initial({ meal: "dinner" }) === "dinner" && pick.initial({ meal: "almoço" }) === "lunch");
  check("meal-log: nenhum campo fala de caloria", !/calori/i.test(JSON.stringify(fields.map((f) => f.label))));

  check("previewOf: 'almoço · salada' hoje", previewOf("meal-log", { meal: "lunch", text: "salada", date: t }) === "almoço · salada", previewOf("meal-log", { meal: "lunch", text: "salada", date: t }));
  check("previewOf: ontem leva a data no fim", previewOf("meal-log", { meal: "dinner", text: "pizza", date: ontem }) === "jantar · pizza · " + dm, previewOf("meal-log", { meal: "dinner", text: "pizza", date: ontem }));
  check("previewOf: a escolha da caixa vence a da IA", previewOf("meal-log", { meal: "lunch", pick: "snack", text: "maçã", date: t }) === "lanche · maçã");
  check("previewOf: dia futuro avisa", previewOf("meal-log", { meal: "lunch", text: "salada", date: amanha }) === FUTURE);
  check("previewOf: sem o que comeu, diz o que falta", previewOf("meal-log", { meal: "lunch", text: "", date: t }) === "falta o que comeu");

  const ok = buildDoc("meal-log", { meal: "dinner", text: "pizza", date: ontem }, { pick: "dinner", text: "pizza", date: ontem }, null);
  check("buildDoc: 'ontem jantei pizza' vira o documento de ontem", ok.doc && ok.doc.day === ontem && ok.doc.meal === "dinner" && ok.doc.text === "pizza" && !ok.error, JSON.stringify(ok));
  check("buildDoc: o documento só tem as chaves da refeição", ok.doc && Object.keys(ok.doc).sort().join() === "createdAt,day,id,meal,text,updatedAt", JSON.stringify(Object.keys(ok.doc || {})));
  const trocou = buildDoc("meal-log", { meal: "lunch", text: "maçã" }, { pick: "snack", text: "maçã", date: t }, null);
  check("buildDoc: a refeição trocada na caixa é a que grava", trocou.doc && trocou.doc.meal === "snack" && trocou.doc.day === t, JSON.stringify(trocou));
  check("buildDoc: dia futuro é erro", buildDoc("meal-log", { meal: "lunch", text: "salada" }, { pick: "lunch", text: "salada", date: amanha }, null).error === FUTURE);
  check("buildDoc: texto vazio pede o que comeu", buildDoc("meal-log", { meal: "lunch", text: "salada" }, { pick: "lunch", text: "  ", date: t }, null).error === ASK_TEXT);
}

if (failures.length) {
  console.error(failures.length + " falhou(aram), " + passed + " ok:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("meals.test.mjs: " + passed + " verificações ok");
