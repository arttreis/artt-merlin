/* testa a semana do diário (ticket #62): a conta pura que monta os sete
 * cartões da página journal.html. o navegador de mentira sobe antes do import
 * porque o journal-data importa o core, que é um módulo de navegador. */

let passed = 0;
const failures = [];
const check = (name, cond, detail) => { if (cond) passed++; else failures.push(name + (detail ? " -> " + detail : "")); };

const map = new Map();
const noop = () => {};
globalThis.document = { documentElement: { classList: { add: noop, remove: noop, contains: () => false, toggle: () => false } }, addEventListener: noop, hidden: false, querySelector: () => null };
globalThis.window = { addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }) };
globalThis.location = { reload: noop };
globalThis.fetch = async (url) => { throw new Error("fetch nao previsto no teste: " + url); };
globalThis.localStorage = {
  get length() { return map.size; },
  key: (i) => [...map.keys()][i] ?? null,
  getItem: (k) => (map.has(k) ? map.get(k) : null),
  setItem: (k, v) => { map.set(k, String(v)); },
  removeItem: (k) => { map.delete(k); }
};

const { journalWeek, journalIsEmpty } = await import("./journal-data.js");

const MONDAY = "2026-10-13";
const docs = [
  { id: "2026-10-14", body: "dia leve", createdAt: 1, updatedAt: 1 },
  { id: "2026-10-16", body: "corri cedo", createdAt: 1, updatedAt: 1 },
  { id: "2026-10-05", body: "semana passada", createdAt: 1, updatedAt: 1 }
];

{
  const week = journalWeek(docs, MONDAY, "2026-10-16");
  check("a semana tem 7 dias", week.length === 7, String(week.length));
  check("hoje primeiro, depois os passados do mais novo ao mais velho, e os futuros por último",
    week.map((w) => w.day.slice(8)).join(",") === "16,15,14,13,17,18,19", week.map((w) => w.day).join(","));
  const by = Object.fromEntries(week.map((w) => [w.day, w]));
  check("14 e 16 trazem o texto", by["2026-10-14"].body === "dia leve" && by["2026-10-16"].body === "corri cedo");
  check("17 a 19 são futuro", ["2026-10-17", "2026-10-18", "2026-10-19"].every((d) => by[d].future === true));
  check("13 a 16 não são futuro (hoje inclusive)", ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"].every((d) => by[d].future === false));
  check("dia sem documento vem com o texto vazio", by["2026-10-15"].body === "" && by["2026-10-13"].body === "");
  check("documento de outra semana não entra", !week.some((w) => w.body === "semana passada"));
}
{
  const week = journalWeek([], MONDAY, "2026-10-16");
  check("sem documento nenhum os 7 dias vêm com body vazio", week.length === 7 && week.every((w) => w.body === ""));
  check("sem documento, o futuro continua marcado", week.filter((w) => w.future).length === 3);
}
{
  check("semana passada inteira: nenhum dia é futuro, do domingo para a segunda",
    journalWeek(docs, "2026-10-05", "2026-10-16").every((w) => !w.future) && journalWeek(docs, "2026-10-05", "2026-10-16")[0].day === "2026-10-11");
  check("semana que vem inteira: todo dia é futuro, a segunda primeiro",
    journalWeek(docs, "2026-10-19", "2026-10-16").every((w) => w.future) && journalWeek(docs, "2026-10-19", "2026-10-16")[0].day === "2026-10-19");
  check("a virada de mês: 26 out a 1 nov", journalWeek([], "2026-10-26", "2026-11-05").map((w) => w.day).join(",") ===
    "2026-11-01,2026-10-31,2026-10-30,2026-10-29,2026-10-28,2026-10-27,2026-10-26");
  check("documento apagado (lápide) não traz texto", journalWeek([{ id: "2026-10-14", deleted: true, body: "x" }], MONDAY, "2026-10-16").every((w) => w.body === ""));
  check("sem a lista, não quebra", journalWeek(undefined, MONDAY, "2026-10-16").length === 7);
}
{
  check("journalIsEmpty: coleção vazia", journalIsEmpty([]) === true);
  check("journalIsEmpty: com texto não é vazia", journalIsEmpty(docs) === false);
  check("journalIsEmpty: só texto em branco ainda é vazia", journalIsEmpty([{ id: "2026-10-14", body: "  \n" }]) === true);
  check("journalIsEmpty: só lápide ainda é vazia", journalIsEmpty([{ id: "2026-10-14", deleted: true }]) === true);
}

if (failures.length) {
  console.error(failures.length + " falha(s):\n - " + failures.join("\n - "));
  process.exit(1);
}
console.log(passed + " verificações do diário passaram");
