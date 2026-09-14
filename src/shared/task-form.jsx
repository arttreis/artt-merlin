/* merlin · virar tarefa
 *
 * quatro telas mandam coisa para o calendario: a nota, o cliente, o prospecto
 * e o card de conteudo. antes cada uma chamava sendToDay sem duracao — e sem
 * duracao o core devolvia uma NOTA, entao "puxar para o dia" de uma nota criava
 * outra nota. uma tarefa de verdade precisa de data; a duracao continua
 * opcional, porque so o dia cobra minutos (ver tasks.js).
 *
 * a caixa e a mesma para as quatro: o que muda e o titulo sugerido, o cliente
 * e a origem, que e o fio de volta para quem mandou.
 */
import { today, isDay, notify, parseDuration, parseMentions } from "./core.js";
import { tasks, newTask, topOrder } from "./tasks.js";
import { useFields, Form, Field, DateField, clientOptionList } from "./ui.jsx";

/* grava e devolve a tarefa. fora da caixa, para quem ja sabe tudo (mover um
   card para "gravar" nao precisa perguntar nada). */
export function createTask({ title, date, min, client, origin }) {
  const store = tasks();
  const day = isDay(date) ? date : today();
  const task = newTask({ title, date: day, min: min || 0, client: client || "", origin: origin || null, order: topOrder(store.all(), day) });
  store.save(task);
  return task;
}

const dayWord = (date) => date === today() ? "hoje" : date.split("-").reverse().slice(0, 2).join("/");

export function TaskDialog({ title = "", date, client = "", origin, heading = "virar tarefa", onClose, onCreated }) {
  const [v, bind] = useFields({ title, date: date || today(), duration: "", client });
  const submit = () => {
    const found = parseMentions(v.title);
    const parsed = parseDuration(found.title);
    const text = parsed.title.trim().slice(0, 300);
    if (!text) { notify("a tarefa precisa de um título"); return false; }
    if (!isDay(v.date)) { notify("preciso de uma data"); return false; }
    const task = createTask({
      title: text, date: v.date, min: parseDuration(v.duration).min || parsed.min,
      client: v.client || found.client || "", origin
    });
    notify("virou tarefa de " + dayWord(task.date), () => tasks().remove(task.id));
    if (onCreated) onCreated(task);
  };
  return (
    <Form title={heading} submit="criar tarefa" onClose={onClose} onSubmit={submit}>
      <Field label="o que fazer" full><input className="input" maxLength="300" required placeholder="o que fazer · 45m" {...bind("title")} /></Field>
      <Field label="dia"><DateField required {...bind("date")} /></Field>
      <Field label="duração"><input className="input input--mono" placeholder="45m" {...bind("duration")} /></Field>
      <Field label="cliente" full><select className="select" {...bind("client")}>{clientOptionList("sem cliente")}</select></Field>
    </Form>
  );
}
