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

const build = (o) => ({ tasks: [], routine: [], sessions: [], apps: [], closes: [], clients: [], profile: null, prefs: PREFS, loading: [], ...o });
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

/* ---- sourcesLine: "vi ..." ---- */
{
  check("fontes: duas", sourcesLine(["dia", "agenda"]) === "vi o dia e a agenda", sourcesLine(["dia", "agenda"]));
  check("fontes: uma", sourcesLine(["agenda"]) === "vi a agenda", sourcesLine(["agenda"]));
  check("fontes: nenhuma é vazio", sourcesLine([]) === "", JSON.stringify(sourcesLine([])));
  check("fontes: o dia sozinho", sourcesLine(["dia"]) === "vi o dia", sourcesLine(["dia"]));
  const tres = sourcesLine(["dia", "agenda", "rotina"]);
  check("fontes: três citam as três", /^vi /.test(tres) && tres.includes("o dia") && tres.includes("a agenda") && tres.includes("a rotina") && tres.includes(" e "), tres);
}

console.log("\n" + passed + " passaram, " + failures.length + " falharam");
if (failures.length) { console.log("\nFALHAS:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
