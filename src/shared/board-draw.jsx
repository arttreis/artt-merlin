/* merlin · o desenho do quadro livre
   o que o board.js descreve, pintado em svg. mora separado da arvore
   (map-draw) pelo mesmo motivo que ela mora separada do editor: o link
   compartilhado pinta o quadro com estas mesmas funcoes, e duas copias do
   desenho divergiriam na primeira mudanca.

   tudo e svg de verdade — nada de foreignObject. o png exportado passa por
   um <canvas>, e foreignObject suja o canvas em mais de um navegador; texto
   em <text>, quebrado aqui com a medida do proprio canvas, sai igual na tela
   e no arquivo. */
import {
  STICKY_COLORS, stickyInk, inkOf, fillOf, fillInk, FILL_NONE,
  shapePath, shapeTextBox, linePoints, penPath, bboxOf, tableSize, paintOrder
} from "./board.js";

const FONT = "Sora, system-ui, sans-serif";
const measureCtx = document.createElement("canvas").getContext("2d");

/* ---------- medir e quebrar texto ----------
   quebra por palavra; palavra maior que a linha e quebrada por letra (um
   link colado num post-it nao pode vazar da folha). \n do usuario e quebra
   de verdade. */
function wrap(text, maxW) {
  const out = [];
  String(text).split("\n").forEach((para) => {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); return; }
    let cur = "";
    for (let w of words) {
      while (measureCtx.measureText(w).width > maxW && w.length > 1) {
        let k = w.length - 1;
        while (k > 1 && measureCtx.measureText(w.slice(0, k)).width > maxW) k--;
        if (cur) { out.push(cur); cur = ""; }
        out.push(w.slice(0, k));
        w = w.slice(k);
      }
      const attempt = cur ? cur + " " + w : w;
      if (!cur || measureCtx.measureText(attempt).width <= maxW) cur = attempt;
      else { out.push(cur); cur = w; }
    }
    out.push(cur);
  });
  return out;
}
const cache = new Map();
function remember(key, make) {
  let v = cache.get(key);
  if (v) return v;
  if (cache.size > 3000) cache.clear();
  v = make();
  cache.set(key, v);
  return v;
}
export const LINE_RATIO = 1.3;

/* o texto a um tamanho fixo, quebrado na largura */
export function layoutText(text, size, maxW, weight) {
  return remember("t|" + size + "|" + weight + "|" + Math.round(maxW) + "|" + text, () => {
    measureCtx.font = (weight || 500) + " " + size + "px " + FONT;
    return { size, lines: wrap(text, Math.max(10, maxW)), lh: size * LINE_RATIO };
  });
}
/* o maior tamanho em que o texto inteiro cabe na caixa — e o que o post-it
   faz: pouco texto sai grande, muito texto encolhe. abaixo do piso corta com
   reticencias em vez de vazar. */
const SIZES = [64, 48, 40, 34, 28, 24, 20, 18, 16, 14, 12, 10, 8];
export function fitText(text, w, h, maxSize, weight) {
  return remember("f|" + maxSize + "|" + weight + "|" + Math.round(w) + "|" + Math.round(h) + "|" + text, () => {
    const sizes = SIZES.filter((s) => s <= maxSize);
    for (const size of sizes) {
      const t = layoutText(text, size, w, weight);
      if (t.lines.length * t.lh <= h) return t;
    }
    const size = sizes[sizes.length - 1] || 8;
    const t = layoutText(text, size, w, weight);
    const max = Math.max(1, Math.floor(h / t.lh));
    if (t.lines.length <= max) return t;
    const lines = t.lines.slice(0, max);
    lines[max - 1] = lines[max - 1].replace(/.{0,2}$/, "") + "…";
    return { ...t, lines };
  });
}
/* a altura que um texto livre ocupa na largura dele: e o que vai para o `h`
   gravado, que e com o que a selecao e o toque trabalham */
export function textItemHeight(it) {
  const t = layoutText(it.text || " ", it.size, it.w, it.bold ? 700 : 500);
  return Math.max(t.lh, t.lines.length * t.lh) + 4;
}

function lines(t, x, y, anchor, fill, weight, key) {
  return t.lines.map((l, i) => (
    <text key={(key || "l") + i} x={x} y={(y + i * t.lh + t.size * 0.95).toFixed(1)} textAnchor={anchor} fontFamily={FONT}
      fontSize={t.size} fontWeight={weight} fill={fill} pointerEvents="none">{l}</text>
  ));
}
/* bloco de texto centrado na vertical e na horizontal dentro de uma caixa */
function centered(t, b, fill, weight) {
  const total = t.lines.length * t.lh;
  return lines(t, b.x + b.w / 2, b.y + (b.h - total) / 2, "middle", fill, weight);
}

/* ---------- cada tipo ---------- */
function arrowHead(x, y, fromX, fromY, width, color, key) {
  const a = Math.atan2(y - fromY, x - fromX), len = 8 + width * 2.2, spread = 0.45;
  const p = (ang) => (x - Math.cos(ang) * len).toFixed(1) + " " + (y - Math.sin(ang) * len).toFixed(1);
  return <path key={key} d={"M" + x.toFixed(1) + " " + y.toFixed(1) + "L" + p(a - spread) + "L" + p(a + spread) + "Z"} fill={color} stroke={color} strokeWidth="1" strokeLinejoin="round" pointerEvents="none" />;
}

function drawLine(it, boxOf, hideText) {
  const pts = linePoints(it, boxOf), n = pts.length;
  const color = inkOf(it.color);
  const d = "M" + pts.slice(0, 2).join(" ") + pts.slice(2).reduce((s, v, i) => s + (i % 2 ? " " : "L") + v, "");
  const out = [
    <path key="hit" d={d} fill="none" stroke="transparent" strokeWidth={Math.max(14, it.width + 10)} pointerEvents="stroke" />,
    <path key="ln" d={d} fill="none" stroke={color} strokeWidth={it.width} strokeDasharray={it.dash ? (it.width * 3) + " " + (it.width * 2.5) : null} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
  ];
  if (it.kind === "arrow" || it.kind === "elbow" || it.kind === "double") out.push(arrowHead(pts[n - 2], pts[n - 1], pts[n - 4], pts[n - 3], it.width, color, "h2"));
  if (it.kind === "double") out.push(arrowHead(pts[0], pts[1], pts[2], pts[3], it.width, color, "h1"));
  if (it.text && !hideText) {
    /* o rotulo senta no meio do caminho, num fundo da cor da tela */
    const mid = Math.floor(n / 4) * 2;
    const mx = n === 4 ? (pts[0] + pts[2]) / 2 : (pts[mid] + pts[mid + 2]) / 2, my = n === 4 ? (pts[1] + pts[3]) / 2 : (pts[mid + 1] + pts[mid + 3]) / 2;
    const t = layoutText(it.text, 13, 180, 500);
    const w = Math.max(...t.lines.map((l) => { measureCtx.font = "500 13px " + FONT; return measureCtx.measureText(l).width; })) + 12;
    const h = t.lines.length * t.lh + 6;
    out.push(<rect key="lb" x={mx - w / 2} y={my - h / 2} width={w} height={h} rx="4" fill="var(--mp-canvas)" pointerEvents="none" />);
    out.push(...lines(t, mx, my - h / 2 + 3, "middle", color, 500, "lt"));
  }
  return out;
}

function drawSticky(it, hideText) {
  const pad = Math.max(8, it.w * 0.08);
  const ink = stickyInk(it.color);
  const t = !hideText && it.text ? fitText(it.text, it.w - pad * 2, it.h - pad * 2, Math.max(12, Math.round(it.w / 6)), 500) : null;
  return [
    <rect key="sh" x={1.5} y={3.5} width={it.w} height={it.h} rx="3" fill="#000" opacity=".16" pointerEvents="none" />,
    <rect key="bg" width={it.w} height={it.h} rx="3" fill={STICKY_COLORS[it.color] || STICKY_COLORS[0]} />,
    t && centered(t, { x: pad, y: pad, w: it.w - pad * 2, h: it.h - pad * 2 }, ink, 500)
  ];
}

function drawShape(it, hideText) {
  const fill = fillOf(it.fill);
  const tb = shapeTextBox(it.shape, it.w, it.h);
  const t = !hideText && it.text ? fitText(it.text, tb.w, tb.h, 20, 500) : null;
  return [
    <path key="sh" d={shapePath(it.shape, it.w, it.h)} fill={fill === "none" ? "transparent" : fill}
      stroke={inkOf(it.color)} strokeWidth={it.fill === FILL_NONE ? 2 : 1.5} strokeLinejoin="round" />,
    t && centered(t, tb, fillInk(it.fill), 500)
  ];
}

function drawText(it, hideText) {
  const weight = it.bold ? 700 : 500;
  const t = layoutText(it.text || "", it.size, it.w, weight);
  return [
    <rect key="hit" width={it.w} height={it.h} fill="transparent" />,
    !hideText && (it.text ? lines(t, 0, 2, "start", inkOf(it.color), weight)
      : <text key="ph" x="0" y={it.size} fontFamily={FONT} fontSize={it.size} fill="var(--ink-30)" pointerEvents="none">texto</text>)
  ];
}

function drawFrame(it, hideText) {
  return [
    <rect key="bg" width={it.w} height={it.h} rx="6" fill="var(--mp-frame)" stroke="var(--mp-frame-line)" strokeWidth="1" pointerEvents="none" />,
    /* so a borda e o titulo pegam o clique: o miolo e da tela, para a selecao
       em retangulo e o arraste funcionarem dentro da moldura */
    <rect key="edge" width={it.w} height={it.h} rx="6" fill="none" stroke="transparent" strokeWidth="12" pointerEvents="stroke" />,
    <text key="tt" x="2" y="-9" fontFamily={FONT} fontSize="13" fontWeight="600" fill="var(--ink-50)" data-frame-title="1">
      {hideText ? "" : it.title || "moldura"}</text>
  ];
}

function drawSticker(it) {
  return [
    <rect key="hit" width={it.w} height={it.h} fill="transparent" />,
    <text key="em" x={it.w / 2} y={it.h * 0.84} textAnchor="middle" fontSize={it.h * 0.82} pointerEvents="none"
      fontFamily="'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif">{it.emoji}</text>
  ];
}

function drawTable(it, hideCell) {
  const { rows, cols } = tableSize(it);
  const cw = it.w / cols, ch = it.h / rows;
  const out = [<rect key="bg" width={it.w} height={it.h} rx="4" fill="var(--mp-pill)" stroke="var(--mp-edge)" strokeWidth="1" />];
  if (it.header) out.push(<rect key="hd" width={it.w} height={ch} rx="4" fill="var(--mp-table-head)" pointerEvents="none" />);
  for (let r = 1; r < rows; r++) out.push(<line key={"r" + r} x1="0" x2={it.w} y1={r * ch} y2={r * ch} stroke="var(--mp-edge)" strokeWidth="1" pointerEvents="none" />);
  for (let c = 1; c < cols; c++) out.push(<line key={"c" + c} y1="0" y2={it.h} x1={c * cw} x2={c * cw} stroke="var(--mp-edge)" strokeWidth="1" pointerEvents="none" />);
  it.cells.forEach((row, r) => row.forEach((text, c) => {
    if (!text || (hideCell && hideCell[0] === r && hideCell[1] === c)) return;
    const weight = it.header && r === 0 ? 700 : 500;
    const t = fitText(text, cw - 16, ch - 8, 14, weight);
    const total = t.lines.length * t.lh;
    out.push(...lines(t, c * cw + 8, r * ch + (ch - total) / 2, "start", "var(--mp-pill-ink)", weight, "t" + r + "-" + c + "-"));
  }));
  return out;
}

/* o documento no quadro e um cartao: titulo e o comeco do texto. ler e
   escrever acontece no painel — um cartao nao e lugar para um texto longo. */
const plain = (md) => String(md || "").replace(/[#>*_`~\[\]]/g, "").replace(/\(([^)]*)\)/g, "").replace(/^\s*[-+]\s+/gm, "· ");
function drawDoc(it) {
  const t = layoutText(it.title || "documento", 15, it.w - 32, 700);
  const titleLines = t.lines.slice(0, 2);
  const top = 46 + titleLines.length * t.lh;
  const body = layoutText(plain(it.text) || "vazio — clique duas vezes para escrever", 12, it.w - 32, 500);
  const max = Math.max(0, Math.floor((it.h - top - 14) / body.lh));
  const bodyLines = body.lines.slice(0, max);
  if (body.lines.length > max && max) bodyLines[max - 1] = bodyLines[max - 1].replace(/.{0,2}$/, "") + "…";
  return [
    <rect key="sh" x="1.5" y="3.5" width={it.w} height={it.h} rx="10" fill="#000" opacity=".14" pointerEvents="none" />,
    <rect key="bg" width={it.w} height={it.h} rx="10" fill="var(--mp-pill)" stroke="var(--mp-pill-border)" strokeWidth="1" />,
    <path key="ic" transform="translate(16 16)" d="M2 0h9l5 5v13a2 2 0 01-2 2H2a2 2 0 01-2-2V2a2 2 0 012-2zM11 0v5h5M4 10h8M4 14h6" fill="none" stroke="var(--green-ink)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />,
    ...lines({ ...t, lines: titleLines }, 16, 44, "start", "var(--mp-pill-ink)", 700, "tt"),
    ...lines({ ...body, lines: bodyLines }, 16, top, "start", it.text ? "var(--ink-50)" : "var(--ink-30)", 500, "bd")
  ];
}

function drawPen(it) {
  const d = penPath(it.points);
  return [
    <path key="hit" d={d} fill="none" stroke="transparent" strokeWidth={Math.max(12, it.width + 8)} strokeLinecap="round" pointerEvents="stroke" />,
    <path key="pn" d={d} fill="none" stroke={inkOf(it.color)} strokeWidth={it.width} opacity={it.alpha < 1 ? it.alpha : null} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
  ];
}

/* um item. `editing` esconde o texto que esta sendo editado por cima (o
   campo de edicao ocupa o lugar dele); `ghost` e a proposta do merlin. */
export function svgItem(it, boxOf, opts) {
  const o = opts || {};
  const hide = o.editing && o.editing.id === it.id;
  const cls = "bd-item bd-" + it.type + (o.ghost ? " bd-item--ghost" : "") + (o.dragged ? " bd-item--dragged" : "");
  const dataset = o.ghost ? { "data-ghost-item": it.id } : { "data-item": it.id };
  if (it.type === "line") return <g key={it.id} className={cls} {...dataset}>{drawLine(it, boxOf, hide)}</g>;
  if (it.type === "pen") return <g key={it.id} className={cls} {...dataset}>{drawPen(it)}</g>;
  let body;
  if (it.type === "sticky") body = drawSticky(it, hide);
  else if (it.type === "shape") body = drawShape(it, hide);
  else if (it.type === "text") body = drawText(it, hide);
  else if (it.type === "frame") body = drawFrame(it, hide);
  else if (it.type === "sticker") body = drawSticker(it);
  else if (it.type === "table") body = drawTable(it, hide ? o.editing.cell : null);
  else if (it.type === "doc") body = drawDoc(it);
  else return null;
  return (
    <g key={it.id} className={cls} {...dataset} transform={"translate(" + it.x + "," + it.y + ")"}>
      {body}
      {o.ghost && <rect width={it.w} height={it.h} rx="3" fill="none" stroke="var(--green-ink)" strokeWidth="1.5" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
    </g>
  );
}

/* o quadro em duas camadas: molduras vao atras da arvore, o resto na frente */
export function svgBoardLayers(items, boxOf, opts) {
  const o = opts || {};
  const back = [], front = [];
  paintOrder(items).forEach((it) => {
    const el = svgItem(it, boxOf, { editing: o.editing, dragged: o.dragged && o.dragged.has(it.id) });
    (it.type === "frame" ? back : front).push(el);
  });
  (o.ghosts || []).forEach((it) => front.push(svgItem(it, boxOf, { ghost: true })));
  return { back, front };
}

/* ---------- selecao ----------
   a moldura verde e as alcas tem espessura de tela, nao de mundo: `unit` e
   quanto vale um pixel no zoom atual. */
const HANDLES = ["nw", "ne", "sw", "se"];
export function svgSelection(items, selected, boxOf, unit, extra) {
  const out = [];
  const list = items.filter((it) => selected.has(it.id));
  const single = list.length === 1 ? list[0] : null;
  const pad = 4 * unit, hs = 9 * unit;
  list.forEach((it) => {
    if (it.type === "line") return;
    const b = bboxOf(it, boxOf);
    out.push(<rect key={"s" + it.id} x={b.x - pad} y={b.y - pad} width={b.w + pad * 2} height={b.h + pad * 2} rx={2 * unit} fill="none"
      stroke="var(--green-ink)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" pointerEvents="none" />);
  });
  if (single && single.type === "line") {
    const pts = linePoints(single, boxOf), n = pts.length;
    const d = "M" + pts.slice(0, 2).join(" ") + pts.slice(2).reduce((s, v, i) => s + (i % 2 ? " " : "L") + v, "");
    out.push(<path key="ls" d={d} fill="none" stroke="var(--green-ink)" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />);
    [["p1", pts[0], pts[1], single.from], ["p2", pts[n - 2], pts[n - 1], single.to]].forEach(([h, x, y, attached]) => {
      out.push(<circle key={h} data-handle={h} cx={x} cy={y} r={6 * unit} fill={attached ? "var(--green)" : "var(--surface)"} stroke="var(--green-ink)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="bd-handle" />);
    });
  } else if (single && single.type !== "pen") {
    const b = bboxOf(single, boxOf);
    HANDLES.forEach((h) => {
      const x = h.indexOf("w") >= 0 ? b.x - pad : b.x + b.w + pad, y = h.indexOf("n") >= 0 ? b.y - pad : b.y + b.h + pad;
      out.push(<rect key={h} data-handle={h} className={"bd-handle bd-handle--" + h} x={x - hs / 2} y={y - hs / 2} width={hs} height={hs} rx={2 * unit}
        fill="var(--surface)" stroke="var(--green-ink)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />);
    });
  } else if (list.length > 1) {
    let bb = null;
    list.forEach((it) => {
      const b = bboxOf(it, boxOf);
      bb = bb ? { x: Math.min(bb.x, b.x), y: Math.min(bb.y, b.y), x2: Math.max(bb.x2, b.x + b.w), y2: Math.max(bb.y2, b.y + b.h) } : { x: b.x, y: b.y, x2: b.x + b.w, y2: b.y + b.h };
    });
    out.push(<rect key="grp" x={bb.x - pad * 2} y={bb.y - pad * 2} width={bb.x2 - bb.x + pad * 4} height={bb.y2 - bb.y + pad * 4} fill="none"
      stroke="var(--green-ink)" strokeWidth="1" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />);
  }
  const e = extra || {};
  if (e.snap) {
    const b = e.snap;
    out.push(<rect key="snap" x={b.x - 6 * unit} y={b.y - 6 * unit} width={b.w + 12 * unit} height={b.h + 12 * unit} rx={6 * unit} fill="none"
      stroke="var(--green)" strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />);
  }
  if (e.marquee) {
    const m = e.marquee;
    out.push(<rect key="mq" x={m.x} y={m.y} width={m.w} height={m.h} fill="var(--green)" fillOpacity=".08" stroke="var(--green-ink)" strokeWidth="1" vectorEffect="non-scaling-stroke" pointerEvents="none" />);
  }
  return out;
}
