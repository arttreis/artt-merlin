/* testa o treino (ticket #64): as contas puras da página training.html e do verbo
 * "treinei perna 40min". o navegador de mentira sobe antes do import porque o
 * workouts-data importa o core e o habits-data, que são módulos de navegador. */

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

const W = await import("./workouts-data.js");
const H = await import("./habits-data.js");
const { WORKOUT_MAX, TITLE_MAX, WORKOUT_MODELS, normalize, readMinutes, workoutDay, workoutLine, weekWorkouts, weekTotal, trainingHabit, workoutDoc, logWorkout, applyWorkout } = W;

const TODAY = "2026-10-20";   /* uma terça */
const MONDAY = "2026-10-19";
const FUTURE = "esse dia ainda não chegou";
const ASK_MIN = "quantos minutos você treinou?";

const workout = (id, day, min, extra) => ({ id, day, title: "perna", min, createdAt: 1, updatedAt: 1, ...extra });
/* os hábitos passam pelo normalize de verdade (têm marks e archived) */
const habit = (id, name, extra) => H.normalize({ id, name, ...extra });

/* uma coleção de mentira, em memória, com a mesma forma de collection(): get, save, remove */
function fakeStore(initial) {
  const m = new Map((initial || []).map((d) => [d.id, d]));
  const calls = { save: 0, remove: 0 };
  return {
    calls,
    get: (id) => m.get(id),
    save: (d) => { calls.save++; m.set(d.id, d); },
    remove: (id) => { calls.remove++; m.delete(id); },
    list: () => [...m.values()]
  };
}

/* ---- as constantes ---- */
{
  check("o teto é de 600 minutos", WORKOUT_MAX === 600, String(WORKOUT_MAX));
  check("o título vai até 60 caracteres", TITLE_MAX === 60, String(TITLE_MAX));
  check("os modelos, na ordem: musculação 60, corrida 30, caminhada 40, bicicleta 45, yoga 30, funcional 45",
    WORKOUT_MODELS.map((m) => m.name + " " + m.min).join() === "musculação 60,corrida 30,caminhada 40,bicicleta 45,yoga 30,funcional 45", JSON.stringify(WORKOUT_MODELS));
  check("cada modelo tem id igual ao nome", WORKOUT_MODELS.every((m) => m.id === m.name), JSON.stringify(WORKOUT_MODELS));
}

/* ---- normalize ---- */
{
  const a = normalize({ id: "w1", day: "2026-10-20", title: "perna", min: 40, createdAt: 5, updatedAt: 6 });
  check("normalize: guarda o que veio, com as chaves do documento", a.id === "w1" && a.day === "2026-10-20" && a.title === "perna" && a.min === 40 && a.createdAt === 5 && a.updatedAt === 6, JSON.stringify(a));
  check("normalize: o id vira texto", normalize({ id: 7, day: TODAY, min: 10 }).id === "7");
  check("normalize: dia inválido vira vazio", normalize({ id: "w", day: "ontem", min: 10 }).day === "" && normalize({ id: "w", day: "2026-10-1", min: 10 }).day === "" && normalize({ id: "w", min: 10 }).day === "");
  check("normalize: o título perde os espaços das pontas", normalize({ id: "w", day: TODAY, title: "  corrida  ", min: 10 }).title === "corrida");
  check("normalize: o título é cortado em 60", normalize({ id: "w", day: TODAY, title: "x".repeat(200), min: 10 }).title.length === 60);
  check("normalize: sem título é texto vazio", normalize({ id: "w", day: TODAY, min: 10 }).title === "");
  check("normalize: min inválido vira 0", normalize({ id: "w", day: TODAY, min: NaN }).min === 0 && normalize({ id: "w", day: TODAY }).min === 0 && normalize({ id: "w", day: TODAY, min: "abc" }).min === 0);
  check("normalize: min negativo vira 0", normalize({ id: "w", day: TODAY, min: -5 }).min === 0);
  check("normalize: min acima do teto vira 600", normalize({ id: "w", day: TODAY, min: 9999 }).min === 600);
  check("normalize: min vira inteiro", Number.isInteger(normalize({ id: "w", day: TODAY, min: 40.6 }).min));
  const c = normalize({ id: "w", day: TODAY, min: 40 });
  check("normalize: sem datas, createdAt e updatedAt vêm preenchidos", typeof c.createdAt === "number" && typeof c.updatedAt === "number", JSON.stringify(c));
}

/* ---- readMinutes: o que a pessoa escreveu ---- */
{
  const cases = [["40", 40], ["40min", 40], ["40 min", 40], ["1h", 60], ["1h30", 90], ["1h 30min", 90], ["1,5h", 90], ["1.5h", 90], ["", 0], ["muito", 0]];
  for (const [text, want] of cases) check("readMinutes: '" + text + "' -> " + want, readMinutes(text) === want, String(readMinutes(text)));
  check("readMinutes: acima de 600 vira 600", readMinutes("9999") === 600 && readMinutes("20h") === 600, readMinutes("9999") + " " + readMinutes("20h"));
  check("readMinutes: indefinido não quebra", readMinutes(undefined) === 0 && readMinutes(null) === 0);
}

/* ---- workoutDay: o dia do treino ---- */
{
  check("workoutDay: sem data é hoje", workoutDay({}, TODAY).day === TODAY && !workoutDay({}, TODAY).error, JSON.stringify(workoutDay({}, TODAY)));
  check("workoutDay: date passada vale", workoutDay({ date: "2026-10-19" }, TODAY).day === "2026-10-19" && !workoutDay({ date: "2026-10-19" }, TODAY).error);
  check("workoutDay: day também vale", workoutDay({ day: "2026-10-18" }, TODAY).day === "2026-10-18" && !workoutDay({ day: "2026-10-18" }, TODAY).error);
  check("workoutDay: hoje explícito vale", workoutDay({ date: TODAY }, TODAY).day === TODAY && !workoutDay({ date: TODAY }, TODAY).error);
  check("workoutDay: data inválida cai em hoje", workoutDay({ date: "ontem" }, TODAY).day === TODAY && workoutDay({ date: "2026-10-1" }, TODAY).day === TODAY);
  const f = workoutDay({ date: "2026-10-21" }, TODAY);
  check("workoutDay: amanhã é erro 'esse dia ainda não chegou'", f.error === FUTURE, JSON.stringify(f));
  check("workoutDay: no erro o dia também vem", f.day === "2026-10-21", JSON.stringify(f));
  check("workoutDay: spec ausente não quebra", workoutDay(undefined, TODAY).day === TODAY);
}

/* ---- workoutLine: a linha do cartão e da pílula ---- */
{
  check("workoutLine: hoje não leva a data", workoutLine({ day: TODAY, title: "perna", min: 40 }, TODAY, "") === "perna · 40 min", workoutLine({ day: TODAY, title: "perna", min: 40 }, TODAY, ""));
  check("workoutLine: sem o terceiro argumento também", workoutLine({ day: TODAY, title: "perna", min: 40 }, TODAY) === "perna · 40 min");
  check("workoutLine: com hábito marcado", workoutLine({ day: TODAY, title: "perna", min: 40 }, TODAY, "treinar") === "perna · 40 min · hábito treinar marcado", workoutLine({ day: TODAY, title: "perna", min: 40 }, TODAY, "treinar"));
  check("workoutLine: outro dia leva a data no fim", workoutLine({ day: "2026-10-19", title: "perna", min: 40 }, TODAY, "") === "perna · 40 min · 19/10", workoutLine({ day: "2026-10-19", title: "perna", min: 40 }, TODAY, ""));
  check("workoutLine: hábito marcado e outro dia: a data vai depois do hábito", workoutLine({ day: "2026-10-19", title: "perna", min: 40 }, TODAY, "treinar") === "perna · 40 min · hábito treinar marcado · 19/10", workoutLine({ day: "2026-10-19", title: "perna", min: 40 }, TODAY, "treinar"));
}

/* ---- weekWorkouts: sete dias, de segunda a domingo ---- */
{
  const docs = [
    workout("a", "2026-10-19", 40, { title: "perna", createdAt: 10 }),
    workout("b", "2026-10-19", 30, { title: "corrida", createdAt: 20 }),
    workout("c", "2026-10-21", 60, { title: "costas", createdAt: 5 }),
    workout("d", "2026-10-25", 45, { title: "bicicleta", createdAt: 5 }),
    workout("e", "2026-10-18", 99),   /* domingo da semana anterior */
    workout("f", "2026-10-26", 88)    /* segunda da semana seguinte */
  ];
  const w = weekWorkouts(docs, MONDAY);
  check("weekWorkouts: sete dias", w.length === 7, String(w.length));
  check("weekWorkouts: de segunda a domingo, em ordem", w.map((x) => x.day).join() === "2026-10-19,2026-10-20,2026-10-21,2026-10-22,2026-10-23,2026-10-24,2026-10-25", w.map((x) => x.day).join());
  check("weekWorkouts: dois treinos do mesmo dia se agrupam", w[0].items.length === 2 && w[0].items.map((x) => x.id).sort().join() === "a,b", JSON.stringify(w[0]));
  check("weekWorkouts: o min do dia é a soma", w[0].min === 70 && w[2].min === 60 && w[6].min === 45, w.map((x) => x.min).join());
  check("weekWorkouts: dentro do dia, em ordem de createdAt", w[0].items[0].id === "a" && w[0].items[1].id === "b", w[0].items.map((x) => x.id).join());
  const inv = weekWorkouts([workout("a", "2026-10-19", 40, { createdAt: 50 }), workout("b", "2026-10-19", 30, { createdAt: 10 })], MONDAY);
  check("weekWorkouts: a ordem é a do createdAt, não a da lista", inv[0].items.map((x) => x.id).join() === "b,a", inv[0].items.map((x) => x.id).join());
  check("weekWorkouts: dia sem treino tem items vazio e min 0", w[1].items.length === 0 && w[1].min === 0 && w[3].items.length === 0, JSON.stringify(w[1]));
  check("weekWorkouts: treino de outra semana não entra", !w.some((x) => x.items.some((i) => i.id === "e" || i.id === "f")) && w.reduce((s, x) => s + x.min, 0) === 175);
  const w2 = weekWorkouts([workout("a", "2026-10-20", 40, { deleted: true }), workout("b", "2026-10-21", 0), workout("c", "2026-10-22", 30), { day: "2026-10-23", title: "sem id", min: 20 }], MONDAY);
  check("weekWorkouts: documento apagado (lápide) não conta", w2[1].items.length === 0 && w2[1].min === 0, JSON.stringify(w2[1]));
  check("weekWorkouts: treino com min 0 não conta", w2[2].items.length === 0 && w2[2].min === 0, JSON.stringify(w2[2]));
  check("weekWorkouts: treino vivo conta", w2[3].items.length === 1 && w2[3].min === 30);
  check("weekWorkouts: documento sem id não conta", w2[4].items.length === 0 && w2[4].min === 0, JSON.stringify(w2[4]));
  check("weekWorkouts: sem a lista, não quebra", weekWorkouts(undefined, MONDAY).length === 7 && weekWorkouts(undefined, MONDAY).every((x) => x.items.length === 0 && x.min === 0));
  check("weekWorkouts: a virada de mês (26 out a 1 nov)", weekWorkouts([], "2026-10-26").map((x) => x.day).join() === "2026-10-26,2026-10-27,2026-10-28,2026-10-29,2026-10-30,2026-10-31,2026-11-01");
}

/* ---- weekTotal ---- */
{
  const docs = [
    workout("a", "2026-10-19", 40),
    workout("b", "2026-10-19", 30),
    workout("c", "2026-10-25", 60),
    workout("d", "2026-10-18", 99),
    workout("e", "2026-10-26", 88),
    workout("f", "2026-10-20", 50, { deleted: true })
  ];
  check("weekTotal: soma os minutos vivos da semana", weekTotal(docs, MONDAY) === 130, String(weekTotal(docs, MONDAY)));
  check("weekTotal: semana sem treino é 0", weekTotal([], MONDAY) === 0 && weekTotal(undefined, MONDAY) === 0);
}

/* ---- trainingHabit: o hábito de treino ---- */
{
  const lista = [habit("h1", "Treinar"), habit("h2", "ler")];
  const a = trainingHabit(lista, "");
  check("trainingHabit: ['Treinar', 'ler'] sem nome dito -> o Treinar", a && a.id === "h1" && a.name === "Treinar", JSON.stringify(a));
  check("trainingHabit: ['ler'] -> null", trainingHabit([habit("h2", "ler")], "") === null);
  check("trainingHabit: lista vazia ou ausente -> null", trainingHabit([], "") === null && trainingHabit(undefined, "") === null);
  const y = trainingHabit([habit("h1", "yoga"), habit("h2", "treinar")], "yoga");
  check("trainingHabit: o hábito citado vence o 'trein*'", y && y.id === "h1", JSON.stringify(y));
  const p = trainingHabit([habit("h1", "treinar"), habit("h2", "yoga")], "perna");
  check("trainingHabit: nome dito que não casa cai em 'trein*'", p && p.id === "h1", JSON.stringify(p));
  check("trainingHabit: hábito 'treinar' arquivado -> null", trainingHabit([habit("h1", "treinar", { archived: true })], "") === null);
  const arq = trainingHabit([habit("h1", "treinar", { archived: true }), habit("h2", "Treino da manhã")], "");
  check("trainingHabit: pula o arquivado e acha o próximo vivo", arq && arq.id === "h2", JSON.stringify(arq));
  const pri = trainingHabit([habit("h1", "ler"), habit("h2", "treino A"), habit("h3", "treinar")], "");
  check("trainingHabit: o primeiro vivo que começa com 'trein'", pri && pri.id === "h2", JSON.stringify(pri));
  const acento = trainingHabit([habit("h1", "  Treinar pesado")], "");
  check("trainingHabit: a comparação ignora maiúscula e espaço nas pontas", acento && acento.id === "h1", JSON.stringify(acento));
  check("trainingHabit: nome que só contém 'trein' no meio não casa", trainingHabit([habit("h1", "sem treinar")], "") === null);
}

/* ---- workoutDoc: o documento que o cartão e a pílula gravam ---- */
{
  const e1 = workoutDoc({ date: "2026-10-21", title: "perna", min: 40 }, null, TODAY);
  check("workoutDoc: dia futuro é erro", e1.error === FUTURE && !e1.doc, JSON.stringify(e1));
  const e2 = workoutDoc({ date: TODAY, title: "perna", min: 0 }, null, TODAY);
  check("workoutDoc: sem minutos pede os minutos", e2.error === ASK_MIN && !e2.doc, JSON.stringify(e2));
  check("workoutDoc: min ausente também pede os minutos", workoutDoc({ date: TODAY, title: "perna" }, null, TODAY).error === ASK_MIN);
  check("workoutDoc: min negativo também pede os minutos", workoutDoc({ date: TODAY, title: "perna", min: -10 }, null, TODAY).error === ASK_MIN);

  const t0 = Date.now();
  const ok = workoutDoc({ date: "2026-10-19", title: "perna", min: 40 }, null, TODAY);
  check("workoutDoc: devolve o doc com day, title e min", ok.doc && ok.doc.day === "2026-10-19" && ok.doc.title === "perna" && ok.doc.min === 40 && !ok.error, JSON.stringify(ok));
  check("workoutDoc: id novo, texto e não vazio", ok.doc && typeof ok.doc.id === "string" && ok.doc.id.length > 0, JSON.stringify(ok.doc));
  check("workoutDoc: dois treinos novos não repetem o id", workoutDoc({ title: "a", min: 10 }, null, TODAY).doc.id !== workoutDoc({ title: "a", min: 10 }, null, TODAY).doc.id);
  check("workoutDoc: sem treino de antes, createdAt e updatedAt são agora", ok.doc && ok.doc.createdAt >= t0 && ok.doc.updatedAt >= t0 && ok.doc.createdAt <= Date.now() + 5, JSON.stringify(ok.doc));
  check("workoutDoc: o doc só tem as chaves do documento", ok.doc && Object.keys(ok.doc).sort().join() === "createdAt,day,id,min,title,updatedAt", JSON.stringify(Object.keys(ok.doc || {})));
  check("workoutDoc: sem data é hoje", workoutDoc({ title: "perna", min: 40 }, null, TODAY).doc.day === TODAY);
  check("workoutDoc: day vale como date", workoutDoc({ day: "2026-10-18", title: "perna", min: 40 }, null, TODAY).doc.day === "2026-10-18");
  check("workoutDoc: título vazio vira 'treino'", workoutDoc({ date: TODAY, title: "", min: 30 }, null, TODAY).doc.title === "treino" && workoutDoc({ date: TODAY, title: "   ", min: 30 }, null, TODAY).doc.title === "treino" && workoutDoc({ date: TODAY, min: 30 }, null, TODAY).doc.title === "treino");
  check("workoutDoc: o título perde os espaços das pontas", workoutDoc({ date: TODAY, title: "  corrida  ", min: 30 }, null, TODAY).doc.title === "corrida");
  check("workoutDoc: título cortado em 60", workoutDoc({ date: TODAY, title: "x".repeat(200), min: 30 }, null, TODAY).doc.title.length === 60);
  check("workoutDoc: min acima do teto vira 600", workoutDoc({ date: TODAY, title: "maratona", min: 9999 }, null, TODAY).doc.min === 600);

  const before = workout("w-antigo", TODAY, 30, { createdAt: 111, updatedAt: 222 });
  const sub = workoutDoc({ date: TODAY, title: "peito", min: 50 }, before, TODAY);
  check("workoutDoc: corrigir mantém o id e o createdAt do treino de antes", sub.doc && sub.doc.id === "w-antigo" && sub.doc.createdAt === 111, JSON.stringify(sub));
  check("workoutDoc: corrigir troca os dados e renova o updatedAt", sub.doc && sub.doc.title === "peito" && sub.doc.min === 50 && sub.doc.updatedAt >= t0, JSON.stringify(sub));
}

/* ---- logWorkout: grava o treino e acha o hábito ---- */
{
  const SPEC = { date: TODAY, title: "perna", min: 40 };
  const e1 = logWorkout({ date: "2026-10-21", title: "perna", min: 40 }, [], TODAY);
  check("logWorkout: dia futuro devolve o erro", e1.error === FUTURE && !e1.doc, JSON.stringify(e1));
  const e2 = logWorkout({ date: TODAY, title: "perna", min: 0 }, [], TODAY);
  check("logWorkout: sem minutos devolve o erro", e2.error === ASK_MIN && !e2.doc, JSON.stringify(e2));

  /* sem hábito de treino: só o treino, e nada é criado */
  const lista0 = [habit("h2", "ler")];
  const semHab = logWorkout(SPEC, lista0, TODAY);
  check("logWorkout: sem hábito de treino, mark é null", semHab.mark === null && semHab.doc && !semHab.error, JSON.stringify(semHab));
  check("logWorkout: sem hábito de treino, a linha é só 'perna · 40 min'", semHab.line === "perna · 40 min", semHab.line);
  check("logWorkout: não cria hábito", lista0.length === 1 && semHab.mark === null);
  check("logWorkout: o doc do treino vem completo", semHab.doc.day === TODAY && semHab.doc.title === "perna" && semHab.doc.min === 40 && semHab.doc.id, JSON.stringify(semHab.doc));
  check("logWorkout: lista de hábitos vazia ou ausente também dá mark null", logWorkout(SPEC, [], TODAY).mark === null && logWorkout(SPEC, undefined, TODAY).mark === null);

  /* com hábito de treino */
  const treinar = habit("h1", "treinar");
  const com = logWorkout(SPEC, [treinar, habit("h2", "ler")], TODAY);
  check("logWorkout: com hábito de treino, mark leva o hábito, o nome e already false", com.mark && com.mark.name === "treinar" && com.mark.already === false && com.mark.habit && com.mark.habit.id === "h1", JSON.stringify(com.mark));
  check("logWorkout: o hábito vem marcado no dia do treino", com.mark.habit.marks[TODAY] === true, JSON.stringify(com.mark.habit.marks));
  check("logWorkout: o hábito de entrada não é alterado", !treinar.marks[TODAY], JSON.stringify(treinar.marks));
  check("logWorkout: a linha cita o hábito marcado", com.line === "perna · 40 min · hábito treinar marcado", com.line);

  /* o dia do treino é o dia da marca */
  const ontem = logWorkout({ date: "2026-10-19", title: "perna", min: 40 }, [habit("h1", "treinar")], TODAY);
  check("logWorkout: treino de ontem marca ontem, não hoje", ontem.mark && ontem.mark.habit.marks["2026-10-19"] === true && !ontem.mark.habit.marks[TODAY], JSON.stringify(ontem.mark && ontem.mark.habit.marks));
  check("logWorkout: treino de ontem leva a data no fim da linha", ontem.line === "perna · 40 min · hábito treinar marcado · 19/10", ontem.line);
  const ontemSem = logWorkout({ date: "2026-10-19", title: "perna", min: 40 }, [], TODAY);
  check("logWorkout: treino de ontem sem hábito: 'perna · 40 min · 19/10'", ontemSem.line === "perna · 40 min · 19/10", ontemSem.line);

  /* o hábito já marcado no dia */
  const marcado = habit("h1", "treinar", { marks: { [TODAY]: true } });
  const ja = logWorkout(SPEC, [marcado], TODAY);
  check("logWorkout: hábito já marcado no dia -> already true", ja.mark && ja.mark.already === true && ja.mark.name === "treinar", JSON.stringify(ja.mark));
  check("logWorkout: already: a linha não diz que marcou", ja.line === "perna · 40 min", ja.line);
  check("logWorkout: already: o hábito segue marcado no dia", ja.mark.habit.marks[TODAY] === true);

  /* qual hábito: o citado, o do título, ou o 'trein*' */
  const lista = [habit("h1", "treinar"), habit("h2", "yoga")];
  check("logWorkout: o título que casa com um hábito escolhe esse hábito", logWorkout({ date: TODAY, title: "yoga", min: 30 }, lista, TODAY).mark.habit.id === "h2");
  check("logWorkout: spec.habit escolhe o hábito", logWorkout({ date: TODAY, title: "perna", min: 30, habit: "yoga" }, lista, TODAY).mark.habit.id === "h2");
  check("logWorkout: título que não casa cai no hábito 'trein*'", logWorkout({ date: TODAY, title: "perna", min: 30 }, lista, TODAY).mark.habit.id === "h1");
  check("logWorkout: hábito 'treinar' arquivado não é marcado", logWorkout(SPEC, [habit("h1", "treinar", { archived: true })], TODAY).mark === null);
  check("logWorkout: título vazio vira 'treino' na linha", logWorkout({ date: TODAY, min: 30 }, [], TODAY).line === "treino · 30 min", logWorkout({ date: TODAY, min: 30 }, [], TODAY).line);
}

/* ---- applyWorkout: grava e devolve o desfazer ---- */
{
  const SPEC = { date: TODAY, title: "perna", min: 40 };

  /* grava o treino e a marca */
  {
    const workouts = fakeStore();
    const habits = fakeStore([habit("h1", "treinar")]);
    const res = logWorkout(SPEC, habits.list(), TODAY);
    const undo = applyWorkout(workouts, habits, res);
    check("applyWorkout: grava o treino", workouts.get(res.doc.id) && workouts.get(res.doc.id).title === "perna" && workouts.get(res.doc.id).min === 40, JSON.stringify(workouts.list()));
    check("applyWorkout: grava a marca no hábito", habits.get("h1").marks[TODAY] === true, JSON.stringify(habits.get("h1")));
    check("applyWorkout: devolve a função de desfazer", typeof undo === "function");

    /* desfazer sem already: apaga o treino e tira só a marca daquele dia */
    await undo();
    check("desfazer: apaga o treino", workouts.get(res.doc.id) === undefined && workouts.list().length === 0, JSON.stringify(workouts.list()));
    check("desfazer: tira a marca que o treino pôs", !habits.get("h1").marks[TODAY], JSON.stringify(habits.get("h1").marks));
    check("desfazer: o hábito continua existindo", !!habits.get("h1"));
  }

  /* o desfazer lê o hábito ATUAL: marcas feitas depois sobrevivem */
  {
    const workouts = fakeStore();
    const habits = fakeStore([habit("h1", "treinar", { marks: { "2026-10-15": true } })]);
    const res = logWorkout(SPEC, habits.list(), TODAY);
    const undo = applyWorkout(workouts, habits, res);
    /* depois do registro, a pessoa marca outro dia na grade dos hábitos */
    habits.save({ ...habits.get("h1"), marks: { ...habits.get("h1").marks, "2026-10-18": true } });
    await undo();
    const marks = habits.get("h1").marks;
    check("desfazer: preserva as marcas feitas antes e depois", marks["2026-10-15"] === true && marks["2026-10-18"] === true && !marks[TODAY], JSON.stringify(marks));
  }

  /* o desfazer não ressuscita um hábito apagado nem estoura */
  {
    const workouts = fakeStore();
    const habits = fakeStore([habit("h1", "treinar")]);
    const res = logWorkout(SPEC, habits.list(), TODAY);
    const undo = applyWorkout(workouts, habits, res);
    habits.remove("h1");
    let boom = null;
    try { await undo(); } catch (e) { boom = e; }
    check("desfazer: se o hábito sumiu no meio, não quebra e o treino é apagado", boom === null && workouts.list().length === 0 && habits.get("h1") === undefined, boom && String(boom));
  }

  /* hábito já marcado: o desfazer não desmarca */
  {
    const workouts = fakeStore();
    const habits = fakeStore([habit("h1", "treinar", { marks: { [TODAY]: true } })]);
    const res = logWorkout(SPEC, habits.list(), TODAY);
    check("cenário: o hábito já estava marcado -> already", res.mark && res.mark.already === true, JSON.stringify(res.mark));
    const salvosAntes = habits.calls.save;
    const undo = applyWorkout(workouts, habits, res);
    check("applyWorkout: already: grava o treino", !!workouts.get(res.doc.id));
    check("applyWorkout: already: não regrava o hábito", habits.calls.save === salvosAntes, String(habits.calls.save - salvosAntes));
    await undo();
    check("desfazer: already: o treino some", workouts.get(res.doc.id) === undefined);
    check("desfazer: already: a marca que já existia fica", habits.get("h1").marks[TODAY] === true, JSON.stringify(habits.get("h1").marks));
    check("desfazer: already: não mexe no hábito", habits.calls.save === salvosAntes, String(habits.calls.save - salvosAntes));
  }

  /* sem hábito de treino: nada é gravado em habits */
  {
    const workouts = fakeStore();
    const habits = fakeStore([habit("h2", "ler")]);
    const res = logWorkout(SPEC, habits.list(), TODAY);
    const undo = applyWorkout(workouts, habits, res);
    check("applyWorkout: sem hábito de treino, só o treino é gravado", workouts.list().length === 1 && habits.calls.save === 0, JSON.stringify({ w: workouts.list().length, h: habits.calls.save }));
    await undo();
    check("desfazer: sem hábito de treino, apaga o treino e não toca nos hábitos", workouts.list().length === 0 && habits.calls.save === 0 && habits.calls.remove === 0);
    check("desfazer: sem hábito de treino, o outro hábito segue igual", Object.keys(habits.get("h2").marks).length === 0);
  }

  /* treino de ontem: o desfazer tira a marca de ontem, não a de hoje */
  {
    const workouts = fakeStore();
    const habits = fakeStore([habit("h1", "treinar", { marks: { [TODAY]: true } })]);
    const res = logWorkout({ date: "2026-10-19", title: "perna", min: 40 }, habits.list(), TODAY);
    const undo = applyWorkout(workouts, habits, res);
    check("applyWorkout: treino de ontem marca ontem", habits.get("h1").marks["2026-10-19"] === true && habits.get("h1").marks[TODAY] === true);
    await undo();
    check("desfazer: treino de ontem tira só a marca de ontem", !habits.get("h1").marks["2026-10-19"] && habits.get("h1").marks[TODAY] === true, JSON.stringify(habits.get("h1").marks));
  }
}

if (failures.length) {
  console.error(failures.length + " falhou(aram), " + passed + " ok:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("workouts.test.mjs: " + passed + " verificações ok");
