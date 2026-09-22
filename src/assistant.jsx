/* merlin · a tela do assistente
   era uma caixa de 480px por cima da página: dava para conversar, mas nada
   nela dizia o que o Merlin sabe fazer, o que foi dito sumia ao fechar, e
   uma conversa que pode virar mapa, funil ou uma conta do mês não cabe num
   pop-up. virou página em 22/09/2026, com o mesmo formato da caixa de
   notas: coluna da conversa à esquerda, histórico à direita, e cada uma
   rola sozinha.

   quem pergunta de outra tela (a busca da barra, o campo da home) chega
   aqui pelo askMerlin(), que traz a pergunta e o que aquela tela sabia. */
import "./shared/base.css";
import "./assistant.css";
import { initPage, newId, notify, api, takeAsk, getCurrentPage } from "./shared/core.js";
import { useState, useEffect, useRef } from "react";
import { mount, useCollection, useHash, setHash, Markdown, ProposalDialog, icon } from "./shared/ui.jsx";
import { NAV_ICONS } from "./shared/icons.jsx";
import { MAX_TURNS, normalizeChat, chatTitle, turnsOf } from "./shared/assistant-actions.js";
/* o resumo do financeiro, pra esta tela responder "posso gastar x?" sem
   obrigar a pessoa a abrir o financeiro antes */
import { financeBrief } from "./shared/finance-data.js";

initPage("assistant");

/* os três começos da tela. nenhum deles executa nada: cada um só prefixa a
   mensagem da pessoa, e é esse prefixo que faz a proposta sair do tipo certo.
   quem grava continua sendo o ProposalDialog, com ela confirmando campo a
   campo — a IA nunca escreve no sistema sozinha. */
const STARTS = [
  {
    key: "map", icon: NAV_ICONS.maps, title: "montar um mapa mental",
    hint: "uma árvore de ideias que já nasce mapa",
    placeholder: "mapa de quê? ex.: onboarding de um cliente novo",
    prefix: "Monte um mapa mental sobre: "
  },
  {
    key: "funnel", icon: NAV_ICONS.funnels, title: "desenhar um funil",
    hint: "as etapas na ordem, prontas para editar",
    placeholder: "funil de quê? ex.: consultoria vendida por anúncio",
    prefix: "Desenhe um funil para: "
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

function Assistant() {
  const chats = useCollection("chats", { normalize: normalizeChat });
  const hash = useHash();
  const [messages, setMessages] = useState([]); // { from: "me"|"merlin", text } | { from: "merlin", proposal }
  const [input, setInput] = useState("");
  const [startKey, setStartKey] = useState("");
  const [thinking, setThinking] = useState(false);
  const [proposal, setProposal] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const listRef = useRef(null);
  const fieldRef = useRef(null);
  const idRef = useRef("");
  /* o que a tela de origem sabia quando a pessoa veio pedir ajuda — o cliente
     aberto, o funil, o saldo. vale pela conversa inteira: é o assunto dela. */
  const fromRef = useRef(null);
  const started = useRef(false);
  const start = STARTS.find((s) => s.key === startKey) || null;
  const list = chats.all().sort((a, b) => b.updatedAt - a.updatedAt);

  /* grava a conversa a cada troca — documento como qualquer outro: sobe,
     volta no outro aparelho, e apagar é apagar */
  const keep = (list) => {
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

  const ask = async (text, mode) => {
    const message = String(text || "").trim();
    if (!message || thinking) return;
    const said = mode !== undefined ? mode : start;
    const mine = messages.concat([{ from: "me", text: message }]);
    const answer = (m) => keep(mine.concat([m]));
    keep(mine);
    setInput("");
    setThinking(true);
    try {
      /* o contexto: o da tela de onde a pergunta veio, quando veio de alguma;
         e o resumo do financeiro quando o pedido é de simulação */
      const from = fromRef.current;
      const r = await api("/merlin", { method: "POST", body: JSON.stringify({
        task: "assistant",
        context: {
          message: (said ? said.prefix : "") + message,
          page: (from && from.page) || getCurrentPage(),
          pageContext: (from && from.pageContext) || (said && said.key === "finance" ? financeBrief() : ""),
          history: turnsOf(messages)
        }
      }) });
      if (r.ok) {
        const s = (r.body.suggestions || [])[0];
        if (s) answer({ from: "merlin", proposal: s });
        else answer({ from: "merlin", text: r.body.clarify || "não entendi bem — pode dizer de outro jeito?" });
      } else if (r.status === 401) {
        answer({ from: "merlin", text: "entre para usar o Merlin" });
      } else {
        answer({ from: "merlin", text: r.body.error || "não consegui pensar nisso agora" });
      }
    } catch (e) {
      answer({ from: "merlin", text: "não consegui falar com o Merlin" });
    } finally { setThinking(false); }
  };

  const openChat = (doc) => {
    idRef.current = doc.id;
    setHash(doc.id);
    setMessages(doc.messages);
    setStartKey("");
    setInput("");
    setHistoryOpen(false);
    fromRef.current = null;
  };
  const newChat = () => {
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
    if (from && from.message && from.message.trim()) {
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
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [messages, thinking]);

  return (
    <>
      <div className={"chat" + (historyOpen ? " is-history" : "")}>
        <div className="chat__main">
          <div className="chat__log" ref={listRef}>
            {!messages.length
              ? <div className="chat__welcome">
                  <i className="chat__mark">{icon("spark")}</i>
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
                    {m.proposal
                      ? <button className="pill pill--green" type="button" onClick={() => setProposal(m.proposal)}>{icon("spark")}{m.proposal.title}</button>
                      : m.from === "me"
                        /* o que a pessoa escreveu sai como ela escreveu; o que o
                           Merlin responde vem em markdown e é lido como markdown —
                           lista dele e título dele viravam asterisco e cerquilha na tela */
                        ? <p>{m.text}</p>
                        : <Markdown className="chat__body" text={m.text} />}
                  </div>
                ))}
            {thinking && <div className="chat__msg"><p className="weak">pensando…</p></div>}
          </div>

          <form className="chat__composer" autoComplete="off" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
            {start && (
              <p className="chat__mode">
                {start.icon}{start.title}
                <button type="button" aria-label="Tirar" title="tirar" onClick={() => setStartKey("")}>{icon("x")}</button>
              </p>
            )}
            <div className="chat__row">
              <input ref={fieldRef} className="chat__field" autoFocus maxLength="1000"
                     placeholder={start ? start.placeholder : "escreva para o Merlin…"}
                     aria-label="Escreva para o Merlin"
                     value={input} onChange={(e) => setInput(e.currentTarget.value)} />
              <button className="pill pill--green pill--icon" type="submit" aria-label="Enviar"
                      disabled={thinking || !input.trim()}>{icon("arrow")}</button>
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
      {proposal && <ProposalDialog proposal={proposal} onClose={() => setProposal(null)} />}
    </>
  );
}

mount(<Assistant />, "app");
