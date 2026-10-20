/* merlin · a planilha (PRD desenhos, D3)

   uma folha por arquivo, com fórmulas simples: referências (B3), intervalos
   (B2:B9), as quatro operações, parênteses e SOMA, MÉDIA, MÍN e MÁX. o
   documento guarda só o que a pessoa digitou: o valor calculado nasce aqui, a
   cada desenho, e nunca é gravado (duas cópias da mesma conta é como ela deixa
   de bater).

   tudo puro, sem DOM e sem o core: a tela (sheets.jsx), a lista (drawings.jsx)
   e o teste (sheet.test.mjs) usam o mesmo. nenhuma função pública lança
   exceção — fórmula ruim vira "#erro", ciclo vira "#ciclo", e a tela segue. */

export const SHEET_ROWS = 200, SHEET_COLS = 26;
export const COL_TYPES = [
  { id: "text", label: "texto" },
  { id: "number", label: "número" },
  { id: "money", label: "R$" },
  { id: "date", label: "data" }
];
const TYPE_IDS = COL_TYPES.map((t) => t.id);

export const colLetter = (i) => String.fromCharCode(65 + i);

/* ---------- ler o que foi digitado ----------
   o número à brasileira: "1.234,56", "1.200" (milhar), "1234.5" (decimal),
   "R$ 12", "30%". a regra do ponto é a do parseMoney do core: com vírgula,
   ponto é milhar; sem vírgula, ponto seguido de exatamente três dígitos é
   milhar, senão é decimal. */
export function parseNumber(text) {
  let t = String(text == null ? "" : text).trim().replace(/^R\$\s*/i, "");
  const pct = t.endsWith("%");
  if (pct) t = t.slice(0, -1).trim();
  if (!/^[-+]?(\d{1,3}(\.\d{3})+|\d+)?([.,]\d+)?$/.test(t) || !/\d/.test(t)) return null;
  let n;
  if (t.includes(",")) n = parseFloat(t.replace(/\./g, "").replace(",", "."));
  else if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(t)) n = parseFloat(t.replace(/\./g, ""));
  else n = parseFloat(t);
  if (!Number.isFinite(n)) return null;
  return pct ? n / 100 : n;
}

/* a data vira um número de dias desde 1970-01-01, para dar conta (uma data
   menos a outra é a distância em dias) */
const DAY = 86400000;
export function parseDate(text) {
  const t = String(text == null ? "" : text).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/), y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else return null;
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return Math.round(ms / DAY);
}

const pad = (n) => String(n).padStart(2, "0");
function dateText(serial) {
  const d = new Date(Math.round(serial) * DAY);
  return pad(d.getUTCDate()) + "/" + pad(d.getUTCMonth() + 1) + "/" + d.getUTCFullYear();
}
const numberText = (v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const moneyText = (cents) => (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------- a forma do documento ----------
   {id, name, app, cols: [{id, name, type}], rows: [{id, cells: {colId: texto}}],
   createdAt, updatedAt}. quem cria de fora (a conversa, um modelo) só precisa
   acertar o grosso; o resto, e o teto de 200 × 26, se acerta aqui. */
function uniqueId(raw, used, prefix) {
  let id = raw == null ? "" : String(raw);
  if (!id || used.has(id)) { let n = 1; while (used.has(prefix + n)) n++; id = prefix + n; }
  used.add(id);
  return id;
}
export function normalizeSheet(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const usedCols = new Set();
  let cols = (Array.isArray(d.cols) ? d.cols : []).filter((c) => c && typeof c === "object").slice(0, SHEET_COLS)
    .map((c) => ({
      id: uniqueId(c.id, usedCols, "c"),
      name: String(c.name == null ? "" : c.name).slice(0, 60),
      type: TYPE_IDS.includes(c.type) ? c.type : "text"
    }));
  if (!cols.length) cols = [{ id: "c1", name: "", type: "text" }];
  const colIds = new Set(cols.map((c) => c.id));
  const usedRows = new Set();
  const rows = (Array.isArray(d.rows) ? d.rows : []).filter((r) => r && typeof r === "object").slice(0, SHEET_ROWS)
    .map((r) => {
      const cells = {};
      const src = r.cells && typeof r.cells === "object" ? r.cells : {};
      Object.keys(src).forEach((k) => {
        const v = src[k];
        if (!colIds.has(k) || (typeof v !== "string" && typeof v !== "number")) return;
        const s = String(v).slice(0, 2000);
        if (s) cells[k] = s;
      });
      return { id: uniqueId(r.id, usedRows, "r"), cells };
    });
  const num = (v) => (Number.isFinite(+v) && v !== null && v !== "" ? +v : 0);
  return {
    id: d.id == null ? "" : String(d.id),
    name: String(d.name == null ? "" : d.name).trim().slice(0, 120) || "planilha sem nome",
    app: typeof d.app === "string" ? d.app : "",
    cols, rows,
    createdAt: num(d.createdAt),
    updatedAt: num(d.updatedAt)
  };
}

/* ---------- a fórmula ----------
   lida em fichas, depois numa árvore pequena (a precedência de sempre), e só
   então avaliada. o erro de dentro é uma exceção com o código da célula; quem
   chama de fora nunca a vê. */
class Fault { constructor(code) { this.code = code; } }
const ERR = "#erro", CYCLE = "#ciclo";
const fail = (code) => { throw new Fault(code || ERR); };

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    const rest = src.slice(i);
    let m;
    if ((m = rest.match(/^\d+(?:[.,]\d+)?/))) { out.push({ t: "num", v: parseFloat(m[0].replace(",", ".")) }); i += m[0].length; continue; }
    if ((m = rest.match(/^([A-Za-zÀ-ÿ]+)\s*\(/))) { out.push({ t: "fn", v: m[1] }); out.push({ t: "(" }); i += m[0].length; continue; }
    if ((m = rest.match(/^([A-Za-z])(\d+)(?![\w(])/))) { out.push({ t: "ref", c: m[1].toUpperCase().charCodeAt(0) - 65, r: +m[2] - 1 }); i += m[0].length; continue; }
    if ("+-*/()%:".includes(ch)) { out.push({ t: ch }); i++; continue; }
    if (ch === ";" || ch === ",") { out.push({ t: "sep" }); i++; continue; }
    fail();
  }
  return out;
}

/* expr := termo (± termo)* · termo := unário (×÷ unário)* · unário := ±unário | pós
   pós := primário %* · primário := número | ref | ref:ref | fn(args) | (expr) */
function parse(src) {
  const tk = tokenize(src);
  let p = 0, depth = 0;
  const peek = () => tk[p] && tk[p].t;
  const eat = (t) => { if (peek() !== t) fail(); return tk[p++]; };
  const deeper = (f) => { if (++depth > 200) fail(); const r = f(); depth--; return r; };
  const expr = () => deeper(() => {
    let left = term();
    while (peek() === "+" || peek() === "-") { const op = tk[p++].t; left = { op, a: left, b: term() }; }
    return left;
  });
  const term = () => {
    let left = unary();
    while (peek() === "*" || peek() === "/") { const op = tk[p++].t; left = { op, a: left, b: unary() }; }
    return left;
  };
  const unary = () => deeper(() => {
    if (peek() === "-" || peek() === "+") { const op = tk[p++].t; const a = unary(); return op === "-" ? { op: "neg", a } : a; }
    let node = primary();
    while (peek() === "%") { p++; node = { op: "pct", a: node }; }
    return node;
  });
  const primary = () => {
    const tok = tk[p];
    if (!tok) fail();
    if (tok.t === "num") { p++; return { op: "num", v: tok.v }; }
    if (tok.t === "ref") {
      p++;
      if (peek() === ":") { p++; const end = eat("ref"); return { op: "range", c1: tok.c, r1: tok.r, c2: end.c, r2: end.r }; }
      return { op: "ref", c: tok.c, r: tok.r };
    }
    if (tok.t === "fn") {
      p++; eat("(");
      const args = [];
      if (peek() !== ")") { args.push(expr()); while (peek() === "sep") { p++; args.push(expr()); } }
      eat(")");
      return { op: "fn", name: tok.v, args };
    }
    if (tok.t === "(") { p++; const e = expr(); eat(")"); return e; }
    return fail();
  };
  const tree = expr();
  if (p !== tk.length) fail();
  return tree;
}

/* o nome da função sem acento e sem caixa: SOMA, soma, MÉDIA, media */
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const FUNCTIONS = {
  SOMA: (ns) => ns.reduce((a, b) => a + b, 0),
  MEDIA: (ns) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : fail()),
  MIN: (ns) => (ns.length ? Math.min(...ns) : 0),
  MAX: (ns) => (ns.length ? Math.max(...ns) : 0)
};

/* ---------- a conta da folha inteira ----------
   cada célula é calculada uma vez (memo). a que está sendo calculada fica em
   `visiting`: voltar a ela é um ciclo, e quem depende de uma célula em ciclo
   herda o "#ciclo" (e de um "#erro", o "#erro"). */
export function evaluateSheet(raw) {
  const sheet = normalizeSheet(raw);
  const { cols, rows } = sheet;
  const memo = new Map(), visiting = new Set();

  function cellAt(r, c) {
    if (r < 0 || c < 0 || r >= rows.length || c >= cols.length) return { kind: "empty", value: null };
    const key = r * SHEET_COLS + c;
    if (memo.has(key)) return memo.get(key);
    if (visiting.has(key)) fail(CYCLE);
    const cell = compute(r, c, key);
    memo.set(key, cell);
    return cell;
  }
  function valueOf(r, c) {
    const cell = cellAt(r, c);
    if (cell.kind === "error") fail(cell.value);
    return cell.value;
  }
  const numeric = (v) => (v === null ? 0 : typeof v === "number" ? v : fail());
  const finite = (n) => (Number.isFinite(n) ? n : fail());
  function run(node) {
    switch (node.op) {
      case "num": return node.v;
      case "ref": return valueOf(node.r, node.c);
      case "range": return fail(); // intervalo só existe dentro de função
      case "neg": return -numeric(run(node.a));
      case "pct": return numeric(run(node.a)) / 100;
      case "+": return finite(numeric(run(node.a)) + numeric(run(node.b)));
      case "-": return finite(numeric(run(node.a)) - numeric(run(node.b)));
      case "*": return finite(numeric(run(node.a)) * numeric(run(node.b)));
      case "/": { const a = numeric(run(node.a)), b = numeric(run(node.b)); return b === 0 ? fail() : finite(a / b); }
      case "fn": {
        const f = FUNCTIONS[fold(node.name)];
        if (!f) fail();
        const ns = [];
        node.args.forEach((arg) => {
          if (arg.op === "range") {
            const r1 = Math.min(arg.r1, arg.r2), r2 = Math.min(Math.max(arg.r1, arg.r2), rows.length - 1);
            const c1 = Math.min(arg.c1, arg.c2), c2 = Math.min(Math.max(arg.c1, arg.c2), cols.length - 1);
            for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const v = valueOf(r, c); if (typeof v === "number") ns.push(v); }
          } else {
            const v = run(arg);
            if (typeof v === "number") ns.push(v);
          }
        });
        return finite(f(ns));
      }
      default: return fail();
    }
  }
  function compute(r, c, key) {
    const raw = rows[r].cells[cols[c].id] || "";
    const type = cols[c].type;
    if (!raw.trim()) return { kind: "empty", value: null };
    if (raw.trim().startsWith("=")) {
      visiting.add(key);
      let v;
      try { v = run(parse(raw.trim().slice(1))); if (v === null) v = 0; }
      catch (e) { v = new Fault(e instanceof Fault ? e.code : ERR); }
      visiting.delete(key);
      if (v instanceof Fault) return { kind: "error", value: v.code };
      return shown(v, type, false, raw);
    }
    const n = type === "date" ? parseDate(raw) : null;
    if (n !== null) return shown(n, type, false, raw);
    const x = parseNumber(raw);
    return x === null ? { kind: "text", value: raw.trim() } : shown(x, type, true, raw);
  }
  /* digitado mostra o que se digitou ("30%" continua "30%"); conta mostra o
     número à brasileira. R$ é sempre em duas casas, e a data, dd/mm/aaaa */
  function shown(v, type, typed, raw) {
    if (typeof v === "string") return { kind: "text", value: v };
    if (type === "money") { const cents = Math.round(v * 100); return { kind: "number", value: v, cents, typed }; }
    if (type === "date" && !typed) return { kind: "number", value: v, date: true, typed };
    return { kind: "number", value: v, typed, raw: raw.trim() };
  }

  const out = {};
  rows.forEach((row, r) => {
    out[row.id] = {};
    cols.forEach((col, c) => {
      let cell;
      try { cell = cellAt(r, c); } catch (e) { cell = { kind: "error", value: e instanceof Fault ? e.code : ERR }; }
      out[row.id][col.id] = present(cell);
    });
  });
  return out;
}
function present(cell) {
  if (cell.kind === "empty") return { kind: "empty", value: null, text: "" };
  if (cell.kind === "error" || cell.kind === "text") return { kind: cell.kind, value: cell.value, text: cell.value };
  if (cell.cents !== undefined) return { kind: "number", value: cell.value, text: moneyText(cell.cents), cents: cell.cents };
  if (cell.date) return { kind: "number", value: cell.value, text: dateText(cell.value), date: true };
  return { kind: "number", value: cell.value, text: cell.typed ? cell.raw : numberText(cell.value), ...(cell.typed && cell.raw.endsWith("%") ? { pct: true } : {}) };
}

/* ---------- CSV para o Excel brasileiro ----------
   UTF-8 com BOM (sem ele o Excel lê os acentos como latin-1), ";" entre as
   colunas e vírgula decimal sem milhar. sai o valor calculado, não a fórmula:
   quem abre no Excel quer ver o número. texto que começa com = + - @ ganha um
   apóstrofo, para o Excel não o executar como fórmula. */
const csvNumber = (v) => v.toLocaleString("pt-BR", { useGrouping: false, maximumFractionDigits: 6 });
function csvField(text) {
  const s = String(text);
  return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCSV(raw) {
  const sheet = normalizeSheet(raw);
  const values = evaluateSheet(sheet);
  const guard = (s) => (/^[=+\-@]/.test(s) ? "'" + s : s);
  const lines = [sheet.cols.map((c, j) => csvField(guard(c.name || colLetter(j)))).join(";")];
  sheet.rows.forEach((row) => {
    lines.push(sheet.cols.map((col) => {
      const cell = values[row.id][col.id];
      if (cell.kind === "empty") return "";
      if (cell.kind === "error") return cell.value;
      if (cell.kind === "text") return csvField(guard(cell.value));
      if (cell.cents !== undefined) return (cell.cents / 100).toLocaleString("pt-BR", { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (cell.date) return cell.text;
      return cell.pct ? csvNumber(cell.value * 100) + "%" : csvNumber(cell.value);
    }).join(";"));
  });
  return "﻿" + lines.join("\r\n");
}

/* ---------- linhas e colunas ----------
   a referência é pela posição (B3), então acrescentar ou apagar uma linha
   reescreve as fórmulas de todas as células, como no Excel: o que estava
   depois anda, a ponta de um intervalo acompanha, e a referência à linha que
   sumiu vira "#ref" (a célula passa a mostrar "#erro"). sem isso, apagar uma
   linha acima do total faria o SOMA engolir a própria linha do total. */
const REF = /(?<![A-Za-zÀ-ÿ0-9_])([A-Za-z])(\d+)(?::([A-Za-z])(\d+))?(?![A-Za-z0-9_(])/g;
function shiftFormulas(sheet, axis, at, delta) {
  const move = (n) => (n >= at ? n + delta : n); // n e at são 0-based
  const rewrite = (src) => src.replace(REF, (all, c1, r1, c2, r2) => {
    const a = { c: c1.toUpperCase().charCodeAt(0) - 65, r: +r1 - 1 };
    const key = axis === "row" ? "r" : "c";
    if (c2 === undefined) {
      if (delta < 0 && a[key] === at) return "#ref";
      a[key] = move(a[key]);
      return a.c >= SHEET_COLS ? "#ref" : colLetter(a.c) + (a.r + 1);
    }
    const b = { c: c2.toUpperCase().charCodeAt(0) - 65, r: +r2 - 1 };
    let lo = Math.min(a[key], b[key]), hi = Math.max(a[key], b[key]);
    if (delta < 0) {
      if (lo === at && hi === at) return "#ref";
      if (lo > at) lo--;
      if (hi >= at) hi--;
    } else { lo = move(lo); hi = move(hi); }
    const s = { ...a, [key]: lo }, e = { ...b, [key]: hi };
    if (Math.max(s.c, e.c) >= SHEET_COLS) return "#ref";
    return colLetter(s.c) + (s.r + 1) + ":" + colLetter(e.c) + (e.r + 1);
  });
  return sheet.rows.map((row) => {
    const cells = {};
    Object.keys(row.cells).forEach((k) => { const v = row.cells[k]; cells[k] = v.trim().startsWith("=") ? rewrite(v) : v; });
    return { ...row, cells };
  });
}
const clampAt = (index, len) => Math.max(0, Math.min(len, Math.round(+index) || 0));
const freshId = (prefix, list) => { let n = list.length + 1; const has = new Set(list.map((x) => x.id)); while (has.has(prefix + n)) n++; return prefix + n; };

export function insertRow(raw, index, row) {
  const sheet = normalizeSheet(raw);
  if (sheet.rows.length >= SHEET_ROWS) return raw;
  const at = clampAt(index, sheet.rows.length);
  const rows = shiftFormulas(sheet, "row", at, 1);
  const id = row && row.id && !rows.some((r) => r.id === row.id) ? String(row.id) : freshId("r", rows);
  rows.splice(at, 0, { id, cells: { ...((row && row.cells) || {}) } });
  return normalizeSheet({ ...sheet, rows });
}
export function removeRow(raw, index) {
  const sheet = normalizeSheet(raw);
  const at = Math.round(+index);
  if (!(at >= 0 && at < sheet.rows.length)) return raw;
  const rows = shiftFormulas(sheet, "row", at, -1);
  rows.splice(at, 1);
  return { ...sheet, rows };
}
export function insertCol(raw, index, col) {
  const sheet = normalizeSheet(raw);
  if (sheet.cols.length >= SHEET_COLS) return raw;
  const at = clampAt(index, sheet.cols.length);
  const rows = shiftFormulas(sheet, "col", at, 1);
  const cols = sheet.cols.slice();
  const id = col && col.id && !cols.some((c) => c.id === col.id) ? String(col.id) : freshId("c", cols);
  cols.splice(at, 0, { id, name: (col && col.name) || "", type: (col && col.type) || "text" });
  return normalizeSheet({ ...sheet, cols, rows });
}
export function removeCol(raw, index) {
  const sheet = normalizeSheet(raw);
  const at = Math.round(+index);
  if (sheet.cols.length <= 1 || !(at >= 0 && at < sheet.cols.length)) return raw;
  const gone = sheet.cols[at].id;
  const rows = shiftFormulas(sheet, "col", at, -1).map((r) => { const cells = { ...r.cells }; delete cells[gone]; return { ...r, cells }; });
  return { ...sheet, cols: sheet.cols.filter((c) => c.id !== gone), rows };
}

/* ---------- os modelos da tela vazia (D5) ----------
   cada um é uma conta de verdade, já com as fórmulas: a pessoa troca os
   números e vê o resultado mudar, em vez de encarar uma grade em branco. */
const MRR_MONTHS = Array.from({ length: 12 }, (_, i) => {
  const n = i + 1;
  return ["mês " + n, i < 3 ? "10" : "8", i ? "1" : "0",
    i ? "=D" + i + "+B" + n + "-C" + n : "=B1-C1",
    i ? "=E" + i : "99", "=D" + n + "*E" + n];
});
export const SHEET_TEMPLATES = [
  {
    id: "pricing", name: "precificação",
    summary: "do custo ao preço de venda, com impostos, taxa da plataforma e a margem que você quer",
    cols: [{ name: "item", type: "text" }, { name: "valor", type: "money" }, { name: "%", type: "number" }],
    rows: [
      ["custo do produto", "40"], ["embalagem e frete", "12"],
      ["impostos", "", "6%"], ["taxa da plataforma", "", "10%"], ["margem desejada", "", "30%"],
      ["preço de venda", "=(B1+B2)/(1-C3-C4-C5)"], ["lucro por venda", "=B6*C5"]
    ]
  },
  {
    id: "product-cost", name: "custo do produto",
    summary: "o que entra em cada unidade, da matéria-prima ao frete, e o total",
    cols: [{ name: "item", type: "text" }, { name: "quantidade", type: "number" }, { name: "custo unitário", type: "money" }, { name: "total", type: "money" }],
    rows: [
      ["matéria-prima", "2", "18", "=B1*C1"], ["embalagem", "1", "4,50", "=B2*C2"],
      ["etiqueta e brinde", "1", "2", "=B3*C3"], ["mão de obra (horas)", "0,5", "40", "=B4*C4"],
      ["frete até você", "1", "6", "=B5*C5"], ["total", "", "", "=SOMA(D1:D5)"]
    ]
  },
  {
    id: "mrr", name: "MRR em 12 meses",
    summary: "clientes que entram e saem, o ticket médio e a receita recorrente mês a mês",
    cols: [{ name: "mês", type: "text" }, { name: "novos", type: "number" }, { name: "cancelados", type: "number" },
      { name: "clientes", type: "number" }, { name: "ticket médio", type: "money" }, { name: "MRR", type: "money" }],
    rows: [...MRR_MONTHS, ["receita do ano", "=SOMA(B1:B12)", "=SOMA(C1:C12)", "", "", "=SOMA(F1:F12)"]]
  },
  {
    id: "break-even", name: "ponto de equilíbrio",
    summary: "quantas vendas pagam os custos fixos do mês",
    cols: [{ name: "item", type: "text" }, { name: "valor", type: "money" }, { name: "quantidade", type: "number" }],
    rows: [
      ["custos fixos do mês", "8000"], ["preço de venda", "150"], ["custo variável por venda", "60"],
      ["margem por venda", "=B2-B3"], ["vendas para empatar", "", "=B1/B4"], ["faturamento para empatar", "=C5*B2"]
    ]
  }
];

/* o modelo vira colunas e linhas com id; `makeId` vem de quem grava (newId
   do core), para este arquivo continuar puro. sem modelo: três colunas de
   texto e linhas em branco para começar a digitar */
export function buildSheet(template, makeId) {
  const t = template || { name: "planilha", cols: [{ name: "", type: "text" }, { name: "", type: "text" }, { name: "", type: "text" }], rows: Array.from({ length: 8 }, () => []) };
  const cols = t.cols.map((c) => ({ id: makeId(), name: c.name, type: c.type }));
  const rows = t.rows.map((cells) => {
    const out = {};
    cells.forEach((v, j) => { if (v && cols[j]) out[cols[j].id] = v; });
    return { id: makeId(), cells: out };
  });
  return { name: t.name, cols, rows };
}
