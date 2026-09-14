/* merlin · ui: a camada de tela em React
 *
 * o core.js continua sendo o dono dos dados (colecoes, sessao, nuvem,
 * caixa de entrada). aqui mora so o que uma pagina precisa para DESENHAR: os
 * hooks que ligam a tela as colecoes, os componentes comuns e a casca (barra,
 * busca, tema, nuvem, entrar, aviso).
 *
 * por que uma camada e nao "tudo no core": o core e JavaScript puro, testavel
 * sem navegador e sem React. quem desenha e este arquivo — e e ele que se
 * registra no core com setShellRenderer, para que os dois nao se importem em
 * circulo.
 *
 * nao ha innerHTML aqui, com uma excecao anotada: o markdown das notas.
 */

import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import {
  collection, cloud, clients, listClients, clientName, md, brl, parseMoney,
  api, notify, sendToDay, formatMin, readDuration,
  PAGES, CLOUD_STATUS, search, signIn, currentNotice, onNotice, closeNotice,
  toggleSidebar, setShellRenderer, currentBrand, share, shareOf, unshare, shareUrl
} from "./core.js";
import { LOGO, GL_LOGO, GL_MARK, ICONS, NAV_ICONS, icon } from "./icons.jsx";

/* o CSS entra pela pagina, nao por aqui: base.css ja puxa o shell.css na
   ordem certa, e o dia carrega so o shell. */

export { Fragment, icon, ICONS };

/* ---------- montar a pagina ---------- */

/* desenha a raiz dentro de um elemento (ou do id dele). sem StrictMode de
   proposito: ele roda os efeitos duas vezes, e coisas como esvaziar a caixa
   de entrada ou gerar a recorrencia da semana nao sao para acontecer duas
   vezes numa montagem. */
export function mount(element, target) {
  const el = typeof target === "string" ? document.getElementById(target) : target;
  createRoot(el).render(element);
}

/* ---------- hooks que ligam a tela aos dados ---------- */

/* redesenha o componente quando a colecao muda (local, nuvem ou outra aba) */
function useSubscription(c) {
  const [, tick] = useState(0);
  useEffect(() => c.onChange(() => tick((n) => n + 1)), [c]);
}

/* a colecao do core, e a pagina redesenha a cada mudanca dela. devolve a
   propria colecao: all(), save(), remove()... */
export function useCollection(type, options) {
  const c = useMemo(() => collection(type, options), [type]);
  useSubscription(c);
  return c;
}

/* os clientes vivos, redesenhando quando mudam */
export function useClients() {
  const c = useMemo(() => clients(), []);
  useSubscription(c);
  return listClients();
}

/* a sessao/nuvem: signedIn, email, status. escuta os dois canais — a casca
   redesenha tanto quando a sessao muda quanto quando o indicador muda. */
export function useCloud() {
  const [, tick] = useState(0);
  useEffect(() => cloud.onStatus(() => tick((n) => n + 1)), []);
  return cloud;
}

/* troca o #hash sem empilhar historico e avisa quem usa useHash (o
   replaceState nao dispara hashchange sozinho) */
export function setHash(id) {
  const next = id ? "#" + encodeURIComponent(id) : "";
  if ((location.hash || "") === next) return;
  history.replaceState(null, "", location.pathname + location.search + next);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

/* o #hash da url, ja decodificado, acompanhando o hashchange. e assim que
   "clients.html#<id>" abre o item certo. */
export function useHash() {
  const read = () => { try { return decodeURIComponent(location.hash.slice(1)); } catch (e) { return ""; } };
  const [hash, setHashState] = useState(read);
  useEffect(() => {
    const f = () => setHashState(read());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return hash;
}

/* um atalho de teclado no documento. o handler mora num ref atualizado a cada
   render: o listener e um so e nunca le um closure velho — sem isso, a tecla
   apertada logo depois de fechar um dialogo ainda via o dialogo aberto. */
export function useKeydown(handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const f = (e) => ref.current(e);
    document.addEventListener("keydown", f);
    return () => document.removeEventListener("keydown", f);
  }, []);
}

/* true quando o foco esta num campo de texto: os atalhos de uma letra so
   valem fora dele */
export function isTyping() {
  const el = document.activeElement;
  const tag = el && el.tagName;
  /* checkbox, radio e botao nao sao "digitar": quem acabou de marcar um
     cartao ainda pode apertar n */
  if (tag === "INPUT") return !["checkbox", "radio", "button", "submit", "range", "file"].includes(el.type);
  return tag === "TEXTAREA" || tag === "SELECT" || !!(el && el.isContentEditable);
}

/* ---------- campos de formulario ----------
   useFields(initial) guarda os valores e devolve `bind(name)`, que espalha nos
   inputs o value/onChange certos. o formulario inteiro fica controlado: uma
   sincronizacao que chega no meio da digitacao nao apaga nada. */
export function useFields(initial) {
  const [values, setValues] = useState(initial);
  const set = useCallback((name, value) => setValues((v) => ({ ...v, [name]: value })), []);
  const bind = useCallback((name, kind) => {
    if (kind === "check") return { name, checked: !!values[name], onChange: (e) => set(name, e.currentTarget.checked) };
    return { name, value: values[name] == null ? "" : values[name], onChange: (e) => set(name, e.currentTarget.value) };
  }, [values, set]);
  return [values, bind, set, setValues];
}

/* ---------- componentes comuns ---------- */

/* aceita `class` alem de `className`: as paginas vieram do htm, onde o
   atributo se chamava class, e trocar tudo de uma vez so criaria bug bobo */
const cx = (p) => p.className || p.class || undefined;

/* markdown minimo do core. o unico lugar do sistema com innerHTML — o texto
   passa pelo md(), que escapa antes de formatar. */
export function Markdown({ text, tag = "div", class: _c, className: _cn, ...rest }) {
  return createElement(tag, {
    ...rest,
    className: _cn || _c || undefined,
    dangerouslySetInnerHTML: { __html: md(text) }
  });
}

/* o selo de cliente, so o nome */
export function ClientBadge({ id }) {
  const name = clientName(id);
  return name ? <span className="badge">{name}</span> : null;
}

/* as <option> de cliente para um <select> controlado: o `value` fica no
   select, aqui so a lista */
export function clientOptionList(empty) {
  const list = listClients().map((c) => <option key={c.id} value={c.id}>{c.name}</option>);
  return empty != null ? [<option key="" value="">{empty}</option>, ...list] : list;
}

/* Esc fecha o que estiver aberto por cima: registra em captura, para chegar
   antes dos atalhos da pagina, e antes da pintura, para valer ja na primeira
   tecla depois de abrir */
function useEscape(onClose) {
  useLayoutEffect(() => {
    const f = (e) => { if (e.key === "Escape") { e.stopPropagation(); if (onClose) onClose(); } };
    document.addEventListener("keydown", f, true);
    return () => document.removeEventListener("keydown", f, true);
  }, [onClose]);
}

/* o dialogo: escurece a tela, caixa no meio, fecha no x, no fundo e no Esc.
   `actions` e o rodape (botoes); o conteudo vai nos filhos. */
export function Dialog({ title, sub, wide, onClose, actions, label, children, ...rest }) {
  useEscape(onClose);
  return (
    <div className={"dialog" + (cx(rest) ? " " + cx(rest) : "")} role="dialog" aria-modal="true" aria-label={label || title}
         onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className={"dialog__box" + (wide ? " dialog__box--wide" : "")}>
        <button className="dialog__close" type="button" aria-label="Fechar" onClick={onClose}>{icon("x")}</button>
        {title && <p className="dialog__title">{title}</p>}
        {sub && <p className="dialog__sub">{sub}</p>}
        {children}
        {actions && <div className="dialog__actions">{actions}</div>}
      </div>
    </div>
  );
}

/* o formulario em dialogo: todo "criar X" e "editar X" passa por aqui. os
   campos vem nos filhos (use <Field> e useFields); `onSubmit()` devolvendo
   false mantem a caixa aberta. o primeiro campo ganha foco ao abrir. */
export function Form({ title, sub, wide, submit, remove, aside, onSubmit, onRemove, onClose, children }) {
  const ref = useRef(null);
  /* foco antes da pintura: a primeira tecla ja entra no campo certo */
  useLayoutEffect(() => {
    const first = ref.current && ref.current.querySelector("input:not([type=hidden]):not([type=checkbox]),select,textarea");
    if (first) { first.focus(); if (first.select && first.type !== "date") first.select(); }
  }, []);
  useEscape(onClose);
  const handleSubmit = (e) => {
    e.preventDefault();
    const r = onSubmit ? onSubmit(e.currentTarget) : undefined;
    if (r !== false && onClose) onClose();
  };
  return (
    <div className="dialog dialog--form" role="dialog" aria-modal="true" aria-label={title}
         onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <form ref={ref} className={"dialog__box" + (wide ? " dialog__box--wide" : "")} autoComplete="off" onSubmit={handleSubmit}>
        <button className="dialog__close" type="button" aria-label="Fechar" onClick={onClose}>{icon("x")}</button>
        <p className="dialog__title">{title}</p>
        {sub && <p className="dialog__sub">{sub}</p>}
        <div className="form-grid">{children}</div>
        <div className="dialog__actions">
          {(remove || aside) && <>
            {remove && <button className="link" type="button" onClick={() => { if (onClose) onClose(); if (onRemove) onRemove(); }}>{remove}</button>}
            {aside}
            <span className="spacer" />
          </>}
          <button className="pill" type="button" onClick={onClose}>cancelar</button>
          <button className="pill pill--green" type="submit">{submit || "salvar"}</button>
        </div>
      </form>
    </div>
  );
}

/* um campo com rotulo dentro do formulario. `full` ocupa a linha toda. */
export function Field({ label, full, children }) {
  return <div className={full ? "full" : undefined}><label className="field-label">{label}</label>{children}</div>;
}

/* o escolhedor de modelo: a lista inteira, agrupada, dentro do formulario.
   era um <select> com <optgroup> e o popup nativo abria branco por cima da
   tela; com dezenas de modelos, cobria a tela toda. `groups` vem de
   funnelGroups()/mapGroups(); `empty` e a primeira linha, a do em branco. */
export function TemplatePicker({ groups, empty, value, onChange, id }) {
  const ref = useRef(null);
  /* uma parada de tabulacao so — a do escolhido — e as setas andando dentro
     da lista: sem isso o Tab passaria por dezenas de modelos ate o proximo
     campo, que era justamente o que o <select> resolvia de graca */
  const walk = (e) => {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const all = Array.from(ref.current.querySelectorAll(".picker__item"));
    const next = all[Math.min(all.length - 1, Math.max(0, all.indexOf(e.target) + step))];
    if (next) next.focus();
  };
  const item = (key, label, on) => (
    <button key={key || "-"} type="button" className={"picker__item" + (on ? " is-on" : "")}
            aria-pressed={on} tabIndex={on ? 0 : -1} onClick={() => onChange(key)}>{label}</button>
  );
  return (
    <div className="picker" id={id} ref={ref} onKeyDown={walk}>
      {item("", empty, !value)}
      {groups.map((g) => (
        <Fragment key={g.key}>
          <p className="picker__group t-mono">{g.label}</p>
          {g.items.map((t) => item(t.id, t.name, value === t.id))}
        </Fragment>
      ))}
    </div>
  );
}

/* ---------- a tela de escolher por onde começar ----------
   o mesmo gesto em mapas, funis, clientes, hábitos e financeiro: em vez de
   uma frase dizendo "nada aqui, crie o primeiro", a tela OFERECE — modelos de
   mapa e de funil, tipos de negócio, hábitos sugeridos, o esqueleto de um mês.

   o desenho é o de uma página de ajustes: uma fileira por grupo, com o que o
   grupo é na coluna da esquerda e as opções dele na da direita, separadas por
   uma linha. a prateleira densa de antes (uma linha de texto por modelo)
   deixava trinta e nove modelos legíveis, mas todos com a mesma cara — aqui
   cada um tem a miniatura da própria forma, e o grupo diz para que serve.

   `groups` é [{ key, label, note?, items: [{ id, name, summary, line }] }].
   `onPick` recebe o item inteiro: quem oferece é quem sabe construir.
   `thumb(item)` desenha a miniatura; sem ela, a opção é um cartão de texto.
   `blankRow` põe "começar do zero" como a primeira opção, com um "+" no lugar
   da miniatura; sem ele, o `onBlank` continua sendo o link do rodapé — é o
   caso dos hábitos, onde ele não é um modelo, é "criar os escolhidos". */
export function EmptyStart({ title, text, groups, note, onPick, onBlank, blankLabel, blankNote, blankRow, picked, thumb }) {
  const option = (key, it, isOn, art, onClick) => (
    <button key={key} type="button" className={"opt" + (art ? "" : " opt--text") + (isOn ? " is-on" : "")}
            aria-pressed={picked ? String(isOn) : undefined} title={it.hint || it.summary || it.name} onClick={onClick}>
      {art && (
        <span className={"opt__thumb" + (key === "" ? " opt__thumb--blank" : "")}>
          {art}
          {isOn && <span className="opt__check" aria-hidden="true">{icon("check")}</span>}
        </span>
      )}
      <b className="opt__name">{it.name}</b>
      {it.summary && <span className="opt__sum">{it.summary}</span>}
      {it.line && <span className="opt__line t-mono">{it.line}</span>}
      {!art && isOn && <span className="opt__check" aria-hidden="true">{icon("check")}</span>}
    </button>
  );
  return (
    <section className="start">
      {title && <h2 className="start__title">{title}</h2>}
      {text && <p className="start__text">{text}</p>}
      <div className="start__rows">
        {blankRow && onBlank && (
          <div className="start__row">
            <div className="start__head">
              <b>do zero</b>
              <p>sem modelo nenhum</p>
            </div>
            <div className="start__grid">
              {option("", { name: blankLabel || "em branco", summary: blankNote }, false, icon("plus"), onBlank)}
            </div>
          </div>
        )}
        {groups.map((g) => (
          <div className="start__row" key={g.key}>
            <div className="start__head">
              <b>{g.label}</b>
              {g.note && <p>{g.note}</p>}
              <span className="t-mono">{g.items.length + (g.items.length === 1 ? " opção" : " opções")}</span>
            </div>
            <div className="start__grid">
              {g.items.map((it) => option(it.id, it, !!(picked && picked(it)), thumb ? thumb(it) : null, () => onPick(it)))}
            </div>
          </div>
        ))}
      </div>
      {!blankRow && (note || onBlank) && (
        <p className="start__foot">
          {note}
          {onBlank && (
            <>
              {note ? " " : null}
              <button className="link" type="button" onClick={onBlank}>{blankLabel || "começar do zero"}</button>
            </>
          )}
        </p>
      )}
    </section>
  );
}

/* as miniaturas dos modelos. são SVG à mão e herdam a tinta (currentColor),
   por isso funcionam nos dois temas e nas duas marcas sem cor escrita. o
   número no canto é o tamanho — a silhueta de um funil de cinco etapas e a de
   um de nove são quase a mesma. */
const BAR = 6.4, GAP = 1.6;
export function FunnelThumb({ shape, size }) {
  const h = shape.length * BAR + (shape.length - 1) * GAP;
  const top = (56 - h) / 2;
  return (
    <svg viewBox="0 0 100 56" aria-hidden="true" className="th th--funnel">
      {shape.map((s, i) => <rect key={i} x={(100 - s.pct) / 2} y={top + i * (BAR + GAP)} width={s.pct} height={BAR} rx="1.6" />)}
      <text x="96" y="52" className="th__n">{size}</text>
    </svg>
  );
}
export function MapThumb({ shape, size }) {
  const step = 52 / Math.max(1, shape.length);
  return (
    <svg viewBox="0 0 100 56" aria-hidden="true" className="th th--map">
      <circle cx="10" cy="28" r="3.6" className="th__root" />
      {shape.map((b, i) => {
        const y = 2 + step * i + step / 2;
        return (
          <g key={i}>
            <path d={"M14 28 C 26 28, 26 " + y + ", 38 " + y} />
            <circle cx="40" cy={y} r="2.4" />
            {Array.from({ length: Math.min(b.kids, 5) }, (_, k) => <circle key={k} cx={50 + k * 8.5} cy={y} r="1.4" className="th__leaf" />)}
          </g>
        );
      })}
      <text x="97" y="52" className="th__n">{size}</text>
    </svg>
  );
}
/* o cliente não tem forma geométrica: o que ele tem é por onde vende */
export function ChannelThumb({ labels }) {
  return (
    <span className="th th--channels">
      {labels.slice(0, 4).map((l, i) => <i key={i}>{l}</i>)}
      {labels.length > 4 && <i>+{labels.length - 4}</i>}
    </span>
  );
}

/* ---------- compartilhar um mapa ou um funil ----------
   o link abre o PRÓPRIO desenho (share.html), sem nenhum gesto de edição. o
   endereço é um token; fechar o link apaga o token no servidor. */
export function ShareDialog({ type, id, name, onClose }) {
  const c = useCloud();
  const [state, setState] = useState({ loading: true });
  const [busy, setBusy] = useState(false);
  const what = type === "maps" ? "mapa" : "funil";

  useEffect(() => {
    if (!c.signedIn) { setState({ token: null }); return; }
    let alive = true;
    shareOf(type, id).then((sh) => { if (alive) setState({ token: sh ? sh.token : null }); });
    return () => { alive = false; };
  }, [type, id, c.signedIn]);

  const copy = (text, msg) => {
    if (!navigator.clipboard) { notify("não consegui copiar"); return; }
    navigator.clipboard.writeText(text).then(() => notify(msg)).catch(() => notify("não consegui copiar"));
  };
  const create = async () => {
    setBusy(true);
    try {
      const sh = await share(type, id);
      setState({ token: sh.token });
      /* copiar no mesmo gesto: ninguém cria um link para olhar para ele */
      copy(shareUrl(sh.token), "link criado e copiado");
    } catch (e) {
      notify(e.message || "não consegui criar o link");
    } finally { setBusy(false); }
  };
  const revoke = async () => {
    setBusy(true);
    const ok = await unshare(type, id);
    setBusy(false);
    if (!ok) { notify("não consegui fechar o link"); return; }
    setState({ token: null });
    notify("link fechado — quem tinha o endereço não entra mais");
  };

  const url = state.token ? shareUrl(state.token) : "";
  return (
    <Dialog title="compartilhar" sub={name} onClose={onClose}
      actions={<button className="pill" type="button" onClick={onClose}>fechar</button>}>
      {!c.signedIn ? (
        <p className="note">O link é o servidor lendo este {what}, e sem sessão ele nunca subiu
        para lugar nenhum. Entre com seu e-mail e o botão aparece aqui.</p>
      ) : state.loading ? (
        <p className="note">vendo se já existe um…</p>
      ) : url ? (
        <>
          <p className="note">Quem tiver este endereço vê o {what} do jeito que ele está desenhado,
          sem conta e sem poder mexer.</p>
          <div className="share__url">
            <input className="input" id="share-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <button className="pill pill--icon" type="button" title="copiar" aria-label="Copiar o link"
                    onClick={() => copy(url, "link copiado")}>{icon("link")}</button>
            <a className="pill pill--icon" href={url} target="_blank" rel="noreferrer" title="abrir" aria-label="Abrir o link">{icon("arrow")}</a>
          </div>
          <p className="note">Ele mostra a versão de agora: o que você mudar aqui aparece lá.
          Fechar o link corta o acesso na hora.</p>
          <div className="share__actions">
            <button className="pill" type="button" id="share-revoke" disabled={busy} onClick={revoke}>fechar o link</button>
          </div>
        </>
      ) : (
        <>
          <p className="note">Cria um endereço público que abre este {what} do jeito que ele está
          desenhado: sem conta, sem entrar e sem poder mexer. Dá para fechar depois.</p>
          <div className="share__actions">
            <button className="pill pill--green" type="button" id="share-create" disabled={busy} onClick={create}>
              {icon("link")}<span>{busy ? "criando…" : "criar o link"}</span>
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}

/* ---------- o campo de data ----------
   o <input type="date"> abria o calendário do navegador: branco ou cinza de
   sistema, com a fonte do sistema, "Limpar" e "Hoje" em azul, e cada navegador
   com um desenho diferente. era a única peça da tela que não era do Merlin.

   aqui o campo continua aceitando digitar ("14/09", "14/9/26", "14092026") —
   quem sabe a data não quer clicar em mês nenhum — e o botão ao lado abre o
   calendário do próprio sistema. o valor que entra e sai é o mesmo do campo
   nativo, "aaaa-mm-dd" ou "", e o onChange recebe um evento com
   currentTarget.value: por isso ele entra no lugar do nativo sem mudar quem
   o usa, inclusive o bind() do useFields.

   o calendário mora num portal, com posição fixa: dentro de uma caixa de
   diálogo ele seria cortado pela rolagem da caixa. */
const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEK_INITIALS = ["D", "S", "T", "Q", "Q", "S", "S"];
const pad2 = (n) => String(n).padStart(2, "0");
const isoOf = (d) => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
const dateFromIso = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d, 12); };
const validIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && isoOf(dateFromIso(s)) === s;
const brOf = (s) => (validIso(s) ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "");

/* o que a pessoa digitou, virando data. sem ano, o ano de agora; ano de dois
   dígitos, deste século. o que não fecha numa data de verdade (31/02) não
   entra — o campo volta para o que era. */
export function readTypedDate(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  let d, m, y;
  const parts = raw.split(/[\/.\-\s]+/).filter(Boolean);
  if (parts.length === 1 && /^\d{6}(\d{2})?$/.test(parts[0])) {
    d = +parts[0].slice(0, 2); m = +parts[0].slice(2, 4); y = +parts[0].slice(4);
  } else if (parts.length >= 2 && parts.length <= 3 && parts.every((p) => /^\d+$/.test(p))) {
    [d, m, y] = parts.map(Number);
  } else return null;
  if (y == null || Number.isNaN(y)) y = new Date().getFullYear();
  if (y < 100) y += 2000;
  const iso = y + "-" + pad2(m) + "-" + pad2(d);
  return validIso(iso) ? iso : null;
}

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);

export function DateField({ value, onChange, required, id, name, className, title, placeholder, disabled }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(brOf(value));
  const wrapRef = useRef(null), inputRef = useRef(null), popRef = useRef(null);
  useEffect(() => { setText(brOf(value)); }, [value]);

  const emit = (v) => {
    if (!onChange) return;
    const target = { value: v, name };
    onChange({ target, currentTarget: target });
  };
  const commitText = () => {
    const iso = readTypedDate(text);
    if (iso === null || (iso === "" && required)) { setText(brOf(value)); return; }
    if (iso !== (value || "")) emit(iso);
    else setText(brOf(value));
  };
  const pick = (iso) => {
    emit(iso);
    setOpen(false);
    if (inputRef.current) inputRef.current.focus();
  };

  return (
    <span className={"datefield" + (className ? " " + className : "")} ref={wrapRef}>
      <input ref={inputRef} className="input datefield__input" id={id} name={name} inputMode="numeric" autoComplete="off"
             placeholder={placeholder || "dd/mm/aaaa"} title={title} required={required} disabled={disabled}
             value={text} onChange={(e) => setText(e.currentTarget.value)} onBlur={commitText}
             onKeyDown={(e) => {
               if (e.key === "Enter") { e.preventDefault(); commitText(); }
               else if (e.key === "ArrowDown" && e.altKey) { e.preventDefault(); setOpen(true); }
             }} />
      <button className="datefield__btn" type="button" tabIndex="-1" disabled={disabled}
              aria-label="Abrir o calendário" aria-expanded={String(open)}
              onClick={() => setOpen((o) => !o)}><CalendarIcon /></button>
      {open && <DatePopover anchor={wrapRef} popRef={popRef} value={validIso(value) ? value : ""} required={required}
                            onPick={pick} onClose={() => { setOpen(false); if (inputRef.current) inputRef.current.focus(); }} />}
    </span>
  );
}

function DatePopover({ anchor, popRef, value, required, onPick, onClose }) {
  const todayIso = isoOf(new Date());
  const [focus, setFocus] = useState(value || todayIso);
  const [pos, setPos] = useState(null);
  const month = focus.slice(0, 7);

  /* a posição: embaixo do campo, ou em cima se embaixo não couber */
  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.current.getBoundingClientRect();
      const h = popRef.current ? popRef.current.offsetHeight : 320;
      const w = popRef.current ? popRef.current.offsetWidth : 272;
      const below = r.bottom + 6 + h <= window.innerHeight - 8;
      setPos({
        left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)),
        top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - h)
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, []);

  /* fora dele, fecha. o Esc também — e ele é ouvido na janela, em captura,
     antes do Esc da caixa de diálogo: sem isso o Esc fecharia a caixa inteira
     junto com o calendário. */
  useEffect(() => {
    const down = (e) => {
      if (popRef.current && popRef.current.contains(e.target)) return;
      if (anchor.current && anchor.current.contains(e.target)) return;
      onClose();
    };
    const key = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); onClose(); } };
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointerdown", down, true); window.removeEventListener("keydown", key, true); };
  }, [onClose]);

  useEffect(() => {
    const b = popRef.current && popRef.current.querySelector('[data-iso="' + focus + '"]');
    if (b) b.focus();
  }, [focus]);

  const shiftMonth = (n) => {
    const d = dateFromIso(focus);
    const target = new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(d.getDate(), last));
    setFocus(isoOf(target));
  };
  const addDaysIso = (iso, n) => { const d = dateFromIso(iso); d.setDate(d.getDate() + n); return isoOf(d); };
  const onKey = (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) { e.preventDefault(); setFocus(addDaysIso(focus, step)); return; }
    if (e.key === "PageUp" || e.key === "PageDown") { e.preventDefault(); shiftMonth(e.key === "PageUp" ? -1 : 1); }
  };

  const first = dateFromIso(month + "-01");
  const start = new Date(first); start.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return isoOf(d); });
  /* seis semanas só quando o mês precisa: um calendário que muda de altura
     de um mês para o outro faz o "próximo" fugir do ponteiro */
  const rows = cells.slice(35).some((c) => c.slice(0, 7) === month) ? 6 : 5;

  return createPortal(
    <div className="datepop" ref={popRef} role="dialog" aria-label="Escolher data" onKeyDown={onKey}
         style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" }}>
      <div className="datepop__head">
        <b>{MONTH_NAMES[first.getMonth()] + " de " + first.getFullYear()}</b>
        <button className="action" type="button" aria-label="Mês anterior" onClick={() => shiftMonth(-1)}>{icon("chevronLeft")}</button>
        <button className="action" type="button" aria-label="Próximo mês" onClick={() => shiftMonth(1)}>{icon("chevronRight")}</button>
      </div>
      <div className="datepop__grid" role="grid">
        {WEEK_INITIALS.map((w, i) => <span key={i} className="datepop__wd" aria-hidden="true">{w}</span>)}
        {cells.slice(0, rows * 7).map((iso) => (
          <button key={iso} type="button" data-iso={iso} tabIndex={iso === focus ? 0 : -1}
                  className={"datepop__day" + (iso.slice(0, 7) !== month ? " is-out" : "") + (iso === todayIso ? " is-today" : "") + (iso === value ? " is-on" : "")}
                  aria-pressed={String(iso === value)} aria-label={brOf(iso)}
                  onClick={() => onPick(iso)}>{+iso.slice(8)}</button>
        ))}
      </div>
      <div className="datepop__foot">
        {!required && <button className="link" type="button" onClick={() => onPick("")}>limpar</button>}
        <span className="spacer" />
        <button className="pill pill--mini" type="button" onClick={() => onPick(todayIso)}>hoje</button>
      </div>
    </div>,
    document.body
  );
}

/* ---------- a duração de uma coisa ----------
   clicar no número e escrever "1h30" era um gesto que só o dia tinha, e o
   cartão da semana mostrava a duração como texto morto — para mudá-la era
   preciso abrir a caixa de editar o cartão inteiro. o mesmo objeto tinha dois
   comportamentos dependendo da tela em que estivesse.

   a gramática é a estrita do core (readDuration), a mesma que o dia usa: ela
   prefere não entender a entender errado. Enter grava, Esc desiste, e sair do
   campo grava — porque quem clicou fora já disse o que queria. */
export function DurationField({ min, onChange, label, placeholder, class: _c, className }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const ref = useRef(null);
  const closed = useRef(false);
  useLayoutEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select(); } }, [editing]);
  const open = () => { setText(min ? formatMin(min) : ""); closed.current = false; setEditing(true); };
  const finish = (apply) => {
    if (closed.current) return;
    closed.current = true;
    setEditing(false);
    if (!apply) return;
    const next = readDuration(" " + text.trim() + " ").min;
    if (next && next !== min) onChange(next);
  };
  if (editing) {
    return (
      <input ref={ref} className={"duration-input" + (className || _c ? " " + (className || _c) : "")}
        value={text} placeholder="45m, 1h30" aria-label={label || "Duração"}
        onChange={(e) => setText(e.currentTarget.value)} onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); finish(true); }
          else if (e.key === "Escape") { e.preventDefault(); finish(false); }
        }} />
    );
  }
  return (
    <button className={"duration" + (min ? "" : " is-empty") + (className || _c ? " " + (className || _c) : "")}
            type="button" aria-label={(label || "Duração") + (min ? ": " + formatMin(min) + ". Alterar" : ". Definir")}
            onClick={(e) => { e.stopPropagation(); open(); }}>
      {icon("clock")}<span>{min ? formatMin(min) : (placeholder || "duração")}</span>
    </button>
  );
}

/* o numero grande com legenda (.meter do base.css) */
export function Meter({ label, value, ...rest }) {
  return <div className="meter"><span className={"num" + (cx(rest) ? " " + cx(rest) : "")}>{value}</span><span className="legend">{label}</span></div>;
}

/* dinheiro: o valor e em centavos, o texto e o que a pessoa digita. so
   reformata ao sair do campo, para "1.2" nao virar "R$ 1,20" no meio da
   digitacao. */
const moneyText = (cents) => (cents ? brl(cents).replace(/^R\$\s?/, "") : "");
export function MoneyInput({ value, onChange, class: _c, className, ...rest }) {
  const [text, setText] = useState(() => moneyText(value));
  const last = useRef(value);
  useEffect(() => { if (value !== last.current) { last.current = value; setText(moneyText(value)); } }, [value]);
  return (
    <input {...rest} className={"input input--num" + (className || _c ? " " + (className || _c) : "")} inputMode="decimal" value={text}
      onChange={(e) => { setText(e.currentTarget.value); const c = parseMoney(e.currentTarget.value); last.current = c; if (onChange) onChange(c); }}
      onBlur={() => setText(moneyText(last.current))} />
  );
}

/* "novo item" no pe de uma lista: um campo e um botao, Enter adiciona */
export function NewItemRow({ placeholder, button, onAdd, class: _c, className }) {
  const [text, setText] = useState("");
  const add = () => { const t = text.trim(); if (!t) return; onAdd(t); setText(""); };
  return (
    <div className={"form-row" + (className || _c ? " " + (className || _c) : "")}>
      <input className="input" placeholder={placeholder} value={text} onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
      <button className="pill pill--mini" type="button" onClick={add}>{button || "adicionar"}</button>
    </div>
  );
}

/* ---------- "da pra fazer com Claude?" ----------
   a mesma pergunta em dois lugares: a linha da fila do dia e o item de backlog
   do cliente. o merlin so responde — nao grava nada, nao muda a tarefa, nao
   mexe na duracao. o que ele disser que precisa ser montado vira trabalho num
   segundo gesto, e sempre sem duracao: minutos sao assunto do dia. */

/* a ultima linha da resposta e o que precisa ser montado, quando o veredicto e
   de que da. tiramos ela do corpo para virar botao; sem a linha nao ha botao,
   porque nao havera trabalho a criar. */
const SETUP_LINE = /^[ \t]*Montar:[ \t]*(.*?)[ \t]*$/m;

export function useDelegate() {
  const [busy, setBusy] = useState("");
  const [answer, setAnswer] = useState(null);

  /* demanda: {id, title, min?, due?, client?, about?, where, origin} — client e
     id, e vira nome antes de subir: o merlin le "lojax", nao um uuid. */
  const ask = async (demand) => {
    /* uma pergunta por vez: `busy` e o id de quem esta no ar, e e ele que
       apaga o botao das outras linhas enquanto isso */
    if (busy) return;
    setBusy(demand.id || "?");
    try {
      const r = await api("/merlin", {
        method: "POST",
        body: JSON.stringify({
          task: "delegate",
          context: {
            title: demand.title || "",
            min: demand.min || 0,
            due: demand.due || "",
            where: demand.where || "",
            client: demand.client ? clientName(demand.client) : "",
            about: demand.about || ""
          }
        })
      });
      if (r.ok) {
        const text = String((r.body && r.body.text) || "");
        const line = SETUP_LINE.exec(text);
        setAnswer({
          title: demand.title || "",
          text: (line ? text.replace(line[0], "") : text).trim(),
          setup: line ? line[1].slice(0, 160) : "",
          client: demand.client || "",
          origin: demand.origin || null
        });
      } else if (r.status === 401) notify("entre para usar o Merlin");
      else notify((r.body && r.body.error) || "o Merlin não respondeu — tenta de novo daqui a pouco");
    } catch (e) {
      notify("não consegui falar com o Merlin");
    } finally { setBusy(""); }
  };

  return { ask, busy, answer, close: () => setAnswer(null) };
}

/* o veredicto. o botao verde so existe quando ha o que montar, e ele nao cria
   tarefa direto: manda para a caixa de entrada sem duracao, que e onde o dia
   pergunta quantos minutos aquilo custa.
   `onBuild` existe porque a propria tela do dia nao pode usar a caixa de
   entrada: o evento de storage nao volta para a aba que escreveu, e o bilhete
   so seria recolhido no proximo carregamento. La o gesto certo e outro — o
   campo do dia, que ja pergunta a duracao. */
export function DelegateDialog({ answer, onClose, onBuild }) {
  const build = () => {
    if (onBuild) onBuild(answer.setup);
    else sendToDay({ title: answer.setup, client: answer.client, origin: answer.origin });
    onClose();
  };
  return (
    <Dialog title={"“" + answer.title + "”"} wide label="O que o Claude faz desta demanda" onClose={onClose}
        sub="o Merlin leu esta demanda e diz se dá para fazer com o Claude, com o quê, e o que continua sendo seu. ele só responde — nada aqui muda a tarefa nem a duração."
        actions={<>
          <button className="pill" type="button" onClick={onClose}>fechar</button>
          {!!answer.setup && <button className="pill pill--green" type="button" id="build-btn" onClick={build}>montar no dia</button>}
        </>}>
      <Markdown className="merlin-body" text={answer.text} />
      {!!answer.setup && <p className="delegate__setup"><span className="t-mono">montar</span>{answer.setup}</p>}
    </Dialog>
  );
}

/* =====================================================================
   a casca: sidebar, busca global, tema, nuvem, entrar e o aviso.
   e a mesma em toda pagina, e o core so guarda o estado dela. quem monta e o
   initPage(id) do core, que chama o desenhista registrado no fim do arquivo.
   ===================================================================== */

/* a gaveta do celular e o recolhido do desktop moram numa classe do <html>,
   porque o CSS inteiro depende delas; aqui so as ligamos ao estado. */
function useRootClass(name, on) {
  useLayoutEffect(() => { document.documentElement.classList.toggle(name, !!on); }, [name, on]);
}

/* ---------- busca global ---------- */
function SearchBox({ onNavigate }) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(-1);
  const ref = useRef(null);
  const hits = term.trim() ? search(term) : [];

  /* Ctrl+K de qualquer lugar */
  useKeydown((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      ref.current.focus(); ref.current.select();
      setOpen(true);
    }
  });
  useEffect(() => {
    const f = (e) => { if (!e.target.closest(".sb__search")) setOpen(false); };
    document.addEventListener("click", f);
    return () => document.removeEventListener("click", f);
  }, []);

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!hits.length) return;
      setFocus((i) => (i + (e.key === "ArrowDown" ? 1 : hits.length - 1) + (i < 0 ? 1 : 0)) % hits.length);
    } else if (e.key === "Enter") {
      const hit = hits[focus >= 0 ? focus : 0];
      if (hit) { if (onNavigate) onNavigate(); location.href = hit.href; }
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setTerm(""); setOpen(false); ref.current.blur();
    }
  };

  return (
    <div className="sb__search">
      <label className="sb__search-field">
        {NAV_ICONS.search}
        <input ref={ref} id="sb-search" type="search" placeholder="buscar…" autoComplete="off" aria-label="Buscar em tudo"
               value={term} onChange={(e) => { setTerm(e.currentTarget.value); setOpen(true); setFocus(-1); }}
               onFocus={() => { if (term.trim()) setOpen(true); }} onKeyDown={onKeyDown} />
        <kbd>ctrl k</kbd>
      </label>
      {open && term.trim() && (
        <div className="sb__results" id="sb-results">
          {hits.length
            ? hits.map((hit, i) => (
                <a key={hit.href + i} href={hit.href} className={i === focus ? "is-focus" : undefined} onClick={onNavigate}>
                  <span className="t-mono">{hit.label}</span><span>{hit.text}</span>
                </a>))
            : <p>nada com esse nome</p>}
        </div>
      )}
    </div>
  );
}

/* ---------- o cartao da nuvem e quem esta aqui ---------- */
function CloudCard({ page }) {
  const c = useCloud();
  const info = CLOUD_STATUS[c.status] || CLOUD_STATUS.local;
  const email = c.signedIn ? String(c.email || "") : "";
  return (
    <>
      <div className="sb__card">
        <div className="cloud" id="cloud" data-status={c.status}><i className="dot" /><span id="cloud-status">{info.line}</span></div>
        <p id="cloud-text">{info.text}</p>
        {info.action && (
          <button className="pill pill--green" type="button" id="cloud-action"
                  onClick={() => (c.status === "error" ? c.syncAll() : signIn.show())}>{info.action}</button>
        )}
      </div>
      <div className="sb__who">
        {/* quem está aqui É a porta do perfil: o cartão já mostrava o rosto e o
            endereço, e uma linha "perfil" logo acima dele dizia a mesma coisa
            duas vezes. */}
        <a className="sb__me" href="profile.html" title="perfil" aria-current={page === "profile" ? "page" : undefined}>
          <span className={"avatar" + (email ? "" : " is-out")} id="sb-avatar">{email ? email[0].toUpperCase() : "?"}</span>
          <span className="who"><b id="sb-name">{email ? email.split("@")[0] : "só você"}</b><span id="sb-email">{email || "sem sessão"}</span></span>
        </a>
        {c.signedIn && <button type="button" id="cloud-signout" onClick={() => c.signOut()}>sair</button>}
      </div>
    </>
  );
}

/* ---------- a caixa de entrar ----------
   um passo de e-mail e um de codigo. quem faz as chamadas e o core; aqui so o
   recado que ele devolve. */
function SignInDialog() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("email");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const emailRef = useRef(null), codeRef = useRef(null);
  useLayoutEffect(() => { if (emailRef.current) emailRef.current.focus(); }, []);
  useEffect(() => { if (step === "code" && codeRef.current) codeRef.current.focus(); }, [step]);
  useEscape(() => signIn.hide());

  const sendCode = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMessage("mandando…");
    const r = await signIn.requestCode(email);
    setBusy(false); setMessage(r.message);
    if (r.ok) { setEmail(r.email); setCode(""); setStep("code"); }
  };
  const enter = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMessage("conferindo…");
    const r = await signIn.submitCode(email, code);
    setBusy(false);
    if (!r.ok) setMessage(r.message);
  };
  /* voltar para o e-mail. sem isto, digitar o endereço errado era um beco sem
     saída: o servidor responde igual para quem pode e para quem não pode
     entrar (é o que impede descobrir quem tem conta testando endereços), então
     o código que nunca vem parece um código atrasado. o endereço fica no campo
     para ser corrigido, não apagado — quase sempre o erro é uma letra. */
  const changeEmail = () => { setStep("email"); setCode(""); setMessage(""); };

  return (
    <div className="dialog" id="signin" role="dialog" aria-modal="true" aria-label="Entrar"
         onClick={(e) => { if (e.target === e.currentTarget) signIn.hide(); }}>
      <div className="dialog__box">
        <button className="dialog__close" type="button" id="signin-close" aria-label="Fechar" onClick={() => signIn.hide()}>{icon("x")}</button>
        <p className="dialog__title">levar o merlin para outros aparelhos</p>
        {step === "email" ? (
          <form id="form-email" autoComplete="on" onSubmit={sendCode}>
            <div id="signin-email">
              <p className="dialog__sub">sem senha: mando um código de seis dígitos.</p>
              <input ref={emailRef} className="signin-input" id="email-input" type="email" inputMode="email" autoComplete="email"
                     placeholder="seu@email.com" aria-label="Seu e-mail" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
              <button className="signin-button" type="submit" disabled={busy}>mandar código</button>
            </div>
          </form>
        ) : (
          <form id="form-code" autoComplete="off" onSubmit={enter}>
            <div id="signin-code-step">
              <input ref={codeRef} className="signin-input signin-code" id="code-input" inputMode="numeric" autoComplete="one-time-code"
                     maxLength="6" placeholder="000000" aria-label="Código de seis dígitos" value={code} onChange={(e) => setCode(e.currentTarget.value)} />
              <button className="signin-button" type="submit" disabled={busy}>entrar</button>
            </div>
          </form>
        )}
        <p className="signin-message" id="signin-message" role="status" aria-live="polite">{message}</p>
        {step === "code" && (
          <button className="signin-back" type="button" onClick={changeEmail}>usar outro e-mail</button>
        )}
      </div>
    </div>
  );
}

/* ---------- o aviso com desfazer ---------- */
function Notice() {
  const [notice, setNotice] = useState(currentNotice);
  useEffect(() => onNotice(setNotice), []);
  if (!notice) return null;
  return (
    <div className="notice" role="status">
      <span>{notice.text}</span>
      {notice.undo && <button type="button" onClick={() => { const f = notice.undo; closeNotice(); f(); }}>desfazer</button>}
    </div>
  );
}

/* ---------- a casca inteira ---------- */
function Shell({ page }) {
  const [drawer, setDrawer] = useState(false);
  const [, setClosed] = useState(() => document.documentElement.classList.contains("sidebar-closed"));
  const [signInOpen, setSignInOpen] = useState(signIn.open);
  useEffect(() => signIn.onChange((s) => setSignInOpen(s.open)), []);
  useRootClass("sidebar-open", drawer);

  const fold = () => { toggleSidebar(); setClosed(document.documentElement.classList.contains("sidebar-closed")); };
  useKeydown((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") { e.preventDefault(); fold(); }
    if (e.key === "Escape") setDrawer(false);
  });

/* a marca na barra. o Merlin e o simbolo mais a palavra; a casa e o proprio
   logotipo da Guessless com "merlin" de sub-rotulo, que e o lockup que ela ja
   usa nos documentos ([GUESSLESS] docs). recolhida, o logotipo de 116px nao
   cabe: entra o isotipo, que existe exatamente para esse tamanho. os dois vao
   no DOM e o CSS escolhe — o mesmo jeito que a palavra "merlin" ja somia. */
function Brand() {
  if (currentBrand() !== "gl") {
    return <a className="sb__logo" href="index.html" aria-label="Merlin">{LOGO}<b>merlin</b></a>;
  }
  return (
    <a className="sb__logo sb__logo--gl" href="index.html" aria-label="Merlin, da Guessless">
      {GL_MARK}{GL_LOGO}<span className="sb__sub">merlin</span>
    </a>
  );
}

  return (
    <>
      <div className="sb__mobile">
        <button type="button" id="sb-open" aria-label="Abrir a navegação" onClick={() => setDrawer((d) => !d)}>{NAV_ICONS.menu}</button>
        <Brand />
      </div>
      <div className="sb__scrim" onClick={() => setDrawer(false)} />
      <aside className="sb" aria-label="Navegação">
        <div className="sb__top">
          <Brand />
          <button className="sb__fold" type="button" id="sb-fold" title="Recolher (Ctrl+B)" aria-label="Recolher a barra" onClick={fold}>{NAV_ICONS.fold}</button>
        </div>
        <SearchBox onNavigate={() => setDrawer(false)} />
        <ul className="sb__list">
          {PAGES.map((p) => (
            <li key={p.id}>
              <a className="sb__item" href={p.href} title={p.label} aria-current={p.id === page ? "page" : undefined}>
                {NAV_ICONS[p.id] || null}<span>{p.label}</span>
              </a>
            </li>
          ))}
        </ul>
        {/* aqui havia uma segunda lista, com "merlin" e "perfil". as duas
            saíram: o perfil virou o próprio cartão de quem está aqui, e o
            merlin não é uma página — é o que ele faz NESTA, e por isso mora
            junto do que ele lê. */}
        <div className="sb__spacer" />
        <CloudCard page={page} />
      </aside>
      {signInOpen && <SignInDialog />}
      <Notice />
    </>
  );
}

/* o core chama isto no initPage: a casca mora num no proprio, antes do
   conteudo, e o resto da pagina desenha no #app como sempre. */
setShellRenderer((page) => {
  const host = document.createElement("div");
  host.className = "shell";
  document.body.prepend(host);
  createRoot(host).render(<Shell page={page} />);
});
