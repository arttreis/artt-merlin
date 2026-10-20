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
  api, notify, sendToDay, formatMin, readDuration, parseDuration, newId, newNote, today,
  SECTIONS, sectionOf, CLOUD_STATUS, search, signIn, currentNotice, onNotice, closeNotice,
  toggleSidebar, setShellRenderer, share, shareOf, unshare, shareUrl,
  currentTheme, toggleTheme, askMerlin, onboardingBlocked
} from "./core.js";
import { LOGO, ICONS, NAV_ICONS, icon } from "./icons.jsx";
/* o ProposalDialog mora aqui, e nao na tela do assistente, porque ele e um
   Form como qualquer outro do sistema — e porque qualquer tela que um dia
   receba uma proposta usa o mesmo. */
import { ACTION_COLLECTIONS, ACTION_LABELS, ACTION_FIELDS, ACTION_DONE, buildDoc, previewOf } from "./assistant-actions.js";
import { normalize as normalizeFinance, contextOf as financeContext, undoEntry, bookCollection, cashLine } from "./finance-data.js";
import { normalize as normalizeHabit, SCHEDULES, COLORS, WEEKDAY_NAMES, habitStatus, undoHabit, markWhen } from "./habits-data.js";
import { normalize as normalizeSleep } from "./sleep-data.js";
import { normalize as normalizeWorkout, logWorkout, applyWorkout } from "./workouts-data.js";
import { normalize as normalizeMeal } from "./meals-data.js";
import { normalize as normalizeOp } from "./ops-data.js";
/* o Ctrl+K cria tarefa de hoje com a mesma regra e a mesma forma do dia */
import { tasks, newTask, topOrder, routeLine } from "./tasks.js";
import { BUILD, buildIntent } from "./build-intent.js";
import { createHat } from "./hat.js";

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
export function Form({ title, sub, wide, submit, remove, removeIcon, aside, onSubmit, onRemove, onClose, children }) {
  const ref = useRef(null);
  /* foco antes da pintura: a primeira tecla ja entra no campo certo. sem rolar
     a pagina: a caixa e fixa e rola por dentro, entao o foco nao tem nada a
     trazer a vista, e a pagina de tras (o balao do inicio) fica onde estava */
  useLayoutEffect(() => {
    const first = ref.current && ref.current.querySelector("input:not([type=hidden]):not([type=checkbox]),select,textarea");
    if (first) { first.focus({ preventScroll: true }); if (first.select && first.type !== "date") first.select(); }
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
            {remove && <button className="dialog__remove" type="button" aria-label={remove} title={remove}
                               onClick={() => { if (onClose) onClose(); if (onRemove) onRemove(); }}>{icon(removeIcon || "trash")}</button>}
            {aside}
            <span className="spacer" />
          </>}
          <button className="pill" type="button" onClick={onClose}>cancelar</button>
          <button className="pill pill--accent" type="submit">{submit || "salvar"}</button>
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
              <button className="action" type="button" title={blankLabel || "começar do zero"} aria-label={blankLabel || "começar do zero"} onClick={onBlank}>{icon("plus")}</button>
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

/* ---------- o Merlin em pessoa ----------
   o chapéu de shared/hat.js. o desenho é imperativo por dentro e o React
   nunca toca nos filhos do svg: daqui só vão o humor e para onde olhar. o
   chapéu não fala, então para o leitor de tela ele é enfeite; o que o
   Merlin está fazendo continua escrito na tela. */
export function Hat({ mood = "idle", look = null, tight = false, className = "" }) {
  const ref = useRef(null);
  const hat = useRef(null);
  useEffect(() => {
    hat.current = createHat(ref.current, { mood, tight });
    return () => hat.current.destroy();
  }, [tight]);
  useEffect(() => { hat.current.set(mood); }, [mood]);
  const [lx, ly] = look || [];
  useEffect(() => { hat.current.look(look ? lx : null, ly); }, [lx, ly]);
  return <svg ref={ref} className={"hat" + (className ? " " + className : "")} aria-hidden="true" focusable="false" />;
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
            <button className="pill pill--accent" type="button" id="share-create" disabled={busy} onClick={create}>
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

/* a caixinha que abre presa a um campo (calendário, dia do mês): a posição
   embaixo dele, ou em cima se embaixo não couber; fora dela ou no Esc, fecha.
   o Esc é ouvido na janela, em captura, antes do Esc da caixa de diálogo: sem
   isso o Esc fecharia a caixa inteira junto com o calendário. */
function usePopover(anchor, popRef, onClose) {
  const [pos, setPos] = useState(null);
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
  return pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" };
}

function DatePopover({ anchor, popRef, value, required, onPick, onClose }) {
  const todayIso = isoOf(new Date());
  const [focus, setFocus] = useState(value || todayIso);
  const style = usePopover(anchor, popRef, onClose);
  const month = focus.slice(0, 7);

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
         style={style}>
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
        {!required && <button className="action" type="button" title="limpar" aria-label="Limpar a data" onClick={() => onPick("")}>{icon("x")}</button>}
        <span className="spacer" />
        <button className="pill pill--mini" type="button" onClick={() => onPick(todayIso)}>hoje</button>
      </div>
    </div>,
    document.body
  );
}

/* ---------- o dia do mês ----------
   o fixo e a dívida caem "todo dia 7". era um <input type=number> com as
   setinhas do navegador; aqui é a mesma caixinha do calendário, só com os 31
   números. `onChange` recebe o evento no formato do bind() do useFields, com o
   valor em número (ou "" quando limpo). */
export function DayOfMonthField({ value, onChange, name, required, id }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null), popRef = useRef(null), btnRef = useRef(null);
  const day = +value >= 1 && +value <= 31 ? +value : 0;
  const pick = (d) => {
    setOpen(false);
    if (onChange) { const target = { value: d, name }; onChange({ target, currentTarget: target }); }
    if (btnRef.current) btnRef.current.focus();
  };
  const onKey = (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step || !popRef.current) return;
    e.preventDefault();
    const cur = +(document.activeElement && document.activeElement.dataset.day) || day || 1;
    const next = popRef.current.querySelector('[data-day="' + Math.min(31, Math.max(1, cur + step)) + '"]');
    if (next) next.focus();
  };
  useEffect(() => {
    if (!open || !popRef.current) return;
    const b = popRef.current.querySelector('[data-day="' + (day || 1) + '"]');
    if (b) b.focus();
  }, [open]);
  return (
    <span className="datefield" ref={wrapRef}>
      <button ref={btnRef} id={id} type="button" className={"input domfield" + (day ? "" : " is-empty")}
              aria-haspopup="dialog" aria-expanded={String(open)} onClick={() => setOpen((o) => !o)}>
        <span>{day ? "todo dia " + day : "escolher o dia"}</span><CalendarIcon />
      </button>
      {open && createPortal(
        <DomPopover anchor={wrapRef} popRef={popRef} day={day} required={required} onKey={onKey}
                    onPick={pick} onClose={() => setOpen(false)} />,
        document.body
      )}
    </span>
  );
}

function DomPopover({ anchor, popRef, day, required, onKey, onPick, onClose }) {
  const style = usePopover(anchor, popRef, onClose);
  return (
    <div className="datepop dompop" ref={popRef} role="dialog" aria-label="Escolher o dia do mês" onKeyDown={onKey} style={style}>
      <div className="datepop__grid">
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
          <button key={d} type="button" data-day={d} tabIndex={d === (day || 1) ? 0 : -1}
                  className={"datepop__day" + (d === day ? " is-on" : "")} aria-pressed={String(d === day)}
                  onClick={() => onPick(d)}>{d}</button>
        ))}
      </div>
      {(!required || day > 28) && (
        <div className="datepop__foot">
          {!required && <button className="action" type="button" title="limpar" aria-label="Limpar o dia" onClick={() => onPick("")}>{icon("x")}</button>}
          <span className="spacer" />
          {day > 28 && <span className="small weak">em mês mais curto, cai no último dia</span>}
        </div>
      )}
    </div>
  );
}

/* ---------- o período ----------
   "‹ set 2026 ›" com o "hoje" só quando se saiu do período atual. `onToday`
   sem `current` é o jeito de dizer que já se está nele. */
export function PeriodNav({ label, onPrev, onNext, onToday, current, prevLabel, nextLabel }) {
  return (
    <div className="period">
      <button className="action" type="button" aria-label={prevLabel || "Anterior"} title={prevLabel || "anterior"} onClick={onPrev}>{icon("chevronLeft")}</button>
      <span className="period__label">{label}</span>
      <button className="action" type="button" aria-label={nextLabel || "Próximo"} title={nextLabel || "próximo"} onClick={onNext}>{icon("chevronRight")}</button>
      {onToday && !current && <button className="pill pill--mini period__today" type="button" onClick={onToday}>hoje</button>}
    </div>
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
          {!!answer.setup && <button className="pill pill--accent" type="button" id="build-btn" onClick={build}>montar no dia</button>}
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

/* ---------- o assistente ----------
   a IA nunca grava sozinha: `assistant`/`/api/merlin` devolve no máximo uma
   proposta, e esta caixa é o único jeito dela virar documento — um Form
   comum, como qualquer criação manual, só que os campos já vêm preenchidos.
   confirmar chama collection.save() local-first, igual a criar à mão: some
   quando a rede volta, sincroniza sozinho, pode ser desfeito como qualquer
   outra gravação. exportado porque a tela do assistente (assistant.jsx) é
   quem monta este diálogo agora — o painel embutido na busca saiu.

   desde 17/10/2026 todo tipo que cria ou altera avisa com desfazer, e quem
   abriu a caixa fica sabendo pelo `onDone(linha)`: a pílula da conversa vira
   "✓ lançado · …" e não abre de novo. o desfazer chama `onDone(null)`, e a
   pílula volta. `chat` é o id da conversa, que vai na origem do lançamento. */
const CREATE_LABELS = { "onboarding-map": "gerar mapa", "onboarding-funnel": "gerar funil", "finance-entry": "lançar", "sleep-log": "registrar", "workout-log": "registrar", "meal-log": "anotar", "op-done": "marcar feito" };
const CREATE_HREF = { "onboarding-map": "maps.html#", "onboarding-funnel": "funnels.html#" };
/* o aviso é o texto fixo, ou a própria linha da pílula: o sono confirma
   "✓ registrado · 7h de sono", e a refeição "✓ anotado · almoço · salada",
   iguais ao início */
const DONE_NOTICE = { "finance-entry": "lançado no financeiro", "lead-update": "cliente atualizado", script: "roteiro aplicado", "sleep-log": (line) => "✓ " + line, "meal-log": (line) => "✓ " + line, "op-add": (line) => "✓ " + line, "op-done": (line) => "✓ " + line };
const ACTION_OPTIONS = { finance: { normalize: normalizeFinance }, sleep: { normalize: normalizeSleep }, workouts: { normalize: normalizeWorkout }, meals: { normalize: normalizeMeal }, ops: { normalize: normalizeOp } };
const optionPair = (o) => (Array.isArray(o) ? o : [o, o]);
export function ProposalDialog({ proposal, chat, onClose, onDone }) {
  const { actionType, note } = proposal;
  const payload = proposal.payload || {};
  const collectionName = ACTION_COLLECTIONS[actionType];
  const store = useCollection(collectionName || "tasks", ACTION_OPTIONS[collectionName]);
  const fields = ACTION_FIELDS[actionType] || [];
  const initial = {};
  fields.forEach((f) => {
    const v = payload[f.key];
    initial[f.key] = f.initial && (v == null || v === "") ? f.initial(payload, store) : v == null ? "" : v;
  });
  const [v, bind, set] = useFields(initial);
  if (!collectionName) return null;
  const ctx = collectionName === "finance" ? financeContext(bookCollection(store, v.book)) : collectionName === "ops" ? { store } : null;
  const submit = () => {
    const { doc, error } = buildDoc(actionType, payload, v, store, { chat });
    if (error) { notify(error); return false; }
    /* o treino marca o hábito de treino do dia (PRD saude-completa, D4), pelo
       mesmo logWorkout da aba e do início, e o desfazer desfaz os dois */
    if (actionType === "workout-log") {
      const habits = collection("habits", { normalize: normalizeHabit });
      const res = logWorkout(doc, habits.all(), today());
      if (res.error) { notify(res.error); return false; }
      const line = ACTION_DONE[actionType] + " · " + res.line;
      const undo = applyWorkout(store, habits, res);
      if (onDone) onDone(line);
      notify("✓ " + line, () => { undo(); if (onDone) onDone(null); });
      return;
    }
    const before = store.get(doc.id);
    store.save(doc);
    /* mapa e funil de onboarding entregam um documento pronto pra olhar — o
       gesto certo é já estar nele, não voltar pra conversa e ter que ir
       buscar. os outros tipos são leves o bastante pra fazer sentido ficar. */
    const goTo = CREATE_HREF[actionType];
    if (goTo) { if (onDone) onDone(ACTION_LABELS[actionType]); location.href = goTo + doc.id; return; }
    /* a linha da pílula confirmada sai do que foi gravado, com o que a pessoa
       editou na caixa, e não do que a IA propôs */
    /* o lançamento da empresa diz onde caiu: "✓ lançado no caixa · R$ 2.400 ·
       Acme" (PRD meu-negocio, D8) */
    const cash = actionType === "finance-entry" && doc.book === "business";
    const line = cash ? cashLine(doc) : (ACTION_DONE[actionType] || "criado") + " · " + (previewOf(actionType, { ...payload, ...v }, ctx) || v.title || v.name || proposal.title);
    if (onDone) onDone(line);
    const undo = undoEntry(before, doc);
    const notice = cash ? (l) => "✓ " + l : DONE_NOTICE[actionType];
    notify(typeof notice === "function" ? notice(line) : notice || "feito", () => {
      if (undo.remove) store.remove(undo.remove); else store.save(undo.save);
      if (onDone) onDone(null);
    });
  };
  return (
    <Form title={ACTION_LABELS[actionType] || "proposta"} sub={previewOf(actionType, payload, ctx) || note}
        submit={CREATE_LABELS[actionType] || (actionType === "lead-update" || actionType === "script" ? "aplicar" : "criar")}
        onSubmit={submit} onClose={onClose}>
      {fields.map((f) => f.type === "check"
        ? <label key={f.key} className="row full"><input type="checkbox" {...bind(f.key, "check")} /> {f.label}</label>
        : (
          <Field key={f.key} label={f.label} full={f.type === "textarea"}>
            {f.type === "textarea"
              ? <textarea className="textarea" rows="4" {...bind(f.key)} />
              : f.type === "money"
              ? <MoneyInput value={+v[f.key] || 0} onChange={(c) => set(f.key, c)} />
              : f.type === "select"
              ? <select className="select" {...bind(f.key)}>
                  {f.options(store, v).map(optionPair).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              : <input className="input" type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} {...bind(f.key)} />}
          </Field>
        ))}
    </Form>
  );
}

/* ---------- o hábito dito na conversa (ticket #10) ----------
   a pílula de `habit-mark` não abre caixa: o hábito que existe se marca no
   clique, com desfazer, e o que já estava marcado vira a linha "✓ já estava
   marcado", sem ação. o que não existe oferece "criar e marcar", que abre a
   caixa de novo hábito preenchida: nenhum hábito nasce sem ela.
   `onDone(linha)` é o mesmo da caixa de proposta: a pílula vira "✓ marcado ·
   treinar", e o desfazer a devolve com `onDone(null)`. */
export function HabitProposal({ proposal, className, doneClassName, onDone }) {
  const habits = useCollection("habits", { normalize: normalizeHabit });
  const [creating, setCreating] = useState(false);
  const p = proposal.payload || {};
  const t = today();
  const st = habitStatus(habits.all(), p, t);
  const name = st.habit ? st.habit.name : String(p.name || p.habit || proposal.title || "").trim();
  if (st.error) return <p className={doneClassName}>{name} · {st.error}</p>;
  if (st.already) return <p className={doneClassName}>✓ já estava marcado · {name}</p>;
  if (!st.habit) {
    return (
      <>
        <button className={className} type="button" onClick={() => setCreating(true)}>{icon("plus")}{name} · não existe · criar e marcar</button>
        {creating && <HabitForm habits={habits} draft={{ name, mark: st.day }} onClose={() => setCreating(false)} onDone={onDone} />}
      </>
    );
  }
  const mark = () => {
    const { doc, error } = buildDoc("habit-mark", p, p, habits);
    if (error) { notify(error); return; }
    const before = habits.get(doc.id);
    habits.save(doc);
    if (onDone) onDone(ACTION_DONE["habit-mark"] + " · " + previewOf("habit-mark", { habit: doc.name, date: st.day }));
    const undo = undoHabit(before, doc);
    notify(doc.name + " marcado " + markWhen(st.day, t), () => {
      habits.save({ ...undo.save, updatedAt: Date.now() });
      if (onDone) onDone(null);
    });
  };
  return <button className={className} type="button" onClick={mark}>{icon("check")}{name} · marca {markWhen(st.day, t)}</button>;
}

/* ---------- a caixa do hábito: criar e editar são a mesma ----------
   morava em habits.jsx; veio para cá (18/10/2026) porque o início e a
   conversa também abrem a de novo hábito, no "criar e marcar". com `draft`
   ({ name, mark }), a caixa já vem com o nome, e criar marca o dia `mark`,
   grava a origem na conversa e avisa com desfazer, que apaga o hábito.
   `onDone(linha)` conta a quem abriu, como na caixa de proposta. */
export function HabitForm({ habits, id, draft, onClose, onArchive, onSuggest, onDone }) {
  const h = id ? habits.get(id) : null;
  const [v, bind, set] = useFields({
    name: h ? h.name : draft ? draft.name : "",
    type: h ? h.schedule.type : "daily",
    times: h ? h.schedule.times : 3,
    weekdays: h ? h.schedule.weekdays : [1, 2, 3, 4, 5],
    duration: h && h.min ? formatMin(h.min) : "",
    color: h ? h.color : 5
  });
  if (id && !h) return null;
  const t = today();
  const markDay = draft && draft.mark && draft.mark <= t ? draft.mark : t;
  const toggleWeekday = (n) => set("weekdays", v.weekdays.includes(n) ? v.weekdays.filter((x) => x !== n) : [...v.weekdays, n]);
  const submit = () => {
    const name = v.name.trim().slice(0, 80);
    if (!name) { notify("o hábito precisa de um nome"); return false; }
    if (v.type === "weekdays" && !v.weekdays.length) { notify("escolha pelo menos um dia"); return false; }
    const now = Date.now();
    const schedule = { type: v.type, times: Math.min(7, Math.max(1, Math.round(+v.times || 1))), weekdays: v.weekdays.slice().sort() };
    const min = parseDuration(v.duration).min;
    if (h) { habits.save({ ...h, name, schedule, min, color: +v.color, updatedAt: now }); return; }
    const doc = { id: newId(), name, schedule, min, color: +v.color, order: now, archived: false, marks: {}, createdAt: now, updatedAt: now };
    if (!draft) { habits.save(doc); return; }
    habits.save({ ...doc, marks: { [markDay]: true }, origin: { type: "chat" } });
    if (onDone) onDone("criado e marcado · " + name);
    notify(name + " criado e marcado " + markWhen(markDay, t), () => {
      habits.remove(doc.id);
      if (onDone) onDone(null);
    });
  };
  return (
    <Form title={h ? "hábito" : "novo hábito"} sub={draft ? "criar já marca " + markWhen(markDay, t) : ""}
        submit={h ? "salvar" : draft ? "criar e marcar" : "criar"} remove={h ? "arquivar" : ""} removeIcon="archive"
        aside={!h && onSuggest ? <button className="dialog__remove" type="button" title="ver sugestões" aria-label="Ver sugestões" onClick={onSuggest}>{icon("spark")}</button> : null}
        onRemove={() => onArchive(h)} onClose={onClose} onSubmit={submit}>
      <Field label="nome" full><input className="input" maxLength="80" required placeholder="treino, leitura, água…" {...bind("name")} /></Field>
      <Field label="frequência">
        <select className="select" {...bind("type")}>{SCHEDULES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
      </Field>
      {v.type === "perWeek" && <Field label="quantas vezes"><input className="input input--num" type="number" min="1" max="7" {...bind("times")} /></Field>}
      {v.type === "weekdays" && (
        <Field label="quais dias" full>
          <div className="weekday-picker">
            {[1, 2, 3, 4, 5, 6, 0].map((n) => (
              <label key={n} className={v.weekdays.includes(n) ? "is-on" : ""}>
                <input type="checkbox" checked={v.weekdays.includes(n)} onChange={() => toggleWeekday(n)} />{WEEKDAY_NAMES[n]}
              </label>))}
          </div>
        </Field>)}
      <Field label="duração sugerida"><input className="input input--mono" placeholder="30m, 1h" {...bind("duration")} /></Field>
      <Field label="cor">
        <select className="select" {...bind("color")}>{COLORS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
      </Field>
    </Form>
  );
}

/* ---------- o campo de tudo (Ctrl+K) ----------
   ate 09/10/2026 havia sete lugares para escrever, e cada um decidia sozinho
   para onde o texto ia: o campo da home mandava o Enter para a conversa, a
   busca da barra so buscava, o diario e as notas tinham caixa propria. agora
   ha um campo que vale em toda tela, e uma regra so (routeLine, no tasks.js):

     com "?" no comeco ou no fim  → pergunta ao Merlin
     com duracao ("45m", "1h30")  → tarefa de hoje
     sem duracao                  → nota

   a primeira linha da lista diz o que o Enter vai fazer, antes de ele fazer —
   a mesma ideia da linha fantasma da home. embaixo, o que ja existe com aquele
   nome (a busca de sempre), e com o campo vazio, uma linha por aba de cada
   área ("finanças · financeiro"), na ordem do menu.

   a conversa com o Merlin continua sendo uma pagina (assistant.html): o
   askMerlin() leva para la a pergunta e o que esta tela sabia. Ctrl+J pergunta
   direto, sem passar pela regra. */
const ROUTE_LABEL = {
  task: (r) => (r.reserved ? "reservar em hoje" : "pôr em hoje") + " · " + formatMin(r.min),
  note: () => "guardar em notas",
  ask: () => "perguntar ao Merlin"
};

/* quem quiser abrir o campo de tudo de dentro de uma tela (o "/" dos clientes) */
export const openCommand = () => window.dispatchEvent(new Event("merlin:command"));

function CommandPalette({ onClose }) {
  const [term, setTerm] = useState("");
  const [focus, setFocus] = useState(0);
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.focus(); }, []);

  const route = routeLine(term);
  const rows = [];
  /* o pedido de montar vai para a conversa do assistente, que pergunta o que
     falta e mostra o rascunho. a duracao continua mandando: e tarefa */
  const build = route && route.kind !== "task" ? buildIntent(term) : null;
  if (build) rows.push({ key: "build", kind: "ask", label: "montar com o Merlin", text: "o " + BUILD[build].label + ": " + term.trim(), run: () => askMerlin(term.trim()) });
  if (route) {
    rows.push({ key: "do", kind: route.kind, label: ROUTE_LABEL[route.kind](route), text: route.kind === "ask" ? route.text : route.title, run: () => runRoute(route) });
    /* perguntar e sempre possivel: e o atalho de quem queria conversar sobre
       aquilo, e nao guardar */
    if (route.kind !== "ask") rows.push({ key: "ask", kind: "ask", label: "perguntar ao Merlin", text: term.trim(), run: () => askMerlin(term.trim()) });
  }
  const hits = term.trim() ? search(term) : [];
  hits.forEach((h, i) => rows.push({ key: "hit" + i, kind: "hit", label: h.label, text: h.text, run: () => { location.href = h.href; } }));
  if (!term.trim()) {
    SECTIONS.forEach((sec) => sec.pages.forEach((p) => rows.push({ key: "nav" + p.id, kind: "nav", icon: sec.icon, label: "ir para", text: sec.label + " · " + p.label, run: () => { location.href = p.href; } })));
  }
  const at = Math.min(focus, Math.max(0, rows.length - 1));

  const runRoute = (r) => {
    if (r.kind === "ask") { askMerlin(r.text); return; }
    if (r.kind === "task") {
      const store = tasks();
      const date = today();
      const t = newTask({ title: r.title, min: r.min, reserved: r.reserved, clickup: r.clickup, client: r.client, date, order: topOrder(store.all(), date) });
      store.save(t);
      notify((r.reserved ? "reservado em hoje · " : "entrou em hoje · ") + formatMin(r.min), () => store.remove(t.id));
    } else {
      const note = newNote({ title: r.title, client: r.client });
      if (note) notify("guardado em notas", () => collection("notes").remove(note.id));
    }
    onClose();
  };
  const run = (row) => { if (row) row.run(); };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!rows.length) return;
      setFocus((i) => (Math.min(i, rows.length - 1) + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(rows[at]);
    } else if (e.key === "Escape") {
      e.preventDefault(); e.stopPropagation();
      onClose();
    }
  };

  return createPortal(
    <div className="cmd" role="dialog" aria-modal="true" aria-label="Escrever, buscar ou perguntar" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmd__box">
        <label className="cmd__field">
          {NAV_ICONS.search}
          <input ref={ref} type="text" autoComplete="off" spellCheck="false" maxLength="300"
                 placeholder="escreva, busque ou pergunte…" aria-label="Escrever, buscar ou perguntar"
                 value={term} onChange={(e) => { setTerm(e.currentTarget.value); setFocus(0); }} onKeyDown={onKeyDown} />
          <kbd>esc</kbd>
        </label>
        <ul className="cmd__rows" role="listbox">
          {rows.map((row, i) => (
            <li key={row.key} role="option" aria-selected={i === at}>
              <button type="button" className={"cmd__row cmd__row--" + row.kind + (i === at ? " is-focus" : "")}
                      onMouseEnter={() => setFocus(i)} onClick={() => run(row)}>
                <span className="cmd__icon" aria-hidden="true">
                  {row.kind === "ask" ? icon("spark") : row.kind === "task" ? icon("clock") : row.kind === "note" ? NAV_ICONS.notes : row.kind === "nav" ? NAV_ICONS[row.icon] : NAV_ICONS.search}
                </span>
                <span className="cmd__label t-mono">{row.label}</span>
                <span className="cmd__text">{row.text}</span>
                {i === at && <kbd>enter</kbd>}
              </button>
            </li>
          ))}
          {term.trim() && !hits.length && <li className="cmd__none">nada guardado com esse nome</li>}
        </ul>
        <p className="cmd__rule">
          com <b>duração</b> vai para hoje · sem duração vira <b>nota</b> · com <b>?</b> pergunta ao Merlin · <kbd>ctrl j</kbd> pergunta direto
        </p>
      </div>
    </div>,
    document.body
  );
}

/* claro ou escuro, a um clique, em toda tela. o interruptor tinha saído da
   barra e morava só no perfil — trocar de tema pedia abrir outra página, e
   com a pele da Guessless, que muda o fundo inteiro, isso aparecia mais
   (13/09/2026). "seguir o sistema" continua sendo escolha do perfil. */
function ThemeButton() {
  const [theme, setThemeState] = useState(currentTheme);
  const next = theme === "light" ? "escuro" : "claro";
  return (
    <button type="button" className="sb__mode" aria-label={"Mudar para o tema " + next} title={"tema " + next}
            onClick={() => { toggleTheme(); setThemeState(currentTheme()); }}>
      {theme === "light" ? MOON_ICON : SUN_ICON}
    </button>
  );
}
/* os desenhos próprios: os do NAV_ICONS carregam as classes do interruptor
   (knob__sun/knob__moon), que são posicionadas por cima dele */
const SUN_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>;
const MOON_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>;

/* ---------- a caixa de entrar ----------
   um passo de e-mail e um de codigo. quem faz as chamadas e o core; aqui so o
   recado que ele devolve.

   o passo do codigo foi refeito em 13/09/2026: o titulo, o campo e a frase
   "se voce puder entrar, o codigo chega" vinham nessa ordem — a explicacao
   depois do botao, o endereco perdido no meio dela, e um "000000" no campo
   que parecia codigo ja digitado. agora a frase vem antes, com o endereco em
   destaque e o "trocar" ao lado dele; o codigo sao seis casas, e a sexta
   digitada ja entra. */
const RESEND_AFTER = 30;

function SignInDialog() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("email");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const emailRef = useRef(null), codeRef = useRef(null);
  useLayoutEffect(() => { if (emailRef.current) emailRef.current.focus(); }, []);
  useEffect(() => { if (step === "code" && codeRef.current) codeRef.current.focus(); }, [step]);
  useEffect(() => {
    if (!wait) return;
    const id = setTimeout(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearTimeout(id);
  }, [wait]);
  useEscape(() => signIn.hide());

  const request = async () => {
    if (busy) return;
    setBusy(true); setMessage("");
    const r = await signIn.requestCode(email);
    setBusy(false);
    if (r.ok) { setEmail(r.email); setCode(""); setStep("code"); setWait(RESEND_AFTER); }
    else setMessage(r.message);
  };
  const sendCode = (e) => { e.preventDefault(); request(); };
  const enter = async (value) => {
    if (busy) return;
    if (value.length !== 6) { setMessage("o código tem 6 dígitos"); return; }
    setBusy(true); setMessage("");
    const r = await signIn.submitCode(email, value);
    setBusy(false);
    if (!r.ok) {
      setMessage(r.message);
      setCode("");
      setTimeout(() => { if (codeRef.current) codeRef.current.focus(); }, 0);
    }
  };
  const typeCode = (text) => {
    const digits = String(text).replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (message) setMessage("");
    if (digits.length === 6) enter(digits);
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
      <div className="dialog__box signin">
        <button className="dialog__close" type="button" id="signin-close" aria-label="Fechar" onClick={() => signIn.hide()}>{icon("x")}</button>
        {step === "email" ? (
          <form id="form-email" autoComplete="on" onSubmit={sendCode}>
            <p className="dialog__title">entrar</p>
            <p className="dialog__sub">para levar o merlin a outros aparelhos. sem senha: mando um código de seis dígitos.</p>
            <input ref={emailRef} className="input signin-input" id="email-input" type="email" inputMode="email" autoComplete="email"
                   placeholder="seu@email.com" aria-label="Seu e-mail" value={email}
                   onChange={(e) => { setEmail(e.currentTarget.value); if (message) setMessage(""); }} />
            {message && <p className="signin-message is-error" role="alert">{message}</p>}
            <button className="signin-button" type="submit" disabled={busy || !email.trim()}>{busy ? "mandando…" : "mandar código"}</button>
          </form>
        ) : (
          <form id="form-code" autoComplete="off" onSubmit={(e) => { e.preventDefault(); enter(code); }}>
            <p className="dialog__title">confira seu e-mail</p>
            <p className="dialog__sub">
              se <b className="signin-email">{email}</b> puder entrar, o código chega em alguns segundos.{" "}
              <button className="action signin-act" type="button" title="trocar e-mail" aria-label="Trocar e-mail" onClick={changeEmail}>{icon("pencil")}</button>
            </p>
            {/* as seis casas são desenho: o campo de verdade é um só, por cima
                delas, para colar e o preenchimento automático do celular
                (one-time-code) continuarem funcionando */}
            <label className={"otp" + (message ? " is-error" : "") + (busy ? " is-busy" : "")}>
              <input ref={codeRef} className="otp__input" id="code-input" inputMode="numeric" autoComplete="one-time-code"
                     maxLength="6" aria-label="Código de seis dígitos" value={code} disabled={busy}
                     onChange={(e) => typeCode(e.currentTarget.value)} />
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} aria-hidden="true"
                      className={"otp__cell" + (i === Math.min(code.length, 5) ? " is-at" : "") + (code[i] ? " is-filled" : "")}>{code[i] || ""}</span>
              ))}
            </label>
            <p className={"signin-message" + (message ? " is-error" : "")} role="status" aria-live="polite">
              {busy ? "conferindo…" : message}
            </p>
            <button className="signin-button" type="submit" disabled={busy || code.length !== 6}>{busy ? "conferindo…" : "entrar"}</button>
            <p className="signin-foot">
              {wait
                ? <span>não chegou? dá para mandar de novo em {wait}s</span>
                : <>não chegou? mandar de novo <button className="action signin-act" type="button" title="mandar de novo" aria-label="Mandar o código de novo" disabled={busy} onClick={request}>{icon("mail")}</button></>}
            </p>
          </form>
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
      {notice.undo && <button className="action" type="button" title="desfazer" aria-label="Desfazer" onClick={() => { const f = notice.undo; closeNotice(); f(); }}>{icon("undo")}</button>}
    </div>
  );
}

/* ---------- a casca inteira ----------
   desde 10/10/2026 nao ha barra lateral (VISAO, 10). no alto fica uma faixa
   fina: a marca e o botão "menu" à esquerda; a busca, o tema e quem está aqui
   à direita. o menu abre as cinco áreas com todas as abas de uma vez (core.js,
   SECTIONS), e é o único caminho de uma área para outra com o dedo.

   desde 19/10/2026 o início é só a conversa (docs/prd/o-menu-por-area.md):
   ali não há dock. nas outras telas o dock é pequeno: o início, as abas da
   área em que se está e o "+", que abre o campo de tudo. */
function Brand() {
  return <a className="tb__logo" href="index.html" aria-label="Merlin">{LOGO}<b>merlin</b></a>;
}

function TopBar({ page, onCommand, menuOpen, onMenu, menuRef }) {
  const c = useCloud();
  const info = CLOUD_STATUS[c.status] || CLOUD_STATUS.local;
  const email = c.signedIn ? String(c.email || "") : "";
  return (
    <header className="tb">
      <Brand />
      <button ref={menuRef} type="button" className="tb__menu" onClick={onMenu} title="menu" aria-label="menu"
              aria-expanded={menuOpen} aria-controls="area-menu">
        {NAV_ICONS.menu}<span>menu</span>
      </button>
      <span className="tb__gap" />
      <button type="button" className="tb__search" onClick={onCommand} title="escrever, buscar ou perguntar">
        {NAV_ICONS.search}<span>buscar</span><kbd>ctrl k</kbd>
      </button>
      <ThemeButton />
      {email
        ? <a className="tb__me" href="profile.html" title={email + " · " + info.line} aria-current={page === "profile" ? "page" : undefined}>
            <span className="avatar">{email[0].toUpperCase()}</span><i className="tb__dot" data-status={c.status} />
          </a>
        : <button type="button" className="pill pill--accent tb__in" onClick={() => signIn.show()}>entrar</button>}
    </header>
  );
}

/* o dock decide pela página: no início não desenha (o campo da conversa já é o
   gesto de escrever); numa página de área, o início, as abas dela (se houver
   mais de uma) e o "+"; no resto (a conversa, o perfil), o início e o "+".
   trocar de área é pelo menu. as abas moram no próprio dock, e não numa faixa
   acima dele: as quatro do trabalho cabem em 390px numa linha só. a aba
   `spare` (o diário da saúde, a quinta) sai do dock até 600px, mesmo na
   página dela: é o que faz as cinco da saúde caberem */
function Dock({ page, onCommand }) {
  if (page === "home") return null;
  const here = sectionOf(page);
  const tabs = here && here.pages.length > 1 ? here.pages : [];
  return (
    <div className="dk-wrap">
      <nav className="dk" aria-label={here ? here.label : "Navegação"}>
        <a className="dk__item" href="index.html" title="início">
          {NAV_ICONS.home}<span>início</span>
        </a>
        {tabs.length > 0 && <span className="dk__sep" />}
        {tabs.map((p) => (
          <a key={p.id} className={"dk__tab" + (p.spare ? " dk__tab--spare" : "")} href={p.href} aria-current={p.id === page ? "page" : undefined}>{p.label}</a>
        ))}
        <span className="dk__sep" />
        <button type="button" className="dk__plus" onClick={onCommand} title="escrever, buscar ou perguntar (Ctrl K)" aria-label="Escrever, buscar ou perguntar">
          {icon("plus")}
        </button>
      </nav>
    </div>
  );
}

/* o menu das áreas: as cinco, com todas as abas, de uma vez e sem segundo
   nível (são 16 links, cabem numa olhada). mora no body, e não dentro da
   faixa, porque a faixa não recebe clique fora dos filhos dela. abrir põe o
   foco no primeiro link; Esc fecha e devolve o foco ao botão; clicar fora ou
   escolher um link também fecha. não há atalho de teclado próprio: quem usa o
   teclado tem o Ctrl+K, que lista as mesmas abas (PRD, D4) */
function AreaMenu({ page, onClose, button }) {
  const ref = useRef(null);
  useEffect(() => {
    const first = ref.current && ref.current.querySelector("a");
    if (first) first.focus();
    const outside = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (button.current && button.current.contains(e.target)) return;
      onClose(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  useKeydown((e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    onClose(true);
  });
  /* o Tab que sai do painel (para a faixa ou a página) também fecha: o menu
     não fica aberto atrás de onde o foco está */
  const onBlur = (e) => {
    const to = e.relatedTarget;
    if (!to || ref.current.contains(to) || (button.current && button.current.contains(to))) return;
    onClose(false);
  };
  return createPortal(
    <nav className="am" id="area-menu" aria-label="Áreas" ref={ref} onBlur={onBlur}>
      {SECTIONS.map((sec) => {
        const here = sec.pages.some((p) => p.id === page);
        return (
          <section key={sec.id} className={"am__area" + (here ? " is-here" : "")} aria-labelledby={"am-" + sec.id}>
            <h2 className="am__title" id={"am-" + sec.id}>{NAV_ICONS[sec.icon]}<span>{sec.label}</span></h2>
            <ul className="am__list">
              {sec.pages.map((p) => (
                <li key={p.id}>
                  <a href={p.href} aria-current={p.id === page ? "page" : undefined} onClick={() => onClose(false)}>{p.label}</a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </nav>,
    document.body
  );
}

/* o aviso no lugar da tela de quem ainda nao fez o onboarding (core.js,
   guardOnboarding). a tela nao abre e nao ha outro caminho: o botao leva a
   conversa, e o "entrar" do topo continua ali para quem ja fez noutro aparelho */
function OnboardingWall() {
  return (
    <div className="ow" role="dialog" aria-modal="true" aria-labelledby="ow-title">
      <div className="ow__card">
        <span className="ow__logo">{LOGO}</span>
        <h2 id="ow-title">Falta terminar a conversa com o Merlin</h2>
        <p>Antes de usar o resto do Merlin, ele precisa te conhecer: seu nome, com o que você
        trabalha, o horário do seu dia. São poucas perguntas, e o que você já tem aqui continua guardado.</p>
        <a className="pill pill--accent ow__go" href="index.html">concluir agora</a>
      </div>
    </div>
  );
}

function Shell({ page }) {
  const [signInOpen, setSignInOpen] = useState(signIn.open);
  useEffect(() => signIn.onChange((s) => setSignInOpen(s.open)), []);

  /* o campo de tudo: Ctrl+K abre de qualquer tela; Ctrl+J pergunta ao Merlin
     direto. o rastreador do desktop e uma janela de 380px, e ali nao cabe. */
  const [cmd, setCmd] = useState(false);
  /* durante o onboarding (a conversa no inicio, ou o aviso nas outras telas)
     nao ha atalho: a busca e o "perguntar" levariam para fora dele. a classe e
     lida na hora do atalho porque o inicio a liga e desliga sozinho */
  const locked = () => page === "tracker" || document.documentElement.classList.contains("onboarding");
  useEffect(() => {
    const open = () => { if (!locked()) setCmd(true); };
    window.addEventListener("merlin:command", open);
    return () => window.removeEventListener("merlin:command", open);
  }, []);
  useKeydown((e) => {
    if (locked() || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
    if (e.key.toLowerCase() === "k") { e.preventDefault(); setCmd(true); }
    if (e.key.toLowerCase() === "j") { e.preventDefault(); askMerlin(""); }
  });
  /* o menu das áreas: some durante o onboarding, como a busca */
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  const toggleMenu = () => setMenu((on) => !on && !locked());
  const closeMenu = (refocus) => {
    setMenu(false);
    if (refocus && menuRef.current) menuRef.current.focus();
  };
  const [blocked, setBlockedView] = useState(onboardingBlocked);
  useEffect(() => {
    const sync = () => { setBlockedView(onboardingBlocked()); if (onboardingBlocked()) { setCmd(false); setMenu(false); } };
    window.addEventListener("merlin:onboarding", sync);
    return () => window.removeEventListener("merlin:onboarding", sync);
  }, []);

  return (
    <>
      {page !== "tracker" && <TopBar page={page} onCommand={() => setCmd(true)} menuOpen={menu} onMenu={toggleMenu} menuRef={menuRef} />}
      {menu && <AreaMenu page={page} onClose={closeMenu} button={menuRef} />}
      {page !== "tracker" && <Dock page={page} onCommand={() => setCmd(true)} />}
      {blocked && <OnboardingWall />}
      {signInOpen && <SignInDialog />}
      {cmd && <CommandPalette onClose={() => setCmd(false)} />}
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
