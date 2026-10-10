/* merlin · o rastreador
   a janela pequena do app de desktop: fica por cima do que voce esta fazendo e
   diz, sem precisar abrir nada, o que o dia diz — quanto ainda cabe, o que e
   agora e o que vem depois. e o "rastreador" da VISAO, 8.5.

   nao e uma segunda tela do dia, e por isso nao tem conta propria: a sobra sai
   do mesmo budget() e a barra do mesmo distribute() do calendario
   (shared/day.js), e a linha que vira tarefa e lida pelo mesmo readLine()
   (shared/tasks.js). uma sobra calculada de dois jeitos seriam duas verdades
   sobre o mesmo dia — e esta janela fica aberta o dia inteiro, entao seria a
   que a pessoa acredita.

   no app, ela descansa RECOLHIDA: uma faixa com o numero, o que e agora e a
   barra como um fio embaixo. aberta, cobria o trabalho o dia inteiro — o
   Arthur, em 09/10/2026: "esse podia se minimizar, e chato". clicar na faixa
   (ou Alt+Shift+M) abre o cartao; voltar para o que estava fazendo recolhe.

   o que o cartao faz, e so isso: concluir o que e agora, e por coisa nova na
   fila com o pedagio da duracao. reordenar, editar e apagar continuam no
   calendario, a um clique. abre no navegador tambem (tracker.html); la ela fica
   sempre aberta e nao tem bandeja nem botao de esconder. */
import "./shared/base.css";
import "./tracker.css";
import { initPage, today, notify, readPrefs, readDuration, currentBrand } from "./shared/core.js";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { mount, useCollection } from "./shared/ui.jsx";
import { LOGO, GL_MARK } from "./shared/icons.jsx";
import { normalize, dayDoc, overdue, topOrder, newTask, readLine, isReserve, stripPrefix } from "./shared/tasks.js";
import { costOf, guessMin, distribute, fmt, longFmt, clock } from "./shared/day.js";
import { isDesktop, setStatus, openMain, hideTracker, fitTracker } from "./shared/desktop.js";

initPage("tracker");

const CHIPS = [15, 30, 60, 120];
const DAY_PATH = "calendar.html#day";
/* voltar para o trabalho recolhe, mas nao no mesmo quadro: clicar num chip
   ou no desfazer tira o foco do campo por um instante, e isso nao e ir embora */
const COLLAPSE_MS = 600;

/* os tres estados do numero grande, na mesma ordem de prioridade do bloco do
   dia na home: passou da hora > nao cabe > ainda cabe. */
function measureOf(doc, b) {
  if (b.overtime) return { tone: "over", n: clock(doc.end), label: b.open.length ? "passou, e ainda há fila" : "passou. o dia fechou." };
  if (!b.open.length) return { tone: "", n: fmt(Math.max(0, b.remaining)), label: "livre pela frente" };
  if (b.slack >= 0) return { tone: "", n: (b.unestimated ? "~" : "") + fmt(b.slack), label: "ainda cabe" };
  return { tone: "over", n: fmt(b.overflow), label: "além do que cabe" };
}

function Tracker() {
  const store = useCollection("tasks", { normalize });
  useCollection("prefs"); /* a janela do dia mudou no outro lugar: redesenha */
  const [, setTick] = useState(0);
  const desktop = isDesktop();
  const [compact, setCompact] = useState(desktop);
  const root = useRef(null);
  const wantsField = useRef(false);

  /* o relogio: a barra se gasta sozinha, entao a tela tem que andar com ele */
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000);
    const wake = () => { if (!document.hidden) setTick((n) => n + 1); };
    document.addEventListener("visibilitychange", wake);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", wake); };
  }, []);

  /* abrir: o clique na faixa, ou o atalho global do app (Alt+Shift+M), que
     traz a janela e manda "merlin:focus" — esse quer o cursor no campo */
  const expand = (field) => { wantsField.current = !!field; setCompact(false); };
  useEffect(() => {
    const focus = () => expand(true);
    window.addEventListener("merlin:focus", focus);
    return () => window.removeEventListener("merlin:focus", focus);
  }, []);
  /* Esc fora do campo tambem recolhe (no campo, quem cuida e o Composer,
     que antes desfaz a pergunta da duracao se houver uma aberta) */
  useEffect(() => {
    if (!desktop || compact) return;
    const onKey = (e) => { if (e.key === "Escape" && e.target.id !== "tk-field") setCompact(true); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desktop, compact]);
  useEffect(() => {
    if (compact || !wantsField.current) return;
    wantsField.current = false;
    const f = document.getElementById("tk-field");
    if (f) f.focus();
  }, [compact]);

  /* recolher sozinho e coisa do app: no navegador a janela e uma aba, e uma
     aba que encolhe quando voce troca de aba nao serve para nada */
  useEffect(() => {
    if (!desktop) return;
    let timer = null;
    const leave = () => { timer = setTimeout(() => { if (!document.hasFocus()) setCompact(true); }, COLLAPSE_MS); };
    const back = () => clearTimeout(timer);
    window.addEventListener("blur", leave);
    window.addEventListener("focus", back);
    return () => { clearTimeout(timer); window.removeEventListener("blur", leave); window.removeEventListener("focus", back); };
  }, [desktop]);

  /* a janela tem a altura do que esta desenhado: mede depois de cada pintura
     e so pede ao app quando mudou */
  const lastHeight = useRef(0);
  useLayoutEffect(() => {
    if (!desktop || !root.current) return;
    const h = Math.ceil(root.current.getBoundingClientRect().height);
    if (h && h !== lastHeight.current) { lastHeight.current = h; fitTracker(h); }
  });

  const date = today();
  const all = store.all();
  const doc = dayDoc(all, date, readPrefs());
  const { b, slots, cut } = distribute(doc);
  const m = measureOf(doc, b);
  const now = b.open[0] || null;
  const next = b.open.slice(1, 3);
  const late = overdue(all, date).length;

  /* a bandeja repete o numero grande, para quem nem abriu esta janela */
  const status = "merlin · " + m.n + " " + m.label + (now ? " · agora: " + now.title : "");
  useEffect(() => { setStatus(status); }, [status]);

  const create = (spec) => {
    store.save(newTask({ ...spec, date, order: topOrder(store.all(), date) }));
  };
  const complete = (t) => {
    const cur = store.get(t.id);
    if (!cur || cur.done) return;
    store.save({ ...cur, done: true, updatedAt: Date.now() });
    notify(t.min ? "+" + longFmt(t.min) + " de volta pro dia" : "feita.", () => {
      const back = store.get(t.id);
      if (back && back.done) store.save({ ...back, done: false, updatedAt: Date.now() });
    });
  };
  const toDay = (e) => { if (desktop) { e.preventDefault(); openMain(DAY_PATH); } };

  const range = (t) => {
    const s = slots.get(t.id);
    return s ? clock(doc.start + s.from) + "–" + clock(doc.start + s.from + s.min) : "";
  };
  const mark = currentBrand() === "gl" ? GL_MARK : LOGO;

  if (compact) {
    return (
      <div className="tk tk--strip" ref={root}>
        <div className="tk-strip" data-tauri-drag-region>
          <span className="tk-grip" data-tauri-drag-region title="arraste para mudar de lugar">{mark}</span>
          <button className="tk-peek" type="button" onClick={() => expand(false)} title="abrir (Alt+Shift+M)">
            <span className="tk-n" data-tone={m.tone}>{m.n}</span>
            <span className="tk-peek__text">{now ? now.title : m.label}</span>
          </button>
          <button className="tk-btn" type="button" onClick={() => expand(true)} title="abrir e escrever (Alt+Shift+M)" aria-label="Abrir o rastreador">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
          </button>
        </div>
        <Track b={b} slots={slots} thin />
      </div>
    );
  }

  return (
    <div className="tk" ref={root}>
      <header className="tk-bar" data-tauri-drag-region>
        <span className="tk-brand" data-tauri-drag-region>
          {mark}<b data-tauri-drag-region>merlin</b>
        </span>
        <span className="tk-win t-mono" data-tauri-drag-region>{clock(doc.start)}–{clock(doc.end)}</span>
        <a className="tk-btn" href={DAY_PATH} onClick={toDay} title="abrir o dia" aria-label="Abrir o dia no Merlin">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
        </a>
        {desktop && (
          <button className="tk-btn" type="button" onClick={() => setCompact(true)} title="recolher (Esc)" aria-label="Recolher o rastreador">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 12h12" /></svg>
          </button>
        )}
        {desktop && (
          <button className="tk-btn" type="button" onClick={hideTracker} title="esconder (volta pela bandeja)" aria-label="Esconder o rastreador">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        )}
      </header>

      <p className="tk-big" data-tone={m.tone}>
        <span className="tk-n">{m.n}</span> <span className="tk-label">{m.label}</span>
      </p>

      <Track b={b} slots={slots} />

      {now ? (
        <div className={"tk-now" + (cut === 0 ? " is-out" : "")} title={range(now)}>
          <button className="tk-check" type="button" onClick={() => complete(now)} title="concluir" aria-label={"Concluir " + now.title} />
          <span className="tk-title">{now.title}</span>
          <span className="tk-min t-mono">{now.min ? fmt(now.min) : "~" + fmt(guessMin())}</span>
        </div>
      ) : (
        <p className="tk-none">nada na fila de hoje</p>
      )}

      {(next.length > 0 || late > 0) && (
        <p className="tk-next">
          {next.length > 0 && <>depois: {next.map((t, i) => (
            <span key={t.id} className={cut >= 0 && i + 1 >= cut ? "is-out" : ""} title={range(t)}>
              {i ? " · " : ""}{t.title} <i className="t-mono">{fmt(costOf(t))}</i>
            </span>))}
            {b.open.length > 3 && <span> · +{b.open.length - 3}</span>}
          </>}
          {late > 0 && <a href={DAY_PATH} onClick={toDay} className="tk-late">{late + (late === 1 ? " aberta" : " abertas") + " de antes de hoje"}</a>}
        </p>
      )}

      <Composer b={b} onCreate={create} onLeave={desktop ? () => setCompact(true) : null} />
    </div>
  );
}

/* a barra, do mesmo jeito que o calendario a desenha: tudo e % da mesma
   janela, entao o desenho nao pode divergir da conta. `thin` e o fio da faixa
   recolhida — a mesma barra, so mais baixa. */
function Track({ b, slots, thin }) {
  if (!b.window) return null;
  const width = (min) => ({ flex: "0 0 " + ((min / b.window) * 100) + "%" });
  return (
    <div className={"tk-track" + (thin ? " tk-track--thin" : "")} aria-hidden="true">
      {b.elapsed > 0 && <i className="tk-band is-spent" style={width(b.elapsed)} />}
      {b.liveReserve > 0 && <i className="tk-band is-reserved" style={width(b.liveReserve)} />}
      {b.open.map((t) => {
        const s = slots.get(t.id);
        return s ? <i key={t.id} className={"tk-band is-slot" + (s.guess ? " is-guess" : "")} style={width(s.min)} /> : null;
      })}
      {b.committed < b.remaining && <i className="tk-band is-free" />}
    </div>
  );
}

/* o campo: a mesma gramatica do composer do dia ("revisar proposta 45m",
   "- buscar as criancas 40m"). sem duracao, o Enter nao cria — pergunta, com
   os chips ou escrevendo o tempo no proprio campo. */
function Composer({ b, onCreate, onLeave }) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(null);
  const field = useRef(null);

  const reset = () => { setText(""); setPending(null); if (field.current) field.current.focus(); };
  const finish = (min) => { if (pending && min) { onCreate({ ...pending, min }); reset(); } };

  const submit = (e) => {
    e.preventDefault();
    const raw = text.replace(/\s+/g, " ").trim();
    if (!raw) return;
    if (pending) { finish(readDuration(" " + raw + " ").min); return; }
    const { min, title, clickup, client } = readLine(text);
    const name = title || raw;
    const spec = { title: stripPrefix(name), reserved: isReserve(name), clickup, client };
    if (min) { onCreate({ ...spec, min }); reset(); return; }
    setPending(spec);
    setText("");
  };
  /* Esc desfaz um passo de cada vez: primeiro a pergunta da duracao, depois
     o cartao inteiro volta a ser faixa */
  const onKey = (e) => {
    if (e.key !== "Escape") return;
    if (pending) { e.preventDefault(); reset(); }
    else if (onLeave) onLeave();
  };

  const read = !pending && text.trim() ? readLine(text) : null;
  return (
    <form className="tk-add" onSubmit={submit}>
      {pending && (
        <div className="tk-chips">
          <span className="tk-ask"><b>{pending.title}</b> — {pending.reserved ? "quanto tira do dia?" : "quanto leva?"}</span>
          {CHIPS.map((min) => (
            <button key={min} type="button" className="tk-chip t-mono" data-fits={min <= b.slack ? "yes" : "no"} onClick={() => finish(min)}>{fmt(min)}</button>
          ))}
        </div>
      )}
      <input
        ref={field} id="tk-field" className="tk-field" value={text} autoComplete="off" spellCheck="false"
        placeholder={pending ? "ou escreva o tempo: 45m, 1h30…" : "o que mais entra hoje? ex: revisar proposta 45m"}
        onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
      />
      {read && read.min > 0 && (
        <span className="tk-hint t-mono">{fmt(read.min)}{read.min > b.slack ? " · não cabe hoje" : ""}</span>
      )}
    </form>
  );
}

mount(<Tracker />, "app");
