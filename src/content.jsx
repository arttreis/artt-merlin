/* merlin · conteudo
   o que vai ao ar: um quadro por etapa (ideia → publicado), um cartao por
   peca. o roteiro mora DENTRO do cartao — clicou, abre a peca inteira do lado,
   com o roteiro em markdown. nao ha uma tela de roteiros separada: um roteiro
   solto, sem a peca que ele serve, e um arquivo que ninguem acha.

   a data do cartao e a da publicacao, e aparece no calendario. o trabalho de
   gravar e editar e tarefa (com duracao, no dia), e nasce do botao "virar
   tarefa" — o cartao nao cobra minuto nenhum sozinho. */
import "./shared/base.css";
import "./content.css";
import { initPage, newId, notify, today, dateLabel, dayOf, isDay, parseMentions, clientName, setPageContext } from "./shared/core.js";
import { useState, useEffect, useRef, useLayoutEffect, Fragment } from "react";
import {
  mount, useCollection, useClients, useHash, setHash, useKeydown, isTyping,
  useFields, Form, Field, DateField, Markdown, ClientBadge, clientOptionList, icon
} from "./shared/ui.jsx";
import { TaskDialog } from "./shared/task-form.jsx";

initPage("content");

/* ---------- a forma ---------- */
const FORMATS = [
  { id: "youtube", label: "YouTube" },
  { id: "reels", label: "Reels" },
  { id: "carousel", label: "carrossel" },
  { id: "story", label: "story" },
  { id: "email", label: "e-mail" },
  { id: "other", label: "outro" }
];
const STAGES = [
  { id: "idea", label: "ideia" },
  { id: "script", label: "roteiro" },
  { id: "record", label: "gravar" },
  { id: "edit", label: "editar" },
  { id: "scheduled", label: "agendado" },
  { id: "published", label: "publicado" }
];
const FORMAT_IDS = FORMATS.map((f) => f.id), STAGE_IDS = STAGES.map((s) => s.id);
const formatLabel = (id) => (FORMATS.find((f) => f.id === id) || {}).label || id;
const stageLabel = (id) => (STAGES.find((s) => s.id === id) || {}).label || id;

function normalize(d) {
  d = d || {};
  return {
    ...d,
    id: String(d.id),
    title: String(d.title || "").slice(0, 200),
    format: FORMAT_IDS.includes(d.format) ? d.format : "youtube",
    stage: STAGE_IDS.includes(d.stage) ? d.stage : "idea",
    /* o dia em que vai ao ar. sem dia, a peca so existe no quadro */
    date: isDay(d.date) ? d.date : "",
    client: String(d.client || ""),
    script: String(d.script || ""),
    history: Array.isArray(d.history) ? d.history : [],
    createdAt: +d.createdAt || Date.now(),
    updatedAt: +d.updatedAt || +d.createdAt || Date.now()
  };
}

/* o esqueleto do roteiro: bullets para falar, nao texto para ler */
const SCRIPT_MOLD = (title) => "# " + (title || "roteiro") + "\n\n*bullets para falar, não texto para ler*\n\n## gancho\n\n- \n\n## desenvolvimento\n\n- \n\n## fechamento\n\n- \n";

/* a tarefa que cada etapa pede, quando pede */
const TASK_VERB = { idea: "roteirizar", script: "gravar", record: "gravar", edit: "editar", scheduled: "publicar", published: "revisar" };

const lateOf = (c) => c.date && c.date < today() && c.stage !== "published";
const scriptLines = (s) => String(s || "").split(/\r?\n/).filter((l) => /^\s*[-*]\s+\S/.test(l)).length;

function Content() {
  const store = useCollection("content", { normalize });
  useClients();
  const hash = useHash();
  const [openId, setOpenId] = useState(null);
  const [newIn, setNewIn] = useState(null);     // etapa | null
  const [taskFor, setTaskFor] = useState(null); // id | null
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState("");
  const openRef = useRef(null);
  openRef.current = openId;

  const all = store.all();
  const open = openId ? store.get(openId) : null;

  /* a peca aberta, pro assistente propor um roteiro sem perguntar o id */
  useEffect(() => {
    if (!open) { setPageContext(null); return () => setPageContext(null); }
    setPageContext(() =>
      "Peça de conteúdo aberta: " + open.title + (open.client ? " · cliente: " + clientName(open.client) + " (id " + open.client + ")" : "") + ". id: " + open.id + ". etapa: " + open.stage + ". " +
      (open.script.trim() ? "já tem roteiro (" + open.script.length + " caracteres)" : "ainda sem roteiro")
    );
    return () => setPageContext(null);
  }, [open && open.id, open && open.updatedAt]);

  const openPiece = (id) => { setOpenId(id); setHash(id); };
  const closePiece = () => { setOpenId(null); setHash(""); };
  useEffect(() => {
    if (!hash) { if (openRef.current) setOpenId(null); return; }
    if (store.has(hash)) setOpenId(hash);
  }, [hash]);
  useEffect(() => { if (openId && !open) closePiece(); });

  const update = (id, mutate) => {
    const now = store.get(id);
    if (!now) return null;
    const d = structuredClone(now);
    mutate(d);
    d.updatedAt = Date.now();
    store.save(d);
    return d;
  };
  const moveStage = (id, stage) => {
    const c = store.get(id);
    if (!c || c.stage === stage) return;
    update(id, (d) => { d.history.push({ from: d.stage, to: stage, at: Date.now() }); d.stage = stage; });
  };
  const create = (v) => {
    const now = Date.now();
    const doc = normalize({ id: newId(), title: v.title, format: v.format, stage: v.stage, date: v.date, client: v.client, createdAt: now, updatedAt: now });
    store.save(doc);
    openPiece(doc.id);
  };
  const remove = (id) => {
    const before = store.remove(id);
    closePiece();
    if (before) notify('"' + (before.title || "conteúdo") + '" apagado', () => store.save(before));
  };

  useKeydown((e) => {
    if (e.key === "Escape") { if (isTyping()) { document.activeElement.blur(); return; } if (openRef.current) closePiece(); return; }
    if (isTyping() || newIn || taskFor) return;
    if (e.key === "n" || e.key === "N") { e.preventDefault(); setNewIn("idea"); }
  });

  return (
    <>
      <div className="header">
        <div>
          <h1>conteúdo</h1>
          <Summary all={all} />
        </div>
        <div className="actions">
          <button className="pill pill--green" type="button" onClick={() => setNewIn("idea")}>{icon("plus")}conteúdo</button>
        </div>
      </div>

      {!all.length ? (
        <div className="content-empty block">
          <p className="content-empty__title">nada no quadro ainda</p>
          <p className="content-empty__text">Cada peça passa de ideia a publicada. O roteiro mora dentro dela, e a data de publicação aparece no calendário.</p>
          <button className="pill pill--green" type="button" onClick={() => setNewIn("idea")}>{icon("plus")}primeira ideia</button>
        </div>
      ) : (
        <div className="board-c">
          {STAGES.map((st) => {
            const items = all.filter((c) => c.stage === st.id).sort((a, b) => (a.date || "9").localeCompare(b.date || "9") || b.updatedAt - a.updatedAt);
            return (
              <section key={st.id} className={"col-c" + (over === st.id ? " is-over" : "")}
                       onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(st.id); }}
                       onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(""); }}
                       onDrop={(e) => { e.preventDefault(); setOver(""); moveStage(e.dataTransfer.getData("text/plain"), st.id); }}>
                <header className="col-c__head">
                  <span className="col-c__name">{st.label}</span>
                  {items.length > 0 && <span className="col-c__count">{items.length}</span>}
                  <button className="action col-c__add" type="button" title={"novo em " + st.label} aria-label={"Novo conteúdo em " + st.label} onClick={() => setNewIn(st.id)}>{icon("plus")}</button>
                </header>
                <div className="col-c__cards">
                  {items.map((c) => (
                    <PieceCard key={c.id} c={c} active={c.id === openId} dragging={dragging === c.id} onOpen={() => openPiece(c.id)}
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; requestAnimationFrame(() => setDragging(c.id)); }}
                      onDragEnd={() => setDragging(null)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {open && <Piece key={open.id} c={open} update={update} onClose={closePiece} onStage={(s) => moveStage(open.id, s)}
                      onTask={() => setTaskFor(open.id)} onRemove={() => remove(open.id)} />}
      {newIn && <NewPieceForm stage={newIn} onCreate={create} onClose={() => setNewIn(null)} />}
      {taskFor && store.get(taskFor) && (() => {
        const c = store.get(taskFor);
        return <TaskDialog title={(TASK_VERB[c.stage] || "fazer") + ": " + c.title} client={c.client} origin={{ type: "content", id: c.id }}
                           date={c.date && c.date > today() && c.stage !== "scheduled" ? today() : (c.date || today())}
                           onClose={() => setTaskFor(null)} />;
      })()}
    </>
  );
}

function Summary({ all }) {
  if (!all.length) return <p className="sub">o que vai ao ar, da ideia à publicação</p>;
  const t = today();
  const week = new Date(); week.setDate(week.getDate() + 7);
  const next7 = all.filter((c) => c.date && c.date >= t && c.date <= dayOf(week) && c.stage !== "published").length;
  const late = all.filter(lateOf).length;
  const live = all.filter((c) => c.stage !== "published").length;
  const parts = [<><b>{live}</b> em andamento</>];
  if (next7) parts.push(<><b>{next7}</b> para os próximos 7 dias</>);
  if (late) parts.push(<><b>{late}</b> com a data passada</>);
  return <p className="sub sub--numbers">{parts.map((p, i) => <Fragment key={i}>{i ? " · " : ""}{p}</Fragment>)}</p>;
}

function PieceCard({ c, active, dragging, onOpen, onDragStart, onDragEnd }) {
  const bullets = scriptLines(c.script);
  return (
    <article className={"piece" + (active ? " is-active" : "") + (dragging ? " is-dragging" : "")} draggable="true" tabIndex="0" data-id={c.id}
             onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <p className="piece__title">{c.title || "sem título"}</p>
      <div className="piece__meta">
        <span className={"fmt fmt--" + c.format}>{formatLabel(c.format)}</span>
        {c.date && <span className={"piece__date" + (lateOf(c) ? " is-late" : "")} title={lateOf(c) ? "a data passou e não foi ao ar" : "vai ao ar"}>{c.date === today() ? "hoje" : dateLabel(c.date)}</span>}
        {c.client && <ClientBadge id={c.client} />}
        {bullets > 0 && <span className="piece__script" title={bullets + (bullets === 1 ? " tópico" : " tópicos") + " no roteiro"}>{icon("file")}{bullets}</span>}
      </div>
    </article>
  );
}

/* ---------- a peca aberta ----------
   o painel do lado: a ficha em uma linha (formato, etapa, data, cliente) e o
   roteiro embaixo, que e o que ocupa a tela. abre lendo quando ha roteiro;
   clicar no texto escreve. */
function Piece({ c, update, onClose, onStage, onTask, onRemove }) {
  const set = (mutate) => update(c.id, mutate);
  const [editing, setEditing] = useState(!c.script.trim());
  const [draft, setDraft] = useState(c.script);
  const [title, setTitle] = useState(c.title);
  const areaRef = useRef(null);
  const timer = useRef(null);
  const draftRef = useRef(draft); draftRef.current = draft;

  /* o roteiro grava com um respiro: gravar a cada tecla sincronizaria o
     documento inteiro dezenas de vezes por frase */
  const flush = () => { clearTimeout(timer.current); timer.current = null; set((d) => { d.script = draftRef.current; }); };
  const schedule = () => { clearTimeout(timer.current); timer.current = setTimeout(flush, 500); };
  useEffect(() => () => { if (timer.current) flush(); }, []);
  useLayoutEffect(() => { const t = areaRef.current; if (t) { t.style.height = "auto"; t.style.height = Math.max(280, t.scrollHeight) + "px"; } }, [editing, draft]);

  return (
    <div className="piece-panel" role="dialog" aria-modal="false" aria-label={c.title || "conteúdo"}>
      <div className="piece-panel__veil" onClick={onClose} />
      <aside className="piece-panel__box">
        <div className="piece-panel__bar">
          <span className="piece-panel__where">{stageLabel(c.stage)}</span>
          <span className="spacer" />
          <button className="pill pill--mini" type="button" onClick={onTask} title="gravar, editar, publicar: vira tarefa com dia e duração">{icon("task")}virar tarefa</button>
          <button className="action" type="button" title="apagar" aria-label="Apagar conteúdo" onClick={onRemove}>{icon("trash")}</button>
          <button className="action" type="button" title="fechar (esc)" aria-label="Fechar" onClick={onClose}>{icon("x")}</button>
        </div>
        <div className="piece-panel__body">
          <input className="piece-panel__title" placeholder="título" aria-label="título" value={title}
                 onChange={(e) => { const v = e.currentTarget.value; setTitle(v); set((d) => { d.title = v.slice(0, 200); }); }} />

          <div className="piece-sheet">
            <span className="piece-sheet__k">etapa</span>
            <div className="chips">{STAGES.map((s) => <button key={s.id} type="button" className="chip" aria-pressed={c.stage === s.id} onClick={() => onStage(s.id)}>{s.label}</button>)}</div>
            <span className="piece-sheet__k">formato</span>
            <div className="chips">{FORMATS.map((f) => <button key={f.id} type="button" className="chip" aria-pressed={c.format === f.id} onClick={() => set((d) => { d.format = f.id; })}>{f.label}</button>)}</div>
            <span className="piece-sheet__k">vai ao ar</span>
            <div className="piece-sheet__row">
              <DateField value={c.date} onChange={(e) => { const v = e.currentTarget.value; set((d) => { d.date = v; }); }} />
              <select className="select piece-sheet__client" aria-label="cliente" value={c.client} onChange={(e) => { const v = e.currentTarget.value; set((d) => { d.client = v; }); }}>
                {clientOptionList("meu")}
              </select>
            </div>
          </div>

          <div className="script">
            <p className="script__head">
              <span>roteiro</span>
              {!!draft.trim() && <button className="action" type="button" title={editing ? "ver formatado" : "editar"} aria-label={editing ? "Ver formatado" : "Editar"} onClick={() => { if (editing) flush(); setEditing((v) => !v); }}>{icon(editing ? "eye" : "pencil")}</button>}
              {!draft.trim() && <button className="action" type="button" title="usar o esqueleto" aria-label="Usar o esqueleto" onClick={() => { const m = SCRIPT_MOLD(c.title); setDraft(m); set((d) => { d.script = m; }); setEditing(true); }}>{icon("file")}</button>}
            </p>
            {editing
              ? <textarea ref={areaRef} className="script__input" placeholder="o roteiro em tópicos. # título, ## seção, - tópico"
                          value={draft} onChange={(e) => { setDraft(e.currentTarget.value); schedule(); }} onBlur={() => { if (timer.current) flush(); }} />
              : <div className="script__read" title="clique para editar" onClick={(e) => { if (!e.target.closest("a")) setEditing(true); }}><Markdown text={draft} /></div>}
          </div>
        </div>
      </aside>
    </div>
  );
}

function NewPieceForm({ stage, onCreate, onClose }) {
  const [v, bind] = useFields({ title: "", format: "youtube", stage, date: "", client: "" });
  const submit = () => {
    const found = parseMentions(v.title);
    const title = found.title.trim();
    if (!title) { notify("o conteúdo precisa de um título"); return false; }
    onCreate({ ...v, title, client: v.client || found.client || "" });
  };
  return (
    <Form title="novo conteúdo" sub="abre em seguida, com espaço para o roteiro" submit="criar e abrir" onSubmit={submit} onClose={onClose}>
      <Field label="título" full><input className="input" required maxLength="200" placeholder="do zero a R$ 800 mil em 5 meses · @cliente" {...bind("title")} /></Field>
      <Field label="formato"><select className="select" {...bind("format")}>{FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></Field>
      <Field label="etapa"><select className="select" {...bind("stage")}>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
      <Field label="vai ao ar"><DateField {...bind("date")} /></Field>
      <Field label="cliente"><select className="select" {...bind("client")}>{clientOptionList("meu")}</select></Field>
    </Form>
  );
}

mount(<Content />, "app");
