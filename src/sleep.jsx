/* merlin · o sono
   uma barra por noite, de segunda a domingo, cada noite no dia em que se
   acordou, com a linha da meta quando há meta. nasceu em 20/10/2026 com o
   verbo dela (VISAO, 13.7): "dormi 7h" no início ou na conversa grava aqui.

   é a coleção `sleep`, um documento por noite, com o id na data
   (shared/sleep-data.js). sono não tem qualidade nem nota: só as horas. a meta
   mora no perfil (profile/me, `sleepGoal`), como as outras preferências. */
import "./shared/base.css";
import "./sleep.css";
import { useState } from "react";
import { initPage, today, mondayOf, addDays, dateOf, dateLabel, weekdayOf, notify } from "./shared/core.js";
import { mount, useCollection, useFields, EmptyStart, PeriodNav, Form, Field, icon } from "./shared/ui.jsx";
import { normalize, SLEEP_GOALS, weekNights, weekAverage, sleepLabel, sleptBetween, readHours, sleepDoc, sleepLine, undoSleep } from "./shared/sleep-data.js";

initPage("sleep");

/* "13–19 out" quando cabe no mesmo mês; "26 out–1 nov" quando vira o mês */
function weekRange(monday) {
  const end = addDays(monday, 6);
  if (dateOf(monday).getMonth() === dateOf(end).getMonth()) return dateOf(monday).getDate() + "–" + dateLabel(end);
  return dateLabel(monday) + "–" + dateLabel(end);
}

/* "seg 20/10" */
const dayTitle = (day) => weekdayOf(day) + " " + day.slice(8) + "/" + day.slice(5, 7);

/* ---------- a caixa da noite ----------
   `night` é o dia tocado na semana (com registro, edita; sem, já vem nele);
   sem `night`, é o "+", e o dia começa em hoje. um documento por dia: salvar
   num dia que já tem registro substitui, e a caixa avisa antes */
function SleepForm({ sleep, night, onClose }) {
  const now = today();
  const editing = night ? sleep.get(night) : null;
  const [v, bind] = useFields({
    date: night || now,
    hours: editing ? sleepLabel(editing.min) : "",
    bed: (editing && editing.bed) || "",
    wake: (editing && editing.wake) || ""
  });
  const counted = v.bed && v.wake ? sleptBetween(v.bed, v.wake) : null;
  const other = !editing || v.date !== editing.id ? sleep.get(v.date) : null;
  const sub = v.date > now ? "esse dia ainda não chegou"
    : other ? "já há registro nesse dia (" + sleepLabel(other.min) + "): salvar substitui"
    : counted ? "deitou e acordou: " + sleepLabel(counted) + " de sono"
    : "a noite fica no dia em que você acordou";
  const submit = () => {
    const before = sleep.get(v.date);
    const { doc, error } = sleepDoc({ date: v.date, min: readHours(v.hours), bed: v.bed, wake: v.wake }, before, now);
    if (error) { notify(error); return false; }
    sleep.save(doc);
    /* trocou o dia de uma noite que já existia: ela muda de lugar */
    const moved = editing && editing.id !== doc.id ? editing : null;
    if (moved) sleep.remove(moved.id);
    notify("✓ registrado · " + sleepLine(doc.min, doc.id, now), () => {
      const undo = undoSleep(before, doc);
      if (undo.remove) sleep.remove(undo.remove); else sleep.save({ ...undo.save, updatedAt: Date.now() });
      if (moved) sleep.save({ ...moved, updatedAt: Date.now() });
    });
  };
  const erase = () => {
    sleep.remove(editing.id);
    notify("noite apagada", () => sleep.save({ ...editing, updatedAt: Date.now() }));
  };
  return (
    <Form title={editing ? "a noite de " + dayTitle(editing.id) : "quanto você dormiu?"} sub={sub}
          submit="registrar" remove={editing ? "apagar a noite" : undefined} onRemove={erase} onSubmit={submit} onClose={onClose}>
      <Field label="dia em que acordou"><input className="input" type="date" max={now} {...bind("date")} /></Field>
      <Field label="horas dormidas"><input className="input" inputMode="decimal" placeholder={counted ? sleepLabel(counted) : "7h30"} disabled={counted != null} {...bind("hours")} /></Field>
      <Field label="deitou (opcional)"><input className="input" type="time" {...bind("bed")} /></Field>
      <Field label="acordou (opcional)"><input className="input" type="time" {...bind("wake")} /></Field>
    </Form>
  );
}

/* ---------- a página ---------- */
function Sleep() {
  const sleep = useCollection("sleep", { normalize });
  const profile = useCollection("profile");
  const now = today();
  const [monday, setMonday] = useState(() => mondayOf(now));
  const [open, setOpen] = useState(null); // null fechada; "" o "+"; um dia, a noite dele

  const me = profile.get("me");
  /* a chave ausente é quem nunca escolheu; 0 é "sem meta" */
  const goal = me && me.sleepGoal != null ? Math.max(0, +me.sleepGoal || 0) : null;
  const setGoal = (min) => profile.save({ ...(me || { id: "me", createdAt: Date.now() }), sleepGoal: min, updatedAt: Date.now() });

  const docs = sleep.all();
  const empty = goal == null && !docs.some((d) => d.min > 0);
  const nights = weekNights(docs, monday);
  const average = weekAverage(docs, now);
  /* a régua: dez horas, ou mais, se a noite ou a meta passarem disso */
  const scale = Math.max(600, goal || 0, ...nights.map((n) => n.min));
  const pct = (min) => (min / scale) * 100 + "%";

  return (
    <>
      <div className="header">
        <div>
          <h1>sono</h1>
          <p className="sub">{average != null ? "média dos últimos 7 dias · " + sleepLabel(average) : "quanto você dormiu, noite a noite"}</p>
        </div>
        <div className="actions">
          {!empty && <PeriodNav label={weekRange(monday)} current={monday === mondayOf(now)} prevLabel="semana anterior" nextLabel="próxima semana"
            onPrev={() => setMonday((m) => addDays(m, -7))} onNext={() => setMonday((m) => addDays(m, 7))}
            onToday={() => setMonday(mondayOf(now))} />}
          {!empty && (
            <select className="select sl-goal" aria-label="meta de sono" value={goal || 0} onChange={(e) => setGoal(+e.currentTarget.value)}>
              {SLEEP_GOALS.map((g) => <option key={g.id} value={g.id}>{g.id ? "meta " + g.label : g.label}</option>)}
            </select>
          )}
          <button className="action" type="button" title="registrar uma noite" aria-label="Registrar uma noite" onClick={() => setOpen("")}>{icon("plus")}</button>
        </div>
      </div>
      {empty
        ? <EmptyStart title="quanto você dorme?" text="a meta vira uma linha na semana; dá para mudar depois"
            groups={[{ key: "goal", label: "a meta", note: "por noite", items: SLEEP_GOALS.map((g) => ({ id: String(g.id), name: g.label })) }]}
            onPick={(it) => setGoal(+it.id)} />
        : (
          <section className="block">
            <ol className="sl-week">
              {nights.map((n) => {
                const future = n.day > now;
                return (
                  <li key={n.day}>
                    <button className={"sl-night" + (n.day === now ? " is-today" : "")} type="button" disabled={future}
                            aria-label={dayTitle(n.day) + (n.min ? " · " + sleepLabel(n.min) + " de sono" : " · sem registro")}
                            onClick={() => setOpen(n.day)}>
                      <span className="sl-night__day t-mono">{dayTitle(n.day)}</span>
                      <span className="sl-night__track">
                        {n.min > 0 && <span className="sl-night__bar" style={{ width: pct(n.min) }} />}
                        {goal > 0 && <span className="sl-night__goal" style={{ left: pct(goal) }} aria-hidden="true" />}
                      </span>
                      <span className="sl-night__label t-mono">{sleepLabel(n.min)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      {open != null && <SleepForm key={open || "new"} sleep={sleep} night={open} onClose={() => setOpen(null)} />}
    </>
  );
}

mount(<Sleep />, "app");
