/* merlin · a caixa do treino
   saiu de dentro de training.jsx em 20/10/2026: o cartão do "o que falta
   hoje?" no início oferece "registrar treino" e abre esta mesma caixa, com o
   dia de hoje e os minutos do hábito. importar o training.jsx montaria a página
   do treino em cima do início.

   `open.id` corrige um treino; sem id, é um novo, que já pode vir com o dia,
   o nome e os minutos (o dia vazio da semana, o modelo da tela vazia, ou o
   hábito que o cartão lembrou). `open.habit` fixa o hábito que o novo marca:
   o do cartão, e não o que o nome digitado achar. o novo marca o hábito de
   treino do dia, e a caixa diz qual antes */
import { today, notify, weekdayOf } from "./core.js";
import { useFields, Form, Field } from "./ui.jsx";
import { readMinutes, workoutDoc, workoutLine, logWorkout, applyWorkout, trainingHabit } from "./workouts-data.js";

/* "seg 20/10" */
export const dayTitle = (day) => weekdayOf(day) + " " + day.slice(8) + "/" + day.slice(5, 7);

export function WorkoutForm({ workouts, habits, open, onClose }) {
  const now = today();
  const editing = open.id ? workouts.get(open.id) : null;
  const [v, bind] = useFields({
    date: (editing && editing.day) || open.day || now,
    title: (editing && editing.title) || open.title || "",
    min: editing ? String(editing.min) : open.min ? String(open.min) : ""
  });
  const h = !editing ? trainingHabit(habits.all(), open.habit || v.title) : null;
  const sub = v.date > now ? "esse dia ainda não chegou"
    : h && !h.marks[v.date] ? "marca também o hábito " + h.name
    : "o que você treinou e por quanto tempo";
  const spec = { date: v.date, title: v.title, min: readMinutes(v.min), habit: open.habit };
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
