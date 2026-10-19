/* merlin · a caixa do lançamento e os campos de dinheiro
   ---------------------------------------------------------------
   saíram de dentro de finance.jsx em 19/10/2026: o cartão do "o que falta
   hoje?" no início pergunta se a conta prevista que passou aconteceu, e o
   "não" abre esta mesma caixa com o previsto, para mudar a data ou apagar.
   importar o finance.jsx montaria a página do financeiro em cima do início.
   --------------------------------------------------------------- */
import { newId, today, notify, parseMoney, isDay } from "./core.js";
import { useFields, Form, Field, DateField } from "./ui.jsx";

export const inReais = (cents) => cents ? (cents / 100).toFixed(2).replace(".", ",") : "";

/* o <select> de categoria é controlado: quando o valor pedido não está na
   lista (categoria apagada, ou nenhuma ainda), fica a primeira — que é o
   que o navegador fazia sozinho no formulário por string */
export const pickCategory = (categories, wanted) => categories.includes(wanted) ? wanted : (categories[0] || "");

/* a unidade mora no campo ("R$" antes), e não no rótulo */
export const MoneyInput = (props) => <span className="affix affix--pre"><i>R$</i><input className="input input--num" inputMode="decimal" placeholder="0,00" {...props}/></span>;

/* entrada ou saída: duas opções cabem num par de chips, sem abrir lista */
export const KindChips = ({ value, onChange }) => (
  <div className="chips" role="radiogroup">
    {[["out", "saída"], ["in", "entrada"]].map(([k, label]) => (
      <button key={k} type="button" className="chip" role="radio" aria-checked={String(value === k)} aria-pressed={String(value === k)}
              onClick={() => onChange({ currentTarget: { value: k } })}>{label}</button>
    ))}
  </div>
);

export const CategorySelect = ({ categories, ...props }) => <select className="select" {...props}>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>;

/* criar e editar são a mesma caixa: a diferença é ter ou não um documento por
   baixo. quem abre decide como gravar e apagar (`onSave`, `onRemove`) */
export function EntryForm({ finance, categories, id, presetDay, preset, onClose, onRemove, onSave }) {
  const l = id ? finance.get(id) : null;
  const pre = preset || {};
  const [v, bind] = useFields({
    name: l ? l.name : (pre.name || ""),
    amount: inReais(l ? l.amount : pre.amount),
    day: l ? l.day : (presetDay || today()),
    kind: l ? l.kind : (pre.kind || "out"),
    category: pickCategory(categories, l ? l.category : (pre.category || "")),
    paid: l ? l.paid : (pre.paid != null ? pre.paid : true)
  });
  if (id && !l) return null;
  const submit = () => {
    const amount = parseMoney(v.amount);
    if (!v.name.trim() || !amount) { notify("preciso de um nome e um valor"); return false; }
    onSave({
      id: l ? l.id : newId(), type: "entry", name: v.name.trim(), amount,
      day: isDay(v.day) ? v.day : today(), kind: v.kind, category: v.category,
      paid: v.paid, origin: l ? l.origin : (pre.origin || null)
    }, l, l ? "lançamento atualizado" : "lançamento criado");
  };
  return (
    <Form title={l ? "lançamento" : (pre.origin ? "lançar a sugestão" : "novo lançamento")}
        sub={l ? "" : "pago é real; não pago é previsto e entra no fim do mês com ≈"} submit={l ? "salvar" : "adicionar"} remove={l ? "apagar" : ""}
        onRemove={() => onRemove(id, "lançamento apagado")} onClose={onClose} onSubmit={submit}>
      <Field label="nome" full><input className="input" required maxLength="140" {...bind("name")}/></Field>
      <Field label="valor"><MoneyInput {...bind("amount")}/></Field>
      <Field label="data"><DateField {...bind("day")} /></Field>
      <Field label="tipo"><KindChips {...bind("kind")}/></Field>
      <Field label="categoria"><CategorySelect categories={categories} {...bind("category")}/></Field>
      <label className="row full"><input type="checkbox" {...bind("paid", "check")}/> já aconteceu (desmarcado, fica previsto)</label>
    </Form>
  );
}
