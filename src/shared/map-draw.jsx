/* merlin · o desenho do mapa
   o layout em arvore e as pilulas, as arestas e a grade que o editor
   (maps.html) e a pagina publica (share.html) pintam do MESMO jeito. mora
   aqui porque o link compartilhado tem que ser o mapa de verdade, e nao uma
   leitura parecida com ele: duas copias do desenho divergiriam na primeira
   mudanca de uma delas. */

/* ---------- utilidades de arvore ---------- */
export function countNodes(node) { return 1 + (node.children || []).reduce((s, c) => s + countNodes(c), 0); }
/* o no com esse id, ou null — so leitura, sem pai nem indice */
export function findNodeIn(node, id) {
  if (node.id === id) return node;
  for (const c of node.children || []) { const r = findNodeIn(c, id); if (r) return r; }
  return null;
}
export function collectIds(node, target) { target.add(node.id); (node.children || []).forEach((c) => collectIds(c, target)); }

/* ---------- layout automatico em arvore ----------
   raiz no centro; filhos vao para a direita primeiro. so quando a raiz tem
   mais de 4 filhos e que o excesso (os ultimos, na ordem) migra para a
   esquerda — e a migracao escolhe o ponto de corte que mais equilibra a
   soma de altura dos dois lados. subarvores de um no seguem sempre o lado
   que o no recebeu da raiz. altura de uma subarvore e a pilha simples dos
   filhos (soma + espacamento), nunca menos que a altura do proprio no. */
export const LINE_H = 17, NODE_PAD_X = 14, NODE_PAD_Y = 7;
export const ROOT_PAD_X = 18, ROOT_PAD_Y = 9;
export const MAX_TEXT_W = 200;
export const GAP_H = 58, SPACING_V = 12;
export const CORNER_R = 10; // canto arredondado onde o ramo sai do tronco

const measureCanvas = document.createElement("canvas");
const measureCtx = measureCanvas.getContext("2d");

export function wrapText(ctx, text, maxWidth, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const attempt = current ? current + " " + w : w;
    if (!current || ctx.measureText(attempt).width <= maxWidth) { current = attempt; continue; }
    lines.push(current);
    current = w;
    if (lines.length === maxLines - 1) {
      let rest = [w].concat(words.slice(i + 1)).join(" ");
      if (ctx.measureText(rest).width > maxWidth) {
        while (rest.length > 1 && ctx.measureText(rest + "…").width > maxWidth) rest = rest.slice(0, -1);
        rest = rest.replace(/\s+$/, "") + "…";
      }
      lines.push(rest);
      return lines;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function measureNode(title, isRoot) {
  measureCtx.font = (isRoot ? "600 14px" : "500 13px") + " Sora, system-ui, sans-serif";
  const text = String(title || "").trim() || "(sem título)";
  const freeWidth = measureCtx.measureText(text).width;
  const lines = freeWidth <= MAX_TEXT_W ? [text] : wrapText(measureCtx, text, MAX_TEXT_W, 3);
  const width = Math.min(MAX_TEXT_W, Math.max.apply(null, lines.map((l) => measureCtx.measureText(l).width)));
  const padX = isRoot ? ROOT_PAD_X : NODE_PAD_X, padY = isRoot ? ROOT_PAD_Y : NODE_PAD_Y;
  return {
    w: Math.max(44, Math.round(width) + padX * 2),
    h: padY * 2 + lines.length * LINE_H,
    lines
  };
}

/* devolve um Map id->info com x,y,w,h,lines,side,parentId,subH,branchColor
   — so os nos visiveis entram aqui (filho de no colapsado nunca e medido
   nem colocado), e a ordem de insercao e a mesma da busca em profundidade,
   o que basta para desenhar (nos nao se sobrepoem, entao a ordem de pintura
   nao importa). a cor efetiva de cada ramo ja vem propagada. */
export function computeLayout(root) {
  const layout = new Map();
  function measure(node, isRoot) {
    const { w, h, lines } = measureNode(node.title, isRoot);
    layout.set(node.id, { node, w, h, lines, x: 0, y: 0, side: null, subH: 0, parentId: null, branchColor: 0 });
  }
  function subtreeHeight(node, isRoot) {
    measure(node, isRoot);
    const info = layout.get(node.id);
    const children = node.collapsed ? [] : (node.children || []);
    if (!children.length) { info.subH = info.h; return info.subH; }
    let sum = 0;
    children.forEach((c, i) => { sum += subtreeHeight(c, false); if (i < children.length - 1) sum += SPACING_V; });
    info.subH = Math.max(sum, info.h);
    return info.subH;
  }
  subtreeHeight(root, true);
  const rootInfo = layout.get(root.id);
  rootInfo.x = 0; rootInfo.y = 0; rootInfo.side = "root";

  function splitRootChildren() {
    const children = root.collapsed ? [] : (root.children || []);
    if (children.length <= 4) return { right: children.slice(), left: [] };
    const heights = children.map((c) => layout.get(c.id).subH);
    const total = heights.reduce((a, b) => a + b, 0);
    let bestK = 1, bestDiff = Infinity;
    for (let k = 1; k < children.length; k++) {
      const leftHeight = heights.slice(children.length - k).reduce((a, b) => a + b, 0);
      const diff = Math.abs((total - leftHeight) - leftHeight);
      if (diff < bestDiff) { bestDiff = diff; bestK = k; }
    }
    return { left: children.slice(children.length - bestK), right: children.slice(0, children.length - bestK) };
  }

  function place(list, parent, side) {
    if (!list.length) return;
    const parentInfo = layout.get(parent.id);
    const totalH = list.reduce((s, c) => s + layout.get(c.id).subH, 0) + SPACING_V * (list.length - 1);
    let cursor = parentInfo.y - totalH / 2;
    list.forEach((c) => {
      const info = layout.get(c.id);
      info.y = cursor + info.subH / 2;
      info.x = side === "right" ? parentInfo.x + parentInfo.w / 2 + GAP_H + info.w / 2 : parentInfo.x - parentInfo.w / 2 - GAP_H - info.w / 2;
      info.side = side;
      info.parentId = parent.id;
      cursor += info.subH + SPACING_V;
      place(c.collapsed ? [] : (c.children || []), c, side);
    });
  }

  const { left, right } = splitRootChildren();
  place(right, root, "right");
  place(left, root, "left");
  propagateColors(root, root.color > 0 ? root.color : 0, layout);
  return layout;
}

export function propagateColors(node, inherited, layout) {
  const info = layout.get(node.id);
  if (!info) return;
  info.branchColor = node.color > 0 ? node.color : inherited;
  (node.children || []).forEach((c) => propagateColors(c, info.branchColor, layout));
}

export function colorVar(color) {
  if (!color) return "var(--ink-30)";
  if (color === 5) return "var(--green-ink)";
  return "var(--mc" + color + ")";
}

/* ---------- desenho ----------
   pilulas cheias, sem borda: a raiz em tinta, os ramos na cor da pilula e o
   selecionado em verde. o ponto no lado de saida de um no que tem filhos e
   o botao de colapsar — fechado, vira um selo "+n". as arestas sao um
   barramento por pai: um tronco vertical na cor do pai, e cada filho sai
   dele com um canto arredondado na propria cor.

   tudo aqui devolve elemento do React: o motor pinta com um root proprio,
   preso ao <svg> e guardado no fecho — nunca um root novo por quadro. e o
   React quem encosta no svg, entao o titulo entra como texto e nao ha o que
   escapar; e como ele remenda atributo no lugar em vez de refazer a arvore,
   o <rect> que recebeu o pointerdown continua no documento e o clique duplo
   do navegador ainda nasce (foi por isso que o desenho por createElementNS,
   que refaz tudo a cada quadro, nao serviu aqui). */
export function edgeColor(color) { return color ? colorVar(color) : "var(--mp-edge)"; }

export function svgPill(info, node, isRoot, state) {
  const w = info.w, h = info.h, lines = info.lines, rx = h / 2;
  const selected = state === "selected", ghost = state === "ghost";
  const fill = ghost ? "var(--mp-canvas)" : selected ? "var(--green)" : isRoot ? "var(--ink)" : "var(--mp-pill)";
  const ink = ghost ? "var(--ink-50)" : selected ? "var(--on-green)" : isRoot ? "var(--bg)" : "var(--mp-pill-ink)";
  const stroke = ghost ? "var(--ink-30)" : selected || isRoot ? "none" : "var(--mp-pill-border)";
  const firstY = -(lines.length * LINE_H) / 2 + LINE_H * 0.72;
  return [
    <rect key="pill" className="mp-pill" data-state={ghost ? "ghost" : selected ? "selected" : "normal"} x={-w / 2} y={-h / 2} width={w} height={h} rx={rx}
      fill={fill} stroke={stroke} strokeWidth="1" strokeDasharray={ghost ? "5 4" : null} />,
    lines.map((l, i) => <text key={i} x="0" y={(firstY + i * LINE_H).toFixed(1)} textAnchor="middle" fontFamily="Sora, system-ui, sans-serif"
      fontSize={isRoot ? 14 : 13} fontWeight={isRoot ? 600 : 500} fill={ink} textDecoration={node.link ? "underline" : null} pointerEvents="none">{l}</text>)
  ];
}

export function svgNode(info, node, isRoot, pos, selectedId, drag) {
  const w = info.w, h = info.h, rx = h / 2;
  const state = node.ghost ? "ghost" : node.id === selectedId ? "selected" : "normal";
  const dragged = drag && drag.descendants.has(node.id);
  const childTarget = drag && drag.target && drag.target.type === "child" && drag.target.id === node.id;
  const extras = [];
  if (childTarget) {
    extras.push(<rect key="alvo" x={-w / 2 - 5} y={-h / 2 - 5} width={w + 10} height={h + 10} rx={rx + 5} fill="none" stroke="var(--green-ink)" strokeWidth="2" strokeDasharray="4 4" pointerEvents="none" />);
  } else if (state === "selected" && isRoot) {
    extras.push(<rect key="alvo" x={-w / 2 - 4} y={-h / 2 - 4} width={w + 8} height={h + 8} rx={rx + 4} fill="none" stroke="var(--green-ink)" strokeWidth="1.5" pointerEvents="none" />);
  }
  const decorations = [];
  /* o fantasma nao tem nota nem filhos para decorar: ele ganha um "+", que
     e a unica coisa que da para fazer com ele */
  if (node.ghost) {
    const sx = info.side === "left" ? -1 : 1;
    decorations.push(
      <g key="mais" pointerEvents="none" transform={"translate(" + (sx * (w / 2 - 1)) + ",0)"}>
        <circle r="7" fill="var(--mp-canvas)" stroke="var(--ink-30)" strokeWidth="1" strokeDasharray="2.6 2.2" />
        <path d="M-3.2 0h6.4M0 -3.2v6.4" stroke="var(--ink-30)" strokeWidth="1.4" strokeLinecap="round" fill="none" /></g>
    );
  } else if (node.note) decorations.push(<circle key="nota" data-note="1" cx={w / 2 - 4} cy={-h / 2 + 4} r="3.5" fill="var(--green-ink)" stroke="var(--mp-canvas)" strokeWidth="1.5"><title>abrir a nota</title></circle>);
  const children = node.children || [];
  const badge = (label, fill, tx) => {
    const lw = 14 + label.length * 6.5;
    return (
      <g key="toggle" className="mp-toggle" data-toggle="1" transform={"translate(" + tx(lw) + ",0)"}><title>expandir</title>
        <rect x={-lw / 2} y="-9" width={lw} height="18" rx="9" fill={fill} />
        <text textAnchor="middle" y="3.5" fontFamily="JetBrains Mono, monospace" fontSize="10" fontWeight="500" fill="var(--bg)" pointerEvents="none">{label}</text></g>
    );
  };
  if (children.length && !isRoot) {
    /* o ponto de saida: onde o tronco dos filhos nasce. clique = colapsar */
    const sx = info.side === "left" ? -1 : 1;
    const color = edgeColor(info.branchColor);
    if (node.collapsed) decorations.push(badge("+" + (countNodes(node) - 1), color, (lw) => sx * (w / 2 + 2 + lw / 2)));
    else decorations.push(
      <g key="toggle" className="mp-toggle" data-toggle="1" transform={"translate(" + (sx * w / 2) + ",0)"}><title>colapsar</title>
        <circle r="9" fill="transparent" /><circle r="3.6" fill={color} stroke="var(--mp-canvas)" strokeWidth="1.5" /></g>
    );
  } else if (isRoot && children.length && node.collapsed) {
    decorations.push(badge("+" + (countNodes(node) - 1), "var(--ink)", (lw) => w / 2 + 2 + lw / 2));
  }
  return (
    <g key={node.id} className={"mp-node" + (dragged ? " mp-node--dragged" : "") + (node.ghost ? " mp-node--ghost" : "")} data-id={node.id} transform={"translate(" + pos.x.toFixed(1) + "," + pos.y.toFixed(1) + ")"}>
      {extras}{svgPill(info, node, isRoot, state)}{decorations}</g>
  );
}

/* barramento de um pai: tronco + um ramo por filho. `posOf` resolve a
   posicao desenhada (pode ser a interpolada, no meio de uma animacao). */
export function svgEdgesOf(parentInfo, childrenInfo, posOf) {
  if (!childrenInfo.length) return [];
  const side = childrenInfo[0].side, sx = side === "right" ? 1 : -1;
  const pp = posOf(parentInfo);
  const x1 = pp.x + sx * parentInfo.w / 2, y1 = pp.y;
  const childEdge = (c) => posOf(c).x - sx * c.w / 2;
  /* o tronco fica no meio do vao entre o pai e o filho mais proximo */
  let nearest = childEdge(childrenInfo[0]);
  childrenInfo.forEach((c) => { const b = childEdge(c); if (sx * (b - x1) < sx * (nearest - x1)) nearest = b; });
  const xT = (x1 + nearest) / 2;
  const parentColor = edgeColor(parentInfo.branchColor);
  let k = 0; // a chave da aresta e a ordem em que ela nasce neste barramento
  /* `ghost` deixa o ramo tracejado e apagado: o desenho tem que dizer que
     aquele galho ainda e proposta, sem precisar de legenda */
  const seg = (ax, ay, bx, by, color, ghost) => <line key={k++} x1={ax} y1={ay} x2={bx} y2={by} stroke={color} strokeWidth="1.5" pointerEvents="none" strokeDasharray={ghost ? "5 4" : null} opacity={ghost ? ".5" : null} />;
  const path = (d, color, ghost) => <path key={k++} d={d} fill="none" stroke={color} strokeWidth="1.5" pointerEvents="none" strokeDasharray={ghost ? "5 4" : null} opacity={ghost ? ".5" : null} />;
  const out = [];
  const ys = childrenInfo.map((c) => { const y = posOf(c).y; return Math.abs(y - y1) < 1 ? y1 : y; });
  const yMin = Math.min.apply(null, ys.concat([y1])), yMax = Math.max.apply(null, ys.concat([y1]));
  const r = Math.max(0, Math.min(CORNER_R, Math.abs(xT - x1) - 1, Math.abs(nearest - xT) - 1));
  /* tronco: se o pai esta numa das pontas, a stub entra nele com canto; se
     esta no meio, e um T e o tronco passa reto por y1 */
  const inMiddle = yMin < y1 - 0.5 && yMax > y1 + 0.5;
  const top = yMin === y1 ? y1 : yMin + r, bottom = yMax === y1 ? y1 : yMax - r;
  if (inMiddle) {
    out.push(seg(x1, y1, xT, y1, parentColor), seg(xT, top, xT, bottom, parentColor));
  } else if (yMax - yMin < 1) {
    out.push(seg(x1, y1, xT, y1, parentColor));
  } else if (yMin === y1) {
    out.push(path("M" + x1 + " " + y1 + " H" + (xT - sx * r) + " Q" + xT + " " + y1 + " " + xT + " " + (y1 + r) + " V" + bottom, parentColor));
  } else {
    out.push(path("M" + x1 + " " + y1 + " H" + (xT - sx * r) + " Q" + xT + " " + y1 + " " + xT + " " + (y1 - r) + " V" + top, parentColor));
  }
  childrenInfo.forEach((c) => {
    const y2 = posOf(c).y, x2 = childEdge(c), color = edgeColor(c.branchColor), ghost = !!c.node.ghost;
    if (Math.abs(y2 - y1) < 1) { out.push(seg(xT, y2, x2, y2, color, ghost)); return; }
    const sy = y2 > y1 ? 1 : -1;
    out.push(path("M" + xT + " " + (y2 - sy * r) + " Q" + xT + " " + y2 + " " + (xT + sx * r) + " " + y2 + " H" + x2, color, ghost));
  });
  return out;
}

/* indicador de onde o no arrastado vai cair entre irmaos: uma barra verde
   na fenda, do tamanho da pilula vizinha */
export function svgSiblingIndicator(layout, posOf, drag) {
  const target = drag && drag.target;
  if (!target || target.type !== "sibling") return null;
  const info = layout.get(target.id);
  if (!info) return null;
  const p = posOf(info);
  const y = target.before ? p.y - info.h / 2 - SPACING_V / 2 : p.y + info.h / 2 + SPACING_V / 2;
  const sx = info.side === "left" ? -1 : 1;
  return (
    <g pointerEvents="none"><rect x={p.x - info.w / 2} y={y - 1.5} width={info.w} height="3" rx="1.5" fill="var(--green)" />
      <circle cx={p.x - sx * info.w / 2} cy={y} r="4" fill="var(--green)" /></g>
  );
}

export function svgGhost(layout, drag) {
  if (!drag || !drag.pos) return null;
  const info = layout.get(drag.id);
  if (!info) return null;
  return <g className="mp-ghost" transform={"translate(" + drag.pos.x.toFixed(1) + "," + drag.pos.y.toFixed(1) + ")"} opacity=".92">{svgPill(info, info.node, false, "selected")}</g>;
}

/* a opacidade da grade tambem vem no desenho, e nao so do applyGrid: o root
   do svg pinta depois que update() volta, e sem isto a primeira pintura de um
   mapa grande (zoom longe) nasceria com a grade acesa ate o primeiro pan. */
export const svgGrid = (opacity) => (
  <><defs><pattern id="mp-grid" patternUnits="userSpaceOnUse" width="24" height="24"><circle cx="1" cy="1" r="1" fill="var(--mp-dot)" /></pattern></defs>
    <rect id="mp-grid-bg" x="-100000" y="-100000" width="200000" height="200000" fill="url(#mp-grid)" pointerEvents="none" style={{ opacity }} /></>
);

