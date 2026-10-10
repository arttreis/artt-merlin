/* merlin · o início
   a primeira tela de quem entra, e desde 10/10/2026 ela é uma CONVERSA
   (VISAO, 10): o Merlin é um assistente pessoal, e o início é onde ele
   pergunta. de manhã, o que precisa caber hoje; à tarde, como está indo; à
   noite, como fechamos o dia — e, no fim da semana e do mês, como foram. as
   respostas viram tarefa, nota, o "como foi o dia" e as revisões, e os blocos
   embaixo mostram o que essa conversa já sabe.

   quem chega pela primeira vez passa por um onboarding que é a mesma
   conversa: o nome, com o que trabalha, o que está construindo, a janela do
   dia e um hábito. cada resposta cria o documento na hora (o perfil, o
   produto, a janela, o hábito), e o perfil vai junto em todo pedido ao
   conselheiro (worker.js, profileOf) — é isso que o faz falar com uma pessoa.

   em volta, a floresta (shared/forest.jsx), que acompanha a hora.

   quem nunca esteve aqui e não entrou vê antes a porta (o <Landing/>). */
import "./shared/base.css";
import "./index.css";
import {
  initPage, signIn, seen, markSeen, isNewHere, today, addDays, dateOf, notify, newId,
  newNote, askMerlin, readPrefs, savePrefs, prefsStore, formatMin, collection, api, listClients, foldKey,
  onboardingState, onboardingSettled
} from "./shared/core.js";
import { Children, useState, useEffect, useLayoutEffect, useRef } from "react";
import { mount, useCloud, useCollection, icon, Markdown, ProposalDialog } from "./shared/ui.jsx";
import { LOGO, NAV_ICONS } from "./shared/icons.jsx";
import {
  normalize as normalizeTask, dayDoc, overdue, topOrder, newTask, routeLine, readClock,
  needsReading, isReserve, stripPrefix
} from "./shared/tasks.js";
import { MAX_TURNS, normalizeChat, chatTitle, turnsOf } from "./shared/assistant-actions.js";
import { normalize as normalizeHabit, isExpected, toggleMark } from "./shared/habits-data.js";
import { distribute, fmt, longFmt, clock, costOf } from "./shared/day.js";
import { Forest, phaseOf } from "./shared/forest.jsx";
import { runningOf, minutesOf, receipt, focusMinutes, meetingMinutes, githubDay } from "./shared/focus.js";

const door = isNewHere() && !seen("landing");
initPage("home");

/* o nome como a pessoa quer ser chamada, sem o que escapou do teclado: no
   teclado brasileiro o til é tecla morta, e "arthur~" chegou a ser gravado
   assim no onboarding. vale ao gravar e ao mostrar, para os que já estão salvos */
const cleanName = (s) => String(s || "").replace(/[~^`´¨'"*_.,;:!?\-\s]+$/g, "").replace(/^[~^`´¨'"*_\-\s]+/, "").trim();

/* ================================================================
   o tempo da conversa
   ================================================================ */
const hourNow = () => new Date().getHours();
const greet = (h) => (h < 5 ? "Boa madrugada" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite");
/* a pergunta segue a hora: começar, acompanhar, fechar */
const momentOf = (h) => (h >= 5 && h < 12 ? "start" : h >= 12 && h < 17 ? "during" : "close");
const QUESTION = {
  start: "O que precisa caber hoje?",
  during: "Como está indo o dia?",
  close: "Como fechamos o dia?"
};

/* a semana se revisa de sexta à noite até domingo; o mês, nos três últimos
   dias. a chave da semana é o domingo em que ela começou, como no calendário */
function weekKey(day) {
  const d = dateOf(day);
  d.setDate(d.getDate() - d.getDay());
  return "w-" + d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
const monthKey = (day) => "m-" + day.slice(0, 7);
function reviewsDue(day, h) {
  const d = dateOf(day);
  const due = [];
  if ((d.getDay() === 5 && h >= 17) || d.getDay() === 6 || d.getDay() === 0) due.push({ id: weekKey(day), kind: "week" });
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  if (d.getDate() >= last - 2) due.push({ id: monthKey(day), kind: "month" });
  return due;
}

/* a sequência: dias seguidos com o dia fechado. hoje ainda aberto não quebra
   a conta — ela conta a partir de ontem até a noite chegar */
function streakOf(closes, day) {
  let n = 0;
  let d = closes.get(day) ? day : addDays(day, -1);
  while (closes.get(d)) { n++; d = addDays(d, -1); }
  return n;
}

/* ================================================================
   a porta
   ================================================================ */
function Landing({ onGuest }) {
  return (
    <div className="lg">
      <div className="lg__art">
        <span className="lg__logo">{LOGO}<b>merlin</b></span>
        <div className="lg__grade" aria-hidden="true" />
        <div className="lg__words">
          <p className="lg__badge"><i />um assistente de uma pessoa só</p>
          <h1>o dia é o único lugar com <em>minutos</em></h1>
          <p className="lg__sub">
            O Merlin pergunta pelo seu dia, pela sua semana e pelo seu mês, e guarda o que
            você responde: as tarefas, as ideias, o produto que você está construindo e quem
            chega até ele. O trabalho entra no dia quando cabe — é por isso que o número
            grande é confiável.
          </p>
        </div>
      </div>
      <div className="lg__door">
        <h2>comece agora</h2>
        <p className="lg__lead">Sem cadastro, sem cartão, sem espera. O Merlin nasce
        neste navegador e é seu no primeiro clique.</p>
        <button className="lg__cta" type="button" onClick={onGuest}>abrir o meu Merlin</button>
        <p className="lg__fine">Fica só aqui. Nada sobe para lugar nenhum enquanto você não entrar.</p>
        <div className="lg__or"><span>já tem acesso?</span></div>
        <button className="lg__ghost" type="button" onClick={() => signIn.show()}>entrar com e-mail</button>
        <p className="lg__fine">Um código de seis dígitos, sem senha para decorar.</p>
      </div>
    </div>
  );
}

/* ================================================================
   o onboarding: a primeira conversa
   ================================================================
   cinco perguntas, e cada resposta vira alguma coisa NA HORA — o Merlin diz
   o que anotou, e a pessoa vê o sistema se montar. tudo menos o nome pode ser
   pulado. sem rede e sem IA: é roteiro, e funciona no primeiro minuto. */
function parseWindow(text) {
  const parts = String(text || "").toLowerCase().split(/\s*(?:às|as|a|até|ate|-|–|—)\s*/).filter(Boolean);
  if (parts.length < 2) return null;
  const s = readClock(parts[0]), e = readClock(parts[1]);
  return s != null && e != null && e > s ? { dayStart: s, dayEnd: e } : null;
}

const STEPS = [
  { key: "name", ask: (a, back) => back ? "Como posso te chamar?" : "Oi. Eu sou o Merlin. Vou te ajudar a fazer o dia caber — e, para isso, preciso te conhecer. Como posso te chamar?", placeholder: "seu nome", required: true },
  { key: "work", ask: (a, back, saidName) => (saidName ? "Prazer, " + a.name + ". " : "") + "Com o que você trabalha?", placeholder: "ex.: sou dev, faço SaaS sozinho e atendo dois clientes" },
  { key: "building", ask: () => "E o que você está construindo agora? Me diz o nome e, se quiser, uma frase.", placeholder: "ex.: Agenda do salão — agendamento pelo WhatsApp" },
  { key: "github", ask: () => "Se você usa GitHub, qual é o seu usuário? Eu leio o que você entregar no dia — só o que é público, sem senha nem token.", placeholder: "ex.: arttreis" },
  { key: "window", ask: () => "Que horas o seu dia de trabalho começa e termina?", placeholder: "ex.: 9 às 18" },
  { key: "habit", ask: () => "Um hábito que você quer manter todo dia?", placeholder: "ex.: treinar, ler 20 páginas, dormir 7h" }
];

/* quem já usava o Merlin antes de o onboarding existir chega aqui obrigado
   (core.js, guardOnboarding), com trabalho guardado e às vezes com parte do
   perfil: o GitHub vem da tela de perfil, a janela do dia das preferências,
   os hábitos da lista dele. a conversa reconhece isso — começa dizendo que o
   Merlin mudou e pula o que ele já sabe. perguntar de novo o que está anotado
   seria fingir que não conhece a pessoa. */
function knownOf(me, habits) {
  const p = me || {};
  const prefs = prefsStore().get("config");
  return {
    name: cleanName(p.name),
    work: p.work || "",
    building: p.building || "",
    github: p.github || "",
    window: prefs && prefs.dayStart != null && prefs.dayEnd != null ? "sim" : "",
    habit: p.habit || (habits.all().some((x) => !x.archived) ? "sim" : "")
  };
}

/* chegou antes do onboarding: tem perfil sem a marca, ou tem trabalho guardado */
const isVeteran = (me, lists) => !!me || lists.some((c) => c.all().length > 0);

function Onboarding({ profile, apps, habits, veteran, onDone }) {
  /* quem é, o que já se sabe e as perguntas que sobram são lidos uma vez, ao
     abrir: cada resposta grava no perfil e cria produto e hábito, e nada
     disso pode mudar a conversa no meio dela */
  const [back] = useState(veteran);
  const [known] = useState(() => (back ? knownOf(profile.get("me"), habits) : {}));
  const [steps] = useState(() => STEPS.filter((st) => !known[st.key]));
  const [answers, setAnswers] = useState(() => (known.name ? { name: known.name } : {}));
  const [log, setLog] = useState(() => {
    if (!steps.length) return [];
    const first = { from: "merlin", text: steps[0].ask(answers, back, false) };
    if (!back) return [first];
    const n = steps.length;
    return [{
      from: "merlin",
      text: "Oi de novo" + (known.name ? ", " + known.name : "") + ". Eu mudei desde a última vez: agora sou um assistente, e pergunto pelo seu dia sempre que você chega. " +
        "Para isso preciso te conhecer — " + (n === 1 ? "é uma pergunta" : "são " + n + " perguntas") + ", e o que você já tem aqui continua onde está."
    }, first];
  });
  const [i, setI] = useState(0);
  const [text, setText] = useState("");
  const field = useRef(null);
  const end = useRef(null);
  useEffect(() => { if (field.current) field.current.focus(); }, [i]);
  useEffect(() => { if (end.current) end.current.scrollIntoView({ block: "end", behavior: "smooth" }); }, [log]);

  const now = Date.now();
  const saveProfile = (patch) => {
    const cur = profile.get("me") || { id: "me", createdAt: now };
    profile.save({ ...cur, ...patch, updatedAt: Date.now() });
  };

  /* o que cada resposta vira, e o que o Merlin diz que anotou */
  const apply = (key, value) => {
    if (key === "name") { saveProfile({ name: cleanName(value) || value }); return "anotei: " + (cleanName(value) || value); }
    if (key === "work") { saveProfile({ work: value }); return "anotei no seu perfil"; }
    if (key === "building") {
      const [name, ...rest] = value.split(/\s+[—–-]\s+|:\s+/);
      saveProfile({ building: value });
      /* quem já usava o Merlin costuma responder com um produto que já está lá */
      const same = apps.all().find((x) => foldKey(x.name) === foldKey(name));
      if (same) return "o produto “" + same.name + "” já estava em Produtos — anotei que é nele que você está agora";
      const app = { id: newId(), name: name.trim().slice(0, 120), pitch: rest.join(" — ").trim().slice(0, 300), createdAt: Date.now(), updatedAt: Date.now() };
      apps.save(app);
      return "criei o produto “" + app.name + "” em Produtos";
    }
    if (key === "github") {
      const login = value.replace(/^@/, "").replace(/^https?:\/\/github\.com\//, "").split(/[/\s]/)[0];
      saveProfile({ github: login });
      return "vou ler o que você entregar em github.com/" + login;
    }
    if (key === "window") {
      const w = parseWindow(value);
      if (!w) return null;
      savePrefs(w);
      return "seu dia vai de " + clock(w.dayStart) + " a " + clock(w.dayEnd);
    }
    if (key === "habit") {
      habits.save(normalizeHabit({ id: newId(), name: value.slice(0, 80), schedule: { type: "daily" }, order: 0, createdAt: Date.now() }));
      saveProfile({ habit: value });
      return "o hábito “" + value + "” entrou na sua lista de hoje";
    }
    return "";
  };

  /* o perfil já tinha tudo e só faltava a marca: não há o que perguntar */
  useEffect(() => { if (!steps.length) { saveProfile({ onboarded: true }); onDone(); } }, []);

  const next = (value) => {
    const step = steps[i];
    const out = [...log, { from: "me", text: value || "pular" }];
    if (value) {
      const note = apply(step.key, value);
      if (note === null) {
        setLog([...out, { from: "merlin", text: "Não entendi o horário. Me diz assim: 9 às 18." }]);
        setText("");
        return;
      }
      if (note) out.push({ from: "merlin", note: true, text: note });
    }
    const a = { ...answers, [step.key]: step.key === "name" ? cleanName(value) || value : value };
    setAnswers(a);
    setText("");
    if (i + 1 < steps.length) {
      out.push({ from: "merlin", text: steps[i + 1].ask(a, back, step.key === "name") });
      setLog(out);
      setI(i + 1);
    } else {
      out.push({ from: "merlin", text: "Pronto, " + (a.name || "") + "." + (back ? " Suas tarefas, notas e produtos continuam onde estavam." : "") +
        " A partir de agora eu pergunto pelo seu dia toda vez que você chegar. Vamos começar: o que precisa caber hoje?" });
      setLog(out);
      /* a marca espera a última fala: gravada antes, o início troca de tela na
         hora e o "pronto" nunca aparece. se a aba fechar nessa pausa, a volta
         encontra tudo respondido no perfil e só põe a marca */
      setTimeout(() => { saveProfile({ onboarded: true }); onDone(); }, 1600);
    }
  };

  const step = steps[i];
  if (!step) return null;
  return (
    <div className="ob">
      <div className="ob__log" aria-live="polite">
        {log.map((m, n) => (
          <p key={n} className={"ob__msg ob__msg--" + m.from + (m.note ? " is-note" : "")}>
            {m.note && icon("check")}{m.text}
          </p>
        ))}
        <span ref={end} />
      </div>
      <form className="ob__form" onSubmit={(e) => { e.preventDefault(); const v = text.trim(); if (v || !step.required) next(v); }}>
        <input ref={field} className="ob__field" value={text} maxLength="200" placeholder={step.placeholder}
               onChange={(e) => setText(e.currentTarget.value)} aria-label={step.ask(answers, back, false)} />
        {!step.required && <button type="button" className="ob__skip" onClick={() => next("")}>pular</button>}
        <button type="submit" className="ob__send" aria-label="Responder" disabled={step.required && !text.trim()}>{icon("arrow")}</button>
      </form>
    </div>
  );
}

/* ================================================================
   o campo do meio
   ================================================================
   um campo só, sem abas: o Merlin lê o que foi escrito e decide pela regra
   única (routeLine, no tasks.js) — com duração é tarefa de hoje, pergunta vai
   para a conversa, o resto vira ideia. a linha de baixo diz o que o Enter vai
   fazer ANTES de ele fazer, e todo destino tem desfazer no aviso.

   desde 10/10/2026, com sessão, o Merlin lê o que a regra não resolve
   (needsReading, no tasks.js): "ligar pro João amanhã às 15h", três tarefas
   numa linha, a ação escrita sem duração. ele devolve o que entendeu num
   cartão embaixo do campo, e nada é criado antes do ok. a pergunta não sai
   mais da tela: a resposta aparece no balão do Merlin, lá em cima. sem
   sessão, sem rede ou se a leitura falhar, vale a regra de antes. */
const ROUTE_ICON = { task: "check", ask: "spark", note: "pencil", read: "spark" };
const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/* "hoje", "amanhã" ou "sex 17/10": a data do jeito que se confere de relance */
function dayLabel(date, base) {
  if (!date || date === base) return "hoje";
  if (date === addDays(base, 1)) return "amanhã";
  const d = dateOf(date);
  return WEEKDAY[d.getDay()] + " " + String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
}
const draftMeta = (it, base) => it.kind === "note" ? "ideia"
  : [dayLabel(it.date, base), it.at, it.min ? (it.guess ? "~" : "") + fmt(it.min) : "", it.client].filter(Boolean).join(" · ");

/* o cliente volta da IA pelo nome; a tarefa guarda o id, como a @menção */
function clientId(name) {
  const k = foldKey(name);
  const c = k ? listClients().find((x) => foldKey(x.name) === k) : null;
  return c ? c.id : "";
}

/* a leitura: a lista do que a linha vira, ou null quando não deu (sem rede,
   cota, resposta torta) — e aí quem chamou segue pela regra */
async function readWithMerlin(text, context) {
  try {
    const r = await api("/merlin", { method: "POST", body: JSON.stringify({ task: "capture", context: { ...context, text } }) });
    return r && r.ok && r.body && Array.isArray(r.body.items) ? r.body.items : null;
  } catch (e) { return null; }
}

function Composer({ tasks, b, moment, smart, onAsk, readContext }) {
  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [draft, setDraft] = useState(null); // { text, items }: o que o Merlin entendeu, esperando o ok
  const field = useRef(null);
  const date = today();
  const route = routeLine(text);
  const willRead = smart && needsReading(text, route);

  const clear = () => {
    setText("");
    setDraft(null);
    if (field.current) field.current.focus();
  };

  /* o caminho da regra, sem rede: o de sempre, e o de quando a leitura falha */
  const byRule = (r) => {
    if (r.kind === "task") {
      const t = newTask({ title: r.title, min: r.min, reserved: r.reserved, clickup: r.clickup, client: r.client, date, order: topOrder(tasks.all(), date) });
      tasks.save(t);
      notify((r.reserved ? "reservado em hoje · " : "entrou em hoje · ") + formatMin(r.min), () => tasks.remove(t.id));
    } else {
      const n = newNote({ title: r.title, client: r.client });
      if (n) notify("guardado em ideias", () => collection("notes").remove(n.id));
    }
    clear();
  };

  const create = () => {
    const undo = [];
    let nTasks = 0, nNotes = 0;
    draft.items.forEach((it) => {
      const client = clientId(it.client);
      if (it.kind === "task") {
        const day = it.date || date;
        const at = it.at ? readClock(it.at) : null;
        const t = newTask({ title: stripPrefix(it.title), min: it.min, reserved: isReserve(it.title), client, date: day, at: at == null ? null : at, order: topOrder(tasks.all(), day) });
        tasks.save(t);
        undo.push(() => tasks.remove(t.id));
        nTasks++;
      } else {
        const n = newNote({ title: it.title, client });
        if (n) { undo.push(() => collection("notes").remove(n.id)); nNotes++; }
      }
    });
    const parts = [nTasks && nTasks + (nTasks === 1 ? " tarefa" : " tarefas"), nNotes && nNotes + (nNotes === 1 ? " ideia" : " ideias")].filter(Boolean);
    if (parts.length) notify(parts.join(" e ") + (nTasks + nNotes === 1 ? " criada" : " criadas"), () => undo.forEach((f) => f()));
    clear();
  };

  const submit = async () => {
    if (draft) { create(); return; }
    if (!route || reading) return;
    if (route.kind === "ask") { onAsk(route.text); clear(); return; }
    if (!willRead) { byRule(route); return; }
    const said = text;
    setReading(true);
    const items = await readWithMerlin(said, readContext());
    setReading(false);
    /* lista vazia é o Merlin dizendo que a linha inteira é uma pergunta */
    if (items && !items.length) { onAsk(said.trim()); clear(); return; }
    /* uma ideia só, onde a regra já via uma ideia: grava com as palavras da
       pessoa, sem cartão para confirmar o que não mudou */
    if (items && !(items.length === 1 && items[0].kind === "note" && route.kind === "note")) { setDraft({ text: said, items }); return; }
    byRule(route);
  };

  const drop = (i) => {
    const items = draft.items.filter((_, j) => j !== i);
    setDraft(items.length ? { ...draft, items } : null);
  };
  const asIdea = () => {
    const n = newNote({ title: draft.text.replace(/\s+/g, " ").trim() });
    if (n) notify("guardado em ideias", () => collection("notes").remove(n.id));
    clear();
  };

  const kind = reading || willRead ? "read" : route ? route.kind : "";
  const hint = reading ? "o Merlin está lendo…"
    : draft ? "Enter cria · Esc volta ao texto"
    : !route ? (smart ? "escreva do seu jeito: o Merlin separa tarefa, data, hora e ideia · a pergunta ele responde aqui em cima"
                      : "com a duração (45m, 1h30) entra em hoje · pergunta vai para o Merlin · o resto vira ideia")
    : route.kind === "ask" ? (smart ? "perguntar ao Merlin · a resposta aparece lá em cima" : "perguntar ao Merlin")
    : willRead ? "o Merlin lê e mostra o que entendeu antes de criar"
    : route.kind === "task" ? (route.reserved ? "reservar em hoje · " : "pôr em hoje · ") + fmt(route.min) + (route.reserved ? "" : route.min > b.slack ? " · não cabe hoje" : " · cabe")
    : "guardar em ideias · com a duração no fim, entra em hoje";

  return (
    <form className="hm-field" aria-busy={reading} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <textarea ref={field} rows={2} maxLength="300" value={text} autoFocus={moment === "start"}
                placeholder={smart ? "ligar pro João amanhã às 15h, uma pergunta, uma ideia — do seu jeito" : "uma tarefa (revisar a landing 45m), uma pergunta ou uma ideia"}
                onChange={(e) => { setText(e.currentTarget.value); if (draft) setDraft(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
                  else if (e.key === "Escape" && draft) { e.preventDefault(); setDraft(null); }
                }} />
      <div className="hm-field__foot">
        <span className="hm-field__hint" data-kind={kind} aria-live="polite">
          {kind && icon(ROUTE_ICON[kind])}{hint}
        </span>
        <button type="submit" className="hm-field__send" aria-label={route || draft ? hint : "Enviar"} disabled={reading || (!route && !draft)}>{icon("arrow")}</button>
      </div>
      {draft && (
        <div className="hm-draft">
          <p className="hm-draft__head">{icon("spark")}o Merlin entendeu</p>
          <ul className="hm-draft__list">
            {draft.items.map((it, i) => (
              <li key={i}>
                {icon(it.kind === "task" ? "check" : "pencil")}
                <span className="hm-draft__title">{it.title}</span>
                <span className="hm-draft__meta t-mono">{draftMeta(it, date)}</span>
                <button type="button" className="hm-draft__drop" aria-label={"Tirar " + it.title} title="tirar" onClick={() => drop(i)}>{icon("x")}</button>
              </li>
            ))}
          </ul>
          <div className="hm-draft__actions">
            <button type="button" className="pill" onClick={() => { setDraft(null); if (field.current) field.current.focus(); }}>voltar ao texto</button>
            <button type="button" className="pill" onClick={asIdea}>guardar como ideia</button>
            <button type="submit" className="pill pill--accent">{draft.items.length === 1 ? "criar" : "criar as " + draft.items.length}</button>
          </div>
        </div>
      )}
    </form>
  );
}

/* ================================================================
   fechar o dia
   ================================================================
   a pergunta da noite tem forma: o que ficou aberto hoje passa uma a uma —
   feito, amanhã ou largar — e depois o "como foi o dia". só então o dia
   conta na sequência. nada rola sozinho: é a pessoa que decide cada uma. */
function Closing({ tasks, journal, closes, date, onClose, gh }) {
  const doc = dayDoc(tasks.all(), date, readPrefs());
  const open = doc.tasks.filter((t) => !t.done && !t.reserved);
  const [fate, setFate] = useState({});
  const entry = journal.get(date);
  const [body, setBody] = useState((entry && entry.body) || "");
  const tally = { done: 0, moved: 0, dropped: 0 };
  Object.values(fate).forEach((f) => { tally[f]++; });

  const finish = () => {
    const tomorrow = addDays(date, 1);
    open.forEach((t) => {
      const f = fate[t.id];
      if (f === "done") tasks.save({ ...t, done: true, updatedAt: Date.now() });
      else if (f === "moved") tasks.save({ ...t, date: tomorrow, order: topOrder(tasks.all(), tomorrow), updatedAt: Date.now() });
      else if (f === "dropped") tasks.remove(t.id);
    });
    if (body.trim()) journal.save({ id: date, body: body.trim(), createdAt: (entry && entry.createdAt) || Date.now(), updatedAt: Date.now() });
    const done = doc.tasks.filter((t) => t.done && !t.reserved).length + tally.done;
    closes.save({ id: date, date, done, moved: tally.moved, dropped: tally.dropped, createdAt: Date.now(), updatedAt: Date.now() });
    notify("dia fechado. até amanhã.");
    onClose();
  };

  return (
    <div className="cl" role="dialog" aria-modal="true" aria-label="Fechar o dia" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cl__box">
        <p className="cl__eyebrow t-mono">fechar o dia</p>
        <h2>{open.length ? "O que ficou aberto, e o que fazemos com cada um?" : "Nada ficou aberto hoje."}</h2>
        {open.length > 0 && (
          <ul className="cl__list">
            {open.map((t) => (
              <li key={t.id}>
                <span className="cl__title">{t.title}<small className="t-mono">{fmt(costOf(t))}</small></span>
                <span className="cl__fates">
                  {[["done", "feito"], ["moved", "amanhã"], ["dropped", "largar"]].map(([id, label]) => (
                    <button key={id} type="button" aria-pressed={fate[t.id] === id} onClick={() => setFate({ ...fate, [t.id]: fate[t.id] === id ? undefined : id })}>{label}</button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
        {gh && (gh.commits.length > 0 || gh.prs.length > 0) && (
          <p className="cl__shipped">no GitHub hoje: <b>{gh.commits.length} {gh.commits.length === 1 ? "commit" : "commits"}</b> e <b>{gh.prs.length} {gh.prs.length === 1 ? "PR" : "PRs"}</b></p>
        )}
        <label className="cl__journal">
          <span>e como foi o dia?</span>
          <textarea rows={3} value={body} placeholder="o que fez, o que viveu, o que aprendeu…" onChange={(e) => setBody(e.currentTarget.value)} />
        </label>
        <div className="cl__actions">
          <button type="button" className="pill" onClick={onClose}>depois</button>
          <button type="button" className="pill pill--accent" onClick={finish}
                  disabled={open.some((t) => !fate[t.id])} title={open.some((t) => !fate[t.id]) ? "decida cada tarefa aberta" : ""}>
            fechar o dia
          </button>
        </div>
      </div>
    </div>
  );
}

/* a revisão da semana e do mês: a mesma pergunta, num horizonte maior */
function Review({ reviews, due }) {
  const cur = reviews.get(due.id);
  const [body, setBody] = useState((cur && cur.body) || "");
  const [open, setOpen] = useState(false);
  if (cur && cur.body && !open) return null;
  const isWeek = due.kind === "week";
  const save = () => {
    if (!body.trim()) return;
    reviews.save({ id: due.id, kind: due.kind, body: body.trim(), createdAt: (cur && cur.createdAt) || Date.now(), updatedAt: Date.now() });
    notify(isWeek ? "semana revisada" : "mês revisado");
    setOpen(false);
  };
  return (
    <section className="hm-card hm-review">
      <p className="hm-card__head">{isWeek ? NAV_ICONS.calendar : NAV_ICONS.plans}{isWeek ? "a semana" : "o mês"}</p>
      <p className="hm-review__q">{isWeek ? "Como foi a semana? O que muda na próxima?" : "Como foi o mês? O que fica e o que sai no próximo?"}</p>
      <textarea rows={3} value={body} onFocus={() => setOpen(true)} onChange={(e) => setBody(e.currentTarget.value)}
                placeholder={isWeek ? "o que andou, o que travou, a única coisa da próxima semana" : "o que o mês construiu, o que ficou pelo caminho"} />
      <div className="hm-review__actions">
        <button type="button" className="pill" onClick={() => askMerlin((isWeek ? "Me ajuda a revisar a minha semana. " : "Me ajuda a revisar o meu mês. ") + body)}>{icon("spark")}pensar com o Merlin</button>
        <button type="button" className="pill pill--accent" onClick={save} disabled={!body.trim()}>guardar</button>
      </div>
    </section>
  );
}

/* ================================================================
   os blocos do hoje
   ================================================================ */
function DayCard({ tasks, doc, b, slots, cut, sessions }) {
  const running = runningOf(sessions.all());
  const [slip, setSlip] = useState(null);
  const start = (t) => {
    const cur = runningOf(sessions.all());
    if (cur) sessions.save({ ...cur, end: Date.now(), updatedAt: Date.now() });
    const at = Date.now();
    sessions.save({ id: newId(), task: t.id, title: t.title, start: at, end: null, planned: t.min || 0, createdAt: at, updatedAt: at });
    setSlip(null);
  };
  const stop = () => {
    const cur = runningOf(sessions.all());
    if (!cur) return;
    const done = { ...cur, end: Date.now(), updatedAt: Date.now() };
    sessions.save(done);
    setSlip({ ...receipt(done), title: cur.title });
  };
  const open = b.open;
  const done = doc.tasks.filter((t) => t.done && !t.reserved).length;
  const width = (min) => ({ flex: "0 0 " + ((min / b.window) * 100) + "%" });
  const complete = (t) => {
    const cur = tasks.get(t.id);
    if (!cur || cur.done) return;
    tasks.save({ ...cur, done: true, updatedAt: Date.now() });
    notify(t.min ? "+" + longFmt(t.min) + " de volta pro dia" : "feita.", () => { const back = tasks.get(t.id); if (back) tasks.save({ ...back, done: false, updatedAt: Date.now() }); });
  };
  return (
    <section className="hm-card hm-day">
      <p className="hm-card__head">{NAV_ICONS.calendar}o dia <span className="hm-card__aside t-mono">{open.length} na fila · {done} feitas</span><a href="calendar.html" className="hm-card__go" aria-label="Abrir o dia">{icon("arrow")}</a></p>
      <p className="hm-day__n" data-tone={b.slack < 0 || b.overtime ? "over" : ""}>
        <b className="t-mono">{b.overtime ? clock(doc.end) : b.slack >= 0 ? (b.unestimated ? "~" : "") + fmt(b.slack) : fmt(b.overflow)}</b>
        <span>{b.overtime ? (open.length ? "passou, e ainda há fila" : "o dia acabou") : b.slack >= 0 ? "ainda cabe" : "além do que cabe"}</span>
      </p>
      {b.window > 0 && (
        <div className="hm-track" aria-hidden="true">
          {b.elapsed > 0 && <i className="is-spent" style={width(b.elapsed)} />}
          {b.liveReserve > 0 && <i className="is-reserved" style={width(b.liveReserve)} />}
          {open.map((t) => { const s = slots.get(t.id); return s ? <i key={t.id} className={"is-slot" + (s.guess ? " is-guess" : "")} style={width(s.min)} /> : null; })}
          {b.committed < b.remaining && <i className="is-free" />}
        </div>
      )}
      {running && (
        <p className="hm-focus"><i className="hm-focus__dot" />em foco · <b>{running.title}</b> <span className="t-mono">{longFmt(minutesOf(running))}{running.planned ? " / " + fmt(running.planned) : ""}</span>
          <button type="button" className="pill" onClick={stop}>parar</button></p>
      )}
      {slip && <p className="hm-slip">{slip.title} levou <b className="t-mono">{longFmt(slip.took)}</b>{slip.planned ? " de " + fmt(slip.planned) + " · " + slip.verdict : ""} <button type="button" onClick={() => setSlip(null)}>ok</button></p>}
      <ul className="hm-list">
        {open.slice(0, 6).map((t, i) => (
          <li key={t.id} className={cut >= 0 && i >= cut ? "is-out" : ""}>
            <button type="button" className="hm-check" aria-label={"Concluir " + t.title} onClick={() => complete(t)} />
            <span className="hm-list__title">{t.title}</span>
            <span className="t-mono hm-list__min">{fmt(costOf(t))}</span>
            {(!running || running.task !== t.id) && (
              <button type="button" className="hm-play" title="começar uma sessão de foco" aria-label={"Começar " + t.title} onClick={() => start(t)}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
              </button>
            )}
          </li>
        ))}
        {!open.length && <li className="hm-empty">nada na fila — escreva acima o que precisa caber</li>}
      </ul>
    </section>
  );
}

/* a semana: foco contra a meta, reunião contra o teto. o teto é limite, não
   meta — passar dele tira o destaque, do mesmo jeito que o dia que estoura */
function WeekCard({ me, sessions, tasks, date }) {
  const focus = focusMinutes(sessions.all(), date);
  const meet = meetingMinutes(tasks.all(), date);
  const goal = (+me.focusGoal || 0) * 60, cap = (+me.meetingCap || 0) * 60;
  const bar = (v, max) => ({ width: Math.min(100, max ? (v / max) * 100 : 0) + "%" });
  return (
    <section className="hm-card">
      <p className="hm-card__head">{NAV_ICONS.week}a semana<a href="profile.html" className="hm-card__go" aria-label="Mudar a meta e o teto">{icon("arrow")}</a></p>
      <div className="hm-meter">
        <span>foco</span><b className="t-mono">{longFmt(focus)}{goal ? " de " + fmt(goal) : ""}</b>
        {goal ? <i className="hm-meter__bar"><i style={bar(focus, goal)} /></i> : <a href="profile.html">definir a meta de horas</a>}
      </div>
      <div className="hm-meter" data-over={cap && meet > cap ? "yes" : "no"}>
        <span>reunião</span><b className="t-mono">{longFmt(meet)}{cap ? " · teto " + fmt(cap) : ""}</b>
        {cap ? <i className="hm-meter__bar"><i style={bar(meet, cap)} /></i> : <a href="profile.html">definir o teto de reunião</a>}
      </div>
    </section>
  );
}

function ShippedCard({ gh, login }) {
  const items = gh ? [...gh.prs.map((p) => ({ k: "PR " + (p.action === "merged" ? "mergeado" : p.action === "opened" ? "aberto" : p.action), t: p.title, r: p.repo })), ...gh.commits.map((c) => ({ k: "commit", t: c.message, r: c.repo }))] : [];
  return (
    <section className="hm-card">
      <p className="hm-card__head">{NAV_ICONS.apps}entregue hoje <span className="hm-card__aside t-mono">{gh ? gh.commits.length + " commits · " + gh.prs.length + " PRs" : ""}</span>
        <a href={"https://github.com/" + encodeURIComponent(login)} target="_blank" rel="noreferrer" className="hm-card__go" aria-label="Abrir o GitHub">{icon("arrow")}</a></p>
      <ul className="hm-list">
        {items.slice(0, 6).map((x, i) => (
          <li key={i}><span className="t-mono hm-list__at">{x.k}</span><span className="hm-list__title">{x.t}</span><span className="t-mono hm-list__min">{x.r}</span></li>
        ))}
        {!items.length && <li className="hm-empty">{gh ? "nada público no GitHub hoje ainda" : "lendo o GitHub…"}</li>}
      </ul>
    </section>
  );
}

function habitStreak(h, day) {
  let n = 0, d = h.marks[day] ? day : addDays(day, -1);
  while (h.marks[d]) { n++; d = addDays(d, -1); }
  return n;
}

// Distribui os cards em colunas independentes, na ordem de leitura (1ª, 2ª, 3ª, 1ª…),
// para um card alto não abrir buraco na linha de baixo. No celular as colunas
// se desfazem e o `order` devolve a sequência original.
function Columns({ n, children }) {
  const items = Children.toArray(children).filter(Boolean);
  const cols = Array.from({ length: n }, () => []);
  items.forEach((el, i) => cols[i % n].push(<div key={el.key} className="hm-cell" style={{ order: i }}>{el}</div>));
  return <div className="hm-grid">{cols.map((c, i) => <div key={i} className="hm-col">{c}</div>)}</div>;
}

function HabitsCard({ habits, date }) {
  const list = habits.all().filter((h) => !h.archived && isExpected(h, date)).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  const marked = list.filter((h) => h.marks[date]).length;
  return (
    <section className="hm-card">
      <p className="hm-card__head">{NAV_ICONS.habits}hábitos de hoje <span className="hm-card__aside t-mono">{marked}/{list.length}</span><a href="habits.html" className="hm-card__go" aria-label="Abrir os hábitos">{icon("arrow")}</a></p>
      <ul className="hm-list">
        {list.map((h) => (
          <li key={h.id}>
            <button type="button" className={"hm-check" + (h.marks[date] ? " is-done" : "")} aria-label={(h.marks[date] ? "desmarcar " : "marcar ") + h.name}
                    onClick={() => toggleMark(habits, h, date, date)}>{h.marks[date] && icon("check")}</button>
            <span className="hm-list__title">{h.name}</span>
            <span className="t-mono hm-list__min">{habitStreak(h, date) ? habitStreak(h, date) + "d" : ""}</span>
          </li>
        ))}
        {!list.length && <li className="hm-empty">nenhum hábito para hoje — <a href="habits.html">criar um</a></li>}
      </ul>
    </section>
  );
}

function AgendaCard({ doc }) {
  const timed = doc.tasks.filter((t) => t.at != null && !t.done).sort((a, b) => a.at - b.at);
  return (
    <section className="hm-card">
      <p className="hm-card__head">{NAV_ICONS.routine}agenda <a href="calendar.html#week" className="hm-card__go" aria-label="Abrir a semana">{icon("arrow")}</a></p>
      <ul className="hm-list">
        {timed.map((t) => (
          <li key={t.id}>
            <span className="t-mono hm-list__at">{clock(t.at)}</span>
            <span className="hm-list__title">{t.title}</span>
            <span className="t-mono hm-list__min">{t.min ? fmt(t.min) : ""}</span>
          </li>
        ))}
        {!timed.length && <li className="hm-empty">nada com hora marcada hoje</li>}
      </ul>
    </section>
  );
}

/* ================================================================
   o GitHub do dia (VISAO, 11)
   ================================================================
   o navegador lê os eventos públicos do usuário direto da api.github.com —
   nada passa pelo servidor e nenhum token é guardado. uma leitura por hora
   (a API sem token aceita 60 por hora por IP), guardada no navegador. */
const GH_KEY = "merlin:github";
function useGithub(login, day) {
  const [data, setData] = useState(() => {
    try { const c = JSON.parse(localStorage.getItem(GH_KEY)); return c && c.login === login && c.day === day ? c : null; } catch (e) { return null; }
  });
  useEffect(() => {
    if (!login) return;
    if (data && data.login === login && data.day === day && Date.now() - data.at < 3600e3) return;
    fetch("https://api.github.com/users/" + encodeURIComponent(login) + "/events/public?per_page=100")
      .then((r) => (r.ok ? r.json() : null))
      .then((events) => {
        if (!events) return;
        const d = { login, day, at: Date.now(), ...githubDay(events, day) };
        setData(d);
        try { localStorage.setItem(GH_KEY, JSON.stringify(d)); } catch (e) {}
      })
      .catch(() => {});
  }, [login, day]);
  return data && data.login === login && data.day === day ? data : null;
}

/* ================================================================
   a fala do Merlin
   ================================================================
   a pergunta do alto é fixa; embaixo dela o Merlin fala do dia de VERDADE —
   a fila, a sobra, os hábitos, a sequência — escrito pela IA (a tarefa
   "checkin" do worker, que já recebe o perfil). uma vez por momento do dia
   (manhã, tarde, noite), guardada no navegador: voltar ao início não gasta
   outro conselho. sem sessão, sem rede ou sem chave, fica só a pergunta. */
const CHECKIN_KEY = "merlin:checkin";
function useCheckin(signedIn, key, buildContext) {
  const [text, setText] = useState(() => {
    try { const c = JSON.parse(localStorage.getItem(CHECKIN_KEY)); return c && c.key === key ? c.text : ""; } catch (e) { return ""; }
  });
  const asked = useRef("");
  useEffect(() => {
    if (!signedIn || text || asked.current === key) return;
    asked.current = key;
    api("/merlin", { method: "POST", body: JSON.stringify({ task: "checkin", context: buildContext() }) })
      .then((r) => {
        const t = r && r.ok && r.body && String(r.body.text || "").trim();
        if (!t) return;
        setText(t);
        try { localStorage.setItem(CHECKIN_KEY, JSON.stringify({ key, text: t })); } catch (e) {}
      })
      .catch(() => {});
  }, [signedIn, key]);
  return text;
}

/* ================================================================
   o início
   ================================================================ */
function Home() {
  const c = useCloud();
  const profile = useCollection("profile");
  const tasks = useCollection("tasks", { normalize: normalizeTask });
  const habits = useCollection("habits", { normalize: normalizeHabit });
  const journal = useCollection("journal");
  const closes = useCollection("closes");
  const reviews = useCollection("reviews");
  const apps = useCollection("apps");
  const sessions = useCollection("sessions");
  useCollection("prefs");
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  const [, redraw] = useState(0);

  const me = profile.get("me");
  /* o nome que já foi gravado com o til sobrando é corrigido uma vez, para
     que o conselheiro (que lê o perfil no servidor) também pare de usá-lo */
  useEffect(() => {
    if (me && me.name && cleanName(me.name) && cleanName(me.name) !== me.name) profile.save({ ...me, name: cleanName(me.name), updatedAt: Date.now() });
  }, [me && me.name]);
  const gh = useGithub(me && me.github, today());
  const h = hourNow();
  const phase = phaseOf(h);
  const date = today();

  /* o onboarding é um estado (core.js, onboardingState), e não só a falta do
     perfil: com sessão, num aparelho novo, o perfil ainda está a caminho, e
     abrir a conversa nessa hora faria quem já passou por ela responder de
     novo — e criar o produto e o hábito outra vez. até saber, só a floresta */
  useEffect(() => { onboardingSettled().then(() => redraw((n) => n + 1)); }, []);
  const state = onboardingState();
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("onboarding", state !== "done");
    return () => document.documentElement.classList.remove("onboarding");
  }, [state]);

  if (state !== "done") {
    return (
      <div className="hm hm--onboarding">
        <div className="hm-scene"><Forest phase={phase} /></div>
        {state === "pending" && (
          <Onboarding profile={profile} apps={apps} habits={habits}
                      veteran={isVeteran(me, [tasks, apps, habits, collection("notes")])}
                      onDone={() => redraw((n) => n + 1)} />
        )}
      </div>
    );
  }
  return <Today c={c} tasks={tasks} habits={habits} journal={journal} closes={closes} reviews={reviews}
                apps={apps} sessions={sessions} me={me} gh={gh} h={h} phase={phase} date={date} />;
}

/* o dia em poucas linhas, para a pergunta feita no início chegar ao Merlin
   sabendo o mesmo que a fala dele sabe */
const briefOf = (x) => [
  "Agora " + x.hour + " · janela " + x.window + " · " + x.slack,
  "Fila aberta: " + (x.open.join("; ") || "nada"),
  "Feitas hoje: " + (x.done.join("; ") || "nada"),
  x.late ? "Abertas de dias anteriores: " + x.late : "",
  "Hábitos de hoje: " + (x.habits.join("; ") || "nenhum"),
  "Foco na semana: " + x.focusWeek + " · reunião na semana: " + x.meetingWeek
].filter(Boolean).join("\n");

/* o dia de quem já passou pelo onboarding. é um componente à parte porque o
   onboarding volta antes: os hooks daqui (a fala do Merlin) não podem
   aparecer de repente no meio do mesmo componente quando ele termina */
function Today({ c, tasks, habits, journal, closes, reviews, apps, sessions, me, gh, h, phase, date }) {
  const [closing, setClosing] = useState(false);
  const moment = momentOf(h);
  const doc = dayDoc(tasks.all(), date, readPrefs());
  const { b, slots, cut } = distribute(doc);
  const closed = closes.get(date);
  const streak = streakOf(closes, date);
  const late = overdue(tasks.all(), date).length;
  const name = cleanName(me.name || (c.email ? String(c.email).split("@")[0] : ""));
  const due = reviewsDue(date, h);
  const dayContext = () => ({
    moment: closed ? "close" : moment,
    hour: clock(h * 60 + new Date().getMinutes()),
    window: clock(doc.start) + "–" + clock(doc.end),
    slack: b.overtime ? "o dia já acabou" : b.slack >= 0 ? "cabem " + fmt(b.slack) : "passa " + fmt(b.overflow) + " do que cabe",
    open: b.open.map((t) => t.title + " · " + fmt(costOf(t))),
    done: doc.tasks.filter((t) => t.done && !t.reserved).map((t) => t.title),
    late,
    habits: habits.all().filter((x) => !x.archived && isExpected(x, date)).map((x) => x.name + (x.marks[date] ? " (feito)" : "")),
    streak,
    products: apps.all().map((a) => a.name).slice(0, 5),
    github: gh ? [...gh.prs.map((p) => "PR " + p.action + ": " + p.title), ...gh.commits.map((c) => c.repo + ": " + c.message)].slice(0, 12) : [],
    focusWeek: fmt(focusMinutes(sessions.all(), date)) + (me.focusGoal ? " de " + me.focusGoal + "h" : ""),
    meetingWeek: fmt(meetingMinutes(tasks.all(), date)) + (me.meetingCap ? " (teto " + me.meetingCap + "h)" : "")
  });
  const saying = useCheckin(c.signedIn, date + ":" + moment + (closed ? ":closed" : ""), dayContext);
  const readContext = () => ({
    today: date + " (" + new Date().toLocaleDateString("pt-BR", { weekday: "long" }) + ")",
    hour: clock(h * 60 + new Date().getMinutes()),
    window: clock(doc.start) + "–" + clock(doc.end),
    clients: listClients().map((x) => x.name)
  });

  /* a pergunta feita aqui é respondida aqui, no balão do Merlin. vira uma
     conversa de verdade (a coleção `chats`, a mesma da tela do assistente):
     dá para continuar lá, e a próxima pergunta daqui segue o fio desta. */
  const chats = useCollection("chats", { normalize: normalizeChat });
  const [talk, setTalk] = useState([]);
  const [asking, setAsking] = useState(false);
  const [proposal, setProposal] = useState(null);
  const talkId = useRef("");
  const keepTalk = (list) => {
    setTalk(list);
    if (!talkId.current) talkId.current = newId();
    const before = chats.get(talkId.current);
    const now = Date.now();
    chats.save({ id: talkId.current, title: chatTitle(list), messages: list.slice(-MAX_TURNS), createdAt: before ? before.createdAt : now, updatedAt: now });
  };
  const ask = async (q) => {
    if (!c.signedIn) { askMerlin(q); return; }
    if (asking) return;
    const mine = talk.concat([{ from: "me", text: q }]);
    setTalk(mine);
    setAsking(true);
    let reply;
    try {
      const r = await api("/merlin", { method: "POST", body: JSON.stringify({
        task: "assistant",
        context: { message: q, page: "home", pageContext: briefOf(dayContext()), history: turnsOf(talk) }
      }) });
      const s = r.ok && (r.body.suggestions || [])[0];
      const said = r.ok ? r.body.clarify : (r.body && r.body.error) || "não consegui pensar nisso agora";
      reply = [said && { from: "merlin", text: said }, s && { from: "merlin", proposal: s }].filter(Boolean);
      if (!reply.length) reply = [{ from: "merlin", text: "não entendi bem — pode dizer de outro jeito?" }];
    } catch (e) {
      reply = [{ from: "merlin", text: "não consegui falar com o Merlin" }];
    }
    setAsking(false);
    keepTalk(mine.concat(reply));
  };
  const lastQ = talk.map((m) => m.from).lastIndexOf("me");

  return (
    <div className="hm">
      <div className="hm-scene"><Forest phase={phase} /></div>
      <header className="hm-hero">
        <h1>{greet(h)}{name ? ", " + name : ""}. {closed ? "Dia fechado." : QUESTION[moment]}</h1>
        <p className="hm-hero__sub">
          {streak > 0
            ? <>{streak} {streak === 1 ? "dia fechado" : "dias seguidos fechando o dia"}</>
            : "feche o dia hoje à noite para começar a sua sequência"}
          {late > 0 && <> · <a href="calendar.html#day">{late} {late === 1 ? "aberta" : "abertas"} de antes de hoje</a></>}
        </p>
        {talk.length > 0
          ? <div className="hm-hero__merlin hm-talk" aria-live="polite">
              {icon("spark")}
              <div className="hm-talk__body">
                {lastQ >= 0 && <p className="hm-talk__q">{talk[lastQ].text}</p>}
                {asking
                  ? <p className="hm-talk__wait">pensando…</p>
                  : talk.slice(lastQ + 1).map((m, i) => m.proposal
                      ? <button key={i} type="button" className="pill pill--accent hm-talk__do" onClick={() => setProposal(m.proposal)}>{icon("spark")}{m.proposal.title}</button>
                      : <Markdown key={i} className="hm-talk__a" text={m.text} />)}
                {!asking && (
                  <p className="hm-talk__foot">
                    <a href={"assistant.html#" + talkId.current}>continuar na conversa</a>
                    <button type="button" onClick={() => { setTalk([]); talkId.current = ""; }}>voltar ao dia</button>
                  </p>
                )}
              </div>
            </div>
          : saying && <p className="hm-hero__merlin">{icon("spark")}{saying}</p>}
      </header>

      <div className="hm-center">
        <Composer tasks={tasks} b={b} moment={moment} smart={c.signedIn} onAsk={ask} readContext={readContext} />
        {moment === "close" && !closed && (
          <button type="button" className="hm-close" onClick={() => setClosing(true)}>{icon("check")}fechar o dia</button>
        )}
        {closed && <p className="hm-closed t-mono">fechado às {new Date(closed.createdAt).toTimeString().slice(0, 5)} · {closed.done} feitas · {closed.moved} para amanhã</p>}
      </div>

      <p className="hm-label t-mono">hoje</p>
      <Columns n={3}>
        <DayCard key="day" tasks={tasks} doc={doc} b={b} slots={slots} cut={cut} sessions={sessions} />
        <HabitsCard key="habits" habits={habits} date={date} />
        <AgendaCard key="agenda" doc={doc} />
        <WeekCard key="week" me={me} sessions={sessions} tasks={tasks} date={date} />
        {me.github && <ShippedCard key="shipped" gh={gh} login={me.github} />}
        {due.map((d) => <Review key={d.id} reviews={reviews} due={d} />)}
      </Columns>

      {closing && <Closing tasks={tasks} journal={journal} closes={closes} date={date} gh={gh} onClose={() => setClosing(false)} />}
      {proposal && <ProposalDialog proposal={proposal} onClose={() => setProposal(null)} />}
    </div>
  );
}

function Root() {
  const c = useCloud();
  const [bare, setBare] = useState(door);
  const showDoor = bare && !c.signedIn;
  useLayoutEffect(() => { document.documentElement.classList.toggle("bare", showDoor); }, [showDoor]);
  useEffect(() => { if (bare && c.signedIn) { markSeen("landing"); setBare(false); } }, [bare, c.signedIn]);
  return showDoor ? <Landing onGuest={() => { markSeen("landing"); setBare(false); }} /> : <Home />;
}

mount(<Root />, "app");
