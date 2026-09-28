/* merlin · o quadro livre do mapa
 *
 * o mapa deixou de ser so a arvore: em volta dela mora um quadro de anotacao
 * livre, como uma lousa — post-its, texto, formas, setas que se prendem nas
 * coisas, traco a mao, molduras, adesivos, tabela e documento. a arvore
 * continua sendo o que era (layout automatico, teclado, merlin) e vira um
 * objeto a mais do quadro; tudo o que e livre mora em `doc.items`.
 *
 * aqui fica so o que e puro: a forma de cada item, a geometria (caixa, toque,
 * ponta de seta), a simplificacao do traco e os modelos prontos. medir texto
 * precisa de canvas e desenhar precisa de React — isso mora no board-draw.jsx.
 * por ser puro, este arquivo e testado em node (board.test.mjs).
 *
 * coordenadas: o mundo e o mesmo da arvore (a raiz no 0,0). caixas guardam
 * x,y do canto de cima a esquerda; linhas guardam as duas pontas; o traco
 * guarda os pontos achatados [x0,y0,x1,y1,...] em inteiros. a ordem do array
 * e a ordem de pintura — o ultimo fica por cima — com uma excecao: moldura e
 * sempre fundo, porque ela existe para conter as outras coisas.
 */

/* ---------- paletas ----------
   o post-it tem cor de papel, a mesma nos dois temas: um post-it amarelo nao
   fica escuro porque a tela ficou. a tinta (texto, linha, traco, contorno)
   acompanha o tema, por isso e variavel. */
export const STICKY_COLORS = [
  "#fff4a3", "#ffdc5c", "#ffb27a", "#ff9e94",
  "#ffcdee", "#fb9fdf", "#b8d3ff", "#c4b4ff",
  "#a6e9ff", "#86b6ff", "#90e5d4", "#72d98f",
  "#d6f0a6", "#b8e26a", "#f1f1ef", "#1e1e1e"
];
/* o ultimo post-it e preto: a letra dele e clara */
export const stickyInk = (color) => (color === STICKY_COLORS.length - 1 ? "#f2f2f2" : "#1a1a1a");
export const INKS = ["var(--ink)", "var(--mc1)", "var(--mc2)", "var(--mc3)", "var(--mc4)", "var(--green-ink)", "var(--mc6)", "var(--ink-50)"];
export const inkOf = (i) => INKS[i] || INKS[0];
/* preenchimento de forma: -1 vazio, 0..15 as cores de papel, 16 a pilula do tema */
export const FILL_NONE = -1, FILL_THEME = 16;
export const fillOf = (f) => (f === FILL_NONE ? "none" : f === FILL_THEME ? "var(--mp-pill)" : STICKY_COLORS[f] || "var(--mp-pill)");
/* a letra dentro de uma forma segue o que esta atras dela */
export const fillInk = (f) => (f >= 0 && f < STICKY_COLORS.length ? stickyInk(f) : "var(--ink)");

export const SHAPES = ["rect", "round", "oval", "diamond", "triangle", "parallelogram", "hexagon", "star", "cylinder", "blockArrow"];
export const LINE_KINDS = ["line", "arrow", "elbow", "double"];
export const STICKERS = [
  "👍", "👎", "❤️", "⭐", "🔥", "💡", "✅", "❌",
  "❓", "❗", "🎯", "🚀", "💰", "📌", "👀", "🙌",
  "😀", "😂", "😍", "🤔", "😬", "😢", "😡", "🎉",
  "⚠️", "🐛", "📈", "📉", "🧠", "⏰", "🏆", "💬"
];
export const TYPES = ["sticky", "text", "shape", "line", "pen", "frame", "sticker", "table", "doc"];
/* tamanhos com que cada coisa nasce num clique, sem arrastar */
export const DEFAULT_SIZE = {
  sticky: [160, 160], text: [220, 28], shape: [160, 100], frame: [480, 320],
  sticker: [56, 56], table: [360, 132], doc: [260, 300]
};
export const TEXT_SIZES = [12, 14, 18, 24, 32, 48, 72];
export const MAX_ITEMS = 3000;
export const MAX_PEN_POINTS = 4000;

/* ---------- forma do item ----------
   tudo o que entra (da nuvem, de um modelo, do colar) passa por aqui: numero
   vira numero finito, texto tem teto, tipo desconhecido some. um item que
   nao da para desenhar nao chega ao desenho. */
const num = (v, d) => (Number.isFinite(+v) ? +v : d);
const round1 = (v) => Math.round(v * 10) / 10;
const int = (v, a, b, d) => { const n = Math.round(num(v, d)); return Math.max(a, Math.min(b, n)); };
const str = (v, max) => String(v == null ? "" : v).slice(0, max);
const LIMIT = 200000; // nada no quadro passa disso para longe da raiz

function box(raw, type) {
  const [dw, dh] = DEFAULT_SIZE[type] || [160, 100];
  return {
    x: round1(Math.max(-LIMIT, Math.min(LIMIT, num(raw.x, 0)))),
    y: round1(Math.max(-LIMIT, Math.min(LIMIT, num(raw.y, 0)))),
    w: round1(Math.max(8, Math.min(20000, num(raw.w, dw)))),
    h: round1(Math.max(8, Math.min(20000, num(raw.h, dh))))
  };
}

export function normalizeItem(raw, makeId) {
  if (!raw || typeof raw !== "object" || TYPES.indexOf(raw.type) < 0) return null;
  const t = raw.type;
  const base = { id: raw.id ? str(raw.id, 80) : makeId(), type: t };
  if (t === "line") {
    return {
      ...base,
      kind: LINE_KINDS.indexOf(raw.kind) >= 0 ? raw.kind : "arrow",
      x1: round1(num(raw.x1, 0)), y1: round1(num(raw.y1, 0)), x2: round1(num(raw.x2, 120)), y2: round1(num(raw.y2, 0)),
      from: raw.from ? str(raw.from, 80) : "", to: raw.to ? str(raw.to, 80) : "",
      color: int(raw.color, 0, INKS.length - 1, 0), width: int(raw.width, 1, 16, 2), dash: !!raw.dash,
      text: str(raw.text, 200)
    };
  }
  if (t === "pen") {
    const src = Array.isArray(raw.points) ? raw.points : [];
    const points = [];
    for (let i = 0; i + 1 < src.length && points.length < MAX_PEN_POINTS * 2; i += 2) {
      const x = Math.round(num(src[i], NaN)), y = Math.round(num(src[i + 1], NaN));
      if (Number.isFinite(x) && Number.isFinite(y)) points.push(x, y);
    }
    if (points.length < 2) return null;
    return {
      ...base, points,
      color: int(raw.color, 0, INKS.length - 1, 0), width: int(raw.width, 1, 40, 3),
      alpha: Math.max(0.1, Math.min(1, num(raw.alpha, 1)))
    };
  }
  const b = box(raw, t);
  if (t === "sticky") return { ...base, ...b, color: int(raw.color, 0, STICKY_COLORS.length - 1, 0), text: str(raw.text, 2000) };
  if (t === "text") return { ...base, ...b, color: int(raw.color, 0, INKS.length - 1, 0), size: int(raw.size, 8, 200, 18), bold: !!raw.bold, text: str(raw.text, 4000) };
  if (t === "shape") {
    return {
      ...base, ...b,
      shape: SHAPES.indexOf(raw.shape) >= 0 ? raw.shape : "rect",
      fill: int(raw.fill, FILL_NONE, FILL_THEME, FILL_THEME), color: int(raw.color, 0, INKS.length - 1, 0),
      text: str(raw.text, 1000)
    };
  }
  if (t === "frame") return { ...base, ...b, title: str(raw.title, 120) };
  if (t === "sticker") return { ...base, ...b, emoji: STICKERS.indexOf(raw.emoji) >= 0 ? raw.emoji : str(raw.emoji, 16) || "👍" };
  if (t === "doc") return { ...base, ...b, title: str(raw.title, 200), text: str(raw.text, 40000) };
  if (t === "table") {
    const rows = Array.isArray(raw.cells) ? raw.cells.slice(0, 40) : [];
    const cols = Math.max(1, Math.min(12, rows.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0) || 3));
    const cells = (rows.length ? rows : [[], [], []]).map((r) => {
      const row = Array.isArray(r) ? r.slice(0, cols).map((c) => str(c, 300)) : [];
      while (row.length < cols) row.push("");
      return row;
    });
    return { ...base, ...b, header: raw.header !== false, cells };
  }
  return null;
}

export function normalizeItems(list, makeId) {
  if (!Array.isArray(list)) return [];
  const out = [], seen = new Set();
  for (const raw of list) {
    if (out.length >= MAX_ITEMS) break;
    const it = normalizeItem(raw, makeId);
    if (!it || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

/* ---------- geometria ---------- */
export const isBoxType = (t) => t !== "line" && t !== "pen";
export const center = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/* a caixa de uma ponta presa: um item do quadro ou um no da arvore. quem
   resolve e o `boxOf` de quem desenha, porque so ele sabe onde a arvore
   esta agora (o layout muda a cada letra digitada num no). */
export function penBox(it) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i + 1 < it.points.length; i += 2) {
    const x = it.points[i], y = it.points[i + 1];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const r = it.width / 2;
  return { x: minX - r, y: minY - r, w: maxX - minX + it.width, h: maxY - minY + it.width };
}

/* onde a reta que sai do centro da caixa na direcao `toward` fura a borda.
   oval e losango tem borda propria; o resto e retangulo, que e o que o olho
   espera de um post-it e de uma moldura. `gap` afasta a ponta da borda para
   a seta nao encostar na forma. */
export function edgePoint(b, toward, shape, gap) {
  const c = center(b);
  const dx = toward.x - c.x, dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const hw = b.w / 2 + (gap || 0), hh = b.h / 2 + (gap || 0);
  let t;
  if (shape === "oval") t = 1 / Math.sqrt((dx * dx) / (hw * hw) + (dy * dy) / (hh * hh));
  else if (shape === "diamond") t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  else t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/* o meio do lado da caixa que olha para `toward` — e onde a seta em
   cotovelo se prende, para sair reta da forma */
export function sidePoint(b, toward, gap) {
  const c = center(b), g = gap || 0;
  const dx = toward.x - c.x, dy = toward.y - c.y;
  if (Math.abs(dx) / Math.max(1, b.w) >= Math.abs(dy) / Math.max(1, b.h)) {
    return { x: dx >= 0 ? b.x + b.w + g : b.x - g, y: c.y, axis: "h" };
  }
  return { x: c.x, y: dy >= 0 ? b.y + b.h + g : b.y - g, axis: "v" };
}

/* as pontas de uma linha como estao agora: ponta presa segue a caixa, ponta
   solta fica onde foi largada. cada ponta presa mira no centro da outra
   ponta (ou no ponto solto), para a seta sair sempre na direcao certa. */
export function lineEnds(it, boxOf) {
  const bFrom = it.from ? boxOf(it.from) : null, bTo = it.to ? boxOf(it.to) : null;
  const rawA = { x: it.x1, y: it.y1 }, rawB = { x: it.x2, y: it.y2 };
  const aim = (b, raw) => (b ? center(b) : raw);
  const gap = 4;
  const end = (b, other) => {
    if (!b) return null;
    return it.kind === "elbow" ? sidePoint(b, other, gap) : edgePoint(b, other, b.shape, gap);
  };
  const a = end(bFrom, aim(bTo, rawB)) || rawA;
  const z = end(bTo, aim(bFrom, rawA)) || rawB;
  return { x1: a.x, y1: a.y, x2: z.x, y2: z.y, axis1: a.axis || null, axis2: z.axis || null };
}

/* a seta em cotovelo: sai pelo eixo de onde nasceu e dobra uma vez no meio
   (ou duas, se as pontas saem por eixos diferentes) */
export function elbowPoints(e) {
  const { x1, y1, x2, y2 } = e;
  const axis = e.axis1 || (Math.abs(x2 - x1) >= Math.abs(y2 - y1) ? "h" : "v");
  if (axis === "h") {
    if (e.axis2 === "v") return [x1, y1, x2, y1, x2, y2];
    const mx = (x1 + x2) / 2;
    return [x1, y1, mx, y1, mx, y2, x2, y2];
  }
  if (e.axis2 === "h") return [x1, y1, x1, y2, x2, y2];
  const my = (y1 + y2) / 2;
  return [x1, y1, x1, my, x2, my, x2, y2];
}

export function linePoints(it, boxOf) {
  const e = lineEnds(it, boxOf);
  return it.kind === "elbow" ? elbowPoints(e) : [e.x1, e.y1, e.x2, e.y2];
}

export function bboxOf(it, boxOf) {
  if (it.type === "pen") return penBox(it);
  if (it.type === "line") {
    const p = linePoints(it, boxOf);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]);
      minY = Math.min(minY, p[i + 1]); maxY = Math.max(maxY, p[i + 1]);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  return { x: it.x, y: it.y, w: it.w, h: it.h };
}

export function unionBox(boxes) {
  let b = null;
  for (const r of boxes) {
    if (!r) continue;
    if (!b) { b = { ...r }; continue; }
    const x2 = Math.max(b.x + b.w, r.x + r.w), y2 = Math.max(b.y + b.h, r.y + r.h);
    b.x = Math.min(b.x, r.x); b.y = Math.min(b.y, r.y);
    b.w = x2 - b.x; b.h = y2 - b.y;
  }
  return b;
}

export const contains = (outer, inner) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
export const intersects = (a, b) => a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;

export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
export function distToPolyline(px, py, pts) {
  if (pts.length === 2) return Math.hypot(px - pts[0], py - pts[1]);
  let d = Infinity;
  for (let i = 0; i + 3 < pts.length; i += 2) d = Math.min(d, distToSegment(px, py, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]));
  return d;
}

/* a borracha: o traco que passa a menos de `tol` do ponto */
export function penHit(it, px, py, tol) {
  const b = penBox(it);
  if (px < b.x - tol || px > b.x + b.w + tol || py < b.y - tol || py > b.y + b.h + tol) return false;
  return distToPolyline(px, py, it.points) <= tol + it.width / 2;
}

/* o que a selecao em retangulo pega: moldura so se couber inteira (senao
   toda selecao feita dentro de uma moldura levaria a moldura junto); o
   resto basta encostar. */
export function marqueeHits(items, rect, boxOf) {
  const out = [];
  for (const it of items) {
    const b = bboxOf(it, boxOf);
    if (it.type === "frame" ? contains(rect, b) : intersects(rect, b)) out.push(it.id);
  }
  return out;
}

/* o que mora dentro de uma moldura (caixa inteira dentro dela) — e o que
   anda junto quando a moldura e arrastada */
export function frameChildren(items, frame, boxOf) {
  const fb = bboxOf(frame, boxOf);
  return items.filter((it) => it.id !== frame.id && it.type !== "frame" && contains(fb, bboxOf(it, boxOf))).map((it) => it.id);
}

/* ordem de pintura: molduras primeiro, depois o resto, cada grupo na ordem
   do array */
export function paintOrder(items) {
  return items.filter((it) => it.type === "frame").concat(items.filter((it) => it.type !== "frame"));
}

/* ---------- mexer ----------
   tudo devolve item novo: quem arrasta trabalha numa copia viva e so grava no
   fim, num passo so do desfazer. */
export function moveItem(it, dx, dy) {
  if (it.type === "line") {
    return { ...it, x1: round1(it.x1 + dx), y1: round1(it.y1 + dy), x2: round1(it.x2 + dx), y2: round1(it.y2 + dy) };
  }
  if (it.type === "pen") {
    const rx = Math.round(dx), ry = Math.round(dy);
    return { ...it, points: it.points.map((v, i) => v + (i % 2 ? ry : rx)) };
  }
  return { ...it, x: round1(it.x + dx), y: round1(it.y + dy) };
}

/* redimensionar pela alca `handle` (nw, ne, sw, se) ate o ponto p. o canto
   oposto fica parado. post-it e adesivo nao deformam: a proporcao e a do
   inicio; `keepRatio` estende isso a qualquer coisa (Shift). */
export const MIN_SIZE = 16;
export function resizeBox(start, handle, p, keepRatio) {
  const west = handle.indexOf("w") >= 0, north = handle.indexOf("n") >= 0;
  const ax = west ? start.x + start.w : start.x, ay = north ? start.y + start.h : start.y;
  let w = Math.max(MIN_SIZE, west ? ax - p.x : p.x - ax);
  let h = Math.max(MIN_SIZE, north ? ay - p.y : p.y - ay);
  if (keepRatio) {
    const r = start.w / start.h;
    if (w / h > r) h = w / r; else w = h * r;
  }
  return { x: round1(west ? ax - w : ax), y: round1(north ? ay - h : ay), w: round1(w), h: round1(h) };
}

/* a caixa que um arraste de a ate b desenha (Shift = quadrado) */
export function dragBox(a, b, square) {
  let w = b.x - a.x, h = b.y - a.y;
  if (square) { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; }
  return { x: round1(Math.min(a.x, a.x + w)), y: round1(Math.min(a.y, a.y + h)), w: round1(Math.abs(w)), h: round1(Math.abs(h)) };
}

/* ---------- o traco a mao ----------
   Ramer–Douglas–Peucker: tira os pontos que nao mudam o desenho. um risco
   de dois segundos tem centenas de amostras do ponteiro; o que fica e o
   bastante para a curva, e o documento nao engorda a cada rabisco. */
export function simplify(points, tolerance) {
  const n = points.length / 2;
  if (n <= 2) return points.map(Math.round);
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1, bestD = tolerance;
    for (let i = a + 1; i < b; i++) {
      const d = distToSegment(points[i * 2], points[i * 2 + 1], points[a * 2], points[a * 2 + 1], points[b * 2], points[b * 2 + 1]);
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(Math.round(points[i * 2]), Math.round(points[i * 2 + 1]));
  return out;
}

/* o caminho suave de um traco: curvas quadraticas passando pelos pontos
   medios — o risco fica redondo sem guardar mais pontos */
export function penPath(pts) {
  if (pts.length <= 2) return "M" + pts[0] + " " + pts[1] + "h0.01";
  if (pts.length === 4) return "M" + pts[0] + " " + pts[1] + "L" + pts[2] + " " + pts[3];
  let d = "M" + pts[0] + " " + pts[1];
  for (let i = 2; i + 3 < pts.length; i += 2) {
    const mx = (pts[i] + pts[i + 2]) / 2, my = (pts[i + 1] + pts[i + 3]) / 2;
    d += "Q" + pts[i] + " " + pts[i + 1] + " " + mx + " " + my;
  }
  const n = pts.length;
  return d + "L" + pts[n - 2] + " " + pts[n - 1];
}

/* ---------- as formas ----------
   o contorno de cada forma dentro da caixa w×h, com o canto no 0,0 */
export function shapePath(kind, w, h) {
  const f = (v) => Math.round(v * 10) / 10;
  switch (kind) {
    case "round": {
      const r = f(Math.min(18, w / 4, h / 4));
      return "M" + r + " 0H" + f(w - r) + "Q" + w + " 0 " + w + " " + r + "V" + f(h - r) + "Q" + w + " " + h + " " + f(w - r) + " " + h +
        "H" + r + "Q0 " + h + " 0 " + f(h - r) + "V" + r + "Q0 0 " + r + " 0Z";
    }
    case "oval": return "M0 " + f(h / 2) + "A" + f(w / 2) + " " + f(h / 2) + " 0 1 0 " + w + " " + f(h / 2) + "A" + f(w / 2) + " " + f(h / 2) + " 0 1 0 0 " + f(h / 2) + "Z";
    case "diamond": return "M" + f(w / 2) + " 0L" + w + " " + f(h / 2) + "L" + f(w / 2) + " " + h + "L0 " + f(h / 2) + "Z";
    case "triangle": return "M" + f(w / 2) + " 0L" + w + " " + h + "L0 " + h + "Z";
    case "parallelogram": { const s = f(Math.min(w * 0.2, h * 0.6)); return "M" + s + " 0H" + w + "L" + f(w - s) + " " + h + "H0Z"; }
    case "hexagon": { const s = f(Math.min(w * 0.25, h * 0.5)); return "M" + s + " 0H" + f(w - s) + "L" + w + " " + f(h / 2) + "L" + f(w - s) + " " + h + "H" + s + "L0 " + f(h / 2) + "Z"; }
    case "star": {
      let d = "";
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.42 : 1;
        d += (i ? "L" : "M") + f(w / 2 + Math.cos(a) * r * w / 2) + " " + f(h / 2 + 0.06 * h + Math.sin(a) * r * h / 2 * 1.02);
      }
      return d + "Z";
    }
    case "cylinder": {
      const e = f(Math.min(h * 0.15, 22)), rx = f(w / 2);
      return "M0 " + e + "A" + rx + " " + e + " 0 0 1 " + w + " " + e + "V" + f(h - e) + "A" + rx + " " + e + " 0 0 1 0 " + f(h - e) + "Z" +
        "M0 " + e + "A" + rx + " " + e + " 0 0 0 " + w + " " + e;
    }
    case "blockArrow": {
      const hl = f(Math.min(w * 0.4, h)), t = f(h * 0.5), top = f((h - t) / 2), bottom = f((h + t) / 2);
      return "M0 " + top + "H" + f(w - hl) + "V0L" + w + " " + f(h / 2) + "L" + f(w - hl) + " " + h + "V" + bottom + "H0Z";
    }
    default: return "M0 0H" + w + "V" + h + "H0Z";
  }
}

/* onde o texto cabe dentro da forma: losango, oval e triangulo tem menos
   miolo do que caixa */
export function shapeTextBox(kind, w, h) {
  const pad = 10;
  if (kind === "diamond") return { x: w * 0.22, y: h * 0.22, w: w * 0.56, h: h * 0.56 };
  if (kind === "oval") return { x: w * 0.15, y: h * 0.15, w: w * 0.7, h: h * 0.7 };
  if (kind === "triangle") return { x: w * 0.25, y: h * 0.45, w: w * 0.5, h: h * 0.5 };
  if (kind === "star") return { x: w * 0.3, y: h * 0.38, w: w * 0.4, h: h * 0.36 };
  if (kind === "blockArrow") return { x: pad, y: h * 0.25, w: w - Math.min(w * 0.4, h) - pad, h: h * 0.5 };
  if (kind === "cylinder") { const e = Math.min(h * 0.15, 22); return { x: pad, y: e * 2, w: w - pad * 2, h: h - e * 3 }; }
  return { x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 };
}

/* ---------- tabela ---------- */
export const tableSize = (it) => ({ rows: it.cells.length, cols: it.cells[0] ? it.cells[0].length : 1 });
export function cellAt(it, px, py) {
  const { rows, cols } = tableSize(it);
  const c = Math.floor((px - it.x) / (it.w / cols)), r = Math.floor((py - it.y) / (it.h / rows));
  if (r < 0 || c < 0 || r >= rows || c >= cols) return null;
  return [r, c];
}
export function cellBox(it, r, c) {
  const { rows, cols } = tableSize(it);
  const cw = it.w / cols, ch = it.h / rows;
  return { x: it.x + c * cw, y: it.y + r * ch, w: cw, h: ch };
}
/* mais ou menos linha/coluna: a tabela cresce do tamanho de uma celula, para
   a letra nao encolher */
export function resizeTable(it, dRows, dCols) {
  const { rows, cols } = tableSize(it);
  const nr = Math.max(1, Math.min(40, rows + dRows)), nc = Math.max(1, Math.min(12, cols + dCols));
  if (nr === rows && nc === cols) return it;
  const cells = [];
  for (let r = 0; r < nr; r++) {
    const row = [];
    for (let c = 0; c < nc; c++) row.push((it.cells[r] && it.cells[r][c]) || "");
    cells.push(row);
  }
  return { ...it, cells, w: round1(it.w / cols * nc), h: round1(it.h / rows * nr) };
}

/* ---------- copiar e colar ----------
   a copia ganha ids novos, e as setas presas continuam presas — mas so no
   que foi junto. seta presa em algo que ficou para tras vira ponta solta, no
   lugar exato onde estava desenhada. */
export function cloneItems(list, makeId, dx, dy, boxOf) {
  const map = new Map();
  list.forEach((it) => map.set(it.id, makeId()));
  return list.map((it) => {
    let copy = moveItem({ ...it, id: map.get(it.id) }, dx, dy);
    if (it.type === "line") {
      const e = lineEnds(it, boxOf);
      copy = { ...copy };
      if (it.from) { if (map.has(it.from)) copy.from = map.get(it.from); else { copy.from = ""; copy.x1 = round1(e.x1 + dx); copy.y1 = round1(e.y1 + dy); } }
      if (it.to) { if (map.has(it.to)) copy.to = map.get(it.to); else { copy.to = ""; copy.x2 = round1(e.x2 + dx); copy.y2 = round1(e.y2 + dy); } }
    }
    if (it.type === "table") copy.cells = it.cells.map((r) => r.slice());
    if (it.type === "pen") copy.points = copy.points.slice();
    return copy;
  });
}

/* apagar uma coisa solta as setas que estavam presas nela: a seta fica,
   parada onde estava, em vez de sumir junto ou apontar para o nada */
export function detachFrom(items, removedIds, boxOf) {
  const gone = removedIds instanceof Set ? removedIds : new Set(removedIds);
  return items.map((it) => {
    if (it.type !== "line" || !((it.from && gone.has(it.from)) || (it.to && gone.has(it.to)))) return it;
    const e = lineEnds(it, boxOf);
    const next = { ...it };
    if (it.from && gone.has(it.from)) { next.from = ""; next.x1 = round1(e.x1); next.y1 = round1(e.y1); }
    if (it.to && gone.has(it.to)) { next.to = ""; next.x2 = round1(e.x2); next.y2 = round1(e.y2); }
    return next;
  });
}

/* uma lista de frases vira uma grade de post-its (o "bloco") */
export function stickyGrid(texts, origin, color, makeId, size) {
  const s = size || 160, gap = 16, cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(texts.length))));
  const rows = Math.ceil(texts.length / cols);
  const x0 = origin.x - (cols * s + (cols - 1) * gap) / 2, y0 = origin.y - (rows * s + (rows - 1) * gap) / 2;
  return texts.map((text, i) => ({
    id: makeId(), type: "sticky", color,
    x: round1(x0 + (i % cols) * (s + gap)), y: round1(y0 + Math.floor(i / cols) * (s + gap)), w: s, h: s,
    text: str(text, 2000)
  }));
}

/* ---------- modelos prontos ----------
   cada modelo e uma funcao que devolve itens em volta do 0,0; quem insere
   desloca para o meio da tela. moldura com post-it dentro e o esqueleto de
   quase toda dinamica de quadro — o resto e texto e seta. */
const Y = 0, OR = 2, PK = 4, BL = 6, CY = 8, GR = 11, LM = 12, WH = 14;
function frameWith(makeId, x, y, w, h, title, stickies, color) {
  const out = [{ id: makeId(), type: "frame", x, y, w, h, title }];
  (stickies || []).forEach((text, i) => {
    out.push({ id: makeId(), type: "sticky", color, x: x + 20 + (i % 2) * 150, y: y + 24 + Math.floor(i / 2) * 150, w: 136, h: 136, text });
  });
  return out;
}
function textAt(makeId, x, y, w, text, size, bold) {
  return { id: makeId(), type: "text", x, y, w, h: Math.round((size || 18) * 1.35) + 4, text, size: size || 18, bold: !!bold, color: 0 };
}
function flowchart(makeId) {
  const a = { id: makeId(), type: "shape", shape: "oval", x: -440, y: -40, w: 150, h: 80, fill: GR, color: 0, text: "início" };
  const b = { id: makeId(), type: "shape", shape: "round", x: -230, y: -45, w: 170, h: 90, fill: FILL_THEME, color: 0, text: "etapa" };
  const c = { id: makeId(), type: "shape", shape: "diamond", x: 0, y: -70, w: 170, h: 140, fill: Y, color: 0, text: "decisão?" };
  const d = { id: makeId(), type: "shape", shape: "round", x: 260, y: -45, w: 170, h: 90, fill: FILL_THEME, color: 0, text: "se sim" };
  const e = { id: makeId(), type: "shape", shape: "round", x: 0, y: 150, w: 170, h: 90, fill: FILL_THEME, color: 0, text: "se não" };
  const f = { id: makeId(), type: "shape", shape: "oval", x: 500, y: -40, w: 150, h: 80, fill: OR + 1, color: 0, text: "fim" };
  const arrow = (from, to, kind) => ({ id: makeId(), type: "line", kind: kind || "arrow", x1: 0, y1: 0, x2: 0, y2: 0, from: from.id, to: to.id, color: 0, width: 2 });
  return [a, b, c, d, e, f, arrow(a, b), arrow(b, c), arrow(c, d), arrow(c, e, "elbow"), arrow(d, f)];
}

export const BOARD_TEMPLATES = [
  {
    id: "kanban", name: "kanban", summary: "três colunas para o trabalho andar da esquerda para a direita",
    build: (id) => [
      ...frameWith(id, -490, -260, 320, 560, "a fazer", ["primeira tarefa", "segunda tarefa"], Y),
      ...frameWith(id, -150, -260, 320, 560, "fazendo", ["em andamento"], BL),
      ...frameWith(id, 190, -260, 320, 560, "feito", [], GR)
    ]
  },
  {
    id: "swot", name: "SWOT", summary: "forças e fraquezas de dentro, oportunidades e ameaças de fora",
    build: (id) => [
      ...frameWith(id, -410, -330, 400, 320, "forças", [""], GR),
      ...frameWith(id, 10, -330, 400, 320, "fraquezas", [""], OR),
      ...frameWith(id, -410, 10, 400, 320, "oportunidades", [""], BL),
      ...frameWith(id, 10, 10, 400, 320, "ameaças", [""], PK + 1)
    ]
  },
  {
    id: "impact-effort", name: "impacto × esforço", summary: "a matriz 2×2 para decidir o que fazer primeiro",
    build: (id) => [
      ...frameWith(id, -410, -330, 400, 320, "fazer já · muito impacto, pouco esforço", [], GR),
      ...frameWith(id, 10, -330, 400, 320, "planejar · muito impacto, muito esforço", [], BL),
      ...frameWith(id, -410, 10, 400, 320, "se sobrar tempo · pouco impacto, pouco esforço", [], Y),
      ...frameWith(id, 10, 10, 400, 320, "não fazer · pouco impacto, muito esforço", [], WH),
      { id: id(), type: "line", kind: "arrow", x1: -430, y1: 350, x2: -430, y2: -350, from: "", to: "", color: 7, width: 2 },
      { id: id(), type: "line", kind: "arrow", x1: -430, y1: 350, x2: 430, y2: 350, from: "", to: "", color: 7, width: 2 },
      textAt(id, -620, -12, 170, "impacto", 18, true),
      textAt(id, -40, 366, 170, "esforço", 18, true)
    ]
  },
  {
    id: "retro", name: "retrospectiva", summary: "o que foi bem, o que pode melhorar e o que muda na próxima",
    build: (id) => [
      ...frameWith(id, -490, -260, 320, 500, "foi bem", [""], GR),
      ...frameWith(id, -150, -260, 320, 500, "pode melhorar", [""], OR),
      ...frameWith(id, 190, -260, 320, 500, "ações", [""], BL)
    ]
  },
  {
    id: "timeline", name: "linha do tempo", summary: "cinco marcos numa linha, com espaço em cima para o que acontece em cada um",
    build: (id) => {
      const out = [{ id: id(), type: "line", kind: "arrow", x1: -560, y1: 0, x2: 560, y2: 0, from: "", to: "", color: 0, width: 3 }];
      ["marco 1", "marco 2", "marco 3", "marco 4", "marco 5"].forEach((t, i) => {
        const x = -440 + i * 220;
        out.push({ id: id(), type: "shape", shape: "oval", x: x - 10, y: -10, w: 20, h: 20, fill: GR, color: 0, text: "" });
        out.push(textAt(id, x - 80, 22, 160, t, 16, true));
        out.push({ id: id(), type: "text", x: x - 80, y: 52, w: 160, h: 26, text: "data", size: 14, bold: false, color: 7 });
        out.push({ id: id(), type: "sticky", color: i % 2 ? BL : Y, x: x - 70, y: -190, w: 140, h: 140, text: "" });
      });
      return out;
    }
  },
  {
    id: "brainstorm", name: "brainstorm", summary: "a pergunta no meio e espaço em volta para as ideias",
    build: (id) => {
      const out = [{ id: id(), type: "shape", shape: "oval", x: -150, y: -80, w: 300, h: 160, fill: FILL_THEME, color: 0, text: "a pergunta" }];
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4, x = Math.cos(a) * 360, y = Math.sin(a) * 250;
        out.push({ id: id(), type: "sticky", color: [Y, OR, PK, BL, CY, GR, LM, PK + 1][i], x: Math.round(x - 70), y: Math.round(y - 70), w: 140, h: 140, text: "" });
      }
      return out;
    }
  },
  {
    id: "journey", name: "jornada do cliente", summary: "da descoberta à recomendação: o que a pessoa faz, sente e onde trava",
    build: (id) => {
      const stages = ["descoberta", "consideração", "compra", "uso", "recomendação"];
      const rows = [["faz", Y], ["sente", PK], ["trava", OR + 1], ["oportunidade", GR]];
      const out = [];
      stages.forEach((s, i) => out.push({ id: id(), type: "frame", x: -560 + i * 230, y: -330, w: 214, h: 680, title: s }));
      rows.forEach(([label, color], r) => {
        out.push(textAt(id, -760, -300 + r * 165 + 55, 180, label, 16, true));
        stages.forEach((_, i) => out.push({ id: id(), type: "sticky", color, x: -560 + i * 230 + 32, y: -300 + r * 165, w: 150, h: 150, text: "" }));
      });
      return out;
    }
  },
  {
    id: "empathy", name: "mapa de empatia", summary: "o que a pessoa pensa, ouve, vê e faz — e as dores e ganhos",
    build: (id) => [
      ...frameWith(id, -410, -400, 400, 320, "pensa e sente", [""], Y),
      ...frameWith(id, 10, -400, 400, 320, "ouve", [""], BL),
      ...frameWith(id, -410, -60, 400, 320, "vê", [""], CY),
      ...frameWith(id, 10, -60, 400, 320, "fala e faz", [""], PK),
      ...frameWith(id, -410, 280, 400, 240, "dores", [""], OR + 1),
      ...frameWith(id, 10, 280, 400, 240, "ganhos", [""], GR)
    ]
  },
  { id: "flowchart", name: "fluxograma", summary: "início, etapa, decisão e os dois caminhos, já ligados por setas", build: flowchart }
];

/* os formatos: pecas de uma vez so, maiores que uma forma e menores que um
   modelo */
export function buildFormat(kind, makeId) {
  if (kind === "table") {
    return [{
      id: makeId(), type: "table", x: -240, y: -80, w: 480, h: 160, header: true,
      cells: [["coluna 1", "coluna 2", "coluna 3"], ["", "", ""], ["", "", ""], ["", "", ""]]
    }];
  }
  if (kind === "doc") return [{ id: makeId(), type: "doc", x: -130, y: -150, w: 260, h: 300, title: "documento", text: "" }];
  if (kind === "diagram") return flowchart(makeId);
  const tpl = BOARD_TEMPLATES.find((t) => t.id === kind);
  return tpl ? tpl.build(makeId) : [];
}

/* quem acaba de nascer ainda nao esta no quadro: as setas de um modelo se
   prendem em formas do proprio modelo, e so ele sabe onde elas estao */
export function localBoxOf(items, fallback) {
  const map = new Map(items.map((it) => [it.id, it]));
  const boxOf = (id) => {
    const it = map.get(id);
    if (it) return it.type === "line" || it.type === "pen" ? null : { ...bboxOf(it, boxOf), shape: it.shape };
    return fallback ? fallback(id) : null;
  };
  return boxOf;
}

/* desloca um conjunto de itens para que o meio dele caia em `at` */
export function placeAt(items, at, fallback) {
  const boxOf = localBoxOf(items, fallback);
  const bb = unionBox(items.map((it) => bboxOf(it, boxOf)));
  if (!bb) return items;
  const dx = Math.round(at.x - (bb.x + bb.w / 2)), dy = Math.round(at.y - (bb.y + bb.h / 2));
  return items.map((it) => moveItem(it, dx, dy));
}

/* o texto de tudo o que se le no quadro — para o merlin e o assistente
   saberem o que ja esta escrito sem ler geometria */
export function itemTexts(items) {
  const out = [];
  for (const it of items) {
    if (it.type === "sticky" || it.type === "text" || it.type === "shape") { if (it.text.trim()) out.push(it.text.trim()); }
    else if (it.type === "frame" || it.type === "doc") { if (it.title.trim()) out.push(it.title.trim()); }
    else if (it.type === "table") it.cells.forEach((r) => r.forEach((c) => { if (c.trim()) out.push(c.trim()); }));
  }
  return out;
}
