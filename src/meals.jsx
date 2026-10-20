/* merlin · a alimentação
   a semana de segunda a domingo, cada dia com as refeições dele na ordem do
   dia ("almoço · salada"). nasceu em 20/10/2026 com o verbo dela (VISAO,
   13.7): "almocei salada" no início ou "ontem jantei pizza" na conversa
   anotam aqui.

   é a coleção `meals`, um documento por refeição (shared/meals-data.js). sem
   culpa: nenhuma caloria, macro, peso, nota ou cor de "bom ou ruim". só o que
   a pessoa comeu e em que refeição. */
import "./shared/base.css";
import "./meals.css";
import { useState } from "react";
import { initPage, today, mondayOf, addDays, dateOf, dateLabel, weekdayOf, notify } from "./shared/core.js";
import { mount, useCollection, useFields, EmptyStart, PeriodNav, Form, Field, icon } from "./shared/ui.jsx";
import { normalize, MEALS, TEXT_MAX, mealAt, mealLabel, mealDoc, mealLine, weekMeals } from "./shared/meals-data.js";

initPage("meals");

/* "13–19 out" quando cabe no mesmo mês; "26 out–1 nov" quando vira o mês */
function weekRange(monday) {
  const end = addDays(monday, 6);
  if (dateOf(monday).getMonth() === dateOf(end).getMonth()) return dateOf(monday).getDate() + "–" + dateLabel(end);
  return dateLabel(monday) + "–" + dateLabel(end);
}

/* "seg 20/10" */
const dayTitle = (day) => weekdayOf(day) + " " + day.slice(8) + "/" + day.slice(5, 7);

/* ---------- a caixa da refeição ----------
   `open.id` corrige uma refeição; sem id, é uma nova, que já pode vir com o
   dia e a refeição (o "+" do dia, ou o modelo da tela vazia). sem refeição
   dita, a caixa abre na do horário */
function MealForm({ meals, open, onClose }) {
  const now = today();
  const editing = open.id ? meals.get(open.id) : null;
  const [v, bind] = useFields({
    date: (editing && editing.day) || open.day || now,
    meal: (editing && editing.meal) || open.meal || mealAt(new Date().getHours()),
    text: (editing && editing.text) || ""
  });
  const sub = v.date > now ? "esse dia ainda não chegou" : "o que você comeu, do seu jeito";
  const submit = () => {
    const { doc, error } = mealDoc({ date: v.date, meal: v.meal, text: v.text }, editing, now);
    if (error) { notify(error); return false; }
    meals.save(doc);
    notify("✓ anotado · " + mealLine(doc, now), () => {
      if (editing) meals.save({ ...editing, updatedAt: Date.now() }); else meals.remove(doc.id);
    });
  };
  const erase = () => {
    meals.remove(editing.id);
    notify("refeição apagada", () => meals.save({ ...editing, updatedAt: Date.now() }));
  };
  return (
    <Form title={editing ? mealLabel(editing.meal) + " de " + dayTitle(editing.day) : "o que você comeu?"} sub={sub}
          submit="anotar" remove={editing ? "apagar a refeição" : undefined} onRemove={erase} onSubmit={submit} onClose={onClose}>
      <Field label="dia"><input className="input" type="date" max={now} {...bind("date")} /></Field>
      <Field label="refeição">
        <select className="select" {...bind("meal")}>
          {MEALS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </Field>
      <Field label="o que comeu" full><input className="input" maxLength={TEXT_MAX} placeholder="salada" {...bind("text")} /></Field>
    </Form>
  );
}

/* ---------- a página ---------- */
function Meals() {
  const meals = useCollection("meals", { normalize });
  const now = today();
  const [monday, setMonday] = useState(() => mondayOf(now));
  const [open, setOpen] = useState(null); // null fechada; {} o "+"; {id} uma refeição; {day, meal} uma nova já escolhida

  const docs = meals.all();
  const empty = !docs.some((d) => d.text);
  const days = weekMeals(docs, monday);
  const count = days.reduce((n, d) => n + d.items.length, 0);

  return (
    <>
      <div className="header">
        <div>
          <h1>alimentação</h1>
          <p className="sub">{count ? "na semana · " + count + (count === 1 ? " refeição" : " refeições") : "o que você comeu, dia a dia"}</p>
        </div>
        <div className="actions">
          {!empty && <PeriodNav label={weekRange(monday)} current={monday === mondayOf(now)} prevLabel="semana anterior" nextLabel="próxima semana"
            onPrev={() => setMonday((m) => addDays(m, -7))} onNext={() => setMonday((m) => addDays(m, 7))}
            onToday={() => setMonday(mondayOf(now))} />}
          <button className="action" type="button" title="anotar uma refeição" aria-label="Anotar uma refeição" onClick={() => setOpen({})}>{icon("plus")}</button>
        </div>
      </div>
      {empty
        ? <EmptyStart title="o que você come no dia?" text="escolha uma refeição para anotar hoje; o dia dá para mudar na caixa"
            groups={[{ key: "meals", label: "as refeições", note: "na ordem do dia", items: MEALS.map((m) => ({ id: m.id, name: m.label })) }]}
            onPick={(it) => setOpen({ day: now, meal: it.id })} />
        : (
          <section className="block">
            <ol className="ml-week">
              {days.map((d) => {
                const future = d.day > now;
                return (
                  <li key={d.day} className={"ml-day" + (d.day === now ? " is-today" : "") + (future ? " is-future" : "")}>
                    <span className="ml-day__day t-mono">{dayTitle(d.day)}</span>
                    <span className="ml-day__items">
                      {d.items.map((m) => (
                        <button key={m.id} className="ml-item" type="button" aria-label={"Corrigir " + mealLabel(m.meal) + " · " + m.text} onClick={() => setOpen({ id: m.id })}>
                          <span className="ml-item__meal t-mono">{mealLabel(m.meal)}</span>
                          <span className="ml-item__text">{m.text}</span>
                        </button>
                      ))}
                      {!future && (
                        <button className="ml-add" type="button" aria-label={"Anotar uma refeição em " + dayTitle(d.day)} title="anotar uma refeição"
                                onClick={() => setOpen({ day: d.day })}>{icon("plus")}</button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      {open && <MealForm key={open.id || (open.day || "") + (open.meal || "") || "new"} meals={meals} open={open} onClose={() => setOpen(null)} />}
    </>
  );
}

mount(<Meals />, "app");
