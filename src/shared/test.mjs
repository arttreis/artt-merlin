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


console.log("\n" + passed + " passaram, " + failures.length + " falharam");
if (failures.length) { console.log("\nFALHAS:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
