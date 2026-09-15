/* merlin · o mes pequeno
 *
 * a folhinha de pular de data. nasceu na barra das agendas do calendario e
 * saiu para ca quando o diario precisou dela (14/09/2026). o mes que se
 * folheia e estado dela; quando o dia escolhido muda, ela volta para o mes
 * dele. o que marca cada dia (a bolinha, a faixa) vem de quem usa.
 */
import "./mini-month.css";
import { useState, useEffect } from "react";
import { today, dateOf, dayOf, addDays, sundayOf, dateLabel, monthLabel } from "./core.js";
import { icon } from "./icons.jsx";

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const monthOf = (day) => day.slice(0, 7);

/* a grade comeca no domingo da semana do dia 1 e vai ate o sabado da semana
   do ultimo dia: e por isso que as pontas mostram dias do mes vizinho. */
export function monthGrid(month) {
  const first = month + "-01";
  const start = sundayOf(first);
  const last = new Date(dateOf(first).getFullYear(), dateOf(first).getMonth() + 1, 0);
  const end = sundayOf(dayOf(last));
  const weeks = [];
  for (let m = start; m <= end; m = addDays(m, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(m, i)));
  return weeks;
}

/* `busy(day)` poe a bolinha; `band(day)` a faixa de fundo; `pick` o anel no
   dia escolhido */
export function MiniMonth({ anchor, busy, band, pick, className, onPick }) {
  const [month, setMonth] = useState(monthOf(anchor));
  useEffect(() => { setMonth(monthOf(anchor)); }, [anchor]);
  const shift = (n) => {
    const d = dateOf(month + "-01");
    setMonth(monthOf(dayOf(new Date(d.getFullYear(), d.getMonth() + n, 1))));
  };
  const t = today();
  return (
    <div className={"mini" + (pick ? " mini--pick" : "") + (className ? " " + className : "")}>
      <div className="mini__head">
        <button className="action" type="button" title="mês anterior" aria-label="Mês anterior" onClick={() => shift(-1)}>{icon("chevronLeft")}</button>
        <b>{monthLabel(month).replace(/\s*\d{4}$/, "")} <span>{month.slice(0, 4)}</span></b>
        <button className="action" type="button" title="próximo mês" aria-label="Próximo mês" onClick={() => shift(1)}>{icon("chevronRight")}</button>
      </div>
      <div className="mini__grid">
        {WEEKDAYS.map((w) => <span key={w} className="mini__wd" aria-hidden="true">{w.slice(0, 1)}</span>)}
        {monthGrid(month).flat().map((day) => (
          <button key={day} type="button" data-day={day} aria-label={dateLabel(day)} aria-pressed={String(day === anchor)}
                  className={"mini__day" + (monthOf(day) !== month ? " is-out" : "") + (day === t ? " is-today" : "")
                    + (band && band(day) ? " is-in" : "") + (busy && busy(day) ? " is-busy" : "")}
                  onClick={() => onPick(day)}>{dateOf(day).getDate()}</button>
        ))}
      </div>
    </div>
  );
}
