/* merlin · planilhas (PRD desenhos, D3)

   uma folha por arquivo: a grade, fórmulas simples e o CSV. a conta mora em
   shared/sheet.js; aqui é só a tela — escolher a célula, escrever, desfazer.
   a conversa monta a planilha; a página ajusta, e por isso o editor só tem
   controle de um clique (PRD, "regras que não se quebram").

   sem planilha aberta (sheets.html sem #id), a página é a tela de começar,
   com os modelos. a lista de planilhas mora em desenhos. */
import "./shared/base.css";
import "./sheets.css";
import { initPage, newId, notify, askMerlin, takeChange } from "./shared/core.js";
import { useState, useEffect, useRef, useMemo, useLayoutEffect } from "react";
import { mount, useCollection, useHash, useKeydown, isTyping, useFields, Form, Field, Dialog, icon } from "./shared/ui.jsx";
import {
  normalizeSheet, evaluateSheet, toCSV, colLetter, insertRow, removeRow, insertCol, removeCol,
  COL_TYPES, SHEET_ROWS, SHEET_COLS
} from "./shared/sheet.js";
import { SheetStart } from "./shared/sheet-start.jsx";
import { adjustPrefix } from "./shared/build-intent.js";

/* a planilha não tem aba própria: acende "desenhos" */
initPage("drawings");

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

/* acrescentar e apagar linha e coluna e mudar o tipo só da largura de um
   tablet para cima (ticket #90): no celular a grade serve para ler e corrigir
   o texto das células */
const WIDE = "(min-width:600px)";
function useWide() {
  const [wide, setWide] = useState(() => matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = matchMedia(WIDE);
    const f = () => setWide(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return wide;
}

function Sheets() {
  const sheets = useCollection("sheets", { normalize: normalizeSheet });
  const hash = useHash();
  const open = hash && sheets.has(hash) ? hash : "";
  return open ? <Editor key={open} id={open} sheets={sheets} /> : <Start sheets={sheets} />;
}

function Start({ sheets }) {
  const any = sheets.all().length > 0;
  return (
    <main className="page">
      <div className="header">
        <div><h1>planilhas</h1><p className="sub">uma folha por arquivo, com fórmulas simples e CSV para o Excel</p></div>
        <div className="actions">
          <a className="pill" href="drawings.html#planilhas">{icon("chevronLeft")}desenhos</a>
        </div>
      </div>
      <SheetStart sheets={sheets} title={any ? "de que modelo é a nova planilha?" : undefined} onOpen={(doc) => { location.hash = doc.id; }} />
    </main>
  );
}

/* ---------- o editor ---------- */
function Editor({ id, sheets }) {
  const wide = useWide();
  const [doc, setDoc] = useState(() => sheets.get(id));
  const docRef = useRef(doc); docRef.current = doc;
  const [sel, setSel] = useState({ r: 0, c: 0 });
  const [edit, setEdit] = useState(null); // { draft } | null — sempre na célula selecionada
  const [menuOpen, setMenuOpen] = useState(false);
  const [colForm, setColForm] = useState(null); // índice da coluna | null
  const historyRef = useRef([]), futureRef = useRef([]);
  const saveTimer = useRef(0);
  const gridRef = useRef(null), pointer = useRef("mouse"), lastClick = useRef("");
  const values = useMemo(() => evaluateSheet(doc), [doc]);

  /* ---- gravar: o mesmo respiro do mapa, e o que esperava sobe ao sair ---- */
  const saveNow = () => {
    clearTimeout(saveTimer.current); saveTimer.current = 0;
    const next = { ...docRef.current, updatedAt: Date.now() };
    docRef.current = next; setDoc(next);
    sheets.save(next);
  };
  const scheduleSave = () => { clearTimeout(saveTimer.current); saveTimer.current = setTimeout(saveNow, 400); };
  useEffect(() => () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current); saveTimer.current = 0;
      if (sheets.has(id)) sheets.save({ ...docRef.current, updatedAt: Date.now() });
    }
  }, []);

  /* ---- histórico: cada mudança é um passo, como no mapa ----
     `fn` recebe o documento e devolve o próximo (ou false: nada muda) */
  const change = (fn, options) => {
    const prev = docRef.current;
    const next = fn(prev);
    if (!next || next === prev) return false;
    if (!options || options.history !== false) {
      historyRef.current.push(prev);
      if (historyRef.current.length > 50) historyRef.current.shift();
      futureRef.current = [];
    }
    docRef.current = next; setDoc(next);
    scheduleSave();
    return true;
  };
  const step = (from, to) => {
    if (!from.current.length) return;
    to.current.push(docRef.current);
    if (to.current.length > 50) to.current.shift();
    const next = from.current.pop();
    docRef.current = next; setDoc(next);
    setEdit(null);
    setSel((s) => ({ r: Math.min(s.r, Math.max(0, next.rows.length - 1)), c: Math.min(s.c, next.cols.length - 1) }));
    scheduleSave();
  };
  const undo = () => step(historyRef, futureRef);
  const redo = () => step(futureRef, historyRef);
  /* o "desfazer" do aviso: se nada mudou depois, é o Ctrl+Z; se mudou, volta
     ao retrato de antes, e isso também se desfaz */
  const undoTo = (snapshot) => () => {
    const h = historyRef.current;
    if (h[h.length - 1] === snapshot) undo();
    else change(() => snapshot);
  };

  /* ---- o ajuste que a pessoa aplicou na conversa (o "pedir ao Merlin") ----
     chega uma vez só, ao abrir: é um passo do desfazer, e o aviso diz */
  useEffect(() => {
    const got = takeChange("sheet", id);
    if (!got) return;
    const before = docRef.current;
    const next = normalizeSheet({ ...got.doc, id, createdAt: before.createdAt, updatedAt: Date.now() });
    if (change(() => next)) notify(got.line || "o Merlin mudou a planilha", undoTo(before));
  }, []);
  const askHere = () => {
    if (saveTimer.current) saveNow();
    askMerlin(adjustPrefix("sheet", docRef.current.name), { prefill: true, target: { kind: "sheet", id } });
  };

  /* ---- outra aba ou a nuvem mexeram nesta planilha ---- */
  useEffect(() => sheets.onChange((origin) => {
    if (!sheets.has(id)) { location.hash = ""; return; }
    if (origin === "local") return;
    const fresh = sheets.get(id);
    if (JSON.stringify(fresh) === JSON.stringify(docRef.current)) return;
    docRef.current = fresh; setDoc(fresh);
  }), []);

  /* desfazer fora de campo de texto (no campo, o desfazer é o do navegador) */
  useKeydown((e) => {
    if (!(e.ctrlKey || e.metaKey) || isTyping() || menuOpen || colForm !== null) return;
    const k = e.key.toLowerCase();
    if (k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (k === "y") { e.preventDefault(); redo(); }
  });

  const rows = doc.rows, cols = doc.cols;
  const r = Math.min(sel.r, Math.max(0, rows.length - 1)), c = Math.min(sel.c, cols.length - 1);
  const rawAt = (ri, ci) => (rows[ri] ? rows[ri].cells[cols[ci].id] || "" : "");

  /* ---- células ---- */
  const setCell = (ri, ci, text) => change((d) => {
    const row = d.rows[ri], key = d.cols[ci].id;
    if (!row || (row.cells[key] || "") === text) return false;
    const cells = { ...row.cells };
    if (text) cells[key] = text; else delete cells[key];
    return { ...d, rows: d.rows.map((x, i) => (i === ri ? { ...x, cells } : x)) };
  });
  const focusGrid = () => requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active && active.classList.contains("sh-input")) return; // a tecla seguinte já abriu a célula
    const el = gridRef.current && gridRef.current.querySelector("[data-sel='1']");
    if (el) el.focus({ preventScroll: false });
  });
  const select = (ri, ci) => {
    setSel({ r: Math.max(0, Math.min(rows.length - 1, ri)), c: Math.max(0, Math.min(cols.length - 1, ci)) });
    focusGrid();
  };
  const startEdit = (draft) => { if (rows.length) setEdit({ draft: draft == null ? rawAt(r, c) : draft }); };
  const commit = (text, dr, dc) => {
    setCell(r, c, text.trim() ? text : "");
    setEdit(null);
    select(r + (dr || 0), c + (dc || 0));
  };
  const cancel = () => { setEdit(null); focusGrid(); };

  const onGridKey = (e) => {
    if (edit) return; // o campo da célula cuida das próprias teclas
    const mod = e.ctrlKey || e.metaKey;
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Enter: [1, 0] };
    if (moves[e.key] && !mod) { e.preventDefault(); select(r + moves[e.key][0], c + moves[e.key][1]); return; }
    if (e.key === "Tab" && !mod) {
      const next = e.shiftKey ? c - 1 : c + 1;
      if (next < 0 || next >= cols.length) return; // na borda, o Tab sai da grade
      e.preventDefault(); select(r, next); return;
    }
    if (e.key === "F2") { e.preventDefault(); startEdit(); return; }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); setCell(r, c, ""); return; }
    if (e.key.length === 1 && !mod && !e.altKey) { e.preventDefault(); startEdit(e.key); }
  };

  /* ---- linhas e colunas ---- */
  const addRow = () => {
    if (rows.length >= SHEET_ROWS) { notify("a planilha vai até " + SHEET_ROWS + " linhas"); return; }
    const at = rows.length ? r + 1 : 0;
    /* a seleção vai para a linha nova direto: select() limita pelo tamanho de antes */
    if (change((d) => insertRow(d, at, { id: newId(), cells: {} }))) { setSel({ r: at, c }); focusGrid(); }
  };
  const addCol = () => {
    if (cols.length >= SHEET_COLS) { notify("a planilha vai até a coluna " + colLetter(SHEET_COLS - 1)); return; }
    if (change((d) => insertCol(d, c + 1, { id: newId(), name: "", type: "text" }))) { setSel({ r, c: c + 1 }); focusGrid(); }
  };
  const dropRow = () => {
    if (!rows.length) return;
    const before = docRef.current;
    if (change((d) => removeRow(d, r))) notify("linha apagada", undoTo(before));
  };
  const dropCol = (ci) => {
    if (cols.length <= 1) { notify("a planilha precisa de uma coluna"); return; }
    const before = docRef.current;
    if (change((d) => removeCol(d, ci))) notify("coluna apagada", undoTo(before));
  };

  /* ---- o "mais": exportar e apagar ---- */
  const exportCsv = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toCSV(doc)], { type: "text/csv;charset=utf-8" }));
    a.download = (doc.name || "planilha").replace(/[\\/:*?"<>|]+/g, " ").trim() + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const removeSheet = () => {
    if (saveTimer.current) saveNow();
    const before = sheets.remove(id);
    if (!before) return;
    location.hash = "";
    notify("planilha apagada", () => { sheets.save(before); location.hash = before.id; });
  };

  const address = colLetter(c) + (r + 1);

  return (
    <main className="page page--wide sh-editor">
      <div className="sh-bar">
        <a className="action" href="drawings.html#planilhas" title="voltar para os desenhos" aria-label="Voltar"><BackIcon /></a>
        <input className="sh-name" id="sh-name" maxLength="120" aria-label="Nome da planilha" value={doc.name}
          onChange={(e) => { const v = e.currentTarget.value; change((d) => ({ ...d, name: v }), { history: false }); }}
          onBlur={() => { if (!doc.name.trim()) change((d) => ({ ...d, name: "planilha sem nome" }), { history: false }); }} />
        <button className="pill" type="button" id="sh-ask" title="pedir ao Merlin um ajuste na planilha" aria-label="Pedir ao Merlin" onClick={askHere}>{icon("spark")}<span className="sh-ask__label">pedir ao Merlin</span></button>
        <button className="action" type="button" id="sh-more" title="mais" aria-label="Mais" onClick={() => setMenuOpen(true)}><MoreIcon /></button>
      </div>

      <div className="sh-tools">
        <span className="sh-address t-mono" aria-hidden="true">{rows.length ? address : "—"}</span>
        <span className="sh-raw t-mono" title={rawAt(r, c)}>{rows.length ? rawAt(r, c) || " " : "sem linhas"}</span>
        {wide && (
          <span className="sh-actions">
            <button className="pill pill--mini" type="button" id="sh-add-row" onClick={addRow}>{icon("plus")}linha</button>
            <button className="pill pill--mini" type="button" id="sh-add-col" onClick={addCol}>{icon("plus")}coluna</button>
            <button className="pill pill--mini" type="button" id="sh-col" onClick={() => setColForm(c)} title="nome e tipo da coluna">{"coluna " + colLetter(c)}</button>
            <button className="pill pill--mini" type="button" id="sh-drop-row" disabled={!rows.length} onClick={dropRow} title={"apagar a linha " + (r + 1)}>{icon("trash")}linha</button>
          </span>
        )}
      </div>

      <div className="sh-scroll" ref={gridRef} onKeyDown={onGridKey}>
        <table className="sh-table" aria-label={doc.name}>
          <thead>
            <tr>
              <td className="sh-num sh-corner" aria-hidden="true" />
              {cols.map((col, ci) => (
                <th key={col.id} scope="col" className={"sh-head" + (col.type === "money" || col.type === "number" ? " is-num" : "") + (ci === 0 ? " sh-first" : "")}>
                  <HeadLabel col={col} index={ci} onOpen={wide ? () => setColForm(ci) : null} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const rowLabel = values[row.id][cols[0].id].text;
              return (
                <tr key={row.id}>
                  <td className="sh-num" aria-hidden="true">{ri + 1}</td>
                  {cols.map((col, ci) => {
                    const v = values[row.id][col.id];
                    const on = ri === r && ci === c;
                    const Tag = ci === 0 ? "th" : "td";
                    const spoken = v.cents !== undefined ? (rowLabel && ci ? rowLabel + ": " : "") + "R$ " + v.text : undefined;
                    return (
                      <Tag key={col.id} scope={ci === 0 ? "row" : undefined} data-sel={on ? "1" : undefined} tabIndex={on ? 0 : -1}
                           aria-label={spoken}
                           className={"sh-cell" + (ci === 0 ? " sh-first" : "") + (on ? " is-sel" : "") + (v.kind === "error" ? " is-error" : "")
                             + (v.kind === "number" ? " is-num" : "") + (rawAt(ri, ci).trim().startsWith("=") ? " is-formula" : "")}
                           onPointerDown={(e) => { pointer.current = e.pointerType; }}
                           onClick={() => {
                             if (on && edit) return;
                             /* no toque, tocar já escreve (deslizar rola, e não dispara clique);
                                no mouse, o primeiro clique escolhe e o segundo, na mesma, escreve */
                             const key = row.id + ":" + col.id, again = on && lastClick.current === key;
                             lastClick.current = key;
                             if (pointer.current === "touch" || !wide || again) { setSel({ r: ri, c: ci }); setEdit({ draft: rows[ri].cells[col.id] || "" }); }
                             else select(ri, ci);
                           }}>
                        {on && edit
                          ? <CellInput initial={edit.draft} onCommit={commit} onCancel={cancel} />
                          : <span className="sh-text">{v.text}</span>}
                      </Tag>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <p className="sh-empty">a planilha está sem linhas. {wide ? <button className="action" type="button" title="acrescentar uma linha" aria-label="Acrescentar uma linha" onClick={addRow}>{icon("plus")}</button> : null}</p>}
      </div>
      {wide && <p className="sh-keys t-mono"><kbd>Enter</kbd> desce · <kbd>Tab</kbd> anda · digite ou <kbd>F2</kbd> para editar · <kbd>Delete</kbd> limpa · <kbd>Ctrl</kbd> <kbd>Z</kbd> desfaz · fórmula começa com <kbd>=</kbd>: <span className="mono">=SOMA(B1:B5)</span>, <span className="mono">=B2*C2</span>, MÉDIA, MÍN, MÁX</p>}

      {menuOpen && (
        <Dialog title="mais" onClose={() => setMenuOpen(false)}>
          <div className="sh-menu">
            <button className="pill" type="button" id="sh-csv" onClick={() => { setMenuOpen(false); exportCsv(); }}>exportar csv</button>
            <ProductPick doc={doc} onPick={(app) => change((d) => ({ ...d, app }))} />
            <button className="pill" type="button" id="sh-delete" onClick={() => { setMenuOpen(false); removeSheet(); }}>{icon("trash")}apagar planilha</button>
          </div>
        </Dialog>
      )}
      {colForm !== null && cols[colForm] && (
        <ColumnForm key={cols[colForm].id} col={cols[colForm]} index={colForm} canRemove={cols.length > 1}
          onSave={(patch) => change((d) => ({ ...d, cols: d.cols.map((x, i) => (i === colForm ? { ...x, ...patch } : x)) }))}
          onRemove={() => dropCol(colForm)} onClose={() => setColForm(null)} />
      )}
    </main>
  );
}

/* o cabeçalho da coluna: a letra (a das fórmulas), o nome e o tipo. na tela
   larga é um botão que abre nome e tipo */
function HeadLabel({ col, index, onOpen }) {
  const inner = <>
    <span className="sh-letter" aria-hidden="true">{colLetter(index)}</span>
    <span className="sh-colname">{col.name}</span>
    {col.type !== "text" && <span className="sh-type">{COL_TYPES.find((t) => t.id === col.type).label}</span>}
  </>;
  if (!onOpen) return inner;
  return <button type="button" className="sh-headbtn" title={"nome e tipo da coluna " + colLetter(index)} onClick={onOpen}>{inner}</button>;
}

/* o campo dentro da célula. Enter grava e desce, Tab grava e anda, Esc
   desiste; sair dele (clicar fora) grava. `closed` impede que o blur de
   quando o campo some grave de novo. */
function CellInput({ initial, onCommit, onCancel }) {
  const ref = useRef(null), closed = useRef(false);
  const [value, setValue] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const done = (fn) => { if (closed.current) return; closed.current = true; fn(); };
  return (
    <input ref={ref} className="sh-input" value={value} aria-label="Conteúdo da célula" spellCheck="false"
      onChange={(e) => setValue(e.currentTarget.value)}
      onBlur={() => done(() => onCommit(value, 0, 0))}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); done(() => onCommit(value, 1, 0)); }
        else if (e.key === "Tab") { e.preventDefault(); done(() => onCommit(value, 0, e.shiftKey ? -1 : 1)); }
        else if (e.key === "Escape") { e.preventDefault(); done(onCancel); }
      }} />
  );
}

/* a coluna: nome e tipo, e apagar. só na tela larga */
function ColumnForm({ col, index, canRemove, onSave, onRemove, onClose }) {
  const [v, bind] = useFields({ name: col.name, type: col.type });
  return (
    <Form title={"coluna " + colLetter(index)} submit="salvar" remove={canRemove ? "apagar a coluna" : undefined}
          onRemove={onRemove} onClose={onClose}
          onSubmit={() => { if (v.name !== col.name || v.type !== col.type) onSave({ name: v.name.trim().slice(0, 60), type: v.type }); }}>
      <Field label="nome" full><input className="input" maxLength="60" placeholder="o que a coluna guarda" {...bind("name")} /></Field>
      <Field label="tipo" full>
        <div className="chips" role="radiogroup" aria-label="tipo da coluna">
          {COL_TYPES.map((t) => (
            <label key={t.id} className={"chip sh-choice" + (v.type === t.id ? " is-on" : "")}>
              <input type="radio" name="type" value={t.id} checked={v.type === t.id} onChange={bind("type").onChange} />{t.label}
            </label>
          ))}
        </div>
      </Field>
    </Form>
  );
}

/* a que produto a planilha pertence (VISAO, 9): aparece na lista de desenhos */
function ProductPick({ doc, onPick }) {
  const apps = useCollection("apps");
  const list = apps.all().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (!list.length && !doc.app) return null;
  return (
    <label className="sh-product">
      <span className="field-label">ligada ao produto</span>
      <select className="input" value={doc.app} onChange={(e) => onPick(e.currentTarget.value)}>
        <option value="">nenhum</option>
        {list.map((a) => <option key={a.id} value={a.id}>{a.name || "produto sem nome"}</option>)}
      </select>
    </label>
  );
}

mount(<Sheets />, "app");
