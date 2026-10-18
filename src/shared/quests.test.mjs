/* testa "o que falta hoje?" (a secretária, D3 e D6): a lista de coisas do
 * momento (`questsOf`), o cursor que pula (`nextQuest`), as ações que gravam e
 * sabem desfazer (`moveTask`, `dropTask`, `doneTask`), as sessões de foco
 * (`startSession`, `stopSession`) e o pedido local (`askIntent`).
 *
 * a regra que mais pesa aqui: a lista é uma conta só, e ler nunca grava. o
 * "agora não" é um cursor em memória da tela, e por isso `questsOf` e
 * `nextQuest` rodam sobre uma coleção-espiã que conta os `save`.
 *
 * quests.js importa tasks.js e core.js, que são módulos de navegador: o teste
 * monta o navegador de mentira de test.mjs ANTES do import (por isso o
 * `await import` dinâmico). as datas são relativas a hoje, e o relógio de cada
 * caso é um Date de hoje com a hora do cenário.
 */

let passed = 0;
const failures = [];
const check = (name, cond, detail) => { if (cond) passed++; else failures.push(name + (detail ? " -> " + detail : "")); };

/* ---- o navegador de mentira ---- */

function makeStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); }
  };
}

const noop = () => {};
const classList = { add: noop, remove: noop, contains: () => false, toggle: () => false };
globalThis.localStorage = makeStorage();
globalThis.document = { documentElement: { classList }, addEventListener: noop, hidden: false, querySelector: () => null };
globalThis.window = { addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }) };
globalThis.location = { reload: noop };
/* nada aqui faz rede: um fetch que roda sem querer não prova nada */
globalThis.fetch = async (url) => { throw new Error("fetch não previsto no teste: " + url); };

const { today, addDays } = await import("./core.js");
const { normalize, tasks, askIntent } = await import("./tasks.js");
const { runningOf, startSession, stopSession } = await import("./focus.js");
const { questsOf, nextQuest, countLine, moveTask, dropTask, doneTask, SOON, DAY_HREF, SOURCES } = await import("./quests.js");

/* ---- os ingredientes ---- */

const TODAY = today();
const TOMORROW = addDays(TODAY, 1);
const YESTERDAY = addDays(TODAY, -1);
const D4 = addDays(TODAY, -4); /* "14/10" */
const D2 = addDays(TODAY, -2); /* "16/10" */
const D3 = addDays(TODAY, -3);

const [Y, M, D] = TODAY.split("-").map(Number);
const at = (h, m = 0) => new Date(Y, M - 1, D, h, m);
const clock = (h, m = 0) => h * 60 + m;

let seq = 0;
/* uma tarefa já normalizada, como o rastreador a entrega a questsOf */
const task = (over = {}) => normalize({ id: "t" + (++seq), title: "tarefa " + seq, date: TODAY, createdAt: 1000 + seq, ...over });
const ids = (list) => list.map((q) => q.id);

const quests = (data, now) => questsOf({ sessions: [], blocks: [], ...data }, now || at(9, 0));

/* uma coleção-espiã: lê de verdade, e conta quem tentou gravar */
function spyOf(list) {
  const spy = { saves: 0, removes: 0, all: () => list, get: (id) => list.find((t) => t.id === id) || null, save() { spy.saves++; }, remove() { spy.removes++; } };
  return spy;
}

/* ---- a lista de fontes é o ponto de composição ---- */
{
  check("SOON são 30 minutos", SOON === 30, String(SOON));
  check("o link do dia abre o calendário no dia", DAY_HREF === "calendar.html#day", String(DAY_HREF));
  check("SOURCES é uma lista de fontes com chave e grupo", Array.isArray(SOURCES) && SOURCES.length >= 2 && SOURCES.every((s) => s.key && (s.group === "now" || s.group === "behind") && typeof s.list === "function"), JSON.stringify((SOURCES || []).map((s) => s.key + ":" + s.group)));
  check("há fonte em agora e em para trás", SOURCES.some((s) => s.group === "now") && SOURCES.some((s) => s.group === "behind"));
}

/* ---- agora: a sessão rodando ---- */
{
  const landing = task({ title: "revisar a landing", min: 60 });
  const now = at(10, 0);
  const session = { id: "s1", task: landing.id, title: "revisar a landing", start: now.getTime() - 25 * 60000, end: null, planned: 60 };
  const q = quests({ tasks: [landing], sessions: [session] }, now);
  const first = q.now[0];
  check("sessão rodando: é o primeiro de agora", !!first && first.type === "session", JSON.stringify(first));
  check("sessão rodando: id, título e tarefa", !!first && first.id === "session:s1" && first.title === "revisar a landing" && first.task === landing.id, JSON.stringify(first));
  check("sessão rodando: o tempo corrido, em minutos", !!first && first.elapsed === 25, String(first && first.elapsed));
  check("sessão rodando: a duração planejada", !!first && first.min === 60, String(first && first.min));
  check("sessão rodando: carrega a própria sessão", !!first && first.session && first.session.id === "s1");

  const stopped = { ...session, end: now.getTime() - 60000 };
  const q2 = quests({ tasks: [landing], sessions: [stopped] }, now);
  check("sessão encerrada não é agora", q2.now.length === 0, JSON.stringify(q2.now));

  const q3 = questsOf({ tasks: [landing], sessions: [session] }, now.getTime());
  check("o relógio também pode ser epoch ms", q3.now[0] && q3.now[0].elapsed === 25, JSON.stringify(q3.now[0]));
}

/* ---- agora: o compromisso começa em até 30 minutos ---- */
{
  const call = task({ id: "call", title: "call com a Ana", at: clock(10), min: 60 });
  const q40 = quests({ tasks: [call] }, at(9, 40));
  const c = q40.now[0];
  check("9:40 com call às 10:00: a call é agora", !!c && c.type === "appointment" && c.id === "task:call", JSON.stringify(c));
  check("compromisso: título, horário e duração", !!c && c.title === "call com a Ana" && c.at === 600 && c.min === 60, JSON.stringify(c));
  check("compromisso que ainda não começou não está ao vivo", !!c && c.live === false, String(c && c.live));
  check("compromisso carrega a tarefa", !!c && c.task && c.task.id === "call");

  check("9:20 com call às 10:00: ainda não é agora", quests({ tasks: [call] }, at(9, 20)).now.length === 0);
  check("9:30 é o limite: a call já é agora", quests({ tasks: [call] }, at(9, 30)).now.length === 1);
  check("9:29 ainda não", quests({ tasks: [call] }, at(9, 29)).now.length === 0);
}

/* ---- agora: o compromisso em curso ---- */
{
  const call = task({ id: "call", title: "call com a Ana", at: clock(10), min: 60 });
  const q20 = quests({ tasks: [call] }, at(10, 20));
  check("10:20 com call das 10:00 às 11:00: está em agora", q20.now.length === 1 && q20.now[0].id === "task:call", JSON.stringify(q20.now));
  check("em curso: live", q20.now[0] && q20.now[0].live === true, String(q20.now[0] && q20.now[0].live));
  check("10:59 ainda está em curso", quests({ tasks: [call] }, at(10, 59)).now.length === 1);
  check("11:00 já acabou (o fim não conta)", quests({ tasks: [call] }, at(11, 0)).now.length === 0);
  check("11:05 não está mais em agora", quests({ tasks: [call] }, at(11, 5)).now.length === 0);

  /* sem duração, vale o palpite de 30 minutos (sem preferências salvas) */
  const quick = task({ id: "quick", at: clock(10), min: 0 });
  check("sem duração: 10:29 ainda está em curso", quests({ tasks: [quick] }, at(10, 29)).now.length === 1);
  check("sem duração: 10:30 já acabou", quests({ tasks: [quick] }, at(10, 30)).now.length === 0);
}

/* ---- agora: o que não é compromisso ---- */
{
  const now = at(9, 45);
  const lunch = task({ id: "lunch", title: "almoço", at: clock(10), min: 60, reserved: true });
  check("reserva de hoje com hora também é agora", quests({ tasks: [lunch] }, now).now.map((q) => q.id).join() === "task:lunch");

  const done = task({ id: "done", at: clock(10), min: 60, done: true });
  check("compromisso concluído não é agora", quests({ tasks: [done] }, now).now.length === 0);

  const tomorrow = task({ id: "tmr", at: clock(10), min: 60, date: TOMORROW });
  check("compromisso de amanhã não é agora", quests({ tasks: [tomorrow] }, now).now.length === 0);

  const noHour = task({ id: "free", at: null, min: 60 });
  check("tarefa de hoje sem horário não é agora", quests({ tasks: [noHour] }, now).now.length === 0);

  const yesterdayCall = task({ id: "yc", at: clock(10), min: 60, date: YESTERDAY });
  const q = quests({ tasks: [yesterdayCall] }, now);
  check("compromisso de ontem não é agora (e está para trás)", q.now.length === 0 && q.behind.length === 1);
}

/* ---- a sessão vem antes do compromisso ---- */
{
  const now = at(10, 20);
  const landing = task({ id: "landing", title: "revisar a landing", min: 60 });
  const call = task({ id: "call", title: "call com a Ana", at: clock(10), min: 60 });
  const session = { id: "s1", task: "landing", title: "revisar a landing", start: now.getTime() - 10 * 60000, end: null, planned: 60 };
  const q = quests({ tasks: [landing, call], sessions: [session] }, now);
  check("sessão e compromisso: a sessão vem primeiro", q.now.length === 2 && q.now[0].type === "session" && q.now[1].type === "appointment", JSON.stringify(ids(q.now)));

  /* a sessão da mesma tarefa do compromisso não o repete */
  const own = { id: "s2", task: "call", title: "call com a Ana", start: now.getTime() - 20 * 60000, end: null, planned: 60 };
  const q2 = quests({ tasks: [landing, call], sessions: [own] }, now);
  check("sessão da própria call: o compromisso não aparece de novo", q2.now.length === 1 && q2.now[0].type === "session", JSON.stringify(ids(q2.now)));

  /* vários compromissos, em ordem de horário, mesmo chegando fora de ordem */
  const late = task({ id: "late", title: "dentista", at: clock(10, 40), min: 30 });
  const early = task({ id: "early", title: "daily", at: clock(10, 15), min: 15 });
  const q3 = quests({ tasks: [late, call, early] }, now);
  check("vários compromissos vêm na ordem do horário", ids(q3.now).join() === "task:call,task:early,task:late", ids(q3.now).join());
}

/* ---- o que ficou para trás ---- */
{
  const a = task({ id: "a", title: "mais velha", date: D4 });
  const b = task({ id: "b", title: "mais nova", date: D2 });
  const q = quests({ tasks: [b, a] }, at(9, 0));
  check("para trás: 14/10 antes de 16/10", ids(q.behind).join() === "task:a,task:b", ids(q.behind).join());
  check("atrasada: tipo, título, data e tarefa", q.behind[0].type === "overdue" && q.behind[0].title === "mais velha" && q.behind[0].date === D4 && q.behind[0].task.id === "a", JSON.stringify(q.behind[0]));
  check("atrasada: a duração vem junto (zero quando não há)", q.behind[0].min === 0, String(q.behind[0].min));
  check("duas atrasadas ainda não viram grupo", q.behind.length === 2);
  check("só atrasadas: agora vem vazio", q.now.length === 0);

  const done = task({ id: "dn", date: D2, done: true });
  check("atrasada concluída não conta", quests({ tasks: [done] }).behind.length === 0);
  const todays = task({ id: "td", date: TODAY });
  check("tarefa de hoje sem horário não é atrasada", quests({ tasks: [todays] }).behind.length === 0);
}

/* ---- agrupar: mais de duas atrasadas viram um item ---- */
{
  const list = [
    task({ id: "c", date: D2, title: "c" }),
    task({ id: "a", date: D4, title: "a" }),
    task({ id: "b", date: D3, title: "b" })
  ];
  const q = quests({ tasks: list });
  check("3 atrasadas: um item só", q.behind.length === 1, String(q.behind.length));
  const g = q.behind[0];
  check("o grupo se chama \"3 atrasadas\"", g && g.type === "overdue-group" && g.title === "3 atrasadas" && g.id === "overdue-group", JSON.stringify(g && { type: g.type, title: g.title, id: g.id }));
  check("o grupo abre o dia no calendário", g && g.href === "calendar.html#day", String(g && g.href));
  check("o grupo sabe quantas são", g && g.count === 3, String(g && g.count));
  check("o grupo guarda as atrasadas, da mais antiga para a mais nova", g && g.items && g.items.map((x) => x.task.id).join() === "a,b,c", g && g.items && g.items.map((x) => x.id).join());
  check("o grupo conta como 3 em left", q.left === 3, String(q.left));

  const four = quests({ tasks: [...list, task({ id: "d", date: YESTERDAY })] });
  check("4 atrasadas: \"4 atrasadas\"", four.behind.length === 1 && four.behind[0].title === "4 atrasadas" && four.behind[0].count === 4, JSON.stringify(four.behind.map((x) => x.title)));

  /* o grupo vem depois do agora, e junto de um compromisso o left soma os dois */
  const call = task({ id: "call", at: clock(10), min: 60 });
  const mixed = quests({ tasks: [...list, call] }, at(9, 45));
  check("agora e grupo juntos: left soma o compromisso e as 3", mixed.now.length === 1 && mixed.behind.length === 1 && mixed.left === 4, String(mixed.left));
}

/* ---- a reserva não atrasa ---- */
{
  const lunch = task({ id: "lunch", title: "almoço", date: YESTERDAY, reserved: true, at: clock(12), min: 60 });
  const q = quests({ tasks: [lunch] });
  check("almoço reservado de ontem não está em para trás", q.behind.length === 0, JSON.stringify(ids(q.behind)));
  check("almoço reservado de ontem não está em agora", q.now.length === 0);
  check("almoço reservado de ontem não conta em left", q.left === 0, String(q.left));
}

/* ---- agora não: pular não grava ---- */
{
  const now = at(10, 20);
  const landing = task({ id: "landing", title: "revisar a landing", min: 60 });
  const session = { id: "s1", task: "landing", title: "revisar a landing", start: now.getTime() - 5 * 60000, end: null, planned: 60 };
  const old = task({ id: "old", title: "ligar para o contador", date: D4 });
  const newer = task({ id: "newer", title: "pagar o boleto", date: D2 });
  const spy = spyOf([landing, old, newer]);
  const state = questsOf({ tasks: spy.all(), sessions: [session] }, now);

  const first = nextQuest(state, new Set());
  check("sem pulos: a primeira é a de agora", first.quest && first.quest.id === "session:s1", JSON.stringify(first.quest && first.quest.id));
  check("sem pulos: a seguinte é a primeira atrasada", first.next === "ligar para o contador", JSON.stringify(first.next));

  const second = nextQuest(state, new Set(["session:s1"]));
  check("pulada a primeira: devolve a segunda", second.quest && second.quest.id === "task:old", JSON.stringify(second.quest && second.quest.id));
  check("pulada a primeira: a seguinte é a terceira", second.next === "pagar o boleto", JSON.stringify(second.next));

  const asArray = nextQuest(state, ["session:s1"]);
  check("os pulos também podem ser uma lista", asArray.quest && asArray.quest.id === "task:old");

  const last = nextQuest(state, new Set(["session:s1", "task:old"]));
  check("pulado quase tudo: sobra a última, sem seguinte", last.quest && last.quest.id === "task:newer" && last.next === "", JSON.stringify(last));

  const none = nextQuest(state, new Set(["session:s1", "task:old", "task:newer"]));
  check("tudo pulado: não há quest", none.quest === null, JSON.stringify(none.quest));
  check("tudo pulado: não há seguinte", none.next === "", JSON.stringify(none.next));

  check("pular não grava: nenhum save", spy.saves === 0, String(spy.saves));
  check("pular não apaga: nenhum remove", spy.removes === 0, String(spy.removes));
  check("pular não muda a lista", questsOf({ tasks: spy.all(), sessions: [session] }, now).now.length === 1 && state.behind.length === 2);

  const empty = nextQuest(questsOf({ tasks: [], sessions: [] }, now), new Set());
  check("lista vazia: nada a mostrar", empty.quest === null && empty.next === "", JSON.stringify(empty));
}

/* ---- amanhã, largar e concluir: gravam, e desfazem ---- */
{
  const store = tasks();
  const other = store.save(task({ id: "tmr-first", title: "já estava amanhã", date: TOMORROW, order: 0 }));
  const late = store.save(task({ id: "late", title: "enviar a proposta", date: D4, min: 0 }));
  const behindOf = () => questsOf({ tasks: store.all(), sessions: [] }, at(9, 0)).behind.map((q) => q.id);
  check("antes de mover, a atrasada está em para trás", behindOf().join() === "task:late", behindOf().join());

  const undo = moveTask(store, store.get("late"), TOMORROW);
  const moved = store.get("late");
  check("amanhã: a tarefa vai para amanhã", moved && moved.date === TOMORROW, String(moved && moved.date));
  check("amanhã: sai de para trás", behindOf().length === 0, behindOf().join());
  check("amanhã: entra no topo da fila daquele dia", moved && moved.order < store.get("tmr-first").order, String(moved && moved.order));
  check("amanhã: devolve a função de desfazer", typeof undo === "function");
  await undo();
  check("o desfazer devolve a data antiga", store.get("late").date === D4, String(store.get("late").date));
  check("o desfazer devolve a atrasada a para trás", behindOf().join() === "task:late", behindOf().join());

  /* "hoje" cobra a duração quando ela é zero: moveTask recebe os minutos */
  const undoToday = moveTask(store, store.get("late"), TODAY, 30);
  check("hoje com duração: muda a data e a duração", store.get("late").date === TODAY && store.get("late").min === 30, JSON.stringify([store.get("late").date, store.get("late").min]));
  await undoToday();
  check("o desfazer de hoje devolve a data e a duração antigas", store.get("late").date === D4 && store.get("late").min === 0, JSON.stringify([store.get("late").date, store.get("late").min]));

  /* sem min, a duração não muda */
  store.save({ ...store.get("late"), min: 45 });
  moveTask(store, store.get("late"), D3);
  check("sem minutos, a duração fica como estava", store.get("late").date === D3 && store.get("late").min === 45, JSON.stringify([store.get("late").date, store.get("late").min]));
  store.save({ ...store.get("late"), date: D4, min: 0 });

  /* largar */
  const undoDrop = dropTask(store, store.get("late"));
  check("largar: apaga a tarefa", store.get("late") === null);
  check("largar: sai de para trás", behindOf().length === 0);
  check("largar: devolve o desfazer", typeof undoDrop === "function");
  await undoDrop();
  check("o desfazer de largar devolve a tarefa como era", store.get("late") && store.get("late").title === "enviar a proposta" && store.get("late").date === D4, JSON.stringify(store.get("late")));

  /* concluir */
  const undoDone = doneTask(store, store.get("late"));
  check("concluir: a tarefa fica concluída", store.get("late").done === true);
  check("concluir: sai de para trás", behindOf().length === 0);
  await undoDone();
  check("o desfazer de concluir reabre a tarefa", store.get("late").done === false);
  check("reaberta, volta a estar para trás", behindOf().join() === "task:late", behindOf().join());

  /* concluir uma de hoje sobe o `done` */
  const todays = store.save(task({ id: "todays", title: "de hoje" }));
  const before = questsOf({ tasks: store.all(), sessions: [] }, at(9, 0)).done;
  doneTask(store, store.get("todays"));
  const after = questsOf({ tasks: store.all(), sessions: [] }, at(9, 0)).done;
  check("concluir uma de hoje sobe a contagem de feitas", after === before + 1, before + " -> " + after);
}

/* ---- contagem ---- */
{
  const list = [
    task({ id: "x1", date: D4 }),
    task({ id: "x2", date: D2 }),
    task({ id: "d1", done: true }),
    task({ id: "d2", done: true }),
    task({ id: "d3", date: YESTERDAY, done: true }),
    task({ id: "d4", done: true, reserved: true, at: clock(12), min: 60 })
  ];
  const q = quests({ tasks: list });
  check("2 em aberto e 2 feitas hoje: \"faltam 2 · 2 feitas\"", countLine(q) === "faltam 2 · 2 feitas", countLine(q));
  check("feitas: só as de hoje, e reserva não é feita", q.done === 2, String(q.done));
  check("left conta agora e para trás", q.left === 2, String(q.left));

  const call = task({ id: "call", at: clock(10), min: 60 });
  const withNow = quests({ tasks: [...list, call] }, at(9, 45));
  check("left soma o que é agora", withNow.left === 3 && countLine(withNow) === "faltam 3 · 2 feitas", countLine(withNow));
}

/* ---- vazio ---- */
{
  const q = questsOf({ tasks: [], sessions: [] }, at(9, 0));
  check("vazio: agora e para trás vêm vazios", Array.isArray(q.now) && q.now.length === 0 && Array.isArray(q.behind) && q.behind.length === 0, JSON.stringify(q));
  check("vazio: nada feito e nada faltando", q.done === 0 && q.left === 0, JSON.stringify([q.done, q.left]));

  const onlyTomorrow = quests({ tasks: [task({ date: TOMORROW }), task({ date: TODAY })] });
  check("só o que é de amanhã e o que é de hoje sem hora: vazio", onlyTomorrow.now.length === 0 && onlyTomorrow.behind.length === 0 && onlyTomorrow.left === 0);

  let boom = null;
  try { questsOf({ tasks: [], sessions: [] }); } catch (e) { boom = e; }
  check("sem relógio, usa o de agora", boom === null, String(boom));
}

/* ---- ler nunca grava ---- */
{
  const spy = spyOf([task({ date: D4 }), task({ date: D3 }), task({ date: D2 }), task({ at: clock(10), min: 60 })]);
  questsOf({ tasks: spy.all(), sessions: [] }, at(9, 45));
  check("questsOf não grava", spy.saves === 0 && spy.removes === 0, JSON.stringify([spy.saves, spy.removes]));
}

/* ---- o pedido ---- */
{
  const asks = ["o que falta hoje?", "o que falta", "e agora?", "próxima", "O QUE FALTA HOJE?", "Próxima?", "  o que falta hoje  "];
  asks.forEach((text) => {
    const r = askIntent(text);
    check("pedido \"" + text.trim() + "\" abre o cartão", r && r.kind === "quests", JSON.stringify(r));
  });
  check("\"o que falta fazer no funil?\" continua sendo outra coisa", askIntent("o que falta fazer no funil?") === null, JSON.stringify(askIntent("o que falta fazer no funil?")));
  check("\"próxima reunião com a Ana\" não é o cartão", !(askIntent("próxima reunião com a Ana") || {}).kind, JSON.stringify(askIntent("próxima reunião com a Ana")));
  check("texto vazio não é pedido", askIntent("") === null);
}

/* ---- fechar o dia continua sendo fechar o dia ---- */
{
  check("\"fechar o dia\" continua close", JSON.stringify(askIntent("fechar o dia")) === JSON.stringify({ kind: "close" }), JSON.stringify(askIntent("fechar o dia")));
  check("\"Fechar o dia.\" também", (askIntent("Fechar o dia.") || {}).kind === "close");
  check("\"revisar a semana\" continua review", (askIntent("revisar a semana") || {}).kind === "review");
}

/* ---- foco: começar com outra rodando ---- */
{
  const docs = [];
  const sessions = {
    all: () => docs.slice(),
    save(doc) { const i = docs.findIndex((d) => d.id === doc.id); if (i >= 0) docs[i] = doc; else docs.push(doc); return doc; }
  };
  const t0 = at(9, 0).getTime();
  const t1 = at(9, 30).getTime();
  const first = startSession(sessions, { id: "t1", title: "revisar a landing", min: 60 }, t0);
  check("começar: grava a sessão como rodando", first && first.task === "t1" && first.title === "revisar a landing" && first.start === t0 && !first.end && first.planned === 60, JSON.stringify(first));
  check("começar: ela é a rodando", runningOf(sessions.all()).id === first.id);

  const second = startSession(sessions, { id: "t2", title: "ligar para o contador", min: 15 }, t1);
  const all = sessions.all();
  const old = all.find((s) => s.id === first.id);
  check("começar outra: a anterior ganha end", old && Number.isFinite(old.end) && old.end >= old.start, JSON.stringify(old));
  check("começar outra: a anterior encerra quando a nova começa", old && old.end === t1, String(old && old.end));
  check("começar outra: a nova é a rodando", runningOf(all).id === second.id && second.task === "t2" && second.planned === 15, JSON.stringify(second));
  check("começar outra: só há uma sem end", all.filter((s) => !s.end).length === 1, String(all.filter((s) => !s.end).length));
  check("começar outra: as duas continuam gravadas", all.length === 2);
  check("a sessão nova não herda o id da anterior", first.id !== second.id);

  const stopped = stopSession(sessions, at(9, 50).getTime());
  check("parar: devolve a sessão encerrada", stopped && stopped.id === second.id && stopped.end === at(9, 50).getTime(), JSON.stringify(stopped));
  check("parar: ninguém fica rodando", runningOf(sessions.all()) === null);
  check("parar sem nada rodando: devolve null", stopSession(sessions) === null);

  /* começar sem nenhuma rodando não inventa um end */
  const third = startSession(sessions, { id: "t3", title: "x", min: 0 }, at(10, 0).getTime());
  check("começar sem outra rodando: nasce sem end e sem duração planejada", third && !third.end && third.planned === 0, JSON.stringify(third));
}

console.log("\n" + passed + " passaram, " + failures.length + " falharam");
if (failures.length) { console.log("\nFALHAS:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
