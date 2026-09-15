/* merlin · a página compartilhada
   um mapa ou um funil aberto por quem não tem conta. é a única tela do sistema
   que existe para outra pessoa que não o dono.

   ela é o PRÓPRIO mapa e o PRÓPRIO funil, e não uma leitura parecida com eles:
   o mesmo layout, as mesmas pílulas, os mesmos cartões e as mesmas taxas nas
   arestas — o desenho vem de map-draw.jsx e funnel-draw.js, os módulos que o
   editor também usa. a versão anterior virava documento (uma coluna de etapas,
   uma árvore de tópicos), e quem recebia o link não reconhecia o que tinha
   sido desenhado.

   o que ela tira é a mão de quem edita: não tem barra de navegação, não tem
   sessão, não grava nada. dá para andar (arrastar), aproximar (roda, pinça,
   botões), abrir e fechar galho no mapa e ler o que uma etapa ou um nó guarda —
   e nada disso sai deste navegador. o token no endereço é a credencial
   inteira, e o que ele abre é UM documento. */
import "./shared/base.css";
import "./maps.css";
import "./funnels.css";
import "./share.css";
import { readShared } from "./shared/core.js";
import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { mount, Markdown, icon } from "./shared/ui.jsx";
import { LOGO } from "./shared/icons.jsx";
import { computeLayout, svgNode, svgEdgesOf, svgGrid, findNodeIn } from "./shared/map-draw.jsx";
import { NODE_W, NODE_H } from "./shared/funnel-layout.js";
import {
  typeOf, labelOf, formatNumber, LINKED_GROUPS, linkedCounts, computeProjections, drawNode, drawEdge
} from "./shared/funnel-draw.js";

const MIN_K = 0.15, MAX_K = 2.5;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const MinusIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>;
const PlusIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
const FitIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4H5a1 1 0 00-1 1v4M15 4h4a1 1 0 011 1v4M9 20H5a1 1 0 01-1-1v-4M15 20h4a1 1 0 001-1v-4" /></svg>;
const CloseIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;

/* ================================================================
   andar e aproximar
   ================================================================
   a vista é {x, y, k}: o mundo desenhado em translate(x,y) scale(k). os dois
   palcos usam a mesma, e ela nunca passa pelo estado do React — o arrasto tem
   que responder no quadro em que o dedo anda. `onTap` recebe o alvo de um
   toque que não virou arrasto: é o clique, do jeito que o toque o entende. */
function usePanZoom({ wrapRef, worldRef, bounds, onView, onTap }) {
  const view = useRef(null);
  const latest = useRef({ bounds, onView, onTap });
  latest.current = { bounds, onView, onTap };

  const apply = () => {
    const v = view.current;
    if (!v || !worldRef.current) return;
    worldRef.current.setAttribute("transform", "translate(" + v.x + "," + v.y + ") scale(" + v.k + ")");
    if (latest.current.onView) latest.current.onView(v);
  };
  /* enquadrar: cabe tudo com margem, nunca maior que o tamanho real e com
     piso numa tela estreita — lá, o que não couber começa pelo canto de cima
     à esquerda, que é por onde um funil e um mapa se leem. */
  const fit = () => {
    const wrap = wrapRef.current, b = latest.current.bounds();
    if (!wrap || !b) return;
    const r = wrap.getBoundingClientRect();
    const top = 72, bottom = 24, side = 24;
    const aw = Math.max(100, r.width - side * 2), ah = Math.max(100, r.height - top - bottom);
    const bw = Math.max(1, b[2] - b[0]), bh = Math.max(1, b[3] - b[1]);
    const floor = r.width < 700 ? 0.5 : MIN_K;
    const k = clamp(Math.min(1, aw / bw, ah / bh), floor, MAX_K);
    const restX = aw - bw * k, restY = ah - bh * k;
    view.current = {
      x: side - b[0] * k + (restX > 0 ? restX / 2 : 0),
      y: top - b[1] * k + (restY > 0 ? restY / 2 : 0),
      k
    };
    apply();
  };
  const zoomAt = (factor, cx, cy) => {
    const v = view.current, r = wrapRef.current.getBoundingClientRect();
    const px = cx - r.left, py = cy - r.top;
    const k = clamp(v.k * factor, MIN_K, MAX_K);
    view.current = { x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k), k };
    apply();
  };
  const zoomCenter = (factor) => {
    const r = wrapRef.current.getBoundingClientRect();
    zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
  };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const pointers = new Map();
    let start = null, pinch = null, moved = false;

    const down = (e) => {
      if (e.button != null && e.button !== 0 && e.pointerType === "mouse") return;
      if (e.target.closest && e.target.closest(".shv-ui")) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
      if (pointers.size === 1) {
        start = { x: e.clientX, y: e.clientY, view: { ...view.current }, target: e.target };
        moved = false;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: view.current.k };
        moved = true;
      }
    };
    const move = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const k = clamp(pinch.k * (dist / pinch.dist), MIN_K, MAX_K);
        zoomAt(k / view.current.k, (a.x + b.x) / 2, (a.y + b.y) / 2);
        return;
      }
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      if (!moved) el.classList.add("is-panning");
      moved = true;
      view.current = { ...start.view, x: start.view.x + dx, y: start.view.y + dy };
      apply();
    };
    const up = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        el.classList.remove("is-panning");
        if (start && !moved && e.type === "pointerup" && latest.current.onTap) latest.current.onTap(start.target);
        start = null;
      } else if (pointers.size === 1) {
        /* sobrou um dedo depois da pinça: ele continua andando dali, sem pular */
        const [p] = [...pointers.values()];
        start = { x: p.x, y: p.y, view: { ...view.current }, target: null };
      }
    };
    const wheel = (e) => {
      e.preventDefault();
      /* trackpad: dois dedos andam, pinça (ctrlKey) aproxima. mouse: a roda aproxima. */
      if (!e.ctrlKey && e.deltaMode === 0 && Math.abs(e.deltaX) > 0) {
        view.current = { ...view.current, x: view.current.x - e.deltaX, y: view.current.y - e.deltaY };
        apply();
        return;
      }
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    const resize = () => fit();
    window.addEventListener("resize", resize);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return { view, fit, zoomCenter };
}

/* os controles de vista, iguais nos dois palcos */
function Zoom({ pz }) {
  return (
    <div className="shv-zoom glass shv-ui">
      <button className="action" type="button" title="afastar" aria-label="Afastar" onClick={() => pz.zoomCenter(1 / 1.2)}><MinusIcon /></button>
      <button className="action" type="button" title="aproximar" aria-label="Aproximar" onClick={() => pz.zoomCenter(1.2)}><PlusIcon /></button>
      <span className="sep" />
      <button className="action" type="button" title="enquadrar tudo" aria-label="Enquadrar tudo" onClick={() => pz.fit()}><FitIcon /></button>
    </div>
  );
}

/* o painel de leitura: o que um nó ou uma etapa guarda e não cabe no desenho */
function Reader({ kind, title, onClose, children }) {
  return (
    <aside className="shv-reader glass shv-ui" aria-label={title}>
      <header className="shv-reader__top">
        <div>
          <span className="t-mono">{kind}</span>
          <h2>{title}</h2>
        </div>
        <button className="action" type="button" title="fechar" aria-label="Fechar" onClick={onClose}><CloseIcon /></button>
      </header>
      <div className="shv-reader__body">{children}</div>
    </aside>
  );
}

/* ================================================================
   o mapa
   ================================================================ */
function normalizeMapNode(raw) {
  const n = raw && typeof raw === "object" ? raw : {};
  return {
    id: String(n.id || Math.random().toString(36).slice(2)),
    title: String(n.title || ""),
    note: String(n.note || ""),
    color: Number.isFinite(+n.color) ? clamp(Math.round(+n.color), 0, 6) : 0,
    collapsed: !!n.collapsed,
    link: String(n.link || ""),
    children: Array.isArray(n.children) ? n.children.map(normalizeMapNode) : []
  };
}

function MapStage({ doc }) {
  const [root, setRoot] = useState(() => normalizeMapNode(doc.root || { title: doc.name }));
  const [open, setOpen] = useState(null);
  const wrapRef = useRef(null), worldRef = useRef(null), gridRef = useRef(null);
  const layout = useMemo(() => computeLayout(root), [root]);

  const bounds = () => {
    let b = null;
    layout.forEach((i) => {
      const box = [i.x - i.w / 2, i.y - i.h / 2, i.x + i.w / 2, i.y + i.h / 2];
      b = b ? [Math.min(b[0], box[0]), Math.min(b[1], box[1]), Math.max(b[2], box[2]), Math.max(b[3], box[3])] : box;
    });
    return b;
  };
  /* abrir e fechar galho é leitura, não edição: muda o desenho aqui e em
     nenhum outro lugar. a cópia é rasa no caminho até o nó, o resto é o mesmo. */
  const toggle = (id) => setRoot((cur) => {
    const walk = (n) => (n.id === id ? { ...n, collapsed: !n.collapsed } : { ...n, children: n.children.map(walk) });
    return walk(cur);
  });
  const pz = usePanZoom({
    wrapRef, worldRef, bounds,
    onView: (v) => { if (gridRef.current) gridRef.current.style.opacity = v.k < 0.3 ? "0" : "1"; },
    onTap: (target) => {
      const g = target && target.closest ? target.closest(".mp-node") : null;
      if (!g) { setOpen(null); return; }
      if (target.closest("[data-toggle]")) { toggle(g.dataset.id); return; }
      const found = findNodeIn(root, g.dataset.id);
      setOpen(found && (found.note || found.link) ? found.id : null);
    }
  });
  useLayoutEffect(() => { pz.fit(); }, []);

  const edges = [], nodes = [];
  const posOf = (info) => ({ x: info.x, y: info.y });
  layout.forEach((info) => {
    const node = info.node;
    if (!node.collapsed && node.children.length) {
      const right = [], left = [];
      node.children.forEach((c) => { const ci = layout.get(c.id); if (ci) (ci.side === "left" ? left : right).push(ci); });
      edges.push(svgEdgesOf(info, right, posOf), svgEdgesOf(info, left, posOf));
    }
    nodes.push(svgNode(info, node, node.id === root.id, posOf(info), open, null));
  });
  const reading = open ? findNodeIn(root, open) : null;

  return (
    <div className="shv-stage shv-stage--map" ref={wrapRef}>
      <svg className="mp-svg" xmlns="http://www.w3.org/2000/svg">
        <g ref={worldRef}>
          <g ref={gridRef}>{svgGrid("1")}</g>
          <g>{edges}</g><g>{nodes}</g>
        </g>
      </svg>
      <Zoom pz={pz} />
      {reading && (
        <Reader kind="nó" title={reading.title || "sem título"} onClose={() => setOpen(null)}>
          {reading.link && <p className="shv-link"><a className="pill pill--mini" href={reading.link} target="_blank" rel="noreferrer noopener" title="abrir o link">{icon("open")}<span>{reading.link}</span></a></p>}
          {reading.note && <Markdown className="shv-note" text={reading.note} />}
        </Reader>
      )}
    </div>
  );
}

/* ================================================================
   o funil
   ================================================================ */
function normalizeFunnel(d) {
  const list = (x) => (Array.isArray(x) ? x : []);
  return {
    ...d,
    nodes: list(d.nodes).map((n) => ({
      ...n, id: String(n.id), title: String(n.title || ""),
      x: Number.isFinite(+n.x) ? +n.x : 0, y: Number.isFinite(+n.y) ? +n.y : 0,
      fields: n.fields && typeof n.fields === "object" ? n.fields : {},
      number: n.number === null || n.number === undefined || n.number === "" ? null : +n.number,
      note: String(n.note || "")
    })),
    edges: list(d.edges).map((a) => ({ ...a, avgRate: a.avgRate === null || a.avgRate === undefined || a.avgRate === "" ? null : +a.avgRate })),
    creatives: list(d.creatives), automations: list(d.automations), offers: list(d.offers), triggers: list(d.triggers)
  };
}

function FunnelStage({ doc: raw }) {
  const doc = useMemo(() => normalizeFunnel(raw), [raw]);
  const [open, setOpen] = useState(null);
  const wrapRef = useRef(null), worldRef = useRef(null), edgesRef = useRef(null), nodesRef = useRef(null);
  const projections = useMemo(() => computeProjections(doc), [doc]);

  const bounds = () => {
    if (!doc.nodes.length) return null;
    const xs = doc.nodes.map((n) => n.x), ys = doc.nodes.map((n) => n.y);
    return [Math.min(...xs) - 40, Math.min(...ys) - 40, Math.max(...xs) + NODE_W + 40, Math.max(...ys) + NODE_H + 40];
  };
  /* a grade de pontos é o fundo do palco, e anda com o mundo como no editor */
  const onView = (v) => {
    const el = wrapRef.current;
    if (!el) return;
    let step = 24 * v.k;
    while (step < 14) step *= 2;
    while (step > 60) step /= 2;
    el.style.backgroundSize = step + "px " + step + "px";
    el.style.backgroundPosition = v.x + "px " + v.y + "px";
  };
  const pz = usePanZoom({
    wrapRef, worldRef, bounds, onView,
    onTap: (target) => {
      const g = target && target.closest ? target.closest(".node") : null;
      setOpen(g ? g.dataset.id : null);
    }
  });

  useLayoutEffect(() => {
    const byId = new Map(doc.nodes.map((n) => [n.id, n]));
    const vals = doc.nodes.map((n) => n.number).filter((v) => v != null && v > 0);
    const ctx = {
      nodeById: (id) => byId.get(id),
      selectedNode: open, selectedEdge: null, projections,
      maxVolume: vals.length ? Math.max(...vals) : 1,
      compared: () => null,
      linked: (id) => linkedCounts(doc, id)
    };
    nodesRef.current.replaceChildren(...doc.nodes.map((n) => drawNode(n, ctx)));
    edgesRef.current.replaceChildren(...doc.edges.map((a) => drawEdge(a, ctx)).filter(Boolean));
  }, [doc, open, projections]);
  useLayoutEffect(() => { pz.fit(); }, []);

  const node = open ? doc.nodes.find((n) => n.id === open) : null;
  return (
    <div className="shv-stage fe-stage" ref={wrapRef}>
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="context-stroke" />
          </marker>
        </defs>
        <g ref={worldRef}><g ref={edgesRef} /><g ref={nodesRef} /></g>
      </svg>
      {!doc.nodes.length && <p className="empty shv-empty">Este funil ainda não tem etapas.</p>}
      <Zoom pz={pz} />
      {node && <StageReader doc={doc} node={node} projections={projections} onClose={() => setOpen(null)} />}
    </div>
  );
}

/* o que a etapa guarda: o número, os campos do tipo, a nota e o que está
   pendurado nela. é o painel do editor sem nenhum campo. */
function StageReader({ doc, node, projections, onClose }) {
  const def = typeOf(node);
  const projected = node.number == null ? projections.get(node.id) : null;
  const fields = def.fields
    .filter((f) => node.fields[f.key])
    .map((f) => [f.label, f.kind === "select" ? labelOf(f.options, node.fields[f.key]) : String(node.fields[f.key])]);
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const out = doc.edges.filter((a) => a.from === node.id && byId.has(a.to));
  return (
    <Reader kind={def.label} title={node.title || def.label} onClose={onClose}>
      <p className="shv-number">
        <b className="t-mono">{node.number != null ? formatNumber(node.number) : projected ? "~" + formatNumber(projected.value) : "—"}</b>
        <span>{node.number != null ? "no período" : projected ? "projetado pela taxa média" : "sem número"}</span>
      </p>
      {!!fields.length && (
        <dl className="shv-fields">
          {fields.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      )}
      {!!out.length && (
        <section className="pn-section">
          <h4>segue para</h4>
          {out.map((a) => <div key={a.id} className="pn-item">{byId.get(a.to).title || typeOf(byId.get(a.to)).label}{a.avgRate != null && <span className="t-mono shv-rate">~{String(a.avgRate).replace(".", ",")}%</span>}</div>)}
        </section>
      )}
      {LINKED_GROUPS.map((g) => {
        const items = doc[g.key].filter((x) => x.node === node.id);
        if (!items.length) return null;
        return (
          <section key={g.key} className="pn-section">
            <h4>{g.label}</h4>
            {items.map((x, i) => <div key={x.id || i} className="pn-item">{x[g.field] || "—"}</div>)}
          </section>
        );
      })}
      {node.note && <section className="pn-section"><h4>nota</h4><Markdown className="shv-note" text={node.note} /></section>}
    </Reader>
  );
}

/* ---------- a página ---------- */
function Shared() {
  const [state, setState] = useState({ loading: true });
  /* o token vem do #: ele não vai para o servidor num referer nem aparece em
     log de acesso de proxy nenhum, ao contrário de uma query. */
  const token = decodeURIComponent(String(location.hash || "").replace(/^#/, ""));

  useLayoutEffect(() => { document.documentElement.classList.add("bare"); }, []);
  useEffect(() => {
    if (!token) { setState({ error: "esse link não existe" }); return; }
    let alive = true;
    readShared(token)
      .then((r) => {
        if (!alive) return;
        setState({ type: r.type, doc: r.doc || {} });
        /* o titulo da aba e o nome do documento: quem recebe o link costuma
           abrir cinco deles, e "merlin" cinco vezes na barra nao ajuda. */
        const d = r.doc || {};
        const name = (r.type === "maps" ? (d.root && d.root.title) || d.name : d.name) || "";
        if (name) document.title = name + " · merlin";
      })
      .catch((e) => { if (alive) setState({ error: e.message }); });
    return () => { alive = false; };
  }, [token]);

  if (state.loading) return <div className="sh"><p className="empty">abrindo…</p></div>;
  if (state.error) {
    return (
      <div className="sh sh--gone">
        <span className="sh__mark">{LOGO}<b>merlin</b></span>
        <h1>esse link não existe</h1>
        <p>Ele pode ter sido revogado por quem compartilhou, ou o endereço veio quebrado.</p>
      </div>
    );
  }

  const doc = state.doc;
  const isMap = state.type === "maps";
  const title = (isMap ? doc.name || (doc.root && doc.root.title) : doc.name) || (isMap ? "mapa" : "funil");

  return (
    <div className="shv">
      {isMap ? <MapStage doc={doc} /> : <FunnelStage doc={doc} />}
      <header className="shv-top glass shv-ui">
        <span className="shv-mark" aria-label="merlin">{LOGO}</span>
        <span className="sep" />
        <div className="shv-title">
          <h1>{title}</h1>
          <span className="t-mono">{isMap ? "mapa" : "funil"} · só leitura</span>
        </div>
      </header>
    </div>
  );
}

mount(<Shared />, "app");
