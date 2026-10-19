/* merlin · o cartão do "o que falta hoje?" (a secretária, D3)
 *
 * a resposta na conversa do início: uma coisa só, a próxima. de onde veio, o
 * que fazer, por que agora, o custo, as ações, o "a seguir" (só o título) e
 * "faltam N · M feitas". a lista sai de shared/quests.js, e o cartão é
 * desenhado de novo a cada mudança das coleções: concluir mostra a próxima no
 * mesmo lugar, sem perguntar outra vez.
 *
 * cada tipo de item tem o seu desenho em VIEWS. tipo novo é uma linha ali e uma
 * fonte no quests.js (as contas previstas de dias passados entraram assim).
 *
 * toda ação que grava avisa com desfazer. "agora não" não grava: pula até a
 * lista mudar, e o pulo mora só nesta página.
 *
 * reserva (almoço, call, bloco fixo) ocupa a janela e não se conclui: o cartão
 * dela não tem "concluir" (tem "amanhã" e "agora não"), nem a sessão de foco
 * aberta nela. concluir devolveria a hora da reserva à sobra do dia. */
import "./quest-card.css";
import { useState } from "react";
import { createPortal } from "react-dom";
import { today, addDays, dateOf, notify, brl } from "./core.js";
import { useCollection } from "./ui.jsx";
import { normalize as normalizeFinance, configOf } from "./finance-data.js";
import { EntryForm } from "./entry-form.jsx";
import { questsOf, nextQuest, listKey, countLine, moveTask, dropTask, doneTask, paidEntry, moveEntry, DAY_HREF } from "./quests.js";
import { runningOf, startSession, stopSession, receipt } from "./focus.js";
import { costOf, fmt, longFmt, clock } from "./day.js";

const CHIPS = [15, 30, 60, 120];
const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/* "ontem" ou "qua 14/10": a data de relance, como no campo do início */
function dayWord(date) {
  if (date === addDays(today(), -1)) return "ontem";
  if (date === addDays(today(), 1)) return "amanhã";
  const d = dateOf(date);
  return WEEKDAY[d.getDay()] + " " + String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
}

/* o esqueleto que os tipos preenchem */
function Shell({ from, title, meta, why, children }) {
  return (
    <>
      <p className="qc__from t-mono">{from}</p>
      <p className="qc__title">{title}{meta && <small className="t-mono"> · {meta}</small>}</p>
      {why && <p className="qc__why">{why}</p>}
      <div className="qc__acts">{children}</div>
    </>
  );
}

const Act = ({ main, onClick, children, ...rest }) => (
  <button type="button" className={"qc__act" + (main ? " is-main" : "")} onClick={onClick} {...rest}>{children}</button>
);

/* ---------- os tipos ---------- */

/* desfazer o começo: some a sessão nova e a anterior volta a rodar */
function begin(sessions, task) {
  const prev = runningOf(sessions.all());
  const s = startSession(sessions, task);
  notify("foco em " + task.title, () => {
    sessions.remove(s.id);
    if (prev) sessions.save({ ...prev, end: null, updatedAt: Date.now() });
  });
}

function SessionQuest({ quest, tasks, sessions }) {
  const task = quest.task ? tasks.get(quest.task) : null;
  const stop = (finish) => {
    const done = stopSession(sessions);
    if (!done) return;
    const undoTask = finish && task ? doneTask(tasks, task) : null;
    const r = receipt(done);
    notify(quest.title + " levou " + longFmt(r.took) + (r.planned ? " · " + r.verdict : "") + (undoTask ? " · concluída" : ""), () => {
      sessions.save({ ...done, end: null, updatedAt: Date.now() });
      if (undoTask) undoTask();
    });
  };
  const canFinish = !!task && !task.done && !task.reserved;
  return (
    <Shell from="agora · em foco" title={quest.title}
           meta={fmt(quest.elapsed || 1) + (quest.min ? " de " + fmt(quest.min) : "")}
           why="a sessão de foco está rodando">
      {canFinish && <Act main onClick={() => stop(true)}>concluir</Act>}
      <Act main={!canFinish} onClick={() => stop(false)}>parar</Act>
    </Shell>
  );
}

function AppointmentQuest({ quest, tasks, sessions, later }) {
  const t = quest.task;
  const end = t.at + costOf(t);
  const done = () => {
    const undo = doneTask(tasks, t);
    if (undo) notify("concluída · " + t.title, undo);
  };
  const tomorrow = () => {
    const undo = moveTask(tasks, t, addDays(today(), 1), 0);
    if (undo) notify("foi para amanhã", undo);
  };
  return (
    <Shell from="agora" title={t.title} meta={clock(t.at) + " · " + fmt(costOf(t))}
           why={quest.live ? "em curso, até " + clock(end) : quest.wait ? "começa em " + quest.wait + " min" : "começa agora"}>
      <Act main onClick={() => begin(sessions, t)}>começar foco</Act>
      {t.reserved ? (
        <>
          <Act onClick={tomorrow}>amanhã</Act>
          <Act onClick={later}>agora não</Act>
        </>
      ) : <Act onClick={done}>concluir</Act>}
    </Shell>
  );
}

function OverdueQuest({ quest, tasks, later }) {
  const t = quest.task;
  const [step, setStep] = useState(""); // "" | "min": cobra a duração | "date": escolhe o dia
  const move = (date, min, said) => {
    const undo = moveTask(tasks, t, date, min);
    if (undo) notify(said, undo);
  };
  const toToday = (min) => move(today(), min, "entrou em hoje · " + fmt(min));
  const drop = () => {
    const undo = dropTask(tasks, t);
    if (undo) notify("largada · " + t.title, undo);
  };
  return (
    <Shell from="ficou para trás" title={t.title} meta={t.min ? fmt(t.min) : ""} why={"era para " + dayWord(t.date)}>
      {step === "min" ? (
        <>
          <span className="qc__ask">quanto leva?</span>
          {CHIPS.map((m) => <Act key={m} onClick={() => toToday(m)}><span className="t-mono">{fmt(m)}</span></Act>)}
          <Act onClick={() => setStep("")}>voltar</Act>
        </>
      ) : step === "date" ? (
        <>
          <input className="qc__date" type="date" min={addDays(today(), 1)} aria-label="Outro dia" autoFocus
                 onChange={(e) => { const d = e.currentTarget.value; if (d && d > today()) move(d, 0, "foi para " + dayWord(d)); }} />
          <Act onClick={() => setStep("")}>voltar</Act>
        </>
      ) : (
        <>
          <Act main onClick={() => (t.min ? toToday(t.min) : setStep("min"))}>hoje</Act>
          <Act onClick={() => move(addDays(today(), 1), 0, "foi para amanhã")}>amanhã</Act>
          <Act onClick={() => setStep("date")}>outro dia</Act>
          <Act onClick={drop}>largar</Act>
          <Act onClick={later}>agora não</Act>
        </>
      )}
    </Shell>
  );
}

/* a conta prevista cujo dia passou: aconteceu? "não" abre a caixa do
   lançamento com o previsto, para mudar a data ou apagar. a caixa vai para o
   body: o balão do Merlin tem backdrop-filter, e um diálogo fixo dentro dele
   ficaria preso no balão */
function BillQuest({ quest, finance, later }) {
  const e = quest.entry;
  const [editing, setEditing] = useState(false);
  const paid = () => {
    const undo = paidEntry(finance, e);
    if (undo) notify(e.name + " confirmado", undo);
  };
  const tomorrow = () => {
    const undo = moveEntry(finance, e, addDays(today(), 1));
    if (undo) notify(e.name + " foi para amanhã", undo);
  };
  /* as mesmas gravações da tela do financeiro */
  const save = (doc, existing, text) => {
    finance.save({ ...doc, createdAt: existing ? existing.createdAt : Date.now(), updatedAt: Date.now() });
    notify(text);
  };
  const remove = (id, text) => {
    const before = finance.remove(id);
    notify(text, before ? () => finance.save(before) : null);
  };
  return (
    <Shell from="ficou para trás" title={e.name} meta={(e.kind === "in" ? "+" : "") + brl(e.amount)}
           why={"era para " + dayWord(e.day) + " · aconteceu?"}>
      <Act main onClick={paid}>sim</Act>
      <Act onClick={() => setEditing(true)}>não</Act>
      <Act onClick={tomorrow}>amanhã</Act>
      <Act onClick={later}>agora não</Act>
      {editing && createPortal(
        <EntryForm finance={finance} categories={configOf(finance).categories} id={e.id}
                   onClose={() => setEditing(false)} onSave={save} onRemove={remove} />,
        document.body)}
    </Shell>
  );
}

function GroupQuest({ quest, later, open = "abrir o dia" }) {
  return (
    <Shell from="ficou para trás" title={quest.title} why={"a mais antiga é de " + dayWord(quest.items[0].date)}>
      <a className="qc__act is-main" href={quest.href}>{open}</a>
      <Act onClick={later}>agora não</Act>
    </Shell>
  );
}

const VIEWS = {
  session: SessionQuest,
  appointment: AppointmentQuest,
  overdue: OverdueQuest,
  "overdue-group": GroupQuest,
  bill: BillQuest,
  "bill-group": (props) => <GroupQuest {...props} open="abrir o financeiro" />
};

/* ---------- o cartão ---------- */

export function QuestCard({ tasks, sessions }) {
  const finance = useCollection("finance", { normalize: normalizeFinance });
  const state = questsOf({ tasks: tasks.all(), sessions: sessions.all(), entries: finance.all() });
  const key = listKey(state);
  const [skip, setSkip] = useState({ key, ids: [] });
  const skipped = skip.key === key ? skip.ids : [];
  const { quest, next } = nextQuest(state, skipped);

  if (!quest) {
    return (
      <section className="qc qc--empty" aria-label="O que falta hoje">
        <p className="qc__title">{state.left ? "o resto fica para depois" : "nada agora nem para trás"} · <a href={DAY_HREF}>o dia está no calendário</a></p>
        {state.left > 0 && <p className="qc__foot"><button type="button" onClick={() => setSkip({ key, ids: [] })}>ver de novo</button><span>{countLine(state)}</span></p>}
      </section>
    );
  }
  const View = VIEWS[quest.type];
  return (
    <section className="qc" aria-label="O que falta hoje">
      {/* a chave troca o desenho quando a coisa muda: o "quanto leva?" de uma
          atrasada não pode ficar aberto na seguinte */}
      <View key={quest.id} quest={quest} tasks={tasks} sessions={sessions} finance={finance}
            later={() => setSkip({ key, ids: skipped.concat(quest.id) })} />
      <p className="qc__foot">
        {next && <span>a seguir: {next}</span>}
        <span>{countLine(state)}</span>
      </p>
    </section>
  );
}
