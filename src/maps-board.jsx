/* merlin · as pecas de tela do quadro livre
   a barra de ferramentas da esquerda (com os menus que abrem ao lado), a
   barra que flutua em cima da selecao, o campo que escreve por cima de um
   item, o painel do documento e as caixas de modelo e de bloco de post-its.
   quem decide o que acontece com o documento e o editor (maps.jsx): aqui so
   se desenha e se devolve a intencao. */
import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { Dialog, Form, Markdown, icon } from "./shared/ui.jsx";
import { NAV_ICONS } from "./shared/icons.jsx";
import {
  STICKY_COLORS, stickyInk, INKS, inkOf, FILL_NONE, FILL_THEME, fillOf, fillInk, SHAPES, STICKERS,
  BOARD_TEMPLATES, shapePath, shapeTextBox, cellBox, bboxOf, unionBox, linePoints
} from "./shared/board.js";
import { fitText, layoutText, LINE_RATIO } from "./shared/board-draw.jsx";
import { mapGroups, mapBranches } from "./shared/templates.js";

/* ---------- icones ---------- */
const I = (d, extra) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />{extra}
  </svg>
);
export const TOOL_ICONS = {
  spark: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" /><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
    </svg>
  ),
  select: <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5.5 3.2l13.6 7.1c.7.4.6 1.4-.2 1.6l-5.5 1.5-2.6 5.3c-.4.7-1.4.6-1.6-.2L5.5 3.2z" /></svg>,
  hand: I("M8 13V5.5a1.5 1.5 0 013 0V12M11 11.5V4a1.5 1.5 0 013 0v7.5M14 11.5V5.5a1.5 1.5 0 013 0V13M17 12.5a1.5 1.5 0 013 0V15a7 7 0 01-7 7h-1.5a7 7 0 01-5.3-2.4l-2.7-3.3a1.6 1.6 0 012.3-2.2L8 16"),
  formats: I("M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6M12 12v6M9 15h6"),
  templates: I("M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM3 9h18M9 21V9"),
  sticky: I("M5 4h14a1 1 0 011 1v9l-6 6H5a1 1 0 01-1-1V5a1 1 0 011-1zM14 20v-5a1 1 0 011-1h5"),
  text: I("M5 7V5h14v2M12 5v14M9 19h6"),
  shapes: I("M4 4h7v7H4zM7.5 14l4 7h-8zM14 17.5h7M18 14.5l3 3-3 3", <circle cx="17.5" cy="7.5" r="3.5" />),
  pen: I("M4 20l1-4L16 5l3 3L8 19zM14 7l3 3"),
  eraser: I("M8 20h12M5.4 14.6l8.2-8.2a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L12 18H8.8zM9.5 10.5l5 5"),
  frame: I("M7 3v18M17 3v18M3 7h18M3 17h18"),
  sticker: I("M20 12a8 8 0 11-8-8h3a5 5 0 005 5zM9 10h.01M15 10h.01M8.5 14.5a4 4 0 007 0"),
  plus: I("M12 5v14M5 12h14"),
  undo: I("M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11"),
  redo: I("M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 000 11H13"),
  diagram: I("M4 4h6v5H4zM14 15h6v5h-6zM7 9v4a2 2 0 002 2h5"),
  table: I("M4 5h16v14H4zM4 10h16M4 15h16M10 5v14"),
  timeline: I("M3 12h18M7 12V8M12 12v4M17 12V8", <><circle cx="7" cy="7" r="1.6" /><circle cx="12" cy="17" r="1.6" /><circle cx="17" cy="7" r="1.6" /></>),
  kanban: I("M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v7h-4z"),
  doc: I("M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2zM14 3v5h5M9 13h6M9 17h4"),
  mindmap: I("M9.5 12h5M14.5 12l3-5M14.5 12l3 5", <><circle cx="6.5" cy="12" r="3" /><circle cx="19" cy="5.5" r="1.8" /><circle cx="19" cy="18.5" r="1.8" /></>),
  code: I("M8 7l-5 5 5 5M16 7l5 5-5 5"),
  list: I("M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"),
  keys: I("M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8"),
  front: I("M8 8h12v12H8zM4 16V4h12"),
  back: I("M4 4h12v12H4zM20 8v12H8"),
  bold: I("M7 5h6a3.5 3.5 0 010 7H7zM7 12h7a3.5 3.5 0 010 7H7z"),
  dash: I("M3 12h3M10 12h4M18 12h3"),
  minus: I("M5 12h14"),
  divider: I("M3 12h18")
};
const lineIcon = (kind) => {
  if (kind === "line") return I("M5 19L19 5");
  if (kind === "arrow") return I("M5 19L19 5M11 5h8v8");
  if (kind === "elbow") return I("M4 18h7V6h9M16 3l3 3-3 3");
  return I("M5 19L19 5M11 5h8v8M5 11v8h8");
};
export const shapeIcon = (kind) => (
  <svg viewBox="-3 -3 26 22" aria-hidden="true" className="bd-shape-ic">
    <path d={shapePath(kind, 20, 16)} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

const SHAPE_NAMES = {
  rect: "retângulo", round: "arredondado", oval: "oval", diamond: "losango", triangle: "triângulo",
  parallelogram: "paralelogramo", hexagon: "hexágono", star: "estrela", cylinder: "cilindro", blockArrow: "seta em bloco"
};
const SHAPE_KEYS = { rect: "R", oval: "O" };
const LINE_NAMES = { line: "linha", arrow: "seta", elbow: "seta em cotovelo", double: "seta dupla" };
const LINE_KEYS = { line: "L", arrow: "A" };
const INK_NAMES = ["tinta", "azul", "laranja", "rosa", "roxo", "verde", "turquesa", "cinza"];

/* ---------- a barra de ferramentas ----------
   uma coluna de botoes presa a esquerda. os que tem mais de uma opcao abrem
   um menu ao lado; escolher no menu ja arma a ferramenta. clicar fora fecha o
   menu. */
export function BoardToolbar({ tool, opts, flyout, setFlyout, onTool, onOpts, thinking, act }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!flyout) return;
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setFlyout(null); };
    document.addEventListener("pointerdown", f, true);
    return () => document.removeEventListener("pointerdown", f, true);
  }, [flyout]);
  const toggle = (name) => setFlyout(flyout === name ? null : name);
  const pick = (name, patch) => { if (patch) onOpts(patch); onTool(name); setFlyout(null); };
  const Btn = ({ name, label, keyHint, fly, active, onClick, children, id }) => (
    <button type="button" id={id} className={"bd-tool" + (active ? " is-active" : "") + (fly && flyout === fly ? " is-open" : "")}
      title={label + (keyHint ? " (" + keyHint + ")" : "")} aria-label={label} aria-pressed={active || undefined}
      onClick={onClick || (() => (fly ? toggle(fly) : pick(name)))}>{children}</button>
  );
  const isShapeTool = tool === "shape" || tool === "line";
  const isPenTool = tool === "pen" || tool === "eraser";
  return (
    <div className="bd-toolbar" ref={ref}>
      <button type="button" id="mp-suggest" className={"bd-ai" + (flyout === "ai" ? " is-open" : "")} disabled={thinking} aria-busy={thinking}
        title={thinking ? "pensando…" : "Merlin"} aria-label="Merlin" onClick={() => toggle("ai")}>{TOOL_ICONS.spark}</button>
      <div className="bd-tools">
        <Btn name="select" label="selecionar" keyHint="V" active={tool === "select"}>{TOOL_ICONS.select}</Btn>
        <Btn name="hand" label="mover a tela" keyHint="H · ou Espaço + arrastar" active={tool === "hand"}>{TOOL_ICONS.hand}</Btn>
        <Btn label="formatos" fly="formats">{TOOL_ICONS.formats}</Btn>
        <Btn label="modelos" onClick={() => { setFlyout(null); act("templates"); }}>{TOOL_ICONS.templates}</Btn>
        <Btn label="post-it" keyHint="N" fly="sticky" active={tool === "sticky"}>{TOOL_ICONS.sticky}</Btn>
        <Btn name="text" label="texto" keyHint="T" active={tool === "text"}>{TOOL_ICONS.text}</Btn>
        <Btn label="formas e linhas" fly="shapes" active={isShapeTool}>{isShapeTool && tool === "shape" ? shapeIcon(opts.shape) : isShapeTool ? lineIcon(opts.line) : TOOL_ICONS.shapes}</Btn>
        <Btn label="caneta" keyHint="P" fly="pen" active={isPenTool}>{tool === "eraser" ? TOOL_ICONS.eraser : TOOL_ICONS.pen}</Btn>
        <Btn name="frame" label="moldura" keyHint="F" active={tool === "frame"}>{TOOL_ICONS.frame}</Btn>
        <Btn label="adesivos" fly="stickers" active={tool === "sticker"}>{tool === "sticker" ? <span className="bd-emoji">{opts.emoji}</span> : TOOL_ICONS.sticker}</Btn>
        <Btn label="mais" fly="more">{TOOL_ICONS.plus}</Btn>
      </div>
      <div className="bd-tools">
        <button type="button" className="bd-tool" title="desfazer (Ctrl+Z)" aria-label="Desfazer" onClick={() => act("undo")}>{TOOL_ICONS.undo}</button>
        <button type="button" className="bd-tool" title="refazer (Ctrl+Shift+Z)" aria-label="Refazer" onClick={() => act("redo")}>{TOOL_ICONS.redo}</button>
      </div>

      {flyout === "ai" && (
        <div className="bd-fly bd-fly--ai" role="menu">
          <MenuRow icon={TOOL_ICONS.mindmap} label="ramos para o nó selecionado" hint="S" onClick={() => { setFlyout(null); act("branches"); }} />
          <MenuRow icon={TOOL_ICONS.sticky} label="post-its de ideias" onClick={() => { setFlyout(null); act("generate"); }} />
          <p className="bd-fly__note">o Merlin só propõe: o que ele sugere aparece tracejado, e só fica o que você clicar.</p>
        </div>
      )}
      {flyout === "formats" && (
        <div className="bd-fly" role="menu">
          <MenuRow icon={TOOL_ICONS.diagram} label="diagrama" onClick={() => { setFlyout(null); act("format", "diagram"); }} />
          <MenuRow icon={TOOL_ICONS.table} label="tabela" onClick={() => { setFlyout(null); act("format", "table"); }} />
          <MenuRow icon={TOOL_ICONS.timeline} label="linha do tempo" onClick={() => { setFlyout(null); act("format", "timeline"); }} />
          <MenuRow icon={TOOL_ICONS.kanban} label="kanban" onClick={() => { setFlyout(null); act("format", "kanban"); }} />
          <MenuRow icon={TOOL_ICONS.doc} label="documento" onClick={() => { setFlyout(null); act("format", "doc"); }} />
          <MenuRow icon={TOOL_ICONS.mindmap} label="ramo no mapa mental" hint="Tab" onClick={() => { setFlyout(null); act("branch"); }} />
          <hr />
          <MenuRow icon={TOOL_ICONS.templates} label="todos os modelos" onClick={() => { setFlyout(null); act("templates"); }} />
        </div>
      )}
      {flyout === "sticky" && (
        <div className="bd-fly bd-fly--sticky" role="menu">
          <div className="bd-sticky-grid">
            {STICKY_COLORS.map((c, i) => (
              <button key={i} type="button" className={"bd-sticky-sw" + (opts.sticky === i ? " is-on" : "")} style={{ background: c }}
                title={"post-it " + (i + 1)} aria-label={"Post-it cor " + (i + 1)} onClick={() => pick("sticky", { sticky: i })} />
            ))}
          </div>
          <button type="button" className="pill pill--mini bd-fly__wide" onClick={() => { setFlyout(null); act("generate"); }}>{TOOL_ICONS.spark}gerar</button>
          <button type="button" className="pill pill--mini bd-fly__wide" onClick={() => { setFlyout(null); act("bulk"); }}>{TOOL_ICONS.list}bloco</button>
        </div>
      )}
      {flyout === "shapes" && (
        <div className="bd-fly bd-fly--shapes" role="menu">
          {["line", "arrow", "elbow", "double"].map((k) => (
            <MenuRow key={k} icon={lineIcon(k)} label={LINE_NAMES[k]} hint={LINE_KEYS[k]} active={tool === "line" && opts.line === k} onClick={() => pick("line", { line: k })} />
          ))}
          <MenuRow icon={TOOL_ICONS.divider} label="divisor" onClick={() => { setFlyout(null); act("divider"); }} />
          <hr />
          {SHAPES.map((k) => (
            <MenuRow key={k} icon={shapeIcon(k)} label={SHAPE_NAMES[k]} hint={SHAPE_KEYS[k]} active={tool === "shape" && opts.shape === k} onClick={() => pick("shape", { shape: k })} />
          ))}
          <hr />
          <MenuRow icon={TOOL_ICONS.diagram} label="diagrama" onClick={() => { setFlyout(null); act("format", "diagram"); }} />
        </div>
      )}
      {flyout === "pen" && (
        <div className="bd-fly bd-fly--pen" role="menu">
          <div className="bd-swatches">
            {INKS.map((c, i) => (
              <button key={i} type="button" className={"bd-ink" + (opts.penColor === i ? " is-on" : "")} style={{ background: c }} title={INK_NAMES[i]} aria-label={INK_NAMES[i]}
                onClick={() => pick("pen", { penColor: i })} />
            ))}
          </div>
          <div className="bd-seg">
            {[2, 4, 8].map((w) => (
              <button key={w} type="button" className={!opts.marker && opts.penWidth === w ? "is-on" : ""} title={"espessura " + w} onClick={() => pick("pen", { penWidth: w, marker: false })}>
                <span className="bd-dot" style={{ width: w + 3, height: w + 3 }} /></button>
            ))}
            <button type="button" className={opts.marker ? "is-on" : ""} title="marca-texto" onClick={() => pick("pen", { marker: true })}><span className="bd-mark" /></button>
          </div>
          <MenuRow icon={TOOL_ICONS.eraser} label="borracha" hint="E" active={tool === "eraser"} onClick={() => pick("eraser")} />
        </div>
      )}
      {flyout === "stickers" && (
        <div className="bd-fly bd-fly--stickers" role="menu">
          <div className="bd-emoji-grid">
            {STICKERS.map((e) => (
              <button key={e} type="button" className={opts.emoji === e && tool === "sticker" ? "is-on" : ""} onClick={() => pick("sticker", { emoji: e })}>{e}</button>
            ))}
          </div>
          <p className="bd-fly__note">escolha e clique no quadro para colar</p>
        </div>
      )}
      {flyout === "more" && (
        <div className="bd-fly" role="menu">
          <MenuRow icon={TOOL_ICONS.mindmap} label="ramo no mapa mental" hint="Tab" onClick={() => { setFlyout(null); act("branch"); }} />
          <MenuRow icon={TOOL_ICONS.list} label="lista vira post-its" onClick={() => { setFlyout(null); act("bulk"); }} />
          <MenuRow icon={TOOL_ICONS.code} label="colar mermaid como ramo" onClick={() => { setFlyout(null); act("mermaid"); }} />
          <MenuRow icon={TOOL_ICONS.keys} label="atalhos do teclado" onClick={() => { setFlyout(null); act("help"); }} />
        </div>
      )}
    </div>
  );
}

function MenuRow({ icon: ic, label, hint, active, onClick }) {
  return (
    <button type="button" role="menuitem" className={"bd-row" + (active ? " is-on" : "")} onClick={onClick}>
      <span className="bd-row__ic">{ic}</span><span className="bd-row__label">{label}</span>{hint && <kbd>{hint}</kbd>}
    </button>
  );
}

/* ---------- a barra da selecao ----------
   flutua em cima do que esta selecionado, e so mostra o que faz sentido para
   aquilo: cor de papel para post-it, preenchimento e contorno para forma,
   tipo de ponta para seta, linha e coluna para tabela. anda junto com o pan
   e o zoom sem passar pelo React (o motor avisa, a barra se reposiciona). */
const INKABLE = ["text", "line", "pen", "shape"];
export function ItemBar({ engine, items, act }) {
  const ref = useRef(null);
  const [pop, setPop] = useState(null);
  const ids = items.map((it) => it.id).join(",");
  useEffect(() => { setPop(null); }, [ids]);
  const place = () => {
    const el = ref.current;
    if (!el) return;
    const b = unionBox(items.map((it) => bboxOf(it, engine.boxOf)));
    const host = el.offsetParent && el.offsetParent.getBoundingClientRect();
    if (!b || !host) return;
    const r = engine.screenRectOfBox(b);
    const top = r.top - host.top - 14, below = r.top + r.height - host.top + 14;
    const up = top - el.offsetHeight > 8;
    el.style.left = Math.max(8 + el.offsetWidth / 2, Math.min(host.width - 8 - el.offsetWidth / 2, r.left - host.left + r.width / 2)) + "px";
    el.style.top = (up ? top : below) + "px";
    el.dataset.side = up ? "up" : "down";
  };
  useLayoutEffect(place);
  useEffect(() => engine.onView(place), [engine, ids]);

  const one = items.length === 1 ? items[0] : null;
  const every = (t) => items.every((it) => it.type === t);
  const inkable = items.every((it) => INKABLE.indexOf(it.type) >= 0);
  const first = items[0];
  const Pop = ({ name, title, face, children }) => (
    <span className="bd-bar__pop">
      <button type="button" className={"bd-bar__btn" + (pop === name ? " is-open" : "")} title={title} aria-label={title} onClick={() => setPop(pop === name ? null : name)}>{face}</button>
      {pop === name && <div className="bd-bar__menu">{children}</div>}
    </span>
  );
  const B = ({ title, on, onClick, children }) => (
    <button type="button" className={"bd-bar__btn" + (on ? " is-on" : "")} title={title} aria-label={title} onClick={onClick}>{children}</button>
  );
  return (
    <div className="bd-bar" ref={ref} onPointerDown={(e) => e.stopPropagation()}>
      {every("sticky") && (
        <Pop name="paper" title="cor do post-it" face={<span className="bd-face" style={{ background: STICKY_COLORS[first.color] }} />}>
          <div className="bd-sticky-grid bd-sticky-grid--wide">
            {STICKY_COLORS.map((c, i) => <button key={i} type="button" className={"bd-sticky-sw" + (first.color === i ? " is-on" : "")} style={{ background: c }} aria-label={"cor " + (i + 1)}
              onClick={() => act("patch", (it) => ({ ...it, color: i }))} />)}
          </div>
        </Pop>
      )}
      {every("shape") && <>
        <Pop name="kind" title="forma" face={shapeIcon(first.shape)}>
          <div className="bd-shape-grid">
            {SHAPES.map((k) => <button key={k} type="button" className={first.shape === k ? "is-on" : ""} title={SHAPE_NAMES[k]} onClick={() => act("patch", (it) => ({ ...it, shape: k }))}>{shapeIcon(k)}</button>)}
          </div>
        </Pop>
        <Pop name="fill" title="preenchimento" face={<span className={"bd-face" + (first.fill === FILL_NONE ? " bd-face--none" : "")} style={{ background: first.fill === FILL_NONE ? undefined : fillOf(first.fill) }} />}>
          <div className="bd-sticky-grid bd-sticky-grid--wide">
            <button type="button" className={"bd-sticky-sw bd-face--none" + (first.fill === FILL_NONE ? " is-on" : "")} title="sem preenchimento" onClick={() => act("patch", (it) => ({ ...it, fill: FILL_NONE }))} />
            <button type="button" className={"bd-sticky-sw" + (first.fill === FILL_THEME ? " is-on" : "")} style={{ background: "var(--mp-pill)" }} title="cor da tela" onClick={() => act("patch", (it) => ({ ...it, fill: FILL_THEME }))} />
            {STICKY_COLORS.map((c, i) => <button key={i} type="button" className={"bd-sticky-sw" + (first.fill === i ? " is-on" : "")} style={{ background: c }} aria-label={"cor " + (i + 1)}
              onClick={() => act("patch", (it) => ({ ...it, fill: i }))} />)}
          </div>
        </Pop>
      </>}
      {inkable && (
        <Pop name="ink" title={every("shape") ? "contorno" : "cor"} face={<span className="bd-face bd-face--ink" style={{ background: inkOf(first.color) }} />}>
          <div className="bd-swatches">
            {INKS.map((c, i) => <button key={i} type="button" className={"bd-ink" + (first.color === i ? " is-on" : "")} style={{ background: c }} title={INK_NAMES[i]}
              onClick={() => act("patch", (it) => ({ ...it, color: i }))} />)}
          </div>
        </Pop>
      )}
      {every("text") && <>
        <B title="letra menor" onClick={() => act("textSize", -1)}>A−</B>
        <span className="bd-bar__num t-mono">{first.size}</span>
        <B title="letra maior" onClick={() => act("textSize", 1)}>A+</B>
        <B title="negrito" on={first.bold} onClick={() => act("patch", (it) => ({ ...it, bold: !first.bold }), true)}>{TOOL_ICONS.bold}</B>
      </>}
      {every("line") && <>
        {["line", "arrow", "elbow", "double"].map((k) => <B key={k} title={LINE_NAMES[k]} on={first.kind === k} onClick={() => act("patch", (it) => ({ ...it, kind: k }))}>{lineIcon(k)}</B>)}
        <B title="tracejada" on={first.dash} onClick={() => act("patch", (it) => ({ ...it, dash: !first.dash }))}>{TOOL_ICONS.dash}</B>
        <B title="mais fina" onClick={() => act("patch", (it) => ({ ...it, width: Math.max(1, it.width - 1) }))}>{TOOL_ICONS.minus}</B>
        <span className="bd-bar__num t-mono">{first.width}</span>
        <B title="mais grossa" onClick={() => act("patch", (it) => ({ ...it, width: Math.min(16, it.width + 1) }))}>{TOOL_ICONS.plus}</B>
      </>}
      {one && one.type === "table" && <>
        <B title="mais uma linha" onClick={() => act("table", 1, 0)}>+ linha</B>
        <B title="uma linha a menos" onClick={() => act("table", -1, 0)}>− linha</B>
        <B title="mais uma coluna" onClick={() => act("table", 0, 1)}>+ col</B>
        <B title="uma coluna a menos" onClick={() => act("table", 0, -1)}>− col</B>
        <B title="primeira linha como cabeçalho" on={one.header} onClick={() => act("patch", (it) => ({ ...it, header: !one.header }))}>{TOOL_ICONS.bold}</B>
      </>}
      {one && one.type === "doc" && <B title="abrir o documento" onClick={() => act("edit", one.id)}>{icon("open")}</B>}
      {one && (one.type === "sticky" || one.type === "shape" || one.type === "text" || one.type === "frame" || one.type === "line") &&
        <B title="escrever (Enter)" onClick={() => act("edit", one.id)}>{icon("pencil")}</B>}
      {one && (one.type === "sticky" || one.type === "shape" || one.type === "text" || one.type === "doc") &&
        <B title="puxar para o dia" onClick={() => act("toDay", one.id)}>{NAV_ICONS.day}</B>}
      <span className="bd-bar__sep" />
      <B title="trazer para a frente" onClick={() => act("front")}>{TOOL_ICONS.front}</B>
      <B title="mandar para trás" onClick={() => act("back")}>{TOOL_ICONS.back}</B>
      <B title="duplicar (Ctrl+D)" onClick={() => act("duplicate")}>{icon("copy")}</B>
      <B title="apagar (Delete)" onClick={() => act("remove")}>{icon("trash")}</B>
    </div>
  );
}

/* ---------- escrever num item ----------
   um campo deitado exatamente onde o texto do item mora, na letra do zoom
   atual. post-it e forma reencolhem a letra enquanto se digita, como o
   desenho faz. Esc e clicar fora confirmam — texto digitado num quadro nao
   se perde por uma tecla; Enter quebra linha no que e bloco e confirma no
   que e uma linha so (titulo de moldura, celula, rotulo de seta). */
const PAD = (it) => Math.max(8, it.w * 0.08);
function editRegion(it, value, cell, boxOf) {
  if (it.type === "sticky") {
    const p = PAD(it), b = { x: it.x + p, y: it.y + p, w: it.w - p * 2, h: it.h - p * 2 };
    const t = fitText(value || " ", b.w, b.h, Math.max(12, Math.round(it.w / 6)), 500);
    return { box: b, size: t.size, align: "center", fill: t.lines.length * t.lh, multi: true, bg: STICKY_COLORS[it.color], ink: stickyInk(it.color) };
  }
  if (it.type === "shape") {
    const tb = shapeTextBox(it.shape, it.w, it.h), b = { x: it.x + tb.x, y: it.y + tb.y, w: tb.w, h: tb.h };
    const t = fitText(value || " ", b.w, b.h, 20, 500);
    return { box: b, size: t.size, align: "center", fill: t.lines.length * t.lh, multi: true, ink: fillInk(it.fill) };
  }
  if (it.type === "text") {
    const t = layoutText(value || " ", it.size, it.w, it.bold ? 700 : 500);
    return { box: { x: it.x, y: it.y + 2, w: it.w, h: Math.max(t.lh, t.lines.length * t.lh) }, size: it.size, weight: it.bold ? 700 : 500, align: "left", multi: true, ink: inkOf(it.color) };
  }
  if (it.type === "frame") return { box: { x: it.x, y: it.y - 28, w: Math.max(200, Math.min(it.w, 420)), h: 24 }, size: 13, weight: 600, align: "left" };
  if (it.type === "table" && cell) {
    const c = cellBox(it, cell[0], cell[1]);
    return { box: { x: c.x + 4, y: c.y + 4, w: c.w - 8, h: c.h - 8 }, size: 14, weight: it.header && cell[0] === 0 ? 700 : 500, align: "left", bg: "var(--mp-pill)" };
  }
  if (it.type === "line") {
    const pts = linePoints(it, boxOf), n = pts.length, mid = Math.floor(n / 4) * 2;
    const mx = n === 4 ? (pts[0] + pts[2]) / 2 : (pts[mid] + pts[mid + 2]) / 2, my = n === 4 ? (pts[1] + pts[3]) / 2 : (pts[mid + 1] + pts[mid + 3]) / 2;
    return { box: { x: mx - 100, y: my - 14, w: 200, h: 28 }, size: 13, align: "center", bg: "var(--mp-canvas)" };
  }
  return null;
}
export function textOf(it, cell) {
  if (it.type === "frame" || it.type === "doc") return it.title;
  if (it.type === "table") return cell ? it.cells[cell[0]][cell[1]] : "";
  return it.text || "";
}

export function ItemEditor({ engine, item, cell, initial, onConfirm }) {
  const ref = useRef(null), closed = useRef(false);
  const [value, setValue] = useState(() => (initial != null ? initial : textOf(item, cell)));
  const region = editRegion(item, value, cell, engine.boxOf);
  const place = () => {
    const el = ref.current;
    if (!el || !region) return;
    const r = engine.screenRectOfBox(region.box);
    el.style.left = r.left + "px"; el.style.top = r.top + "px";
    el.style.width = r.width + "px"; el.style.height = r.height + "px";
    el.style.fontSize = Math.max(6, region.size * r.scale) + "px";
    el.style.lineHeight = LINE_RATIO;
    el.style.paddingTop = region.fill != null ? Math.max(0, (region.box.h - region.fill) / 2 * r.scale) + "px" : "0px";
  };
  useLayoutEffect(place);
  useEffect(() => engine.onView(place), [engine]);
  useLayoutEffect(() => {
    const el = ref.current;
    el.focus();
    if (initial != null) el.setSelectionRange(el.value.length, el.value.length);
    else el.select();
  }, []);
  if (!region) return null;
  const done = (how) => { if (closed.current) return; closed.current = true; onConfirm(ref.current.value, how); };
  return (
    <textarea ref={ref} className={"bd-edit bd-edit--" + item.type} value={value} spellCheck="true"
      style={{ textAlign: region.align, fontWeight: region.weight || 500, background: region.bg || "transparent", color: region.ink || "var(--ink)" }}
      onChange={(e) => setValue(e.currentTarget.value)}
      onBlur={() => done("blur")}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); done("key"); }
        else if (e.key === "Enter" && !e.shiftKey && !region.multi) { e.preventDefault(); done("key"); }
        else if (e.key === "Tab" && item.type === "table") { e.preventDefault(); done(e.shiftKey ? "prev" : "next"); }
      }} />
  );
}

/* ---------- o documento ----------
   no quadro ele e um cartao; aqui e onde se le e se escreve. markdown, como
   a nota do no. */
export function DocPanel({ item, onClose, onFieldFocus, onFieldBlur, onTitle, onText, onIdea }) {
  const [writing, setWriting] = useState(!item.text);
  const ref = useRef(null);
  useLayoutEffect(() => { if (writing && ref.current) ref.current.focus(); }, [writing]);
  return (
    <aside className="mp-panel bd-docpanel" role="dialog" aria-label="Documento">
      <button className="action mp-panel__close" type="button" aria-label="Fechar (Esc)" onClick={onClose}>✕</button>
      <h2>documento</h2>
      <div>
        <label className="field-label" htmlFor="doc-title">título</label>
        <input className="input" id="doc-title" maxLength="200" value={item.title} onFocus={onFieldFocus} onBlur={onFieldBlur} onChange={(e) => onTitle(e.currentTarget.value)} />
      </div>
      <div className="bd-docpanel__body">
        <label className="field-label" htmlFor="doc-text">texto</label>
        {writing
          ? <textarea ref={ref} className="textarea" id="doc-text" value={item.text} placeholder="markdown: # título, - lista, **negrito**"
              onFocus={onFieldFocus} onBlur={() => { onFieldBlur(); if (item.text.trim()) setWriting(false); }} onChange={(e) => onText(e.currentTarget.value)} />
          : <div className="mp-note-render" tabIndex="0" onClick={() => setWriting(true)}><Markdown text={item.text} /></div>}
      </div>
      <div className="row">
        <button className="pill pill--mini" type="button" onClick={onIdea}>virar nota</button>
      </div>
    </aside>
  );
}

/* ---------- modelos ----------
   uma caixa so para os dois tipos: quadros (molduras e post-its prontos,
   largados no meio da tela) e ramos de mapa mental (os galhos de um modelo,
   pendurados no no selecionado). a busca olha nome e resumo. */
export function TemplatesDialog({ onPick, onClose, hasNode }) {
  const [q, setQ] = useState("");
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const match = (t) => !q.trim() || norm(t.name + " " + (t.summary || "")).indexOf(norm(q.trim())) >= 0;
  const boards = BOARD_TEMPLATES.filter(match);
  const groups = useMemo(() => mapGroups(), []);
  const maps = groups.map((g) => ({ ...g, items: g.items.filter(match) })).filter((g) => g.items.length);
  return (
    <Dialog title="modelos" sub="um quadro pronto no meio da tela, ou os galhos de um mapa pendurados no nó" wide onClose={onClose}>
      <input className="input bd-tpl-search" placeholder="procurar por nome ou assunto" value={q} autoFocus onChange={(e) => setQ(e.currentTarget.value)} />
      {boards.length > 0 && <>
        <p className="bd-tpl-group">quadros</p>
        <div className="bd-tpl-grid">
          {boards.map((t) => (
            <button key={t.id} type="button" className="bd-tpl" onClick={() => onPick({ board: t.id })}>
              <b>{t.name}</b><span>{t.summary}</span>
            </button>
          ))}
        </div>
      </>}
      {maps.map((g) => (
        <div key={g.key}>
          <p className="bd-tpl-group">ramos de mapa · {g.label}</p>
          <div className="bd-tpl-grid">
            {g.items.map((t) => (
              <button key={t.id} type="button" className="bd-tpl" onClick={() => onPick({ map: t.id })}>
                <b>{t.name}</b><span>{mapBranches(t).join(" · ")}</span>
                <em>{hasNode ? "pendura no nó selecionado" : "pendura na ideia central"}</em>
              </button>
            ))}
          </div>
        </div>
      ))}
      {!boards.length && !maps.length && <p className="empty">nenhum modelo com esse nome</p>}
    </Dialog>
  );
}

/* ---------- bloco: uma lista vira post-its ---------- */
export function BulkDialog({ color, onCreate, onClose }) {
  const [text, setText] = useState("");
  const [c, setC] = useState(color);
  const lines = text.split("\n").map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim()).filter(Boolean);
  return (
    <Form title="bloco de post-its" sub="uma ideia por linha — cada linha vira um post-it, em grade, no meio da tela"
      submit={lines.length ? "criar " + lines.length + (lines.length === 1 ? " post-it" : " post-its") : "criar"}
      onSubmit={() => { if (!lines.length) return false; onCreate(lines.slice(0, 200), c); }} onClose={onClose}>
      <div className="full">
        <textarea className="textarea bd-bulk" placeholder={"ideia um\nideia dois\nideia três"} value={text} onChange={(e) => setText(e.currentTarget.value)} />
      </div>
      <div className="full bd-sticky-grid bd-sticky-grid--wide">
        {STICKY_COLORS.map((sc, i) => <button key={i} type="button" className={"bd-sticky-sw" + (c === i ? " is-on" : "")} style={{ background: sc }} aria-label={"cor " + (i + 1)} onClick={() => setC(i)} />)}
      </div>
    </Form>
  );
}
