/* testa o hábito pela secretária (ticket #10): o que o Enter do início e a
 * pílula da conversa gravam quando a pessoa diz "treinei", e o que o desfazer
 * devolve.
 *
 * errar aqui é mexer na sequência de quem se cobra todo dia, sem aviso: um
 * "treinei" dito duas vezes que desmarca o dia (o toggleMark alterna), uma marca
 * no dia que ainda não chegou, um hábito arquivado que volta a ser marcado, um
 * "ler" que acha o hábito errado. tudo isso é puro — o teste passa as datas na
 * mão (hoje é 18/10/2026), para não depender do relógio. A única exceção é o
 * buildDoc com a data vazia, que por contrato usa o `today()` do core.
 *
 * o habits-data e o assistant-actions importam o core, que é um módulo de
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
  normalize, markOn, findHabit, habitDraft, undoHabit, habitStatus, markWhen
} = await import("./habits-data.js");
const {
  ACTION_COLLECTIONS, ACTION_DONE, buildDoc, previewOf
} = await import("./assistant-actions.js");

/* ---- o cenário: hoje é 18/10/2026 (domingo) ---- */
const TODAY = "2026-10-18";
const YESTERDAY = "2026-10-17";
const TOMORROW = "2026-10-19";
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* um hábito já normalizado, como a tela o entrega; createdAt e updatedAt
   antigos deixam o carimbo novo reconhecível */
const habit = (id, name, over) => normalize({ id, name, createdAt: 1, updatedAt: 1, ...over });
const treinar = habit("h-treinar", "treinar");
const ler = habit("h-ler", "ler 20 páginas");

/* ---------- hábito existente: marca hoje ---------- */
{
  const r = markOn(treinar, TODAY, TODAY);
  check("marcar: devolve doc, não erro", !!r.doc && !r.error, JSON.stringify(r));
  check("marcar: o dia fica marcado", r.doc && r.doc.marks[TODAY] === true, JSON.stringify(r.doc && r.doc.marks));
  check("marcar: já não estava marcado", r.already === false, JSON.stringify(r));
  check("marcar: é o mesmo hábito, com o mesmo id e nome", r.doc && r.doc.id === "h-treinar" && r.doc.name === "treinar" && r.doc.schedule.type === "daily");
  check("marcar: o carimbo de atualização é novo", r.doc && r.doc.updatedAt > 1, String(r.doc && r.doc.updatedAt));
  check("marcar: o documento de antes não muda", Object.keys(treinar.marks).length === 0 && treinar.updatedAt === 1, JSON.stringify(treinar.marks));
  check("marcar: é um documento novo, não o mesmo objeto", r.doc !== treinar && r.doc.marks !== treinar.marks);
}

/* ---------- as marcas de antes ficam ---------- */
{
  const before = habit("h-a", "treinar", { marks: { "2026-10-15": true, [YESTERDAY]: true } });
  const r = markOn(before, TODAY, TODAY);
  check("marcar: as marcas de outros dias continuam", r.doc.marks["2026-10-15"] === true && r.doc.marks[YESTERDAY] === true && r.doc.marks[TODAY] === true, JSON.stringify(r.doc.marks));
  check("marcar: só entra um dia a mais", Object.keys(r.doc.marks).length === 3);
  check("marcar: as marcas de antes não são mexidas", sameJson(before.marks, { "2026-10-15": true, [YESTERDAY]: true }), JSON.stringify(before.marks));
}

/* ---------- já marcado: nada a gravar ---------- */
{
  const marked = habit("h-m", "treinar", { marks: { [TODAY]: true } });
  const r = markOn(marked, TODAY, TODAY);
  check("já marcado: avisa que já estava", r.already === true && !r.error, JSON.stringify(r));
  check("já marcado: devolve o mesmo objeto, sem nada a gravar", r.doc === marked);
  check("já marcado: as marcas não mudam", sameJson(r.doc.marks, { [TODAY]: true }) && r.doc.updatedAt === 1);
}

/* ---------- nunca desmarca ---------- */
{
  const once = markOn(treinar, TODAY, TODAY);
  const twice = markOn(once.doc, TODAY, TODAY);
  check("nunca desmarca: marcar duas vezes mantém a marca", twice.doc.marks[TODAY] === true, JSON.stringify(twice.doc.marks));
  check("nunca desmarca: a segunda vez diz que já estava", twice.already === true && once.already === false);
  const thrice = markOn(twice.doc, TODAY, TODAY);
  check("nunca desmarca: nem na terceira", thrice.doc.marks[TODAY] === true && thrice.already === true);
}

/* ---------- dia futuro ---------- */
{
  const r = markOn(treinar, TOMORROW, TODAY);
  check("dia futuro: devolve erro", typeof r.error === "string" && r.error.length > 0, JSON.stringify(r));
  check("dia futuro: sem doc para gravar", !r.doc, JSON.stringify(r));
  check("dia futuro: o hábito não ganha marca", !treinar.marks[TOMORROW]);
  const far = markOn(treinar, "2027-01-01", TODAY);
  check("dia futuro: vale para qualquer dia depois de hoje", !!far.error && !far.doc);
  const ok = markOn(treinar, TODAY, TODAY);
  check("dia futuro: hoje não é futuro", !ok.error && !!ok.doc);
}

/* ---------- ontem ---------- */
{
  const r = markOn(treinar, YESTERDAY, TODAY);
  check("ontem: marca ontem", r.doc && r.doc.marks[YESTERDAY] === true && r.already === false, JSON.stringify(r));
  check("ontem: não marca hoje junto", r.doc && !r.doc.marks[TODAY], JSON.stringify(r.doc && r.doc.marks));
  const old = markOn(treinar, "2026-01-05", TODAY);
  check("ontem: dia bem antigo também marca (a pessoa esqueceu)", old.doc && old.doc.marks["2026-01-05"] === true);
}

/* ---------- markOn é puro ---------- */
{
  const frozen = Object.freeze({ ...habit("h-f", "treinar", { marks: Object.freeze({ [YESTERDAY]: true }) }) });
  let threw = null;
  try { markOn(frozen, TODAY, TODAY); markOn(frozen, YESTERDAY, TODAY); markOn(frozen, TOMORROW, TODAY); } catch (e) { threw = e; }
  check("puro: não muta o hábito nem as marcas (congelados não quebram)", threw === null, String(threw));
}

/* ---------- achar pelo nome ---------- */
{
  const list = [treinar, ler];
  const a = findHabit(list, "Treinar");
  check("achar: 'Treinar' acha treinar, sem ligar para maiúscula", a && a.id === "h-treinar", JSON.stringify(a && a.name));
  const b = findHabit(list, "ler");
  check("achar: 'ler' acha 'ler 20 páginas', pelo começo do nome", b && b.id === "h-ler", JSON.stringify(b && b.name));
  check("achar: 'yoga' não existe", findHabit(list, "yoga") === null);
  check("achar: devolve o próprio hábito da lista", findHabit(list, "treinar") === treinar);
  check("achar: sem acento e com pontuação", findHabit(list, "  Treinar! ") === treinar);
  check("achar: a pessoa sem acento acha o nome com acento", findHabit([habit("h-p", "pílates")], "pilates").id === "h-p");
  check("achar: o nome com acento acha o termo com acento", findHabit([habit("h-p", "pilates")], "pílates").id === "h-p");
  check("achar: nome completo acha pelo exato", findHabit(list, "ler 20 páginas") === ler);
  check("achar: termo com espaços entre as palavras", findHabit(list, "ler 20") === ler);

  check("achar: termo vazio é null", findHabit(list, "") === null);
  check("achar: termo só de espaços é null", findHabit(list, "   ") === null);
  check("achar: termo só de pontuação é null", findHabit(list, "!!!") === null);
  check("achar: termo ausente é null", findHabit(list, undefined) === null && findHabit(list, null) === null);
  check("achar: lista vazia é null", findHabit([], "treinar") === null);

  /* só o começo conta, não o meio */
  check("achar: termo no meio do nome não vale", findHabit(list, "20") === null && findHabit(list, "paginas") === null);
  check("achar: termo maior que o nome não vale", findHabit(list, "treinar pesado") === null);

  /* primeiro o exato, depois o começo — a ordem da lista não decide */
  const longFirst = [habit("h-1", "ler 20 páginas"), habit("h-2", "ler")];
  check("achar: o nome exato vence o que só começa igual, mesmo vindo depois", findHabit(longFirst, "ler").id === "h-2", JSON.stringify(findHabit(longFirst, "ler")));
  const two = [habit("h-3", "treino de perna"), habit("h-4", "treino de braço")];
  check("achar: dois que começam igual, vale o primeiro da lista", findHabit(two, "treino").id === "h-3");
}

/* ---------- achar ignora arquivado ---------- */
{
  const old = habit("h-old", "yoga", { archived: true });
  check("arquivado: não é achado pelo nome exato", findHabit([treinar, old], "yoga") === null);
  check("arquivado: não é achado pelo começo do nome", findHabit([old], "yo") === null);
  const oldExact = habit("h-old2", "ler", { archived: true });
  check("arquivado: o ativo que começa igual vale no lugar do arquivado exato", findHabit([oldExact, ler], "ler") === ler);
  const back = habit("h-back", "yoga", { archived: false });
  check("arquivado: o ativo de mesmo nome é achado", findHabit([old, back], "yoga") === back);
  check("arquivado: só ele na lista dá null, e não esquece que existia", findHabit([old], "yoga") === null && old.archived === true);
}

/* ---------- hábito inexistente: criar e marcar ---------- */
{
  const d = habitDraft("yoga");
  check("rascunho: nome e todo dia", sameJson(d, { name: "yoga", schedule: { type: "daily" } }), JSON.stringify(d));
  check("rascunho: o nome é aparado", habitDraft("  yoga  ").name === "yoga");
  check("rascunho: o nome corta em 80", habitDraft("x".repeat(100)).name.length === 80);
  check("rascunho: sem o nome fica vazio, sem quebrar", habitDraft("").name === "" && habitDraft("").schedule.type === "daily");

  /* a caixa de novo hábito grava o doc normalizado; a marca de hoje entra em seguida */
  const created = normalize({ id: "h-yoga", ...d, createdAt: 5, updatedAt: 5 });
  const r = markOn(created, TODAY, TODAY);
  check("criar e marcar: o hábito novo nasce com a marca de hoje", r.doc && r.doc.marks[TODAY] === true && r.already === false, JSON.stringify(r));
  check("criar e marcar: é todo dia", r.doc && r.doc.schedule.type === "daily" && r.doc.name === "yoga");
  check("criar e marcar: a marca de ontem também vale", markOn(created, YESTERDAY, TODAY).doc.marks[YESTERDAY] === true);
  check("criar e marcar: no dia que não chegou, erro", !!markOn(created, TOMORROW, TODAY).error);
  check("criar e marcar: depois de criado, o findHabit acha", findHabit([treinar, r.doc], "Yoga") === r.doc);
}

/* ---------- desfazer ---------- */
{
  /* a marca: o aviso devolve o documento de antes, com as marcas de antes */
  const before = habit("h-u", "treinar", { marks: { [YESTERDAY]: true } });
  const snapshot = JSON.parse(JSON.stringify(before));
  const after = markOn(before, TODAY, TODAY).doc;
  const undo = undoHabit(before, after);
  check("desfazer: a marca devolve o hábito de antes", undo && undo.save && sameJson(undo.save, snapshot) && !("remove" in undo), JSON.stringify(undo));
  check("desfazer: as marcas voltam a ser as de antes", undo.save.marks[TODAY] === undefined && undo.save.marks[YESTERDAY] === true, JSON.stringify(undo.save.marks));
  check("desfazer: o hábito de antes não foi mexido pela marca", sameJson(before, snapshot));

  /* o criar e marcar: o hábito sai */
  const created = markOn(normalize({ id: "h-novo", ...habitDraft("yoga") }), TODAY, TODAY).doc;
  const undoNew = undoHabit(null, created);
  check("desfazer: criar e marcar manda apagar o id", sameJson(undoNew, { remove: "h-novo" }), JSON.stringify(undoNew));
  check("desfazer: undefined vale como hábito que não existia", undoHabit(undefined, created).remove === "h-novo");
  check("desfazer: remover não leva o save junto", !("save" in undoNew));
}

/* ---------- o estado do que foi lido ---------- */
{
  const list = [treinar, ler, habit("h-m", "meditar", { marks: { [TODAY]: true } }), habit("h-y", "yoga", { archived: true })];

  let s = habitStatus(list, { habit: "treinar", name: "treinei", date: TODAY }, TODAY);
  check("status: hábito que existe e não está marcado", s.habit === treinar && s.day === TODAY && s.already === false && !s.error, JSON.stringify(s));

  s = habitStatus(list, { habit: "meditar", name: "meditei", date: TODAY }, TODAY);
  check("status: hábito já marcado hoje", s.habit && s.habit.id === "h-m" && s.already === true && !s.error, JSON.stringify(s));

  s = habitStatus(list, { habit: "", name: "fiz yoga", date: TODAY }, TODAY);
  check("status: sem hábito de nome igual vira null (criar e marcar)", s.habit === null && s.already === false && s.day === TODAY, JSON.stringify(s));

  s = habitStatus(list, { habit: "", name: "yoga", date: TODAY }, TODAY);
  check("status: o arquivado não conta como existente", s.habit === null, JSON.stringify(s));

  s = habitStatus(list, { habit: "", name: "ler", date: "" }, TODAY);
  check("status: sem habit, acha pelo name; sem data, hoje", s.habit === ler && s.day === TODAY, JSON.stringify(s));

  s = habitStatus(list, { habit: "treinar", name: "outra coisa", date: TODAY }, TODAY);
  check("status: habit vale mais que name", s.habit === treinar, JSON.stringify(s));

  s = habitStatus(list, { habit: "treinar", name: "treinei", date: YESTERDAY }, TODAY);
  check("status: ontem, sem marca de ontem, não está marcado", s.day === YESTERDAY && s.already === false && !s.error, JSON.stringify(s));

  const withYesterday = [habit("h-t", "treinar", { marks: { [YESTERDAY]: true } })];
  s = habitStatus(withYesterday, { habit: "treinar", date: YESTERDAY }, TODAY);
  check("status: marcado ontem, já estava marcado ontem", s.already === true, JSON.stringify(s));
  s = habitStatus(withYesterday, { habit: "treinar", date: TODAY }, TODAY);
  check("status: marcado ontem não vale para hoje", s.already === false, JSON.stringify(s));

  s = habitStatus(list, { habit: "treinar", name: "treinei", date: TOMORROW }, TODAY);
  check("status: dia futuro dá erro", typeof s.error === "string" && s.error.length > 0 && s.day === TOMORROW, JSON.stringify(s));

  s = habitStatus(list, { habit: "treinar", name: "treinei", date: "amanhã" }, TODAY);
  check("status: data inválida cai em hoje, sem erro", s.day === TODAY && !s.error, JSON.stringify(s));
  s = habitStatus(list, { habit: "treinar", date: "2026-10-1" }, TODAY);
  check("status: data fora do formato AAAA-MM-DD cai em hoje", s.day === TODAY, JSON.stringify(s));
  s = habitStatus(list, { habit: "", name: "", date: TODAY }, TODAY);
  check("status: sem habit e sem name não acha nada", s.habit === null && s.already === false, JSON.stringify(s));
  s = habitStatus([], { habit: "treinar", date: TODAY }, TODAY);
  check("status: lista vazia não acha nada", s.habit === null);
}

/* ---------- a conversa: o tipo habit-mark ---------- */
{
  check("conversa: habit-mark grava na coleção habits", ACTION_COLLECTIONS["habit-mark"] === "habits", String(ACTION_COLLECTIONS["habit-mark"]));
  check("conversa: a pílula confirmada diz 'marcado'", ACTION_DONE["habit-mark"] === "marcado", String(ACTION_DONE["habit-mark"]));

  /* a tela da conversa abre a coleção `habits` SEM o normalize: o doc chega cru */
  const store = core.collection("habits");
  store.save({ id: "raw-treinar", name: "Treinar", createdAt: 1, updatedAt: 1 });
  store.save({ id: "raw-ler", name: "ler 20 páginas", marks: { [core.today()]: true }, createdAt: 1, updatedAt: 1 });
  store.save({ id: "raw-yoga", name: "yoga", archived: true, createdAt: 1, updatedAt: 1 });
  const hoje = core.today();
  const ontem = core.addDays(hoje, -1);
  const amanha = core.addDays(hoje, 1);
  const payload = { habit: "Treinar", name: "treinei", date: "" };
  const v = { habit: "Treinar", name: "treinei", date: "" };

  const r = buildDoc("habit-mark", payload, v, store);
  check("buildDoc: acha o hábito e devolve doc, não erro", !!r.doc && !r.error, JSON.stringify(r));
  check("buildDoc: o dia vazio é hoje", r.doc && r.doc.marks[hoje] === true, JSON.stringify(r.doc && r.doc.marks));
  check("buildDoc: é o mesmo hábito, e ainda não estava marcado", r.doc && r.doc.id === "raw-treinar" && r.already === false, JSON.stringify(r));
  check("buildDoc: o doc cru volta normalizado (tem schedule e marks)", r.doc && r.doc.schedule && r.doc.schedule.type === "daily" && typeof r.doc.marks === "object", JSON.stringify(r.doc));
  check("buildDoc: o carimbo de atualização é novo", r.doc && r.doc.updatedAt > 1);
  const stored = store.get("raw-treinar");
  check("buildDoc: não grava nada sozinho (quem grava é a caixa)", stored && !(stored.marks && stored.marks[hoje]) && stored.updatedAt === 1, JSON.stringify(stored));
  check("buildDoc: o desfazer volta o hábito de antes", (() => { const u = undoHabit(normalize(stored), r.doc); return u.save && !u.save.marks[hoje]; })());

  /* já marcado */
  const already = buildDoc("habit-mark", { habit: "ler 20 páginas", name: "li", date: "" }, { habit: "ler 20 páginas", name: "li", date: "" }, store);
  check("buildDoc: hábito já marcado hoje devolve already", already.already === true && !!already.doc && !already.error, JSON.stringify(already));
  check("buildDoc: já marcado não muda as marcas", already.doc && sameJson(already.doc.marks, { [hoje]: true }));

  /* ontem e dia dito */
  const yest = buildDoc("habit-mark", payload, { habit: "Treinar", name: "treinei", date: ontem }, store);
  check("buildDoc: ontem marca ontem", yest.doc && yest.doc.marks[ontem] === true && !yest.doc.marks[hoje] && yest.already === false, JSON.stringify(yest));
  const said = buildDoc("habit-mark", payload, { habit: "Treinar", name: "treinei", date: "2026-03-05" }, store);
  check("buildDoc: a data dita vale", said.doc && said.doc.marks["2026-03-05"] === true, JSON.stringify(said));

  /* dia futuro */
  const future = buildDoc("habit-mark", payload, { habit: "Treinar", name: "treinei", date: amanha }, store);
  check("buildDoc: dia futuro é erro, sem doc", typeof future.error === "string" && future.error.length > 0 && !future.doc, JSON.stringify(future));

  /* inexistente */
  const ghost = buildDoc("habit-mark", { habit: "", name: "fiz natação", date: "" }, { habit: "", name: "fiz natação", date: "" }, store);
  check("buildDoc: hábito que não existe é erro, sem doc", typeof ghost.error === "string" && ghost.error.length > 0 && !ghost.doc, JSON.stringify(ghost));
  const archived = buildDoc("habit-mark", { habit: "yoga", name: "yoga", date: "" }, { habit: "yoga", name: "yoga", date: "" }, store);
  check("buildDoc: hábito arquivado é erro, como se não existisse", !!archived.error && !archived.doc, JSON.stringify(archived));
  const empty = buildDoc("habit-mark", { habit: "", name: "", date: "" }, { habit: "", name: "", date: "" }, store);
  check("buildDoc: sem nenhum nome é erro", !!empty.error && !empty.doc, JSON.stringify(empty));

  /* de onde vem o nome: a caixa (v) primeiro, o payload da IA depois */
  const fromPayload = buildDoc("habit-mark", { habit: "treinar", name: "", date: "" }, { habit: "", name: "", date: "" }, store);
  check("buildDoc: com a caixa vazia, vale o que a IA propôs", fromPayload.doc && fromPayload.doc.id === "raw-treinar", JSON.stringify(fromPayload));
  const edited = buildDoc("habit-mark", { habit: "treinar", name: "treinei", date: "" }, { habit: "", name: "ler", date: "" }, store);
  check("buildDoc: o nome editado na caixa vale mais que o da proposta", edited.doc && edited.doc.id === "raw-ler", JSON.stringify(edited));
  const byName = buildDoc("habit-mark", { habit: "", name: "treinar", date: "" }, { habit: "", name: "treinar", date: "" }, store);
  check("buildDoc: sem habit, acha pelo name", byName.doc && byName.doc.id === "raw-treinar", JSON.stringify(byName));

  /* o doc cru sem nada além do nome também se marca */
  const bare = core.collection("habits-bare");
  bare.save({ id: "b1", name: "meditar" });
  const bareR = buildDoc("habit-mark", { habit: "meditar" }, { habit: "meditar", name: "", date: "" }, bare);
  check("buildDoc: doc cru sem marks nem schedule ainda marca", bareR.doc && bareR.doc.marks[hoje] === true && bareR.doc.schedule.type === "daily", JSON.stringify(bareR));
}

/* ---------- a linha da pílula ---------- */
{
  const hoje = core.today();
  check("prévia: hábito de hoje diz só o nome", previewOf("habit-mark", { habit: "treinar", name: "treinei", date: hoje }) === "treinar", previewOf("habit-mark", { habit: "treinar", name: "treinei", date: hoje }));
  check("prévia: sem data diz só o nome", previewOf("habit-mark", { habit: "treinar", name: "treinei", date: "" }) === "treinar");
  check("prévia: sem habit, o nome que a pessoa disse", previewOf("habit-mark", { habit: "", name: "yoga", date: "" }) === "yoga");
  check("prévia: de outro dia traz ' · dd/mm'", previewOf("habit-mark", { habit: "treinar", name: "treinei", date: "2020-03-05" }) === "treinar · 05/03", previewOf("habit-mark", { habit: "treinar", name: "treinei", date: "2020-03-05" }));
  check("prévia: de ontem traz o dia", previewOf("habit-mark", { habit: "treinar", name: "", date: core.addDays(hoje, -1) }).startsWith("treinar · "));
  check("prévia: sem payload não quebra", previewOf("habit-mark", undefined) !== undefined);
}

/* ---------- a origem e o dia do aviso ---------- */
{
  /* o hábito criado pela conversa é contado no D1 pela origem: o normalize não pode jogá-la fora */
  const fromChat = normalize({ id: "h-c", name: "yoga", origin: { type: "chat", hack: 1 }, createdAt: 1 });
  check("normalize: a origem na conversa fica", fromChat.origin && fromChat.origin.type === "chat" && !("hack" in fromChat.origin), JSON.stringify(fromChat.origin));
  check("normalize: sem origem, nenhum campo novo", !("origin" in normalize({ id: "h-m", name: "ler", createdAt: 1 })));
  check("o aviso diz hoje", markWhen(TODAY, TODAY) === "hoje");
  check("o aviso diz ontem", markWhen(core.addDays(TODAY, -1), TODAY) === "ontem");
  check("o aviso diz o dia, antes de ontem", markWhen("2026-10-05", TODAY) === "05/10");
}

/* ---- as contas do mês (ticket #14) ----
   a taxa do mês, a sequência e o "N por semana": as contas que a grade dos
   hábitos mostra e que o retrato do Merlin repete (portrait.js). se uma muda,
   as duas telas passam a discordar. o bloco tem escopo próprio: as constantes
   de dia (TODAY, YM) e de hábito (habit, marks) são só dele. */
{
  const { normalize, isExpected, monthStats, streakOf, weekProgress, monthDays } = await import("./habits-data.js");
  const { mondayOf, addDays } = await import("./core.js");

  /* sexta, 16/10/2026: o mês até hoje tem 16 dias (1 de outubro foi quinta) */
  const TODAY = "2026-10-16";
  const YM = "2026-10";
  const day = (n) => YM + "-" + String(n).padStart(2, "0");
  const marks = (days) => Object.fromEntries(days.map((d) => [d, true]));
  const habit = (o) => normalize({ id: "h", name: "x", ...o });
  const daily = (days) => habit({ schedule: { type: "daily" }, marks: marks(days) });

  /* ---- "como estão meus hábitos?": a taxa do mês ---- */
  {
    const h = daily([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(day));
    const s = monthStats(h, YM, TODAY);
    check("mês: 12 marcas em 16 dias dão 12/16 e 75%", s.done === 12 && s.expected === 16 && s.rate === 75, JSON.stringify(s));
    check("mês: o mês tem todos os seus dias", monthDays(YM).length === 31 && monthDays(YM)[0] === "2026-10-01" && monthDays("2026-02").length === 28);
    const empty = monthStats(daily([]), YM, TODAY);
    check("mês: sem marca, 0 de 16 e 0%", empty.done === 0 && empty.expected === 16 && empty.rate === 0, JSON.stringify(empty));
    const first = monthStats(daily([]), YM, "2026-10-01");
    check("mês: no dia 1 só esse dia é esperado", first.expected === 1, JSON.stringify(first));
    const before = monthStats(daily([]), "2026-11", TODAY);
    check("mês: mês que ainda não começou não espera nada, e a taxa é 0", before.expected === 0 && before.rate === 0, JSON.stringify(before));
    const past = monthStats(daily([]), "2026-09", TODAY);
    check("mês: mês que já passou conta inteiro", past.expected === 30, JSON.stringify(past));
  }

  /* ---- dias da semana: o sábado não conta, e a taxa não passa de 100% ---- */
  {
    /* seg a sex de 1 a 16/10: 12 dias esperados; mais uma marca no sábado 3 */
    const weekdays = [1, 2, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16].map(day);
    const h = habit({ schedule: { type: "weekdays", weekdays: [1, 2, 3, 4, 5] }, marks: marks([...weekdays, day(3)]) });
    const s = monthStats(h, YM, TODAY);
    check("dias da semana: o sábado não conta", s.done === 12 && s.expected === 12, JSON.stringify(s));
    check("dias da semana: a taxa não passa de 100%", s.rate === 100, JSON.stringify(s));
    check("dias da semana: sábado não é esperado, sexta é", !isExpected(h, day(3)) && isExpected(h, day(2)));
    const onlySat = habit({ schedule: { type: "weekdays", weekdays: [1, 2, 3, 4, 5] }, marks: marks([day(3), day(4), day(10), day(11)]) });
    check("dias da semana: só marca de fim de semana não vira feito", monthStats(onlySat, YM, TODAY).done === 0);
  }

  /* ---- N por semana ---- */
  {
    const h = habit({ schedule: { type: "perWeek", times: 3 }, marks: marks([day(12), day(14)]) });
    const w = weekProgress(h, TODAY);
    check("N por semana: 2 marcas na semana de 3 dão 2 de 3", w.done === 2 && w.goal === 3, JSON.stringify(w));
    check("N por semana: nenhum dia é esperado", monthDays(YM).every((d) => !isExpected(h, d)));
    const over = habit({ schedule: { type: "perWeek", times: 2 }, marks: marks([day(12), day(13), day(14), day(15)]) });
    check("N por semana: passar da meta fica na meta", weekProgress(over, TODAY).done === 2);
    const s = monthStats(over, YM, TODAY);
    check("N por semana: o feito é no máximo N por semana", s.done === 2 && s.rate <= 100, JSON.stringify(s));
    const lastWeek = habit({ schedule: { type: "perWeek", times: 3 }, marks: marks([day(9), day(11)]) });
    check("N por semana: a semana anterior não entra na conta", weekProgress(lastWeek, TODAY).done === 0);
    /* 1 a 4/10 é uma semana de 4 dias dentro do mês: a meta dela é min(3, 4) */
    const cut = monthStats(habit({ schedule: { type: "perWeek", times: 3 }, marks: marks([day(1), day(2), day(3)]) }), YM, "2026-10-04");
    check("N por semana: a meta da semana cortada é a dos dias que existem", cut.expected === 3 && cut.done === 3 && cut.rate === 100, JSON.stringify(cut));
    const short = monthStats(habit({ schedule: { type: "perWeek", times: 5 }, marks: marks([day(1)]) }), YM, "2026-10-02");
    check("N por semana: com 2 dias passados, a meta é 2", short.expected === 2 && short.done === 1, JSON.stringify(short));
  }

  /* ---- sequência ---- */
  {
    const four = daily([12, 13, 14, 15].map(day));
    check("sequência: 4 dias esperados seguidos e hoje ainda não dão 4", streakOf(four, TODAY) === 4, String(streakOf(four, TODAY)));
    check("sequência: hoje marcado entra na conta", streakOf(daily([12, 13, 14, 15, 16].map(day)), TODAY) === 5);
    check("sequência: um dia sem marca quebra", streakOf(daily([12, 14, 15].map(day)), TODAY) === 2);
    check("sequência: ontem sem marca zera", streakOf(daily([13, 14].map(day)), TODAY) === 0);
    /* a segunda 12/10 segue a sexta 9/10: o fim de semana não é esperado e não quebra */
    const wk = habit({ schedule: { type: "weekdays", weekdays: [1, 2, 3, 4, 5] }, marks: marks([8, 9, 12, 13].map(day)) });
    check("sequência: dia não esperado não quebra a conta", streakOf(wk, "2026-10-14") === 4, String(streakOf(wk, "2026-10-14")));
    /* N por semana: semanas seguidas que bateram a meta; a atual só se já bateu */
    const pw = habit({ schedule: { type: "perWeek", times: 2 }, marks: marks([day(5), day(7), day(12)]) });
    check("sequência: N por semana conta semanas, e a atual só se já bateu", streakOf(pw, TODAY) === 1, String(streakOf(pw, TODAY)));
    const pw2 = habit({ schedule: { type: "perWeek", times: 2 }, marks: marks([day(5), day(7), day(12), day(14)]) });
    check("sequência: N por semana com a atual batida soma a atual", streakOf(pw2, TODAY) === 2, String(streakOf(pw2, TODAY)));
  }

  /* ---- funções movidas: as mesmas marcas de antes dão os mesmos números ----
     as cópias abaixo são a conta que morava em habits.jsx (src/habits.jsx:81-126),
     palavra por palavra, só com `t` no lugar do today() */
  {
    const t = TODAY;
    const legacyStats = (h, ym) => {
      const days = monthDays(ym).filter((d) => d <= t);
      let done = 0, expected = 0;
      if (h.schedule.type === "perWeek") {
        const weeks = new Map();
        days.forEach((d) => {
          const k = mondayOf(d);
          const w = weeks.get(k) || { n: 0, marks: 0 };
          w.n++; if (h.marks[d]) w.marks++;
          weeks.set(k, w);
        });
        weeks.forEach((w) => {
          const goal = Math.min(h.schedule.times, w.n);
          expected += goal;
          done += Math.min(goal, w.marks);
        });
      } else {
        const due = days.filter((d) => isExpected(h, d));
        expected = due.length;
        done = due.filter((d) => h.marks[d]).length;
      }
      return { done, expected, rate: expected ? Math.round((done / expected) * 100) : 0 };
    };
    const legacyStreak = (h) => {
      if (h.schedule.type === "perWeek") {
        const weekCount = (mon) => { let c = 0; for (let i = 0; i < 7; i++) if (h.marks[addDays(mon, i)]) c++; return c; };
        let n = 0, monday = mondayOf(t);
        if (weekCount(monday) >= h.schedule.times) n++;
        monday = addDays(monday, -7);
        while (n < 520 && weekCount(monday) >= h.schedule.times) { n++; monday = addDays(monday, -7); }
        return n;
      }
      let n = 0, d = h.marks[t] ? t : addDays(t, -1);
      for (let guard = 0; guard < 3000; guard++) {
        if (!isExpected(h, d)) { d = addDays(d, -1); continue; }
        if (!h.marks[d]) break;
        n++; d = addDays(d, -1);
      }
      return n;
    };
    /* uma semente fixa: o mesmo teste dá o mesmo resultado em toda máquina */
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const days = Array.from({ length: 16 }, (_, i) => day(i + 1));
    const schedules = [
      { type: "daily" }, { type: "weekdays", weekdays: [1, 3, 5] }, { type: "weekdays", weekdays: [1, 2, 3, 4, 5] },
      { type: "perWeek", times: 3 }, { type: "perWeek", times: 1 }, { type: "perWeek", times: 7 }
    ];
    let same = 0, total = 0, diff = "";
    for (const schedule of schedules) {
      for (let k = 0; k < 40; k++) {
        const h = habit({ schedule, marks: marks(days.filter(() => rnd() < 0.2 + 0.7 * (k / 40))) });
        total++;
        const a = legacyStats(h, YM), b = monthStats(h, YM, t);
        if (JSON.stringify(a) === JSON.stringify(b) && legacyStreak(h) === streakOf(h, t)) same++;
        else if (!diff) diff = JSON.stringify({ schedule, marks: h.marks, a, b, sa: legacyStreak(h), sb: streakOf(h, t) });
      }
    }
    check("funções movidas: " + total + " hábitos com marcas sorteadas dão os mesmos números de antes", same === total, diff);
    const full = monthStats(habit({ schedule: { type: "daily" }, marks: marks(days) }), YM, t);
    check("funções movidas: a taxa nunca passa de 100%", full.rate === 100 && full.done === full.expected);
  }
}

console.log("\n" + passed + " passaram, " + failures.length + " falharam");
if (failures.length) { console.log("\nFALHAS:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
process.exit(0);
