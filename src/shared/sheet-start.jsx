/* merlin · por onde começa uma planilha (PRD desenhos, D5)

   a tela vazia das planilhas oferece os quatro modelos e o "em branco". mora
   aqui porque aparece em dois lugares: no editor sem planilha aberta
   (sheets.html) e em desenhos, quando o filtro "planilhas" não acha nada. */
import { newId } from "./core.js";
import { EmptyStart } from "./ui.jsx";
import { SHEET_TEMPLATES, buildSheet, normalizeSheet, colLetter } from "./sheet.js";

export function createSheet(sheets, template) {
  const now = Date.now();
  const doc = normalizeSheet({ id: newId(), ...buildSheet(template, newId), createdAt: now, updatedAt: now });
  sheets.save(doc);
  return doc;
}

/* a miniatura de uma planilha: a grade com a cabeça marcada, e o tamanho no
   canto, como as dos modelos de mapa e funil */
export function SheetThumb({ cols, rows }) {
  const c = Math.max(1, Math.min(cols, 6)), r = Math.max(1, Math.min(rows, 6));
  const w = 70 / c, h = 40 / r;
  return (
    <svg viewBox="0 0 100 56" aria-hidden="true" className="th th--sheet">
      <rect x="6" y="6" width="70" height={h} className="th__head" />
      {Array.from({ length: c + 1 }, (_, i) => <path key={"c" + i} d={"M" + (6 + i * w) + " 6V46"} />)}
      {Array.from({ length: r + 1 }, (_, i) => <path key={"r" + i} d={"M6 " + (6 + i * h) + "H76"} />)}
      <text x="96" y="52" className="th__n">{rows + "×" + cols}</text>
    </svg>
  );
}

export function SheetStart({ sheets, title, onOpen }) {
  const open = (t) => onOpen(createSheet(sheets, t));
  return (
    <EmptyStart
      title={title || "nenhuma planilha ainda"}
      text={'Peça na conversa — "faz uma planilha dos custos do produto" — ou comece de um modelo.'}
      groups={[{
        key: "sheets", label: "modelos", note: "a conta já montada, com as fórmulas: troque os números",
        items: SHEET_TEMPLATES.map((t) => ({ ...t, hint: t.cols.map((c, j) => colLetter(j) + " " + c.name).join(" · ") }))
      }]}
      thumb={(t) => <SheetThumb cols={t.cols.length} rows={t.rows.length} />}
      onPick={open}
      onBlank={() => open(null)}
      blankRow blankLabel="em branco: três colunas, e só" />
  );
}
