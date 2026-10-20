/* merlin · desenhos (PRD desenhos, D1)

   a aba que era "mapas": uma lista só, do mais recente ao mais antigo, de tudo
   que se desenha no trabalho. cada tipo continua com o seu editor e o seu
   endereço (maps.html#id, sheets.html#id); aqui só se acha, filtra e começa.

   um tipo novo é uma linha em KINDS: a coleção, o nome, onde abre, onde
   começa e como se mede. a ordem de KINDS é a ordem das pílulas. */
import "./shared/base.css";
import "./drawings.css";
import { initPage, notify } from "./shared/core.js";
import { useState } from "react";
import { mount, useCollection, useHash, setHash, useKeydown, isTyping, useFields, Form, Field, MapThumb, icon } from "./shared/ui.jsx";
import { NAV_ICONS } from "./shared/icons.jsx";
import { normalizeSheet } from "./shared/sheet.js";
import { SheetStart, SheetThumb } from "./shared/sheet-start.jsx";

initPage("drawings");

const enc = encodeURIComponent;
const countNodes = (n) => 1 + ((n && n.children) || []).reduce((a, c) => a + countNodes(c), 0);

const KINDS = [
  {
    id: "sheets", one: "planilha", many: "planilhas", normalize: normalizeSheet,
    open: (d) => "sheets.html#" + enc(d.id), start: "sheets.html",
    measure: (d) => d.rows.length + (d.rows.length === 1 ? " linha" : " linhas") + " · " + d.cols.length + (d.cols.length === 1 ? " coluna" : " colunas"),
    thumb: (d) => <SheetThumb cols={d.cols.length} rows={d.rows.length} />
  },
  {
    id: "maps", one: "mapa", many: "mapas",
    open: (d) => "maps.html#" + enc(d.id), start: "maps.html#novo",
    measure: (d) => { const n = countNodes(d.root); return n + (n === 1 ? " nó" : " nós"); },
    thumb: (d) => {
      const branches = ((d.root && d.root.children) || []).slice(0, 6);
      return <MapThumb shape={branches.length ? branches.map((b) => ({ kids: (b.children || []).length })) : [{ kids: 0 }]} size={countNodes(d.root)} />;
    }
  }
];

const when = (ms) => new Date(ms).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });

function Drawings() {
  const stores = Object.fromEntries(KINDS.map((k) => [k.id, useCollection(k.id, k.normalize ? { normalize: k.normalize } : undefined)]));
  const apps = useCollection("apps");
  /* o filtro mora no endereço (drawings.html#mapas): o perfil e o voltar do
     mapa chegam com ele já escolhido */
  const hash = useHash();
  const filter = KINDS.find((k) => k.many === hash) || null;
  const [creating, setCreating] = useState(false);

  const all = KINDS.filter((k) => !filter || k === filter)
    .flatMap((k) => stores[k.id].all().map((doc) => ({ kind: k, doc })))
    .sort((a, b) => (+b.doc.updatedAt || 0) - (+a.doc.updatedAt || 0));

  const remove = (kind, id) => {
    const before = stores[kind.id].remove(id);
    if (before) notify(kind.one + " apagad" + (kind.one === "mapa" ? "o" : "a"), () => stores[kind.id].save(before));
  };

  useKeydown((e) => {
    if (e.key !== "n" || e.ctrlKey || e.metaKey || e.altKey || creating || isTyping()) return;
    e.preventDefault();
    setCreating(true);
  });

  return (
    <main className="page">
      <div className="header">
        <div><h1>desenhos</h1><p className="sub">mapas e planilhas do trabalho, do mais recente ao mais antigo</p></div>
        <div className="actions">
          <button className="pill pill--accent" type="button" id="new-drawing" title="novo desenho (n)" onClick={() => setCreating(true)}>{icon("plus")}desenho</button>
        </div>
      </div>
      <div className="chips dw-filter" role="group" aria-label="filtrar por tipo">
        <button type="button" className="chip" aria-pressed={!filter} onClick={() => setHash("")}>todos</button>
        {KINDS.map((k) => <button key={k.id} type="button" className="chip" aria-pressed={filter === k} onClick={() => setHash(k.many)}>{k.many}</button>)}
      </div>
      {all.length > 0 && (
        <ul className="list dw-list" id="drawing-list">
          {all.map(({ kind, doc }) => {
            const product = doc.app ? apps.get(doc.app) : null;
            const go = () => { location.href = kind.open(doc); };
            return (
              <li key={kind.id + doc.id} className="line dw-line" data-kind={kind.id} onClick={go}>
                <span className="dw-thumb">{kind.thumb(doc)}</span>
                <span className="dw-main">
                  <a className="dw-name" href={kind.open(doc)} onClick={(e) => e.stopPropagation()}>{doc.name || kind.one + " sem nome"}</a>
                  <span className="dw-meta t-mono">{kind.one + " · " + kind.measure(doc) + " · " + when(+doc.updatedAt || Date.now())}</span>
                </span>
                {product && <a className="pill pill--mini dw-product" href={"apps.html#" + enc(doc.app)} title="abrir o produto" onClick={(e) => e.stopPropagation()}>{NAV_ICONS.apps}{product.name || "produto"}</a>}
                <span className="row-actions">
                  <button className="action" type="button" title="apagar" aria-label={"Apagar " + (doc.name || kind.one)} onClick={(e) => { e.stopPropagation(); remove(kind, doc.id); }}>{icon("trash")}</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {!all.length && (!filter || filter.id === "sheets") && (
        <SheetStart sheets={stores.sheets} title={filter ? "nenhuma planilha ainda" : "nenhum desenho ainda"}
          onOpen={(doc) => { location.href = "sheets.html#" + enc(doc.id); }} />
      )}
      {!all.length && filter && filter.id !== "sheets" && (
        <p className="dw-empty">{"nenhum " + filter.one + " ainda. "}<a href={filter.start}>{"começar um " + filter.one}</a></p>
      )}
      {creating && <NewDrawing onClose={() => setCreating(false)} />}
    </main>
  );
}

/* o "+" escolhe o tipo; o resto (o modelo, o nome) é com a página do tipo,
   que já sabe começar */
function NewDrawing({ onClose }) {
  const [v, bind] = useFields({ kind: KINDS[0].id });
  return (
    <Form title="novo desenho" sub="de que tipo?" submit="continuar" onClose={onClose}
          onSubmit={() => { location.href = KINDS.find((k) => k.id === v.kind).start; }}>
      <Field label="tipo" full>
        <div className="chips dw-kinds" role="radiogroup" aria-label="tipo">
          {KINDS.map((k) => (
            <label key={k.id} className={"chip" + (v.kind === k.id ? " is-on" : "")}>
              <input type="radio" value={k.id} checked={v.kind === k.id} onChange={bind("kind").onChange} name="kind" />{k.one}
            </label>
          ))}
        </div>
      </Field>
    </Form>
  );
}

mount(<Drawings />, "app");
