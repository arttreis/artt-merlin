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
globalThis.window = { addEventListener: noop };

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

console.log("\n" + passed + " passaram, " + failures.length + " falharam");
if (failures.length) { console.log("\nFALHAS:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
