/* merlin · as peças do financeiro que o caixa da empresa também usa
   ---------------------------------------------------------------
   saíram de dentro de finance.jsx em 20/10/2026, quando o caixa da empresa
   (cash.jsx, PRD meu-negocio) nasceu com o mês, os fixos e o "a receber" do
   financeiro. importar o finance.jsx montaria a página do financeiro em cima
   do caixa, pela mesma razão do entry-form.jsx.
   --------------------------------------------------------------- */
import { useState } from "react";
import { newId, today, notify, brl, parseMoney, isDay, weekdayOf, monthLabel, dateLabel } from "./core.js";
import { useFields, Form, Field, icon, DateField, DayOfMonthField } from "./ui.jsx";
import { daysInMonth, realBalanceUntil, buildMonth, configOf, saveConfig } from "./finance-data.js";
import { MoneyInput, KindChips, CategorySelect, inReais, pickCategory } from "./entry-form.jsx";

/* gravar, apagar com desfazer, lançar uma sugestão e confirmar um previsto: o
   mesmo nas duas telas. `finance` é o livro aberto, e `setForm` abre a caixa */
export function entryActions(finance, setForm) {
  return {
    save: (doc, existing, text) => {
      finance.save({ ...doc, createdAt: existing ? existing.createdAt : Date.now(), updatedAt: Date.now() });
      notify(text);
    },
    removeWithUndo: (id, text) => {
      const before = finance.remove(id);
      notify(text, before ? () => finance.save(before) : null);
    },
    /* lancar uma sugestao: a caixa de lancamento ja preenchida com o que o
       fixo ou a parcela diz. quem decide o valor, o dia e se ja foi pago e a
       pessoa — a sugestao so poupa a digitacao. */
    launchSuggestion: (day, it) => setForm({ type: "entry", id: "", day,
      preset: { name: it.name, amount: it.amount, kind: it.kind, category: it.category, origin: it.origin, paid: day <= today() } }),
    togglePaid: (id) => {
      const doc = finance.get(id);
      if (doc) finance.save({ ...doc, paid: !doc.paid, updatedAt: Date.now() });
    }
  };
}

/* a cor do saldo escala com o proprio conjunto visivel (o mes ou o ano
   aberto), nao com faixas fixas — senao um saldo de R$ 3 mil e um de
   R$ 300 mil pintam igual so por passarem os dois de um teto absoluto.
   raiz quadrada pra nao achatar os valores do meio quando um unico dia
   dispara bem acima do resto. em centavos. */
export function balanceStyle(cents, maxAbs) {
  if (cents < 0) return { cls: " is-negative" };
  const t = maxAbs > 0 ? Math.min(1, Math.sqrt(cents / maxAbs)) : 0;
  return { cls: " is-positive", style: { "--tone": t } };
}

/* tres coisas, tres desenhos:
   - REAL: lancamento pago. cheio.
   - PREVISTO: lancamento que a pessoa gravou como nao pago. tracejado, com
     o "≈" — a mesma regra do funil, tracejado e o que ainda nao aconteceu.
   - SUGESTAO: fixo ou parcela ainda nao lancado. nao tem numero nas contas;
     aparece apagado, com o botao de lancar.
   somados num numero so, eles faziam o "saldo de hoje" mentir. */
export const isForecast = (it) => !it.paid;

/* um medidor: legenda em cima, numero embaixo. `forecast` desenha o numero
   como previsao: tinta mais leve, sublinhado tracejado e o "≈" na frente */
export const Meter = ({ label, value, cls, forecast }) => (
  <div className="meter"><span className="legend">{label}</span><span className={"num mono" + (forecast ? " is-forecast" : "") + (cls || "")}>{forecast ? "≈ " : ""}{brl(value, true)}</span></div>);

/* a barra de dois tempos: o cheio e o que ja aconteceu, o tracejado e o que
   ainda vai, sobre o total `of`. passar do total nao some: a barra enche e
   a legenda diz quanto passou. */
export const SplitBar = ({ real, forecast, of }) => {
  const base = Math.max(1, of || real + forecast);
  const r = Math.min(100, (real / base) * 100);
  const f = Math.min(100 - r, (forecast / base) * 100);
  return <span className="split"><i style={{ width: r + "%" }} /><b style={{ width: f + "%" }} /></span>;
};

/* ----- mês ----- */
export function MonthView({ ctx, month, openDay, onToggleDay, onShift, onNewEntry, onEditEntry, onTogglePaid, onLaunch }) {
  const t = today();
  /* simular: uma lista de lancamentos hipoteticos, so em memoria — nunca
     grava na colecao. o saldo/entradas/saidas do mes saem do ctx simulado;
     o detalhe de cada dia (o que abre ao clicar) continua mostrando so os
     lancamentos de verdade, com as acoes de sempre (editar, confirmar). */
  const [sim, setSim] = useState([]);
  const [simOpen, setSimOpen] = useState(false);
  const realDays = buildMonth(month, ctx, null, t);
  const days = sim.length
    ? buildMonth(month, { ...ctx, entries: ctx.entries.concat(sim) }, null, t)
        .map((d, i) => ({ ...d, items: realDays[i].items, suggestions: realDays[i].suggestions }))
    : realDays;
  const [year, monthNum] = month.split("-").map(Number);
  const nDays = daysInMonth(year, monthNum);
  const isThisMonth = month === t.slice(0, 7);
  const todayNum = isThisMonth ? +t.slice(8, 10) : 0;

  const balanceToday = realBalanceUntil(t, ctx);
  const balanceEnd = days[days.length - 1].balance;
  /* o "diario" da planilha: o que sobra no fim do mes dividido pelos dias
     que ainda faltam — mesma logica da barra do dia */
  const daysLeft = isThisMonth ? (nDays - todayNum + 1) : nDays;
  const daily = daysLeft > 0 ? Math.round(balanceEnd / daysLeft) : 0;
  const monthIn = days.reduce((s, d) => s + d.inflow, 0);
  const monthOut = days.reduce((s, d) => s + d.outflow, 0);
  /* o teto da escala de cor: o maior saldo de verdade do mes (o "antes do
     marco" fica de fora, ele nem pinta) */
  const maxAbs = Math.max(0, ...days.filter((d) => !d.before).map((d) => d.balance));

  const addSim = (entry) => setSim((s) => s.concat([{ ...entry, id: newId(), paid: false, category: "", origin: { type: "sim", id: "" } }]));
  const removeSim = (id) => setSim((s) => s.filter((e) => e.id !== id));
  const clearSim = () => { setSim([]); setSimOpen(false); };

  return (
    <>
      <div className="row mb">
        <button className="pill pill--icon" type="button" aria-label="Mês anterior" onClick={() => onShift(-1)}>{icon("arrowLeft")}</button>
        <strong className="mono" id="month-label">{monthLabel(month)}</strong>
        <button className="pill pill--icon" type="button" aria-label="Mês seguinte" onClick={() => onShift(1)}>{icon("arrow")}</button>
        <span className="spacer"></span>
        <button className={"pill" + (sim.length || simOpen ? " is-on" : "")} type="button" aria-pressed={String(simOpen)} onClick={() => setSimOpen((v) => !v)}>
          {icon("spark")}simular{sim.length > 0 ? " · " + sim.length : ""}
        </button>
        <button className="pill pill--accent" type="button" onClick={() => onNewEntry()}>{icon("plus")}lançamento</button>
      </div>

      {simOpen && <SimPanel month={month} entries={sim} onAdd={addSim} onRemove={removeSim} onClear={clearSim} onClose={() => setSimOpen(false)} />}

      <div className="meters mb">
        <Meter label="na conta hoje" value={balanceToday} cls={balanceToday < 0 ? " is-negative" : ""}/>
        <Meter label="fim do mês" value={balanceEnd} forecast cls={balanceEnd < 0 ? " is-negative" : ""}/>
        <Meter label={daily < 0 ? "não fecha" : "por dia até o fim"} value={daily} forecast cls={daily < 0 ? " is-negative" : ""}/>
        <Meter label="entradas do mês" value={monthIn} forecast/>
        <Meter label="saídas do mês" value={monthOut} forecast/>
      </div>

      <div className="table-scroll"><table className="table">
        <thead><tr><th>dia</th><th className="num">entradas</th><th className="num">saídas</th><th className="num">saldo</th></tr></thead>
        <tbody>
          {days.map((d) => <DayRow key={d.day} d={d} today={t} isToday={isThisMonth && d.day === t} open={openDay === d.day} maxAbs={maxAbs}
            onToggle={() => onToggleDay(d.day)} onNewEntry={onNewEntry} onEditEntry={onEditEntry} onTogglePaid={onTogglePaid} onLaunch={onLaunch}/>)}
        </tbody>
      </table></div>
    </>
  );
}

/* ----- simular: um "e se" que nunca grava -----
   uma lista hipotetica em memoria, somada aos lancamentos de verdade so na
   hora de calcular o saldo projetado. fechar a aba ou limpar a simulacao
   nao deixa rastro nenhum na colecao. */
function SimPanel({ month, entries, onAdd, onRemove, onClear, onClose }) {
  const [v, bind, set] = useFields({ name: "", amount: "", kind: "out", day: today() > month + "-01" ? today() : month + "-01" });
  const add = () => {
    const amount = parseMoney(v.amount);
    if (!v.name.trim() || !amount) { notify("preciso de um nome e um valor pra simular"); return; }
    onAdd({ day: isDay(v.day) ? v.day : today(), name: v.name.trim(), amount, kind: v.kind });
    set("name", ""); set("amount", "");
  };
  const total = entries.reduce((s, e) => s + (e.kind === "in" ? e.amount : -e.amount), 0);
  return (
    <div className="block sim-panel mb">
      <p className="heading">
        <span className="t-mono">simulação · e se</span>
        <span className="row">
          {entries.length > 0 && <span className={"total" + (total < 0 ? " is-negative" : total > 0 ? " is-green" : "")}>{(total > 0 ? "+" : "") + brl(total, true)}</span>}
          {entries.length > 0 && <button className="action" type="button" title="limpar simulação" aria-label="limpar simulação" onClick={onClear}>{icon("trash")}</button>}
          <button className="action" type="button" title="fechar" aria-label="fechar" onClick={onClose}>{icon("x")}</button>
        </span>
      </p>
      <p className="small weak sim-panel__hint">lançamentos hipotéticos, só nesta tela — não gravam em nada, e somem se você sair sem limpar</p>
      {entries.length > 0 && (
        <ul className="list mb">
          {entries.slice().sort((a, b) => a.day.localeCompare(b.day)).map((e) => (
            <li key={e.id} className="line fin-item is-forecast">
              <span className="name"><small className="fin-item__day">{dateLabel(e.day)}</small>{e.name}</span>
              <span className={"measure mono" + (e.kind === "in" ? " positive" : "")}>{e.kind === "in" ? "+" : "−"} {brl(e.amount)}</span>
              <span className="fin-item__acts"><button className="action" type="button" title="tirar da simulação" aria-label="tirar da simulação" onClick={() => onRemove(e.id)}>{icon("x")}</button></span>
            </li>
          ))}
        </ul>
      )}
      <div className="row sim-panel__add">
        <input className="input" placeholder="o que aconteceria?" maxLength="140" {...bind("name")} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}/>
        <MoneyInput {...bind("amount")}/>
        <KindChips {...bind("kind")}/>
        <DateField {...bind("day")}/>
        <button className="pill" type="button" onClick={add}>{icon("plus")}simular</button>
      </div>
    </div>
  );
}

/* a linha do dia e, embaixo dela, o detalhe quando esta aberta */
/* o dia que ainda não chegou é previsão inteira: tinta leve e o "≈". o que
   já passou com item sem confirmar ganha o ponto de "a confirmar". */
function DayRow({ d, today: t, isToday, open, maxAbs, onToggle, onNewEntry, onEditEntry, onTogglePaid, onLaunch }) {
  const label = weekdayOf(d.day) + " " + (+d.day.slice(8, 10));
  const future = d.day > t;
  const unconfirmed = !future && !d.before && d.items.some(isForecast);
  const money = (v) => (future ? "≈ " : "") + brl(v, true);
  const tone = balanceStyle(d.balance, maxAbs);
  return (
    <>
      <tr className={"day-row" + (isToday ? " is-today" : "") + (future ? " is-future" : "")} data-day={d.day} onClick={onToggle}>
        <td>{label}{unconfirmed && <i className="dot-pending" title="tem previsto a confirmar" />}{d.suggestions.length > 0 && <i className="dot-suggest" title={d.suggestions.length + (d.suggestions.length === 1 ? " sugestão" : " sugestões") + " para lançar"} />}</td>
        <td className="num">{d.inflow ? money(d.inflow) : "—"}</td>
        <td className="num">{d.outflow ? money(-d.outflow) : "—"}</td>
        <td className={"num" + (d.before ? " weak" : " balance-cell" + tone.cls)} style={d.before ? undefined : tone.style}>{d.before ? "—" : money(d.balance)}</td>
      </tr>
      {open && (
        <tr className="day-detail"><td colSpan="4">
          {d.items.length > 0 && <ul className="list">{d.items.map((it) => <DayItem key={it.id} it={it} day={d.day} onEditEntry={onEditEntry} onTogglePaid={onTogglePaid}/>)}</ul>}
          {d.suggestions.length > 0 && <ul className="list mt2">{d.suggestions.map((it) => <SuggestionItem key={it.id} it={it} day={d.day} onLaunch={onLaunch}/>)}</ul>}
          {!d.items.length && !d.suggestions.length && <p className="empty">nada neste dia</p>}
          <p className="mt2"><button className="pill pill--mini" type="button" onClick={() => onNewEntry(d.day)}>+ lançamento neste dia</button></p>
        </td></tr>)}
    </>
  );
}

/* um lançamento do dia. o previsto vem tracejado, com o "aconteceu" que o
   confirma; o real vem cheio, e o check dele volta para previsto. */
export function DayItem({ it, day, showDay, onEditEntry, onTogglePaid }) {
  const forecast = isForecast(it);
  const sign = it.kind === "in" ? "+" : "−";
  return (
    <li className={"line fin-item" + (forecast ? " is-forecast" : "")}>
      <span className="name">
        {showDay && <small className="fin-item__day">{dateLabel(day)}</small>}
        {it.name}{it.category && <>{" "}<small>#{it.category}</small></>}
      </span>
      <span className={"measure mono" + (it.kind === "in" ? " positive" : "")}>{forecast ? "≈ " : ""}{sign} {brl(it.amount)}</span>
      <span className="fin-item__acts">
        {forecast
          ? <button className="pill pill--mini" type="button" title={it.kind === "in" ? "entrou de verdade" : "saiu de verdade"} onClick={() => onTogglePaid(it.id)}>{icon("check")}aconteceu</button>
          : <button className="action" type="button" title="voltar para previsto" aria-label="voltar para previsto" onClick={() => onTogglePaid(it.id)}>{icon("check")}</button>}
        <button className="action" type="button" title="editar" aria-label="editar" onClick={() => onEditEntry(it.id)}>{icon("pencil")}</button>
      </span>
    </li>
  );
}

/* uma sugestão: apagada, sem sinal de conta, e o "lançar" que abre a caixa
   preenchida. o valor aparece porque ajuda a decidir — mas não soma. */
export function SuggestionItem({ it, day, onLaunch }) {
  return (
    <li className="line fin-item is-suggestion">
      <span className="name"><small className="fin-item__day">{dateLabel(day)}</small>{it.name}{it.category && <>{" "}<small>#{it.category}</small></>}</span>
      <span className="measure">{brl(it.amount)}</span>
      <span className="fin-item__acts">
        <button className="pill pill--mini" type="button" title="abre o lançamento preenchido" onClick={() => onLaunch(day, it)}>{icon("plus")}lançar</button>
      </span>
    </li>
  );
}

/* ----- as tabelas do painel ----- */
export function PanelTable({ headers, rows, empty }) {
  if (!rows.length) return <p className="empty">{empty}</p>;
  return (
    <div className="table-scroll"><table className="table">
      <thead><tr>{headers.map((h, i) => <th key={i} className={h.num ? "num" : null}>{h.text}</th>)}</tr></thead>
      <tbody>{rows}</tbody>
    </table></div>
  );
}
export function PanelBlock({ title, total, addTitle, onAdd, children }) {
  return (
    <div className="col-6"><div className="block panel-block">
      <p className="heading">
        <span className="t-mono">{title}</span>
        <span className="row"><span className="total">{total}</span><button className="action" type="button" title={addTitle} aria-label={addTitle} onClick={onAdd}>{icon("plus")}</button></span>
      </p>
      {children}
    </div></div>
  );
}
const fixedHeaders = (amountLabel) => [{ text: "nome" }, { text: "categoria" }, { text: "dia", num: true }, { text: amountLabel, num: true }];

function FixedRow({ f, onEdit }) {
  return (
    <tr className="editable" data-id={f.id} onClick={onEdit}>
      <td>{f.name}{!f.active && <>{" "}<span className="badge">pausado</span></>}</td>
      <td className="weak">{f.category}</td>
      <td className="num weak">{f.dayOfMonth}/mês</td>
      <td className="num">{brl(f.amount)}</td>
    </tr>
  );
}

/* as saídas e as entradas fixas, cada uma no seu bloco: o painel do financeiro
   e os fixos do caixa. `empty` troca o exemplo do bloco vazio */
export const fixedOf = (ctx, kind) => ctx.fixed.filter((f) => f.kind === kind).sort((a, b) => a.dayOfMonth - b.dayOfMonth);
export function FixedBlocks({ ctx, onEdit, onNewFixed, empty = {} }) {
  const outs = fixedOf(ctx, "out"), ins = fixedOf(ctx, "in");
  const total = (list) => brl(list.reduce((s, f) => s + f.amount, 0)) + " por mês";
  return (
    <>
      <PanelBlock title="saídas fixas" total={total(outs)} addTitle="nova saída fixa" onAdd={() => onNewFixed("out")}>
        <PanelTable headers={fixedHeaders("saída")} empty={empty.out || "nenhuma saída fixa — aluguel, luz, academia…"}
          rows={outs.map((f) => <FixedRow key={f.id} f={f} onEdit={() => onEdit("fixed", f.id)}/>)}/>
      </PanelBlock>
      <PanelBlock title="entradas fixas" total={total(ins)} addTitle="nova entrada fixa" onAdd={() => onNewFixed("in")}>
        <PanelTable headers={fixedHeaders("entrada")} empty={empty.in || "nenhuma entrada fixa — o que entra todo mês"}
          rows={ins.map((f) => <FixedRow key={f.id} f={f} onEdit={() => onEdit("fixed", f.id)}/>)}/>
      </PanelBlock>
    </>
  );
}

/* a unidade mora no campo ("R$" antes, "%" e "x" depois), e nao no rotulo */
export const UnitInput = ({ unit, ...props }) => <span className="affix affix--post"><input className="input input--num" type="number" {...props}/><i>{unit}</i></span>;
export const DayOfMonthInput = (props) => <DayOfMonthField required {...props}/>;

/* `preset` preenche o fixo novo: o tipo, e no caixa o modelo escolhido na tela
   vazia (nome, categoria) */
export function FixedForm({ finance, categories, id, preset, onClose, onRemove, onSave }) {
  const f = id ? finance.get(id) : null;
  const pre = preset || {};
  const kind = f ? f.kind : (pre.kind || "out");
  const [v, bind] = useFields({
    name: f ? f.name : (pre.name || ""),
    amount: inReais(f && f.amount),
    dayOfMonth: f ? f.dayOfMonth : (pre.dayOfMonth || ""),
    category: pickCategory(categories, f ? f.category : (pre.category || (kind === "in" ? "Recorrente" : ""))),
    active: f ? f.active : true
  });
  if (id && !f) return null;
  const submit = () => {
    const amount = parseMoney(v.amount);
    if (!v.name.trim() || !amount) { notify("preciso de um nome e um valor"); return false; }
    onSave({
      id: f ? f.id : newId(), type: "fixed", name: v.name.trim(), amount, kind,
      category: v.category, dayOfMonth: +v.dayOfMonth || 1, active: f ? !!v.active : true
    }, f, f ? "fixo atualizado" : "fixo criado");
  };
  return (
    <Form title={f ? (kind === "in" ? "entrada fixa" : "saída fixa") : (kind === "in" ? "nova entrada fixa" : "nova saída fixa")}
        sub="cai todo mês no mesmo dia, como previsto até você confirmar"
        submit={f ? "salvar" : "adicionar"} remove={f ? "apagar" : ""}
        onRemove={() => onRemove(id, "fixo apagado")} onClose={onClose} onSubmit={submit}>
      <Field label="nome" full><input className="input" required maxLength="140" {...bind("name")}/></Field>
      <Field label="valor"><MoneyInput {...bind("amount")}/></Field>
      <Field label="dia do mês"><DayOfMonthInput {...bind("dayOfMonth")}/></Field>
      <Field label="categoria"><CategorySelect categories={categories} {...bind("category")}/></Field>
      {f && <label className="row full" title="desmarque para pausar sem apagar"><input type="checkbox" {...bind("active", "check")}/> ativo</label>}
    </Form>
  );
}

/* a config: saldo inicial, divisao e categorias. as categorias gravam na
   hora, sem esperar o salvar: sao uma lista, nao um campo — e o Enter no
   campo delas nao pode fechar a caixa. o caixa da empresa abre só com o saldo
   inicial (`split` falso): o 50/30/20 é do dinheiro pessoal */
export function ConfigForm({ finance, onClose, split = true }) {
  const cfg = configOf(finance);
  const [v, bind] = useFields({
    day: cfg.startBalance ? cfg.startBalance.day : today(),
    amount: inReais(cfg.startBalance && cfg.startBalance.amount),
    expenses: cfg.percents.expenses,
    spending: cfg.percents.spending,
    assets: cfg.percents.assets
  });
  const submit = () => {
    saveConfig(finance, {
      startBalance: isDay(v.day) ? { day: v.day, amount: parseMoney(v.amount) } : null,
      ...(split ? { percents: { expenses: +v.expenses || 0, spending: +v.spending || 0, assets: +v.assets || 0 } } : {})
    });
    notify("configuração salva");
  };
  return (
    <Form title="ajustes" sub={split ? "de onde o saldo parte e como as entradas se dividem — as categorias e as metas moram na aba hoje" : "de onde o saldo da empresa parte"} onClose={onClose} onSubmit={submit}>
      <Field label="saldo inicial em"><DateField {...bind("day")} /></Field>
      <Field label="saldo inicial"><MoneyInput {...bind("amount")}/></Field>
      {split && <>
        <Field label="despesas"><UnitInput unit="%" min="0" max="100" {...bind("expenses")}/></Field>
        <Field label="gastos"><UnitInput unit="%" min="0" max="100" {...bind("spending")}/></Field>
        <Field label="ativos"><UnitInput unit="%" min="0" max="100" {...bind("assets")}/></Field>
      </>}
    </Form>
  );
}
