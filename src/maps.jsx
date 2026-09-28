/* merlin · mapas mentais
   lista de mapas e um editor com layout automatico, teclado, arrasto e zoom. */
import "./shared/base.css";
import "./maps.css";
import { initPage, newId, notify, sendToDay, api, collection, clientName, setPageContext } from "./shared/core.js";
import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  mount, useCollection, useClients, useHash, useKeydown, isTyping, useFields,
  Form, Field, Dialog, Markdown, EmptyStart, MapThumb, ShareDialog, icon
} from "./shared/ui.jsx";
import { NAV_ICONS } from "./shared/icons.jsx";
import { MAP_TEMPLATES, mapGroups, mapBranches, mapShape, mapSize, buildMap } from "./shared/templates.js";
import { parseMermaid, toMermaid } from "./shared/mermaid.js";
/* o layout e o desenho moram no map-draw: a pagina publica pinta o mesmo mapa */
import { computeLayout, colorVar, svgNode, svgEdgesOf, svgSiblingIndicator, svgGhost, svgGrid, countNodes, collectIds } from "./shared/map-draw.jsx";
/* o quadro livre em volta da arvore: o modelo e a geometria no board.js, o
   desenho no board-draw, e as pecas de tela (barra, menus, campos) ao lado */
import {
  normalizeItems, normalizeItem, bboxOf, unionBox, moveItem, resizeBox, dragBox, simplify, penHit, marqueeHits,
  frameChildren, DEFAULT_SIZE, TEXT_SIZES, FILL_THEME, detachFrom, cloneItems, stickyGrid, buildFormat, placeAt,
  resizeTable, cellAt, tableSize, itemTexts, paintOrder, localBoxOf
} from "./shared/board.js";
import { svgBoardLayers, svgSelection, textItemHeight } from "./shared/board-draw.jsx";
import { BoardToolbar, ItemBar, ItemEditor, DocPanel, TemplatesDialog, BulkDialog } from "./maps-board.jsx";

initPage("maps");

/* ---------- forma do documento ----------
   raiz e cada filho tem sempre a mesma forma. quem cria um mapa de fora
   (notes.html, por exemplo) so precisa acertar {title}; o resto nasce
   aqui — e por isso "abrir por hash" funciona mesmo com um doc incompleto. */
function normalizeNode(raw) {
  const n = raw && typeof raw === "object" ? raw : {};
  return {
    id: n.id ? String(n.id) : newId(),
    title: String(n.title || "").slice(0, 300),
    note: String(n.note || ""),
    color: Number.isFinite(+n.color) && +n.color >= 0 && +n.color <= 6 ? Math.round(+n.color) : 0,
    collapsed: !!n.collapsed,
    link: String(n.link || "").slice(0, 500),
    children: Array.isArray(n.children) ? n.children.map(normalizeNode) : []
  };
}
function normalize(d) {
  return {
    id: d.id,
    name: String(d.name || "").slice(0, 120) || "mapa sem nome",
    root: normalizeNode(d.root && (d.root.title || d.root.children || d.root.id) ? d.root : { title: d.name || "ideia central" }),
    items: normalizeItems(d.items, newId),
    client: d.client || "",
    idea: d.idea || "",
    funnel: d.funnel || "",
    createdAt: +d.createdAt || Date.now(),
    updatedAt: +d.updatedAt || Date.now()
  };
}

/* ---------- utilidades de arvore ---------- */
function findNode(current, id, parent, index) {
  if (current.id === id) return { node: current, parent: parent || null, index: index == null ? -1 : index };
  const children = current.children || [];
  for (let i = 0; i < children.length; i++) {
    const r = findNode(children[i], id, current, i);
    if (r) return r;
  }
  return null;
}
function newNode(title) { return { id: newId(), title: title || "", note: "", color: 0, collapsed: false, link: "", children: [] }; }

/* ---------- ramos fantasma ----------
   o que o merlin propos, desenhado no proprio mapa em vez de numa lista de
   caixinhas: cada ramo aparece no lugar exato onde ele nasceria, tracejado
   e apagado, e um clique nele o torna real — os outros somem junto, porque
   quem nao foi clicado nao era para existir.
   o fantasma nunca entra no documento. ele vive so na arvore que vai para
   o computeLayout, o que da tres coisas de graca: o layout ja reserva o
   espaco dele (nada pula quando um vira real), ele nao grava, e nao entra
   no desfazer. o id com prefixo e o que separa os dois mundos: findNode
   nunca acha um fantasma, entao nada que mexe no documento o alcanca. */
const GHOST_PREFIX = "ghost:";
const isGhostId = (id) => typeof id === "string" && id.indexOf(GHOST_PREFIX) === 0;
function withGhosts(root, targetId, list) {
  if (!list || !list.length || !targetId) return root;
  function walk(node) {
    if (node.id === targetId) {
      const extra = list.map((s, i) => ({
        id: GHOST_PREFIX + i, title: String(s.title || "").slice(0, 300), note: String(s.note || ""),
        color: 0, collapsed: false, link: "", children: [], ghost: true
      }));
      return { ...node, collapsed: false, children: [...(node.children || []), ...extra] };
    }
    const children = node.children || [];
    let changed = false;
    const next = children.map((c) => { const r = walk(c); if (r !== c) changed = true; return r; });
    return changed ? { ...node, children: next } : node;
  }
  return walk(root);
}
const cloneDoc = (d) => JSON.parse(JSON.stringify(d));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function relativeTime(ms) {
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return min + "min";
  const h = Math.floor(min / 60);
  if (h < 24) return h + "h";
  const d = Math.floor(h / 24);
  if (d < 30) return d + "d";
  const m = Math.floor(d / 30);
  if (m < 12) return m + "m";
  return Math.floor(m / 12) + "a";
}

/* ---------- viewBox (pan/zoom), guardado por mapa ---------- */
const viewKey = (id) => "merlin:maps:view:" + id;
function loadView(id) {
  try {
    const v = JSON.parse(localStorage.getItem(viewKey(id)));
    if (v && Number.isFinite(v.w) && Number.isFinite(v.h)) return v;
  } catch (e) {}
  return null;
}

/* ---------- o motor do desenho ----------
   e a parte imperativa do mapa, embrulhada num objeto criado uma vez por
   editor aberto: guarda a viewBox, o layout que esta na tela, o arraste em
   curso e a animacao. a tela (React) so chama update() quando o documento
   ou a selecao mudam; o resto (ponteiro, roda, pinca) acontece aqui dentro,
   sem passar por estado de componente — o mapa tem que responder na hora.
   o que precisa mudar o documento sai por `handlers` (sempre o atual). */
function createMapEngine(mapId, handlers) {
  const savedView = loadView(mapId);
  let view = savedView || { x: -420, y: -300, w: 840, h: 600 };
  let firstDraw = true;
  let svgEl = null, hintEl = null, root = null, committing = false;
  let layout = new Map(), selectedId = null, rootId = null, editing = false;
  /* arrastar: o no que esta sendo arrastado, onde o fantasma esta, e o alvo
     calculado a cada movimento — {type:"child", id} solta em cima de um no,
     {type:"sibling", id, before} solta na fenda ao lado de um irmao. */
  let drag = null; // { id, pos:{x,y}, offset:{x,y}, target, descendants:Set }
  let drawn = null, tweenRaf = 0, rafPending = false, pendingFrame = null;
  let mode = null, pendingId = null, pointerOrigin = null, panOriginView = null, movedEnough = false;
  let initialTarget = null, lastPointer = null, autoPanRaf = 0, lastDownId = null;
  let pinchDist = null, pinchStartView = null;
  /* o quadro livre: os itens como estao no documento, a copia viva durante
     um gesto (arrastar, redimensionar, desenhar — so vira documento no
     soltar, num passo so do desfazer), a selecao, a ferramenta armada e o
     gesto em curso. */
  let items = [], live = null, itemSel = new Set(), ghostItems = [], tool = { name: "select" }, editingItem = null;
  let op = null, itemIndex = new Map(), spaceHeld = false, spacePanned = false, pendingBox = null;
  let pendingItem = null, lastDownItem = null, lastDownPoint = null;
  const viewListeners = new Set();
  const call = (name, ...args) => handlers.current[name](...args);

  /* a caixa de qualquer coisa em que uma seta pode se prender: item do
     quadro ou no da arvore. linha e traco nao recebem ponta (e isso que
     impede uma seta presa em outra seta de dar volta infinita aqui). */
  function boxOf(id) {
    const it = itemIndex.get(id);
    if (it) {
      if (it.type === "line" || it.type === "pen") return null;
      const b = bboxOf(it, boxOf);
      return it.type === "shape" ? { ...b, shape: it.shape } : b;
    }
    const info = layout.get(id);
    return info ? { x: info.x - info.w / 2, y: info.y - info.h / 2, w: info.w, h: info.h } : null;
  }
  function indexItems() { itemIndex = new Map(); (live || items).forEach((it) => itemIndex.set(it.id, it)); }
  function setLive(next) { live = next; indexItems(); }
  /* quanto vale um pixel da tela em unidades do mundo, no zoom de agora */
  function unitNow() { const r = svgEl ? svgEl.getBoundingClientRect() : null; return view.w / ((r && r.width) || 1); }
  /* onde uma ponta de seta se prenderia: o item mais de cima sob o ponto
     (moldura nao conta — desenhar uma seta dentro dela nao pode grudar
     nela), senao um no da arvore */
  function attachAt(p, exclude) {
    const list = paintOrder(live || items);
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i];
      if (it.id === exclude || it.type === "line" || it.type === "pen" || it.type === "frame" || String(it.id).indexOf("draft") === 0) continue;
      const b = bboxOf(it, boxOf);
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return it.id;
    }
    const n = nodeAt(p.x, p.y);
    return n && n !== exclude ? n : "";
  }

  /* ---- viewBox ---- */
  function saveView() { try { localStorage.setItem(viewKey(mapId), JSON.stringify(view)); } catch (e) {} }
  /* a grade some quando o zoom esta longe demais — viraria um cinza chapado */
  function applyGrid() { const g = svgEl && svgEl.querySelector("#mp-grid-bg"); if (g) g.style.opacity = view.w > 2400 ? "0" : "1"; }
  function applyView() {
    if (!svgEl) return;
    svgEl.setAttribute("viewBox", view.x + " " + view.y + " " + view.w + " " + view.h);
    applyGrid(); saveView();
    /* a barra da selecao e o campo de escrever seguem o quadro; as alcas
       tem tamanho de tela, entao mudam com o zoom */
    viewListeners.forEach((f) => f());
    if (itemSel.size) scheduleDraw();
  }
  /* usada tanto pelo Ctrl+0 (enquadra tudo) quanto por frameNode (enquadra
     so um ramo, depois que o merlin acrescenta sugestoes nele). */
  function fit(minX, minY, maxX, maxY) {
    const margin = 40;
    const bboxW = Math.max(1, maxX - minX), bboxH = Math.max(1, maxY - minY);
    const rect = svgEl.getBoundingClientRect();
    const availW = rect.width || 1000, availH = rect.height || 700;
    /* a viewBox tem sempre a mesma proporcao do container (nunca a bounding
       box esticada, senao o texto sai de escala em um eixo) e a escala nunca
       passa de 1: um mapa pequeno fica do tamanho natural (13px de verdade),
       nao esticado para preencher a tela — so encolhe quando nao cabe. */
    /* o enquadrar tem piso: numa tela estreita, caber o mapa inteiro deixava o
       rotulo do tamanho de um risco e o no menor que o dedo. abaixo do piso o
       mapa comeca no meio (a raiz) e o resto se le arrastando. */
    const floor = availW < 700 ? 0.5 : 0.12;
    const scale = Math.max(floor, Math.min(1, (availW - margin * 2) / bboxW, (availH - margin * 2) / bboxH));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const w = availW / scale, h = availH / scale;
    view = { x: cx - w / 2, y: cy - h / 2, w, h };
    applyView();
  }
  function bounds(filter) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, any = false;
    layout.forEach((info, id) => {
      if (filter && !filter(id)) return;
      any = true;
      minX = Math.min(minX, info.x - info.w / 2); maxX = Math.max(maxX, info.x + info.w / 2);
      minY = Math.min(minY, info.y - info.h / 2); maxY = Math.max(maxY, info.y + info.h / 2);
    });
    if (!filter) items.forEach((it) => {
      const b = bboxOf(it, boxOf);
      any = true;
      minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x + b.w);
      minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y + b.h);
    });
    return any ? [minX, minY, maxX, maxY] : null;
  }
  /* enquadra uma caixa do mundo — o que um modelo acabou de largar */
  function frameBox(b) { if (svgEl && b) fit(b.x, b.y, b.x + b.w, b.y + b.h); }
  function frame() {
    if (!svgEl || !layout.size) return;
    fit.apply(null, bounds());
  }
  /* enquadra so um no e a subarvore dele — usado depois de adicionar ramos
     sugeridos, para nao perder o zoom no meio de um mapa grande so porque o
     Ctrl+0 enquadraria tudo de novo. */
  function frameNode(id) {
    if (!svgEl) return;
    const info = layout.get(id);
    if (!info) { frame(); return; }
    const ids = new Set(); collectIds(info.node, ids);
    const b = bounds((nid) => ids.has(nid));
    if (!b) { frame(); return; }
    fit.apply(null, b);
  }
  function zoomAt(factor, clientX, clientY) {
    const rect = svgEl.getBoundingClientRect();
    const relX = (clientX - rect.left) / rect.width, relY = (clientY - rect.top) / rect.height;
    const px = view.x + relX * view.w, py = view.y + relY * view.h;
    const newW = clamp(view.w * factor, 120, 12000);
    const realScale = newW / view.w;
    view.w = newW; view.h = view.h * realScale;
    view.x = px - relX * view.w; view.y = py - relY * view.h;
    applyView();
  }
  function zoomCenter(factor) {
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    zoomAt(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
  function ensureVisible(id) {
    const info = layout.get(id);
    if (!info) return;
    const margin = Math.min(info.w, info.h) + 40;
    let dx = 0, dy = 0;
    if (info.x - info.w / 2 < view.x + margin) dx = (info.x - info.w / 2) - (view.x + margin);
    if (info.x + info.w / 2 > view.x + view.w - margin) dx = (info.x + info.w / 2) - (view.x + view.w - margin);
    if (info.y - info.h / 2 < view.y + margin) dy = (info.y - info.h / 2) - (view.y + margin);
    if (info.y + info.h / 2 > view.y + view.h - margin) dy = (info.y + info.h / 2) - (view.y + view.h - margin);
    if (dx || dy) { view.x += dx; view.y += dy; applyView(); }
  }
  function pointSvg(clientX, clientY) {
    const rect = svgEl.getBoundingClientRect();
    return { x: view.x + (clientX - rect.left) / rect.width * view.w, y: view.y + (clientY - rect.top) / rect.height * view.h };
  }
  /* onde um no esta na tela, em pixels — e onde o input de edicao se deita */
  function screenRectOf(info) {
    const rect = svgEl.getBoundingClientRect();
    const scale = rect.width / view.w;
    const cx = rect.left + (info.x - view.x) * scale, cy = rect.top + (info.y - view.y) * scale;
    const w = info.w * scale, h = info.h * scale;
    return { left: cx - w / 2, top: cy - h / 2, width: w, height: h, scale };
  }
  /* o mesmo para uma caixa com canto (x,y) — e como os itens guardam */
  function screenRectOfBox(b) {
    const rect = svgEl.getBoundingClientRect();
    const scale = rect.width / view.w;
    return { left: rect.left + (b.x - view.x) * scale, top: rect.top + (b.y - view.y) * scale, width: b.w * scale, height: b.h * scale, scale };
  }

  /* ---- desenho ----
     quem muda de lugar desliza ate a posicao nova (220ms) em vez de saltar:
     `drawn` guarda onde cada no foi pintado por ultimo, e o tween interpola
     so os que se moveram. durante o arraste nao anima — o mapa tem que
     responder na hora. */
  function scheduleDraw() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; draw(); });
  }
  function draw(animate) {
    if (!svgEl) return;
    if (tweenRaf) { cancelAnimationFrame(tweenRaf); tweenRaf = 0; }
    const from = new Map();
    if (animate !== false && drawn && !drag) {
      layout.forEach((info, id) => {
        const p = drawn.get(id);
        if (p && (Math.abs(p.x - info.x) > .5 || Math.abs(p.y - info.y) > .5)) from.set(id, p);
      });
    }
    if (!from.size) { paint(null); return; }
    const t0 = performance.now(), dur = 220;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      const pos = new Map();
      from.forEach((p, id) => { const a = layout.get(id); pos.set(id, { x: p.x + (a.x - p.x) * e, y: p.y + (a.y - p.y) * e }); });
      paint(k < 1 ? pos : null);
      tweenRaf = k < 1 ? requestAnimationFrame(step) : 0;
    };
    tweenRaf = requestAnimationFrame(step);
  }
  function paint(pos) {
    const posOf = (info) => (pos && pos.get(info.node.id)) || info;
    const edges = [], nodes = [];
    layout.forEach((info) => {
      const node = info.node;
      if (!node.collapsed && (node.children || []).length) {
        const right = [], left = [];
        node.children.forEach((c) => { const ci = layout.get(c.id); if (ci) (ci.side === "left" ? left : right).push(ci); });
        edges.push(svgEdgesOf(info, right, posOf), svgEdgesOf(info, left, posOf));
      }
      nodes.push(svgNode(info, node, node.id === rootId, posOf(info), selectedId, drag));
    });
    /* o quadro em volta: molduras atras da arvore, o resto na frente, e a
       selecao (com alcas do tamanho do dedo, em qualquer zoom) por cima de tudo */
    const cur = live || items;
    const board = svgBoardLayers(cur, boxOf, { editing: editingItem, ghosts: ghostItems });
    const overlay = itemSel.size || (op && (op.marquee || op.snap))
      ? svgSelection(cur, itemSel, boxOf, unitNow(), { snap: op && op.snap, marquee: op && op.marquee }) : null;
    const tree = (
      <>{svgGrid(view.w > 2400 ? "0" : "1")}<g className="bd-back">{board.back}</g><g>{edges}</g><g>{nodes}</g>
        <g className="bd-front">{board.front}</g><g>{overlay}</g>
        {svgSiblingIndicator(layout, posOf, drag)}{svgGhost(layout, drag)}</>
    );
    /* fora do commit do React (ponteiro, roda, animacao) o desenho tem que
       sair neste mesmo quadro: um root.render() solto so cairia na tela no
       quadro seguinte, e o arraste ficaria um passo atras do cursor. dentro
       do commit nao da para forcar — nem precisa: o React fecha os dois no
       mesmo passo, antes da pintura do navegador. */
    if (committing) root.render(tree);
    else flushSync(() => root.render(tree));
    applyGrid();
    drawn = new Map();
    layout.forEach((info, id) => { const p = posOf(info); drawn.set(id, { x: p.x, y: p.y }); });
  }

  /* ---- mouse e toque: pan, zoom, clique, arrastar ----
     apertar num no e mover = arrastar (um fantasma da pilula segue o cursor;
     o ramo original fica apagado no lugar). soltar em cima de outro no faz
     virar filho dele; soltar na fenda ao lado de um irmao reordena; soltar no
     vazio cancela e tudo volta ao lugar. apertar no vazio e mover = pan. */
  function nodeAt(px, py, excludeIds) {
    let found = null;
    layout.forEach((info, id) => {
      if (excludeIds && excludeIds.has(id)) return;
      if (isGhostId(id)) return; // um ramo que ainda nao existe nao recebe outro em cima
      if (px >= info.x - info.w / 2 && px <= info.x + info.w / 2 && py >= info.y - info.h / 2 && py <= info.y + info.h / 2) found = id;
    });
    return found;
  }
  /* onde o no arrastado cairia se soltasse agora: dentro de um no = filho;
     perto de um no (ate 64 unidades da pilula) = irmao, antes ou depois
     conforme o cursor esta acima ou abaixo do centro; longe de tudo = nada */
  function computeTarget(px, py) {
    const excl = drag.descendants;
    const inside = nodeAt(px, py, excl);
    if (inside) return { type: "child", id: inside };
    let best = null, bestD = Infinity;
    layout.forEach((info, id) => {
      if (excl.has(id) || info.side === "root") return;
      const dx = Math.max(info.x - info.w / 2 - px, 0, px - (info.x + info.w / 2));
      const dy = Math.max(info.y - info.h / 2 - py, 0, py - (info.y + info.h / 2));
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = info; }
    });
    if (best && bestD <= 64) return { type: "sibling", id: best.node.id, before: py < best.y };
    return null;
  }
  function updateDrag(clientX, clientY) {
    if (!drag) return;
    const p = pointSvg(clientX, clientY);
    drag.pos = { x: p.x - drag.offset.x, y: p.y - drag.offset.y };
    drag.target = computeTarget(p.x, p.y);
    scheduleDraw();
  }
  /* arrastando perto da borda, a tela rola sozinha na direcao do cursor */
  function autoPan() {
    autoPanRaf = 0;
    if (!drag || !lastPointer) return;
    const rect = svgEl.getBoundingClientRect(), m = 40;
    const cx = lastPointer.x, cy = lastPointer.y;
    let vx = 0, vy = 0;
    if (cx < rect.left + m) vx = cx - (rect.left + m); else if (cx > rect.right - m) vx = cx - (rect.right - m);
    if (cy < rect.top + m) vy = cy - (rect.top + m); else if (cy > rect.bottom - m) vy = cy - (rect.bottom - m);
    if (vx || vy) {
      const scale = view.w / rect.width;
      view.x += vx * 0.3 * scale; view.y += vy * 0.3 * scale;
      applyView();
      updateDrag(cx, cy);
    }
    autoPanRaf = requestAnimationFrame(autoPan);
  }
  function endDrag() {
    drag = null; lastPointer = null;
    if (autoPanRaf) { cancelAnimationFrame(autoPanRaf); autoPanRaf = 0; }
    svgEl.classList.remove("is-dragging");
    if (hintEl) hintEl.hidden = true;
  }

  /* ---- o quadro: gestos ----
     cada ferramenta e um gesto: a caneta risca, a borracha apaga traco, as
     de criar desenham ou clicam, a mao arrasta a tela. com a de selecionar,
     o que esta debaixo do dedo decide: alca redimensiona, item anda, no da
     arvore segue o arraste dela, e o vazio abre um retangulo de selecao (no
     toque, o vazio arrasta a tela — dedo nao faz retangulo). botao do meio,
     botao direito e Espaco seguro sempre arrastam a tela. */
  const CREATE_TOOLS = ["sticky", "text", "shape", "frame", "line", "sticker"];
  const penDraft = (raw) => ({ id: "draft-pen", type: "pen", points: raw, color: tool.color || 0, width: tool.width || 3, alpha: tool.alpha || 1 });
  function erase(p) {
    const tol = 6 * unitNow();
    const next = live.filter((it) => !(it.type === "pen" && penHit(it, p.x, p.y, tol)));
    if (next.length !== live.length) { setLive(next); scheduleDraw(); }
  }
  /* o gesto acabou e mudou o quadro: o motor ja pinta o resultado (sem
     esperar o React voltar — senao o quadro piscaria o estado de antes por
     um quadro) e o editor grava */
  function commit(next, opts) {
    items = next; live = null; indexItems();
    if (opts && opts.select) itemSel = new Set(opts.select);
    call("commitItems", next, opts || {});
  }
  function startMove() {
    const id = pendingItem;
    if (!itemSel.has(id)) itemSel = new Set([id]); // arrastar o que nao estava selecionado pega so ele
    const ids = new Set(itemSel);
    /* moldura leva junto o que mora dentro dela */
    items.forEach((it) => { if (ids.has(it.id) && it.type === "frame") frameChildren(items, it, boxOf).forEach((c) => ids.add(c)); });
    op = { kind: "move", ids, p0: pointSvg(pointerOrigin.x, pointerOrigin.y) };
    svgEl.classList.add("is-dragging");
  }
  function resizeLive(p, shift) {
    const base = items.find((it) => it.id === op.id);
    if (!base) return;
    let next;
    if (base.type === "line") {
      const end = op.handle === "p1" ? "1" : "2";
      const target = attachAt(p, base.id);
      op.snap = target ? boxOf(target) : null;
      next = { ...base, ["x" + end]: Math.round(p.x), ["y" + end]: Math.round(p.y), [end === "1" ? "from" : "to"]: target };
    } else if (base.type === "pen") return;
    else {
      /* post-it, adesivo e texto nao deformam; texto crescendo e letra crescendo */
      const ratio = shift || base.type === "sticky" || base.type === "sticker" || base.type === "text";
      const b = resizeBox(base, op.handle, p, ratio);
      next = { ...base, ...b };
      if (base.type === "text") { next.size = clamp(Math.round(base.size * b.w / base.w), 8, 200); next.h = textItemHeight(next); }
    }
    setLive(items.map((it) => (it.id === op.id ? next : it)));
    scheduleDraw();
  }
  function createLive(p, shift) {
    const t = tool.name;
    if (t === "shape" || t === "frame") {
      const b = dragBox(op.p0, p, shift);
      op.draft = t === "frame"
        ? { id: "draft", type: "frame", ...b, title: "" }
        : { id: "draft", type: "shape", shape: tool.shape || "rect", fill: tool.fill == null ? FILL_THEME : tool.fill, color: 0, text: "", ...b };
    } else if (t === "line") {
      const target = attachAt(p, op.from);
      op.snap = target ? boxOf(target) : null;
      op.draft = { id: "draft", type: "line", kind: tool.kind || "arrow", x1: Math.round(op.p0.x), y1: Math.round(op.p0.y), x2: Math.round(p.x), y2: Math.round(p.y), from: op.from, to: target, color: 0, width: 2, dash: false, text: "" };
    } else return;
    setLive(items.concat([op.draft]));
    scheduleDraw();
  }
  function finishCreate(p) {
    const t = tool.name, p0 = op.p0;
    let it = null, edit = false;
    if (t === "shape" || t === "frame") {
      if (movedEnough && op.draft && op.draft.w >= 12 && op.draft.h >= 12) it = { ...op.draft, id: newId() };
      else {
        const [w, h] = DEFAULT_SIZE[t];
        it = t === "frame"
          ? { id: newId(), type: "frame", x: Math.round(p0.x - w / 2), y: Math.round(p0.y - h / 2), w, h, title: "" }
          : { id: newId(), type: "shape", shape: tool.shape || "rect", fill: tool.fill == null ? FILL_THEME : tool.fill, color: 0, text: "", x: Math.round(p0.x - w / 2), y: Math.round(p0.y - h / 2), w, h };
      }
      edit = t === "shape";
    } else if (t === "line") {
      it = movedEnough && op.draft
        ? { ...op.draft, id: newId() }
        : { id: newId(), type: "line", kind: tool.kind || "arrow", x1: Math.round(p0.x), y1: Math.round(p0.y), x2: Math.round(p0.x + 160), y2: Math.round(p0.y), from: op.from, to: "", color: 0, width: 2, dash: false, text: "" };
    } else if (t === "sticky") {
      const s = DEFAULT_SIZE.sticky[0];
      it = { id: newId(), type: "sticky", color: tool.color || 0, x: Math.round(p.x - s / 2), y: Math.round(p.y - s / 2), w: s, h: s, text: "" };
      edit = true;
    } else if (t === "text") {
      it = { id: newId(), type: "text", x: Math.round(p.x), y: Math.round(p.y - 14), w: DEFAULT_SIZE.text[0], h: 28, size: tool.size || 18, bold: false, color: 0, text: "" };
      it.h = textItemHeight(it);
      edit = true;
    } else if (t === "sticker") {
      const s = DEFAULT_SIZE.sticker[0];
      it = { id: newId(), type: "sticker", emoji: tool.emoji || "👍", x: Math.round(p.x - s / 2), y: Math.round(p.y - s / 2), w: s, h: s };
    }
    if (!it) return;
    it = normalizeItem(it, newId);
    commit(items.concat([it]), { select: [it.id], edit: edit ? it.id : null, toolDone: true });
  }

  function onPointerDown(e) {
    if (editing) return;
    if (mode) return; // segundo dedo: o pinch cuida
    const button = e.button == null ? 0 : e.button;
    if (button > 2) return;
    const t = e.target;
    const itemEl = t.closest("[data-item]"), nodeEl = t.closest("[data-id]");
    const p = pointSvg(e.clientX, e.clientY);
    initialTarget = t;
    lastDownId = nodeEl ? nodeEl.dataset.id : null;
    lastDownItem = itemEl ? itemEl.dataset.item : null;
    lastDownPoint = p;
    pointerOrigin = { x: e.clientX, y: e.clientY };
    movedEnough = false;
    const panNow = () => { mode = "pan-pending"; panOriginView = { x: view.x, y: view.y }; };
    if (button !== 0 || spaceHeld || tool.name === "hand") panNow();
    else if (tool.name === "pen") {
      mode = "pen"; op = { kind: "pen", raw: [p.x, p.y] };
      setLive(items.concat([penDraft(op.raw)]));
      scheduleDraw();
    } else if (tool.name === "eraser") {
      mode = "erase"; op = { kind: "erase" };
      setLive(items.slice()); erase(p);
    } else if (CREATE_TOOLS.indexOf(tool.name) >= 0) {
      mode = "create"; op = { kind: "create", p0: p, from: tool.name === "line" ? attachAt(p, null) : "" };
    } else {
      const handle = t.closest("[data-handle]"), ghostEl = t.closest("[data-ghost-item]");
      if (handle && itemSel.size === 1) { mode = "handle"; op = { kind: "handle", handle: handle.dataset.handle, id: [...itemSel][0] }; }
      else if (ghostEl) { mode = "ghost-item"; pendingItem = ghostEl.dataset.ghostItem; }
      else if (itemEl) { mode = "item-pending"; pendingItem = itemEl.dataset.item; }
      else if (nodeEl) { mode = "node-pending"; pendingId = nodeEl.dataset.id; }
      else if (e.pointerType === "touch") panNow();
      else { mode = "marquee-pending"; op = { kind: "marquee", p0: p, base: e.shiftKey ? new Set(itemSel) : new Set() }; }
    }
    /* o navegador comeca a propria selecao junto com o arrasto. como o svg e
       user-select:none, ela nao pega texto nenhum e sobe para o container,
       que aparece contornado de branco enquanto o dedo esta apertado. o pan e
       o arraste do no ja fazem tudo por conta propria — nao ha default a
       preservar aqui. depois das guardas, para que sair de um no em edicao
       continue tirando o foco do campo. */
    e.preventDefault();
    try { svgEl.setPointerCapture(e.pointerId); } catch (err) {}
    svgEl.addEventListener("pointermove", onPointerMove);
    svgEl.addEventListener("pointerup", onPointerUp, { once: true });
    svgEl.addEventListener("pointercancel", onPointerUp, { once: true });
  }
  function onPointerMove(e) {
    const dx = e.clientX - pointerOrigin.x, dy = e.clientY - pointerOrigin.y;
    if (!movedEnough && Math.hypot(dx, dy) > 4) movedEnough = true;
    const p = pointSvg(e.clientX, e.clientY);
    /* caneta e borracha respondem desde o primeiro pixel */
    if (mode === "pen") {
      const r = op.raw;
      if (Math.hypot(p.x - r[r.length - 2], p.y - r[r.length - 1]) >= unitNow() * 1.5 && r.length < 8000) {
        r.push(p.x, p.y);
        live[live.length - 1] = penDraft(r);
        scheduleDraw();
      }
      return;
    }
    if (mode === "erase") { erase(p); return; }
    if (!movedEnough) return;
    const rect = svgEl.getBoundingClientRect();
    const scale = view.w / rect.width;
    if (mode === "pan-pending" || mode === "pan") {
      mode = "pan";
      svgEl.classList.add("is-dragging");
      view.x = panOriginView.x - dx * scale;
      view.y = panOriginView.y - dy * scale;
      applyView();
    } else if (mode === "item-pending" || mode === "move") {
      if (mode === "item-pending") { startMove(); mode = "move"; }
      const mx = p.x - op.p0.x, my = p.y - op.p0.y;
      setLive(items.map((it) => (op.ids.has(it.id) ? moveItem(it, mx, my) : it)));
      scheduleDraw();
    } else if (mode === "handle") {
      resizeLive(p, e.shiftKey);
    } else if (mode === "marquee-pending" || mode === "marquee") {
      mode = "marquee";
      op.marquee = dragBox(op.p0, p);
      itemSel = new Set([...op.base, ...marqueeHits(items, op.marquee, boxOf)]);
      scheduleDraw();
    } else if (mode === "create") {
      createLive(p, e.shiftKey);
    } else if (mode === "node-pending" || mode === "node") {
      if (mode === "node-pending") {
        const info = layout.get(pendingId);
        /* a raiz nao sai do centro, e o fantasma nao se arrasta: ele so
           existe para ser clicado ou ignorado */
        if (!info || info.side === "root" || isGhostId(pendingId)) { mode = "root-stuck"; return; }
        const p0 = pointSvg(pointerOrigin.x, pointerOrigin.y);
        const descendants = new Set(); collectIds(info.node, descendants);
        drag = { id: pendingId, pos: { x: info.x, y: info.y }, offset: { x: p0.x - info.x, y: p0.y - info.y }, target: null, descendants };
        mode = "node";
        svgEl.classList.add("is-dragging");
        if (hintEl) hintEl.hidden = false;
        if (!autoPanRaf) autoPanRaf = requestAnimationFrame(autoPan);
      }
      lastPointer = { x: e.clientX, y: e.clientY };
      updateDrag(e.clientX, e.clientY);
    }
  }
  function onPointerUp(e) {
    svgEl.removeEventListener("pointermove", onPointerMove);
    svgEl.removeEventListener("pointerup", onPointerUp);
    svgEl.removeEventListener("pointercancel", onPointerUp);
    try { svgEl.releasePointerCapture(e.pointerId); } catch (err) {}
    const cancelled = e.type === "pointercancel";
    const p = pointSvg(e.clientX, e.clientY);
    svgEl.classList.remove("is-dragging");
    if (mode === "pan") { if (spaceHeld) spacePanned = true; }
    else if (mode === "node") {
      const target = drag && drag.target, nodeId = drag && drag.id;
      endDrag();
      if (target && !cancelled) call("drop", nodeId, target);
    } else if (mode === "pen") {
      /* o traco guarda so os pontos que mudam o desenho: meio pixel de tela */
      const pts = simplify(op.raw, unitNow() * 0.6);
      const it = normalizeItem({ id: newId(), type: "pen", points: pts, color: tool.color || 0, width: tool.width || 3, alpha: tool.alpha || 1 }, newId);
      if (it && !cancelled) commit(items.concat([it]), {});
    } else if (mode === "erase") {
      if (live && live.length !== items.length && !cancelled) commit(live, {});
    } else if (mode === "move") {
      if (!cancelled) commit(live, { select: [...itemSel] });
    } else if (mode === "handle") {
      if (movedEnough && live && !cancelled) commit(live, { select: [op.id] });
    } else if (mode === "marquee") {
      call("selectItems", [...itemSel]);
    } else if (mode === "create") {
      if (!cancelled) finishCreate(p);
    } else if (!movedEnough && !cancelled) {
      if (mode === "node-pending") {
        const noteTarget = initialTarget && initialTarget.closest("[data-note]");
        const toggle = initialTarget && initialTarget.closest("[data-toggle]");
        const info = layout.get(pendingId);
        if (toggle) call("toggle", pendingId);
        else if (noteTarget) call("openNote", pendingId);
        else if ((e.ctrlKey || e.metaKey) && info && info.node.link) window.open(info.node.link, "_blank", "noopener");
        else call("select", pendingId);
      } else if (mode === "item-pending") {
        const id = pendingItem;
        if (e.shiftKey) {
          const next = new Set(itemSel);
          if (next.has(id)) next.delete(id); else next.add(id);
          call("selectItems", [...next]);
        } else if (itemSel.size === 1 && itemSel.has(id)) call("editItem", id, p); // o segundo clique no mesmo escreve
        else call("selectItems", [id]);
      } else if (mode === "ghost-item") {
        call("acceptGhostItem", pendingItem);
      } else if (mode === "marquee-pending") {
        if (!e.shiftKey) call("clearSelection");
      } else if (mode === "pan-pending" && e.pointerType === "touch" && e.button === 0 && tool.name !== "hand") {
        call("clearSelection");
      }
    }
    mode = null; pendingId = null; pendingItem = null; initialTarget = null; op = null;
    if (live) setLive(null);
    if (drag) endDrag();
    draw();
  }
  /* com o ponteiro capturado pelo svg, o chrome entrega o dblclick ao proprio
     svg, nao ao no — por isso o alvo vem do ultimo pointerdown, que chegou
     antes da captura */
  function onDblClick(e) {
    if (tool.name !== "select") return;
    if (lastDownItem) { call("editItem", lastDownItem, lastDownPoint); return; }
    const target = e.target.closest("[data-id]");
    const id = target ? target.dataset.id : lastDownId;
    if (id) call("edit", id);
  }
  /* o botao direito arrasta a tela; o menu do navegador so atrapalharia */
  function onContextMenu(e) { e.preventDefault(); }
  function onWheel(e) {
    e.preventDefault();
    zoomAt(e.deltaY > 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
  }
  /* pinch no toque: dois dedos, distancia entre eles vira escala */
  const touchDistance = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const touchCenter = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
  function onTouchStart(e) {
    if (e.touches.length === 2) {
      /* o segundo dedo cancela o que o primeiro estava fazendo (pan ou arraste) */
      svgEl.removeEventListener("pointermove", onPointerMove);
      mode = null; pendingId = null; pendingItem = null; op = null;
      if (live) setLive(null);
      if (drag) endDrag();
      draw();
      svgEl.classList.remove("is-dragging");
      pinchDist = touchDistance(e.touches); pinchStartView = { x: view.x, y: view.y, w: view.w, h: view.h };
    }
  }
  function onTouchMove(e) {
    if (e.touches.length === 2 && pinchDist) {
      e.preventDefault();
      const center = touchCenter(e.touches);
      const rect = svgEl.getBoundingClientRect();
      const relX = (center.x - rect.left) / rect.width, relY = (center.y - rect.top) / rect.height;
      const px = pinchStartView.x + relX * pinchStartView.w, py = pinchStartView.y + relY * pinchStartView.h;
      const factor = clamp(pinchDist / touchDistance(e.touches), 0.2, 5);
      const w = clamp(pinchStartView.w * factor, 120, 12000);
      const h = pinchStartView.h * (w / pinchStartView.w);
      view = { x: px - relX * w, y: py - relY * h, w, h };
      applyView();
    }
  }
  function onTouchEnd(e) { if (e.touches.length < 2) pinchDist = null; }

  return {
    attach(el, hint) {
      svgEl = el; hintEl = hint;
      root = createRoot(el);
      el.addEventListener("pointerdown", onPointerDown);
      el.addEventListener("dblclick", onDblClick);
      el.addEventListener("contextmenu", onContextMenu);
      el.addEventListener("wheel", onWheel, { passive: false });
      el.addEventListener("touchstart", onTouchStart, { passive: false });
      el.addEventListener("touchmove", onTouchMove, { passive: false });
      el.addEventListener("touchend", onTouchEnd);
    },
    detach() {
      if (!svgEl) return;
      if (tweenRaf) cancelAnimationFrame(tweenRaf);
      if (autoPanRaf) cancelAnimationFrame(autoPanRaf);
      svgEl.removeEventListener("pointerdown", onPointerDown);
      svgEl.removeEventListener("pointermove", onPointerMove);
      svgEl.removeEventListener("dblclick", onDblClick);
      svgEl.removeEventListener("contextmenu", onContextMenu);
      svgEl.removeEventListener("wheel", onWheel);
      svgEl.removeEventListener("touchstart", onTouchStart);
      svgEl.removeEventListener("touchmove", onTouchMove);
      svgEl.removeEventListener("touchend", onTouchEnd);
      /* desmontar sai num microtask: aqui ainda estamos dentro do commit do
         React (a limpeza do useLayoutEffect), e um root nao se desmonta no
         meio de outro */
      if (root) { const r = root; root = null; queueMicrotask(() => r.unmount()); }
      svgEl = null; hintEl = null;
    },
    /* o documento ou a selecao mudaram: redesenha (deslizando quem se moveu) */
    update(next) {
      layout = next.layout; selectedId = next.selectedId; rootId = next.rootId; editing = next.editing;
      /* no meio de um gesto o quadro e do motor: o que vier do React agora
         (um salvar atrasado, a nuvem) entra, mas a copia viva segue ate o soltar */
      items = next.items || []; itemSel = new Set(next.itemSel || []); ghostItems = next.ghosts || [];
      editingItem = next.editingItem || null;
      tool = next.tool || { name: "select" };
      if (svgEl) svgEl.dataset.tool = tool.name;
      if (!live) indexItems();
      committing = true;
      try {
        draw();
        if (firstDraw) { firstDraw = false; if (savedView) applyView(); else frame(); }
        if (pendingFrame) { const id = pendingFrame; pendingFrame = null; frameNode(id); }
        if (pendingBox) { const b = pendingBox; pendingBox = null; frameBox(b); }
      } finally { committing = false; }
    },
    frame, frameNode,
    frameNodeNext(id) { pendingFrame = id; },
    frameBoxNext(b) { pendingBox = b; },
    zoomCenter, ensureVisible, screenRectOf, screenRectOfBox, boxOf,
    /* o meio da tela, no mundo: onde nasce o que nao foi clicado num lugar */
    viewCenter: () => ({ x: view.x + view.w / 2, y: view.y + view.h / 2 }),
    onView(fn) { viewListeners.add(fn); return () => viewListeners.delete(fn); },
    /* Espaco segurado: arrastar move a tela. soltar sem ter arrastado devolve
       o Espaco ao que ele sempre fez (colapsar o no selecionado) */
    setSpace(on) {
      if (on && !spaceHeld) spacePanned = false;
      spaceHeld = on;
      if (svgEl) svgEl.classList.toggle("is-panning", on);
    },
    spacePanned: () => spacePanned,
    /* o editor recusou uma gravacao (grande demais): volta ao que ficou */
    setItems(list) { items = list; live = null; indexItems(); draw(); },
    svg: () => svgEl
  };
}

/* ---------- icones que so existem aqui ---------- */
const FrameIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 4H5a1 1 0 00-1 1v4M15 4h4a1 1 0 011 1v4M9 20H5a1 1 0 01-1-1v-4M15 20h4a1 1 0 001-1v-4" />
  </svg>
);
const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);
const MoreIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
  </svg>
);
const FabIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const COLORS = [0, 1, 2, 3, 4, 5, 6];

/* ---------- o quadro: o que vive fora de um mapa ----------
   as opcoes das ferramentas (a cor do post-it, a forma, a ponta da seta, a
   caneta) sao da pessoa, nao do mapa: valem em todos e ficam no navegador.
   a area de copiar tambem vive fora do editor — copiar num mapa e colar
   noutro e o jeito de levar um pedaco de quadro de um para o outro. */
const TOOLS_KEY = "merlin:maps:tools";
const TOOL_DEFAULTS = { sticky: 0, shape: "rect", line: "arrow", penColor: 0, penWidth: 4, marker: false, emoji: "👍" };
function loadToolOpts() {
  try { return { ...TOOL_DEFAULTS, ...(JSON.parse(localStorage.getItem(TOOLS_KEY)) || {}) }; } catch (e) { return { ...TOOL_DEFAULTS }; }
}
function saveToolOpts(o) { try { localStorage.setItem(TOOLS_KEY, JSON.stringify(o)); } catch (e) {} }
let boardClipboard = null;

/* ---------- a pagina: lista ou editor, conforme o hash ----------
   quem abre um mapa de outro modulo (maps.html#<id>) entra direto no editor;
   o editor e remontado por mapa (key), para nada de um vazar no outro. */
function Maps() {
  const maps = useCollection("maps", { normalize });
  const hash = useHash();
  const open = hash && maps.has(hash) ? hash : "";
  return open ? <Editor key={open} id={open} maps={maps} /> : <MapList maps={maps} />;
}

/* ---------- lista de mapas ---------- */
function MapList({ maps }) {
  useClients();
  const notes = useCollection("notes"), funnels = useCollection("funnels");
  const [form, setForm] = useState(false);
  /* escolher o modelo é uma tela, e não um campo da caixa de criar: com o
     modelo dentro da caixa, desistir dele obrigava a rolar a lista inteira
     de volta até "em branco". a caixa pede só o nome. */
  const [choosing, setChoosing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const all = maps.all().sort((a, b) => b.updatedAt - a.updatedAt);
  const picking = choosing || !all.length;

  /* o mapa colado nasce como qualquer outro: passa pelo normalize, que é
     quem dá id a cada nó, e abre direto no editor */
  const importMap = ({ name, root }) => {
    const now = Date.now();
    const doc = normalize({ id: newId(), name, root, client: "", idea: "", funnel: "", createdAt: now, updatedAt: now });
    maps.save(doc);
    notify("mapa importado");
    location.hash = doc.id;
  };

  const duplicate = (id) => {
    const m = maps.get(id);
    if (!m) return;
    const copy = cloneDoc(m);
    /* os nos ganham id novo; seta do quadro presa num no segue presa na copia dele */
    const ids = new Map();
    (function regenerate(node) { const fresh = newId(); ids.set(node.id, fresh); node.id = fresh; (node.children || []).forEach(regenerate); })(copy.root);
    copy.items = (copy.items || []).map((it) => (it.type !== "line" ? it
      : { ...it, from: ids.get(it.from) || it.from, to: ids.get(it.to) || it.to }));
    copy.id = newId();
    copy.name = m.name + " (cópia)";
    copy.createdAt = Date.now(); copy.updatedAt = Date.now();
    maps.save(copy);
    notify("mapa duplicado");
  };
  const remove = (id) => {
    const before = maps.remove(id);
    if (!before) return;
    notify("mapa apagado", () => maps.save(before));
  };

  /* n abre um mapa novo e i cola um mermaid; no editor, "n" e a nota do no */
  useKeydown((e) => {
    if (e.key === "Escape" && choosing && !form && !importing) { setChoosing(false); return; }
    if ((e.key !== "n" && e.key !== "i") || e.ctrlKey || e.metaKey || e.altKey || form || importing || isTyping()) return;
    e.preventDefault();
    if (e.key === "n") setChoosing(true); else setImporting(true);
  });

  return (
    <main className="page">
      <div className="header">
        <div><h1>mapas</h1><p className="sub">quadros livres com um mapa mental no meio — post-its, formas, setas, caneta e modelos em volta</p></div>
        <div className="actions">
          <button className="pill" type="button" id="import-map" title="colar um mapa em mermaid (i)" onClick={() => setImporting(true)}>{icon("code")}mermaid</button>
          {choosing && all.length
            ? <button className="pill" type="button" id="new-map-back" onClick={() => setChoosing(false)}>{icon("chevronLeft")}voltar</button>
            : <button className="pill pill--green" type="button" id="new-map" title="novo mapa (n)" onClick={() => setChoosing(true)}>{icon("plus")}mapa</button>}
        </div>
      </div>
      {!picking && <ul className="list mp-list" id="map-list">
        {all.map((m) => (
          <MapRow key={m.id} m={m} maps={maps} notes={notes} funnels={funnels}
            renaming={renaming === m.id} onRename={() => setRenaming(m.id)} onRenamed={() => setRenaming(null)}
            onDuplicate={() => duplicate(m.id)} onRemove={() => remove(m.id)} />
        ))}
      </ul>}
      {/* dezenove mapas prontos moravam dentro do <select> da caixa de criar.
          quem chegava na tela vazia via uma frase cinza e tinha que descobrir
          sozinho que eles existiam. */}
      {picking && (
        <EmptyStart
          title={all.length ? "de que tipo é o novo mapa?" : "de que tipo é o primeiro mapa?"}
          text="Cada modelo abre com os galhos de primeiro nível já escritos — o esqueleto de um assunto, para você mexer em vez de encarar um nó sozinho no meio da tela."
          groups={mapGroups().map((g) => ({
            ...g,
            items: g.items.map((t) => ({ ...t, hint: mapBranches(t).join(" · ") }))
          }))}
          thumb={(t) => <MapThumb shape={mapShape(t)} size={mapSize(t)} />}
          onPick={(t) => setForm({ template: t.id })}
          onBlank={() => setForm({ template: "" })}
          blankRow blankLabel="mapa em branco" blankNote="um nó no meio da tela, e só" />
      )}
      {!all.length && (
        <p className="mp-import-hint">o mapa já existe numa conversa com uma IA? cole o mermaid dele
          <button className="action" type="button" title="colar o mermaid" aria-label="Colar o mermaid" onClick={() => setImporting(true)}>{icon("copy")}</button></p>
      )}
      {form && <MapForm maps={maps} template={form.template} onClose={() => setForm(false)} />}
      {importing && <MermaidDialog onImport={importMap} onClose={() => setImporting(false)} />}
    </main>
  );
}

/* a linha: clicar em qualquer parte neutra abre; os links de nota, cliente
   e funil navegam por conta propria */
function MapRow({ m, notes, funnels, maps, renaming, onRename, onRenamed, onDuplicate, onRemove }) {
  const n = countNodes(m.root);
  const note = m.idea ? notes.get(m.idea) : null;
  const funnel = m.funnel ? funnels.get(m.funnel) : null;
  const open = () => { location.hash = m.id; };
  const stop = (e) => e.stopPropagation();
  return (
    <li className="line" data-id={m.id} onClick={open}>
      {renaming
        ? <RenameInput map={m} maps={maps} onDone={onRenamed} />
        : <button type="button" className="mp-line-name">{m.name}</button>}
      <span className="measure t-mono">{n + (n === 1 ? " nó" : " nós") + (m.items.length ? " · " + m.items.length + (m.items.length === 1 ? " item" : " itens") : "")}</span>
      <span className="measure t-mono">{"editado há " + relativeTime(m.updatedAt)}</span>
      <span className="mp-links">
        {note && <a className="pill pill--mini" href={"notes.html#" + m.idea} title="abrir a nota" onClick={stop}>{NAV_ICONS.notes}{note.title || "nota"}</a>}
        {m.client && <a className="pill pill--mini" href={"clients.html#" + m.client} title="abrir o cliente" onClick={stop}>{NAV_ICONS.clients}{clientName(m.client) || "cliente"}</a>}
        {funnel && <a className="pill pill--mini" href={"funnels.html#" + m.funnel} title="abrir o funil" onClick={stop}>{NAV_ICONS.funnels}{funnel.name || "funil"}</a>}
      </span>
      <span className="row-actions">
        <button className="action" type="button" title="abrir">{icon("arrow")}</button>
        <button className="action" type="button" title="renomear" onClick={(e) => { e.stopPropagation(); onRename(); }}>{icon("pencil")}</button>
        <button className="action" type="button" title="duplicar" onClick={(e) => { e.stopPropagation(); onDuplicate(); }}>{icon("map")}</button>
        <button className="action" type="button" title="apagar" onClick={(e) => { e.stopPropagation(); onRemove(); }}>{icon("trash")}</button>
      </span>
    </li>
  );
}

/* renomear na propria linha: Enter e blur salvam, Esc cancela. o `closed`
   evita que o blur disparado ao tirar o input da tela salve de novo. */
function RenameInput({ map, maps, onDone }) {
  const ref = useRef(null), closed = useRef(false);
  const [value, setValue] = useState(map.name);
  useLayoutEffect(() => { ref.current.focus(); ref.current.select(); }, []);
  const confirm = () => {
    if (closed.current) return;
    closed.current = true;
    const name = value.trim() || map.name;
    maps.save({ ...map, name, updatedAt: Date.now() });
    onDone();
  };
  const cancel = () => { if (closed.current) return; closed.current = true; onDone(); };
  return <input ref={ref} className="input" style={{ maxWidth: "260px" }} value={value}
    onChange={(e) => setValue(e.currentTarget.value)} onClick={(e) => e.stopPropagation()} onBlur={confirm}
    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirm(); } else if (e.key === "Escape") { e.preventDefault(); cancel(); } }} />;
}

/* criar e um botao e uma caixa, como em todo o sistema: nome e modelo. o
   mapa ja abre com o nome como ideia central; com modelo, os galhos dele ja
   nascem pendurados nela, cada um de uma cor. */
function MapForm({ maps, template, onClose }) {
  const tpl = template ? MAP_TEMPLATES.find((t) => t.id === template) : null;
  const [v, bind] = useFields({ name: tpl ? tpl.name : "" });
  const submit = () => {
    const name = v.name.trim();
    if (!name) { notify("o mapa precisa de um nome"); return false; }
    const now = Date.now();
    const doc = {
      id: newId(), name,
      root: tpl ? buildMap(tpl, name) : { id: newId(), title: name, note: "", color: 0, collapsed: false, link: "", children: [] },
      client: "", idea: "", funnel: "", createdAt: now, updatedAt: now
    };
    maps.save(doc);
    location.hash = doc.id;
  };
  return (
    <Form title="novo mapa" sub={tpl ? "modelo: " + tpl.name : "em branco"} submit="criar e abrir" onSubmit={submit} onClose={onClose}>
      <Field label="nome" full><input className="input" maxLength="120" required placeholder="a ideia central" {...bind("name")} /></Field>
      {tpl && (
        <div className="full">
          <p className="tpl-note">{tpl.summary}</p>
          <p className="tpl-chain">{mapBranches(tpl).join(" · ")}</p>
        </div>
      )}
    </Form>
  );
}

/* ---------- colar mermaid ----------
   o mapa vem de uma conversa com IA: a pessoa cola a resposta inteira (a
   cerca ```mermaid e a conversa em volta não atrapalham) e vê na hora o que
   vai virar mapa, antes de gravar. a prévia lê com um respiro curto enquanto
   se digita, mas colar lê na hora — é o gesto principal. `branch` é o modo
   de dentro do editor: sem nome, e o resultado vira ramo do nó selecionado.
   quem grava lê o texto de novo no submit, e não a prévia: a prévia pode
   estar um respiro atrás do que está no campo. */
const MERMAID_SAMPLE = "mindmap\n  root((lançamento))\n    público\n    oferta\n      preço\n    canais";

function MermaidDialog({ branch, onImport, onClose }) {
  const [text, setText] = useState("");
  const [read, setRead] = useState("");
  const [name, setName] = useState(null); // null = segue o nome que o mermaid sugere
  const [fileError, setFileError] = useState("");
  useEffect(() => {
    if (text === read) return;
    const t = setTimeout(() => setRead(text), 150);
    return () => clearTimeout(t);
  }, [text, read]);
  const preview = useMemo(() => {
    if (!read.trim()) return null;
    try { return { value: parseMermaid(read) }; } catch (e) { return { error: e.message }; }
  }, [read]);
  const value = preview && preview.value;
  const shownName = name != null ? name : value ? value.name : "";

  const change = (next, now) => { setText(next); setFileError(""); if (now) setRead(next); };
  /* soltar um .mmd/.md em cima do campo traz o texto dele para dentro */
  const dropFile = (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    e.preventDefault();
    if (file.size > 2000000) { setFileError("arquivo grande demais para ser um mapa"); return; }
    file.text().then((t) => change(t, true), () => setFileError("não consegui ler esse arquivo"));
  };
  const submit = () => {
    let parsed;
    try { parsed = parseMermaid(text); } catch (e) { setRead(text); return false; }
    return onImport({ name: (shownName.trim() || parsed.name).slice(0, 120), root: parsed.root });
  };
  const branches = value ? value.root.children.map((c) => c.title || "(sem título)") : [];

  return (
    <Form title={branch ? "colar mermaid como ramo" : "colar mermaid"} wide
          sub={branch ? "o mapa colado vira um ramo do nó selecionado" : "cole o que a IA respondeu — a conversa em volta do código não atrapalha"}
          submit={branch ? "pendurar no nó" : "importar e abrir"} onSubmit={submit} onClose={onClose}>
      <div className="full">
        <label className="field-label" htmlFor="mp-mermaid">mermaid</label>
        <textarea className="textarea mp-mermaid" id="mp-mermaid" spellCheck="false" placeholder={MERMAID_SAMPLE} value={text}
          onChange={(e) => change(e.currentTarget.value, false)}
          onPaste={(e) => { const el = e.currentTarget; setTimeout(() => change(el.value, true), 0); }}
          onDragOver={(e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault(); }}
          onDrop={dropFile}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }} />
      </div>
      {(fileError || (preview && preview.error)) && <p className="full mp-mermaid-error" role="alert">{fileError || preview.error}</p>}
      {value && !fileError && (
        <div className="full mp-mermaid-preview">
          {!branch && <>
            <label className="field-label" htmlFor="mp-mermaid-name">nome</label>
            <input className="input" id="mp-mermaid-name" maxLength="120" value={shownName} onChange={(e) => setName(e.currentTarget.value)} />
          </>}
          <p className="mp-mermaid-sum">
            <span className="t-mono">{value.count + (value.count === 1 ? " nó" : " nós")}</span>
            {value.kind === "flowchart" && <span>era um flowchart — virou árvore a partir do nó de cima</span>}
            {value.dropped > 0 && <span>{value.dropped + (value.dropped === 1 ? " nó ficou" : " nós ficaram")} de fora — o mapa passava do limite</span>}
          </p>
          {branches.length > 0 && <p className="tpl-chain">{branches.slice(0, 8).join(" · ") + (branches.length > 8 ? " · +" + (branches.length - 8) : "")}</p>}
        </div>
      )}
    </Form>
  );
}

/* ---------- o editor ----------
   o documento aberto mora em estado, imutavel: toda mudanca clona, altera a
   copia e grava com atraso de 400ms. o historico de desfazer guarda as
   versoes anteriores. selecao, edicao inline, painel e dialogos sao estado
   de tela; o desenho e o motor (createMapEngine), que so recebe update(). */
function Editor({ id, maps }) {
  useClients();
  const [doc, setDoc] = useState(() => maps.get(id));
  const docRef = useRef(doc); docRef.current = doc;

  /* o mapa aberto no editor, pro assistente saber onde propor um onboarding
     personalizado sem perguntar de novo o que ja esta desenhado */
  useEffect(() => {
    setPageContext(() =>
      "Mapa aberto: " + doc.name + (doc.client ? " · cliente: " + clientName(doc.client) + " (id " + doc.client + ")" : "") + ". " +
      "Nó raiz: " + doc.root.title + ". Ramos: " + (doc.root.children.length ? doc.root.children.map((n) => n.title).join("; ") : "nenhum ainda") +
      (doc.items.length ? ". No quadro em volta: " + itemTexts(doc.items).slice(0, 40).join("; ") : "")
    );
    return () => setPageContext(null);
  }, [doc.id, doc.updatedAt]);
  /* nada selecionado ao abrir: com a tela limpa, as letras armam as
     ferramentas do quadro (N post-it, T texto...). Tab e Enter continuam
     levando para a arvore. */
  const [selectedId, setSelectedId] = useState(null);
  /* o quadro: selecao de itens (so um dos dois mundos tem selecao por vez),
     a ferramenta armada, as opcoes de cada uma (cor do post-it, forma, ponta
     da seta, caneta — lembradas entre visitas), o item sendo escrito, o menu
     aberto da barra, os post-its que o merlin propos e as caixas */
  const [itemSel, setItemSel] = useState([]);
  const [tool, setTool] = useState("select");
  const [toolOpts, setToolOpts] = useState(loadToolOpts);
  const [editingItem, setEditingItem] = useState(null); // { id, cell?, initial? } | null
  const [flyout, setFlyout] = useState(null);
  const [stickyGhosts, setStickyGhosts] = useState(null); // [item] | null
  const [docOpen, setDocOpen] = useState(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState(null);         // { id, initial } | null
  const [panelOpen, setPanelOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [suggestions, setSuggestions] = useState(null); // { targetId, list } | null
  const [thinking, setThinking] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const historyRef = useRef([]), futureRef = useRef([]);
  const fieldCaptured = useRef(false);
  const saveTimer = useRef(0);
  const thinkingRef = useRef(false);
  const handlers = useRef({});
  const engine = useMemo(() => createMapEngine(id, handlers), [id]);

  /* o layout e funcao pura do documento; a fonte carregando depois muda as
     medidas, por isso recalcula quando ela chega */
  const layout = useMemo(
    () => computeLayout(suggestions ? withGhosts(doc.root, suggestions.targetId, suggestions.list) : doc.root),
    [doc.root, suggestions, fontsReady]
  );
  useEffect(() => {
    let alive = true;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (alive) setFontsReady(true); });
    return () => { alive = false; };
  }, []);

  /* ---- gravar ---- */
  const saveNow = () => {
    clearTimeout(saveTimer.current); saveTimer.current = 0;
    const next = { ...docRef.current, updatedAt: Date.now() };
    docRef.current = next; setDoc(next);
    maps.save(next);
  };
  const scheduleSave = () => { clearTimeout(saveTimer.current); saveTimer.current = setTimeout(saveNow, 400); };
  /* ao sair do editor, o que ainda esperava o atraso sobe agora */
  useEffect(() => () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current); saveTimer.current = 0;
      if (maps.has(id)) maps.save({ ...docRef.current, updatedAt: Date.now() });
    }
  }, []);

  /* ---- historico ---- */
  const pushHistory = (prev) => {
    const h = historyRef.current;
    h.push(prev);
    if (h.length > 50) h.shift();
    futureRef.current = [];
  };
  /* toda mudanca no documento passa por aqui: `fn` mexe numa copia e, se
     devolver false, nada acontece (nem historico, nem gravacao) */
  const mutate = (fn, options) => {
    const next = cloneDoc(docRef.current);
    if (fn(next) === false) return false;
    if (!options || options.history !== false) pushHistory(docRef.current);
    docRef.current = next; setDoc(next);
    scheduleSave();
    return true;
  };
  const keepSelection = (d) => {
    setSelectedId((s) => (!s ? null : findNode(d.root, s) ? s : d.root.id));
    setItemSel((sel) => { const has = new Set(d.items.map((it) => it.id)); const next = sel.filter((x) => has.has(x)); return next.length === sel.length ? sel : next; });
  };
  const undo = () => {
    const h = historyRef.current;
    if (!h.length) return;
    futureRef.current.push(docRef.current);
    if (futureRef.current.length > 50) futureRef.current.shift();
    const prev = h.pop();
    docRef.current = prev; setDoc(prev);
    keepSelection(prev);
    scheduleSave();
  };
  const redo = () => {
    const f = futureRef.current;
    if (!f.length) return;
    historyRef.current.push(docRef.current);
    if (historyRef.current.length > 50) historyRef.current.shift();
    const next = f.pop();
    docRef.current = next; setDoc(next);
    keepSelection(next);
    scheduleSave();
  };

  /* ---- outra aba ou a nuvem mexeram neste mapa ---- */
  useEffect(() => maps.onChange((origin) => {
    if (!maps.has(id)) { location.hash = ""; return; }
    if (origin === "local") return; // ja esta refletido em memoria
    const fresh = maps.get(id);
    if (JSON.stringify(fresh) === JSON.stringify(docRef.current)) return;
    docRef.current = fresh; setDoc(fresh);
    keepSelection(fresh);
    historyRef.current = []; futureRef.current = []; // retrato antigo nao serve mais depois de um merge de fora
  }), [maps, id]);

  /* ---- selecao e navegacao ---- */
  const select = (nid) => {
    if (isGhostId(nid)) { acceptGhost(nid); return; } // fantasma nao se seleciona: ele se aceita
    setSuggestions(null); // trocar de nó descarta a tira: ela era daquele nó
    setSelectedId(nid);
    if (nid) { setItemSel([]); engine.ensureVisible(nid); }
  };
  const navigate = (dir) => {
    const d = docRef.current;
    if (!selectedId) { select(d.root.id); return; }
    const found = findNode(d.root, selectedId);
    if (!found) return;
    const info = layout.get(selectedId);
    if (dir === "up" || dir === "down") {
      if (!found.parent) return;
      const idx = found.index + (dir === "up" ? -1 : 1);
      const siblings = found.parent.children;
      if (idx >= 0 && idx < siblings.length) select(siblings[idx].id);
      return;
    }
    const side = info && info.side;
    const firstOnSide = (which) => (found.node.children || []).find((c) => layout.get(c.id) && layout.get(c.id).side === which);
    if (dir === "right") {
      if (!side || side === "root") { const t = firstOnSide("right"); if (t) select(t.id); }
      else if (side === "right") { const children = found.node.children || []; if (!found.node.collapsed && children.length) select(children[0].id); }
      else if (found.parent) select(found.parent.id);
    } else if (dir === "left") {
      if (!side || side === "root") { const t = firstOnSide("left"); if (t) select(t.id); }
      else if (side === "left") { const children = found.node.children || []; if (!found.node.collapsed && children.length) select(children[0].id); }
      else if (found.parent) select(found.parent.id);
    }
  };

  /* ---- mutacoes ---- */
  const edit = (nid, initial) => {
    if (!findNode(docRef.current.root, nid)) return;
    setSelectedId(nid);
    setEditing({ id: nid, initial });
  };
  const createChild = (nid) => {
    if (!findNode(docRef.current.root, nid)) return;
    const fresh = newNode("");
    mutate((d) => {
      const f = findNode(d.root, nid);
      f.node.children = f.node.children || [];
      f.node.children.push(fresh);
      f.node.collapsed = false;
    });
    setSelectedId(fresh.id);
    setEditing({ id: fresh.id });
  };
  const createSibling = (nid) => {
    const found = findNode(docRef.current.root, nid);
    if (!found) return;
    if (!found.parent) { createChild(nid); return; } // a raiz nao tem irmao: cai para filho
    const fresh = newNode("");
    mutate((d) => { const f = findNode(d.root, nid); f.parent.children.splice(f.index + 1, 0, fresh); });
    setSelectedId(fresh.id);
    setEditing({ id: fresh.id });
  };
  const removeSelected = () => {
    const sel = selectedId;
    if (!sel) return;
    const found = findNode(docRef.current.root, sel);
    if (!found || !found.parent) return; // nunca apaga a raiz
    const parentId = found.parent.id, originalIndex = found.index;
    let removed = null;
    mutate((d) => {
      const f = findNode(d.root, sel);
      removed = f.parent.children.splice(f.index, 1)[0];
      /* seta do quadro presa no ramo apagado fica onde estava, solta */
      const gone = new Set(); collectIds(removed, gone);
      d.items = detachFrom(d.items, gone, engine.boxOf);
    });
    setSelectedId(parentId);
    notify("nó apagado", () => {
      mutate((d) => {
        const p = findNode(d.root, parentId);
        if (!p) return false;
        p.node.children.splice(Math.min(originalIndex, p.node.children.length), 0, removed);
      });
      setSelectedId(removed.id);
    });
  };
  const toggleCollapse = (nid) => mutate((d) => {
    const f = findNode(d.root, nid);
    if (!f || !(f.node.children || []).length) return false;
    f.node.collapsed = !f.node.collapsed;
  });
  const moveAmongSiblings = (nid, delta) => mutate((d) => {
    const f = findNode(d.root, nid);
    if (!f || !f.parent) return false;
    const list = f.parent.children;
    const idx = f.index + delta;
    if (idx < 0 || idx >= list.length) return false;
    const item = list.splice(f.index, 1)[0];
    list.splice(idx, 0, item);
  });
  /* move um no (com a subarvore) para dentro de outro pai, numa posicao —
     serve tanto para "virar filho" (indice no fim) quanto para reordenar
     entre irmaos. um ramo nunca vira filho de si mesmo. */
  const moveTo = (nodeId, parentId, index) => {
    if (nodeId === parentId) return false;
    const ok = mutate((d) => {
      const n = findNode(d.root, nodeId), p = findNode(d.root, parentId);
      if (!n || !p || !n.parent) return false;
      const descendants = new Set(); collectIds(n.node, descendants);
      if (descendants.has(parentId)) return false;
      const list = p.node.children || (p.node.children = []);
      const sameParent = n.parent === p.node;
      let at = Math.max(0, Math.min(index == null ? list.length : index, list.length));
      if (sameParent && (at === n.index || at === n.index + 1)) return false; // ja esta la
      n.parent.children.splice(n.index, 1);
      if (sameParent && n.index < at) at--;
      list.splice(at, 0, n.node);
      p.node.collapsed = false;
    });
    if (ok) setSelectedId(nodeId);
    return ok;
  };
  const drop = (nodeId, target) => {
    if (target.type === "child") { moveTo(nodeId, target.id); return; }
    const sib = findNode(docRef.current.root, target.id);
    if (sib && sib.parent) moveTo(nodeId, sib.parent.id, sib.index + (target.before ? 0 : 1));
  };
  const confirmEdit = (nid, value) => {
    setEditing((e) => (e && e.id === nid) ? null : e);
    mutate((d) => { const f = findNode(d.root, nid); if (!f) return false; f.node.title = value; });
  };
  const cancelEdit = (nid) => setEditing((e) => (e && e.id === nid) ? null : e);

  /* ---- painel ---- */
  const openNotePanel = (nid) => { if (!nid) return; setSelectedId(nid); setPanelOpen(true); };
  const closePanel = () => setPanelOpen(false);
  const selectedNode = selectedId ? findNode(doc.root, selectedId) : null;
  useEffect(() => { if (panelOpen && !selectedNode) setPanelOpen(false); }, [panelOpen, !!selectedNode]);
  /* digitar num campo do painel e uma entrada so no desfazer, capturada no
     primeiro toque e liberada no blur */
  const captureField = () => { if (!fieldCaptured.current) { pushHistory(docRef.current); fieldCaptured.current = true; } };
  const releaseField = () => { fieldCaptured.current = false; };
  const withSelected = (fn, options) => mutate((d) => { const f = findNode(d.root, selectedId); if (!f) return false; return fn(f.node, d); }, options);
  const pullToDay = () => {
    if (!selectedNode) return;
    sendToDay({ title: selectedNode.node.title || doc.name, client: doc.client, origin: { type: "map", id: doc.id } });
  };
  const toIdea = () => {
    if (!selectedNode) return;
    const now = Date.now();
    collection("notes").save({
      id: newId(), title: selectedNode.node.title || doc.name, body: selectedNode.node.note || "",
      stage: "seed", client: doc.client,
      steps: [], outputs: [], history: [], createdAt: now, updatedAt: now
    });
    notify("virou nota");
  };

  /* ---- merlin: sugestao de ramos ----
     o merlin so PROPOE — quem decide o que entra no mapa e quem esta na tela.
     por isso a resposta nunca vira no direto: ela sempre passa pelo dialogo
     de sugestoes, com tudo marcado por padrao mas cada item desmarcavel, e so
     os marcados viram filhos quando a pessoa aperta "adicionar". */
  const pathToRoot = (d, nid) => {
    const path = [];
    let cur = nid;
    for (;;) {
      const f = findNode(d.root, cur);
      if (!f || !f.parent) break;
      path.unshift(f.parent.title);
      cur = f.parent.id;
    }
    return path;
  };
  const suggestionContext = (d, nid) => {
    const f = findNode(d.root, nid);
    if (!f) return null;
    const node = f.node;
    return {
      map: d.name,
      path: pathToRoot(d, nid),
      node: node.title,
      note: node.note || "",
      children: (node.children || []).map((c) => c.title),
      siblings: f.parent ? f.parent.children.filter((c) => c.id !== nid).map((c) => c.title) : [],
      client: d.client ? (clientName(d.client) || "") : ""
    };
  };
  /* a conversa com o merlin e a mesma para ramos e para post-its: pede,
     traduz os erros em aviso e devolve a lista (ou null) */
  const callMerlin = async (context) => {
    if (thinkingRef.current) return null;
    thinkingRef.current = true; setThinking(true);
    let r;
    try { r = await api("/merlin", { method: "POST", body: JSON.stringify({ task: "branches", context }) }); }
    catch (e) { r = null; }
    thinkingRef.current = false; setThinking(false);
    if (!r) { notify("não consegui falar com o Merlin agora"); return null; }
    if (r.status === 401) { notify("entre para usar o Merlin"); return null; }
    if (r.status === 503) { notify((r.body && r.body.error) || "faltou configurar a chave do Merlin"); return null; }
    if (!r.ok) { notify((r.body && r.body.error) || "o Merlin não respondeu"); return null; }
    /* seis e o teto do que cabe em volta de um no (ou numa grade de post-its)
       sem virar parede; a lista antiga ia ate doze porque era rolavel numa caixa */
    return Array.isArray(r.body.suggestions) ? r.body.suggestions.slice(0, 6) : [];
  };
  const askSuggestions = async (nid) => {
    const d = docRef.current;
    if (!findNode(d.root, nid)) return;
    const list = await callMerlin(suggestionContext(d, nid));
    if (!list) return;
    if (!list.length) { notify("o Merlin não teve sugestões para esse nó"); return; }
    setStickyGhosts(null);
    setSuggestions({ targetId: nid, list });
  };
  /* clicar num fantasma: aquele ramo — e so aquele — vira real, no mesmo
     lugar em que ja estava desenhado. os outros somem, porque a tira era um
     conjunto de propostas, nao uma lista de tarefas a cumprir. */
  const acceptGhost = (ghostId) => {
    const s = suggestions;
    setSuggestions(null);
    if (!s) return;
    const item = s.list[+ghostId.slice(GHOST_PREFIX.length)];
    if (!item) return;
    let freshId = null;
    const ok = mutate((d) => {
      const f = findNode(d.root, s.targetId);
      if (!f) return false;
      const fresh = newNode(String(item.title || "").slice(0, 300));
      fresh.note = String(item.note || "").slice(0, 4000);
      freshId = fresh.id;
      f.node.children = f.node.children || [];
      f.node.children.push(fresh);
      f.node.collapsed = false;
    });
    if (!ok || !freshId) return;
    setSelectedId(freshId); // fica selecionado: o S pede os ramos dele em seguida
    engine.frameNodeNext(freshId);
  };

  /* ---- o quadro livre ----
     a ferramenta que o motor recebe ja vem com as opcoes dela resolvidas */
  const toolObj = useMemo(() => {
    const o = toolOpts;
    if (tool === "sticky") return { name: tool, color: o.sticky };
    if (tool === "shape") return { name: tool, shape: o.shape, fill: FILL_THEME };
    if (tool === "line") return { name: tool, kind: o.line };
    if (tool === "pen") return { name: tool, color: o.penColor, width: o.marker ? 16 : o.penWidth, alpha: o.marker ? 0.35 : 1 };
    if (tool === "sticker") return { name: tool, emoji: o.emoji };
    if (tool === "text") return { name: tool, size: 18 };
    return { name: tool };
  }, [tool, toolOpts]);
  const patchOpts = (patch) => setToolOpts((o) => { const n = { ...o, ...patch }; saveToolOpts(n); return n; });
  /* armar uma ferramenta de criar solta a selecao: o proximo clique e dela */
  const armTool = (name) => {
    setTool(name);
    if (name !== "select" && name !== "hand") { setItemSel([]); setSelectedId(null); setPanelOpen(false); }
  };
  const itemById = (iid) => docRef.current.items.find((it) => it.id === iid) || null;
  const selectedItems = useMemo(() => {
    const set = new Set(itemSel);
    return doc.items.filter((it) => set.has(it.id));
  }, [doc.items, itemSel]);

  /* grava a lista inteira do quadro. o teto e o do servidor (1MB por
     documento): passar dele e recusar aqui, com aviso, e nao perder na nuvem */
  const setItems = (next) => {
    if (JSON.stringify(next).length + JSON.stringify(docRef.current.root).length > 950000) {
      notify("o quadro ficou grande demais para gravar — apague rabiscos ou leve uma parte para outro mapa");
      engine.setItems(docRef.current.items);
      return false;
    }
    return mutate((d) => { d.items = next; });
  };
  const commitItems = (next, opts) => {
    if (!setItems(next)) return;
    if (opts.select) { setItemSel(opts.select); setSelectedId(null); setPanelOpen(false); }
    if (opts.toolDone) setTool("select");
    if (opts.edit) setEditingItem({ id: opts.edit });
  };
  const selectItems = (ids) => {
    setItemSel(ids);
    if (ids.length) { setSelectedId(null); setPanelOpen(false); setSuggestions(null); }
  };
  const clearSelection = () => { setItemSel([]); setSelectedId(null); setPanelOpen(false); };
  /* o que a pessoa esta arrastando, copiando ou duplicando: moldura leva o
     que mora dentro dela */
  const withFrameContent = (ids) => {
    const d = docRef.current, out = new Set(ids);
    d.items.forEach((it) => { if (out.has(it.id) && it.type === "frame") frameChildren(d.items, it, engine.boxOf).forEach((c) => out.add(c)); });
    return out;
  };

  const removeItems = (ids, silent) => {
    const gone = new Set(ids);
    const before = docRef.current.items;
    const removed = before.filter((it) => gone.has(it.id));
    if (!removed.length) return;
    const loosened = before.filter((it) => it.type === "line" && !gone.has(it.id) && ((it.from && gone.has(it.from)) || (it.to && gone.has(it.to))));
    mutate((d) => { d.items = detachFrom(d.items.filter((it) => !gone.has(it.id)), gone, engine.boxOf); });
    setItemSel((sel) => sel.filter((x) => !gone.has(x)));
    if (silent) return;
    /* desfazer pelo aviso devolve o que saiu no lugar da ordem em que estava,
       e as setas que tinham se soltado voltam a se prender */
    notify(removed.length === 1 ? "item apagado" : removed.length + " itens apagados", () => mutate((d) => {
      const back = new Map(loosened.map((it) => [it.id, it]));
      const list = d.items.map((it) => (back.has(it.id) ? { ...it, from: back.get(it.id).from, to: back.get(it.id).to } : it));
      const has = new Set(list.map((it) => it.id));
      removed.forEach((it) => { if (!has.has(it.id)) list.splice(Math.min(before.indexOf(it), list.length), 0, it); });
      d.items = list;
    }));
  };
  /* mexe nos itens selecionados; texto livre recalcula a altura, porque a
     letra e a largura mudam quantas linhas ele ocupa */
  const patchItems = (fn, ids) => {
    const set = new Set(ids || itemSel);
    mutate((d) => {
      let any = false;
      d.items = d.items.map((it) => {
        if (!set.has(it.id)) return it;
        const n = normalizeItem(fn(it), newId);
        if (!n) return it;
        if (n.type === "text") n.h = textItemHeight(n);
        any = true;
        return n;
      });
      if (!any) return false;
    });
  };
  const reorder = (toFront) => mutate((d) => {
    const set = new Set(itemSel);
    const a = d.items.filter((it) => set.has(it.id)), b = d.items.filter((it) => !set.has(it.id));
    if (!a.length) return false;
    d.items = toFront ? b.concat(a) : a.concat(b);
  });
  const duplicateItems = (ids) => {
    const set = withFrameContent(ids);
    const list = docRef.current.items.filter((it) => set.has(it.id));
    if (!list.length) return;
    const copies = cloneItems(list, newId, 24, 24, engine.boxOf);
    if (setItems(docRef.current.items.concat(copies))) setItemSel(copies.filter((c, i) => ids.indexOf(list[i].id) >= 0).map((c) => c.id));
  };
  /* copiar leva os itens soltos do que ficou para tras: a seta presa num no
     que nao foi junto vira seta solta, no lugar exato onde estava */
  const copyItems = (ids) => {
    const set = withFrameContent(ids);
    const list = docRef.current.items.filter((it) => set.has(it.id));
    if (!list.length) return false;
    const outside = new Set();
    list.forEach((it) => { if (it.type === "line") { if (it.from && !set.has(it.from)) outside.add(it.from); if (it.to && !set.has(it.to)) outside.add(it.to); } });
    boardClipboard = { items: cloneDoc(detachFrom(list, outside, engine.boxOf)), pasted: 0 };
    return true;
  };
  const pasteItems = () => {
    if (!boardClipboard) return;
    boardClipboard.pasted++;
    const k = boardClipboard.pasted * 24;
    const copies = cloneItems(boardClipboard.items, newId, k, k, localBoxOf(boardClipboard.items, engine.boxOf));
    if (setItems(docRef.current.items.concat(copies))) { setItemSel(copies.map((c) => c.id)); setSelectedId(null); }
  };
  const nudge = (dx, dy) => {
    const set = new Set(itemSel);
    mutate((d) => { d.items = d.items.map((it) => (set.has(it.id) ? moveItem(it, dx, dy) : it)); });
  };
  const textSize = (dir) => patchItems((it) => {
    const i = TEXT_SIZES.findIndex((s) => s >= it.size);
    const at = i < 0 ? TEXT_SIZES.length - 1 : TEXT_SIZES[i] === it.size ? i + dir : dir > 0 ? i : i - 1;
    return { ...it, size: TEXT_SIZES[clamp(at, 0, TEXT_SIZES.length - 1)] };
  });
  const tableShape = (dRows, dCols) => {
    const it = selectedItems.length === 1 && selectedItems[0].type === "table" ? selectedItems[0] : null;
    if (!it) return;
    const next = resizeTable(it, dRows, dCols);
    if (next !== it) mutate((d) => { d.items = d.items.map((x) => (x.id === it.id ? next : x)); });
  };

  /* escrever: cada tipo tem o seu jeito — documento abre o painel, tabela
     escreve na celula clicada, o resto escreve por cima do proprio item */
  const editItem = (iid, point, initial) => {
    const it = itemById(iid);
    if (!it) return;
    setItemSel([iid]); setSelectedId(null); setPanelOpen(false);
    if (it.type === "doc") { setDocOpen(iid); return; }
    if (it.type === "table") {
      const cell = (point && cellAt(it, point.x, point.y)) || [0, 0];
      setEditingItem({ id: iid, cell, initial });
      return;
    }
    if (["sticky", "text", "shape", "frame", "line"].indexOf(it.type) >= 0) {
      setEditingItem((cur) => (cur && cur.id === iid ? cur : { id: iid, initial }));
    }
  };
  const confirmItemEdit = (value, how) => {
    const e = editingItem;
    setEditingItem(null);
    if (!e) return;
    const it = itemById(e.id);
    if (!it) return;
    let next = { ...it };
    if (it.type === "frame") next.title = value.trim();
    else if (it.type === "table") { next.cells = it.cells.map((r) => r.slice()); next.cells[e.cell[0]][e.cell[1]] = value.trim(); }
    else if (it.type === "text") {
      /* texto livre que ficou vazio nao tem o que mostrar: some */
      if (!value.trim()) { removeItems([it.id], true); return; }
      next.text = value.replace(/\s+$/, "");
      next.h = textItemHeight(next);
    } else next.text = value.replace(/\s+$/, "");
    next = normalizeItem(next, newId);
    if (JSON.stringify(next) !== JSON.stringify(it)) mutate((d) => { d.items = d.items.map((x) => (x.id === it.id ? next : x)); });
    /* Tab anda pela tabela como numa planilha */
    if (it.type === "table" && (how === "next" || how === "prev")) {
      const { rows, cols } = tableSize(it);
      const flat = e.cell[0] * cols + e.cell[1] + (how === "next" ? 1 : -1);
      if (flat >= 0 && flat < rows * cols) setEditingItem({ id: it.id, cell: [Math.floor(flat / cols), flat % cols] });
    }
  };

  /* ---- merlin: post-its de ideias ----
     o mesmo pacto dos ramos: o que ele propoe aparece tracejado, ao lado do
     que estava selecionado (ou no meio da tela), e so vira do quadro o que
     for clicado. Enter fica com todos. */
  const generateStickies = async () => {
    const d = docRef.current;
    const sel = d.items.filter((it) => itemSel.indexOf(it.id) >= 0);
    const found = selectedId ? findNode(d.root, selectedId) : null;
    const focus = found ? found.node.title : itemTexts(sel).join(" / ") || d.root.title || d.name;
    const list = await callMerlin({
      map: d.name, path: [], note: "",
      node: "quadro de post-its — ideias sobre: " + String(focus).slice(0, 160),
      children: itemTexts(d.items).slice(0, 40), siblings: [],
      client: d.client ? (clientName(d.client) || "") : ""
    });
    if (!list) return;
    if (!list.length) { notify("o Merlin não teve ideias para isso"); return; }
    let k = 0;
    const grid = stickyGrid(list.map((s) => s.title), { x: 0, y: 0 }, toolOpts.sticky, () => "ghost-s:" + (k++));
    const anchor = sel.length ? unionBox(sel.map((it) => bboxOf(it, engine.boxOf))) : null;
    const gb = unionBox(grid.map((it) => bboxOf(it)));
    const at = anchor ? { x: anchor.x + anchor.w + 48 + gb.w / 2, y: anchor.y + anchor.h / 2 } : engine.viewCenter();
    setSuggestions(null);
    setStickyGhosts(placeAt(grid, at));
  };
  const acceptGhostItem = (gid) => {
    const list = stickyGhosts || [];
    const g = list.find((x) => x.id === gid);
    if (!g) return;
    const real = { ...g, id: newId() };
    if (!setItems(docRef.current.items.concat([real]))) return;
    const rest = list.filter((x) => x.id !== gid);
    setStickyGhosts(rest.length ? rest : null);
    setItemSel([real.id]); setSelectedId(null);
  };
  const acceptAllGhosts = () => {
    const list = stickyGhosts || [];
    if (!list.length) return;
    const real = list.map((g) => ({ ...g, id: newId() }));
    if (!setItems(docRef.current.items.concat(real))) return;
    setStickyGhosts(null);
    setItemSel(real.map((it) => it.id)); setSelectedId(null);
  };

  /* ---- modelos, formatos e bloco ----
     o que nao nasce de um clique nasce no meio da tela, ja selecionado. o
     que e grande (um modelo inteiro) ainda ganha enquadramento. */
  /* o meio da tela, se estiver livre; senao o primeiro lugar vago andando
     para a direita — um modelo largado em cima de post-its escondia os dois */
  const freeSpot = (list) => {
    const lb = localBoxOf(list, engine.boxOf);
    const size = unionBox(list.map((it) => bboxOf(it, lb)));
    const taken = docRef.current.items.map((it) => bboxOf(it, engine.boxOf));
    layout.forEach((info) => taken.push({ x: info.x - info.w / 2, y: info.y - info.h / 2, w: info.w, h: info.h }));
    const c = engine.viewCenter(), gap = 60;
    for (let i = 0; i < 40; i++) {
      const at = { x: c.x + i * (size.w / 2 + gap), y: c.y };
      const box = { x: at.x - size.w / 2 - gap / 2, y: at.y - size.h / 2 - gap / 2, w: size.w + gap, h: size.h + gap };
      if (!taken.some((t) => t.x < box.x + box.w && box.x < t.x + t.w && t.y < box.y + box.h && box.y < t.y + t.h)) return { at, moved: i > 0 };
    }
    return { at: c, moved: false };
  };
  const insertItems = (list, frameIt) => {
    const fresh = normalizeItems(list, newId);
    if (!fresh.length) return;
    const spot = freeSpot(fresh);
    const placed = placeAt(fresh, spot.at, engine.boxOf);
    if (!setItems(docRef.current.items.concat(placed))) return;
    setItemSel(placed.map((it) => it.id)); setSelectedId(null); setPanelOpen(false); setTool("select");
    if (frameIt || spot.moved) engine.frameBoxNext(unionBox(placed.map((it) => bboxOf(it, localBoxOf(placed, engine.boxOf)))));
    const doc1 = placed.length === 1 && placed[0].type === "doc" ? placed[0].id : null;
    if (doc1) setDocOpen(doc1);
  };
  const insertFormat = (kind) => insertItems(buildFormat(kind, newId), kind !== "table" && kind !== "doc");
  const insertDivider = () => insertItems([{ type: "line", kind: "line", x1: -200, y1: 0, x2: 200, y2: 0, color: 7, width: 2 }], false);
  const insertBulk = (texts, color) => {
    patchOpts({ sticky: color });
    insertItems(stickyGrid(texts, { x: 0, y: 0 }, color, newId), texts.length > 8);
  };
  /* os galhos de um modelo de mapa pendurados no no selecionado (ou na
     raiz). fora da raiz o ramo herda a cor de onde foi pendurado, como no
     colar mermaid */
  const graftTemplate = (tplId) => {
    const tpl = MAP_TEMPLATES.find((t) => t.id === tplId);
    if (!tpl) return;
    const d0 = docRef.current;
    const target = selectedId && findNode(d0.root, selectedId) ? selectedId : d0.root.id;
    const built = buildMap(tpl, tpl.name);
    mutate((d) => {
      const f = findNode(d.root, target);
      if (!f) return false;
      if (f.parent) built.children.forEach((c) => { c.color = 0; });
      f.node.children = (f.node.children || []).concat(built.children);
      f.node.collapsed = false;
    });
    setItemSel([]); setSelectedId(target);
    engine.frameNodeNext(target);
    notify("ramos do modelo pendurados");
  };
  const pickTemplate = (p) => {
    setTemplatesOpen(false);
    if (p.board) insertFormat(p.board);
    else if (p.map) graftTemplate(p.map);
  };
  const itemToDay = (iid) => {
    const it = itemById(iid);
    if (!it) return;
    const title = (it.type === "doc" ? it.title : it.text || "").trim().split("\n")[0].slice(0, 200);
    sendToDay({ title: title || doc.name, client: doc.client, origin: { type: "map", id: doc.id } });
  };
  /* o que a barra da esquerda e a barra da selecao pedem */
  const act = (what, a, b) => {
    switch (what) {
      case "undo": undo(); break;
      case "redo": redo(); break;
      case "branches": askSuggestions(selectedId || doc.root.id); break;
      case "generate": generateStickies(); break;
      case "templates": setTemplatesOpen(true); break;
      case "format": insertFormat(a); break;
      case "divider": insertDivider(); break;
      case "bulk": setBulkOpen(true); break;
      case "branch": createChild(selectedId || doc.root.id); break;
      case "mermaid": setImporting(true); break;
      case "help": setHelpOpen(true); break;
      case "patch": patchItems(a); break;
      case "textSize": textSize(a); break;
      case "table": tableShape(a, b); break;
      case "edit": editItem(a); break;
      case "toDay": itemToDay(a); break;
      case "front": reorder(true); break;
      case "back": reorder(false); break;
      case "duplicate": duplicateItems(itemSel); break;
      case "remove": removeItems(itemSel); break;
    }
  };
  const docItem = docOpen ? doc.items.find((it) => it.id === docOpen) : null;
  useEffect(() => { if (docOpen && !docItem) setDocOpen(null); }, [docOpen, !!docItem]);
  const editingTarget = editingItem ? doc.items.find((it) => it.id === editingItem.id) : null;
  useEffect(() => { if (editingItem && !editingTarget) setEditingItem(null); }, [editingItem, !!editingTarget]);
  /* Espaco segurado arrasta a tela; solto sem arrastar, colapsa o no como sempre */
  const selectedIdRef = useRef(selectedId); selectedIdRef.current = selectedId;
  const toggleRef = useRef(null); toggleRef.current = toggleCollapse;
  useEffect(() => {
    const up = (e) => {
      if (e.key !== " ") return;
      engine.setSpace(false);
      if (!engine.spacePanned() && !isTyping() && selectedIdRef.current) toggleRef.current(selectedIdRef.current);
    };
    const blur = () => engine.setSpace(false);
    document.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { document.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [engine]);

  /* ---- exportacao ---- */
  const resolveSvgVars = (root) => {
    const style = getComputedStyle(document.documentElement);
    const resolve = (v) => {
      const m = v && v.match(/^var\((--[a-z0-9-]+)\)$/i);
      return m ? (style.getPropertyValue(m[1]).trim() || v) : v;
    };
    root.querySelectorAll("*").forEach((el) => {
      ["fill", "stroke"].forEach((attr) => {
        const v = el.getAttribute(attr);
        if (v && v.indexOf("var(") === 0) el.setAttribute(attr, resolve(v));
      });
    });
  };
  const download = (blob, name) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  };
  const exportPng = () => {
    const svgEl = engine.svg();
    if (!svgEl) return;
    const vb = svgEl.viewBox.baseVal;
    const scale = 2;
    const copy = svgEl.cloneNode(true);
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("width", vb.width);
    copy.setAttribute("height", vb.height);
    const background = getComputedStyle(document.documentElement).getPropertyValue("--mp-canvas").trim() || "#111111";
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", vb.x); bg.setAttribute("y", vb.y);
    bg.setAttribute("width", vb.width); bg.setAttribute("height", vb.height);
    bg.setAttribute("fill", background);
    copy.insertBefore(bg, copy.firstChild);
    resolveSvgVars(copy);
    const text = new XMLSerializer().serializeToString(copy);
    const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    const name = (doc.name || "mapa") + ".png";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = vb.width * scale; canvas.height = vb.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => download(blob, name));
    };
    img.src = url;
  };
  /* a arvore como lista indentada — o mesmo texto que sai no arquivo e que vai
     pra area de transferencia */
  const outlineOf = () => {
    const lines = [];
    (function walk(node, depth) {
      lines.push("  ".repeat(depth) + "- " + (node.title || "(sem título)"));
      (node.children || []).forEach((c) => walk(c, depth + 1));
    })(doc.root, 0);
    return lines.join("\n") + "\n";
  };
  const exportOutline = () => {
    download(new Blob([outlineOf()], { type: "text/markdown;charset=utf-8" }), (doc.name || "mapa") + ".md");
  };
  const exportMermaid = () => {
    download(new Blob([toMermaid(doc.root)], { type: "text/plain;charset=utf-8" }), (doc.name || "mapa") + ".mmd");
  };

  /* copiar, e nao so baixar (22/09/2026): levar o mapa pra uma conversa com
     uma IA, pra outro mapa ou pra um documento e colar. baixar um .mmd pra
     abrir no bloco de notas e achar o texto que ja estava aqui era o caminho
     mais longo pro gesto mais comum. o mermaid e o que volta inteiro ("colar
     mermaid como ramo", logo abaixo no menu); a outline e pra ler e escrever
     em qualquer lugar. */
  const copyText = async (text, what) => {
    try { await navigator.clipboard.writeText(text); notify(what + " copiado"); }
    catch (e) { notify("não consegui copiar"); }
  };

  /* colar mermaid como ramo: a raiz colada vira o ultimo filho do no
     selecionado, num passo so do desfazer. as cores que o leitor deu ao
     primeiro nivel saem — dentro de um mapa, o ramo herda a cor de onde foi
     pendurado; so pendurado direto na raiz ele ganha a cor da vez. */
  const graftMermaid = ({ root }) => {
    const d0 = docRef.current;
    const targetId = selectedId && findNode(d0.root, selectedId) ? selectedId : d0.root.id;
    const branch = normalizeNode(root);
    const stack = [branch];
    while (stack.length) { const n = stack.pop(); n.color = 0; stack.push(...n.children); }
    if (JSON.stringify(d0).length + JSON.stringify(branch).length > 900000) { notify("o mapa ficaria grande demais com esse ramo"); return false; }
    const ok = mutate((d) => {
      const f = findNode(d.root, targetId);
      if (!f) return false;
      f.node.children = f.node.children || [];
      if (!f.parent) branch.color = (f.node.children.length % 6) + 1;
      f.node.children.push(branch);
      f.node.collapsed = false;
    });
    if (!ok) return false;
    setSuggestions(null);
    setSelectedId(branch.id);
    engine.frameNodeNext(branch.id);
    notify("ramo importado");
  };

  /* o motor le daqui, sempre a versao deste render */
  handlers.current = {
    select, edit, drop, closePanel,
    toggle: (nid) => { setSelectedId(nid); setItemSel([]); toggleCollapse(nid); },
    openNote: openNotePanel,
    commitItems, selectItems, clearSelection, editItem, acceptGhostItem
  };

  /* ---- teclado ----
     com um no da arvore selecionado, o teclado e o de sempre (Enter irmao,
     Tab filho, letras escrevem). com itens do quadro selecionados, apaga,
     duplica, copia, empurra e escreve. sem nada selecionado, cada letra arma
     uma ferramenta — como numa lousa. */
  const TOOL_KEYS = { v: "select", h: "hand", n: "sticky", t: "text", r: "shape", o: "shape", l: "line", a: "line", p: "pen", e: "eraser", f: "frame" };
  useKeydown((e) => {
    if (isTyping()) { if (e.key === "Escape") document.activeElement.blur(); return; }
    /* com uma caixa aberta, uma letra solta (foco num botao dela) nao pode
       comecar a editar nem armar nada escondido atras */
    if (importing || templatesOpen || bulkOpen || document.querySelector(".dialog")) return;
    if (e.key === " " && !e.ctrlKey && !e.metaKey) { e.preventDefault(); engine.setSpace(true); return; }
    if (flyout && e.key === "Escape") { e.preventDefault(); setFlyout(null); return; }
    /* as propostas estão no palco, não numa caixa por cima: Esc é o jeito de
       dispensá-las sem aceitar nenhuma, e vem antes de tudo */
    if (stickyGhosts && e.key === "Escape") { e.preventDefault(); setStickyGhosts(null); return; }
    if (stickyGhosts && e.key === "Enter") { e.preventDefault(); acceptAllGhosts(); return; }
    if (suggestions && e.key === "Escape") { e.preventDefault(); setSuggestions(null); return; }
    if (editing || editingItem) return; // o proprio campo trata suas teclas

    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (mod && e.key === "0") { e.preventDefault(); engine.frame(); return; }
    if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); engine.zoomCenter(0.85); return; }
    if (mod && e.key === "-") { e.preventDefault(); engine.zoomCenter(1 / 0.85); return; }
    if (mod && e.shiftKey && key === "z") { e.preventDefault(); redo(); return; }
    if (mod && key === "z") { e.preventDefault(); undo(); return; }
    if (mod && key === "y") { e.preventDefault(); redo(); return; }
    if (mod && key === "a" && !selectedId) { e.preventDefault(); selectItems(doc.items.map((it) => it.id)); return; }
    if (mod && key === "v" && boardClipboard && !selectedId) { e.preventDefault(); pasteItems(); return; }
    if (itemSel.length) {
      if (mod && key === "d") { e.preventDefault(); duplicateItems(itemSel); return; }
      if (mod && key === "c") { if (copyItems(itemSel)) e.preventDefault(); return; }
      if (mod && key === "x") { if (copyItems(itemSel)) { e.preventDefault(); removeItems(itemSel, true); } return; }
    }
    if (mod && e.key === "ArrowUp") { e.preventDefault(); if (selectedId) moveAmongSiblings(selectedId, -1); return; }
    if (mod && e.key === "ArrowDown") { e.preventDefault(); if (selectedId) moveAmongSiblings(selectedId, 1); return; }
    if (mod) return; // outros atalhos com modificador nao sao nossos

    if (e.key === "Escape" && tool !== "select") { setTool("select"); return; }

    if (itemSel.length) {
      const step = e.shiftKey ? 10 : 1;
      const one = selectedItems.length === 1 ? selectedItems[0] : null;
      switch (e.key) {
        case "Delete": case "Backspace": e.preventDefault(); removeItems(itemSel); return;
        case "Escape": clearSelection(); return;
        case "ArrowUp": e.preventDefault(); nudge(0, -step); return;
        case "ArrowDown": e.preventDefault(); nudge(0, step); return;
        case "ArrowLeft": e.preventDefault(); nudge(-step, 0); return;
        case "ArrowRight": e.preventDefault(); nudge(step, 0); return;
        case "Enter": case "F2": if (one) { e.preventDefault(); editItem(one.id); } return;
        default:
          /* uma letra com um post-it, forma ou texto selecionado ja escreve nele */
          if (one && e.key.length === 1 && !e.altKey && ["sticky", "shape", "text"].indexOf(one.type) >= 0) { e.preventDefault(); editItem(one.id, null, e.key); }
          else if (e.key === "s" || e.key === "S") { e.preventDefault(); generateStickies(); }
          return;
      }
    }

    /* funciona mesmo sem selecao (usa a raiz) — por isso vem antes do guard abaixo */
    if (key === "s") { e.preventDefault(); askSuggestions(selectedId || doc.root.id); return; }

    if (!selectedId) {
      if (e.key === "Escape") { closePanel(); return; }
      /* Tab e Enter sem selecao voltam para a arvore: filho da raiz, ou a raiz */
      if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); createChild(doc.root.id); return; }
      if (e.key === "Enter") { e.preventDefault(); select(doc.root.id); return; }
      if (e.key.startsWith("Arrow")) { e.preventDefault(); select(doc.root.id); return; }
      if (TOOL_KEYS[key] && !e.altKey) {
        e.preventDefault();
        if (key === "r") patchOpts({ shape: "rect" });
        if (key === "o") patchOpts({ shape: "oval" });
        if (key === "l") patchOpts({ line: "line" });
        if (key === "a") patchOpts({ line: "arrow" });
        armTool(TOOL_KEYS[key]);
      }
      return;
    }
    switch (e.key) {
      case "Enter": e.preventDefault(); createSibling(selectedId); break;
      case "Tab":
        e.preventDefault();
        if (e.shiftKey) { const f = findNode(doc.root, selectedId); if (f && f.parent) select(f.parent.id); }
        else createChild(selectedId);
        break;
      case "Delete": case "Backspace": e.preventDefault(); removeSelected(); break;
      case "ArrowUp": e.preventDefault(); navigate("up"); break;
      case "ArrowDown": e.preventDefault(); navigate("down"); break;
      case "ArrowLeft": e.preventDefault(); navigate("left"); break;
      case "ArrowRight": e.preventDefault(); navigate("right"); break;
      case "F2": e.preventDefault(); edit(selectedId); break;
      case "n": case "N": e.preventDefault(); openNotePanel(selectedId); break;
      /* Esc com um no selecionado fecha o painel; com o painel ja fechado,
         solta o no — e as letras voltam a armar ferramentas */
      case "Escape": if (panelOpen) closePanel(); else setSelectedId(null); break;
      default:
        if (e.key.length === 1 && !e.altKey) { e.preventDefault(); edit(selectedId, e.key); }
    }
  });

  /* um no em edicao que saiu da tela (pai colapsado, desfazer) perde o input */
  const editInfo = editing ? layout.get(editing.id) : null;
  useEffect(() => { if (editing && !editInfo) setEditing(null); }, [editing, editInfo]);

  return (
    <>
      <main className="page page--full mp-editor">
        {/* a barra de cima e so o indispensavel: voltar, o nome, enquadrar e
            compartilhar. as ferramentas do quadro (e o merlin) moram na
            coluna da esquerda, como numa lousa; exportar e atalhos, no "mais". */}
        <div className="mp-bar">
          <a className="action" href="maps.html" id="mp-back" title="voltar para os mapas" aria-label="Voltar"><BackIcon /></a>
          <input className="mp-name" id="mp-name" maxLength="120" aria-label="Nome do mapa" value={doc.name}
            onChange={(e) => { const v = e.currentTarget.value; mutate((d) => { d.name = v; }, { history: false }); }} />
          <button className="action" type="button" id="mp-frame" title="enquadrar (Ctrl+0)" aria-label="Enquadrar" onClick={() => engine.frame()}><FrameIcon /></button>
          <button className="action" type="button" id="mp-share" title="compartilhar um link só de leitura" aria-label="Compartilhar" onClick={() => setSharing(true)}>{icon("link")}</button>
          <button className="action" type="button" id="mp-more" title="mais" aria-label="Mais" onClick={() => setMenuOpen(true)}><MoreIcon /></button>
        </div>
        <MapCanvas engine={engine} layout={layout} selectedId={selectedId} rootId={doc.root.id} editing={!!editing || !!editingItem}
          items={doc.items} itemSel={itemSel} ghosts={stickyGhosts} tool={toolObj} editingItem={editingItem}
          onAddChild={() => createChild(selectedId || doc.root.id)}>
          <BoardToolbar tool={tool} opts={toolOpts} flyout={flyout} setFlyout={setFlyout} onTool={armTool} onOpts={patchOpts} thinking={thinking} act={act} />
          {selectedItems.length > 0 && !editingItem && <ItemBar engine={engine} items={selectedItems} act={act} />}
        </MapCanvas>
      </main>
      {editInfo && <EditOverlay key={editing.id} engine={engine} info={editInfo} initial={editing.initial}
        onConfirm={(v) => confirmEdit(editing.id, v)} onCancel={() => cancelEdit(editing.id)} />}
      {editingTarget && <ItemEditor key={editingItem.id + ":" + (editingItem.cell || "")} engine={engine} item={editingTarget}
        cell={editingItem.cell} initial={editingItem.initial} onConfirm={confirmItemEdit} />}
      {panelOpen && selectedNode && <NodePanel key={selectedNode.node.id} node={selectedNode.node} onClose={closePanel}
        onFieldFocus={captureField} onFieldBlur={releaseField}
        onTitle={(v) => { captureField(); withSelected((n) => { n.title = v; }, { history: false }); }}
        onNote={(v) => { captureField(); withSelected((n) => { n.note = v; }, { history: false }); }}
        onLink={(v) => withSelected((n) => { n.link = v.trim(); })}
        onColor={(c) => withSelected((n) => { n.color = c; })}
        onPull={pullToDay} onIdea={toIdea} />}
      {docItem && <DocPanel key={docItem.id} item={docItem} onClose={() => setDocOpen(null)}
        onFieldFocus={captureField} onFieldBlur={releaseField}
        onTitle={(v) => { captureField(); patchItems((it) => ({ ...it, title: v }), [docItem.id]); }}
        onText={(v) => { captureField(); patchItems((it) => ({ ...it, text: v }), [docItem.id]); }}
        onIdea={() => {
          const now = Date.now();
          collection("notes").save({ id: newId(), title: docItem.title || doc.name, body: docItem.text || "", stage: "seed", client: doc.client, steps: [], outputs: [], history: [], createdAt: now, updatedAt: now });
          notify("virou nota");
        }} />}
      {menuOpen && (
        <Dialog title="mais" onClose={() => setMenuOpen(false)}>
          <div className="mp-menu">
            <button className="pill" type="button" onClick={() => { setMenuOpen(false); copyText(toMermaid(doc.root), "mermaid"); }}>{icon("copy")}copiar mermaid</button>
            <button className="pill" type="button" onClick={() => { setMenuOpen(false); copyText(outlineOf(), "outline"); }}>{icon("copy")}copiar outline</button>
            <button className="pill" type="button" onClick={() => { setMenuOpen(false); exportPng(); }}>exportar png</button>
            <button className="pill" type="button" onClick={() => { setMenuOpen(false); exportOutline(); }}>exportar outline</button>
            <button className="pill" type="button" onClick={() => { setMenuOpen(false); exportMermaid(); }}>exportar mermaid</button>
            <button className="pill" type="button" onClick={() => { setMenuOpen(false); setImporting(true); }}>colar mermaid como ramo</button>
            <button className="pill" type="button" onClick={() => { setMenuOpen(false); setHelpOpen(true); }}>atalhos do teclado</button>
          </div>
        </Dialog>
      )}
      {importing && <MermaidDialog branch onImport={graftMermaid} onClose={() => setImporting(false)} />}
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
      {sharing && <ShareDialog type="maps" id={doc.id} name={doc.name} onClose={() => setSharing(false)} />}
      {templatesOpen && <TemplatesDialog hasNode={!!selectedId} onPick={pickTemplate} onClose={() => setTemplatesOpen(false)} />}
      {bulkOpen && <BulkDialog color={toolOpts.sticky} onCreate={insertBulk} onClose={() => setBulkOpen(false)} />}
      {suggestions && <p className="mp-ghost-hint" id="mp-ghost-hint">clique num ramo tracejado para ficar com ele · <kbd>Esc</kbd> dispensa</p>}
      {stickyGhosts && (
        <div className="mp-ghost-hint bd-ghost-bar" id="bd-ghost-hint">
          <span>clique num post-it tracejado para ficar com ele</span>
          <button type="button" className="pill pill--mini pill--green" onClick={acceptAllGhosts}>ficar com todos <kbd>Enter</kbd></button>
          <button type="button" className="pill pill--mini" onClick={() => setStickyGhosts(null)}>dispensar <kbd>Esc</kbd></button>
        </div>
      )}
    </>
  );
}

/* ---------- a tela do mapa ----------
   o svg, a dica do arraste, o "+" do celular e o que flutua em cima do
   quadro (barra de ferramentas, barra da selecao). o desenho e do motor:
   entra pelo attach() ao montar e recebe update() quando algo muda. */
function MapCanvas({ engine, layout, selectedId, rootId, editing, items, itemSel, ghosts, tool, editingItem, onAddChild, children }) {
  const svgRef = useRef(null), hintRef = useRef(null);
  useLayoutEffect(() => { engine.attach(svgRef.current, hintRef.current); return () => engine.detach(); }, [engine]);
  useLayoutEffect(() => {
    engine.update({ layout, selectedId, rootId, editing, items, itemSel, ghosts, tool, editingItem });
  }, [engine, layout, selectedId, rootId, editing, items, itemSel, ghosts, tool, editingItem]);
  return (
    <div className="mp-body">
      <svg ref={svgRef} className="mp-svg" id="mp-svg" aria-label="Quadro do mapa"></svg>
      <div ref={hintRef} className="mp-hint" id="mp-hint" hidden>solte em cima de um nó = vira filho · ao lado de um irmão = reordena</div>
      <button className="mp-fab" type="button" id="mp-fab" title="Novo filho do nó selecionado" onClick={onAddChild}><FabIcon /></button>
      {children}
    </div>
  );
}

/* ---------- edicao inline do titulo ----------
   um textarea deitado por cima do proprio no. Enter confirma, Esc cancela,
   blur confirma. o `closed` evita que o blur que o navegador dispara ao
   tirar o textarea da tela confirme uma segunda vez. */
function EditOverlay({ engine, info, initial, onConfirm, onCancel }) {
  const ref = useRef(null), closed = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current, r = engine.screenRectOf(info);
    el.style.left = r.left + "px";
    el.style.top = r.top + "px";
    el.style.width = r.width + "px";
    el.style.minHeight = r.height + "px";
    el.style.fontSize = Math.max(10, 13 * r.scale) + "px";
    if (initial != null) {
      el.value = initial; el.focus();
      el.setSelectionRange(el.value.length, el.value.length); // cursor no fim, nao no começo
    } else { el.value = info.node.title; el.focus(); el.select(); }
  }, []);
  const confirm = () => { if (closed.current) return; closed.current = true; onConfirm(ref.current.value.trim()); };
  const cancel = () => { if (closed.current) return; closed.current = true; onCancel(); };
  return <textarea ref={ref} className="mp-edit" onBlur={confirm}
    onKeyDown={(e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); confirm(); }
      else if (e.key === "Escape") { e.preventDefault(); cancel(); }
    }} />;
}

/* ---------- painel do no ---------- */
function NodePanel({ node, onClose, onFieldFocus, onFieldBlur, onTitle, onNote, onLink, onColor, onPull, onIdea }) {
  const [noteEditing, setNoteEditing] = useState(false);
  /* o link so grava no change: ate la o valor e local, para uma gravacao no
     meio da digitacao nao apagar o que esta sendo escrito */
  const [link, setLink] = useState(node.link);
  useEffect(() => { setLink(node.link); }, [node.link]);
  const noteRef = useRef(null);
  useLayoutEffect(() => { if (noteEditing && noteRef.current) noteRef.current.focus(); }, [noteEditing]);
  return (
    <aside className="mp-panel" id="mp-panel" role="dialog" aria-label="Detalhes do nó">
      <button className="action mp-panel__close" type="button" id="panel-close" aria-label="Fechar (Esc)" onClick={onClose}>✕</button>
      <h2>nó</h2>
      <div>
        <label className="field-label" htmlFor="panel-title">título</label>
        <input className="input" id="panel-title" maxLength="300" value={node.title} onFocus={onFieldFocus} onBlur={onFieldBlur} onChange={(e) => onTitle(e.currentTarget.value)} />
      </div>
      <div>
        <label className="field-label">cor do ramo</label>
        <div className="mp-colors" id="panel-colors">
          {COLORS.map((c) => (
            <button key={c} type="button" className="mp-color" aria-pressed={node.color === c} style={c ? { background: colorVar(c) } : undefined} title={"cor " + c} onClick={() => onColor(c)}></button>
          ))}
        </div>
      </div>
      <div>
        <label className="field-label" htmlFor="panel-link">link</label>
        {/* o change nativo (blur com o valor mudado) nao existe no React: o
            equivalente e gravar no blur so quando o texto saiu diferente */}
        <input className="input" id="panel-link" type="url" placeholder="https://" value={link}
          onChange={(e) => setLink(e.currentTarget.value)}
          onBlur={(e) => { if (e.currentTarget.value !== node.link) onLink(e.currentTarget.value); }} />
      </div>
      <div>
        <label className="field-label" htmlFor="panel-note">nota</label>
        {noteEditing
          ? <textarea ref={noteRef} className="textarea" id="panel-note" value={node.note} onFocus={onFieldFocus}
              onBlur={() => { onFieldBlur(); setNoteEditing(false); }} onChange={(e) => onNote(e.currentTarget.value)} />
          : <div className="mp-note-render" id="panel-note-render" tabIndex="0" onClick={() => setNoteEditing(true)}>
              {node.note.trim() ? <Markdown text={node.note} /> : <span className="mp-note-empty">sem nota — clique para escrever</span>}
            </div>}
      </div>
      <div className="row">
        <button className="pill pill--mini" type="button" id="panel-day" onClick={onPull}>puxar para o dia</button>
        <button className="pill pill--mini" type="button" id="panel-idea" onClick={onIdea}>virar nota</button>
      </div>
    </aside>
  );
}

/* ---------- atalhos ---------- */
function HelpDialog({ onClose }) {
  const rows = [
    ["arrastar", "solta em cima de um nó = vira filho · ao lado de um irmão = reordena"],
    ["clique no ponto", "colapsa / expande o ramo (o selo +n reabre)"],
    ["duplo clique", "edita o título"],
    ["roda / pinça", "zoom · arrastar o fundo move a tela"],
    [<kbd>Enter</kbd>, "cria irmão abaixo e edita"],
    [<kbd>Tab</kbd>, "cria filho e edita"],
    [<><kbd>Shift</kbd> <kbd>Tab</kbd></>, "seleciona o pai"],
    [<kbd>Delete</kbd>, "apaga o nó e a subárvore (com desfazer)"],
    ["↑ ↓ ← →", "navega entre irmãos, pai e filhos"],
    [<kbd>F2</kbd>, "edita o título (ou comece a digitar)"],
    [<kbd>Espaço</kbd>, "colapsa / expande"],
    [<><kbd>Ctrl</kbd> ↑ ↓</>, "move o nó entre os irmãos"],
    [<><kbd>Ctrl</kbd> <kbd>Z</kbd></>, "desfazer"],
    [<><kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>Z</kbd></>, "refazer"],
    [<><kbd>Ctrl</kbd> <kbd>0</kbd></>, "enquadra o mapa"],
    [<><kbd>Ctrl</kbd> <kbd>+</kbd> / <kbd>−</kbd></>, "zoom"],
    [<kbd>N</kbd>, "abre a nota do nó selecionado"],
    [<kbd>S</kbd>, "merlin desenha ramos tracejados no nó selecionado; clique num deles para ficar com ele"],
    [<kbd>Esc</kbd>, "cancela a edição / fecha o painel / solta a seleção"],
    ["quadro", "com nada selecionado, uma letra arma a ferramenta:"],
    [<><kbd>V</kbd> <kbd>H</kbd></>, "selecionar · mover a tela (ou segure Espaço, ou arraste com o botão direito)"],
    [<><kbd>N</kbd> <kbd>T</kbd></>, "post-it · texto — clique no quadro para colocar"],
    [<><kbd>R</kbd> <kbd>O</kbd> <kbd>F</kbd></>, "retângulo · oval · moldura — clique, ou arraste para dar o tamanho"],
    [<><kbd>L</kbd> <kbd>A</kbd></>, "linha · seta — solte a ponta em cima de algo e ela fica presa"],
    [<><kbd>P</kbd> <kbd>E</kbd></>, "caneta · borracha"],
    ["arrastar no vazio", "seleciona em retângulo (Shift soma à seleção)"],
    [<><kbd>Ctrl</kbd> <kbd>C</kbd> / <kbd>V</kbd> / <kbd>D</kbd></>, "copia · cola (também em outro mapa) · duplica"],
    [<><kbd>Ctrl</kbd> <kbd>A</kbd></>, "seleciona tudo do quadro"],
    ["setas", "com itens selecionados, empurram 1 (Shift: 10)"],
    [<kbd>Enter</kbd>, "com um item selecionado, escreve nele (ou comece a digitar)"]
  ];
  return (
    <Dialog title="atalhos do mapa" sub="teclado para escrever rápido, mouse para reorganizar" label="Atalhos do mapa" onClose={onClose}>
      <table className="table mp-shortcuts"><tbody>
        {rows.map((r, i) => <tr key={i}><td>{r[0]}</td><td>{r[1]}</td></tr>)}
      </tbody></table>
    </Dialog>
  );
}


mount(<Maps />, "app");
