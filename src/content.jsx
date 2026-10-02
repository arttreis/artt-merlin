/* merlin · conteudo
   o que vai ao ar: um quadro por etapa (ideia → publicado), um cartao por
   peca. o roteiro mora DENTRO do cartao — clicou, abre a peca inteira do lado,
   com o roteiro em markdown. nao ha uma tela de roteiros separada: um roteiro
   solto, sem a peca que ele serve, e um arquivo que ninguem acha.

   a data do cartao e a da publicacao, e aparece no calendario. o trabalho de
   gravar e editar e tarefa (com duracao, no dia), e nasce do botao "virar
   tarefa" — o cartao nao cobra minuto nenhum sozinho.

   a tela ajuda a criar (EPIC-1): cada formato tem o seu molde, cada etapa tem
   uma acao do Merlin, uma peca desdobra em outras, o quadro puxa pautas do
   cliente, e o topo diz o que ainda falta publicar na semana. o Merlin
   propoe, a pessoa decide: nada grava sem clique, e toda troca desfaz. */
import "./shared/base.css";
import "./content.css";
import { initPage, newId, notify, today, dateLabel, dayOf, isDay, parseMentions, clientName, setPageContext, api, clients } from "./shared/core.js";
import { useState, useEffect, useRef, useLayoutEffect, Fragment } from "react";
import {
  mount, useCollection, useClients, useHash, setHash, useKeydown, isTyping,
  useFields, Form, Field, Dialog, DateField, Markdown, ClientBadge, clientOptionList, icon
} from "./shared/ui.jsx";
import { TaskDialog } from "./shared/task-form.jsx";
import {
  FORMATS, FORMAT_IDS, formatLabel, moldFor, isUntouchedMold, setHook, upsertSection, scriptLines,
  contentContext, clientContext, normalizeCadence, rulesOf, cadenceGaps, assignDays, gapParts, ME, ALL_DAYS
} from "./shared/content-script.js";

initPage("content");

/* ---------- a forma ----------
   os formatos moram em shared/content-script.js (com os moldes). a mesma
   lista esta no worker (FORMAT_IDS): sugestao com formato desconhecido e
   descartada aqui, em silencio. */
const STAGES = [
  { id: "idea", label: "ideia" },
  { id: "script", label: "roteiro" },
  { id: "record", label: "gravar" },
  { id: "edit", label: "editar" },
  { id: "scheduled", label: "agendado" },
  { id: "published", label: "publicado" }
];
const STAGE_IDS = STAGES.map((s) => s.id);
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
    /* de qual peca esta nasceu, quando nasceu de um "desdobrar" */
    parent: String(d.parent || ""),
    history: Array.isArray(d.history) ? d.history : [],
    createdAt: +d.createdAt || Date.now(),
    updatedAt: +d.updatedAt || +d.createdAt || Date.now()
  };
}

/* a tarefa que cada etapa pede, quando pede */
const TASK_VERB = { idea: "roteirizar", script: "gravar", record: "gravar", edit: "editar", scheduled: "publicar", published: "revisar" };

const lateOf = (c) => c.date && c.date < today() && c.stage !== "published";
const clientDoc = (id) => (id ? clients().get(id) || null : null);

/* ---------- o Merlin ----------
   cada clique e uma chamada a /merlin, e conta no teto de 30 por hora. nada
   dispara sozinho. */
async function callMerlin(task, context) {
  try {
    const r = await api("/merlin", { method: "POST", body: JSON.stringify({ task, context }) });
    if (r.ok) return r.body || {};
    if (r.status === 401) notify("entre para usar o Merlin");
    else if ((r.status === 503 || r.status === 429) && r.body && r.body.error) notify(r.body.error);
    else notify("o Merlin não respondeu — tenta de novo daqui a pouco");
  } catch (e) {
    notify("o Merlin não respondeu — tenta de novo daqui a pouco");
  }
  return null;
}
/* o Merlin as vezes cerca o markdown com ``` */
const unfence = (t) => String(t || "").trim().replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim() + "\n";
/* o "# titulo" do roteiro acompanha o titulo da peca, se ainda era o mesmo */
const retitle = (script, from, to) => script.replace(/^# (.*)$/m, (line, t) => (t.trim() === String(from).trim() ? "# " + to : line));
/* sugestao de peca: so formato conhecido sobrevive */
const pieceSuggestions = (list) => (Array.isArray(list) ? list : [])
  .filter((s) => s && s.title && FORMAT_IDS.includes(s.type))
  .map((s) => ({ format: s.type, title: String(s.title), note: String(s.note || ""), checked: true }));

/* as acoes de cada etapa. a faixa mostra as da etapa atual; o resto fica em
   "outras". producao e publicacao viram SECAO do roteiro (D4). */
const ACTIONS = [
  { id: "angles", label: "5 ângulos", stages: ["idea"], list: true },
  { id: "scriptDraft", label: "escrever roteiro", stages: ["script"] },
  { id: "hooks", label: "3 ganchos", stages: ["script"], list: true },
  { id: "production", label: "produção", stages: ["record", "edit"], needsScript: true, section: "produção" },
  { id: "publish", label: "publicação", stages: ["scheduled"], section: "publicação" },
  { id: "spinOff", label: "desdobrar", stages: ["published"], needsScript: true }
];

function Content() {
  const store = useCollection("content", { normalize });
  const cadence = useCollection("cadence", { normalize: normalizeCadence });
  useClients();
  const hash = useHash();
  const [openId, setOpenId] = useState(null);
  const [newIn, setNewIn] = useState(null);     // etapa | null
  const [taskFor, setTaskFor] = useState(null); // id | null
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState("");
  const [pick, setPick] = useState(null);       // {kind, parent, client, items} | null
  const [pautasAsk, setPautasAsk] = useState(null); // {client, format} | null
  const [pulling, setPulling] = useState(false);
  const [rhythm, setRhythm] = useState(false);
  const [fill, setFill] = useState(null);       // {owner, gap} | null
  const openRef = useRef(null);
  openRef.current = openId;

  const all = store.all();
  const open = openId ? store.get(openId) : null;

  /* a peca aberta, pro assistente propor um roteiro sem perguntar o id — com
     o formato e o molde, para o roteiro sair na estrutura certa */
  useEffect(() => {
    if (!open) { setPageContext(null); return () => setPageContext(null); }
    setPageContext(() =>
      "Peça de conteúdo aberta: " + open.title + (open.client ? " · cliente: " + clientName(open.client) + " (id " + open.client + ")" : "") + ". id: " + open.id + ". formato: " + formatLabel(open.format) + ". etapa: " + open.stage + ". " +
      (open.script.trim() ? "já tem roteiro (" + open.script.length + " caracteres)" : "ainda sem roteiro") + ".\n" +
      "Molde do formato:\n" + moldFor(open.format, open.title).replace(/^# .*\n/, "")
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
  /* pecas que o Merlin propos e a pessoa escolheu: nascem em ideia, sem data,
     sem abrir. um desfazer apaga todas. */
  const spawn = (specs, label) => {
    const now = Date.now();
    const docs = specs.map((s, i) => normalize({
      id: newId(), title: s.title, format: s.format, stage: "idea", date: "", client: s.client || "", parent: s.parent || "",
      script: s.script || "", createdAt: now + i, updatedAt: now + i
    }));
    docs.forEach((d) => store.save(d));
    notify(label || (docs.length === 1 ? "criada em ideia" : docs.length + " peças criadas em ideia"), () => docs.forEach((d) => store.remove(d.id)));
  };
  /* a peca nasce com o molde do formato e o gancho que o Merlin deu */
  const seeded = (format, title, hook) => (hook ? setHook(moldFor(format, title), hook, format) : moldFor(format, title));
  const remove = (id) => {
    const before = store.remove(id);
    closePiece();
    if (before) notify('"' + (before.title || "conteúdo") + '" apagado', () => store.save(before));
  };

  /* ---------- puxar pautas: o quadro em branco deixa de ser beco ---------- */
  const pullPautas = async ({ client, format, theme }) => {
    if (pulling) return;
    setPulling(true);
    const recent = all.filter((x) => x.client === client).sort((a, b) => b.createdAt - a.createdAt).slice(0, 30).map((x) => x.title);
    const body = await callMerlin("pautas", { ...clientContext(clientDoc(client)), recent, theme: theme || "", formatId: format || "" });
    setPulling(false);
    if (!body) return;
    const items = pieceSuggestions(body.suggestions).filter((s) => !format || s.format === format).slice(0, 8);
    setPick({ kind: "pautas", client, items });
  };
  const createPicked = () => {
    const chosen = pick.items.filter((s) => s.checked);
    spawn(chosen.map((s) => ({
      title: s.title, format: s.format, client: pick.client, parent: pick.parent || "",
      script: seeded(s.format, s.title, s.note)
    })));
    setPick(null);
  };

  /* ---------- o ritmo: preencher uma falta com ideias sem data ---------- */
  const schedule = (ids, gap) => {
    const plan = assignDays(ids, gap, today());
    const before = plan.map((p) => ({ id: p.id, date: (store.get(p.id) || {}).date || "" }));
    plan.forEach((p) => update(p.id, (d) => { d.date = p.date; }));
    notify(plan.length === 1 ? "ideia com data: " + dateLabel(plan[0].date) : plan.length + " ideias com data nesta semana",
      () => before.forEach((b) => update(b.id, (d) => { d.date = b.date; })));
    setFill(null);
  };

  useKeydown((e) => {
    if (e.key === "Escape") { if (isTyping()) { document.activeElement.blur(); return; } if (openRef.current) closePiece(); return; }
    if (isTyping() || newIn || taskFor || pick || pautasAsk || rhythm || fill) return;
    if (e.key === "n" || e.key === "N") { e.preventDefault(); setNewIn("idea"); }
  });

  return (
    <>
      <div className="header">
        <div>
          <h1>conteúdo</h1>
          <Summary all={all} cadence={cadence} onGap={setFill} />
        </div>
        <div className="actions">
          <button className="pill" type="button" onClick={() => setRhythm(true)} title="quantas peças por dia ou por semana, por cliente">{icon("calendar")}ritmo</button>
          <button className="pill" type="button" disabled={pulling} onClick={() => setPautasAsk({ client: "", format: "" })} title="o Merlin propõe pautas a partir do cliente">{icon("spark")}{pulling ? "pensando…" : "puxar pautas"}</button>
          <button className="pill pill--green" type="button" onClick={() => setNewIn("idea")}>{icon("plus")}conteúdo</button>
        </div>
      </div>

      {!all.length ? (
        <div className="content-empty block">
          <p className="content-empty__title">nada no quadro ainda</p>
          <p className="content-empty__text">Cada peça passa de ideia a publicada. O roteiro mora dentro dela, e a data de publicação aparece no calendário. Sem saber sobre o que falar, o Merlin puxa pautas do cliente.</p>
          <div className="content-empty__actions">
            <button className="pill" type="button" disabled={pulling} onClick={() => setPautasAsk({ client: "", format: "" })}>{icon("spark")}{pulling ? "pensando…" : "puxar pautas"}</button>
            <button className="pill pill--green" type="button" onClick={() => setNewIn("idea")}>{icon("plus")}primeira ideia</button>
          </div>
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

      {open && <Piece key={open.id} c={open} all={all} update={update} onClose={closePiece} onStage={(s) => moveStage(open.id, s)}
                      onTask={() => setTaskFor(open.id)} onRemove={() => remove(open.id)} onOpen={openPiece}
                      onSpawn={(s) => spawn([{ ...s, script: seeded(s.format, s.title, s.hook) }])}
                      onSpinOff={(items) => setPick({ kind: "spinOff", parent: open.id, client: open.client, items })} />}
      {newIn && <NewPieceForm stage={newIn} onCreate={create} onClose={() => setNewIn(null)} />}
      {taskFor && store.get(taskFor) && (() => {
        const c = store.get(taskFor);
        return <TaskDialog title={(TASK_VERB[c.stage] || "fazer") + ": " + c.title} client={c.client} origin={{ type: "content", id: c.id }}
                           date={c.date && c.date > today() && c.stage !== "scheduled" ? today() : (c.date || today())}
                           onClose={() => setTaskFor(null)} />;
      })()}
      {pautasAsk && <PautasForm initial={pautasAsk} onAsk={pullPautas} onClose={() => setPautasAsk(null)} />}
      {pick && <PickDialog pick={pick} onToggle={(i, checked) => setPick((p) => ({ ...p, items: p.items.map((it, j) => j === i ? { ...it, checked } : it) }))}
                           onCreate={createPicked} onClose={() => setPick(null)} />}
      {rhythm && <RhythmDialog cadence={cadence} onClose={() => setRhythm(false)} />}
      {fill && <FillDialog fill={fill} all={all} onSchedule={schedule} onClose={() => setFill(null)}
                           onPautas={() => { const f = fill; setFill(null); setPautasAsk({ client: f.owner === ME ? "" : f.owner, format: f.gap.format }); }} />}
    </>
  );
}

/* ---------- o topo ----------
   abre com o que falta publicar (o ritmo), depois o que ja existe. a tese do
   planner: a tela mostra quanto ainda cabe. falta nao e erro — tom neutro. */
function Summary({ all, cadence, onGap }) {
  const t = today();
  const owners = [ME, ...cadence.all().map((d) => d.id).filter((id) => id !== ME && clientName(id))];
  const states = owners.map((o) => cadenceGaps(o, cadence.get(o), all, t)).filter((s) => s.active);
  const lacks = states.flatMap((s) => s.gaps.map((g) => ({ owner: s.owner, g })));

  const parts = [];
  lacks.forEach(({ owner, g }, k) => {
    gapParts(g).forEach((p, i) => parts.push(
      <button key={"g" + k + "-" + i} type="button" className="gap" title="escolher ideias para preencher" onClick={() => onGap({ owner, gap: g })}>
        {owner !== ME && i === 0 ? <span className="gap__who">{clientName(owner)}: </span> : null}
        {p.map((x, j) => x.strong ? <b key={j}>{x.strong}</b> : <Fragment key={j}>{x.text}</Fragment>)}
      </button>
    ));
  });
  if (states.length && !lacks.length) parts.push(<>semana coberta</>);

  if (!all.length) {
    if (!parts.length) return <p className="sub">o que vai ao ar, da ideia à publicação</p>;
  } else {
    const week = new Date(); week.setDate(week.getDate() + 7);
    const next7 = all.filter((c) => c.date && c.date >= t && c.date <= dayOf(week) && c.stage !== "published").length;
    const late = all.filter(lateOf).length;
    const live = all.filter((c) => c.stage !== "published").length;
    parts.push(<><b>{live}</b> em andamento</>);
    if (next7) parts.push(<><b>{next7}</b> para os próximos 7 dias</>);
    if (late) parts.push(<><b>{late}</b> com a data passada</>);
  }
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
   o painel do lado: a ficha em uma linha (formato, etapa, data, cliente), a
   faixa do Merlin com as acoes da etapa, e o roteiro embaixo, que e o que
   ocupa a tela. abre lendo quando ha roteiro; clicar no texto escreve. */
function Piece({ c, all, update, onClose, onStage, onTask, onRemove, onOpen, onSpawn, onSpinOff }) {
  const set = (mutate) => update(c.id, mutate);
  const [editing, setEditing] = useState(!c.script.trim());
  const [draft, setDraft] = useState(c.script);
  const [title, setTitle] = useState(c.title);
  const [thinking, setThinking] = useState("");   // id da acao | ""
  const [proposal, setProposal] = useState(null); // {action, text} | {action, items}
  const [others, setOthers] = useState(false);
  const areaRef = useRef(null);
  const timer = useRef(null);
  const busy = useRef(false);
  const draftRef = useRef(draft); draftRef.current = draft;
  const titleRef = useRef(title); titleRef.current = title;

  /* o roteiro grava com um respiro: gravar a cada tecla sincronizaria o
     documento inteiro dezenas de vezes por frase */
  const flush = () => { clearTimeout(timer.current); timer.current = null; set((d) => { d.script = draftRef.current; }); };
  const schedule = () => { clearTimeout(timer.current); timer.current = setTimeout(flush, 500); };
  useEffect(() => () => { if (timer.current) flush(); }, []);
  useLayoutEffect(() => { const t = areaRef.current; if (t) { t.style.height = "auto"; t.style.height = Math.max(280, t.scrollHeight) + "px"; } }, [editing, draft]);

  /* trocar o roteiro (e o titulo) por fora do textarea. primeiro o respiro
     pendente grava — senao o proximo flush grava o texto velho por cima —,
     depois o rascunho E o documento mudam juntos. sempre com desfazer. */
  const write = (script, nextTitle) => {
    clearTimeout(timer.current); timer.current = null;
    draftRef.current = script;
    setDraft(script);
    if (nextTitle != null) { titleRef.current = nextTitle; setTitle(nextTitle); }
    set((d) => { d.script = script; if (nextTitle != null) d.title = String(nextTitle).slice(0, 200); });
  };
  const apply = (script, label, nextTitle) => {
    if (timer.current) flush();
    const before = { script: draftRef.current, title: titleRef.current };
    write(script, nextTitle);
    setEditing(!script.trim());
    setProposal(null);
    if (before.script.trim() || (nextTitle != null && nextTitle !== before.title)) notify(label, () => write(before.script, before.title));
    else notify(label);
  };
  /* o roteiro de onde partir: o que ja existe, ou o molde do formato */
  const base = (t) => (draftRef.current.trim() ? draftRef.current : moldFor(c.format, t || titleRef.current));

  const useMold = () => { const m = moldFor(c.format, titleRef.current); write(m); setEditing(true); };
  /* trocar o formato troca o molde junto, mas so se ninguem mexeu nele */
  const changeFormat = (format) => {
    if (format === c.format) return;
    if (timer.current) flush();
    const swap = isUntouchedMold(draftRef.current, c.format);
    set((d) => { d.format = format; });
    if (swap) write(moldFor(format, titleRef.current));
  };

  const run = async (a) => {
    if (busy.current) return;
    busy.current = true;
    if (timer.current) flush();
    setThinking(a.id); setProposal(null);
    const ctx = contentContext({ ...c, title: titleRef.current, script: draftRef.current }, clientDoc(c.client), all);
    const body = await callMerlin(a.id, ctx);
    busy.current = false;
    setThinking("");
    if (!body) return;
    if (a.id === "spinOff") {
      const items = pieceSuggestions(body.suggestions).slice(0, 5);
      if (!items.length) { notify("o Merlin não achou derivadas para esta peça"); return; }
      onSpinOff(items);
      return;
    }
    if (a.list) {
      const items = (Array.isArray(body.suggestions) ? body.suggestions : []).filter((s) => s && s.title).slice(0, a.id === "angles" ? 5 : 3);
      if (!items.length) { notify("o Merlin voltou sem proposta — tenta de novo"); return; }
      setProposal({ action: a.id, items });
    } else if (body.text) setProposal({ action: a.id, text: unfence(body.text) });
  };

  const copy = (text) => {
    try { navigator.clipboard.writeText(text).then(() => notify("copiado"), () => notify("não consegui copiar")); }
    catch (e) { notify("não consegui copiar"); }
  };

  const hasScript = scriptLines(draft) > 0;
  const mine = ACTIONS.filter((a) => a.stages.includes(c.stage));
  const rest = ACTIONS.filter((a) => !a.stages.includes(c.stage));
  const parent = c.parent ? all.find((x) => x.id === c.parent) : null;
  const children = all.filter((x) => x.parent === c.id);
  const actionButton = (a, main) => {
    const blocked = a.needsScript && !hasScript;
    return (
      <button key={a.id} type="button" className={"pill pill--mini" + (main ? " pill--merlin" : "")} disabled={!!thinking || blocked}
              title={blocked ? "precisa de roteiro" : undefined} onClick={() => run(a)}>
        {thinking === a.id ? "pensando…" : a.label}
      </button>
    );
  };
  const section = proposal && (ACTIONS.find((a) => a.id === proposal.action) || {}).section;

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

          {(parent || children.length > 0) && (
            <div className="piece-kin">
              {parent && <span>vem de <button type="button" className="piece-kin__link" onClick={() => onOpen(parent.id)}>{parent.title || "sem título"}</button></span>}
              {children.length > 0 && <span>{children.length === 1 ? "derivada: " : "derivadas: "}
                {children.map((k, i) => <Fragment key={k.id}>{i ? " · " : ""}<button type="button" className="piece-kin__link" onClick={() => onOpen(k.id)}>{k.title || "sem título"}</button> <span className="piece-kin__fmt">{formatLabel(k.format)}</span></Fragment>)}
              </span>}
            </div>
          )}

          <div className="piece-sheet">
            <span className="piece-sheet__k">etapa</span>
            <div className="chips">{STAGES.map((s) => <button key={s.id} type="button" className="chip" aria-pressed={c.stage === s.id} onClick={() => { onStage(s.id); setProposal(null); }}>{s.label}</button>)}</div>
            <span className="piece-sheet__k">formato</span>
            <div className="chips">{FORMATS.map((f) => <button key={f.id} type="button" className="chip" aria-pressed={c.format === f.id} onClick={() => changeFormat(f.id)}>{f.label}</button>)}</div>
            <span className="piece-sheet__k">vai ao ar</span>
            <div className="piece-sheet__row">
              <DateField value={c.date} onChange={(e) => { const v = e.currentTarget.value; set((d) => { d.date = v; }); }} />
              <select className="select piece-sheet__client" aria-label="cliente" value={c.client} onChange={(e) => { const v = e.currentTarget.value; set((d) => { d.client = v; }); }}>
                {clientOptionList("meu")}
              </select>
            </div>
          </div>

          <div className="merlin-strip">
            <div className="merlin-strip__row">
              <span className="merlin-strip__k">{icon("spark")}merlin</span>
              {mine.map((a) => actionButton(a, true))}
              <button type="button" className="merlin-strip__more" aria-expanded={others} onClick={() => setOthers((v) => !v)}>outras{icon(others ? "chevronUp" : "chevronDown")}</button>
            </div>
            {others && <div className="merlin-strip__row merlin-strip__row--rest">{rest.map((a) => actionButton(a, false))}</div>}

            {proposal && proposal.text && (
              <div className="proposal">
                <Markdown className="proposal__text script__read" text={section ? "## " + section + "\n" + proposal.text : proposal.text} />
                <div className="proposal__actions">
                  <button type="button" className="pill pill--mini pill--green" onClick={() => section
                    ? apply(upsertSection(draftRef.current, section, proposal.text), "seção de " + section + " no roteiro")
                    : apply(proposal.text, "roteiro do Merlin no lugar")}>usar</button>
                  <button type="button" className="pill pill--mini" onClick={() => copy(section ? "## " + section + "\n" + proposal.text : proposal.text)}>{icon("copy")}copiar</button>
                  <button type="button" className="pill pill--mini" onClick={() => setProposal(null)}>descartar</button>
                </div>
              </div>
            )}
            {proposal && proposal.items && (
              <div className="proposal">
                <ul className="proposal__list">
                  {proposal.items.map((it, i) => (
                    <li key={i} className="proposal__item">
                      <span className="proposal__body">
                        {proposal.action === "angles" && it.type && <span className="proposal__type">{it.type}</span>}
                        <b>{it.title}</b>
                        {it.note && <span className="proposal__note">{proposal.action === "angles" ? "“" + it.note + "”" : it.note}</span>}
                      </span>
                      <span className="proposal__go">
                        {proposal.action === "angles" ? <>
                          <button type="button" className="pill pill--mini" title="troca o título e põe a frase no gancho"
                                  onClick={() => apply(setHook(isUntouchedMold(draftRef.current, c.format) || !draftRef.current.trim() ? moldFor(c.format, it.title) : retitle(draftRef.current, titleRef.current, it.title), it.note || it.title, c.format), "ângulo aplicado", it.title)}>usar aqui</button>
                          <button type="button" className="pill pill--mini" title="cria em ideia, mesmo formato e cliente"
                                  onClick={() => onSpawn({ title: it.title, format: c.format, client: c.client, hook: it.note })}>nova peça</button>
                        </> : (
                          <button type="button" className="pill pill--mini" onClick={() => apply(setHook(base(), it.title, c.format), "gancho trocado")}>usar</button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="proposal__actions"><button type="button" className="pill pill--mini" onClick={() => setProposal(null)}>descartar</button></div>
              </div>
            )}
          </div>

          <div className="script">
            <p className="script__head">
              <span>roteiro</span>
              {!!draft.trim() && <button className="action" type="button" title={editing ? "ver formatado" : "editar"} aria-label={editing ? "Ver formatado" : "Editar"} onClick={() => { if (editing) flush(); setEditing((v) => !v); }}>{icon(editing ? "eye" : "pencil")}</button>}
              {!draft.trim() && <button className="pill pill--mini" type="button" onClick={useMold}>{icon("file")}{"começar pelo molde de " + formatLabel(c.format)}</button>}
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

/* ---------- puxar pautas: de quem, e sobre o que (opcional) ---------- */
function PautasForm({ initial, onAsk, onClose }) {
  const [v, bind] = useFields({ client: initial.client || "", format: initial.format || "", theme: "" });
  return (
    <Form title="puxar pautas" sub="o Merlin lê a ficha do cliente e o que já foi feito, e propõe até 8 peças. nada nasce sem você escolher." submit="pedir pautas"
          onSubmit={() => { onAsk(v); }} onClose={onClose}>
      <Field label="cliente"><select className="select" {...bind("client")}>{clientOptionList("meu")}</select></Field>
      <Field label="formato"><select className="select" {...bind("format")}><option value="">qualquer</option>{FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></Field>
      <Field label="tema (opcional)" full><input className="input" maxLength="200" placeholder="lançamento da coleção, objeção de preço…" {...bind("theme")} /></Field>
    </Form>
  );
}

/* ---------- as pecas propostas, marcadas, para escolher antes de criar ---------- */
function PickDialog({ pick, onToggle, onCreate, onClose }) {
  const n = pick.items.filter((s) => s.checked).length;
  return (
    <Dialog title={pick.kind === "spinOff" ? "desdobrar em peças" : "pautas do merlin"} sub="as marcadas nascem em ideia, sem data — nada muda sem confirmar" label="Peças propostas pelo Merlin" onClose={onClose}
        actions={<>
          <button className="dialog__remove" type="button" title="descartar" aria-label="Descartar as propostas" onClick={onClose}>{icon("trash")}</button>
          <span className="spacer" />
          <button className="pill pill--green" type="button" disabled={n === 0} onClick={onCreate}>{"criar" + (n ? " " + n : "")}</button>
        </>}>
      {pick.items.length ? (
        <div className="suggestion-list mt">
          {pick.items.map((s, i) => (
            <label key={i} className="suggestion">
              <input type="checkbox" checked={s.checked} onChange={(e) => onToggle(i, e.currentTarget.checked)} />
              <span className="suggestion__text">
                <span><span className={"fmt fmt--" + s.format}>{formatLabel(s.format)}</span> <b>{s.title}</b></span>
                {s.note ? <span className="suggestion__note">{s.note}</span> : null}
              </span>
            </label>
          ))}
        </div>
      ) : <p className="empty">o Merlin não achou nada por aqui.</p>}
    </Dialog>
  );
}

/* ---------- o ritmo: quantas pecas, por dia ou por semana ----------
   um documento por dono na colecao "cadence": o id e o do cliente, ou "me"
   para o conteudo proprio. o proprio nasce com 1 por dia; zerar grava a
   lista vazia, que e diferente de nunca ter mexido. */
const WEEKDAY_LETTERS = ["D", "S", "T", "Q", "Q", "S", "S"];
const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
function RhythmDialog({ cadence, onClose }) {
  const [owner, setOwner] = useState(ME);
  const rulesFor = (o) => {
    const doc = cadence.get(o);
    return doc ? normalizeCadence(doc).rules : rulesOf(o, null);
  };
  const [rules, setRules] = useState(() => rulesFor(ME));
  const pickOwner = (o) => { setOwner(o); setRules(rulesFor(o)); };
  const edit = (i, patch) => setRules((rs) => rs.map((r, j) => j === i ? { ...r, ...patch } : r));
  const save = () => {
    const before = cadence.get(owner);
    cadence.save({ id: owner, rules: rules.map((r) => ({ ...r, id: r.id || newId() })), updatedAt: Date.now() });
    notify("ritmo salvo", () => { if (before) cadence.save(before); else cadence.remove(owner); });
    onClose();
  };
  return (
    <Dialog title="ritmo de publicação" sub="quantas peças você quer publicar. o topo do quadro passa a dizer o que ainda falta nesta semana." label="Ritmo de publicação" onClose={onClose}
        actions={<>
          <button className="pill" type="button" onClick={() => setRules([])} title="sem ritmo: o topo volta a só contar o que existe">zerar</button>
          <span className="spacer" />
          <button className="pill" type="button" onClick={onClose}>cancelar</button>
          <button className="pill pill--green" type="button" onClick={save}>salvar</button>
        </>}>
      <div className="rhythm">
        <label className="field-label" htmlFor="rhythm-owner">de quem</label>
        <select id="rhythm-owner" className="select" value={owner === ME ? "" : owner} onChange={(e) => pickOwner(e.currentTarget.value || ME)}>{clientOptionList("meu")}</select>
        {rules.length ? rules.map((r, i) => (
          <div key={i} className="rhythm__rule">
            <input className="input rhythm__n" type="number" min="0" max="50" aria-label="quantas" value={r.n} onChange={(e) => edit(i, { n: Math.max(0, Math.min(50, Math.round(+e.currentTarget.value) || 0)) })} />
            <select className="select" aria-label="formato" value={r.format} onChange={(e) => edit(i, { format: e.currentTarget.value })}>
              <option value="">{r.n === 1 ? "peça" : "peças"}, qualquer formato</option>
              {FORMATS.map((f) => <option key={f.id} value={f.id}>{r.n === 1 ? f.one : f.many}</option>)}
            </select>
            <select className="select" aria-label="período" value={r.per} onChange={(e) => edit(i, { per: e.currentTarget.value })}>
              <option value="day">por dia</option>
              <option value="week">por semana</option>
            </select>
            <div className="chips rhythm__days" role="group" aria-label="dias que contam">
              {WEEKDAY_LETTERS.map((l, d) => (
                <button key={d} type="button" className="chip" aria-pressed={r.days.includes(d)} title={WEEKDAY_NAMES[d]} aria-label={WEEKDAY_NAMES[d]}
                        onClick={() => edit(i, { days: r.days.includes(d) ? r.days.filter((x) => x !== d) : [...r.days, d].sort() })}>{l}</button>
              ))}
            </div>
            <button className="action" type="button" title="tirar esta regra" aria-label="Tirar esta regra" onClick={() => setRules((rs) => rs.filter((_, j) => j !== i))}>{icon("x")}</button>
          </div>
        )) : <p className="empty">sem ritmo — o topo só conta o que existe.</p>}
        <button className="pill pill--mini" type="button" onClick={() => setRules((rs) => [...rs, { id: "", n: 1, per: owner === ME ? "day" : "week", format: "", days: ALL_DAYS.slice() }])}>{icon("plus")}regra</button>
      </div>
    </Dialog>
  );
}

/* ---------- preencher uma falta com ideias sem data ----------
   cada ideia escolhida ganha o proximo dia vazio da semana. sem ideia
   nenhuma, o caminho e puxar pautas, ja com o cliente e o formato. */
function FillDialog({ fill, all, onSchedule, onPautas, onClose }) {
  const { owner, gap } = fill;
  const client = owner === ME ? "" : owner;
  const ideas = all.filter((x) => x.stage === "idea" && !x.date && x.client === client && (!gap.format || x.format === gap.format))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const [chosen, setChosen] = useState([]);
  const plan = assignDays(chosen, gap, today());
  const dayFor = (id) => { const p = plan.find((x) => x.id === id); return p ? dateLabel(p.date) : ""; };
  const who = client ? clientName(client) : "conteúdo próprio";
  return (
    <Dialog title="preencher a semana" sub={who + (gap.format ? " · " + formatLabel(gap.format) : "") + " — cada ideia escolhida ganha o próximo dia vazio"} label="Preencher a semana" onClose={onClose}
        actions={<>
          <button className="pill" type="button" onClick={onPautas}>{icon("spark")}puxar pautas</button>
          <span className="spacer" />
          <button className="pill pill--green" type="button" disabled={!chosen.length} onClick={() => onSchedule(chosen, gap)}>{"pôr na semana" + (chosen.length ? " " + chosen.length : "")}</button>
        </>}>
      {ideas.length ? (
        <div className="suggestion-list mt">
          {ideas.map((x) => (
            <label key={x.id} className="suggestion">
              <input type="checkbox" checked={chosen.includes(x.id)} onChange={(e) => { const on = e.currentTarget.checked; setChosen((cs) => on ? [...cs, x.id] : cs.filter((id) => id !== x.id)); }} />
              <span className="suggestion__text">
                <span><span className={"fmt fmt--" + x.format}>{formatLabel(x.format)}</span> <b>{x.title || "sem título"}</b></span>
                {chosen.includes(x.id) && <span className="suggestion__note">vai ao ar {dayFor(x.id)}</span>}
              </span>
            </label>
          ))}
        </div>
      ) : <p className="empty">nenhuma ideia sem data {gap.format ? "de " + formatLabel(gap.format) + " " : ""}para {who}. o Merlin pode puxar pautas.</p>}
    </Dialog>
  );
}

mount(<Content />, "app");
