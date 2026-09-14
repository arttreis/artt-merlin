/* merlin · prospeccao
   quem ainda nao fechou. um quadro por etapa (lead → negociacao), um cartao
   por pessoa, e a ficha abre numa gaveta do lado sem sair do quadro.

   o prospecto e o mesmo documento do cliente (colecao "clients", forma em
   shared/client-doc.js): "fechou" so muda o status, e tudo que se soube aqui
   — a dor, o faturamento, a proposta, o historico — continua la. "perdeu" nao
   apaga: o motivo fica, e da para trazer de volta. */
import "./shared/base.css";
import "./prospecting.css";
import { initPage, newId, notify, brl, dateLabel, dayOf, today } from "./shared/core.js";
import { useState, useEffect, useRef, Fragment } from "react";
import {
  mount, useCollection, useHash, setHash, useKeydown, isTyping,
  useFields, Form, Field, DateField, MoneyInput, Markdown, icon
} from "./shared/ui.jsx";
import {
  normalize, STAGES, stageLabel, TEMPERATURES, SOURCES, RECURRENCES, RECURRENCE_LABEL,
  isPipeline, journalEntry, syncNext, waUrl, igUrl, siteUrl, daysSince
} from "./shared/client-doc.js";
import { TaskDialog } from "./shared/task-form.jsx";

initPage("prospecting");

const tempLabel = (id) => (TEMPERATURES.find((t) => t.id === id) || {}).label || id;
const TEMP_ORDER = { hot: 0, warm: 1, cold: 2 };
const valueOf = (c) => c.proposal.value || c.estimate;
const monthOf = (ms) => dayOf(new Date(ms)).slice(0, 7);
/* no cartao e no cabecalho o centavo so ocupa espaco: R$ 9.000, e nao R$ 9.000,00 */
const money = (cents) => brl(cents).replace(/,00$/, "");

function Prospecting() {
  const clients = useCollection("clients", { normalize });
  const hash = useHash();
  const [openId, setOpenId] = useState(null);
  const [newIn, setNewIn] = useState(null);      // etapa do prospecto novo | null
  const [won, setWon] = useState(null);          // id | null
  const [lost, setLost] = useState(null);        // id | null
  const [taskFor, setTaskFor] = useState(null);  // id | null
  const [showLost, setShowLost] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState("");
  const openRef = useRef(null);
  openRef.current = openId;

  const all = clients.all();
  const pipeline = all.filter(isPipeline);
  const lostList = all.filter((c) => c.status === "lost").sort((a, b) => b.lostAt - a.lostAt);
  const open = openId ? clients.get(openId) : null;

  /* ---------- a gaveta segue o #id ---------- */
  const openDrawer = (id) => { setOpenId(id); setHash(id); };
  const closeDrawer = () => { setOpenId(null); setHash(""); };
  useEffect(() => {
    if (!hash) { if (openRef.current) setOpenId(null); return; }
    const c = clients.get(hash);
    if (!c) return;
    /* quem ja fechou tem pagina propria */
    if (c.status === "active" || c.status === "paused" || c.status === "closed") { location.replace("clients.html#" + encodeURIComponent(hash)); return; }
    setOpenId(hash);
  }, [hash]);
  useEffect(() => { if (openId && !open) closeDrawer(); });

  /* ---------- gravar ----------
     sempre a partir do documento vivo: a gaveta grava a cada tecla, e ler do
     render faria duas edicoes no mesmo tick pisarem uma na outra */
  const update = (id, mutate) => {
    const now = clients.get(id);
    if (!now) return null;
    const d = structuredClone(now);
    mutate(d);
    d.updatedAt = Date.now();
    clients.save(d);
    return d;
  };
  const moveStage = (id, stage) => {
    const c = clients.get(id);
    if (!c || c.stage === stage) return;
    update(id, (d) => {
      d.journal.push(journalEntry("etapa: " + stageLabel(d.stage) + " → " + stageLabel(stage)));
      d.stage = stage; d.stageAt = Date.now();
      if (stage === "proposal" && !d.proposal.sentAt) d.proposal.sentAt = today();
    });
  };
  const create = (v) => {
    const now = Date.now();
    const doc = normalize({
      id: newId(), name: v.name, brand: v.brand, whatsapp: v.whatsapp, status: "prospect",
      stage: v.stage, stageAt: now, temperature: v.temperature, source: v.source,
      journal: [journalEntry("entrou na prospecção como " + stageLabel(v.stage) + (v.source ? " · veio de " + v.source : ""))],
      createdAt: now, updatedAt: now
    });
    clients.save(doc);
    openDrawer(doc.id);
  };
  const remove = (id) => {
    const before = clients.remove(id);
    closeDrawer();
    if (before) {
      const n = normalize(before); syncNext({ ...n, nextDate: "" });
      notify('"' + before.name + '" apagado', () => { clients.save(before); syncNext(normalize(before)); });
    }
  };
  const markWon = (id, v) => {
    const d = update(id, (d) => {
      d.status = "active"; d.wonAt = Date.now();
      d.contract.scope = v.scope; d.contract.value = v.value; d.contract.recurrence = v.recurrence; d.contract.start = v.start;
      d.journal.push(journalEntry("fechou: " + (v.scope || "sem escopo") + (v.value ? " · " + brl(v.value) : "")));
      d.next = ""; d.nextDate = "";
    });
    if (d) syncNext(d);
    location.href = "clients.html#" + encodeURIComponent(id);
  };
  const markLost = (id, reason) => {
    const d = update(id, (d) => {
      d.status = "lost"; d.lostAt = Date.now(); d.lostReason = reason;
      d.journal.push(journalEntry("perdido" + (reason ? ": " + reason : "")));
    });
    if (d) syncNext(d);
    closeDrawer();
    notify("foi para os perdidos", () => { const back = update(id, (x) => { x.status = "prospect"; x.lostAt = 0; x.journal.pop(); }); if (back) syncNext(back); });
  };
  const bringBack = (id) => {
    update(id, (d) => { d.status = "prospect"; d.stage = "lead"; d.stageAt = Date.now(); d.lostAt = 0; d.journal.push(journalEntry("voltou para a prospecção")); });
    openDrawer(id);
  };

  useKeydown((e) => {
    if (e.key === "Escape") { if (isTyping()) { document.activeElement.blur(); return; } if (openRef.current) closeDrawer(); return; }
    if (isTyping() || newIn || won || lost || taskFor) return;
    if (e.key === "n" || e.key === "N") { e.preventDefault(); setNewIn("lead"); }
  });

  return (
    <>
      <div className="header">
        <div>
          <h1>prospecção</h1>
          <Summary all={all} pipeline={pipeline} lostList={lostList} />
        </div>
        <div className="actions">
          <button className="pill pill--green" type="button" onClick={() => setNewIn("lead")}>{icon("plus")}prospecto</button>
        </div>
      </div>

      {!pipeline.length && !lostList.length ? (
        <div className="prospect-empty block">
          <p className="prospect-empty__title">ninguém no funil ainda</p>
          <p className="prospect-empty__text">Quem você está conversando e ainda não fechou entra aqui. Cada um passa de lead a negociação, e "fechou" leva tudo que se soube para a página de cliente.</p>
          <button className="pill pill--green" type="button" onClick={() => setNewIn("lead")}>{icon("plus")}primeiro prospecto</button>
        </div>
      ) : (
        <div className="pipeline">
          {STAGES.map((st) => {
            const items = pipeline.filter((c) => c.stage === st.id)
              .sort((a, b) => (TEMP_ORDER[a.temperature] - TEMP_ORDER[b.temperature]) || (a.nextDate || "9").localeCompare(b.nextDate || "9"));
            const sum = items.reduce((s, c) => s + valueOf(c), 0);
            return (
              <section key={st.id} className={"stage" + (over === st.id ? " is-over" : "")}
                       onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(st.id); }}
                       onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(""); }}
                       onDrop={(e) => { e.preventDefault(); setOver(""); moveStage(e.dataTransfer.getData("text/plain"), st.id); }}>
                <header className="stage__head">
                  <span className="stage__name">{st.label}</span>
                  <button className="action stage__add" type="button" title={"novo prospecto em " + st.label} aria-label={"Novo prospecto em " + st.label} onClick={() => setNewIn(st.id)}>{icon("plus")}</button>
                  {items.length > 0 && <span className="stage__meta">{items.length + (items.length === 1 ? " prospecto" : " prospectos")}{sum ? " · " + money(sum) : ""}</span>}
                </header>
                <div className="stage__cards">
                  {items.map((c) => (
                    <ProspectCard key={c.id} c={c} active={c.id === openId} dragging={dragging === c.id}
                      onOpen={() => openDrawer(c.id)}
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; requestAnimationFrame(() => setDragging(c.id)); }}
                      onDragEnd={() => setDragging(null)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {!!lostList.length && (
        <div className="lost">
          <button className="lost__toggle t-mono" type="button" aria-expanded={showLost} onClick={() => setShowLost((v) => !v)}>
            {icon(showLost ? "chevronDown" : "chevronRight")}perdidos · {lostList.length}
          </button>
          {showLost && (
            <ul className="list lost__list">
              {lostList.map((c) => (
                <li key={c.id} className="line">
                  <span className="name">{c.name}{c.lostReason ? <small>{c.lostReason}</small> : null}</span>
                  <span className="measure">{c.lostAt ? dateLabel(dayOf(new Date(c.lostAt))) : ""}</span>
                  <button className="pill pill--mini" type="button" onClick={() => bringBack(c.id)}>trazer de volta</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {open && <Drawer key={open.id} c={open} update={update} onClose={closeDrawer} onStage={(s) => moveStage(open.id, s)}
                       onWon={() => setWon(open.id)} onLost={() => setLost(open.id)} onTask={() => setTaskFor(open.id)} onRemove={() => remove(open.id)} />}
      {newIn && <NewProspectForm stage={newIn} onCreate={create} onClose={() => setNewIn(null)} />}
      {won && clients.get(won) && <WonForm c={clients.get(won)} onClose={() => setWon(null)} onSubmit={(v) => markWon(won, v)} />}
      {lost && clients.get(lost) && <LostForm c={clients.get(lost)} onClose={() => setLost(null)} onSubmit={(reason) => markLost(lost, reason)} />}
      {taskFor && clients.get(taskFor) && <TaskDialog title="" client={taskFor} origin={{ type: "client", id: taskFor }} heading={"tarefa · " + clients.get(taskFor).name} onClose={() => setTaskFor(null)} />}
    </>
  );
}

/* ---------- a frase do cabecalho ----------
   so entra o numero que existe: "conversao: sem dado" em letra grande nao diz
   nada a ninguem */
function Summary({ all, pipeline, lostList }) {
  const month = today().slice(0, 7);
  const wonAll = all.filter((c) => c.wonAt);
  const wonMonth = wonAll.filter((c) => monthOf(c.wonAt) === month);
  const onTable = pipeline.filter((c) => c.stage === "proposal" || c.stage === "negotiation").reduce((s, c) => s + valueOf(c), 0);
  const noDate = pipeline.filter((c) => !c.nextDate).length;
  const decided = wonAll.length + lostList.length;
  const parts = [<><b>{pipeline.length}</b> no funil</>];
  if (noDate) parts.push(<><b>{noDate}</b> sem data de contato</>);
  if (onTable) parts.push(<><b>{money(onTable)}</b> em proposta</>);
  if (wonMonth.length) parts.push(<><b>{wonMonth.length}</b> {wonMonth.length === 1 ? "fechado" : "fechados"} no mês</>);
  if (decided) parts.push(<><b>{Math.round(100 * wonAll.length / decided)}%</b> de conversão</>);
  return <p className="sub sub--numbers">{parts.map((p, i) => <Fragment key={i}>{i ? " · " : ""}{p}</Fragment>)}</p>;
}

/* ---------- o cartao ----------
   o que decide o dia de quem prospecta: quem esta quente, quanto vale, ha
   quanto tempo parou e qual e o proximo passo. a legenda mora no title de cada
   marca, e nao num rodape explicando a tela. */
function ProspectCard({ c, active, dragging, onOpen, onDragStart, onDragEnd }) {
  const days = daysSince(c.stageAt);
  const late = c.nextDate && c.nextDate < today();
  const value = valueOf(c);
  return (
    <article className={"prospect" + (active ? " is-active" : "") + (dragging ? " is-dragging" : "")} draggable="true" data-id={c.id} tabIndex="0"
             onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="prospect__top">
        <b className="prospect__name">{c.name || "sem nome"}</b>
        <span className={"temp temp--" + c.temperature} title={"temperatura: " + tempLabel(c.temperature)} />
      </div>
      {c.brand && <p className="prospect__brand">{c.brand}</p>}
      <div className="prospect__meta">
        {value ? <span className="prospect__value" title={c.proposal.value ? "valor da proposta" : "estimativa por mês"}>{money(value)}{c.proposal.value ? "" : "/mês"}</span> : <span />}
        <span className={"prospect__days" + (days >= 7 ? " is-stuck" : "")} title="tempo parado nesta etapa">{days ? days + "d nesta etapa" : "entrou hoje"}</span>
      </div>
      <p className={"prospect__next" + (c.next || c.nextDate ? "" : " is-missing")}>
        <span>{c.next || (c.nextDate ? "falar com" : "sem próximo passo")}</span>
        {c.nextDate && <span className={"prospect__when" + (late ? " is-late" : "")} title={late ? "contato atrasado" : "data do contato"}>{c.nextDate === today() ? "hoje" : dateLabel(c.nextDate)}</span>}
      </p>
    </article>
  );
}

/* ---------- a gaveta ----------
   a ficha inteira do prospecto, gravando a cada gesto. o documento chega
   fresco a cada render; os campos de texto sao controlados por ele, entao uma
   sincronizacao no meio da digitacao so atualiza o que mudou do outro lado. */
function Drawer({ c, update, onClose, onStage, onWon, onLost, onTask, onRemove }) {
  const set = (mutate) => update(c.id, mutate);
  const [note, setNote] = useState("");
  const days = daysSince(c.stageAt);
  const txt = (key, extra = {}) => ({ value: c[key], onChange: (e) => { const v = e.currentTarget.value; set((d) => { d[key] = v; }); }, ...extra });
  const money = (key) => ({ value: c[key], onChange: (v) => set((d) => { d[key] = v; }) });
  const commitNext = () => { const now = normalize({ ...c }); syncNext(now); };
  return (
    <div className="drawer" role="dialog" aria-modal="false" aria-label={"Ficha de " + c.name}>
      <div className="drawer__veil" onClick={onClose} />
      <aside className="drawer__box">
        <div className="drawer__bar">
          <span className="t-mono drawer__where">{stageLabel(c.stage)} · {days ? days + " dias aqui" : "entrou hoje"}</span>
          <span className="spacer" />
          <button className="pill pill--green pill--mini" type="button" onClick={onWon}>fechou</button>
          <button className="pill pill--mini" type="button" onClick={onLost}>perdeu</button>
          <button className="pill pill--mini" type="button" onClick={onTask}>{icon("plus")}tarefa</button>
          <button className="action" type="button" title="apagar" aria-label="Apagar prospecto" onClick={onRemove}>{icon("trash")}</button>
          <button className="action" type="button" title="fechar (esc)" aria-label="Fechar" onClick={onClose}>{icon("x")}</button>
        </div>

        <div className="drawer__body">
          <div>
            <input className="drawer__name" placeholder="quem é" aria-label="nome" {...txt("name")} />
            <input className="drawer__brand" placeholder="operação / empresa" aria-label="operação" {...txt("brand")} />
          </div>

          <section className="drawer__sec">
            <p className="t-mono">etapa</p>
            <div className="chips">
              {STAGES.map((s) => <button key={s.id} type="button" className="chip" aria-pressed={c.stage === s.id} onClick={() => onStage(s.id)}>{s.label}</button>)}
            </div>
          </section>

          <section className="drawer__sec">
            <p className="t-mono">temperatura e origem</p>
            <div className="chips">
              {TEMPERATURES.map((t) => (
                <button key={t.id} type="button" className="chip chip--temp" aria-pressed={c.temperature === t.id} onClick={() => set((d) => { d.temperature = t.id; })}>
                  <span className={"temp temp--" + t.id} />{t.label}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <div><label className="field-label">de onde veio</label>
                <select className="select" value={c.source} onChange={(e) => { const v = e.currentTarget.value; set((d) => { d.source = v; }); }}>
                  <option value="">—</option>{SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select></div>
              <div><label className="field-label">indicado por</label><input className="input" placeholder="quem" {...txt("referredBy")} /></div>
            </div>
          </section>

          <section className="drawer__sec">
            <p className="t-mono">contato</p>
            <div className="form-grid">
              <div><label className="field-label">whatsapp {waUrl(c.whatsapp) && <a className="link" href={waUrl(c.whatsapp)} target="_blank" rel="noopener">conversar</a>}</label><input className="input" inputMode="tel" {...txt("whatsapp")} /></div>
              <div><label className="field-label">e-mail {c.email && <a className="link" href={"mailto:" + c.email}>escrever</a>}</label><input className="input" type="email" {...txt("email")} /></div>
              <div><label className="field-label">instagram {igUrl(c.instagram) && <a className="link" href={igUrl(c.instagram)} target="_blank" rel="noopener">abrir</a>}</label><input className="input" placeholder="@" {...txt("instagram")} /></div>
              <div><label className="field-label">site {siteUrl(c.site) && <a className="link" href={siteUrl(c.site)} target="_blank" rel="noopener">abrir</a>}</label><input className="input" {...txt("site")} /></div>
            </div>
          </section>

          <section className="drawer__sec">
            <p className="t-mono">qualificação</p>
            <div className="form-grid">
              <div><label className="field-label">nicho</label><input className="input" placeholder="infoproduto, e-commerce…" {...txt("niche")} /></div>
              <div><label className="field-label">o que vende</label><input className="input" {...txt("sells")} /></div>
              <div><label className="field-label">faturamento/mês</label><MoneyInput {...money("revenue")} /></div>
              <div><label className="field-label">ticket médio</label><MoneyInput {...money("ticket")} /></div>
              <div><label className="field-label">verba de mídia/mês</label><MoneyInput {...money("adBudget")} /></div>
              <div><label className="field-label">time</label><input className="input" placeholder="3 pessoas, só ele…" {...txt("team")} /></div>
              <div><label className="field-label">vale por mês, se fechar</label><MoneyInput {...money("estimate")} /></div>
              <div className="full"><label className="field-label">dor principal</label><textarea className="textarea" placeholder="o que ele disse que trava" {...txt("pain")} /></div>
            </div>
          </section>

          <section className="drawer__sec">
            <p className="t-mono">proposta</p>
            <div className="form-grid">
              <div className="full"><label className="field-label">o que foi proposto</label>
                <input className="input" value={c.proposal.scope} onChange={(e) => { const v = e.currentTarget.value; set((d) => { d.proposal.scope = v; }); }} /></div>
              <div><label className="field-label">valor</label><MoneyInput value={c.proposal.value} onChange={(v) => set((d) => { d.proposal.value = v; })} /></div>
              <div><label className="field-label">enviada em</label><DateField value={c.proposal.sentAt} onChange={(e) => { const v = e.currentTarget.value; set((d) => { d.proposal.sentAt = v; }); }} /></div>
              <div className="full"><label className="field-label">link {siteUrl(c.proposal.link) && <a className="link" href={siteUrl(c.proposal.link)} target="_blank" rel="noopener">abrir</a>}</label>
                <input className="input" placeholder="https://" value={c.proposal.link} onChange={(e) => { const v = e.currentTarget.value; set((d) => { d.proposal.link = v; }); }} /></div>
            </div>
          </section>

          <section className="drawer__sec">
            <p className="t-mono">próximo passo</p>
            <div className="drawer__next">
              <input className="input" placeholder="a única coisa que move esse lead" {...txt("next")} onBlur={commitNext} />
              <DateField title="quando — vira tarefa no calendário" value={c.nextDate}
                         onChange={(e) => { const v = e.currentTarget.value; const d = set((x) => { x.nextDate = v; }); if (d) syncNext(d); }} />
            </div>
          </section>

          <section className="drawer__sec">
            <p className="t-mono">histórico</p>
            <form className="drawer__log" onSubmit={(e) => { e.preventDefault(); const t = note.trim(); if (!t) return; set((d) => { d.journal.push(journalEntry(t, "note")); }); setNote(""); }}>
              <input className="input" placeholder="o que aconteceu" value={note} onChange={(e) => setNote(e.currentTarget.value)} />
              <button className="pill pill--mini" type="submit">registrar</button>
            </form>
            <ol className="drawer__journal">
              {c.journal.slice().sort((a, b) => b.at - a.at).map((e) => (
                <li key={e.id} className={e.type === "event" ? "is-event" : ""}>
                  <span className="t-mono">{dateLabel(dayOf(new Date(e.at)))}</span>
                  <Markdown tag="span" text={e.text} />
                </li>
              ))}
            </ol>
          </section>
        </div>
      </aside>
    </div>
  );
}

/* ---------- as caixas ---------- */
function NewProspectForm({ stage, onCreate, onClose }) {
  const [v, bind] = useFields({ name: "", brand: "", whatsapp: "", temperature: "warm", source: "indicação", stage });
  const submit = () => {
    const name = v.name.trim();
    if (!name) { notify("o prospecto precisa de um nome"); return false; }
    onCreate({ ...v, name, brand: v.brand.trim(), whatsapp: v.whatsapp.trim() });
  };
  return (
    <Form title="novo prospecto" sub="o resto se preenche na ficha, que abre em seguida" submit="criar e abrir" onSubmit={submit} onClose={onClose}>
      <Field label="quem é" full><input className="input" required maxLength="120" placeholder="nome de quem decide, ou da operação" {...bind("name")} /></Field>
      <Field label="operação / empresa"><input className="input" maxLength="120" {...bind("brand")} /></Field>
      <Field label="whatsapp"><input className="input" inputMode="tel" maxLength="40" {...bind("whatsapp")} /></Field>
      <Field label="etapa"><select className="select" {...bind("stage")}>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
      <Field label="temperatura"><select className="select" {...bind("temperature")}>{TEMPERATURES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></Field>
      <Field label="de onde veio" full><select className="select" {...bind("source")}>{SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
    </Form>
  );
}

function WonForm({ c, onSubmit, onClose }) {
  const [v, bind, set] = useFields({ scope: c.proposal.scope, value: c.proposal.value || c.estimate, recurrence: c.proposal.value ? "project" : "monthly", start: today() });
  return (
    <Form title={"fechou com " + (c.name || "ele")} sub="vira cliente e ganha página própria — com tudo que se soube aqui" submit="fechar negócio"
          onSubmit={() => onSubmit({ ...v, scope: v.scope.trim() })} onClose={onClose}>
      <Field label="o que foi fechado" full><input className="input" placeholder="leitura de operação · 7 dias" {...bind("scope")} /></Field>
      <Field label="valor"><MoneyInput value={v.value} onChange={(x) => set("value", x)} /></Field>
      <Field label="recorrência"><select className="select" {...bind("recurrence")}><option value="">—</option>{RECURRENCES.filter(Boolean).map((r) => <option key={r} value={r}>{RECURRENCE_LABEL[r]}</option>)}</select></Field>
      <Field label="início" full><DateField {...bind("start")} /></Field>
    </Form>
  );
}

function LostForm({ c, onSubmit, onClose }) {
  const [v, bind] = useFields({ reason: "" });
  return (
    <Form title={"perdeu " + (c.name || "o prospecto") + "?"} sub="sai do quadro e vai para os perdidos; dá para trazer de volta" submit="marcar perdido"
          onSubmit={() => onSubmit(v.reason.trim())} onClose={onClose}>
      <Field label="por quê (fica no histórico)" full><input className="input" maxLength="300" placeholder="preço, timing, sumiu…" {...bind("reason")} /></Field>
    </Form>
  );
}

mount(<Prospecting />, "app");
