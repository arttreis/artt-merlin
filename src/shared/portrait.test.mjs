/* testa o retrato (portrait.js): o que o Merlin leva à Anthropic em toda pergunta.
 *
 * o retrato é a única porta por onde dado da pessoa sai do navegador para a
 * conversa, então o que se prova aqui é o que, errado, vaza ou mente sem
 * aparecer na tela: um e-mail de cliente que vai junto com o nome, uma
 * coleção que ainda não desceu da nuvem lida como "nada" (e o Merlin
 * responde "você não tem nada na quinta" para quem tem a agenda cheia), um
 * título cortado no meio, um texto que passa do teto de 6.000 caracteres.
 *
 * o portrait.js importa tasks.js/day.js/focus.js/routine.js, que importam o
 * core.js, que é um módulo de navegador: o teste monta o mesmo navegador de
 * mentira de test.mjs (localStorage, document, window, location, fetch) ANTES
 * de importar o retrato.
 */

let passed = 0;
const failures = [];
const check = (name, cond, detail) => { if (cond) passed++; else failures.push(name + (detail ? " -> " + detail : "")); };

/* ---- o navegador de mentira (o mesmo de test.mjs) ---- */

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
/* rede que ninguém preparou é erro: um retrato que faz rede sem querer não prova nada */
globalThis.fetch = async (url) => { throw new Error("fetch nao previsto no teste: " + url); };
globalThis.localStorage = makeStorage({});

/* o MESMO módulo de core que o retrato importa (sem ?n=): é nele que mora o
   estado da sessão e das coleções de verdade */
const core = await import("./core.js");
const P = await import("./portrait.js");
const { portraitOf, portraitData, waitPortrait, sourcesLine, SECTIONS, SOURCES, PORTRAIT_MAX } = P;

/* ---- o chão do teste ---- */

/* segunda, 19/10/2026, 14:20. a quinta dessa semana é 2026-10-22 */
const NOW = new Date(2026, 9, 19, 14, 20);
const TODAY = "2026-10-19";
const THU = "2026-10-22";
const PREFS = { dayStart: 540, dayEnd: 1140 };
const hm = (h, m) => h * 60 + (m || 0);

let n = 0;
const task = (o) => {
  n++;
  return { id: "t" + n, title: "x", date: TODAY, min: 0, done: false, reserved: false, client: "", at: null, origin: null, order: n, createdAt: 1, updatedAt: 1, ...o };
};
const block = (o) => {
  n++;
  return { id: "b" + n, title: "bloco", days: [1, 2, 3, 4, 5], at: hm(9), min: 15, client: "", kind: "routine", until: "", ...o };
};
const ANA = { id: "c-ana", name: "Ana", email: "ana@segredo.example", whatsapp: "5511999998888", status: "active" };

const build = (o) => ({ tasks: [], routine: [], sessions: [], apps: [], closes: [], clients: [], content: [], cadence: [], profile: null, prefs: PREFS, loading: [], ...o });
const run = (o, now) => portraitOf(build(o), now || NOW);
const sec = (p, id) => p.sections.find((s) => s.id === id);
const lines = (p, id) => sec(p, id).text.split("\n");

/* ---- o contrato público ---- */
{
  check("o teto do retrato é 6.000", PORTRAIT_MAX === 6000, String(PORTRAIT_MAX));
  check("as fontes são a lista fechada", JSON.stringify(SOURCES) === JSON.stringify(["dia", "agenda", "rotina", "semana", "dinheiro", "clientes", "leads", "conteúdo", "hábitos", "notas", "produtos"]), JSON.stringify(SOURCES));
  check("as seções deste ticket, na ordem", JSON.stringify(SECTIONS.slice(0, 5).map((s) => s.id)) === JSON.stringify(["today", "agenda", "routine", "week", "products"]), JSON.stringify(SECTIONS.map((s) => s.id)));
  check("toda seção tem rótulo, orçamento, needs e build", SECTIONS.every((s) => typeof s.label === "string" && s.label && s.budget > 0 && Array.isArray(s.needs) && typeof s.build === "function"));
  check("os orçamentos juntos são um número finito", SECTIONS.reduce((t, s) => t + s.budget, 0) > 0);
}

/* ---- a forma da resposta, e o dado intacto ---- */
{
  const data = build({ tasks: [task({ title: "Pagar o boleto da gráfica", date: THU })], clients: [ANA] });
  const before = JSON.stringify(data);
  const p = portraitOf(data, NOW);
  check("o retrato não altera o que recebe", JSON.stringify(data) === before);
  check("o retrato tem uma seção por construtor", p.sections.length === SECTIONS.length && p.sections.every((s, i) => s.id === SECTIONS[i].id && s.label === SECTIONS[i].label));
  check("cada seção traz id, rótulo, texto e loading", p.sections.every((s) => typeof s.id === "string" && typeof s.label === "string" && typeof s.text === "string" && typeof s.loading === "boolean"));
  check("o texto junta 'rótulo:\\ncorpo' separado por linha em branco", p.text === p.sections.map((s) => s.label + ":\n" + s.text).join("\n\n"), p.text.slice(0, 200));
}

/* ---- tudo que falta vale vazio: sem lista nenhuma não quebra ---- */
{
  const p = portraitOf({}, NOW);
  check("sem nenhuma lista, não quebra", Array.isArray(p.sections) && p.sections.length === SECTIONS.length);
  check("sem preferência vale 09:00–19:00", /^agora 14:20 · janela 09:00–19:00 · /.test(lines(p, "today")[0]), lines(p, "today")[0]);
  check("sem nada: a agenda diz que está vazia", sec(p, "agenda").text === "nada nos próximos 7 dias", sec(p, "agenda").text);
  check("sem nada: a rotina diz que está vazia", sec(p, "routine").text === "nenhum bloco", sec(p, "routine").text);
  check("sem nada: produtos diz nenhum", sec(p, "products").text === "nenhum", sec(p, "products").text);
  check("sem nada: a fila aberta é nada", lines(p, "today").includes("fila aberta: nada"), sec(p, "today").text);
  check("sem nada: a semana ainda tem uma linha de foco", /^foco /.test(sec(p, "week").text), sec(p, "week").text);
  check("sem nada: ninguém está carregando", p.sections.every((s) => !s.loading));
}

/* ---- agenda: "o que tenho quinta?" ---- */
{
  const p = run({
    clients: [ANA],
    tasks: [
      task({ title: "Kickoff do portal Zeta", date: THU, at: hm(10), min: 60, client: ANA.id }),
      task({ title: "Ligar pro contador Wk", date: THU }),
      task({ title: "Pagar boleto da gráfica Yk", date: THU })
    ]
  });
  const a = lines(p, "agenda");
  check("agenda: a tarefa com hora traz dia, data, hora, título, duração e cliente", a.includes("qui 22/10 10:00 Kickoff do portal Zeta · 1h · @Ana"), JSON.stringify(a));
  check("agenda: as sem hora viram uma linha por dia, com títulos", a.includes("qui 22/10 · 2 sem hora: Ligar pro contador Wk; Pagar boleto da gráfica Yk"), JSON.stringify(a));
  check("agenda: a seção diz 'qui', '10:00', '1h', 'Ana' e '2 sem hora'", ["qui", "10:00", "Kickoff do portal Zeta", "1h", "Ana", "2 sem hora"].every((s) => sec(p, "agenda").text.includes(s)));
  check("agenda: com dado não diz que está vazia", !/nada nos próximos/.test(sec(p, "agenda").text));
}

/* sem duração ou sem cliente, a parte some; até 3 títulos das sem hora */
{
  const p = run({
    clients: [ANA],
    tasks: [
      task({ title: "Reunião curta sem duração Qp", date: THU, at: hm(11, 30) }),
      task({ title: "Com cliente que não existe Rs", date: "2026-10-23", at: hm(8), min: 90, client: "Loja Sem Cadastro" }),
      ...["um", "dois", "tres", "quatro", "cinco"].map((w) => task({ title: "avulsa " + w, date: "2026-10-24" }))
    ]
  });
  const a = lines(p, "agenda");
  check("agenda: sem duração e sem cliente, a parte some", a.includes("qui 22/10 11:30 Reunião curta sem duração Qp"), JSON.stringify(a));
  check("agenda: cliente sem cadastro usa o texto cru", a.includes("sex 23/10 08:00 Com cliente que não existe Rs · 1h30 · @Loja Sem Cadastro"), JSON.stringify(a));
  const sem = a.find((l) => l.startsWith("sáb 24/10 · "));
  check("agenda: sem hora, até 3 títulos e a conta inteira", !!sem && sem.startsWith("sáb 24/10 · 5 sem hora: ") && sem.split(": ")[1].split("; ").length === 3, String(sem));
}

/* a janela da agenda: de amanhã até hoje+7. hoje, hoje+8 e as cópias da rotina ficam de fora */
{
  const p = run({
    tasks: [
      task({ title: "Tarefa de hoje Hx", date: TODAY, at: hm(16), min: 30 }),
      task({ title: "Último dia da agenda Lx", date: "2026-10-26", at: hm(9), min: 30 }),
      task({ title: "Um dia depois da agenda Mx", date: "2026-10-27", at: hm(9), min: 30 }),
      task({ title: "COPIA-ROTINA-ZZ", date: "2026-10-21", at: hm(9), min: 15, origin: { type: "routine", id: "b1" } })
    ]
  });
  const a = sec(p, "agenda").text;
  check("agenda: hoje+7 entra", a.includes("Último dia da agenda Lx"), a);
  check("agenda: hoje+8 não entra", !a.includes("Mx"), a);
  check("agenda: o dia de hoje não é da agenda", !a.includes("Hx"), a);
  check("agenda: a cópia da rotina não entra em lugar nenhum", !p.text.includes("COPIA-ROTINA-ZZ"), p.text);
}

/* ---- hoje ---- */
{
  const p = run({
    clients: [ANA],
    tasks: [
      task({ title: "Revisar proposta Nv", min: 70, at: hm(14, 30), client: ANA.id }),
      task({ title: "Escrever a página Pq", min: 45 }),
      task({ title: "Responder o suporte Rt", min: 45 }),
      task({ title: "Atrasada velha Ak", date: "2026-10-15", min: 30 }),
      task({ title: "Atrasada recente Bk", date: "2026-10-17", min: 30 }),
      task({ title: "Almoço com a banca Cz", reserved: true, at: hm(12), min: 60 }),
      task({ title: "Fechar a nota fiscal Df", done: true, min: 20 })
    ]
  });
  const t = lines(p, "today");
  /* a sobra é a do day.js (uma sobra só, D11): das 4h40 que restam saem a
     reserva de 1h (o espaço do almoço, não o horário dele) e as 2h40 da fila */
  check("hoje: a primeira linha traz hora, janela e sobra", t[0] === "agora 14:20 · janela 09:00–19:00 · cabem 1h", t[0]);
  check("hoje: a aberta com hora, duração e cliente", t.includes("aberta: 14:30 Revisar proposta Nv · 1h10 · @Ana"), JSON.stringify(t));
  check("hoje: a aberta sem hora e sem cliente", t.includes("aberta: Escrever a página Pq · 45m") && t.includes("aberta: Responder o suporte Rt · 45m"), JSON.stringify(t));
  const late = t.find((l) => l.startsWith("atrasadas: "));
  check("hoje: atrasadas traz a conta e os títulos", !!late && late.startsWith("atrasadas: 2 · ") && late.includes("Atrasada velha Ak") && late.includes("Atrasada recente Bk") && late.includes("; "), String(late));
  check("hoje: a reserva do dia é compromisso", t.includes("compromisso: 12:00 Almoço com a banca Cz · 1h"), JSON.stringify(t));
  check("hoje: a feita vira 'feita:'", t.includes("feita: Fechar a nota fiscal Df"), JSON.stringify(t));
  check("hoje: a reserva e a feita não são abertas", !t.some((l) => l.startsWith("aberta: ") && (l.includes("Almoço") || l.includes("nota fiscal"))), JSON.stringify(t));
  check("hoje: a reserva não conta como atrasada nem a feita", late.startsWith("atrasadas: 2 "));
  check("hoje: com fila, não diz 'fila aberta: nada'", !t.includes("fila aberta: nada"));
}

/* atrasadas: até 5 títulos, e só as de até 30 dias */
{
  const titles = ["Aa", "Bb", "Cc", "Dd", "Ee", "Ff", "Gg"].map((s) => "Pendência " + s);
  const p = run({ tasks: titles.map((t, i) => task({ title: t, date: "2026-10-" + String(10 + i).padStart(2, "0") })) });
  const late = lines(p, "today").find((l) => l.startsWith("atrasadas: "));
  check("atrasadas: a conta é a inteira", !!late && late.startsWith("atrasadas: 7 · "), String(late));
  check("atrasadas: no máximo 5 títulos", titles.filter((t) => late.includes(t)).length === 5, String(late));
  const rec = run({ tasks: [task({ title: "Atrasada de 29 dias Jm", date: "2026-09-20" })] });
  check("atrasadas: 29 dias atrás ainda aparece", /atrasadas: 1 · .*Atrasada de 29 dias Jm/.test(sec(rec, "today").text), sec(rec, "today").text);
}

/* a sobra: passa do que cabe e o dia que já acabou */
{
  const over = run({ tasks: [task({ title: "Pesada um Ur", min: 200 }), task({ title: "Pesada dois Vr", min: 200 })] });
  check("hoje: passa do que cabe", lines(over, "today")[0] === "agora 14:20 · janela 09:00–19:00 · passa 2h do que cabe", lines(over, "today")[0]);
  const late = run({ tasks: [task({ title: "Sobrou Wr", min: 30 })] }, new Date(2026, 9, 19, 20, 0));
  check("hoje: o dia já acabou", lines(late, "today")[0] === "agora 20:00 · janela 09:00–19:00 · o dia já acabou", lines(late, "today")[0]);
  const custom = run({ prefs: { dayStart: hm(8), dayEnd: hm(18) }, tasks: [] });
  check("hoje: a janela vem da preferência", /janela 08:00–18:00/.test(lines(custom, "today")[0]), lines(custom, "today")[0]);
}

/* ---- fora da janela: 30 dias para trás, 7 para frente ---- */
{
  const p = run({
    tasks: [
      task({ title: "Daqui a nove dias Xo", date: "2026-10-28", at: hm(9), min: 30 }),
      task({ title: "Atrasada de quarenta dias Yo", date: "2026-09-09", min: 30 }),
      task({ title: "Dentro da janela Zo", date: "2026-10-18", min: 30 })
    ]
  });
  check("fora da janela: nem o futuro distante nem o passado distante", !p.text.includes("Xo") && !p.text.includes("Yo"), p.text);
  check("fora da janela: o de dentro aparece", /atrasadas: 1 · .*Dentro da janela Zo/.test(sec(p, "today").text), sec(p, "today").text);
  check("fora da janela: a atrasada velha nem entra na conta", !/atrasadas: 2/.test(sec(p, "today").text));
}

/* ---- rotina ---- */
{
  const p = run({ routine: [block({ title: "daily" })] });
  check("rotina: 'daily seg a sex 9:00 15m'", lines(p, "routine").includes("daily · seg–sex · 09:00 · 15m"), sec(p, "routine").text);
}
{
  const p = run({
    clients: [ANA],
    routine: [
      block({ title: "Academia Bg", days: [1, 3, 5], at: hm(18), min: 60 }),
      block({ title: "Planejar o dia Cg", days: [0, 1, 2, 3, 4, 5, 6], at: hm(7, 30), min: 20 }),
      block({ title: "Mentoria Dg", days: [2, 4], at: hm(12), min: 90, client: ANA.id, kind: "event" })
    ]
  });
  const r = lines(p, "routine");
  check("rotina: todos os dias é 'todo dia'", r.includes("Planejar o dia Cg · todo dia · 07:30 · 20m"), JSON.stringify(r));
  check("rotina: dias soltos separados por vírgula", r.includes("Academia Bg · seg, qua, sex · 18:00 · 1h"), JSON.stringify(r));
  check("rotina: o cliente vem no fim", r.includes("Mentoria Dg · ter, qui · 12:00 · 1h30 · @Ana"), JSON.stringify(r));
  check("rotina: ordenada pela hora", r.findIndex((l) => l.startsWith("Planejar")) < r.findIndex((l) => l.startsWith("Mentoria")) && r.findIndex((l) => l.startsWith("Mentoria")) < r.findIndex((l) => l.startsWith("Academia")), JSON.stringify(r));
}
{
  const p = run({ routine: [block({ title: "Encerrado Eg", until: TODAY }), block({ title: "Acaba amanhã Fg", until: "2026-10-20" }), block({ title: "Antigo Gg", until: "2026-09-01" })] });
  const r = sec(p, "routine").text;
  check("rotina: bloco com until até hoje não entra", !r.includes("Encerrado Eg") && !r.includes("Antigo Gg"), r);
  check("rotina: until depois de hoje ainda entra", r.includes("Acaba amanhã Fg"), r);
}
{
  const many = Array.from({ length: 15 }, (_, i) => block({ title: "Bloco numerado " + String(i + 1).padStart(2, "0"), at: hm(6, i * 10) }));
  const p = run({ routine: many });
  const r = lines(p, "routine");
  const shown = r.filter((l) => !/^e mais \d+$/.test(l));
  check("rotina: até 12 blocos", shown.length <= 12 && shown.length > 0, String(shown.length));
  check("rotina: o 13º bloco não aparece", !sec(p, "routine").text.includes("Bloco numerado 13") && !sec(p, "routine").text.includes("Bloco numerado 15"), sec(p, "routine").text);
}

/* ---- produtos ---- */
{
  const names = ["Alfa", "Beta", "Gama", "Delta", "Épsilon", "Zeta", "Eta"].map((s) => "Produto " + s);
  const p = run({ apps: names.map((name, i) => ({ id: "a" + i, name, pitch: "SEGREDO-PITCH-ZQ" })) });
  const r = lines(p, "products");
  check("produtos: um nome por linha, até 5, e o resto vira \"e mais N\"", r.length === 6 && r.slice(0, 5).every((l, i) => l === names[i]) && r[5] === "e mais 2", JSON.stringify(r));
  check("produtos: só o nome, nada do documento", !p.text.includes("SEGREDO-PITCH-ZQ"));
}

/* ---- semana ---- */
{
  const sessions = [
    { id: "s1", start: new Date(2026, 9, 19, 9, 0).getTime(), end: new Date(2026, 9, 19, 11, 0).getTime() },
    { id: "s2", start: new Date(2026, 9, 19, 13, 0).getTime(), end: new Date(2026, 9, 19, 14, 0).getTime() },
    /* a semana passada não conta */
    { id: "s3", start: new Date(2026, 9, 10, 9, 0).getTime(), end: new Date(2026, 9, 10, 14, 0).getTime() }
  ];
  const tasks = [
    task({ title: "Reunião de pauta Vk", date: "2026-10-20", reserved: true, min: 120 }),
    task({ title: "Almoço da semana Wk", date: "2026-10-20", reserved: true, min: 60 })
  ];
  const closes = ["2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"].map((id) => ({ id }));
  const full = run({ sessions, tasks, closes, profile: { focusGoal: 25, meetingCap: 6 } });
  check("semana: foco, reunião, metas e dias fechados", sec(full, "week").text === "foco 3h de 25h · reunião 2h (teto 6h) · 4 dias fechados seguidos", sec(full, "week").text);
  const bare = run({ sessions, tasks, closes });
  check("semana: sem meta nem teto, as partes somem", sec(bare, "week").text === "foco 3h · reunião 2h · 4 dias fechados seguidos", sec(bare, "week").text);
  const today = run({ sessions, tasks, closes: [...closes, { id: TODAY }] });
  check("semana: hoje fechado entra na sequência (como o início conta)", /· 5 dias fechados seguidos$/.test(sec(today, "week").text), sec(today, "week").text);
  const gap = run({ sessions, tasks, closes: [{ id: "2026-10-18" }, { id: "2026-10-16" }] });
  check("semana: um dia aberto no meio quebra a sequência", !/2 dias fechados/.test(sec(gap, "week").text), sec(gap, "week").text);
}

/* ---- nunca entra ---- */
{
  const client = { ...ANA, vault: [{ label: "Painel", secret: "SENHA-DO-COFRE-XYZ" }], contract: "CLAUSULA-DO-CONTRATO-XYZ", note: "NOTA-INTERNA-DO-CLIENTE-XYZ" };
  const p = run({
    clients: [client],
    tasks: [
      task({ title: "Enviar a proposta para a Ana Lt", date: THU, at: hm(15), min: 30, client: client.id }),
      task({ title: "Revisar contrato Nt", min: 30, client: client.id })
    ],
    routine: [block({ title: "Check-in semanal Pt", client: client.id })],
    apps: [{ id: "a1", name: "App Qx", pitch: "SEGREDO-PITCH-ZQ", description: "DESCRICAO-ZQ" }]
  });
  check("nunca entra: o nome do cliente aparece", p.text.includes("@Ana"), p.text);
  for (const s of ["ana@segredo.example", "5511999998888", "SENHA-DO-COFRE-XYZ", "CLAUSULA-DO-CONTRATO-XYZ", "NOTA-INTERNA-DO-CLIENTE-XYZ", "SEGREDO-PITCH-ZQ", "DESCRICAO-ZQ", "c-ana"]) {
    check("nunca entra: " + s, !p.text.includes(s), p.text);
  }
}

/* ---- corte por seção: 40 tarefas na quinta ---- */
{
  const budget = SECTIONS.find((s) => s.id === "agenda").budget;
  const title = (i) => "Tarefa " + String(i).padStart(2, "0") + " da quinta com um título comprido para encher o orçamento da seção " + "x".repeat(40);
  const tasks = Array.from({ length: 40 }, (_, i) => task({ title: title(i + 1), date: THU, at: hm(6) + i * 10, min: 30 }));
  const clock = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  const expected = new Set(tasks.map((t) => "qui 22/10 " + clock(t.at) + " " + t.title + " · 30m"));
  const p = run({ tasks });
  const a = sec(p, "agenda");
  const l = a.text.split("\n");
  check("corte por seção: o corpo não passa do orçamento", a.text.length <= budget, a.text.length + " > " + budget);
  check("corte por seção: termina em 'e mais N'", /^e mais \d+$/.test(l.at(-1)), l.at(-1));
  const shown = l.slice(0, -1);
  check("corte por seção: nenhum título sai cortado no meio", shown.length > 0 && shown.every((x) => expected.has(x)), shown.find((x) => !expected.has(x)));
  const more = +(l.at(-1).match(/\d+/) || [0])[0];
  check("corte por seção: o N é o que ficou de fora", shown.length + more === 40, shown.length + " + " + more);
  check("corte por seção: cortou mesmo (o teste não é trivial)", more > 0);
}

/* ---- corte total: todas as seções cheias ---- */
{
  const long = (s, i) => s + " " + String(i).padStart(2, "0") + " " + "palavra ".repeat(25).trim();
  const tasks = [
    ...Array.from({ length: 60 }, (_, i) => task({ title: long("Aberta de hoje", i), min: 5 })),
    ...Array.from({ length: 60 }, (_, i) => task({ title: long("Atrasada", i), date: "2026-10-" + String(1 + (i % 17)).padStart(2, "0") })),
    ...Array.from({ length: 40 }, (_, i) => task({ title: long("Quinta", i), date: THU, at: hm(6) + i * 10, min: 30 })),
    ...Array.from({ length: 40 }, (_, i) => task({ title: long("Sexta", i), date: "2026-10-23" })),
    ...Array.from({ length: 20 }, (_, i) => task({ title: long("Feita", i), done: true }))
  ];
  const routine = Array.from({ length: 30 }, (_, i) => block({ title: long("Bloco", i), at: hm(6, i * 5) }));
  const apps = Array.from({ length: 12 }, (_, i) => ({ id: "a" + i, name: "Produto " + i + " " + "n".repeat(280) }));
  const p = run({ tasks, routine, apps, clients: [ANA], profile: { focusGoal: 25, meetingCap: 6 } });
  check("corte total: no máximo 6.000 caracteres", p.text.length <= PORTRAIT_MAX, String(p.text.length));
  check("corte total: cada seção dentro do seu orçamento", SECTIONS.every((s) => sec(p, s.id).text.length <= s.budget), p.sections.map((s) => s.id + ":" + s.text.length).join(" "));
  check("corte total: o retrato ainda abre pelo dia", p.text.startsWith(SECTIONS[0].label + ":\nagora 14:20"), p.text.slice(0, 80));
  check("corte total: as seções cheias dizem quanto ficou de fora", /e mais \d+$/.test(sec(p, "today").text) && /e mais \d+$/.test(sec(p, "agenda").text));
  check("corte total: nenhuma linha de hoje sai pela metade", lines(p, "today").every((x) => (/^(agora|aberta:|atrasadas:|compromisso:|feita:|fila aberta:|e mais \d+$)/.test(x))), lines(p, "today").find((x) => !/^(agora|aberta:|atrasadas:|compromisso:|feita:|fila aberta:|e mais \d+$)/.test(x)));
}

/* ---- ainda carregando ---- */
{
  /* o contrato direto: coleção em `loading` não é "nada" */
  const p = run({ loading: ["tasks"] });
  check("carregando: hoje diz 'ainda carregando'", sec(p, "today").text === "ainda carregando" && sec(p, "today").loading === true, sec(p, "today").text);
  check("carregando: a agenda diz 'ainda carregando'", sec(p, "agenda").text === "ainda carregando" && sec(p, "agenda").loading === true, sec(p, "agenda").text);
  check("carregando: não diz 'nada' nem 'nenhum' onde não sabe", !/nada nos próximos|fila aberta: nada/.test(p.text), p.text);
  check("carregando: a seção só carrega se precisa da coleção que falta", p.sections.every((s) => s.loading === SECTIONS.find((x) => x.id === s.id).needs.some((k) => ["tasks"].includes(k))));
  const r = run({ loading: ["routine"] });
  check("carregando: a rotina espera pela coleção da rotina", sec(r, "routine").text === "ainda carregando" && sec(r, "routine").loading === true);
  check("carregando: a agenda não espera pela rotina", sec(r, "agenda").loading === false && sec(r, "agenda").text === "nada nos próximos 7 dias");
  const a = run({ loading: ["apps"] });
  check("carregando: produtos esperam pelos apps", sec(a, "products").text === "ainda carregando" && sec(a, "products").loading === true);
}
{
  /* o caso real: com sessão e sem descida, as coleções de verdade dizem que não desceram */
  core.cloud.signedIn = true;
  const cols = {
    tasks: core.collection("tasks"), routine: core.collection("routine"), sessions: core.collection("sessions"),
    apps: core.collection("apps"), closes: core.collection("closes"), clients: core.collection("clients"), profile: core.collection("profile")
  };
  check("carregando: a coleção de verdade ainda não desceu", cols.tasks.hasDownloaded() === false);
  const data = portraitData(cols, { signedIn: true, prefs: PREFS });
  check("carregando: com sessão, loading lista as que não desceram", ["tasks", "routine", "sessions", "apps", "closes", "clients", "profile"].every((k) => data.loading.includes(k)), JSON.stringify(data.loading));
  const p = portraitOf(data, NOW);
  check("carregando: hoje e agenda dizem 'ainda carregando', e não 'nada'", sec(p, "today").text === "ainda carregando" && sec(p, "agenda").text === "ainda carregando" && !/nada/.test(sec(p, "agenda").text));
  const offline = portraitData(cols, { signedIn: false, prefs: PREFS });
  check("sem sessão, nada fica carregando", Array.isArray(offline.loading) && offline.loading.length === 0, JSON.stringify(offline.loading));
  const q = portraitOf(offline, NOW);
  check("sem sessão, a agenda vazia diz 'nada' (nada muda)", sec(q, "agenda").text === "nada nos próximos 7 dias" && q.sections.every((s) => !s.loading));
  core.cloud.signedIn = false;
}

/* ---- vazio de verdade: desceu e está vazio ---- */
{
  const empty = () => ({ all: () => [], get: () => null, hasDownloaded: () => true });
  const cols = { tasks: empty(), routine: empty(), sessions: empty(), apps: empty(), closes: empty(), clients: empty(), profile: empty() };
  const data = portraitData(cols, { signedIn: true, prefs: PREFS });
  check("vazio de verdade: nada carregando", data.loading.length === 0, JSON.stringify(data.loading));
  const p = portraitOf(data, NOW);
  check("vazio de verdade: a agenda diz 'nada nos próximos 7 dias'", sec(p, "agenda").text === "nada nos próximos 7 dias" && sec(p, "agenda").loading === false, sec(p, "agenda").text);
  check("vazio de verdade: hoje diz 'fila aberta: nada'", lines(p, "today").includes("fila aberta: nada"), sec(p, "today").text);
}

/* ---- portraitData: o que sai das coleções ---- */
{
  const col = (items, down, byId) => ({ all: () => items, get: (id) => (byId ? byId[id] || null : null), hasDownloaded: () => down });
  const t = [task({ title: "Da coleção Ho" })];
  const cols = {
    tasks: col(t, true), routine: col([block({ title: "bloco de coleção" })], false), sessions: col([], true),
    apps: col([{ id: "a", name: "App" }], true), closes: col([{ id: "2026-10-18" }], false), clients: col([ANA], true),
    profile: col([], true, { me: { id: "me", focusGoal: 20, meetingCap: 4, name: "Nome" } })
  };
  const d = portraitData(cols, { signedIn: true, prefs: PREFS });
  check("dados: as listas vêm de all()", d.tasks === t || (d.tasks.length === 1 && d.tasks[0].title === "Da coleção Ho"));
  check("dados: o perfil é o documento 'me'", d.profile && d.profile.focusGoal === 20 && d.profile.meetingCap === 4, JSON.stringify(d.profile));
  check("dados: as preferências passam", d.prefs && d.prefs.dayStart === 540 && d.prefs.dayEnd === 1140);
  check("dados: loading só tem as que não desceram", d.loading.length === 2 && d.loading.includes("routine") && d.loading.includes("closes"), JSON.stringify(d.loading));
  const off = portraitData(cols, { signedIn: false, prefs: PREFS });
  check("dados: sem sessão, loading é vazio mesmo sem descida", off.loading.length === 0, JSON.stringify(off.loading));
  const noProfile = portraitData({ ...cols, profile: col([], true) }, { signedIn: true, prefs: PREFS });
  check("dados: sem perfil, é nulo", !noProfile.profile, JSON.stringify(noProfile.profile));
}

/* ---- waitPortrait: espera a primeira descida, no máximo ms ---- */
{
  const timed = (p, limit) => Promise.race([p.then(() => "ok"), new Promise((r) => setTimeout(() => r("travou"), limit))]);
  const flag = (down) => { const c = { down, hasDownloaded: () => c.down, all: () => [], get: () => null }; return c; };
  const mk = (down) => ({ tasks: flag(down), routine: flag(down), sessions: flag(down), apps: flag(down), closes: flag(down), clients: flag(down), profile: flag(down) });

  let t0 = Date.now();
  check("espera: sem sessão resolve na hora", (await timed(waitPortrait(mk(false), false, 5000), 500)) === "ok" && Date.now() - t0 < 300, String(Date.now() - t0));
  t0 = Date.now();
  check("espera: tudo desceu, resolve na hora", (await timed(waitPortrait(mk(true), true, 5000), 500)) === "ok" && Date.now() - t0 < 300, String(Date.now() - t0));
  t0 = Date.now();
  const never = await timed(waitPortrait(mk(false), true, 150), 3000);
  const took = Date.now() - t0;
  check("espera: o que nunca desce resolve no tempo, sem travar", never === "ok" && took >= 120 && took < 1500, never + " " + took + "ms");
  const cols = mk(false);
  t0 = Date.now();
  setTimeout(() => Object.values(cols).forEach((c) => { c.down = true; }), 100);
  const soon = await timed(waitPortrait(cols, true, 3000), 3500);
  const soonMs = Date.now() - t0;
  check("espera: resolve quando as coleções descem, sem esperar o tempo todo", soon === "ok" && soonMs >= 80 && soonMs < 1500, soon + " " + soonMs + "ms");
}

/* ---- leads e clientes (#12): "quais leads estão parados?" ----
   a conta mora em client-doc.js (pipelineToday); aqui se prova o texto que sai
   dela, o que nunca sai da ficha, e o teto de 500 caracteres das duas seções. */
const DAY = 86400000;
const ago = (days) => NOW.getTime() - days * DAY;
const lead = (o) => ({ status: "prospect", stage: "lead", stageAt: ago(1), createdAt: ago(60), nextDate: "2026-10-30", ...o });
const customer = (o) => ({ status: "active", createdAt: ago(200), journal: [{ id: "j", at: ago(1), type: "event", text: "ligação" }], ...o });
const bl = (id, due, text, o) => ({ id, text, due, done: false, ...o });

{
  check("as seções de leads e clientes vêm logo depois dos produtos, nesta ordem", JSON.stringify(SECTIONS.slice(5, 7).map((s) => s.id)) === JSON.stringify(["leads", "clients"]), JSON.stringify(SECTIONS.map((s) => s.id)));
  const l = SECTIONS.find((s) => s.id === "leads"), c = SECTIONS.find((s) => s.id === "clients");
  check("leads e clientes: rótulos e coleção de que dependem", !!l && !!c && l.label === "leads" && c.label === "clientes" && l.needs.includes("clients") && c.needs.includes("clients"));
  check("leads e clientes: os orçamentos, com rótulos e separador, cabem em 500", !!l && !!c && l.budget + c.budget + "leads:\n".length + "clientes:\n".length + 2 <= 500, l && c ? String(l.budget + c.budget) : "");
}

/* a seção: etapas com contagem, atrasados, parados, sem próximo passo, sem registro e backlog */
{
  const p = run({
    clients: [
      lead({ id: "bruna", name: "Bruna", stage: "proposal", stageAt: ago(9) }),
      lead({ id: "caio", name: "Caio", stage: "lead", stageAt: ago(2), nextDate: "2026-10-17" }),
      lead({ id: "davi", name: "Davi", stage: "qualified", stageAt: ago(1), nextDate: "" }),
      lead({ id: "lia", name: "Lia Perdida", status: "lost", stage: "proposal", stageAt: ago(30), nextDate: "" }),
      customer({ id: "ana", name: "Ana", journal: [{ id: "j", at: ago(20), type: "event", text: "ligação" }], backlog: [
        bl("b1", "2026-10-17", "enviar o relatório"),
        bl("b2", TODAY, "revisar o contrato de mídia"),
        bl("b3", THU, "marcar a reunião de metas"),
        bl("b4", "2026-10-31", "item distante Zq"),
        bl("b6", "2026-09-01", "vencido de 49 dias Nw"),
        bl("b7", "2026-10-18", "item feito Ef", { done: true })
      ] }),
      customer({ id: "pau", name: "Paula Pausada", status: "paused", journal: [{ id: "j", at: ago(40) }] }),
      customer({ id: "rui", name: "Rui", journal: [{ id: "j", at: ago(3) }] })
    ]
  });
  const L = lines(p, "leads");
  check("leads: a primeira linha são as etapas com contagem, só as que têm lead", L[0] === "etapas: lead 1 · qualificado 1 · proposta enviada 1", L[0]);
  check("leads: o atrasado, com a data em dd/mm", L.includes("contato atrasado: Caio · 17/10"), JSON.stringify(L));
  check("leads: o parado, com a etapa e os dias", L.includes("parado: Bruna · proposta enviada · 9d"), JSON.stringify(L));
  check("leads: o sem próximo passo", L.includes("sem próximo passo: Davi"), JSON.stringify(L));
  check("leads: o Caio (2 dias) não está parado e a Bruna não está atrasada", !L.some((x) => /^parado: Caio/.test(x) || /^contato atrasado: Bruna/.test(x)), JSON.stringify(L));
  check("leads: o perdido não aparece em lugar nenhum", !p.text.includes("Lia Perdida"), p.text);
  check("leads: ordem das linhas é etapas, atrasado, parado, sem próximo passo", L.findIndex((x) => x.startsWith("etapas:")) === 0 && L.findIndex((x) => x.startsWith("contato atrasado:")) < L.findIndex((x) => x.startsWith("parado:")) && L.findIndex((x) => x.startsWith("parado:")) < L.findIndex((x) => x.startsWith("sem próximo passo:")), JSON.stringify(L));
  check("leads: cliente ativo não é lead", !sec(p, "leads").text.includes("Ana") && !sec(p, "leads").text.includes("Rui"));

  const C = lines(p, "clients");
  check("clientes: o ativo sem registro, com os dias", C.includes("sem registro há 14+ dias: Ana · 20d"), JSON.stringify(C));
  check("clientes: o pausado e o de registro recente não estão sem registro", !C.some((x) => x.startsWith("sem registro") && (x.includes("Paula") || x.includes("Rui"))), JSON.stringify(C));
  check("clientes: backlog vencido, com a data", C.includes("backlog vencido 17/10: Ana · enviar o relatório"), JSON.stringify(C));
  check("clientes: backlog de hoje", C.includes("backlog hoje: Ana · revisar o contrato de mídia"), JSON.stringify(C));
  check("clientes: backlog dos próximos dias, com dia da semana e data", C.includes("backlog qui 22/10: Ana · marcar a reunião de metas"), JSON.stringify(C));
  check("clientes: vencido de mais de 30 dias, o prazo distante e o feito não entram", !/Nw|Zq|Ef/.test(sec(p, "clients").text), sec(p, "clients").text);
  check("clientes: lead não entra na seção de clientes", !sec(p, "clients").text.includes("Bruna") && !sec(p, "clients").text.includes("Caio") && !sec(p, "clients").text.includes("Davi"));
  check("leads e clientes: ninguém está carregando", !sec(p, "leads").loading && !sec(p, "clients").loading);
  check("o retrato leva as duas seções, com rótulo", p.text.includes("\n\nleads:\netapas: ") && p.text.includes("\n\nclientes:\n"), p.text.slice(-400));
}

/* o pausado entra só pelo backlog, e o vencido há 29 dias ainda vale (como nas tarefas) */
{
  const p = run({ clients: [
    customer({ id: "pau", name: "Paula Pausada", status: "paused", journal: [{ id: "j", at: ago(40) }], backlog: [bl("b8", "2026-10-20", "item da pausada")] }),
    customer({ id: "ana", name: "Ana", backlog: [bl("b5", "2026-09-20", "vencido de 29 dias Mw")] })
  ] });
  const C = lines(p, "clients");
  check("clientes: o pausado entra pelo backlog", C.includes("backlog ter 20/10: Paula Pausada · item da pausada"), JSON.stringify(C));
  check("clientes: o pausado não entra como sem registro", !C.some((x) => x.startsWith("sem registro")), JSON.stringify(C));
  check("clientes: vencido de 29 dias ainda entra", C.includes("backlog vencido 20/09: Ana · vencido de 29 dias Mw"), JSON.stringify(C));
}

/* nomes saem numa linha só */
{
  const p = run({ clients: [lead({ id: "g", name: "  Grace\n   Hopper  ", stageAt: ago(10) })] });
  check("nome: espaço em branco colapsa, sem quebra de linha", lines(p, "leads").includes("parado: Grace Hopper · lead · 10d"), JSON.stringify(lines(p, "leads")));
}

/* só etapas, quando nada pede atenção */
{
  const p = run({ clients: [lead({ id: "f", name: "Fábio", stage: "call" })] });
  check("leads: sem atrasado, parado nem sem passo, é só a linha de etapas", sec(p, "leads").text === "etapas: call marcada 1", sec(p, "leads").text);
}

/* um objeto de cliente esparso não derruba o retrato */
{
  let p;
  try { p = run({ clients: [{ id: "s", name: "Esparso", status: "prospect", stageAt: ago(8) }, { id: "t", name: "Ativo esparso", status: "active", createdAt: ago(30) }, { id: "u", name: "Lead esparso" }] }); } catch (e) { p = null; check("esparso: não quebra", false, String(e)); }
  if (p) {
    check("esparso: o lead sem etapa vale lead e entra parado", lines(p, "leads").includes("parado: Esparso · lead · 8d"), JSON.stringify(lines(p, "leads")));
    check("esparso: o cliente ativo sem diário vale a criação", lines(p, "clients").includes("sem registro há 14+ dias: Ativo esparso · 30d"), JSON.stringify(lines(p, "clients")));
  }
}

/* nunca entra: só nome, etapa, dias, próximo passo (data), backlog (texto e prazo) */
{
  const secrets = ["fulano@segredo.example", "5511988887777", "@perfil_secreto_xk", "site-secreto-xk.example", "PROPOSTA-ESCOPO-XK", "4321000", "43.210", "43210", "DIARIO-SECRETO-XK", "SENHA-DO-COFRE-XK", "ARQUIVO-SECRETO-XK", "OFERTA-SECRETA-XK", "CONTATO-SECRETO-XK", "CONTRATO-SECRETO-XK", "RESUMO-SECRETO-XK", "DOR-SECRETA-XK", "9876543", "f-id-secreto-xk"];
  const full = {
    email: "fulano@segredo.example", whatsapp: "5511988887777", instagram: "@perfil_secreto_xk", site: "site-secreto-xk.example",
    proposal: { scope: "PROPOSTA-ESCOPO-XK", value: 4321000, sentAt: "2026-10-01", link: "" }, estimate: 9876543,
    journal: [{ id: "j1", at: ago(1), type: "note", text: "DIARIO-SECRETO-XK" }],
    vault: { items: [{ id: "v", label: "Painel", secret: "SENHA-DO-COFRE-XK" }] },
    files: [{ id: "f-id-secreto-xk", name: "ARQUIVO-SECRETO-XK.pdf", kind: "contrato" }],
    offers: [{ id: "o", name: "OFERTA-SECRETA-XK" }],
    contacts: [{ id: "k", name: "CONTATO-SECRETO-XK", phone: "5511977776666" }],
    summary: "RESUMO-SECRETO-XK", pain: "DOR-SECRETA-XK"
  };
  const p = run({ clients: [
    lead({ ...full, id: "fulano", name: "Fulano", stage: "proposal", stageAt: ago(10) }),
    customer({ ...full, id: "cliente", name: "Cliente Secreto", createdAt: ago(100), journal: [{ id: "j1", at: ago(21), type: "note", text: "DIARIO-SECRETO-XK" }],
      contract: { scope: "CONTRATO-SECRETO-XK", value: 9876543, recurrence: "monthly" }, backlog: [bl("b", THU, "texto do backlog que pode ir")] })
  ] });
  check("nunca entra: o nome, a etapa e os dias do lead aparecem", lines(p, "leads").includes("parado: Fulano · proposta enviada · 10d"), JSON.stringify(lines(p, "leads")));
  check("nunca entra: o nome, os dias e o backlog do cliente aparecem", lines(p, "clients").includes("sem registro há 14+ dias: Cliente Secreto · 21d") && lines(p, "clients").includes("backlog qui 22/10: Cliente Secreto · texto do backlog que pode ir"), JSON.stringify(lines(p, "clients")));
  for (const s of secrets) check("nunca entra: " + s, !p.text.includes(s), p.text);
}

/* corte por seção: 50 leads parados e muitos clientes, dentro de 500 caracteres juntos */
{
  const many = Array.from({ length: 50 }, (_, i) => lead({ id: "l" + i, name: "Lead número " + String(i).padStart(2, "0") + " com nome comprido", stage: "negotiation", stageAt: ago(10 + i) }));
  const p = run({ clients: many });
  const l = sec(p, "leads"), c = sec(p, "clients");
  const joined = "leads:\n" + l.text + "\n\n" + "clientes:\n" + c.text;
  check("corte: as duas seções, com rótulos e separador, não passam de 500", joined.length <= 500, String(joined.length));
  check("corte: o retrato leva as duas seções, e o texto delas está no p.text", !!l && !!c && p.text.includes(joined), p.text.slice(-600));
  const L = l.text.split("\n");
  check("corte: leads termina em 'e mais N'", /^e mais \d+$/.test(L.at(-1)), L.at(-1));
  const shown = L.slice(0, -1);
  const okLine = (x) => /^etapas: /.test(x) || /^parado: Lead número \d\d com nome comprido · negociação · \d+d$/.test(x);
  check("corte: nenhuma linha de lead sai pela metade", shown.length > 1 && shown.every(okLine), shown.find((x) => !okLine(x)));
  const more = +(L.at(-1).match(/\d+/) || [0])[0];
  check("corte: o N é o que ficou de fora (etapas e 50 parados)", shown.length + more === 51, shown.length + " + " + more);
  check("corte: cortou mesmo (o teste não é trivial)", more > 0);
  check("corte: sem cliente nenhum, a seção de clientes ainda cabe e fala", c.text === "nada pendente nos clientes", c.text);

  const stale = Array.from({ length: 40 }, (_, i) => customer({ id: "c" + i, name: "Cliente número " + String(i).padStart(2, "0") + " de nome comprido", journal: [{ id: "j", at: ago(20 + i) }] }));
  const q = run({ clients: [...many, ...stale] });
  const l2 = sec(q, "leads"), c2 = sec(q, "clients");
  const joined2 = "leads:\n" + l2.text + "\n\n" + "clientes:\n" + c2.text;
  check("corte: com leads e clientes cheios, as duas juntas ainda cabem em 500", joined2.length <= 500, String(joined2.length));
  check("corte: as duas dizem quanto ficou de fora", /e mais \d+$/.test(l2.text) && /e mais \d+$/.test(c2.text), l2.text.slice(-30) + " | " + c2.text.slice(-30));
  const C2 = c2.text.split("\n").slice(0, -1);
  check("corte: nenhuma linha de cliente sai pela metade", C2.length > 0 && C2.every((x) => /^sem registro há 14\+ dias: Cliente número \d\d de nome comprido · \d+d$/.test(x)), C2.find((x) => !/^sem registro há 14\+ dias: Cliente número \d\d de nome comprido · \d+d$/.test(x)));
  check("corte: o retrato inteiro continua no teto", q.text.length <= PORTRAIT_MAX, String(q.text.length));
}

/* ainda carregando: a coleção de clientes não desceu */
{
  const p = run({ loading: ["clients"], clients: [] });
  check("carregando: leads diz 'ainda carregando'", sec(p, "leads").text === "ainda carregando" && sec(p, "leads").loading === true, sec(p, "leads").text);
  check("carregando: clientes diz 'ainda carregando'", sec(p, "clients").text === "ainda carregando" && sec(p, "clients").loading === true, sec(p, "clients").text);
  check("carregando: não diz 'nenhum lead' nem 'nada pendente' onde não sabe", !/nenhum lead|nada pendente/.test(p.text), p.text);
  check("carregando: hoje e agenda não esperam pelos clientes", sec(p, "today").loading === false && sec(p, "agenda").loading === false);
  const t = run({ loading: ["tasks"] });
  check("carregando: leads e clientes não esperam pelas tarefas", sec(t, "leads").loading === false && sec(t, "clients").loading === false);
  /* o caso real: com sessão e sem descida */
  core.cloud.signedIn = true;
  const cc = core.collection("clients");
  const data = portraitData({ clients: cc }, { signedIn: true, prefs: PREFS });
  const q = portraitOf(data, NOW);
  check("carregando: com sessão, a coleção de verdade que não desceu vira 'ainda carregando'", data.loading.includes("clients") && sec(q, "leads").text === "ainda carregando" && sec(q, "clients").text === "ainda carregando", sec(q, "leads").text);
  core.cloud.signedIn = false;
}

/* vazio de verdade */
{
  const p = run({});
  check("vazio: leads manda abrir a prospecção", sec(p, "leads").text === "nenhum lead no funil · abra a prospecção para cadastrar", sec(p, "leads").text);
  check("vazio: clientes diz que não há nada pendente", sec(p, "clients").text === "nada pendente nos clientes", sec(p, "clients").text);
  check("vazio: nenhuma das duas está carregando", !sec(p, "leads").loading && !sec(p, "clients").loading);
  const only = run({ clients: [customer({ id: "a", name: "Ana" }), lead({ id: "x", name: "Perdido", status: "lost" }), lead({ id: "y", name: "Fechado", status: "closed" })] });
  check("vazio: só cliente em dia, perdido e encerrado: continua sem lead e sem pendência", sec(only, "leads").text === "nenhum lead no funil · abra a prospecção para cadastrar" && sec(only, "clients").text === "nada pendente nos clientes", sec(only, "leads").text + " | " + sec(only, "clients").text);
  check("vazio: perdido e encerrado não vazam o nome", !only.text.includes("Perdido") && !only.text.includes("Fechado"));
}

/* ---- sourcesLine: "vi ..." ---- */
{
  check("fontes: duas", sourcesLine(["dia", "agenda"]) === "vi o dia e a agenda", sourcesLine(["dia", "agenda"]));
  check("fontes: uma", sourcesLine(["agenda"]) === "vi a agenda", sourcesLine(["agenda"]));
  check("fontes: nenhuma é vazio", sourcesLine([]) === "", JSON.stringify(sourcesLine([])));
  check("fontes: o dia sozinho", sourcesLine(["dia"]) === "vi o dia", sourcesLine(["dia"]));
  const tres = sourcesLine(["dia", "agenda", "rotina"]);
  check("fontes: três citam as três", /^vi /.test(tres) && tres.includes("o dia") && tres.includes("a agenda") && tres.includes("a rotina") && tres.includes(" e "), tres);
}

/* ---- as fontes ficam guardadas com a conversa ----
   a linha "vi a agenda" sumia ao recarregar e ao continuar no assistente,
   porque o normalizeChat jogava o `sources` fora */
{
  const { normalizeChat } = await import("./assistant-actions.js");
  const saved = normalizeChat({ id: "c1", messages: [
    { from: "me", text: "o que tenho quinta?", sources: ["agenda"] },
    { from: "merlin", text: "quinta às 10h, a call com a Ana", sources: ["agenda", "inventado", "dia"] },
    { from: "merlin", text: "sem fonte" }
  ] });
  check("conversa: a resposta guarda as fontes da lista fechada, na ordem dela", JSON.stringify(saved.messages[1].sources) === '["dia","agenda"]', JSON.stringify(saved.messages[1]));
  check("conversa: a fala da pessoa não ganha fontes", !("sources" in saved.messages[0]), JSON.stringify(saved.messages[0]));
  check("conversa: resposta sem fonte continua sem o campo", !("sources" in saved.messages[2]), JSON.stringify(saved.messages[2]));
  check("conversa: a linha volta depois de recarregar", sourcesLine(normalizeChat(saved).messages[1].sources) === "vi o dia e a agenda");
}

/* ---- conteúdo (ticket 13) ----
   a seção do conteúdo: o que falta no ritmo, as atrasadas e os próximos 7
   dias. o roteiro nunca entra. cada bloco roda dentro de `attempt`: se algo
   ainda não existe, falha só aquele bloco (com o motivo), e o resto roda. */
{
  const { DEFAULT_RULE } = await import("./content-script.js");
  const attempt = (name, fn) => { try { fn(); } catch (e) { failures.push(name + " -> lançou: " + e.message); } };

  const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const lab = (day) => { const [y, m, d] = day.split("-").map(Number); return WD[new Date(y, m - 1, d).getDay()] + " " + String(d).padStart(2, "0") + "/" + String(m).padStart(2, "0"); };
  /* o dia daqui a i dias, a partir de hoje (segunda, 19/10/2026) */
  const dayAt = (i) => { const d = new Date(2026, 9, 19 + i); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  let k = 0;
  const pc = (o) => { k++; return { id: "pc" + k, title: "peça " + k, date: "", stage: "idea", format: "reels", client: "", script: "", createdAt: k, ...o }; };
  const ME_DOC = { id: "me", rules: [DEFAULT_RULE] };
  const cSec = (p) => sec(p, "content");
  const cLines = (p) => cSec(p).text.split("\n");
  const CONTENT = () => SECTIONS.find((s) => s.id === "content");

  attempt("contrato da seção", () => {
    const s = CONTENT();
    check("conteúdo: a seção existe em SECTIONS", !!s);
    check("conteúdo: rótulo 'conteúdo' e orçamento 300", !!s && s.label === "conteúdo" && s.budget === 300, JSON.stringify(s && { label: s.label, budget: s.budget }));
    check("conteúdo: depende de conteúdo, ritmo e clientes", !!s && JSON.stringify([...s.needs].sort()) === JSON.stringify(["cadence", "clients", "content"]), JSON.stringify(s && s.needs));
    check("conteúdo: vem depois dos produtos", SECTIONS.findIndex((x) => x.id === "content") > SECTIONS.findIndex((x) => x.id === "products"));
    check("conteúdo: 'conteúdo' é uma fonte da lista fechada", SOURCES.includes("conteúdo"));
  });

  /* ---- a seção: faltas, atrasadas e os próximos 7 dias, nessa ordem ---- */
  attempt("a seção", () => {
    const cadence = [ME_DOC, { id: ANA.id, rules: [{ n: 2, per: "week", format: "reels" }] }];
    const content = [
      pc({ title: "Reels velho Ka", date: "2026-10-17", stage: "edit" }),
      pc({ title: "Carrossel da quinta Lb", date: THU, stage: "script", format: "carousel" }),
      pc({ title: "Reels da Ana Mc", date: "2026-10-24", stage: "idea", format: "reels", client: ANA.id })
    ];
    const data = build({ clients: [ANA], content, cadence });
    const before = JSON.stringify(data);
    const p = portraitOf(data, NOW);
    check("conteúdo: o retrato não altera as peças nem o ritmo", JSON.stringify(data) === before);
    check("conteúdo: a seção está no retrato, sem carregar", !!cSec(p) && cSec(p).loading === false && cSec(p).label === "conteúdo", JSON.stringify(cSec(p)));
    check("conteúdo: o texto abre com o rótulo da seção", p.text.includes("conteúdo:\n" + cSec(p).text));
    const l = cLines(p);
    const gapMe = l.indexOf("seu conteúdo: hoje ainda sem peça · faltam 6 dias nesta semana");
    const gapAna = l.indexOf("Ana: falta 1 reels nesta semana");
    const late = l.findIndex((x) => x.startsWith("atrasadas: "));
    const thu = l.indexOf("qui 22/10 Carrossel da quinta Lb · roteiro · carrossel");
    const sat = l.indexOf("sáb 24/10 Reels da Ana Mc · ideia · Reels");
    check("conteúdo: a falta do próprio ('seu conteúdo: ...')", gapMe >= 0, JSON.stringify(l));
    check("conteúdo: a falta do cliente ('Ana: ...')", gapAna >= 0, JSON.stringify(l));
    check("conteúdo: as atrasadas com a conta, o título e a data", l[late] === "atrasadas: 1 · Reels velho Ka (17/10)", String(l[late]));
    check("conteúdo: a peça de quinta com dia, título, etapa e formato", thu >= 0, JSON.stringify(l));
    check("conteúdo: a peça do cliente também entra nos próximos 7", sat >= 0, JSON.stringify(l));
    check("conteúdo: a ordem é faltas, atrasadas, próximos 7", gapMe < gapAna && gapAna < late && late < thu && thu < sat, [gapMe, gapAna, late, thu, sat].join());
    check("conteúdo: com falta e peças, não diz 'semana coberta' nem 'sem conteúdo'", !/semana coberta|sem conteúdo ainda|nada marcado/.test(cSec(p).text));
    check("conteúdo: cabe no orçamento", cSec(p).text.length <= CONTENT().budget, String(cSec(p).text.length));
    check("conteúdo: a peça de ontem publicada não é atrasada", !cSec(run({ content: [pc({ title: "Publicada Qa", date: "2026-10-18", stage: "published" })], cadence }, NOW)).text.includes("atrasadas"));
  });

  /* ---- sem ritmo e sem peça, e as variações do vazio ---- */
  attempt("o vazio", () => {
    const none = run({});
    check("conteúdo: sem ritmo e sem peça diz 'sem conteúdo ainda'", cSec(none).text === "sem conteúdo ainda" && cSec(none).loading === false, cSec(none).text);

    const quiet = run({ content: [
      pc({ title: "Publicada Qb", date: "2026-10-20", stage: "published" }),
      pc({ title: "Sem data Qc" }),
      pc({ title: "Daqui a 40 dias Qd", date: "2026-11-28" })
    ] });
    check("conteúdo: há peças e nenhuma relevante diz 'nada marcado nos próximos 7 dias'", cSec(quiet).text === "nada marcado nos próximos 7 dias", cSec(quiet).text);
    check("conteúdo: peça de daqui a 8 dias ainda não é dos próximos 7", cSec(run({ content: [pc({ title: "Daqui a 8 Qe", date: dayAt(8) })] })).text === "nada marcado nos próximos 7 dias");

    /* um ritmo semanal já cumprido por uma peça publicada: coberto e nada a mostrar */
    const covered = run({ content: [pc({ date: "2026-10-20", stage: "published", title: "Publicada Qf" })], cadence: [{ id: "me", rules: [{ n: 1, per: "week", format: "" }] }] });
    check("conteúdo: ritmo cumprido e nada relevante diz 'semana coberta'", cLines(covered)[0] === "semana coberta", cSec(covered).text);
    check("conteúdo: 'semana coberta' não convive com 'sem conteúdo ainda'", !cSec(covered).text.includes("sem conteúdo ainda"), cSec(covered).text);

    /* a semana inteira coberta por peças de verdade: a linha vem antes das peças */
    const week = [0, 1, 2, 3, 4, 5, 6].map((i) => pc({ title: "P" + i, date: dayAt(i) }));
    const full = run({ content: week, cadence: [ME_DOC] });
    const l = cLines(full);
    check("conteúdo: semana coberta com peças: a linha vem primeiro", l[0] === "semana coberta", JSON.stringify(l));
    check("conteúdo: e depois uma linha por peça dos próximos 7 dias", l.slice(1).filter((x) => /^(seg|ter|qua|qui|sex|sáb|dom) \d\d\/\d\d P\d · ideia · Reels$/.test(x)).length === 7, JSON.stringify(l));
    check("conteúdo: semana coberta não tem linha de falta", !l.some((x) => /^seu conteúdo:/.test(x)));

    /* ritmo zerado e nenhuma peça: não há ritmo, então é 'sem conteúdo ainda' */
    check("conteúdo: ritmo zerado sem peça diz 'sem conteúdo ainda'", cSec(run({ cadence: [{ id: "me", rules: [] }] })).text === "sem conteúdo ainda");
    /* o próprio sem documento não cobra nada, mesmo com peça solta no futuro */
    check("conteúdo: sem documento de ritmo não há linha de falta", !/seu conteúdo:/.test(cSec(run({ content: [pc({ title: "Solta Qg", date: THU })] })).text));

    /* só a falta, sem peça nenhuma */
    const gapOnly = run({ cadence: [ME_DOC] });
    check("conteúdo: só a falta, sem peças: a linha da falta e nada de 'sem conteúdo ainda'", cLines(gapOnly)[0] === "seu conteúdo: hoje ainda sem peça · faltam 7 dias nesta semana" && !cSec(gapOnly).text.includes("sem conteúdo ainda"), cSec(gapOnly).text);
  });

  /* ---- nunca entra: roteiro, e de cliente só o nome ---- */
  attempt("nunca entra", () => {
    const script = "# roteiro\n## gancho\n- ROTEIRO-SECRETO-XYZ\n## cta\n- LINHA-DO-ROTEIRO-XYZ";
    const client = { ...ANA, note: "NOTA-INTERNA-DO-CLIENTE-XYZ", vault: [{ secret: "SENHA-DO-COFRE-XYZ" }] };
    const content = [
      pc({ title: "Atrasada Ra", date: "2026-10-16", stage: "script", script }),
      pc({ title: "Semana Rb", date: THU, stage: "record", script }),
      pc({ title: "Cliente Rc", date: "2026-10-23", client: client.id, script }),
      pc({ title: "Sem data Rd", script })
    ];
    const cadence = [ME_DOC, { id: client.id, rules: [{ n: 1, per: "day" }] }, { id: "c-sumiu-77", rules: [{ n: 1, per: "week" }] }];
    const p = run({ clients: [client], content, cadence });
    check("nunca entra: o conteúdo veio", cSec(p).text.includes("Semana Rb") && cSec(p).text.includes("Atrasada Ra"), cSec(p).text);
    for (const s of ["ROTEIRO-SECRETO-XYZ", "LINHA-DO-ROTEIRO-XYZ", "## gancho", "## cta", "NOTA-INTERNA-DO-CLIENTE-XYZ", "SENHA-DO-COFRE-XYZ", "ana@segredo.example", "5511999998888"]) {
      check("nunca entra: " + s, !p.text.includes(s), p.text);
    }
    check("nunca entra: o id do cliente não vaza, só o nome", !p.text.includes("c-ana") && cSec(p).text.includes("Ana:"), cSec(p).text);
    check("nunca entra: cliente sem cadastro (ritmo sobrando) não vira id no texto", !p.text.includes("c-sumiu-77"), cSec(p).text);
    check("nunca entra: a peça sem data não é linha de nada", !cSec(p).text.includes("Sem data Rd"));
  });

  /* ---- corte por seção: 30 peças nos próximos 7 dias ---- */
  attempt("corte por seção", () => {
    const budget = CONTENT().budget;
    const title = (i) => "Peça " + String(i).padStart(2, "0") + " com um título comprido para encher a seção " + "y".repeat(12);
    const content = Array.from({ length: 30 }, (_, i) => pc({ title: title(i + 1), date: dayAt(i % 8) }));
    const expected = new Set(content.map((c) => lab(c.date) + " " + c.title + " · ideia · Reels"));
    const p = run({ content });
    const l = cLines(p);
    check("corte conteúdo: o corpo não passa do orçamento", cSec(p).text.length <= budget, cSec(p).text.length + " > " + budget);
    check("corte conteúdo: termina em 'e mais N'", /^e mais \d+$/.test(l.at(-1)), l.at(-1));
    const shown = l.slice(0, -1);
    check("corte conteúdo: nenhum título sai cortado no meio", shown.length > 0 && shown.every((x) => expected.has(x)), shown.find((x) => !expected.has(x)));
    const more = +(l.at(-1).match(/\d+/) || [0])[0];
    check("corte conteúdo: o N é o que ficou de fora", shown.length + more === 30, shown.length + " + " + more);
    check("corte conteúdo: cortou mesmo (o teste não é trivial)", more > 0);

    /* as atrasadas: a conta é inteira, os títulos são poucos e inteiros */
    const olds = Array.from({ length: 6 }, (_, i) => pc({ title: "Velha número " + (i + 1) + " Zq", date: "2026-10-" + String(10 + i), stage: "edit" }));
    const q = run({ content: olds });
    const lateLine = cLines(q).find((x) => x.startsWith("atrasadas: "));
    const named = olds.filter((c) => (lateLine || "").includes(c.title));
    check("corte conteúdo: atrasadas traz a conta inteira", !!lateLine && lateLine.startsWith("atrasadas: 6 · "), String(lateLine));
    check("corte conteúdo: atrasadas mostra de 1 a 3 títulos", named.length >= 1 && named.length <= 3, String(named.length));
    check("corte conteúdo: as atrasadas não passam do orçamento", cSec(q).text.length <= budget, String(cSec(q).text.length));
  });

  /* ---- ainda carregando ---- */
  attempt("carregando: contrato direto", () => {
    const c = run({ loading: ["content"] });
    check("carregando: conteúdo diz 'ainda carregando'", cSec(c).text === "ainda carregando" && cSec(c).loading === true, cSec(c).text);
    check("carregando: não diz 'sem conteúdo ainda' onde não sabe", !/sem conteúdo ainda|nada marcado|semana coberta/.test(c.text), c.text);
    const r = run({ loading: ["cadence"] });
    check("carregando: o ritmo que não desceu também carrega a seção", cSec(r).text === "ainda carregando" && cSec(r).loading === true, cSec(r).text);
    const cl = run({ loading: ["clients"] });
    check("carregando: sem os clientes não dá para nomear as faltas", cSec(cl).loading === true && cSec(cl).text === "ainda carregando");
    const t = run({ loading: ["tasks"] });
    check("carregando: as tarefas não seguram o conteúdo", cSec(t).loading === false && cSec(t).text === "sem conteúdo ainda", cSec(t).text);
    check("carregando: o conteúdo carregando não segura a agenda", sec(c, "agenda").loading === false);
  });
  attempt("carregando: pelas coleções", () => {
    core.cloud.signedIn = true;
    try {
      const cols = { tasks: core.collection("tasks"), content: core.collection("content"), cadence: core.collection("cadence"), clients: core.collection("clients") };
      check("carregando: a coleção de conteúdo de verdade ainda não desceu", cols.content.hasDownloaded() === false);
      const data = portraitData(cols, { signedIn: true, prefs: PREFS });
      check("carregando: com sessão, loading lista conteúdo e ritmo", data.loading.includes("content") && data.loading.includes("cadence"), JSON.stringify(data.loading));
      const p = portraitOf(data, NOW);
      check("carregando: a seção diz 'ainda carregando', e não 'sem conteúdo ainda'", cSec(p).text === "ainda carregando" && cSec(p).loading === true, cSec(p).text);
      const q = portraitOf(portraitData(cols, { signedIn: false, prefs: PREFS }), NOW);
      check("carregando: sem sessão, a seção vazia diz 'sem conteúdo ainda'", cSec(q).text === "sem conteúdo ainda" && cSec(q).loading === false, cSec(q).text);
    } finally { core.cloud.signedIn = false; }
  });

  /* ---- portraitData: o que sai das coleções do conteúdo ---- */
  attempt("portraitData", () => {
    const col = (items, down) => ({ all: () => items, get: () => null, hasDownloaded: () => down });
    const items = [pc({ title: "Da coleção Cz", date: THU, stage: "scheduled" })];
    const docs = [{ id: "me", rules: [{ n: 1, per: "week", format: "" }] }];
    const cols = { tasks: col([], true), content: col(items, true), cadence: col(docs, false), clients: col([ANA], true) };
    const d = portraitData(cols, { signedIn: true, prefs: PREFS });
    check("dados: content vem de all()", Array.isArray(d.content) && d.content.length === 1 && d.content[0].title === "Da coleção Cz", JSON.stringify(d.content));
    check("dados: cadence vem de all()", Array.isArray(d.cadence) && d.cadence.length === 1 && d.cadence[0].id === "me", JSON.stringify(d.cadence));
    check("dados: loading só tem o que não desceu", d.loading.length === 1 && d.loading[0] === "cadence", JSON.stringify(d.loading));
    const off = portraitData(cols, { signedIn: false, prefs: PREFS });
    check("dados: sem sessão, nada carrega e a seção usa as peças", off.loading.length === 0 && /qui 22\/10 Da coleção Cz · agendado · Reels/.test(cSec(portraitOf(off, NOW)).text), cSec(portraitOf(off, NOW)).text);
    const none = portraitData({ tasks: col([], true) }, { signedIn: true, prefs: PREFS });
    check("dados: a tela que não abriu as coleções do conteúdo recebe listas vazias", Array.isArray(none.content) && none.content.length === 0 && Array.isArray(none.cadence) && none.cadence.length === 0, JSON.stringify([none.content, none.cadence]));
  });

  /* ---- corte total com o conteúdo cheio ----
     um cenário à parte do "corte total" lá de cima (que não mexi, para o merge
     com os outros tickets ser fácil): as seções antigas cheias E o conteúdo cheio */
  attempt("corte total com conteúdo", () => {
    const long = (s, i) => s + " " + String(i).padStart(2, "0") + " " + "palavra ".repeat(25).trim();
    const tasks = [
      ...Array.from({ length: 60 }, (_, i) => task({ title: long("Aberta de hoje", i), min: 5 })),
      ...Array.from({ length: 60 }, (_, i) => task({ title: long("Atrasada", i), date: "2026-10-" + String(1 + (i % 17)).padStart(2, "0") })),
      ...Array.from({ length: 40 }, (_, i) => task({ title: long("Quinta", i), date: THU, at: hm(6) + i * 10, min: 30 }))
    ];
    const routine = Array.from({ length: 30 }, (_, i) => block({ title: long("Bloco", i), at: hm(6, i * 5) }));
    const apps = Array.from({ length: 12 }, (_, i) => ({ id: "a" + i, name: "Produto " + i + " " + "n".repeat(280) }));
    const content = [
      ...Array.from({ length: 40 }, (_, i) => pc({ title: long("Peça da semana", i), date: dayAt(i % 8), stage: "record", format: "carousel" })),
      ...Array.from({ length: 20 }, (_, i) => pc({ title: long("Peça atrasada", i), date: "2026-10-" + String(1 + (i % 17)).padStart(2, "0"), stage: "edit" }))
    ];
    const cadence = [ME_DOC, { id: ANA.id, rules: [{ n: 3, per: "week", format: "reels" }] }];
    const p = run({ tasks, routine, apps, content, cadence, clients: [ANA], profile: { focusGoal: 25, meetingCap: 6 } });
    check("corte total + conteúdo: no máximo 6.000 caracteres", p.text.length <= PORTRAIT_MAX, String(p.text.length));
    check("corte total + conteúdo: a seção do conteúdo está no retrato", !!cSec(p), p.sections.map((s) => s.id).join());
    check("corte total + conteúdo: cada seção dentro do orçamento", SECTIONS.every((s) => !sec(p, s.id) || sec(p, s.id).text.length <= s.budget), p.sections.map((s) => s.id + ":" + s.text.length).join(" "));
    check("corte total + conteúdo: o retrato ainda abre pelo dia", p.text.startsWith(SECTIONS[0].label + ":\nagora 14:20"), p.text.slice(0, 80));
    const l = cLines(p);
    check("corte total + conteúdo: a seção cheia diz quanto ficou de fora", /^e mais \d+$/.test(l.at(-1)), l.at(-1));
    const day7 = /^(dom|seg|ter|qua|qui|sex|sáb) \d\d\/\d\d Peça da semana \d\d (palavra ?){25} · gravar · carrossel$/;
    /* a linha de atrasadas: ou só a conta (os títulos não couberam), ou a conta e títulos inteiros */
    const lateOk = (x) => /^atrasadas: \d+$/.test(x) || (/^atrasadas: \d+ · /.test(x) && x.replace(/^atrasadas: \d+ · /, "").split("; ").every((t) => /^Peça atrasada \d\d (palavra ?){25} \(\d\d\/\d\d\)$/.test(t)));
    const ok = (x) => /^(seu conteúdo: |Ana: |e mais \d+$)/.test(x) || (x.startsWith("atrasadas: ") && lateOk(x)) || day7.test(x);
    check("corte total + conteúdo: nenhuma linha do conteúdo sai pela metade", l.every(ok), l.find((x) => !ok(x)));
    check("corte total + conteúdo: a linha de atrasadas diz a conta inteira", (l.find((x) => x.startsWith("atrasadas: ")) || "atrasadas: 20").startsWith("atrasadas: 20"), l.find((x) => x.startsWith("atrasadas: ")));
    check("corte total + conteúdo: as outras seções seguem como antes", /e mais \d+$/.test(sec(p, "today").text) && /e mais \d+$/.test(sec(p, "agenda").text));
  });
}

console.log("\n" + passed + " passaram, " + failures.length + " falharam");
if (failures.length) { console.log("\nFALHAS:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
