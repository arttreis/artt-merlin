/* merlin · o time
   quem trabalha com você, quanto custa e o que entregou (PRD meu-negocio,
   D5). nasceu em 20/10/2026 com os seus verbos (VISAO, 13.7): "a Ana entra
   como designer, 3 mil" e "a Ana entregou a landing" na conversa gravam aqui.

   é a coleção `team`, um documento por pessoa (shared/team-data.js). cadastro
   leve, não vigilância: sem horas, ponto, ranking nem avaliação, só as
   entregas que o dono anota. com custo, a pessoa vira um fixo de saída no
   caixa da empresa, e nunca no financeiro pessoal (bookCollection). "saiu do
   time" arquiva, mantém as entregas e não apaga o fixo: a caixa oferece
   encerrar. */
import "./shared/base.css";
import "./team.css";
import { useState } from "react";
import { initPage, today, dateLabel, notify } from "./shared/core.js";
import { mount, useCollection, useHash, setHash, useFields, EmptyStart, Form, Field, Dialog, MoneyInput, NewItemRow, Meter, icon } from "./shared/ui.jsx";
import { normalize as normalizeFinance, bookCollection } from "./shared/finance-data.js";
import { TEAM_TEMPLATES } from "./shared/templates.js";
import {
  normalize, NAME_MAX, ROLE_MAX, activeTeam, teamTotal, costLabel, personDoc, addDelivery,
  deliveriesOf, archivePerson, fixedFor, joinTeam, noteDelivery
} from "./shared/team-data.js";

initPage("team");

/* "18/10" no ano corrente; "18/10/2025" fora dele */
const shortDay = (day) => day.slice(8, 10) + "/" + day.slice(5, 7) + (day.slice(0, 4) === today().slice(0, 4) ? "" : "/" + day.slice(0, 4));

/* ---------- a caixa da pessoa ----------
   criar e editar são a mesma. criar com custo traz "lançar como fixo no
   caixa" marcado. editando, o fixo que já existe acompanha o custo novo, e a
   caixa oferece encerrá-lo; "saiu do time" (o remover) arquiva */
function PersonForm({ team, cash, open, onClose, onArchive }) {
  const p = open.id ? team.get(open.id) : null;
  const linked = p && p.fixed ? cash.get(p.fixed) : null;
  const live = !!(linked && linked.active);
  const [v, bind, set] = useFields({
    name: p ? p.name : "",
    role: p ? p.role : open.role || "",
    cost: p ? p.cost : 0,
    since: p ? p.since : "",
    next: p ? p.next : "",
    launch: !p,
    end: false
  });
  if (open.id && !p) return null;
  const submit = () => {
    const { doc, error } = personDoc(v, p);
    if (error) { notify(error); return false; }
    if (!p) {
      const res = joinTeam(team, cash, doc, v.launch);
      notify("✓ no time · " + res.line, res.undo);
      return;
    }
    /* o fixo que já existe: encerrar, lançar agora ou acompanhar o custo */
    if (live && v.end) cash.save({ ...linked, active: false });
    else if (!live && v.launch && doc.cost) { const fx = fixedFor(doc, linked); cash.save(fx); doc.fixed = fx.id; }
    else if (live && doc.cost && doc.cost !== linked.amount) cash.save({ ...linked, amount: doc.cost });
    team.save(doc);
  };
  return (
    <Form title={p ? p.name : "quem entra no time"} sub={p ? "" : "o custo é opcional; com ele, a pessoa vira um fixo no caixa da empresa"}
        submit={p ? "salvar" : "adicionar"} remove={p && !p.archived ? "saiu do time" : ""} removeIcon="archive"
        onRemove={() => onArchive(p, live && v.end ? linked : null)} onClose={onClose} onSubmit={submit}>
      <Field label="nome" full><input className="input" required maxLength={NAME_MAX} placeholder="Ana" {...bind("name")} /></Field>
      <Field label="papel"><input className="input" maxLength={ROLE_MAX} placeholder="design, dev, sócio…" {...bind("role")} /></Field>
      <Field label="custo por mês"><MoneyInput value={v.cost} onChange={(c) => set("cost", c)} placeholder="opcional" /></Field>
      <Field label="desde"><input className="input" type="date" {...bind("since")} /></Field>
      <Field label="próxima conversa"><input className="input" type="date" {...bind("next")} /></Field>
      {v.cost > 0 && !live && <label className="row full"><input type="checkbox" {...bind("launch", "check")} /> lançar como fixo no caixa</label>}
      {live && <label className="row full" title="o fixo não é apagado sozinho: marque para ele parar de cair todo mês"><input type="checkbox" {...bind("end", "check")} /> encerrar o fixo no caixa ({costLabel(linked.amount)})</label>}
    </Form>
  );
}

/* ---------- a pessoa aberta ----------
   o que ela entregou, da mais nova para a mais antiga, e a próxima conversa,
   que grava ao escolher a data. anotar uma entrega é o campo do pé */
function PersonView({ team, person, onEdit, onArchive, onReturn, onClose }) {
  const t = today();
  const list = deliveriesOf(person);
  const deliver = (text) => {
    const { doc, error } = addDelivery(person, { text }, t);
    if (error) { notify(error); return; }
    const res = noteDelivery(team, doc, t);
    notify("✓ anotado · " + res.line, res.undo);
  };
  const drop = (d) => {
    team.save({ ...person, deliveries: person.deliveries.filter((x) => x.id !== d.id), updatedAt: Date.now() });
    notify("entrega apagada", () => team.save({ ...person, updatedAt: Date.now() }));
  };
  const sub = [person.role, costLabel(person.cost), person.since ? "desde " + dateLabel(person.since, true) : "", person.archived ? "saiu do time" : ""].filter(Boolean).join(" · ");
  return (
    <Dialog title={person.name} sub={sub} onClose={onClose}
        actions={<>
          {person.archived
            ? <button className="pill" type="button" onClick={() => onReturn(person)}>voltou ao time</button>
            : <button className="pill" type="button" onClick={() => onArchive(person, null)}>{icon("archive")}saiu do time</button>}
          <button className="pill" type="button" onClick={() => onEdit(person.id)}>{icon("pencil")}editar</button>
        </>}>
      <label className="tm-next">
        <span className="t-mono">próxima conversa</span>
        <input className="input" type="date" value={person.next}
          onChange={(e) => team.save({ ...person, next: e.currentTarget.value, updatedAt: Date.now() })} />
      </label>
      <p className="heading tm-heading"><span className="t-mono">entregas</span>{list.length > 0 && <span className="small weak">{list.length}</span>}</p>
      {!person.archived && <NewItemRow placeholder="o que entregou hoje" button="anotar" onAdd={deliver} />}
      {list.length
        ? <ul className="list tm-deliveries">{list.map((d) => (
            <li key={d.id} className="tm-delivery">
              <span className="tm-delivery__day t-mono">{shortDay(d.day)}</span>
              <span className="tm-delivery__text">{d.text}</span>
              <button className="action" type="button" title="apagar a entrega" aria-label={"Apagar a entrega " + d.text} onClick={() => drop(d)}>{icon("trash")}</button>
            </li>))}
          </ul>
        : <p className="empty">nada anotado ainda: diga ao Merlin "{person.name.split(" ")[0]} entregou a landing", ou escreva acima.</p>}
    </Dialog>
  );
}

/* ---------- a página ---------- */
function Team() {
  const team = useCollection("team", { normalize });
  const cash = bookCollection(useCollection("finance", { normalize: normalizeFinance }), "business");
  const hash = useHash();
  const [form, setForm] = useState(null); // null fechada; {} nova; {role} um modelo; {id} editar

  const all = team.all();
  const people = activeTeam(all);
  const gone = all.filter((p) => p.archived).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const total = teamTotal(all);
  const opened = hash ? team.get(hash) : null;

  const archive = (p, fixed) => {
    team.save(archivePerson(p));
    if (fixed) cash.save({ ...fixed, active: false });
    setHash("");
    notify(p.name + " saiu do time" + (fixed ? " · fixo encerrado" : ""), () => {
      team.save({ ...p, updatedAt: Date.now() });
      if (fixed) cash.save({ ...fixed, updatedAt: Date.now() });
    });
  };
  const comeBack = (p) => {
    team.save({ ...p, archived: false, updatedAt: Date.now() });
    notify(p.name + " voltou ao time", () => team.save({ ...p, updatedAt: Date.now() }));
  };

  return (
    <>
      <div className="header">
        <div>
          <h1>time</h1>
        </div>
        <div className="actions">
          <button className="action" type="button" title="alguém novo no time" aria-label="Alguém novo no time" onClick={() => setForm({})}>{icon("plus")}</button>
        </div>
      </div>

      {!all.length
        ? <EmptyStart
            title="Quem trabalha com você"
            text="Sócio, funcionário ou freela fixo. O Merlin lembra o que cada um entregou e quanto custa."
            groups={TEAM_TEMPLATES}
            onPick={(it) => setForm({ role: it.role })}
            note="Trabalha sozinho? Pode pular: o resto do negócio funciona sem time."
            onBlank={() => setForm({})}
            blankLabel="alguém sem modelo" />
        : <>
          <div className="meters mb">
            <Meter label={people.length === 1 ? "pessoa no time" : "pessoas no time"} value={people.length} />
            <Meter label="custo por mês" value={total ? costLabel(total).replace("/mês", "") : "—"} />
          </div>
          <section className="block">
            {people.length
              ? <ul className="list">{people.map((p) => {
                  const last = deliveriesOf(p)[0];
                  return (
                    <li key={p.id}>
                      <button className="tm-person" type="button" onClick={() => setHash(p.id)}>
                        <span className="tm-person__main">
                          <b className="tm-person__name">{p.name}</b>
                          {p.role && <span className="tm-person__role t-mono">{p.role}</span>}
                        </span>
                        <span className="tm-person__last small weak">{last ? "entregou " + last.text + " · " + shortDay(last.day) : "nada anotado"}</span>
                        {p.cost > 0 && <span className="tm-person__cost t-mono">{costLabel(p.cost)}</span>}
                      </button>
                    </li>);
                })}
                </ul>
              : <p className="empty">ninguém no time agora. o "+" traz alguém.</p>}
            {gone.length > 0 && (
              <p className="tm-gone small weak">
                <span>saíram:</span>
                {gone.map((p) => <button key={p.id} className="tm-gone__name" type="button" onClick={() => setHash(p.id)}>{p.name}</button>)}
              </p>)}
          </section>
        </>}

      {opened && !form && <PersonView team={team} person={opened} onEdit={(id) => setForm({ id })} onArchive={archive} onReturn={comeBack} onClose={() => setHash("")} />}
      {form && <PersonForm key={form.id || form.role || "new"} team={team} cash={cash} open={form} onClose={() => setForm(null)} onArchive={(p, fixed) => { setForm(null); archive(p, fixed); }} />}
    </>
  );
}

mount(<Team />, "app");
