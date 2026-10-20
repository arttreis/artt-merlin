/* testa a operação (ticket #79): as contas puras da página ops.html (prazo,
 * período, "feito"), o achar-pelo-que-a-pessoa-disse e as ações op-add e op-done
 * da conversa. o navegador de mentira sobe antes do import porque o ops-data
 * importa o core, que é módulo de navegador. as datas são fixas (terça,
 * 20/10/2026, numa semana de seg 19 a dom 25), para o teste não depender de
 * quando roda. */

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

const O = await import("./ops-data.js");
const { FREQS, normalize, periodOf, dueOn, isDone, dueBetween, pendingOn, freqLabel, periodLabel, doneLine, markDone, unmarkDone, parseDay, dayText, opDoc, findOp, OPS_TEMPLATES } = O;

const TODAY = "2026-10-20";   /* uma terça */
const FUTURE = "esse dia ainda não chegou";
const ASK_DAY = "qual dia? (5, seg ou 15/03)";
const ASK_NAME = "o processo precisa de um nome";

/* uma data de criação bem antes de tudo (1º de janeiro de 2026) */
const LONG_AGO = new Date(2026, 0, 1, 9, 0).getTime();
let seq = 0;
const op = (over = {}) => normalize({ id: "o" + (++seq), title: "processo " + seq, freq: "monthly", day: 5, createdAt: LONG_AGO, updatedAt: LONG_AGO, ...over });
const titles = (list) => list.map((x) => x.op.title).join();
const dues = (list) => list.map((x) => x.due).join();

/* ---- as constantes ---- */
{
  check("FREQS: todo mês, toda semana, todo ano", FREQS.map((f) => f.id + ":" + f.label).join() === "monthly:todo mês,weekly:toda semana,yearly:todo ano", JSON.stringify(FREQS));
}

/* ---- normalize ---- */
{
  const a = normalize({ id: "o1", title: "emitir notas", freq: "monthly", day: 5, checklist: [], done: ["2026-10-03"], createdAt: 5, updatedAt: 6 });
  check("normalize: guarda o que veio", a.id === "o1" && a.title === "emitir notas" && a.freq === "monthly" && a.day === 5 && a.createdAt === 5 && a.updatedAt === 6 && a.done.join() === "2026-10-03", JSON.stringify(a));
  check("normalize: o título perde os espaços das pontas", normalize({ id: "x", title: "  backup  " }).title === "backup");
  check("normalize: o título é cortado em 80", normalize({ id: "x", title: "z".repeat(200) }).title.length === 80);
  check("normalize: sem título vira vazio", normalize({ id: "x" }).title === "");

  check("normalize: freq fora da lista vira mensal", normalize({ id: "x", title: "a", freq: "daily" }).freq === "monthly" && normalize({ id: "x", title: "a" }).freq === "monthly");
  check("normalize: as três frequências ficam", ["monthly", "weekly", "yearly"].every((f) => normalize({ id: "x", title: "a", freq: f }).freq === f));

  /* day: o padrão de cada frequência */
  check("normalize: mensal sem dia vira 1", normalize({ id: "x", title: "a", freq: "monthly" }).day === 1);
  check("normalize: semanal sem dia vira 1 (segunda)", normalize({ id: "x", title: "a", freq: "weekly" }).day === 1);
  check("normalize: anual sem dia vira 01-01", normalize({ id: "x", title: "a", freq: "yearly" }).day === "01-01");
  check("normalize: mensal com lixo vira 1", normalize({ id: "x", title: "a", freq: "monthly", day: "abc" }).day === 1);
  check("normalize: mensal acima de 31 é preso em 31", normalize({ id: "x", title: "a", freq: "monthly", day: 40 }).day === 31, String(normalize({ id: "x", title: "a", freq: "monthly", day: 40 }).day));
  check("normalize: mensal abaixo de 1 é preso em 1", normalize({ id: "x", title: "a", freq: "monthly", day: 0 }).day === 1 && normalize({ id: "x", title: "a", freq: "monthly", day: -3 }).day === 1);
  check("normalize: mensal 31 fica 31", normalize({ id: "x", title: "a", freq: "monthly", day: 31 }).day === 31);
  check("normalize: semanal 0 (domingo) a 6 (sábado) ficam", [0, 1, 2, 3, 4, 5, 6].every((d) => normalize({ id: "x", title: "a", freq: "weekly", day: d }).day === d));
  check("normalize: semanal fora de 0..6 vira o padrão", normalize({ id: "x", title: "a", freq: "weekly", day: 9 }).day === 1 && normalize({ id: "x", title: "a", freq: "weekly", day: -1 }).day === 1);
  check("normalize: semanal com o dia no formato de anual vira o padrão", normalize({ id: "x", title: "a", freq: "weekly", day: "03-15" }).day === 1);
  check("normalize: anual válido fica", normalize({ id: "x", title: "a", freq: "yearly", day: "03-15" }).day === "03-15");
  check("normalize: anual 02-29 vale (ano bissexto)", normalize({ id: "x", title: "a", freq: "yearly", day: "02-29" }).day === "02-29");
  check("normalize: anual impossível vira 01-01", ["02-30", "13-01", "xx", "3-15", "00-10", 5].every((d) => normalize({ id: "x", title: "a", freq: "yearly", day: d }).day === "01-01"));

  /* checklist */
  const c = normalize({ id: "x", title: "a", checklist: [{ id: "k1", text: "conferir" }, { text: "sem id" }, { id: "k3", text: "" }, { id: "k4", text: "   " }, null, {}] }).checklist;
  check("normalize: a lista de passos só guarda os que têm texto", c.length === 2, JSON.stringify(c));
  check("normalize: o passo mantém o id", c[0].id === "k1" && c[0].text === "conferir", JSON.stringify(c));
  check("normalize: o passo sem id ganha um", typeof c[1].id === "string" && c[1].id.length > 0 && c[1].text === "sem id", JSON.stringify(c));
  check("normalize: sem lista de passos, lista vazia", Array.isArray(normalize({ id: "x", title: "a" }).checklist) && normalize({ id: "x", title: "a" }).checklist.length === 0 && normalize({ id: "x", title: "a", checklist: "x" }).checklist.length === 0);

  /* done */
  const d = normalize({ id: "x", title: "a", done: ["2026-10-20", "2026-10-03", "2026-10-03", "ontem", "2026-02-30", 5, null, "2026-9-1"] }).done;
  check("normalize: done só guarda datas válidas, únicas e ordenadas", d.join() === "2026-10-03,2026-10-20", d.join());
  check("normalize: done que não é lista vira lista vazia", normalize({ id: "x", title: "a", done: "2026-10-03" }).done.length === 0 && normalize({ id: "x", title: "a" }).done.length === 0);

  /* datas e lápide */
  const e = normalize({ id: "x", title: "a" });
  check("normalize: sem datas, createdAt e updatedAt vêm preenchidos", typeof e.createdAt === "number" && typeof e.updatedAt === "number", JSON.stringify(e));
  check("normalize: lápide é preservada", normalize({ id: "x", title: "a", deleted: true }).deleted === true);

  const once = normalize({ id: "o9", title: " backup ", freq: "weekly", day: 5, checklist: [{ text: "um" }], done: ["2026-10-03"], createdAt: 7, updatedAt: 8 });
  check("normalize: é idempotente", JSON.stringify(normalize(once)) === JSON.stringify(once), JSON.stringify(once) + " " + JSON.stringify(normalize(once)));
}

/* ---- periodOf ---- */
{
  check("periodOf: mensal é AAAA-MM", periodOf(op({ freq: "monthly" }), "2026-10-20") === "2026-10", periodOf(op({ freq: "monthly" }), "2026-10-20"));
  check("periodOf: mensal, 1º e último dia do mês são o mesmo período", periodOf(op({ freq: "monthly" }), "2026-10-01") === periodOf(op({ freq: "monthly" }), "2026-10-31"));
  check("periodOf: mensal, meses diferentes são períodos diferentes", periodOf(op({ freq: "monthly" }), "2026-10-31") !== periodOf(op({ freq: "monthly" }), "2026-11-01"));
  const w = op({ freq: "weekly", day: 5 });
  check("periodOf: semanal é a segunda-feira da semana ISO", periodOf(w, "2026-10-20") === "2026-10-19" && periodOf(w, "2026-10-19") === "2026-10-19", periodOf(w, "2026-10-20"));
  check("periodOf: semanal, o domingo ainda é da semana que começou na segunda", periodOf(w, "2026-10-25") === "2026-10-19", periodOf(w, "2026-10-25"));
  check("periodOf: semanal, a segunda seguinte abre outro período", periodOf(w, "2026-10-26") === "2026-10-26", periodOf(w, "2026-10-26"));
  check("periodOf: semanal vira o ano pela segunda", periodOf(w, "2027-01-01") === "2026-12-28", periodOf(w, "2027-01-01"));
  const y = op({ freq: "yearly", day: "03-15" });
  check("periodOf: anual é AAAA", periodOf(y, "2026-10-20") === "2026" && periodOf(y, "2026-01-01") === "2026" && periodOf(y, "2027-01-01") === "2027", periodOf(y, "2026-10-20"));
}

/* ---- dueOn ---- */
{
  const m31 = op({ freq: "monthly", day: 31 });
  check("dueOn: mensal dia 31 em novembro vence dia 30", dueOn(m31, "2026-11-10") === "2026-11-30", dueOn(m31, "2026-11-10"));
  check("dueOn: mensal dia 31 em fevereiro de 2027 vence dia 28", dueOn(m31, "2027-02-15") === "2027-02-28", dueOn(m31, "2027-02-15"));
  check("dueOn: mensal dia 31 em fevereiro bissexto (2028) vence dia 29", dueOn(m31, "2028-02-01") === "2028-02-29", dueOn(m31, "2028-02-01"));
  check("dueOn: mensal dia 31 em outubro vence dia 31", dueOn(m31, "2026-10-05") === "2026-10-31", dueOn(m31, "2026-10-05"));
  const m5 = op({ freq: "monthly", day: 5 });
  check("dueOn: mensal dia 5 vence no dia 5 do mês de `day`, mesmo se já passou", dueOn(m5, "2026-10-20") === "2026-10-05" && dueOn(m5, "2026-10-05") === "2026-10-05" && dueOn(m5, "2026-10-31") === "2026-10-05", dueOn(m5, "2026-10-20"));
  const m30 = op({ freq: "monthly", day: 30 });
  check("dueOn: mensal dia 30 em fevereiro vence no último dia", dueOn(m30, "2027-02-02") === "2027-02-28" && dueOn(m30, "2026-04-10") === "2026-04-30");

  const fri = op({ freq: "weekly", day: 5 });
  check("dueOn: semanal sexta, numa terça, vence a sexta da mesma semana", dueOn(fri, "2026-10-20") === "2026-10-23", dueOn(fri, "2026-10-20"));
  check("dueOn: semanal sexta, num domingo, ainda é a sexta que passou", dueOn(fri, "2026-10-25") === "2026-10-23", dueOn(fri, "2026-10-25"));
  check("dueOn: semanal sexta, na segunda seguinte, é a sexta da semana nova", dueOn(fri, "2026-10-26") === "2026-10-30", dueOn(fri, "2026-10-26"));
  const sun = op({ freq: "weekly", day: 0 });
  check("dueOn: semanal domingo vence no domingo do fim da semana ISO", dueOn(sun, "2026-10-20") === "2026-10-25" && dueOn(sun, "2026-10-19") === "2026-10-25" && dueOn(sun, "2026-10-25") === "2026-10-25", dueOn(sun, "2026-10-20"));
  const mon = op({ freq: "weekly", day: 1 });
  check("dueOn: semanal segunda vence na segunda da própria semana", dueOn(mon, "2026-10-20") === "2026-10-19" && dueOn(mon, "2026-10-25") === "2026-10-19");
  const sat = op({ freq: "weekly", day: 6 });
  check("dueOn: semanal sábado", dueOn(sat, "2026-10-20") === "2026-10-24", dueOn(sat, "2026-10-20"));
  check("dueOn: semanal atravessa o fim do ano", dueOn(fri, "2026-12-30") === "2027-01-01", dueOn(fri, "2026-12-30"));

  const y = op({ freq: "yearly", day: "03-15" });
  check("dueOn: anual vence na data do ano de `day`", dueOn(y, "2026-10-20") === "2026-03-15" && dueOn(y, "2027-01-01") === "2027-03-15", dueOn(y, "2026-10-20"));
  const y29 = op({ freq: "yearly", day: "02-29" });
  check("dueOn: anual 02-29 em ano comum vence dia 28", dueOn(y29, "2027-06-01") === "2027-02-28", dueOn(y29, "2027-06-01"));
  check("dueOn: anual 02-29 em ano bissexto vence dia 29", dueOn(y29, "2028-06-01") === "2028-02-29", dueOn(y29, "2028-06-01"));
}

/* ---- isDone ---- */
{
  const m = op({ freq: "monthly", day: 5, done: ["2026-10-03"] });
  check("isDone: mensal, feito no mês, vale o mês inteiro", isDone(m, "2026-10-28") && isDone(m, "2026-10-01") && isDone(m, "2026-10-03"));
  check("isDone: mensal, o mês seguinte não está feito", !isDone(m, "2026-11-02"));
  check("isDone: mensal, o mês anterior não está feito", !isDone(m, "2026-09-30"));
  check("isDone: sem nada em done, não está feito", !isDone(op({ freq: "monthly" }), TODAY));

  const w = op({ freq: "weekly", day: 5, done: ["2026-10-25"] });
  check("isDone: semanal, feito no domingo, vale a semana de segunda a domingo", isDone(w, "2026-10-19") && isDone(w, "2026-10-22") && isDone(w, "2026-10-25"));
  check("isDone: semanal, a segunda seguinte não está feita", !isDone(w, "2026-10-26") && !isDone(w, "2026-10-18"));

  const y = op({ freq: "yearly", day: "03-15", done: ["2026-03-02"] });
  check("isDone: anual, feito em março, vale o ano", isDone(y, "2026-12-31") && isDone(y, "2026-01-01"));
  check("isDone: anual, o ano seguinte não está feito", !isDone(y, "2027-01-01") && !isDone(y, "2025-12-31"));
}

/* ---- dueBetween ---- */
{
  const m22 = op({ title: "emitir notas", freq: "monthly", day: 22 });
  const friBackup = op({ title: "backup", freq: "weekly", day: 5 });
  const m5 = op({ title: "pagar DAS", freq: "monthly", day: 5 });
  const r = dueBetween([m22, friBackup, m5], "2026-10-20", "2026-10-26");
  check("dueBetween: 7 dias pegam o dia 22 e a sexta 23, e só", r.length === 2 && titles(r) === "emitir notas,backup" && dues(r) === "2026-10-22,2026-10-23", titles(r) + " " + dues(r));
  check("dueBetween: cada item traz op, due e done", r.every((x) => x.op && typeof x.due === "string" && typeof x.done === "boolean"), JSON.stringify(r));
  check("dueBetween: o item carrega o processo", r[0].op.id === m22.id && r[1].op.id === friBackup.id);
  check("dueBetween: nada feito, done é falso", r.every((x) => x.done === false));

  const feito = dueBetween([op({ title: "emitir notas", freq: "monthly", day: 22, done: ["2026-10-03"] }), friBackup], "2026-10-20", "2026-10-26");
  check("dueBetween: done diz se o período já foi feito", feito[0].done === true && feito[1].done === false, JSON.stringify(feito.map((x) => x.done)));

  check("dueBetween: os extremos entram (inclusivo)", dues(dueBetween([m22], "2026-10-22", "2026-10-22")) === "2026-10-22" && dues(dueBetween([m22], "2026-10-15", "2026-10-22")) === "2026-10-22" && dues(dueBetween([m22], "2026-10-22", "2026-10-30")) === "2026-10-22");
  check("dueBetween: um dia fora da janela não entra", dueBetween([m22], "2026-10-23", "2026-10-30").length === 0 && dueBetween([m22], "2026-10-10", "2026-10-21").length === 0);

  const mon = op({ title: "relatório mensal", freq: "weekly", day: 1 });
  check("dueBetween: semanal segunda numa janela terça a segunda dá só a segunda 26", dues(dueBetween([mon], "2026-10-20", "2026-10-26")) === "2026-10-26", dues(dueBetween([mon], "2026-10-20", "2026-10-26")));
  const sunOp = op({ title: "revisar erros", freq: "weekly", day: 0 });
  check("dueBetween: semanal domingo numa janela terça a segunda dá só o domingo 25", dues(dueBetween([sunOp], "2026-10-20", "2026-10-26")) === "2026-10-25");

  /* janela que vira o mês */
  const d1 = op({ title: "cobrança", freq: "monthly", day: 1 });
  const d31 = op({ title: "fechar caixa", freq: "monthly", day: 31 });
  const turn = dueBetween([d1, d31, m5, m22], "2026-10-28", "2026-11-03");
  check("dueBetween: janela que vira o mês pega o dia 31 e o dia 1 do mês seguinte", titles(turn) === "fechar caixa,cobrança" && dues(turn) === "2026-10-31,2026-11-01", titles(turn) + " " + dues(turn));
  check("dueBetween: dia 1 na virada vence em 2026-11-01", turn.find((x) => x.op.title === "cobrança").due === "2026-11-01");
  check("dueBetween: o feito é do período de cada prazo", dueBetween([op({ freq: "monthly", day: 1, done: ["2026-10-29"] })], "2026-10-28", "2026-11-03")[0].done === false);
  check("dueBetween: dia 31 em novembro cai no 30 dentro de uma janela de novembro", dues(dueBetween([d31], "2026-11-25", "2026-12-01")) === "2026-11-30");

  /* janela que vira o ano */
  const ny = op({ title: "renovar domínio", freq: "yearly", day: "01-01" });
  check("dueBetween: janela que vira o ano pega o anual de 1º de janeiro", dues(dueBetween([ny], "2026-12-30", "2027-01-02")) === "2027-01-01");
  check("dueBetween: anual de outra data não entra", dueBetween([op({ freq: "yearly", day: "03-15" })], "2026-10-20", "2026-10-26").length === 0);

  /* ordem: por prazo e depois por título */
  const b = op({ title: "b-segundo", freq: "monthly", day: 22 });
  const a = op({ title: "a-primeiro", freq: "monthly", day: 22 });
  const early = op({ title: "z-cedo", freq: "monthly", day: 21 });
  const ord = dueBetween([b, early, a], "2026-10-20", "2026-10-26");
  check("dueBetween: ordena por prazo e, no empate, por título", titles(ord) === "z-cedo,a-primeiro,b-segundo", titles(ord));

  check("dueBetween: ignora os apagados", dueBetween([{ ...m22, deleted: true }, friBackup], "2026-10-20", "2026-10-26").length === 1);
  check("dueBetween: sem lista não quebra", dueBetween([], "2026-10-20", "2026-10-26").length === 0 && dueBetween(undefined, "2026-10-20", "2026-10-26").length === 0);
  const before = JSON.stringify([m22, friBackup]);
  dueBetween([m22, friBackup], "2026-10-20", "2026-10-26");
  check("dueBetween: não muda os processos", JSON.stringify([m22, friBackup]) === before);
}

/* ---- pendingOn ---- */
{
  const p = (ops, day) => pendingOn(ops, day || TODAY);
  const hoje = op({ title: "vence hoje", freq: "monthly", day: 20 });
  const r = p([hoje]);
  check("pendingOn: o que vence hoje e não foi feito entra, sem atraso", r.length === 1 && r[0].op.id === hoje.id && r[0].due === TODAY && r[0].late === false, JSON.stringify(r));

  const atrasado = op({ title: "venceu dia 5", freq: "monthly", day: 5 });
  const a = p([atrasado]);
  check("pendingOn: venceu dia 5 e hoje é 20, não feito: entra atrasado", a.length === 1 && a[0].due === "2026-10-05" && a[0].late === true, JSON.stringify(a));

  check("pendingOn: o que vence mais para a frente no mês não entra", p([op({ freq: "monthly", day: 25 })]).length === 0 && p([op({ freq: "monthly", day: 21 })]).length === 0);
  check("pendingOn: feito no período não entra", p([op({ freq: "monthly", day: 5, done: ["2026-10-06"] }), op({ freq: "monthly", day: 20, done: ["2026-10-20"] })]).length === 0);
  check("pendingOn: feito no mês passado não conta para este", p([op({ freq: "monthly", day: 5, done: ["2026-09-05"] })]).length === 1);
  check("pendingOn: feito antes do prazo, no mesmo mês, já basta", p([op({ freq: "monthly", day: 25, done: ["2026-10-01"] })]).length === 0);
  check("pendingOn: apagado não entra", p([{ ...atrasado, deleted: true }]).length === 0);
  check("pendingOn: sem lista não quebra", p([]).length === 0 && p(undefined).length === 0);

  /* quem cria "todo dia 5" no dia 20 não nasce devendo */
  const born20 = op({ freq: "monthly", day: 5, createdAt: new Date(2026, 9, 20, 9, 0).getTime() });
  check("pendingOn: criado depois do prazo não nasce devendo", p([born20]).length === 0, JSON.stringify(p([born20])));
  const born5 = op({ freq: "monthly", day: 5, createdAt: new Date(2026, 9, 5, 23, 30).getTime() });
  check("pendingOn: criado no próprio dia do prazo, ele vale", p([born5]).length === 1, JSON.stringify(p([born5])));
  const born4 = op({ freq: "monthly", day: 5, createdAt: new Date(2026, 9, 4, 8, 0).getTime() });
  check("pendingOn: criado antes do prazo, ele vale", p([born4]).length === 1);
  check("pendingOn: criado depois do prazo, mas o próximo mês cobra", pendingOn([born20], "2026-11-05").length === 1 && pendingOn([born20], "2026-11-05")[0].due === "2026-11-05");

  /* semanal e anual */
  const wk = (day) => op({ freq: "weekly", day });
  check("pendingOn: semanal terça, hoje terça: entra, sem atraso", (() => { const x = p([wk(2)]); return x.length === 1 && x[0].due === TODAY && x[0].late === false; })());
  check("pendingOn: semanal segunda, hoje terça: entra atrasada", (() => { const x = p([wk(1)]); return x.length === 1 && x[0].due === "2026-10-19" && x[0].late === true; })());
  check("pendingOn: semanal sexta, hoje terça: ainda não", p([wk(5)]).length === 0);
  check("pendingOn: semanal domingo, hoje terça: ainda não", p([wk(0)]).length === 0);
  check("pendingOn: semanal feito na semana não entra", p([op({ freq: "weekly", day: 1, done: ["2026-10-19"] })]).length === 0);
  check("pendingOn: semanal feito na semana passada entra", p([op({ freq: "weekly", day: 1, done: ["2026-10-12"] })]).length === 1);
  check("pendingOn: semanal criada na terça, com prazo na segunda, não nasce devendo", p([op({ freq: "weekly", day: 1, createdAt: new Date(2026, 9, 20, 8, 0).getTime() })]).length === 0);

  const y = (day, over) => op({ freq: "yearly", day, ...over });
  check("pendingOn: anual de março, não feito, em outubro: atrasado", (() => { const x = p([y("03-15")]); return x.length === 1 && x[0].due === "2026-03-15" && x[0].late === true; })());
  check("pendingOn: anual de dezembro, em outubro: ainda não", p([y("12-25")]).length === 0);
  check("pendingOn: anual feito no ano não entra", p([y("03-15", { done: ["2026-03-10"] })]).length === 0);

  /* o dia 31 em novembro vence no 30 */
  const m31 = op({ freq: "monthly", day: 31 });
  check("pendingOn: dia 31 em novembro vence dia 30 (sem atraso nesse dia)", (() => { const x = pendingOn([m31], "2026-11-30"); return x.length === 1 && x[0].due === "2026-11-30" && x[0].late === false; })());
  check("pendingOn: dia 31 em novembro, no dia 29, ainda não", pendingOn([m31], "2026-11-29").length === 0);

  /* a ordem: prazo, depois título */
  const o1 = op({ title: "b", freq: "monthly", day: 10 });
  const o2 = op({ title: "a", freq: "monthly", day: 10 });
  const o3 = op({ title: "c", freq: "monthly", day: 3 });
  const o4 = op({ title: "d", freq: "monthly", day: 20 });
  const ord = p([o4, o1, o3, o2]);
  check("pendingOn: ordena por prazo e, no empate, por título", ord.map((x) => x.op.title).join() === "c,a,b,d", ord.map((x) => x.op.title).join());

  const snap = JSON.stringify([atrasado]);
  p([atrasado]);
  check("pendingOn: não muda os processos", JSON.stringify([atrasado]) === snap);
}

/* ---- freqLabel ---- */
{
  check("freqLabel: mensal", freqLabel(op({ freq: "monthly", day: 5 })) === "todo dia 5", freqLabel(op({ freq: "monthly", day: 5 })));
  check("freqLabel: mensal dia 31", freqLabel(op({ freq: "monthly", day: 31 })) === "todo dia 31");
  const wk = { 0: "todo domingo", 1: "toda segunda", 2: "toda terça", 3: "toda quarta", 4: "toda quinta", 5: "toda sexta", 6: "todo sábado" };
  for (const d of [0, 1, 2, 3, 4, 5, 6]) check("freqLabel: semanal " + d + " -> " + wk[d], freqLabel(op({ freq: "weekly", day: d })) === wk[d], freqLabel(op({ freq: "weekly", day: d })));
  check("freqLabel: anual", freqLabel(op({ freq: "yearly", day: "03-15" })) === "todo ano em 15/03", freqLabel(op({ freq: "yearly", day: "03-15" })));
  check("freqLabel: anual com zero à esquerda", freqLabel(op({ freq: "yearly", day: "01-05" })) === "todo ano em 05/01");
}

/* ---- periodLabel e doneLine ---- */
{
  check("periodLabel: mensal é o mês por extenso, minúsculo", periodLabel(op({ freq: "monthly" }), "2026-10-20") === "outubro" && periodLabel(op({ freq: "monthly" }), "2026-03-02") === "março" && periodLabel(op({ freq: "monthly" }), "2026-01-31") === "janeiro", periodLabel(op({ freq: "monthly" }), "2026-03-02"));
  const w = op({ freq: "weekly", day: 5 });
  check("periodLabel: semanal é 'semana de' + a segunda", periodLabel(w, "2026-10-20") === "semana de 19/10" && periodLabel(w, "2026-10-25") === "semana de 19/10", periodLabel(w, "2026-10-20"));
  check("periodLabel: semanal com zero à esquerda", periodLabel(w, "2026-11-04") === "semana de 02/11", periodLabel(w, "2026-11-04"));
  check("periodLabel: anual é o ano", periodLabel(op({ freq: "yearly", day: "03-15" }), "2026-10-20") === "2026");

  check("doneLine: título e período", doneLine(op({ title: "emitir notas", freq: "monthly" }), "2026-10-20") === "emitir notas · outubro", doneLine(op({ title: "emitir notas", freq: "monthly" }), "2026-10-20"));
  check("doneLine: semanal", doneLine(op({ title: "backup", freq: "weekly", day: 5 }), "2026-10-20") === "backup · semana de 19/10");
  check("doneLine: anual", doneLine(op({ title: "renovar domínio", freq: "yearly", day: "03-15" }), "2026-10-20") === "renovar domínio · 2026");
}

/* ---- markDone e unmarkDone ---- */
{
  const m = op({ title: "emitir notas", freq: "monthly", day: 5, updatedAt: 1 });
  const r = markDone(m, TODAY, TODAY);
  check("markDone: devolve o documento com o dia em done", !r.error && r.doc && r.doc.done.includes(TODAY), JSON.stringify(r));
  check("markDone: mantém o resto do processo", r.doc.id === m.id && r.doc.title === "emitir notas" && r.doc.freq === "monthly" && r.doc.day === 5 && r.doc.createdAt === m.createdAt, JSON.stringify(r.doc));
  check("markDone: renova updatedAt", r.doc.updatedAt > 1, String(r.doc.updatedAt));
  check("markDone: feito vale para o período", isDone(r.doc, "2026-10-31") && !isDone(r.doc, "2026-11-01"));
  check("markDone: não muda o processo de entrada", m.done.length === 0 && m.updatedAt === 1);

  const f = markDone(m, "2026-10-21", TODAY);
  check("markDone: dia futuro é erro, sem documento", f.error === FUTURE && !f.doc, JSON.stringify(f));
  check("markDone: o próprio hoje não é futuro", !markDone(m, TODAY, TODAY).error);

  const past = markDone(m, "2026-09-15", TODAY);
  check("markDone: dia passado vale (esqueci de marcar em setembro)", !past.error && past.doc.done.includes("2026-09-15"), JSON.stringify(past));

  const feito = op({ title: "emitir notas", freq: "monthly", day: 5, done: ["2026-10-03"] });
  const dup = markDone(feito, TODAY, TODAY);
  check("markDone: já feito no período dá erro com a linha", dup.error === "já estava feito · emitir notas · outubro" && !dup.doc, JSON.stringify(dup));
  const prev = markDone(feito, "2026-11-02", "2026-11-02");
  check("markDone: o mês seguinte não estava feito", !prev.error && prev.doc.done.join() === "2026-10-03,2026-11-02", JSON.stringify(prev));

  const wk = op({ title: "backup", freq: "weekly", day: 5, done: ["2026-10-19"] });
  check("markDone: semanal já feita na semana dá erro", markDone(wk, "2026-10-23", "2026-10-23").error === "já estava feito · backup · semana de 19/10", JSON.stringify(markDone(wk, "2026-10-23", "2026-10-23")));

  /* desfazer */
  const many = op({ title: "emitir notas", freq: "monthly", day: 5, done: ["2026-09-03", "2026-10-03", "2026-10-15"] });
  const u = unmarkDone(many, TODAY);
  check("unmarkDone: tira todas as datas do período", u.done.join() === "2026-09-03", u.done.join());
  check("unmarkDone: mantém o resto e é um documento", u.id === many.id && u.title === "emitir notas" && u.freq === "monthly");
  check("unmarkDone: depois de desfazer, o período não está feito", !isDone(u, TODAY));
  check("unmarkDone: não muda o de entrada", many.done.length === 3);
  const uw = unmarkDone(op({ freq: "weekly", day: 5, done: ["2026-10-12", "2026-10-25"] }), "2026-10-20");
  check("unmarkDone: semanal tira só a semana de `day`", uw.done.join() === "2026-10-12", uw.done.join());
  check("unmarkDone: sem nada no período, nada muda", unmarkDone(many, "2026-12-01").done.join() === "2026-09-03,2026-10-03,2026-10-15");
  const round = unmarkDone(markDone(op({ freq: "monthly", day: 5 }), TODAY, TODAY).doc, TODAY);
  check("unmarkDone desfaz o markDone", round.done.length === 0);
}

/* ---- parseDay e dayText ---- */
{
  check("parseDay mensal: '5' -> 5", parseDay("monthly", "5") === 5);
  check("parseDay mensal: 'dia 5' -> 5", parseDay("monthly", "dia 5") === 5, String(parseDay("monthly", "dia 5")));
  check("parseDay mensal: 1 e 31 valem", parseDay("monthly", "1") === 1 && parseDay("monthly", "31") === 31);
  check("parseDay mensal: fora de 1..31 -> null", parseDay("monthly", "0") === null && parseDay("monthly", "32") === null && parseDay("monthly", "-1") === null);
  check("parseDay mensal: lixo e vazio -> null", parseDay("monthly", "abc") === null && parseDay("monthly", "") === null && parseDay("monthly", undefined) === null);

  const wk = [["seg", 1], ["segunda", 1], ["Segunda", 1], ["segunda-feira", 1], ["ter", 2], ["terça", 2], ["terca", 2], ["qua", 3], ["quarta", 3], ["qui", 4], ["quinta", 4], ["sex", 5], ["sexta", 5], ["sexta-feira", 5], ["sáb", 6], ["sab", 6], ["sábado", 6], ["sabado", 6], ["dom", 0], ["domingo", 0]];
  for (const [t, want] of wk) check("parseDay semanal: '" + t + "' -> " + want, parseDay("weekly", t) === want, String(parseDay("weekly", t)));
  check("parseDay semanal: número 0..6 em texto -> número", parseDay("weekly", "3") === 3 && parseDay("weekly", "0") === 0 && parseDay("weekly", "6") === 6);
  check("parseDay semanal: 7 e lixo -> null", parseDay("weekly", "7") === null && parseDay("weekly", "xyz") === null && parseDay("weekly", "") === null);

  check("parseDay anual: '15/03' -> '03-15'", parseDay("yearly", "15/03") === "03-15", String(parseDay("yearly", "15/03")));
  check("parseDay anual: 29/02 vale", parseDay("yearly", "29/02") === "02-29");
  check("parseDay anual: data impossível -> null", parseDay("yearly", "31/02") === null && parseDay("yearly", "15/13") === null && parseDay("yearly", "00/01") === null);
  check("parseDay anual: lixo -> null", parseDay("yearly", "março") === null && parseDay("yearly", "") === null);

  check("dayText: mensal 5 -> '5'", dayText("monthly", 5) === "5", dayText("monthly", 5));
  check("dayText: semanal 1 -> 'seg'", dayText("weekly", 1) === "seg", dayText("weekly", 1));
  check("dayText: anual '03-15' -> '15/03'", dayText("yearly", "03-15") === "15/03", dayText("yearly", "03-15"));
  for (const d of [0, 1, 2, 3, 4, 5, 6]) check("dayText/parseDay: semanal " + d + " volta igual", parseDay("weekly", dayText("weekly", d)) === d, dayText("weekly", d));
  check("dayText/parseDay: mensal e anual voltam iguais", parseDay("monthly", dayText("monthly", 17)) === 17 && parseDay("yearly", dayText("yearly", "12-25")) === "12-25");
}

/* ---- opDoc ---- */
{
  const NOW = 1760950800000;
  const r = opDoc({ title: "emitir notas", freq: "monthly", day: "5" }, NOW);
  check("opDoc: cria o documento", !r.error && r.doc, JSON.stringify(r));
  check("opDoc: só as chaves do processo", Object.keys(r.doc).sort().join() === "checklist,createdAt,day,done,freq,id,title,updatedAt", Object.keys(r.doc).sort().join());
  check("opDoc: título, frequência e dia", r.doc.title === "emitir notas" && r.doc.freq === "monthly" && r.doc.day === 5, JSON.stringify(r.doc));
  check("opDoc: checklist e done vazios", Array.isArray(r.doc.checklist) && r.doc.checklist.length === 0 && Array.isArray(r.doc.done) && r.doc.done.length === 0);
  check("opDoc: id novo e datas = now", typeof r.doc.id === "string" && r.doc.id.length > 0 && r.doc.createdAt === NOW && r.doc.updatedAt === NOW, JSON.stringify(r.doc));
  check("opDoc: cada criação ganha um id diferente", opDoc({ title: "a", freq: "monthly", day: "5" }, NOW).doc.id !== opDoc({ title: "a", freq: "monthly", day: "5" }, NOW).doc.id);
  check("opDoc: o dia já no formato do documento vale (número)", opDoc({ title: "a", freq: "monthly", day: 5 }, NOW).doc.day === 5 && opDoc({ title: "a", freq: "weekly", day: 5 }, NOW).doc.day === 5);
  check("opDoc: semanal pelo nome do dia", opDoc({ title: "backup", freq: "weekly", day: "sex" }, NOW).doc.day === 5);
  check("opDoc: anual pela data dita", opDoc({ title: "renovar", freq: "yearly", day: "15/03" }, NOW).doc.day === "03-15");
  check("opDoc: anual no formato do documento", opDoc({ title: "renovar", freq: "yearly", day: "03-15" }, NOW).doc.day === "03-15");
  check("opDoc: o título perde os espaços das pontas", opDoc({ title: "  backup  ", freq: "weekly", day: "seg" }, NOW).doc.title === "backup");

  for (const title of ["", "   ", undefined]) {
    const e = opDoc({ title, freq: "monthly", day: "5" }, NOW);
    check("opDoc: sem título (" + JSON.stringify(title) + ") pede um nome", e.error === ASK_NAME && !e.doc, JSON.stringify(e));
  }
  for (const [freq, day] of [["monthly", "abc"], ["monthly", "40"], ["weekly", "xyz"], ["yearly", "31/02"], ["yearly", ""], ["monthly", ""]]) {
    const e = opDoc({ title: "a", freq, day }, NOW);
    check("opDoc: dia ilegível (" + freq + " '" + day + "') pergunta qual dia", e.error === ASK_DAY && !e.doc, JSON.stringify(e));
  }
}

/* ---- findOp ---- */
{
  const notas = op({ title: "emitir notas", freq: "monthly", day: 5 });
  const das = op({ title: "pagar DAS", freq: "monthly", day: 20 });
  const backup = op({ title: "backup", freq: "weekly", day: 5 });
  const extrato = op({ title: "mandar extrato ao contador", freq: "monthly", day: 7 });
  const all = [notas, das, backup, extrato];
  const id = (x) => (x ? x.id : null);

  check("findOp: 'emiti as notas' acha 'emitir notas'", id(findOp(all, "emiti as notas")) === notas.id, String(id(findOp(all, "emiti as notas"))));
  check("findOp: 'paguei o DAS' acha 'pagar DAS'", id(findOp(all, "paguei o DAS")) === das.id);
  check("findOp: 'fiz o backup' acha 'backup'", id(findOp(all, "fiz o backup")) === backup.id);
  check("findOp: 'mandei o extrato pro contador' acha 'mandar extrato ao contador'", id(findOp(all, "mandei o extrato pro contador")) === extrato.id);
  check("findOp: sem acento e sem caixa", id(findOp(all, "EMITI AS NOTAS")) === notas.id && id(findOp([op({ title: "relatório mensal" })], "fiz o relatorio mensal")) !== null);
  check("findOp: o que não é processo -> null", findOp(all, "comprei pão") === null);
  check("findOp: faltando uma palavra do processo -> null", findOp(all, "mandei o extrato") === null && findOp(all, "emiti") === null);
  check("findOp: vazio e sem lista -> null", findOp(all, "") === null && findOp([], "emiti as notas") === null && findOp(undefined, "emiti as notas") === null);
  check("findOp: ignora os apagados", findOp([{ ...notas, deleted: true }], "emiti as notas") === null);

  const das2 = op({ title: "pagar DAS do MEI", freq: "monthly", day: 20 });
  check("findOp: com mais de um que casa, vale o de mais palavras", id(findOp([das, das2], "paguei o DAS do MEI")) === das2.id && id(findOp([das2, das], "paguei o DAS do MEI")) === das2.id, String(id(findOp([das, das2], "paguei o DAS do MEI"))));
  check("findOp: o de menos palavras ainda casa sozinho", id(findOp([das, das2], "paguei o DAS")) === das.id);

  const ir = op({ title: "IR" });
  check("findOp: igualdade exata sempre casa, até com título curto", id(findOp([ir], "ir")) === ir.id && id(findOp([ir], "IR")) === ir.id);
  check("findOp: igualdade exata ignora acento e espaços", id(findOp([op({ title: "relatório mensal" })], "Relatorio  Mensal")) !== null);
}

/* ---- OPS_TEMPLATES ---- */
{
  check("OPS_TEMPLATES: três grupos, na ordem fiscal, produto, cliente", OPS_TEMPLATES.map((g) => g.key + ":" + g.label).join() === "fiscal:fiscal,product:produto,client:cliente", JSON.stringify(OPS_TEMPLATES.map((g) => g.key + ":" + g.label)));
  const names = (k) => (OPS_TEMPLATES.find((g) => g.key === k)?.items || []).map((i) => i.name).join();
  check("OPS_TEMPLATES: fiscal", names("fiscal") === "emitir notas,pagar DAS,mandar extrato ao contador", names("fiscal"));
  check("OPS_TEMPLATES: produto", names("product") === "backup,renovar domínio,revisar erros", names("product"));
  check("OPS_TEMPLATES: cliente", names("client") === "relatório mensal,cobrança", names("client"));

  const items = OPS_TEMPLATES.flatMap((g) => g.items);
  check("OPS_TEMPLATES: cada item tem id, name, freq, day e line", items.every((i) => typeof i.id === "string" && i.id && typeof i.name === "string" && i.name && i.freq && i.day !== undefined && typeof i.line === "string" && i.line), JSON.stringify(items));
  check("OPS_TEMPLATES: os ids são únicos", new Set(items.map((i) => i.id)).size === items.length);
  check("OPS_TEMPLATES: a frequência é uma das três", items.every((i) => FREQS.some((f) => f.id === i.freq)));
  check("OPS_TEMPLATES: o dia já é válido para a frequência (normalize não muda)", items.every((i) => normalize({ id: "x", title: i.name, freq: i.freq, day: i.day }).day === i.day), JSON.stringify(items.map((i) => [i.name, i.freq, i.day])));
  check("OPS_TEMPLATES: line é a frase da frequência", items.every((i) => i.line === freqLabel(normalize({ id: "x", title: i.name, freq: i.freq, day: i.day }))), JSON.stringify(items.map((i) => i.line)));
  check("OPS_TEMPLATES: cada modelo vira um processo sem erro", items.every((i) => { const r = opDoc({ title: i.name, freq: i.freq, day: i.day }, 1); return !r.error && r.doc.title === i.name; }));
  const real = items.map((i) => normalize({ id: i.id, title: i.name, freq: i.freq, day: i.day, createdAt: LONG_AGO }));
  check("findOp acha cada modelo pelo próprio nome", real.every((o) => (findOp(real, o.title) || {}).id === o.id));
  check("findOp: 'emiti as notas' acha o modelo 'emitir notas'", (findOp(real, "emiti as notas") || {}).title === "emitir notas");
}

/* ---- as ações op-add e op-done da conversa (assistant-actions.js) ----
   o buildDoc usa o today() do core, o relógio de verdade; por isso o dia
   "de hoje" aqui vem do core, e os processos nascem bem antes. */
{
  const { today, addDays } = await import("./core.js");
  const { ACTION_COLLECTIONS, ACTION_LABELS, ACTION_DONE, ACTION_FIELDS, previewOf, buildDoc } = await import("./assistant-actions.js");
  const t = today();

  check("op-add e op-done: gravam na coleção ops", ACTION_COLLECTIONS["op-add"] === "ops" && ACTION_COLLECTIONS["op-done"] === "ops", JSON.stringify([ACTION_COLLECTIONS["op-add"], ACTION_COLLECTIONS["op-done"]]));
  check("op-add e op-done: os rótulos da caixa", ACTION_LABELS["op-add"] === "novo processo" && ACTION_LABELS["op-done"] === "marcar feito", JSON.stringify([ACTION_LABELS["op-add"], ACTION_LABELS["op-done"]]));
  check("op-add e op-done: o que a pílula confirmada diz", ACTION_DONE["op-add"] === "processo" && ACTION_DONE["op-done"] === "feito", JSON.stringify([ACTION_DONE["op-add"], ACTION_DONE["op-done"]]));

  /* a coleção ops de mentira: o que a tela da conversa entrega ao buildDoc */
  const stored = [
    normalize({ id: "n1", title: "emitir notas", freq: "monthly", day: 5, createdAt: 1, updatedAt: 1 }),
    normalize({ id: "d1", title: "pagar DAS", freq: "monthly", day: 20, createdAt: 1, updatedAt: 1 })
  ];
  const store = { all: () => stored, get: (i) => stored.find((o) => o.id === i) || null };
  const empty = { all: () => [], get: () => null };

  /* os campos da caixa */
  const addFields = ACTION_FIELDS["op-add"] || [];
  check("op-add: a caixa tem processo, frequência e dia", addFields.map((f) => f.label).join() === "processo,frequência,dia", addFields.map((f) => f.label).join());
  const doneFields = ACTION_FIELDS["op-done"] || [];
  check("op-done: a caixa tem processo e dia", doneFields.map((f) => f.label).join() === "processo,dia", doneFields.map((f) => f.label).join());
  const pick = doneFields.find((f) => f.key === "pick");
  check("op-done: o processo é um seletor", !!pick && pick.type === "select", JSON.stringify(pick && pick.type));
  /* uma opção em branco no começo ("escolha o processo") é livre; o que o contrato fixa são os processos */
  check("op-done: as opções são [id, título] dos processos", !!pick && JSON.stringify(pick.options(store, {}).filter((o) => o[0] !== "")) === JSON.stringify([["n1", "emitir notas"], ["d1", "pagar DAS"]]), JSON.stringify(pick && pick.options(store, {})));
  check("op-done: o inicial é o processo que a IA citou, achado pelo nome", !!pick && pick.initial({ title: "emiti as notas" }, store) === "n1" && pick.initial({ title: "paguei o DAS" }, store) === "d1", JSON.stringify(pick && pick.initial({ title: "emiti as notas" }, store)));
  check("op-done: se não achar, o inicial é vazio", !!pick && pick.initial({ title: "comprei pão" }, store) === "" && pick.initial({ title: "emiti as notas" }, empty) === "", JSON.stringify(pick && pick.initial({ title: "comprei pão" }, store)));

  /* a prévia */
  check("previewOf op-add: 'emitir notas · todo dia 5'", previewOf("op-add", { title: "emitir notas", freq: "monthly", day: 5 }) === "emitir notas · todo dia 5", previewOf("op-add", { title: "emitir notas", freq: "monthly", day: 5 }));
  check("previewOf op-add: semanal", previewOf("op-add", { title: "backup", freq: "weekly", day: 5 }) === "backup · toda sexta", previewOf("op-add", { title: "backup", freq: "weekly", day: 5 }));

  /* op-add */
  const add = buildDoc("op-add", { title: "emitir notas", freq: "monthly", day: 5 }, { title: "emitir notas", freq: "monthly", day: "5" }, empty);
  check("buildDoc op-add: 'todo dia 5 emito as notas' vira o processo", !add.error && add.doc && add.doc.title === "emitir notas" && add.doc.freq === "monthly" && add.doc.day === 5 && add.doc.done.length === 0 && add.doc.checklist.length === 0, JSON.stringify(add));
  check("buildDoc op-add: o documento tem id e datas", add.doc && typeof add.doc.id === "string" && add.doc.id && typeof add.doc.createdAt === "number" && add.doc.updatedAt === add.doc.createdAt);
  check("buildDoc op-add: o dia dito na caixa vale (sexta)", buildDoc("op-add", { title: "backup", freq: "weekly", day: 5 }, { title: "backup", freq: "weekly", day: "sex" }, empty).doc.day === 5);
  check("buildDoc op-add: sem título passa o erro do opDoc", buildDoc("op-add", { title: "x", freq: "monthly", day: 5 }, { title: " ", freq: "monthly", day: "5" }, empty).error === ASK_NAME);
  check("buildDoc op-add: dia ilegível passa o erro do opDoc", buildDoc("op-add", { title: "x", freq: "monthly", day: 5 }, { title: "x", freq: "monthly", day: "abc" }, empty).error === ASK_DAY);

  /* op-done */
  const byPick = buildDoc("op-done", { title: "emiti as notas", date: t }, { pick: "n1", date: t }, store);
  check("buildDoc op-done: pelo processo escolhido na caixa", !byPick.error && byPick.doc && byPick.doc.id === "n1" && byPick.doc.done.includes(t), JSON.stringify(byPick));
  const byName = buildDoc("op-done", { title: "paguei o DAS", date: t }, { date: t }, store);
  check("buildDoc op-done: sem escolha, pelo que a pessoa disse", !byName.error && byName.doc && byName.doc.id === "d1" && byName.doc.done.includes(t), JSON.stringify(byName));
  const pickWins = buildDoc("op-done", { title: "emiti as notas", date: t }, { pick: "d1", date: t }, store);
  check("buildDoc op-done: a escolha da caixa vence o nome da IA", pickWins.doc && pickWins.doc.id === "d1", JSON.stringify(pickWins));
  const noDate = buildDoc("op-done", { title: "emiti as notas" }, { pick: "n1", date: "" }, store);
  check("buildDoc op-done: sem dia, vale hoje", !noDate.error && noDate.doc.done.includes(t), JSON.stringify(noDate));
  const past = buildDoc("op-done", { title: "emiti as notas" }, { pick: "n1", date: addDays(t, -40) }, store);
  check("buildDoc op-done: dia passado vale", !past.error && past.doc.done.includes(addDays(t, -40)), JSON.stringify(past));
  const nope = buildDoc("op-done", { title: "comprei pão", date: t }, { date: t }, store);
  check("buildDoc op-done: processo que não existe -> 'não achei esse processo'", nope.error === "não achei esse processo" && !nope.doc, JSON.stringify(nope));
  check("buildDoc op-done: sem nenhum processo gravado, o mesmo erro", buildDoc("op-done", { title: "emiti as notas", date: t }, { date: t }, empty).error === "não achei esse processo");
  check("buildDoc op-done: dia futuro é erro", buildDoc("op-done", { title: "emiti as notas" }, { pick: "n1", date: addDays(t, 1) }, store).error === "esse dia ainda não chegou");

  /* já feito no período */
  const doneAlready = { all: () => [normalize({ id: "n1", title: "emitir notas", freq: "monthly", day: 5, done: [t], createdAt: 1, updatedAt: 1 })], get: () => null };
  const dup = buildDoc("op-done", { title: "emiti as notas", date: t }, { pick: "n1", date: t }, doneAlready);
  check("buildDoc op-done: já feito no período -> 'já estava feito · …'", /^já estava feito · emitir notas · /.test(dup.error || "") && !dup.doc, JSON.stringify(dup));
  check("buildDoc op-done: o 'já feito' traz o período", dup.error === "já estava feito · " + doneLine(doneAlready.all()[0], t), String(dup.error));
}

/* ---- nextPeriod: o primeiro dia do período seguinte ---- */
{
  const m = normalize({ id: "n1", title: "notas", freq: "monthly", day: 5, createdAt: 1 });
  const w = normalize({ id: "n2", title: "backup", freq: "weekly", day: 5, createdAt: 1 });
  const y = normalize({ id: "n3", title: "domínio", freq: "yearly", day: "01-10", createdAt: 1 });
  check("nextPeriod: mensal vai ao dia 1 do mês seguinte", O.nextPeriod(m, TODAY) === "2026-11-01", O.nextPeriod(m, TODAY));
  check("nextPeriod: mensal em dezembro vira o ano", O.nextPeriod(m, "2026-12-15") === "2027-01-01", O.nextPeriod(m, "2026-12-15"));
  check("nextPeriod: semanal vai à segunda seguinte", O.nextPeriod(w, TODAY) === "2026-10-26", O.nextPeriod(w, TODAY));
  check("nextPeriod: anual vai a 1º de janeiro", O.nextPeriod(y, TODAY) === "2027-01-01", O.nextPeriod(y, TODAY));
  check("nextPeriod: o prazo do mês seguinte do dia 5", dueOn(m, O.nextPeriod(m, TODAY)) === "2026-11-05");
}

if (failures.length) {
  console.error(failures.length + " falhou(aram), " + passed + " ok:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("ops.test.mjs: " + passed + " verificações ok");
