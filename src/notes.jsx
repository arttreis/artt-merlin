/* merlin · a caixa de notas
   a nota chega como uma mensagem chega: vira uma linha na lista da esquerda,
   agrupada por dia, e abre no painel da direita sem sair da tela. */
import "./shared/base.css";
import "./notes.css";
import {
  initPage, newId, today, dayOf, addDays, dateLabel, notify, sendToDay, api, cloud,
  uploadFile, deleteFile, fileUrl, isImage, FILE_TYPES,
  parseMentions, listClients, clientName, collection
} from "./shared/core.js";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import {
  mount, useCollection, useClients, useHash,
  useKeydown, isTyping, useFields, Form, Field, Dialog, Markdown, clientOptionList, icon
} from "./shared/ui.jsx";

initPage("notes");   // monta a barra, carrega os clientes, retoma a sessao

/* icones proprios: so esta pagina usa. a faisca e o gesto de pedir ajuda ao
   Merlin; a caixa e arquivar (a de icons.jsx); a pessoa e "virar projeto de
   cliente". */
const SparkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" /><path d="M19 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" />
  </svg>
);
const PersonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0114 0" />
  </svg>
);
const ListIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h10" />
  </svg>
);
const BoardIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="9.5" y="4" width="5" height="11" rx="1.5" /><rect x="16" y="4" width="5" height="8" rx="1.5" />
  </svg>
);
const BulbIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.7.5 1 1.3 1 2.1h5c0-.8.3-1.6 1-2.1A6 6 0 0012 3z" />
  </svg>
);
const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);
const ChevronIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/* os 5 estagios, na ordem em que aparecem no quadro. e a unica fonte da
   verdade da lista: o select do painel, a normalizacao e o quadro leem daqui.
   o id vai no documento; o rotulo e o que aparece na tela. */
const STAGES = [
  { id: "seed", label: "semente" },
  { id: "exploring", label: "explorando" },
  { id: "defined", label: "definida" },
  { id: "executing", label: "executando" },
  { id: "archived", label: "arquivada" }
];
const STAGE_IDS = STAGES.map((s) => s.id);
const stageLabel = (id) => { const s = STAGES.find((s) => s.id === id); return s ? s.label : id; };

function normalize(d) {
  return {
    ...d,
    title: String(d.title || "").slice(0, 300),
    body: String(d.body || ""),
    stage: STAGE_IDS.includes(d.stage) ? d.stage : "seed",
    client: d.client || "",
    steps: Array.isArray(d.steps) ? d.steps : [],
    /* os prints: so o bilhete do arquivo, nunca o binario. um documento
       antigo nao tem o campo, e isso e valido — a secao aparece vazia. */
    files: (Array.isArray(d.files) ? d.files : []).map((f) => ({
      id: String(f.id || ""), name: String(f.name || "").slice(0, 120),
      type: String(f.type || ""), size: +f.size || 0, at: +f.at || 0
    })).filter((f) => f.id),
    outputs: Array.isArray(d.outputs) ? d.outputs : [],
    /* a historia guarda dois tipos: "stage" (mudou de estagio) e "step"
       (concluiu um passo). documento antigo so tem o primeiro, e isso e
       valido — a atividade simplesmente mostra menos. */
    history: Array.isArray(d.history) ? d.history : [],
    createdAt: d.createdAt || d.updatedAt || Date.now(),
    updatedAt: d.updatedAt || d.createdAt || Date.now()
  };
}

/* unica excecao ao "nao grave no localStorage": preferencia de tela */
const VIEW_KEY = "merlin:notes:view";
const readView = () => { try { return localStorage.getItem(VIEW_KEY) === "board" ? "board" : "list"; } catch (e) { return "list"; } };

/* ---------- tempo, do jeito que uma caixa de entrada mostra ---------- */

const HOUR = 3600000;
const dayOfStamp = (ms) => dayOf(new Date(ms));
/* dentro do grupo de hoje o que importa e "ha quanto tempo"; nos outros
   dias, a hora do dia — o proprio grupo ja diz que dia foi */
function shortWhen(ms) {
  const diff = Date.now() - ms;
  if (dayOfStamp(ms) === today()) {
    if (diff < 60000) return "agora";
    if (diff < HOUR) return Math.round(diff / 60000) + " min";
    return Math.round(diff / HOUR) + " h";
  }
  const d = new Date(ms);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
function longWhen(ms) {
  const diff = Date.now() - ms;
  if (diff < 60000) return "agora";
  if (diff < HOUR) return "há " + Math.round(diff / 60000) + " min";
  if (diff < 24 * HOUR && dayOfStamp(ms) === today()) return "há " + Math.round(diff / HOUR) + " h";
  const day = dayOfStamp(ms);
  if (day === addDays(today(), -1)) return "ontem";
  return dateLabel(day, day.slice(0, 4) !== today().slice(0, 4));
}
function groupLabel(day) {
  if (day === today()) return "hoje";
  if (day === addDays(today(), -1)) return "ontem";
  return dateLabel(day, day.slice(0, 4) !== today().slice(0, 4));
}
const stampLabel = (ms) => new Date(ms).toLocaleString("pt-BR");

/* ---------- leitura do documento ---------- */

/* a previa e a primeira linha de prosa do corpo; sem corpo, o primeiro
   passo aberto; sem nada, o silencio — a linha fica so com o estagio */
function preview(d) {
  const line = String(d.body || "").split(/\r?\n/).map((l) => l.replace(/^[#\-*\d.)\s\[\]x]+/i, "").trim()).find(Boolean);
  if (line) return line;
  const step = d.steps.find((s) => !s.done);
  return step ? "→ " + step.text : "";
}
const isUntouched = (d) => d.stage === "seed" && !d.body && !d.steps.length;
const stepsDone = (d) => d.steps.filter((s) => s.done).length;

/* ---------- a pagina ----------
   o estado de tela mora aqui: a visao (lista/quadro), a nota aberta, a
   caixa de nota nova, as sugestoes do merlin e as secoes dobradas. nada
   disso e documento — some ao recarregar, como deve (a visao e a excecao). */
function Notes() {
  const notes = useCollection("notes", { normalize });
  useClients();
  const hash = useHash();
  const [view, setView] = useState(readView);
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState(false);
  const [suggestions, setSuggestions] = useState(null);   // { targetId, items:[{type, title, note, checked}] } | null
  const [thinking, setThinking] = useState(false);
  const [panelSync, setPanelSync] = useState(0);          // sobe quando o painel deve reler o documento inteiro
  const [sections, setSections] = useState({ steps: true, prints: true, activity: true });
  const [, tick] = useState(0);
  const listRef = useRef(null);
  const focusTitle = useRef(false);   // o painel que montar em seguida leva o foco para o titulo
  /* espelho do openId que muda na hora, nao so no render: o efeito do hash
     roda depois da pintura e precisa saber o que um Esc no meio do caminho
     ja fez, senao reabre o painel que acabou de fechar */
  const openIdRef = useRef(null);
  const setOpen = (id) => { openIdRef.current = id; setOpenId(id); };

  const all = notes.all();
  /* arquivada sai da lista viva — senao ela ficaria acumulando para sempre,
     do mesmo jeito que uma tarefa feita nao volta a poluir a fila do dia. mas
     sair da lista nao e sumir: elas descem para o rodape, fechadas, e voltam
     de la. arquivar que nao tem volta a vista e so um apagar com outro nome. */
  const byRecent = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);
  const listItems = all.filter((d) => d.stage !== "archived").sort(byRecent);
  const archivedItems = all.filter((d) => d.stage === "archived").sort(byRecent);
  const live = listItems.length;
  const open = openId ? notes.get(openId) : null;

  /* a hora relativa ("5 min") envelhece sozinha */
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 60000); return () => clearInterval(t); }, []);

  const changeView = (v) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch (e) {} };
  const hashId = () => { const h = decodeURIComponent(location.hash.slice(1)); return h && notes.has(h) ? h : ""; };

  /* ---------- abrir e fechar o painel ---------- */
  const openNote = (id, opts = {}) => {
    const d = notes.get(id);
    if (!d) return;
    const changed = openIdRef.current !== id;
    focusTitle.current = !opts.noFocus && changed && !d.title;
    setOpen(id);
    if (!opts.keepHash) location.hash = id;
  };
  const closePanel = (opts = {}) => {
    setOpen(null);
    if (!opts.keepHash && hashId()) history.replaceState(null, "", location.pathname + location.search);
  };
  /* o hash manda: quem chega por link abre a nota; quem apaga o hash fecha.
     le a URL agora, nao o valor que disparou o efeito: entre o hashchange e
     a pintura um Esc pode ja ter limpado o hash. */
  useEffect(() => {
    const id = hashId();
    if (id) { if (view !== "list") changeView("list"); openNote(id, { keepHash: true }); }
    else if (openIdRef.current) closePanel({ keepHash: true });
  }, [hash]);
  /* a nota aberta sumiu por fora (outra aba): o painel fecha sozinho */
  useEffect(() => { if (openId && !open) closePanel({ keepHash: true }); });

  /* ---------- gravar ---------- */
  const saveNote = (doc) => notes.save({ ...doc, updatedAt: Date.now() });
  const recordOutput = (doc, type, refId) => saveNote({ ...doc, outputs: doc.outputs.concat([{ type, id: refId || "", at: Date.now() }]) });
  /* mudar de estagio deixa rastro: e a unica mudanca de campo que conta como
     acontecimento — cliente e classificacao, estagio e caminho */
  const changeStage = (doc, next) => {
    if (!doc || doc.stage === next) return;
    saveNote({ ...doc, stage: next, history: doc.history.concat([{ type: "stage", from: doc.stage, to: next, at: Date.now() }]) });
  };
  const pull = (doc) => {
    sendToDay({ title: doc.title || "nota sem título", client: doc.client || "", origin: { type: "note", id: doc.id } });
    recordOutput(doc, "day", "");
  };
  const removeNote = (id) => {
    const before = notes.remove(id);
    if (openId === id) closePanel();
    if (before) notify("nota apagada", () => notes.save(before));
  };
  const archiveOrRestore = (doc) => {
    if (doc.stage === "archived") {
      /* volta para onde estava antes de arquivar, se der para saber */
      const last = doc.history.slice().reverse().find((h) => h.type === "stage" && h.to === "archived");
      changeStage(doc, last && STAGE_IDS.includes(last.from) && last.from !== "archived" ? last.from : "seed");
    } else {
      changeStage(doc, "archived");
      notify("nota arquivada", () => { const now = notes.get(doc.id); if (now) changeStage(now, doc.stage); });
    }
  };
  const create = (doc) => {
    notes.save(doc);
    if (view !== "list") changeView("list");
    openNote(doc.id);
  };

  /* ---------- saidas: mapa e cliente ---------- */
  const toMap = (d) => {
    const maps = collection("maps");
    const mapId = newId(), now = Date.now();
    maps.save({
      id: mapId, name: d.title || "sem título", note: d.id, client: d.client || "",
      root: { id: newId(), title: d.title || "sem título", note: "", color: 0, collapsed: false, children: [] },
      createdAt: now, updatedAt: now
    });
    recordOutput(d, "map", mapId);
    location.href = "maps.html#" + mapId;
  };
  const toClient = (d) => {
    recordOutput(d, "client", "");
    location.href = "clients.html#new?note=" + encodeURIComponent(d.id);
  };

  /* ---------- ramificar: o Merlin le a nota e sugere perguntas, caminhos e passos ---------- */
  const expand = async (d) => {
    if (thinking) return;
    const targetId = d.id;
    setThinking(true);
    try {
      const r = await api("/merlin", {
        method: "POST",
        body: JSON.stringify({
          task: "expand",
          context: {
            title: d.title || "", body: d.body || "", stage: d.stage || "",
            steps: d.steps.map((s) => s.text),
            client: clientName(d.client) || ""
          }
        })
      });
      if (r.ok) openSuggestions(targetId, Array.isArray(r.body.suggestions) ? r.body.suggestions.slice(0, 12) : []);
      else if (r.status === 401) notify("entre para usar o Merlin");
      else notify(r.body.error || "o Merlin não respondeu");
    } catch (e) {
      notify("não consegui falar com o Merlin");
    } finally { setThinking(false); }
  };
  /* as sugestoes nunca gravam direto: passam pelo dialogo, marcadas por
     padrao, porque o modelo erra tom e contexto de vez em quando — uma
     pergunta ruim virando passo sozinha polui o checklist mais rapido do que
     ajuda. o filtro e a leitura de quem pediu, antes de qualquer gravacao. */
  const openSuggestions = (targetId, list) => setSuggestions({
    targetId,
    items: list.filter((s) => s && s.title && SUGGESTION_GROUPS[s.type])
      .map((s) => ({ type: s.type, title: String(s.title), note: String(s.note || ""), checked: true }))
  });
  const toggleSuggestion = (i, checked) => setSuggestions((s) => ({ ...s, items: s.items.map((it, j) => j === i ? { ...it, checked } : it) }));
  /* pergunta e passo viram passo (pergunta ganha "? " na frente, para nao se
     confundir com um passo de execucao); caminho vira uma secao de markdown no
     corpo — e o unico dos tres que e prosa, nao checklist. */
  const addSuggestions = () => {
    const d = notes.get(suggestions.targetId);
    if (!d) { setSuggestions(null); return; }
    const chosen = suggestions.items.filter((s) => s.checked);
    const newSteps = chosen.filter((s) => s.type === "question" || s.type === "step")
      .map((s) => ({ id: newId(), text: (s.type === "question" ? "? " : "") + s.title, done: false }));
    const paths = chosen.filter((s) => s.type === "path");
    let body = d.body || "";
    if (paths.length) {
      body = body.replace(/\s+$/, "");
      body += (body ? "\n\n" : "") + "## caminhos\n" + paths.map((s) => "- **" + s.title + "**" + (s.note ? " — " + s.note : "")).join("\n");
    }
    const targetId = suggestions.targetId;
    saveNote({ ...d, steps: d.steps.concat(newSteps), body });
    setSuggestions(null);
    /* refresca o painel se ainda for a mesma nota aberta: isto e uma acao
       explicita (nao digitacao), entao pode reler o documento inteiro sem
       medo de atropelar o que o usuario esta escrevendo */
    if (openId === targetId) setPanelSync((n) => n + 1);
  };

  /* ---------- setas percorrem a lista como numa caixa de entrada ----------
     a nota abre ao lado sem tirar o foco da lista, entao da para ler varias
     so com o teclado */
  const goTo = (delta) => {
    if (!listItems.length) return;
    const i = listItems.findIndex((d) => d.id === openId);
    const target = listItems[i < 0 ? (delta > 0 ? 0 : listItems.length - 1) : Math.max(0, Math.min(listItems.length - 1, i + delta))];
    openNote(target.id, { noFocus: true });
    const el = listRef.current && listRef.current.querySelector('[data-id="' + target.id + '"]');
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: "nearest" }); }
  };

  /* ---------- atalhos ----------
     o dialogo de sugestoes e a caixa de nota nova fecham o proprio Esc em
     captura (ui.jsx), antes de chegar aqui. */
  useKeydown((e) => {
    if (e.key === "Escape") {
      if (isTyping()) { document.activeElement.blur(); return; }   // primeiro Esc sai do campo; o segundo fecha
      if (openId) closePanel();
      return;
    }
    if (suggestions || form || isTyping()) return;
    if (e.key === "n" || e.key === "/") { e.preventDefault(); setForm(true); }
    else if (view === "list" && (e.key === "ArrowDown" || e.key === "j")) { e.preventDefault(); goTo(1); }
    else if (view === "list" && (e.key === "ArrowUp" || e.key === "k")) { e.preventDefault(); goTo(-1); }
  });

  const actions = {
    open: (id) => openNote(id), close: () => closePanel(),
    pull, archive: archiveOrRestore, remove: removeNote, save: saveNote, changeStage, toMap, toClient, expand,
    toggleSection: (k) => setSections((s) => ({ ...s, [k]: !s[k] }))
  };

  return (
    <>
      <div className="top">
        <h1>notas</h1>
        <span className="count">{live + (live === 1 ? " nota" : " notas")}</span>
        <button className="pill pill--green pill--mini top__new" type="button" title="nova nota (n)" onClick={() => setForm(true)}>{icon("plus")}nota</button>
        <div className="views" role="tablist" aria-label="Visão">
          <button className="action" type="button" role="tab" aria-selected={String(view === "list")} title="lista" onClick={() => changeView("list")}><ListIcon /></button>
          <button className="action" type="button" role="tab" aria-selected={String(view === "board")} title="quadro por estágio" onClick={() => changeView("board")}><BoardIcon /></button>
        </div>
      </div>

      <div className="screen" data-mobile={open ? "panel" : "list"}>
        {view === "list" ? (
          <>
            <NoteList items={listItems} archived={archivedItems} openId={openId} listRef={listRef} actions={actions} />
            {open
              ? <NotePanel key={open.id} note={open} notes={notes} sync={panelSync} thinking={thinking} focusTitle={focusTitle} sections={sections} actions={actions} />
              : <EmptyPanel />}
          </>
        ) : <Board items={all} onDrop={(id, stage) => changeStage(notes.get(id), stage)} onOpen={(id) => { changeView("list"); openNote(id); }} />}
      </div>

      {form && <NoteForm onCreate={create} onClose={() => setForm(false)} />}
      {suggestions && <SuggestionsDialog items={suggestions.items} onToggle={toggleSuggestion} onAdd={addSuggestions} onClose={() => setSuggestions(null)} />}
    </>
  );
}

/* ---------- a lista, agrupada por dia ---------- */
function NoteList({ items, archived, openId, listRef, actions }) {
  const [openArchive, setOpenArchive] = useState(false);
  const rows = [];
  let group = "";
  items.forEach((d) => {
    const day = dayOfStamp(d.updatedAt || d.createdAt);
    if (day !== group) { group = day; rows.push(<p key={"day:" + day} className="group">{groupLabel(day)}</p>); }
    rows.push(<NoteItem key={d.id} d={d} active={d.id === openId} actions={actions} />);
  });
  return (
    <section className="list-col">
      <div className="list-col__scroll">
        <div role="list" ref={listRef}>{rows}</div>
        {!items.length && <p className="list-empty">Nada aqui. O "+" em cima guarda o que ainda não é tarefa.</p>}
        {!!archived.length && (
          <>
            <button className="group group--fold" type="button" aria-expanded={String(openArchive)}
                    onClick={() => setOpenArchive((v) => !v)}>
              {icon("archive")}
              <span>{archived.length + (archived.length === 1 ? " arquivada" : " arquivadas")}</span>
            </button>
            {openArchive && (
              <div role="list" className="is-archived">
                {archived.map((d) => <NoteItem key={d.id} d={d} active={d.id === openId} actions={actions} />)}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* a linha: clicar fora dos icones abre; Enter e espaco tambem */
function NoteItem({ d, active, actions }) {
  const total = d.steps.length, done = stepsDone(d);
  const text = preview(d);
  const stop = (f) => (e) => { e.stopPropagation(); f(); };
  return (
    <div className={"item" + (active ? " is-active" : "")} role="listitem" tabIndex="0" data-id={d.id}
         onClick={() => actions.open(d.id)}
         onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); actions.open(d.id); } }}>
      <div className="item__text">
        <div className="item__line1">
          <span className="item__title">{d.title || "sem título"}</span>
          <span className="item__when">{shortWhen(d.updatedAt || d.createdAt)}</span>
        </div>
        <div className="item__preview">
          <span className={"stage" + (d.stage === "executing" ? " is-green" : "")}>{stageLabel(d.stage)}</span>
          {total > 0 && <span className="stage">{done + "/" + total}</span>}
          {text ? <span className="phrase">{text}</span> : null}
        </div>
      </div>
      {isUntouched(d) && <span className="item__new" title="ainda não mexida"></span>}
      <span className="item__actions">
        <button className="action" type="button" title="puxar para o dia" onClick={stop(() => actions.pull(d))}>{icon("clock")}</button>
        <button className="action" type="button" title={d.stage === "archived" ? "desarquivar" : "arquivar"} onClick={stop(() => actions.archive(d))}>{icon("archive")}</button>
        <button className="action" type="button" title="apagar" onClick={stop(() => actions.remove(d.id))}>{icon("trash")}</button>
      </span>
    </div>
  );
}

/* ---------- o quadro por estagio: arrastar entre colunas muda o estagio ---------- */
function Board({ items, onDrop, onOpen }) {
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState("");
  if (!items.length) return <section className="board-col"><p className="list-empty">Nada aqui. Escreva na lista o que ainda não é tarefa.</p></section>;
  return (
    <section className="board-col">
      <div className="board">
        {STAGES.map((st) => {
          const inStage = items.filter((d) => d.stage === st.id).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          return (
            <div key={st.id} className="board__col">
              <p className="board__title"><span className="t-mono">{st.label}</span><span className="board__count">{inStage.length}</span></p>
              <div className={"board__drop" + (over === st.id ? " is-over" : "")} data-stage={st.id}
                   onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(st.id); }}
                   onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(""); }}
                   onDrop={(e) => { e.preventDefault(); setOver(""); onDrop(e.dataTransfer.getData("text/plain"), st.id); }}>
                {inStage.length
                  ? inStage.map((d) => (
                      <BoardCard key={d.id} d={d} dragging={dragging === d.id}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", d.id);
                          e.dataTransfer.effectAllowed = "move";
                          /* a classe entra depois do quadro, senao a imagem arrastada ja nasce apagada */
                          requestAnimationFrame(() => setDragging(d.id));
                        }}
                        onDragEnd={() => setDragging(null)} onOpen={() => onOpen(d.id)} />))
                  : <p className="board__empty">nada aqui</p>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
function BoardCard({ d, dragging, onDragStart, onDragEnd, onOpen }) {
  const total = d.steps.length, done = stepsDone(d);
  return (
    <div className={"block block--flat board__card" + (dragging ? " is-dragging" : "")} draggable="true" data-id={d.id}
         onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onOpen}>
      <div className="board__card-top">
        <p className="board__card-title">{d.title || "sem título"}</p>
        <span className="board__grip" aria-hidden="true">{icon("grip")}</span>
      </div>
      <div className="row">
        {total > 0 && <span className="small weak">{done + "/" + total}</span>}
        <span className="small weak board__when">{longWhen(d.updatedAt || d.createdAt)}</span>
      </div>
    </div>
  );
}

/* ---------- o painel vazio ---------- */
function EmptyPanel() {
  return (
    <section className="panel">
      <div className="panel__empty">
        <BulbIcon />
        <p>escolha uma nota ao lado, ou escreva uma nova.<br /><span className="small"><kbd>/</kbd> foca o campo · <kbd>↑</kbd><kbd>↓</kbd> percorrem a lista</span></p>
      </div>
    </section>
  );
}

/* ---------- o painel da nota aberta ----------
   e montado de novo a cada nota (key pelo id): o rascunho de titulo e corpo
   nasce do documento e dali em diante e so da tela — uma sincronizacao que
   chega no meio da digitacao nao apaga nada. os outros pedacos (ficha,
   passos, atividade) leem o documento fresco a cada render. */
function NotePanel({ note, notes, sync, thinking, focusTitle, sections, actions }) {
  const [draft, setDraft] = useState({ title: note.title, body: note.body });
  const [viewing, setViewing] = useState(!!note.body);   // nota com corpo abre lendo; vazia abre escrevendo
  const [saved, setSaved] = useState(false);
  const titleRef = useRef(null), bodyRef = useRef(null);
  const draftRef = useRef(draft); draftRef.current = draft;
  const saveTimer = useRef(null), savedTimer = useRef(null), wantBodyFocus = useRef(false), lastSync = useRef(sync);

  const total = note.steps.length, done = stepsDone(note);
  /* "agora" e o primeiro nao feito NA ORDEM — e por isso que a ordem
     precisou existir de verdade antes deste selo fazer sentido */
  const nextStepId = (note.steps.find((s) => !s.done) || {}).id || "";

  /* antes da pintura: quem abriu uma nota sem titulo ja esta com o dedo no teclado */
  useLayoutEffect(() => {
    if (focusTitle.current) { focusTitle.current = false; if (titleRef.current) titleRef.current.focus(); }
  }, []);

  const showSaved = () => {
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1400);
  };

  /* titulo e corpo salvam com debounce (digitar nao pode gravar a cada tecla);
     estagio e cliente salvam na hora, porque "change" ja e um gesto so */
  const flush = () => {
    clearTimeout(saveTimer.current); saveTimer.current = null;
    const now = notes.get(note.id);
    if (!now) return;
    actions.save({ ...now, title: draftRef.current.title.trim().slice(0, 300), body: draftRef.current.body });
  };
  const scheduleSave = () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { flush(); showSaved(); }, 500);
  };
  /* ao sair (outra nota, fechar, quadro) o que ficou pendente e gravado na nota certa */
  useEffect(() => () => { if (saveTimer.current) flush(); clearTimeout(savedTimer.current); }, []);

  /* uma acao explicita (as sugestoes do merlin) mudou o documento: rele tudo e abre lendo */
  useEffect(() => {
    if (sync === lastSync.current) return;
    lastSync.current = sync;
    const now = notes.get(note.id);
    if (!now) return;
    clearTimeout(saveTimer.current); saveTimer.current = null;
    setDraft({ title: now.title, body: now.body });
    setViewing(true);
    setSaved(false);
  }, [sync]);

  /* o corpo cresce com o texto */
  useLayoutEffect(() => {
    const ta = bodyRef.current;
    if (!viewing && ta) { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; }
  }, [viewing, draft.body]);
  /* sair do modo ver para escrever: o foco entra no corpo assim que ele aparece */
  useLayoutEffect(() => {
    if (!viewing && wantBodyFocus.current) { wantBodyFocus.current = false; if (bodyRef.current) bodyRef.current.focus(); }
  }, [viewing]);
  const editBody = () => {
    if (!viewing) { if (bodyRef.current) bodyRef.current.focus(); return; }
    wantBodyFocus.current = true;
    setViewing(false);
  };
  const toggleViewing = () => { if (viewing) editBody(); else setViewing(true); };

  const onTitleInput = (e) => { const title = e.currentTarget.value; setDraft((v) => ({ ...v, title })); scheduleSave(); };
  const onBodyInput = (e) => { const body = e.currentTarget.value; setDraft((v) => ({ ...v, body })); scheduleSave(); };

  /* ---------- a ficha ---------- */
  const clientValue = listClients().some((c) => c.id === note.client) ? note.client : "";
  const onStageChange = (e) => { actions.changeStage(notes.get(note.id), e.currentTarget.value); showSaved(); };
  const onClientChange = (e) => {
    const now = notes.get(note.id);
    if (!now) return;
    actions.save({ ...now, client: e.currentTarget.value });
    showSaved();
  };

  /* ---------- passos ---------- */
  const addStep = (text) => {
    const now = notes.get(note.id);
    if (!now) return;
    actions.save({ ...now, steps: now.steps.concat([{ id: newId(), text: text.slice(0, 200), done: false }]) });
  };
  /* mover muda a SEQUENCIA, que e o que separa um passo a passo de uma lista
     de marcar: sem ordem, "o proximo" nao quer dizer nada. */
  const moveStep = (stepId, delta) => {
    const now = notes.get(note.id);
    if (!now) return;
    const i = now.steps.findIndex((s) => s.id === stepId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= now.steps.length) return;
    const steps = now.steps.slice();
    const [moved] = steps.splice(i, 1);
    steps.splice(j, 0, moved);
    actions.save({ ...now, steps });
  };
  const editStep = (stepId, text) => {
    const now = notes.get(note.id);
    if (!now) return;
    actions.save({ ...now, steps: now.steps.map((s) => s.id === stepId ? { ...s, text } : s) });
  };
  const toggleStep = (stepId) => {
    const now = notes.get(note.id);
    if (!now) return;
    const step = now.steps.find((s) => s.id === stepId);
    const steps = now.steps.map((s) => s.id === stepId ? { ...s, done: !s.done } : s);
    /* so a conclusao entra na atividade: registrar o desmarcar tambem faria
       um passo em duvida escrever duas linhas de historia a cada clique. */
    const history = step && !step.done
      ? now.history.concat([{ type: "step", text: step.text, at: Date.now() }])
      : now.history;
    actions.save({ ...now, steps, history });
  };
  const pullStep = (step) => {
    const now = notes.get(note.id);
    if (!now) return;
    sendToDay({ title: step.text, client: now.client || "", origin: { type: "note", id: now.id } });
  };
  const removeStep = (stepId) => {
    const now = notes.get(note.id);
    if (!now) return;
    const before = now.steps;
    actions.save({ ...now, steps: before.filter((s) => s.id !== stepId) });
    notify("item apagado", () => { const again = notes.get(now.id); if (again) actions.save({ ...again, steps: before }); });
  };

  return (
    <section className="panel">
      <div className="panel__bar">
        <button className="action back-btn" type="button" title="voltar para a lista" aria-label="Voltar" onClick={actions.close}><BackIcon /></button>
        <button className="pill" type="button" title="puxar para o dia" onClick={() => actions.pull(note)}>{icon("clock")}<span>puxar para o dia</span></button>
        <button className="pill" type="button" title="abrir como mapa mental" onClick={() => actions.toMap(note)}>{icon("map")}<span>mapa</span></button>
        <button className="pill" type="button" title="virar projeto de cliente" onClick={() => actions.toClient(note)}><PersonIcon /><span>cliente</span></button>
        <span className="sep"></span>
        <button className="pill" type="button" id="expand-btn" title="o Merlin lê a nota e sugere perguntas, caminhos e o que fazer" disabled={thinking} onClick={() => actions.expand(note)}><SparkIcon /><span>{thinking ? "pensando…" : "ramificar"}</span></button>
        <span className="spacer"></span>
        <span className={"saved" + (saved ? " is-visible" : "")} aria-live="polite">salvo</span>
        <span className="sep"></span>
        <button className="action" type="button" title={note.stage === "archived" ? "desarquivar" : "arquivar"} onClick={() => actions.archive(note)}>{icon("archive")}</button>
        <button className="action" type="button" title="apagar nota" onClick={() => actions.remove(note.id)}>{icon("trash")}</button>
      </div>

      <div className="panel__scroll">
        <div className="panel__body">
          <input ref={titleRef} className="title-input" maxLength="300" placeholder="título da nota" aria-label="Título da nota"
                 value={draft.title} onChange={onTitleInput}
                 onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); editBody(); } }} />
          {/* a descrição agora tem rótulo, moldura e o gesto de editar ao lado
              dela — não num canto da barra. o "ver formatado" só aparece quando
              há o que formatar: oferecer a leitura de um texto que não existe é
              a forma mais barata de confundir alguém. */}
          <div className={"body" + (viewing ? " is-reading" : "")}>
            <p className="body__label">
              <span className="t-mono">descrição</span>
              {!!draft.body && <button className="link" type="button" onClick={toggleViewing}>{viewing ? "editar" : "ver formatado"}</button>}
            </p>
            <textarea ref={bodyRef} className="body-input" rows="3"
                      placeholder="o que é essa nota. aceita markdown simples: **negrito**, - listas, # títulos."
                      aria-label="Descrição da nota"
                      hidden={viewing} value={draft.body} onChange={onBodyInput}></textarea>
            {viewing && (
              <div className="body-md" onClick={(e) => { if (e.target.closest("a")) return; editBody(); }}>
                <Markdown text={draft.body} />
              </div>
            )}
          </div>

          <div className="sheet">
            <span className="k">estágio</span>
            <span className="v v--stage" data-stage={note.stage}>
              <i className="stage-dot" aria-hidden="true"></i>
              <select className="pill-select pill-select--stage" aria-label="Estágio" value={note.stage} onChange={onStageChange}>
                {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </span>
            <span className="k">cliente</span>
            <span className="v"><select className="pill-select" aria-label="Cliente" value={clientValue} onChange={onClientChange}>{clientOptionList("sem cliente")}</select></span>
            <span className="k">criada</span>
            <span className="v"><span className="weak" title={stampLabel(note.createdAt)}>{longWhen(note.createdAt)}</span></span>
            <span className="k">checklist</span>
            <span className="v"><span className="t-mono">{total ? done + " de " + total : "vazia"}</span></span>
          </div>

          <div className={"section" + (sections.steps ? "" : " is-closed")}>
            <div className="section__head" onClick={() => actions.toggleSection("steps")}>
              <ChevronIcon />
              <span className="title">checklist</span>
              <span className="count">{total ? done + "/" + total : ""}</span>
              {total > 0 && <span className="bar"><i style={{ width: Math.round(100 * done / total) + "%" }}></i></span>}
            </div>
            <div className="section__body">
              <div>{note.steps.map((s, i) => (
                <Step key={s.id} step={s} current={s.id === nextStepId}
                      first={i === 0} last={i === note.steps.length - 1}
                      onToggle={() => toggleStep(s.id)} onEdit={(t) => editStep(s.id, t)}
                      onMove={(d) => moveStep(s.id, d)} onPull={() => pullStep(s)} onRemove={() => removeStep(s.id)} />))}</div>
              <NewStep onAdd={addStep} />
            </div>
          </div>

          <div className={"section" + (sections.prints ? "" : " is-closed")}>
            <div className="section__head" onClick={() => actions.toggleSection("prints")}>
              <ChevronIcon />
              <span className="title">prints</span>
              <span className="count">{note.files.length || ""}</span>
            </div>
            <div className="section__body">
              <Prints note={note} onChange={(files) => { const now = notes.get(note.id); if (now) actions.save({ ...now, files }); }} />
            </div>
          </div>

          <div className={"section" + (sections.activity ? "" : " is-closed")}>
            <div className="section__head" onClick={() => actions.toggleSection("activity")}>
              <ChevronIcon />
              <span className="title">histórico</span>
            </div>
            <div className="section__body"><Activity note={note} /></div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- um passo ----------
   eram caixas de marcar soltas, uma embaixo da outra: bullet notes com
   checkbox. um passo a passo tem ORDEM — o número na frente diz em que
   posição ele está, "agora" diz qual é o próximo que importa, e as setas
   mudam a sequência sem precisar apagar e reescrever. o texto também virou
   editável no lugar: corrigir uma palavra não pode custar refazer o passo. */
function Step({ step, current, onToggle, onEdit, onPull, onRemove, onMove, first, last }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(step.text);
  const commit = () => {
    setEditing(false);
    const t = text.trim().slice(0, 200);
    if (!t) { setText(step.text); return; }
    if (t !== step.text) onEdit(t);
  };
  return (
    <div className={"step" + (step.done ? " is-done" : "") + (current ? " is-now" : "")} data-id={step.id}>
      <button className="step__check mark" type="button" role="checkbox" aria-checked={String(step.done)}
              aria-label={step.text} onClick={onToggle}>{icon("check")}</button>
      {editing ? (
        <input className="step__edit" autoFocus maxLength="200" value={text}
               onChange={(e) => setText(e.currentTarget.value)}
               onBlur={commit}
               onKeyDown={(e) => {
                 if (e.key === "Enter") { e.preventDefault(); commit(); }
                 if (e.key === "Escape") { e.preventDefault(); setText(step.text); setEditing(false); }
               }} />
      ) : (
        <button className="step__text" type="button" title="editar" onClick={() => { setText(step.text); setEditing(true); }}>
          {step.text}
          {current && <span className="step__now t-mono">agora</span>}
        </button>
      )}
      <span className="step__actions">
        <button className="action" type="button" title="subir" disabled={first} onClick={() => onMove(-1)}>{icon("chevronUp")}</button>
        <button className="action" type="button" title="descer" disabled={last} onClick={() => onMove(1)}>{icon("chevronDown")}</button>
        <button className="action" type="button" title="puxar para o dia" onClick={onPull}>{icon("clock")}</button>
        <button className="action" type="button" title="apagar" onClick={onRemove}>{icon("trash")}</button>
      </span>
    </div>
  );
}

function NewStep({ onAdd }) {
  const [text, setText] = useState("");
  return (
    <form className="step step--new" autoComplete="off" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (!t) return; onAdd(t); setText(""); }}>
      <span className="step__check mark" aria-hidden="true"></span>
      <input maxLength="200" placeholder="mais um item… (Enter adiciona)" aria-label="Novo item da checklist" value={text} onChange={(e) => setText(e.currentTarget.value)} />
    </form>
  );
}

/* a atividade e a linha do tempo da nota: quando nasceu, por onde passou, o
   que foi feito nela e para onde saiu.

   ela listava só a criação e as trocas de estágio — o que, numa nota que
   ninguém mudou de estágio, era uma linha só dizendo "criada". agora o que
   se FAZ na nota também conta: passo concluído é acontecimento, e é o
   registro que responde "isto andou?" sem ter que comparar checklists. */
const OUTPUT_LABELS = { day: "puxada para o dia", map: "virou mapa mental", client: "virou projeto de cliente", funnel: "virou funil" };
function Activity({ note }) {
  const events = [{ at: note.createdAt, key: "created", kind: "born", node: <b>criada</b> }]
    .concat(note.history.filter((h) => h.type === "stage").map((h, i) => ({
      at: h.at, key: "stage:" + i, kind: "stage",
      node: <>passou de <span className="tag">{stageLabel(h.from)}</span> para <span className="tag">{stageLabel(h.to)}</span></>
    })))
    .concat(note.history.filter((h) => h.type === "step").map((h, i) => ({
      at: h.at, key: "step:" + i, kind: "step",
      node: <>fez <span className="tag">{h.text}</span></>
    })))
    .concat(note.outputs.map((o, i) => ({ at: o.at, key: "output:" + i, kind: "out", node: <b>{OUTPUT_LABELS[o.type] || o.type}</b> })))
    .sort((a, b) => b.at - a.at);
  return (
    <ul className="activity">
      {events.map((ev) => (
        <li key={ev.key} data-kind={ev.kind}>
          <span className="txt">{ev.node}</span>
          <span className="when" title={stampLabel(ev.at)}>{longWhen(ev.at)}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- os prints ----------
   uma nota quase sempre nasce de uma tela: um anúncio, um gráfico, uma
   conversa. descrever isso por escrito é perder o que fez a nota existir.

   três gestos para a mesma coisa, porque é assim que uma captura chega: Ctrl
   V (o caminho de quem acabou de recortar a tela), arrastar para cima do
   painel, e o botão para quem já tem o arquivo salvo. o binário vai para o
   R2; o documento guarda só {id, name, type, size}. */
function Prints({ note, onChange }) {
  const [busy, setBusy] = useState(0);
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState(null);   // o print aberto grande | null
  const inputRef = useRef(null);
  const files = note.files || [];

  const take = async (list) => {
    const chosen = Array.from(list || []).filter((f) => f && f.size);
    if (!chosen.length) return;
    setBusy((n) => n + chosen.length);
    const added = [];
    for (const f of chosen) {
      try { added.push(await uploadFile(f)); }
      catch (e) { notify(e.message || "não consegui subir o arquivo"); }
      finally { setBusy((n) => n - 1); }
    }
    if (added.length) onChange(files.concat(added));
  };

  const remove = (f) => {
    onChange(files.filter((x) => x.id !== f.id));
    /* o bilhete sai do documento na hora; o objeto some depois. desfazer
       traria o bilhete de volta apontando para um arquivo já apagado, então
       aqui não há desfazer — e é por isso que a caixa pergunta antes. */
    deleteFile(f.id);
    notify("print apagado");
  };

  /* colar só vale com o painel em foco: um Ctrl V no meio do corpo da nota
     é texto, e roubar isso seria pior que não ter o atalho. */
  const onPaste = (e) => {
    const items = Array.from((e.clipboardData || {}).items || []).filter((i) => i.kind === "file");
    if (!items.length) return;
    e.preventDefault();
    take(items.map((i) => i.getAsFile()));
  };

  return (
    <div className={"prints" + (over ? " is-over" : "")}
         onPaste={onPaste}
         onDragOver={(e) => { e.preventDefault(); setOver(true); }}
         onDragLeave={() => setOver(false)}
         onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}>
      {!!files.length && (
        <div className="prints__grid">
          {files.map((f) => (
            <figure key={f.id} className="print">
              {isImage(f.type)
                ? <button type="button" className="print__open" title={f.name || "abrir"} onClick={() => setOpen(f)}>
                    <img src={fileUrl(f.id)} alt={f.name || "print"} loading="lazy" />
                  </button>
                : <a className="print__open print__file" href={fileUrl(f.id)} target="_blank" rel="noreferrer" title={f.name || "abrir"}>
                    {icon("docs")}<span>{f.name || "arquivo"}</span>
                  </a>}
              <button className="print__remove action" type="button" title="apagar" aria-label={"Apagar " + (f.name || "print")} onClick={() => remove(f)}>{icon("trash")}</button>
            </figure>
          ))}
          {busy > 0 && Array.from({ length: busy }, (_, i) => <div key={"up" + i} className="print print--loading" />)}
        </div>
      )}
      {!files.length && busy > 0 && <p className="prints__hint">subindo…</p>}
      {!files.length && !busy && (
        <p className="prints__hint">Cole com <kbd>ctrl</kbd> <kbd>v</kbd>, arraste para cá, ou escolha o arquivo.</p>
      )}
      <div className="prints__foot">
        <button className="pill pill--mini" type="button" onClick={() => inputRef.current && inputRef.current.click()}>{icon("plus")}print</button>
        <input ref={inputRef} type="file" accept={FILE_TYPES.join(",")} multiple hidden
               onChange={(e) => { take(e.currentTarget.files); e.currentTarget.value = ""; }} />
        {!cloud.signedIn && <span className="prints__note">entre para anexar — o arquivo precisa de onde morar</span>}
      </div>
      {open && (
        <div className="print-full" role="dialog" aria-modal="true" aria-label={open.name || "print"}
             onClick={() => setOpen(null)}>
          <img src={fileUrl(open.id)} alt={open.name || "print"} />
        </div>
      )}
    </div>
  );
}

/* ---------- criar nota (botao + caixa) ----------
   o titulo aceita "@cliente" como o resto do sistema; os
   campos ao lado ganham quando preenchidos. a nota nasce semente e ja
   abre no painel, para ganhar corpo se for o caso. */
function NoteForm({ onCreate, onClose }) {
  const [v, bind] = useFields({ title: "", client: "" });
  const submit = () => {
    const found = parseMentions(v.title);   // @cliente no texto vira o campo, e some do titulo
    const title = found.title.slice(0, 300);
    if (!title) { notify("a nota precisa de um título"); return false; }
    const now = Date.now();
    onCreate({
      id: newId(), title, body: "", stage: "seed",
      client: v.client || found.client || "",
      steps: [], files: [], outputs: [], history: [], createdAt: now, updatedAt: now
    });
  };
  return (
    <Form title="nova nota" submit="guardar" onClose={onClose} onSubmit={submit}>
      <Field label="título" full>
        <input className="input" maxLength="300" required placeholder="o que ainda não é tarefa · @cliente" {...bind("title")} />
      </Field>
      <Field label="cliente"><select className="select" {...bind("client")}>{clientOptionList("sem cliente")}</select></Field>
    </Form>
  );
}

/* ---------- as sugestoes do merlin, em grupos, para marcar antes de gravar ---------- */
const SUGGESTION_GROUPS = { question: "perguntas", path: "caminhos", step: "passos" };
const SUGGESTION_ORDER = ["question", "path", "step"];
function SuggestionsDialog({ items, onToggle, onAdd, onClose }) {
  const n = items.filter((s) => s.checked).length;
  const groups = SUGGESTION_ORDER
    .map((type) => ({ type, items: items.map((s, i) => ({ ...s, i })).filter((s) => s.type === type) }))
    .filter((g) => g.items.length);
  return (
    <Dialog title="sugestões do merlin" sub="escolha o que vira passo ou entra no corpo — nada muda sem confirmar" label="Sugestões do Merlin" onClose={onClose}
        actions={<>
          <button className="link" type="button" onClick={onClose}>descartar</button>
          <button className="pill pill--green" type="button" id="suggestions-add" disabled={n === 0} onClick={onAdd}>{"adicionar" + (n ? " " + n : "")}</button>
        </>}>
      {groups.length ? groups.map((g) => (
        <div key={g.type} className="mt">
          <p className="heading"><span className="t-mono">{SUGGESTION_GROUPS[g.type]}</span></p>
          <div className="suggestion-list">
            {g.items.map((s) => (
              <label key={s.i} className="suggestion">
                <input type="checkbox" checked={s.checked} onChange={(e) => onToggle(s.i, e.currentTarget.checked)} />
                <span className="suggestion__text"><b>{s.title}</b>{s.note ? <span className="suggestion__note">{s.note}</span> : null}</span>
              </label>
            ))}
          </div>
        </div>
      )) : <p className="empty">o Merlin não achou nada por aqui.</p>}
    </Dialog>
  );
}

mount(<Notes />, "app");
