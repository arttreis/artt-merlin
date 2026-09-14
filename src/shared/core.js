/* merlin · core compartilhado
 *
 * o que toda pagina precisa e nenhuma deveria reescrever: tema, barra de
 * navegacao, sessao com o worker, colecoes que sincronizam por documento, e a
 * caixa de entrada por onde os modulos mandam coisa para o dia.
 *
 * e um ES module sem dependencia. cada pagina importa o que usa. quem desenha
 * tela e o ui.js; aqui so os dados e a casca imperativa (sidebar, entrar,
 * aviso), que servem para pagina antiga e nova.
 *
 * tudo em ingles: identificadores, chaves do localStorage, tipos de colecao,
 * campos dos documentos e rotas. so o que aparece na tela e em portugues.
 *
 * aqui nao ha nada de React: e JavaScript puro, e da para testar sem navegador.
 * quem desenha e o ui.jsx; os icones moram no icons.jsx.
 */

/* ---------- utilidades ---------- */

export const $ = (id) => document.getElementById(id);

/* so a casca (sidebar, busca) e o markdown montam HTML por string; as
   paginas desenham com o htm, que escapa sozinho. */
const escapeHtml = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SESSION_ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
let idCounter = 0;
export const newId = () => SESSION_ID + "-" + (++idCounter).toString(36);

/* a data como o estado a guarda: YYYY-MM-DD no fuso local, nunca ISO/UTC —
   toISOString() em Sao Paulo joga tudo depois das 21h para o dia seguinte. */
export function dayOf(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
export const today = () => dayOf(new Date());
export const isDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const dateOf = (day) => { const [y, m, d] = day.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (day, n) => { const d = dateOf(day); d.setDate(d.getDate() + n); return dayOf(d); };

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const dateLabel = (day, withYear) => {
  if (!isDay(day)) return "";
  const d = dateOf(day);
  return d.getDate() + " " + MONTHS[d.getMonth()] + (withYear ? " " + d.getFullYear() : "");
};
export const weekdayOf = (day) => WEEKDAYS[dateOf(day).getDay()];
export const monthLabel = (yyyymm) => {
  const [y, m] = yyyymm.split("-").map(Number);
  return MONTHS[m - 1] + " " + y;
};
/* segunda-feira da semana que contem `day` */
export function mondayOf(day) {
  const d = dateOf(day);
  const dow = d.getDay();
  d.setDate(d.getDate() - ((dow + 6) % 7));
  return dayOf(d);
}
/* domingo da semana que contem `day`: e onde a semana do calendario comeca.
   o mondayOf fica para o que ja GRAVOU semana pela segunda (o periodo dos
   planos, a contagem dos habitos) — trocar ali mudaria a chave de dado salvo. */
export function sundayOf(day) {
  const d = dateOf(day);
  d.setDate(d.getDate() - d.getDay());
  return dayOf(d);
}

/* dinheiro em centavos, para nunca somar float */
export const brl = (cents, sign) => {
  const v = Math.abs(cents) / 100;
  const s = v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (sign && cents < 0) return "−" + s;
  return s;
};
export function parseMoney(text) {
  /* aceita "1.234,56", "1.200" (milhar), "1234.56" (decimal), "1234", "R$ 12".
     a regra do ponto: com virgula presente, ponto e milhar; sem virgula, ponto
     seguido de exatamente 3 digitos no fim e milhar, senao e decimal. */
  const t = String(text || "").replace(/[^\d,.-]/g, "");
  if (!t) return 0;
  let n;
  if (t.includes(",")) n = parseFloat(t.replace(/\./g, "").replace(",", "."));
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) n = parseFloat(t.replace(/\./g, ""));
  else n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export const formatMin = (min) => {
  min = Math.max(0, Math.round(min));
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return h + "h" + String(m).padStart(2, "0");
  if (h) return h + "h";
  return m + "m";
};
/* a duracao no fim do texto: "45m", "1h30", "2h 15m", "meia hora", "1,5h" */
export function parseDuration(text) {
  const t = String(text || "").trim();
  const re = /\s*(?:(\d+(?:[.,]\d+)?)\s*h(?:oras?)?\s*(?:(\d{1,2})\s*(?:m(?:in)?)?)?|(\d+)\s*m(?:in(?:utos?)?)?|(meia hora))\s*$/i;
  const m = t.match(re);
  if (!m) return { min: 0, title: t };
  let min = 0;
  if (m[4]) min = 30;
  else if (m[1] != null) min = Math.round(parseFloat(m[1].replace(",", ".")) * 60) + (+m[2] || 0);
  else min = +m[3];
  if (!min) return { min: 0, title: t };
  return { min, title: t.slice(0, m.index).trim() };
}


/* ---------- a duracao escrita num texto ----------
   nasceu no dia e ficou la, enquanto o resto do sistema usava o parseDuration
   acima — que so olha o FIM da frase. eram dois entendimentos do mesmo texto:
   "45m revisar proposta" virava tarefa sem duracao na semana e tarefa de 45
   minutos no dia, e ninguem nunca ia descobrir por que.

   esta e a estrita, e a estrita e a certa: ela prefere nao entender a entender
   errado. o parseDuration continua existindo para quem so quer o sufixo. */

/* escrito por extenso: so as formas que alguem realmente digita com pressa */
const SPELLED = [
  [/(?:^|\s)meia\s*hora(?=\s|$)/i, 30],
  [/(?:^|\s)uma\s*hora\s*e\s*meia(?=\s|$)/i, 90],
  [/(?:^|\s)(?:uma|1)\s*hora(?=\s|$)/i, 60],
  [/(?:^|\s)duas\s*horas(?=\s|$)/i, 120],
  [/(?:^|\s)tr[eê]s\s*horas(?=\s|$)/i, 180]
];

/* fatia pela posicao real do match: replace(string) apagaria a primeira
   ocorrencia literal, que pode nao ser a que casou */
function sliceOut(text, m, min) {
  const clean = text.slice(0, m.index) + " " + text.slice(m.index + m[0].length);
  return { min: Math.min(min, 1440), title: clean.replace(/\s+/g, " ").trim() };
}

export function readDuration(text) {
  text = String(text || "");
  /* por extenso primeiro: "meia hora" nao tem digito para os padroes abaixo pegarem */
  for (const [re, value] of SPELLED) {
    const m = text.match(re);
    if (m) return sliceOut(text, m, value);
  }

  /* decimal com virgula ou ponto: "1,5h" e "1.5h" sao a mesma coisa aqui */
  const decimal = text.match(/(?:^|\s)(\d{1,2})[.,](\d{1,2})\s*h(?:oras?)?(?=\s|$)/i);
  if (decimal) {
    const fraction = +("0." + decimal[2]);
    return sliceOut(text, decimal, Math.round(((+decimal[1]) + fraction) * 60));
  }

  /* minutos so contam colados na hora ("1h30") ou com unidade ("1h 30m"):
     senao "revisar 1h 20 slides" viraria 1h20 e comeria o "20" do titulo.
     "1h 30" tambem nao conta, pela mesma razao — o 30 pode ser do titulo. */
  const withHour = text.match(/(?:^|\s)(\d{1,2})\s*h(?:oras?)?(?:(\d{1,2})|\s*(\d{1,2})\s*(?:m|min|mins|minutos?))?(?=\s|$)/i);
  const m = withHour || text.match(/(?:^|\s)(\d{1,3})\s*(?:m|min|mins|minutos?)(?=\s|$)/i);
  if (!m) return { min: 0, title: text.replace(/\s+/g, " ").trim() };
  const min = withHour ? (+m[1]) * 60 + (+(m[2] || m[3] || 0)) : +m[1];
  return sliceOut(text, m, min);
}

export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ---------- tema ---------- */

const THEME_KEY = "merlin:theme";
/* aqui em cima, junto do tema, porque as duas chaves sao lidas antes da
   primeira pintura — a marca vive na secao de identidade, mais abaixo. */
const BRAND_KEY = "merlin:brand";

export function currentTheme() {
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}
export function applyTheme(which) {
  document.documentElement.classList.toggle("light", which === "light");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  /* a barra do navegador acompanha o fundo, e o fundo depende da marca:
     #0A0A0A e o preto da casa, #0d0d0d o do Merlin. */
  const gl = document.documentElement.classList.contains("gl");
  if (which === "light") meta.content = gl ? "#f7f7f5" : "#f2f2f0";
  else meta.content = gl ? "#0A0A0A" : "#0d0d0d";
}
export function savedTheme() {
  try { return localStorage.getItem(THEME_KEY) || ""; } catch (e) { return ""; }
}
export function initTheme() {
  const saved = savedTheme();
  if (saved) { applyTheme(saved); return; }
  applyTheme(window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
}
export function toggleTheme() {
  const next = currentTheme() === "light" ? "dark" : "light";
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
}
/* escolher explicitamente, com uma terceira opcao que o interruptor nao tinha
   como dizer: "" e seguir o sistema — que e o padrao de quem nunca escolheu, e
   ate agora era um estado sem volta (o primeiro clique no interruptor saia
   dele para sempre). */
export function setTheme(which) {
  const v = which === "light" || which === "dark" ? which : "";
  try { v ? localStorage.setItem(THEME_KEY, v) : localStorage.removeItem(THEME_KEY); } catch (e) {}
  initTheme();
}

/* ---------- o que a pessoa ja viu ----------
   uma lista de marcas no navegador, nao no documento: "ja vi a apresentacao"
   e fato deste aparelho e desta pessoa, nao dado do sistema — nao vale subir
   para a nuvem nem viajar entre aparelhos. esquecer e um gesto do perfil. */
const SEEN_KEY = "merlin:seen";
const seenList = () => {
  try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
};
export const seen = (key) => seenList().includes(key);
export function markSeen(key) {
  if (seen(key)) return;
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seenList().concat([key]).slice(-40))); } catch (e) {}
}
export function forgetSeen(key) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seenList().filter((k) => k !== key))); } catch (e) {}
}
/* a sidebar empurra o conteudo via html.merlin (shell.css). a classe entra
   aqui, no import, para o layout ja nascer certo; e o estado recolhida vem
   junto, do localStorage. */
document.documentElement.classList.add("merlin");
try { if (localStorage.getItem("merlin:sidebar") === "closed") document.documentElement.classList.add("sidebar-closed"); } catch (e) {}

/* a marca tambem entra no <head> de cada pagina, antes da primeira pintura;
   aqui e a rede para quem carregar o core sem aquele trecho (uma pagina solta
   no servidor de desenvolvimento, por exemplo). o modulo carrega depois do
   <head>, entao sozinho ele pisca. */
try {
  const b = localStorage.getItem(BRAND_KEY);
  if (b && /^[a-z]{2,12}$/.test(b)) document.documentElement.classList.add(b);
} catch (e) {}

/* aplica antes da primeira pintura, para nao piscar. depois da marca de
   proposito: a cor da barra do navegador sai do fundo, e o fundo e dela. */
initTheme();

/* ---------- navegacao ---------- */

/* as paginas em grupos, cada grupo com um titulo que abre e fecha na barra
   (14/09/2026: com treze paginas, a lista corrida ja nao se lia de relance).
   a ordem dentro de cada grupo e a mesma de antes. */
export const PAGE_GROUPS = [
  { id: "day", label: "dia a dia", pages: [
    { id: "home", label: "início", href: "index.html" },
    /* o dia e a semana eram dois itens porque eram duas paginas. viraram duas
       visoes de uma so, e dois itens levando ao mesmo lugar seriam duas portas
       para a mesma sala. */
    { id: "calendar", label: "calendário", href: "calendar.html" },
    /* logo abaixo do calendario porque e dele que ela vive: a rotina so vira
       tarefa quando o calendario abre a semana */
    { id: "routine", label: "rotina", href: "routine.html" },
    { id: "notes", label: "notas", href: "notes.html" }
  ] },
  { id: "business", label: "negócio", pages: [
    /* a prospeccao vem antes de clientes porque e de onde eles chegam; o
       conteudo vem logo depois, porque e o que traz quem entra na prospeccao */
    { id: "prospecting", label: "prospecção", href: "prospecting.html" },
    { id: "clients", label: "clientes", href: "clients.html" },
    { id: "content", label: "conteúdo", href: "content.html" },
    { id: "funnels", label: "funis", href: "funnels.html" },
    { id: "maps", label: "mapas", href: "maps.html" }
  ] },
  { id: "money", label: "dinheiro", pages: [
    { id: "finance", label: "financeiro", href: "finance.html" },
    /* logo depois do financeiro porque e para la que ela desagua: o "comprei"
       vira saida */
    { id: "wishlist", label: "vitrine", href: "wishlist.html" }
  ] },
  { id: "growth", label: "evolução", pages: [
    { id: "habits", label: "hábitos", href: "habits.html" },
    { id: "plans", label: "planos", href: "plans.html" }
  ] }
];
export const PAGES = PAGE_GROUPS.flatMap((g) => g.pages);

export function toggleSidebar() {
  const root = document.documentElement;
  root.classList.toggle("sidebar-closed");
  try { localStorage.setItem("merlin:sidebar", root.classList.contains("sidebar-closed") ? "closed" : "open"); } catch (e) {}
  /* quem desenha em SVG mede o container: avisa que ele mudou de tamanho */
  setTimeout(() => window.dispatchEvent(new Event("resize")), 320);
}

/* ---------- busca global ----------
   procura por titulo em tudo que mora no navegador: notas, clientes,
   cartoes da semana, mapas, funis, lancamentos, habitos e objetivos. nao e indice: e um filtro
   sobre o que ja esta em memoria, e por isso e instantaneo. */
const SEARCH_SOURCES = [
  { type: "bookmarks", label: "site", field: "name", href: (d) => d.url },
  { type: "notes", label: "nota", field: "title", href: (d) => "notes.html#" + encodeURIComponent(d.id) },
  { type: "clients", label: "cliente", field: "name", filter: (d) => d.status !== "prospect" && d.status !== "lost", href: (d) => "clients.html#" + encodeURIComponent(d.id) },
  { type: "clients", label: "prospecto", field: "name", filter: (d) => d.status === "prospect" || d.status === "lost", href: (d) => "prospecting.html#" + encodeURIComponent(d.id) },
  { type: "content", label: "conteúdo", field: "title", href: (d) => "content.html#" + encodeURIComponent(d.id) },
  { type: "tasks", label: "tarefa", field: "title", href: (d) => "calendar.html#" + encodeURIComponent(d.date || ""), filter: (d) => !d.done },
  { type: "maps", label: "mapa", field: "name", href: (d) => "maps.html#" + encodeURIComponent(d.id) },
  { type: "funnels", label: "funil", field: "name", href: (d) => "funnels.html#" + encodeURIComponent(d.id) },
  { type: "finance", label: "R$", field: "name", href: () => "finance.html", filter: (d) => d.type === "entry" || d.type === "fixed" || d.type === "debt" || d.type === "card" },
  { type: "wishlist", label: "coletânea", field: "name", href: (d) => "wishlist.html#" + encodeURIComponent(d.id), filter: (d) => d.type === "list" },
  { type: "wishlist", label: "vitrine", field: "name", href: (d) => "wishlist.html#" + encodeURIComponent(d.list || ""), filter: (d) => d.type === "item" && !d.bought },
  { type: "habits", label: "hábito", field: "name", href: () => "habits.html", filter: (d) => !d.archived },
  { type: "routine", label: "rotina", field: "title", href: () => "routine.html" },
  /* os objetivos moram dentro do documento do periodo: `each` abre o doc em varios achados */
  { type: "plans", label: "objetivo", href: () => "plans.html", each: (d) => (d.goals || []).map((g) => g.text) }
];
export function search(term) {
  const k = foldKey(term);
  if (!k || k.length < 2) return [];
  const hits = [];
  SEARCH_SOURCES.forEach((src) => {
    collection(src.type).all().forEach((d) => {
      if (src.filter && !src.filter(d)) return;
      const texts = src.each ? src.each(d) : [d[src.field]];
      texts.forEach((t) => {
        const text = String(t || "");
        if (foldKey(text).includes(k)) hits.push({ label: src.label, text, href: src.href(d) });
      });
    });
  });
  return hits.slice(0, 12);
}
/* ---------- aviso com desfazer ----------
   o core so guarda qual e o aviso da vez e por quanto tempo; quem desenha e
   a casca, no ui.js. `notify` continua com a mesma assinatura de sempre. */

let notice = null, noticeTimer = null;
const noticeListeners = new Set();
const emitNotice = () => noticeListeners.forEach((f) => { try { f(notice); } catch (e) { console.error(e); } });

export function notify(text, undo) {
  clearTimeout(noticeTimer);
  /* o carimbo serve de `key`: avisar duas vezes o mesmo texto reinicia o
     tempo em vez de parecer que nada aconteceu */
  notice = { text: String(text), undo: undo || null, at: Date.now() };
  noticeTimer = setTimeout(closeNotice, undo ? 7000 : 3500);
  emitNotice();
}
export function closeNotice() { clearTimeout(noticeTimer); notice = null; emitNotice(); }
export const currentNotice = () => notice;
export function onNotice(fn) { noticeListeners.add(fn); return () => noticeListeners.delete(fn); }

/* ---------- de quem e este navegador ----------
   as chaves do localStorage nao tem dono: `merlin:ideas` e `merlin:ideas`
   para quem quer que esteja na frente da tela. enquanto o sistema era de uma
   pessoa isso nao custava nada. num time custa: quem entrasse depois de um
   colega no mesmo navegador subiria os documentos dele para a propria conta
   na primeira sincronizacao, e ninguem descobriria pelo caminho.

   a regra e uma linha: o navegador guarda o Merlin de UMA pessoa. quando a
   identidade muda, o que era do outro sai antes de qualquer sincronizacao.
   preferencia nao e dado e atravessa — tema e sidebar ficam. */

const WHO_KEY = "merlin:who";
/* o que atravessa uma troca de pessoa: preferência, nunca dado. o dono e a
   marca NÃO estão aqui de propósito — são reescritos logo depois da varredura,
   e sair leva os dois embora junto com o resto. */
const KEPT = [THEME_KEY, "merlin:sidebar"];

/* ---------- a marca ----------
   quem entra por um e-mail da casa vê o Merlin com a identidade da Guessless.
   é só pele: tokens de cor e fonte (`html.gl`, no shell.css) e a marca na
   barra. nenhuma tela muda de comportamento, e nenhum dado sabe que existe
   marca — trocar de e-mail troca a pele, não o produto.

   fica no localStorage, e não numa resposta do servidor, porque a classe tem
   que estar no <html> ANTES da primeira pintura: o <head> de cada página lê
   esta chave junto com o tema. saber a marca só depois do /me faria a tela
   piscar na identidade errada a cada carregamento. */
const BRANDS = { "@guessless.com.br": "gl" };
const brandOf = (email) => {
  const at = String(email || "").indexOf("@");
  return at < 0 ? "" : BRANDS[String(email).slice(at).toLowerCase()] || "";
};
export const currentBrand = () => { try { return localStorage.getItem(BRAND_KEY) || ""; } catch (e) { return ""; } };

/* varrer as chaves em vez de listar os tipos e de proposito: o modulo que
   alguem escrever amanha ja nasce sendo apagado aqui, e esquecer de incluir
   um tipo numa lista seria exatamente o vazamento que isto existe para
   impedir. remover dentro do laco pularia chaves — por isso a lista antes. */
function wipeLocal() {
  try {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("merlin:") && !KEPT.includes(k)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch (e) {}
}

const whoIsHere = () => { try { return localStorage.getItem(WHO_KEY) || ""; } catch (e) { return ""; } };

/* diz que este navegador passa a ser de `email`. devolve true quando teve que
   apagar — e ai quem chamou recarrega a pagina, porque a tela ja desenhada e
   as colecoes em memoria continuam sendo da outra pessoa. */
function adoptIdentity(email) {
  const who = whoIsHere();
  /* sem dono anterior e o primeiro login deste navegador: o que foi feito
     solto aqui e de quem esta entrando, e sobe junto — que e o que sempre
     aconteceu e continua certo. */
  const changed = !!who && who !== email;
  if (changed) wipeLocal();
  /* depois da varredura, nunca antes: quem anota o dono primeiro o perde na
     limpeza. a marca vai junto para que o recarregamento ja pinte certo — sem
     ela, a pessoa da casa veria um quadro de Merlin antes do proprio Merlin. */
  try {
    localStorage.setItem(WHO_KEY, email);
    localStorage.setItem(BRAND_KEY, brandOf(email));
  } catch (e) {}
  return changed;
}

/* ---------- sessao e nuvem ---------- */

const API = "/api";
export async function api(route, options) {
  const r = await fetch(API + route, {
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    ...options
  });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
}

/* os estados da nuvem: synced (entrou e esta em dia), local (so este
   navegador), offline (sem rede, sobe depois), error (o servidor falhou) */
export const CLOUD_STATUS = {
  synced:  { line: "sincronizado", action: "", text: "o mesmo Merlin em todos os seus aparelhos." },
  local:   { line: "só neste navegador", action: "entrar", text: "entre com seu e-mail para levar o Merlin a outros aparelhos." },
  offline: { line: "sem conexão — sobe depois", action: "", text: "sem rede agora; o que você fizer sobe quando voltar." },
  error:   { line: "não consegui sincronizar", action: "tentar de novo", text: "o servidor não respondeu; tente de novo." }
};

const collections = new Map();
/* dois avisos diferentes, de proposito: `onChange` e "a SESSAO mudou" (entrou,
   saiu, caiu), e quem escuta costuma responder com rede. `onStatus` e so o
   estado do indicador (sincronizado, offline, erro), que muda o tempo todo
   durante uma sincronizacao. Misturar os dois faz laco: subir marca erro,
   avisar dispara quem escuta, quem escuta sobe de novo. */
const cloudListeners = new Set();
const statusListeners = new Set();

/* ha trabalho aqui que ainda nao chegou la? as colecoes sabem pela fila de
   sujos; o dia nao guarda fila — ele reenvia no proximo toque —, entao o
   estado da nuvem responde por ele: offline ou erro e "pode haver coisa aqui
   que la nao tem". e uma pergunta cautelosa de proposito: quem erra para o
   lado do sim so deixa dado num navegador, e quem erra para o lado do nao
   apaga trabalho. */
function anyPending() {
  if (cloud.status === "offline" || cloud.status === "error") return true;
  return [...collections.values()].some((c) => c.pending());
}

export const cloud = {
  signedIn: false,
  email: "",
  status: "local",
  setStatus(which) {
    if (this.status === which) return;
    this.status = which;
    this.notifyStatus();
  },
  onChange(fn) { cloudListeners.add(fn); return () => cloudListeners.delete(fn); },
  onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); },
  notifyStatus() { statusListeners.forEach((f) => { try { f(this); } catch (e) { console.error(e); } }); },
  /* a sessao mudou: avisa os dois lados, porque a casca tambem redesenha */
  emit() {
    cloudListeners.forEach((f) => { try { f(this); } catch (e) { console.error(e); } });
    this.notifyStatus();
  },
  async resume() {
    try {
      const r = await api("/me", { method: "GET" });
      this.signedIn = !!(r.ok && r.body.signedIn);
      this.email = this.signedIn ? String(r.body.email || "") : "";
    } catch (e) { this.signedIn = false; this.email = ""; }
    /* antes de qualquer sincronizacao: se este navegador era de outra pessoa,
       o que ficou aqui sai agora — senao a primeira subida levaria os
       documentos dela para esta conta. recarregar e a forma honesta de
       continuar: a tela ja desenhada ainda e a do outro. */
    if (this.signedIn && adoptIdentity(this.email)) { location.reload(); return; }
    this.setStatus(this.signedIn ? "synced" : "local");
    this.emit();
    if (this.signedIn) await this.syncAll();
  },
  async syncAll() {
    if (!this.signedIn) return;
    for (const c of collections.values()) await c.sync();
    /* a limpeza raramente fecha na primeira carga: as colecoes so entram no
       mapa quando alguem as abre, e a das frentes entra dentro dela mesma.
       cada sincronizacao seguinte (voltar para a aba, entrar) e outra chance,
       e ela fecha assim que todas tiverem baixado */
    purgeFronts();
  },
  async signOut() {
    await api("/sign-out", { method: "POST" }).catch(() => {});
    this.signedIn = false; this.email = "";
    /* sair de um computador dividido tem que nao deixar nada para tras — o
       colega que abrir o navegador depois nao deve ler o seu dia. o que ainda
       nao subiu segura a limpeza: perder trabalho e pior que deixar dado na
       maquina, e a proxima pessoa a entrar apaga isso de qualquer jeito. */
    const held = anyPending();
    /* a varredura leva o dono e a marca junto: nao estao em KEPT */
    if (!held) wipeLocal();
    this.setStatus("local");
    this.emit();
    if (held) { notify("saí, mas deixei o que ainda não tinha subido neste navegador"); return; }
    location.reload();
  }
};

/* ---------- entrar ----------
   e-mail, codigo, sessao. o core guarda se a caixa esta aberta e faz as duas
   chamadas; a caixa em si e da casca. cada chamada devolve o recado que a
   tela mostra, para o texto do erro nao morar em dois lugares. */

const signInListeners = new Set();
export const signIn = {
  open: false,
  onChange(fn) { signInListeners.add(fn); return () => signInListeners.delete(fn); },
  emit() { signInListeners.forEach((f) => { try { f(this); } catch (e) { console.error(e); } }); },
  show() { this.open = true; this.emit(); },
  hide() { this.open = false; this.emit(); },
  /* manda o codigo. devolve {ok, message} — a mensagem e sempre para a tela. */
  async requestCode(raw) {
    const email = String(raw || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) return { ok: false, message: "esse e-mail não parece certo" };
    const r = await api("/code", { method: "POST", body: JSON.stringify({ email }) }).catch(() => null);
    if (!r || !r.ok) return { ok: false, message: (r && r.body.error) || "não consegui mandar o código" };
    /* "mandei" era mentira metade das vezes: o servidor responde igual para
       quem pode e para quem nao pode entrar — e o que impede descobrir quem
       tem conta testando enderecos —, entao a tela nao sabe se saiu e-mail.
       esta frase e verdadeira nos dois casos e continua sem entregar nada. */
    return { ok: true, email, message: "se " + email + " puder entrar, o código de 6 dígitos chega em alguns segundos" };
  },
  /* troca o codigo por sessao. em caso de sucesso ja sincroniza tudo. */
  async submitCode(email, raw) {
    const code = String(raw || "").replace(/\D/g, "");
    if (code.length !== 6) return { ok: false, message: "o código tem 6 dígitos" };
    const r = await api("/sign-in", { method: "POST", body: JSON.stringify({ email, code }) }).catch(() => null);
    if (!r || !r.ok) return { ok: false, message: (r && r.body.error) || "código inválido" };
    cloud.signedIn = true;
    cloud.email = String(r.body.email || email);
    /* entrou outra pessoa neste navegador: o que era da anterior sai, e a
       pagina recomeca do zero baixando o que e desta. nada do que viria
       depois faz sentido numa tela que ja nao e mais dela. */
    if (adoptIdentity(cloud.email)) { location.reload(); return { ok: true, message: "" }; }
    this.hide();
    cloud.setStatus("synced");
    cloud.emit();
    cloud.syncAll();
    return { ok: true, message: "" };
  }
};
export const openSignIn = () => signIn.show();
export const closeSignIn = () => signIn.hide();



/* ---------- arquivos ----------
   um print colado numa ideia nao entra no documento: ele subiria e desceria
   inteiro a cada sincronizacao, e uma captura de tela pesa mais que o modulo
   todo. o binario vai para o R2 pelo worker, e o documento guarda so o
   bilhete — {id, name, type, size}.

   consequencia honesta: anexo so existe para quem entrou. sem sessao nao ha
   onde guardar, e inventar um deposito local seria prometer sincronizacao
   que nao aconteceria. a tela diz isso em vez de falhar em silencio. */

export const FILE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];
export const FILE_MAX = 8 * 1024 * 1024;

/* o endereco do arquivo. e uma rota do worker, nao uma URL do bucket: o
   bucket nao e publico, e e o worker quem confere de quem e o arquivo. */
export const fileUrl = (id) => API + "/files/" + encodeURIComponent(id);

export const isImage = (type) => String(type || "").startsWith("image/");

/* devolve o bilhete ({id, name, type, size}) ou lanca com a razao em
   portugues — quem chama mostra a frase e segue. */
export async function uploadFile(file) {
  if (!cloud.signedIn) throw new Error("entre para anexar — o arquivo precisa de onde morar");
  if (!FILE_TYPES.includes(file.type)) throw new Error("só imagem ou PDF");
  if (file.size > FILE_MAX) throw new Error("o arquivo passa de 8MB");
  const r = await fetch(API + "/files", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      /* cabecalho e ASCII: o nome vai codificado para "captura de tela.png"
         com acento chegar inteiro do outro lado */
      "content-type": "application/octet-stream",
      "x-file-type": file.type,
      "x-file-name": encodeURIComponent(file.name || "")
    },
    body: file
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || "não consegui subir o arquivo");
  return { ...body, at: Date.now() };
}

export async function deleteFile(id) {
  if (!cloud.signedIn) return;
  try { await fetch(API + "/files/" + encodeURIComponent(id), { method: "DELETE", credentials: "same-origin" }); }
  catch (e) { /* o bilhete ja saiu do documento; um objeto orfao no bucket
                 nao quebra nada e nao vale travar a tela por ele */ }
}

/* ---------- o link publico ----------
   um mapa ou um funil que da para mandar para o cliente. o servidor guarda o
   endereco do documento, e nao uma copia dele: o link mostra a versao de
   agora, e por isso "revogar" e a unica forma de fechar a porta.

   o endereco do link e montado aqui, e nao no servidor, porque quem sabe em
   que dominio o Merlin esta aberto e o navegador. */

export const shareUrl = (token) => location.origin + "/share.html#" + token;

export async function shareOf(type, id) {
  const r = await api("/share?type=" + encodeURIComponent(type) + "&id=" + encodeURIComponent(id), { method: "GET" });
  return r.ok ? (r.body.share || null) : null;
}
export async function share(type, id) {
  const r = await api("/share", { method: "POST", body: JSON.stringify({ type, id }) });
  if (r.ok) return r.body.share;
  throw new Error((r.body && r.body.error) || "não consegui criar o link");
}
export async function unshare(type, id) {
  const r = await api("/share?type=" + encodeURIComponent(type) + "&id=" + encodeURIComponent(id), { method: "DELETE" });
  return r.ok;
}
/* a leitura publica nao passa pelo api(): ela nao manda credencial nenhuma, e
   e essa a diferenca entre ela e todas as outras chamadas deste arquivo. */
export async function readShared(token) {
  const r = await fetch(API + "/shared/" + encodeURIComponent(token), { headers: { accept: "application/json" } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || "esse link não existe");
  return body;
}

/* ---------- colecoes ----------
   uma colecao e um conjunto de documentos do mesmo tipo, cada um com id e
   carimbo v. mora em localStorage (merlin:<tipo>) e sobe para /api/docs.
   a regra e a mesma do dia: quem tem o v maior ganha; o servidor devolve a
   versao dele quando recusa, e o cliente adota.

   apagar e um tumulo ({id, deleted:true}): sem ele, o outro aparelho subiria
   o documento de volta na proxima sincronizacao. */

const STAMP = (() => { let last = 0; return () => { last = Math.max(Date.now(), last + 1); return last; }; })();

export function collection(type, options = {}) {
  /* a colecao e uma so por tipo. quem chegar depois com um normalizador (o
     dono da colecao, quando o core ja a abriu para mostrar selos) o entrega
     a colecao existente em vez de ser ignorado. */
  if (collections.has(type)) {
    const c = collections.get(type);
    if (options.normalize) c.setNormalize(options.normalize);
    return c;
  }
  const key = "merlin:" + type;
  let normalize = options.normalize || ((d) => d);
  const listeners = new Set();
  let data = read();
  let uploadTimer = null;
  let syncing = false;
  /* um download ja voltou nesta sessao — quem precisa saber se a nuvem ja
     falou antes de decidir alguma coisa (a limpeza das frentes) pergunta */
  let downloaded = false;

  function read() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(key)); } catch (e) {}
    const d = { items: {}, serverV: 0, dirty: [], refused: {} };
    if (raw && typeof raw === "object") {
      if (raw.items && typeof raw.items === "object") d.items = raw.items;
      d.serverV = +raw.serverV || 0;
      d.dirty = Array.isArray(raw.dirty) ? raw.dirty : [];
      if (raw.refused && typeof raw.refused === "object") d.refused = raw.refused;
    }
    return d;
  }
  function persist() {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { console.warn("sem localStorage", e); }
  }
  function emit(origin) {
    listeners.forEach((f) => { try { f(origin); } catch (e) { console.error(e); } });
  }
  function docOf(item) {
    if (!item || !item.doc || item.doc.deleted) return null;
    return normalize({ ...item.doc });
  }
  /* entra na fila de subida. um documento e ou sujo ou recusado, nunca os
     dois: gravar de novo e a segunda chance de quem o servidor recusou. */
  function enqueue(id) {
    delete data.refused[id];
    if (!data.dirty.includes(id)) data.dirty.push(id);
  }

  const c = {
    type,
    setNormalize(fn) { normalize = fn; },
    all() {
      return Object.values(data.items).map(docOf).filter(Boolean);
    },
    get(id) { return docOf(data.items[id]); },
    /* os documentos como estao gravados, com carimbo e sem normalizar. so a
       mudanca de nome de colecao usa isto: normalizar aqui jogaria fora o `v`,
       que e justamente o que protege a migracao. */
    entries() {
      return Object.values(data.items)
        .filter((it) => it && it.doc && !it.doc.deleted)
        .map((it) => ({ v: it.v, doc: it.doc }));
    },
    /* gravar SEM carimbar. e o contrario de save(), e existe por um motivo so:
       na mudanca de nome, o carimbo do documento antigo e o que impede um
       navegador atrasado de sobrescrever o que ja foi editado do outro lado.
       carimbar aqui seria dar ao atrasado a versao mais nova do mundo. */
    adopt(list) {
      let changed = false;
      (list || []).forEach((d) => {
        if (!d || !d.id) return;
        const v = Math.round(+d.v) || 0;
        const cur = data.items[d.id];
        if (!v || (cur && cur.v >= v)) return;
        data.items[d.id] = { v, doc: { ...d, id: String(d.id), v } };
        enqueue(d.id);
        changed = true;
      });
      if (!changed) return 0;
      persist(); scheduleUpload(); emit("local");
      return 1;
    },
    has(id) { return !!(data.items[id] && !data.items[id].doc.deleted); },
    save(doc) {
      if (!doc || !doc.id) throw new Error("documento sem id");
      const v = STAMP();
      const clean = { ...doc, id: String(doc.id), v };
      data.items[clean.id] = { v, doc: clean };
      enqueue(clean.id);
      persist();
      scheduleUpload();
      emit("local");
      return clean;
    },
    /* varias gravacoes com um aviso so */
    saveMany(docs) {
      docs.forEach((doc) => {
        const v = STAMP();
        const clean = { ...doc, id: String(doc.id), v };
        data.items[clean.id] = { v, doc: clean };
        enqueue(clean.id);
      });
      persist(); scheduleUpload(); emit("local");
    },
    remove(id) {
      const before = c.get(id);
      if (!before) return null;
      c.save({ id, deleted: true });
      return before;
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    hasDownloaded() { return downloaded; },
    /* documento gravado aqui que ainda nao subiu. quem sai do navegador
       pergunta antes de apagar o que e local. */
    pending() { return data.dirty.length > 0; },
    async sync() {
      if (!cloud.signedIn || syncing) return;
      syncing = true;
      try { await download(); await upload(); }
      finally { syncing = false; }
    },
    reload() { data = read(); emit("storage"); }
  };

  async function download() {
    try {
      const r = await api("/docs?type=" + encodeURIComponent(type) + "&since=" + data.serverV, { method: "GET" });
      if (r.status === 401) { cloud.signedIn = false; cloud.setStatus("local"); cloud.emit(); return; }
      if (!r.ok) { cloud.setStatus("error"); return; }
      let changed = false;
      (r.body.docs || []).forEach((d) => {
        data.serverV = Math.max(data.serverV, d.v);
        const local = data.items[d.id];
        /* o que esta sujo aqui e mais novo que o de la nao e sobrescrito: sobe
           depois e o servidor decide */
        if (local && data.dirty.includes(d.id) && local.v >= d.v) return;
        if (!local || d.v > local.v) { data.items[d.id] = { v: d.v, doc: { ...d.doc, id: d.id, v: d.v } }; changed = true; }
      });
      persist();
      downloaded = true;
      if (changed) emit("cloud");
      cloud.setStatus("synced");
    } catch (e) { cloud.setStatus("offline"); }
  }

  async function upload() {
    if (!cloud.signedIn) return;
    const queue = data.dirty.slice();
    let refused = 0;
    for (const id of queue) {
      const item = data.items[id];
      if (!item) { data.dirty = data.dirty.filter((x) => x !== id); continue; }
      try {
        const r = await api("/docs", {
          method: "POST",
          body: JSON.stringify({ type, id, v: item.v, doc: item.doc })
        });
        if (r.ok) {
          /* o marcador do servidor so avanca no download. avancar aqui, com o
             carimbo do proprio cliente, faria o proximo `since` pular por cima
             de um documento que o outro aparelho gravou no meio — e ele nunca
             mais chegaria. baixar de novo o que ja e meu nao custa nada. */
          data.dirty = data.dirty.filter((x) => x !== id);
          cloud.setStatus("synced");
        } else if (r.status === 409 && r.body.server) {
          const s = r.body.server;
          data.items[id] = { v: s.v, doc: { ...s.doc, id, v: s.v } };
          data.serverV = Math.max(data.serverV, s.v);
          data.dirty = data.dirty.filter((x) => x !== id);
          emit("cloud");
        } else if (r.status === 401) {
          cloud.signedIn = false; cloud.setStatus("local"); cloud.emit(); break;
        } else if (r.status >= 400 && r.status < 500) {
          /* recusa definitiva — documento invalido (400) ou grande demais
             (413). tentar de novo daria a mesma resposta, e parar aqui
             trancaria a fila inteira: tudo o que veio depois deste documento
             nunca subiria, em silencio. entao ele sai da fila, fica anotado
             em `refused` e a proxima gravacao dele tenta outra vez. o que
             esta gravado neste navegador nao se perde; so nao sobe. */
          data.dirty = data.dirty.filter((x) => x !== id);
          data.refused[id] = { v: item.v, why: (r.body && r.body.error) || ("erro " + r.status) };
          console.warn("documento recusado pelo servidor", type, id, data.refused[id].why);
          refused++;
        } else { cloud.setStatus("error"); break; }
      } catch (e) { cloud.setStatus("offline"); break; }
    }
    persist();
    if (refused) {
      /* a fila pode ter escoado toda, mesmo com recusa: o indicador diz a
         verdade (nada pendente), e o aviso conta o que ficou para tras. */
      if (!data.dirty.length) cloud.setStatus("synced");
      notify(refused === 1
        ? "o servidor recusou um item; ele fica só neste navegador"
        : "o servidor recusou " + refused + " itens; eles ficam só neste navegador");
    }
  }

  function scheduleUpload() {
    if (!cloud.signedIn) return;
    clearTimeout(uploadTimer);
    uploadTimer = setTimeout(() => upload(), 1200);
  }

  /* outra aba gravou: recarrega e avisa */
  window.addEventListener("storage", (e) => { if (e.key === key) c.reload(); });

  collections.set(type, c);
  return c;
}

/* sobe o que ficou sujo antes de a aba sumir, e baixa ao voltar */
document.addEventListener("visibilitychange", () => {
  if (!cloud.signedIn) return;
  if (document.hidden) { for (const c of collections.values()) c.sync(); }
  else cloud.syncAll();
});

/* ---------- a limpeza das frentes ----------
   as frentes (o cadastro de empresas) sairam do sistema. esta funcao roda uma
   vez por navegador: apaga a colecao antiga — as lapides sobem e a nuvem
   esquece junto — e tira o campo `front` de tudo que ja estava gravado. com
   sessao, so depois de um download que voltou, colecao por colecao: apagar
   (ou regravar) antes de saber o que ha la em cima e apagar no escuro. o que
   nao baixou espera a proxima sincronizacao, e a marca de "feito" so e
   gravada quando todas fecharam. depois disso ela nunca mais faz nada. */
const FRONTS_PURGED = "merlin:fronts-removed";
const PURGE_TYPES = ["notes", "clients", "tasks", "week", "maps", "funnels", "finance", "habits", "plans", "bookmarks", "content"];
function stripFront(value) {
  if (Array.isArray(value)) return value.map(stripFront).some(Boolean);
  if (!value || typeof value !== "object") return false;
  let hit = false;
  if ("front" in value) { delete value.front; hit = true; }
  Object.values(value).forEach((v) => { if (stripFront(v)) hit = true; });
  return hit;
}
export function purgeFronts() {
  try { if (localStorage.getItem(FRONTS_PURGED)) return; } catch (e) { return; }
  const old = collection("fronts");
  if (cloud.signedIn && !old.hasDownloaded()) return; // tenta de novo na proxima abertura
  old.all().forEach((f) => old.remove(f.id));
  /* a caixa de entrada e so daqui: nao sincroniza, entao limpa sempre */
  const box = readInbox();
  if (stripFront(box)) writeInbox(box);
  /* so mexe na colecao que ja baixou. regravar carimba v novo, e carimbo novo
     em cima de copia velha faz a velha ganhar da que esta na nuvem — seria
     perder trabalho feito no outro aparelho. o que ficar de fora marca
     pendente; so abrir a colecao aqui ja a poe no mapa, entao a proxima
     sincronizacao a baixa e a limpeza fecha na passada seguinte. */
  let pendente = false;
  PURGE_TYPES.forEach((type) => {
    const c = collection(type);
    if (cloud.signedIn && !c.hasDownloaded()) { pendente = true; return; }
    c.all().forEach((doc) => {
      const copy = JSON.parse(JSON.stringify(doc));
      if (stripFront(copy)) c.save(copy);
    });
  });
  if (pendente) return;
  /* sem sessao a limpeza alcancou so este navegador: entrar depois traz da
     nuvem o que ainda tem `front`, e a marca ja teria trancado a segunda
     passada. sem marca ela repete a cada abertura, o que nao custa nada
     depois que nao ha mais o que tirar. */
  if (!cloud.signedIn) return;
  try { localStorage.setItem(FRONTS_PURGED, String(Date.now())); } catch (e) {}
}

/* um endereço que dá para abrir. domínio pelado ganha https; protocolo que
   não seja http(s) é recusado — não existe caminho para um "javascript:"
   entrar por um campo de texto e virar navegação num clique. */
export function safeUrl(raw) {
  const t = String(raw || "").trim();
  if (!t) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : "https://" + t;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.href;
  } catch (e) { return ""; }
}
/* o host, para a linha de baixo do ladrilho: "youtube.com", sem o www */
export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
}

/* ---------- este navegador é novo? ----------
   a pergunta que decide se o inicio mostra a porta ou a casa. tres coisas
   importam nela, e todas foram aprendidas errando:

   e SINCRONA. a tentacao e perguntar ao servidor quem e voce antes de decidir,
   mas o Merlin funciona inteiro sem conexao — e uma tela que espera a rede
   para saber se existe nasce vazia e se corrige depois, o que e pior que
   nascer certa. tudo que ela le esta no localStorage.

   e uma lista de INCLUSAO, nunca de exclusao. listar o que ignorar significa
   que toda chave nova de estado de tela (`merlin:notes:view`, o zoom de um
   mapa, a tira de fantasmas do funil) precisa ser lembrada por quem a criar —
   e quem esquecer faz a porta sumir para quem nunca entrou. aqui so contam as
   colecoes que guardam trabalho, o documento do dia e a caixa de entrada.

   `merlin:seen` NAO conta, e este e o caso que mais custa se errar: ele e
   escrito ao fechar a apresentacao, entao conta-lo faria a porta sumir para
   sempre no primeiro Esc de quem acabou de chegar. */
export function isNewHere() {
  if (whoIsHere()) return false;                       /* ja entrou aqui alguma vez */
  const has = (key, count) => {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(key)); } catch (e) { return false; }
    return !!raw && count(raw) > 0;
  };
  if (PURGE_TYPES.some((t) => has("merlin:" + t, (d) => Object.keys(d.items || {}).length))) return false;
  if (has("merlin:day", (d) => (d.tasks || []).length)) return false;
  if (has("merlin:inbox", (d) => (Array.isArray(d) ? d.length : 0))) return false;
  return true;
}

/* ---------- ideias viraram notas ----------
   a tela mudou de nome e o Arthur decidiu que o dado fosse junto. copiar e a
   parte facil; o difícil e que dois navegadores migram em momentos
   diferentes, e o que migra depois carrega uma copia velha da nuvem.

   por isso a copia PRESERVA o carimbo `v` de cada documento em vez de gravar
   um novo. o servidor so aceita carimbo maior (worker.js, uploadDoc), entao a
   migracao tardia de um navegador atrasado e recusada por ele em vez de
   sobrescrever a nota que ja foi editada do outro lado. sem isso, `save()`
   carimbaria Date.now() e a copia velha ganharia por ser a mais recente — que
   e a janela de perda que este bloco existe para fechar.

   a colecao antiga NAO e apagada. ela fica de arquivo: nao custa quase nada,
   e uma aba velha aberta noutro lugar continua funcionando ate ser recarregada.

   com sessao, a migracao espera a colecao antiga baixar. migrar metade e
   marcar feito perderia o que ainda estava por vir. */
const NOTES_MIGRATED = "merlin:renamed:notes";
export function migrateNotes(complete) {
  try { if (localStorage.getItem(NOTES_MIGRATED)) return; } catch (e) { return; }
  const from = collection("ideas");
  const old = from.entries();
  if (old.length) collection("notes").adopt(old.map((e) => ({ ...e.doc, v: e.v })));
  /* a marca so e posta quando a fonte esta completa — com sessao, depois de a
     colecao antiga ter baixado. ate la a migracao roda de novo a cada
     abertura, e repetir nao custa: o adopt recusa carimbo que nao seja maior. */
  if (!complete || (cloud.signedIn && !from.hasDownloaded())) return;
  try { localStorage.setItem(NOTES_MIGRATED, String(old.length)); } catch (e) {}
}

/* ---------- preferencias ----------
   o que e da PESSOA e nao de um documento: a janela do dia e quanto vale uma
   tarefa que chegou sem duracao.

   por que uma colecao e nao uma chave solta no localStorage: preferencia
   tambem viaja. a janela do dia estava DENTRO do documento do dia, e isso
   fazia dela um dado de hoje — mudar o horario de trabalho num aparelho nao
   chegava no outro ate o dia inteiro subir, e um dia velho baixando por cima
   trazia a janela velha junto. como colecao ela sincroniza como todo o resto,
   com o mesmo carimbo e a mesma regra de quem esta na frente.

   um documento so, de id "config" — a mesma forma do sal do cofre. */

const PREFS_ID = "config";
export const DEFAULT_PREFS = { dayStart: 540, dayEnd: 1140, guess: 30 };
export const prefsStore = () => collection("prefs");

const inRange = (v, lo, hi, fallback) =>
  Number.isFinite(+v) && +v >= lo && +v <= hi ? Math.round(+v) : fallback;

/* le sempre validado: documento vindo do disco ou da nuvem nao e confiavel so
   por ter chegado, e uma janela invertida (fim antes do comeco) faria a barra
   do dia nascer com largura negativa. */
export function readPrefs() {
  const d = prefsStore().get(PREFS_ID) || {};
  const dayStart = inRange(d.dayStart, 0, 1440, DEFAULT_PREFS.dayStart);
  let dayEnd = inRange(d.dayEnd, 0, 1440, DEFAULT_PREFS.dayEnd);
  if (dayEnd <= dayStart) dayEnd = Math.min(dayStart + 600, 1440);
  return { dayStart, dayEnd, guess: inRange(d.guess, 5, 240, DEFAULT_PREFS.guess) };
}

export function savePrefs(patch) {
  const cur = prefsStore().get(PREFS_ID) || { id: PREFS_ID, createdAt: Date.now() };
  return prefsStore().save({ ...cur, ...patch, id: PREFS_ID, updatedAt: Date.now() });
}

/* clientes: o indice leve que os outros modulos usam para selo e escolha.
   a colecao inteira mora em clientes.html; aqui so o que e comum. */
export const clients = () => collection("clients");
/* perdido sai dos seletores junto com encerrado: nenhum dos dois recebe tarefa nova */
export const listClients = () => clients().all().filter((c) => c.status !== "closed" && c.status !== "lost").sort((a, b) => String(a.name).localeCompare(String(b.name)));
export const clientName = (id) => { const c = id && clients().get(id); return c ? c.name : ""; };
/* ---------- @cliente no texto ----------
   "@lojax" liga o que esta sendo escrito a um cliente. compara sem acento, sem
   espaco e sem caixa, com o nome. o que nao casou fica no texto, porque pode
   ser so um arroba. */
export const foldKey = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
const MENTION = /(?:^|\s)@([^\s@]+)/g;
export function parseMentions(text) {
  let client = "";
  const cl = listClients();
  const title = String(text || "").replace(MENTION, (m, tok) => {
    const k = foldKey(tok);
    if (!k) return m;
    const c = cl.find((x) => foldKey(x.name) === k || foldKey(x.name).startsWith(k));
    if (c && !client) { client = c.id; return " "; }
    return m;
  });
  return { client, title: title.replace(/\s+/g, " ").trim() };
}

/* ---------- caixa de entrada do dia ----------
   quem quer mandar algo para hoje escreve aqui. o dia esvazia ao abrir e ao
   receber o evento de storage. nada aqui toca no documento do dia. */

const INBOX_KEY = "merlin:inbox";
export function readInbox() {
  try { const v = JSON.parse(localStorage.getItem(INBOX_KEY)); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}
export function writeInbox(list) {
  try { localStorage.setItem(INBOX_KEY, JSON.stringify(list)); } catch (e) {}
}
/* item: {title, min?, client?, origin:{type,id}} */
/* a forma de uma nota nova, num lugar so. quatro telas criavam este objeto
   por conta propria, cada uma com a sua versao dos campos vazios — e quem
   esquecesse um deixava o normalize da pagina consertar em silencio. */
export function newNote(spec) {
  const now = Date.now();
  const doc = {
    id: newId(),
    title: String((spec && spec.title) || "").slice(0, 300),
    body: String((spec && spec.body) || ""),
    stage: "seed",
    client: String((spec && spec.client) || ""),
    steps: [], files: [], outputs: [], history: [],
    createdAt: now, updatedAt: now
  };
  if (!doc.title) return null;
  collection("notes").save(doc);
  return doc;
}

export function sendToDay(item) {
  /* sem duracao aquilo nao custa minuto nenhum, entao nunca precisou tocar no
     dia: vira nota aqui mesmo, na hora. o aviso antigo dizia "foi para a caixa
     de ideias do dia" e mentia duas vezes — a caixa so era recolhida quando
     day.html abrisse, e ate la o item nao existia em lugar nenhum que a busca
     ou outra tela alcancasse.

     a caixa de entrada continua existindo, e continua sendo so para o que tem
     duracao: so o dia escreve no documento do dia, e um segundo escritor e
     exatamente a forma do bug que o vinculo com a semana fechou. o que muda e
     que agora o aviso diz isso em voz alta. */
  if (!item.min) {
    const note = newNote({ title: item.title, client: item.client });
    if (note) notify("virou nota");
    return;
  }
  const list = readInbox();
  list.push({
    id: newId(),
    title: String(item.title || "").trim().slice(0, 200),
    min: Math.max(0, Math.round(+item.min || 0)),
    client: item.client || "",
    origin: item.origin ? { type: item.origin.type, id: item.origin.id } : null,
    at: Date.now()
  });
  writeInbox(list);
  notify("entra na fila quando você abrir o dia");
}

/* ---------- markdown minimo ----------
   paragrafos, listas, negrito, italico, links e codigo. o suficiente para
   uma nota; nada que mereca uma biblioteca. */
export function md(text) {
  const lines = String(text || "").split(/\r?\n/);
  let out = "", list = null;
  const inline = (s) => escapeHtml(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|\s)\*([^*]+)\*/g, "$1<i>$2</i>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a class="link" href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a class="link" href="$2" target="_blank" rel="noopener">$2</a>');
  const closeList = () => { if (list) { out += "</" + list + ">"; list = null; } };
  lines.forEach((l) => {
    const m = l.match(/^\s*(?:[-*]|(\d+)[.)])\s+(.*)$/);
    if (m) {
      const kind = m[1] ? "ol" : "ul";
      if (list !== kind) { closeList(); out += "<" + kind + ">"; list = kind; }
      const chk = m[2].match(/^\[( |x)\]\s+(.*)$/i);
      out += chk ? '<li class="chk' + (chk[1].toLowerCase() === "x" ? " is-done" : "") + '">' + inline(chk[2]) + "</li>" : "<li>" + inline(m[2]) + "</li>";
      return;
    }
    closeList();
    if (!l.trim()) return;
    const h = l.match(/^\s*(#{1,3})\s+(.*)$/);
    if (h) { out += "<h" + (h[1].length + 2) + ">" + inline(h[2]) + "</h" + (h[1].length + 2) + ">"; return; }
    out += "<p>" + inline(l) + "</p>";
  });
  closeList();
  return out;
}

/* ---------- inicio comum ----------
   quem desenha a casca (sidebar, busca, entrar, aviso) e o ui.js, que se
   registra aqui ao ser importado. e assim que o core continua sem saber
   desenhar: se ele importasse o ui, os dois se importariam em circulo. */
let renderShell = null;
export function setShellRenderer(fn) { renderShell = fn; }

export function initPage(id) {
  if (renderShell) renderShell(id);
  clients();
  prefsStore();   /* a janela do dia sai daqui, e o dia pinta antes da nuvem */
  /* a mudanca de nome roda ANTES da primeira pintura. o que ja esta neste
     navegador nao depende de rede, e esperar o /me responder faz a tela nascer
     vazia e se corrigir sozinha um instante depois — pior que nascer certa. e
     ha um caso em que ela nem se corrige: se a resposta chegar antes de o React
     montar, o aviso da colecao nao encontra ouvinte nenhum. */
  migrateNotes();
  /* limpar e a ultima coisa: resume() descobre se ha sessao e baixa o que a
     nuvem tem; so entao da para apagar as frentes antigas sem apagar no
     escuro. a pagina desenha antes disso e redesenha quando os dados chegam.
     quem nao baixou nesta carga fica para a proxima — a limpeza sabe esperar. */
  cloud.resume().finally(() => { migrateNotes(true); purgeFronts(); });
}
