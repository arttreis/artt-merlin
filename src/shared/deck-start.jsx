/* merlin · por onde começa uma apresentação (PRD desenhos, D5)

   a tela vazia das apresentações oferece os quatro modelos e o "em branco".
   mora aqui porque aparece em dois lugares: no editor sem apresentação aberta
   (slides.html) e em desenhos, quando o filtro "apresentações" não acha nada. */
import { newId } from "./core.js";
import { EmptyStart } from "./ui.jsx";
import { DECK_TEMPLATES, buildDeck, normalizeDeck } from "./deck.js";

export function createDeck(decks, template) {
  const now = Date.now();
  const doc = normalizeDeck({ id: newId(), ...buildDeck(template, newId), createdAt: now, updatedAt: now });
  decks.save(doc);
  return doc;
}

/* a miniatura de uma apresentação: um slide no seu layout, em traços, e o
   número de slides no canto, como as de mapa, funil e planilha. na lista é o
   primeiro; nos modelos, que todos abrem com capa, é o segundo */
export function DeckThumb({ layout, count }) {
  const art = {
    cover: <><rect x="22" y="16" width="44" height="6" /><rect x="28" y="27" width="32" height="3" className="th__soft" /></>,
    bullets: <><rect x="14" y="10" width="34" height="5" />{[20, 27, 34].map((y) => <rect key={y} x="14" y={y} width={y === 34 ? 30 : 44} height="3" className="th__soft" />)}</>,
    number: <><rect x="14" y="10" width="24" height="4" className="th__soft" /><rect x="14" y="18" width="34" height="14" /><rect x="14" y="36" width="40" height="3" className="th__soft" /></>,
    columns: <><rect x="14" y="10" width="30" height="5" /><rect x="14" y="20" width="27" height="20" className="th__soft" /><rect x="47" y="20" width="27" height="20" className="th__soft" /></>
  }[layout] || null;
  return (
    <svg viewBox="0 0 100 56" aria-hidden="true" className="th th--deck">
      <rect x="6" y="4" width="76" height="43" rx="2" className="th__frame" />
      {art}
      <text x="96" y="52" className="th__n">{count}</text>
    </svg>
  );
}

export function DeckStart({ decks, title, onOpen }) {
  const open = (t) => onOpen(createDeck(decks, t));
  return (
    <EmptyStart
      title={title || "nenhuma apresentação ainda"}
      text={'Peça na conversa — "monta uma apresentação do produto X" — ou comece de um modelo.'}
      groups={[{
        key: "decks", label: "modelos", note: "o roteiro já montado, um slide por pergunta: troque o texto",
        items: DECK_TEMPLATES.map((t) => ({ ...t, hint: t.slides.map((s) => s.title).join(" · ") }))
      }]}
      thumb={(t) => <DeckThumb layout={(t.slides[1] || t.slides[0]).layout} count={t.slides.length} />}
      onPick={open}
      onBlank={() => open(null)}
      blankRow blankLabel="em branco: uma capa, e só" />
  );
}
