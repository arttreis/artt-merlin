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
  newEntry, undoEntry, paidOf, normalize, contextOf, balanceUntil, realBalanceUntil, projectionsOf
} = await import("./finance-data.js");
const {
  ACTION_COLLECTIONS, buildDoc, normalizeChat, markProposal
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

console.log("\n" + passed + " passaram, " + failures.length + " falharam");
if (failures.length) { console.log("\nFALHAS:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
process.exit(0);
