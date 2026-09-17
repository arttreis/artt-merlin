/* merlin · o assistente
   uma tela só, para uma conversa só. até 17/09/2026 isto era uma caixa em
   cima da busca — parecia chat (o log ficava na tela), mas cada turno subia
   sozinho: o servidor nunca via o que tinha sido dito antes. agora a tela
   manda o histórico inteiro a cada pergunta, e é o /api/merlin quem monta os
   turnos de verdade para o Claude (ver server/worker.js, `buildMessages`).

   a garantia não mudou: o Merlin nunca grava sozinho. cada proposta é um
   pill que abre o mesmo <ProposalDialog/> de sempre — um formulário comum,
   pré-preenchido — e só confirmar chama collection.save(). mapa e funil de
   onboarding, quando confirmados, levam direto para o documento pronto; o
   resto fica na conversa.

   a conversa em si continua sem ser dado do produto: mora só no estado do
   React desta página, e some ao navegar para outro lugar — igual sempre foi. */
import "./shared/base.css";
import "./assistant.css";
import { initPage, today, addDays, readPrefs, listClients, api } from "./shared/core.js";
import { useState, useEffect, useRef } from "react";
import { mount, icon, ProposalDialog } from "./shared/ui.jsx";
import { tasks, dayDoc } from "./shared/tasks.js";
import { budget, fmt } from "./shared/day.js";

initPage("assistant");

const ENTRY_KEY = "merlin:assistant:entry";
const STARTERS = [
  { label: "abrir um mapa mental", text: "quero montar um mapa mental" },
  { label: "abrir um funil", text: "quero montar um funil" },
  { label: "planejar a semana", text: "me ajuda a planejar a semana" },
  { label: "uma nota rápida", text: "quero anotar uma coisa" }
];

/* o que a busca sabia da tela onde a pessoa estava — navegar troca de
   documento e apagaria isso, então viaja pela sessão. lido (e apagado) uma
   vez só, na carga desta página: um recarregar não deve reenviar a mesma
   pergunta sozinho. */
function readEntry() {
  try {
    const raw = sessionStorage.getItem(ENTRY_KEY);
    sessionStorage.removeItem(ENTRY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
const entry = readEntry();

/* sem uma tela de referência (ctrl+j em branco, ou o item "merlin" da
   barra), o assistente não sabe quase nada do sistema. um resumo curto —
   nos mesmos moldes do que os outros contextos do worker já mandam — é
   melhor que perguntar tudo de novo a cada conversa. */
function globalContext() {
  const t = today();
  const all = tasks().all();
  const d = dayDoc(all, t, readPrefs());
  const b = budget(d);
  const dayLine = b.overtime ? "o dia já fechou" : b.slack > 0 ? "ainda cabem " + fmt(b.slack) + " no dia" : "não cabe mais nada hoje";
  const week = all.filter((x) => !x.done && !x.reserved && x.date >= t && x.date <= addDays(t, 6)).length;
  return [dayLine, week + " tarefa(s) aberta(s) nos próximos 7 dias", listClients().length + " cliente(s) cadastrado(s)"].join(" · ");
}

function Assistant() {
  const [messages, setMessages] = useState([]); // { from: "me"|"merlin", text } | { from: "merlin", proposal }
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [proposal, setProposal] = useState(null);
  const sentInitial = useRef(false);
  const listRef = useRef(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const ask = async (message) => {
    if (!message.trim() || thinking) return;
    const history = messagesRef.current.map((m) => ({
      role: m.from === "me" ? "user" : "assistant",
      content: m.text || ("[propôs " + m.proposal.actionType + ": '" + m.proposal.title + "']")
    }));
    setMessages((m) => m.concat([{ from: "me", text: message }]));
    setInput("");
    setThinking(true);
    try {
      const r = await api("/merlin", { method: "POST", body: JSON.stringify({
        task: "assistant",
        context: {
          message, history,
          page: (entry && entry.page) || "",
          pageContext: (entry && entry.pageContext) || globalContext()
        }
      }) });
      if (r.ok) {
        const s = (r.body.suggestions || [])[0];
        if (s) setMessages((m) => m.concat([{ from: "merlin", proposal: s }]));
        else setMessages((m) => m.concat([{ from: "merlin", text: r.body.clarify || "não entendi bem — pode dizer de outro jeito?" }]));
      } else if (r.status === 401) {
        setMessages((m) => m.concat([{ from: "merlin", text: "entre para usar o Merlin" }]));
      } else {
        setMessages((m) => m.concat([{ from: "merlin", text: r.body.error || "não consegui pensar nisso agora" }]));
      }
    } catch (e) {
      setMessages((m) => m.concat([{ from: "merlin", text: "não consegui falar com o Merlin" }]));
    } finally { setThinking(false); }
  };

  useEffect(() => {
    if (sentInitial.current) return;
    sentInitial.current = true;
    const msg = entry && entry.message;
    if (msg && msg.trim()) ask(msg);
  }, []);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [messages, thinking]);

  const hasInitial = !!(entry && entry.message && entry.message.trim());
  const showStarters = !messages.length && !thinking && !hasInitial;

  return (
    <>
      <header className="header">
        <div>
          <h1>merlin</h1>
          <p className="sub">peça uma tarefa, uma nota, ajuda com a rotina, um roteiro, um lead, ou pergunte algo do financeiro.</p>
        </div>
      </header>
      <div className="asst">
        <div className="asst__log" ref={listRef}>
          {showStarters && (
            <div className="asst__starters">
              {STARTERS.map((s) => (
                <button key={s.label} type="button" className="pill" onClick={() => ask(s.text)}>{s.label}</button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={"asst__msg" + (m.from === "me" ? " is-me" : "")}>
              {m.proposal
                ? <button className="pill pill--green" type="button" onClick={() => setProposal(m.proposal)}>{icon("spark")}{m.proposal.title}</button>
                : <p>{m.text}</p>}
            </div>
          ))}
          {thinking && <div className="asst__msg"><p className="weak">pensando…</p></div>}
        </div>
        <form className="asst__input" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
          <input className="input" autoFocus placeholder="escreva…" value={input} onChange={(e) => setInput(e.currentTarget.value)} />
          <button className="pill pill--green" type="submit" disabled={thinking || !input.trim()}>{icon("arrow")}</button>
        </form>
      </div>
      {proposal && <ProposalDialog proposal={proposal} onClose={() => setProposal(null)} />}
    </>
  );
}

mount(<Assistant />, "app");
