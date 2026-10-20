/* testa o lançamento de dinheiro pela secretária (ticket #5): o que o Enter do
 * início e a pílula da conversa gravam, e o que o desfazer devolve.
 *
 * errar aqui é dinheiro errado na conta, sem aviso: um previsto confirmado que
 * vira um segundo lançamento (a despesa conta duas vezes), um fixo lançado que
 * continua sugerido (conta duas vezes de novo), um previsto futuro que mexe no
 * saldo de hoje, uma categoria inventada pela IA. tudo isso é puro — o teste
 * passa as datas na mão, para não depender do relógio.
 *
 * o finance-data e o assistant-actions importam o core, que é um módulo de
 * navegador; então o navegador de mentira (o mesmo de test.mjs) sobe ANTES do
 * import, e o import é dinâmico.
 */

let passed = 0;
const failures = [];
const check = (name, cond, detail) => { if (cond) passed++; else failures.push(name + (detail ? " -> " + detail : "")); };

/* ---- o navegador de mentira ---- */

function makeStorage(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    has: (k) => map.has(k),
    keys: () => [...map.keys()]
  };
}

const noop = () => {};
const classList = { add: noop, remove: noop, contains: () => false, toggle: () => false };
globalThis.document = {
  documentElement: { classList },
  addEventListener: noop,
  hidden: false,
  querySelector: () => null
};
globalThis.window = { addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }) };
globalThis.location = { reload: noop };
/* rede que ninguém preparou é erro: um teste que faz rede sem querer não prova nada */
globalThis.fetch = async (url) => { throw new Error("fetch nao previsto no teste: " + url); };
globalThis.localStorage = makeStorage({});

const core = await import("./core.js");
const {
  newEntry, entryLine, undoEntry, paidOf, normalize, contextOf, balanceUntil, realBalanceUntil, projectionsOf
} = await import("./finance-data.js");
const {
  ACTION_COLLECTIONS, ACTION_LABELS, buildDoc, previewOf, normalizeChat, markProposal
} = await import("./assistant-actions.js");

/* ---- o cenário: hoje é 17/10/2026 (sábado) ---- */
const TODAY = "2026-10-17";
const YESTERDAY = "2026-10-16";
const LATER = "2026-10-25";
const MONTH_END = "2026-10-31";
const cfg = normalize({ id: "config", type: "config" });
const baseCtx = { entries: [], fixed: [], cards: [], debts: [], invests: [], startBalance: { day: "2026-10-01", amount: 100000 } };
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- o que conta como pago ---------- */
{
  check("pago: hoje é pago", paidOf(TODAY, undefined, TODAY) === true);
  check("pago: dia passado é pago", paidOf(YESTERDAY, true, TODAY) === true);
  check("pago: dia passado sem dizer nada é pago", paidOf(YESTERDAY, undefined, TODAY) === true);
  check("pago: dia passado que a pessoa desmarcou é previsto", paidOf(YESTERDAY, false, TODAY) === false);
  check("pago: depois de hoje nunca é pago, mesmo marcado", paidOf(LATER, true, TODAY) === false);
  check("pago: depois de hoje sem dizer nada é previsto", paidOf(LATER, undefined, TODAY) === false);
}

/* ---------- o normalize guarda de onde veio ---------- */
{
  check("normalize: o lançamento guarda via", normalize({ id: "a", type: "entry", day: TODAY, via: "chat" }).via === "chat");
  check("normalize: sem via fica vazio", normalize({ id: "a", type: "entry", day: TODAY }).via === "");
  check("normalize: o via não vaza para outros tipos", !("via" in normalize({ id: "f", type: "fixed", via: "chat" })));
}

/* ---------- gasto ---------- */
{
  const r = newEntry({ title: "almoço", amount: 4500, flow: "out", category: "Lazer", date: TODAY }, cfg, baseCtx, TODAY);
  const d = r.doc;
  check("gasto: devolve doc, não erro", !!d && !r.error, JSON.stringify(r));
  check("gasto: é um lançamento de saída com o valor dito", d && d.type === "entry" && d.kind === "out" && d.amount === 4500, JSON.stringify(d));
  check("gasto: hoje já é pago", d && d.paid === true);
  check("gasto: nasce do chat, e sem conversa a origem é o início", d && d.origin && d.origin.type === "chat" && d.origin.id === "home" && d.via === "chat", JSON.stringify(d && d.origin));
  check("gasto: guarda o nome, a categoria e o dia", d && d.name === "almoço" && d.category === "Lazer" && d.day === TODAY);
  check("gasto: nasce com id e carimbos", d && typeof d.id === "string" && d.id !== "" && d.createdAt > 0 && d.updatedAt > 0);

  const other = newEntry({ title: "almoço", amount: 4500, flow: "out", category: "Lazer", date: TODAY }, cfg, baseCtx, TODAY).doc;
  check("gasto: dois lançamentos iguais têm ids diferentes", d && other && d.id !== other.id);

  const inChat = newEntry({ title: "café", amount: 900, flow: "out", date: TODAY, chat: "conv-7" }, cfg, baseCtx, TODAY).doc;
  check("gasto: pela conversa, a origem é o id da conversa", inChat && inChat.origin.type === "chat" && inChat.origin.id === "conv-7", JSON.stringify(inChat && inChat.origin));

  const unpaid = newEntry({ title: "boleto", amount: 3000, flow: "out", date: YESTERDAY, paid: false }, cfg, baseCtx, TODAY).doc;
  check("gasto: dia passado que a pessoa desmarcou fica previsto", unpaid && unpaid.paid === false);

  const badDate = newEntry({ title: "x", amount: 100, flow: "out", date: "amanhã" }, cfg, baseCtx, TODAY).doc;
  check("gasto: data inválida cai em hoje", badDate && badDate.day === TODAY, JSON.stringify(badDate));

  /* o doc passa pelo normalize da coleção sem perder nada do que importa */
  const n = normalize(d);
  check("gasto: sobrevive ao normalize da coleção", n.via === "chat" && n.origin.type === "chat" && n.amount === 4500 && n.paid === true);

  /* e entra na conta: o saldo de hoje desce o valor */
  const ctx = { ...baseCtx, entries: [d] };
  check("gasto: o saldo real de hoje desconta o valor", realBalanceUntil(TODAY, ctx) === 100000 - 4500, String(realBalanceUntil(TODAY, ctx)));
}

/* ---------- entrada ---------- */
{
  const d = newEntry({ title: "Ana", amount: 300000, flow: "in", category: "Freela", date: YESTERDAY }, cfg, baseCtx, TODAY).doc;
  check("entrada: é entrada, paga, no dia dito", d && d.kind === "in" && d.paid === true && d.day === YESTERDAY, JSON.stringify(d));
  check("entrada: guarda o valor", d && d.amount === 300000);
  check("entrada: o saldo real sobe o valor", realBalanceUntil(TODAY, { ...baseCtx, entries: [d] }) === 400000);
}

/* ---------- previsto futuro ---------- */
{
  const d = newEntry({ title: "dentista", amount: 30000, flow: "out", date: LATER, paid: true }, cfg, baseCtx, TODAY).doc;
  check("previsto: data depois de hoje fica não pago, mesmo se a IA disse que sim", d && d.paid === false && d.day === LATER, JSON.stringify(d));
  const without = baseCtx;
  const withDoc = { ...baseCtx, entries: [d] };
  check("previsto: o saldo do fim do mês desconta o valor",
    balanceUntil(MONTH_END, withDoc) === balanceUntil(MONTH_END, without) - 30000,
    balanceUntil(MONTH_END, withDoc) + " vs " + balanceUntil(MONTH_END, without));
  check("previsto: o saldo real de hoje não muda",
    realBalanceUntil(TODAY, withDoc) === realBalanceUntil(TODAY, without),
    realBalanceUntil(TODAY, withDoc) + " vs " + realBalanceUntil(TODAY, without));
}

/* ---------- confirmar um previsto que já existe ---------- */
{
  const planned = { id: "p15", type: "entry", name: "aluguel", amount: 150000, kind: "out", category: "Básicas/PF", day: "2026-10-15", paid: false, origin: null, via: "", createdAt: 1, updatedAt: 1 };
  const snapshot = JSON.parse(JSON.stringify(planned));
  const ctx = { ...baseCtx, entries: [planned] };

  const r = newEntry({ title: "", amount: 0, flow: "out", date: TODAY, confirm: "p15" }, cfg, ctx, TODAY);
  const d = r.doc;
  check("confirmar: sem valor dito é válido, não é erro", !!d && !r.error, JSON.stringify(r));
  check("confirmar: é o mesmo documento, com o mesmo dia", d && d.id === "p15" && d.day === "2026-10-15" && d.type === "entry", JSON.stringify(d));
  check("confirmar: fica pago e leva a marca do chat", d && d.paid === true && d.via === "chat");
  check("confirmar: sem valor dito, fica o de antes, com o mesmo nome", d && d.amount === 150000 && d.name === "aluguel" && d.kind === "out");
  check("confirmar: o carimbo de atualização é novo", d && d.updatedAt > 1);
  check("confirmar: não mexe no previsto que veio no contexto", sameJson(planned, snapshot));

  const undo = undoEntry(planned, d);
  check("confirmar: o desfazer devolve o previsto como estava", undo && sameJson(undo.save, snapshot) && undo.save.paid === false && !("remove" in undo), JSON.stringify(undo));

  const said = newEntry({ title: "", amount: 148000, flow: "out", date: TODAY, confirm: "p15" }, cfg, ctx, TODAY).doc;
  check("confirmar: o valor dito troca o de antes", said && said.id === "p15" && said.amount === 148000 && said.paid === true && said.day === "2026-10-15", JSON.stringify(said));

  /* o retrato mostra o id como "#p15", e a IA às vezes o devolve assim */
  const hashed = newEntry({ title: "", amount: 0, flow: "out", date: TODAY, confirm: "#p15" }, cfg, ctx, TODAY).doc;
  check("confirmar: o id com # do retrato confirma o mesmo previsto", hashed && hashed.id === "p15" && hashed.paid === true, JSON.stringify(hashed));

  const named = newEntry({ title: "aluguel de outubro", amount: 0, flow: "out", date: TODAY, confirm: "p15" }, cfg, ctx, TODAY).doc;
  check("confirmar: o nome dito troca o de antes", named && named.id === "p15" && named.name === "aluguel de outubro", JSON.stringify(named));

  /* o previsto confirmado sai do previsto e entra no real, sem contar duas vezes */
  const after = { ...baseCtx, entries: [d] };
  check("confirmar: o saldo real de hoje passa a descontar", realBalanceUntil(TODAY, after) === 100000 - 150000);
  check("confirmar: o previsto do mês não dobra", balanceUntil(MONTH_END, after) === balanceUntil(MONTH_END, ctx), balanceUntil(MONTH_END, after) + " vs " + balanceUntil(MONTH_END, ctx));

  /* confirm que não bate com nada vale como vazio, a mesma regra do Worker */
  const ghost = newEntry({ title: "x", amount: 2000, flow: "out", date: TODAY, confirm: "nao-existe" }, cfg, ctx, TODAY).doc;
  check("confirmar: id que não existe vira lançamento novo", ghost && ghost.id !== "p15" && ghost.origin.type === "chat" && ghost.amount === 2000, JSON.stringify(ghost));
  check("confirmar: id que não existe e sem valor é erro", newEntry({ title: "x", amount: 0, flow: "out", date: TODAY, confirm: "nao-existe" }, cfg, ctx, TODAY).error === "falta o valor");

  /* um lançamento que já está pago não é "previsto aberto": confirmar de novo
     não pode sobrescrever nem duplicar o que já foi dado como pago */
  const paidAlready = { ...planned, id: "p16", paid: true };
  const again = newEntry({ title: "x", amount: 2000, flow: "out", date: TODAY, confirm: "p16" }, cfg, { ...baseCtx, entries: [paidAlready] }, TODAY).doc;
  check("confirmar: lançamento já pago não é confirmado de novo", again && again.id !== "p16", JSON.stringify(again));
}

/* ---------- fixo do mês ---------- */
{
  const internet = { id: "f-net", type: "fixed", name: "internet", amount: 12000, kind: "out", category: "Recorrente", dayOfMonth: 20, active: true };
  const ctx = { ...baseCtx, fixed: [internet] };
  const before = projectionsOf("2026-10-20", ctx);
  check("fixo: antes de lançar, a conta sugere o fixo no dia dele", before.length === 1 && before[0].origin.id === "f-net", JSON.stringify(before));

  const r = newEntry({ title: "", amount: 0, flow: "out", date: TODAY, fixed: "f-net" }, cfg, ctx, TODAY);
  const d = r.doc;
  check("fixo: sem valor dito é válido", !!d && !r.error, JSON.stringify(r));
  check("fixo: a origem é o fixo e a marca é o chat", d && d.origin && d.origin.type === "fixed" && d.origin.id === "f-net" && d.via === "chat", JSON.stringify(d));
  check("fixo: o valor, o nome, o tipo e a categoria são os do fixo", d && d.amount === 12000 && d.name === "internet" && d.kind === "out" && d.category === "Recorrente", JSON.stringify(d));
  check("fixo: é um lançamento novo, não o fixo", d && d.type === "entry" && d.id !== "f-net");

  const after = projectionsOf("2026-10-20", { ...ctx, entries: [...ctx.entries, d] });
  check("fixo: lançado, a conta deixa de sugerir o fixo", after.length === 0, JSON.stringify(after));
  const nextMonth = projectionsOf("2026-11-20", { ...ctx, entries: [d] });
  check("fixo: o mês seguinte continua sugerindo", nextMonth.length === 1, JSON.stringify(nextMonth));

  const undo = undoEntry(null, d);
  check("fixo: o desfazer apaga o lançamento, e a sugestão volta", undo.remove === d.id && projectionsOf("2026-10-20", ctx).length === 1);

  const hashed = newEntry({ title: "", amount: 0, flow: "out", date: TODAY, fixed: "#f-net" }, cfg, ctx, TODAY).doc;
  check("fixo: o id com # do retrato lança o fixo", hashed && hashed.origin && hashed.origin.type === "fixed" && hashed.origin.id === "f-net", JSON.stringify(hashed));
  const said = newEntry({ title: "internet", amount: 13990, flow: "out", category: "Ferramentas", date: TODAY, fixed: "f-net" }, cfg, ctx, TODAY).doc;
  check("fixo: o valor dito troca o do fixo", said && said.amount === 13990 && said.origin.type === "fixed", JSON.stringify(said));
  check("fixo: a categoria dita, se existe, troca a do fixo", said && said.category === "Ferramentas");
  const badCat = newEntry({ title: "", amount: 0, flow: "out", category: "Mercado", date: TODAY, fixed: "f-net" }, cfg, ctx, TODAY).doc;
  check("fixo: categoria que não existe cai na do fixo", badCat && badCat.category === "Recorrente", JSON.stringify(badCat));

  /* fixo já lançado no mês: lançar de novo duplicaria. vale como vazio */
  const launched = { id: "e1", type: "entry", name: "internet", amount: 12000, kind: "out", category: "Recorrente", day: "2026-10-05", paid: true, origin: { type: "fixed", id: "f-net" }, via: "", createdAt: 1, updatedAt: 1 };
  const dup = newEntry({ title: "internet", amount: 12000, flow: "out", date: TODAY, fixed: "f-net" }, cfg, { ...ctx, entries: [launched] }, TODAY).doc;
  check("fixo: já lançado no mês, o fixo é ignorado", dup && dup.origin.type === "chat", JSON.stringify(dup && dup.origin));
  check("fixo: já lançado no mês e sem valor é erro", newEntry({ title: "", amount: 0, flow: "out", date: TODAY, fixed: "f-net" }, cfg, { ...ctx, entries: [launched] }, TODAY).error === "falta o valor");

  /* fixo inativo ou que não existe: vale como vazio */
  const off = { ...ctx, fixed: [{ ...internet, active: false }] };
  check("fixo: fixo inativo é ignorado", newEntry({ title: "x", amount: 500, flow: "out", date: TODAY, fixed: "f-net" }, cfg, off, TODAY).doc.origin.type === "chat");
  check("fixo: id que não existe é ignorado", newEntry({ title: "x", amount: 500, flow: "out", date: TODAY, fixed: "nada" }, cfg, ctx, TODAY).doc.origin.type === "chat");
}

/* ---------- a prévia diz o que o lançamento grava (ticket #35) ----------
   a caixa de proposta mostra `entryLine` debaixo do título e grava `newEntry`.
   os dois achavam o fixo e o previsto de jeitos diferentes: a prévia dizia "falta
   o valor" e o lançamento saía com o valor do fixo (ou o inverso). */
{
  const { brl } = core;
  const internet = { id: "f-net", type: "fixed", name: "internet", amount: 12000, kind: "out", category: "Recorrente", dayOfMonth: 20, active: true };
  const planned = { id: "p1", type: "entry", name: "luz", amount: 20000, kind: "out", category: "", day: "2026-10-12", paid: false, origin: null, via: "", createdAt: 1, updatedAt: 1 };
  const launched = { id: "e1", type: "entry", name: "internet", amount: 12000, kind: "out", category: "Recorrente", day: "2026-10-05", paid: true, origin: { type: "fixed", id: "f-net" }, via: "", createdAt: 1, updatedAt: 1 };
  const ctx = { ...baseCtx, fixed: [internet], entries: [planned] };
  const spec = (extra) => ({ title: "", amount: 0, flow: "out", date: TODAY, ...extra });
  const line = (s, c) => entryLine(s, TODAY, c);
  const doc = (s, c) => newEntry(s, cfg, c, TODAY);

  const bare = line(spec({ fixed: "f-net" }), ctx);
  check("prévia do fixo: sem valor dito, mostra o valor do fixo", bare.startsWith(brl(12000)), bare);
  check("prévia do fixo: a linha completa", bare === brl(12000) + " · Recorrente · saída · pago", bare);

  const hashed = line(spec({ fixed: "#f-net" }), ctx);
  const hashedDoc = doc(spec({ fixed: "#f-net" }), ctx).doc;
  check("prévia do fixo: o id com # mostra o valor do fixo", hashed.startsWith(brl(12000)), hashed);
  check("prévia do fixo: o id com # lança esse valor, com a origem no fixo", hashedDoc && hashedDoc.amount === 12000 && hashedDoc.origin.type === "fixed" && hashedDoc.origin.id === "f-net", JSON.stringify(hashedDoc));

  const done = { ...ctx, entries: [launched] };
  check("prévia do fixo: já lançado no mês e sem valor diz \"falta o valor\"", line(spec({ fixed: "f-net" }), done).startsWith("falta o valor"), line(spec({ fixed: "f-net" }), done));
  check("prévia do fixo: já lançado no mês e sem valor, o lançamento dá o mesmo erro", doc(spec({ fixed: "f-net" }), done).error === "falta o valor");
  check("prévia do fixo: já lançado em outro mês ainda vale", line(spec({ fixed: "f-net", date: "2026-11-20" }), done).startsWith(brl(12000)), line(spec({ fixed: "f-net", date: "2026-11-20" }), done));

  const said = spec({ amount: 13990, fixed: "f-net" });
  check("prévia do fixo: o valor dito vale na linha e no documento", line(said, ctx).startsWith(brl(13990)) && doc(said, ctx).doc.amount === 13990, line(said, ctx));

  const off = { ...ctx, fixed: [{ ...internet, active: false }] };
  check("prévia do fixo: fixo inativo diz \"falta o valor\", como o lançamento", line(spec({ fixed: "f-net" }), off).startsWith("falta o valor") && doc(spec({ fixed: "f-net" }), off).error === "falta o valor");
  check("prévia do fixo: id que não existe diz \"falta o valor\"", line(spec({ fixed: "nada" }), ctx).startsWith("falta o valor"));

  const confirm = line(spec({ confirm: "#p1" }), ctx);
  const confirmDoc = doc(spec({ confirm: "#p1" }), ctx).doc;
  check("prévia do previsto: o id com # acha o previsto e mostra o valor dele", confirm === brl(20000) + " · saída · confirma o previsto de 12/10", confirm);
  check("prévia do previsto: o documento tem o mesmo valor", confirmDoc && confirmDoc.id === "p1" && confirmDoc.amount === 20000, JSON.stringify(confirmDoc));
  const paidCtx = { ...ctx, entries: [{ ...planned, paid: true }] };
  check("prévia do previsto: já pago não é confirmado de novo, nem na linha", !line(spec({ confirm: "p1", amount: 500 }), paidCtx).includes("confirma o previsto"), line(spec({ confirm: "p1", amount: 500 }), paidCtx));

  /* sem o ctx do financeiro a linha não sabe: continua dizendo que confirma um */
  check("prévia sem ctx: confirm continua \"confirma um previsto\"", line(spec({ confirm: "p1" })).includes("confirma um previsto"), line(spec({ confirm: "p1" })));
  check("prévia sem ctx: o fixo não é achado", line(spec({ fixed: "f-net" })).startsWith("falta o valor"), line(spec({ fixed: "f-net" })));

  /* o critério de aceite: para qualquer pedido, o valor da linha é o do documento */
  const specs = [];
  for (const confirm of ["", "p1", "#p1", "nada"]) for (const fixed of ["", "f-net", "#f-net", "nada"])
    for (const amount of [0, 13990, "abc"]) for (const date of [TODAY, "2026-11-20", "lixo"]) specs.push(spec({ confirm, fixed, amount, date }));
  for (const [name, c] of [["fixo livre", ctx], ["fixo já lançado", done], ["fixo inativo", off], ["previsto pago", paidCtx]]) {
    const bad = specs.filter((s) => {
      const first = line(s, c).split(" · ")[0], r = doc(s, c);
      return first !== (r.error ? "falta o valor" : brl(r.doc.amount));
    });
    check("prévia igual ao lançamento: " + name + ", em " + specs.length + " pedidos", bad.length === 0, bad.length + " diferem, ex.: " + JSON.stringify(bad[0]) + " -> " + (bad[0] && line(bad[0], c)));
  }
}

/* ---------- sem valor ---------- */
{
  const r = newEntry({ title: "almoço", amount: 0, flow: "out", date: TODAY }, cfg, baseCtx, TODAY);
  check("sem valor: devolve o erro, sem doc", r.error === "falta o valor" && !r.doc, JSON.stringify(r));
  check("sem valor: texto no lugar do número também", newEntry({ title: "x", amount: "abc", flow: "out", date: TODAY }, cfg, baseCtx, TODAY).error === "falta o valor");
  check("sem valor: NaN também", newEntry({ title: "x", amount: NaN, flow: "out", date: TODAY }, cfg, baseCtx, TODAY).error === "falta o valor");
}

/* ---------- categoria fora da config ---------- */
{
  const d = newEntry({ title: "feira", amount: 8000, flow: "out", category: "Mercado", date: TODAY }, cfg, baseCtx, TODAY).doc;
  check("categoria: a que não está na config fica vazia, sem inventar", d && d.category === "", JSON.stringify(d));
  const own = normalize({ id: "config", type: "config", categories: ["Mercado", "Lazer"] });
  const ok = newEntry({ title: "feira", amount: 8000, flow: "out", category: "Mercado", date: TODAY }, own, baseCtx, TODAY).doc;
  check("categoria: a lista é a da config da pessoa, não a padrão", ok && ok.category === "Mercado");
  const gone = newEntry({ title: "x", amount: 100, flow: "out", category: "Freela", date: TODAY }, own, baseCtx, TODAY).doc;
  check("categoria: a padrão que a pessoa tirou da config não vale", gone && gone.category === "");
  const none = newEntry({ title: "x", amount: 100, flow: "out", date: TODAY }, cfg, baseCtx, TODAY).doc;
  check("categoria: sem categoria fica vazia", none && none.category === "");
}

/* ---------- desfazer ---------- */
{
  const fresh = newEntry({ title: "almoço", amount: 4500, flow: "out", date: TODAY }, cfg, baseCtx, TODAY).doc;
  check("desfazer: lançamento novo, que não existia antes, manda apagar o id", sameJson(undoEntry(null, fresh), { remove: fresh.id }), JSON.stringify(undoEntry(null, fresh)));
  check("desfazer: undefined vale como lançamento novo", undoEntry(undefined, fresh).remove === fresh.id);
  const planned = { id: "p1", type: "entry", name: "luz", amount: 20000, kind: "out", category: "", day: "2026-10-12", paid: false, origin: null, via: "", createdAt: 1, updatedAt: 1 };
  const confirmed = newEntry({ title: "", amount: 0, flow: "out", date: TODAY, confirm: "p1" }, cfg, { ...baseCtx, entries: [planned] }, TODAY).doc;
  const u = undoEntry(planned, confirmed);
  check("desfazer: confirmação devolve o previsto como estava", u.save && u.save.id === "p1" && u.save.paid === false && u.save.amount === 20000 && !("remove" in u), JSON.stringify(u));
}

/* ---------- a proposta da conversa vira lançamento ---------- */
{
  check("proposta: finance-entry grava na coleção finance", ACTION_COLLECTIONS["finance-entry"] === "finance");

  const store = core.collection("finance", { normalize });
  const payload = { name: "almoço", amount: 9900, kind: "out", day: core.today(), category: "Lazer", paid: true, confirm: "", fixed: "" };
  const v = { name: "almoço", amount: 4500, kind: "out", day: core.today(), category: "Lazer", paid: true };
  const r = buildDoc("finance-entry", payload, v, store, { chat: "conv-3" });
  const d = r.doc;
  check("buildDoc: devolve doc, não erro", !!d && !r.error, JSON.stringify(r));
  check("buildDoc: o valor é o da caixa, não o da proposta", d && d.amount === 4500, JSON.stringify(d));
  check("buildDoc: é um lançamento do chat, ligado à conversa", d && d.type === "entry" && d.via === "chat" && d.origin.type === "chat" && d.origin.id === "conv-3", JSON.stringify(d));
  check("buildDoc: leva nome, tipo, categoria e dia da caixa", d && d.name === "almoço" && d.kind === "out" && d.category === "Lazer" && d.day === core.today());
  check("buildDoc: hoje é pago", d && d.paid === true);

  const edited = buildDoc("finance-entry", payload, { ...v, name: "almoço com a Ana", kind: "in", category: "Mercado" }, store, {}).doc;
  check("buildDoc: o que a pessoa editou na caixa vale", edited && edited.name === "almoço com a Ana" && edited.kind === "in", JSON.stringify(edited));
  check("buildDoc: categoria que não existe na config fica vazia", edited && edited.category === "");

  const future = buildDoc("finance-entry", payload, { ...v, day: core.addDays(core.today(), 5), paid: true }, store, {}).doc;
  check("buildDoc: dia futuro fica previsto, mesmo com o 'já aconteceu' marcado", future && future.paid === false, JSON.stringify(future));

  const zero = buildDoc("finance-entry", { ...payload, amount: 9900 }, { ...v, amount: 0 }, store, {});
  check("buildDoc: a caixa sem valor é erro, mesmo que a proposta tivesse", zero.error === "falta o valor" && !zero.doc, JSON.stringify(zero));

  /* a proposta que confirma um previsto: a caixa traz o valor, o id vem do payload */
  store.save({ id: "p-aluguel", type: "entry", name: "aluguel", amount: 150000, kind: "out", category: "Básicas/PF", day: "2026-10-15", paid: false, origin: null });
  const conf = buildDoc("finance-entry", { ...payload, confirm: "p-aluguel" }, { ...v, name: "", amount: 148000 }, store, {}).doc;
  check("buildDoc: com confirm, devolve o previsto existente, pago", conf && conf.id === "p-aluguel" && conf.paid === true && conf.day === "2026-10-15", JSON.stringify(conf));
  check("buildDoc: com confirm, o valor é o da caixa", conf && conf.amount === 148000);
  const before = store.get("p-aluguel");
  check("buildDoc: não grava nada sozinho (quem grava é a caixa)", before && before.paid === false && before.amount === 150000, JSON.stringify(before));
  check("buildDoc: o desfazer volta o previsto", undoEntry(before, conf).save.paid === false);

  /* a caixa do fixo sem valor: o que a prévia diz é o que o lançar grava, também com "#" */
  store.save({ id: "f-net", type: "fixed", name: "internet", amount: 12000, kind: "out", category: "Recorrente", dayOfMonth: 20, active: true });
  const ctxNow = contextOf(store);
  const fixedPayload = { name: "internet", amount: 0, kind: "out", day: core.today(), category: "", paid: true, confirm: "", fixed: "#f-net" };
  const fixedBox = { name: "internet", amount: 0, kind: "out", day: core.today(), category: "", paid: true };
  const shown = previewOf("finance-entry", fixedPayload, ctxNow);
  const launched = buildDoc("finance-entry", fixedPayload, fixedBox, store, {}).doc;
  check("caixa do fixo: a prévia mostra o valor do fixo", shown.startsWith(core.brl(12000)), shown);
  check("caixa do fixo: lançar grava o mesmo valor, com a origem no fixo", launched && launched.amount === 12000 && launched.origin.type === "fixed" && launched.origin.id === "f-net", JSON.stringify(launched));
  store.save(launched);
  check("caixa do fixo: depois de lançado, uma segunda proposta sem valor diz \"falta o valor\" nos dois lados", previewOf("finance-entry", fixedPayload, contextOf(store)).startsWith("falta o valor") && buildDoc("finance-entry", fixedPayload, fixedBox, store, {}).error === "falta o valor");
  check("caixa do fixo: a linha da pílula, feita com o contexto de antes de gravar, mostra o valor lançado", previewOf("finance-entry", { ...fixedPayload, ...fixedBox }, ctxNow).startsWith(core.brl(12000)));
}

/* ---------- a pílula confirmada ---------- */
{
  const proposal = { actionType: "finance-entry", title: "gasto de R$ 45,00", note: "", payload: { name: "almoço", amount: 4500 } };
  const list = [{ from: "me", text: "gastei 45 no almoço" }, { from: "merlin", proposal }, { from: "merlin", text: "ok" }];

  const marked = markProposal(list, 1, "R$ 45,00 · Lazer · saída · pago");
  check("pílula: a proposta marcada guarda a linha", marked[1].proposal.done && marked[1].proposal.done.line === "R$ 45,00 · Lazer · saída · pago", JSON.stringify(marked[1]));
  check("pílula: a lista original não muda", !list[1].proposal.done, JSON.stringify(list[1]));
  check("pílula: as outras mensagens ficam como estavam", marked[0].text === "gastei 45 no almoço" && marked[2].text === "ok" && marked.length === 3);
  check("pílula: o resto da proposta fica intacto", marked[1].proposal.actionType === "finance-entry" && marked[1].proposal.payload.amount === 4500);
  check("pílula: linha null desmarca (o desfazer do aviso)", markProposal(marked, 1, null)[1].proposal.done === null);
  check("pílula: linha vazia desmarca", markProposal(marked, 1, "")[1].proposal.done === null);
  check("pílula: mensagem sem proposta não ganha marca", !("proposal" in markProposal(list, 0, "x")[0]) && markProposal(list, 0, "x")[0].text === "gastei 45 no almoço");
  check("pílula: índice fora da lista não quebra", markProposal(list, 9, "x").length === 3);

  /* depois de recarregar a conversa: o que o normalizeChat devolve */
  const reloaded = normalizeChat({ id: "c1", messages: marked });
  check("pílula: a marca sobrevive ao normalizeChat", reloaded.messages[1].proposal && reloaded.messages[1].proposal.done && reloaded.messages[1].proposal.done.line === "R$ 45,00 · Lazer · saída · pago", JSON.stringify(reloaded.messages[1]));
  check("pílula: a proposta de lançamento sobrevive ao normalizeChat", reloaded.messages[1].proposal.actionType === "finance-entry");
  const plain = normalizeChat({ id: "c1", messages: list });
  check("pílula: proposta não confirmada continua sem marca", !plain.messages[1].proposal.done);
  const junk = normalizeChat({ id: "c1", messages: [{ from: "merlin", proposal: { ...proposal, done: "sim" } }] });
  check("pílula: marca fora do formato é descartada", !junk.messages[0].proposal.done, JSON.stringify(junk.messages[0]));
}

/* ---------- isolamento: um lançamento por vez, sem tocar no contexto ---------- */
{
  const ctx = { ...baseCtx, entries: [], fixed: [] };
  const frozen = JSON.stringify(ctx);
  newEntry({ title: "x", amount: 100, flow: "out", date: TODAY }, cfg, ctx, TODAY);
  check("newEntry é pura: o contexto fica como estava", JSON.stringify(ctx) === frozen);
  check("contextOf expõe o que o newEntry lê", ["entries", "fixed", "cards", "startBalance"].every((k) => k in contextOf(core.collection("finance", { normalize }))));
}

/* =====================================================================
   o dinheiro no retrato (ticket #11): financeToday, moneyLines, e as contas
   que saíram de finance.jsx para o finance-data.js sem mudar o que a tela mostra.

   o que o Merlin lê aqui responde "quanto gastei no mercado?", "o que vence
   essa semana?" e "posso assumir 3 mil por mês?". errar é número errado
   dito com segurança: um previsto que entra no saldo de hoje, uma sugestão
   que conta duas vezes, um valor cortado no meio ("R$ 1.2").
   ===================================================================== */
const FD = await import("./finance-data.js");
const { financeToday, moneyLines, buildMonth, spentByCategory, pendingBefore, suggestionsBetween, configOf } = FD;
const { brl } = core;

/* um bloco que explode não pode apagar os outros: vira uma falha com o motivo */
const section = (name, fn) => {
  try { fn(); } catch (e) { failures.push(name + " -> exceção: " + (e && e.message)); }
};

const ent = (id, day, name, kind, amount, paid, extra) =>
  ({ id, type: "entry", day, name, kind, amount, paid, category: "", origin: null, via: "", createdAt: 1, updatedAt: 1, ...extra });
const mk = (o) => ({ entries: [], fixed: [], cards: [], debts: [], invests: [], startBalance: { day: "2026-10-01", amount: 0 }, ...o });
const cfgOf = (o) => normalize({ id: "config", type: "config", ...o });
const ids = (list) => list.map((x) => x.id);
const lineStarting = (lines, prefix) => lines.find((l) => l.startsWith(prefix));
const signed = (list) => list.reduce((s, e) => s + (e.kind === "in" ? e.amount : -e.amount), 0);
/* "a; b; e mais 3" -> { items: ["a", "b"], more: 3 } */
const parseLine = (line, prefix) => {
  const parts = line.slice(prefix.length).split("; ");
  const m = /^e mais (\d+)$/.exec(parts[parts.length - 1]);
  return { items: m ? parts.slice(0, -1) : parts, more: m ? +m[1] : 0 };
};
const D3 = "2026-10-20", D7 = "2026-10-24", D8 = "2026-10-25", D10 = "2026-10-27";

/* ---------- "quanto gastei no mercado este mês?" ---------- */
section("mercado", () => {
  const ctx = mk({ entries: [
    ent("m1", "2026-10-02", "mercado", "out", 10000, true, { category: "Básicas/PF" }),
    ent("m2", "2026-10-09", "mercado", "out", 25000, true, { category: "Básicas/PF" }),
    ent("m3", "2026-10-15", "mercado", "out", 8000, true, { category: "Básicas/PF" }),
    ent("m-velho", "2026-09-20", "mercado", "out", 9000, true, { category: "Básicas/PF" }),
    ent("m-previsto", "2026-10-28", "mercado", "out", 7000, false),
    ent("m-entrada", "2026-10-12", "mercado", "in", 5000, true),
    ent("far", "2026-10-10", "farmácia", "out", 5000, true)
  ] });
  const f = financeToday(ctx, cfgOf({}), TODAY);
  check("mercado: as três saídas viram uma só, de 430", f.top[0] && f.top[0].name === "mercado" && f.top[0].amount === 43000 && f.top[0].count === 3, JSON.stringify(f.top));
  check("mercado: a segunda maior é a farmácia", f.top[1] && f.top[1].name === "farmácia" && f.top[1].amount === 5000 && f.top[1].count === 1, JSON.stringify(f.top));
  check("mercado: só as saídas pagas do mês entram (nem mês passado, nem previsto, nem entrada)", f.top.length === 2, JSON.stringify(f.top));
  const l = lineStarting(moneyLines(f, 900), "maiores saídas: ");
  check("mercado: o texto diz 'mercado · R$ 430,00 (3×)'", !!l && l.includes("mercado · " + brl(43000) + " (3×)"), String(l));
  check("mercado: o do mês passado e o previsto não somam no texto", !!l && !l.includes(brl(52000)) && !l.includes(brl(50000)), String(l));
  check("mercado: uma vez só não leva '(1×)'", !!l && l.includes("farmácia · " + brl(5000)) && !l.includes("(1×)"), String(l));
});

section("maiores saídas: agrupar e limitar", () => {
  const same = mk({ entries: [
    ent("a", "2026-10-02", "Mercado", "out", 1000, true),
    ent("b", "2026-10-03", " mercado ", "out", 2000, true),
    ent("c", "2026-10-04", "MERCADO", "out", 3000, true)
  ] });
  const g = financeToday(same, cfgOf({}), TODAY).top;
  check("top: maiúscula e espaço nas pontas não separam o grupo", g.length === 1 && g[0].amount === 6000 && g[0].count === 3 && g[0].name.trim().toLowerCase() === "mercado", JSON.stringify(g));

  const many = mk({ entries: Array.from({ length: 10 }, (_, i) => ent("t" + i, "2026-10-05", "gasto " + i, "out", 1000 * (i + 1), true)) });
  const t = financeToday(many, cfgOf({}), TODAY).top;
  check("top: no máximo 8", t.length === 8, String(t.length));
  check("top: da maior para a menor", t.every((x, i) => i === 0 || t[i - 1].amount >= x.amount) && t[0].amount === 10000, JSON.stringify(t.map((x) => x.amount)));
  check("top: os dois menores ficam de fora", !t.some((x) => x.amount === 1000 || x.amount === 2000), JSON.stringify(t.map((x) => x.amount)));
  const none = financeToday(mk({ entries: [ent("p", "2026-10-20", "x", "out", 100, false)] }), cfgOf({}), TODAY);
  check("top: sem saída paga, a lista é vazia", none.top.length === 0);
  check("top: sem saída paga, o texto não tem a linha", !lineStarting(moneyLines(none, 900), "maiores saídas: "));
});

/* ---------- gasto por categoria e a meta ---------- */
section("categoria: 1.200 contra a meta de 1.000", () => {
  const ctx = mk({ entries: [
    ent("g1", "2026-10-05", "mercado", "out", 80000, true, { category: "Básicas/PF" }),
    ent("g2", "2026-10-25", "reforma", "out", 40000, false, { category: "Básicas/PF" }),
    ent("g3", "2026-10-06", "projeto", "in", 10000, true, { category: "Freela" }),
    ent("g4", "2026-10-07", "bala", "out", 3000, true),
    ent("g5", "2026-09-30", "mês passado", "out", 9999, true, { category: "Lazer" })
  ], fixed: [{ id: "f-l", type: "fixed", name: "revista", amount: 5000, kind: "out", category: "Lazer", dayOfMonth: 28, active: true }] });
  const days = buildMonth("2026-10", ctx, null, TODAY).filter((d) => !d.before);
  const moved = spentByCategory(days);
  const b = moved["Básicas/PF"] || {};
  check("categoria: outAll é 120000 e outReal é 80000", b.outAll === 120000 && b.outReal === 80000 && b.in === 0, JSON.stringify(b));
  check("categoria: a entrada soma em `in`, não em saída", moved["Freela"] && moved["Freela"].in === 10000 && moved["Freela"].outAll === 0, JSON.stringify(moved["Freela"]));
  check("categoria: sem categoria vai para 'sem categoria'", moved["sem categoria"] && moved["sem categoria"].outAll === 3000 && moved["sem categoria"].outReal === 3000, JSON.stringify(moved["sem categoria"]));
  check("categoria: sugestão de fixo não entra na conta", !moved["Lazer"], JSON.stringify(moved["Lazer"]));
  check("categoria: sem dias, nada", JSON.stringify(spentByCategory([])) === "{}");

  const cfg = cfgOf({ budgets: { "Básicas/PF": 100000, Lazer: 100000 } });
  const f = financeToday(ctx, cfg, TODAY);
  const c = f.categories.find((x) => x.name === "Básicas/PF");
  check("categoria: o financeToday traz gasto, pago, meta e passou", c && c.outAll === 120000 && c.outReal === 80000 && c.goal === 100000 && c.over === true && c.in === 0, JSON.stringify(c));
  const lines = moneyLines(f, 900);
  const cat = lineStarting(lines, "categorias: ");
  const expected = "Básicas/PF " + brl(120000) + " (" + brl(80000) + " pago) de " + brl(100000) + ", passou da meta";
  check("categoria: a seção diz 'passou da meta' com o pago entre parênteses", !!cat && cat.includes(expected), String(cat));
  const lazer = f.categories.find((x) => x.name === "Lazer");
  check("categoria: dentro da meta, over é falso", lazer && lazer.over === false && lazer.goal === 100000, JSON.stringify(lazer));
  check("categoria: dentro da meta, o texto não diz 'passou' nem 'pago'", !!cat && !cat.split("; ").some((i) => i.startsWith("Lazer") && /passou|pago/.test(i)), String(cat));
  check("categoria: o mês passado não conta no Lazer", lazer && lazer.outAll === 0, JSON.stringify(lazer));
  check("categoria: 'sem categoria' não é uma categoria da lista", !f.categories.some((x) => x.name === "sem categoria"));
});

section("categoria: meta, ordem, órfã e borda", () => {
  const ctx = mk({ entries: [
    ent("o1", "2026-10-05", "a", "out", 120000, true, { category: "Básicas/PF" }),
    ent("o2", "2026-10-05", "b", "out", 5000, true, { category: "Lazer" }),
    ent("o3", "2026-10-05", "c", "out", 90000, true, { category: "Recorrente" }),
    ent("o4", "2026-10-05", "d", "out", 20000, true, { category: "Pets" }),
    ent("o5", "2026-10-05", "e", "out", 70000, true, { category: "Ferramentas" })
  ] });
  const cfg = cfgOf({ budgets: { "Básicas/PF": 100000, Lazer: 100000, Ferramentas: 70000 } });
  const f = financeToday(ctx, cfg, TODAY);
  const names = f.categories.map((x) => x.name);
  const at = (n) => names.indexOf(n);
  check("ordem: com meta primeiro, a mais apertada no topo", at("Básicas/PF") === 0 && at("Ferramentas") === 1 && at("Lazer") === 2, JSON.stringify(names));
  check("ordem: sem meta, a que mais gastou primeiro", at("Recorrente") === 3 && at("Pets") === 4, JSON.stringify(names));
  check("ordem: a órfã (fora da config) com movimento aparece", at("Pets") >= 0 && !cfg.categories.includes("Pets"));
  const ferr = f.categories[at("Ferramentas")];
  check("borda: gastar exatamente a meta não passa dela", ferr.outAll === 70000 && ferr.goal === 70000 && ferr.over === false, JSON.stringify(ferr));
  const cat = lineStarting(moneyLines(f, 1200), "categorias: ");
  const items = cat.slice("categorias: ".length).split("; ");
  check("texto: sem meta e com saída é 'nome R$ x'", items.includes("Recorrente " + brl(90000)) && items.includes("Pets " + brl(20000)), JSON.stringify(items));
  check("texto: com meta e tudo pago, sem '(… pago)'", items.includes("Lazer " + brl(5000) + " de " + brl(100000)), JSON.stringify(items));
  check("texto: sem nada, só o nome", items.includes("Outros"), JSON.stringify(items));
  check("texto: no limite da meta, sem 'passou'", items.includes("Ferramentas " + brl(70000) + " de " + brl(70000)), JSON.stringify(items));
  check("texto: a ordem do texto é a da lista", items.findIndex((i) => i.startsWith("Básicas/PF")) === 0 && items.findIndex((i) => i.startsWith("Ferramentas")) === 1, JSON.stringify(items));
});

/* ---------- saldo hoje e previsto do fim do mês ---------- */
section("saldo e previsto", () => {
  const ctx = mk({ startBalance: { day: "2026-10-01", amount: 100000 }, entries: [
    ent("s1", "2026-10-05", "freela", "in", 50000, true),
    ent("s2", "2026-10-25", "dentista", "out", 30000, false)
  ] });
  const f = financeToday(ctx, cfgOf({}), TODAY);
  check("saldo: hoje é R$ 1.500,00", f.real === 150000, String(f.real));
  check("saldo: o previsto do fim do mês é R$ 1.200,00", f.monthEnd === 120000, String(f.monthEnd));
  check("saldo: a primeira linha diz os dois e o menor adiante", moneyLines(f, 900)[0] === "saldo hoje " + brl(150000, true) + " · fim do mês ≈ " + brl(120000, true) + " · menor ≈ " + brl(120000, true) + " em 25/10", moneyLines(f, 900)[0]);
  check("saldo: o menor saldo adiante é o do dia 25", f.low && f.low.day === "2026-10-25" && f.low.balance === 120000, JSON.stringify(f.low));

  /* sugestão de fixo: soma no previsto de hoje em diante, nunca no real */
  const withFixed = { ...ctx, fixed: [{ id: "f-a", type: "fixed", name: "aluguel", amount: 200000, kind: "out", category: "Básicas/PF", dayOfMonth: 20, active: true }] };
  const g = financeToday(withFixed, cfgOf({}), TODAY);
  check("saldo: a sugestão de fixo não mexe no saldo real", g.real === 150000, String(g.real));
  check("saldo: a sugestão de fixo entra no previsto do mês", g.monthEnd === 120000 - 200000, String(g.monthEnd));
  const launched = { ...withFixed, entries: [...ctx.entries, ent("s3", "2026-10-20", "aluguel", "out", 200000, false, { origin: { type: "fixed", id: "f-a" } })] };
  check("saldo: o fixo já lançado não conta duas vezes", financeToday(launched, cfgOf({}), TODAY).monthEnd === g.monthEnd, String(financeToday(launched, cfgOf({}), TODAY).monthEnd));
  const past = { ...ctx, fixed: [{ id: "f-s", type: "fixed", name: "salário", amount: 500000, kind: "in", category: "", dayOfMonth: 5, active: true }] };
  check("saldo: sugestão de dia que já passou não entra", financeToday(past, cfgOf({}), TODAY).monthEnd === 120000, String(financeToday(past, cfgOf({}), TODAY).monthEnd));
  const off = { ...withFixed, fixed: [{ ...withFixed.fixed[0], active: false }] };
  check("saldo: fixo inativo não entra", financeToday(off, cfgOf({}), TODAY).monthEnd === 120000);

  const frozen = JSON.stringify(withFixed);
  financeToday(withFixed, cfgOf({}), TODAY);
  check("financeToday é pura: o contexto fica como estava", JSON.stringify(withFixed) === frozen);
});

/* ---------- o menor saldo à frente ---------- */
section("menor saldo", () => {
  const ctx = mk({ startBalance: { day: "2026-10-01", amount: 100000 }, entries: [
    ent("l1", "2026-10-20", "reforma", "out", 200000, false),
    ent("l2", "2026-10-28", "cliente", "in", 300000, false)
  ] });
  const f = financeToday(ctx, cfgOf({}), TODAY);
  check("menor: é negativo, no dia 20", f.low && f.low.day === "2026-10-20" && f.low.balance === -100000, JSON.stringify(f.low));
  check("menor: o fim do mês fecha no azul (o menor não é o fim)", f.monthEnd === 200000, String(f.monthEnd));
  const l0 = moneyLines(f, 900)[0];
  check("menor: o texto diz o valor negativo e o dia", l0.includes(" · menor ≈ " + brl(-100000, true) + " em 20/10") && l0.includes("−"), l0);

  const rising = mk({ startBalance: { day: "2026-10-01", amount: 100000 }, entries: [ent("r1", D3, "cliente", "in", 50000, false)] });
  const r = financeToday(rising, cfgOf({}), TODAY);
  check("menor: se só sobe, o menor é hoje", r.low && r.low.day === TODAY && r.low.balance === 100000, JSON.stringify(r.low));

  const dipped = mk({ startBalance: { day: "2026-10-01", amount: 100000 }, entries: [
    ent("d1", "2026-10-10", "gasto", "out", 150000, true),
    ent("d2", "2026-10-12", "cliente", "in", 200000, true)
  ] });
  const d = financeToday(dipped, cfgOf({}), TODAY);
  check("menor: só olha de hoje em diante (o fundo do dia 10 já passou)", d.low && d.low.day >= TODAY && d.low.balance === 150000, JSON.stringify(d.low));

  const late = mk({ startBalance: { day: "2026-11-01", amount: 100000 } });
  const n = financeToday(late, cfgOf({}), TODAY);
  check("menor: mês inteiro antes do saldo inicial não tem menor", n.low === null, JSON.stringify(n.low));
  check("menor: sem menor, a primeira linha não o menciona", !moneyLines(n, 900)[0].includes("menor"), moneyLines(n, 900)[0]);
});

/* ---------- o que vence em 7 dias, e o resto do mês ---------- */
section("vence em 7 dias", () => {
  const ctx = mk({ entries: [
    ent("v3", D3, "dentista", "out", 30000, false),
    ent("v7", D7, "boleto no limite", "out", 4000, false),
    ent("v8", D8, "oito dias", "out", 5000, false),
    ent("v10", D10, "viagem", "out", 60000, false),
    ent("v31", "2026-10-31", "fim do mês", "out", 7000, false),
    ent("vnov", "2026-11-05", "mês que vem", "out", 8000, false),
    ent("vhoje", TODAY, "hoje aberto", "out", 1000, false),
    ent("vpago", D3, "já pago", "out", 2000, true),
    ent("vin", "2026-10-21", "cliente", "in", 100000, false)
  ] });
  const f = financeToday(ctx, cfgOf({}), TODAY);
  check("7 dias: entram hoje, +3 e +7 (e a entrada), por dia", JSON.stringify(ids(f.soon)) === JSON.stringify(["vhoje", "v3", "vin", "v7"]), JSON.stringify(ids(f.soon)));
  check("7 dias: o de 10 dias e o de 8 dias não entram", !ids(f.soon).includes("v10") && !ids(f.soon).includes("v8"));
  check("7 dias: pago não entra", !ids(f.soon).includes("vpago"));
  check("mês: o resto do mês é o depois de +7, por dia", JSON.stringify(ids(f.later)) === JSON.stringify(["v8", "v10", "v31"]), JSON.stringify(ids(f.later)));
  check("mês: o do mês que vem não entra no resto do mês", !ids(f.later).includes("vnov") && !ids(f.soon).includes("vnov"));
  check("7 dias: o de hoje ainda aberto não é 'a confirmar'", !ids(f.pending).includes("vhoje"), JSON.stringify(ids(f.pending)));

  const lines = moneyLines(f, 1200);
  const soon = lineStarting(lines, "vence em 7 dias: ");
  check("7 dias: o item é 'DD/MM nome valor #id'", !!soon && soon.includes("20/10 dentista " + brl(30000) + " #v3"), String(soon));
  check("7 dias: entrada leva '+' antes do valor", !!soon && soon.includes("21/10 cliente +" + brl(100000) + " #vin"), String(soon));
  check("7 dias: o de daqui a 10 dias fica fora da linha", !!soon && !soon.includes("viagem"), String(soon));
  const later = lineStarting(lines, "previsto no mês: ");
  check("mês: a linha 'previsto no mês' traz o de 27/10", !!later && later.includes("27/10 viagem " + brl(60000) + " #v10") && !later.includes("dentista"), String(later));
});

section("vence em 7 dias: cruza o mês", () => {
  const T = "2026-10-28";
  const ctx = mk({ entries: [ent("x1", "2026-11-02", "luz", "out", 25000, false), ent("x2", "2026-11-20", "longe", "out", 1000, false)] });
  const f = financeToday(ctx, cfgOf({}), T);
  check("cruzar o mês: 02/11 está a 5 dias de 28/10 e entra", JSON.stringify(ids(f.soon)) === JSON.stringify(["x1"]), JSON.stringify(ids(f.soon)));
  check("cruzar o mês: o resto do mês de outubro fica vazio", f.later.length === 0, JSON.stringify(ids(f.later)));
  check("cruzar o mês: o texto traz '02/11 luz'", (lineStarting(moneyLines(f, 900), "vence em 7 dias: ") || "").includes("02/11 luz " + brl(25000) + " #x1"));
  const bare = moneyLines(financeToday(mk({}), cfgOf({}), TODAY), 900);
  check("sem previstos, as linhas 'vence' e 'previsto' somem", !lineStarting(bare, "vence em 7 dias: ") && !lineStarting(bare, "previsto no mês: "), JSON.stringify(bare));
});

/* ---------- a confirmar ---------- */
section("a confirmar", () => {
  const ctx = mk({ startBalance: { day: "2026-09-01", amount: 100000 }, entries: [
    ent("c3", "2026-10-14", "aluguel", "out", 150000, false),
    ent("c10", "2026-10-10", "luz", "out", 20000, false),
    ent("cold", "2026-09-28", "antigo", "in", 9000, false),
    ent("cpago", "2026-10-15", "pago", "out", 700, true),
    ent("choje", TODAY, "hoje", "out", 800, false),
    ent("cfut", D3, "futuro", "out", 900, false)
  ], fixed: [{ id: "f-x", type: "fixed", name: "internet", amount: 12000, kind: "out", category: "", dayOfMonth: 12, active: true }] });
  const f = financeToday(ctx, cfgOf({}), TODAY);
  check("confirmar: o previsto de 3 dias atrás está em 'a confirmar'", ids(f.pending).includes("c3"), JSON.stringify(ids(f.pending)));
  check("confirmar: do mais antigo ao mais novo, mesmo de outro mês", JSON.stringify(ids(f.pending)) === JSON.stringify(["cold", "c10", "c3"]), JSON.stringify(ids(f.pending)));
  check("confirmar: pago, de hoje e do futuro ficam de fora; a sugestão de fixo também", f.pending.length === 3);
  check("confirmar: o previsto não pago não está no saldo real", f.real === 100000 - 700, String(f.real));
  check("confirmar: o previsto não pago entra no previsto do mês", f.monthEnd === 100000 + signed(ctx.entries), String(f.monthEnd));
  const l = lineStarting(moneyLines(f, 1200), "a confirmar: ");
  const expected = "a confirmar: 14/10 aluguel " + brl(150000) + " #c3; 10/10 luz " + brl(20000) + " #c10; 28/09 antigo +" + brl(9000) + " #cold";
  check("confirmar: no texto, os mais recentes primeiro, entrada com '+'", l === expected, String(l));
  check("confirmar: sem nenhum, a linha some", !lineStarting(moneyLines(financeToday(mk({}), cfgOf({}), TODAY), 900), "a confirmar: "));
});

/* ---------- os fixos ---------- */
section("fixos do mês", () => {
  const T = "2026-11-15";
  const ctx = mk({ startBalance: { day: "2026-11-01", amount: 0 }, entries: [
    ent("fe", "2026-11-05", "salário", "in", 500000, true, { origin: { type: "fixed", id: "f-sal" } })
  ], fixed: [
    { id: "f-anual", type: "fixed", name: "plano anual", amount: 5000, kind: "out", category: "Ferramentas", dayOfMonth: 31, active: true },
    { id: "f-alug", type: "fixed", name: "aluguel", amount: 200000, kind: "out", category: "Básicas/PF", dayOfMonth: 10, active: true },
    { id: "f-sal", type: "fixed", name: "salário", amount: 500000, kind: "in", category: "Freela", dayOfMonth: 5, active: true },
    { id: "f-velho", type: "fixed", name: "revista", amount: 9900, kind: "out", category: "Lazer", dayOfMonth: 15, active: false }
  ] });
  const f = financeToday(ctx, cfgOf({}), T);
  check("fixos: só os ativos, por dia", JSON.stringify(ids(f.fixed)) === JSON.stringify(["f-sal", "f-alug", "f-anual"]), JSON.stringify(ids(f.fixed)));
  check("fixos: o dia 31 em mês de 30 cai no dia 30", f.fixed[2] && f.fixed[2].day === "2026-11-30", JSON.stringify(f.fixed[2]));
  check("fixos: traz nome, valor, tipo, categoria e o dia efetivo", f.fixed[1] && f.fixed[1].name === "aluguel" && f.fixed[1].amount === 200000 && f.fixed[1].kind === "out" && f.fixed[1].category === "Básicas/PF" && f.fixed[1].day === "2026-11-10", JSON.stringify(f.fixed[1]));
  check("fixos: 'entered' é verdadeiro só para o já lançado no mês", f.fixed.length === 3 && f.fixed[0].entered === true && f.fixed[1].entered === false && f.fixed[2].entered === false, JSON.stringify(f.fixed.map((x) => x.entered)));
  const l = lineStarting(moneyLines(f, 900), "fixos: ");
  const items = (l || "").slice("fixos: ".length).split("; ");
  check("fixos: o ainda não lançado leva o id", items.includes("aluguel " + brl(200000) + " dia 10 #f-alug"), JSON.stringify(items));
  check("fixos: o dia 31 aparece no dia efetivo, com o id", items.includes("plano anual " + brl(5000) + " dia 30 #f-anual"), JSON.stringify(items));
  check("fixos: o já lançado diz 'lançado', sem id, e a entrada leva '+'", items.some((i) => /^salário \+/.test(i) && i.includes(brl(500000)) && / dia 0?5 lançado$/.test(i) && !i.includes("#")), JSON.stringify(items));
  check("fixos: o inativo não entra", !(l || "").includes("revista"));
  check("fixos: sem fixos, a linha some", !lineStarting(moneyLines(financeToday(mk({}), cfgOf({}), TODAY), 900), "fixos: "));
});

/* ---------- vazio ---------- */
section("vazio", () => {
  const nothing = mk({ startBalance: null });
  const f = financeToday(nothing, cfgOf({}), TODAY);
  check("vazio: sem nada, empty é verdadeiro e o texto é uma linha", f.empty === true && JSON.stringify(moneyLines(f, 900)) === JSON.stringify(["sem financeiro ainda"]), JSON.stringify(moneyLines(f, 900)));
  const onlyDebts = mk({ startBalance: null, debts: [{ id: "d", type: "debt", name: "empréstimo", creditor: "Pedro", total: 100000, paid: 0, installment: 10000, dayOfMonth: 5 }], invests: [{ id: "i", type: "invest", name: "CDB", category: "renda fixa", contributed: 100, current: 100, order: 0 }] });
  check("vazio: só dívida e investimento é vazio", financeToday(onlyDebts, cfgOf({}), TODAY).empty === true);
  check("vazio: só o saldo inicial não é vazio", financeToday(mk({}), cfgOf({}), TODAY).empty === false);
  check("vazio: só um fixo não é vazio", financeToday(mk({ startBalance: null, fixed: [{ id: "f", type: "fixed", name: "x", amount: 100, kind: "out", category: "", dayOfMonth: 3, active: true }] }), cfgOf({}), TODAY).empty === false);
  check("vazio: só um lançamento não é vazio", financeToday(mk({ startBalance: null, entries: [ent("e", "2026-10-02", "x", "out", 100, true)] }), cfgOf({}), TODAY).empty === false);
});

/* ---------- o texto: ordem, um grupo por linha, o orçamento ---------- */
const BIG = () => {
  const entries = [];
  for (let i = 0; i < 12; i++) entries.push(ent("pa" + i, "2026-10-" + String(1 + i).padStart(2, "0"), "pendente número " + i, "out", 10000 + i, false));
  for (let i = 0; i < 6; i++) entries.push(ent("so" + i, "2026-10-" + String(18 + i).padStart(2, "0"), "vencendo " + i, "out", 5000 + i, false));
  for (let i = 0; i < 4; i++) entries.push(ent("la" + i, "2026-10-" + String(26 + i).padStart(2, "0"), "mais para o fim " + i, "out", 7000 + i, false));
  for (let i = 0; i < 10; i++) entries.push(ent("pg" + i, "2026-10-" + String(2 + i).padStart(2, "0"), "gasto pago " + i, "out", 3000 + i * 100, true, { category: i % 2 ? "Lazer" : "Básicas/PF" }));
  const fixed = Array.from({ length: 30 }, (_, i) => ({ id: "fx" + String(i).padStart(2, "0"), type: "fixed", name: "conta fixa comprida número " + String(i).padStart(2, "0"), amount: 123456 + i, kind: i % 5 === 0 ? "in" : "out", category: "Recorrente", dayOfMonth: 1 + (i % 28), active: true }));
  return mk({ startBalance: { day: "2026-09-01", amount: 500000 }, entries, fixed });
};
section("moneyLines: a estrutura", () => {
  const f = financeToday(BIG(), cfgOf({ budgets: { "Básicas/PF": 10000 } }), TODAY);
  const lines = moneyLines(f, 4000);
  check("texto: a primeira linha é a do saldo", lines[0].startsWith("saldo hoje " + brl(f.real, true) + " · fim do mês ≈ " + brl(f.monthEnd, true)), lines[0]);
  const prefixes = ["a confirmar: ", "vence em 7 dias: ", "previsto no mês: ", "categorias: ", "maiores saídas: ", "fixos: "];
  const found = prefixes.map((p) => lines.findIndex((l) => l.startsWith(p)));
  check("texto: cada grupo numa linha, na ordem do contrato", found.every((i) => i > 0) && found.every((v, i) => i === 0 || v > found[i - 1]), JSON.stringify(found));
  check("texto: nenhuma linha extra, nenhum grupo repetido", lines.length === 1 + prefixes.length, String(lines.length));
  check("texto: sem quebra de linha dentro de um item", lines.every((l) => !l.includes("\n")));
});
section("moneyLines: o orçamento e o corte por item inteiro", () => {
  const f = financeToday(BIG(), cfgOf({ budgets: { "Básicas/PF": 10000 } }), TODAY);
  for (const budget of [400, 600, 900, 1200]) {
    const lines = moneyLines(f, budget);
    check("corte: com orçamento " + budget + " o texto cabe", lines.join("\n").length <= budget, String(lines.join("\n").length));
    check("corte: com orçamento " + budget + " a primeira linha continua inteira", lines[0].startsWith("saldo hoje ") && lines[0].includes("fim do mês ≈ " + brl(f.monthEnd, true)), lines[0]);
  }
  const lines = moneyLines(f, 900);
  const fx = lineStarting(lines, "fixos: ");
  check("corte: com 30 fixos e 900, a linha dos fixos termina em 'e mais N'", !!fx && /(; |: )e mais \d+$/.test(fx), String(fx));
  if (fx) {
    const { items, more } = parseLine(fx, "fixos: ");
    const expectedItem = new Set(f.fixed.map((x) => x.name + " " + (x.kind === "in" ? "+" : "") + brl(x.amount) + " dia " + Number(x.day.slice(8, 10)) + (x.entered ? " lançado" : " #" + x.id)));
    check("corte: nenhum fixo sai cortado no meio (cada item é inteiro)", items.every((i) => expectedItem.has(i)), items.find((i) => !expectedItem.has(i)));
    check("corte: o N é o que ficou de fora", items.length + more === 30 && more > 0, items.length + " + " + more);
  }
  const pend = lineStarting(lines, "a confirmar: ");
  if (pend) {
    const { items, more } = parseLine(pend, "a confirmar: ");
    const expectedItem = new Set(f.pending.map((e) => e.day.slice(8, 10) + "/" + e.day.slice(5, 7) + " " + e.name + " " + brl(e.amount) + " #" + e.id));
    check("corte: nenhum 'a confirmar' sai cortado no meio", items.every((i) => expectedItem.has(i)), items.find((i) => !expectedItem.has(i)));
    check("corte: o 'a confirmar' conta tudo (os mais recentes primeiro)", items.length + more === 12 && (!items.length || items[0].includes("#pa11")), items[0]);
  }
});

/* ---------- as contas movidas continuam as mesmas ---------- */
const FIX_CTX = {
  startBalance: { day: "2026-09-01", amount: 100000 },
  entries: [
    ent("e1", "2026-09-03", "freela", "in", 300000, true, { category: "Freela" }),
    ent("e2", "2026-09-05", "salário", "in", 500000, true, { origin: { type: "fixed", id: "f-sal" } }),
    ent("e3", "2026-09-08", "mercado", "out", 45000, true, { category: "Básicas/PF" }),
    ent("e4", "2026-09-20", "dentista", "out", 80000, false, { category: "Básicas/PF" }),
    ent("e5", "2026-09-27", "reembolso", "in", 25000, false),
    ent("e6", "2026-10-02", "mercado", "out", 38000, true, { category: "Básicas/PF" }),
    ent("e7", "2026-10-18", "seguro", "out", 60000, false, { category: "Recorrente" })
  ],
  fixed: [
    { id: "f-sal", type: "fixed", name: "salário", amount: 500000, kind: "in", category: "Freela", dayOfMonth: 5, active: true },
    { id: "f-alug", type: "fixed", name: "aluguel", amount: 200000, kind: "out", category: "Básicas/PF", dayOfMonth: 10, active: true },
    { id: "f-anual", type: "fixed", name: "plano anual", amount: 5000, kind: "out", category: "Ferramentas", dayOfMonth: 31, active: true },
    { id: "f-velho", type: "fixed", name: "revista", amount: 9900, kind: "out", category: "Lazer", dayOfMonth: 15, active: false }
  ],
  cards: [
    { id: "c1", type: "card", name: "notebook", card: "roxinho", total: 90000, installments: 3, start: "2026-09", dayOfMonth: 12 }
  ],
  debts: [], invests: []
};
/* gravadas rodando o buildMonth ATUAL de origin/main:src/finance.jsx (a cópia
   literal da função), sobre o FIX_CTX acima: [dia, saldo, entrou, saiu]. nada
   aqui foi calculado à mão nem pela função nova */
const FIX = {
  /* setembro tem 30 dias: o fixo do dia 31 cai no dia 30. sem sugestão: só o lançado */
  setSemSugestao: [
    ["2026-09-01",100000,0,0], ["2026-09-02",100000,0,0], ["2026-09-03",400000,300000,0],
    ["2026-09-04",400000,0,0], ["2026-09-05",900000,500000,0], ["2026-09-06",900000,0,0],
    ["2026-09-07",900000,0,0], ["2026-09-08",855000,0,45000], ["2026-09-09",855000,0,0],
    ["2026-09-10",855000,0,0], ["2026-09-11",855000,0,0], ["2026-09-12",855000,0,0],
    ["2026-09-13",855000,0,0], ["2026-09-14",855000,0,0], ["2026-09-15",855000,0,0],
    ["2026-09-16",855000,0,0], ["2026-09-17",855000,0,0], ["2026-09-18",855000,0,0],
    ["2026-09-19",855000,0,0], ["2026-09-20",775000,0,80000], ["2026-09-21",775000,0,0],
    ["2026-09-22",775000,0,0], ["2026-09-23",775000,0,0], ["2026-09-24",775000,0,0],
    ["2026-09-25",775000,0,0], ["2026-09-26",775000,0,0], ["2026-09-27",800000,25000,0],
    ["2026-09-28",800000,0,0], ["2026-09-29",800000,0,0], ["2026-09-30",800000,0,0]
  ],
  /* sugestão a partir do dia 15: só o plano anual (dia 31 -> 30) soma */
  setSugestaoDia15: [
    ["2026-09-01",100000,0,0], ["2026-09-02",100000,0,0], ["2026-09-03",400000,300000,0],
    ["2026-09-04",400000,0,0], ["2026-09-05",900000,500000,0], ["2026-09-06",900000,0,0],
    ["2026-09-07",900000,0,0], ["2026-09-08",855000,0,45000], ["2026-09-09",855000,0,0],
    ["2026-09-10",855000,0,0], ["2026-09-11",855000,0,0], ["2026-09-12",855000,0,0],
    ["2026-09-13",855000,0,0], ["2026-09-14",855000,0,0], ["2026-09-15",855000,0,0],
    ["2026-09-16",855000,0,0], ["2026-09-17",855000,0,0], ["2026-09-18",855000,0,0],
    ["2026-09-19",855000,0,0], ["2026-09-20",775000,0,80000], ["2026-09-21",775000,0,0],
    ["2026-09-22",775000,0,0], ["2026-09-23",775000,0,0], ["2026-09-24",775000,0,0],
    ["2026-09-25",775000,0,0], ["2026-09-26",775000,0,0], ["2026-09-27",800000,25000,0],
    ["2026-09-28",800000,0,0], ["2026-09-29",800000,0,0], ["2026-09-30",795000,0,5000]
  ],
  /* outubro com sugestão a partir do dia 10: aluguel (10), parcela 2/3 do cartão (12) e plano (31) */
  outSugestaoDia10: [
    ["2026-10-01",800000,0,0], ["2026-10-02",762000,0,38000], ["2026-10-03",762000,0,0],
    ["2026-10-04",762000,0,0], ["2026-10-05",762000,0,0], ["2026-10-06",762000,0,0],
    ["2026-10-07",762000,0,0], ["2026-10-08",762000,0,0], ["2026-10-09",762000,0,0],
    ["2026-10-10",562000,0,200000], ["2026-10-11",562000,0,0], ["2026-10-12",532000,0,30000],
    ["2026-10-13",532000,0,0], ["2026-10-14",532000,0,0], ["2026-10-15",532000,0,0],
    ["2026-10-16",532000,0,0], ["2026-10-17",532000,0,0], ["2026-10-18",472000,0,60000],
    ["2026-10-19",472000,0,0], ["2026-10-20",472000,0,0], ["2026-10-21",472000,0,0],
    ["2026-10-22",472000,0,0], ["2026-10-23",472000,0,0], ["2026-10-24",472000,0,0],
    ["2026-10-25",472000,0,0], ["2026-10-26",472000,0,0], ["2026-10-27",472000,0,0],
    ["2026-10-28",472000,0,0], ["2026-10-29",472000,0,0], ["2026-10-30",472000,0,0],
    ["2026-10-31",467000,0,5000]
  ],
  /* o mesmo mês, com o saldo de partida dado de fora (123456) em vez de calculado */
  outSaldoDado: [
    ["2026-10-01",123456,0,0], ["2026-10-02",85456,0,38000], ["2026-10-03",85456,0,0],
    ["2026-10-04",85456,0,0], ["2026-10-05",85456,0,0], ["2026-10-06",85456,0,0],
    ["2026-10-07",85456,0,0], ["2026-10-08",85456,0,0], ["2026-10-09",85456,0,0],
    ["2026-10-10",-114544,0,200000], ["2026-10-11",-114544,0,0], ["2026-10-12",-144544,0,30000],
    ["2026-10-13",-144544,0,0], ["2026-10-14",-144544,0,0], ["2026-10-15",-144544,0,0],
    ["2026-10-16",-144544,0,0], ["2026-10-17",-144544,0,0], ["2026-10-18",-204544,0,60000],
    ["2026-10-19",-204544,0,0], ["2026-10-20",-204544,0,0], ["2026-10-21",-204544,0,0],
    ["2026-10-22",-204544,0,0], ["2026-10-23",-204544,0,0], ["2026-10-24",-204544,0,0],
    ["2026-10-25",-204544,0,0], ["2026-10-26",-204544,0,0], ["2026-10-27",-204544,0,0],
    ["2026-10-28",-204544,0,0], ["2026-10-29",-204544,0,0], ["2026-10-30",-204544,0,0],
    ["2026-10-31",-209544,0,5000]
  ]
};
const rowsOf = (days) => days.map((d) => [d.day, d.balance, d.inflow, d.outflow]);
const firstDiff = (got, want) => {
  const i = want.findIndex((w, k) => JSON.stringify(w) !== JSON.stringify(got[k]));
  return i < 0 ? (got.length !== want.length ? "tamanhos " + got.length + " vs " + want.length : "") : "linha " + i + ": veio " + JSON.stringify(got[i]) + ", era " + JSON.stringify(want[i]);
};
section("a conta movida não muda", () => {
  const cases = [
    ["setembro sem sugestão", () => buildMonth("2026-09", FIX_CTX, null, undefined), FIX.setSemSugestao],
    ["setembro com sugestão do dia 15 (dia 31 em mês de 30)", () => buildMonth("2026-09", FIX_CTX, null, "2026-09-15"), FIX.setSugestaoDia15],
    ["outubro com sugestão do dia 10 (fixo, parcela do cartão, dia 31)", () => buildMonth("2026-10", FIX_CTX, null, "2026-10-10"), FIX.outSugestaoDia10],
    ["outubro com o saldo de partida dado", () => buildMonth("2026-10", FIX_CTX, 123456, "2026-10-10"), FIX.outSaldoDado]
  ];
  for (const [name, run, want] of cases) {
    const got = rowsOf(run());
    check("buildMonth: " + name + " bate com a fixture", JSON.stringify(got) === JSON.stringify(want), firstDiff(got, want));
  }
  const aug = buildMonth("2026-08", FIX_CTX, null, undefined);
  check("buildMonth: antes do saldo inicial o dia é vazio, parado no saldo inicial", aug.length === 31 && aug.every((d) => d.before === true && d.balance === 100000 && d.inflow === 0 && d.outflow === 0 && d.items.length === 0));
  const oct = buildMonth("2026-10", FIX_CTX, null, "2026-10-10");
  check("buildMonth: cada dia traz os lançamentos e as sugestões dele", oct[1].items.length === 1 && oct[9].suggestions.some((s) => s.name === "aluguel") && oct[11].suggestions.some((s) => s.name === "notebook · 2/3"), JSON.stringify(oct[11].suggestions));
  check("buildMonth: dia sem nada traz listas vazias", oct[2].items.length === 0 && oct[2].suggestions.length === 0 && !oct[2].before);
});
section("pendingBefore e suggestionsBetween", () => {
  const p = pendingBefore("2026-10-17", mk({ entries: [
    ent("p2", "2026-10-14", "b", "out", 100, false), ent("p1", "2026-10-02", "a", "out", 100, false),
    ent("pago", "2026-10-03", "c", "out", 100, true), ent("hoje", "2026-10-17", "d", "out", 100, false), ent("fut", "2026-10-30", "e", "out", 100, false)
  ] }));
  check("pendingBefore: só o não pago de antes do dia, do mais antigo ao mais novo", JSON.stringify(p.map((x) => [x.day, x.it.id])) === JSON.stringify([["2026-10-02", "p1"], ["2026-10-14", "p2"]]), JSON.stringify(p.map((x) => [x.day, x.it.id])));
  check("pendingBefore: sem entries não quebra", pendingBefore("2026-10-17", {}).length === 0);
  const s = suggestionsBetween("2026-09-28", "2026-10-02", FIX_CTX);
  check("suggestionsBetween: o dia 31 cai no 30 de setembro, e só ele no intervalo", s.length === 1 && s[0].day === "2026-09-30" && s[0].it.name === "plano anual" && s[0].it.amount === 5000, JSON.stringify(s));
  const c = suggestionsBetween("2026-09-12", "2026-09-12", FIX_CTX);
  check("suggestionsBetween: a parcela do cartão sai como 'nome · n/total'", c.length === 1 && c[0].it.name === "notebook · 1/3" && c[0].it.amount === 30000 && c[0].it.category === "Cartão", JSON.stringify(c));
  check("suggestionsBetween: o fixo já lançado no mês não é sugerido", suggestionsBetween("2026-09-05", "2026-09-05", FIX_CTX).length === 0);
  check("suggestionsBetween: intervalo invertido é vazio", suggestionsBetween("2026-10-02", "2026-09-28", FIX_CTX).length === 0);
});

/* a vitrine saiu (PRD o-menu-por-area, D7): wishlist-item não é mais um tipo.
   uma proposta antiga, guardada numa conversa, abre como "desconhecido" e não grava */
{
  const store = core.collection("wishlist");
  const antes = store.all().length;
  check("vitrine: wishlist-item não tem coleção", ACTION_COLLECTIONS["wishlist-item"] === undefined);
  check("vitrine: wishlist-item não tem rótulo", ACTION_LABELS["wishlist-item"] === undefined);
  let r, lancou = false;
  try { r = buildDoc("wishlist-item", { name: "x" }, { name: "x" }, store); } catch (e) { lancou = true; }
  check("vitrine: buildDoc de wishlist-item devolve o erro, sem lançar", !lancou && !!r && r.error === "tipo de ação desconhecido" && !r.doc, JSON.stringify(r));
  check("vitrine: e não grava nada", store.all().length === antes);
  /* a conversa guardada com uma proposta antiga abre sem quebrar: a pílula
     não volta (o tipo não existe mais), e nada vai para a coleção */
  let chat, abriu = true;
  try { chat = normalizeChat({ id: "c1", messages: [{ from: "me", text: "quero um teclado" }, { from: "merlin", proposal: { actionType: "wishlist-item", title: "teclado", payload: { name: "teclado" } } }] }); } catch (e) { abriu = false; }
  check("vitrine: a conversa com proposta antiga abre sem lançar", abriu && chat.messages.length === 2, JSON.stringify(chat));
  check("vitrine: a proposta antiga não vira pílula", abriu && !chat.messages[1].proposal);
}

/* =====================================================================
   o caixa da empresa (ticket #75): o financeiro ganha livros.

   a coleção é uma só, com um campo `book` no documento. errar aqui é a conta
   da empresa aparecendo na pessoal (ou o contrário) sem aviso: um lançamento
   da empresa que soma no saldo de casa, um "confirmar" que pega o previsto do
   outro livro, o fôlego do caixa puxado para baixo por meses que ele não viveu.
   ===================================================================== */
const FDB = await import("./finance-data.js");
const { bookOf, BUSINESS_CATEGORIES, DEFAULT_CATEGORIES, bookCollection, saveConfig, runway, runwayLabel, cashMonth, cashLine, adjacentMonth } = FDB;
const AAB = await import("./assistant-actions.js");

/* uma coleção de mentira, com a mesma cara da real: all/get/save/saveMany/remove.
   `norm` é opcional: a real normaliza ao ler, e o documento "antigo" do teste
   precisa poder ficar cru, sem o campo book */
function fakeFinance(seed, norm) {
  const map = new Map((seed || []).map((d) => [d.id, { ...d }]));
  const out = (d) => (d ? (norm ? norm({ ...d }) : { ...d }) : null);
  return {
    all: () => [...map.values()].map(out),
    get: (id) => out(map.get(id)),
    save: (d) => { map.set(d.id, { ...d }); return out(d); },
    saveMany: (ds) => { ds.forEach((d) => map.set(d.id, { ...d })); return ds.map(out); },
    remove: (id) => { const d = map.get(id); map.delete(id); return d ? out(d) : null; },
    raw: (id) => (map.has(id) ? { ...map.get(id) } : null)
  };
}
const spaced = (s) => String(s).replace(/\s/g, " ");

section("livros: bookOf", () => {
  check("livros: bookOf(business) é business", bookOf("business") === "business");
  check("livros: bookOf(personal) é personal", bookOf("personal") === "personal");
  check("livros: bookOf(undefined) é personal", bookOf(undefined) === "personal");
  check("livros: bookOf(null) é personal", bookOf(null) === "personal");
  check("livros: bookOf(\"x\") é personal", bookOf("x") === "personal");
  check("livros: bookOf(\"\") é personal", bookOf("") === "personal");
  check("livros: só o valor exato business vale (BUSINESS é personal)", bookOf("BUSINESS") === "personal");
});

section("livros: normalize", () => {
  const e = { id: "e1", type: "entry", name: "x", amount: 100, kind: "out", day: "2026-10-01" };
  check("livros: normalize sem book vira personal", normalize(e).book === "personal", JSON.stringify(normalize(e)));
  check("livros: normalize com book x vira personal", normalize({ ...e, book: "x" }).book === "personal");
  check("livros: normalize preserva business", normalize({ ...e, book: "business" }).book === "business");
  check("livros: normalize preserva personal", normalize({ ...e, book: "personal" }).book === "personal");
  for (const type of ["fixed", "card", "debt", "invest"]) {
    check("livros: normalize de " + type + " ganha book", normalize({ id: "z", type }).book === "personal" && normalize({ id: "z", type, book: "business" }).book === "business");
  }
  check("livros: tipo desconhecido (default) também ganha book", normalize({ id: "z", type: "mistério" }).book === "personal" && normalize({ id: "z", type: "mistério", book: "business" }).book === "business" && normalize({ id: "z", type: "mistério", book: "x" }).book === "personal");
  check("livros: o resto do documento do lançamento não muda", sameJson({ ...normalize({ ...e, book: "business" }), book: undefined, createdAt: 0, updatedAt: 0 }, { ...normalize(e), book: undefined, createdAt: 0, updatedAt: 0 }));
  /* a config */
  const cp = normalize({ type: "config" });
  const cb = normalize({ type: "config", book: "business" });
  check("livros: a config sem book é a de sempre (id config)", cp.id === "config" && cp.book === "personal", JSON.stringify(cp));
  check("livros: a config sem book tem as categorias padrão pessoais", sameJson(cp.categories, DEFAULT_CATEGORIES));
  check("livros: a config da empresa tem o id config-business", cb.id === "config-business" && cb.book === "business", JSON.stringify(cb));
  check("livros: a config da empresa tem as categorias padrão da empresa", sameJson(cb.categories, BUSINESS_CATEGORIES));
  check("livros: a config da empresa ignora um id que não é o dela", normalize({ id: "config", type: "config", book: "business" }).id === "config-business");
  check("livros: a config pessoal ignora um id que não é o dela", normalize({ id: "config-business", type: "config" }).id === "config");
  check("livros: as categorias da empresa incluem Clientes e Ferramentas", Array.isArray(BUSINESS_CATEGORIES) && BUSINESS_CATEGORIES.includes("Clientes") && BUSINESS_CATEGORIES.includes("Ferramentas"), JSON.stringify(BUSINESS_CATEGORIES));
  check("livros: categorias da empresa gravadas na config valem", sameJson(normalize({ type: "config", book: "business", categories: ["Aluguel", "Clientes"] }).categories, ["Aluguel", "Clientes"]));
  check("livros: a lista padrão da empresa não é a mesma referência (editar não suja o padrão)", (() => { const c = normalize({ type: "config", book: "business" }); c.categories.push("zzz"); return !BUSINESS_CATEGORIES.includes("zzz"); })());
});

section("livros: bookCollection", () => {
  const old = { id: "old", type: "entry", name: "mercado", amount: 5000, kind: "out", day: "2026-10-01", paid: true }; /* de antes: sem book */
  const pers = { id: "pers", type: "entry", name: "cinema", amount: 3000, kind: "out", day: "2026-10-02", paid: true, book: "personal" };
  const biz = { id: "biz", type: "entry", name: "Figma", amount: 8000, kind: "out", day: "2026-10-03", paid: true, book: "business" };
  const f = fakeFinance([old, pers, biz]);
  const B = bookCollection(f, "business");
  const P = bookCollection(f, "personal");
  check("livros: bookCollection diz de que livro é", B.book === "business" && P.book === "personal");
  check("livros: bookCollection tem a interface da coleção", ["all", "get", "save", "saveMany", "remove"].every((k) => typeof B[k] === "function" && typeof P[k] === "function"));
  check("livros: o all da empresa só vê a empresa", sameJson(ids(B.all()).sort(), ["biz"]), JSON.stringify(ids(B.all())));
  check("livros: o all do pessoal vê o pessoal e o documento antigo sem book", sameJson(ids(P.all()).sort(), ["old", "pers"]), JSON.stringify(ids(P.all())));
  check("livros: o documento antigo sem book aparece no pessoal e não na empresa", !!P.get("old") && B.get("old") === null);
  check("livros: get da empresa de um id pessoal é null", B.get("pers") === null);
  check("livros: get do pessoal de um id da empresa é null", P.get("biz") === null);
  check("livros: get de um id que não existe é null", B.get("nada") === null && P.get("nada") === null);
  check("livros: get no próprio livro devolve o documento", B.get("biz") && B.get("biz").name === "Figma");

  /* gravar carimba */
  B.save({ id: "n1", type: "entry", name: "Acme", amount: 240000, kind: "in", day: "2026-10-05", paid: true });
  check("livros: save pela empresa grava com book business", f.raw("n1") && f.raw("n1").book === "business", JSON.stringify(f.raw("n1")));
  P.save({ id: "n2", type: "entry", name: "padaria", amount: 900, kind: "out", day: "2026-10-05", paid: true });
  check("livros: save pelo pessoal grava com book personal", f.raw("n2") && f.raw("n2").book === "personal", JSON.stringify(f.raw("n2")));
  P.save({ id: "n3", type: "entry", name: "errado", amount: 1, kind: "out", day: "2026-10-05", paid: true, book: "business" });
  check("livros: o livro vence o book que veio no documento", f.raw("n3").book === "personal", JSON.stringify(f.raw("n3")));
  B.saveMany([{ id: "m1", type: "entry", name: "a", amount: 1, kind: "out", day: "2026-10-05", paid: true }, { id: "m2", type: "entry", name: "b", amount: 2, kind: "out", day: "2026-10-05", paid: true, book: "personal" }]);
  check("livros: saveMany carimba todos com o livro", f.raw("m1").book === "business" && f.raw("m2").book === "business", JSON.stringify([f.raw("m1"), f.raw("m2")]));
  check("livros: cada livro não vê o que o outro gravou", !ids(P.all()).includes("n1") && !ids(P.all()).includes("m1") && !ids(B.all()).includes("n2") && !ids(B.all()).includes("n3"));
  check("livros: o que a empresa gravou aparece na empresa", ["biz", "n1", "m1", "m2"].every((id) => ids(B.all()).includes(id)), JSON.stringify(ids(B.all())));

  /* apagar */
  const total = f.all().length;
  const r1 = B.remove("pers");
  check("livros: remove de um documento do outro livro devolve null", r1 === null, String(r1));
  check("livros: remove de um documento do outro livro não apaga", !!f.raw("pers") && f.all().length === total);
  const r2 = P.remove("biz");
  check("livros: remove pelo pessoal de um documento da empresa não apaga", r2 === null && !!f.raw("biz"));
  const r3 = B.remove("nada");
  check("livros: remove de um id que não existe devolve null", r3 === null && f.all().length === total);
  B.remove("n1");
  check("livros: remove no próprio livro apaga", f.raw("n1") === null && B.get("n1") === null);
  P.remove("old");
  check("livros: o pessoal apaga o documento antigo sem book", f.raw("old") === null);

  /* com a normalização da coleção real (que carimba personal ao ler) */
  const g = fakeFinance([{ id: "o2", type: "entry", name: "velho", amount: 1, kind: "out", day: "2026-10-01", paid: true }, { id: "b2", type: "entry", name: "emp", amount: 1, kind: "out", day: "2026-10-01", paid: true, book: "business" }], normalize);
  check("livros: com a coleção normalizando, o antigo continua só no pessoal", sameJson(ids(bookCollection(g, "personal").all()), ["o2"]) && sameJson(ids(bookCollection(g, "business").all()), ["b2"]));
  /* tipos que não são lançamento também se separam */
  const h = fakeFinance([{ id: "fx1", type: "fixed", name: "internet", amount: 1, kind: "out", dayOfMonth: 5, active: true, book: "business" }, { id: "fx2", type: "fixed", name: "luz", amount: 1, kind: "out", dayOfMonth: 5, active: true }]);
  check("livros: um fixo da empresa não aparece no contexto do pessoal", sameJson(ids(contextOf(bookCollection(h, "personal")).fixed), ["fx2"]) && sameJson(ids(contextOf(bookCollection(h, "business")).fixed), ["fx1"]));
});

section("livros: a config de cada livro", () => {
  const f = fakeFinance([], normalize);
  const raw = fakeFinance([], normalize);
  /* a coleção crua e o livro pessoal leem a "config" */
  saveConfig(raw, { startBalance: { day: "2026-10-01", amount: 111 } });
  check("livros: saveConfig na coleção crua grava no id config", !!raw.raw("config") && !raw.raw("config-business"), JSON.stringify(raw.all()));
  check("livros: configOf na coleção crua lê a config", configOf(raw).startBalance.amount === 111 && configOf(raw).id === "config");

  const P = bookCollection(f, "personal"), B = bookCollection(f, "business");
  saveConfig(P, { startBalance: { day: "2026-10-01", amount: 500000 } });
  saveConfig(B, { startBalance: { day: "2026-10-01", amount: 20000 } });
  check("livros: saveConfig pessoal grava no id config", f.raw("config") && f.raw("config").startBalance.amount === 500000 && f.raw("config").book === "personal", JSON.stringify(f.raw("config")));
  check("livros: saveConfig da empresa grava no id config-business", f.raw("config-business") && f.raw("config-business").startBalance.amount === 20000 && f.raw("config-business").book === "business", JSON.stringify(f.raw("config-business")));
  check("livros: configOf lê a config de cada livro", configOf(P).startBalance.amount === 500000 && configOf(B).startBalance.amount === 20000);
  check("livros: as duas configs coexistem na coleção", f.all().filter((d) => d.type === "config").length === 2);
  check("livros: o all de cada livro vê só a própria config", sameJson(ids(P.all()), ["config"]) && sameJson(ids(B.all()), ["config-business"]), JSON.stringify([ids(P.all()), ids(B.all())]));

  const f2 = fakeFinance([], normalize);
  const B2 = bookCollection(f2, "business");
  check("livros: sem config gravada, a da empresa é a padrão da empresa", sameJson(configOf(B2).categories, BUSINESS_CATEGORIES) && configOf(B2).id === "config-business" && configOf(B2).startBalance === null);
  check("livros: sem config gravada, a do pessoal é a padrão pessoal", sameJson(configOf(bookCollection(f2, "personal")).categories, DEFAULT_CATEGORIES) && configOf(bookCollection(f2, "personal")).id === "config");
  saveConfig(B2, { categories: ["Aluguel", "Clientes"] });
  check("livros: mudar as categorias da empresa não mexe nas do pessoal", sameJson(configOf(B2).categories, ["Aluguel", "Clientes"]) && sameJson(configOf(bookCollection(f2, "personal")).categories, DEFAULT_CATEGORIES));

  /* contextOf */
  const seed = [
    { id: "pe", type: "entry", name: "mercado", amount: 5000, kind: "out", day: "2026-10-02", paid: true, book: "personal" },
    { id: "be", type: "entry", name: "Acme", amount: 240000, kind: "in", day: "2026-10-03", paid: true, book: "business" },
    { id: "old", type: "entry", name: "antigo", amount: 100, kind: "out", day: "2026-10-01", paid: true },
    { type: "config", id: "config", book: "personal", startBalance: { day: "2026-10-01", amount: 700000 } },
    { type: "config", id: "config-business", book: "business", startBalance: { day: "2026-10-01", amount: 30000 } }
  ];
  const g = fakeFinance(seed, normalize);
  const cb = contextOf(bookCollection(g, "business")), cp = contextOf(bookCollection(g, "personal"));
  check("livros: contextOf da empresa só vê os lançamentos da empresa", sameJson(ids(cb.entries), ["be"]), JSON.stringify(ids(cb.entries)));
  check("livros: contextOf da empresa usa o saldo inicial da config da empresa", cb.startBalance && cb.startBalance.amount === 30000, JSON.stringify(cb.startBalance));
  check("livros: contextOf do pessoal só vê o pessoal, com o saldo inicial dele", sameJson(ids(cp.entries).sort(), ["old", "pe"]) && cp.startBalance.amount === 700000, JSON.stringify(cp));
  check("livros: o saldo da empresa não mistura com o pessoal", realBalanceUntil("2026-10-31", cb) === 30000 + 240000 && realBalanceUntil("2026-10-31", cp) === 700000 - 5000 - 100, realBalanceUntil("2026-10-31", cb) + " / " + realBalanceUntil("2026-10-31", cp));
  check("livros: contextOf da empresa sem config não usa o saldo do pessoal", contextOf(bookCollection(fakeFinance(seed.slice(0, 4), normalize), "business")).startBalance === null);
});

section("fôlego: runway e runwayLabel", () => {
  check("fôlego: 12000 com saídas 3000, 3000 e 6000 dá 3 meses", runway(12000, [3000, 3000, 6000]) === 3, String(runway(12000, [3000, 3000, 6000])));
  check("fôlego: sem saída nenhuma não há fôlego (null)", runway(12000, [0, 0, 0]) === null && runway(12000, []) === null);
  check("fôlego: sem lista também não quebra", runway(12000) === null);
  check("fôlego: saldo negativo aguenta 0 meses", runway(-500, [1000, 1000]) === 0 && runway(-500, [1000]) === 0, String(runway(-500, [1000])));
  check("fôlego: saldo zero aguenta 0 meses", runway(0, [1000]) === 0);
  check("fôlego: um mês só", runway(5000, [1000]) === 5);
  check("fôlego: fração", Math.abs(runway(10000, [2000, 3000]) - 4) < 1e-9 && Math.abs(runway(10000, [3000]) - 10000 / 3000) < 1e-9);
  check("fôlego: mês com saída zero entra na média", runway(9000, [0, 3000, 6000]) === 3);
  check("fôlego: 4,2 vira \"4,2 meses\"", runwayLabel(4.2) === "4,2 meses", runwayLabel(4.2));
  check("fôlego: null vira o travessão", runwayLabel(null) === "—", runwayLabel(null));
  check("fôlego: 3 vira \"3,0 meses\"", runwayLabel(3) === "3,0 meses", runwayLabel(3));
  check("fôlego: 0 vira \"0,0 meses\"", runwayLabel(0) === "0,0 meses", runwayLabel(0));
  check("fôlego: de 1 a menos de 2 fica no singular", runwayLabel(1) === "1,0 mês" && runwayLabel(1.5) === "1,5 mês" && runwayLabel(1.96) === "2,0 meses", [runwayLabel(1), runwayLabel(1.5), runwayLabel(1.96)].join(" | "));
});

section("fôlego: adjacentMonth", () => {
  check("meses: dezembro mais um é janeiro do ano seguinte", adjacentMonth("2026-12", 1) === "2027-01");
  check("meses: janeiro menos um é dezembro do ano anterior", adjacentMonth("2026-01", -1) === "2025-12");
  check("meses: dentro do ano", adjacentMonth("2026-10", 1) === "2026-11" && adjacentMonth("2026-10", -1) === "2026-09");
  check("meses: zero é o próprio mês", adjacentMonth("2026-10", 0) === "2026-10");
  check("meses: dois para trás atravessa o ano", adjacentMonth("2026-02", -2) === "2025-12" && adjacentMonth("2026-01", -2) === "2025-11");
});

section("caixa: cashMonth", () => {
  /* outubro: saldo inicial de 1.000,00 no dia 1. entrou 2.400 (pago) e há 500 de
     entrada prevista; saiu 300 + 200 (pagos) e há 999,99 de saída prevista */
  const ctx = {
    entries: [
      ent("a", "2026-10-05", "Acme", "in", 240000, true),
      ent("b", "2026-10-10", "Beta", "in", 50000, false),
      ent("c", "2026-10-08", "Figma", "out", 30000, true),
      ent("d", "2026-10-12", "Contador", "out", 20000, true),
      ent("e", "2026-10-15", "Imposto", "out", 99999, false)
    ],
    startBalance: { day: "2026-10-01", amount: 100000 }
  };
  const m = cashMonth(ctx, "2026-10-20");
  check("caixa: entrou soma só as entradas pagas do mês", m.inflow === 240000, JSON.stringify(m));
  check("caixa: saiu soma só as saídas pagas do mês", m.outflow === 50000, JSON.stringify(m));
  check("caixa: a sobra é o que entrou menos o que saiu", m.left === 190000, JSON.stringify(m));
  check("caixa: o saldo é o saldo real de hoje (sem o previsto)", m.balance === 290000 && m.balance === realBalanceUntil("2026-10-20", ctx), JSON.stringify(m));
  check("caixa: caixa que começou neste mês tira a média só deste mês", Math.abs(m.runway - 290000 / 50000) < 1e-9, String(m.runway));

  /* o resumo é do mês de t, e t só decide o saldo */
  const nov = cashMonth(ctx, "2026-11-10");
  check("caixa: outro mês sem lançamento zera entrou, saiu e sobra", nov.inflow === 0 && nov.outflow === 0 && nov.left === 0, JSON.stringify(nov));
  check("caixa: o saldo de novembro carrega o de outubro", nov.balance === 290000, JSON.stringify(nov));
  /* novembro sem saída, outubro com 50.000: a média dos meses vividos (out e nov) é 25.000 */
  check("caixa: o fôlego de novembro conta outubro e novembro (média 25.000)", Math.abs(nov.runway - 290000 / 25000) < 1e-9, String(nov.runway));

  /* o previsto não conta, nem como saída nem como entrada */
  const onlyPlanned = cashMonth({ entries: [ent("p", "2026-10-05", "x", "out", 5000, false), ent("q", "2026-10-06", "y", "in", 7000, false)], startBalance: { day: "2026-10-01", amount: 1000 } }, "2026-10-20");
  check("caixa: só previstos: nada entrou, nada saiu, saldo é o inicial", onlyPlanned.inflow === 0 && onlyPlanned.outflow === 0 && onlyPlanned.balance === 1000, JSON.stringify(onlyPlanned));
  check("caixa: só previstos: sem saída paga não há fôlego", onlyPlanned.runway === null, String(onlyPlanned.runway));

  /* três meses que terminam no de t */
  const tri = cashMonth({
    entries: [
      ent("o1", "2026-08-10", "ago", "out", 10000, true),
      ent("o2", "2026-09-10", "set", "out", 20000, true),
      ent("o3", "2026-10-10", "out", "out", 30000, true),
      ent("o4", "2026-10-11", "futuro", "out", 90000, false)
    ],
    startBalance: { day: "2026-08-01", amount: 100000 }
  }, "2026-10-31");
  check("caixa: três meses de saída: média de ago, set e out", tri.outflow === 30000 && tri.balance === 40000 && Math.abs(tri.runway - 2) < 1e-9, JSON.stringify(tri));

  /* só os três últimos: um mês mais velho que isso fica fora da média */
  const quatro = cashMonth({
    entries: [
      ent("q1", "2026-07-10", "jul", "out", 600000, true),
      ent("q2", "2026-08-10", "ago", "out", 10000, true),
      ent("q3", "2026-09-10", "set", "out", 20000, true),
      ent("q4", "2026-10-10", "out", "out", 30000, true)
    ],
    startBalance: { day: "2026-07-01", amount: 700000 }
  }, "2026-10-31");
  check("caixa: o quarto mês para trás não entra na média", quatro.balance === 700000 - 660000 && Math.abs(quatro.runway - 40000 / 20000) < 1e-9, JSON.stringify(quatro));

  /* o marco: mês antes do saldo inicial não conta, mesmo com lançamento nele */
  const marco = cashMonth({
    entries: [
      ent("m1", "2026-08-10", "antes do marco", "out", 90000, true),
      ent("m2", "2026-09-10", "set", "out", 20000, true),
      ent("m3", "2026-10-10", "out", "out", 40000, true)
    ],
    startBalance: { day: "2026-09-01", amount: 120000 }
  }, "2026-10-31");
  check("caixa: mês anterior ao marco fica fora da média", marco.balance === 60000 && Math.abs(marco.runway - 60000 / 30000) < 1e-9, JSON.stringify(marco));

  /* sem saldo inicial, o marco é o lançamento mais antigo */
  const semSaldo = cashMonth({
    entries: [
      ent("s1", "2026-09-10", "set", "out", 20000, true),
      ent("s2", "2026-09-12", "set in", "in", 100000, true),
      ent("s3", "2026-10-10", "out", "out", 40000, true)
    ],
    startBalance: null
  }, "2026-10-31");
  check("caixa: sem saldo inicial, o marco é o lançamento mais antigo", semSaldo.balance === 40000 && Math.abs(semSaldo.runway - 40000 / 30000) < 1e-9, JSON.stringify(semSaldo));
  const semSaldoUmMes = cashMonth({ entries: [ent("t1", "2026-10-10", "x", "out", 40000, true), ent("t2", "2026-10-11", "y", "in", 100000, true)], startBalance: null }, "2026-10-31");
  check("caixa: sem saldo inicial e com um mês só, a média é a deste mês", semSaldoUmMes.balance === 60000 && Math.abs(semSaldoUmMes.runway - 1.5) < 1e-9, JSON.stringify(semSaldoUmMes));

  /* virada de ano */
  const virada = cashMonth({
    entries: [ent("v1", "2025-12-10", "dez", "out", 10000, true), ent("v2", "2026-01-10", "jan", "out", 30000, true)],
    startBalance: { day: "2025-12-01", amount: 100000 }
  }, "2026-01-31");
  check("caixa: a janela de três meses atravessa a virada do ano", virada.outflow === 30000 && virada.balance === 60000 && Math.abs(virada.runway - 60000 / 20000) < 1e-9, JSON.stringify(virada));

  /* vazio e saldo negativo */
  const vazio = cashMonth({ entries: [], startBalance: null }, "2026-10-20");
  check("caixa: sem nada, tudo zero e sem fôlego", vazio.inflow === 0 && vazio.outflow === 0 && vazio.left === 0 && vazio.balance === 0 && vazio.runway === null, JSON.stringify(vazio));
  const negativo = cashMonth({ entries: [ent("n1", "2026-10-05", "x", "out", 80000, true)], startBalance: { day: "2026-10-01", amount: 10000 } }, "2026-10-20");
  check("caixa: saldo negativo: sobra negativa e fôlego 0", negativo.left === -80000 && negativo.balance === -70000 && negativo.runway === 0, JSON.stringify(negativo));

  /* é pura: não mexe no contexto */
  const frozen = JSON.stringify(ctx);
  cashMonth(ctx, "2026-10-20");
  check("caixa: cashMonth não mexe no contexto", JSON.stringify(ctx) === frozen);
});

section("caixa: cashLine", () => {
  check("pílula do caixa: reais inteiros sem ,00", spaced(cashLine({ amount: 240000, name: "Acme" })) === "lançado no caixa · R$ 2.400 · Acme", spaced(cashLine({ amount: 240000, name: "Acme" })));
  check("pílula do caixa: com centavos mostra os centavos", spaced(cashLine({ amount: 245050, name: "Acme" })) === "lançado no caixa · R$ 2.450,50 · Acme", spaced(cashLine({ amount: 245050, name: "Acme" })));
  check("pílula do caixa: valor pequeno", spaced(cashLine({ amount: 4500, name: "Figma" })) === "lançado no caixa · R$ 45 · Figma", spaced(cashLine({ amount: 4500, name: "Figma" })));
  check("pílula do caixa: um centavo a mais não perde o centavo", spaced(cashLine({ amount: 4501, name: "Figma" })) === "lançado no caixa · R$ 45,01 · Figma", spaced(cashLine({ amount: 4501, name: "Figma" })));
});

section("conversa: o livro do lançamento", () => {
  const fields = AAB.ACTION_FIELDS["finance-entry"];
  const bf = fields.find((x) => x.key === "book");
  check("conversa: o cartão do lançamento ganha o campo book, um seletor", !!bf && bf.type === "select", JSON.stringify(bf && { key: bf.key, type: bf.type }));
  check("conversa: as opções do livro são pessoal e empresa", !!bf && sameJson(bf.options(), [["personal", "pessoal"], ["business", "empresa"]]), JSON.stringify(bf && bf.options()));
  check("conversa: o cartão abre em empresa só quando a proposta pede business", !!bf && bf.initial({ book: "business" }) === "business");
  check("conversa: na dúvida o cartão abre em pessoal", !!bf && bf.initial({}) === "personal" && bf.initial({ book: "x" }) === "personal" && bf.initial({ book: "personal" }) === "personal" && bf.initial({ book: undefined }) === "personal");
  check("conversa: os campos que já existiam continuam", ["name", "amount", "day", "kind", "category", "paid"].every((k) => fields.some((x) => x.key === k)));

  const payload = { name: "Figma", amount: 8000, kind: "out", day: core.today(), category: "Ferramentas", paid: true, confirm: "", fixed: "" };
  const v = { name: "Figma", amount: 8000, kind: "out", day: core.today(), category: "Ferramentas", paid: true };

  const f = fakeFinance([], normalize);
  const biz = AAB.buildDoc("finance-entry", payload, { ...v, book: "business" }, f, {});
  check("conversa: buildDoc com book business devolve o doc da empresa", biz.doc && !biz.error && biz.doc.book === "business", JSON.stringify(biz));
  const pess = AAB.buildDoc("finance-entry", payload, { ...v, book: "personal" }, f, {});
  check("conversa: buildDoc com book personal devolve o doc pessoal", pess.doc && pess.doc.book === "personal", JSON.stringify(pess));
  const sem = AAB.buildDoc("finance-entry", payload, v, f, {});
  check("conversa: buildDoc sem book é pessoal", sem.doc && sem.doc.book === "personal", JSON.stringify(sem));
  const lixo = AAB.buildDoc("finance-entry", payload, { ...v, book: "x" }, f, {});
  check("conversa: buildDoc com book inválido é pessoal", lixo.doc && lixo.doc.book === "personal", JSON.stringify(lixo));
  check("conversa: o doc da empresa leva o resto do lançamento", biz.doc && biz.doc.type === "entry" && biz.doc.name === "Figma" && biz.doc.amount === 8000 && biz.doc.kind === "out" && biz.doc.category === "Ferramentas" && biz.doc.paid === true, JSON.stringify(biz));
  check("conversa: buildDoc não grava nada sozinho", f.all().length === 0);

  /* a categoria vale na config do livro escolhido */
  const clientes = AAB.buildDoc("finance-entry", { ...payload, category: "Clientes" }, { ...v, category: "Clientes", book: "business" }, f, {}).doc;
  check("conversa: a categoria Clientes vale no livro da empresa", clientes && clientes.category === "Clientes", JSON.stringify(clientes));
  const clientesPessoal = AAB.buildDoc("finance-entry", { ...payload, category: "Clientes" }, { ...v, category: "Clientes", book: "personal" }, f, {}).doc;
  check("conversa: a categoria Clientes não existe no pessoal e fica vazia", clientesPessoal && clientesPessoal.category === "", JSON.stringify(clientesPessoal));
  const lazerEmpresa = AAB.buildDoc("finance-entry", { ...payload, category: "Lazer" }, { ...v, category: "Lazer", book: "business" }, f, {}).doc;
  check("conversa: a categoria pessoal Lazer não vale no livro da empresa", lazerEmpresa && lazerEmpresa.category === "", JSON.stringify(lazerEmpresa));
  const custom = fakeFinance([{ type: "config", id: "config-business", book: "business", categories: ["Aluguel"] }], normalize);
  const doAluguel = AAB.buildDoc("finance-entry", { ...payload, category: "Aluguel" }, { ...v, category: "Aluguel", book: "business" }, custom, {}).doc;
  check("conversa: vale a categoria da config gravada do livro da empresa", doAluguel && doAluguel.category === "Aluguel", JSON.stringify(doAluguel));

  /* confirmar um previsto: só o do livro escolhido */
  const day = "2026-10-15";
  const g = fakeFinance([
    { id: "p-pess", type: "entry", name: "aluguel", amount: 150000, kind: "out", category: "Básicas/PF", day, paid: false, origin: null, book: "personal" },
    { id: "p-emp", type: "entry", name: "Acme", amount: 240000, kind: "in", category: "Clientes", day, paid: false, origin: null, book: "business" }
  ], normalize);
  const vc = { name: "", amount: 148000, kind: "out", day: core.today(), category: "", paid: true };
  const certo = AAB.buildDoc("finance-entry", { ...payload, confirm: "p-emp" }, { ...vc, kind: "in", book: "business" }, g, {}).doc;
  check("conversa: confirm com o previsto do mesmo livro confirma o previsto", certo && certo.id === "p-emp" && certo.paid === true && certo.book === "business" && certo.day === day, JSON.stringify(certo));
  const cruzado = AAB.buildDoc("finance-entry", { ...payload, confirm: "p-pess" }, { ...v, book: "business" }, g, {});
  check("conversa: confirm com id de previsto do outro livro vira lançamento novo", cruzado.doc && cruzado.doc.id !== "p-pess" && cruzado.doc.book === "business" && cruzado.doc.amount === 8000, JSON.stringify(cruzado));
  check("conversa: o lançamento novo não herda o previsto do outro livro", cruzado.doc && cruzado.doc.day === core.today() && !(cruzado.doc.origin && cruzado.doc.origin.id === "p-pess"), JSON.stringify(cruzado));
  const cruzado2 = AAB.buildDoc("finance-entry", { ...payload, confirm: "p-emp" }, { ...v, book: "personal" }, g, {});
  check("conversa: o contrário também: previsto da empresa não confirma no pessoal", cruzado2.doc && cruzado2.doc.id !== "p-emp" && cruzado2.doc.book === "personal", JSON.stringify(cruzado2));
  const antigo = AAB.buildDoc("finance-entry", { ...payload, confirm: "p-pess" }, { ...vc, book: "personal" }, g, {}).doc;
  check("conversa: confirm no pessoal continua confirmando o previsto pessoal", antigo && antigo.id === "p-pess" && antigo.paid === true && antigo.book === "personal", JSON.stringify(antigo));
  check("conversa: o previsto do outro livro segue intacto na coleção", g.raw("p-pess").paid === false && g.raw("p-emp").paid === false);

  /* os fixos também são de um livro */
  const h = fakeFinance([{ id: "f-emp", type: "fixed", name: "Figma", amount: 9000, kind: "out", category: "Ferramentas", dayOfMonth: 20, active: true, book: "business" }], normalize);
  const fixPayload = { ...payload, name: "Figma", amount: 0, fixed: "#f-emp" };
  const noEmpresa = AAB.buildDoc("finance-entry", fixPayload, { ...v, name: "Figma", amount: 0, book: "business" }, h, {});
  check("conversa: o fixo da empresa lança no livro da empresa", noEmpresa.doc && noEmpresa.doc.amount === 9000 && noEmpresa.doc.book === "business" && noEmpresa.doc.origin && noEmpresa.doc.origin.id === "f-emp", JSON.stringify(noEmpresa));
  const noPessoal = AAB.buildDoc("finance-entry", fixPayload, { ...v, name: "Figma", amount: 0, book: "personal" }, h, {});
  check("conversa: o fixo da empresa não lança no pessoal (falta o valor)", noPessoal.error === "falta o valor" && !noPessoal.doc, JSON.stringify(noPessoal));
});

console.log("\n" + passed + " passaram, " + failures.length + " falharam");
if (failures.length) { console.log("\nFALHAS:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
process.exit(0);
