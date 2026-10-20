/* testa o plano (ticket #77): as metas de ano, semestre e trimestre, as contas
 * puras do plans-data e o verbo "meta do trimestre" do assistente. o navegador
 * de mentira sobe antes do import porque o plans-data importa o core, que é um
 * módulo de navegador. */

let passed = 0;
const failures = [];
const check = (name, cond, detail) => { if (cond) passed++; else failures.push(name + (detail ? " -> " + detail : "")); };
/* o brl do core usa espaço não separável: compara sem se importar com qual */
const flat = (s) => String(s).replace(/\s/g, " ");

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

const core = await import("./core.js");
const P = await import("./plans-data.js");
const { KINDS, LIMITS, GOAL_SOURCES, normalize, periodOf, periodBounds, shiftQuarter, goalsOf, canAdd, progressOf, goalPrefix, goalLine, goalDoc, readTarget, targetText } = P;
const { ACTION_COLLECTIONS, buildDoc, previewOf } = await import("./assistant-actions.js");

const TODAY = "2026-10-20";
const Q4 = "2026-Q4";
const goal = (extra) => ({ id: "g" + Math.random().toString(36).slice(2, 8), kind: "quarter", period: Q4, text: "meta", source: "manual", target: 10, current: 0, done: false, createdAt: 1, updatedAt: 1, ...extra });
const msOf = (y, m, d) => new Date(y, m - 1, d, 12).getTime();

/* ---- as constantes ---- */
{
  check("KINDS: ano, semestre e trimestre", KINDS.join() === "year,half,quarter", KINDS.join());
  check("LIMITS: 1 ano, 1 semestre, 3 trimestre", LIMITS.year === 1 && LIMITS.half === 1 && LIMITS.quarter === 3, JSON.stringify(LIMITS));
  check("GOAL_SOURCES: as seis fontes", GOAL_SOURCES.map((s) => s.id).join() === "clients,revenue,won,launched,team,manual", GOAL_SOURCES.map((s) => s.id).join());
  check("GOAL_SOURCES: cada fonte tem rótulo", GOAL_SOURCES.every((s) => typeof s.label === "string" && s.label.length > 0));
}

/* ---- periodOf ---- */
{
  check("periodOf: ano", periodOf("2026-10-20", "year") === "2026", periodOf("2026-10-20", "year"));
  check("periodOf: semestre de outubro é H2", periodOf("2026-10-20", "half") === "2026-H2", periodOf("2026-10-20", "half"));
  check("periodOf: trimestre de outubro é Q4", periodOf("2026-10-20", "quarter") === "2026-Q4", periodOf("2026-10-20", "quarter"));
  check("periodOf: 31 de março ainda é Q1", periodOf("2026-03-31", "quarter") === "2026-Q1", periodOf("2026-03-31", "quarter"));
  check("periodOf: 1º de abril é Q2", periodOf("2026-04-01", "quarter") === "2026-Q2", periodOf("2026-04-01", "quarter"));
  check("periodOf: 1º de julho é H2 e Q3", periodOf("2026-07-01", "half") === "2026-H2" && periodOf("2026-07-01", "quarter") === "2026-Q3");
  check("periodOf: 30 de junho é H1 e Q2", periodOf("2026-06-30", "half") === "2026-H1" && periodOf("2026-06-30", "quarter") === "2026-Q2");
  check("periodOf: janeiro é H1", periodOf("2027-01-01", "half") === "2027-H1", periodOf("2027-01-01", "half"));
}

/* ---- periodBounds ---- */
{
  const b = (p) => JSON.stringify(periodBounds(p));
  check("periodBounds: ano", b("2026") === JSON.stringify({ from: "2026-01-01", to: "2026-12-31" }), b("2026"));
  check("periodBounds: H1", b("2026-H1") === JSON.stringify({ from: "2026-01-01", to: "2026-06-30" }), b("2026-H1"));
  check("periodBounds: H2", b("2026-H2") === JSON.stringify({ from: "2026-07-01", to: "2026-12-31" }), b("2026-H2"));
  check("periodBounds: Q1", b("2026-Q1") === JSON.stringify({ from: "2026-01-01", to: "2026-03-31" }), b("2026-Q1"));
  check("periodBounds: Q2", b("2026-Q2") === JSON.stringify({ from: "2026-04-01", to: "2026-06-30" }), b("2026-Q2"));
  check("periodBounds: Q3", b("2026-Q3") === JSON.stringify({ from: "2026-07-01", to: "2026-09-30" }), b("2026-Q3"));
  check("periodBounds: Q4", b("2026-Q4") === JSON.stringify({ from: "2026-10-01", to: "2026-12-31" }), b("2026-Q4"));
  for (const bad of ["", "abc", "2026-Q5", "2026-Q0", "2026-H3", "26-Q1", "2026-10", undefined, null]) {
    check("periodBounds: inválido (" + String(bad) + ") dá null", periodBounds(bad) === null, b(bad));
  }
}

/* ---- shiftQuarter ---- */
{
  check("shiftQuarter: Q4 + 1 vira o Q1 do ano seguinte", shiftQuarter("2026-Q4", 1) === "2027-Q1", shiftQuarter("2026-Q4", 1));
  check("shiftQuarter: Q1 - 1 vira o Q4 do ano anterior", shiftQuarter("2026-Q1", -1) === "2025-Q4", shiftQuarter("2026-Q1", -1));
  check("shiftQuarter: dentro do ano", shiftQuarter("2026-Q2", 2) === "2026-Q4", shiftQuarter("2026-Q2", 2));
  check("shiftQuarter: zero não muda", shiftQuarter("2026-Q3", 0) === "2026-Q3");
  check("shiftQuarter: cruza mais de um ano", shiftQuarter("2026-Q3", 5) === "2027-Q4" && shiftQuarter("2026-Q1", -5) === "2024-Q4", shiftQuarter("2026-Q3", 5) + " " + shiftQuarter("2026-Q1", -5));
}

/* ---- normalize ---- */
{
  const ok = normalize({ id: "a", kind: "quarter", period: Q4, text: "fechar clientes", source: "clients", target: 10, createdAt: 5, updatedAt: 6 });
  check("normalize: guarda o que veio, com as chaves do documento", ok && ok.id === "a" && ok.kind === "quarter" && ok.period === Q4 && ok.text === "fechar clientes" && ok.source === "clients" && ok.target === 10 && ok.createdAt === 5 && ok.updatedAt === 6 && ok.done === false && ok.current === 0, JSON.stringify(ok));
  check("normalize: ano e semestre valem", !!normalize({ id: "y", kind: "year", period: "2026" }) && !!normalize({ id: "h", kind: "half", period: "2026-H2" }));
  check("normalize: kind month (formato antigo) é descartado", normalize({ id: "month:2026-10", kind: "month", period: "2026-10", text: "x" }) === null);
  check("normalize: kind week (formato antigo) é descartado", normalize({ id: "week:2026-10-19", kind: "week", period: "2026-10-19" }) === null);
  check("normalize: sem kind é descartado", normalize({ id: "z", period: Q4 }) === null);
  check("normalize: o plano antigo com goals em array é descartado", normalize({ id: "quarter:2026-Q3", kind: "quarter", period: "2026-Q3", goals: [{ id: "x", text: "algo", done: false }] }) === null);
  check("normalize: goals vazio em array também é o formato antigo", normalize({ id: "quarter:2026-Q3", kind: "quarter", goals: [] }) === null);
  check("normalize: período inválido para o kind dá null", normalize({ id: "a", kind: "quarter", period: "2026-H1" }) === null && normalize({ id: "a", kind: "year", period: "2026-Q1" }) === null && normalize({ id: "a", kind: "half", period: "2026-Q1" }) === null && normalize({ id: "a", kind: "quarter", period: "2026-Q5" }) === null && normalize({ id: "a", kind: "quarter" }) === null);
  check("normalize: fonte desconhecida vira manual", normalize({ id: "a", kind: "quarter", period: Q4, source: "magia" }).source === "manual");
  check("normalize: sem fonte vira manual", normalize({ id: "a", kind: "quarter", period: Q4 }).source === "manual");
  for (const s of ["clients", "revenue", "won", "launched", "team", "manual"]) check("normalize: a fonte " + s + " fica", normalize({ id: "a", kind: "quarter", period: Q4, source: s }).source === s);
  const t = (v) => normalize({ id: "a", kind: "quarter", period: Q4, target: v }).target;
  check("normalize: target é inteiro", Number.isInteger(t(7.8)) && Number.isInteger(t("12")), t(7.8) + " " + t("12"));
  check("normalize: target negativo, texto e NaN viram 0", t(-5) === 0 && t("abc") === 0 && t(NaN) === 0 && t(undefined) === 0, [t(-5), t("abc"), t(NaN), t(undefined)].join());
  check("normalize: target grande (centavos) passa inteiro", t(3000000) === 3000000);
  const c = (source, current) => normalize({ id: "a", kind: "quarter", period: Q4, source, current }).current;
  check("normalize: current conta na fonte manual", c("manual", 4) === 4, String(c("manual", 4)));
  check("normalize: current nas outras fontes vira 0", c("clients", 4) === 0 && c("revenue", 4) === 0 && c("won", 4) === 0 && c("team", 4) === 0 && c("launched", 4) === 0);
  check("normalize: current inválido na manual vira 0", c("manual", -3) === 0 && c("manual", "abc") === 0 && c("manual", NaN) === 0, [c("manual", -3), c("manual", "abc")].join());
  check("normalize: texto cortado em 140", normalize({ id: "a", kind: "quarter", period: Q4, text: "x".repeat(300) }).text.length === 140);
  check("normalize: sem texto fica vazio, sem quebrar", normalize({ id: "a", kind: "quarter", period: Q4 }).text === "");
  check("normalize: done é booleano", normalize({ id: "a", kind: "quarter", period: Q4, done: 1 }).done === true && normalize({ id: "a", kind: "quarter", period: Q4 }).done === false);
  const n = normalize({ id: "a", kind: "quarter", period: Q4 });
  check("normalize: sem datas, createdAt e updatedAt vêm preenchidos", typeof n.createdAt === "number" && typeof n.updatedAt === "number", JSON.stringify(n));
  check("normalize: lixo não quebra", normalize(null) === null && normalize(undefined) === null && normalize({}) === null);
}

/* ---- goalsOf e canAdd ---- */
{
  const docs = [
    goal({ id: "b", createdAt: 20 }),
    goal({ id: "a", createdAt: 10 }),
    goal({ id: "c", createdAt: 30 }),
    goal({ id: "other", period: "2026-Q3", createdAt: 5 }),
    goal({ id: "year", kind: "year", period: "2026", createdAt: 5 }),
    { id: "quarter:2026-Q4", kind: "quarter", period: Q4, goals: [{ id: "old", text: "x" }] },
    { id: "month:2026-10", kind: "month", period: "2026-10", text: "velho" }
  ];
  const g = goalsOf(docs, "quarter", Q4);
  check("goalsOf: só o kind e o período, por createdAt", g.map((x) => x.id).join() === "a,b,c", g.map((x) => x.id).join());
  check("goalsOf: ignora os documentos antigos", !g.some((x) => x.id === "quarter:2026-Q4" || x.id === "month:2026-10"));
  check("goalsOf: devolve documentos normalizados", g.every((x) => typeof x.target === "number" && typeof x.done === "boolean"));
  check("goalsOf: ano separado do trimestre", goalsOf(docs, "year", "2026").length === 1 && goalsOf(docs, "half", "2026-H2").length === 0);
  check("goalsOf: lista vazia", goalsOf([], "quarter", Q4).length === 0);
  check("canAdd: trimestre com 3 não aceita a quarta", canAdd(docs, "quarter", Q4) === false);
  check("canAdd: trimestre com 2 aceita", canAdd(docs.slice(0, 2), "quarter", Q4) === true);
  check("canAdd: outro trimestre tem a sua conta", canAdd(docs, "quarter", "2026-Q3") === true);
  check("canAdd: ano com 1 não aceita outro", canAdd(docs, "year", "2026") === false && canAdd(docs, "year", "2027") === true);
  check("canAdd: semestre vazio aceita, e só uma", canAdd(docs, "half", "2026-H2") === true && canAdd([goal({ kind: "half", period: "2026-H2" })], "half", "2026-H2") === false);
  check("canAdd: os documentos antigos não ocupam vaga", canAdd([docs[5], docs[6], docs[5]], "quarter", Q4) === true);
}

/* ---- progressOf ---- */
{
  const active = (n) => Array.from({ length: n }, (_, i) => ({ id: "c" + i, status: "active" }));
  const clients = [...active(6), { id: "p1", status: "paused" }, { id: "x1", status: "closed" }, { id: "x2", status: "prospect" }, { id: "x3", status: "lost" }];
  const c = progressOf(goal({ source: "clients", target: 10 }), { clients });
  check("progressOf clients: só conta os ativos", c.value === 6 && c.target === 10 && c.pct === 60 && c.manual === false && c.text === "6/10", JSON.stringify(c));
  check("progressOf clients: sem coleção é zero", progressOf(goal({ source: "clients", target: 10 }), {}).value === 0);

  const inQ4 = (extra) => ({ id: "f" + Math.random(), type: "entry", kind: "in", paid: true, book: "business", day: "2026-10-05", amount: 100000, ...extra });
  const finance = [
    inQ4({ amount: 70000 }),
    inQ4({ amount: 50000, day: "2026-12-31" }),
    inQ4({ amount: 99900, book: "personal" }),
    inQ4({ amount: 88800, book: undefined }),
    inQ4({ amount: 77700, kind: "out" }),
    inQ4({ amount: 66600, paid: false }),
    inQ4({ amount: 55500, day: "2026-09-30" }),
    inQ4({ amount: 44400, day: "2027-01-01" }),
    inQ4({ amount: 33300, type: "config" })
  ];
  const r = progressOf(goal({ source: "revenue", target: 300000 }), { finance });
  check("progressOf revenue: só entrada paga da empresa dentro do período", r.value === 120000, JSON.stringify(r));
  check("progressOf revenue: pct e texto em reais, sem ,00", r.pct === 40 && r.target === 300000 && r.manual === false && flat(r.text) === "R$ 1.200/R$ 3.000", JSON.stringify(r));
  check("progressOf revenue: as bordas do período contam (1º e último dia)", progressOf(goal({ source: "revenue", target: 1 }), { finance: [inQ4({ amount: 10, day: "2026-10-01" }), inQ4({ amount: 20, day: "2026-12-31" })] }).value === 30);
  const q3 = progressOf(goal({ source: "revenue", target: 300000 }), { finance }, "2026-Q3");
  check("progressOf revenue: o período do 3º argumento manda", q3.value === 55500, JSON.stringify(q3));
  const yearVal = progressOf(goal({ kind: "year", period: "2026", source: "revenue", target: 300000 }), { finance }).value;
  check("progressOf revenue: ano inteiro soma os trimestres", yearVal === 120000 + 55500, String(yearVal));
  check("progressOf revenue: sem finanças é zero", progressOf(goal({ source: "revenue", target: 300000 }), {}).value === 0);

  const won = [
    { id: "w1", wonAt: msOf(2026, 10, 3) },
    { id: "w2", wonAt: msOf(2026, 12, 31) },
    { id: "w3", wonAt: msOf(2026, 9, 30) },
    { id: "w4", wonAt: msOf(2027, 1, 1) },
    { id: "w5" },
    { id: "w6", wonAt: 0 }
  ];
  const w = progressOf(goal({ source: "won", target: 10 }), { clients: won });
  check("progressOf won: conta quem fechou dentro do período", w.value === 2 && w.text === "2/10" && w.pct === 20, JSON.stringify(w));
  check("progressOf won: o período do 3º argumento manda", progressOf(goal({ source: "won", target: 10 }), { clients: won }, "2026-Q3").value === 1);

  const team = [{ id: "t1" }, { id: "t2" }, { id: "t3", archived: true }];
  const t = progressOf(goal({ source: "team", target: 5 }), { team });
  check("progressOf team: conta quem não foi arquivado", t.value === 2 && t.text === "2/5" && t.pct === 40, JSON.stringify(t));
  check("progressOf team: conta como a aba do time (activeTeam): apagado e sem id ficam fora", progressOf(goal({ source: "team", target: 5 }), { team: [{ id: "t1", name: "Ana" }, { id: "t2", deleted: true }, { name: "sem id" }] }).value === 1);
  check("progressOf team: sem coleção é zero", progressOf(goal({ source: "team", target: 5 }), {}).value === 0);

  const l0 = progressOf(goal({ source: "launched", done: false, target: 99 }), {});
  const l1 = progressOf(goal({ source: "launched", done: true, target: 99 }), {});
  check("progressOf launched: ainda não", l0.value === 0 && l0.target === 1 && l0.pct === 0 && l0.text === "ainda não" && l0.manual === false, JSON.stringify(l0));
  check("progressOf launched: lançado", l1.value === 1 && l1.target === 1 && l1.pct === 100 && l1.text === "lançado", JSON.stringify(l1));

  const m = progressOf(goal({ source: "manual", target: 10, current: 4 }), {});
  check("progressOf manual: usa o current e só ela é manual", m.value === 4 && m.pct === 40 && m.manual === true && m.text === "4/10", JSON.stringify(m));
  check("progressOf: manual só na fonte manual", ["clients", "revenue", "won", "launched", "team"].every((s) => progressOf(goal({ source: s }), {}).manual === false));

  check("progressOf: pct passa de 100 e fica em 100", progressOf(goal({ source: "manual", target: 10, current: 25 }), {}).pct === 100);
  check("progressOf: target 0 dá pct 0 (sem dividir por zero)", progressOf(goal({ source: "manual", target: 0, current: 5 }), {}).pct === 0);
  check("progressOf: pct arredonda", progressOf(goal({ source: "manual", target: 3, current: 1 }), {}).pct === 33 && progressOf(goal({ source: "manual", target: 3, current: 2 }), {}).pct === 67);
  check("progressOf: data ausente não quebra", progressOf(goal({ source: "clients", target: 3 })).value === 0);
}

/* ---- goalPrefix e goalLine ---- */
{
  check("goalPrefix: ano", goalPrefix("year", "2026") === "meta de 2026", goalPrefix("year", "2026"));
  check("goalPrefix: semestre", goalPrefix("half", "2026-H2") === "meta do 2º semestre" && goalPrefix("half", "2026-H1") === "meta do 1º semestre", goalPrefix("half", "2026-H2"));
  check("goalPrefix: trimestre", goalPrefix("quarter", "2026-Q4") === "meta do 4º tri" && goalPrefix("quarter", "2026-Q1") === "meta do 1º tri", goalPrefix("quarter", "2026-Q4"));

  const active = Array.from({ length: 6 }, (_, i) => ({ id: "c" + i, status: "active" }));
  const line = goalLine(goal({ source: "clients", target: 10 }), { clients: active });
  check("goalLine: o critério do ticket", line === "meta do 4º tri · 10 clientes ativos (hoje 6)", line);
  const finance = [{ id: "f", type: "entry", kind: "in", paid: true, book: "business", day: "2026-10-05", amount: 1200000 }];
  const rev = goalLine(goal({ source: "revenue", target: 3000000 }), { finance });
  check("goalLine: faturamento", flat(rev) === "meta do 4º tri · faturar R$ 30.000 (hoje R$ 12.000)", rev);
  const won = goalLine(goal({ source: "won", target: 10 }), { clients: [{ id: "a", wonAt: msOf(2026, 10, 3) }, { id: "b", wonAt: msOf(2026, 11, 3) }] });
  check("goalLine: leads fechados", won === "meta do 4º tri · 10 leads fechados (hoje 2)", won);
  const team = goalLine(goal({ source: "team", target: 5 }), { team: [{ id: "a" }, { id: "b" }] });
  check("goalLine: pessoas no time", team === "meta do 4º tri · 5 pessoas no time (hoje 2)", team);
  const man = goalLine(goal({ source: "manual", text: "dormir melhor", target: 10, current: 3 }), {});
  check("goalLine: manual leva o texto e (à mão)", man === "meta do 4º tri · dormir melhor (à mão)", man);
  const lau = goalLine(goal({ source: "launched", text: "lançar o produto" }), {});
  check("goalLine: lançamento leva o texto, sem (à mão)", lau.startsWith("meta do 4º tri · ") && lau.includes("lançar o produto") && !lau.includes("à mão"), lau);
  check("goalLine: semestre e ano usam o próprio prefixo", goalLine(goal({ kind: "half", period: "2026-H2", source: "clients", target: 10 }), { clients: active }).startsWith("meta do 2º semestre · ") && goalLine(goal({ kind: "year", period: "2026", source: "clients", target: 10 }), { clients: active }).startsWith("meta de 2026 · "));
}

/* ---- readTarget e targetText ---- */
{
  check("readTarget: faturamento '30.000' é 3000000 centavos", readTarget("30.000", "revenue") === 3000000, String(readTarget("30.000", "revenue")));
  check("readTarget: faturamento '1.200,50'", readTarget("1.200,50", "revenue") === 120050, String(readTarget("1.200,50", "revenue")));
  check("readTarget: contagem '10' é 10", readTarget("10", "clients") === 10 && readTarget("5", "team") === 5 && readTarget("8", "won") === 8);
  check("readTarget: texto sem número é 0", readTarget("abc", "clients") === 0 && readTarget("", "clients") === 0 && readTarget("abc", "revenue") === 0 && readTarget("", "revenue") === 0);
  check("targetText: faturamento '30.000'", targetText(3000000, "revenue") === "30.000", targetText(3000000, "revenue"));
  check("targetText: contagem '10'", targetText(10, "clients") === "10", targetText(10, "clients"));
  check("targetText: zero fica vazio", targetText(0, "clients") === "" && targetText(0, "revenue") === "");
  check("targetText volta pelo readTarget", readTarget(targetText(3000000, "revenue"), "revenue") === 3000000 && readTarget(targetText(12, "won"), "won") === 12);
}

/* ---- goalDoc ---- */
{
  const r = goalDoc({ kind: "quarter", text: "dez clientes", source: "clients", target: 10 }, [], TODAY);
  check("goalDoc: devolve doc, não erro", !!r.doc && !r.error, JSON.stringify(r));
  const d = r.doc || {};
  check("goalDoc: o período padrão é o de hoje", d.period === "2026-Q4" && d.kind === "quarter", JSON.stringify(d));
  check("goalDoc: leva fonte, texto e target", d.source === "clients" && d.text === "dez clientes" && d.target === 10 && d.done === false, JSON.stringify(d));
  check("goalDoc: id novo e datas", typeof d.id === "string" && d.id.length > 0 && typeof d.createdAt === "number" && typeof d.updatedAt === "number", JSON.stringify(d));
  check("goalDoc: ids diferentes a cada meta", goalDoc({ kind: "quarter", text: "a", source: "clients", target: 1 }, [], TODAY).doc.id !== goalDoc({ kind: "quarter", text: "a", source: "clients", target: 1 }, [], TODAY).doc.id);
  check("goalDoc: o doc passa pelo normalize inteiro", !!normalize(d) && normalize(d).period === d.period);
  check("goalDoc: ano e semestre pelo dia de hoje", goalDoc({ kind: "year", text: "a", source: "manual", target: 1 }, [], TODAY).doc.period === "2026" && goalDoc({ kind: "half", text: "a", source: "manual", target: 1 }, [], TODAY).doc.period === "2026-H2");
  check("goalDoc: o period do spec vale", goalDoc({ kind: "quarter", period: "2027-Q1", text: "a", source: "manual", target: 1 }, [], TODAY).doc.period === "2027-Q1");
  check("goalDoc: kind inválido vira trimestre", goalDoc({ kind: "month", text: "a", source: "manual", target: 1 }, [], TODAY).doc.kind === "quarter" && goalDoc({ text: "a", source: "manual", target: 1 }, [], TODAY).doc.kind === "quarter");
  check("goalDoc: fonte desconhecida vira manual", goalDoc({ kind: "quarter", text: "a", source: "magia", target: 1 }, [], TODAY).doc.source === "manual");
  check("goalDoc: o current só entra na manual", goalDoc({ kind: "quarter", text: "a", source: "manual", target: 10, current: 4 }, [], TODAY).doc.current === 4 && goalDoc({ kind: "quarter", text: "a", source: "clients", target: 10, current: 4 }, [], TODAY).doc.current === 0);
  for (const s of GOAL_SOURCES) {
    const e = goalDoc({ kind: "quarter", text: "", source: s.id, target: 3 }, [], TODAY).doc;
    check("goalDoc: sem texto usa o rótulo da fonte (" + s.id + ")", e && e.text === s.label && e.text.length > 0, JSON.stringify(e));
  }
  check("goalDoc: texto só de espaços também usa o rótulo", goalDoc({ kind: "quarter", text: "   ", source: "clients", target: 3 }, [], TODAY).doc.text === GOAL_SOURCES.find((s) => s.id === "clients").label);

  const three = [goal({ id: "1" }), goal({ id: "2" }), goal({ id: "3" })];
  const full = goalDoc({ kind: "quarter", text: "a quarta", source: "manual", target: 1 }, three, TODAY);
  check("goalDoc: trimestre cheio é erro", !full.doc && full.error === "três já é muito para um trimestre", JSON.stringify(full));
  check("goalDoc: com 2 ainda cabe", !!goalDoc({ kind: "quarter", text: "a", source: "manual", target: 1 }, three.slice(0, 2), TODAY).doc);
  check("goalDoc: outro trimestre não está cheio", !!goalDoc({ kind: "quarter", period: "2027-Q1", text: "a", source: "manual", target: 1 }, three, TODAY).doc);
  const yr = goalDoc({ kind: "year", text: "a", source: "manual", target: 1 }, [goal({ kind: "year", period: "2026" })], TODAY);
  check("goalDoc: ano com uma meta já é limite", !yr.doc && typeof yr.error === "string" && yr.error.length > 0, JSON.stringify(yr));
  const hf = goalDoc({ kind: "half", text: "a", source: "manual", target: 1 }, [goal({ kind: "half", period: "2026-H2" })], TODAY);
  check("goalDoc: semestre com uma meta já é limite", !hf.doc && typeof hf.error === "string" && hf.error.length > 0, JSON.stringify(hf));
  check("goalDoc: o formato antigo não ocupa vaga", !!goalDoc({ kind: "quarter", text: "a", source: "manual", target: 1 }, [{ id: "quarter:2026-Q4", kind: "quarter", goals: [{}, {}, {}] }, ...three.slice(0, 2)], TODAY).doc);
}

/* ---- o assistente: goal-set ---- */
{
  check("assistente: goal-set grava na coleção plans", ACTION_COLLECTIONS["goal-set"] === "plans", String(ACTION_COLLECTIONS["goal-set"]));

  const now = core.today();
  const qNow = periodOf(now, "quarter");
  const store = (docs) => ({ all: () => docs, get: (id) => docs.find((x) => x.id === id) || null });
  const payload = { kind: "quarter", source: "clients", target: 10, text: "" };
  const v = { kind: "quarter", text: "dez clientes", source: "clients", target: "10" };

  const r = buildDoc("goal-set", payload, v, store([]), {});
  check("buildDoc goal-set: devolve doc, não erro", !!r.doc && !r.error, JSON.stringify(r));
  const d = r.doc || {};
  check("buildDoc goal-set: período do trimestre de hoje", d.kind === "quarter" && d.period === qNow, JSON.stringify(d));
  check("buildDoc goal-set: fonte, texto e target lidos do campo", d.source === "clients" && d.text === "dez clientes" && d.target === 10, JSON.stringify(d));
  const rev = buildDoc("goal-set", { kind: "quarter", source: "revenue", target: 3000000 }, { kind: "quarter", text: "", source: "revenue", target: "30.000" }, store([]), {}).doc;
  check("buildDoc goal-set: faturamento lê o campo em reais", rev && rev.target === 3000000, JSON.stringify(rev));
  const yr = buildDoc("goal-set", payload, { ...v, kind: "year" }, store([]), {}).doc;
  check("buildDoc goal-set: ano usa o ano de hoje", yr && yr.kind === "year" && yr.period === periodOf(now, "year"), JSON.stringify(yr));

  const three = [goal({ id: "1", period: qNow }), goal({ id: "2", period: qNow }), goal({ id: "3", period: qNow })];
  const full = buildDoc("goal-set", payload, v, store(three), {});
  check("buildDoc goal-set: trimestre cheio é erro", !full.doc && typeof full.error === "string" && full.error.length > 0, JSON.stringify(full));

  const prefix = goalPrefix("quarter", qNow);
  const six = Array.from({ length: 6 }, (_, i) => ({ id: "c" + i, status: "active" }));
  const prev = previewOf("goal-set", { kind: "quarter", source: "clients", target: 10 }, { clients: six });
  check("previewOf goal-set: a linha da meta", prev === prefix + " · 10 clientes ativos (hoje 6)", prev);
  check("previewOf goal-set: sem dados não quebra", typeof previewOf("goal-set", { kind: "quarter", source: "clients", target: 10 }, undefined) === "string");
}

if (failures.length) {
  console.error(failures.length + " falhou(aram), " + passed + " ok:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("plans.test.mjs: " + passed + " verificações ok");
