/* testa o worker contra um D1 de mentira, em memoria, com SQL de verdade
   feito na mao. o objetivo nao e cobrir SQL — e provar o fluxo de auth. */
import worker from "./worker.js";

/* ---- D1 falso: entende so as consultas que o worker faz ---- */
const db = { people: [], codes: [], days: [], docs: [], advice: [], shares: [] };
let sentEmails = [];

function prepare(sql) {
  let args = [];
  const api = {
    bind: (...a) => { args = a; return api; },
    first: async () => run(sql, args, "first"),
    all: async () => ({ results: run(sql, args, "all") }),
    run: async () => run(sql, args, "run")
  };
  return api;
}

function run(sql, a, mode) {
  const s = sql.replace(/\s+/g, " ").trim();

  if (s.startsWith("SELECT COUNT(*) AS n FROM codes")) {
    return { n: db.codes.filter(c => c.email === a[0] && c.expires_at > a[1]).length };
  }
  if (s.startsWith("INSERT OR REPLACE INTO codes")) {
    db.codes = db.codes.filter(c => c.hash !== a[0]);
    db.codes.push({ hash: a[0], email: a[1], expires_at: a[2], attempts: 0, used: 0 });
    return { meta: { changes: 1 } };
  }
  if (s.startsWith("SELECT hash, expires_at, attempts, used FROM codes")) {
    return db.codes.find(c => c.hash === a[0]) || null;
  }
  if (s.startsWith("UPDATE codes SET attempts")) {
    let n = 0;
    db.codes.forEach(c => { if (c.email === a[0] && !c.used && c.expires_at > a[1]) { c.attempts++; n++; } });
    return { meta: { changes: n } };
  }
  if (s.startsWith("UPDATE codes SET used")) {
    const c = db.codes.find(x => x.hash === a[0] && !x.used);
    if (!c) return { meta: { changes: 0 } };
    c.used = 1;
    return { meta: { changes: 1 } };
  }
  if (s.startsWith("SELECT id FROM people")) {
    return db.people.find(p => p.email === a[0]) || null;
  }
  if (s.startsWith("INSERT INTO people")) {
    db.people.push({ id: a[0], email: a[1], created_at: a[2] });
    return { meta: { changes: 1 } };
  }
  if (s.startsWith("SELECT email FROM people")) {
    return db.people.find(p => p.id === a[0]) || null;
  }
  if (s.startsWith("SELECT day, doc, v FROM days")) {
    return db.days.filter(d => d.person === a[0] && d.v > a[1]).sort((x, y) => x.v - y.v);
  }
  if (s.startsWith("INSERT INTO days")) {
    const [person, day, doc, v] = a;
    const ex = db.days.find(d => d.person === person && d.day === day);
    if (!ex) { db.days.push({ person, day, doc, v }); return { meta: { changes: 1 } }; }
    if (v > ex.v) { ex.doc = doc; ex.v = v; return { meta: { changes: 1 } }; }
    return { meta: { changes: 0 } };
  }
  if (s.startsWith("SELECT doc, v FROM days")) {
    return db.days.find(d => d.person === a[0] && d.day === a[1]) || null;
  }
  if (s.startsWith("SELECT id, doc, v FROM docs")) {
    return db.docs.filter(d => d.person === a[0] && d.type === a[1] && d.v > a[2]).sort((x, y) => x.v - y.v);
  }
  if (s.startsWith("INSERT INTO docs")) {
    const [person, type, id, doc, v] = a;
    const ex = db.docs.find(d => d.person === person && d.type === type && d.id === id);
    if (!ex) { db.docs.push({ person, type, id, doc, v }); return { meta: { changes: 1 } }; }
    if (v > ex.v) { ex.doc = doc; ex.v = v; return { meta: { changes: 1 } }; }
    return { meta: { changes: 0 } };
  }
  if (s.startsWith("SELECT doc, v FROM docs")) {
    return db.docs.find(d => d.person === a[0] && d.type === a[1] && d.id === a[2]) || null;
  }
  if (s.startsWith("SELECT id FROM docs")) {
    return db.docs.find(d => d.person === a[0] && d.type === a[1] && d.id === a[2]) || null;
  }
  if (s.startsWith("SELECT token, at FROM shares")) {
    return db.shares.find(x => x.person === a[0] && x.type === a[1] && x.id === a[2]) || null;
  }
  if (s.startsWith("INSERT INTO shares")) {
    db.shares.push({ token: a[0], person: a[1], type: a[2], id: a[3], at: a[4] });
    return { meta: { changes: 1 } };
  }
  if (s.startsWith("DELETE FROM shares")) {
    const before = db.shares.length;
    db.shares = db.shares.filter(x => !(x.person === a[0] && x.type === a[1] && x.id === a[2]));
    return { meta: { changes: before - db.shares.length } };
  }
  /* o JOIN da leitura publica: e ele que garante que o link so alcanca o
     documento daquela pessoa, daquele tipo, daquele id. */
  if (s.startsWith("SELECT s.type AS type, d.doc AS doc FROM shares s")) {
    const sh = db.shares.find(x => x.token === a[0]);
    if (!sh) return null;
    const doc = db.docs.find(d => d.person === sh.person && d.type === sh.type && d.id === sh.id);
    return doc ? { type: sh.type, doc: doc.doc } : null;
  }
  if (s.startsWith("SELECT n FROM advice")) {
    return db.advice.find(x => x.person === a[0] && x.hour === a[1]) || null;
  }
  if (s.startsWith("INSERT INTO advice")) {
    const ex = db.advice.find(x => x.person === a[0] && x.hour === a[1]);
    if (ex) ex.n++; else db.advice.push({ person: a[0], hour: a[1], n: 1 });
    return { meta: { changes: 1 } };
  }
  if (s.startsWith("DELETE FROM codes")) {
    const before = db.codes.length;
    db.codes = db.codes.filter(c => c.expires_at >= a[0]);
    return { meta: { changes: before - db.codes.length } };
  }
  throw new Error("SQL nao previsto no teste: " + s.slice(0, 70));
}

/* intercepta o Resend para capturar o codigo em vez de mandar e-mail */
let claudeAnswer = null;
let claudeAsked = null;   /* o ultimo pedido que subiu, para conferir o contexto */
let claudeMessages = null;   /* o array `messages` inteiro, para conferir o historico do assistente */
globalThis.fetch = async (url, opts) => {
  if (String(url).includes("api.anthropic.com")) {
    const request = JSON.parse(opts.body);
    claudeMessages = request.messages;
    claudeAsked = request.messages.at(-1).content;
    check("merlin manda a chave", opts.headers["x-api-key"] === "sk-teste");
    check("merlin pede JSON no sistema", /JSON/.test(request.system));
    return new Response(JSON.stringify(claudeAnswer), { status: 200 });
  }
  if (String(url).includes("resend.com")) {
    const body = JSON.parse(opts.body);
    sentEmails.push(body);
    return new Response("{}", { status: 200 });
  }
  throw new Error("fetch inesperado: " + url);
};

const ASSETS = { fetch: async () => new Response("<!doctype html><title>merlin</title>", { headers: { "content-type": "text/html" } }) };

/* ---- R2 falso: um mapa de chave -> bytes, com so o que o worker usa ----
   o que importa provar nao e a gravacao, e a CHAVE: ela comeca com a pessoa
   da sessao, e e isso que impede um arquivo de atravessar para outra. */
const bucket = {};
const FILES = {
  put: async (key, body, opts) => {
    bucket[key] = { body: new Uint8Array(body), type: (opts && opts.httpMetadata || {}).contentType || "", meta: (opts && opts.customMetadata) || {} };
  },
  get: async (key) => {
    const o = bucket[key];
    if (!o) return null;
    return {
      body: o.body,
      httpEtag: '"' + key + '"',
      writeHttpMetadata: (h) => h.set("content-type", o.type)
    };
  },
  delete: async (key) => { delete bucket[key]; }
};

const env = { DB: { prepare }, ASSETS, FILES, RESEND_API_KEY: "re_teste", SENDER_EMAIL: "p@x.com", SESSION_SECRET: "segredo-de-teste-longo-o-bastante", OWNER_EMAILS: "" };

const call = (method, route, body, cookie) =>
  worker.fetch(new Request("https://x.com/api" + route, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  }), env);

const codeFromEmail = () => (sentEmails.at(-1).subject.match(/^(\d{6})/) || [])[1];
const cookieOf = (r) => (r.headers.get("set-cookie") || "").split(";")[0];

let passed = 0, failures = [];
const check = (name, cond, detail) => { if (cond) passed++; else failures.push(name + (detail ? " -> " + detail : "")); };

/* ---- 1. e-mail invalido ---- */
let r = await call("POST", "/code", { email: "naoehemail" });
check("recusa e-mail invalido", r.status === 400);

/* ---- 2. pedir codigo ---- */
r = await call("POST", "/code", { email: "  Arthur@Exemplo.COM  " });
check("aceita e envia codigo", r.status === 200);
check("normaliza e-mail", sentEmails.at(-1).to[0] === "arthur@exemplo.com", sentEmails.at(-1).to[0]);
check("codigo tem 6 digitos", /^\d{6}$/.test(codeFromEmail() || ""));
check("codigo no assunto", sentEmails.at(-1).subject.includes(codeFromEmail()));
check("codigo vai no html tambem", sentEmails.at(-1).html.includes(codeFromEmail()));
check("codigo NAO fica em claro no banco", !db.codes.some(c => c.hash === codeFromEmail()));

const right = codeFromEmail();

/* ---- 3. codigo errado ---- */
const wrong = String((+right + 1) % 1000000).padStart(6, "0");
r = await call("POST", "/sign-in", { email: "arthur@exemplo.com", code: wrong });
check("recusa codigo errado", r.status === 401);
check("conta a tentativa", db.codes.some(c => c.attempts > 0));

/* ---- 4. codigo certo ---- */
r = await call("POST", "/sign-in", { email: "arthur@exemplo.com", code: right });
check("aceita codigo certo", r.status === 200, String(r.status));
const cookie = cookieOf(r);
check("devolve cookie de sessao", cookie.startsWith("session="));
const cookieHeader = r.headers.get("set-cookie") || "";
check("cookie HttpOnly", cookieHeader.includes("HttpOnly"));
check("cookie Secure", cookieHeader.includes("Secure"));
check("cookie SameSite=Lax", cookieHeader.includes("SameSite=Lax"));
check("criou a pessoa", db.people.length === 1);

/* ---- 5. reuso do mesmo codigo ---- */
r = await call("POST", "/sign-in", { email: "arthur@exemplo.com", code: right });
check("codigo e de uso unico", r.status === 401, String(r.status));

/* ---- 6. quem sou ---- */
r = await call("GET", "/me", null, cookie);
let body = await r.json();
check("reconhece a sessao", body.signedIn === true && body.email === "arthur@exemplo.com");

r = await call("GET", "/me", null, "session=lixo.invalido.aqui");
body = await r.json();
check("recusa token adulterado", body.signedIn === false);

/* ---- 7. rota protegida sem sessao ---- */
r = await call("GET", "/days", null, null);
check("bloqueia sem sessao", r.status === 401);

/* ---- 8. subir e baixar ---- */
const doc = { day: "2026-09-02", start: 540, end: 1140, doneOpen: false, v: 1000, tasks: [{ id: "a", title: "escrever", min: 60, done: false, reserved: false }] };
r = await call("POST", "/days", { day: "2026-09-02", v: 1000, doc }, cookie);
check("sobe um dia", r.status === 200, String(r.status));

r = await call("GET", "/days?since=0", null, cookie);
body = await r.json();
check("baixa o dia", body.days.length === 1 && body.days[0].doc.tasks[0].title === "escrever");

r = await call("GET", "/days?since=1000", null, cookie);
body = await r.json();
check("since=v nao repete o que ja tenho", body.days.length === 0);

/* ---- 9. conflito: versao antiga nao sobrescreve ---- */
const old = { ...doc, v: 500, tasks: [{ id: "b", title: "versao velha", min: 30, done: false, reserved: false }] };
r = await call("POST", "/days", { day: "2026-09-02", v: 500, doc: old }, cookie);
body = await r.json();
check("recusa versao mais velha", r.status === 409, String(r.status));
check("devolve a versao do servidor", body.server && body.server.v === 1000);
check("nao sobrescreveu", JSON.parse(db.days[0].doc).tasks[0].title === "escrever");

/* ---- 10. versao mais nova sobrescreve ---- */
const newer = { ...doc, v: 2000, tasks: [{ id: "c", title: "mais novo", min: 15, done: false, reserved: false }] };
r = await call("POST", "/days", { day: "2026-09-02", v: 2000, doc: newer }, cookie);
check("aceita versao mais nova", r.status === 200);
check("sobrescreveu", JSON.parse(db.days[0].doc).tasks[0].title === "mais novo");

/* ---- 11. isolamento entre pessoas ---- */
sentEmails = [];
await call("POST", "/code", { email: "outra@exemplo.com" });
r = await call("POST", "/sign-in", { email: "outra@exemplo.com", code: codeFromEmail() });
const otherCookie = cookieOf(r);
r = await call("GET", "/days?since=0", null, otherCookie);
body = await r.json();
check("uma pessoa NAO ve o dia da outra", body.days.length === 0, JSON.stringify(body.days));

/* ---- 12. dia invalido ---- */
r = await call("POST", "/days", { day: "02/09/2026", v: 1, doc: {} }, cookie);
check("recusa formato de data errado", r.status === 400);

/* ---- 13. rate limit ---- */
let last = 200;
for (let i = 0; i < 10; i++) {
  const rr = await call("POST", "/code", { email: "spam@exemplo.com" });
  last = rr.status;
}
check("limita pedidos por hora", last === 429, String(last));

/* ---- 13b. documentos por tipo ---- */
r = await call("POST", "/docs", { type: "ideas", id: "i1", v: 100, doc: { id: "i1", title: "uma ideia" } }, cookie);
check("sobe um doc", r.status === 200, String(r.status));
r = await call("GET", "/docs?type=ideas&since=0", null, cookie);
body = await r.json();
check("baixa o doc por tipo", body.docs.length === 1 && body.docs[0].doc.title === "uma ideia");
r = await call("GET", "/docs?type=clients&since=0", null, cookie);
body = await r.json();
check("tipo diferente nao mistura", body.docs.length === 0);
r = await call("POST", "/docs", { type: "ideas", id: "i1", v: 50, doc: { id: "i1", title: "velha" } }, cookie);
body = await r.json();
check("doc: recusa versao mais velha", r.status === 409 && body.server && body.server.v === 100);
r = await call("POST", "/docs", { type: "ideas", id: "i1", v: 200, doc: { id: "i1", deleted: true } }, cookie);
check("doc: tumulo sobe como versao nova", r.status === 200);
r = await call("GET", "/docs?type=ideas&since=100", null, cookie);
body = await r.json();
check("doc: since=v traz so o que mudou", body.docs.length === 1 && body.docs[0].doc.deleted === true);
r = await call("POST", "/docs", { type: "Ideas!", id: "i1", v: 1, doc: {} }, cookie);
check("doc: recusa tipo invalido", r.status === 400);
r = await call("GET", "/docs?type=ideas&since=0", null, otherCookie);
body = await r.json();
check("doc: uma pessoa NAO ve o doc da outra", body.docs.length === 0);
r = await call("GET", "/docs?type=ideas&since=0", null, null);
check("doc: bloqueia sem sessao", r.status === 401);

/* ---- 13c. so o dono entra ---- */
env.OWNER_EMAILS = "arthur@exemplo.com";
sentEmails = [];
r = await call("POST", "/code", { email: "intruso@exemplo.com" });
check("intruso recebe a mesma resposta", r.status === 200);
check("intruso NAO recebe codigo", sentEmails.length === 0);
r = await call("POST", "/sign-in", { email: "intruso@exemplo.com", code: "123456" });
check("intruso nao entra", r.status === 401);
r = await call("POST", "/code", { email: "arthur@exemplo.com" });
check("dono recebe codigo", r.status === 200 && sentEmails.length === 1);
env.OWNER_EMAILS = "";

/* ---- 13d. o time entra por dominio ----
   uma entrada de OWNER_EMAILS pode ser "@casa.com.br": e assim que o time
   entra sem um deploy por pessoa. abrir a porta nao abre a gaveta — o ultimo
   teste daqui e o que garante isso. */
env.OWNER_EMAILS = "@guessless.com.br,arthurcastilhos@gmail.com";
sentEmails = [];
r = await call("POST", "/code", { email: " Maria@Guessless.com.BR " });
check("dominio do time recebe codigo", r.status === 200 && sentEmails.length === 1, String(sentEmails.length));
const mariaCode = codeFromEmail();
r = await call("POST", "/code", { email: "gente@outracasa.com" });
check("fora do dominio recebe a mesma resposta", r.status === 200);
check("fora do dominio NAO recebe codigo", sentEmails.length === 1, String(sentEmails.length));
/* o e-mail veste a marca de quem vai receber: quem entra pela Guessless nao
   deve abrir um e-mail verde de um produto que ela nao conhece. */
check("e-mail da casa usa o azul da casa", sentEmails[0].html.includes("#368DFF"), "sem o azul");
check("e-mail da casa assina GuessLess", sentEmails[0].html.includes("GuessLess"), "sem a assinatura");
check("e-mail da casa nao leva o verde do Merlin", !sentEmails[0].html.includes("#2EE86B"));

/* o atributo style e delimitado por aspas duplas. uma aspa dupla DENTRO dele
   (o classico font-family:"DM Sans") fecha o atributo no meio, e o e-mail
   chega sem formatacao nenhuma — foi assim por muito tempo sem ninguem notar,
   porque olhar se a cor "aparece no html" nao prova que ela esta aplicada.
   este teste le cada style="..." ate a proxima aspa e cobra o que tem que
   estar la dentro. */
function brokenStyles(html) {
  const quebrados = [];
  for (const m of html.matchAll(/style="([^"]*)"/g)) {
    /* um style que termina logo depois de "font-family:" foi cortado ali */
    if (/(?:font-family|background|color|border):\s*$/.test(m[1])) quebrados.push(m[1].slice(-40));
  }
  return quebrados;
}
for (const [quem, html] of [["da casa", sentEmails[0].html]]) {
  const q = brokenStyles(html);
  check("e-mail " + quem + ": nenhum style cortado no meio", q.length === 0, q.join(" | "));
  /* e a prova positiva: o cartao do codigo chega inteiro */
  const card = [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]).find((s) => s.includes("font-size:36px"));
  check("e-mail " + quem + ": o codigo mantem tamanho, fundo e cor", !!card && /background:#/.test(card) && /color:#/.test(card), String(card).slice(0, 60));
}
r = await call("POST", "/code", { email: "arthurcastilhos@gmail.com" });
check("endereco solto vale ao lado do dominio", sentEmails.length === 2, String(sentEmails.length));
check("fora da casa continua verde", sentEmails[1].html.includes("#2EE86B"));
check("fora da casa nao vira Guessless", !sentEmails[1].html.includes("GuessLess"));
/* o Merlin tinha o mesmo defeito de aspas; as duas marcas passam pela prova */
{
  const q = brokenStyles(sentEmails[1].html);
  check("e-mail do Merlin: nenhum style cortado no meio", q.length === 0, q.join(" | "));
  const card = [...sentEmails[1].html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]).find((s) => s.includes("font-size:36px"));
  check("e-mail do Merlin: o codigo mantem tamanho, fundo e cor", !!card && /background:#/.test(card) && /color:#/.test(card), String(card).slice(0, 60));
}
/* "@guessless.com.br" e regra de dominio, nunca um endereco que da para usar */
r = await call("POST", "/sign-in", { email: "maria@guessless.com.br", code: mariaCode });
check("pessoa do time entra", r.status === 200, String(r.status));
const mariaCookie = cookieOf(r);
r = await call("GET", "/docs?type=ideas&since=0", null, mariaCookie);
body = await r.json();
check("quem entra pelo dominio NAO ve o doc de quem ja estava", body.docs.length === 0, JSON.stringify(body.docs));
r = await call("GET", "/days?since=0", null, mariaCookie);
body = await r.json();
check("quem entra pelo dominio NAO ve o dia de quem ja estava", body.days.length === 0, JSON.stringify(body.days));
env.OWNER_EMAILS = "";

/* ---- 13e. o merlin ---- */
r = await call("POST", "/merlin", { task: "branches", context: { node: "x" } }, cookie);
check("merlin sem chave responde 503", r.status === 503, String(r.status));
env.ANTHROPIC_API_KEY = "sk-teste";
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: 'Aqui vai:\n{"suggestions":[{"title":"Tráfego pago","note":"começa pelo Meta"},{"title":"","note":"vazio"}]}' }] };
r = await call("POST", "/merlin", { task: "branches", context: { map: "lançamento", node: "tráfego", children: [], siblings: ["oferta"] } }, cookie);
body = await r.json();
check("merlin devolve sugestoes", r.status === 200 && body.suggestions.length === 1 && body.suggestions[0].title === "Tráfego pago", JSON.stringify(body));
r = await call("POST", "/merlin", { task: "inventada", context: {} }, cookie);
check("merlin recusa tarefa desconhecida", r.status === 400);
r = await call("POST", "/merlin", { task: "branches", context: { node: "x" } }, null);
check("merlin exige sessao", r.status === 401);
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"text":"## Semana\\n- fechou 3\\n- ficou 2"}' }] };
r = await call("POST", "/merlin", { task: "week", context: { range: "1-7 set", cards: ["seg · artt · x · 1h · sim"] } }, cookie);
body = await r.json();
check("merlin responde texto", r.status === 200 && /Semana/.test(body.text), JSON.stringify(body));
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"suggestions":[{"type":"step","title":"validar com 3 clientes","note":"antes de codar"}]}' }] };
r = await call("POST", "/merlin", { task: "expand", context: { title: "app", steps: [] } }, cookie);
body = await r.json();
check("merlin ramifica ideia", r.status === 200 && body.suggestions[0].type === "step");
/* "da pra fazer com Claude?": a estimativa tem que subir junto, senao o
   veredicto nao teria como falar em minutos */
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"text":"**dá** — o Claude lê a planilha e escreve as descrições.\\n\\nMontar: escrever a skill de conferência"}' }] };
r = await call("POST", "/merlin", { task: "delegate", context: { title: "conferir 400 anúncios", min: 180, where: "o backlog do cliente", client: "Loja X" } }, cookie);
body = await r.json();
check("merlin julga a demanda", r.status === 200 && /Montar:/.test(body.text), JSON.stringify(body));
check("merlin recebe a estimativa da demanda", /180 minutos/.test(claudeAsked), String(claudeAsked).slice(0, 200));
check("merlin recebe o cliente da demanda", /Loja X/.test(claudeAsked));
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"text":"treino segurou; leitura caiu na segunda semana"}' }] };
r = await call("POST", "/merlin", { task: "habits", context: { month: "set 2026", habits: ["treino · todo dia · 20/30 · sequência 4"] } }, cookie);
body = await r.json();
check("merlin le o mes de habitos", r.status === 200 && /treino/.test(body.text), JSON.stringify(body));
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"text":"## o que foi\\n- MVP"}' }] };
r = await call("POST", "/merlin", { task: "review", context: { kind: "semana", period: "7–13 set", goals: ["fechar o MVP · SaaS · feito"], weekDone: ["deploy"], review: { went: "", didnt: "", next: "" } } }, cookie);
body = await r.json();
check("merlin revisa o periodo", r.status === 200 && /MVP/.test(body.text), JSON.stringify(body));
claudeAnswer = { stop_reason: "refusal", content: [] };
r = await call("POST", "/merlin", { task: "funnel", context: { name: "f", stages: ["lp"] } }, cookie);
check("merlin repassa a recusa", r.status === 422);

/* ---- 13e-bis. o assistente (busca -> chat) ----
   mesma rota, mesma sanitizacao de sempre — o que muda e que a tela agora
   manda o historico da conversa, e o servidor monta turnos de verdade em vez
   de um pedido isolado. sem `history` (as outras nove tarefas), continua
   sendo um turno so. */
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"suggestions":[{"actionType":"task","title":"ligar pro cliente","note":"","payload":{"title":"ligar pro cliente","date":"","min":15,"client":""}}],"clarify":""}' }] };
r = await call("POST", "/merlin", { task: "assistant", context: { message: "lembra de ligar pro cliente amanhã, uns 15 min" } }, cookie);
body = await r.json();
check("assistente propõe uma ação", r.status === 200 && body.suggestions.length === 1 && body.suggestions[0].actionType === "task", JSON.stringify(body));
check("sem histórico, continua um turno só", claudeMessages.length === 1, String(claudeMessages.length));

claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"suggestions":[],"clarify":"e pra qual etapa?"}' }] };
r = await call("POST", "/merlin", { task: "assistant", context: {
  message: "e essa etapa que faltou",
  history: [
    { role: "user", content: "monta um funil de captura" },
    { role: "assistant", content: "[propôs onboarding-funnel: 'funil de captura']" }
  ]
} }, cookie);
body = await r.json();
check("assistente responde com o histórico", r.status === 200 && body.clarify === "e pra qual etapa?", JSON.stringify(body));
check("o histórico vira turnos de verdade", claudeMessages.length === 3 && claudeMessages[0].role === "user" && claudeMessages[1].role === "assistant", JSON.stringify(claudeMessages));

const bigHistory = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "turno " + i }));
r = await call("POST", "/merlin", { task: "assistant", context: { message: "e agora?", history: bigHistory } }, cookie);
check("histórico grande demais é cortado", claudeMessages.length === 13, String(claudeMessages.length));

claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"suggestions":[{"actionType":"nao-existe","title":"x","payload":{}}],"clarify":""}' }] };
r = await call("POST", "/merlin", { task: "assistant", context: { message: "qualquer coisa" } }, cookie);
body = await r.json();
check("tipo de ação fora do catálogo é descartado", r.status === 200 && body.suggestions.length === 0, JSON.stringify(body));

/* ---- 13f. o teto do conselheiro ----
   a chave da Anthropic e uma so para o time. o teto e por pessoa e por hora:
   quem gastou espera, e quem esta ao lado nao paga por isso. */
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"text":"ok"}' }] };
const askAdvice = (c) => call("POST", "/merlin", { task: "week", context: { range: "1-7 set", cards: [] } }, c);
let lastAdvice = 200;
for (let i = 0; i < 40 && lastAdvice !== 429; i++) lastAdvice = (await askAdvice(cookie)).status;
check("limita conselhos por hora", lastAdvice === 429, String(lastAdvice));
r = await askAdvice(otherCookie);
check("o teto e de quem gastou, nao do time", r.status === 200, String(r.status));
env.ANTHROPIC_API_KEY = "";


/* ---- 13g. os arquivos (R2) ----
   o binario de um print nao cabe no documento: ele subiria e desceria
   inteiro a cada sincronizacao. o que este bloco prova nao e o upload — e
   que a chave do objeto comeca com a pessoa da sessao, e que quem pedir o
   arquivo de outra pessoa recebe "nao existe", nao "nao pode": responder
   diferente ja contaria que o arquivo existe. */

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const sendFile = (bytes, type, name, cookie) =>
  worker.fetch(new Request("https://x.com/api/files", {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "x-file-type": type,
      "x-file-name": encodeURIComponent(name || ""),
      ...(cookie ? { cookie } : {})
    },
    body: bytes
  }), env);

r = await sendFile(png, "image/png", "captura de tela.png");
check("arquivo sem sessao e recusado", r.status === 401, String(r.status));

r = await sendFile(png, "text/html", "x.html", cookie);
check("recusa tipo que nao e imagem nem pdf", r.status === 400, String(r.status));

r = await sendFile(new Uint8Array(9 * 1024 * 1024), "image/png", "gigante.png", cookie);
check("recusa arquivo grande demais", r.status === 413, String(r.status));

r = await sendFile(png, "image/png", "captura de tela.png", cookie);
let fileBody = await r.json();
check("aceita o print", r.status === 200 && !!fileBody.id, JSON.stringify(fileBody));
check("devolve o tamanho", fileBody.size === png.length, String(fileBody.size));
check("o nome com acento volta inteiro", fileBody.name === "captura de tela.png", fileBody.name);
check("a chave comeca com a pessoa da sessao",
  Object.keys(bucket).some((k) => k.endsWith("/" + fileBody.id) && k.split("/")[0].length > 0),
  Object.keys(bucket).join(","));

const fileGet = (id, c) =>
  worker.fetch(new Request("https://x.com/api/files/" + id, { headers: c ? { cookie: c } : {} }), env);

r = await fileGet(fileBody.id, cookie);
check("devolve o print de quem o subiu", r.status === 200, String(r.status));
check("devolve com o tipo certo", r.headers.get("content-type") === "image/png", r.headers.get("content-type"));
check("o print nao entra em cache compartilhado", /private/.test(r.headers.get("cache-control") || ""), r.headers.get("cache-control"));

r = await fileGet(fileBody.id, otherCookie);
check("o print de outra pessoa e 'nao existe', nao 'nao pode'", r.status === 404, String(r.status));

r = await fileGet("../outra/coisa", cookie);
check("id fora de forma nao vira caminho", r.status === 404, String(r.status));

r = await fileGet(fileBody.id);
check("sem sessao nao ha print", r.status === 401, String(r.status));

r = await worker.fetch(new Request("https://x.com/api/files/" + fileBody.id, { method: "DELETE", headers: { cookie: otherCookie } }), env);
check("apagar so alcanca o proprio", (await fileGet(fileBody.id, cookie)).status === 200, "o de outra pessoa sumiu");

r = await worker.fetch(new Request("https://x.com/api/files/" + fileBody.id, { method: "DELETE", headers: { cookie } }), env);
check("apaga o proprio print", r.status === 200 && (await fileGet(fileBody.id, cookie)).status === 404, String(r.status));

/* sem o bucket configurado a rota diz isso, em vez de estourar */
const noBucket = { ...env, FILES: null };
r = await worker.fetch(new Request("https://x.com/api/files", {
  method: "POST", headers: { "content-type": "application/octet-stream", "x-file-type": "image/png", cookie }, body: png
}), noBucket);
check("sem bucket, a rota avisa em vez de quebrar", r.status === 503, String(r.status));

/* ---- 13.5 o link publico ----
   e a unica porta sem sessao deste servidor. o que os casos abaixo protegem:
   ela nao alcanca tipo que nao seja mapa ou funil, nao alcanca documento de
   outra pessoa, e para de alcancar no instante em que o link e revogado. */
r = await call("POST", "/docs", { type: "maps", id: "m1", v: 10, doc: { id: "m1", name: "mapa do lançamento" } }, cookie);
check("mapa sobe para poder ser compartilhado", r.status === 200, String(r.status));

r = await call("GET", "/share?type=maps&id=m1", null, cookie);
body = await r.json();
check("antes de compartilhar, não há link", body.share === null);

r = await call("POST", "/share", { type: "maps", id: "m1" }, cookie);
body = await r.json();
const shareToken = body.share && body.share.token;
check("compartilhar devolve um token", /^[A-Za-z0-9_-]{22}$/.test(shareToken || ""), String(shareToken));

r = await call("POST", "/share", { type: "maps", id: "m1" }, cookie);
body = await r.json();
check("pedir de novo devolve o MESMO link", body.share.token === shareToken);

/* a leitura publica: sem cookie nenhum */
r = await call("GET", "/shared/" + shareToken);
body = await r.json();
check("o link abre sem sessão", r.status === 200 && body.doc.name === "mapa do lançamento", String(r.status));
check("e diz de que tipo é", body.type === "maps");

r = await call("GET", "/shared/naoexisteesse22charsx");
check("token inventado é 404", r.status === 404, String(r.status));

r = await call("POST", "/share", { type: "clients", id: "c1" }, cookie);
check("cliente não se compartilha", r.status === 400, String(r.status));

r = await call("POST", "/share", { type: "maps", id: "naoexiste" }, cookie);
check("documento que não subiu não vira link", r.status === 404, String(r.status));

/* outra pessoa nao alcanca o documento pelo id: o link e por (pessoa, tipo, id) */
r = await call("POST", "/share", { type: "maps", id: "m1" }, otherCookie);
check("outra conta não cria link para documento alheio", r.status === 404, String(r.status));

r = await call("DELETE", "/share?type=maps&id=m1", null, cookie);
check("revogar responde ok", r.status === 200, String(r.status));
r = await call("GET", "/shared/" + shareToken);
check("revogado, o link morre na hora", r.status === 404, String(r.status));

r = await call("GET", "/shared/" + shareToken, null, cookie);
check("nem com sessão o link revogado volta", r.status === 404, String(r.status));

/* ---- 14. o site sai do mesmo worker que a api ---- */
const raw = (path) => worker.fetch(new Request("https://x.com" + path), env);
r = await raw("/");
check("a raiz serve o site", r.status === 200 && (await r.text()).includes("merlin"));
r = await raw("/qualquer/coisa");
check("caminho desconhecido cai no site, nao em 404 de api", r.status === 200);
r = await raw("/api/naoexiste");
check("rota de api inexistente ainda da 404", r.status === 404);
r = await raw("/api/me");
check("api continua respondendo", r.status === 200);

console.log("\n" + passed + " passaram, " + failures.length + " falharam");
if (failures.length) { console.log("\nFALHAS:"); failures.forEach(f => console.log("  - " + f)); process.exit(1); }
