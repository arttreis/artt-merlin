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
  const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
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


console.log("\n" + passed + " passaram, " + failures.length + " falharam");
if (failures.length) { console.log("\nFALHAS:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
