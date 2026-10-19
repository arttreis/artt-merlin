/* testa o guarda de identidade do navegador.
 *
 * e o unico pedaco do cliente que APAGA dado, e apaga sozinho: quando o
 * e-mail da sessao nao e o mesmo da ultima vez, tudo que comeca com "merlin:"
 * sai antes da primeira sincronizacao. errar para um lado sobe o dia de um
 * colega para a conta de outro; errar para o outro joga trabalho fora. os dois
 * erros sao silenciosos na tela — por isso o teste existe aqui e nao no olho.
 *
 * o core e um modulo de navegador, entao o teste monta um navegador de mentira
 * (localStorage, document, location, fetch) e o importa de novo a cada caso,
 * com ?n= na url, porque o modulo guarda estado entre chamadas.
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
  /* o core pinta a barra do navegador ao aplicar o tema; aqui nao ha meta */
  querySelector: () => null
};
/* matchMedia entra porque navegador SEM tema salvo e um estado legitimo — e o
   primeiro de todos. sem ele, so da para testar um navegador que ja escolheu. */
globalThis.window = { addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }) };

let reloaded = 0;
globalThis.location = { reload: () => { reloaded++; } };

/* as respostas que a api dara neste caso. rota que ninguem preparou e erro:
   um teste que faz rede sem querer nao prova nada. */
let answers = {};
let calls = [];
globalThis.fetch = async (url) => {
  const route = String(url).replace(/^\/api/, "").split("?")[0];
  calls.push(route);
  const a = answers[route];
  if (!a) throw new Error("fetch nao previsto no teste: " + url);
  return new Response(JSON.stringify(a.body || {}), {
    status: a.status || 200,
    headers: { "content-type": "application/json" }
  });
};

/* o dia, a caixa e as colecoes: o que tem dono. tema e sidebar: o que nao tem. */
const DATA = {
  "merlin:day": '{"day":"2026-09-08","tasks":[{"title":"o dia da outra pessoa"}]}',
  "merlin:ideas": '{"items":{},"serverV":0,"dirty":[],"refused":{}}',
  "merlin:clients": '{"items":{},"serverV":0,"dirty":[],"refused":{}}',
  "merlin:inbox": '[{"title":"algo"}]'
};
const PREFS = { "merlin:theme": "light", "merlin:sidebar": "closed" };

let n = 0;
/* cada caso comeca de um navegador novo e de um core novo: o modulo guarda a
   sessao e as colecoes em variaveis de escopo, e reaproveita-lo faria um caso
   herdar o estado do anterior. */
async function fresh(seed) {
  globalThis.localStorage = makeStorage(seed);
  reloaded = 0;
  calls = [];
  return import("./core.js?n=" + (++n));
}

const dataLeft = () => globalThis.localStorage.keys().filter((k) => k in DATA);

/* ---- 1. outra pessoa entra: o que era da anterior sai ---- */
{
  const { cloud } = await fresh({ ...PREFS, ...DATA, "merlin:who": "ana@guessless.com.br" });
  answers = { "/me": { body: { signedIn: true, email: "bruno@guessless.com.br" } } };
  await cloud.resume();
  check("troca de pessoa apaga o dado da anterior", dataLeft().length === 0, dataLeft().join(","));
  check("troca de pessoa guarda o novo dono", globalThis.localStorage.getItem("merlin:who") === "bruno@guessless.com.br");
  check("troca de pessoa recarrega a pagina", reloaded === 1, String(reloaded));
  /* preferencia nao e dado: quem herda a maquina herda o tema, nao o dia */
  check("o tema atravessa a troca", globalThis.localStorage.getItem("merlin:theme") === "light");
  check("a sidebar atravessa a troca", globalThis.localStorage.getItem("merlin:sidebar") === "closed");
  /* a garantia que importa: a limpeza vem ANTES de qualquer sincronizacao.
     se `resume` deixasse passar, /docs e /days entrariam nesta lista e o
     documento da Ana teria subido para a conta do Bruno. */
  check("troca de pessoa nao toca em dado antes de limpar", calls.join(",") === "/me", calls.join(","));
  check("a sessao nao fica de pe na tela do outro", cloud.signedIn === true && cloud.email === "bruno@guessless.com.br");
}

/* ---- 2. a mesma pessoa nao perde nada ---- */
{
  const { cloud } = await fresh({ ...PREFS, ...DATA, "merlin:who": "ana@guessless.com.br" });
  answers = { "/me": { body: { signedIn: true, email: "ana@guessless.com.br" } } };
  await cloud.resume();
  check("a mesma pessoa mantem o dado", dataLeft().length === Object.keys(DATA).length, dataLeft().join(","));
  check("a mesma pessoa nao recarrega", reloaded === 0, String(reloaded));
}

/* ---- 3. o primeiro login leva o que ja estava aqui ----
   quem usou o Merlin solto e so depois entrou fez aquele trabalho para si:
   apagar seria roubar o proprio dono. */
{
  const { cloud } = await fresh({ ...PREFS, ...DATA });
  answers = { "/me": { body: { signedIn: true, email: "ana@guessless.com.br" } } };
  await cloud.resume();
  check("primeiro login guarda o que era local", dataLeft().length === Object.keys(DATA).length, dataLeft().join(","));
  check("primeiro login anota o dono", globalThis.localStorage.getItem("merlin:who") === "ana@guessless.com.br");
  check("primeiro login nao recarrega", reloaded === 0, String(reloaded));
}

/* ---- 4. sem sessao nada e apagado ---- */
{
  const { cloud } = await fresh({ ...PREFS, ...DATA, "merlin:who": "ana@guessless.com.br" });
  answers = { "/me": { body: { signedIn: false } } };
  await cloud.resume();
  check("sem sessao o dado local fica", dataLeft().length === Object.keys(DATA).length, dataLeft().join(","));
  check("sem sessao nao recarrega", reloaded === 0, String(reloaded));
}

/* ---- 5. entrar pela caixa com outro e-mail tambem limpa ----
   e o caminho de verdade num computador dividido: o colega nao espera o /me,
   ele digita o proprio e-mail com a sessao do outro ainda de pe. */
{
  const { signIn } = await fresh({ ...PREFS, ...DATA, "merlin:who": "ana@guessless.com.br" });
  answers = { "/sign-in": { body: { ok: true, email: "bruno@guessless.com.br" } } };
  const r = await signIn.submitCode("bruno@guessless.com.br", "123456");
  check("entrar por outro e-mail da certo", r.ok === true);
  check("entrar por outro e-mail apaga o dado da anterior", dataLeft().length === 0, dataLeft().join(","));
  check("entrar por outro e-mail recarrega", reloaded === 1, String(reloaded));
  check("entrar por outro e-mail nao sincroniza antes de limpar", calls.join(",") === "/sign-in", calls.join(","));
}

/* ---- 6. sair de um navegador em dia nao deixa nada ---- */
{
  const { cloud } = await fresh({ ...PREFS, ...DATA, "merlin:who": "ana@guessless.com.br" });
  answers = { "/me": { body: { signedIn: true, email: "ana@guessless.com.br" } }, "/sign-out": { body: { ok: true } } };
  await cloud.resume();
  await cloud.signOut();
  check("sair apaga o dado", dataLeft().length === 0, dataLeft().join(","));
  check("sair solta o dono", !globalThis.localStorage.has("merlin:who"));
  check("sair guarda a preferencia", globalThis.localStorage.getItem("merlin:theme") === "light");
  check("sair recarrega", reloaded === 1, String(reloaded));
}

/* ---- 7. sair com coisa por subir nao apaga nada ----
   deixar dado numa maquina e ruim; jogar trabalho fora e pior. e a proxima
   pessoa a entrar apaga isso de qualquer jeito (caso 1). */
{
  const { cloud, collection } = await fresh({ ...PREFS, "merlin:who": "ana@guessless.com.br" });
  answers = { "/me": { body: { signedIn: true, email: "ana@guessless.com.br" } }, "/sign-out": { body: { ok: true } } };
  /* grava com a sessao ainda fechada: o documento fica sujo sem tentar rede */
  const ideas = collection("ideas");
  ideas.save({ id: "i1", title: "escrito sem rede" });
  check("o documento gravado fica pendente", ideas.pending() === true);
  cloud.signedIn = true;
  cloud.setStatus("synced");
  await cloud.signOut();
  check("sair com pendencia guarda o dado", globalThis.localStorage.has("merlin:ideas"));
  check("sair com pendencia guarda o dono", globalThis.localStorage.getItem("merlin:who") === "ana@guessless.com.br");
  check("sair com pendencia nao recarrega", reloaded === 0, String(reloaded));
}

/* ---- 8. sair sem rede tambem segura ----
   offline e "pode haver coisa aqui que la nao tem": o dia nao guarda fila de
   sujos, entao o estado da nuvem e o que responde por ele. */
{
  const { cloud } = await fresh({ ...PREFS, ...DATA, "merlin:who": "ana@guessless.com.br" });
  answers = { "/me": { body: { signedIn: true, email: "ana@guessless.com.br" } }, "/sign-out": { body: { ok: true } } };
  await cloud.resume();
  cloud.setStatus("offline");
  await cloud.signOut();
  check("sair sem rede guarda o dado", dataLeft().length === Object.keys(DATA).length, dataLeft().join(","));
}

/* ---- 9. a varredura pega chave que ninguem listou ----
   e o ponto do metodo: o modulo que alguem escrever amanha ja nasce sendo
   apagado, sem depender de alguem lembrar de uma lista. */
{
  const { cloud } = await fresh({
    ...PREFS,
    "merlin:who": "ana@guessless.com.br",
    "merlin:modulo-que-ainda-nao-existe": '{"segredo":"da ana"}',
    "outracoisa:x": "nao e do merlin"
  });
  answers = { "/me": { body: { signedIn: true, email: "bruno@guessless.com.br" } } };
  await cloud.resume();
  check("apaga chave de modulo novo sem lista", !globalThis.localStorage.has("merlin:modulo-que-ainda-nao-existe"));
  check("nao mexe no que nao e do merlin", globalThis.localStorage.getItem("outracoisa:x") === "nao e do merlin");
}

/* ---- 10. a marca segue o domínio de quem entrou ----
   é só pele: nenhum dado muda. o que importa aqui é que ela seja gravada
   ANTES do recarregamento — a página que volta tem que já nascer pintada. */
{
  const { cloud, currentBrand } = await fresh({ ...PREFS });
  answers = { "/me": { body: { signedIn: true, email: "ana@guessless.com.br" } } };
  await cloud.resume();
  check("quem é da casa veste a casa", currentBrand() === "gl", currentBrand());
}
{
  const { cloud, currentBrand } = await fresh({ ...PREFS });
  answers = { "/me": { body: { signedIn: true, email: "arthurcastilhos@gmail.com" } } };
  await cloud.resume();
  check("quem não é da casa fica no Merlin", currentBrand() === "", currentBrand());
}
{
  /* o caso que justifica gravar a marca junto com o dono: a pessoa da casa
     entra num navegador que era de fora. a limpeza roda, e a marca tem que
     estar escrita quando a página voltar — senão ela pisca em verde. */
  const { signIn, currentBrand } = await fresh({ ...PREFS, ...DATA, "merlin:who": "arthurcastilhos@gmail.com" });
  answers = { "/sign-in": { body: { ok: true, email: "ana@guessless.com.br" } } };
  await signIn.submitCode("ana@guessless.com.br", "123456");
  check("a marca sobrevive à limpeza", currentBrand() === "gl", currentBrand());
  check("a limpeza aconteceu mesmo assim", dataLeft().length === 0, dataLeft().join(","));
}
{
  /* e o inverso: sair leva a marca junto, senão o próximo a abrir este
     navegador veria a pele de quem saiu. */
  const { cloud, currentBrand } = await fresh({ ...PREFS, "merlin:who": "ana@guessless.com.br", "merlin:brand": "gl" });
  answers = { "/me": { body: { signedIn: true, email: "ana@guessless.com.br" } } }; answers["/sign-out"] = { body: { ok: true } };
  await cloud.resume();
  await cloud.signOut();
  check("sair leva a marca junto", currentBrand() === "", currentBrand());
}

{
  /* ---- ideias viraram notas ----
     a mudança de nome copia documento entre coleções, e é o único lugar do
     cliente que grava sem carimbar. o que estes casos protegem não é a cópia
     (essa é fácil): é a janela entre dois aparelhos que migram em momentos
     diferentes, em que o atrasado carrega uma cópia velha da nuvem. */
  const ideas = (items) => JSON.stringify({ items, serverV: 0, dirty: [], refused: {} });
  const note = (id, v, title) => ({ v, doc: { id, v, title, body: "", stage: "seed", steps: [], files: [], outputs: [], history: [], createdAt: v - 1, updatedAt: v } });

  {
    const { migrateNotes, collection } = await fresh({
      "merlin:ideas": ideas({ a: note("a", 1000, "frete grátis"), b: note("b", 2000, "série de reels") })
    });
    migrateNotes(true);
    const all = collection("notes").entries().sort((x, y) => x.v - y.v);
    check("a migração copia as notas", all.length === 2, String(all.length));
    check("a migração PRESERVA o carimbo", all[0].v === 1000 && all[1].v === 2000, JSON.stringify(all.map((e) => e.v)));
    check("a migração preserva o conteúdo", all[0].doc.title === "frete grátis", all[0].doc.title);
    check("a coleção antiga fica de arquivo", localStorage.has("merlin:ideas"));
    check("a migração deixa as notas para subir", collection("notes").pending());
  }

  {
    /* o caso que justifica o adopt existir. este navegador já migrou e editou;
       um segundo, atrasado, migra depois com a cópia velha da nuvem. sem
       preservar o carimbo, a cópia velha ganharia por ser a gravação mais
       recente — e a edição sumiria sem ninguém ver. */
    const { migrateNotes, collection } = await fresh({
      "merlin:ideas": ideas({ a: note("a", 1000, "a cópia velha da nuvem") }),
      "merlin:notes": ideas({ a: note("a", 5000, "editada depois de migrar") })
    });
    migrateNotes(true);
    check("migração atrasada não sobrescreve o que é mais novo",
      collection("notes").get("a").title === "editada depois de migrar",
      collection("notes").get("a").title);
  }

  {
    /* e o contrário: o que a nuvem trouxe DEPOIS da migração local ainda entra */
    const { migrateNotes, collection } = await fresh({
      "merlin:ideas": ideas({ a: note("a", 9000, "a versão nova, vinda de fora") }),
      "merlin:notes": ideas({ a: note("a", 1000, "a que este navegador tinha") })
    });
    migrateNotes(true);
    check("a versão mais nova da coleção antiga entra",
      collection("notes").get("a").title === "a versão nova, vinda de fora",
      collection("notes").get("a").title);
  }

  {
    /* a marca só é posta quando a fonte está completa. com sessão e sem o
       download da coleção antiga, migrar metade e marcar feito perderia o
       resto para sempre. */
    const { migrateNotes, cloud } = await fresh({ "merlin:ideas": ideas({ a: note("a", 1000, "x") }) });
    cloud.signedIn = true;
    migrateNotes(true);
    check("com sessão e sem download, não marca como migrado", !localStorage.has("merlin:renamed:notes"));
    cloud.signedIn = false;
    migrateNotes(true);
    check("sem sessão, marca como migrado", localStorage.has("merlin:renamed:notes"));
  }

  {
    /* rodar antes da primeira pintura é o que faz a tela nascer certa; rodar
       de novo depois não pode custar nada nem desfazer o que se editou no meio. */
    const { migrateNotes, collection } = await fresh({ "merlin:ideas": ideas({ a: note("a", 1000, "original") }) });
    migrateNotes();
    check("a passada de antes da pintura já copia", collection("notes").entries().length === 1);
    check("e não marca como migrado sozinha", !localStorage.has("merlin:renamed:notes"));
    const doc = collection("notes").get("a");
    collection("notes").save({ ...doc, title: "editada no meio" });
    migrateNotes(true);
    check("a segunda passada não desfaz a edição", collection("notes").get("a").title === "editada no meio", collection("notes").get("a").title);
  }

  {
    /* sem duração, o que se manda para o dia vira nota na hora. antes ele ia
       para um bilhete que só era recolhido quando day.html abrisse — e até lá
       não existia em lugar nenhum que a busca alcançasse. */
    const { sendToDay, collection, readInbox } = await fresh({});
    sendToDay({ title: "testar frete grátis" });
    check("sem duração vira nota na hora", collection("notes").entries().length === 1, String(collection("notes").entries().length));
    check("sem duração não passa pela caixa de entrada", readInbox().length === 0, String(readInbox().length));
    sendToDay({ title: "gravar o vídeo", min: 90 });
    check("com duração continua na caixa de entrada", readInbox().length === 1, String(readInbox().length));
    check("com duração não vira nota", collection("notes").entries().length === 1, String(collection("notes").entries().length));
  }

  {
    /* newNote aceita o id de quem chama (a caixa de entrada); sem id, gera um */
    const { newNote, collection } = await fresh({});
    check("newNote: com id grava a nota com esse id", newNote({ title: "x", id: "n1" }).id === "n1" && !!collection("notes").get("n1"));
    const semId = newNote({ title: "x" });
    check("newNote: sem id ganha um id novo", typeof semId.id === "string" && semId.id.length > 0 && semId.id !== "n1", semId.id);
  }
}

{
  /* ---- a junção do dia com a semana ----
     é a migração mais arriscada que este sistema já fez: duas coleções viram
     uma, e o que estava dos dois lados era, às vezes, a MESMA tarefa — o
     cartão da semana e a cópia dele que o "puxar" tinha criado no dia. juntar
     errado significa ou perder trabalho ou duplicar cada tarefa puxada.

     mergeInto é função pura de propósito: ela é o único lugar onde essa
     decisão mora, e dá para prová-la sem navegador nenhum. */
  const load = async () => {
    globalThis.localStorage = makeStorage({});
    return import("./tasks.js?n=" + (++n));
  };
  const entry = (id, doc, v) => ({ v, doc: { id, ...doc } });

  {
    const { mergeInto } = await load();
    const r = mergeInto([entry("c1", { title: "gravar", day: "2026-09-08", min: 90, order: 3 }, 111)], []);
    check("o cartão vira tarefa com a data dele", r.adopted[0].date === "2026-09-08", r.adopted[0].date);
    check("e preserva o carimbo, que é o que protege dois aparelhos", r.adopted[0].v === 111, String(r.adopted[0].v));
    check("nada do dia foi inventado", r.saved.length === 0, String(r.saved.length));
  }

  {
    /* o fim de semana era UMA coluna com a data da segunda: sábado é a
       primeira data real que aquela coluna representava. */
    const { mergeInto } = await load();
    const r = mergeInto([entry("c1", { title: "feira", day: "weekend:2026-09-07" }, 1)], []);
    check("o fim de semana vira sábado", r.adopted[0].date === "2026-09-12", r.adopted[0].date);
  }

  {
    /* o caso que motivou tudo: a tarefa do dia que veio de um cartão não pode
       virar uma segunda tarefa. ela devolve ao cartão o que aprendeu. */
    const { mergeInto } = await load();
    const day = { day: "2026-09-09", tasks: [{ id: "t1", title: "gravar", min: 45, done: true, origin: { type: "week", id: "c1" } }] };
    const r = mergeInto([entry("c1", { title: "gravar", day: "2026-09-08", min: 0 }, 1)], [day]);
    check("a cópia não vira uma segunda tarefa", r.saved.length === 0, String(r.saved.length));
    check("o cartão herda a data em que foi puxada", r.adopted[0].date === "2026-09-09", r.adopted[0].date);
    check("o cartão herda a duração que o pedágio cobrou", r.adopted[0].min === 45, String(r.adopted[0].min));
    check("e herda a conclusão", r.adopted[0].done === true);
  }

  {
    /* tarefa escrita direto no dia não tem cartão nenhum: ela vira tarefa, e
       a posição na fila vira o campo `order` — era ela a prioridade. */
    const { mergeInto } = await load();
    const day = { day: "2026-09-09", tasks: [{ id: "a", title: "primeira" }, { id: "b", title: "segunda" }] };
    const r = mergeInto([], [day]);
    check("a tarefa do dia vira tarefa", r.saved.length === 2, String(r.saved.length));
    check("a ordem da fila vira o campo order", r.saved[0].order === 0 && r.saved[1].order === 1);
    check("com a data do documento", r.saved[0].date === "2026-09-09", r.saved[0].date);
  }

  {
    /* a grade de horas da semana: quem tem hora fica na hora, o resto entra
       em fila a partir do começo da janela e desvia de quem tem hora. */
    const { normalize, layoutDay, readClock } = await load();
    const t = (id, extra) => normalize({ id, title: id, date: "2026-09-14", ...extra });
    check("o horário é opcional e nasce vazio", t("a").at === null);
    check("o horário guarda minutos desde a meia-noite", t("a", { at: 570 }).at === 570);
    check("zero é meia-noite, e não 'sem horário'", t("a", { at: 0 }).at === 0);
    check("horário fora do dia não entra", t("a", { at: 1440 }).at === null && t("a", { at: -5 }).at === null);

    const blocks = layoutDay([
      t("reuniao", { at: 600, min: 60, reserved: true }),
      t("primeira", { min: 45, order: 0 }),
      t("segunda", { min: 30, order: 1 })
    ], { start: 540, guess: 30 });
    const at = (id) => blocks.find((b) => b.t.id === id);
    check("o que tem hora fica na hora", at("reuniao").from === 600 && at("reuniao").to === 660);
    check("a fila começa no início da janela", at("primeira").from === 540, String(at("primeira").from));
    check("e desvia da reunião em vez de cair em cima dela", at("segunda").from === 660, String(at("segunda").from));
    check("sem sobreposição, cada um ocupa a largura inteira", blocks.every((b) => b.cols === 1));

    const clash = layoutDay([t("x", { at: 600, min: 60 }), t("y", { at: 630, min: 60 })], { start: 540 });
    check("dois com hora sobrepostos dividem a largura", clash.every((b) => b.cols === 2) && clash[0].col !== clash[1].col);
    check("sem duração, ocupa o palpite", layoutDay([t("z", {})], { start: 540, guess: 40 })[0].to === 580);
    const withRoutine = layoutDay([
      t("daily", { min: 60, reserved: true, origin: { type: "routine", id: "r1" } }),
      t("tarefa", { min: 30 })
    ], { start: 540 });
    const rAt = (id) => withRoutine.find((b) => b.t.id === id);
    check("a rotina sem hora não invade a fila: a tarefa vem antes", rAt("tarefa").from === 540 && rAt("daily").from === 570, rAt("tarefa").from + "/" + rAt("daily").from);

    check("readClock: 9h30", readClock("9h30") === 570);
    check("readClock: 09:30", readClock("09:30") === 570);
    check("readClock: 930", readClock("930") === 570);
    check("readClock: 14", readClock("14") === 840);
    check("readClock: vazio é sem hora", readClock("") === null);
    check("readClock: 25h não é hora", readClock("25h") === undefined);
  }

  {
    /* a rotina: o bloco se copia uma vez por semana, nunca para trás, e mudar
       o bloco só mexe no que ninguém mexeu. a semana de 13/09/2026 começa no
       domingo 13; "hoje" nos casos é a quarta, 16. */
    await load();
    const R = await import("./routine.js?n=" + (++n));
    const { normalize: task } = await import("./tasks.js?n=" + n);
    const now = "2026-09-16", week = "2026-09-13";
    const block = R.normalize({ id: "b1", title: "daily", days: [1, 3, 5], at: 540, min: 15, reserved: true });

    const s = R.spawnWeek([block], [], week, now);
    check("rotina: dia que já passou não ganha cópia", s.tasks.length === 2, s.tasks.map((t) => t.date).join(","));
    check("rotina: a cópia cai no dia da semana, com a hora do bloco", s.tasks[0].date === "2026-09-16" && s.tasks[0].at === 540 && s.tasks[0].reserved);
    check("rotina: a cópia carrega o fio", R.isCopyOf(s.tasks[0], "b1"));
    check("rotina: o bloco ganha a marca da semana", s.blocks[0].weeks[week] === true);
    check("rotina: semana marcada não copia de novo (apagar não ressuscita)", R.spawnWeek(s.blocks, [], week, now).tasks.length === 0);
    check("rotina: semana passada não ganha nada", R.spawnWeek([block], [], "2026-09-06", now).tasks.length === 0);
    check("rotina: cópia que chegou de outro aparelho não duplica",
      R.spawnWeek([block], s.tasks, week, now).tasks.length === 0);

    const marked = s.blocks[0];
    const moved = task({ ...s.tasks[1], at: 660 });           /* a sexta foi empurrada para as 11h */
    const tasks = [s.tasks[0], moved];
    const after = { ...marked, title: "daily do time", days: [1, 3, 4] };
    const p = R.propagate(marked, after, tasks, now);
    check("rotina: mudar o bloco muda a cópia intocada", p.save.length === 1 && p.save[0].title === "daily do time");
    check("rotina: a cópia mexida fica como está", !p.save.some((t) => t.id === moved.id) && !p.remove.includes(moved.id));
    check("rotina: dia que entrou ganha cópia na semana já copiada", p.create.length === 1 && p.create[0].date === "2026-09-17", p.create.map((t) => t.date).join(","));
    const q = R.propagate(marked, { ...marked, days: [1, 5] }, [s.tasks[0]], now);
    check("rotina: dia que saiu leva a cópia intocada", q.remove.length === 1 && q.remove[0] === s.tasks[0].id);
    check("rotina: apagar o bloco leva só o intocado", R.orphansOf(marked, tasks, now).length === 1);

    const mon = task({ id: "m", title: "weekly", date: "2026-09-07", at: 600, min: 60, recurring: true });
    const tue = task({ id: "t", title: "weekly", date: "2026-09-08", at: 600, min: 60, recurring: true });
    const copy = task({ id: "c", title: "weekly", date: "2026-09-14", at: 600, min: 60, recurring: true, recurringSource: "m" });
    const lone = task({ id: "o", title: "órfã", date: "2026-09-14", recurring: true, recurringSource: "sumiu" });
    const m = R.fromRecurring([mon, tue, copy, lone]);
    check("rotina: mães iguais viram um bloco com vários dias", m.blocks.length === 1 && m.blocks[0].days.join() === "1,2");
    check("rotina: o id do bloco sai da mãe", m.blocks[0].id === "r-m");
    check("rotina: a semana da cópia já conta como copiada", m.blocks[0].weeks[week] === true);
    check("rotina: mães e cópias perdem o selo e ganham o fio",
      m.tasks.filter((t) => t.id !== "o").every((t) => !t.recurring && R.isCopyOf(t, "r-m")));
    check("rotina: cópia sem mãe só perde o selo", m.tasks.some((t) => t.id === "o" && !t.recurring && !t.origin));
    check("rotina: rodar de novo não acha mais nada", R.fromRecurring(m.tasks).blocks.length === 0);
    check("evento: o que veio do 'toda semana' é evento", m.blocks[0].kind === "event");
    check("evento: reunião sem cliente é evento", R.kindOf({ id: "x", title: "weekly", reserved: true }) === "event");
    check("rotina: almoço é rotina, mesmo sendo pausa", R.kindOf({ id: "x", title: "almoço", reserved: true }) === "routine");
    check("rotina: o kind gravado vence o palpite", R.kindOf({ id: "r-1", kind: "routine" }) === "routine");
    check("rotina: acordar é rotina mesmo vindo do 'toda semana'", R.kindOf({ id: "r-2", title: "acordar" }) === "routine");
    {
      const b = R.normalize({ id: "b1", title: "weekly", days: [1], weeks: {} });
      const cp = (id, date, done) => ({ id, date, done: !!done, origin: { type: "routine", id: "b1" } });
      const tasks = [cp("a", "2026-09-07", true), cp("b", "2026-09-14"), cp("c", "2026-09-21"), cp("d", "2026-09-28")];
      const e = R.endFrom(b, tasks, "2026-09-21");
      check("este e os próximos: tira as cópias do dia em diante", e.remove.join() === "c,d", e.remove.join());
      check("este e os próximos: o bloco para de copiar no dia", e.block.until === "2026-09-21");
      const spawned = R.spawnWeek([R.normalize(e.block)], [], "2026-09-20", "2026-09-14");
      check("bloco encerrado não gera cópia depois do fim", spawned.tasks.length === 0);
      check("todos: tira as não concluídas e deixa a concluída", R.allCopiesOf(b, tasks).join() === "b,c,d");
    }
  }

  {
    /* dois aparelhos: cada um tem o seu merlin:day, e os dois são lidos. sem
       isso, migrar num navegador deixaria para trás a fila que ficou no outro. */
    const { mergeInto } = await load();
    const r = mergeInto([], [
      { day: "2026-09-08", tasks: [{ id: "a", title: "de ontem" }] },
      { day: "2026-09-09", tasks: [{ id: "b", title: "de hoje" }] }
    ]);
    check("os dias de todos os aparelhos entram", r.saved.length === 2, String(r.saved.length));
  }

  {
    /* o túmulo de um cartão apagado não pode ressuscitar como tarefa */
    const { mergeInto } = await load();
    const r = mergeInto([entry("c1", { deleted: true }, 9), entry("c2", { title: "" }, 9)], []);
    check("cartão apagado não volta", r.adopted.length === 0, String(r.adopted.length));
  }
}

{
  /* ---- este navegador é novo? ----
     a resposta decide se o início mostra a porta ou a casa, e errar para um
     lado esconde o trabalho de quem já usa atrás de uma página de marketing.
     errar para o outro é só não mostrar a porta — barato. por isso todos os
     casos abaixo empurram para "não é novo". */
  const col = (n) => {
    const items = {};
    for (let i = 0; i < n; i++) items["x" + i] = { v: 1, doc: { id: "x" + i } };
    return JSON.stringify({ items, serverV: 0, dirty: [], refused: {} });
  };

  {
    const { isNewHere } = await fresh({});
    check("navegador vazio é novo", isNewHere());
  }
  {
    const { isNewHere } = await fresh({ ...PREFS });
    check("tema e sidebar não são trabalho", isNewHere());
  }
  {
    /* o caso que mais custa errar: merlin:seen é escrito ao FECHAR a
       apresentação. contá-lo faria a porta sumir para sempre no primeiro Esc
       de quem acabou de chegar. */
    const { isNewHere } = await fresh({ "merlin:seen": '["tour"]' });
    check("ter fechado a apresentação não é trabalho", isNewHere());
  }
  {
    const { isNewHere } = await fresh({ "merlin:notes": col(1) });
    check("uma nota já não é novo", !isNewHere());
  }
  {
    const { isNewHere } = await fresh({ "merlin:notes": col(0) });
    check("coleção vazia continua novo", isNewHere());
  }
  {
    const { isNewHere } = await fresh({ "merlin:day": '{"day":"2026-09-08","tasks":[{"title":"algo"}]}' });
    check("uma tarefa no dia já não é novo", !isNewHere());
  }
  {
    const { isNewHere } = await fresh({ "merlin:day": '{"day":"2026-09-08","tasks":[]}' });
    check("dia sem tarefa continua novo", isNewHere());
  }
  {
    const { isNewHere } = await fresh({ "merlin:inbox": '[{"title":"algo"}]' });
    check("bilhete na caixa de entrada já não é novo", !isNewHere());
  }
  {
    const { isNewHere } = await fresh({ "merlin:who": "arthur@exemplo.com" });
    check("quem já entrou aqui não é novo", !isNewHere());
  }
  {
    const { isNewHere } = await fresh({ "merlin:bookmarks": col(2) });
    check("favoritos contam como trabalho", !isNewHere());
  }
  {
    /* lixo no localStorage não pode derrubar a decisão */
    const { isNewHere } = await fresh({ "merlin:notes": "{isso nao e json" });
    check("chave corrompida não quebra a pergunta", isNewHere());
  }

  /* ---- a porta decidida no <head> ----
     a landing é HTML escrito no index.html, e um script no <head> decide se
     ela aparece antes da primeira pintura, com uma miniatura do isNewHere().
     se as duas discordarem, quem já usa vê a landing piscar antes da casa, ou
     quem chega vê a casa piscar antes da porta. a lista de coleções que a
     miniatura conhece tem que ser a do core: ela é lida do próprio core.js. */
  {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    const door = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes("merlin:seen"));
    check("o index.html decide a porta no <head>", !!door);
    const core = fs.readFileSync(path.join(root, "src", "shared", "core.js"), "utf8");
    const types = JSON.parse(core.match(/const PURGE_TYPES = (\[[^\]]*\])/)[1]);
    const headOpens = (seed) => {
      const added = [];
      const doc = { documentElement: { classList: { add: (c) => added.push(c) }, setAttribute: () => {} } };
      new Function("document", "localStorage", door)(doc, makeStorage(seed));
      return added.includes("bare");
    };
    const seeds = [
      {}, { ...PREFS }, { "merlin:seen": '["tour"]' }, { "merlin:seen": '["landing"]' },
      { "merlin:who": "arthur@exemplo.com" }, { "merlin:notes": col(0) }, { "merlin:notes": "{isso nao e json" },
      { "merlin:day": '{"day":"2026-09-08","tasks":[{"title":"algo"}]}' }, { "merlin:day": '{"day":"2026-09-08","tasks":[]}' },
      { "merlin:inbox": '[{"title":"algo"}]' }, { "merlin:inbox": "[]" },
      ...types.map((t) => ({ ["merlin:" + t]: col(1) }))
    ];
    for (const seed of seeds) {
      const c = await fresh(seed);
      const want = c.isNewHere() && !c.seen("landing");
      check("o <head> e o core concordam sobre a porta: " + (Object.keys(seed).join(",") || "vazio"), headOpens(seed) === want, "head " + headOpens(seed) + ", core " + want);
    }

    /* os números da faixa e dos cartões são escritos à mão no HTML; eles
       envelhecem em silêncio se ninguém os conferir contra os modelos */
    const T = await import("./templates.js");
    const funnels = [...html.matchAll(/(\d+) (?:funis|modelos) prontos/g)].map((m) => +m[1]);
    const maps = [...html.matchAll(/(\d+) mapas prontos/g)].map((m) => +m[1]);
    check("a landing conta os funis que existem", funnels.length >= 2 && funnels.every((x) => x === T.FUNNEL_TEMPLATES.length), funnels.join(",") + " de " + T.FUNNEL_TEMPLATES.length);
    check("a landing conta os mapas que existem", maps.length >= 1 && maps.every((x) => x === T.MAP_TEMPLATES.length), maps.join(",") + " de " + T.MAP_TEMPLATES.length);

    /* a medição (Cloudflare Web Analytics) é da vitrine: quem já usa o
       Merlin abre o início no mesmo endereço e não pode entrar na conta */
    const beacon = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes("cloudflareinsights"));
    const measures = (bare) => {
      const added = [];
      const doc = {
        documentElement: { classList: { contains: (c) => bare && c === "bare" } },
        createElement: () => ({ setAttribute() {} }),
        head: { appendChild: (el) => added.push(el) }
      };
      new Function("document", beacon)(doc);
      return added.length === 1 && /cloudflareinsights/.test(added[0].src);
    };
    check("a medição carrega para quem está na porta", !!beacon && measures(true));
    check("a medição não carrega para quem já usa o Merlin", !!beacon && !measures(false));

    /* e a Cloudflare não injeta o beacon dela nas páginas: no-transform nas
       da raiz, e só nelas — em /assets/* ele tiraria a compressão do JS */
    const headers = fs.readFileSync(path.join(root, "public", "_headers"), "utf8");
    const rules = {};
    let at = null;
    headers.split("\n").forEach((line) => {
      if (!line.trim() || line.trim().startsWith("#")) return;
      if (!/^\s/.test(line)) { at = line.trim(); rules[at] = rules[at] || []; } else if (at) rules[at].push(line.trim());
    });
    const blocks = (p) => (rules[p] || []).some((h) => /^cache-control:.*no-transform/i.test(h));
    check("as páginas pedem para a Cloudflare não injetar nada", blocks("/") && blocks("/:page"), Object.keys(rules).join(" "));
    check("o JS e o CSS continuam comprimidos", Object.keys(rules).every((p) => !(p === "/*" || p.startsWith("/assets")) || !blocks(p)), Object.keys(rules).join(" "));
  }

  /* ---- o endereço de um favorito ----
     ele vira href de um <a> e destino de um location.href na busca: um
     "javascript:" que entrasse por aqui seria execução num clique. */
  {
    const { safeUrl, hostOf } = await fresh({ ...PREFS });
    check("domínio pelado ganha https", safeUrl("mercadolivre.com.br") === "https://mercadolivre.com.br/", safeUrl("mercadolivre.com.br"));
    check("http passa", safeUrl("http://x.com/a") === "http://x.com/a");
    check("javascript: é recusado", safeUrl("javascript:alert(1)") === "", safeUrl("javascript:alert(1)"));
    check("data: é recusado", safeUrl("data:text/html,<script>") === "");
    check("vazio é vazio", safeUrl("   ") === "");
    check("o host sai sem www", hostOf("https://www.mercadolivre.com.br/x") === "mercadolivre.com.br", hostOf("https://www.mercadolivre.com.br/x"));
    check("host de lixo é vazio", hostOf("nada disso") === "");
  }
}


{
  /* ---- nenhum CSS de página redeclara um token do comum ----
     este é o único teste do arquivo que lê o disco em vez de rodar o core, e
     ele existe por um bug que passou despercebido por horas.

     o `day.css` tinha uma cópia do `:root` inteiro — sobra de quando o dia era
     um HTML solto e precisava se bastar. Enquanto tudo era uma folha só ela era
     inofensiva: o `:root` (0,1,0) perdia de `html.light` e `html.gl` (0,1,1)
     por especificidade. No dia em que o comum entrou numa camada de cascata a
     conta virou — regra SEM camada ganha de regra EM camada, sempre — e o dia
     ficou preso no escuro do Merlin, sem tema claro e sem a marca da casa,
     sozinho entre as onze telas. E não dava para ver: quem usa o tema escuro
     do Merlin, que é o padrão, não notava nada.

     a regra que este teste protege é curta: token do sistema se declara num
     lugar só, e esse lugar é o shell.css. */
  const fs = await import("node:fs");
  const path = await import("node:path");
  /* fileURLToPath, e nao .pathname: numa pasta com espaco o pathname vem com %20 */
  const { fileURLToPath } = await import("node:url");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = path.join(here, "..");

  const tokensOf = (text) => new Set([...text.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  /* só o primeiro :root do shell — o que define o vocabulário do sistema */
  const shell = fs.readFileSync(path.join(here, "shell.css"), "utf8");
  const rootBlock = shell.slice(shell.indexOf(":root{"), shell.indexOf("}", shell.indexOf(":root{")));
  const common = tokensOf(rootBlock);
  check("o shell declara o vocabulário de tokens", common.size > 20, String(common.size));

  const pages = fs.readdirSync(src).filter((f) => f.endsWith(".css"));
  check("há CSS de página para conferir", pages.length >= 8, String(pages.length));
  pages.forEach((file) => {
    const text = fs.readFileSync(path.join(src, file), "utf8");
    /* só o que está fora de qualquer bloco de componente: os :root e os
       html.<marca>/html.light, que são onde token de sistema seria redeclarado */
    const blocks = [...text.matchAll(/(?:^|\n)(:root|html\.[a-z]+)\s*\{([^}]*)\}/g)].map((m) => m[2]);
    const clash = [...tokensOf(blocks.join("\n"))].filter((t) => common.has(t));
    check(file + " não redeclara token do comum", clash.length === 0, clash.join(" "));
  });
}

{
  /* ---- o mapa mental colado em mermaid ----
     o texto vem de uma conversa com IA, e a IA é criativa: conversa em volta,
     cerca, parêntese no meio da frase, duas raízes, flowchart no lugar de
     mindmap. cada caso abaixo é uma resposta que já se viu na prática. */
  const { parseMermaid, toMermaid } = await import("./mermaid.js");
  const titles = (n) => [n.title].concat(n.children.map(titles));
  const shape = (n) => n.title + "(" + n.children.map(shape).join(",") + ")";
  const error = (text) => { try { parseMermaid(text); return ""; } catch (e) { return e.message; } };

  {
    const r = parseMermaid("Claro! Aqui está:\n\n```mermaid\nmindmap\n  root((Lançamento 🚀))\n    Fase 1 (semana 1)\n      Pesquisa: público\n    id2[Oferta \"principal\"]\n      ::icon(fa fa-book)\n      Preço\n      :::urgent\n    id3(\"`**Canais** de\n    venda`\")\n\t\tInstagram\n```\n\nQuer ajustar?");
    check("mermaid: resposta de IA vira a árvore certa", shape(r.root) === "Lançamento 🚀(Fase 1 (semana 1)(Pesquisa: público()),Oferta \"principal\"(Preço()),Canais de venda(Instagram()))", shape(r.root));
    check("mermaid: o nome vem da raiz", r.name === "Lançamento 🚀" && r.kind === "mindmap" && r.count === 7 && r.dropped === 0);
    check("mermaid: o primeiro nível ganha as cores dos modelos", r.root.children.map((c) => c.color).join() === "1,2,3" && r.root.children[0].children[0].color === 0);
    check("mermaid: nó nasce sem id (quem dá é o normalize)", !("id" in r.root));
  }
  {
    const r = parseMermaid("---\ntitle: Meu mapa\n---\nmindmap\n  a\n  b\n    c");
    check("mermaid: título do front matter e duas raízes embrulhadas", r.name === "Meu mapa" && shape(r.root) === "Meu mapa(a(),b(c()))", shape(r.root));
    const shapes = parseMermaid("mindmap\n  r((a))\n    b[b]\n    c(c)\n    d))d((\n    e)e(\n    f{{f}}\n    \"g #quot;x#quot;\"");
    check("mermaid: todas as formas perdem a moldura", titles(shapes.root).join("|") === "a|b|c|d|e|f|g \"x\"", titles(shapes.root).join("|"));
  }
  {
    const r = parseMermaid("graph TD;\n  A[Início] --> B{Decisão?}\n  B -->|Sim| C(OK) & D([Talvez])\n  B -- não --> E\n  subgraph S [grupo]\n  E --> A\n  end\n  click C \"https://x.com\"\n  classDef x fill:#f00\n  A:::x");
    check("mermaid: flowchart vira árvore a partir de cima, com ciclo", r.kind === "flowchart" && shape(r.root) === "Início(Decisão?(OK(),Talvez(),E()))", shape(r.root));
    check("mermaid: click com url vira link", r.root.children[0].children[0].link === "https://x.com");
    const proto = parseMermaid("graph TD\n__proto__ --> constructor");
    check("mermaid: id de protótipo é só um nome", shape(proto.root) === "__proto__(constructor())" && ({}).constructor === Object);
  }
  check("mermaid: outro diagrama diz qual é", /sequenceDiagram/.test(error("sequenceDiagram\n A->>B: oi")));
  check("mermaid: texto sem diagrama é recusado", /não achei/.test(error("oi, tudo bem?")));
  check("mermaid: flowchart quebrado diz a linha", /^linha 2/.test(error("graph TD\nA -->")));
  {
    const tree = { title: "raiz (x) [y] {z}", children: [
      { title: 'a "b" #1 &amp; <br> `c` ::icon(x) :::k %% nada', children: [{ title: "", children: [] }] },
      { title: "Fase 1 (semana 1)", children: [{ title: "é ção 🚀 ))((", children: [] }] }
    ] };
    const back = parseMermaid(toMermaid(tree)).root;
    check("mermaid: exportar e importar devolve a mesma árvore", JSON.stringify(titles(back)) === JSON.stringify(titles(tree)), JSON.stringify(titles(back)));
  }
  {
    const wide = "mindmap\n  r\n" + Array.from({ length: 5000 }, (_, i) => "    n" + i).join("\n");
    const r = parseMermaid(wide);
    check("mermaid: teto de 3000 nós conta o que ficou de fora", r.count === 3000 && r.dropped === 2001, r.count + "/" + r.dropped);
    check("mermaid: mapa grande abre com o terceiro nível fechado", parseMermaid("mindmap\n  r\n" + Array.from({ length: 200 }, (_, i) => "    a" + i + "\n      b" + i + "\n        c" + i).join("\n")).root.children[0].children[0].collapsed === true);
    let deep = "mindmap\n"; for (let i = 0; i < 1500; i++) deep += " ".repeat(i + 1) + "n\n";
    const d = parseMermaid(deep);
    check("mermaid: profundidade para em 60 sem estourar a pilha", d.count === 60 && d.dropped === 1440, d.count + "/" + d.dropped);
    let chain = "graph TD\n"; for (let i = 0; i < 5000; i++) chain += "n" + i + " --> n" + (i + 1) + "\n";
    check("mermaid: corrente longa de flowchart também para", parseMermaid(chain).count === 60);
    check("mermaid: mapa que não cabe num documento é recusado", /grande demais/.test(error("mindmap\n  r\n" + Array.from({ length: 3000 }, (_, i) => "    n" + i + "x".repeat(290)).join("\n"))));
    const t0 = Date.now();
    error("graph TD\nA -- " + " ".repeat(50000)); error("graph TD\nA" + "-".repeat(50000)); error("mindmap\n  " + "((".repeat(20000));
    check("mermaid: linha maliciosa não trava o leitor", Date.now() - t0 < 500, (Date.now() - t0) + "ms");
  }
}

/* ---- o documento de cliente, que duas páginas gravam ----
   prospecção e clientes escrevem na mesma coleção. se o normalizador de uma
   jogasse fora o que só a outra conhece, cada edição apagaria em silêncio o
   funil (ou o contrato). e o próximo passo com data é a única ponte entre o
   documento e o calendário: ela precisa mover, e não duplicar. */
{
  globalThis.localStorage = makeStorage({});
  const D = await import("./client-doc.js?n=" + (++n));
  const { tasks } = await import("./tasks.js?n=" + n);

  const won = D.normalize({ id: "c1", name: "loja", status: "active", contract: { value: 300000 }, pain: "não sabe de onde vem a venda", stage: "negotiation", futureField: 7 });
  check("cliente: o que veio do funil continua no cliente", won.pain === "não sabe de onde vem a venda" && won.stage === "negotiation");
  check("cliente: campo desconhecido atravessa o normalizador", won.futureField === 7);
  check("cliente: o contrato também continua", won.contract.value === 300000);
  const legacy = D.normalize({ id: "c2", status: "proposal" });
  check("cliente: status antigo de proposta vira prospecto na etapa de proposta", legacy.status === "prospect" && legacy.stage === "proposal", legacy.status + "/" + legacy.stage);
  check("cliente: perdido não é cliente nem funil", !D.isClient({ status: "lost" }) && !D.isPipeline({ status: "lost" }));
  check("cliente: arquivo ganha tipo pelo nome", D.normalize({ id: "c3", files: [{ id: "f", name: "Contrato-assinado.pdf" }] }).files[0].kind === "contrato");

  const store = tasks();
  const p = D.normalize({ id: "p1", name: "Bruna", status: "prospect", next: "mandar proposta", nextDate: "2026-09-20" });
  D.syncNext(p);
  D.syncNext({ ...p, nextDate: "2026-09-22" });
  const mine = store.all().filter((t) => t.origin && t.origin.type === "next" && t.origin.id === "p1");
  check("próximo passo: mudar a data move a tarefa, não cria outra", mine.length === 1 && mine[0].date === "2026-09-22", mine.map((t) => t.date).join());
  check("próximo passo: a tarefa diz o que e com quem", mine[0].title === "mandar proposta · Bruna" && mine[0].client === "p1", mine[0].title);
  D.syncNext({ ...p, status: "lost" });
  check("próximo passo: perdido tira a tarefa do calendário", !store.all().some((t) => t.origin && t.origin.id === "p1"));
}

/* ---- o funil e a carteira, contados para o retrato (#12) ----
   "quais leads estão parados?" e "o que vence no backlog?" dependem de contas
   que moravam nas telas (lastContact, isStale, os dias na etapa, o contato
   atrasado). agora são puras e moram em client-doc.js: a tela e o retrato do
   Merlin contam do mesmo jeito. o relógio é o de um segunda, 19/10/2026, 14:20. */
{
  globalThis.localStorage = makeStorage({});
  const D = await import("./client-doc.js?n=" + (++n));
  const DAY = 86400000;
  const NOW = new Date(2026, 9, 19, 14, 20).getTime();
  const TODAY = "2026-10-19";
  const ago = (days) => NOW - days * DAY;
  const ids = (list) => list.map((x) => x.id);

  /* lastContact, isStale e daysSince: o "faz tempo" da lista de clientes não muda */
  {
    const base = { id: "a", status: "active", createdAt: ago(100), journal: [] };
    check("lastContact: sem diário vale a criação", D.lastContact(base) === ago(100), String(D.lastContact(base)));
    check("lastContact: é o maior registro do diário", D.lastContact({ ...base, journal: [{ at: ago(30) }, { at: ago(5) }, { at: ago(20) }] }) === ago(5));
    check("lastContact: registro mais velho que a criação não vale menos que ela", D.lastContact({ ...base, createdAt: ago(10), journal: [{ at: ago(40) }] }) === ago(10));
    check("isStale: 14 dias exatos não é parado", D.isStale({ ...base, journal: [{ at: ago(14) }] }, NOW) === false);
    check("isStale: 15 dias é parado", D.isStale({ ...base, journal: [{ at: ago(15) }] }, NOW) === true);
    check("isStale: um registro de ontem tira o traço", D.isStale({ ...base, journal: [{ at: ago(100) }, { at: ago(1) }] }, NOW) === false);
    check("isStale: só vale para cliente ativo", !D.isStale({ ...base, status: "paused" }, NOW) && !D.isStale({ ...base, status: "prospect" }, NOW) && !D.isStale({ ...base, status: "closed" }, NOW) && !D.isStale({ ...base, status: "lost" }, NOW));
    check("isStale: sem o 2º parâmetro usa o relógio de verdade", D.isStale({ ...base, createdAt: Date.now() - 20 * DAY }) === true && D.isStale({ ...base, createdAt: Date.now() - 2 * DAY }) === false);
    check("daysSince: dias inteiros até o `now` dado", D.daysSince(ago(9), NOW) === 9 && D.daysSince(NOW - 9 * DAY - 3600000, NOW) === 9 && D.daysSince(NOW - 8 * DAY - 3600000, NOW) === 8);
    check("daysSince: o futuro vale zero", D.daysSince(NOW + 5 * DAY, NOW) === 0);
    check("daysSince: sem o 2º parâmetro usa o relógio de verdade", D.daysSince(Date.now() - 3 * DAY - 1000) === 3);
  }

  /* o funil */
  {
    const lead = (o) => ({ status: "prospect", stage: "lead", stageAt: ago(1), createdAt: ago(60), nextDate: "2026-10-25", ...o });
    const clients = [
      lead({ id: "bruna", name: "Bruna", stage: "proposal", stageAt: ago(9) }),
      lead({ id: "caio", name: "Caio", stage: "lead", stageAt: ago(2), nextDate: "2026-10-17" }),
      lead({ id: "davi", name: "Davi", stage: "qualified", stageAt: ago(1), nextDate: "" }),
      lead({ id: "eva", name: "Eva", stage: "lead", stageAt: ago(3) }),
      lead({ id: "lia", name: "Lia", status: "lost", stage: "proposal", stageAt: ago(40), nextDate: "2026-10-01" }),
      lead({ id: "cris", name: "Cris", status: "closed", stage: "lead", stageAt: ago(40), nextDate: "" })
    ];
    const before = JSON.stringify(clients);
    const r = D.pipelineToday(clients, TODAY, NOW);
    check("funil: não altera o que recebe", JSON.stringify(clients) === before);
    check("funil: as 5 etapas, em ordem, com a conta dos leads", JSON.stringify(r.stages) === JSON.stringify([
      { id: "lead", label: "lead", count: 2 }, { id: "qualified", label: "qualificado", count: 1 }, { id: "call", label: "call marcada", count: 0 },
      { id: "proposal", label: "proposta enviada", count: 1 }, { id: "negotiation", label: "negociação", count: 0 }
    ]), JSON.stringify(r.stages));
    check("parados: a Bruna, há 9 dias em proposta enviada, e o Caio, há 2, não", JSON.stringify(r.stuck) === JSON.stringify([{ id: "bruna", name: "Bruna", stage: "proposal", label: "proposta enviada", days: 9 }]), JSON.stringify(r.stuck));
    check("atrasados: o Caio, com o contato de anteontem", JSON.stringify(r.late) === JSON.stringify([{ id: "caio", name: "Caio", nextDate: "2026-10-17" }]), JSON.stringify(r.late));
    check("sem próximo passo: o lead sem data (e só ele)", JSON.stringify(r.noNext) === JSON.stringify([{ id: "davi", name: "Davi" }]), JSON.stringify(r.noNext));
    check("perdido e encerrado ficam fora de tudo", ![r.late, r.noNext, r.stuck, r.stale, r.backlog].some((l) => l.some((x) => x.id === "lia" || x.id === "cris" || x.clientId === "lia" || x.clientId === "cris")), JSON.stringify(r));
  }

  /* o limite dos parados e a ordem das listas */
  {
    const lead = (o) => ({ status: "prospect", stage: "lead", createdAt: ago(90), nextDate: "2026-10-30", ...o });
    const r = D.pipelineToday([
      lead({ id: "a", name: "Alfa", stageAt: ago(7) }),
      lead({ id: "b", name: "Beta", stageAt: ago(6) }),
      lead({ id: "c", name: "Gama", stageAt: ago(20), stage: "call" }),
      lead({ id: "d", name: "Delta", stageAt: ago(11), nextDate: "2026-10-15" }),
      lead({ id: "e", name: "Épsilon", stageAt: ago(1), nextDate: "2026-10-10" }),
      lead({ id: "f", name: "Zeta", stageAt: ago(1), nextDate: "2026-10-19" })
    ], TODAY, NOW);
    check("parados: 7 dias entra, 6 não", ids(r.stuck).includes("a") && !ids(r.stuck).includes("b"), JSON.stringify(r.stuck));
    check("parados: do mais antigo para o mais recente", JSON.stringify(ids(r.stuck)) === JSON.stringify(["c", "d", "a"]) && r.stuck[0].days === 20 && r.stuck[0].label === "call marcada", JSON.stringify(r.stuck));
    check("atrasados: o mais antigo primeiro", JSON.stringify(r.late.map((x) => x.id + ":" + x.nextDate)) === JSON.stringify(["e:2026-10-10", "d:2026-10-15"]), JSON.stringify(r.late));
    check("atrasados: o contato de hoje ainda não está atrasado", !ids(r.late).includes("f"));
  }

  /* os clientes sem registro */
  {
    const cli = (o) => ({ status: "active", createdAt: ago(200), journal: [{ at: ago(20), type: "event", text: "ligação" }], ...o });
    const r = D.pipelineToday([
      cli({ id: "ana", name: "Ana" }),
      cli({ id: "pau", name: "Paula", status: "paused" }),
      cli({ id: "enc", name: "Enzo", status: "closed" }),
      cli({ id: "rec", name: "Rui", journal: [{ at: ago(3) }] }),
      cli({ id: "vel", name: "Vera", journal: [{ at: ago(45) }, { at: ago(30) }] }),
      cli({ id: "lim", name: "Lia", journal: [{ at: ago(14) }] })
    ], TODAY, NOW);
    check("sem registro: o cliente ativo com último registro há 20 dias", r.stale.some((x) => x.id === "ana" && x.name === "Ana" && x.days === 20), JSON.stringify(r.stale));
    check("sem registro: pausado não está", !ids(r.stale).includes("pau"));
    check("sem registro: encerrado não está, nem o que tem registro recente", !ids(r.stale).includes("enc") && !ids(r.stale).includes("rec"));
    check("sem registro: 14 dias exatos não está", !ids(r.stale).includes("lim"));
    check("sem registro: do mais antigo para o mais recente", JSON.stringify(ids(r.stale)) === JSON.stringify(["vel", "ana"]) && r.stale[0].days === 30, JSON.stringify(r.stale));
    check("sem registro: cliente ativo não vira lead", r.stages.every((s) => s.count === 0) && r.stuck.length === 0 && r.noNext.length === 0 && r.late.length === 0, JSON.stringify(r));
  }

  /* o backlog com prazo */
  {
    const item = (id, due, o) => ({ id, text: "item " + id, due, done: false, ...o });
    const fresh = { createdAt: ago(1), journal: [{ at: ago(1) }] };
    const r = D.pipelineToday([
      { id: "ana", name: "Ana", status: "active", ...fresh, backlog: [
        item("ontem", "2026-10-18"), item("hoje", TODAY), item("mais5", "2026-10-24"), item("mais7", "2026-10-26"),
        item("mais12", "2026-10-31"), item("feito", "2026-10-18", { done: true }), item("sem-prazo", ""), item("prazo-ruim", "amanhã")
      ] },
      { id: "pau", name: "Paula", status: "paused", ...fresh, backlog: [item("pausado", "2026-10-20")] },
      { id: "enc", name: "Enzo", status: "closed", ...fresh, backlog: [item("encerrado", "2026-10-20")] },
      { id: "lia", name: "Lia", status: "lost", ...fresh, backlog: [item("perdido", "2026-10-20")] },
      { id: "bru", name: "Bruna", status: "prospect", ...fresh, backlog: [item("do-lead", "2026-10-20")] }
    ], TODAY, NOW);
    const by = (id) => r.backlog.find((b) => b.id === id);
    check("backlog: prazo de ontem é vencido", !!by("ontem") && by("ontem").when === "overdue" && by("ontem").due === "2026-10-18", JSON.stringify(r.backlog));
    check("backlog: prazo de hoje é hoje", !!by("hoje") && by("hoje").when === "today");
    check("backlog: daqui a 5 dias é em breve", !!by("mais5") && by("mais5").when === "soon");
    check("backlog: daqui a 7 dias ainda entra", !!by("mais7") && by("mais7").when === "soon");
    check("backlog: daqui a 12 dias fica fora", !by("mais12"));
    check("backlog: o feito, o sem prazo e o prazo inválido ficam fora", !by("feito") && !by("sem-prazo") && !by("prazo-ruim"));
    check("backlog: o item traz o cliente, o texto e o prazo", JSON.stringify(by("ontem")) === JSON.stringify({ id: "ontem", clientId: "ana", client: "Ana", text: "item ontem", due: "2026-10-18", when: "overdue" }), JSON.stringify(by("ontem")));
    check("backlog: pausado entra", !!by("pausado") && by("pausado").client === "Paula");
    check("backlog: encerrado, perdido e lead ficam fora", !by("encerrado") && !by("perdido") && !by("do-lead"));
    check("backlog: do prazo mais próximo para o mais distante", JSON.stringify(r.backlog.map((b) => b.id)) === JSON.stringify(["ontem", "hoje", "pausado", "mais5", "mais7"]), JSON.stringify(r.backlog.map((b) => b.id)));
    check("backlog: o cliente pausado não conta como sem registro", r.stale.length === 0);
  }

  /* vazio, esparso e inválido: nada quebra */
  {
    const empty = D.pipelineToday([], TODAY, NOW);
    check("funil vazio: as 5 etapas com zero e o resto vazio", empty.stages.length === 5 && empty.stages.every((s) => s.count === 0) && ["late", "noNext", "stuck", "stale", "backlog"].every((k) => Array.isArray(empty[k]) && empty[k].length === 0), JSON.stringify(empty));
    const sparse = D.pipelineToday([{ id: "x", name: "Sem nada", status: "prospect", stageAt: ago(8) }, { id: "y", status: "active", createdAt: ago(30) }], TODAY, NOW);
    check("esparso: o documento incompleto é normalizado por dentro", sparse.stages.find((s) => s.id === "lead").count === 1 && sparse.stuck.length === 1 && sparse.stuck[0].stage === "lead" && sparse.noNext.length === 1 && sparse.stale.length === 1 && sparse.stale[0].days === 30, JSON.stringify(sparse));
    const odd = D.pipelineToday([{ id: "z", name: "Sem status", stageAt: ago(1), nextDate: "2026-10-30" }], TODAY, NOW);
    check("esparso: sem status vale lead (como o normalizador)", odd.stages.find((s) => s.id === "lead").count === 1);
  }
}

/* ---- a linha e a fila, que o calendário e o rastreador do desktop dividem ----
   moraram dentro do calendar.jsx até o rastreador (tracker.jsx) passar a criar
   tarefa e a desenhar a barra. são as mesmas funções nas duas telas; o teste
   garante que elas continuam entendendo o que entendiam. */
{
  globalThis.localStorage = makeStorage({});
  const T = await import("./tasks.js?n=" + (++n));
  const Day = await import("./day.js?n=" + n);
  const flat = (s) => String(s).replace(/\s+/g, " ").trim();

  const l = T.readLine("revisar proposta 45m");
  check("linha: a duração sai do título", l.min === 45 && flat(l.title) === "revisar proposta", JSON.stringify(l));
  const c = T.readLine("ver tarefa https://app.clickup.com/t/86abc123 30m");
  check("linha: o link do ClickUp sai do título e vira id", c.clickup === "86abc123" && c.min === 30 && flat(c.title) === "ver tarefa", JSON.stringify(c));
  check("linha: almoço é reserva", T.isReserve("almoço"));
  check("linha: o hífen força reserva e sai do título", T.isReserve("- buscar as crianças") && T.stripPrefix("- buscar as crianças") === "buscar as crianças");
  check("linha: trabalho não é reserva", !T.isReserve("gravar vídeo"));

  /* a regra única de escrita: o mesmo texto cai no mesmo lugar em toda porta */
  const rt = T.routeLine("revisar proposta 45m");
  check("regra: com duração vai para hoje", rt.kind === "task" && rt.min === 45 && rt.title === "revisar proposta", JSON.stringify(rt));
  check("regra: almoço com duração é reserva de hoje", T.routeLine("almoço 1h").reserved === true);
  const rn = T.routeLine("ideia de landing para o lançamento");
  check("regra: sem duração vira ideia", rn.kind === "note" && rn.title === "ideia de landing para o lançamento", JSON.stringify(rn));
  check("regra: ? no fim é pergunta", T.routeLine("qual funil para um SaaS de nicho?").kind === "ask");
  check("regra: ? no começo é pergunta, sem o ?", T.routeLine("? quanto cobrar").text === "quanto cobrar");
  check("regra: vazio não vai a lugar nenhum", T.routeLine("   ") === null && T.routeLine("?") === null);
  check("regra: palavra de pergunta sem ? também pergunta", T.routeLine("como precifico o plano anual").kind === "ask" && T.routeLine("me ajuda a priorizar a semana").kind === "ask");
  check("regra: o nome do Merlin sai da pergunta", T.routeLine("merlin, vale lançar sexta").text === "vale lançar sexta", JSON.stringify(T.routeLine("merlin, vale lançar sexta")));
  check("regra: duração vence a palavra de pergunta", T.routeLine("como fazer o deck 45m").kind === "task");
  check("regra: sem pergunta e sem duração continua ideia", T.routeLine("comprar domínio do app").kind === "note");
  /* os pedidos locais do campo do início (fechar o dia, revisar): reconhecidos sem crédito */
  const ai = (s) => JSON.stringify(T.askIntent(s));
  check("pedido: \"fechar o dia\" fecha o dia", ai("fechar o dia") === JSON.stringify({ kind: "close" }), ai("fechar o dia"));
  check("pedido: ignora caixa, espaços e pontuação final", ai("Fechar meu dia") === JSON.stringify({ kind: "close" }) && ai("  FECHAR   O  DIA!  ") === JSON.stringify({ kind: "close" }) && ai("fechar o meu dia.") === JSON.stringify({ kind: "close" }));
  check("pedido: revisar a semana", ai("revisar a semana") === JSON.stringify({ kind: "review", period: "week" }) && ai("revisar minha semana") === JSON.stringify({ kind: "review", period: "week" }), ai("revisar a semana"));
  check("pedido: revisar o mês, com ou sem acento", ai("revisar o mês") === JSON.stringify({ kind: "review", period: "month" }) && ai("revisar o mes") === JSON.stringify({ kind: "review", period: "month" }) && ai("revisar meu mês") === JSON.stringify({ kind: "review", period: "month" }), ai("revisar o mês"));
  const rd = T.routeLine("fechar o dia 30m");
  check("pedido: com duração a tarefa manda, não é pedido", T.askIntent("fechar o dia 30m") === null && rd.kind === "task" && rd.min === 30, ai("fechar o dia 30m") + " " + JSON.stringify(rd));
  check("pedido: pergunta não é pedido", T.askIntent("como fecho o mês no financeiro?") === null);
  check("pedido: texto maior que o pedido não é pedido", T.askIntent("fechar o dia do cliente") === null);
  check("pedido: vazio e nulo dão null", T.askIntent("") === null && T.askIntent("   ") === null && T.askIntent(null) === null && T.askIntent(undefined) === null);
  const reads = (s) => T.needsReading(s, T.routeLine(s));
  check("leitura: o que viraria ideia passa pelo Merlin", reads("comprar domínio do app"));
  check("leitura: tarefa com duração e sem data segue direto", !reads("revisar proposta 45m") && !reads("almoço 1h"));
  check("leitura: data por extenso passa pelo Merlin", reads("ligar pro João amanhã 30m") && reads("call com a Ana às 15h 1h") && reads("entregar o deck sexta 2h"));
  check("leitura: duas durações na mesma linha passam pelo Merlin", reads("revisar landing 45m, responder e-mails 30m"));
  check("leitura: pergunta não passa pela leitura", !reads("como precifico o plano anual"));

  /* a janela anda com o relógio de verdade: começa uma hora atrás e acaba em
     quatro, então a conta é a mesma a qualquer hora em que o teste rodar */
  const now = Day.nowMin();
  const doc = { start: now - 60, end: now + 240, tasks: [
    { id: "a", title: "a", min: 120, done: false, reserved: false },
    { id: "b", title: "b", min: 90, done: false, reserved: false },
    { id: "r", title: "almoço", min: 60, done: false, reserved: true }
  ] };
  const d = Day.distribute(doc);
  check("fila: a reserva sai da frente do que resta", d.b.liveReserve === 60 && d.slots.get("a").from === 120, JSON.stringify(d.slots.get("a")));
  check("fila: a segunda só cabe em parte e marca o corte", d.slots.get("b").partial && d.slots.get("b").min === 60 && d.cut === 1, JSON.stringify(d.slots.get("b")) + " cut=" + d.cut);
  check("fila: não cabe meia hora", d.b.slack === -30 && d.b.overflow === 30, String(d.b.slack));
}

/* ---- a caixa de entrada e a sobra do dia (#7) ----
   o calendário e o início esvaziam a mesma caixa com a mesma função, e as três
   telas (calendário, início, rastreador) contam o mesmo dia: a cópia da rotina
   fica fora da LISTA do calendário, mas dentro da CONTA. */
{
  globalThis.localStorage = makeStorage({});
  const T = await import("./tasks.js?n=" + (++n));
  const Day = await import("./day.js?n=" + n);
  const R = await import("./routine.js?n=" + n);
  const { collection, addDays, sundayOf, today } = await import("./core.js?n=" + n);
  const hoje = today();   /* o copyRoutine lê o relógio de verdade, então o hoje do bloco também */
  const mk = (id, extra) => T.normalize({ id, title: id, date: hoje, min: 30, ...extra });

  /* inboxToDocs: o que vira tarefa e o que vira nota */
  {
    const r = T.inboxToDocs([
      { title: "meditar", min: 15, origin: { type: "habit", id: "h1" } },
      { title: "ideia solta" }
    ], [], hoje);
    check("caixa: com duração vira uma tarefa, sem duração vira uma nota", r.tasks.length === 1 && r.notes.length === 1, r.tasks.length + "/" + r.notes.length);
    const t = r.tasks[0];
    check("caixa: a tarefa é de hoje, com a duração dita", t.title === "meditar" && t.min === 15 && t.date === hoje, JSON.stringify(t));
    check("caixa: a origem do hábito atravessa", t.origin && t.origin.type === "habit" && t.origin.id === "h1", JSON.stringify(t.origin));
    check("caixa: a nota guarda o título e fica sem cliente", r.notes[0].title === "ideia solta" && r.notes[0].client === "", JSON.stringify(r.notes[0]));
    check("caixa: a tarefa vem pronta para gravar (id e não reservada)", !!t.id && t.reserved === false);
  }
  {
    const r = T.inboxToDocs([{ title: "almoço", min: 60 }, { title: "revisar proposta", min: 45, client: "c9" }], [], hoje);
    check("caixa: almoço vira reserva", r.tasks[0].reserved === true && r.tasks[1].reserved === false);
    check("caixa: o cliente vai junto na tarefa", r.tasks[1].client === "c9", r.tasks[1].client);
    const n2 = T.inboxToDocs([{ title: "  ligar   para\n  o João  ", client: "c9" }], [], hoje);
    check("caixa: a nota sai com espaços colapsados e cliente", n2.notes[0].title === "ligar para o João" && n2.notes[0].client === "c9", JSON.stringify(n2.notes[0]));
    check("caixa: a nota para em 300 caracteres", T.inboxToDocs([{ title: "x".repeat(500) }], [], hoje).notes[0].title.length === 300);
  }
  {
    const e = T.inboxToDocs([], [mk("a")], hoje);
    check("caixa: vazia não faz nada", e.tasks.length === 0 && e.notes.length === 0);
    const u = T.inboxToDocs(undefined, [], hoje);
    check("caixa: sem lista também não faz nada", u.tasks.length === 0 && u.notes.length === 0);
    const bad = T.inboxToDocs([{ min: 20 }, { title: "" , min: 10 }, { title: "   " }, null, { title: "ok", min: 5 }], [], hoje);
    check("caixa: item sem título é ignorado, nota de espaços também", bad.tasks.length === 1 && bad.tasks[0].title === "ok" && bad.notes.length === 0, JSON.stringify(bad));
  }
  {
    /* a fila: as três entram na frente de tudo o que já existe no dia, na ordem de entrada */
    const existing = [mk("e1", { order: 0 }), mk("e2", { order: 5 }), mk("e3", { order: -2 }), mk("outro-dia", { date: addDays(hoje, 1), order: -50 })];
    const before = JSON.stringify(existing);
    const r = T.inboxToDocs([
      { title: "um", min: 10 }, { title: "dois", min: 20 }, { title: "tres", min: 30 }
    ], existing, hoje);
    const lowest = Math.min(...existing.filter((t) => t.date === hoje).map((t) => t.order));
    check("caixa: três com duração viram três tarefas", r.tasks.length === 3 && r.notes.length === 0);
    check("caixa: todas ficam na frente do que já existe no dia", r.tasks.every((t) => t.order < lowest), r.tasks.map((t) => t.order).join() + " < " + lowest);
    check("caixa: a ordem de entrada se mantém", r.tasks[0].order < r.tasks[1].order && r.tasks[1].order < r.tasks[2].order, r.tasks.map((t) => t.order).join());
    const fila = T.onDate(existing.concat(r.tasks), hoje).map((t) => t.title).join();
    check("caixa: a fila do dia abre com um, dois, tres", fila.startsWith("um,dois,tres,"), fila);
    check("caixa: a ordem não olha para tarefa de outro dia (order -50 amanhã)", r.tasks.every((t) => t.order > -50) );
    check("caixa: não mexe nas tarefas que já existem", JSON.stringify(existing) === before);
    const mixed = T.inboxToDocs([{ title: "nota" }, { title: "primeira", min: 10 }, { title: "segunda", min: 10 }], existing, hoje);
    check("caixa: nota no meio não quebra a ordem das tarefas", mixed.tasks.length === 2 && mixed.tasks[0].order < mixed.tasks[1].order && mixed.tasks[1].order < lowest, mixed.tasks.map((t) => t.order).join());
  }

  /* o id do item atravessa: duas abas que recolhem o mesmo item gravam o mesmo documento */
  {
    const item = { id: "ib1", title: "meditar", min: 15 };
    const r1 = T.inboxToDocs([item], [], hoje);
    const r2 = T.inboxToDocs([item], [], hoje);
    check("caixa: o item com id vira tarefa com o mesmo id", r1.tasks[0].id === "ib1", r1.tasks[0].id);
    check("caixa: a mesma lista duas vezes dá o mesmo id", r1.tasks[0].id === r2.tasks[0].id, r1.tasks[0].id + "/" + r2.tasks[0].id);
    const nota = T.inboxToDocs([{ id: "ib2", title: "ideia solta" }], [], hoje);
    check("caixa: a nota sai com o id do item", nota.notes.length === 1 && nota.notes[0].id === "ib2", JSON.stringify(nota.notes));
    const velho = T.inboxToDocs([{ title: "sem id", min: 5 }], [], hoje);
    check("caixa: item sem id continua ganhando id novo", typeof velho.tasks[0].id === "string" && velho.tasks[0].id.length > 0 && velho.tasks[0].id !== "sem id", velho.tasks[0].id);
    const ruim = T.inboxToDocs([{ id: "", title: "a", min: 5 }, { id: 7, title: "b", min: 5 }, { id: null, title: "c" }], [], hoje);
    check("caixa: id vazio ou que não é texto é ignorado", ruim.tasks.length === 2 && ruim.tasks.every((t) => typeof t.id === "string" && t.id && t.id !== "7") && ruim.notes.length === 1 && !!ruim.notes[0].id === false, JSON.stringify(ruim));
    check("newTask: sem spec.id continua com id novo, com spec.id usa o dado", T.newTask({ title: "x" }).id.length > 0 && T.newTask({ title: "x", id: "t9" }).id === "t9");
  }

  /* dayTasks: o que conta no dia e o que o calendário lista */
  const routineBlock = R.normalize({ id: "b-rot", title: "almoço", days: [6], min: 60, reserved: true, kind: "routine" });
  const eventBlock = R.normalize({ id: "b-evt", title: "daily", days: [6], min: 60, reserved: true, kind: "event" });
  const lunch = mk("lunch", { title: "almoço", min: 60, reserved: true, origin: { type: "routine", id: "b-rot" } });
  const daily = mk("daily", { title: "daily", min: 60, reserved: true, origin: { type: "routine", id: "b-evt" } });
  const orphan = mk("orphan", { min: 20, origin: { type: "routine", id: "apagado" } });
  const habit = mk("habit", { min: 15, origin: { type: "habit", id: "h1" } });
  const plain = mk("plain", { min: 90 });
  const everything = [plain, lunch, daily, orphan, habit];
  const ids = (l) => l.map((t) => t.id).join();

  const dt = T.dayTasks(everything, [routineBlock, eventBlock]);
  check("dia: a conta inclui a cópia do bloco de rotina", dt.count.some((t) => t.id === "lunch") && dt.count.length === everything.length, ids(dt.count));
  check("dia: a lista do calendário não mostra a cópia da rotina", !dt.shown.some((t) => t.id === "lunch"), ids(dt.shown));
  check("dia: a cópia de evento continua na lista e na conta", dt.shown.some((t) => t.id === "daily") && dt.count.some((t) => t.id === "daily"));
  check("dia: a cópia cujo bloco foi apagado continua na lista", dt.shown.some((t) => t.id === "orphan"));
  check("dia: hábito e tarefa comum continuam na lista", dt.shown.some((t) => t.id === "habit") && dt.shown.some((t) => t.id === "plain"));
  check("dia: só a cópia da rotina sai da lista", dt.shown.length === everything.length - 1, ids(dt.shown));
  const none = T.dayTasks(everything, undefined);
  check("dia: sem blocos nada sai da lista", none.count.length === everything.length && none.shown.length === everything.length);
  const empty = T.dayTasks(everything, []);
  check("dia: com a lista de blocos vazia nada sai da lista", empty.shown.length === everything.length);
  const nothing = T.dayTasks([], [routineBlock]);
  check("dia: sem tarefas devolve listas vazias", nothing.count.length === 0 && nothing.shown.length === 0);

  /* a mesma sobra nas três telas: o almoço de 60 minutos da rotina desconta */
  const now = Day.nowMin();
  const prefs = { dayStart: now - 60, dayEnd: now + 240 };
  {
    const almoco = [mk("lunch", { title: "almoço", min: 60, reserved: true, origin: { type: "routine", id: "b-rot" } }), mk("w", { min: 90 })];
    const comAlmoco = T.dayTasks(almoco, [routineBlock]);
    const total = Day.distribute(T.dayDoc(comAlmoco.count, hoje, prefs));
    check("sobra: o almoço de 60 min da rotina desconta do dia", total.b.liveReserve === 60 && total.b.reserved === 60, JSON.stringify(total.b));
    const lista = Day.distribute(T.dayDoc(comAlmoco.shown, hoje, prefs));
    check("sobra: contar só o que a lista mostra daria outro número (o defeito antigo)", lista.b.slack !== total.b.slack && lista.b.slack - total.b.slack === 60, lista.b.slack + " vs " + total.b.slack);
    const calendario = Day.distribute(T.dayDoc(T.dayTasks(almoco, [routineBlock]).count, hoje, prefs));
    const inicio = Day.distribute(T.dayDoc(T.dayTasks(almoco, [routineBlock]).count, hoje, prefs));
    check("sobra: calendário e início contam o mesmo número", calendario.b.slack === inicio.b.slack && calendario.b.slack === total.b.slack, calendario.b.slack + "/" + inicio.b.slack);
    check("sobra: o número é a janela menos o almoço menos o trabalho", total.b.slack === 300 - 60 - 60 - 90, String(total.b.slack));
  }
  {
    const ev = [mk("daily", { title: "daily", min: 60, reserved: true, origin: { type: "routine", id: "b-evt" } })];
    const r = T.dayTasks(ev, [eventBlock]);
    check("evento: aparece na lista e na conta", r.shown.length === 1 && r.count.length === 1);
    const d = Day.distribute(T.dayDoc(r.count, hoje, prefs));
    check("evento: o distribute desconta os 60 minutos", d.b.liveReserve === 60, JSON.stringify(d.b));
    const d2 = Day.distribute(T.dayDoc(r.shown, hoje, prefs));
    check("evento: lista e conta dão a mesma sobra", d2.b.slack === d.b.slack, d2.b.slack + "/" + d.b.slack);
  }

  /* copyRoutine duas vezes na mesma semana: sem cópia duplicada */
  {
    globalThis.localStorage = makeStorage({});
    const blocksCol = collection("routine", { normalize: R.normalize });
    const tasksCol = T.tasks();
    const block = R.newBlock({ id: "b-copy", title: "daily do time", days: [0, 1, 2, 3, 4, 5, 6], at: 540, min: 15, reserved: true, kind: "event" });
    blocksCol.save(block);
    const week = sundayOf(hoje);
    const mine = () => tasksCol.all().filter((t) => R.isCopyOf(t, "b-copy"));
    R.copyRoutine(blocksCol, tasksCol, week);
    const first = mine();
    check("rotina: copiar a semana gera ao menos uma cópia", first.length >= 1, String(first.length));
    check("rotina: as cópias são do bloco, dos dias de hoje em diante, sem repetir dia", first.every((t) => t.date >= hoje) && new Set(first.map((t) => t.date)).size === first.length, first.map((t) => t.date).join());
    R.copyRoutine(blocksCol, tasksCol, week);
    const second = mine();
    check("rotina: copiar de novo na mesma semana não duplica", second.length === first.length && new Set(second.map((t) => t.date)).size === second.length, first.length + " -> " + second.length);
    check("rotina: as cópias são as mesmas, não recriadas", ids(first.slice().sort((a, b) => (a.id < b.id ? -1 : 1))) === ids(second.slice().sort((a, b) => (a.id < b.id ? -1 : 1))));
    check("rotina: o bloco guarda a marca da semana", blocksCol.get("b-copy").weeks[week] === true);
    const gone = first[0];
    tasksCol.remove(gone.id);
    R.copyRoutine(blocksCol, tasksCol, week);
    check("rotina: apagar uma cópia não a faz renascer", mine().length === first.length - 1, String(mine().length));
    /* o início e o calendário abertos ao mesmo tempo chamam a mesma função */
    const lastWeek = addDays(week, 7);
    R.copyRoutine(blocksCol, tasksCol, lastWeek);
    R.copyRoutine(blocksCol, tasksCol, lastWeek);
    const next = mine().filter((t) => t.date >= lastWeek);
    check("rotina: duas aberturas da semana seguinte também não duplicam", next.length === 7 && new Set(next.map((t) => t.date)).size === 7, String(next.length));
  }

  /* collectInbox: o lado que grava. a caixa é zerada antes, então a segunda
     tela que recebe o mesmo evento não cria a tarefa de novo */
  {
    const store = T.tasks();
    localStorage.setItem("merlin:inbox", JSON.stringify([
      { title: "alongar", min: 10, origin: { type: "habit", id: "h-col" } },
      { title: "  " , min: 5 },
      { title: "ler sobre retenção" }
    ]));
    const got = T.collectInbox(store);
    const mine = () => store.all().filter((t) => t.origin && t.origin.id === "h-col");
    check("recolher: uma tarefa e uma nota, e o título em branco não vira nada", got.tasks === 1 && got.notes === 1, JSON.stringify(got));
    check("recolher: a caixa fica vazia", localStorage.getItem("merlin:inbox") === "[]");
    check("recolher: a tarefa está na coleção, em hoje", mine().length === 1 && mine()[0].date === hoje);
    check("recolher: a nota está nas ideias", collection("notes").all().some((x) => x.title === "ler sobre retenção"));
    const again = T.collectInbox(store);
    check("recolher: a segunda tela não encontra nada", again.tasks === 0 && again.notes === 0 && mine().length === 1);
  }

  /* as duas abas leem antes de uma zerar: a caixa é escrita de novo com o mesmo
     item (mesmo id) e recolhida outra vez, e a tarefa continua uma só */
  {
    const store = T.tasks();
    const bilhete = { id: "ib-dup", title: "pilates", min: 30, origin: { type: "habit", id: "h-dup" } };
    localStorage.setItem("merlin:inbox", JSON.stringify([bilhete]));
    T.collectInbox(store);
    localStorage.setItem("merlin:inbox", JSON.stringify([bilhete]));
    const segunda = T.collectInbox(store);
    const mine = store.all().filter((t) => t.origin && t.origin.id === "h-dup");
    check("recolher: o mesmo item recolhido duas vezes deixa uma tarefa só, com o id do item", segunda.tasks === 1 && mine.length === 1 && mine[0].id === "ib-dup", mine.length + "/" + (mine[0] && mine[0].id));
    localStorage.setItem("merlin:inbox", JSON.stringify([{ id: "ib-nota", title: "ideia repetida" }]));
    T.collectInbox(store);
    localStorage.setItem("merlin:inbox", JSON.stringify([{ id: "ib-nota", title: "ideia repetida" }]));
    T.collectInbox(store);
    /* a nota é gravada pela instância do core que o tasks.js importa, não pela do teste */
    const notas = (await import("./core.js")).collection("notes").all().filter((x) => x.title === "ideia repetida");
    check("recolher: a nota repetida também fica uma só, com o id do item", notas.length === 1 && notas[0].id === "ib-nota", notas.length + "/" + (notas[0] && notas[0].id));
  }
}


/* ---- sessões de foco, meta e teto (VISAO, 11) ---- */
{
  const F = await import("./focus.js?n=" + (++n));
  const base = new Date(2026, 9, 7, 10, 0).getTime();   /* quarta, 07/10/2026 */
  const s1 = { id: "a", start: base, end: base + 50 * 60000, planned: 45 };
  const s2 = { id: "b", start: base + 3 * 3600000, end: null, planned: 30 };
  check("foco: só uma rodando", F.runningOf([s1, s2]).id === "b");
  check("foco: a que roda conta até agora", F.minutesOf(s2, base + 3 * 3600000 + 20 * 60000) === 20);
  check("foco: soma da semana", F.focusMinutes([s1, s2], "2026-10-07", base + 3 * 3600000 + 20 * 60000) === 70);
  check("foco: sessão de outra semana não conta", F.focusMinutes([{ start: new Date(2026, 9, 1).getTime(), end: new Date(2026, 9, 1).getTime() + 3600000 }], "2026-10-07") === 0);
  check("recibo: 50 de 45 está na estimativa", F.receipt(s1).verdict === "na estimativa", F.receipt(s1).verdict);
  check("recibo: 80 de 45 passou", F.receipt({ start: base, end: base + 80 * 60000, planned: 45 }).verdict === "passou da estimativa");
  const tasks = [
    { title: "reunião com cliente", reserved: true, min: 60, date: "2026-10-05" },
    { title: "daily", reserved: true, min: 15, date: "2026-10-08" },
    { title: "almoço", reserved: true, min: 60, date: "2026-10-07" },
    { title: "call de vendas", reserved: true, min: 30, date: "2026-10-12" }
  ];
  check("teto: soma só reunião da semana", F.meetingMinutes(tasks, "2026-10-07") === 75, String(F.meetingMinutes(tasks, "2026-10-07")));
  const gh = F.githubDay([
    { type: "PushEvent", created_at: new Date(2026, 9, 7, 11).toISOString(), repo: { name: "arttreis/merlin" }, payload: { commits: [{ message: "o rastreador ganha a sessão\n\ncorpo" }] } },
    { type: "PullRequestEvent", created_at: new Date(2026, 9, 7, 15).toISOString(), repo: { name: "arttreis/merlin" }, payload: { action: "closed", pull_request: { merged: true, title: "sessão de foco" } } },
    { type: "PushEvent", created_at: new Date(2026, 9, 6, 11).toISOString(), repo: { name: "x/y" }, payload: { commits: [{ message: "ontem" }] } }
  ], "2026-10-07");
  check("github: commits do dia", gh.commits.length === 1 && gh.commits[0].message === "o rastreador ganha a sessão" && gh.commits[0].repo === "merlin", JSON.stringify(gh.commits));
  check("github: PR mergeado", gh.prs.length === 1 && gh.prs[0].action === "merged");
}

/* ---- montar com o Merlin: o pedido, as respostas e o rascunho que vira documento ---- */
{
  const B = await import("./build.js?n=" + (++n));
  check("montar: reconhece o pedido de funil", B.buildIntent("monta um funil pra minha consultoria") === "funnel" && B.buildIntent("Me ajuda a desenhar o funil do curso") === "funnel");
  check("montar: reconhece mapa e app", B.buildIntent("cria um mapa mental do lançamento") === "map" && B.buildIntent("quero um app de agenda para salão") === "app" && B.buildIntent("desenha o SaaS de cobrança") === "app");
  check("montar: o que vem primeiro manda", B.buildIntent("monta um mapa do funil de vendas") === "map");
  check("montar: falar do funil não é pedir um", B.buildIntent("revisar o funil da Ana") === null && B.buildIntent("o app caiu de novo") === null && B.buildIntent("funil") === null);
  check("montar: as respostas viram linhas, sem as puladas",
    B.answersText([{ q: "O que vende?" }, { q: "Canal?" }, { q: "Números?" }], { 0: "consultoria", 2: " " }) === "O que vende? consultoria");
  let k = 0;
  const id = () => "i" + (++k);
  const funnel = {
    name: "Consultoria", channel: "Meta Ads",
    stages: [
      { nodeType: "ad", title: "Anúncio", note: "" },
      { nodeType: "lp", title: "Página", note: "" },
      { nodeType: "checkout", title: "Checkout", note: "" },
      { nodeType: "upsell", title: "Mentoria", note: "" },
      { nodeType: "downsell", title: "Grupo", note: "", after: "checkout" },
      { nodeType: "inventado", title: "Obrigado", note: "" }
    ],
    creatives: [{ title: "antes e depois", format: "video", angle: "x", stage: "anúncio" }],
    automations: [{ name: "carrinho", trigger: "saiu", action: "e-mail", tool: "", stage: "Checkout" }],
    offers: [{ name: "consultoria", price: 4997.5, type: "main", promise: "", guarantee: "", stage: "nenhuma" }],
    triggers: []
  };
  const f = B.docFromDraft("funnel", funnel, id);
  const nodeOf = (t) => f.doc.nodes.find((x) => x.title === t);
  check("montar: o funil vai para funis e abre nele", f.collection === "funnels" && f.href === "funnels.html#" + f.doc.id);
  check("montar: a etapa liga na anterior", f.doc.edges.some((e) => e.from === nodeOf("Anúncio").id && e.to === nodeOf("Página").id));
  check("montar: o ramo liga em quem o Merlin apontou", f.doc.edges.some((e) => e.from === nodeOf("Checkout").id && e.to === nodeOf("Grupo").id) && !f.doc.edges.some((e) => e.to === nodeOf("Grupo").id && e.from === nodeOf("Mentoria").id));
  check("montar: etapa que não existe vira livre", nodeOf("Obrigado").type === "custom");
  check("montar: o que pende de etapa acha a dela pelo título", f.doc.creatives[0].node === nodeOf("Anúncio").id && f.doc.automations[0].node === nodeOf("Checkout").id && f.doc.offers[0].node === "");
  check("montar: o preço vai em centavos", f.doc.offers[0].price === 499750);
  check("montar: as etapas ganham lugar no palco", new Set(f.doc.nodes.map((x) => x.x + "," + x.y)).size === f.doc.nodes.length);
  const m = B.docFromDraft("map", { name: "Lançamento", tree: { title: "lançamento", note: "", children: [{ title: "oferta", note: "", children: [] }] } }, id);
  check("montar: o mapa nasce com ids e abre nele", m.collection === "maps" && m.doc.root.id && m.doc.root.children[0].id && m.doc.root.children[0].title === "oferta");
  const a = B.docFromDraft("app", { name: "Agenda", pitch: "agenda de salão", features: [{ title: "agendar", phase: "mvp" }], entities: [{ name: "Cliente", fields: [{ name: "nome", type: "text" }] }, { name: "Horário", fields: [{ name: "cliente", type: "ref", ref: "Cliente" }] }], screens: [{ name: "Agenda", entities: ["Horário"] }], flows: [] }, id);
  const cliente = a.doc.entities.find((e) => e.name === "Cliente");
  check("montar: o app resolve nome em id", a.collection === "apps" && a.doc.name === "Agenda" && a.doc.entities[1].fields.some((x) => x.type === "ref" && x.ref === cliente.id), JSON.stringify(a.doc.entities[1].fields));
  check("montar: a carta do funil resume", B.draftView("funnel", funnel).lines[0].text.startsWith("Anúncio → Página") && B.draftView("funnel", funnel).lines[1].text === "consultoria · R$ 4.997,50", B.draftView("funnel", funnel).lines[1].text);
}

/* ---- a vitrine saiu da busca (PRD o-menu-por-area, D7) ----
   a coleção `wishlist` fica guardada, sem tela; o Ctrl+K não a acha mais, e
   buscar não grava nada nela. a nota é o controle: a busca funciona, e os
   documentos da vitrine estão mesmo lá (senão "não acha" não prova nada). */
{
  const entry = (doc) => ({ v: 1000, doc: { createdAt: 1, updatedAt: 1, order: 0, ...doc } });
  const shelf = (items) => JSON.stringify({ items, serverV: 0, dirty: [], refused: {} });
  const wish = shelf({
    l1: entry({ id: "l1", type: "list", name: "casa nova" }),
    i1: entry({ id: "i1", type: "item", list: "l1", name: "luminaria de mesa", price: 9000, bought: null })
  });
  const notes = shelf({ n1: entry({ id: "n1", title: "luminaria para o escritorio", body: "" }) });
  const { search, collection } = await fresh({ "merlin:wishlist": wish, "merlin:notes": notes });
  const lum = search("luminaria"), casa = search("casa nova");
  check("a vitrine: os documentos estão no navegador", collection("wishlist").all().length === 2);
  check("a vitrine: o item não aparece na busca", !lum.some((h) => h.label === "vitrine"), JSON.stringify(lum));
  check("a vitrine: a coletânea não aparece na busca", casa.length === 0, JSON.stringify(casa));
  check("a vitrine: nenhum resultado aponta para wishlist.html", ![...lum, ...casa].some((h) => /wishlist\.html/.test(h.href)), JSON.stringify([...lum, ...casa]));
  check("a vitrine: a busca das outras fontes segue achando", lum.some((h) => h.label === "nota"), JSON.stringify(lum));
  check("a vitrine: buscar não regrava a coleção", globalThis.localStorage.getItem("merlin:wishlist") === wish);
}

/* ---- as cinco áreas do menu (ticket #36) ----
   SECTIONS alimenta o menu do alto, o dock e o Ctrl+K. se uma página sumir de
   lá, ela fica sem porta; se estiver em duas áreas, o dock e o menu discordam
   sobre qual é a área atual; se o href apontar para um .html que não existe,
   o link quebra sem avisar. a vitrine não entra em área nenhuma (é o #37). */
{
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const { SECTIONS, PAGES, sectionOf } = await fresh({});

  const wanted = [
    ["health", "saúde", "habits", [["habits", "hábitos", "habits.html"]]],
    ["work", "trabalho", "apps", [
      ["apps", "produtos", "apps.html"], ["content", "conteúdo", "content.html"],
      ["funnels", "funis", "funnels.html"], ["maps", "mapas", "maps.html"]
    ]],
    ["organization", "organização", "calendar", [
      ["calendar", "calendário", "calendar.html"], ["routine", "rotina", "routine.html"], ["notes", "notas", "notes.html"]
    ]],
    ["money", "finanças", "finance", [["finance", "financeiro", "finance.html"]]],
    ["inbox", "inbox", "inbox", [
      ["next", "o que falta", "index.html#next"], ["prospecting", "leads", "prospecting.html"], ["clients", "clientes", "clients.html"]
    ]]
  ];
  const ids = SECTIONS.map((s) => s.id);
  check("áreas: são cinco, na ordem", JSON.stringify(ids) === JSON.stringify(["health", "work", "organization", "money", "inbox"]), JSON.stringify(ids));
  check("áreas: os nomes", JSON.stringify(SECTIONS.map((s) => s.label)) === JSON.stringify(["saúde", "trabalho", "organização", "finanças", "inbox"]), JSON.stringify(SECTIONS.map((s) => s.label)));
  check("áreas: cada uma com o seu ícone", JSON.stringify(SECTIONS.map((s) => s.icon)) === JSON.stringify(wanted.map((w) => w[2])), JSON.stringify(SECTIONS.map((s) => s.icon)));
  wanted.forEach(([id, , , tabs]) => {
    const got = (SECTIONS.find((s) => s.id === id) || { pages: [] }).pages.map((p) => [p.id, p.label, p.href]);
    check("áreas: as abas de " + id + ", na ordem", JSON.stringify(got) === JSON.stringify(tabs), JSON.stringify(got));
  });
  check("áreas: são doze abas", PAGES.length === 12, String(PAGES.length));
  check("áreas: a vitrine não está em nenhuma", !PAGES.some((p) => p.id === "wishlist") && !PAGES.some((p) => /wishlist/.test(p.href)));

  const pageIds = PAGES.map((p) => p.id);
  check("áreas: toda página mora em uma área só", new Set(pageIds).size === pageIds.length, pageIds.join(","));
  check("áreas: o que cada página diz de si bate com a área que a lista",
    PAGES.every((p) => SECTIONS.filter((s) => s.pages.includes(p)).length === 1 && sectionOf(p.id).pages.includes(p)));

  check("áreas: finanças fica em money", sectionOf("finance")?.id === "money", String(sectionOf("finance")?.id));
  check("áreas: conteúdo fica em trabalho", sectionOf("content")?.id === "work", String(sectionOf("content")?.id));
  check("áreas: clientes fica no inbox", sectionOf("clients")?.id === "inbox", String(sectionOf("clients")?.id));
  check("áreas: rotina fica em organização", sectionOf("routine")?.id === "organization", String(sectionOf("routine")?.id));
  check("áreas: início, vitrine e perfil não têm área", sectionOf("home") === null && sectionOf("wishlist") === null && sectionOf("profile") === null);

  const missing = PAGES.filter((p) => !p.href.startsWith("index.html") && !fs.existsSync(path.join(root, p.href))).map((p) => p.href);
  check("áreas: todo href aponta para um .html que existe na raiz", missing.length === 0 && PAGES.every((p) => /^[\w-]+\.html(#[\w-]*)?$/.test(p.href)), missing.join(","));

  const icons = fs.readFileSync(path.join(root, "src", "shared", "icons.jsx"), "utf8");
  const start = icons.indexOf("export const NAV_ICONS = {");
  const end = start < 0 ? -1 : icons.indexOf("\n};", start);
  const block = start < 0 || end < 0 ? "" : icons.slice(start, end);
  check("áreas: NAV_ICONS foi encontrado no icons.jsx", block.length > 0);
  const noIcon = SECTIONS.filter((s) => !s.icon || !block.includes("\n  " + s.icon + ":")).map((s) => s.id + "→" + s.icon);
  check("áreas: toda área tem o ícone em NAV_ICONS", block.length > 0 && noIcon.length === 0, noIcon.join(","));
}

/* ---- a apresentação das áreas e o "ideias" que virou "notas" (ticket #39) ----
   a apresentação é a primeira explicação do Merlin para quem chega, e a que
   descrevia a barra antiga ensinava lugares que não existem mais. ela é lida
   como texto (como a porta lê o core.js): os passos são um array literal. */
{
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");
  const { SECTIONS } = await fresh({});

  const src = read("src", "shared", "tour.jsx");
  const literal = (name) => {
    const m = src.match(new RegExp("const " + name + " = (\\[[\\s\\S]*?\\n\\]|\\[[^\\n]*\\]);"));
    return m ? new Function("return " + m[1])() : null;
  };
  const tour = literal("TOUR") || [];
  check("apresentação: o TOUR foi encontrado", tour.length > 0);
  check("apresentação: são seis passos, cada um com título e texto", tour.length === 6 && tour.every((s) => s.title && s.text), String(tour.length));
  check("apresentação: os títulos", JSON.stringify(tour.map((s) => s.title)) === JSON.stringify([
    "fale com o Merlin", "o que falta, uma coisa por vez", "o resto mora no menu",
    "só o dia tem minutos", "do produto a quem usa", "dinheiro e hábitos sem se enganar"
  ]), JSON.stringify(tour.map((s) => s.title)));
  const art = src.slice(src.indexOf("function TourArt"));
  const words = tour.map((s) => s.title + " " + s.text).join(" ") + art;
  const stale = ["ideias", "vitrine", "distribuição", "quest"].filter((w) => words.toLowerCase().includes(w));
  check("apresentação: nada de ideias, vitrine, distribuição ou quest", stale.length === 0, stale.join(","));
  const areas = SECTIONS.map((s) => s.label);
  const third = tour[2] ? tour[2].text.toLowerCase() : "";
  check("apresentação: o passo 3 diz as cinco áreas", areas.every((a) => third.includes(a)), third);
  const drawn = literal("AREAS") || [];
  check("apresentação: o desenho do passo 3 tem as áreas do menu, com o ícone de cada uma",
    JSON.stringify(drawn) === JSON.stringify(SECTIONS.map((s) => [s.icon, s.label])), JSON.stringify(drawn));

  const index = read("src", "index.jsx"), calendar = read("src", "calendar.jsx"), profile = read("src", "profile.jsx");
  check("apresentação: abre no início pela chave nova", /useState\(\(\) => !seen\("tour-areas"\)\)/.test(index) && /markSeen\("tour-areas"\)/.test(index));
  check("apresentação: o calendário não a abre mais", !/tour\.jsx|<Tour\b|seen\("tour/.test(calendar));
  check("apresentação: o perfil revê e esquece a chave nova", !/seen\("tour"\)/.test(profile)
    && /forgetSeen\("tour-areas"\)/.test(profile) && /markSeen\("tour-areas"\)/.test(profile));
  check("apresentação: o perfil diz que ela abre no início", profile.includes("abre sozinha no início") && !profile.includes("sozinha no Hoje"));

  const files = { "src/index.jsx": index, "src/shared/ui.jsx": read("src", "shared", "ui.jsx"), "src/profile.jsx": profile };
  Object.entries(files).forEach(([name, text]) => {
    const old = ["em ideias", "guardar em ideias", "vira ideia"].filter((w) => text.includes(w));
    check("notas: " + name + " não manda mais para \"ideias\"", old.length === 0, old.join(","));
  });
}

console.log("\n" + passed + " passaram, " + failures.length + " falharam");
if (failures.length) { console.log("\nFALHAS:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
