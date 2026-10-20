/* merlin · a tela do assistente
   era uma caixa de 480px por cima da página: dava para conversar, mas nada
   nela dizia o que o Merlin sabe fazer, o que foi dito sumia ao fechar, e
   uma conversa que pode virar mapa, funil ou uma conta do mês não cabe num
   pop-up. virou página em 22/09/2026, com o mesmo formato da caixa de
   notas: coluna da conversa à esquerda, histórico à direita, e cada uma
   rola sozinha.

   quem pergunta de outra tela (a busca da barra, o campo da home) chega
   aqui pelo askMerlin(), que traz a pergunta e o que aquela tela sabia.

   desde 10/10/2026 é aqui também que se monta com o Merlin um funil, um app,
   um mapa, uma planilha ou uma apresentação (shared/build.js): o pedido de
   montar vira uma conversa curta — as perguntas que mudam o desenho, o
   rascunho, o ajuste em palavras — e só vira documento quando a pessoa cria.
   e o "pedir ao Merlin" do editor da apresentação e da planilha chega aqui
   com "na apresentação X, slide 3: " no campo: o ajuste daquele documento
   aparece com o antes e o depois, e só vai para o editor com o toque.
   o protótipo ("desenha o protótipo do cadastro do app Y", ticket #95) não
   cria documento: as telas e as ações entram num app que já existe, pelo
   mergeDraft restrito, e o desfazer fica na aba fluxos do app. */
import "./shared/base.css";
import "./assistant.css";
import { initPage, newId, notify, api, takeAsk, getCurrentPage, collection, sendChange, dayOf } from "./shared/core.js";
import { useState, useEffect, useRef } from "react";
import { mount, useCollection, useHash, setHash, Markdown, ProposalDialog, HabitProposal, Hat, icon } from "./shared/ui.jsx";
import { chatMood } from "./shared/hat.js";
import { NAV_ICONS } from "./shared/icons.jsx";
import { MAX_TURNS, normalizeChat, chatTitle, turnsOf, markProposal, atBottom } from "./shared/assistant-actions.js";
import {
  BUILD, buildIntent, answersText, draftView, docFromDraft, builtLine, citesCash, cashPortrait,
  productNamed, productContext, adjustOf, draftOfDoc, fitsAdjust, applyDraft, adjustView, prototypeContext
} from "./shared/build.js";
import { normalizeApp, mergePrototype, wireframeLabel } from "./shared/app-spec.js";
import { Wireframe } from "./shared/wireframe.jsx";
import { normalize as normalizeFinance } from "./shared/finance-data.js";
/* o retrato vai em toda pergunta: é ele que faz "continuar na conversa"
   chegar sabendo o dia, "o que tenho quinta?" ter resposta e "posso gastar
   x?" sair pelo saldo sem abrir o financeiro antes */
import { usePortrait } from "./shared/use-portrait.js";
import { sourcesLine } from "./shared/portrait.js";
import { normalize as normalizeTask } from "./shared/tasks.js";
import { normalize as normalizeHabit } from "./shared/habits-data.js";
import { normalize as normalizeWorkout } from "./shared/workouts-data.js";
import { normalize as normalizeOp } from "./shared/ops-data.js";
import { questsOf, questsText } from "./shared/quests.js";
import { QuestCard } from "./shared/quest-card.jsx";

initPage("assistant");

/* os quatro começos da tela. nenhum deles executa nada. os três de montar
   (funil, app, mapa) abrem a conversa de montagem com o pedido da pessoa; o
   do financeiro só prefixa a mensagem, e é esse prefixo que faz a resposta
   sair pelos números. quem grava é sempre a pessoa, no botão de criar. */
const STARTS = [
  {
    key: "funnel", icon: NAV_ICONS.funnels, title: "montar um funil",
    hint: "etapas, ofertas, criativos e automações",
    placeholder: "funil de quê? ex.: consultoria vendida por anúncio",
    build: "funnel"
  },
  {
    key: "app", icon: NAV_ICONS.apps, title: "desenhar um app",
    hint: "conceito, banco, telas e fluxos",
    placeholder: "app de quê? ex.: agenda de salão pelo WhatsApp",
    build: "app"
  },
  {
    key: "map", icon: NAV_ICONS.maps, title: "montar um mapa mental",
    hint: "uma árvore de ideias que já nasce mapa",
    placeholder: "mapa de quê? ex.: onboarding de um cliente novo",
    build: "map"
  },
  {
    key: "finance", icon: NAV_ICONS.finance, title: "simular uma situação financeira",
    hint: "responde pelo saldo e pelos fixos já gravados",
    placeholder: "ex.: posso assumir 3 mil por mês a partir de outubro?",
    prefix: "Pergunta do financeiro. Responda pelos números do contexto e diga o que falta em vez de estimar: "
  }
];

/* quando foi a última palavra daquela conversa, do jeito que se lembra dela:
   "agora", "12 min", "3 h", e a data quando já é de outra semana */
function agoOf(at) {
  const min = Math.round((Date.now() - at) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return min + " min";
  const h = Math.round(min / 60);
  if (h < 24) return h + " h";
  const d = Math.round(h / 24);
  if (d < 7) return d + " d";
  return new Date(at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/* o que a tela diz enquanto espera, e a cara do chapéu enquanto isso
   (shared/hat.js): montar e ajustar um rascunho é trabalho, o resto é
   pensar. o humor vem junto do texto para não depender de comparar a frase */
const WAIT = {
  ask: { text: "pensando…", mood: "thinking" },
  brief: { text: "vendo o que falta saber…", mood: "thinking" },
  draft: { text: "montando o rascunho…", mood: "working" },
  revise: { text: "ajustando o rascunho…", mood: "working" }
};
/* quanto dura a reação ao que chegou, antes de o chapéu voltar a si */
const FEEL_MS = { talking: 1500, done: 2000, confused: 2600 };

/* em que pé está a montagem: a última fala de montar decide. pergunta sem
   resposta espera a resposta; rascunho espera ajuste ou o botão de criar;
   depois do "criei", a conversa volta a ser conversa */
function flowOf(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.built) return null;
    if (m.brief) return m.brief.answered ? null : { at: i, brief: m.brief };
    if (m.draft) return m.draft.data ? { at: i, draft: m.draft } : null;
  }
  return null;
}

/* as perguntas antes de montar: uma resposta pronta para clicar ou a da
   pessoa, e o "decide você" para quem não quer responder nada */
function BriefCard({ brief, live, onAnswer }) {
  const [answers, setAnswers] = useState({});
  const set = (i, v) => setAnswers((a) => ({ ...a, [i]: v }));
  return (
    <div className="build">
      <p className="build__eyebrow t-mono">{icon("spark")}antes de montar {BUILD[brief.kind].the}</p>
      {brief.questions.map((q, i) => (
        <div key={i} className="build__q">
          <b>{q.q}</b>
          {live && (
            <>
              <div className="build__options">
                {q.options.map((o) => (
                  <button key={o} type="button" className="build__option" aria-pressed={answers[i] === o} onClick={() => set(i, answers[i] === o ? "" : o)}>{o}</button>
                ))}
              </div>
              <input className="input build__own" placeholder="ou escreva" value={q.options.includes(answers[i]) ? "" : answers[i] || ""}
                     onChange={(e) => set(i, e.currentTarget.value)} />
            </>
          )}
        </div>
      ))}
      {live && (
        <div className="build__actions">
          {!brief.pick && <button type="button" className="pill" onClick={() => onAnswer(null)}>decide você</button>}
          <button type="button" className="pill pill--accent" onClick={() => onAnswer(answers)}>{icon("spark")}montar</button>
        </div>
      )}
    </div>
  );
}

/* o rascunho: o bastante para conferir de relance. só o último é vivo — os
   de antes ficam como uma linha, com o que mudou */
function DraftCard({ draft, live, onCreate, app }) {
  if (!live || !draft.data) {
    return <p className="build__old">{BUILD[draft.kind].label} · {draft.title}{draft.summary ? " — " + draft.summary : ""}</p>;
  }
  const v = draftView(draft.kind, draft.data, app);
  return (
    <div className="build is-draft">
      <p className="build__eyebrow t-mono">{icon("spark")}rascunho {BUILD[draft.kind].of}</p>
      <h3 className="build__title">{v.title}</h3>
      {v.sub && <p className="build__sub">{v.sub}</p>}
      {/* a planilha se confere na grade, com a conta já feita */}
      {v.table && (
        <>
          {/* a grade larga rola de lado; com tabindex, rola também pelo teclado */}
          <div className="build__grid" tabIndex={0} role="region" aria-label={"rascunho " + BUILD[draft.kind].of + ": " + v.title}>
            <table>
              <thead><tr>{v.table.head.map((h, j) => <th key={j} className={v.table.right[j] ? "is-num" : ""}>{h}</th>)}</tr></thead>
              <tbody>{v.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={v.table.right[j] ? "is-num" : ""}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
          {v.table.more > 0 && <p className="build__more">e mais {v.table.more} {v.table.more === 1 ? "linha" : "linhas"}</p>}
        </>
      )}
      {/* o protótipo se confere desenhado: cada tela como fica depois de
          juntar, com o que muda nela */}
      {v.wires && (
        <div className="build__wires" tabIndex={0} role="region" aria-label={"telas do rascunho " + BUILD[draft.kind].of + ": " + v.title}>
          {v.wires.map((s, i) => (
            <figure key={i} className="build__wire" aria-label={wireframeLabel(s)}>
              <Wireframe screen={s} className="build__wire-svg" />
              <figcaption>
                <b>{s.name}</b>
                <span>{s.status === "new" ? "nova" : s.status === "more" ? "+ " + s.added + (s.added === 1 ? " linha" : " linhas") : "já tem tudo"}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {v.lines.length > 0 && (
        <dl className="build__lines">
          {v.lines.map((l, i) => (
            <div key={i}><dt>{l.label}</dt><dd>{l.text || "—"}</dd></div>
          ))}
        </dl>
      )}
      {draft.summary && <p className="build__summary">{draft.summary}</p>}
      <div className="build__actions">
        <span className="build__hint">ou escreva abaixo o que mudar</span>
        <button type="button" className="pill pill--accent" onClick={onCreate}>{icon("check")}{BUILD[draft.kind].create}</button>
      </div>
    </div>
  );
}

/* o ajuste de um documento aberto: o antes e o depois do que mudou, e o
   "aplicar", que leva a mudança para o editor. só o último é vivo; aplicado,
   vira a linha "✓ o Merlin mudou o slide 3 · abrir" */
function AdjustCard({ adjust, live, onApply }) {
  const b = BUILD[adjust.kind];
  if (adjust.applied) return <p className="chat__done">✓ {adjust.line} · <a href={b.href + adjust.id}>abrir</a></p>;
  if (!live || !adjust.before || !adjust.after) {
    return <p className="build__old">ajuste {b.of} {adjust.name}{adjust.summary ? " — " + adjust.summary : ""}</p>;
  }
  const v = adjustView(adjust.kind, adjust.before, adjust.after);
  return (
    <div className="build is-draft">
      <p className="build__eyebrow t-mono">{icon("spark")}ajuste {b.of}</p>
      <h3 className="build__title">{adjust.name}</h3>
      <dl className="build__lines build__diff">
        {v.pairs.map((p, i) => (
          <div key={i}>
            <dt>{p.label}</dt>
            <dd>
              <span className="build__before">antes: {p.before || "—"}</span>
              <span className="build__after">depois: {p.after || (adjust.kind === "deck" ? "sai" : "—")}</span>
            </dd>
          </div>
        ))}
      </dl>
      {v.more > 0 && <p className="build__more">e mais {v.more} {v.more === 1 ? "mudança" : "mudanças"}</p>}
      {adjust.summary && <p className="build__summary">{adjust.summary}</p>}
      <div className="build__actions">
        <span className="build__hint">nada muda até você aplicar</span>
        <button type="button" className="pill pill--accent" onClick={onApply}>{icon("check")}aplicar</button>
      </div>
    </div>
  );
}

function Assistant() {
  const chats = useCollection("chats", { normalize: normalizeChat });
  /* o que o Merlin sabe de um produto, para a apresentação dele: o projeto
     de app, o funil e a oferta ligados e as metas do plano (shared/build.js) */
  const apps = useCollection("apps");
  const funnels = useCollection("funnels");
  const plans = useCollection("plans");
  const finance = useCollection("finance", { normalize: normalizeFinance });
  const clients = useCollection("clients");
  const team = useCollection("team");
  /* o cartão do "o que falta hoje?" lê as mesmas coleções do início */
  const tasks = useCollection("tasks", { normalize: normalizeTask });
  const sessions = useCollection("sessions");
  const habits = useCollection("habits", { normalize: normalizeHabit });
  const workouts = useCollection("workouts", { normalize: normalizeWorkout });
  const ops = useCollection("ops", { normalize: normalizeOp });
  const portrait = usePortrait();
  const hash = useHash();
  const [messages, setMessages] = useState([]); // { from: "me"|"merlin", text } | { from: "merlin", proposal }
  const [input, setInput] = useState("");
  const [startKey, setStartKey] = useState("");
  const [thinking, setThinking] = useState(false); // false | um dos WAIT
  const [feeling, setFeeling] = useState(null);
  const [proposal, setProposal] = useState(null); // { p, at, chat }: a pílula aberta na caixa
  const [historyOpen, setHistoryOpen] = useState(false);
  /* o x do selo de montagem: a conversa segue normal, e o rascunho fica lá */
  const [flowOn, setFlowOn] = useState(true);
  const listRef = useRef(null);
  const fieldRef = useRef(null);
  const idRef = useRef("");
  /* o que a tela de origem sabia quando a pessoa veio pedir ajuda — o cliente
     aberto, o funil, o saldo. vale pela conversa inteira: é o assunto dela. */
  const fromRef = useRef(null);
  const started = useRef(false);
  const start = STARTS.find((s) => s.key === startKey) || null;
  const list = chats.all().sort((a, b) => b.updatedAt - a.updatedAt);
  const flow = flowOn ? flowOf(messages) : null;
  /* só o último cartão da conversa é ao vivo: o de ontem não mostra a lista de hoje */
  const lastCard = messages.map((m) => m.show === "quests").lastIndexOf(true);
  const lastAdjust = messages.map((m) => !!m.adjust).lastIndexOf(true);

  /* o chapéu reage ao que acabou de chegar por um instante e volta */
  const feelTimer = useRef(0);
  const feel = (mood) => {
    clearTimeout(feelTimer.current);
    setFeeling(mood);
    feelTimer.current = setTimeout(() => setFeeling(null), FEEL_MS[mood]);
  };
  useEffect(() => () => clearTimeout(feelTimer.current), []);
  const mood = chatMood({ thinking, feeling, typing: !!input.trim() });

  /* grava a conversa a cada troca — documento como qualquer outro: sobe,
     volta no outro aparelho, e apagar é apagar */
  const keep = (all) => {
    /* só o último rascunho guarda o desenho inteiro: um app são dezenas de
       KB, e a conversa é um documento que sobe para a nuvem */
    const lastDraft = all.map((m) => !!m.draft).lastIndexOf(true);
    const lastAdjust = all.map((m) => !!m.adjust).lastIndexOf(true);
    const list = all.map((m, i) => (m.draft && i !== lastDraft && m.draft.data ? { ...m, draft: { ...m.draft, data: null } }
      : m.adjust && i !== lastAdjust && (m.adjust.before || m.adjust.after) ? { ...m, adjust: { ...m.adjust, before: null, after: null } }
      : m));
    setMessages(list);
    if (!list.length) return;
    if (!idRef.current) { idRef.current = newId(); setHash(idRef.current); }
    const before = chats.get(idRef.current);
    const now = Date.now();
    chats.save({
      id: idRef.current,
      title: chatTitle(list),
      messages: list.slice(-MAX_TURNS),
      createdAt: before ? before.createdAt : now,
      updatedAt: now
    });
  };

  /* a pílula confirmada vira a linha "✓ lançado · …", gravada na conversa, e o
     chapéu comemora; o desfazer a devolve. a conversa pode já ser outra quando
     o desfazer chega */
  const messagesNow = useRef(messages);
  messagesNow.current = messages;
  const markDone = (at, chat, line) => {
    if (line) feel("done");
    if (idRef.current === chat) { keep(markProposal(messagesNow.current, at, line)); return; }
    const doc = chats.get(chat);
    if (doc) chats.save({ ...doc, messages: markProposal(doc.messages, at, line), updatedAt: Date.now() });
  };

  /* ---------- montar com o Merlin ---------- */
  /* a planilha que cita o caixa leva o dinheiro e o negócio do retrato, e só
     eles (shared/build.js) */
  const productOf = (app) => productContext(app, { funnels: funnels.all(), plans: plans.all(), finance: finance.all(), clients: clients.all(), team: team.all() }, dayOf(new Date()));
  const callBuild = async (context) => {
    try {
      /* o protótipo leva o app como está agora; na conversa fica só o id */
      if (BUILD[context.kind].spec) {
        const { app: id, ...rest } = context;
        const app = id ? apps.get(id) : null;
        if (!app) return { error: "não achei mais esse app; ele foi apagado?" };
        context = { ...rest, spec: prototypeContext(app) };
      }
      if (BUILD[context.kind].cash && citesCash(context.request)) context = { ...context, portrait: cashPortrait(await portrait()) };
      /* a apresentação que nomeia um produto leva o que se sabe dele */
      const named = BUILD[context.kind].product && !context.product ? productNamed(context.request, apps.all()) : null;
      if (named) context = { ...context, product: productOf(named) };
      const r = await api("/merlin", { method: "POST", body: JSON.stringify({ task: "build", context }) });
      if (r.ok) return { body: r.body };
      return { error: r.status === 401 ? "entre para usar o Merlin" : (r.body && r.body.error) || "não consegui montar isso agora" };
    } catch (e) { return { error: "não consegui falar com o Merlin" }; }
  };
  /* `app`: o id do app em que o protótipo vai entrar */
  const runDraft = async (kind, request, answers, base, app) => {
    setThinking(WAIT.draft);
    const r = await callBuild({ kind, step: "draft", request, answers, ...(app ? { app } : {}) });
    setThinking(false);
    if (r.error) { keep(base.concat([{ from: "merlin", text: r.error }])); feel("confused"); return; }
    const data = r.body.draft;
    keep(base.concat([{ from: "merlin", draft: { kind, request, answers, data, title: draftView(kind, data, app && apps.get(app)).title, summary: r.body.summary || "", ...(app ? { app } : {}) } }]));
    feel("done");
  };
  const askBrief = async (kind, request, base, app) => {
    setThinking(WAIT.brief);
    const r = await callBuild({ kind, step: "brief", request, ...(app ? { app } : {}) });
    setThinking(false);
    if (r.error) { keep(base.concat([{ from: "merlin", text: r.error }])); feel("confused"); return; }
    const questions = r.body.questions || [];
    if (questions.length) { keep(base.concat([{ from: "merlin", brief: { kind, request, questions, answered: false, ...(app ? { app } : {}) } }])); feel("talking"); }
    else runDraft(kind, request, "", base, app);
  };
  /* "de qual app?": a pergunta é da tela, sem o Merlin, com os apps mais
     recentes para clicar */
  const pickApp = (request, again) => ({ from: "merlin", brief: {
    kind: "prototype", request, pick: true, answered: false,
    questions: [{ q: again ? "Não achei esse app. De qual é?" : "De qual app?", options: apps.all().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 4).map((a) => String(a.name || "")) }]
  } });
  /* `said`: o que aparece como fala da pessoa, quando não é o próprio pedido */
  const startBuild = async (kind, request, said) => {
    const mine = messages.concat([{ from: "me", text: said || request }]);
    keep(mine);
    setInput("");
    setStartKey("");
    /* o protótipo entra num app que já existe: o que o pedido nomeia, ou o
       que a pessoa escolhe. sem nenhum, o caminho é montar um */
    if (kind === "prototype") {
      if (!apps.all().length) { keep(mine.concat([{ from: "merlin", text: "Você ainda não tem um app. Quer que eu monte um?", offer: { kind: "app", request } }])); feel("talking"); return; }
      const app = productNamed(request, apps.all());
      if (!app) { keep(mine.concat([pickApp(request)])); feel("talking"); return; }
      askBrief(kind, request, mine, String(app.id));
      return;
    }
    askBrief(kind, request, mine);
  };
  /* a resposta às perguntas: as escolhas do cartão, o texto livre do campo,
     ou nada ("decide você") */
  const answerBrief = (at, answers, free) => {
    const b = messages[at].brief;
    const text = free != null ? free : answers ? answersText(b.questions, answers) : "";
    const list = messages.map((m, i) => (i === at ? { ...m, brief: { ...b, answered: true } } : m))
      .concat([{ from: "me", text: text || "decide você" }]);
    keep(list);
    setInput("");
    /* a resposta ao "de qual app?" acha o app pelo nome, e só então o
       Merlin pergunta o que falta do trecho */
    if (b.pick) {
      const app = productNamed(free != null ? free : answers ? answers[0] || "" : "", apps.all());
      if (!app) { keep(list.concat([pickApp(b.request, true)])); feel("confused"); return; }
      askBrief(b.kind, b.request, list, String(app.id));
      return;
    }
    runDraft(b.kind, b.request, text, list, b.app);
  };
  const revise = async (d, change) => {
    const mine = messages.concat([{ from: "me", text: change }]);
    keep(mine);
    setInput("");
    setThinking(WAIT.revise);
    const r = await callBuild({ kind: d.kind, step: "revise", request: d.request, answers: d.answers, draft: d.data, change, ...(d.app ? { app: d.app } : {}) });
    setThinking(false);
    if (r.error) { keep(mine.concat([{ from: "merlin", text: r.error }])); feel("confused"); return; }
    const data = r.body.draft;
    keep(mine.concat([{ from: "merlin", draft: { ...d, data, title: draftView(d.kind, data, d.app && apps.get(d.app)).title, summary: r.body.summary || "" } }]));
    feel("done");
  };
  /* com linha de pronto (a planilha), a conversa fica e a linha abre o que
     foi criado; sem ela, vai direto para a tela dele */
  const create = (d) => {
    if (d.kind === "prototype") { join(d); return; }
    /* a apresentação já nasce ligada ao produto que o pedido nomeou */
    const named = BUILD[d.kind].product ? productNamed(d.request, apps.all()) : null;
    const { collection: name, doc, href } = docFromDraft(d.kind, named ? { ...d.data, app: String(named.id || "") } : d.data, newId);
    collection(name).save(doc);
    const line = builtLine(d.kind, doc);
    keep(messages.concat([{ from: "merlin", built: { kind: d.kind, id: doc.id, name: doc.name, line } }]));
    if (line) feel("done");
    else location.href = href;
  };

  /* o protótipo junta telas e ações ao app, sem trocar nada do que a pessoa
     escreveu (app-spec.js, mergePrototype), e abre o app no modo telas da aba
     fluxos. o desfazer é um passo só e mora lá: o app de antes vai junto
     (shared/core.js, sendChange), e o aviso "o Merlin mudou o protótipo ·
     desfazer" aparece onde se veem as telas */
  const join = (d) => {
    const before = d.app ? apps.get(d.app) : null;
    if (!before) { keep(messages.concat([{ from: "merlin", text: "não achei mais esse app; ele foi apagado?" }])); feel("confused"); return; }
    const next = mergePrototype(normalizeApp(before, newId), d.data, newId);
    apps.save({ ...next, updatedAt: Date.now() });
    keep(messages.concat([{ from: "merlin", built: { kind: d.kind, id: before.id, name: before.name, line: builtLine(d.kind, d.data) } }]));
    sendChange("prototype", before.id, before, "o Merlin mudou o protótipo");
    location.href = BUILD.prototype.href + before.id;
  };

  /* ---------- ajustar o documento aberto ("pedir ao Merlin") ---------- */
  /* o documento do "na apresentação X": o que o editor mandou, se o nome
     confere, ou o mais recente com aquele nome */
  const docOf = (adj) => {
    const all = collection(BUILD[adj.kind].collection).all();
    const same = (d) => String(d.name || "").trim().toLowerCase() === adj.name.toLowerCase();
    const t = fromRef.current && fromRef.current.target;
    return (t && t.kind === adj.kind && all.find((d) => d.id === t.id && same(d)))
      || all.filter(same).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;
  };
  const adjust = async (doc, adj, message) => {
    const kind = adj.kind;
    const mine = messages.concat([{ from: "me", text: message }]);
    keep(mine);
    setInput("");
    if (!fitsAdjust(kind, doc)) {
      keep(mine.concat([{ from: "merlin", text: kind === "deck"
        ? "essa apresentação passou de 12 slides: por enquanto o Merlin só ajusta pela conversa uma de até 12"
        : "essa planilha passou de 40 linhas ou 10 colunas: por enquanto o Merlin só ajusta pela conversa uma até esse tamanho" }]));
      feel("confused");
      return;
    }
    setThinking(WAIT.revise);
    const app = kind === "deck" && doc.app ? apps.get(doc.app) : null;
    const r = await callBuild({ kind, step: "revise", request: message, draft: draftOfDoc(kind, doc), change: message, open: true, ...(app ? { product: productOf(app) } : {}) });
    setThinking(false);
    if (r.error) { keep(mine.concat([{ from: "merlin", text: r.error }])); feel("confused"); return; }
    const after = applyDraft(kind, doc, r.body.draft, newId);
    const v = adjustView(kind, doc, after);
    if (!v.pairs.length) { keep(mine.concat([{ from: "merlin", text: "o Merlin não achou o que mudar " + BUILD[kind].the.replace(/^(.)/, "n$1") + "; pode dizer de outro jeito?" }])); feel("confused"); return; }
    keep(mine.concat([{ from: "merlin", adjust: { kind, id: doc.id, name: doc.name, slide: adj.slide, summary: r.body.summary || "", line: v.line, applied: false, before: doc, after } }]));
    feel("done");
  };
  /* o toque em "aplicar": a mudança vai para o editor, que a aplica como um
     passo do desfazer e avisa (shared/core.js, sendChange) */
  const applyAdjust = (i) => {
    const a = messages[i].adjust;
    const v = adjustView(a.kind, a.before, a.after);
    sendChange(a.kind, a.id, a.after, v.line, v.at);
    keep(messages.map((m, j) => (j === i ? { ...m, adjust: { ...a, applied: true } } : m)));
    location.href = BUILD[a.kind].href + a.id;
  };

  const ask = async (text, mode) => {
    const message = String(text || "").trim();
    if (!message || thinking) return;
    /* "na apresentação X, slide 3: …" de um documento que existe é o ajuste
       dele, antes de tudo; sem documento com esse nome, é conversa */
    const adj = adjustOf(message);
    const target = adj && docOf(adj);
    if (target) { adjust(target, adj, message); return; }
    const said = mode !== undefined ? mode : start;
    /* o que está em montagem pega o texto antes de tudo: é a resposta às
       perguntas ou o ajuste do rascunho. sair da montagem é o x do selo */
    const live = flowOn ? flowOf(messages) : null;
    if (live && live.brief) { answerBrief(live.at, null, message); return; }
    if (live && live.draft) { revise(live.draft, message); return; }
    const kind = (said && said.build) || buildIntent(message);
    if (kind) { setFlowOn(true); startBuild(kind, message); return; }
    const mine = messages.concat([{ from: "me", text: message }]);
    const answer = (...m) => keep(mine.concat(m));
    /* o cartão é desenhado ao vivo; a conversa guarda a linha de texto, que é
       também o que o Merlin lê na pergunta seguinte */
    const questsMsg = () => ({ from: "merlin", show: "quests", text: questsText(questsOf({ tasks: tasks.all(), sessions: sessions.all(), habits: habits.all(), workouts: workouts.all(), ops: ops.all() })) });
    keep(mine);
    setInput("");
    setThinking(WAIT.ask);
    try {
      /* o contexto: o da tela de onde a pergunta veio, quando veio de alguma.
         o retrato vai sempre, à parte, e leva o dinheiro: a simulação não
         precisa mais do resumo do financeiro em separado */
      const from = fromRef.current;
      const seen = await portrait();
      const r = await api("/merlin", { method: "POST", body: JSON.stringify({
        task: "assistant",
        context: {
          message: (said && said.prefix ? said.prefix : "") + message,
          page: (from && from.page) || getCurrentPage(),
          pageContext: (from && from.pageContext) || "",
          portrait: seen,
          history: turnsOf(messages)
        }
      }) });
      if (r.ok) {
        const s = (r.body.suggestions || [])[0];
        const card = r.body.show === "quests";
        if (s) { answer({ from: "merlin", proposal: s }, ...(card ? [questsMsg()] : [])); feel("done"); }
        /* a resposta diz de onde tirou ("vi a agenda"): só a que respondeu de
           fato; o "não entendi" não viu nada */
        else if (r.body.clarify || card) {
          answer(...[r.body.clarify && { from: "merlin", text: r.body.clarify, sources: r.body.sources || [] }, card && questsMsg()].filter(Boolean));
          feel("talking");
        } else { answer({ from: "merlin", text: "não entendi bem — pode dizer de outro jeito?" }); feel("confused"); }
      } else if (r.status === 401) {
        answer({ from: "merlin", text: "entre para usar o Merlin" });
        feel("confused");
      } else {
        answer({ from: "merlin", text: r.body.error || "não consegui pensar nisso agora" });
        feel("confused");
      }
    } catch (e) {
      answer({ from: "merlin", text: "não consegui falar com o Merlin" });
      feel("confused");
    } finally { setThinking(false); }
  };

  const openChat = (doc) => {
    setFlowOn(true);
    idRef.current = doc.id;
    setHash(doc.id);
    setMessages(doc.messages);
    setStartKey("");
    setInput("");
    setHistoryOpen(false);
    fromRef.current = null;
  };
  const newChat = () => {
    setFlowOn(true);
    idRef.current = "";
    setHash("");
    setMessages([]);
    setStartKey("");
    setInput("");
    setHistoryOpen(false);
    fromRef.current = null;
    if (fieldRef.current) fieldRef.current.focus();
  };
  const dropChat = (doc) => {
    chats.remove(doc.id);
    notify("conversa apagada", () => chats.save(doc));
    if (doc.id === idRef.current) newChat();
  };
  const pickStart = (s) => {
    setStartKey((k) => (k === s.key ? "" : s.key));
    if (fieldRef.current) fieldRef.current.focus();
  };

  /* a chegada: ou a pergunta que veio de outra tela, ou a conversa que o
     endereço aponta (assistant.html#id, como em toda página daqui) */
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const from = takeAsk();
    if (from && from.message && from.message.trim() && !from.prefill) {
      fromRef.current = from;
      ask(from.message);
      return;
    }
    if (from) { fromRef.current = from; setInput(from.message || ""); }
    const doc = hash ? chats.get(hash) : null;
    if (doc) { idRef.current = doc.id; setMessages(doc.messages); }
  }, []);
  /* o endereço mudou por fora (voltar, um link): abre aquela conversa.
     a primeira passagem não conta — ela roda na montagem, com o hash que
     havia ANTES de a chegada ali em cima gravar a conversa nova, e chegaria
     aqui achando que a pessoa tinha acabado de sair dela. */
  const hashSeen = useRef(false);
  useEffect(() => {
    if (!hashSeen.current) { hashSeen.current = true; return; }
    if (hash === idRef.current) return;
    const doc = hash ? chats.get(hash) : null;
    if (doc) { idRef.current = doc.id; setMessages(doc.messages); setStartKey(""); }
    else if (!hash) { idRef.current = ""; setMessages([]); }
  }, [hash]);
  /* mensagem nova sempre rola até o fim */
  const pinned = useRef(true);
  useEffect(() => {
    if (!listRef.current) return;
    pinned.current = true;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, thinking]);
  /* se a pessoa estava no fim, ainda estava quando o cartão cresceu */
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => { pinned.current = atBottom(el); };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  /* o cartão do "o que falta hoje?" muda de altura sem que `messages` mude: as
     tarefas chegam da nuvem depois da pintura, "hoje" abre os chips, concluir
     troca a coisa. a caixa da conversa não muda de tamanho (quem cresce é o
     conteúdo dela), então se observa o cartão. cresceu e a pessoa estava no
     fim: acompanha. ela subiu para reler: fica onde está. */
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const heights = new Map();
    const ro = new ResizeObserver((entries) => {
      let grew = false;
      for (const e of entries) {
        const h = e.target.offsetHeight;
        const was = heights.get(e.target);
        if (was !== undefined && h > was) grew = true;
        heights.set(e.target, h);
      }
      if (grew && pinned.current) el.scrollTop = el.scrollHeight;
    });
    el.querySelectorAll(".chat__quest").forEach((q) => { heights.set(q, q.offsetHeight); ro.observe(q); });
    return () => ro.disconnect();
  }, [messages]);

  /* a conversa desta pintura: o desfazer da marca chega depois, e pode já ser outra */
  const chatNow = idRef.current;
  return (
    <>
      <div className={"chat" + (historyOpen ? " is-history" : "")}>
        <div className="chat__main">
          <div className="chat__log" ref={listRef}>
            {!messages.length
              ? <div className="chat__welcome">
                  <Hat className="chat__mark" mood={mood} />
                  <h1>o que vamos montar?</h1>
                  <p>peça uma tarefa, uma nota, um roteiro, um lead — ou comece por um destes:</p>
                  <div className="chat__starts">
                    {STARTS.map((s) => (
                      <button key={s.key} type="button" className="chat__start" aria-pressed={s.key === startKey}
                              onClick={() => pickStart(s)}>
                        <i>{s.icon}</i>
                        <b>{s.title}</b>
                        <span>{s.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
              : messages.map((m, i) => (
                  <div key={i} className={"chat__msg" + (m.from === "me" ? " is-me" : "")}>
                    {m.brief
                      ? <BriefCard brief={m.brief} live={!!flow && flow.at === i && !thinking} onAnswer={(a) => answerBrief(i, a)} />
                      : m.adjust
                      ? <AdjustCard adjust={m.adjust} live={i === lastAdjust && !thinking} onApply={() => applyAdjust(i)} />
                      : m.draft
                      ? <DraftCard draft={m.draft} live={!!flow && flow.at === i && !thinking} onCreate={() => create(m.draft)}
                                   app={m.draft.app ? apps.get(m.draft.app) : null} />
                      : m.built
                      ? m.built.line
                        ? <p className="chat__done">✓ {m.built.line} · <a href={BUILD[m.built.kind].href + m.built.id}>abrir</a></p>
                        : <p>criei {BUILD[m.built.kind].the} <a href={BUILD[m.built.kind].href + m.built.id}>{m.built.name}</a></p>
                      : m.show === "quests"
                      ? i === lastCard
                        ? <div className="chat__quest"><QuestCard tasks={tasks} sessions={sessions} /></div>
                        : <p>{m.text}</p>
                      : m.proposal
                      ? m.proposal.done
                        ? <p className="chat__done">✓ {m.proposal.done.line}</p>
                        /* o hábito se marca no clique, sem caixa (shared/ui.jsx) */
                        : m.proposal.actionType === "habit-mark"
                        ? <HabitProposal proposal={m.proposal} className="pill pill--accent" doneClassName="chat__done"
                                         onDone={(line) => markDone(i, chatNow, line)} />
                        : <button className="pill pill--accent" type="button" onClick={() => setProposal({ p: m.proposal, at: i, chat: idRef.current })}>{icon("spark")}{m.proposal.title}</button>
                      : m.from === "me"
                        /* o que a pessoa escreveu sai como ela escreveu; o que o
                           Merlin responde vem em markdown e é lido como markdown —
                           lista dele e título dele viravam asterisco e cerquilha na tela */
                        ? <p>{m.text}</p>
                        : <>
                            <Markdown className="chat__body" text={m.text} />
                            {sourcesLine(m.sources) && <p className="chat__seen">{sourcesLine(m.sources)}</p>}
                            {/* "Quer que eu monte um?": segue pelo tipo app, com o pedido de antes */}
                            {m.offer && i === messages.length - 1 && !thinking && (
                              <button type="button" className="pill pill--accent" onClick={() => { setFlowOn(true); startBuild("app", m.offer.request, "sim, monta um app"); }}>
                                {icon("spark")}montar um app
                              </button>
                            )}
                          </>}
                  </div>
                ))}
            {thinking && <div className="chat__msg"><p className="weak">{thinking.text}</p></div>}
          </div>

          <form className="chat__composer" autoComplete="off" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
            {start && !flow && (
              <p className="chat__mode">
                {start.icon}{start.title}
                <button type="button" aria-label="Tirar" title="tirar" onClick={() => setStartKey("")}>{icon("x")}</button>
              </p>
            )}
            {flow && (
              <p className="chat__mode">
                {icon("spark")}{flow.brief ? "respondendo as perguntas " + BUILD[flow.brief.kind].of : "ajustando o rascunho: " + flow.draft.title}
                <button type="button" aria-label="Sair da montagem" title="sair da montagem" onClick={() => setFlowOn(false)}>{icon("x")}</button>
              </p>
            )}
            <div className="chat__row">
              {/* na abertura o chapéu já está grande lá em cima; na conversa ele
                  mora aqui, olhando para o que se escreve */}
              {messages.length > 0 && <Hat className="chat__face" tight mood={mood} look={mood === "listening" ? [0.8, 0.35] : null} />}
              <input ref={fieldRef} className="chat__field" autoFocus maxLength="1000"
                     placeholder={flow ? (flow.brief ? "ou responda do seu jeito" : "o que mudar? ex.: tira o webinar e põe um quiz") : start ? start.placeholder : "escreva para o Merlin…"}
                     aria-label="Escreva para o Merlin"
                     value={input} onChange={(e) => setInput(e.currentTarget.value)} />
              <button className="pill pill--accent pill--icon" type="submit" aria-label="Enviar"
                      disabled={!!thinking || !input.trim()}>{icon("arrow")}</button>
            </div>
          </form>
        </div>

        <aside className="chat__history">
          <div className="chat__history-top">
            <p className="t-mono">conversas</p>
            <button type="button" className="chat__icon chat__narrow" aria-label="Voltar à conversa"
                    onClick={() => setHistoryOpen(false)}>{icon("x")}</button>
          </div>
          <div className="chat__list">
            {list.length
              ? list.map((c) => (
                  <div key={c.id} className={"chat__item" + (c.id === idRef.current ? " is-on" : "")}>
                    <button type="button" className="chat__item-open" onClick={() => openChat(c)}>
                      <b>{c.title}</b>
                      <span>{agoOf(c.updatedAt)}</span>
                    </button>
                    <button type="button" className="chat__item-drop" aria-label="Apagar conversa" title="apagar"
                            onClick={() => dropChat(c)}>{icon("trash")}</button>
                  </div>
                ))
              : <p className="chat__none">nada por aqui ainda</p>}
          </div>
          <button type="button" className="pill chat__new" onClick={newChat}>{icon("plus")}nova conversa</button>
        </aside>

        <button type="button" className="chat__icon chat__narrow chat__open-history" title="conversas"
                aria-label="Conversas" onClick={() => setHistoryOpen(true)}>{icon("chat")}</button>
      </div>
      {proposal && <ProposalDialog proposal={proposal.p} chat={proposal.chat} onClose={() => setProposal(null)}
                                   onDone={(line) => markDone(proposal.at, proposal.chat, line)} />}
    </>
  );
}

mount(<Assistant />, "app");
