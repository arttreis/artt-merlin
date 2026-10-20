/* merlin · apresentações (PRD desenhos, D4)

   slides 16:9 de texto em quatro layouts fixos, escritos no lugar, com notas
   do apresentador, tela cheia com setas e PDF pela impressão do navegador. a
   forma e as mexidas moram em shared/deck.js; aqui é só a tela. a conversa
   monta a apresentação; a página ajusta, e por isso o editor só tem controle
   de um clique (PRD, "regras que não se quebram").

   um só componente de slide (<Slide>) serve ao editor, às miniaturas, à tela
   cheia e à impressão: o tamanho do texto é em unidades do próprio slide
   (container queries), então ele é o mesmo desenho em qualquer largura.

   sem apresentação aberta (slides.html sem #id), a página é a tela de começar,
   com os modelos. a lista de apresentações mora em desenhos. */
import "./shared/base.css";
import "./slides.css";
import { initPage, newId, notify } from "./shared/core.js";
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { mount, useCollection, useHash, useKeydown, Dialog, icon } from "./shared/ui.jsx";
import {
  normalizeDeck, blankSlide, moveSlide, duplicateSlide, removeSlide, insertSlide, setLayout, updateSlide,
  SLIDE_LAYOUTS, DECK_SLIDES, SLIDE_ITEMS
} from "./shared/deck.js";
import { DeckStart } from "./shared/deck-start.jsx";

/* a apresentação não tem aba própria: acende "desenhos" */
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
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
);

/* reordenar, duplicar, apagar e trocar o layout só da largura de um tablet
   para cima (ticket #92): no celular a apresentação serve para ver, apresentar
   e corrigir o texto */
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

function Slides() {
  const decks = useCollection("decks", { normalize: normalizeDeck });
  const hash = useHash();
  const open = hash && decks.has(hash) ? hash : "";
  return open ? <Editor key={open} id={open} decks={decks} /> : <Start decks={decks} />;
}

function Start({ decks }) {
  const any = decks.all().length > 0;
  return (
    <main className="page">
      <div className="header">
        <div><h1>apresentações</h1><p className="sub">slides de texto no tema do Merlin, para mostrar em tela cheia ou sair em PDF</p></div>
        <div className="actions">
          <a className="pill" href="drawings.html#apresentações">{icon("chevronLeft")}desenhos</a>
        </div>
      </div>
      <DeckStart decks={decks} title={any ? "de que modelo é a nova apresentação?" : undefined} onOpen={(doc) => { location.hash = doc.id; }} />
    </main>
  );
}

/* ---------- o slide ----------
   `edit` troca o texto por campos no mesmo lugar e no mesmo tamanho; sem ele,
   o slide é só leitura (miniatura, tela cheia, impressão). `onText(campo,
   valor)` e `onItems(lista)` recebem o que mudou. */
const PLACEHOLDER = {
  title: "título", body: "a frase de apoio", number: "42", caption: "o que esse número mede",
  left: "a coluna da esquerda", right: "a coluna da direita", item: "um tópico"
};
function Slide({ slide, n, edit }) {
  const T = (field, Tag, className, props) => (edit
    ? <Field field={field} value={slide[field]} className={className} {...edit} {...props} />
    : slide[field] ? <Tag className={className}>{slide[field]}</Tag> : null);
  let inner;
  if (slide.layout === "cover") {
    inner = <div className="dk-cover">{T("title", "h2", "dk-title")}{T("body", "p", "dk-body")}</div>;
  } else if (slide.layout === "number") {
    inner = <div className="dk-number">{T("title", "p", "dk-label")}{T("number", "p", "dk-big")}{T("caption", "p", "dk-caption")}</div>;
  } else if (slide.layout === "columns") {
    inner = (
      <div className="dk-columns">
        {T("title", "h2", "dk-title")}
        <div className="dk-cols">{T("left", "div", "dk-col", { multiline: true })}{T("right", "div", "dk-col", { multiline: true })}</div>
      </div>
    );
  } else {
    const items = edit ? (slide.items.length ? slide.items : [""]) : slide.items.filter((x) => x.trim());
    inner = (
      <div className="dk-bullets">
        {T("title", "h2", "dk-title")}
        {items.length > 0 && (
          <ul className="dk-items">
            {items.map((it, i) => <li key={i}>{edit ? <ItemField index={i} value={it} items={slide.items} {...edit} /> : it}</li>)}
          </ul>
        )}
      </div>
    );
  }
  return (
    <div className={"dk-slide dk-slide--" + slide.layout + (edit ? " is-edit" : "")}>
      <div className="dk-slide__in">{inner}{n ? <span className="dk-slide__n" aria-hidden="true">{n}</span> : null}</div>
    </div>
  );
}

/* um campo do slide: um textarea que cresce com o texto (o reflexo invisível
   no ::after dá a altura), com a mesma fonte do slide. Enter só quebra linha
   onde o texto é de parágrafo */
function Field({ field, value, className, multiline, onText, onBlur }) {
  return (
    <div className={"dk-grow " + className} data-value={value || PLACEHOLDER[field]}>
      <textarea rows="1" value={value} placeholder={PLACEHOLDER[field]} aria-label={PLACEHOLDER[field]} spellCheck="true"
        data-dk-field={field}
        onChange={(e) => onText(field, e.currentTarget.value)} onBlur={onBlur}
        onKeyDown={(e) => { if (e.key === "Enter" && !multiline && field !== "body") e.preventDefault(); }} />
    </div>
  );
}

/* um tópico: Enter abre o próximo, Backspace no vazio apaga e volta ao de cima */
function ItemField({ index, value, items, onItems, onBlur, focusItem }) {
  return (
    <div className="dk-grow dk-item" data-value={value || PLACEHOLDER.item}>
      <textarea rows="1" value={value} placeholder={PLACEHOLDER.item} aria-label={"tópico " + (index + 1)} spellCheck="true"
        data-dk-field="items" data-dk-item={index}
        onChange={(e) => { const next = items.slice(); next[index] = e.currentTarget.value; onItems(next, true); }}
        onBlur={onBlur}
        onKeyDown={(e) => {
          const el = e.currentTarget;
          if (e.key === "Enter") {
            e.preventDefault();
            if (items.length >= SLIDE_ITEMS) { notify("um slide vai até " + SLIDE_ITEMS + " tópicos"); return; }
            const next = items.length ? items.slice() : [""];
            next.splice(index + 1, 0, "");
            onItems(next, false);
            focusItem(index + 1);
          } else if (e.key === "Backspace" && !el.value && items.length > 0) {
            e.preventDefault();
            onItems(items.filter((_, i) => i !== index), false);
            focusItem(Math.max(0, index - 1));
          }
        }} />
    </div>
  );
}

/* ---------- o editor ---------- */
function Editor({ id, decks }) {
  const wide = useWide();
  const [doc, setDoc] = useState(() => decks.get(id));
  const docRef = useRef(doc); docRef.current = doc;
  const [cur, setCur] = useState(0);
  const [showing, setShowing] = useState(null); // índice na tela cheia | null
  const [menuOpen, setMenuOpen] = useState(false);
  const historyRef = useRef([]), futureRef = useRef([]), typingRef = useRef(null);
  const saveTimer = useRef(0), playRef = useRef(null), stageRef = useRef(null), focusRef = useRef(null);

  /* ---- gravar: o mesmo respiro do mapa, e o que esperava sobe ao sair ---- */
  const saveNow = () => {
    clearTimeout(saveTimer.current); saveTimer.current = 0;
    const next = { ...docRef.current, updatedAt: Date.now() };
    docRef.current = next; setDoc(next);
    decks.save(next);
  };
  const scheduleSave = () => { clearTimeout(saveTimer.current); saveTimer.current = setTimeout(saveNow, 400); };
  useEffect(() => () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current); saveTimer.current = 0;
      if (decks.has(id)) decks.save({ ...docRef.current, updatedAt: Date.now() });
    }
  }, []);

  /* ---- histórico: cada mudança é um passo, como no mapa ----
     `fn` recebe o documento e devolve o próximo (a mesma referência: nada
     muda). `typing` é a chave do campo: as teclas seguidas no mesmo campo são
     um passo só, e sair dele fecha o passo */
  const change = (fn, options) => {
    const o = options || {};
    const prev = docRef.current;
    const next = fn(prev);
    if (!next || next === prev) return false;
    const same = o.typing && typingRef.current === o.typing;
    if (o.history !== false && !same) {
      historyRef.current.push(prev);
      if (historyRef.current.length > 50) historyRef.current.shift();
      futureRef.current = [];
    }
    typingRef.current = o.typing || null;
    docRef.current = next; setDoc(next);
    scheduleSave();
    return true;
  };
  const step = (from, to) => {
    if (!from.current.length) return;
    to.current.push(docRef.current);
    if (to.current.length > 50) to.current.shift();
    const next = from.current.pop();
    typingRef.current = null;
    docRef.current = next; setDoc(next);
    scheduleSave();
  };
  const undo = () => step(historyRef, futureRef);
  const redo = () => step(futureRef, historyRef);
  /* o "desfazer" do aviso: se nada mudou depois, é o Ctrl+Z; se mudou, volta
     ao retrato de antes, e isso também se desfaz */
  const undoTo = (snapshot, at) => () => {
    const h = historyRef.current;
    if (h[h.length - 1] === snapshot) undo();
    else change(() => snapshot);
    if (at != null) setCur(at);
  };

  /* ---- outra aba ou a nuvem mexeram nesta apresentação ---- */
  useEffect(() => decks.onChange((origin) => {
    if (!decks.has(id)) { location.hash = ""; return; }
    if (origin === "local") return;
    const fresh = decks.get(id);
    if (JSON.stringify(fresh) === JSON.stringify(docRef.current)) return;
    docRef.current = fresh; setDoc(fresh);
  }), []);

  /* desfazer: nos campos do slide também — digitar é um passo do desfazer da
     apresentação, não do navegador. o nome é campo comum, com o do navegador */
  useKeydown((e) => {
    if (!(e.ctrlKey || e.metaKey) || showing !== null || menuOpen) return;
    const el = document.activeElement;
    if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || (el.tagName === "TEXTAREA" && !el.dataset.dkField && el.id !== "dk-notes"))) return;
    const k = e.key.toLowerCase();
    if (k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (k === "y") { e.preventDefault(); redo(); }
  });

  const slides = doc.slides;
  const at = Math.min(cur, slides.length - 1);
  const slide = slides[at];

  /* o foco pedido por um Enter ou Backspace num tópico, depois de desenhar */
  useLayoutEffect(() => {
    const want = focusRef.current;
    if (want == null || !stageRef.current) return;
    focusRef.current = null;
    const el = stageRef.current.querySelector("[data-dk-item='" + want + "']");
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  });

  /* ---- o texto ---- */
  const edit = {
    onText: (field, value) => change((d) => updateSlide(d, at, { [field]: value }), { typing: slide.id + ":" + field }),
    onItems: (items, typing) => change((d) => updateSlide(d, at, { items }), typing ? { typing: slide.id + ":items" } : undefined),
    onBlur: () => { typingRef.current = null; },
    focusItem: (i) => { focusRef.current = i; }
  };

  /* ---- os slides ---- */
  const add = () => {
    if (slides.length >= DECK_SLIDES) { notify("a apresentação vai até " + DECK_SLIDES + " slides"); return; }
    if (change((d) => insertSlide(d, at + 1, blankSlide("bullets", newId())))) setCur(at + 1);
  };
  const duplicate = () => {
    if (slides.length >= DECK_SLIDES) { notify("a apresentação vai até " + DECK_SLIDES + " slides"); return; }
    if (change((d) => duplicateSlide(d, at, newId))) setCur(at + 1);
  };
  const move = (delta) => { if (change((d) => moveSlide(d, at, delta))) setCur(at + delta); };
  const drop = () => {
    if (slides.length <= 1) return;
    const before = docRef.current;
    if (change((d) => removeSlide(d, at))) {
      setCur(Math.max(0, at - 1));
      notify("slide apagado", undoTo(before, at));
    }
  };

  /* ---- o "mais": PDF, produto e apagar ---- */
  const exportPdf = () => {
    if (saveTimer.current) saveNow();
    /* depois de a caixa sumir: a impressão leva o que está desenhado */
    setTimeout(() => window.print(), 50);
  };
  const removeDeck = () => {
    if (saveTimer.current) saveNow();
    const before = decks.remove(id);
    if (!before) return;
    location.hash = "";
    notify("apresentação apagada", () => { decks.save(before); location.hash = before.id; });
  };

  const present = (from) => setShowing(from);
  const closeShow = (last) => {
    setShowing(null);
    if (last != null) setCur(last);
    requestAnimationFrame(() => playRef.current && playRef.current.focus());
  };

  return (
    <main className="page page--wide dk-editor">
      <div className="dk-bar">
        <a className="action" href="drawings.html#apresentações" title="voltar para os desenhos" aria-label="Voltar"><BackIcon /></a>
        <input className="dk-name" id="dk-name" maxLength="120" aria-label="Nome da apresentação" value={doc.name}
          onChange={(e) => { const v = e.currentTarget.value; change((d) => ({ ...d, name: v }), { history: false }); }}
          onBlur={() => { if (!doc.name.trim()) change((d) => ({ ...d, name: "apresentação sem nome" }), { history: false }); }} />
        <button className="pill pill--accent" type="button" id="dk-play" ref={playRef} title="apresentar em tela cheia" onClick={() => present(at)}><PlayIcon />apresentar</button>
        <button className="action" type="button" id="dk-more" title="mais" aria-label="Mais" onClick={() => setMenuOpen(true)}><MoreIcon /></button>
      </div>

      <div className="dk-work">
        <ol className="dk-strip" aria-label="slides">
          {slides.map((s, i) => (
            <li key={s.id}>
              <button type="button" className={"dk-thumb" + (i === at ? " is-on" : "")} aria-current={i === at ? "true" : undefined}
                aria-label={"slide " + (i + 1) + (s.title ? ": " + s.title : "")} onClick={() => setCur(i)}>
                <span className="dk-thumb__n t-mono" aria-hidden="true">{i + 1}</span>
                <Slide slide={s} />
              </button>
            </li>
          ))}
          {wide && (
            <li className="dk-strip__add">
              <button className="pill pill--mini" type="button" id="dk-add" disabled={slides.length >= DECK_SLIDES} onClick={add}>{icon("plus")}slide</button>
            </li>
          )}
        </ol>

        <div className="dk-main">
          {wide && (
            <div className="dk-tools">
              <div className="chips dk-layouts" role="radiogroup" aria-label="layout do slide">
                {SLIDE_LAYOUTS.map((l) => (
                  <label key={l.id} className={"chip dk-choice" + (slide.layout === l.id ? " is-on" : "")}>
                    <input type="radio" name="dk-layout" value={l.id} checked={slide.layout === l.id}
                      onChange={() => change((d) => setLayout(d, at, l.id))} />{l.label}
                  </label>
                ))}
              </div>
              <span className="dk-actions">
                <button className="action" type="button" id="dk-up" title="subir o slide" aria-label="Subir o slide" disabled={at === 0} onClick={() => move(-1)}>{icon("chevronUp")}</button>
                <button className="action" type="button" id="dk-down" title="descer o slide" aria-label="Descer o slide" disabled={at === slides.length - 1} onClick={() => move(1)}>{icon("chevronDown")}</button>
                <button className="action" type="button" id="dk-dup" title="duplicar o slide" aria-label="Duplicar o slide" onClick={duplicate}>{icon("copy")}</button>
                <button className="action" type="button" id="dk-drop" title={slides.length <= 1 ? "a apresentação precisa de um slide" : "apagar o slide"} aria-label="Apagar o slide" disabled={slides.length <= 1} onClick={drop}>{icon("trash")}</button>
              </span>
            </div>
          )}
          <div className="dk-stage" ref={stageRef}>
            <Slide key={slide.id} slide={slide} n={at + 1} edit={edit} />
          </div>
          <label className="field-label" htmlFor="dk-notes">notas do apresentador</label>
          <textarea className="input dk-notes" id="dk-notes" rows="3" maxLength="2000" placeholder="o que dizer neste slide (só você vê)"
            value={slide.notes} onChange={(e) => edit.onText("notes", e.currentTarget.value)} onBlur={edit.onBlur} />
          {wide && <p className="dk-keys t-mono">clique no texto para escrever · <kbd>Enter</kbd> num tópico abre o próximo · <kbd>Ctrl</kbd> <kbd>Z</kbd> desfaz · em tela cheia, <kbd>←</kbd> <kbd>→</kbd> ou espaço passam e <kbd>Esc</kbd> sai</p>}
        </div>
      </div>

      {/* a impressão: um slide por página, só leitura. fica escondida na tela */}
      <div className="dk-print" aria-hidden="true">
        {slides.map((s, i) => <Slide key={s.id} slide={s} n={i + 1} />)}
      </div>

      {showing !== null && <Show deck={doc} start={showing} onClose={closeShow} />}

      {menuOpen && (
        <Dialog title="mais" onClose={() => setMenuOpen(false)}>
          <div className="dk-menu">
            <button className="pill" type="button" id="dk-pdf" onClick={() => { setMenuOpen(false); exportPdf(); }}>exportar PDF</button>
            <ProductPick doc={doc} onPick={(app) => change((d) => ({ ...d, app }))} />
            <button className="pill" type="button" id="dk-delete" onClick={() => { setMenuOpen(false); removeDeck(); }}>{icon("trash")}apagar apresentação</button>
          </div>
        </Dialog>
      )}
    </main>
  );
}

/* ---------- a tela cheia ----------
   cobre a janela e pede a tela cheia do navegador quando ele deixa (o iPhone
   não deixa: a camada fixa basta). setas, espaço, PageUp/PageDown passam;
   Esc sai; tocar na metade da direita avança, na da esquerda volta. o slide
   atual é anunciado ("slide 3 de 8"), e ao sair o foco volta ao "apresentar" */
function Show({ deck, start, onClose }) {
  const total = deck.slides.length;
  const [i, setI] = useState(Math.min(start, total - 1));
  const iRef = useRef(i); iRef.current = i;
  const ref = useRef(null);
  const go = (n) => setI(Math.max(0, Math.min(total - 1, n)));
  const close = () => {
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    onClose(iRef.current);
  };

  useEffect(() => {
    const el = ref.current;
    el.focus({ preventScroll: true });
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    /* o Esc da tela cheia do navegador não chega como tecla: sair dela é sair */
    const f = () => { if (!document.fullscreenElement) onClose(iRef.current); };
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);

  useKeydown((e) => {
    const k = e.key;
    /* num botão da barra, Enter e espaço são o clique dele */
    if ((k === "Enter" || k === " ") && document.activeElement && document.activeElement.tagName === "BUTTON") return;
    if (k === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown" || k === " " || k === "Enter") { e.preventDefault(); go(iRef.current + 1); }
    else if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp" || k === "Backspace") { e.preventDefault(); go(iRef.current - 1); }
    else if (k === "Home") { e.preventDefault(); go(0); }
    else if (k === "End") { e.preventDefault(); go(total - 1); }
  });

  const slide = deck.slides[i];
  return (
    <div className="dk-show" ref={ref} tabIndex="-1" role="dialog" aria-modal="true" aria-label={"apresentação: " + deck.name}
         aria-roledescription="apresentação">
      <div className="dk-show__stage" onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        go(iRef.current + (e.clientX - r.left < r.width / 3 ? -1 : 1));
      }}>
        <Slide key={slide.id} slide={slide} />
      </div>
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">{"slide " + (i + 1) + " de " + total + (slide.title ? ": " + slide.title : "")}</p>
      <div className="dk-show__bar">
        <button className="action" type="button" title="slide anterior (←)" aria-label="Slide anterior" disabled={i === 0} onClick={() => go(i - 1)}>{icon("chevronLeft")}</button>
        <span className="dk-show__count t-mono" aria-hidden="true">{(i + 1) + "/" + total}</span>
        <button className="action" type="button" title="próximo slide (→)" aria-label="Próximo slide" disabled={i === total - 1} onClick={() => go(i + 1)}>{icon("chevronRight")}</button>
        <button className="action" type="button" title="sair (Esc)" aria-label="Sair da apresentação" onClick={close}>{icon("x")}</button>
      </div>
    </div>
  );
}

/* a que produto a apresentação pertence (VISAO, 9): aparece na lista de desenhos */
function ProductPick({ doc, onPick }) {
  const apps = useCollection("apps");
  const list = apps.all().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (!list.length && !doc.app) return null;
  return (
    <label className="dk-product">
      <span className="field-label">ligada ao produto</span>
      <select className="input" value={doc.app} onChange={(e) => onPick(e.currentTarget.value)}>
        <option value="">nenhum</option>
        {list.map((a) => <option key={a.id} value={a.id}>{a.name || "produto sem nome"}</option>)}
      </select>
    </label>
  );
}

mount(<Slides />, "app");
