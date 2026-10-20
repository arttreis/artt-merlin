/* testa o worker contra um D1 de mentira, em memoria, com SQL de verdade
   feito na mao. o objetivo nao e cobrir SQL — e provar o fluxo de auth. */
import worker from "./worker.js";

/* ---- D1 falso: entende so as consultas que o worker faz ---- */
const db = { people: [], codes: [], days: [], docs: [], advice: [], usage: [], shares: [], waitlist: [] };
let sentEmails = [];
let failUsage = false;
/* a linha "merlin <tarefa> in=… out=…" do worker e para o wrangler tail: aqui
   ela vai para um vetor, e os testes da medicao a conferem */
const logged = [];
const realLog = console.log;
console.log = (...x) => { if (/^merlin /.test(String(x[0]))) logged.push(x.join(" ")); else realLog(...x); };

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

/* toda leitura da tabela docs, para provar que o retrato não faz o worker
   ler documento nenhum além do perfil */
let docReads = [];

function run(sql, a, mode) {
  const s = sql.replace(/\s+/g, " ").trim();
  if (/^SELECT\b.*\bFROM docs\b/.test(s)) docReads.push(s);

  if (s.startsWith("SELECT COUNT(*) AS n FROM codes")) {
    return { n: db.codes.filter(c => c.email === a[0] && c.expires_at > a[1]).length };
  }
  if (s.startsWith("SELECT COUNT(*) AS n FROM waitlist")) {
    return { n: db.waitlist.filter(w => w.created_at > a[0]).length };
  }
  if (s.startsWith("INSERT OR IGNORE INTO waitlist")) {
    if (db.waitlist.some(w => w.email === a[0])) return { meta: { changes: 0 } };
    db.waitlist.push({ email: a[0], created_at: a[1] });
    return { meta: { changes: 1 } };
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
  /* o perfil que o conselheiro le a cada pedido (worker.js, profileOf) */
  if (s.startsWith("SELECT doc FROM docs WHERE person = ? AND type = 'profile'")) {
    return db.docs.find((d) => d.person === a[0] && d.type === "profile" && d.id === "me") || null;
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
  /* a medicao (worker.js, recordUsage): soma n e os tokens na linha da pessoa,
     do dia e da tarefa. failUsage simula o D1 caindo so nesta escrita. */
  if (s.startsWith("INSERT INTO usage")) {
    if (failUsage) throw new Error("d1 fora do ar");
    const [person, day, task, tin, tout] = a;
    const ex = db.usage.find(x => x.person === person && x.day === day && x.task === task);
    if (ex) { ex.n++; ex.tokens_in += tin; ex.tokens_out += tout; }
    else db.usage.push({ person, day, task, n: 1, tokens_in: tin, tokens_out: tout });
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
let claudeSystem = "";       /* o system, para conferir que o perfil vai junto */
globalThis.fetch = async (url, opts) => {
  if (String(url).includes("api.anthropic.com")) {
    const request = JSON.parse(opts.body);
    claudeMessages = request.messages;
    claudeSystem = request.system;
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
/* desde 19/10/2026 ha uma pele so: quem entra pela Guessless recebe o mesmo
   e-mail roxo do Merlin */
check("e-mail da casa usa o roxo do Merlin", sentEmails[0].html.includes("#8B5CF6"), "sem o roxo");
check("e-mail da casa nao veste mais a Guessless", !sentEmails[0].html.includes("GuessLess"));

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
check("fora da casa tambem e roxo", sentEmails[1].html.includes("#8B5CF6"));
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
/* a fala do inicio (VISAO, 10): leva a fila e a sequencia, e o perfil gravado
   pelo onboarding vai no system — e o que faz o Merlin falar com a pessoa */
r = await call("POST", "/docs", { type: "profile", id: "me", v: Date.now(), doc: { id: "me", name: "Arthur", work: "SaaS sozinho", building: "Agenda do salão" } }, cookie);
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"text":"Cabem 2h; comece pela landing."}' }] };
r = await call("POST", "/merlin", { task: "checkin", context: { moment: "start", hour: "09:10", window: "09:00–18:00", slack: "cabem 2h", open: ["revisar landing · 45m"], done: [], habits: ["treinar"], streak: 3, products: ["Agenda do salão"] } }, cookie);
body = await r.json();
check("checkin responde texto", r.status === 200 && /landing/.test(body.text), JSON.stringify(body));
check("checkin manda a fila real", /revisar landing/.test(claudeAsked) && /seguidos fechando o dia: 3/.test(claudeAsked), String(claudeAsked).slice(0, 200));
check("o perfil vai no system", /Arthur/.test(claudeSystem) && /Agenda do salão/.test(claudeSystem), claudeSystem.slice(-200));
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"suggestions":[{"type":"step","title":"validar com 3 clientes","note":"antes de codar"}]}' }] };
r = await call("POST", "/merlin", { task: "expand", context: { title: "app", steps: [] } }, cookie);
body = await r.json();
check("merlin ramifica ideia", r.status === 200 && body.suggestions[0].type === "step");
/* o projeto de app: o rascunho volta limpo, e a revisao e texto */
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ pitch: "agenda de salão", features: [{ title: "agendar", phase: "mvp" }, { note: "sem título" }], entities: [{ name: "Cliente", fields: [{ name: "nome", type: "text", required: true }, { type: "text" }] }, { fields: [] }], screens: [{ name: "Agenda", parts: ["calendário"], entities: ["Cliente"], start: true }], flows: [{ from: "Agenda", to: "" }, { from: "Agenda", to: "Agenda", action: "voltou" }] }) }] };
r = await call("POST", "/merlin", { task: "app", context: { name: "salão", description: "agenda para salão de beleza" } }, cookie);
body = await r.json();
check("merlin rascunha o app", r.status === 200 && body.blueprint && body.blueprint.pitch === "agenda de salão", JSON.stringify(body).slice(0, 200));
check("rascunho do app larga o que não tem nome", body.blueprint.features.length === 1 && body.blueprint.entities.length === 1 && body.blueprint.entities[0].fields.length === 1);
check("rascunho do app larga ação sem ponta", body.blueprint.flows.length === 1);
check("merlin recebe a descrição do app", /salão de beleza/.test(claudeAsked));
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"text":"## banco\\n- falta a relação"}' }] };
r = await call("POST", "/merlin", { task: "appReview", context: { spec: "# salão" } }, cookie);
body = await r.json();
check("merlin revisa o app", r.status === 200 && /## banco/.test(body.text), JSON.stringify(body));
/* a captura do inicio: a linha vira itens limpos, no Haiku e numa cota propria */
let claudeModel = "";
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes("api.anthropic.com")) { const q = JSON.parse(opts.body); claudeModel = q.model + "/" + q.output_config.effort; }
  return realFetch(url, opts);
};
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ items: [
  { kind: "task", title: "ligar pro João", min: 30, guess: true, date: "2026-10-11", at: "15:00", client: "" },
  { kind: "note", title: "modo offline", min: 40, date: "2026-10-11", at: "9:00" },
  { kind: "evento", title: "inventado" },
  { kind: "task", title: "   " },
  { kind: "task", title: "maratona", min: 5000, date: "amanhã", at: "tarde" }
] }) }] };
/* a cota mora em hora × 4 + o balde: 0 conselho, 1 leitura, 2 montagem */
const spent = (slot) => db.advice.filter((x) => x.hour % 4 === slot).reduce((s, x) => s + x.n, 0);
const adviceBefore = spent(0);
r = await call("POST", "/merlin", { task: "capture", context: { text: "ligar pro João amanhã às 15h e se o merlin tivesse modo offline", today: "2026-10-10 (sábado)", hour: "14:20", clients: ["Ana"] } }, cookie);
body = await r.json();
check("captura devolve itens", r.status === 200 && body.items.length === 3, JSON.stringify(body));
check("captura guarda data, hora e estimativa da tarefa", body.items[0].date === "2026-10-11" && body.items[0].at === "15:00" && body.items[0].guess === true);
check("captura zera o que ideia não tem", body.items[1].min === 0 && body.items[1].date === "" && body.items[1].at === "");
check("captura corta duração e larga data e hora inválidas", body.items[2].min === 720 && body.items[2].date === "" && body.items[2].at === "");
check("captura vai no Haiku com pouco esforço", claudeModel === "claude-haiku-5-5/low", claudeModel);
check("captura manda a linha e os clientes", /ligar pro João/.test(claudeAsked) && /Clientes: Ana/.test(claudeAsked));
check("captura não gasta a cota do conselho", spent(0) === adviceBefore && spent(1) === 1);
/* montar com o Merlin: a pergunta no Haiku conta como um conselho; rascunho
   e ajuste no Opus contam na cota da montagem */
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ questions: [
  { q: "O que você vende e por quanto?", options: ["consultoria de R$ 5 mil", "curso de R$ 497", "", "assinatura", "outro"] },
  { q: "  " }, { q: "Por onde chega o cliente?", options: ["Meta Ads"] }, { q: "4" }, { q: "5" }
] }) }] };
r = await call("POST", "/merlin", { task: "build", context: { kind: "funnel", step: "brief", request: "monta um funil para minha consultoria" } }, cookie);
body = await r.json();
check("montagem pergunta antes", r.status === 200 && body.questions.length === 3 && body.questions[0].options.length === 3, JSON.stringify(body));
check("a pergunta vai no Haiku e conta como conselho", claudeModel === "claude-haiku-5-5/low" && spent(0) === adviceBefore + 1, claudeModel);
check("a pergunta leva o que importa no funil", /onde a venda fecha/.test(claudeMessages.at(-1).content) && /minha consultoria/.test(claudeAsked));
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({
  name: "Consultoria por anúncio", channel: "Meta Ads",
  stages: [{ nodeType: "ad", title: "anúncio de diagnóstico" }, { nodeType: "cta", title: "botão" }, { nodeType: "lp", title: "página da consultoria", after: "anúncio de diagnóstico" }, { title: "" }],
  creatives: [{ title: "antes e depois", format: "reels", stage: "anúncio de diagnóstico" }],
  offers: [{ name: "consultoria 3 meses", price: "5000", type: "combo" }, { price: 10 }],
  automations: [{ name: "lembrete de call", trigger: "agendou", action: "whatsapp 1h antes" }],
  triggers: [{ name: "escassez", usage: "5 vagas por mês" }],
  summary: "funil curto, de anúncio a call"
}) }] };
const buildBefore = spent(2);
r = await call("POST", "/merlin", { task: "build", context: { kind: "funnel", step: "draft", request: "monta um funil para minha consultoria", answers: "O que você vende? consultoria de R$ 5 mil" } }, cookie);
body = await r.json();
check("montagem devolve o rascunho do funil", r.status === 200 && body.draft.stages.length === 3 && body.summary === "funil curto, de anúncio a call", JSON.stringify(body).slice(0, 300));
check("rascunho do funil troca etapa que não existe e formato que não existe", body.draft.stages[1].nodeType === "custom" && body.draft.creatives[0].format === "image");
check("rascunho do funil limpa a oferta", body.draft.offers.length === 1 && body.draft.offers[0].price === 5000 && body.draft.offers[0].type === "main");
check("o rascunho vai no Opus e conta na montagem", claudeModel === "claude-opus-5-5/medium" && spent(2) === buildBefore + 1 && spent(0) === adviceBefore + 1, claudeModel);
check("o rascunho leva as respostas", /consultoria de R\$ 5 mil/.test(claudeAsked));
r = await call("POST", "/merlin", { task: "build", context: { kind: "funnel", step: "revise", request: "monta um funil", draft: body.draft, change: "tira o botão" } }, cookie);
body = await r.json();
check("o ajuste manda o rascunho atual e o pedido", r.status === 200 && /Rascunho atual/.test(claudeAsked) && /anúncio de diagnóstico/.test(claudeAsked) && /Ajuste pedido: tira o botão/.test(claudeAsked) && /AJUSTE/.test(claudeMessages.at(-1).content));
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ name: "Lançamento", tree: { title: "lançamento", children: [{ title: "oferta", children: [{ title: "a", children: [{ title: "b", children: [{ title: "fundo demais" }] }] }] }, { title: "" }] } }) }] };
r = await call("POST", "/merlin", { task: "build", context: { kind: "map", step: "draft", request: "mapa do lançamento" } }, cookie);
body = await r.json();
check("rascunho do mapa corta no quarto nível", r.status === 200 && body.draft.tree.children.length === 1 && body.draft.tree.children[0].children[0].children[0].children.length === 0, JSON.stringify(body).slice(0, 300));
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ name: "Agenda", pitch: "agenda de salão", features: [{ title: "agendar", phase: "mvp" }] }) }] };
r = await call("POST", "/merlin", { task: "build", context: { kind: "app", step: "draft", request: "app de agenda para salão" } }, cookie);
body = await r.json();
check("rascunho do app sai no formato do projeto, com nome", r.status === 200 && body.draft.name === "Agenda" && body.draft.features.length === 1 && Array.isArray(body.draft.entities), JSON.stringify(body).slice(0, 200));
check("o rascunho do app pede o nome", /"name":"…","pitch"/.test(claudeMessages.at(-1).content));
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"name":"vazio","stages":[]}' }] };
r = await call("POST", "/merlin", { task: "build", context: { kind: "funnel", step: "draft", request: "x" } }, cookie);
check("rascunho vazio é erro, não funil vazio", r.status === 502);
r = await call("POST", "/merlin", { task: "build", context: { kind: "planilha", step: "draft", request: "x" } }, cookie);
check("montagem recusa o que não sabe montar", r.status === 400);
r = await call("POST", "/merlin", { task: "build", context: { kind: "map", step: "publicar", request: "x" } }, cookie);
check("montagem recusa passo que não existe", r.status === 400);
globalThis.fetch = realFetch;
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

/* quem pede para fechar o dia ao assistente é mandado ao campo do início, onde isso não gasta crédito */
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"suggestions":[],"clarify":"é só escrever \\"fechar o dia\\" no início"}' }] };
r = await call("POST", "/merlin", { task: "assistant", context: { message: "quero fechar o dia" } }, cookie);
body = await r.json();
check("assistente responde ao pedido de fechar o dia", r.status === 200 && body.suggestions.length === 0 && /fechar o dia/.test(body.clarify), JSON.stringify(body));
check("a instrução manda escrever \"fechar o dia\" no campo do início", claudeMessages.at(-1).content.includes('é só escrever "fechar o dia" no campo do início'));
check("a instrução também aponta \"revisar a semana\"", claudeMessages.at(-1).content.includes("revisar a semana"));

/* o assistente pode pedir o cartão do "o que falta hoje?": `show` passa só se
   for um valor da lista fechada (["quests"]). a tela monta o cartão sozinha, e
   o modelo não escreve a lista. */
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"show":"quests","clarify":""}' }] };
r = await call("POST", "/merlin", { task: "assistant", context: { message: "o que eu faço agora?" } }, cookie);
body = await r.json();
check("assistente pede o cartão: show passa", r.status === 200 && body.show === "quests", JSON.stringify(body));
check("assistente pede o cartão: sem sugestões inventadas", r.status === 200 && Array.isArray(body.suggestions) && body.suggestions.length === 0, JSON.stringify(body));

claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"show":"tudo","clarify":""}' }] };
r = await call("POST", "/merlin", { task: "assistant", context: { message: "me mostra tudo" } }, cookie);
body = await r.json();
check("show fora da lista fechada não passa", r.status === 200 && !("show" in body), JSON.stringify(body));

claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"suggestions":[],"clarify":"e pra qual etapa?"}' }] };
r = await call("POST", "/merlin", { task: "assistant", context: { message: "e essa etapa" } }, cookie);
body = await r.json();
check("sem show na resposta do modelo, a chave não vem", r.status === 200 && !("show" in body), JSON.stringify(body));

/* ---- 13e-ter. o registro de dinheiro ----
   a leitura do inicio e a conversa passam a aceitar lancamento. o que o Worker
   garante aqui e o que a IA nao pode decidir sozinha: a categoria so existe se
   foi enviada, o id de previsto e de fixo so vale se estava no contexto, o
   valor e inteiro e limitado, e "pago" vem da data — nunca do que a IA disse. */
const moneyCtx = {
  today: "2026-10-17 (sábado)", hour: "14:20", clients: [],
  categories: ["Básicas/PF", "Lazer", "Freela"],
  planned: [{ id: "p1", name: "aluguel", amount: 150000, day: "2026-10-15" }],
  fixed: [{ id: "f1", name: "internet", amount: 12000, day: 20 }]
};
const money = (over) => ({ kind: "money", title: "almoço", amount: 4500, flow: "out", category: "Lazer", date: "2026-10-17", paid: true, confirm: "", fixed: "", ...over });
const readLine = async (text, items) => {
  claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ items }) }] };
  const res = await call("POST", "/merlin", { task: "capture", context: { ...moneyCtx, text } }, cookie);
  return { status: res.status, body: await res.json() };
};

let money13 = await readLine("gastei 45 no almoço", [money()]);
check("dinheiro: a leitura devolve o gasto", money13.status === 200 && money13.body.items.length === 1, JSON.stringify(money13.body));
check("dinheiro: o gasto volta como money, saída, 4500, pago", money13.body.items[0].kind === "money" && money13.body.items[0].flow === "out" && money13.body.items[0].amount === 4500 && money13.body.items[0].paid === true, JSON.stringify(money13.body.items[0]));
check("dinheiro: o gasto volta com título, categoria e data", money13.body.items[0].title === "almoço" && money13.body.items[0].category === "Lazer" && money13.body.items[0].date === "2026-10-17", JSON.stringify(money13.body.items[0]));
check("dinheiro: a leitura manda as categorias, os previstos e os fixos", /Lazer/.test(claudeAsked) && /aluguel/.test(claudeAsked) && /internet/.test(claudeAsked) && /p1/.test(claudeAsked) && /f1/.test(claudeAsked), String(claudeAsked).slice(0, 400));

/* paid vem da data: a IA diz "pago" para o que e de depois de hoje, e o Worker nao deixa */
money13 = await readLine("dentista dia 25, 300", [money({ title: "dentista", amount: 30000, date: "2026-10-25", paid: true })]);
check("dinheiro: data depois de hoje volta como previsto, mesmo com paid true", money13.body.items[0].paid === false && money13.body.items[0].date === "2026-10-25", JSON.stringify(money13.body.items[0]));
money13 = await readLine("paguei a luz ontem", [money({ title: "luz", date: "2026-10-16", paid: false })]);
check("dinheiro: data passada volta como pago, mesmo com paid false", money13.body.items[0].paid === true, JSON.stringify(money13.body.items[0]));
money13 = await readLine("paguei a luz", [money({ title: "luz", date: "2026-10-17", paid: false })]);
check("dinheiro: hoje volta como pago", money13.body.items[0].paid === true, JSON.stringify(money13.body.items[0]));
money13 = await readLine("paguei a luz", [money({ title: "luz", date: "ontem", paid: true })]);
check("dinheiro: data inválida vira hoje", money13.body.items[0].date === "2026-10-17" && money13.body.items[0].paid === true, JSON.stringify(money13.body.items[0]));

/* confirm e fixed so valem se o id foi enviado no contexto */
money13 = await readLine("paguei o aluguel", [money({ title: "aluguel", amount: 0, confirm: "inventado" })]);
check("dinheiro: confirm com id que não foi enviado volta vazio", money13.body.items[0].confirm === "", JSON.stringify(money13.body.items[0]));
money13 = await readLine("paguei o aluguel", [money({ title: "aluguel", amount: 0, confirm: "p1" })]);
check("dinheiro: confirm com id de um previsto enviado fica", money13.body.items[0].confirm === "p1" && money13.body.items[0].amount === 0, JSON.stringify(money13.body.items[0]));
money13 = await readLine("paguei a internet", [money({ title: "internet", fixed: "inventado" })]);
check("dinheiro: fixed com id que não foi enviado volta vazio", money13.body.items[0].fixed === "", JSON.stringify(money13.body.items[0]));
money13 = await readLine("paguei a internet", [money({ title: "internet", amount: 0, fixed: "f1" })]);
check("dinheiro: fixed com id de um fixo enviado fica", money13.body.items[0].fixed === "f1", JSON.stringify(money13.body.items[0]));
money13 = await readLine("paguei o aluguel", [money({ title: "aluguel", confirm: "f1", fixed: "p1" })]);
check("dinheiro: id de fixo não vale como confirm, nem o de previsto como fixed", money13.body.items[0].confirm === "" && money13.body.items[0].fixed === "", JSON.stringify(money13.body.items[0]));

/* o valor: inteiro, entre 0 e 100.000.000 */
money13 = await readLine("gastei uns trocados", [money({ amount: -10 }), money({ amount: "abc" }), money({ amount: null }), money({ amount: 4550.6 }), money({ amount: 99999999999 })]);
check("dinheiro: valor negativo volta 0", money13.body.items[0].amount === 0, JSON.stringify(money13.body.items[0]));
check("dinheiro: valor em texto volta 0", money13.body.items[1].amount === 0, JSON.stringify(money13.body.items[1]));
check("dinheiro: valor ausente volta 0", money13.body.items[2].amount === 0, JSON.stringify(money13.body.items[2]));
check("dinheiro: valor quebrado volta inteiro", Number.isInteger(money13.body.items[3].amount) && Math.abs(money13.body.items[3].amount - 4550.6) <= 1, JSON.stringify(money13.body.items[3]));
check("dinheiro: valor enorme não passa de 100.000.000", money13.body.items[4].amount >= 0 && money13.body.items[4].amount <= 100000000, JSON.stringify(money13.body.items[4]));

/* categoria e entrada/saida */
money13 = await readLine("gastei 80 na feira", [money({ category: "Mercado" }), money({ category: "Lazer" })]);
check("dinheiro: categoria que não foi enviada volta vazia", money13.body.items[0].category === "", JSON.stringify(money13.body.items[0]));
check("dinheiro: categoria enviada fica", money13.body.items[1].category === "Lazer", JSON.stringify(money13.body.items[1]));
money13 = await readLine("transferi pra Ana", [money({ flow: "transfer" }), money({ flow: "in" }), money({ flow: undefined })]);
check("dinheiro: entrada ou saída fora de in e out vira saída", money13.body.items[0].flow === "out" && money13.body.items[2].flow === "out", JSON.stringify(money13.body.items));
check("dinheiro: a entrada continua entrada", money13.body.items[1].flow === "in", JSON.stringify(money13.body.items[1]));

/* uma linha com varias coisas: a ordem do que a pessoa escreveu fica */
money13 = await readLine("gastei 45 no almoço, recebi 3 mil da Ana e ligar pro João amanhã", [
  money(),
  money({ title: "Ana", amount: 300000, flow: "in", category: "Freela" }),
  { kind: "task", title: "ligar pro João", min: 30, guess: true, date: "2026-10-18", at: "", client: "" }
]);
check("dinheiro: a linha com três coisas devolve três itens", money13.body.items.length === 3, JSON.stringify(money13.body.items));
check("dinheiro: dois money e uma task, nessa ordem", money13.body.items.map((x) => x.kind).join() === "money,money,task", money13.body.items.map((x) => x.kind).join());
check("dinheiro: o segundo é a entrada de 3 mil", money13.body.items[1].flow === "in" && money13.body.items[1].amount === 300000 && money13.body.items[1].title === "Ana", JSON.stringify(money13.body.items[1]));
check("dinheiro: a tarefa continua limpa como sempre", money13.body.items[2].title === "ligar pro João" && money13.body.items[2].date === "2026-10-18" && money13.body.items[2].min === 30, JSON.stringify(money13.body.items[2]));
check("dinheiro: a tarefa não leva campos de dinheiro", !("amount" in money13.body.items[2]) && !("flow" in money13.body.items[2]), JSON.stringify(money13.body.items[2]));
money13 = await readLine("ideia, gastei 10 e talvez fazer x", [
  { kind: "note", title: "modo offline", min: 40 }, money({ amount: 1000 }), { kind: "task", title: "fazer x", min: 15, date: "2026-10-17" }
]);
check("dinheiro: note, money e task misturados mantêm a ordem", money13.body.items.map((x) => x.kind).join() === "note,money,task", money13.body.items.map((x) => x.kind).join());
money13 = await readLine("gastei", [{ kind: "money", title: "   ", amount: 100 }]);
check("dinheiro: item sem título é descartado, como as tarefas", money13.status === 200 && money13.body.items.length === 0, JSON.stringify(money13.body));

/* a conversa: o catalogo ganha finance-entry, com os campos fechados */
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ suggestions: [{ actionType: "finance-entry", title: "gasto de R$ 45,00", note: "no almoço", payload: {
  name: "almoço", amount: 4500, kind: "out", day: "2026-10-17", category: "Lazer", paid: true, confirm: "p1", fixed: "f1", hack: "<script>"
} }], clarify: "" }) }] };
r = await call("POST", "/merlin", { task: "assistant", context: { message: "gastei 45 no almoço" } }, cookie);
body = await r.json();
check("conversa: finance-entry entra no catálogo", r.status === 200 && body.suggestions.length === 1 && body.suggestions[0].actionType === "finance-entry", JSON.stringify(body));
check("conversa: a proposta só tem os nove campos do catálogo", body.suggestions[0] && Object.keys(body.suggestions[0].payload).sort().join() === "amount,book,category,confirm,day,fixed,kind,name,paid" && !("hack" in body.suggestions[0].payload), JSON.stringify(body.suggestions[0] && body.suggestions[0].payload));
check("conversa: os campos guardam o que a IA propôs", body.suggestions[0] && body.suggestions[0].payload.amount === 4500 && body.suggestions[0].payload.name === "almoço", JSON.stringify(body.suggestions[0] && body.suggestions[0].payload));
check("conversa: a instrução ensina o tipo novo", /finance-entry/.test(claudeAsked), String(claudeAsked).slice(0, 300));
/* o caixa da empresa (ticket #75): o livro do lançamento é um campo fechado,
   pessoal na dúvida */
check("conversa: sem book na proposta, chega pessoal", body.suggestions[0] && body.suggestions[0].payload.book === "personal", JSON.stringify(body.suggestions[0] && body.suggestions[0].payload));
/* estas chamadas a mais gastam a cota do conselho (30 por hora); a cota é
   guardada e devolvida no fim, para os testes de depois não pagarem por elas */
const adviceSnap = db.advice.map((x) => ({ ...x }));
db.advice.length = 0;
const financeSpec = (claudeAsked.match(/finance-entry \{[\s\S]{0,2500}/) || [""])[0];
check("conversa: a instrução do finance-entry cita o campo book", /\bbook\b/.test(financeSpec), financeSpec.slice(0, 200));
check("conversa: a instrução do finance-entry fala da empresa", /empresa/.test(financeSpec), financeSpec.slice(0, 200));
const bookAnswer = (book) => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ suggestions: [{ actionType: "finance-entry", title: "gasto de R$ 80,00", note: "", payload: { name: "Figma", amount: 8000, kind: "out", day: "2026-10-17", category: "Ferramentas", paid: true, confirm: "", fixed: "", ...(book === undefined ? {} : { book }) } }], clarify: "" }) }] });
for (const [sent, want, label] of [["business", "business", "business chega business"], ["x", "personal", "um livro inventado chega pessoal"], ["personal", "personal", "personal chega pessoal"], [undefined, "personal", "ausente chega pessoal"], [7, "personal", "que não é texto chega pessoal"], ["BUSINESS", "personal", "só o valor exato business vale"]]) {
  claudeAnswer = bookAnswer(sent);
  r = await call("POST", "/merlin", { task: "assistant", context: { message: "paguei o Figma da empresa" } }, cookie);
  body = await r.json();
  check("conversa: finance-entry com book " + label, r.status === 200 && body.suggestions.length === 1 && body.suggestions[0].payload.book === want, JSON.stringify(body.suggestions[0] && body.suggestions[0].payload));
}
claudeAnswer = bookAnswer("business");
r = await call("POST", "/merlin", { task: "assistant", context: { message: "paguei o Figma da empresa" } }, cookie);
body = await r.json();
check("conversa: com book business, o resto da proposta continua o mesmo", body.suggestions[0] && body.suggestions[0].payload.name === "Figma" && body.suggestions[0].payload.amount === 8000 && body.suggestions[0].payload.category === "Ferramentas" && Object.keys(body.suggestions[0].payload).sort().join() === "amount,book,category,confirm,day,fixed,kind,name,paid", JSON.stringify(body.suggestions[0] && body.suggestions[0].payload));
db.advice.splice(0, db.advice.length, ...adviceSnap);
/* o retrato (PRD da secretária, D8 e D9): vai num campo próprio, com teto de
   6.000; só na pergunta ao assistente; o segredo MERLIN_PORTRAIT_OFF o tira de
   todos; e a resposta diz de onde tirou, numa lista fechada */
const PORTRAIT = "RETRATO-XYZ " + "a".repeat(7988);
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"suggestions":[],"clarify":"quinta às 10h, a call com a Ana","sources":["agenda","inventado"]}' }] };
docReads = [];
r = await call("POST", "/merlin", { task: "assistant", context: { message: "o que tenho quinta?", portrait: PORTRAIT, pageContext: "TELA-" + "b".repeat(2000) } }, cookie);
body = await r.json();
check("o retrato vai no pedido do assistente", r.status === 200 && claudeAsked.includes("Retrato") && claudeAsked.includes("RETRATO-XYZ"), String(claudeAsked).slice(0, 200));
check("o retrato é cortado em 6.000", claudeAsked.includes(PORTRAIT.slice(0, 6000)) && !claudeAsked.includes(PORTRAIT.slice(0, 6001)));
check("o contexto da tela continua com 1.200", claudeAsked.includes("TELA-" + "b".repeat(1195)) && !claudeAsked.includes("TELA-" + "b".repeat(1196)));
check("as fontes saem filtradas pela lista fechada", JSON.stringify(body.sources) === '["agenda"]', JSON.stringify(body.sources));
check("o retrato não faz o worker ler documento além do perfil", docReads.length === 1 && /type = 'profile'/.test(docReads[0]), JSON.stringify(docReads));
check("a linha de medição traz o tamanho do retrato que foi, já cortado", / portrait=6000$/.test(logged.at(-1)), logged.at(-1));
/* a saúde (ticket #66): "vi a saúde" é uma fonte aceita; a instrução fala da
   seção e do interruptor do perfil, para a IA saber dizer como religar */
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"suggestions":[],"clarify":"média de 6h40 em 5 noites","sources":["saúde","inventado","agenda"]}' }] };
r = await call("POST", "/merlin", { task: "assistant", context: { message: "como dormi essa semana?", portrait: "saúde:\nsono 7d: média 6h40 · 5 noites · última 6h" } }, cookie);
body = await r.json();
check("a saúde está na lista de fontes aceitas", r.status === 200 && Array.isArray(body.sources) && body.sources.includes("saúde"), JSON.stringify(body.sources));
check("as fontes aceitas seguem a ordem da lista fechada, com a saúde no fim", JSON.stringify(body.sources) === '["agenda","saúde"]', JSON.stringify(body.sources));
check("o pedido lista a saúde entre as fontes", /só dentre exatamente estes valores: [^.]*saúde/.test(claudeAsked), String(claudeAsked).slice(0, 300));
check("a instrução fala da seção saúde e do interruptor do perfil", /saúde[\s\S]{0,400}perfil|perfil[\s\S]{0,400}saúde/.test(claudeAsked), String(claudeAsked).slice(0, 300));
/* o caixa da empresa (ticket #76): "vi o negócio" é uma fonte aceita, no fim da
   lista fechada; "dinheiro" é o pessoal, e a instrução diz a diferença */
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ suggestions: [], clarify: "caixa de R$ 8.400, fôlego de 4,2 meses", sources: ["negócio", "inventado", "dinheiro"] }) }] };
r = await call("POST", "/merlin", { task: "assistant", context: { message: "como está o caixa da empresa?", portrait: "negócio:\ncaixa hoje +R$ 8.400 · fim do mês +R$ 6.100 · fôlego 4,2 meses" } }, cookie);
body = await r.json();
check("o negócio está na lista de fontes aceitas", r.status === 200 && Array.isArray(body.sources) && body.sources.includes("negócio"), JSON.stringify(body.sources));
check("as fontes aceitas seguem a ordem da lista fechada, com o negócio no fim", JSON.stringify(body.sources) === '["dinheiro","negócio"]', JSON.stringify(body.sources));
check("o fora da lista continua fora, mesmo ao lado do negócio", !body.sources.includes("inventado"), JSON.stringify(body.sources));
check("o pedido lista o negócio entre as fontes", /só dentre exatamente estes valores: [^.]*negócio/.test(claudeAsked), String(claudeAsked).slice(0, 300));
check("o negócio é o último valor da lista que o pedido oferece", /só dentre exatamente estes valores: [^(]*saúde, negócio(\s|\.|\()/.test(claudeAsked), String(claudeAsked).slice(0, 300));
check("a instrução diz que dinheiro é o pessoal e negócio é o caixa da empresa", /dinheiro é o (dinheiro )?pessoal/.test(claudeAsked) && /negócio é o caixa da empresa/.test(claudeAsked), String(claudeAsked).slice(0, 300));
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"suggestions":[],"clarify":"ok"}' }] };
r = await call("POST", "/merlin", { task: "assistant", context: { message: "e aí?" } }, cookie);
body = await r.json();
check("sem fontes na resposta, a lista vem vazia", r.status === 200 && Array.isArray(body.sources) && body.sources.length === 0, JSON.stringify(body));
check("sem retrato, o pedido não fala em retrato", !claudeAsked.includes("Retrato ("), String(claudeAsked).slice(0, 200));
env.MERLIN_PORTRAIT_OFF = "1";
r = await call("POST", "/merlin", { task: "assistant", context: { message: "o que tenho quinta?", portrait: PORTRAIT } }, cookie);
check("com MERLIN_PORTRAIT_OFF, o retrato não vai", r.status === 200 && !claudeAsked.includes("RETRATO-XYZ") && !claudeAsked.includes("aaaaaaaaaa"), String(claudeAsked).slice(0, 200));
delete env.MERLIN_PORTRAIT_OFF;
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"text":"Cabem 2h."}' }] };
r = await call("POST", "/merlin", { task: "checkin", context: { moment: "start", hour: "09:10", window: "09:00–18:00", slack: "cabem 2h", open: [], done: [], habits: [], streak: 0, products: [], portrait: PORTRAIT } }, cookie);
check("o check-in não leva o retrato", r.status === 200 && !claudeMessages.some((m) => m.content.includes("RETRATO-XYZ")), String(claudeAsked).slice(0, 200));
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"items":[{"kind":"task","title":"ligar","min":15}]}' }] };
r = await call("POST", "/merlin", { task: "capture", context: { text: "ligar", today: "2026-10-19 (segunda)", hour: "14:20", clients: [], portrait: PORTRAIT } }, cookie);
check("a leitura não leva o retrato", r.status === 200 && !claudeMessages.some((m) => m.content.includes("RETRATO-XYZ")), String(claudeAsked).slice(0, 200));

/* ---- 13e-quater. o hábito ----
   "treinei" escrito no início, ou dito na conversa, vira um item de hábito. o
   que o Worker garante aqui é o que a IA não pode decidir sozinha: o nome do
   hábito só vale se estava na lista que o navegador mandou (senão o início
   oferece criar, e criar é uma caixa, nunca um efeito colateral da leitura), e a
   data é um dia de verdade. */
const habitCtx = {
  today: "2026-10-18 (domingo)", hour: "09:10", clients: [],
  habits: ["treinar", "ler 20 páginas"]
};
const habitItem = (over) => ({ kind: "habit", habit: "treinar", name: "treinei", date: "2026-10-18", ...over });
const readHabit = async (text, items, ctx) => {
  claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ items }) }] };
  const res = await call("POST", "/merlin", { task: "capture", context: { ...(ctx || habitCtx), text } }, cookie);
  return { status: res.status, body: await res.json() };
};

/* existente: o nome é o de um dos hábitos enviados */
let hab13 = await readHabit("treinei", [habitItem()]);
check("hábito: a leitura devolve um item", hab13.status === 200 && hab13.body.items.length === 1, JSON.stringify(hab13.body));
check("hábito: 'treinei' com 'treinar' no contexto volta com habit treinar", hab13.body.items[0].kind === "habit" && hab13.body.items[0].habit === "treinar", JSON.stringify(hab13.body.items[0]));
check("hábito: o name é o que a pessoa disse, e a data é a dita", hab13.body.items[0].name === "treinei" && hab13.body.items[0].date === "2026-10-18", JSON.stringify(hab13.body.items[0]));
check("hábito: o item só tem kind, habit, name e date", Object.keys(hab13.body.items[0] || {}).sort().join() === "date,habit,kind,name", JSON.stringify(hab13.body.items[0]));
check("hábito: os nomes dos hábitos vão no pedido", /treinar/.test(claudeAsked) && /ler 20 páginas/.test(claudeAsked) && /Hábitos:/.test(claudeAsked), String(claudeAsked).slice(0, 400));
check("hábito: a instrução ensina o tipo", /habit/.test(claudeAsked));

/* inexistente: o nome que a IA inventou não passa, e o que a pessoa disse fica */
hab13 = await readHabit("fiz yoga", [habitItem({ habit: "yoga", name: "yoga" })]);
check("hábito: 'yoga' que não está no contexto volta com habit vazio e name yoga", hab13.body.items.length === 1 && hab13.body.items[0].habit === "" && hab13.body.items[0].name === "yoga", JSON.stringify(hab13.body.items));
hab13 = await readHabit("fiz yoga", [habitItem({ habit: "yoga", name: undefined })]);
check("hábito: sem name, o nome que a IA mandou em habit vira o name", hab13.body.items[0].habit === "" && hab13.body.items[0].name === "yoga", JSON.stringify(hab13.body.items));
hab13 = await readHabit("fiz yoga", [habitItem({ habit: undefined, name: undefined, title: "yoga" })]);
check("hábito: sem name e sem habit, o title serve de name", hab13.body.items.length === 1 && hab13.body.items[0].habit === "" && hab13.body.items[0].name === "yoga", JSON.stringify(hab13.body.items));
hab13 = await readHabit("treinei", [habitItem()], { ...habitCtx, habits: [] });
check("hábito: sem nenhum hábito no contexto, o habit volta vazio", hab13.body.items[0].habit === "" && hab13.body.items[0].name === "treinei", JSON.stringify(hab13.body.items));
hab13 = await readHabit("treinei", [habitItem()], { today: habitCtx.today, hour: "09:10", clients: [] });
check("hábito: contexto sem a chave habits não quebra, e o habit volta vazio", hab13.status === 200 && hab13.body.items[0].habit === "", JSON.stringify(hab13.body));

/* o nome volta como foi enviado; só se aceita igual (sem maiúscula e espaço) */
hab13 = await readHabit("treinei", [habitItem({ habit: "Treinar" }), habitItem({ habit: "  treinar  " }), habitItem({ habit: "LER 20 PÁGINAS" })]);
check("hábito: maiúscula e espaços não impedem o acerto, e volta o nome enviado", hab13.body.items.map((x) => x.habit).join("|") === "treinar|treinar|ler 20 páginas", JSON.stringify(hab13.body.items));
hab13 = await readHabit("li", [habitItem({ habit: "ler", name: "li" })]);
check("hábito: começo do nome não vale no Worker (só igual)", hab13.body.items[0].habit === "" && hab13.body.items[0].name === "li", JSON.stringify(hab13.body.items));

/* a data */
hab13 = await readHabit("ontem li", [habitItem({ habit: "ler 20 páginas", name: "li", date: "2026-10-17" })]);
check("hábito: a data dita (ontem) fica", hab13.body.items[0].date === "2026-10-17", JSON.stringify(hab13.body.items[0]));
hab13 = await readHabit("treinei", [habitItem({ date: "ontem" })]);
check("hábito: data inválida vira o dia de context.today", hab13.body.items[0].date === "2026-10-18", JSON.stringify(hab13.body.items[0]));
hab13 = await readHabit("treinei", [habitItem({ date: undefined })]);
check("hábito: sem data vira o dia de context.today", hab13.body.items[0].date === "2026-10-18", JSON.stringify(hab13.body.items[0]));
hab13 = await readHabit("treinei", [habitItem({ date: "2026-10-1" })]);
check("hábito: data fora do formato AAAA-MM-DD vira hoje", hab13.body.items[0].date === "2026-10-18", JSON.stringify(hab13.body.items[0]));

/* sem nome nenhum, não é item */
hab13 = await readHabit("hum", [{ kind: "habit", habit: "", name: "   ", date: "2026-10-18" }, { kind: "habit" }]);
check("hábito: item sem name e sem habit é descartado", hab13.status === 200 && hab13.body.items.length === 0, JSON.stringify(hab13.body));

/* o nome da IA é cortado, como o título das tarefas */
hab13 = await readHabit("treinei", [habitItem({ habit: "", name: "x".repeat(300) })]);
check("hábito: name enorme é cortado", hab13.body.items[0].name.length > 0 && hab13.body.items[0].name.length <= 120, String(hab13.body.items[0].name.length));

/* a IA manda campo a mais e ele não passa */
hab13 = await readHabit("treinei", [habitItem({ amount: 4500, title: "x", hack: "<script>", min: 30 })]);
check("hábito: campo de outro tipo não vaza para o item", Object.keys(hab13.body.items[0]).sort().join() === "date,habit,kind,name", JSON.stringify(hab13.body.items[0]));

/* uma linha com várias coisas: a ordem fica */
hab13 = await readHabit("gastei 45 no almoço e treinei", [money(), habitItem()]);
check("hábito: a linha com gasto e treino devolve os dois", hab13.body.items.length === 2, JSON.stringify(hab13.body.items));
check("hábito: money e habit, nessa ordem", hab13.body.items.map((x) => x.kind).join() === "money,habit", hab13.body.items.map((x) => x.kind).join());
check("hábito: o gasto continua limpo e o hábito leva o nome", hab13.body.items[0].amount === 4500 && hab13.body.items[0].title === "almoço" && hab13.body.items[1].habit === "treinar" && !("amount" in hab13.body.items[1]), JSON.stringify(hab13.body.items));
hab13 = await readHabit("treinei, ligar pro João e ideia", [habitItem(), { kind: "task", title: "ligar pro João", min: 30, date: "2026-10-18" }, { kind: "note", title: "modo offline" }, habitItem({ habit: "yoga", name: "yoga" })]);
check("hábito: hábito, tarefa, nota e outro hábito mantêm a ordem", hab13.body.items.map((x) => x.kind).join() === "habit,task,note,habit", hab13.body.items.map((x) => x.kind).join());
check("hábito: o segundo hábito, que não existe, volta sem habit", hab13.body.items[3].habit === "" && hab13.body.items[3].name === "yoga", JSON.stringify(hab13.body.items[3]));
check("hábito: a tarefa no meio continua como sempre", hab13.body.items[1].title === "ligar pro João" && hab13.body.items[1].date === "2026-10-18" && hab13.body.items[1].min === 30 && !("habit" in hab13.body.items[1]), JSON.stringify(hab13.body.items[1]));

/* a medição: o hábito lido grava capture:habit (um por pedido) */
check("hábito: a leitura grava capture:habit na usage", db.usage.some((x) => x.task === "capture:habit" && x.n >= 1), JSON.stringify(db.usage.map((x) => x.task)));

/* a conversa: o catálogo ganha habit-mark, com os campos fechados */
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ suggestions: [{ actionType: "habit-mark", title: "marcar treinar", note: "hoje", payload: {
  habit: "treinar", name: "treinei", date: "2026-10-18", amount: 4500, id: "h1", hack: "<script>"
} }], clarify: "" }) }] };
r = await call("POST", "/merlin", { task: "assistant", context: { message: "treinei hoje" } }, cookie);
body = await r.json();
check("conversa: habit-mark entra no catálogo", r.status === 200 && body.suggestions.length === 1 && body.suggestions[0].actionType === "habit-mark", JSON.stringify(body));
check("conversa: a proposta só tem habit, name e date", body.suggestions[0] && Object.keys(body.suggestions[0].payload).sort().join() === "date,habit,name" && !("hack" in body.suggestions[0].payload) && !("amount" in body.suggestions[0].payload), JSON.stringify(body.suggestions[0] && body.suggestions[0].payload));
check("conversa: os campos guardam o que a IA propôs", body.suggestions[0] && body.suggestions[0].payload.habit === "treinar" && body.suggestions[0].payload.name === "treinei" && body.suggestions[0].payload.date === "2026-10-18", JSON.stringify(body.suggestions[0] && body.suggestions[0].payload));
check("conversa: a instrução cita habit-mark", /habit-mark/.test(claudeAsked), String(claudeAsked).slice(0, 300));
check("conversa: o tipo financeiro continua no catálogo", /finance-entry/.test(claudeAsked));

/* a vitrine saiu (PRD o-menu-por-area, D7): wishlist-item não está mais no catálogo,
   e uma sugestão dele é descartada como qualquer tipo fora da lista */
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ suggestions: [{ actionType: "wishlist-item", title: "novo item na vitrine", note: "", payload: {
  list: "", name: "teclado", price: 30000, bucket: "online", qty: "1x"
} }], clarify: "" }) }] };
r = await call("POST", "/merlin", { task: "assistant", context: { message: "quero comprar um teclado" } }, cookie);
body = await r.json();
check("conversa: wishlist-item saiu do catálogo", r.status === 200 && Array.isArray(body.suggestions) && body.suggestions.length === 0, JSON.stringify(body));
check("conversa: a instrução não cita wishlist-item", !/wishlist-item/.test(claudeAsked), String(claudeAsked).slice(0, 300));

/* ---- 13e-quinquies. o sono ----
   "dormi 7h" escrito no início, ou dito na conversa, vira uma noite. o que o
   Worker garante: as horas são um inteiro entre 0 e 1440, a data é um dia de
   verdade (senão, o de hoje), e nada de outro tipo vaza para o item. horas que
   a IA não leu NÃO derrubam o item: ele volta com min 0, e a tela pede as horas
   (como o gasto sem valor). */
const sleepCtx = { today: "2026-10-18 (domingo)", hour: "08:10", clients: [], habits: [] };
const sleepItem = (over) => ({ kind: "sleep", min: 420, date: "2026-10-18", ...over });
const readSleep = async (text, items, ctx) => {
  claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ items }) }] };
  const res = await call("POST", "/merlin", { task: "capture", context: { ...(ctx || sleepCtx), text } }, cookie);
  return { status: res.status, body: await res.json() };
};

let sl13 = await readSleep("dormi 7h", [sleepItem()]);
check("sono: a leitura devolve um item", sl13.status === 200 && sl13.body.items.length === 1, JSON.stringify(sl13.body));
check("sono: 'dormi 7h' volta como sleep, 420, no dia dito", sl13.body.items[0].kind === "sleep" && sl13.body.items[0].min === 420 && sl13.body.items[0].date === "2026-10-18", JSON.stringify(sl13.body.items[0]));
check("sono: o item só tem kind, min e date", Object.keys(sl13.body.items[0] || {}).sort().join() === "date,kind,min", JSON.stringify(sl13.body.items[0]));
check("sono: a instrução da captura cita sleep", /sleep/.test(claudeAsked), String(claudeAsked).slice(0, 400));
check("sono: a instrução ainda cita habit (os tipos antigos continuam)", /habit/.test(claudeAsked));
check("sono: a leitura grava capture:sleep na usage", db.usage.some((x) => x.task === "capture:sleep" && x.n >= 1), JSON.stringify(db.usage.map((x) => x.task)));

/* as horas */
sl13 = await readSleep("dormi 9999", [sleepItem({ min: 9999 })]);
check("sono: min 9999 vira o teto de 1440", sl13.body.items[0].min === 1440, JSON.stringify(sl13.body.items));
sl13 = await readSleep("dormi 7h30", [sleepItem({ min: 450.4 })]);
check("sono: min fracionado é arredondado para inteiro", sl13.body.items[0].min === 450, JSON.stringify(sl13.body.items));
sl13 = await readSleep("dormi 7h30", [sleepItem({ min: "450" })]);
check("sono: min em texto numérico vira número", sl13.body.items[0].min === 450, JSON.stringify(sl13.body.items));
sl13 = await readSleep("dormi", [sleepItem({ min: undefined })]);
check("sono: sem min o item fica, com min 0 (a tela pede as horas)", sl13.body.items.length === 1 && sl13.body.items[0].kind === "sleep" && sl13.body.items[0].min === 0, JSON.stringify(sl13.body.items));
sl13 = await readSleep("dormi", [sleepItem({ min: "muito" })]);
check("sono: min inválido vira 0 e o item fica", sl13.body.items.length === 1 && sl13.body.items[0].min === 0, JSON.stringify(sl13.body.items));
sl13 = await readSleep("dormi", [sleepItem({ min: -30 })]);
check("sono: min negativo vira 0 e o item fica", sl13.body.items.length === 1 && sl13.body.items[0].min === 0, JSON.stringify(sl13.body.items));

/* a data */
sl13 = await readSleep("ontem dormi 6h", [sleepItem({ min: 360, date: "2026-10-17" })]);
check("sono: a data dita (ontem) fica", sl13.body.items[0].date === "2026-10-17" && sl13.body.items[0].min === 360, JSON.stringify(sl13.body.items[0]));
sl13 = await readSleep("dormi 7h", [sleepItem({ date: "ontem" })]);
check("sono: data inválida vira o dia de context.today", sl13.body.items[0].date === "2026-10-18", JSON.stringify(sl13.body.items[0]));
sl13 = await readSleep("dormi 7h", [sleepItem({ date: undefined })]);
check("sono: sem data vira o dia de context.today", sl13.body.items[0].date === "2026-10-18", JSON.stringify(sl13.body.items[0]));
sl13 = await readSleep("dormi 7h", [sleepItem({ date: "2026-10-1" })]);
check("sono: data fora do formato AAAA-MM-DD vira hoje", sl13.body.items[0].date === "2026-10-18", JSON.stringify(sl13.body.items[0]));

/* a IA manda campo a mais e ele não passa */
sl13 = await readSleep("dormi 7h", [sleepItem({ title: "dormir", amount: 4500, habit: "treinar", name: "x", hack: "<script>" })]);
check("sono: campo de outro tipo não vaza para o item", Object.keys(sl13.body.items[0]).sort().join() === "date,kind,min", JSON.stringify(sl13.body.items[0]));

/* uma linha com várias coisas: a ordem fica */
sl13 = await readSleep("dormi 7h, gastei 45 no almoço e treinei", [sleepItem(), money(), habitItem()]);
check("sono: sono, gasto e hábito mantêm a ordem", sl13.body.items.map((x) => x.kind).join() === "sleep,money,habit", sl13.body.items.map((x) => x.kind).join());
check("sono: o gasto e o hábito continuam limpos", sl13.body.items[1].amount === 4500 && sl13.body.items[2].habit === "" && !("min" in sl13.body.items[1]) && !("amount" in sl13.body.items[0]), JSON.stringify(sl13.body.items));
sl13 = await readSleep("ligar pro João e dormi 6h", [{ kind: "task", title: "ligar pro João", min: 30, date: "2026-10-18" }, sleepItem({ min: 360 })]);
check("sono: tarefa e sono mantêm a ordem, e o min da tarefa não se mistura", sl13.body.items.map((x) => x.kind).join() === "task,sleep" && sl13.body.items[0].min === 30 && sl13.body.items[1].min === 360, JSON.stringify(sl13.body.items));

/* a conversa: o catálogo ganha sleep-log, com os campos fechados */
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ suggestions: [{ actionType: "sleep-log", title: "7h de sono", note: "hoje", payload: {
  min: 450, date: "2026-10-18", amount: 4500, habit: "treinar", id: "s1", hack: "<script>"
} }], clarify: "" }) }] };
r = await call("POST", "/merlin", { task: "assistant", context: { message: "dormi 7h e meia" } }, cookie);
body = await r.json();
check("conversa: sleep-log entra no catálogo", r.status === 200 && body.suggestions.length === 1 && body.suggestions[0].actionType === "sleep-log", JSON.stringify(body));
check("conversa: a proposta só tem min e date", body.suggestions[0] && Object.keys(body.suggestions[0].payload).sort().join() === "date,min" && !("hack" in body.suggestions[0].payload) && !("amount" in body.suggestions[0].payload), JSON.stringify(body.suggestions[0] && body.suggestions[0].payload));
check("conversa: os campos guardam o que a IA propôs", body.suggestions[0] && body.suggestions[0].payload.min === 450 && body.suggestions[0].payload.date === "2026-10-18", JSON.stringify(body.suggestions[0] && body.suggestions[0].payload));
check("conversa: a instrução cita sleep-log", /sleep-log/.test(claudeAsked), String(claudeAsked).slice(0, 300));
check("conversa: habit-mark e finance-entry continuam no catálogo", /habit-mark/.test(claudeAsked) && /finance-entry/.test(claudeAsked));

/* ---- 13e-sexies. o treino ----
   "treinei perna 40min" escrito no início, ou dito na conversa, vira uma sessão
   de treino (e o hábito de treino é marcado pelo navegador, não pelo Worker). o
   que o Worker garante: o título é curto, os minutos são um inteiro entre 0 e
   600, a data é um dia de verdade (senão, o de hoje), e nada de outro tipo vaza
   para o item. "treinei" sem detalhe continua habit (não é workout).
   a seção entra como uma pessoa nova: o teto da captura é de 60 por hora por
   pessoa, e as seções de antes já gastaram quase todo o de `cookie`. */
sentEmails = [];
await call("POST", "/code", { email: "treino@exemplo.com" });
r = await call("POST", "/sign-in", { email: "treino@exemplo.com", code: codeFromEmail() });
const workoutCookie = cookieOf(r);
const workoutCtx = { today: "2026-10-18 (domingo)", hour: "19:10", clients: [], habits: ["treinar"] };
const workoutItem = (over) => ({ kind: "workout", title: "perna", min: 40, date: "2026-10-18", ...over });
const readWorkout = async (text, items, ctx) => {
  claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ items }) }] };
  const res = await call("POST", "/merlin", { task: "capture", context: { ...(ctx || workoutCtx), text } }, workoutCookie);
  return { status: res.status, body: await res.json() };
};

let wk13 = await readWorkout("treinei perna 40min", [workoutItem()]);
check("treino: a leitura devolve um item", wk13.status === 200 && wk13.body.items.length === 1, JSON.stringify(wk13.body));
check("treino: 'treinei perna 40min' volta como workout, perna, 40, no dia dito", wk13.body.items[0].kind === "workout" && wk13.body.items[0].title === "perna" && wk13.body.items[0].min === 40 && wk13.body.items[0].date === "2026-10-18", JSON.stringify(wk13.body.items[0]));
check("treino: o item só tem kind, title, min e date", Object.keys(wk13.body.items[0] || {}).sort().join() === "date,kind,min,title", JSON.stringify(wk13.body.items[0]));
check("treino: a instrução da captura cita workout", /workout/.test(claudeAsked), String(claudeAsked).slice(0, 400));
check("treino: a instrução ainda cita habit e sleep (os tipos antigos continuam)", /habit/.test(claudeAsked) && /sleep/.test(claudeAsked));
check("treino: a leitura grava capture:workout na usage", db.usage.some((x) => x.task === "capture:workout" && x.n >= 1), JSON.stringify(db.usage.map((x) => x.task)));

/* o título */
wk13 = await readWorkout("treinei", [workoutItem({ title: "  corrida  " })]);
check("treino: o título perde os espaços das pontas", wk13.body.items[0].title === "corrida", JSON.stringify(wk13.body.items));
wk13 = await readWorkout("treinei", [workoutItem({ title: "x".repeat(300) })]);
check("treino: título enorme é cortado em 60", wk13.body.items[0].title.length === 60, String(wk13.body.items[0].title.length));
wk13 = await readWorkout("treinei 30 min", [workoutItem({ title: "", min: 30 })]);
check("treino: sem título mas com minutos, o item fica", wk13.body.items.length === 1 && wk13.body.items[0].kind === "workout" && wk13.body.items[0].min === 30, JSON.stringify(wk13.body.items));
wk13 = await readWorkout("treinei perna", [workoutItem({ min: undefined })]);
check("treino: sem minutos mas com título, o item fica com min 0 (o cartão pede os minutos)", wk13.body.items.length === 1 && wk13.body.items[0].title === "perna" && wk13.body.items[0].min === 0, JSON.stringify(wk13.body.items));
wk13 = await readWorkout("hum", [workoutItem({ title: "", min: undefined }), workoutItem({ title: "   ", min: 0 }), { kind: "workout" }]);
check("treino: item sem título e sem minutos é descartado", wk13.status === 200 && wk13.body.items.length === 0, JSON.stringify(wk13.body));

/* os minutos */
wk13 = await readWorkout("corri 9999", [workoutItem({ min: 9999 })]);
check("treino: min 9999 vira o teto de 600", wk13.body.items[0].min === 600, JSON.stringify(wk13.body.items));
wk13 = await readWorkout("corri 40", [workoutItem({ min: 40.4 })]);
check("treino: min fracionado é arredondado para inteiro", wk13.body.items[0].min === 40, JSON.stringify(wk13.body.items));
wk13 = await readWorkout("corri 40", [workoutItem({ min: "40" })]);
check("treino: min em texto numérico vira número", wk13.body.items[0].min === 40, JSON.stringify(wk13.body.items));
wk13 = await readWorkout("treinei perna", [workoutItem({ min: "muito" })]);
check("treino: min inválido vira 0 e o item fica", wk13.body.items.length === 1 && wk13.body.items[0].min === 0, JSON.stringify(wk13.body.items));
wk13 = await readWorkout("treinei perna", [workoutItem({ min: -30 })]);
check("treino: min negativo vira 0 e o item fica", wk13.body.items.length === 1 && wk13.body.items[0].min === 0, JSON.stringify(wk13.body.items));

/* a data */
wk13 = await readWorkout("ontem corri 30 min", [workoutItem({ title: "corrida", min: 30, date: "2026-10-17" })]);
check("treino: a data dita (ontem) fica", wk13.body.items[0].date === "2026-10-17" && wk13.body.items[0].min === 30, JSON.stringify(wk13.body.items[0]));
wk13 = await readWorkout("treinei perna 40min", [workoutItem({ date: "ontem" })]);
check("treino: data inválida vira o dia de context.today", wk13.body.items[0].date === "2026-10-18", JSON.stringify(wk13.body.items[0]));
wk13 = await readWorkout("treinei perna 40min", [workoutItem({ date: undefined })]);
check("treino: sem data vira o dia de context.today", wk13.body.items[0].date === "2026-10-18", JSON.stringify(wk13.body.items[0]));
wk13 = await readWorkout("treinei perna 40min", [workoutItem({ date: "2026-10-1" })]);
check("treino: data fora do formato AAAA-MM-DD vira hoje", wk13.body.items[0].date === "2026-10-18", JSON.stringify(wk13.body.items[0]));

/* a IA manda campo a mais e ele não passa */
wk13 = await readWorkout("treinei perna 40min", [workoutItem({ amount: 4500, habit: "treinar", name: "x", hack: "<script>" })]);
check("treino: campo de outro tipo não vaza para o item", Object.keys(wk13.body.items[0]).sort().join() === "date,kind,min,title", JSON.stringify(wk13.body.items[0]));

/* "treinei" sem detalhe continua hábito */
wk13 = await readWorkout("treinei", [habitItem()]);
check("treino: 'treinei' sozinho continua habit, sem min nem title", wk13.body.items.length === 1 && wk13.body.items[0].kind === "habit" && !("min" in wk13.body.items[0]) && !("title" in wk13.body.items[0]), JSON.stringify(wk13.body.items));

/* uma linha com várias coisas: a ordem fica */
wk13 = await readWorkout("treinei perna 40min, gastei 45 no almoço e meditei", [workoutItem(), money(), habitItem()]);
check("treino: treino, gasto e hábito mantêm a ordem", wk13.body.items.map((x) => x.kind).join() === "workout,money,habit", wk13.body.items.map((x) => x.kind).join());
check("treino: o gasto e o hábito continuam limpos", wk13.body.items[1].amount === 4500 && wk13.body.items[1].title === "almoço" && !("min" in wk13.body.items[1]) && !("amount" in wk13.body.items[0]) && !("min" in wk13.body.items[2]), JSON.stringify(wk13.body.items));
wk13 = await readWorkout("ligar pro João e treinei perna 40min", [{ kind: "task", title: "ligar pro João", min: 30, date: "2026-10-18" }, workoutItem()]);
check("treino: tarefa e treino mantêm a ordem, e o min da tarefa não se mistura", wk13.body.items.map((x) => x.kind).join() === "task,workout" && wk13.body.items[0].min === 30 && wk13.body.items[1].min === 40, JSON.stringify(wk13.body.items));
wk13 = await readWorkout("dormi 7h e treinei perna 40min", [sleepItem(), workoutItem()]);
check("treino: sono e treino mantêm a ordem, cada um com os seus campos", wk13.body.items.map((x) => x.kind).join() === "sleep,workout" && Object.keys(wk13.body.items[0]).sort().join() === "date,kind,min" && Object.keys(wk13.body.items[1]).sort().join() === "date,kind,min,title", JSON.stringify(wk13.body.items));

/* a conversa: o catálogo ganha workout-log, com os campos fechados */
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ suggestions: [{ actionType: "workout-log", title: "corrida · 30 min", note: "ontem", payload: {
  title: "corrida", min: 30, date: "2026-10-17", amount: 4500, habit: "treinar", id: "w1", hack: "<script>"
} }], clarify: "" }) }] };
r = await call("POST", "/merlin", { task: "assistant", context: { message: "ontem corri 30 min" } }, workoutCookie);
body = await r.json();
check("conversa: workout-log entra no catálogo", r.status === 200 && body.suggestions.length === 1 && body.suggestions[0].actionType === "workout-log", JSON.stringify(body));
check("conversa: a proposta só tem title, min e date", body.suggestions[0] && Object.keys(body.suggestions[0].payload).sort().join() === "date,min,title" && !("hack" in body.suggestions[0].payload) && !("amount" in body.suggestions[0].payload) && !("habit" in body.suggestions[0].payload), JSON.stringify(body.suggestions[0] && body.suggestions[0].payload));
check("conversa: os campos guardam o que a IA propôs", body.suggestions[0] && body.suggestions[0].payload.title === "corrida" && body.suggestions[0].payload.min === 30 && body.suggestions[0].payload.date === "2026-10-17", JSON.stringify(body.suggestions[0] && body.suggestions[0].payload));
check("conversa: a instrução cita workout-log", /workout-log/.test(claudeAsked), String(claudeAsked).slice(0, 300));
check("conversa: sleep-log, habit-mark e finance-entry continuam no catálogo", /sleep-log/.test(claudeAsked) && /habit-mark/.test(claudeAsked) && /finance-entry/.test(claudeAsked));

/* ---- 13e-septies. a refeição ----
   "almocei salada" escrito no início, ou "ontem jantei pizza" dito na
   conversa, vira uma refeição. o que o Worker garante: a refeição é uma das
   quatro (o resto vira lanche), o texto é curto, a data é um dia de verdade
   (senão, o de hoje), e nada de outro tipo vaza para o item. "gastei 45 no
   almoço" continua money. a seção entra como uma pessoa nova, pelo teto da
   captura (60 por hora por pessoa). */
sentEmails = [];
await call("POST", "/code", { email: "refeicao@exemplo.com" });
r = await call("POST", "/sign-in", { email: "refeicao@exemplo.com", code: codeFromEmail() });
const mealCookie = cookieOf(r);
const mealCtx = { today: "2026-10-18 (domingo)", hour: "12:40", clients: [] };
const mealItem = (over) => ({ kind: "meal", meal: "lunch", text: "salada", date: "2026-10-18", ...over });
const readMeal = async (text, items) => {
  claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ items }) }] };
  const res = await call("POST", "/merlin", { task: "capture", context: { ...mealCtx, text } }, mealCookie);
  return { status: res.status, body: await res.json() };
};

let ml13 = await readMeal("almocei salada", [mealItem()]);
check("refeição: 'almocei salada' volta como meal, lunch, salada, hoje", ml13.status === 200 && ml13.body.items.length === 1 && ml13.body.items[0].kind === "meal" && ml13.body.items[0].meal === "lunch" && ml13.body.items[0].text === "salada" && ml13.body.items[0].date === "2026-10-18", JSON.stringify(ml13.body));
check("refeição: o kind meal passa no filtro e o item só tem kind, meal, text e date", Object.keys(ml13.body.items[0] || {}).sort().join() === "date,kind,meal,text", JSON.stringify(ml13.body.items[0]));
check("refeição: a instrução da captura cita meal e manda o gasto do almoço para money", /meal/.test(claudeAsked) && /gastei 45 no almoço\\?" continua money/.test(claudeAsked), String(claudeAsked).slice(0, 400));
check("refeição: a instrução da captura não pede caloria", /Nunca fale de caloria/.test(claudeAsked));
check("refeição: a leitura grava capture:meal na usage", db.usage.some((x) => x.task === "capture:meal" && x.n >= 1), JSON.stringify(db.usage.map((x) => x.task)));

/* a refeição */
for (const m of ["breakfast", "lunch", "snack", "dinner"]) {
  ml13 = await readMeal("comi", [mealItem({ meal: m })]);
  check("refeição: " + m + " fica", ml13.body.items[0].meal === m, JSON.stringify(ml13.body.items));
}
ml13 = await readMeal("comi uma maçã", [mealItem({ meal: "brunch", text: "uma maçã" })]);
check("refeição: meal fora da lista vira snack", ml13.body.items[0].meal === "snack", JSON.stringify(ml13.body.items));
ml13 = await readMeal("comi uma maçã", [mealItem({ meal: undefined, text: "uma maçã" })]);
check("refeição: sem meal vira snack", ml13.body.items[0].meal === "snack", JSON.stringify(ml13.body.items));

/* o texto */
ml13 = await readMeal("almocei", [mealItem({ text: "  arroz   e   feijão  " })]);
check("refeição: o texto perde os espaços repetidos e das pontas", ml13.body.items[0].text === "arroz e feijão", JSON.stringify(ml13.body.items));
ml13 = await readMeal("almocei", [mealItem({ text: "x".repeat(300) })]);
check("refeição: texto enorme é cortado em 120", ml13.body.items[0].text.length === 120, String(ml13.body.items[0].text.length));
ml13 = await readMeal("almocei", [mealItem({ text: "", title: "salada" })]);
check("refeição: sem text, o title da IA vale como texto", ml13.body.items.length === 1 && ml13.body.items[0].text === "salada", JSON.stringify(ml13.body.items));
ml13 = await readMeal("almocei", [mealItem({ text: "" }), mealItem({ text: "   " }), { kind: "meal" }]);
check("refeição: item sem o que comeu é descartado", ml13.status === 200 && ml13.body.items.length === 0, JSON.stringify(ml13.body));

/* a data */
ml13 = await readMeal("ontem jantei pizza", [mealItem({ meal: "dinner", text: "pizza", date: "2026-10-17" })]);
check("refeição: a data dita (ontem) fica", ml13.body.items[0].date === "2026-10-17" && ml13.body.items[0].meal === "dinner", JSON.stringify(ml13.body.items[0]));
ml13 = await readMeal("almocei salada", [mealItem({ date: "ontem" })]);
check("refeição: cleanMeal com data inválida vira o dia de context.today", ml13.body.items[0].date === "2026-10-18", JSON.stringify(ml13.body.items[0]));
ml13 = await readMeal("almocei salada", [mealItem({ date: undefined })]);
check("refeição: sem data vira o dia de context.today", ml13.body.items[0].date === "2026-10-18", JSON.stringify(ml13.body.items[0]));

/* a IA manda campo a mais e ele não passa */
ml13 = await readMeal("almocei salada", [mealItem({ amount: 4500, min: 30, kcal: 450, hack: "<script>" })]);
check("refeição: campo de outro tipo (e caloria) não vaza para o item", Object.keys(ml13.body.items[0]).sort().join() === "date,kind,meal,text", JSON.stringify(ml13.body.items[0]));

/* "gastei 45 no almoço" continua gasto; a linha com as duas coisas mantém a ordem */
ml13 = await readMeal("gastei 45 no almoço", [money({ date: "2026-10-18" })]);
check("refeição: 'gastei 45 no almoço' continua money", ml13.body.items.length === 1 && ml13.body.items[0].kind === "money" && ml13.body.items[0].amount === 4500, JSON.stringify(ml13.body.items));
ml13 = await readMeal("almocei salada e gastei 45 no almoço", [mealItem(), money({ date: "2026-10-18" })]);
check("refeição: refeição e gasto mantêm a ordem, cada um com os seus campos", ml13.body.items.map((x) => x.kind).join() === "meal,money" && !("amount" in ml13.body.items[0]) && !("meal" in ml13.body.items[1]), JSON.stringify(ml13.body.items));

/* a conversa: o catálogo ganha meal-log, com os campos fechados */
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ suggestions: [{ actionType: "meal-log", title: "jantar · pizza", note: "ontem", payload: {
  meal: "dinner", text: "pizza", date: "2026-10-17", kcal: 900, amount: 4500, id: "m1", hack: "<script>"
} }], clarify: "" }) }] };
r = await call("POST", "/merlin", { task: "assistant", context: { message: "ontem jantei pizza" } }, mealCookie);
body = await r.json();
check("conversa: meal-log entra no catálogo", r.status === 200 && body.suggestions.length === 1 && body.suggestions[0].actionType === "meal-log", JSON.stringify(body));
check("conversa: a proposta só tem meal, text e date", body.suggestions[0] && Object.keys(body.suggestions[0].payload).sort().join() === "date,meal,text", JSON.stringify(body.suggestions[0] && body.suggestions[0].payload));
check("conversa: os campos guardam o que a IA propôs", body.suggestions[0] && body.suggestions[0].payload.meal === "dinner" && body.suggestions[0].payload.text === "pizza" && body.suggestions[0].payload.date === "2026-10-17", JSON.stringify(body.suggestions[0] && body.suggestions[0].payload));
check("conversa: a instrução cita meal-log", /meal-log/.test(claudeAsked), String(claudeAsked).slice(0, 300));
check("conversa: workout-log, sleep-log e finance-entry continuam no catálogo", /workout-log/.test(claudeAsked) && /sleep-log/.test(claudeAsked) && /finance-entry/.test(claudeAsked));

/* a conversa: o catálogo ganha op-add e op-done (ticket #79), com os campos fechados */
claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ suggestions: [{ actionType: "op-add", title: "emitir notas · todo dia 5", note: "", payload: {
  title: "emitir notas", freq: "monthly", day: 5, amount: 4500, id: "o1", done: ["2026-10-05"], hack: "<script>"
} }], clarify: "" }) }] };
r = await call("POST", "/merlin", { task: "assistant", context: { message: "todo dia 5 emito as notas" } }, mealCookie);
body = await r.json();
check("conversa: op-add entra no catálogo", r.status === 200 && body.suggestions.length === 1 && body.suggestions[0].actionType === "op-add", JSON.stringify(body));
check("conversa: a proposta de op-add só tem title, freq e day", body.suggestions[0] && Object.keys(body.suggestions[0].payload).sort().join() === "day,freq,title" && !("hack" in body.suggestions[0].payload) && !("amount" in body.suggestions[0].payload) && !("done" in body.suggestions[0].payload), JSON.stringify(body.suggestions[0] && body.suggestions[0].payload));
check("conversa: op-add guarda o que a IA propôs", body.suggestions[0] && body.suggestions[0].payload.title === "emitir notas" && body.suggestions[0].payload.freq === "monthly" && String(body.suggestions[0].payload.day) === "5", JSON.stringify(body.suggestions[0] && body.suggestions[0].payload));
check("conversa: a instrução cita op-add e op-done", /op-add/.test(claudeAsked) && /op-done/.test(claudeAsked), String(claudeAsked).slice(0, 300));

claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ suggestions: [{ actionType: "op-done", title: "emitir notas · outubro", note: "", payload: {
  title: "emitir notas", date: "2026-10-17", freq: "monthly", day: 5, amount: 4500, id: "o1", hack: "<script>"
} }], clarify: "" }) }] };
r = await call("POST", "/merlin", { task: "assistant", context: { message: "emiti as notas" } }, mealCookie);
body = await r.json();
check("conversa: op-done entra no catálogo", r.status === 200 && body.suggestions.length === 1 && body.suggestions[0].actionType === "op-done", JSON.stringify(body));
check("conversa: a proposta de op-done só tem title e date", body.suggestions[0] && Object.keys(body.suggestions[0].payload).sort().join() === "date,title" && !("hack" in body.suggestions[0].payload) && !("freq" in body.suggestions[0].payload) && !("amount" in body.suggestions[0].payload), JSON.stringify(body.suggestions[0] && body.suggestions[0].payload));
check("conversa: op-done guarda o que a IA propôs", body.suggestions[0] && body.suggestions[0].payload.title === "emitir notas" && body.suggestions[0].payload.date === "2026-10-17", JSON.stringify(body.suggestions[0] && body.suggestions[0].payload));
check("conversa: op-done também fica no catálogo ao lado de meal-log e workout-log", /op-done/.test(claudeAsked) && /meal-log/.test(claudeAsked) && /workout-log/.test(claudeAsked));

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

/* ---- 13h. a medicao ----
   o teto (13f) conta pedidos por hora para barrar abuso; a `usage` conta por
   dia e por tarefa, com os tokens, para saber o que cada coisa custa. so
   entra pedido que a Anthropic respondeu, e gravar nunca derruba a resposta. */
env.ANTHROPIC_API_KEY = "sk-teste";
sentEmails = [];
await call("POST", "/code", { email: "medida@exemplo.com" });
r = await call("POST", "/sign-in", { email: "medida@exemplo.com", code: codeFromEmail() });
const meterCookie = cookieOf(r);
const idOf = (email) => db.people.find((p) => p.email === email).id;
const meterId = idOf("medida@exemplo.com"), otherId = idOf("outra@exemplo.com");
const today = new Date().toISOString().slice(0, 10);
const usageOf = (person, task) => db.usage.find((x) => x.person === person && x.task === task);
const usageRows = (person) => db.usage.filter((x) => x.person === person);
const answerWith = (obj, usage) => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }], ...(usage ? { usage } : {}) });
const ask = (task, context, c) => call("POST", "/merlin", { task, context }, c);
const realError = console.error;

claudeAnswer = answerWith({ suggestions: [], clarify: "e pra qual etapa?" }, { input_tokens: 1000, output_tokens: 200 });
await ask("assistant", { message: "e essa etapa" }, meterCookie);
claudeAnswer = answerWith({ suggestions: [], clarify: "qual cliente?" }, { input_tokens: 500, output_tokens: 50 });
await ask("assistant", { message: "e agora" }, meterCookie);
let u = usageOf(meterId, "assistant:answer");
check("duas perguntas que so respondem somam numa linha so", !!u && u.n === 2 && u.tokens_in === 1500 && u.tokens_out === 250, JSON.stringify(u));
check("o dia da medicao e a data de hoje em UTC", u && u.day === today, JSON.stringify(u));
check("a linha de log traz tarefa, tokens e retrato", logged.at(-1) === "merlin assistant:answer in=500 out=50 portrait=0", logged.at(-1));

claudeAnswer = answerWith({ suggestions: [{ actionType: "task", title: "ligar pro cliente", note: "", payload: { title: "ligar pro cliente" } }], clarify: "" }, { input_tokens: 800, output_tokens: 100 });
await ask("assistant", { message: "lembra de ligar pro cliente" }, meterCookie);
u = usageOf(meterId, "assistant:action");
check("o assistente que propoe vira assistant:action", !!u && u.n === 1 && u.tokens_in === 800 && u.tokens_out === 100, JSON.stringify(u));
check("e nao mexe no assistant:answer", usageOf(meterId, "assistant:answer").n === 2);

claudeAnswer = answerWith({ suggestions: [{ actionType: "nao-existe", title: "x", payload: {} }], clarify: "" }, { input_tokens: 10, output_tokens: 5 });
await ask("assistant", { message: "qualquer coisa" }, meterCookie);
check("proposta fora do catalogo conta como resposta", usageOf(meterId, "assistant:answer").n === 3 && usageOf(meterId, "assistant:action").n === 1);

claudeAnswer = answerWith({ items: [
  { kind: "task", title: "ligar pro Joao", min: 30, date: "2026-10-11" },
  { kind: "task", title: "responder e-mails", min: 15 },
  { kind: "note", title: "modo offline" }
] }, { input_tokens: 300, output_tokens: 90 });
await ask("capture", { text: "ligar pro Joao, responder e-mails e talvez modo offline", today: "2026-10-10" }, meterCookie);
u = usageOf(meterId, "capture:task");
const un = usageOf(meterId, "capture:note");
check("a captura grava um por tipo devolvido, nao por item", !!u && u.n === 1 && !!un && un.n === 1, JSON.stringify([u, un]));
check("os tokens da captura entram uma vez so, na primeira linha", u.tokens_in === 300 && u.tokens_out === 90 && un.tokens_in === 0 && un.tokens_out === 0, JSON.stringify([u, un]));

/* o dinheiro lido no início conta como capture:money (D7): é o que mostra, na
   usage, quantos lançamentos a leitura propôs */
claudeAnswer = answerWith({ items: [
  { kind: "money", title: "almoço", amount: 4500, flow: "out", date: "2026-10-10" },
  { kind: "money", title: "Ana", amount: 300000, flow: "in", date: "2026-10-10" },
  { kind: "task", title: "ligar pro Joao", min: 30, date: "2026-10-11" }
] }, { input_tokens: 400, output_tokens: 120 });
await ask("capture", { text: "gastei 45 no almoço, recebi 3 mil da Ana e ligar pro Joao amanhã", today: "2026-10-10" }, meterCookie);
u = usageOf(meterId, "capture:money");
check("o dinheiro lido grava capture:money, um por pedido", !!u && u.n === 1, JSON.stringify(usageRows(meterId).map((x) => x.task + "=" + x.n)));
check("os tokens da captura com dinheiro entram na primeira linha, a do money", u && u.tokens_in === 400 && u.tokens_out === 120 && usageOf(meterId, "capture:task").n === 2 && usageOf(meterId, "capture:task").tokens_in === 300, JSON.stringify([u, usageOf(meterId, "capture:task")]));

/* o hábito lido grava capture:habit, um por pedido, com os tokens do pedido */
claudeAnswer = answerWith({ items: [
  { kind: "habit", habit: "treinar", name: "treinei", date: "2026-10-10" },
  { kind: "habit", habit: "", name: "yoga", date: "2026-10-10" }
] }, { input_tokens: 250, output_tokens: 60 });
await ask("capture", { text: "treinei e fiz yoga", today: "2026-10-10", habits: ["treinar"] }, meterCookie);
u = usageOf(meterId, "capture:habit");
check("o hábito lido grava capture:habit, um por pedido e não por item", !!u && u.n === 1 && u.tokens_in === 250 && u.tokens_out === 60, JSON.stringify(u));

claudeAnswer = answerWith({ items: [] }, { input_tokens: 120, output_tokens: 10 });
await ask("capture", { text: "o que falta hoje?", today: "2026-10-10" }, meterCookie);
u = usageOf(meterId, "capture:none");
check("captura sem itens grava capture:none", !!u && u.n === 1 && u.tokens_in === 120, JSON.stringify(u));

claudeAnswer = answerWith({ questions: [] }, { input_tokens: 200, output_tokens: 20 });
await ask("build", { kind: "funnel", step: "brief", request: "um funil" }, meterCookie);
claudeAnswer = answerWith({ name: "Mapa", tree: { title: "x", children: [{ title: "a" }] } }, { input_tokens: 900, output_tokens: 400 });
await ask("build", { kind: "map", step: "draft", request: "um mapa" }, meterCookie);
check("a montagem grava build:<passo>", usageOf(meterId, "build:brief").n === 1 && usageOf(meterId, "build:draft").tokens_out === 400, JSON.stringify(usageRows(meterId).map((x) => x.task)));

claudeAnswer = answerWith({ text: "## semana\n- foi" }, { input_tokens: 700, output_tokens: 80 });
await ask("week", { range: "1-7 set", cards: [] }, meterCookie);
check("as outras tarefas gravam o proprio nome", usageOf(meterId, "week").n === 1 && usageOf(meterId, "week").tokens_in === 700);

claudeAnswer = answerWith({ suggestions: [], clarify: "so a outra" }, { input_tokens: 40, output_tokens: 4 });
const firstBefore = JSON.stringify(usageOf(meterId, "assistant:answer"));
await ask("assistant", { message: "e eu?" }, otherCookie);
u = usageOf(otherId, "assistant:answer");
check("outra pessoa tem a linha dela, separada", !!u && u.n === 1 && u.tokens_in === 40, JSON.stringify(u));
check("e a da primeira nao muda", JSON.stringify(usageOf(meterId, "assistant:answer")) === firstBefore);

/* o que nao chegou a ser respondido nao se conta */
claudeAnswer = answerWith({ text: "## semana\n- foi" }, { input_tokens: 9, output_tokens: 9 });
const snapshot = () => JSON.stringify(db.usage);
const before = snapshot();
const spentRow = db.advice.find((x) => x.person === meterId && x.hour === Math.floor(Date.now() / 3600e3) * 4);
const spentN = spentRow.n;
spentRow.n = 1e6;
r = await ask("week", { range: "1-7 set", cards: [] }, meterCookie);
spentRow.n = spentN;
check("pedido barrado pelo teto nao grava na usage", r.status === 429 && snapshot() === before, String(r.status));

const askedFetch = globalThis.fetch;
console.error = () => {};
globalThis.fetch = async (url, opts) => String(url).includes("api.anthropic.com") ? new Response("falhou", { status: 500 }) : askedFetch(url, opts);
r = await ask("week", { range: "1-7 set", cards: [] }, meterCookie);
check("Anthropic em 500 nao grava na usage", r.status === 502 && snapshot() === before, String(r.status));
globalThis.fetch = askedFetch;

r = await ask("inventada", {}, meterCookie);
check("tarefa invalida nao grava na usage", r.status === 400 && snapshot() === before);
env.ANTHROPIC_API_KEY = "";
r = await ask("week", { range: "1-7 set", cards: [] }, meterCookie);
check("sem chave nao grava na usage", r.status === 503 && snapshot() === before);
env.ANTHROPIC_API_KEY = "sk-teste";

claudeAnswer = { stop_reason: "end_turn", content: [{ type: "text", text: '{"text":"sem usage"}' }] };
const weekBefore = usageOf(meterId, "week").n;
r = await ask("week", { range: "1-7 set", cards: [] }, meterCookie);
u = usageOf(meterId, "week");
check("resposta sem usage soma o pedido e deixa os tokens como estavam", r.status === 200 && u.n === weekBefore + 1 && u.tokens_in === 700 && u.tokens_out === 80, JSON.stringify(u));
check("e o log mostra zero", logged.at(-1) === "merlin week in=0 out=0 portrait=0", logged.at(-1));

claudeAnswer = answerWith({ text: "ainda responde" }, { input_tokens: 5, output_tokens: 5 });
const weekN = usageOf(meterId, "week").n;
failUsage = true;
r = await ask("week", { range: "1-7 set", cards: [] }, meterCookie);
failUsage = false;
body = await r.json();
check("falha ao gravar a usage nao derruba a resposta", r.status === 200 && body.text === "ainda responde" && usageOf(meterId, "week").n === weekN, String(r.status));

/* a recusa tambem foi cobrada */
claudeAnswer = { stop_reason: "refusal", content: [], usage: { input_tokens: 60, output_tokens: 0 } };
r = await ask("week", { range: "1-7 set", cards: [] }, meterCookie);
check("a recusa e repassada e conta na usage", r.status === 422 && usageOf(meterId, "week").n === weekN + 1);
console.error = realError;
env.ANTHROPIC_API_KEY = "";

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

/* ---- 13.6 a lista de espera da landing ----
   a única escrita sem sessão: precisa aceitar quem ainda não tem conta e
   não pode virar porta de entrada nem de enchente */
r = await call("POST", "/waitlist", { email: "  Bia@Exemplo.COM " });
check("lista de espera aceita sem sessão", r.status === 200, String(r.status));
check("lista de espera normaliza o e-mail", db.waitlist.length === 1 && db.waitlist[0].email === "bia@exemplo.com", JSON.stringify(db.waitlist));
r = await call("POST", "/waitlist", { email: "bia@exemplo.com" });
check("entrar de novo responde igual e não duplica", r.status === 200 && db.waitlist.length === 1, String(db.waitlist.length));
r = await call("POST", "/waitlist", { email: "naoehemail" });
check("lista de espera recusa e-mail inválido", r.status === 400, String(r.status));
r = await call("POST", "/waitlist", { email: "robo@exemplo.com", site: "http://spam" });
check("o campo escondido finge que gravou", r.status === 200 && !db.waitlist.some(w => w.email === "robo@exemplo.com"));
r = await call("GET", "/waitlist");
check("a lista não se lê de fora", r.status === 405, String(r.status));
{
  const owners = env.OWNER_EMAILS, sent = sentEmails.length;
  env.OWNER_EMAILS = "arthur@exemplo.com";
  r = await call("POST", "/code", { email: "bia@exemplo.com" });
  check("estar na lista não abre a porta", r.status === 200 && sentEmails.length === sent, String(sentEmails.length - sent));
  env.OWNER_EMAILS = owners;
}
{
  const keep = db.waitlist;
  db.waitlist = Array.from({ length: 300 }, (_, i) => ({ email: "x" + i + "@exemplo.com", created_at: Date.now() }));
  r = await call("POST", "/waitlist", { email: "tarde@exemplo.com" });
  check("o teto da hora segura a enchente", r.status === 429, String(r.status));
  db.waitlist = keep;
}

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
