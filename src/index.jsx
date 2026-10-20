/* merlin · o início
   a primeira tela de quem entra, e desde 10/10/2026 ela é uma CONVERSA
   (VISAO, 10): o Merlin é um assistente pessoal, e o início é onde ele
   pergunta. desde 17/10/2026 (a secretária, docs/prd/a-secretaria.md) a tela
   é só isso: "Bom dia, Arthur. Como posso te ajudar hoje?" e o campo, sobre a
   floresta. o dia inteiro e os hábitos moram no calendário; fechar o dia e
   revisar a semana ou o mês se pedem escrevendo no campo (askIntent, no
   tasks.js), sem crédito.

   quem chega pela primeira vez passa por um onboarding que é a mesma
   conversa: o nome, com o que trabalha, o que está construindo, a janela do
   dia e um hábito. cada resposta cria o documento na hora (o perfil, o
   produto, a janela, o hábito), e o perfil vai junto em todo pedido ao
   conselheiro (worker.js, profileOf) — é isso que o faz falar com uma pessoa.

   em volta, a floresta (shared/forest.jsx), que acompanha a hora.

   quem nunca esteve aqui e não entrou vê antes a porta: a landing, que é
   HTML estático no index.html e ganha vida no landing.jsx. */
import "./shared/base.css";
import "./index.css";
import {
  initPage, seen, markSeen, isNewHere, today, addDays, sundayOf, dateOf, notify, newId, cloud,
  newNote, askMerlin, readPrefs, savePrefs, prefsStore, formatMin, collection, api, listClients, foldKey,
  onboardingState, onboardingSettled
} from "./shared/core.js";
import { Fragment, useState, useEffect, useLayoutEffect, useRef } from "react";
import { mount, useCloud, useCollection, icon, Markdown, ProposalDialog, HabitProposal, HabitForm } from "./shared/ui.jsx";
import {
  normalize as normalizeTask, dayDoc, topOrder, newTask, routeLine, readClock,
  needsReading, isReserve, stripPrefix, askIntent, dayTasks, collectInbox
} from "./shared/tasks.js";
import { normalize as normalizeBlock, copyRoutine } from "./shared/routine.js";
import { MAX_TURNS, normalizeChat, chatTitle, turnsOf, markProposal } from "./shared/assistant-actions.js";
import { normalize as normalizeFinance, configOf, contextOf as financeContext, newEntry, undoEntry, entryLine, captureContext, bookCollection } from "./shared/finance-data.js";
import { BUILD, buildIntent } from "./shared/build-intent.js";
import { normalize as normalizeHabit, habitStatus, markOn, undoHabit, markWhen } from "./shared/habits-data.js";
import { normalize as normalizeSleep, sleepDoc, sleepLabel, sleepLine, nightOf, undoSleep } from "./shared/sleep-data.js";
import { normalize as normalizeWorkout, workoutDay, trainingHabit, logWorkout, applyWorkout } from "./shared/workouts-data.js";
import { normalize as normalizeOp } from "./shared/ops-data.js";
import { normalize as normalizeMeal, MEALS, mealDay, mealDoc, mealLine } from "./shared/meals-data.js";
import { distribute, fmt, clock, costOf } from "./shared/day.js";
import { Forest, phaseOf } from "./shared/forest.jsx";
import { githubDay } from "./shared/focus.js";
import { Tour } from "./shared/tour.jsx";
import { usePortrait } from "./shared/use-portrait.js";
import { sourcesLine } from "./shared/portrait.js";
import { questsOf, questsText } from "./shared/quests.js";
import { QuestCard } from "./shared/quest-card.jsx";

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

/* a revisão se pede a qualquer dia: "revisar a semana" numa terça abre a da
   semana corrente. a chave da semana é o domingo em que ela começou, como no
   calendário */
function weekKey(day) {
  const d = dateOf(day);
  d.setDate(d.getDate() - d.getDay());
  return "w-" + d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
const monthKey = (day) => "m-" + day.slice(0, 7);

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
   para a conversa, o resto vira nota. a linha de baixo diz o que o Enter vai
   fazer ANTES de ele fazer, e todo destino tem desfazer no aviso.

   desde 10/10/2026, com sessão, o Merlin lê o que a regra não resolve
   (needsReading, no tasks.js): "ligar pro João amanhã às 15h", três tarefas
   numa linha, a ação escrita sem duração. ele devolve o que entendeu num
   cartão embaixo do campo, e nada é criado antes do ok. a pergunta não sai
   mais da tela: a resposta aparece no balão do Merlin, lá em cima. sem
   sessão, sem rede ou se a leitura falhar, vale a regra de antes.

   desde 17/10/2026 a leitura também devolve dinheiro ("gastei 45 no almoço",
   "paguei o aluguel"): o cartão mostra o lançamento, e o Enter o grava no
   financeiro junto com as tarefas e as notas, com um desfazer só. o que veio
   sem valor fica no cartão e se lança pela caixa de proposta.

   desde 18/10/2026 também devolve hábito ("treinei", "ontem li 20 páginas"):
   o que existe e não está marcado se marca no Enter, com o mesmo desfazer; o
   que já estava marcado só diz isso; o que não existe espera no cartão o
   "criar e marcar", que abre a caixa de novo hábito preenchida.

   desde 20/10/2026 também devolve sono ("dormi 7h", "ontem dormi 6h"): o
   Enter grava a noite na aba sono, no dia em que se acordou, com o mesmo
   desfazer (que devolve a noite de antes, se substituiu). o que veio sem as
   horas espera no cartão e se registra pela caixa de proposta.

   e treino ("treinei perna 40min", "ontem corri 30 min"): o Enter grava o
   treino na aba treino e marca, no mesmo dia, o hábito de treino, se houver;
   o desfazer apaga o treino e tira só a marca que ele pôs. o que veio sem os
   minutos espera no cartão, como o sono sem as horas. "treinei" sozinho
   continua sendo o hábito.

   e refeição ("almocei salada", "comi uma maçã"): o cartão mostra a refeição
   num seletor, que a pessoa troca ali mesmo se o Merlin escolheu errado pelo
   horário, e o Enter a anota na aba alimentação; o desfazer a apaga. "gastei
   45 no almoço" continua sendo gasto.

   o pedido de montar ("monta um funil pra consultoria", "quero um app de
   agenda") não é tarefa nem pergunta: vai para a conversa do assistente, que
   pergunta o que falta e mostra o rascunho (shared/build.js). a duração
   continua mandando — "montar o funil 2h" é tarefa de hoje.

   "fechar o dia", "revisar a semana" e "revisar o mês" (askIntent) passam
   antes de tudo isso: abrem o fechamento e a revisão aqui mesmo, sem rede.
   "o que falta hoje?" também: responde com o cartão da próxima coisa
   (shared/quest-card.jsx) no balão, sem pedido ao Merlin. */
const ROUTE_ICON = { task: "check", ask: "spark", note: "pencil", read: "spark", build: "spark", close: "check", review: "pencil", quests: "check" };
const INTENT_HINT = {
  quests: "o que falta hoje · a próxima coisa aparece aqui em cima",
  close: "fechar o dia · decidir o que ficou aberto e escrever como foi",
  week: "revisar a semana · como foi e o que muda na próxima",
  month: "revisar o mês · o que fica e o que sai no próximo"
};
const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/* "hoje", "amanhã" ou "sex 17/10": a data do jeito que se confere de relance */
function dayLabel(date, base) {
  if (!date || date === base) return "hoje";
  if (date === addDays(base, 1)) return "amanhã";
  const d = dateOf(date);
  return WEEKDAY[d.getDay()] + " " + String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
}
/* o hábito lido, do jeito que o cartão o mostra: "marca hoje", "já estava
   marcado" ou "não existe" */
const habitMeta = (st, base) => st.error ? st.error : !st.habit ? "não existe" : st.already ? "✓ já estava marcado" + (st.day === base ? "" : " · " + markWhen(st.day, base)) : "marca " + markWhen(st.day, base);
/* a noite lida: "noite de hoje", "noite de 19/10", ou o que falta */
function sleepMeta(it, base) {
  const { day, error } = nightOf(it, base);
  if (error) return error;
  if (!it.min) return "faltam as horas";
  return "noite de " + (day === base ? "hoje" : day.slice(8, 10) + "/" + day.slice(5, 7));
}
/* o treino lido: "40 min · hoje · marca treinar", ou o que falta */
function workoutMeta(it, base, habitsNow) {
  const { day, error } = workoutDay(it, base);
  if (error) return error;
  if (!it.min) return "faltam os minutos";
  const h = trainingHabit(habitsNow, it.title);
  return [it.min + " min", day === base ? "hoje" : markWhen(day, base), h && !h.marks[day] ? "marca " + h.name : ""].filter(Boolean).join(" · ");
}
/* a refeição lida: "hoje", "ontem", "19/10", ou o dia que não chegou */
function mealMeta(it, base) {
  const { day, error } = mealDay(it, base);
  return error || markWhen(day, base);
}
const draftMeta = (it, base, money, habitsNow) => it.kind === "note" ? "nota"
  : it.kind === "money" ? entryLine(it, base, money)
  : it.kind === "habit" ? habitMeta(habitStatus(habitsNow, it, base), base)
  : it.kind === "sleep" ? sleepMeta(it, base)
  : it.kind === "workout" ? workoutMeta(it, base, habitsNow)
  : it.kind === "meal" ? mealMeta(it, base)
  : [dayLabel(it.date, base), it.at, it.min ? (it.guess ? "~" : "") + fmt(it.min) : "", it.client].filter(Boolean).join(" · ");
const DRAFT_ICON = { task: "check", note: "pencil", money: "finance", habit: "habits", sleep: "sleep", workout: "workout", meal: "meal" };
/* o hábito que existe aparece com o nome dele; o que não existe, como foi dito */
const draftTitle = (it, habitsNow, base) => it.kind === "sleep" ? (it.min ? sleepLabel(it.min) + " de sono" : "sono")
  : it.kind === "workout" ? it.title || "treino"
  : it.kind === "meal" ? it.text
  : it.kind !== "habit" ? it.title : (habitStatus(habitsNow, it, base).habit || it).name;

/* o gasto ou a entrada lidos na linha, como a caixa de proposta os recebe: é
   por ela que se lança o que veio sem valor */
const moneyProposal = (it) => ({
  actionType: "finance-entry", title: it.title, note: "",
  payload: { name: it.title, amount: it.amount, kind: it.flow, day: it.date, category: it.category, paid: it.paid, confirm: it.confirm, fixed: it.fixed }
});
/* o sono lido sem as horas, como a caixa de proposta o recebe */
const sleepProposal = (it) => ({ actionType: "sleep-log", title: "registrar sono", note: "", payload: { min: it.min, date: it.date } });
/* e o treino sem os minutos */
const workoutProposal = (it) => ({ actionType: "workout-log", title: "registrar treino", note: "", payload: { title: it.title, min: it.min, date: it.date } });

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

function Composer({ tasks, habits, b, smart, onAsk, onIntent, readContext }) {
  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [draft, setDraft] = useState(null); // { text, items }: o que o Merlin entendeu, esperando o ok
  const [boxed, setBoxed] = useState(-1); // o item do cartão aberto na caixa de proposta
  const field = useRef(null);
  const date = today();
  const intent = askIntent(text);
  /* o financeiro aberto aqui para descer da nuvem (core.js, ensureSynced): a
     leitura precisa das categorias, dos previstos e dos fixos de verdade. o
     campo do início lança no livro pessoal: o da empresa entra pela conversa,
     com o seletor "pessoal | empresa" na caixa */
  const finance = bookCollection(useCollection("finance", { normalize: normalizeFinance }), "personal");
  const money = financeContext(finance);
  const habitsNow = habits.all();
  const habitOf = (it) => habitStatus(habitsNow, it, date);
  const sleep = useCollection("sleep", { normalize: normalizeSleep });
  const workouts = useCollection("workouts", { normalize: normalizeWorkout });
  const meals = useCollection("meals", { normalize: normalizeMeal });
  /* o que ainda não pode ser criado: o gasto sem valor só se lança pela caixa,
     o hábito que não existe, pela caixa de novo hábito, e o sono sem as
     horas e o treino sem os minutos, pela caixa de proposta */
  const missing = (it) => it.kind === "money" ? !!newEntry(it, configOf(finance), money, date).error
    : it.kind === "habit" ? !habitOf(it).error && !habitOf(it).habit
    : it.kind === "sleep" ? !nightOf(it, date).error && !it.min
    : it.kind === "workout" ? !workoutDay(it, date).error && !it.min
    : false;
  /* o que não tem o que fazer: o hábito que já estava marcado, ou o hábito, a
     noite, o treino e a refeição de um dia que ainda não chegou. o Enter o
     tira do cartão sem gravar nada */
  const idle = (it) => it.kind === "habit" ? !!habitOf(it).error || habitOf(it).already
    : it.kind === "sleep" ? !!nightOf(it, date).error
    : it.kind === "workout" ? !!workoutDay(it, date).error
    : it.kind === "meal" ? !!mealDay(it, date).error
    : false;
  const route = routeLine(text);
  const build = !intent && route && route.kind !== "task" ? buildIntent(text) : null;
  const willRead = smart && !intent && !build && needsReading(text, route);

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
      if (n) notify("guardado em notas", () => collection("notes").remove(n.id));
    }
    clear();
  };

  const create = () => {
    /* o que veio sem valor fica no cartão, esperando a caixa; sem nada pronto,
       o Enter abre a caixa do primeiro */
    const ready = draft.items.filter((it) => !missing(it) && !idle(it));
    const waiting = draft.items.filter(missing);
    if (!ready.length) { if (waiting.length) setBoxed(draft.items.indexOf(waiting[0])); else clear(); return; }
    const undo = [];
    const marked = [];
    const slept = [];
    const trained = [];
    const ate = [];
    let nTasks = 0, nNotes = 0, nMoney = 0;
    ready.forEach((it) => {
      const client = clientId(it.client);
      if (it.kind === "habit") {
        /* lido de novo a cada item: o mesmo hábito duas vezes na linha marca uma vez só */
        const st = habitStatus(habits.all(), it, date);
        const { doc, already } = markOn(st.habit, st.day, date);
        if (already) return;
        const back = undoHabit(st.habit, doc);
        habits.save(doc);
        undo.push(() => habits.save({ ...back.save, updatedAt: Date.now() }));
        marked.push(doc.name + " marcado " + markWhen(st.day, date));
      } else if (it.kind === "sleep") {
        /* um documento por noite: a segunda leitura do mesmo dia substitui */
        const before = sleep.get(nightOf(it, date).day);
        const { doc } = sleepDoc(it, before, date);
        if (!doc) return;
        sleep.save(doc);
        const back = undoSleep(before, doc);
        undo.push(() => { if (back.remove) sleep.remove(back.remove); else sleep.save({ ...back.save, updatedAt: Date.now() }); });
        slept.push("✓ registrado · " + sleepLine(doc.min, doc.id, date));
      } else if (it.kind === "workout") {
        /* lido com os hábitos de agora: o segundo treino do dia não marca de novo */
        const res = logWorkout(it, habits.all(), date);
        if (res.error) return;
        undo.push(applyWorkout(workouts, habits, res));
        trained.push("✓ registrado · " + res.line);
      } else if (it.kind === "meal") {
        const { doc } = mealDoc(it, null, date);
        if (!doc) return;
        meals.save(doc);
        undo.push(() => meals.remove(doc.id));
        ate.push("✓ anotado · " + mealLine(doc, date));
      } else if (it.kind === "money") {
        const { doc } = newEntry({ ...it, chat: "home" }, configOf(finance), financeContext(finance), date);
        const before = finance.get(doc.id);
        finance.save(doc);
        const back = undoEntry(before, doc);
        undo.push(() => { if (back.remove) finance.remove(back.remove); else finance.save(back.save); });
        nMoney++;
      } else if (it.kind === "task") {
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
    const parts = [nTasks && nTasks + (nTasks === 1 ? " tarefa" : " tarefas"), nNotes && nNotes + (nNotes === 1 ? " nota" : " notas")].filter(Boolean);
    const said = [
      parts.length && parts.join(" e ") + (nTasks + nNotes === 1 ? " criada" : " criadas"),
      nMoney && (nMoney === 1 ? "lançado no financeiro" : nMoney + " lançados no financeiro"),
      marked.length && (marked.length === 1 ? marked[0] : marked.length + " hábitos marcados"),
      slept.length && (slept.length === 1 ? slept[0] : slept.length + " noites registradas"),
      trained.length && (trained.length === 1 ? trained[0] : trained.length + " treinos registrados"),
      ate.length && (ate.length === 1 ? ate[0] : ate.length + " refeições anotadas")
    ].filter(Boolean);
    /* do último para o primeiro: a mesma noite lida duas vezes volta à de antes */
    if (said.length) notify(said.join(" · "), () => undo.slice().reverse().forEach((f) => f()));
    if (waiting.length) setDraft({ ...draft, items: waiting });
    else clear();
  };

  const submit = async () => {
    if (draft) { create(); return; }
    if (!route || reading) return;
    if (intent) { onIntent(intent, text.trim()); clear(); return; }
    if (build) { askMerlin(text.trim()); clear(); return; }
    if (route.kind === "ask") { onAsk(route.text); clear(); return; }
    if (!willRead) { byRule(route); return; }
    const said = text;
    setReading(true);
    const items = await readWithMerlin(said, {
      ...readContext(), ...captureContext(configOf(finance), financeContext(finance), date),
      habits: habits.all().filter((x) => !x.archived).map((x) => x.name)
    });
    setReading(false);
    /* lista vazia é o Merlin dizendo que a linha inteira é uma pergunta */
    if (items && !items.length) { onAsk(said.trim()); clear(); return; }
    /* uma nota só, onde a regra já via uma nota: grava com as palavras da
       pessoa, sem cartão para confirmar o que não mudou */
    if (items && !(items.length === 1 && items[0].kind === "note" && route.kind === "note")) { setDraft({ text: said, items }); return; }
    byRule(route);
  };

  const drop = (i) => {
    const items = draft.items.filter((_, j) => j !== i);
    setDraft(items.length ? { ...draft, items } : null);
  };
  /* a refeição que o Merlin escolheu pelo horário se troca no próprio cartão */
  const setMeal = (i, meal) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, meal } : x)) });
  const asNote = () => {
    const n = newNote({ title: draft.text.replace(/\s+/g, " ").trim() });
    if (n) notify("guardado em notas", () => collection("notes").remove(n.id));
    clear();
  };

  const kind = intent ? intent.kind : build ? "build" : reading || willRead ? "read" : route ? route.kind : "";
  const lacking = draft ? draft.items.filter(missing).length : 0;
  const readyN = draft ? draft.items.length - lacking - draft.items.filter(idle).length : 0;
  const firstLacking = draft ? draft.items.find(missing) : null;
  const toCreate = firstLacking && firstLacking.kind === "habit";
  const toHours = firstLacking && firstLacking.kind === "sleep";
  const toMinutes = firstLacking && firstLacking.kind === "workout";
  const hint = reading ? "o Merlin está lendo…"
    : draft && !readyN && !lacking ? "nada a marcar · Enter fecha · Esc volta ao texto"
    : draft && !readyN ? "Enter abre a caixa para " + (toCreate ? "criar o hábito" : toHours ? "pôr as horas" : toMinutes ? "pôr os minutos" : "pôr o valor") + " · Esc volta ao texto"
    : draft && lacking ? "Enter cria o que está pronto · " + (toCreate ? "o hábito novo espera a caixa" : toHours ? "o sono sem as horas fica" : toMinutes ? "o treino sem os minutos fica" : "o que falta o valor fica") + " · Esc volta ao texto"
    : draft ? "Enter cria · Esc volta ao texto"
    : intent ? INTENT_HINT[intent.period || intent.kind]
    : !route ? (smart ? "escreva do seu jeito: o Merlin separa tarefa, data, hora e nota · a pergunta ele responde aqui em cima"
                      : "com a duração (45m, 1h30) entra em hoje · pergunta vai para o Merlin · o resto vira nota")
    : build ? "montar o " + BUILD[build].label + " com o Merlin · ele pergunta o que falta e mostra o rascunho"
    : route.kind === "ask" ? (smart ? "perguntar ao Merlin · a resposta aparece lá em cima" : "perguntar ao Merlin")
    : willRead ? "o Merlin lê e mostra o que entendeu antes de criar"
    : route.kind === "task" ? (route.reserved ? "reservar em hoje · " : "pôr em hoje · ") + fmt(route.min) + (route.reserved ? "" : route.min > b.slack ? " · não cabe hoje" : " · cabe")
    : "guardar em notas · com a duração no fim, entra em hoje";

  return (
    <>
    <form className="hm-field" aria-busy={reading} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <textarea ref={field} rows={2} maxLength="300" value={text} autoFocus
                placeholder={smart ? "ligar pro João amanhã às 15h, uma pergunta, uma nota — do seu jeito" : "uma tarefa (revisar a landing 45m), uma pergunta ou uma nota"}
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
                {icon(DRAFT_ICON[it.kind] || "pencil")}
                {it.kind === "meal" && (
                  <select className="hm-draft__meal" aria-label={"A refeição de " + it.text} value={it.meal} onChange={(e) => setMeal(i, e.currentTarget.value)}>
                    {MEALS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                )}
                <span className="hm-draft__title">{draftTitle(it, habitsNow, date)}</span>
                <span className="hm-draft__meta t-mono">{draftMeta(it, date, money, habitsNow)}</span>
                {missing(it) && <button type="button" className="pill pill--mini" onClick={() => setBoxed(i)}>{it.kind === "habit" ? "criar e marcar" : it.kind === "sleep" ? "pôr as horas" : it.kind === "workout" ? "pôr os minutos" : "abrir a caixa"}</button>}
                <button type="button" className="hm-draft__drop" aria-label={"Tirar " + draftTitle(it, habitsNow, date)} title="tirar" onClick={() => drop(i)}>{icon("x")}</button>
              </li>
            ))}
          </ul>
          <div className="hm-draft__actions">
            <button type="button" className="pill" onClick={() => { setDraft(null); if (field.current) field.current.focus(); }}>voltar ao texto</button>
            <button type="button" className="pill" onClick={asNote}>guardar em notas</button>
            <button type="submit" className="pill pill--accent">
              {!readyN && !lacking ? "ok" : !readyN ? (toCreate ? "criar e marcar" : "abrir a caixa") : readyN === 1 ? "criar" : "criar as " + readyN}
            </button>
          </div>
        </div>
      )}
    </form>
    {/* fora do <form> do campo: a caixa é outro formulário */}
    {draft && boxed >= 0 && draft.items[boxed] && (draft.items[boxed].kind === "habit"
      ? <HabitForm habits={habits} draft={{ name: draft.items[boxed].name, mark: draft.items[boxed].date }} onClose={() => setBoxed(-1)}
                   onDone={(line) => { if (line) { if (draft.items.length === 1) clear(); else drop(boxed); } }} />
      : <ProposalDialog proposal={({ sleep: sleepProposal, workout: workoutProposal }[draft.items[boxed].kind] || moneyProposal)(draft.items[boxed])} onClose={() => setBoxed(-1)}
                        onDone={(line) => { if (line) { if (draft.items.length === 1) clear(); else drop(boxed); } }} />
    )}
    </>
  );
}

/* ================================================================
   fechar o dia
   ================================================================
   a pergunta da noite tem forma: o que ficou aberto hoje passa uma a uma —
   feito, amanhã ou largar — e depois o "como foi o dia". só então o dia
   conta na sequência. nada rola sozinho: é a pessoa que decide cada uma.
   abre quando a pessoa escreve "fechar o dia" no campo, a qualquer hora, e o
   GitHub do dia só é lido aqui, quando o fechamento abre. */
function Closing({ tasks, journal, closes, date, onClose, login }) {
  const gh = useGithub(login, date);
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

/* a revisão da semana e do mês: a mesma pergunta, num horizonte maior. é uma
   caixa como a do fechamento, aberta por "revisar a semana" ou "revisar o
   mês", e já traz o que foi escrito se a revisão do período existir */
function Review({ reviews, due, onClose }) {
  const cur = reviews.get(due.id);
  const [body, setBody] = useState((cur && cur.body) || "");
  const isWeek = due.kind === "week";
  const save = () => {
    if (!body.trim()) return;
    reviews.save({ id: due.id, kind: due.kind, body: body.trim(), createdAt: (cur && cur.createdAt) || Date.now(), updatedAt: Date.now() });
    notify(isWeek ? "semana revisada" : "mês revisado");
    onClose();
  };
  return (
    <div className="cl" role="dialog" aria-modal="true" aria-label={isWeek ? "Revisar a semana" : "Revisar o mês"} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cl__box">
        <p className="cl__eyebrow t-mono">{isWeek ? "revisar a semana" : "revisar o mês"}</p>
        <h2>{isWeek ? "Como foi a semana? O que muda na próxima?" : "Como foi o mês? O que fica e o que sai no próximo?"}</h2>
        <label className="cl__journal">
          <span>{isWeek ? "a semana" : "o mês"}</span>
          <textarea rows={5} value={body} autoFocus onChange={(e) => setBody(e.currentTarget.value)}
                    placeholder={isWeek ? "o que andou, o que travou, a única coisa da próxima semana" : "o que o mês construiu, o que ficou pelo caminho"} />
        </label>
        <div className="cl__actions">
          <button type="button" className="pill" onClick={() => askMerlin((isWeek ? "Me ajuda a revisar a minha semana. " : "Me ajuda a revisar o meu mês. ") + body)}>{icon("spark")}pensar com o Merlin</button>
          <button type="button" className="pill" onClick={onClose}>depois</button>
          <button type="button" className="pill pill--accent" onClick={save} disabled={!body.trim()}>guardar</button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   o GitHub do dia (VISAO, 11)
   ================================================================
   o navegador lê os eventos públicos do usuário direto da api.github.com —
   nada passa pelo servidor e nenhum token é guardado. uma leitura por hora
   (a API sem token aceita 60 por hora por IP), guardada no navegador. desde
   17/10/2026 só o fechamento do dia lê: o início não abre com pedido nenhum. */
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
  const routine = useCollection("routine", { normalize: normalizeBlock });
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
  const h = hourNow();
  const phase = phaseOf(h);
  const date = today();
  const weekStart = sundayOf(date);

  /* o início também abre o dia, como o calendário (VISAO, 4.11): quem só usa
     o celular e nunca abre o calendário tem que ver aqui o que mandou para
     hoje e a rotina da semana. a caixa é recolhida ao abrir e a cada evento
     de storage; a rotina de novo a cada mudança das coleções e da nuvem, que
     é o que destrava a primeira cópia com sessão. os dois se protegem de
     rodar junto com o calendário: a caixa é zerada antes de gravar, e o bloco
     guarda a semana em que já se copiou. ficam aqui na raiz, e não no Today,
     para valer em qualquer coisa que o início mostrar. */
  useEffect(() => {
    const collect = () => {
      const got = collectInbox(tasks);
      const parts = [];
      if (got.tasks) parts.push(got.tasks + (got.tasks === 1 ? " tarefa" : " tarefas") + " na fila");
      if (got.notes) parts.push(got.notes + (got.notes === 1 ? " nota guardada" : " notas guardadas"));
      if (parts.length) notify("chegou de outro módulo: " + parts.join(" e "));
    };
    collect();
    const f = (e) => { if (e.key === "merlin:inbox") collect(); };
    window.addEventListener("storage", f);
    return () => window.removeEventListener("storage", f);
  }, []);
  useEffect(() => {
    const run = () => copyRoutine(routine, tasks, weekStart);
    run();
    const offs = [tasks.onChange(run), routine.onChange(run), cloud.onStatus(run)];
    return () => offs.forEach((off) => off());
  }, [weekStart]);

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

  /* durante o onboarding o #next não vale e sai do endereço. enquanto o estado
     ainda é "waiting" ele fica: se o perfil chegar feito, o Today responde */
  useEffect(() => {
    if (state !== "pending") return;
    const drop = () => { if (location.hash === "#next") history.replaceState(null, "", location.pathname + location.search); };
    drop();
    window.addEventListener("hashchange", drop);
    return () => window.removeEventListener("hashchange", drop);
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
                sessions={sessions} me={me} h={h} phase={phase} date={date} />;
}

/* o dia de quem já passou pelo onboarding. é um componente à parte porque o
   onboarding volta antes: os hooks daqui (a conversa) não podem aparecer de
   repente no meio do mesmo componente quando ele termina */
function Today({ c, tasks, habits, journal, closes, reviews, sessions, me, h, phase, date }) {
  const [closing, setClosing] = useState(false);
  const [reviewing, setReviewing] = useState(null); // { id, kind }: a revisão aberta
  /* a apresentação (VISAO, 13): abre uma vez, aqui, porque o Today só existe
     depois do onboarding. a chave é "tour-areas", e não a "tour" de antes:
     quem viu a das seis seções vê a das áreas uma vez. rever é pelo perfil */
  const [tour, setTour] = useState(() => !seen("tour-areas"));
  const center = useRef(null);
  const closeTour = () => {
    setTour(false);
    markSeen("tour-areas");
    /* quem acabou de ler é devolvido ao campo, com o cursor dentro */
    requestAnimationFrame(() => {
      const f = center.current && center.current.querySelector("textarea");
      if (f) f.focus();
    });
  };
  /* a mesma conta do calendário e do rastreador (shared/tasks.js, dayTasks):
     é a sobra que o campo usa para dizer se cabe; a que vai ao Merlin sai da
     mesma função, no retrato (shared/portrait.js) */
  const doc = dayDoc(dayTasks(tasks.all()).count, date, readPrefs());
  const { b } = distribute(doc);
  const name = cleanName(me.name || (c.email ? String(c.email).split("@")[0] : ""));
  /* o que o campo resolve sem o Merlin: o fechamento e a revisão do período
     corrente, a qualquer dia */
  const openIntent = (it, said) => {
    if (it.kind === "quests") keepTalk(talk.concat([{ from: "me", text: said }, questsMsg()]));
    else if (it.kind === "close") setClosing(true);
    else setReviewing(it.period === "week" ? { id: weekKey(date), kind: "week" } : { id: monthKey(date), kind: "month" });
  };
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
  /* a pergunta leva o retrato (shared/portrait.js): o dia, a agenda da
     semana, a rotina. era só o dia de hoje, e "o que tenho quinta?" ficava
     sem resposta */
  const portrait = usePortrait();
  const [talk, setTalk] = useState([]);
  const [asking, setAsking] = useState(false);
  const [proposal, setProposal] = useState(null); // { p, at, chat }: a pílula aberta na caixa
  const talkId = useRef("");
  const talkNow = useRef(talk);
  talkNow.current = talk;
  const keepTalk = (list) => {
    setTalk(list);
    if (!talkId.current) talkId.current = newId();
    const before = chats.get(talkId.current);
    const now = Date.now();
    chats.save({ id: talkId.current, title: chatTitle(list), messages: list.slice(-MAX_TURNS), createdAt: before ? before.createdAt : now, updatedAt: now });
  };
  /* o cartão do "o que falta hoje?" é desenhado ao vivo a partir das
     coleções; a linha de texto é o que a conversa guarda e o Merlin lê depois.
     as contas previstas que passaram também estão na lista, as do pessoal como
     no cartão (quest-card.jsx) */
  const finance = bookCollection(useCollection("finance", { normalize: normalizeFinance }), "personal");
  const workouts = useCollection("workouts", { normalize: normalizeWorkout });
  const ops = useCollection("ops", { normalize: normalizeOp });
  const questsMsg = () => ({ from: "merlin", show: "quests", text: questsText(questsOf({ tasks: tasks.all(), sessions: sessions.all(), entries: finance.all(), habits: habits.all(), workouts: workouts.all(), ops: ops.all() })) });
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
        context: { message: q, page: "home", portrait: await portrait(), history: turnsOf(talk) }
      }) });
      const s = r.ok && (r.body.suggestions || [])[0];
      const said = r.ok ? r.body.clarify : (r.body && r.body.error) || "não consegui pensar nisso agora";
      reply = [said && { from: "merlin", text: said, sources: r.ok ? r.body.sources : [] }, s && { from: "merlin", proposal: s }, r.ok && r.body.show === "quests" && questsMsg()].filter(Boolean);
      if (!reply.length) reply = [{ from: "merlin", text: "não entendi bem — pode dizer de outro jeito?" }];
    } catch (e) {
      reply = [{ from: "merlin", text: "não consegui falar com o Merlin" }];
    }
    setAsking(false);
    keepTalk(mine.concat(reply));
  };
  /* `index.html#next` (a aba "o que falta" do inbox) é a frase "o que falta
     hoje?" escrita no campo: o mesmo openIntent, e portanto a mesma mensagem.
     o endereço perde o hash para o recarregar não perguntar de novo, e o
     hashchange cobre o menu aberto no próprio início. a ref guarda o
     openIntent da última pintura, porque o ouvinte nasce uma vez só */
  const intent = useRef(openIntent);
  intent.current = openIntent;
  useEffect(() => {
    const next = () => {
      if (location.hash !== "#next") return;
      history.replaceState(null, "", location.pathname + location.search);
      intent.current({ kind: "quests" }, "o que falta hoje?");
    };
    next();
    window.addEventListener("hashchange", next);
    return () => window.removeEventListener("hashchange", next);
  }, []);
  const lastQ = talk.map((m) => m.from).lastIndexOf("me");
  /* a pílula confirmada vira a linha "✓ lançado · …" e não abre de novo; o
     desfazer a devolve, se a conversa ainda for a mesma */
  const markDone = (at, chat, line) => { if (talkId.current === chat) keepTalk(markProposal(talkNow.current, at, line)); };
  /* a conversa desta pintura: o desfazer de uma marca chega depois, e pode já
     ser outra conversa */
  const talkChat = talkId.current;

  return (
    <div className="hm">
      <div className="hm-scene"><Forest phase={phase} /></div>
      <header className="hm-hero">
        <h1>{greet(h)}{name ? ", " + name : ""}. Como posso te ajudar hoje?</h1>
        {talk.length > 0
          && <div className="hm-hero__merlin hm-talk" aria-live="polite">
              {icon("spark")}
              <div className="hm-talk__body">
                {lastQ >= 0 && <p className="hm-talk__q">{talk[lastQ].text}</p>}
                {asking
                  ? <p className="hm-talk__wait">pensando…</p>
                  : talk.slice(lastQ + 1).map((m, i) => m.show === "quests"
                    ? <QuestCard key={i} tasks={tasks} sessions={sessions} />
                    : m.proposal
                      ? m.proposal.done
                        ? <p key={i} className="hm-talk__done t-mono">✓ {m.proposal.done.line}</p>
                        : m.proposal.actionType === "habit-mark"
                        ? <HabitProposal key={i} proposal={m.proposal} className="pill pill--accent hm-talk__do" doneClassName="hm-talk__done t-mono"
                                         onDone={(line) => markDone(lastQ + 1 + i, talkChat, line)} />
                        : <button key={i} type="button" className="pill pill--accent hm-talk__do" onClick={() => setProposal({ p: m.proposal, at: lastQ + 1 + i, chat: talkId.current })}>{icon("spark")}{m.proposal.title}</button>
                      : <Fragment key={i}>
                          <Markdown className="hm-talk__a" text={m.text} />
                          {sourcesLine(m.sources) && <p className="hm-talk__seen">{sourcesLine(m.sources)}</p>}
                        </Fragment>)}
                {!asking && (
                  <p className="hm-talk__foot">
                    <a href={"assistant.html#" + talkId.current}>continuar na conversa</a>
                    <button type="button" onClick={() => { setTalk([]); talkId.current = ""; }}>nova conversa</button>
                  </p>
                )}
              </div>
            </div>}
      </header>

      <div className="hm-center" ref={center}>
        <Composer tasks={tasks} habits={habits} b={b} smart={c.signedIn} onAsk={ask} onIntent={openIntent} readContext={readContext} />
      </div>

      {tour && <Tour onClose={closeTour} />}
      {closing && <Closing tasks={tasks} journal={journal} closes={closes} date={date} login={me.github} onClose={() => setClosing(false)} />}
      {reviewing && <Review key={reviewing.id} reviews={reviews} due={reviewing} onClose={() => setReviewing(null)} />}
      {proposal && <ProposalDialog proposal={proposal.p} chat={proposal.chat} onClose={() => setProposal(null)}
                                   onDone={(line) => markDone(proposal.at, proposal.chat, line)} />}
    </div>
  );
}

/* a porta mora no index.html, escrita à mão, e o script do <head> já decidiu
   se ela aparece antes da primeira pintura. daqui só sai a palavra final
   (isNewHere, que sabe mais que a miniatura do <head>) e o fim da porta:
   abrir o Merlin, ou a sessão chegando de outro aparelho. o que a porta tem
   de vivo vem no landing.jsx, que só quem está nela baixa. */
const TITLE = "merlin";
function Root() {
  const c = useCloud();
  const [bare, setBare] = useState(door);
  const showDoor = bare && !c.signedIn;
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("bare", showDoor);
    html.classList.toggle("in", !showDoor);
    if (!showDoor) document.title = TITLE;
  }, [showDoor]);
  useEffect(() => { if (bare && c.signedIn) { markSeen("landing"); setBare(false); } }, [bare, c.signedIn]);
  useEffect(() => {
    if (!showDoor) return;
    let live = true, sleep = null;
    import("./landing.jsx").then((m) => {
      if (live) sleep = m.wake({ onGuest: () => { markSeen("landing"); setBare(false); window.scrollTo(0, 0); } });
    });
    return () => { live = false; if (sleep) sleep(); };
  }, [showDoor]);
  return showDoor ? null : <Home />;
}

mount(<Root />, "app");
