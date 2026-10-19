/* merlin · a landing, a parte que se mexe
   a página de quem nunca ouviu falar do Merlin é HTML estático, escrito no
   index.html (docs/prd/landing.md): o texto chega sem esperar o JS, e é ele
   que o buscador e a prévia de link leem. isto aqui só acorda o que se mexe:

   - a floresta do início, na hora de quem visita;
   - a janela do início com um dia de demonstração andando. a conta é a do
     day.js, a mesma do Hoje e do rastreador, só que num relógio acelerado: a
     linha escrita vira tarefa pela regra do tasks.js, entra no dia, a barra
     se gasta, a tarefa fecha com o recibo e a próxima linha vira ideia;
   - os botões de abrir e de entrar, a barra que ganha fundo ao rolar e a
     lista de espera.

   o index.jsx carrega este módulo só para quem está na porta, e chama wake();
   o que wake() devolve desfaz tudo quando a pessoa abre o Merlin. */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { signIn, api } from "./shared/core.js";
import { Forest, phaseOf } from "./shared/forest.jsx";
import { distribute, fmt, clock } from "./shared/day.js";
import { routeLine } from "./shared/tasks.js";
import { NAV_ICONS } from "./shared/icons.jsx";

/* ================================================================
   o dia de demonstração
   ================================================================
   começa às 14:10 numa janela de 09:00 a 19:00, como a foto parada do
   index.html. a call já acabou e a cobrança já foi; ficaram três na fila. */
const START = 9 * 60, END = 19 * 60, T0 = 14 * 60 + 10;
const TASK_LINE = "revisar a landing 45m";
const IDEA_LINE = "modo offline no app";
/* a landing leva 50 minutos dos 45 que prometeu: o recibo da sessão de foco */
const TOOK = 50;
const SEED = () => ({
  now: T0, text: "", toast: null,
  tasks: [
    { id: "b", title: "responder os testers do beta", min: 30 },
    { id: "c", title: "gravar o reels do lançamento", min: 90 },
    { id: "d", title: "escrever o e-mail da lista", min: 40 },
    { id: "a", title: "revisar o fluxo de cobrança", min: 45, done: true },
    { id: "r", title: "call com o contador", min: 30, reserved: true, done: true }
  ]
});

const HINT_EMPTY = "com a duração (45m, 1h30) entra em hoje · pergunta vai para o Merlin · o resto vira ideia";
function hintOf(route) {
  if (!route) return HINT_EMPTY;
  if (route.kind === "task") return "Enter: entra em hoje · " + fmt(route.min);
  if (route.kind === "ask") return "Enter: pergunta ao Merlin";
  return "Enter: vira ideia";
}

/* o roteiro roda enquanto a janela está à vista; sair da tela para tudo, e
   voltar recomeça do começo — ninguém precisa ver o meio de uma frase */
function useScript(on) {
  const [s, set] = useState(SEED);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const say = (text) => set((x) => ({ ...x, toast: { text, n: (x.toast ? x.toast.n : 0) + 1 } }));
    const type = async (line) => {
      for (let i = 1; i <= line.length; i++) {
        if (!alive) return;
        set((x) => ({ ...x, text: line.slice(0, i) }));
        await wait(46 + Math.random() * 50);
      }
    };
    (async () => {
      while (alive) {
        set(SEED());
        await wait(1400);
        await type(TASK_LINE);
        await wait(700);
        if (!alive) return;
        const r = routeLine(TASK_LINE);
        set((x) => ({ ...x, text: "", tasks: [{ id: "n", title: r.title, min: r.min, fresh: true }, ...x.tasks] }));
        say("entrou em hoje · " + fmt(r.min));
        await wait(1500);
        for (let m = T0 + 1; m <= T0 + TOOK; m++) {
          if (!alive) return;
          set((x) => ({ ...x, now: m }));
          await wait(80);
        }
        set((x) => ({ ...x, tasks: x.tasks.map((t) => (t.id === "n" ? { ...t, done: true, fresh: false } : t)) }));
        say(r.title + " levou " + fmt(TOOK) + " de " + fmt(r.min));
        await wait(2400);
        await type(IDEA_LINE);
        await wait(700);
        if (!alive) return;
        set((x) => ({ ...x, text: "" }));
        say("guardado em notas");
        await wait(3000);
      }
    })();
    return () => { alive = false; };
  }, [on]);
  return s;
}

function FieldView({ text }) {
  const route = routeLine(text);
  return (
    <>
      <span className="ld-demo__text">
        {text
          ? <>{text}<i className="ld-demo__caret" /></>
          : <><i className="ld-demo__caret" /><span className="ld-demo__ph">uma tarefa (revisar a landing 45m), uma pergunta ou uma ideia</span></>}
      </span>
      <span className="ld-demo__hint" data-kind={route ? route.kind : ""}>{hintOf(route)}</span>
    </>
  );
}

function DayView({ s }) {
  const doc = { start: START, end: END, tasks: s.tasks };
  const open = s.tasks.filter((t) => !t.done && !t.reserved);
  const { b, slots } = distribute(doc, open, s.now);
  const pct = (min) => (min / b.window) * 100 + "%";
  const live = s.tasks.filter((t) => !t.done);
  const rows = [...live.filter((t) => t.reserved), ...live.filter((t) => !t.reserved), ...s.tasks.filter((t) => t.done)].slice(0, 6);
  const done = s.tasks.filter((t) => t.done && !t.reserved).length;
  const over = b.slack < 0;
  return (
    <>
      <p className="ld-dc__head">{NAV_ICONS.calendar}o dia <span>{open.length} na fila · {done} {done === 1 ? "feita" : "feitas"}</span></p>
      <p className="ld-dc__n" data-tone={over ? "over" : ""}>
        <b>{fmt(over ? b.overflow : b.slack)}</b><span>{over ? "além do que cabe" : "ainda cabe"}</span>
      </p>
      <div className="ld-track" aria-hidden="true">
        {b.elapsed > 0 && <i className="is-spent" style={{ flexBasis: pct(b.elapsed) }} />}
        {b.liveReserve > 0 && <i className="is-reserved" style={{ flexBasis: pct(b.liveReserve) }} />}
        {open.map((t) => slots.has(t.id) && <i key={t.id} className="is-slot" style={{ flexBasis: pct(slots.get(t.id).min) }} />)}
        {b.slack > 0 && <i className="is-free" />}
      </div>
      <ul className="ld-dc__list">
        {rows.map((t) => (
          <li key={t.id} className={[t.done && "is-done", t.reserved && "is-reserve", t.fresh && "is-new"].filter(Boolean).join(" ")}>
            <i className="ld-check" /><span>{t.title}</span><small>{fmt(t.min)}</small>
          </li>
        ))}
      </ul>
      <p className="ld-dc__foot">agora {clock(s.now)} · a janela vai até {clock(END)}</p>
    </>
  );
}

/* um root só, e as duas metades da janela por portal: o que fica entre elas
   (os hábitos, o que foi entregue) continua sendo o HTML parado da página */
function Demo({ win, field, day }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { threshold: 0.2 });
    io.observe(win);
    return () => io.disconnect();
  }, [win]);
  const s = useScript(on);
  return (
    <>
      {createPortal(<FieldView text={s.text} />, field)}
      {createPortal(<DayView s={s} />, day)}
      {s.toast && <p key={s.toast.n} className="ld-demo__toast" role="status">{s.toast.text}</p>}
    </>
  );
}

/* ================================================================
   a lista de espera
   ================================================================
   quem chega de fora abre o Merlin sem conta, mas a conversa com ele e a
   sincronização pedem uma conta, e as contas abrem aos poucos (VISAO, 8.6).
   o e-mail vai para /api/waitlist e para nenhum outro lugar. */
const isEmail = (v) => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v);
async function join(e, form) {
  e.preventDefault();
  const note = form.querySelector(".ld-wait__note");
  const send = form.querySelector("button[type=submit]");
  const email = form.elements.email.value.trim();
  if (!isEmail(email)) {
    note.textContent = "Esse e-mail não parece completo.";
    form.elements.email.focus();
    return;
  }
  send.disabled = true;
  note.textContent = "Guardando…";
  try {
    const r = await api("/waitlist", { method: "POST", body: JSON.stringify({ email, site: form.elements.site.value }) });
    if (r.ok) {
      form.classList.add("is-done");
      note.textContent = "Pronto. O aviso chega em " + email + " quando a sua conta abrir.";
      return;
    }
    note.textContent = r.status === 429 ? "Muita gente ao mesmo tempo. Tente de novo daqui a pouco."
      : (r.body && r.body.error) || "Não deu agora. Tente de novo daqui a pouco.";
  } catch (err) {
    note.textContent = "Sem conexão agora. Tente de novo daqui a pouco.";
  } finally {
    send.disabled = false;
  }
}

/* ================================================================
   acordar a página
   ================================================================ */
export function wake({ onGuest }) {
  const undo = [];
  const on = (el, ev, fn, opts) => { el.addEventListener(ev, fn, opts); undo.push(() => el.removeEventListener(ev, fn, opts)); };

  document.querySelectorAll('[data-ld="open"]').forEach((el) => on(el, "click", onGuest));
  document.querySelectorAll('[data-ld="signin"]').forEach((el) => on(el, "click", () => signIn.show()));

  const nav = document.querySelector(".ld-nav");
  if (nav) {
    const paint = () => nav.classList.toggle("is-scrolled", window.scrollY > 24);
    paint();
    on(window, "scroll", paint, { passive: true });
  }

  const form = document.querySelector('[data-ld="wait"]');
  if (form) on(form, "submit", (e) => join(e, form));

  const roots = [];
  const scene = document.getElementById("ld-scene");
  if (scene) {
    const r = createRoot(scene);
    r.render(<Forest phase={phaseOf(new Date().getHours())} />);
    roots.push(r);
    /* dois quadros: o primeiro pinta a floresta transparente, o segundo
       acende a transição. num quadro só ela nasceria já acesa */
    requestAnimationFrame(() => requestAnimationFrame(() => scene.classList.add("is-on")));
  }

  /* quem pede menos movimento fica com a foto parada, que já diz o mesmo */
  const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const win = document.querySelector(".ld-win");
  const body = win && win.querySelector(".ld-win__body");
  const field = document.getElementById("ld-field");
  const day = document.getElementById("ld-day");
  if (!still && body && field && day) {
    field.textContent = "";
    day.textContent = "";
    const host = document.createElement("div");
    body.appendChild(host);
    const r = createRoot(host);
    r.render(<Demo win={win} field={field} day={day} />);
    roots.push(r);
    undo.push(() => host.remove());
  }

  /* quem desfaz é o efeito do index.jsx, no meio da renderização dele: os
     roots daqui saem no tique seguinte, porque desmontar um root enquanto
     outro renderiza é o que o React recusa */
  return () => {
    undo.forEach((f) => f());
    setTimeout(() => roots.forEach((r) => r.unmount()), 0);
  };
}
