/* testa o sono (ticket #63): as contas puras da página sleep.html e do verbo
 * "dormi 7h". o navegador de mentira sobe antes do import porque o sleep-data
 * importa o core, que é um módulo de navegador. */

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

const S = await import("./sleep-data.js");
const { SLEEP_MAX, SLEEP_GOALS, normalize, sleepLabel, sleptBetween, readHours, nightOf, weekNights, weekAverage, sleepLine, sleepDoc, undoSleep } = S;

const TODAY = "2026-10-20";   /* uma terça */
const MONDAY = "2026-10-19";
const night = (id, min, extra) => ({ id, min, createdAt: 1, updatedAt: 1, ...extra });

/* ---- as constantes ---- */
{
  check("o teto é de 24h em minutos", SLEEP_MAX === 1440, String(SLEEP_MAX));
  check("as metas: 7h, 7h30, 8h e sem meta", SLEEP_GOALS.map((g) => g.id + ":" + g.label).join() === "420:7h,450:7h30,480:8h,0:sem meta", JSON.stringify(SLEEP_GOALS));
}

/* ---- sleepLabel ---- */
{
  check("sleepLabel: 440 -> 7h20", sleepLabel(440) === "7h20", sleepLabel(440));
  check("sleepLabel: 420 -> 7h (sem minutos)", sleepLabel(420) === "7h", sleepLabel(420));
  check("sleepLabel: 425 -> 7h05 (minuto com zero à esquerda)", sleepLabel(425) === "7h05", sleepLabel(425));
  check("sleepLabel: 450 -> 7h30", sleepLabel(450) === "7h30", sleepLabel(450));
  check("sleepLabel: 45 -> 45min", sleepLabel(45) === "45min", sleepLabel(45));
  check("sleepLabel: zero, negativo e inválido dão vazio", sleepLabel(0) === "" && sleepLabel(-30) === "" && sleepLabel(NaN) === "" && sleepLabel(undefined) === "" && sleepLabel("abc") === "", [sleepLabel(0), sleepLabel(-30), sleepLabel(NaN)].join("|"));
}

/* ---- sleptBetween: passa da meia-noite ---- */
{
  check("deitou 23:10 e acordou 06:30 -> 440 (passa da meia-noite)", sleptBetween("23:10", "06:30") === 440, String(sleptBetween("23:10", "06:30")));
  check("deitou 01:00 e acordou 08:00 -> 420 (mesmo dia)", sleptBetween("01:00", "08:00") === 420, String(sleptBetween("01:00", "08:00")));
  check("deitou 22:00 e acordou 06:00 -> 480", sleptBetween("22:00", "06:00") === 480);
  check("hora inválida -> null", sleptBetween("25:00", "06:00") === null && sleptBetween("23:00", "abc") === null && sleptBetween("", "06:00") === null && sleptBetween("23:00", "") === null && sleptBetween(undefined, undefined) === null);
  check("horas iguais -> null (não é um dia inteiro de sono)", sleptBetween("07:00", "07:00") === null, String(sleptBetween("07:00", "07:00")));
}

/* ---- readHours: o que a pessoa escreveu ---- */
{
  const cases = [["7h30", 450], ["7h", 420], ["7", 420], ["7,5", 450], ["7.5", 450], ["7:30", 450], ["450min", 450], ["7h e meia", 450], ["", 0], ["abc", 0]];
  for (const [text, want] of cases) check("readHours: '" + text + "' -> " + want, readHours(text) === want, String(readHours(text)));
  check("readHours: o teto é de 24h", readHours("30h") <= 1440 && readHours("9999min") === 1440, readHours("30h") + " " + readHours("9999min"));
}

/* ---- normalize ---- */
{
  const a = normalize({ id: "2026-10-20", min: 440, bed: "23:10", wake: "06:30", createdAt: 5, updatedAt: 6 });
  check("normalize: guarda o que veio, com as chaves do documento", a.id === "2026-10-20" && a.min === 440 && a.bed === "23:10" && a.wake === "06:30" && a.createdAt === 5 && a.updatedAt === 6, JSON.stringify(a));
  check("normalize: min inválido vira 0", normalize({ id: "2026-10-20", min: NaN }).min === 0 && normalize({ id: "2026-10-20" }).min === 0 && normalize({ id: "2026-10-20", min: "abc" }).min === 0);
  check("normalize: min acima do teto vira 1440", normalize({ id: "2026-10-20", min: 9999 }).min === 1440);
  check("normalize: min negativo vira 0", normalize({ id: "2026-10-20", min: -5 }).min === 0);
  check("normalize: min vira inteiro", Number.isInteger(normalize({ id: "2026-10-20", min: 420.6 }).min));
  const b = normalize({ id: "2026-10-20", min: 400, bed: "6:30", wake: "25:00" });
  check("normalize: '6:30' vira '06:30'", b.bed === "06:30", b.bed);
  check("normalize: hora inválida vira vazio", b.wake === "", JSON.stringify(b.wake));
  const c = normalize({ id: "2026-10-20", min: 400 });
  check("normalize: sem bed e wake, ficam vazios", c.bed === "" && c.wake === "", JSON.stringify(c));
  check("normalize: sem datas, createdAt e updatedAt vêm preenchidos", typeof c.createdAt === "number" && typeof c.updatedAt === "number", JSON.stringify(c));
}

/* ---- nightOf: a data da noite ---- */
{
  check("nightOf: sem data é hoje", nightOf({}, TODAY).day === TODAY && !nightOf({}, TODAY).error, JSON.stringify(nightOf({}, TODAY)));
  check("nightOf: data explícita passada vale", nightOf({ date: "2026-10-19" }, TODAY).day === "2026-10-19" && !nightOf({ date: "2026-10-19" }, TODAY).error);
  check("nightOf: hoje explícito vale", nightOf({ date: TODAY }, TODAY).day === TODAY && !nightOf({ date: TODAY }, TODAY).error);
  check("nightOf: data inválida cai em hoje", nightOf({ date: "ontem" }, TODAY).day === TODAY && nightOf({ date: "2026-10-1" }, TODAY).day === TODAY, JSON.stringify([nightOf({ date: "ontem" }, TODAY)]));
  check("nightOf: dia que não existe cai em hoje", nightOf({ date: "2026-13-45" }, TODAY).day === TODAY && nightOf({ date: "2026-02-30" }, TODAY).day === TODAY && !nightOf({ date: "2026-13-45" }, TODAY).error, JSON.stringify([nightOf({ date: "2026-13-45" }, TODAY), nightOf({ date: "2026-02-30" }, TODAY)]));
  check("nightOf: 29 de fevereiro só vale em ano bissexto", nightOf({ date: "2024-02-29" }, TODAY).day === "2024-02-29" && nightOf({ date: "2025-02-29" }, TODAY).day === TODAY);
  const f = nightOf({ date: "2026-10-21" }, TODAY);
  check("nightOf: amanhã é erro 'esse dia ainda não chegou'", f.error === "esse dia ainda não chegou", JSON.stringify(f));
  check("nightOf: no erro o dia também vem", f.day === "2026-10-21", JSON.stringify(f));
}

/* ---- weekNights: sete noites, de segunda a domingo ---- */
{
  const docs = [
    night("2026-10-19", 420),
    night("2026-10-21", 450),
    night("2026-10-25", 360),
    night("2026-10-18", 500),   /* domingo da semana anterior */
    night("2026-10-26", 480)    /* segunda da semana seguinte */
  ];
  const w = weekNights(docs, MONDAY);
  check("weekNights: sete noites", w.length === 7, String(w.length));
  check("weekNights: de segunda a domingo, em ordem", w.map((x) => x.day).join() === "2026-10-19,2026-10-20,2026-10-21,2026-10-22,2026-10-23,2026-10-24,2026-10-25", w.map((x) => x.day).join());
  check("weekNights: min dos dias com registro", w[0].min === 420 && w[2].min === 450 && w[6].min === 360, w.map((x) => x.min).join());
  check("weekNights: o doc vem junto", w[0].doc && w[0].doc.id === "2026-10-19", JSON.stringify(w[0]));
  check("weekNights: noite sem documento tem min 0 e doc null", w[1].min === 0 && w[1].doc === null, JSON.stringify(w[1]));
  check("weekNights: documento de outra semana não entra", !w.some((x) => x.min === 500 || x.min === 480));
  const w2 = weekNights([night("2026-10-20", 420, { deleted: true }), night("2026-10-21", 0)], MONDAY);
  check("weekNights: documento apagado (lápide) conta como vazio", w2[1].min === 0 && w2[1].doc === null, JSON.stringify(w2[1]));
  check("weekNights: documento com min 0 conta como vazio", w2[2].min === 0 && w2[2].doc === null, JSON.stringify(w2[2]));
  check("weekNights: sem a lista, não quebra", weekNights(undefined, MONDAY).length === 7 && weekNights(undefined, MONDAY).every((x) => x.min === 0 && x.doc === null));
  check("weekNights: a virada de mês (26 out a 1 nov)", weekNights([], "2026-10-26").map((x) => x.day).join() === "2026-10-26,2026-10-27,2026-10-28,2026-10-29,2026-10-30,2026-10-31,2026-11-01");
}

/* ---- weekAverage: a média dos últimos 7 dias com registro ---- */
{
  const docs = [night("2026-10-20", 420), night("2026-10-19", 360), night("2026-10-17", 480)];
  check("weekAverage: 420, 360 e 480 -> 420", weekAverage(docs, TODAY) === 420, String(weekAverage(docs, TODAY)));
  check("weekAverage: sem registros -> null", weekAverage([], TODAY) === null && weekAverage(undefined, TODAY) === null, String(weekAverage([], TODAY)));
  /* hoje - 6 = 2026-10-14 entra; hoje - 7 = 2026-10-13 não */
  check("weekAverage: a janela é hoje e os 6 dias antes (inclusive)", weekAverage([night("2026-10-14", 400)], TODAY) === 400 && weekAverage([night("2026-10-13", 400)], TODAY) === null);
  check("weekAverage: noite de 8 dias atrás não conta", weekAverage([...docs, night("2026-10-12", 60)], TODAY) === 420);
  check("weekAverage: noite no futuro não conta", weekAverage([...docs, night("2026-10-21", 60)], TODAY) === 420);
  check("weekAverage: min 0 não entra na média", weekAverage([...docs, night("2026-10-18", 0)], TODAY) === 420);
  check("weekAverage: arredonda para minuto inteiro", weekAverage([night("2026-10-20", 421), night("2026-10-19", 420)], TODAY) === Math.round(420.5) && Number.isInteger(weekAverage([night("2026-10-20", 421), night("2026-10-19", 420), night("2026-10-18", 420)], TODAY)));
  check("weekAverage: só noites sem min -> null", weekAverage([night("2026-10-20", 0)], TODAY) === null);
}

/* ---- sleepLine: a linha do cartão e da pílula ---- */
{
  check("sleepLine: hoje não leva a data", sleepLine(420, TODAY, TODAY) === "7h de sono", sleepLine(420, TODAY, TODAY));
  check("sleepLine: outro dia leva 'noite de dd/mm'", sleepLine(360, "2026-10-19", TODAY) === "6h de sono · noite de 19/10", sleepLine(360, "2026-10-19", TODAY));
  check("sleepLine: com minutos", sleepLine(450, TODAY, TODAY) === "7h30 de sono", sleepLine(450, TODAY, TODAY));
}

/* ---- sleepDoc: o documento que o cartão e a pílula gravam ---- */
{
  const e1 = sleepDoc({ date: "2026-10-21", min: 420 }, null, TODAY);
  check("sleepDoc: dia futuro é erro", e1.error === "esse dia ainda não chegou" && !e1.doc, JSON.stringify(e1));
  const e2 = sleepDoc({ date: TODAY, min: 0 }, null, TODAY);
  check("sleepDoc: sem horas pede as horas", e2.error === "quantas horas você dormiu?" && !e2.doc, JSON.stringify(e2));
  check("sleepDoc: min ausente também pede as horas", sleepDoc({ date: TODAY }, null, TODAY).error === "quantas horas você dormiu?");
  check("sleepDoc: min negativo também pede as horas", sleepDoc({ date: TODAY, min: -10 }, null, TODAY).error === "quantas horas você dormiu?");

  const t0 = Date.now();
  const ok = sleepDoc({ date: "2026-10-19", min: 360 }, null, TODAY);
  check("sleepDoc: o id é o dia e o min vem como dado", ok.doc && ok.doc.id === "2026-10-19" && ok.doc.min === 360 && !ok.error, JSON.stringify(ok));
  check("sleepDoc: sem noite anterior, createdAt e updatedAt são agora", ok.doc && ok.doc.createdAt >= t0 && ok.doc.updatedAt >= t0 && ok.doc.createdAt <= Date.now() + 5, JSON.stringify(ok.doc));
  const hoje = sleepDoc({ min: 420 }, null, TODAY);
  check("sleepDoc: sem data é a noite de hoje", hoje.doc && hoje.doc.id === TODAY, JSON.stringify(hoje));
  const teto = sleepDoc({ date: TODAY, min: 9999 }, null, TODAY);
  check("sleepDoc: min acima do teto vira 1440", teto.doc && teto.doc.min === 1440, JSON.stringify(teto));

  const calc = sleepDoc({ date: TODAY, min: 100, bed: "23:10", wake: "06:30" }, null, TODAY);
  check("sleepDoc: com deitou e acordou, as horas saem da conta (ignora o min dado)", calc.doc && calc.doc.min === 440 && calc.doc.bed === "23:10" && calc.doc.wake === "06:30", JSON.stringify(calc));
  const semMin = sleepDoc({ date: TODAY, bed: "23:10", wake: "06:30" }, null, TODAY);
  check("sleepDoc: deitou e acordou bastam, sem o min", semMin.doc && semMin.doc.min === 440 && !semMin.error, JSON.stringify(semMin));
  const soUm = sleepDoc({ date: TODAY, min: 400, bed: "23:10" }, null, TODAY);
  check("sleepDoc: com só um dos dois, vale o min dado", soUm.doc && soUm.doc.min === 400, JSON.stringify(soUm));

  const before = night(TODAY, 300, { createdAt: 111, updatedAt: 222 });
  const sub = sleepDoc({ date: TODAY, min: 420 }, before, TODAY);
  check("sleepDoc: substituir mantém o createdAt da noite de antes", sub.doc && sub.doc.createdAt === 111 && sub.doc.updatedAt >= t0 && sub.doc.min === 420, JSON.stringify(sub));
}

/* ---- undoSleep: desfazer no formato do undoHabit ---- */
{
  const before = night(TODAY, 300);
  const after = night(TODAY, 420);
  const u1 = undoSleep(before, after);
  check("undoSleep: com a noite de antes, grava de volta", u1.save === before && !("remove" in u1), JSON.stringify(u1));
  const u2 = undoSleep(null, after);
  check("undoSleep: sem a noite de antes, apaga a de agora", u2.remove === TODAY && !("save" in u2), JSON.stringify(u2));
  check("undoSleep: undefined também é 'não havia'", undoSleep(undefined, after).remove === TODAY);
}

if (failures.length) {
  console.error(failures.length + " falhou(aram), " + passed + " ok:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("sleep.test.mjs: " + passed + " verificações ok");
