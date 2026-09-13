/* merlin · mapa mental em mermaid
   o jeito de trazer um mapa de fora é colar o que uma IA devolveu: um
   `mindmap` do mermaid, quase sempre dentro de uma cerca ```mermaid e com
   conversa em volta. às vezes a IA responde com `graph TD` em vez de mindmap
   — esse também entra, virando árvore a partir do nó de cima.

   o módulo é puro (sem DOM, sem core) para ser provado no node: entra texto,
   sai uma árvore de nós SEM id — quem grava passa pelo normalizeNode do
   maps.jsx, que é quem dá id. o caminho de volta (`toMermaid`) existe para o
   "exportar mermaid", e a prova dele é a ida e volta dar a mesma árvore. */

const MAX_TEXT = 2000000;
const MAX_NODES = 3000;
const MAX_DEPTH = 60;
/* o servidor recusa documento acima de 1MB; o id real tem ~17 caracteres, e
   a folga cobre o nome e os campos do documento */
const MAX_JSON = 900000;
const ID_COST = '"id":"xxxxxxxxxxxxxxxxxxxx",'.length;
/* acima disso o mapa abriria como uma parede: o terceiro nível nasce fechado */
const COLLAPSE_OVER = 150;

const OTHER_DIAGRAMS = [
  "sequenceDiagram", "classDiagram", "stateDiagram-v2", "stateDiagram", "erDiagram", "journey", "gantt",
  "pie", "quadrantChart", "requirementDiagram", "gitGraph", "C4Context", "C4Container", "C4Component",
  "timeline", "zenuml", "sankey-beta", "xychart-beta", "block-beta", "packet-beta", "kanban",
  "architecture-beta", "radar-beta", "treemap-beta"
];

/* ---------- texto ---------- */

const NAMED = { quot: '"', amp: "&", lt: "<", gt: ">", apos: "'", nbsp: " ", colon: ":", num: "#" };
/* as duas famílias de entidade (#quot; do mermaid e &quot; do html) numa
   passada só: o que foi decodificado não é lido de novo, e é isso que deixa
   um título com "&amp;" literal voltar como "&amp;" */
function decodeEntities(s) {
  return s.replace(/#(\d{1,7}|[a-z]{2,8});|&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z]{2,8});/gi, (all, m, h) => {
    const key = m || h;
    if (key[0] === "#") {
      const code = key[1] === "x" || key[1] === "X" ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
    }
    if (/^\d+$/.test(key)) { const code = +key; return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all; }
    const v = NAMED[key.toLowerCase()];
    return v == null ? all : v;
  });
}

/* o texto de um nó como ele aparece na tela: sem aspas, sem marcação de
   markdown string, sem <br>, sem ícone do font awesome */
function cleanLabel(raw) {
  let s = String(raw || "").trim();
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') s = s.slice(1, -1).trim();
  if (s.length >= 2 && s[0] === "`" && s[s.length - 1] === "`") {
    s = s.slice(1, -1).replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/(^|[\s(])[*_](\S(?:.*?\S)?)[*_](?=$|[\s).,:;!?])/g, "$1$2");
  }
  s = s.replace(/<br\s*\/?>/gi, " ").replace(/<\/?[a-z][^<>]*>/gi, "").replace(/\bfa[bsr]?:fa-[\w-]+/g, "");
  return decodeEntities(s).replace(/\s+/g, " ").trim().slice(0, 300);
}

const safeLink = (url) => /^(https?:\/\/|mailto:)/i.test(url) ? url.slice(0, 500) : "";

/* ---------- achar o diagrama dentro da resposta ---------- */

function frontMatter(text) {
  const m = text.match(/^\s*---[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*---[ \t]*(?:\r?\n|$)/);
  if (!m) return { title: "", body: text };
  const t = m[1].match(/^title:[ \t]*(.+)$/m);
  const title = t ? t[1].trim().replace(/^(["'])(.*)\1$/, "$2") : "";
  return { title: cleanLabel(title), body: text.slice(m[0].length) };
}

const isMeaningful = (line) => line.trim() && !/^\s*%%/.test(line);
const HEADER = /^\s*(mindmap|flowchart-elk|flowchart|graph)\b/;

/* devolve { kind, lines, title } ou lança o erro que explica o que veio */
function locate(text) {
  const fences = [];
  const re = /(?:^|\n)[ \t]*(```|~~~)[^\n]*\n([\s\S]*?)\n[ \t]*\1[ \t]*(?=\n|$)/g;
  let m;
  while ((m = re.exec(text))) fences.push(m[2]);
  const candidates = fences.length ? fences : [text];
  let other = "";
  for (const candidate of candidates) {
    const { title, body } = frontMatter(candidate);
    const lines = body.split("\n");
    let first = lines.findIndex(isMeaningful);
    if (first < 0) continue;
    /* sem cerca, a conversa pode vir antes: o diagrama começa no cabeçalho */
    if (!HEADER.test(lines[first]) && !fences.length) {
      const at = lines.findIndex((l) => HEADER.test(l));
      if (at >= 0) first = at;
    }
    const head = lines[first].trim();
    const kind = head.match(HEADER);
    if (kind) return { kind: kind[1] === "mindmap" ? "mindmap" : "flowchart", lines, first, title };
    if (!other) other = OTHER_DIAGRAMS.find((d) => head === d || head.indexOf(d + " ") === 0 || head.indexOf(d + ":") === 0) || "";
  }
  if (other) throw new Error("isso é um " + other + ", não um mapa mental — peça um mindmap");
  throw new Error("não achei um mindmap nem um flowchart nesse texto");
}

/* ---------- mindmap ----------
   a hierarquia é pela indentação RELATIVA, como no mermaid: o pai de uma
   linha é o nó anterior mais próximo com indentação menor. tab conta 4
   colunas — o mermaid conta 1, mas quem mistura tab e espaço enxergou o tab
   largo no editor, e é essa a hierarquia que ele quis escrever. */
const SHAPES = [["((", "))"], ["))", "(("], ["{{", "}}"], ["(-", "-)"], ["(", ")"], [")", "("], ["[", "]"]];

function mindmapLabel(text) {
  const at = text.search(/[(\[{)]/);
  if (at < 0) return cleanLabel(text);
  const prefix = text.slice(0, at).trim(), rest = text.slice(at);
  /* "Fase 1 (semana 1)" é frase com parêntese, e não o id "Fase 1" com a
     forma arredondada: id com espaço no meio é prosa, e prosa fica inteira */
  if (/\s/.test(prefix)) return cleanLabel(text);
  for (const [open, close] of SHAPES) {
    if (rest.length >= open.length + close.length && rest.startsWith(open) && rest.endsWith(close)) {
      return cleanLabel(rest.slice(open.length, rest.length - close.length));
    }
  }
  return cleanLabel(text);
}

function indentOf(line) {
  let col = 0;
  for (const ch of line) {
    if (ch === " " || ch === " ") col++;
    else if (ch === "\t") col += 4;
    else break;
  }
  return col;
}

function readMindmap(lines, first) {
  const roots = [];
  const stack = []; // { indent, node }
  let total = 0;
  for (let i = first + 1; i < lines.length; i++) {
    let line = lines[i].replace(/\r$/, "");
    if (!isMeaningful(line)) continue;
    /* markdown string pode atravessar linhas: junta até fechar a crase */
    if (/"`/.test(line) && line.lastIndexOf('"`') > line.lastIndexOf('`"')) {
      let j = i;
      while (j + 1 < lines.length && j - i < 200 && lines[j].lastIndexOf('`"') < lines[j].lastIndexOf('"`')) {
        j++;
        line += " " + lines[j].replace(/\r$/, "").trim();
        if (lines[j].indexOf('`"') >= 0) break;
      }
      i = j;
    }
    const indent = indentOf(line);
    const text = line.trim().replace(/::icon\([^)]*\)/g, "").replace(/(^|\s*):::[\w\s-]*$/, "").trim();
    if (!text) continue; // linha só de ícone ou de classe: enfeite do nó de cima
    const node = { title: mindmapLabel(text), link: "", children: [] };
    total++;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    if (stack.length) stack[stack.length - 1].node.children.push(node);
    else roots.push(node);
    stack.push({ indent, node });
  }
  return { roots, total };
}

/* ---------- flowchart ----------
   o plano B. os nós e as setas viram grafo, e o grafo vira árvore em
   largura a partir de quem não recebe seta: cada nó entra uma vez, debaixo do
   primeiro pai que o alcança. rótulo de seta não vira nó nem nota. */
const NODE_SHAPES = [
  ["(((", ")))"], ["([", "])"], ["[[", "]]"], ["[(", ")]"], ["((", "))"], ["{{", "}}"],
  ["[/", "/]", "\\]"], ["[\\", "\\]", "/]"], [">", "]"], ["(", ")"], ["[", "]"], ["{", "}"]
];
const ID = /[^\s[\](){}<>|&;"'`=~.:\-]+(?:-(?![-.>=])[^\s[\](){}<>|&;"'`=~.:\-]+)*/y;
const LINK_TEXT = /\s*(?:<|[ox](?=[-=.]))?(?:--|==|-\.)(?![-=.>])\s*(\S(?:[^\n]*?\S)?)\s*(?:-{2,}|={2,}|\.-+)(?:>|[ox](?=\s|$))?/y;
const LINK = /\s*(?:<|[ox](?=[-=.]))?(?:-{2,}|={2,}|-\.+-|~{3,})(?:>|[ox](?=\s|$))?(?:\s*\|[^|]*\|)?/y;

function splitStatements(line) {
  const out = [];
  let depth = 0, quote = false, start = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quote = !quote;
    else if (!quote && "([{".includes(ch)) depth++;
    else if (!quote && ")]}".includes(ch)) depth = Math.max(0, depth - 1);
    else if (!quote && depth === 0 && ch === ";") { out.push(line.slice(start, i)); start = i + 1; }
  }
  out.push(line.slice(start));
  return out;
}

function readFlowchart(lines, first) {
  const nodes = new Map(); // id -> { title, labeled, link }
  const edges = [];
  const fail = (n, s) => { throw new Error("linha " + (n + 1) + ": não entendi \"" + s.trim().slice(0, 40) + "\""); };

  function node(s, pos, n) {
    while (pos < s.length && /\s/.test(s[pos])) pos++;
    ID.lastIndex = pos;
    const m = ID.exec(s);
    if (!m) return null;
    const id = m[0];
    pos = ID.lastIndex;
    let label = null;
    if (s.startsWith("@{", pos)) {
      const end = s.indexOf("}", pos);
      if (end < 0) fail(n, s);
      const l = s.slice(pos, end).match(/label\s*:\s*"([^"]*)"/);
      if (l) label = l[1];
      pos = end + 1;
    } else {
      for (const [open, ...closers] of NODE_SHAPES) {
        if (!s.startsWith(open, pos)) continue;
        let from = pos + open.length;
        /* rótulo entre aspas pode ter o fechamento dentro dele */
        const quoted = s[from] === '"' ? s.indexOf('"', from + 1) : -1;
        const searchFrom = quoted > 0 ? quoted + 1 : from;
        let end = -1, closer = "";
        closers.forEach((c) => { const k = s.indexOf(c, searchFrom); if (k >= 0 && (end < 0 || k < end)) { end = k; closer = c; } });
        if (end < 0) fail(n, s);
        label = s.slice(from, end);
        pos = end + closer.length;
        break;
      }
    }
    const cls = /:::[\w-]+/y; cls.lastIndex = pos;
    if (cls.exec(s)) pos = cls.lastIndex;
    const known = nodes.get(id);
    if (!known) nodes.set(id, { title: label != null ? cleanLabel(label) : cleanLabel(id), labeled: label != null, link: "" });
    else if (label != null && !known.labeled) { known.title = cleanLabel(label); known.labeled = true; }
    return { id, pos };
  }
  function group(s, pos, n) {
    const ids = [];
    let r = node(s, pos, n);
    if (!r) return null;
    ids.push(r.id); pos = r.pos;
    for (;;) {
      const amp = /\s*&/y; amp.lastIndex = pos;
      if (!amp.exec(s)) break;
      r = node(s, amp.lastIndex, n);
      if (!r) fail(n, s);
      ids.push(r.id); pos = r.pos;
    }
    return { ids, pos };
  }

  const headRest = lines[first].trim().replace(/^(flowchart-elk|flowchart|graph)(\s+(TB|TD|BT|RL|LR)\b)?\s*;?/i, "");
  const all = [[first, headRest]].concat(lines.slice(first + 1).map((l, k) => [first + 1 + k, l]));
  for (const [n, raw] of all) {
    const line = raw.replace(/\r$/, "");
    if (!isMeaningful(line)) continue;
    for (const part of splitStatements(line)) {
      const s = part.trim();
      if (!s) continue;
      const word = (s.match(/^[\w-]+/) || [""])[0];
      if (word === "end" && s === "end") continue;
      if (["subgraph", "classDef", "class", "style", "linkStyle", "direction", "accTitle", "accDescr"].includes(word)) continue;
      if (word === "click") {
        const c = s.match(/^click\s+(\S+)\s+(?:href\s+)?"([^"]*)"/);
        if (c && nodes.has(c[1])) nodes.get(c[1]).link = safeLink(c[2]);
        continue;
      }
      let g = group(s, 0, n);
      if (!g) fail(n, s);
      let pos = g.pos;
      for (;;) {
        while (pos < s.length && /\s/.test(s[pos])) pos++;
        if (pos >= s.length) break;
        let len = -1;
        for (const re of [LINK_TEXT, LINK]) {
          re.lastIndex = pos;
          if (re.exec(s) && re.lastIndex > pos) { len = re.lastIndex; break; }
        }
        if (len < 0) fail(n, s);
        const next = group(s, len, n);
        if (!next) fail(n, s);
        g.ids.forEach((a) => next.ids.forEach((b) => edges.push([a, b])));
        g = next; pos = next.pos;
      }
    }
  }

  const order = [...nodes.keys()];
  const kids = new Map(order.map((id) => [id, []]));
  const incoming = new Set();
  edges.forEach(([a, b]) => { if (a !== b) { kids.get(a).push(b); incoming.add(b); } });
  const built = new Map(order.map((id) => [id, { title: nodes.get(id).title, link: nodes.get(id).link, children: [] }]));
  const seen = new Set(), roots = [];
  const walk = (start) => {
    seen.add(start); roots.push(built.get(start));
    const queue = [start];
    for (let q = 0; q < queue.length; q++) {
      kids.get(queue[q]).forEach((b) => {
        if (seen.has(b)) return;
        seen.add(b); built.get(queue[q]).children.push(built.get(b)); queue.push(b);
      });
    }
  };
  order.forEach((id) => { if (!incoming.has(id) && !seen.has(id)) walk(id); });
  /* o que sobrou está num ciclo que ninguém de fora alcança: o primeiro
     declarado vira ponta */
  order.forEach((id) => { if (!seen.has(id)) walk(id); });
  /* as pontas saem na ordem em que foram escritas, e não "quem não tem seta
     primeiro": um fluxo que volta ao início continua começando pelo início */
  const at = new Map(order.map((id, i) => [built.get(id), i]));
  roots.sort((a, b) => at.get(a) - at.get(b));
  return { roots, total: order.length };
}

/* ---------- da árvore crua ao mapa ---------- */
function finish(roots, total, title, kind) {
  if (!roots.length) throw new Error("não achei nenhum nó nesse " + (kind === "mindmap" ? "mindmap" : "flowchart"));
  let top = roots[0];
  if (roots.length > 1) { top = { title: title || "mapa importado", link: "", children: roots }; total++; }
  const make = (raw) => ({ title: raw.title, note: "", color: 0, collapsed: false, link: raw.link || "", children: [] });
  const root = make(top);
  /* em largura: quando passa do teto, o que fica de fora são as folhas mais
     fundas, e não um galho inteiro do topo */
  const queue = [[top, root, 0]];
  let count = 1;
  for (let q = 0; q < queue.length; q++) {
    const [raw, out, depth] = queue[q];
    for (const child of raw.children) {
      if (count >= MAX_NODES || depth + 1 >= MAX_DEPTH) continue;
      const made = make(child);
      out.children.push(made);
      count++;
      queue.push([child, made, depth + 1]);
    }
  }
  root.children.forEach((c, i) => { c.color = (i % 6) + 1; }); // como o buildMap dos modelos
  if (count > COLLAPSE_OVER) queue.forEach(([, out, depth]) => { if (depth >= 2 && out.children.length) out.collapsed = true; });
  if (JSON.stringify(root).length + count * ID_COST > MAX_JSON) throw new Error("esse mapa é grande demais para caber num documento");
  return { name: (title || root.title || "mapa importado").slice(0, 120), root, kind, count, dropped: Math.max(0, total - count) };
}

export function parseMermaid(text) {
  let s = String(text == null ? "" : text);
  if (s.length > MAX_TEXT) throw new Error("texto grande demais");
  s = s.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const found = locate(s);
  const read = found.kind === "mindmap" ? readMindmap(found.lines, found.first) : readFlowchart(found.lines, found.first);
  return finish(read.roots, read.total, found.title, found.kind);
}

/* ---------- o caminho de volta ----------
   todo título vai entre aspas e com o que o mermaid leria como sintaxe
   trocado por entidade — assim qualquer título volta idêntico */
const escapeTitle = (t) => String(t || "").replace(/\s+/g, " ").trim()
  .replace(/[#&"<>`:]/g, (c) => "#" + c.charCodeAt(0) + ";") || " ";

export function toMermaid(root) {
  const lines = ["mindmap"];
  let n = 0;
  const stack = [[root, 1]];
  while (stack.length) {
    const [node, depth] = stack.pop();
    const text = '"' + escapeTitle(node.title) + '"';
    lines.push("  ".repeat(depth) + (depth === 1 ? "root((" + text + "))" : "n" + (++n) + "[" + text + "]"));
    const children = node.children || [];
    for (let i = children.length - 1; i >= 0; i--) stack.push([children[i], depth + 1]);
  }
  return lines.join("\n") + "\n";
}
