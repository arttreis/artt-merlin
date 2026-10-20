/* merlin · a operação
   os processos recorrentes da empresa (PRD meu-negocio, D6): emitir notas
   todo dia 5, o DAS, o backup da sexta. em cima, "esta semana": o que vence
   nos próximos 7 dias e o que venceu no período sem ser feito; embaixo, todos
   os processos. marcar feito grava o dia no período (o mês, a semana ou o ano).

   operação é prazo, não tempo: a rotina diz quando se trabalha, e aqui só se
   diz até quando. nada daqui vira tarefa no calendário; o que vence hoje
   aparece no "o que falta hoje?" (shared/quests.js). nasceu com os verbos
   (VISAO, 13.7): "todo dia 5 emito as notas" e "emiti as notas".

   é a coleção `ops`, um documento por processo (shared/ops-data.js). */
import "./shared/base.css";
import "./ops.css";
import { useState } from "react";
import { initPage, today, addDays, weekdayOf, notify } from "./shared/core.js";
import { mount, useCollection, useFields, EmptyStart, Form, Field, icon } from "./shared/ui.jsx";
import {
  normalize, FREQS, OPS_TEMPLATES, opDoc, dueOn, isDone, periodOf, nextPeriod, dueBetween, pendingOn, freqLabel, periodLabel, doneLine,
  markDone, unmarkDone, parseDay, dayText
} from "./shared/ops-data.js";

initPage("ops");

const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));
const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0].map((n) => dayText("weekly", n));
const FIRST_DAY = { monthly: "5", weekly: "seg", yearly: "" };

/* "hoje", "amanhã", "ontem" ou "qui 22/10" */
function dueWord(day, now) {
  if (day === now) return "hoje";
  if (day === addDays(now, 1)) return "amanhã";
  if (day === addDays(now, -1)) return "ontem";
  return weekdayOf(day) + " " + day.slice(8) + "/" + day.slice(5, 7);
}

/* ---------- a caixa do processo ----------
   `open.id` edita; sem id, é um novo, que pode vir de um modelo da tela vazia
   (`open.preset`). o dia se escolhe pela frequência: o dia do mês, o da
   semana, ou "15/03" no anual. o checklist é um passo por linha */
function OpForm({ ops, open, onClose }) {
  const editing = open.id ? ops.get(open.id) : null;
  const base = editing || open.preset || {};
  const freq0 = base.freq || "monthly";
  const [v, bind, set] = useFields({
    title: (editing ? editing.title : open.preset && open.preset.name) || "",
    freq: freq0,
    day: base.day != null ? dayText(freq0, base.day) : FIRST_DAY[freq0],
    steps: editing ? editing.checklist.map((c) => c.text).join("\n") : ""
  });
  const changeFreq = (e) => { const f = e.currentTarget.value; set("freq", f); set("day", FIRST_DAY[f]); };
  const day = parseDay(v.freq, v.day);
  const sub = day == null ? "qual dia? (5, seg ou 15/03)" : freqLabel({ freq: v.freq, day }) + " · é prazo, não vira tarefa no calendário";
  const submit = () => {
    const { doc, error } = opDoc({ title: v.title, freq: v.freq, day: v.day }, Date.now());
    if (error) { notify(error); return false; }
    const checklist = v.steps.split("\n").map((text, i) => ({ id: (editing && editing.checklist[i] && editing.checklist[i].id) || doc.id + "-" + i, text: text.trim() })).filter((c) => c.text);
    const saved = editing
      ? normalize({ ...editing, title: doc.title, freq: doc.freq, day: doc.day, checklist, updatedAt: Date.now() })
      : { ...doc, checklist };
    ops.save(saved);
    notify("✓ processo · " + saved.title + " · " + freqLabel(saved), () => {
      if (editing) ops.save({ ...editing, updatedAt: Date.now() }); else ops.remove(saved.id);
    });
  };
  const erase = () => {
    ops.remove(editing.id);
    notify("processo apagado", () => ops.save({ ...editing, updatedAt: Date.now() }));
  };
  return (
    <Form title={editing ? editing.title : "novo processo"} sub={sub}
          submit={editing ? "salvar" : "criar"} remove={editing ? "apagar o processo" : undefined} onRemove={erase} onSubmit={submit} onClose={onClose}>
      <Field label="processo" full><input className="input" maxLength={80} placeholder="emitir notas" {...bind("title")} /></Field>
      <Field label="frequência">
        <select className="select" name="freq" value={v.freq} onChange={changeFreq}>
          {FREQS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </Field>
      <Field label={v.freq === "monthly" ? "dia do mês" : v.freq === "weekly" ? "dia da semana" : "dia (dd/mm)"}>
        {v.freq === "yearly"
          ? <input className="input" inputMode="numeric" placeholder="15/03" {...bind("day")} />
          : <select className="select" {...bind("day")}>
              {(v.freq === "monthly" ? MONTH_DAYS : WEEK_DAYS).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>}
      </Field>
      <Field label="checklist (opcional, um passo por linha)" full>
        <textarea className="textarea" rows="3" placeholder={"baixar o relatório\nconferir os valores"} {...bind("steps")} />
      </Field>
    </Form>
  );
}

/* ---------- a página ---------- */
function Ops() {
  const ops = useCollection("ops", { normalize });
  const now = today();
  const [open, setOpen] = useState(null); // null fechada; {} o "+"; {id} um processo; {preset} um modelo

  const list = ops.all().filter((o) => !o.deleted && o.title).sort((a, b) => a.title.localeCompare(b.title));
  /* o que venceu no período e não foi feito, e depois os próximos 7 dias */
  const week = pendingOn(list, now).filter((x) => x.late).map((x) => ({ ...x, done: false }))
    .concat(dueBetween(list, now, addDays(now, 6)));

  /* feito grava hoje, que está no período do prazo; o prazo de um período que
     ainda não começou (o dia 1 do mês que vem) não se marca */
  const toggle = (op, due) => {
    if (isDone(op, due)) {
      ops.save(unmarkDone(op, due));
      notify("desmarcado · " + doneLine(op, due), () => ops.save({ ...op, updatedAt: Date.now() }));
      return;
    }
    const { doc, error } = markDone(op, now, now);
    if (error) { notify(error); return; }
    ops.save(doc);
    notify("✓ feito · " + doneLine(doc, now), () => ops.save({ ...op, updatedAt: Date.now() }));
  };
  const markable = (op, due) => periodOf(op, due) === periodOf(op, now);
  const late = new Set(pendingOn(list, now).filter((x) => x.late).map((x) => x.op.id));
  /* feito no período, devendo, ou o próximo prazo: o processo criado depois do
     prazo do mês não nasce devendo, e mostra o do mês seguinte */
  const statusOf = (op) => {
    if (isDone(op, now)) return "feito · " + periodLabel(op, now);
    if (late.has(op.id)) return "venceu " + dueWord(dueOn(op, now), now);
    const due = dueOn(op, now);
    return "vence " + dueWord(due >= now ? due : dueOn(op, nextPeriod(op, now)), now);
  };

  return (
    <>
      <div className="header">
        <div>
          <h1>operação</h1>
          <p className="sub">o que a empresa precisa fazer, e até quando</p>
        </div>
        <div className="actions">
          <button className="action" type="button" title="novo processo" aria-label="Novo processo" onClick={() => setOpen({})}>{icon("plus")}</button>
        </div>
      </div>
      {!list.length
        ? <EmptyStart title="O que a empresa precisa fazer para não parar"
            text={"Escolha um processo ou diga ao Merlin: \"todo dia 5 emito as notas\"."}
            groups={OPS_TEMPLATES} onPick={(it) => setOpen({ preset: it })} />
        : <>
          <section className="block">
            <p className="heading"><span className="t-mono">esta semana</span></p>
            {week.length
              ? <ul className="op-list">
                  {week.map(({ op, due, done, late }) => (
                    <li key={op.id + due} className={"op-row" + (done ? " is-done" : "") + (late ? " is-late" : "")}>
                      <button className="op-check" type="button" disabled={!done && !markable(op, due)}
                              aria-pressed={String(done)} aria-label={(done ? "Desmarcar " : "Marcar feito: ") + op.title}
                              title={done || markable(op, due) ? "" : "ainda não é o período"} onClick={() => toggle(op, due)}>
                        {done && icon("check")}
                      </button>
                      <span className="op-row__main">
                        <span className="op-row__title">{op.title}</span>
                        {op.checklist.length > 0 && <span className="op-row__steps">{op.checklist.map((c) => c.text).join(" · ")}</span>}
                      </span>
                      <span className="op-row__due t-mono">{done ? "feito" : (late ? "venceu " : "") + dueWord(due, now)}</span>
                    </li>
                  ))}
                </ul>
              : <p className="empty">nada vence nos próximos 7 dias.</p>}
          </section>
          <section className="block">
            <p className="heading"><span className="t-mono">todos os processos</span><span className="small weak">{list.length}</span></p>
            <ul className="op-list">
              {list.map((op) => {
                return (
                  <li key={op.id}>
                    <button className="op-item" type="button" aria-label={"Editar " + op.title} onClick={() => setOpen({ id: op.id })}>
                      <span className="op-row__title">{op.title}</span>
                      <span className="op-item__freq t-mono">{freqLabel(op)}</span>
                      <span className="op-row__due t-mono">{statusOf(op)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>}
      {open && <OpForm key={open.id || (open.preset && open.preset.id) || "new"} ops={ops} open={open} onClose={() => setOpen(null)} />}
    </>
  );
}

mount(<Ops />, "app");
