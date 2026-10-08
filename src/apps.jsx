/* merlin · projetos de app
   do conceito ao banco, pronto para construir. o mapa mental continua sendo
   o lugar de pensar solto; aqui a ideia ganha forma: o que o app resolve e
   para quem, as funcionalidades com fase, as entidades do banco com campos e
   relacoes, as telas com o que mostram e as acoes que levam de uma a outra.

   cinco abas sobre o mesmo documento: conceito, dados, fluxos, exportar e
   lancamento. dados e fluxos sao palcos (arrastar, zoom, setas); exportar e
   onde o projeto vira texto para quem constroi — SQL, mermaid, a
   especificacao em markdown e o prompt para o Claude Code; lancamento liga o
   app ao funil e as pecas de conteudo, que ja moram nas telas delas.

   a forma do documento, o que falta, o palco e as saidas moram no
   shared/app-spec.js, que e puro e testado. aqui e so tela. */
import "./shared/base.css";
import "./apps.css";
import { initPage, newId, notify, api, setPageContext, today } from "./shared/core.js";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  mount, useCollection, useHash, setHash, useFields,
  Form, Field, Dialog, Markdown, NewItemRow, icon
} from "./shared/ui.jsx";
import { TaskDialog } from "./shared/task-form.jsx";
import { FUNNEL_TEMPLATES, buildFunnel } from "./shared/templates.js";
import { layoutNodes } from "./shared/funnel-layout.js";
import { FORMATS, FORMAT_IDS } from "./shared/content-script.js";
import {
  PHASES, phaseLabel, FIELD_TYPES, typeLabel, ENTITY_W, ENTITY_HEAD, FIELD_H, SCREEN_W, SCREEN_H, entityHeight,
  normalizeApp, snake, problemsOf, layoutEntities, layoutScreens, fromBlueprint, mergeDraft,
  toSQL, toMermaidER, toMermaidFlow, toMarkdown, toPrompt, digestOf
} from "./shared/app-spec.js";

initPage("apps");

const normalize = (d) => normalizeApp(d, newId);

/* ---------- o Merlin ----------
   cada clique e uma chamada a /merlin e conta no teto por hora. nada dispara
   sozinho, a nao ser o rascunho que a propria pessoa pediu ao criar o app. */
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

/* o app recem-criado com "o Merlin rascunha" marcado: a tela do app abre e
   pede o rascunho uma vez, com a descricao que veio do formulario */
let pendingDraft = null;

const counts = (a) => [
  a.entities.length + (a.entities.length === 1 ? " entidade" : " entidades"),
  a.screens.length + (a.screens.length === 1 ? " tela" : " telas"),
  a.features.filter((f) => f.phase === "mvp").length + " na primeira versão"
].join(" · ");

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type: type || "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); notify(what + " copiado"); }
  catch (e) { notify("o navegador não deixou copiar — use baixar"); }
}

/* ================================================================
   a pagina
   ================================================================ */
function Apps() {
  const store = useCollection("apps", { normalize });
  const hash = useHash();
  const app = hash ? store.get(hash) : null;
  if (hash && !app) return <AppList store={store} missing />;
  return app ? <AppView key={app.id} app={app} store={store} /> : <AppList store={store} />;
}

/* ---------- a lista ---------- */
function AppList({ store, missing }) {
  const [form, setForm] = useState(false);
  const list = store.all().sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <>
      <div className="header">
        <div>
          <h1>apps</h1>
          <p className="sub">do conceito ao banco: desenhe o app e saia com tudo pronto para construir</p>
        </div>
        <div className="actions">
          <button className="pill pill--accent" type="button" onClick={() => setForm(true)}>{icon("plus")}app</button>
        </div>
      </div>
      {missing && <p className="ap-note">esse projeto não existe mais (ou ainda não chegou da nuvem).</p>}
      {list.length ? (
        <div className="ap-grid">
          {list.map((a) => {
            const left = problemsOf(a).length;
            return (
              <button key={a.id} type="button" className="ap-card" onClick={() => setHash(a.id)}>
                <span className="ap-card__name">{a.name}</span>
                <span className="ap-card__pitch">{a.pitch || "sem a frase que explica o app"}</span>
                <span className="ap-card__meta">{counts(a)}</span>
                <span className={"ap-card__state" + (left ? "" : " is-ready")}>{left ? left + " pendência" + (left > 1 ? "s" : "") : "pronto para construir"}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="ap-start block">
          <p className="ap-start__title">Desenhe o primeiro app</p>
          <p className="ap-start__text">
            Descreva o app em duas frases e o Merlin rascunha o conceito, as funcionalidades, o banco e as telas.
            Você ajusta o que quiser e exporta o SQL, os diagramas e o prompt para o Claude Code.
          </p>
          <button className="pill pill--accent" type="button" onClick={() => setForm(true)}>{icon("plus")}novo app</button>
        </div>
      )}
      {form && <NewAppForm store={store} onClose={() => setForm(false)} />}
    </>
  );
}

function NewAppForm({ store, onClose }) {
  const [v, bind] = useFields({ name: "", description: "", draft: true });
  const submit = () => {
    const name = v.name.trim();
    if (!name) { notify("o app precisa de um nome"); return false; }
    const description = v.description.trim();
    const firstLine = description.split(/\n/)[0];
    const now = Date.now();
    const doc = store.save(normalize({
      id: newId(), name,
      pitch: firstLine.length <= 300 ? firstLine : "",
      problem: description && firstLine !== description ? description : "",
      createdAt: now, updatedAt: now
    }));
    if (v.draft && description) pendingDraft = { id: doc.id, description };
    setHash(doc.id);
  };
  return (
    <Form title="novo app" submit="criar" onSubmit={submit} onClose={onClose}>
      <Field label="nome" full><input className="input" {...bind("name")} maxLength={120} placeholder="ex.: agenda do salão" /></Field>
      <Field label="o que ele faz, para quem" full>
        <textarea className="textarea" rows={4} {...bind("description")} placeholder="ex.: app para salões de beleza agendarem horários pelo WhatsApp, com lembrete automático e pagamento antecipado" />
      </Field>
      <Field label="" full>
        <label className="ap-check"><input type="checkbox" {...bind("draft", "check")} /> o Merlin rascunha o projeto a partir da descrição</label>
      </Field>
    </Form>
  );
}

/* ================================================================
   o app aberto
   ================================================================ */
const TABS = [
  { id: "concept", label: "conceito" },
  { id: "data", label: "dados" },
  { id: "flows", label: "fluxos" },
  { id: "export", label: "exportar" },
  { id: "launch", label: "lançamento" }
];

function AppView({ app, store }) {
  const [tab, setTab] = useState("concept");
  const [edit, setEdit] = useState(false);
  const [draftAsk, setDraftAsk] = useState(false);
  const [busy, setBusy] = useState("");
  const [draft, setDraft] = useState(null);
  const [review, setReview] = useState(null);

  /* gravar sempre sobre o que esta guardado agora, e nao sobre o `app` do
     ultimo desenho: duas mudancas seguidas nao se apagam */
  const save = (fn) => {
    const cur = store.get(app.id);
    if (!cur) return;
    const next = typeof fn === "function" ? fn(cur) : { ...cur, ...fn };
    store.save({ ...next, updatedAt: Date.now() });
  };
  /* mudanca grande (apagar, juntar rascunho) ganha desfazer */
  const saveUndo = (fn, text) => {
    const before = store.get(app.id);
    save(fn);
    notify(text, () => store.save({ ...before, updatedAt: Date.now() }));
  };

  useEffect(() => {
    setPageContext(() => "Projeto de app aberto:\n" + digestOf(store.get(app.id) || app).slice(0, 1100));
    return () => setPageContext(null);
  }, [app.id]);

  const askDraft = async (description) => {
    setBusy("draft");
    const cur = store.get(app.id) || app;
    const hasSomething = cur.entities.length || cur.screens.length || cur.features.length;
    const r = await callMerlin("app", { name: cur.name, description, spec: hasSomething ? digestOf(cur).slice(0, 6000) : "" });
    setBusy("");
    if (r && r.blueprint) setDraft(fromBlueprint(r.blueprint, newId));
  };
  const askReview = async () => {
    setBusy("review");
    const r = await callMerlin("appReview", { spec: digestOf(store.get(app.id) || app) });
    setBusy("");
    if (r && r.text) setReview(r.text);
  };

  /* o rascunho pedido no formulario de criar: uma vez so */
  useEffect(() => {
    if (pendingDraft && pendingDraft.id === app.id) {
      const { description } = pendingDraft;
      pendingDraft = null;
      askDraft(description);
    }
  }, [app.id]);

  const left = problemsOf(app);
  return (
    <>
      <div className="header ap-head">
        <div className="ap-head__title">
          <button className="ap-back" type="button" onClick={() => setHash("")} aria-label="voltar para os apps">{icon("arrowLeft")}apps</button>
          <h1><button type="button" className="ap-name" onClick={() => setEdit(true)} title="mudar o nome">{app.name}</button></h1>
          <p className="sub">{app.pitch || "sem a frase que explica o app"}</p>
        </div>
        <div className="actions">
          <button className="pill" type="button" disabled={!!busy} onClick={() => setDraftAsk(true)}>
            {icon("spark")}{busy === "draft" ? "rascunhando…" : "Merlin rascunha"}
          </button>
          <button className="pill" type="button" disabled={!!busy} onClick={askReview}>
            {icon("spark")}{busy === "review" ? "revisando…" : "Merlin revisa"}
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === "data" && app.entities.length > 0 && <span className="ap-count">{app.entities.length}</span>}
            {t.id === "flows" && app.screens.length > 0 && <span className="ap-count">{app.screens.length}</span>}
            {t.id === "export" && left.length > 0 && <span className="ap-count ap-count--warn">{left.length}</span>}
          </button>
        ))}
      </div>

      {busy === "draft" && <p className="ap-note">O Merlin está desenhando o projeto — banco, telas e fluxos levam um minutinho.</p>}

      {tab === "concept" && <ConceptTab app={app} save={save} saveUndo={saveUndo} />}
      {tab === "data" && <DataTab app={app} save={save} saveUndo={saveUndo} />}
      {tab === "flows" && <FlowsTab app={app} save={save} saveUndo={saveUndo} />}
      {tab === "export" && <ExportTab app={app} problems={left} />}
      {tab === "launch" && <LaunchTab app={app} save={save} />}

      {edit && <AppForm app={app} onClose={() => setEdit(false)}
        onSave={(v) => save(v)}
        onRemove={() => { const before = store.get(app.id); store.remove(app.id); setHash(""); notify("app apagado", () => store.save(before)); }} />}
      {draftAsk && <DraftAsk app={app} onClose={() => setDraftAsk(false)} onAsk={(d) => { setDraftAsk(false); askDraft(d); }} />}
      {draft && <DraftDialog app={app} draft={draft} onClose={() => setDraft(null)}
        onUse={() => { saveUndo((cur) => mergeDraft(cur, draft), "rascunho do Merlin juntado ao projeto"); setDraft(null); }} />}
      {review && (
        <Dialog title="o Merlin revisou o projeto" wide onClose={() => setReview(null)}
          actions={<button className="pill" type="button" onClick={() => setReview(null)}>fechar</button>}>
          <Markdown className="ap-review" text={review} />
        </Dialog>
      )}
    </>
  );
}

function AppForm({ app, onSave, onRemove, onClose }) {
  const [v, bind] = useFields({ name: app.name });
  return (
    <Form title="o app" remove="apagar o app" onRemove={onRemove} onClose={onClose}
      onSubmit={() => { const name = v.name.trim(); if (!name) { notify("o app precisa de um nome"); return false; } onSave({ name: name.slice(0, 120) }); }}>
      <Field label="nome" full><input className="input" {...bind("name")} maxLength={120} /></Field>
    </Form>
  );
}

function DraftAsk({ app, onAsk, onClose }) {
  const start = [app.pitch, app.problem].filter((t) => t.trim()).join("\n\n");
  const [v, bind] = useFields({ description: start });
  const has = app.entities.length || app.screens.length || app.features.length;
  return (
    <Form title="o Merlin rascunha" submit="rascunhar" onClose={onClose}
      sub={has ? "ele completa o que já está desenhado, sem apagar nada: você vê o rascunho antes de juntar." : "você vê o rascunho inteiro antes de ele entrar no projeto."}
      onSubmit={() => { const d = v.description.trim(); if (!d) { notify("descreva o app em uma ou duas frases"); return false; } onAsk(d); return false; }}>
      <Field label="o que o app faz, para quem, e o que não pode faltar" full>
        <textarea className="textarea" rows={6} {...bind("description")} />
      </Field>
    </Form>
  );
}

function DraftDialog({ app, draft, onUse, onClose }) {
  const ents = new Map(draft.entities.map((e) => [e.id, e.name]));
  return (
    <Dialog title="o rascunho do Merlin" wide onClose={onClose}
      sub={(app.entities.length || app.screens.length) ? "entra junto com o que já existe: nada do que você escreveu é trocado." : "confira e junte ao projeto — depois é só ajustar."}
      actions={<>
        <button className="pill" type="button" onClick={onClose}>descartar</button>
        <button className="pill pill--accent" type="button" onClick={onUse}>juntar ao projeto</button>
      </>}>
      <div className="ap-draft">
        {draft.pitch && <p className="ap-draft__pitch">{draft.pitch}</p>}
        <div className="ap-draft__cols">
          <section>
            <p className="ap-draft__head">funcionalidades · {draft.features.length}</p>
            <ul>{draft.features.map((f) => <li key={f.id}><span className={"ap-phase ap-phase--" + f.phase}>{phaseLabel(f.phase)}</span>{f.title}</li>)}</ul>
          </section>
          <section>
            <p className="ap-draft__head">banco · {draft.entities.length}</p>
            <ul>{draft.entities.map((e) => (
              <li key={e.id}><b>{e.name}</b>
                <span className="ap-draft__fields">{e.fields.map((f) => f.name + (f.type === "ref" ? " → " + (ents.get(f.ref) || "?") : "")).join(", ")}</span>
              </li>
            ))}</ul>
          </section>
          <section>
            <p className="ap-draft__head">telas · {draft.screens.length}</p>
            <ul>{draft.screens.map((s) => <li key={s.id}>{s.start && <span className="ap-start-badge">entrada</span>}{s.name}{s.goal && <span className="ap-draft__fields">{s.goal}</span>}</li>)}</ul>
          </section>
        </div>
        {draft.stack && <p className="ap-draft__stack"><b>stack</b> {draft.stack}</p>}
      </div>
    </Dialog>
  );
}

/* ================================================================
   conceito
   ================================================================ */

/* texto que grava sozinho: ao sair do campo e depois de uma pausa */
function AutoText({ value, onSave, rows, placeholder, input, maxLength }) {
  const [text, setText] = useState(value);
  const timer = useRef(null);
  const focused = useRef(false);
  /* o que chega da nuvem entra, a nao ser que a pessoa esteja escrevendo */
  useEffect(() => { if (!focused.current) setText(value); }, [value]);
  const flush = (t) => { clearTimeout(timer.current); if (t !== value) onSave(t); };
  const change = (e) => {
    const t = e.target.value;
    setText(t);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onSave(t), 900);
  };
  const props = {
    value: text, placeholder, maxLength, onChange: change,
    onFocus: () => { focused.current = true; },
    onBlur: () => { focused.current = false; flush(text); }
  };
  return input ? <input className="input" {...props} /> : <textarea className="textarea" rows={rows || 3} {...props} />;
}

const CONCEPT = [
  { key: "pitch", label: "a frase", hint: "o app em uma linha — é o que aparece no topo e na lista", input: true, max: 300 },
  { key: "problem", label: "o problema", hint: "o que dói hoje, e como as pessoas resolvem sem o app" },
  { key: "audience", label: "para quem", hint: "quem usa, quem paga, e quem decide" },
  { key: "value", label: "a proposta", hint: "por que isto e não o jeito de hoje — o que só ele faz" },
  { key: "stack", label: "stack", hint: "ex.: Next.js, Supabase (Postgres + auth), Stripe, Vercel" },
  { key: "notes", label: "notas", hint: "o resto: concorrentes, preço, riscos, links", rows: 5 }
];

function ConceptTab({ app, save, saveUndo }) {
  const [editing, setEditing] = useState(null);
  const [task, setTask] = useState(null);
  const addFeature = (title, phase) => save((cur) => ({ ...cur, features: cur.features.concat({ id: newId(), title: title.slice(0, 200), note: "", phase: phase || "mvp", done: false }) }));
  const patchFeature = (id, patch) => save((cur) => ({ ...cur, features: cur.features.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
  const nextPhase = (p) => PHASES[(PHASES.findIndex((x) => x.id === p) + 1) % PHASES.length].id;
  return (
    <div className="ap-concept">
      <div className="ap-concept__text">
        {CONCEPT.map((c) => (
          <label key={c.key} className="ap-field">
            <span className="ap-field__label">{c.label}</span>
            <AutoText value={app[c.key]} input={c.input} rows={c.rows} maxLength={c.max} placeholder={c.hint}
              onSave={(t) => save({ [c.key]: t })} />
          </label>
        ))}
      </div>
      <div className="ap-features">
        {PHASES.map((p) => {
          const list = app.features.filter((f) => f.phase === p.id);
          return (
            <section key={p.id} className="ap-features__group block">
              <p className="ap-features__head"><span className={"ap-phase ap-phase--" + p.id}>{p.label}</span><span className="ap-features__n">{list.length}</span></p>
              {list.length > 0 && (
                <ul className="ap-features__list">
                  {list.map((f) => (
                    <li key={f.id} className={"ap-feature" + (f.done ? " is-done" : "")}>
                      <input type="checkbox" checked={f.done} aria-label="feito" onChange={(e) => patchFeature(f.id, { done: e.target.checked })} />
                      <button type="button" className="ap-feature__title" onClick={() => setEditing(f)} title={f.note || "editar"}>{f.title}</button>
                      <button type="button" className="ap-icon" title={"mover para " + phaseLabel(nextPhase(f.phase))} onClick={() => patchFeature(f.id, { phase: nextPhase(f.phase) })}>{icon("arrow")}</button>
                      <button type="button" className="ap-icon" title="virar tarefa" onClick={() => setTask(f)}>{icon("clock")}</button>
                    </li>
                  ))}
                </ul>
              )}
              <NewItemRow placeholder={p.id === "mvp" ? "o que a primeira versão precisa ter" : "funcionalidade"} button="adicionar" onAdd={(t) => addFeature(t, p.id)} />
            </section>
          );
        })}
      </div>
      {editing && <FeatureForm feature={editing} onClose={() => setEditing(null)}
        onSave={(patch) => patchFeature(editing.id, patch)}
        onRemove={() => saveUndo((cur) => ({ ...cur, features: cur.features.filter((f) => f.id !== editing.id) }), "funcionalidade apagada")} />}
      {task && <TaskDialog title={app.name + " · " + task.title} date={today()} origin={{ type: "apps", id: app.id }} onClose={() => setTask(null)} />}
    </div>
  );
}

function FeatureForm({ feature, onSave, onRemove, onClose }) {
  const [v, bind] = useFields({ title: feature.title, note: feature.note, phase: feature.phase });
  return (
    <Form title="funcionalidade" remove="apagar" onRemove={onRemove} onClose={onClose}
      onSubmit={() => { const t = v.title.trim(); if (!t) { notify("a funcionalidade precisa de um título"); return false; } onSave({ title: t.slice(0, 200), note: v.note.slice(0, 600), phase: v.phase }); }}>
      <Field label="título" full><input className="input" {...bind("title")} maxLength={200} /></Field>
      <Field label="fase" full>
        <select className="select" {...bind("phase")}>{PHASES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
      </Field>
      <Field label="detalhe" full><textarea className="textarea" rows={4} {...bind("note")} placeholder="regra, exceção, critério de pronto" /></Field>
    </Form>
  );
}

/* ================================================================
   o palco — comum a dados e fluxos
   arrastar o fundo anda; a roda (ou a pinça) aproxima em volta do cursor;
   arrastar um cartao pelo corpo muda ele de lugar. clique sem arrasto abre.
   ================================================================ */
const MIN_Z = 0.25, MAX_Z = 2;
/* o ponteiro fica preso ao elemento enquanto arrasta; um ponteiro que ja
   saiu (toque cancelado) faz o navegador recusar, e isso nao pode parar o gesto */
const capture = (e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {} };
function useView() {
  const [view, setView] = useState({ x: 40, y: 40, z: 1 });
  return [view, setView];
}

function Stage({ view, setView, items, w, h, children, overlay, onFrame }) {
  const ref = useRef(null);
  const pan = useRef(null);
  const pointers = useRef(new Map());

  /* enquadrar: tudo cabe, sem passar de 100% */
  const frame = () => {
    const el = ref.current;
    if (!el || !items.length) { setView({ x: 40, y: 40, z: 1 }); return; }
    const x0 = Math.min(...items.map((i) => i.x)), y0 = Math.min(...items.map((i) => i.y));
    const x1 = Math.max(...items.map((i) => i.x + w(i))), y1 = Math.max(...items.map((i) => i.y + h(i)));
    const r = el.getBoundingClientRect();
    const z = Math.max(MIN_Z, Math.min(1, (r.width - 80) / Math.max(1, x1 - x0), (r.height - 80) / Math.max(1, y1 - y0)));
    setView({ z, x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: (r.height - (y1 - y0) * z) / 2 - y0 * z });
  };
  useEffect(() => { frame(); }, []);
  useEffect(() => { if (onFrame) onFrame.current = frame; });

  const zoomAt = (cx, cy, factor) => setView((v) => {
    const z = Math.max(MIN_Z, Math.min(MAX_Z, v.z * factor));
    return { z, x: cx - (cx - v.x) * (z / v.z), y: cy - (cy - v.y) * (z / v.z) };
  });
  useEffect(() => {
    const el = ref.current;
    /* passivo: false, senao o navegador rola a pagina junto */
    const wheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX) * 2 && !e.shiftKey) zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  const down = (e) => {
    if (e.target.closest("[data-item]")) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    capture(e);
    pan.current = { x: e.clientX, y: e.clientY, pinch: null };
  };
  const move = (e) => {
    if (!pan.current || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      /* a pinca: a distancia entre os dedos e o zoom */
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const r = ref.current.getBoundingClientRect();
      if (pan.current.pinch) zoomAt((pts[0].x + pts[1].x) / 2 - r.left, (pts[0].y + pts[1].y) / 2 - r.top, d / pan.current.pinch);
      pan.current.pinch = d;
      return;
    }
    const dx = e.clientX - pan.current.x, dy = e.clientY - pan.current.y;
    pan.current.x = e.clientX; pan.current.y = e.clientY;
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const up = (e) => {
    pointers.current.delete(e.pointerId);
    if (!pointers.current.size) pan.current = null;
    else if (pan.current) pan.current.pinch = null;
  };
  const center = (factor) => { const r = ref.current.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, factor); };

  return (
    <div className="ap-stage" ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div className="ap-stage__world" style={{ transform: "translate(" + view.x + "px," + view.y + "px) scale(" + view.z + ")" }}>
        {children}
      </div>
      {overlay}
      <div className="ap-zoom">
        <button type="button" className="ap-icon" title="afastar" onClick={() => center(1 / 1.2)}>−</button>
        <span className="ap-zoom__n">{Math.round(view.z * 100)}%</span>
        <button type="button" className="ap-icon" title="aproximar" onClick={() => center(1.2)}>+</button>
        <button type="button" className="ap-icon" title="enquadrar tudo" onClick={frame}>{icon("unfold")}</button>
      </div>
    </div>
  );
}

/* arrastar um cartao: devolve os handlers e a posicao provisoria. o
   documento so e gravado ao soltar — arrastar nao vira cem gravacoes. */
function useDrag(view, onDrop, onClick) {
  const [moving, setMoving] = useState(null);
  const start = useRef(null);
  const handlers = (item) => ({
    onPointerDown: (e) => {
      if (e.button !== 0 || e.target.closest("[data-nodrag]")) return;
      e.stopPropagation();
      capture(e);
      start.current = { id: item.id, px: e.clientX, py: e.clientY, x: item.x, y: item.y, moved: false };
    },
    onPointerMove: (e) => {
      const s = start.current;
      if (!s || s.id !== item.id) return;
      const dx = (e.clientX - s.px) / view.z, dy = (e.clientY - s.py) / view.z;
      if (!s.moved && Math.hypot(dx, dy) < 4) return;
      s.moved = true;
      s.nx = Math.round(s.x + dx); s.ny = Math.round(s.y + dy);
      setMoving({ id: item.id, x: s.nx, y: s.ny });
    },
    onPointerUp: () => {
      const s = start.current;
      start.current = null;
      if (!s || s.id !== item.id) return;
      if (s.moved) onDrop(item.id, s.nx, s.ny);
      else if (!s.moved) onClick(item);
      setMoving(null);
    }
  });
  const pos = (item) => (moving && moving.id === item.id ? { ...item, x: moving.x, y: moving.y } : item);
  return [handlers, pos];
}

/* a seta entre duas caixas: sai pela lateral mais perto e chega com curva */
function arrowPath(a, b) {
  const ax = a.x + a.w / 2, bx = b.x + b.w / 2;
  let x1, x2;
  if (b.x > a.x + a.w) { x1 = a.x + a.w; x2 = b.x; }
  else if (b.x + b.w < a.x) { x1 = a.x; x2 = b.x + b.w; }
  else { x1 = a.x + a.w; x2 = b.x + b.w; }
  const y1 = a.cy, y2 = b.cy;
  const dir1 = x1 >= ax ? 1 : -1, dir2 = x2 >= bx ? 1 : -1;
  const bend = Math.max(40, Math.abs(x2 - x1) / 2);
  return {
    d: "M" + x1 + "," + y1 + " C" + (x1 + dir1 * bend) + "," + y1 + " " + (x2 + dir2 * bend) + "," + y2 + " " + x2 + "," + y2,
    mx: (x1 + x2) / 2 + (dir1 === dir2 ? dir1 * bend * 0.75 : 0), my: (y1 + y2) / 2
  };
}

function Arrows({ children }) {
  return (
    <svg className="ap-arrows" width="1" height="1">
      <defs>
        <marker id="ap-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-50)" />
        </marker>
      </defs>
      {children}
    </svg>
  );
}

/* ================================================================
   dados: entidades, campos e relacoes
   ================================================================ */
function DataTab({ app, save, saveUndo }) {
  const [view, setView] = useView();
  const [open, setOpen] = useState(null);
  const frameRef = useRef(null);
  const [handlers, pos] = useDrag(view,
    (id, x, y) => save((cur) => ({ ...cur, entities: cur.entities.map((e) => (e.id === id ? { ...e, x, y } : e)) })),
    (e) => setOpen(e.id));
  const ents = app.entities.map(pos);
  const byId = new Map(ents.map((e) => [e.id, e]));

  const add = () => {
    const right = app.entities.length ? Math.max(...app.entities.map((e) => e.x + ENTITY_W)) + 90 : 0;
    const e = { id: newId(), name: "entidade " + (app.entities.length + 1), note: "", x: right, y: 0,
      fields: [{ id: newId(), name: "created_at", type: "timestamp", pk: false, required: true, unique: false, ref: "", options: "", note: "" }] };
    save((cur) => ({ ...cur, entities: cur.entities.concat(e) }));
    setOpen(e.id);
  };
  const arrange = () => { saveUndo((cur) => ({ ...cur, entities: layoutEntities(cur.entities) }), "entidades organizadas"); setTimeout(() => frameRef.current && frameRef.current(), 50); };

  const lines = [];
  ents.forEach((e) => e.fields.forEach((f, i) => {
    const t = f.type === "ref" && byId.get(f.ref);
    if (!t) return;
    const p = arrowPath(
      { x: e.x, w: ENTITY_W, cy: e.y + ENTITY_HEAD + i * FIELD_H + FIELD_H / 2 },
      { x: t.x, w: ENTITY_W, cy: t.y + ENTITY_HEAD / 2 }
    );
    lines.push(<path key={e.id + f.id} d={p.d} className="ap-arrow" markerEnd="url(#ap-head)" />);
  }));

  const current = open && app.entities.find((e) => e.id === open);
  return (
    <>
      <div className="ap-toolbar">
        <button className="pill pill--accent" type="button" onClick={add}>{icon("plus")}entidade</button>
        {app.entities.length > 1 && <button className="pill" type="button" onClick={arrange}>organizar</button>}
        <span className="ap-toolbar__hint">clique numa entidade para editar os campos · arraste para mover · a seta sai do campo de relação</span>
      </div>
      <Stage view={view} setView={setView} items={app.entities} w={() => ENTITY_W} h={entityHeight} onFrame={frameRef}
        overlay={!app.entities.length && <div className="ap-stage__empty">
          <p>O banco ainda está vazio.</p>
          <button className="pill pill--accent" type="button" onClick={add}>{icon("plus")}primeira entidade</button>
        </div>}>
        <Arrows>{lines}</Arrows>
        {ents.map((e) => (
          <div key={e.id} data-item className="ap-entity" style={{ left: e.x, top: e.y, width: ENTITY_W }} {...handlers(e)}>
            <div className="ap-entity__head" title={e.note || undefined}>
              <span className="ap-entity__name">{e.name}</span>
              <span className="ap-entity__table">{snake(e.name)}</span>
            </div>
            {e.fields.length ? e.fields.map((f) => (
              <div key={f.id} className="ap-entity__field">
                <span className="ap-entity__fname">{f.name || "—"}</span>
                <span className="ap-entity__ftype">{f.type === "ref" ? "→ " + ((byId.get(f.ref) || {}).name || "?") : typeLabel(f.type)}</span>
                <span className="ap-entity__keys">{f.pk ? "PK" : ""}{f.unique && !f.pk ? "U" : ""}{f.required && !f.pk ? "•" : ""}</span>
              </div>
            )) : <div className="ap-entity__field ap-entity__field--empty">sem campos</div>}
          </div>
        ))}
      </Stage>
      {current && <EntityDialog key={current.id} entity={current} app={app} onClose={() => setOpen(null)}
        onSave={(next) => save((cur) => ({ ...cur, entities: cur.entities.map((e) => (e.id === next.id ? next : e)) }))}
        onRemove={() => saveUndo((cur) => ({
          ...cur,
          entities: cur.entities.filter((e) => e.id !== current.id).map((e) => ({
            ...e, fields: e.fields.map((f) => (f.type === "ref" && f.ref === current.id ? { ...f, type: "uuid", ref: "" } : f))
          })),
          screens: cur.screens.map((s) => ({ ...s, entities: s.entities.filter((id) => id !== current.id) }))
        }), current.name + " apagada")} />}
    </>
  );
}

function EntityDialog({ entity, app, onSave, onRemove, onClose }) {
  const [name, setName] = useState(entity.name);
  const [note, setNote] = useState(entity.note);
  const [fields, setFields] = useState(entity.fields);
  const others = app.entities;
  const patch = (id, p) => setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...p } : f)));
  const addField = () => setFields((fs) => fs.concat({ id: newId(), name: "", type: "text", pk: false, required: false, unique: false, ref: "", options: "", note: "" }));
  const move = (i, d) => setFields((fs) => { const a = fs.slice(); const j = i + d; if (j < 0 || j >= a.length) return fs; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const submit = () => {
    if (!name.trim()) { notify("a entidade precisa de um nome"); return; }
    onSave({
      ...entity, name: name.trim().slice(0, 60), note: note.slice(0, 600),
      fields: fields.filter((f) => f.name.trim()).map((f) => ({
        ...f, name: f.name.trim().slice(0, 60),
        ref: f.type === "ref" ? f.ref : "", options: f.type === "enum" ? f.options : ""
      }))
    });
    onClose();
  };
  return (
    <Dialog title="entidade" wide onClose={onClose}
      actions={<>
        <button className="dialog__remove" type="button" title="apagar a entidade" aria-label="apagar a entidade" onClick={() => { onClose(); onRemove(); }}>{icon("trash")}</button>
        <span className="spacer" />
        <button className="pill" type="button" onClick={onClose}>cancelar</button>
        <button className="pill pill--accent" type="button" onClick={submit}>salvar</button>
      </>}>
      <div className="ap-entity-form">
        <div className="ap-entity-form__top">
          <label className="ap-field"><span className="ap-field__label">nome</span>
            <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus />
            <span className="ap-field__hint">tabela <code>{snake(name)}</code> · o id já vem sozinho, a não ser que algum campo seja a chave</span>
          </label>
          <label className="ap-field"><span className="ap-field__label">para que serve</span>
            <textarea className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <div className="ap-fields">
          <div className="ap-fields__row ap-fields__row--head">
            <span>campo</span><span>tipo</span><span>detalhe</span><span title="chave">PK</span><span title="obrigatório">obrig.</span><span title="único">único</span><span />
          </div>
          {fields.map((f, i) => (
            <div key={f.id} className="ap-fields__row">
              <input className="input input--mono" value={f.name} placeholder="nome" maxLength={60}
                onChange={(e) => patch(f.id, { name: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addField(); } }} />
              <select className="select" value={f.type} onChange={(e) => patch(f.id, { type: e.target.value })}>
                {FIELD_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              {f.type === "ref" ? (
                <select className="select" value={f.ref} onChange={(e) => patch(f.id, { ref: e.target.value })}>
                  <option value="">aponta para…</option>
                  {others.map((o) => <option key={o.id} value={o.id}>{o.id === entity.id ? name || o.name : o.name}</option>)}
                </select>
              ) : f.type === "enum" ? (
                <input className="input" value={f.options} placeholder="opções, separadas por vírgula" onChange={(e) => patch(f.id, { options: e.target.value })} />
              ) : (
                <input className="input" value={f.note} placeholder="nota" maxLength={200} onChange={(e) => patch(f.id, { note: e.target.value })} />
              )}
              <input type="checkbox" checked={f.pk} aria-label="chave" onChange={(e) => patch(f.id, { pk: e.target.checked })} />
              <input type="checkbox" checked={f.required} aria-label="obrigatório" onChange={(e) => patch(f.id, { required: e.target.checked })} />
              <input type="checkbox" checked={f.unique} aria-label="único" onChange={(e) => patch(f.id, { unique: e.target.checked })} />
              <span className="ap-fields__tools">
                <button type="button" className="ap-icon" title="subir" onClick={() => move(i, -1)}>↑</button>
                <button type="button" className="ap-icon" title="tirar o campo" onClick={() => setFields((fs) => fs.filter((x) => x.id !== f.id))}>{icon("x")}</button>
              </span>
            </div>
          ))}
          <button type="button" className="pill ap-fields__add" onClick={addField}>{icon("plus")}campo</button>
        </div>
      </div>
    </Dialog>
  );
}

/* ================================================================
   fluxos: telas e as acoes entre elas
   ================================================================ */
function FlowsTab({ app, save, saveUndo }) {
  const [view, setView] = useView();
  const [open, setOpen] = useState(null);
  const [link, setLink] = useState(null);      // a seta sendo puxada: {from, x, y}
  const [naming, setNaming] = useState(null);  // a acao recem-ligada, pedindo nome
  const frameRef = useRef(null);
  const stageRef = useRef(null);
  const [handlers, pos] = useDrag(view,
    (id, x, y) => save((cur) => ({ ...cur, screens: cur.screens.map((s) => (s.id === id ? { ...s, x, y } : s)) })),
    (s) => setOpen(s.id));
  const screens = app.screens.map(pos);
  const byId = new Map(screens.map((s) => [s.id, s]));
  const ents = new Map(app.entities.map((e) => [e.id, e.name]));

  const add = () => {
    const right = app.screens.length ? Math.max(...app.screens.map((s) => s.x + SCREEN_W)) + 110 : 0;
    const s = { id: newId(), name: "tela " + (app.screens.length + 1), goal: "", parts: "", entities: [], start: !app.screens.length, x: right, y: 0 };
    save((cur) => ({ ...cur, screens: cur.screens.concat(s) }));
    setOpen(s.id);
  };
  const arrange = () => { saveUndo((cur) => ({ ...cur, screens: layoutScreens(cur.screens, cur.flows) }), "telas organizadas"); setTimeout(() => frameRef.current && frameRef.current(), 50); };

  /* puxar a seta: a alca do lado direito do cartao. soltar em cima de outra
     tela cria a acao e pergunta o gesto. */
  const toWorld = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / view.z, y: (e.clientY - r.top - view.y) / view.z };
  };
  const linkHandlers = (s) => ({
    onPointerDown: (e) => {
      e.stopPropagation();
      capture(e);
      setLink({ from: s.id, ...toWorld(e) });
    },
    onPointerMove: (e) => { if (link) setLink({ ...link, ...toWorld(e) }); },
    onPointerUp: (e) => {
      const from = link && link.from;
      setLink(null);
      const hit = document.elementsFromPoint(e.clientX, e.clientY).map((el) => el.closest && el.closest("[data-screen]")).find(Boolean);
      const to = hit && hit.getAttribute("data-screen");
      if (from && to && to !== from) setNaming({ from, to });
    }
  });

  /* ida e volta entre as mesmas duas telas: cada sentido anda numa faixa
     (a ida por cima, a volta por baixo), senao as setas e os nomes das
     acoes caem um em cima do outro */
  const pairs = new Set(app.flows.map((f) => f.from + ">" + f.to));
  const arrows = app.flows.map((f) => {
    const a = byId.get(f.from), b = byId.get(f.to);
    if (!a || !b) return null;
    if (a.id === b.id) return null;
    const both = pairs.has(f.to + ">" + f.from);
    const lane = both ? (a.x <= b.x ? -16 : 16) : 0;
    const p = arrowPath({ x: a.x, w: SCREEN_W, cy: a.y + SCREEN_H / 2 + lane }, { x: b.x, w: SCREEN_W, cy: b.y + SCREEN_H / 2 + lane });
    return (
      <g key={f.id}>
        <path d={p.d} className="ap-arrow" markerEnd="url(#ap-head)" />
        {f.action && <text x={p.mx} y={lane > 0 ? p.my + 16 : p.my - 6} className="ap-arrow__label" textAnchor="middle">{f.action}</text>}
      </g>
    );
  });
  if (link) {
    const a = byId.get(link.from);
    if (a) arrows.push(<path key="link" d={"M" + (a.x + SCREEN_W) + "," + (a.y + SCREEN_H / 2) + " L" + link.x + "," + link.y} className="ap-arrow ap-arrow--live" markerEnd="url(#ap-head)" />);
  }

  const current = open && app.screens.find((s) => s.id === open);
  return (
    <>
      <div className="ap-toolbar">
        <button className="pill pill--accent" type="button" onClick={add}>{icon("plus")}tela</button>
        {app.screens.length > 1 && <button className="pill" type="button" onClick={arrange}>organizar</button>}
        <span className="ap-toolbar__hint">puxe a bolinha da direita até outra tela para ligar · clique para editar · arraste para mover</span>
      </div>
      <div ref={stageRef}>
        <Stage view={view} setView={setView} items={app.screens} w={() => SCREEN_W} h={() => SCREEN_H} onFrame={frameRef}
          overlay={!app.screens.length && <div className="ap-stage__empty">
            <p>Nenhuma tela ainda. Comece pela que a pessoa vê primeiro.</p>
            <button className="pill pill--accent" type="button" onClick={add}>{icon("plus")}primeira tela</button>
          </div>}>
          <Arrows>{arrows}</Arrows>
          {screens.map((s) => (
            <div key={s.id} data-item data-screen={s.id} className={"ap-screen" + (s.start ? " is-start" : "")}
              style={{ left: s.x, top: s.y, width: SCREEN_W, height: SCREEN_H }} {...handlers(s)}>
              <div className="ap-screen__bar"><i /><i /><i />{s.start && <span className="ap-start-badge">entrada</span>}</div>
              <p className="ap-screen__name">{s.name}</p>
              {s.goal && <p className="ap-screen__goal">{s.goal}</p>}
              {s.entities.length > 0 && (
                <p className="ap-screen__ents">{s.entities.map((id) => ents.get(id)).filter(Boolean).map((n) => <span key={n}>{n}</span>)}</p>
              )}
              <span data-nodrag className="ap-screen__link" title="puxe até outra tela" {...linkHandlers(s)} />
            </div>
          ))}
        </Stage>
      </div>
      {current && <ScreenDialog key={current.id} screen={current} app={app} onClose={() => setOpen(null)}
        onSave={(next, flows) => save((cur) => ({
          ...cur,
          /* uma entrada so: marcar esta desmarca as outras */
          screens: cur.screens.map((s) => (s.id === next.id ? next : next.start ? { ...s, start: false } : s)),
          flows: cur.flows.filter((f) => f.from !== next.id).concat(flows)
        }))}
        onRemove={() => saveUndo((cur) => ({
          ...cur,
          screens: cur.screens.filter((s) => s.id !== current.id),
          flows: cur.flows.filter((f) => f.from !== current.id && f.to !== current.id)
        }), current.name + " apagada")} />}
      {naming && <ActionForm from={byId.get(naming.from)} to={byId.get(naming.to)} onClose={() => setNaming(null)}
        onSave={(action) => save((cur) => ({ ...cur, flows: cur.flows.concat({ id: newId(), from: naming.from, to: naming.to, action }) }))} />}
    </>
  );
}

function ActionForm({ from, to, onSave, onClose }) {
  const [v, bind] = useFields({ action: "" });
  return (
    <Form title="o que leva de uma à outra" sub={(from ? from.name : "?") + " → " + (to ? to.name : "?")} submit="ligar" onClose={onClose}
      onSubmit={() => onSave(v.action.trim().slice(0, 120))}>
      <Field label="a ação" full><input className="input" {...bind("action")} maxLength={120} placeholder="ex.: clicou em pagar" /></Field>
    </Form>
  );
}

function ScreenDialog({ screen, app, onSave, onRemove, onClose }) {
  const [v, bind] = useFields({ name: screen.name, goal: screen.goal, parts: screen.parts, start: screen.start });
  const [ents, setEnts] = useState(screen.entities);
  const [flows, setFlows] = useState(app.flows.filter((f) => f.from === screen.id));
  const targets = app.screens.filter((s) => s.id !== screen.id);
  const toggle = (id) => setEnts((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.concat(id)));
  const submit = () => {
    const name = v.name.trim();
    if (!name) { notify("a tela precisa de um nome"); return; }
    onSave(
      { ...screen, name: name.slice(0, 60), goal: v.goal.slice(0, 300), parts: v.parts.slice(0, 2000), start: !!v.start, entities: ents },
      flows.filter((f) => f.to && f.to !== screen.id).map((f) => ({ ...f, action: f.action.slice(0, 120) }))
    );
    onClose();
  };
  return (
    <Dialog title="tela" wide onClose={onClose}
      actions={<>
        <button className="dialog__remove" type="button" title="apagar a tela" aria-label="apagar a tela" onClick={() => { onClose(); onRemove(); }}>{icon("trash")}</button>
        <span className="spacer" />
        <button className="pill" type="button" onClick={onClose}>cancelar</button>
        <button className="pill pill--accent" type="button" onClick={submit}>salvar</button>
      </>}>
      <div className="ap-screen-form">
        <div>
          <label className="ap-field"><span className="ap-field__label">nome</span><input className="input" {...bind("name")} maxLength={60} autoFocus /></label>
          <label className="ap-field"><span className="ap-field__label">para que serve</span><input className="input" {...bind("goal")} maxLength={300} placeholder="o que a pessoa vem fazer aqui" /></label>
          <label className="ap-field"><span className="ap-field__label">o que tem nela (um por linha)</span>
            <textarea className="textarea" rows={6} {...bind("parts")} placeholder={"lista de pedidos\nfiltro por status\nbotão novo pedido"} />
          </label>
          <label className="ap-check"><input type="checkbox" {...bind("start", "check")} /> é a tela de entrada</label>
        </div>
        <div>
          <p className="ap-field__label">dados que ela usa</p>
          {app.entities.length ? (
            <div className="ap-chips">
              {app.entities.map((e) => (
                <button key={e.id} type="button" className="chip" aria-pressed={String(ents.includes(e.id))} onClick={() => toggle(e.id)}>{e.name}</button>
              ))}
            </div>
          ) : <p className="empty">o banco ainda não tem entidades — elas nascem na aba dados.</p>}
          <p className="ap-field__label ap-gap">ações que saem daqui</p>
          {flows.map((f) => (
            <div key={f.id} className="ap-action">
              <input className="input" value={f.action} placeholder="ação" maxLength={120}
                onChange={(e) => setFlows((fs) => fs.map((x) => (x.id === f.id ? { ...x, action: e.target.value } : x)))} />
              <select className="select" value={f.to} onChange={(e) => setFlows((fs) => fs.map((x) => (x.id === f.id ? { ...x, to: e.target.value } : x)))}>
                <option value="">vai para…</option>
                {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button type="button" className="ap-icon" title="tirar" onClick={() => setFlows((fs) => fs.filter((x) => x.id !== f.id))}>{icon("x")}</button>
            </div>
          ))}
          {targets.length > 0
            ? <button type="button" className="pill" onClick={() => setFlows((fs) => fs.concat({ id: newId(), from: screen.id, to: "", action: "" }))}>{icon("plus")}ação</button>
            : <p className="empty">crie outra tela para ligar as duas.</p>}
        </div>
      </div>
    </Dialog>
  );
}

/* ================================================================
   exportar: o projeto vira texto para quem constroi
   ================================================================ */
const OUTPUTS = [
  { id: "prompt", label: "prompt para o Claude Code", ext: ".prompt.md", what: "prompt", make: toPrompt, note: "a especificação inteira e o jeito de trabalhar: cole numa pasta nova e ele começa pelo banco" },
  { id: "md", label: "especificação", ext: ".md", what: "especificação", make: toMarkdown, note: "o documento do projeto, com as tabelas e os dois diagramas" },
  { id: "sql", label: "SQL (Postgres)", ext: ".sql", what: "SQL", make: toSQL, note: "roda de uma vez no Supabase ou no Neon: as tabelas saem na ordem das relações" },
  { id: "er", label: "diagrama do banco", ext: ".er.mmd", what: "diagrama", make: toMermaidER, note: "mermaid erDiagram — cola no GitHub, no Notion ou no mermaid.live" },
  { id: "flow", label: "diagrama dos fluxos", ext: ".flow.mmd", what: "diagrama", make: toMermaidFlow, note: "mermaid flowchart das telas e das ações" }
];

function ExportTab({ app, problems }) {
  const [which, setWhich] = useState("prompt");
  const out = OUTPUTS.find((o) => o.id === which);
  const text = useMemo(() => out.make(app), [app, which]);
  return (
    <div className="ap-export">
      <aside className="ap-export__side">
        <section className="block ap-check-list">
          <p className="ap-export__head">{problems.length ? "o que falta antes de construir" : "nada faltando"}</p>
          {problems.length ? (
            <ul>{problems.map((p, i) => <li key={i}><span className="ap-where">{p.where}</span>{p.text}</li>)}</ul>
          ) : <p className="ap-ok">o projeto tem conceito, primeira versão, banco e caminho por todas as telas.</p>}
        </section>
        <section className="ap-outputs">
          {OUTPUTS.map((o) => (
            <button key={o.id} type="button" className={"ap-output" + (o.id === which ? " is-on" : "")} onClick={() => setWhich(o.id)}>
              <span className="ap-output__label">{o.label}</span>
              <span className="ap-output__note">{o.note}</span>
            </button>
          ))}
        </section>
      </aside>
      <section className="ap-export__main block">
        <div className="ap-export__bar">
          <p className="ap-export__head">{out.label}</p>
          <span className="spacer" />
          <button className="pill" type="button" onClick={() => download(snake(app.name) + out.ext, text)}>baixar</button>
          <button className="pill pill--accent" type="button" onClick={() => copy(text, out.what)}>copiar</button>
        </div>
        <pre className="ap-pre">{text}</pre>
      </section>
    </div>
  );
}

/* ================================================================
   lancamento: o app ligado ao funil e as pecas de conteudo
   o funil e as pecas continuam morando nas telas deles; aqui so se liga
   e se cria ja ligado.
   ================================================================ */
const CONTENT_STAGES = { idea: "ideia", script: "roteiro", record: "gravação", edit: "edição", scheduled: "agendado", published: "publicado" };

function LaunchTab({ app, save }) {
  const funnels = useCollection("funnels");
  const content = useCollection("content");
  const [piece, setPiece] = useState(false);
  const linked = app.funnel ? funnels.get(app.funnel) : null;
  const pieces = content.all().filter((c) => c.app === app.id);

  const createFunnel = () => {
    const tpl = FUNNEL_TEMPLATES.find((t) => t.id === "saas-trial");
    const now = Date.now();
    const parts = tpl ? buildFunnel(tpl) : { nodes: [], edges: [], creatives: [], automations: [], offers: [], triggers: [] };
    const f = {
      id: newId(), name: "lançamento · " + app.name, client: app.client || "", channel: "",
      nodes: layoutNodes(parts.nodes, parts.edges), edges: parts.edges,
      creatives: parts.creatives, automations: parts.automations, offers: parts.offers, triggers: parts.triggers,
      period: { from: "", to: "" }, snapshots: [], createdAt: now, updatedAt: now
    };
    funnels.save(f);
    save({ funnel: f.id });
    notify("funil de lançamento criado e ligado ao app");
  };

  return (
    <div className="ap-launch">
      <section className="block ap-launch__box">
        <p className="ap-export__head">o funil</p>
        <p className="ap-launch__text">Como as pessoas chegam até o app e viram assinantes. O funil mora na tela de funis — aqui ele fica ligado ao projeto.</p>
        {linked ? (
          <div className="ap-linked">
            <a className="ap-linked__name" href={"funnels.html#" + encodeURIComponent(linked.id)}>{linked.name}</a>
            <span className="ap-linked__meta">{(linked.nodes || []).length} etapas</span>
            <button type="button" className="pill" onClick={() => save({ funnel: "" })}>desligar</button>
          </div>
        ) : (
          <div className="ap-launch__actions">
            <button type="button" className="pill pill--accent" onClick={createFunnel}>{icon("plus")}funil de lançamento (SaaS com teste grátis)</button>
            {funnels.all().length > 0 && (
              <select className="select" value="" onChange={(e) => e.target.value && save({ funnel: e.target.value })}>
                <option value="">ligar a um funil que já existe…</option>
                {funnels.all().sort((a, b) => String(a.name).localeCompare(String(b.name))).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}
          </div>
        )}
      </section>
      <section className="block ap-launch__box">
        <div className="ap-export__bar">
          <p className="ap-export__head">o conteúdo</p>
          <span className="spacer" />
          <button type="button" className="pill pill--accent" onClick={() => setPiece(true)}>{icon("plus")}peça</button>
        </div>
        <p className="ap-launch__text">O que vai ao ar para apresentar o app: demonstração, bastidor da construção, lançamento. Cada peça segue no quadro de conteúdo.</p>
        {pieces.length ? (
          <ul className="ap-pieces">
            {pieces.map((c) => (
              <li key={c.id}>
                <a href={"content.html#" + encodeURIComponent(c.id)}>{c.title || "peça sem título"}</a>
                <span className="ap-linked__meta">{(FORMATS.find((f) => f.id === c.format) || {}).label || c.format} · {CONTENT_STAGES[c.stage] || c.stage}{c.date ? " · " + c.date.split("-").reverse().slice(0, 2).join("/") : ""}</span>
              </li>
            ))}
          </ul>
        ) : <p className="empty">nenhuma peça ligada a este app ainda.</p>}
      </section>
      {piece && <PieceForm app={app} onClose={() => setPiece(false)} onSave={(v) => {
        const now = Date.now();
        content.save({ id: newId(), title: v.title, format: v.format, stage: "idea", date: "", client: app.client || "", script: "", parent: "", history: [], app: app.id, createdAt: now, updatedAt: now });
        notify("peça criada no quadro de conteúdo");
      }} />}
    </div>
  );
}

function PieceForm({ app, onSave, onClose }) {
  const [v, bind] = useFields({ title: "", format: FORMAT_IDS[0] });
  return (
    <Form title="nova peça" sub={"ligada a " + app.name} submit="criar" onClose={onClose}
      onSubmit={() => { const t = v.title.trim(); if (!t) { notify("a peça precisa de um título"); return false; } onSave({ title: t.slice(0, 200), format: v.format }); }}>
      <Field label="título" full><input className="input" {...bind("title")} maxLength={200} placeholder="ex.: mostrei o app pronto em 60 segundos" /></Field>
      <Field label="formato" full>
        <select className="select" {...bind("format")}>{FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
      </Field>
    </Form>
  );
}

mount(<Apps />, "app");
