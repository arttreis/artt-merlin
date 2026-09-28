/* testa o nucleo puro do quadro livre (board.js).
 *
 * o que se testa aqui e o que, errado, estraga o quadro sem aparecer na hora:
 * um item mal formado vindo da nuvem que derruba o desenho, uma seta que
 * perde a ponta quando o que ela prendia muda de lugar ou e apagado, um
 * modelo que nasce com seta solta, um traco que nao emagrece e enche o
 * documento ate o teto de 1MB do servidor.
 */
import {
  normalizeItem, normalizeItems, edgePoint, sidePoint, lineEnds, elbowPoints, linePoints, bboxOf, simplify,
  resizeBox, dragBox, marqueeHits, frameChildren, cloneItems, detachFrom, resizeTable, cellAt, cellBox,
  BOARD_TEMPLATES, buildFormat, placeAt, localBoxOf, stickyGrid, penHit, unionBox, moveItem, itemTexts,
  paintOrder, MAX_ITEMS
} from "./board.js";

let passed = 0;
const failures = [];
const check = (name, cond, detail) => { if (cond) passed++; else failures.push(name + (detail ? " -> " + detail : "")); };
const near = (a, b, eps) => Math.abs(a - b) <= (eps || 0.01);
let n = 0;
const id = () => "t" + (++n);

/* ---- forma do item ---- */
check("tipo desconhecido some", normalizeItem({ type: "video" }, id) === null);
check("lixo some", normalizeItem("oi", id) === null && normalizeItem(null, id) === null);
{
  const s = normalizeItem({ type: "sticky", x: "12", y: NaN, w: -5, color: 99, text: 42 }, id);
  check("post-it: numero vira numero", s.x === 12 && s.y === 0);
  check("post-it: tamanho tem piso", s.w >= 8);
  check("post-it: cor fora da paleta encosta no fim", s.color === 15, String(s.color));
  check("post-it: texto vira texto", s.text === "42");
  check("post-it: ganha id", !!s.id);
}
check("traco sem ponto nenhum some", normalizeItem({ type: "pen", points: [] }, id) === null);
check("traco com um ponto so fica (e um pingo)", normalizeItem({ type: "pen", points: [1, 2] }, id) !== null);
{
  const p = normalizeItem({ type: "pen", points: [1.4, 2.6, "x", 3, 5, 6] }, id);
  check("traco: pontos viram inteiros e o par invalido sai", JSON.stringify(p.points) === "[1,3,5,6]", JSON.stringify(p.points));
}
{
  const t = normalizeItem({ type: "table", cells: [["a", "b"], ["c"]] }, id);
  check("tabela: linha curta e completada", t.cells[1].length === 2 && t.cells[1][1] === "");
  const empty = normalizeItem({ type: "table" }, id);
  check("tabela vazia nasce 3x3", empty.cells.length === 3 && empty.cells[0].length === 3);
}
{
  const l = normalizeItem({ type: "line", kind: "zigue", from: 5 }, id);
  check("linha: tipo invalido vira seta", l.kind === "arrow");
  check("linha: ponta presa vira texto", l.from === "5");
}
{
  const list = normalizeItems([{ id: "a", type: "sticky" }, { id: "a", type: "text" }, { type: "nada" }], id);
  check("ids repetidos: fica o primeiro", list.length === 1 && list[0].type === "sticky");
  const many = normalizeItems(Array.from({ length: MAX_ITEMS + 50 }, () => ({ type: "sticker" })), id);
  check("quadro tem teto de itens", many.length === MAX_ITEMS);
  check("lista que nao e lista vira vazia", normalizeItems(null, id).length === 0);
}

/* ---- geometria das pontas ---- */
{
  const box = { x: 0, y: 0, w: 100, h: 50 };
  const e = edgePoint(box, { x: 500, y: 25 });
  check("borda do retangulo: direita", near(e.x, 100) && near(e.y, 25), JSON.stringify(e));
  const d = edgePoint(box, { x: 50, y: -500 });
  check("borda do retangulo: em cima", near(d.x, 50) && near(d.y, 0), JSON.stringify(d));
  const o = edgePoint({ x: 0, y: 0, w: 100, h: 100 }, { x: 150, y: 150 }, "oval");
  check("borda da oval fica no circulo", near(Math.hypot(o.x - 50, o.y - 50), 50, 0.05), JSON.stringify(o));
  const s = sidePoint(box, { x: 50, y: 400 });
  check("cotovelo sai pelo lado de baixo", near(s.x, 50) && near(s.y, 50) && s.axis === "v");
}
{
  const boxes = { a: { x: 0, y: 0, w: 100, h: 100 }, b: { x: 300, y: 0, w: 100, h: 100 } };
  const boxOf = (k) => boxes[k] || null;
  const line = normalizeItem({ type: "line", kind: "arrow", x1: 0, y1: 0, x2: 0, y2: 0, from: "a", to: "b" }, id);
  let e = lineEnds(line, boxOf);
  check("seta presa sai da borda de um e chega na do outro", e.x1 > 100 && e.x1 < 110 && e.x2 < 300 && e.x2 > 290 && near(e.y1, 50), JSON.stringify(e));
  boxes.b = { x: 0, y: 400, w: 100, h: 100 };
  e = lineEnds(line, boxOf);
  check("mover o alvo leva a ponta junto", e.y2 < 400 && e.y2 > 390 && near(e.x2, 50), JSON.stringify(e));
  delete boxes.b;
  e = lineEnds({ ...line, x2: 77, y2: 88 }, boxOf);
  check("alvo que sumiu: a ponta cai no ponto guardado", e.x2 === 77 && e.y2 === 88);
}
{
  const pts = elbowPoints({ x1: 0, y1: 0, x2: 100, y2: 50 });
  check("cotovelo horizontal dobra no meio", JSON.stringify(pts) === "[0,0,50,0,50,50,100,50]", JSON.stringify(pts));
  const mixed = elbowPoints({ x1: 0, y1: 0, x2: 100, y2: 50, axis1: "h", axis2: "v" });
  check("cotovelo de eixos diferentes dobra uma vez so", mixed.length === 6);
}

/* ---- traco ---- */
{
  const raw = [];
  for (let i = 0; i <= 100; i++) raw.push(i, i % 2 ? 0.2 : 0);
  const s = simplify(raw, 1);
  check("reta tremida vira dois pontos", s.length === 4, JSON.stringify(s));
  check("pontas da reta ficam", s[0] === 0 && s[2] === 100);
  const corner = simplify([0, 0, 50, 0, 100, 0, 100, 50, 100, 100], 1);
  check("canto nao some", corner.length === 6, JSON.stringify(corner));
  const pen = normalizeItem({ type: "pen", points: [0, 0, 100, 0], width: 4 }, id);
  check("borracha pega perto do traco", penHit(pen, 50, 5, 4));
  check("borracha nao pega longe", !penHit(pen, 50, 30, 4));
  const b = bboxOf(pen);
  check("caixa do traco conta a espessura", b.y === -2 && b.h === 4 && b.w === 104, JSON.stringify(b));
}

/* ---- redimensionar ---- */
{
  const start = { x: 0, y: 0, w: 100, h: 100 };
  const r = resizeBox(start, "se", { x: 150, y: 120 }, false);
  check("alca de baixo a direita: canto de cima fica", r.x === 0 && r.y === 0 && r.w === 150 && r.h === 120);
  const nw = resizeBox(start, "nw", { x: 20, y: 30 }, false);
  check("alca de cima a esquerda: canto de baixo fica", nw.x + nw.w === 100 && nw.y + nw.h === 100);
  const ratio = resizeBox({ x: 0, y: 0, w: 200, h: 100 }, "se", { x: 400, y: 110 }, true);
  check("proporcao guardada", near(ratio.w / ratio.h, 2), JSON.stringify(ratio));
  const tiny = resizeBox(start, "se", { x: -500, y: -500 }, false);
  check("nao vira do avesso", tiny.w >= 16 && tiny.x === 0);
  const sq = dragBox({ x: 10, y: 10 }, { x: -30, y: 90 }, true);
  check("arraste com Shift da quadrado", sq.w === sq.h && sq.w === 80, JSON.stringify(sq));
}

/* ---- selecao e molduras ---- */
{
  const items = normalizeItems([
    { id: "f", type: "frame", x: 0, y: 0, w: 400, h: 300 },
    { id: "in", type: "sticky", x: 20, y: 20, w: 100, h: 100 },
    { id: "half", type: "sticky", x: 350, y: 20, w: 100, h: 100 },
    { id: "out", type: "sticky", x: 900, y: 900, w: 100, h: 100 }
  ], id);
  const hits = marqueeHits(items, { x: 10, y: 10, w: 150, h: 150 }, () => null);
  check("retangulo dentro da moldura nao pega a moldura", hits.join() === "in", hits.join());
  const all = marqueeHits(items, { x: -10, y: -10, w: 500, h: 400 }, () => null);
  check("retangulo em volta pega a moldura", all.indexOf("f") >= 0 && all.indexOf("out") < 0);
  const kids = frameChildren(items, items[0], () => null);
  check("moldura leva so o que cabe inteiro nela", kids.join() === "in", kids.join());
  check("moldura pinta atras", paintOrder([items[1], items[0]])[0].type === "frame");
}

/* ---- copiar e apagar ---- */
{
  const items = normalizeItems([
    { id: "a", type: "shape", x: 0, y: 0, w: 100, h: 100 },
    { id: "b", type: "shape", x: 300, y: 0, w: 100, h: 100 },
    { id: "ab", type: "line", from: "a", to: "b" },
    { id: "an", type: "line", from: "a", to: "no-da-arvore", x2: 7, y2: 7 }
  ], id);
  const boxOf = localBoxOf(items, (k) => (k === "no-da-arvore" ? { x: 0, y: 500, w: 80, h: 30 } : null));
  const copies = cloneItems(items, id, 10, 10, boxOf);
  const ab = copies[2], an = copies[3];
  check("copia: seta segue presa nas copias", ab.from === copies[0].id && ab.to === copies[1].id);
  check("copia: ids novos", copies.every((c, i) => c.id !== items[i].id));
  check("copia: ponta presa em algo que nao foi junto vira solta no lugar", an.to === "" && an.y2 > 480, JSON.stringify(an));
  check("copia anda junto", copies[0].x === 10 && copies[0].y === 10);
  const after = detachFrom(items.filter((it) => it.id !== "b"), ["b"], boxOf);
  const loose = after.find((it) => it.id === "ab");
  check("apagar solta a seta no ponto onde ela chegava", loose.to === "" && loose.x2 > 290 && loose.x2 < 300, JSON.stringify(loose));
  check("apagar nao mexe no resto", after.find((it) => it.id === "an").to === "no-da-arvore");
  const moved = moveItem(items[2], 50, 50);
  check("mover seta presa nao solta as pontas", moved.from === "a" && moved.to === "b");
}

/* ---- tabela ---- */
{
  const t = normalizeItem({ type: "table", x: 0, y: 0, w: 300, h: 90, cells: [["a", "b", "c"], ["d", "e", "f"], ["", "", ""]] }, id);
  const bigger = resizeTable(t, 1, 1);
  check("tabela cresce do tamanho de uma celula", bigger.w === 400 && bigger.h === 120, bigger.w + "x" + bigger.h);
  check("tabela guarda o que estava escrito", bigger.cells[1][2] === "f" && bigger.cells[3][3] === "");
  const smaller = resizeTable(t, -5, 0);
  check("tabela nunca fica sem linha", smaller.cells.length === 1);
  check("clique cai na celula certa", JSON.stringify(cellAt(t, 150, 45)) === "[1,1]");
  check("clique fora nao e celula", cellAt(t, -1, 10) === null);
  const cb = cellBox(t, 2, 2);
  check("caixa da celula", cb.x === 200 && cb.y === 60 && cb.w === 100 && cb.h === 30);
}

/* ---- modelos ---- */
for (const tpl of BOARD_TEMPLATES) {
  const list = normalizeItems(tpl.build(id), id);
  check("modelo " + tpl.id + " nasce inteiro", list.length > 0 && list.length === tpl.build(id).length);
  const ids = new Set(list.map((it) => it.id));
  const dangling = list.filter((it) => it.type === "line" && ((it.from && !ids.has(it.from)) || (it.to && !ids.has(it.to))));
  check("modelo " + tpl.id + " sem seta presa no nada", !dangling.length);
}
{
  const flow = normalizeItems(buildFormat("diagram", id), id);
  const placed = placeAt(flow, { x: 1000, y: 1000 });
  const bb = unionBox(placed.map((it) => bboxOf(it, localBoxOf(placed))));
  check("modelo cai centrado onde foi pedido", near(bb.x + bb.w / 2, 1000, 1) && near(bb.y + bb.h / 2, 1000, 1), JSON.stringify(bb));
  const pts = linePoints(placed.find((it) => it.type === "line"), localBoxOf(placed));
  check("setas do fluxograma ligam formas de verdade", pts.every(Number.isFinite) && Math.abs(pts[0] - 1000) < 800);
  check("formato desconhecido nao cria nada", buildFormat("nada", id).length === 0);
}
{
  const g = stickyGrid(["a", "b", "c", "d", "e"], { x: 0, y: 0 }, 3, id);
  check("bloco: um post-it por linha", g.length === 5 && g.every((s) => s.type === "sticky" && s.color === 3));
  const bb = unionBox(g.map((it) => bboxOf(it)));
  check("bloco: grade centrada no ponto", near(bb.x + bb.w / 2, 0, 1) && near(bb.y + bb.h / 2, 0, 1), JSON.stringify(bb));
  check("textos do quadro para o merlin", itemTexts(normalizeItems([{ type: "sticky", text: " oi " }, { type: "frame", title: "col" }, { type: "pen", points: [0, 0] }], id)).join() === "oi,col");
}

if (failures.length) {
  console.error("board: " + failures.length + " falha(s):\n - " + failures.join("\n - "));
  process.exit(1);
}
console.log("board: " + passed + " verificações ok");
