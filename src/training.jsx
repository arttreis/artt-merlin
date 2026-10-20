/* merlin · o treino
   a semana de segunda a domingo, cada dia com os treinos dele (o que e
   quantos minutos) e o total da semana no alto. nasceu em 20/10/2026 com o
   verbo dela (VISAO, 13.7): "treinei perna 40min" no início ou na conversa
   grava aqui e marca o hábito de treino, se houver (PRD saude-completa, D4).

   é a coleção `workouts`, um documento por treino (shared/workouts-data.js).
   sem plano, série, carga, distância nem caloria: só o que e quanto tempo. */
import "./shared/base.css";
import "./training.css";
import { useState } from "react";
import { initPage, today, mondayOf, addDays, dateOf, dateLabel, weekdayOf, notify } from "./shared/core.js";
import { mount, useCollection, useFields, EmptyStart, PeriodNav, Form, Field, icon } from "./shared/ui.jsx";
import { normalize as normalizeHabit } from "./shared/habits-data.js";
import { normalize, WORKOUT_MODELS, weekWorkouts, weekTotal, readMinutes, workoutDoc, workoutLine, logWorkout, applyWorkout, trainingHabit } from "./shared/workouts-data.js";

initPage("training");

/* "13–19 out" quando cabe no mesmo mês; "26 out–1 nov" quando vira o mês */
function weekRange(monday) {
  const end = addDays(monday, 6);
  if (dateOf(monday).getMonth() === dateOf(end).getMonth()) return dateOf(monday).getDate() + "–" + dateLabel(end);
  return dateLabel(monday) + "–" + dateLabel(end);
}

/* "seg 20/10" */
const dayTitle = (day) => weekdayOf(day) + " " + day.slice(8) + "/" + day.slice(5, 7);

/* ---------- a caixa do treino ----------
   `open.id` corrige um treino; sem id, é um novo, que já pode vir com o dia,
   o nome e os minutos (o dia vazio da semana, ou o modelo da tela vazia).
   o novo marca o hábito de treino do dia, e a caixa diz qual antes */
function WorkoutForm({ workouts, habits, open, onClose }) {
  const now = today();
  const editing = open.id ? workouts.get(open.id) : null;
  const [v, bind] = useFields({
    date: (editing && editing.day) || open.day || now,
    title: (editing && editing.title) || open.title || "",
    min: editing ? String(editing.min) : open.min ? String(open.min) : ""
  });
  const h = !editing ? trainingHabit(habits.all(), v.title) : null;
  const sub = v.date > now ? "esse dia ainda não chegou"
    : h && !h.marks[v.date] ? "marca também o hábito " + h.name
    : "o que você treinou e por quanto tempo";
  const spec = { date: v.date, title: v.title, min: readMinutes(v.min) };
  const submit = () => {
    if (editing) {
      const { doc, error } = workoutDoc(spec, editing, now);
      if (error) { notify(error); return false; }
      workouts.save(doc);
      notify("✓ registrado · " + workoutLine(doc, now), () => workouts.save({ ...editing, updatedAt: Date.now() }));
      return;
    }
    const res = logWorkout(spec, habits.all(), now);
    if (res.error) { notify(res.error); return false; }
    notify("✓ registrado · " + res.line, applyWorkout(workouts, habits, res));
  };
  const erase = () => {
    workouts.remove(editing.id);
    notify("treino apagado", () => workouts.save({ ...editing, updatedAt: Date.now() }));
  };
  return (
    <Form title={editing ? "o treino de " + dayTitle(editing.day) : "o que você treinou?"} sub={sub}
          submit="registrar" remove={editing ? "apagar o treino" : undefined} onRemove={erase} onSubmit={submit} onClose={onClose}>
      <Field label="dia"><input className="input" type="date" max={now} {...bind("date")} /></Field>
      <Field label="o que treinou"><input className="input" maxLength={60} placeholder="perna" {...bind("title")} /></Field>
      <Field label="minutos"><input className="input" inputMode="numeric" placeholder="40" {...bind("min")} /></Field>
    </Form>
  );
}

/* ---------- a página ---------- */
function Training() {
  const workouts = useCollection("workouts", { normalize });
  const habits = useCollection("habits", { normalize: normalizeHabit });
  const now = today();
  const [monday, setMonday] = useState(() => mondayOf(now));
  const [open, setOpen] = useState(null); // null fechada; {} o "+"; {id} um treino; {day, title, min} um novo já preenchido

  const docs = workouts.all();
  const empty = !docs.some((d) => d.min > 0);
  const days = weekWorkouts(docs, monday);
  const total = weekTotal(docs, monday);

  return (
    <>
      <div className="header">
        <div>
          <h1>treino</h1>
          <p className="sub">{total ? "na semana · " + total + " min" : "o que você treinou, dia a dia"}</p>
        </div>
        <div className="actions">
          {!empty && <PeriodNav label={weekRange(monday)} current={monday === mondayOf(now)} prevLabel="semana anterior" nextLabel="próxima semana"
            onPrev={() => setMonday((m) => addDays(m, -7))} onNext={() => setMonday((m) => addDays(m, 7))}
            onToday={() => setMonday(mondayOf(now))} />}
          <button className="action" type="button" title="registrar um treino" aria-label="Registrar um treino" onClick={() => setOpen({})}>{icon("plus")}</button>
        </div>
      </div>
      {empty
        ? <EmptyStart title="que treino você faz?" text="escolha um para registrar hoje; o nome e os minutos dá para mudar na caixa"
            groups={[{ key: "models", label: "os treinos", note: "com os minutos de costume", items: WORKOUT_MODELS.map((m) => ({ ...m, line: m.min + " min" })) }]}
            onPick={(it) => setOpen({ day: now, title: it.name, min: it.min })} />
        : (
          <section className="block">
            <ol className="tr-week">
              {days.map((d) => {
                const future = d.day > now;
                return (
                  <li key={d.day} className={"tr-day" + (d.day === now ? " is-today" : "") + (future ? " is-future" : "")}>
                    <span className="tr-day__day t-mono">{dayTitle(d.day)}</span>
                    <span className="tr-day__items">
                      {d.items.map((w) => (
                        <button key={w.id} className="tr-item" type="button" aria-label={"Corrigir " + w.title + " · " + w.min + " min"} onClick={() => setOpen({ id: w.id })}>
                          <span className="tr-item__title">{w.title}</span>
                          <span className="tr-item__min t-mono">{w.min} min</span>
                        </button>
                      ))}
                      {!future && (
                        <button className="tr-add" type="button" aria-label={"Registrar um treino em " + dayTitle(d.day)} title="registrar um treino"
                                onClick={() => setOpen({ day: d.day })}>{icon("plus")}</button>
                      )}
                    </span>
                    <span className="tr-day__min t-mono">{d.min ? d.min + " min" : ""}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      {open && <WorkoutForm key={open.id || open.day || open.title || "new"} workouts={workouts} habits={habits} open={open} onClose={() => setOpen(null)} />}
    </>
  );
}

mount(<Training />, "app");
