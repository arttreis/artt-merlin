/* merlin · a rotina
   a semana de sempre: a grade de horas da semana, sem datas. cada bloco tem
   dias da semana, hora e duracao, e vira tarefa quando o calendario abre a
   semana (a regra mora em shared/routine.js).

   o gesto e o da semana: clicar num espaco vazio cria ali, arrastar muda o
   dia e a hora, a borda de baixo muda a duracao. o bloco que vale em varios
   dias e UM bloco — mudar a hora do almoco de segunda muda a de todo dia,
   porque e isso que "almoco as 12h" quer dizer. quem quer a sexta diferente
   tira a sexta do bloco e cria outro.

   mudar aqui muda as tarefas de hoje em diante que ninguem mexeu. o passado
   fica como foi, e a reuniao que voce empurrou numa quinta fica onde esta. */
import "./shared/base.css";
import "./shared/week-grid.css";
import "./routine.css";
import { initPage, notify, formatMin, parseDuration, parseMentions, readPrefs, foldKey } from "./shared/core.js";
import { useState, useRef, useLayoutEffect } from "react";
import {
  mount, useCollection, useClients, useKeydown, isTyping, useFields,
  Form, Field, Dialog, EmptyStart, clientOptionList, icon
} from "./shared/ui.jsx";
import { normalize as normalizeTask, layoutDay, readClock } from "./shared/tasks.js";
import { normalize, newBlock, propagate, orphansOf, copyRoutine } from "./shared/routine.js";
import { clock, fmt, guessMin } from "./shared/day.js";
import { ROUTINE_SUGGESTIONS, routineGroups } from "./shared/templates.js";

initPage("routine");

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const WEEKDAY_LONG = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const HOUR_H = 44;
const SNAP = 15;
const snap = (min) => Math.round(min / SNAP) * SNAP;
const clampMin = (min) => Math.max(0, Math.min(1440 - SNAP, min));

/* "seg a sex", "todo dia", "seg qua sex" */
function daysLabel(days) {
  const s = days.join();
  if (s === "0,1,2,3,4,5,6") return "todo dia";
  if (s === "1,2,3,4,5") return "seg a sex";
  if (s === "0,6") return "fim de semana";
  return days.map((d) => WEEKDAYS[d]).join(" ");
}
const lineOf = (b) => daysLabel(b.days) + (b.at != null ? " · " + clock(b.at) : "") + (b.min ? " · " + formatMin(b.min) : "");

/* ---------- a pagina ---------- */
function Routine() {
  const blocks = useCollection("routine", { normalize });
  const tasks = useCollection("tasks", { normalize: normalizeTask });
  useClients();
  const prefs = readPrefs();
  const [form, setForm] = useState(null);       // { id } | { id: "", day, at }
  const [suggesting, setSuggesting] = useState(false);
  const [chosen, setChosen] = useState([]);

  const list = blocks.all().sort((a, b) => (a.at ?? 9999) - (b.at ?? 9999) || a.createdAt - b.createdAt);
  const weekMin = list.reduce((s, b) => s + b.days.length * (b.min || 0), 0);

  /* ---------- gravar ----------
     toda mudanca passa por aqui: grava o bloco, leva a mudanca as copias de
     hoje em diante e copia a semana atual, para um bloco novo de hoje ja
     aparecer no dia sem esperar alguem abrir o calendario. */
  const commit = (before, after) => {
    blocks.save(after);
    if (before) {
      const p = propagate(before, after, tasks.all());
      if (p.save.length || p.create.length) tasks.saveMany(p.save.concat(p.create));
      p.remove.forEach((id) => tasks.remove(id));
    }
    copyRoutine(blocks, tasks);
  };

  const remove = (b) => {
    const gone = orphansOf(b, tasks.all()).map((id) => tasks.get(id)).filter(Boolean);
    blocks.remove(b.id);
    gone.forEach((t) => tasks.remove(t.id));
    notify("apaguei “" + b.title + "”" + (gone.length ? " e " + gone.length + (gone.length === 1 ? " tarefa" : " tarefas") + " daqui pra frente" : ""), () => {
      blocks.save(b);
      if (gone.length) tasks.saveMany(gone);
    });
  };

  /* arrastar leva o dia de onde saiu para onde caiu; no mesmo dia, so a hora */
  const move = (b, from, to, at) => {
    const days = from === to ? b.days : [...new Set(b.days.filter((d) => d !== from).concat([to]))].sort();
    if (days.join() === b.days.join() && at === b.at) return;
    commit(b, { ...b, days, at, updatedAt: Date.now() });
  };
  const resize = (b, min) => { if (min !== b.min) commit(b, { ...b, min, updatedAt: Date.now() }); };

  /* ---------- sugerir ----------
     escolher nao cria na hora: marca, como nos habitos. criar um por clique
     faria a lista sumir embaixo do dedo. */
  const suggestionGroups = () => {
    const taken = new Set(list.map((b) => foldKey(b.title)));
    return routineGroups()
      .map((g) => ({ ...g, items: g.items.filter((s) => !taken.has(foldKey(s.title))).map((s) => ({ ...s, name: s.title, line: lineOf(s) })) }))
      .filter((g) => g.items.length);
  };
  const toggleChosen = (s) => setChosen((c) => (c.includes(s.id) ? c.filter((x) => x !== s.id) : c.concat([s.id])));
  const closeSuggest = () => { setSuggesting(false); setChosen([]); };
  const addChosen = () => {
    const picked = ROUTINE_SUGGESTIONS.filter((s) => chosen.includes(s.id));
    if (!picked.length) return;
    picked.forEach((s) => blocks.save(newBlock({ title: s.title, days: s.days, at: s.at, min: s.min, reserved: s.reserved })));
    copyRoutine(blocks, tasks);
    closeSuggest();
    notify(picked.length === 1 ? "1 bloco na rotina" : picked.length + " blocos na rotina");
  };

  useKeydown((e) => {
    if (form || suggesting) return;
    if (e.key === "n" && !isTyping() && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setForm({ id: "" }); }
  });

  const pickedLabel = chosen.length === 1 ? "criar o escolhido" : "criar os " + chosen.length + " escolhidos";

  return (
    <>
      <div className="header">
        <div>
          <h1>rotina</h1>
          <p className="sub" title="vira tarefa quando a semana chega. mudar um bloco muda as tarefas de hoje em diante — menos as que você mexeu.">
            a semana de sempre{list.length ? " · " + list.length + (list.length === 1 ? " bloco" : " blocos") : ""}{weekMin ? " · " + fmt(weekMin) + " por semana" : ""}
          </p>
        </div>
        <div className="actions">
          {list.length > 0 && <button className="pill" type="button" onClick={() => setSuggesting(true)}>sugerir</button>}
          <button className="pill pill--green" type="button" title="novo bloco (n)" onClick={() => setForm({ id: "" })}>{icon("plus")}bloco</button>
        </div>
      </div>

      {!list.length && (
        <EmptyStart
          title="o que se repete na sua semana?"
          text="A rotina é a semana de sempre: cada bloco tem dias, hora e duração, e vira tarefa sozinho quando a semana chega. Marque os que forem seus — a hora se arrasta depois."
          groups={suggestionGroups()}
          picked={(s) => chosen.includes(s.id)}
          onPick={toggleChosen}
          note={chosen.length ? "" : "Nenhum é seu?"}
          onBlank={chosen.length ? addChosen : () => setForm({ id: "" })}
          blankLabel={chosen.length ? pickedLabel : "criar um do zero"} />
      )}

      {list.length > 0 && (
        <RoutineGrid list={list} prefs={prefs}
          onNew={(day, at) => setForm({ id: "", day, at })}
          onEdit={(b) => setForm({ id: b.id })}
          onMove={move} onResize={resize} />
      )}

      {suggesting && (
        <Dialog title="sugerir blocos" sub="dias, hora e duração já vêm escolhidos; tudo editável depois" wide
                label="Sugestões de rotina" onClose={closeSuggest}
                actions={<>
                  <button className="pill" type="button" onClick={closeSuggest}>fechar</button>
                  {!!chosen.length && <button className="pill pill--green" type="button" onClick={addChosen}>{pickedLabel}</button>}
                </>}>
          {suggestionGroups().length
            ? <EmptyStart title="" groups={suggestionGroups()} picked={(s) => chosen.includes(s.id)} onPick={toggleChosen} />
            : <p className="empty">Você já tem todos os que eu sugeriria. O "+" cria qualquer outro.</p>}
        </Dialog>
      )}

      {form && <BlockForm blocks={blocks} id={form.id} preset={form} onClose={() => setForm(null)} onSave={commit} onRemove={remove} />}
    </>
  );
}

/* ---------- a grade ----------
   a mesma folha da semana do calendario (shared/week-grid.css), com os dias
   da semana no lugar das datas. nao ha "agora" nem concluir: o bloco nao
   acontece aqui, acontece na copia. */
function RoutineGrid({ list, prefs, onNew, onEdit, onMove, onResize }) {
  const scrollRef = useRef(null);
  const grab = useRef(null);
  const [drop, setDrop] = useState(null);
  const [dragging, setDragging] = useState("");
  const todayDow = new Date().getDay();

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, (prefs.dayStart / 60 - 1) * HOUR_H);
  }, []);

  const minuteAt = (lane, clientY) => (clientY - lane.getBoundingClientRect().top) / HOUR_H * 60;
  const onDay = (d) => list.filter((b) => b.days.includes(d));

  return (
    <div className="wk rt">
      <div className="wk__scroll" ref={scrollRef}>
        <div className="wk__head">
          <div className="wk__corner" />
          {WEEKDAYS.map((name, d) => {
            const mine = onDay(d);
            const meet = mine.filter((b) => b.reserved).reduce((s, b) => s + (b.min || 0), 0);
            const work = mine.filter((b) => !b.reserved).reduce((s, b) => s + (b.min || 0), 0);
            return (
              <div key={d} className={"wk__day" + (d === todayDow ? " is-today" : "")}>
                <span className="rt__dayname t-mono">{name}</span>
                <p className="wk__sum t-mono">
                  <span>{work ? fmt(work) + " de trabalho" : " "}</span>
                  <span className="wk__sum-meet">{meet ? fmt(meet) + " em reuniões" : " "}</span>
                </p>
              </div>
            );
          })}
        </div>
        <div className="wk__body" style={{ height: 24 * HOUR_H }}>
          <div className="wk__hours" aria-hidden="true">
            {Array.from({ length: 24 }, (_, h) => <span key={h} style={{ top: h * HOUR_H }}>{h ? String(h).padStart(2, "0") + ":00" : ""}</span>)}
          </div>
          {WEEKDAYS.map((_, d) => {
            /* o layoutDay e o da semana: quem tem hora fica na hora, o resto
               entra em fila a partir do comeco da janela */
            const laid = layoutDay(onDay(d).map((b) => ({ ...b, done: false, order: b.createdAt })), { start: prefs.dayStart, guess: guessMin() });
            return (
              <div key={d} className={"wk__lane" + (d === todayDow ? " is-today" : "")} aria-label={WEEKDAY_LONG[d]}
                   style={{ "--win-from": (prefs.dayStart / 60 * HOUR_H) + "px", "--win-to": (prefs.dayEnd / 60 * HOUR_H) + "px" }}
                   onClick={(e) => { if (e.target === e.currentTarget) onNew(d, clampMin(Math.floor(minuteAt(e.currentTarget, e.clientY) / 30) * 30)); }}
                   onDragOver={(e) => {
                     if (!grab.current) return;
                     e.preventDefault();
                     e.dataTransfer.dropEffect = "move";
                     const from = clampMin(snap(minuteAt(e.currentTarget, e.clientY) - grab.current.offset));
                     setDrop((x) => (x && x.day === d && x.from === from ? x : { day: d, from, len: grab.current.len }));
                   }}
                   onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrop((x) => (x && x.day === d ? null : x)); }}
                   onDrop={(e) => {
                     e.preventDefault();
                     const g = grab.current;
                     setDrop(null);
                     if (!g) return;
                     onMove(g.b, g.day, d, clampMin(snap(minuteAt(e.currentTarget, e.clientY) - g.offset)));
                   }}>
                {laid.map((x) => (
                  <RoutineBlock key={x.t.id} x={x} dragging={dragging === x.t.id + ":" + d}
                    onEdit={() => onEdit(list.find((b) => b.id === x.t.id))}
                    onResize={(min) => onResize(list.find((b) => b.id === x.t.id), min)}
                    onGrab={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      grab.current = { b: list.find((b) => b.id === x.t.id), day: d, offset: (e.clientY - r.top) / HOUR_H * 60, len: x.to - x.from };
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", x.t.title);
                      requestAnimationFrame(() => setDragging(x.t.id + ":" + d));
                    }}
                    onRelease={() => { grab.current = null; setDrop(null); setDragging(""); }} />
                ))}
                {drop && drop.day === d && (
                  <div className="wk__drop" style={{ top: drop.from / 60 * HOUR_H, height: drop.len / 60 * HOUR_H - 2 }}>
                    <span className="t-mono">{clock(drop.from)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* um bloco da grade. a borda de baixo e a alca de duracao, como na semana */
function RoutineBlock({ x, dragging, onEdit, onResize, onGrab, onRelease }) {
  const b = x.t;
  const [stretch, setStretch] = useState(null);
  const to = stretch != null ? stretch : x.to;
  const height = Math.max(14, (to - x.from) / 60 * HOUR_H - 2);
  const short = height < 34;
  const time = (x.fixed ? "" : "~") + clock(x.from) + (short ? "" : "–" + clock(to));
  const many = b.days.length > 1;

  const startResize = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const y0 = e.clientY, base = x.to;
    let last = base;
    const onMove = (ev) => {
      last = Math.max(x.from + SNAP, Math.min(1440, x.from + snap(base - x.from + (ev.clientY - y0) / HOUR_H * 60)));
      setStretch(last);
    };
    const up = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", up);
      setStretch(null);
      if (last !== base) onResize(last - x.from);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", up);
  };

  return (
    <div className={"wk__block" + (b.reserved ? " is-reserved" : " is-task") + (x.fixed ? "" : " is-loose") + (short ? " is-short" : "") + (x.cols > 1 ? " is-narrow" : "") + (dragging ? " is-dragging" : "")}
         tabIndex="0" draggable={stretch != null ? "false" : "true"}
         title={b.title + " · " + time + " · " + daysLabel(b.days) + (many ? " (mudar a hora muda todos os dias)" : "")}
         style={{ top: x.from / 60 * HOUR_H, height, left: "calc(" + (x.col / x.cols * 100) + "% + 2px)", width: "calc(" + (100 / x.cols) + "% - 4px)" }}
         onDragStart={onGrab} onDragEnd={onRelease}
         onClick={onEdit}
         onKeyDown={(e) => { if (e.target === e.currentTarget && e.key === "Enter") { e.preventDefault(); onEdit(); } }}>
      {b.reserved && <span className="wk__icon" aria-hidden="true">{icon("clock")}</span>}
      <span className="wk__text">
        <b>{b.title}</b>
        <span className="t-mono">{time}</span>
      </span>
      <span className="wk__resize" onPointerDown={startResize} aria-hidden="true" />
    </div>
  );
}

/* ---------- a caixa do bloco: criar e editar sao a mesma ----------
   no titulo, "@cliente" e a duracao no fim valem como na tarefa. */
function BlockForm({ blocks, id, preset, onClose, onSave, onRemove }) {
  const b = id ? blocks.get(id) : null;
  const [v, bind, set] = useFields({
    title: b ? b.title : "",
    days: b ? b.days : (preset.day != null ? [preset.day] : [1, 2, 3, 4, 5]),
    at: b ? (b.at != null ? clock(b.at) : "") : (preset.at != null ? clock(preset.at) : ""),
    duration: b && b.min ? formatMin(b.min) : "",
    client: b ? b.client : "",
    reserved: b ? b.reserved : false
  });
  if (id && !b) return null;
  const toggleDay = (d) => set("days", v.days.includes(d) ? v.days.filter((x) => x !== d) : v.days.concat([d]).sort());
  const submit = () => {
    const found = parseMentions(v.title);
    const parsed = parseDuration(found.title);
    const title = parsed.title.trim().slice(0, 300);
    if (!title) { notify("o bloco precisa de um nome"); return false; }
    if (!v.days.length) { notify("escolha pelo menos um dia"); return false; }
    const at = readClock(v.at);
    if (at === undefined) { notify("não entendi o horário — escreva como 9h30 ou 14:00"); return false; }
    const fields = {
      title, days: v.days, at, reserved: v.reserved,
      min: parseDuration(v.duration).min || parsed.min,
      client: v.client || found.client
    };
    if (b) onSave(b, { ...b, ...fields, updatedAt: Date.now() });
    else onSave(null, newBlock(fields));
  };
  return (
    <Form title={b ? "bloco da rotina" : "novo bloco"} sub={b ? "muda as tarefas de hoje em diante, menos as que você mexeu" : ""}
          submit={b ? "salvar" : "criar"} remove={b ? "apagar" : ""}
          onRemove={() => onRemove(b)} onClose={onClose} onSubmit={submit}>
      <input className="input full" maxLength="300" required aria-label="nome" placeholder="daily, almoço, relatório · @cliente · 45m" {...bind("title")} />
      <Field label="dias" full>
        <div className="weekday-picker">
          {WEEKDAYS.map((name, d) => (
            <label key={d} className={v.days.includes(d) ? "is-on" : ""}>
              <input type="checkbox" checked={v.days.includes(d)} onChange={() => toggleDay(d)} />{name}
            </label>))}
        </div>
      </Field>
      <div className="full rt-form__when">
        <Field label="horário"><input className="input input--mono" placeholder="—" inputMode="numeric" {...bind("at")} /></Field>
        <Field label="duração"><input className="input input--mono" placeholder="45m" {...bind("duration")} /></Field>
      </div>
      <Field label="cliente" full><select className="select" {...bind("client")}>{clientOptionList("sem cliente")}</select></Field>
      <div className="full chips">
        <button className="chip" type="button" aria-pressed={v.reserved} title="ocupa o tempo, mas não é trabalho para concluir"
                onClick={() => set("reserved", !v.reserved)}>reunião ou pausa</button>
      </div>
    </Form>
  );
}

mount(<Routine />, "app");
