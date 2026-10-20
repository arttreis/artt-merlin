/* testa as apresentações (ticket #92): as contas puras do deck.js — normalização do
 * documento e dos slides (layout, tetos, ids, tipos), as operações de reordenar,
 * duplicar, apagar, inserir, trocar de layout e editar (sem mutar a entrada, e
 * devolvendo a mesma referência quando não há o que fazer) e os quatro modelos.
 * O deck.js não toca o navegador, então não precisa de navegador de mentira. */

let passed = 0;
const failures = [];
const check = (name, cond, detail) => { if (cond) passed++; else failures.push(name + (detail ? " -> " + detail : "")); };

const {
  DECK_SLIDES, SLIDE_ITEMS, SLIDE_LAYOUTS, blankSlide, normalizeDeck,
  moveSlide, duplicateSlide, removeSlide, insertSlide, setLayout, updateSlide,
  DECK_TEMPLATES, buildDeck
} = await import("./deck.js");

const canon = (v) => {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  return JSON.stringify(v);
};
const same = (a, b) => canon(a) === canon(b);
const show = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };
const noThrow = (fn) => { try { fn(); return true; } catch (e) { return false; } };
const clone = (v) => JSON.parse(JSON.stringify(v));

const SLIDE_KEYS = ["body", "caption", "id", "items", "layout", "left", "notes", "number", "right", "title"];
const DECK_KEYS = ["app", "createdAt", "id", "name", "slides", "updatedAt"];
const TEXT_FIELDS = ["title", "body", "left", "right", "number", "caption", "notes"];
const LIMITS = { title: 160, body: 600, left: 1200, right: 1200, number: 24, caption: 160, notes: 2000 };
const hasAllKeys = (obj, keys) => !!obj && typeof obj === "object" && keys.every((k) => k in obj);
const ids = (deck) => deck.slides.map((s) => s.id);
const titles = (deck) => deck.slides.map((s) => s.title);
const unique = (list) => new Set(list).size === list.length;

/* slide completo (já normalizado) com os campos dados por cima */
const slide = (id, extra) => ({
  id, layout: "bullets", title: "", body: "", items: [], left: "", right: "", number: "", caption: "", notes: "", ...extra
});
/* apresentação com n slides a, b, c… (id e título iguais), já normalizada */
const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const mkDeck = (n, extra) => ({
  id: "d1", name: "teste", app: "", createdAt: 1, updatedAt: 2,
  slides: Array.from({ length: n }, (_, i) => slide(i < 26 ? LETTERS[i] : "z" + i, { title: i < 26 ? LETTERS[i] : "z" + i })),
  ...extra
});
const counter = (prefix) => { let k = 0; return () => prefix + (++k); };

/* ---- as constantes ---- */
{
  check("DECK_SLIDES é 30 e SLIDE_ITEMS é 8", DECK_SLIDES === 30 && SLIDE_ITEMS === 8, DECK_SLIDES + " " + SLIDE_ITEMS);
  check("SLIDE_LAYOUTS: os quatro layouts, nessa ordem", SLIDE_LAYOUTS.map((l) => l.id).join() === "cover,bullets,number,columns", SLIDE_LAYOUTS.map((l) => l.id).join());
  check("SLIDE_LAYOUTS: rótulos em português", SLIDE_LAYOUTS.map((l) => l.label).join() === "capa,título + tópicos,número grande,duas colunas", SLIDE_LAYOUTS.map((l) => l.label).join());
}

/* ---- blankSlide ---- */
{
  const b = blankSlide("columns", 7);
  check("blankSlide: tem todos os campos", hasAllKeys(b, SLIDE_KEYS), show(b));
  check("blankSlide: id vira texto e o layout fica", b.id === "7" && b.layout === "columns", show(b));
  check("blankSlide: todo texto vazio e items vazio", TEXT_FIELDS.every((k) => b[k] === "") && Array.isArray(b.items) && b.items.length === 0, show(b));
  check("blankSlide: layout desconhecido vira bullets", blankSlide("zzz", "x").layout === "bullets", blankSlide("zzz", "x").layout);
  check("blankSlide: sem layout vira bullets", blankSlide(undefined, "x").layout === "bullets");
  check("blankSlide: cada chamada tem seu próprio items", blankSlide("cover", "a").items !== blankSlide("cover", "a").items);
  for (const l of SLIDE_LAYOUTS) check("blankSlide: layout " + l.id + " é aceito", blankSlide(l.id, "x").layout === l.id);
}

/* ---- normalizeDeck: o documento ---- */
{
  const junk = [null, undefined, "texto", 42, true, [], [1, 2], {}, { slides: "x" }, { slides: null }, { slides: [null, 1, "a"] }];
  for (const j of junk) {
    let out;
    check("normalizeDeck não lança com " + show(j), noThrow(() => { out = normalizeDeck(j); }));
    check("normalizeDeck(" + show(j) + ") devolve documento completo", hasAllKeys(out, DECK_KEYS) && Array.isArray(out.slides), show(out));
    check("normalizeDeck(" + show(j) + ") sempre tem ao menos um slide", out && out.slides.length >= 1, show(out));
    check("normalizeDeck(" + show(j) + ") é idempotente", same(normalizeDeck(out), out), show(out));
  }

  const empty = normalizeDeck(null);
  check("normalizeDeck(null): nome padrão, id e app vazios, datas 0",
    empty.name === "apresentação sem nome" && empty.id === "" && empty.app === "" && empty.createdAt === 0 && empty.updatedAt === 0, show(empty));
  check("normalizeDeck(null): um só slide, capa vazia com id s1", empty.slides.length === 1 && same(empty.slides[0], blankSlide("cover", "s1")), show(empty.slides));
  check("normalizeDeck({slides: []}) também vira uma capa em branco", same(normalizeDeck({ slides: [] }).slides, [blankSlide("cover", "s1")]), show(normalizeDeck({ slides: [] }).slides));
  check("normalizeDeck: slides só com lixo viram uma capa em branco", same(normalizeDeck({ slides: [null, 3, "x", undefined] }).slides, [blankSlide("cover", "s1")]), show(normalizeDeck({ slides: [null, 3, "x"] }).slides));

  check("normalizeDeck: id numérico vira texto", normalizeDeck({ id: 7 }).id === "7", normalizeDeck({ id: 7 }).id);
  check("normalizeDeck: id texto fica", normalizeDeck({ id: "abc" }).id === "abc");
  check("normalizeDeck: id ausente é vazio", normalizeDeck({}).id === "");
  check("normalizeDeck: nome é aparado", normalizeDeck({ name: "  pitch  " }).name === "pitch", normalizeDeck({ name: "  pitch  " }).name);
  check("normalizeDeck: nome de 120 caracteres fica inteiro", normalizeDeck({ name: "n".repeat(120) }).name === "n".repeat(120));
  check("normalizeDeck: nome de 121 caracteres é cortado em 120", normalizeDeck({ name: "n".repeat(121) }).name === "n".repeat(120), String(normalizeDeck({ name: "n".repeat(121) }).name.length));
  check("normalizeDeck: nome vazio vira o padrão", normalizeDeck({ name: "" }).name === "apresentação sem nome");
  check("normalizeDeck: nome só de espaços vira o padrão", normalizeDeck({ name: "   \t " }).name === "apresentação sem nome");
  check("normalizeDeck: nome que não é texto vira o padrão", normalizeDeck({ name: null }).name === "apresentação sem nome" && normalizeDeck({ name: {} }).name === "apresentação sem nome");
  check("normalizeDeck: app texto fica, outra coisa vira vazio",
    normalizeDeck({ app: "loja" }).app === "loja" && normalizeDeck({ app: 5 }).app === "" && normalizeDeck({ app: null }).app === "" && normalizeDeck({}).app === "");
  check("normalizeDeck: datas finitas ficam", normalizeDeck({ createdAt: 123, updatedAt: 456 }).createdAt === 123 && normalizeDeck({ createdAt: 123, updatedAt: 456 }).updatedAt === 456);
  for (const bad of [NaN, Infinity, -Infinity, "5", null, undefined, {}]) {
    const d = normalizeDeck({ createdAt: bad, updatedAt: bad });
    check("normalizeDeck: data " + String(bad) + " vira 0", d.createdAt === 0 && d.updatedAt === 0, show(d));
  }
}

/* ---- normalizeDeck: os slides ---- */
{
  const one = (raw) => normalizeDeck({ slides: [raw] }).slides[0];

  /* layout */
  check("normalizeDeck: layout desconhecido vira bullets", one({ id: "a", layout: "zzz" }).layout === "bullets", one({ id: "a", layout: "zzz" }).layout);
  check("normalizeDeck: layout ausente vira bullets", one({ id: "a" }).layout === "bullets");
  check("normalizeDeck: layout que não é texto vira bullets", one({ id: "a", layout: 3 }).layout === "bullets" && one({ id: "a", layout: null }).layout === "bullets");
  for (const l of SLIDE_LAYOUTS) check("normalizeDeck: layout " + l.id + " fica", one({ id: "a", layout: l.id }).layout === l.id);

  /* campos completos */
  const bare = one({ id: "a" });
  check("normalizeDeck: slide ralo ganha todos os campos", hasAllKeys(bare, SLIDE_KEYS), show(bare));
  check("normalizeDeck: slide ralo tem texto vazio e items vazio", TEXT_FIELDS.every((k) => bare[k] === "") && same(bare.items, []), show(bare));

  /* texto: string fica, número vira texto, outra coisa vira vazio */
  const full = one({ id: "a", title: "t", body: "b", left: "l", right: "r", number: "42", caption: "c", notes: "n" });
  check("normalizeDeck: textos curtos ficam como estão", full.title === "t" && full.body === "b" && full.left === "l" && full.right === "r" && full.number === "42" && full.caption === "c" && full.notes === "n", show(full));
  check("normalizeDeck: texto não é aparado nem mexido", one({ id: "a", body: "  oi\n\ntchau  " }).body === "  oi\n\ntchau  ", show(one({ id: "a", body: "  oi\n\ntchau  " }).body));
  for (const k of TEXT_FIELDS) {
    const lim = LIMITS[k];
    check("normalizeDeck: " + k + " com " + lim + " caracteres fica inteiro", one({ id: "a", [k]: "x".repeat(lim) })[k] === "x".repeat(lim));
    check("normalizeDeck: " + k + " passa de " + lim + " e é cortado", one({ id: "a", [k]: "x".repeat(lim + 50) })[k] === "x".repeat(lim), String(one({ id: "a", [k]: "x".repeat(lim + 50) })[k].length));
    check("normalizeDeck: " + k + " número vira texto", one({ id: "a", [k]: 42 })[k] === "42", show(one({ id: "a", [k]: 42 })[k]));
    for (const bad of [null, undefined, true, {}, []]) check("normalizeDeck: " + k + " " + show(bad) + " vira vazio", one({ id: "a", [k]: bad })[k] === "", show(one({ id: "a", [k]: bad })[k]));
  }
  check("normalizeDeck: número decimal vira texto", one({ id: "a", number: 3.5 }).number === "3.5", one({ id: "a", number: 3.5 }).number);

  /* items */
  check("normalizeDeck: items só ficam as strings, vazias incluídas",
    same(one({ id: "a", items: ["a", 5, "", null, "b", {}, ["x"]] }).items, ["a", "", "b"]), show(one({ id: "a", items: ["a", 5, "", null, "b"] }).items));
  check("normalizeDeck: item de 200 caracteres fica", one({ id: "a", items: ["x".repeat(200)] }).items[0] === "x".repeat(200));
  check("normalizeDeck: item de 300 caracteres é cortado em 200", one({ id: "a", items: ["x".repeat(300)] }).items[0] === "x".repeat(200), String(one({ id: "a", items: ["x".repeat(300)] }).items[0].length));
  const many = one({ id: "a", items: Array.from({ length: 12 }, (_, i) => "i" + i) });
  check("normalizeDeck: no máximo SLIDE_ITEMS tópicos, os primeiros ficam", many.items.length === SLIDE_ITEMS && many.items[0] === "i0" && many.items[SLIDE_ITEMS - 1] === "i" + (SLIDE_ITEMS - 1), show(many.items));
  check("normalizeDeck: exatamente SLIDE_ITEMS tópicos ficam todos", one({ id: "a", items: Array.from({ length: SLIDE_ITEMS }, (_, i) => "i" + i) }).items.length === SLIDE_ITEMS);
  for (const bad of ["texto", 5, null, undefined, {}, { 0: "a", length: 1 }]) check("normalizeDeck: items " + show(bad) + " vira lista vazia", same(one({ id: "a", items: bad }).items, []), show(one({ id: "a", items: bad }).items));

  /* ids */
  const ra = normalizeDeck({ slides: [{ id: "a" }, { id: "b" }, { id: "c" }] });
  check("normalizeDeck: ids distintos ficam", ids(ra).join() === "a,b,c", ids(ra).join());
  const rb = normalizeDeck({ slides: [{ id: "a" }, { id: "a" }, {}] });
  check("normalizeDeck: id repetido e id ausente viram s1, s2…", ids(rb).join() === "a,s1,s2", ids(rb).join());
  const rc = normalizeDeck({ slides: [{}, {}, {}] });
  check("normalizeDeck: três slides sem id viram s1, s2, s3", ids(rc).join() === "s1,s2,s3", ids(rc).join());
  const rd = normalizeDeck({ slides: [{ id: "x" }, { id: "x" }, { id: "x" }, { id: "x" }] });
  check("normalizeDeck: o primeiro slide com o id o mantém", rd.slides[0].id === "x" && unique(ids(rd)), ids(rd).join());
  const re = normalizeDeck({ slides: [{ id: "s1" }, {}, { id: "s1" }, {}] });
  check("normalizeDeck: id gerado nunca colide com um id existente", unique(ids(re)) && re.slides[0].id === "s1" && re.slides.length === 4, ids(re).join());
  const rf = normalizeDeck({ slides: [{ id: "s1", title: "um" }, { title: "dois" }] });
  check("normalizeDeck: id ausente pula o s1 já usado", ids(rf).join() === "s1,s2", ids(rf).join());
  check("normalizeDeck: a repetição troca só o id, o texto fica", rb.slides[1].id !== "a" && same(titles(normalizeDeck({ slides: [{ id: "a", title: "um" }, { id: "a", title: "dois" }] })), ["um", "dois"]));

  /* só objetos */
  const mix = normalizeDeck({ slides: [{ id: "a", title: "um" }, null, 7, "x", true, { id: "b", title: "dois" }] });
  check("normalizeDeck: slides que não são objetos somem, a ordem dos outros fica", ids(mix).join() === "a,b" && titles(mix).join() === "um,dois", show(mix.slides));

  /* teto de slides */
  const big = normalizeDeck({ slides: Array.from({ length: 35 }, (_, i) => ({ id: "p" + i, title: "t" + i })) });
  check("normalizeDeck: 35 slides são cortados em 30", big.slides.length === DECK_SLIDES && DECK_SLIDES === 30, String(big.slides.length));
  check("normalizeDeck: no corte ficam os 30 primeiros, em ordem", big.slides[0].id === "p0" && big.slides[29].id === "p29" && ids(big).join() === Array.from({ length: 30 }, (_, i) => "p" + i).join());
  const exact = normalizeDeck({ slides: Array.from({ length: 30 }, (_, i) => ({ id: "p" + i })) });
  check("normalizeDeck: exatamente 30 slides ficam todos", exact.slides.length === 30);
  const bigNoId = normalizeDeck({ slides: Array.from({ length: 40 }, () => ({})) });
  check("normalizeDeck: 40 slides sem id: corta em 30 e os ids são únicos", bigNoId.slides.length === 30 && unique(ids(bigNoId)), String(bigNoId.slides.length));
}

/* ---- normalizeDeck: idempotência, pureza ---- */
{
  const messy = {
    id: 9, name: "  x  ", app: 3, createdAt: "1", updatedAt: 7,
    slides: [
      { id: "a", layout: "zzz", title: 5, body: "b".repeat(900), items: ["a", 1, "", "c".repeat(300), "d", "e", "f", "g", "h", "i", "j"], notes: {} },
      { id: "a", layout: "number", number: 12.5 },
      null,
      {}
    ]
  };
  const before = clone(messy);
  const once = normalizeDeck(messy);
  check("normalizeDeck não muta a entrada", same(messy, before), show(messy));
  check("normalizeDeck é idempotente em entrada suja", same(normalizeDeck(once), once), show(once));
  check("normalizeDeck: a saída não compartilha items com a entrada", (() => {
    const raw = { slides: [{ id: "a", items: ["x"] }] };
    const out = normalizeDeck(raw);
    out.slides[0].items.push("y");
    return same(raw.slides[0].items, ["x"]);
  })());
  const good = mkDeck(3);
  check("normalizeDeck: um documento já normalizado não muda", same(normalizeDeck(good), good), show(normalizeDeck(good)));
}

/* ---- moveSlide ---- */
{
  const d = mkDeck(3);
  const before = clone(d);
  const down = moveSlide(d, 0, 1);
  check("moveSlide: o primeiro desce uma casa", ids(down).join() === "b,a,c", ids(down).join());
  const up = moveSlide(d, 2, -1);
  check("moveSlide: o último sobe uma casa", ids(up).join() === "a,c,b", ids(up).join());
  check("moveSlide: o do meio desce", ids(moveSlide(d, 1, 1)).join() === "a,c,b");
  check("moveSlide: o do meio sobe", ids(moveSlide(d, 1, -1)).join() === "b,a,c");
  check("moveSlide: delta maior que 1 anda várias casas", ids(moveSlide(d, 0, 2)).join() === "b,c,a" && ids(moveSlide(d, 2, -2)).join() === "c,a,b", ids(moveSlide(d, 0, 2)).join());
  check("moveSlide: devolve um documento novo e não muta a entrada", down !== d && same(d, before), show(d));
  check("moveSlide: o resto do documento fica", down.id === "d1" && down.name === "teste" && down.createdAt === 1 && down.updatedAt === 2);
  check("moveSlide: o slide movido leva o texto junto", (() => {
    const x = mkDeck(3); x.slides[0].items = ["um", "dois"]; x.slides[0].notes = "nota";
    const m = moveSlide(x, 0, 1);
    return m.slides[1].id === "a" && same(m.slides[1].items, ["um", "dois"]) && m.slides[1].notes === "nota";
  })());
  check("moveSlide: o resultado está normalizado", same(normalizeDeck(down), down));

  check("moveSlide: o primeiro para cima devolve a mesma referência", moveSlide(d, 0, -1) === d);
  check("moveSlide: o último para baixo devolve a mesma referência", moveSlide(d, 2, 1) === d);
  check("moveSlide: destino além do fim devolve a mesma referência", moveSlide(d, 0, 3) === d && moveSlide(d, 1, 2) === d);
  check("moveSlide: destino antes do começo devolve a mesma referência", moveSlide(d, 2, -3) === d && moveSlide(d, 1, -2) === d);
  for (const idx of [-1, 3, 99, NaN, undefined, null]) check("moveSlide: índice " + String(idx) + " inválido devolve a mesma referência", moveSlide(d, idx, 1) === d);
  check("moveSlide: com um só slide não há para onde ir", (() => { const one = mkDeck(1); return moveSlide(one, 0, 1) === one && moveSlide(one, 0, -1) === one; })());

  const raw = { slides: [{ id: "a", title: "um" }, { id: "b", layout: "zzz" }] };
  const mv = moveSlide(raw, 0, 1);
  check("moveSlide: aceita documento cru e devolve normalizado", ids(mv).join() === "b,a" && mv.slides[0].layout === "bullets" && hasAllKeys(mv.slides[0], SLIDE_KEYS) && hasAllKeys(mv, DECK_KEYS), show(mv));
  for (const j of [null, undefined, "x", 5, []]) check("moveSlide não lança com " + show(j), noThrow(() => moveSlide(j, 0, 1)));
}

/* ---- duplicateSlide ---- */
{
  const d = mkDeck(3);
  d.slides[1] = slide("b", { layout: "columns", title: "bê", body: "corpo", items: ["x", "y"], left: "esq", right: "dir", number: "9", caption: "leg", notes: "nota" });
  const before = clone(d);
  const out = duplicateSlide(d, 1, () => "novo");
  check("duplicateSlide: ganha um slide", out.slides.length === 4, String(out.slides.length));
  check("duplicateSlide: a cópia entra logo depois do original", ids(out).join() === "a,b,novo,c", ids(out).join());
  check("duplicateSlide: a cópia tem o id do makeId", out.slides[2].id === "novo");
  check("duplicateSlide: a cópia tem o mesmo conteúdo, só o id muda", same({ ...out.slides[2], id: "" }, { ...d.slides[1], id: "" }), show(out.slides[2]));
  check("duplicateSlide: o original fica como estava", same(out.slides[1], d.slides[1]));
  check("duplicateSlide: devolve documento novo e não muta a entrada", out !== d && same(d, before), show(d));
  check("duplicateSlide: items da cópia é um array novo", out.slides[2].items !== out.slides[1].items && out.slides[2].items !== d.slides[1].items);
  out.slides[2].items.push("z");
  check("duplicateSlide: editar os tópicos da cópia não mexe no original", same(out.slides[1].items, ["x", "y"]) && same(d.slides[1].items, ["x", "y"]));
  check("duplicateSlide: o resultado está normalizado", same(normalizeDeck(out), out));

  const last = duplicateSlide(d, 2, () => "fim");
  check("duplicateSlide: duplicar o último põe a cópia no fim", ids(last).join() === "a,b,c,fim", ids(last).join());
  const first = duplicateSlide(d, 0, () => "ini");
  check("duplicateSlide: duplicar o primeiro põe a cópia na segunda posição", ids(first).join() === "a,ini,b,c", ids(first).join());

  const mid = counter("m");
  const two = duplicateSlide(duplicateSlide(d, 0, mid), 0, mid);
  check("duplicateSlide: duplicar de novo gera ids novos e únicos", unique(ids(two)) && two.slides.length === 5, ids(two).join());

  const emptyId = duplicateSlide(d, 0, () => "");
  check("duplicateSlide: makeId vazio gera um id livre", emptyId.slides.length === 4 && unique(ids(emptyId)) && emptyId.slides[1].id !== "", ids(emptyId).join());
  const usedId = duplicateSlide(d, 0, () => "c");
  check("duplicateSlide: makeId com id já usado gera um id livre", usedId.slides.length === 4 && unique(ids(usedId)) && usedId.slides[1].id !== "c" && usedId.slides[3].id === "c", ids(usedId).join());
  const sameAsOrig = duplicateSlide(d, 0, () => "a");
  check("duplicateSlide: makeId igual ao do original gera um id livre", unique(ids(sameAsOrig)) && sameAsOrig.slides[0].id === "a", ids(sameAsOrig).join());

  for (const idx of [-1, 3, 99, NaN, undefined]) check("duplicateSlide: índice " + String(idx) + " inválido devolve a mesma referência", duplicateSlide(d, idx, () => "n") === d);

  const full = mkDeck(DECK_SLIDES);
  check("duplicateSlide: no teto devolve a mesma referência", duplicateSlide(full, 0, () => "n") === full && full.slides.length === 30);
  const almost = mkDeck(DECK_SLIDES - 1);
  check("duplicateSlide: com 29 slides ainda cabe um", duplicateSlide(almost, 0, () => "n").slides.length === 30);
  for (const j of [null, undefined, "x", 5, []]) check("duplicateSlide não lança com " + show(j), noThrow(() => duplicateSlide(j, 0, () => "n")));
}

/* ---- removeSlide ---- */
{
  const d = mkDeck(3);
  const before = clone(d);
  check("removeSlide: tira o do meio", ids(removeSlide(d, 1)).join() === "a,c", ids(removeSlide(d, 1)).join());
  check("removeSlide: tira o primeiro", ids(removeSlide(d, 0)).join() === "b,c");
  check("removeSlide: tira o último", ids(removeSlide(d, 2)).join() === "a,b");
  const out = removeSlide(d, 1);
  check("removeSlide: devolve documento novo e não muta a entrada", out !== d && same(d, before), show(d));
  check("removeSlide: o resto do documento fica", out.id === "d1" && out.name === "teste" && out.createdAt === 1);
  check("removeSlide: o resultado está normalizado", same(normalizeDeck(out), out));
  for (const idx of [-1, 3, 99, NaN, undefined]) check("removeSlide: índice " + String(idx) + " inválido devolve a mesma referência", removeSlide(d, idx) === d);
  const one = mkDeck(1);
  check("removeSlide: o único slide não se apaga (mesma referência)", removeSlide(one, 0) === one && one.slides.length === 1);
  check("removeSlide: de dois slides sobra um", removeSlide(mkDeck(2), 0).slides.length === 1);
  for (const j of [null, undefined, "x", 5, []]) check("removeSlide não lança com " + show(j), noThrow(() => removeSlide(j, 0)));
}

/* ---- insertSlide ---- */
{
  const d = mkDeck(3);
  const before = clone(d);
  const novo = { id: "x", layout: "number", title: "grande", number: "42" };
  const nov0 = clone(novo);
  const out = insertSlide(d, 1, novo);
  check("insertSlide: entra na posição pedida", ids(out).join() === "a,x,b,c", ids(out).join());
  check("insertSlide: o slide é normalizado (todos os campos)", hasAllKeys(out.slides[1], SLIDE_KEYS) && out.slides[1].layout === "number" && out.slides[1].title === "grande" && out.slides[1].number === "42" && same(out.slides[1].items, []), show(out.slides[1]));
  check("insertSlide: devolve documento novo e não muta a entrada nem o slide", out !== d && same(d, before) && same(novo, nov0));
  check("insertSlide: no começo (índice 0)", ids(insertSlide(d, 0, { id: "x" })).join() === "x,a,b,c");
  check("insertSlide: no fim (índice = length)", ids(insertSlide(d, 3, { id: "x" })).join() === "a,b,c,x");
  check("insertSlide: índice negativo é limitado a 0", ids(insertSlide(d, -5, { id: "x" })).join() === "x,a,b,c", ids(insertSlide(d, -5, { id: "x" })).join());
  check("insertSlide: índice além do fim é limitado ao fim", ids(insertSlide(d, 99, { id: "x" })).join() === "a,b,c,x", ids(insertSlide(d, 99, { id: "x" })).join());
  const rep = insertSlide(d, 1, { id: "a", title: "repetido" });
  check("insertSlide: id repetido ganha um id livre, o dos outros fica", rep.slides.length === 4 && unique(ids(rep)) && rep.slides[0].id === "a" && rep.slides[1].id !== "a" && rep.slides[1].title === "repetido", ids(rep).join());
  const repBefore = insertSlide(d, 0, { id: "c", title: "repetido antes" });
  check("insertSlide: id repetido de um slide mais adiante: quem ganha id novo é o inserido", repBefore.slides.length === 4 && unique(ids(repBefore)) && repBefore.slides[0].id !== "c" && repBefore.slides[0].title === "repetido antes" && repBefore.slides[3].id === "c", ids(repBefore).join());
  const miss = insertSlide(d, 1, { title: "sem id" });
  check("insertSlide: id ausente ganha um id livre", miss.slides.length === 4 && unique(ids(miss)) && miss.slides[1].id !== "" && miss.slides[1].title === "sem id", ids(miss).join());
  const s1 = insertSlide(mkDeck(2, { slides: [slide("s1"), slide("b")] }), 1, {});
  check("insertSlide: o id livre pula os ids já usados", unique(ids(s1)) && s1.slides.length === 3 && s1.slides[1].id !== "s1", ids(s1).join());
  check("insertSlide: layout desconhecido vira bullets", insertSlide(d, 0, { id: "x", layout: "zzz" }).slides[0].layout === "bullets");
  check("insertSlide: o resultado está normalizado", same(normalizeDeck(out), out));
  const full = mkDeck(DECK_SLIDES);
  check("insertSlide: no teto devolve a mesma referência", insertSlide(full, 0, { id: "x" }) === full);
  check("insertSlide: com 29 slides ainda cabe um", insertSlide(mkDeck(DECK_SLIDES - 1), 0, { id: "x" }).slides.length === 30);
  for (const j of [null, undefined, "x", 5, []]) check("insertSlide não lança com documento " + show(j), noThrow(() => insertSlide(j, 0, { id: "x" })));
  for (const j of [null, undefined, "x", 5]) check("insertSlide não lança com slide " + show(j), noThrow(() => insertSlide(mkDeck(2), 0, j)));
}

/* ---- setLayout ---- */
{
  const d = mkDeck(3);
  d.slides[1] = slide("b", { layout: "columns", title: "bê", body: "corpo", items: ["x", "y"], left: "esq", right: "dir", number: "9", caption: "leg", notes: "nota" });
  const before = clone(d);
  const out = setLayout(d, 1, "cover");
  check("setLayout: troca o layout do slide", out.slides[1].layout === "cover", out.slides[1].layout);
  check("setLayout: todo o texto fica", same({ ...out.slides[1], layout: "" }, { ...d.slides[1], layout: "" }), show(out.slides[1]));
  check("setLayout: os outros slides ficam", same(out.slides[0], d.slides[0]) && same(out.slides[2], d.slides[2]) && ids(out).join() === "a,b,c");
  check("setLayout: devolve documento novo e não muta a entrada", out !== d && same(d, before), show(d));
  const back = setLayout(setLayout(d, 1, "number"), 1, "columns");
  check("setLayout: ir e voltar não perde nada", same(back.slides[1], d.slides[1]), show(back.slides[1]));
  for (const l of SLIDE_LAYOUTS) {
    if (l.id === "columns") continue;
    check("setLayout: para " + l.id + " mantém items, left e right", (() => { const r = setLayout(d, 1, l.id); return r.slides[1].layout === l.id && same(r.slides[1].items, ["x", "y"]) && r.slides[1].left === "esq" && r.slides[1].right === "dir"; })());
  }
  check("setLayout: o resultado está normalizado", same(normalizeDeck(out), out));
  check("setLayout: layout desconhecido devolve a mesma referência", setLayout(d, 1, "zzz") === d);
  check("setLayout: layout que não é texto devolve a mesma referência", setLayout(d, 1, null) === d && setLayout(d, 1, undefined) === d && setLayout(d, 1, 3) === d);
  check("setLayout: layout igual ao atual devolve a mesma referência", setLayout(d, 1, "columns") === d && setLayout(d, 0, "bullets") === d);
  for (const idx of [-1, 3, 99, NaN, undefined]) check("setLayout: índice " + String(idx) + " inválido devolve a mesma referência", setLayout(d, idx, "cover") === d);
  for (const j of [null, undefined, "x", 5, []]) check("setLayout não lança com " + show(j), noThrow(() => setLayout(j, 0, "cover")));
}

/* ---- updateSlide ---- */
{
  const d = mkDeck(3);
  d.slides[1] = slide("b", { layout: "bullets", title: "bê", items: ["x"], notes: "nota" });
  const before = clone(d);
  const patch = { title: "novo", items: ["p", "q"] };
  const patch0 = clone(patch);
  const out = updateSlide(d, 1, patch);
  check("updateSlide: o campo do patch muda", out.slides[1].title === "novo" && same(out.slides[1].items, ["p", "q"]), show(out.slides[1]));
  check("updateSlide: o que não está no patch fica", out.slides[1].notes === "nota" && out.slides[1].layout === "bullets" && out.slides[1].id === "b", show(out.slides[1]));
  check("updateSlide: os outros slides ficam", same(out.slides[0], d.slides[0]) && same(out.slides[2], d.slides[2]));
  check("updateSlide: devolve documento novo e não muta a entrada nem o patch", out !== d && same(d, before) && same(patch, patch0), show(d));
  check("updateSlide: o id do patch é ignorado", updateSlide(d, 1, { id: "outro", title: "t" }).slides[1].id === "b");
  check("updateSlide: o id do patch ignorado não duplica nem renomeia ninguém", ids(updateSlide(d, 1, { id: "a" })).join() === "a,b,c");
  check("updateSlide: o patch é normalizado (teto de título)", updateSlide(d, 1, { title: "x".repeat(300) }).slides[1].title === "x".repeat(160));
  check("updateSlide: o patch é normalizado (número vira texto)", updateSlide(d, 1, { number: 7 }).slides[1].number === "7");
  check("updateSlide: o patch é normalizado (layout desconhecido)", updateSlide(d, 1, { layout: "zzz" }).slides[1].layout === "bullets");
  check("updateSlide: o patch troca o layout válido", updateSlide(d, 1, { layout: "number" }).slides[1].layout === "number");
  check("updateSlide: o patch é normalizado (tópicos além do teto)", updateSlide(d, 1, { items: Array.from({ length: 12 }, (_, i) => "i" + i) }).slides[1].items.length === SLIDE_ITEMS);
  check("updateSlide: limpar um campo com texto vazio funciona", updateSlide(d, 1, { notes: "" }).slides[1].notes === "");
  check("updateSlide: items do resultado não é o array do patch", (() => {
    const it = ["a"]; const r = updateSlide(d, 1, { items: it }); r.slides[1].items.push("b"); return same(it, ["a"]);
  })());
  check("updateSlide: o resultado está normalizado", same(normalizeDeck(out), out));
  for (const idx of [-1, 3, 99, NaN, undefined]) check("updateSlide: índice " + String(idx) + " inválido devolve a mesma referência", updateSlide(d, idx, { title: "x" }) === d);
  for (const j of [null, undefined, "x", 5, []]) check("updateSlide não lança com documento " + show(j), noThrow(() => updateSlide(j, 0, { title: "x" })));
  for (const p of [null, undefined, "x", 5, []]) check("updateSlide não lança com patch " + show(p), noThrow(() => updateSlide(mkDeck(2), 0, p)));
}

/* ---- os modelos ---- */
{
  check("DECK_TEMPLATES: quatro modelos, nessa ordem", DECK_TEMPLATES.map((t) => t.id).join() === "pitch,launch,month,proposal", DECK_TEMPLATES.map((t) => t.id).join());
  check("DECK_TEMPLATES: nomes em português", DECK_TEMPLATES.map((t) => t.name).join() === "pitch do produto,lançamento,resultado do mês,proposta para cliente", DECK_TEMPLATES.map((t) => t.name).join());
  const seen = new Set();
  for (const t of DECK_TEMPLATES) {
    check("modelo " + t.id + ": tem resumo", typeof t.summary === "string" && t.summary.trim().length > 0);
    check("modelo " + t.id + ": entre 3 e 12 slides", Array.isArray(t.slides) && t.slides.length >= 3 && t.slides.length <= 12, String(t.slides && t.slides.length));
    check("modelo " + t.id + ": o primeiro slide é capa", t.slides[0] && t.slides[0].layout === "cover", show(t.slides[0]));
    check("modelo " + t.id + ": todo layout é válido", t.slides.every((s) => SLIDE_LAYOUTS.some((l) => l.id === s.layout)), t.slides.map((s) => s.layout).join());
    check("modelo " + t.id + ": todo slide tem título", t.slides.every((s) => typeof s.title === "string" && s.title.trim().length > 0));
    check("modelo " + t.id + ": slides parciais, sem id", t.slides.every((s) => !("id" in s)));
    for (const s of t.slides) seen.add(s.layout);

    const mk = counter("m");
    const built = buildDeck(t, mk);
    check("buildDeck(" + t.id + "): tem nome em texto", typeof built.name === "string" && built.name.trim().length > 0, show(built.name));
    check("buildDeck(" + t.id + "): tem a mesma quantidade de slides do modelo", built.slides.length === t.slides.length, built.slides.length + " vs " + t.slides.length);
    check("buildDeck(" + t.id + "): ids vêm do makeId e são únicos", built.slides.every((s) => /^m\d+$/.test(s.id)) && unique(ids(built)), ids(built).join());
    check("buildDeck(" + t.id + "): layout e título do modelo ficam", built.slides.every((s, i) => s.layout === t.slides[i].layout && s.title === t.slides[i].title));
    const norm = normalizeDeck(built);
    check("buildDeck(" + t.id + "): normalizeDeck não muda a quantidade de slides", norm.slides.length === built.slides.length, norm.slides.length + " vs " + built.slides.length);
    check("buildDeck(" + t.id + "): normalizeDeck não perde nem corta o texto do modelo", t.slides.every((s, i) => {
      const n = norm.slides[i];
      return TEXT_FIELDS.every((k) => s[k] == null || n[k] === String(s[k])) && same(n.items, s.items || []) && n.layout === s.layout;
    }));
    check("buildDeck(" + t.id + "): normalizeDeck mantém os ids", ids(norm).join() === ids(built).join());
    check("buildDeck(" + t.id + "): dois builds não compartilham items", (() => {
      const a = buildDeck(t, counter("a")); const b = buildDeck(t, counter("b"));
      return a.slides.every((s, i) => !Array.isArray(s.items) || s.items === undefined || s.items !== b.slides[i].items);
    })());
  }
  check("os quatro modelos juntos usam os quatro layouts", SLIDE_LAYOUTS.every((l) => seen.has(l.id)), [...seen].join());
  check("buildDeck: não muta o modelo", (() => {
    const t = DECK_TEMPLATES[0]; const before = clone(t); buildDeck(t, counter("z")); return same(t, before);
  })());

  let k = 0;
  const blank = buildDeck(null, () => "b" + (++k));
  check("buildDeck(null): nome padrão", blank.name === "apresentação", show(blank.name));
  check("buildDeck(null): uma capa vazia, e só", blank.slides.length === 1 && blank.slides[0].layout === "cover", show(blank.slides));
  check("buildDeck(null): a capa vem do makeId", blank.slides[0].id === "b1", show(blank.slides[0].id));
  check("buildDeck(null): a capa está vazia", TEXT_FIELDS.every((f) => !blank.slides[0][f]) && (blank.slides[0].items || []).length === 0, show(blank.slides[0]));
  check("buildDeck(null): normalizeDeck mantém um só slide", normalizeDeck(blank).slides.length === 1);
  for (const j of [undefined, "x", 5, {}, []]) check("buildDeck não lança com modelo " + show(j), noThrow(() => buildDeck(j, counter("q"))));
}

if (failures.length) {
  console.error(failures.length + " falhou(aram), " + passed + " ok:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("deck.test.mjs: " + passed + " verificações ok");
