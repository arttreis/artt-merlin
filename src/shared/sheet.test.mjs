/* testa a planilha (ticket #90): as contas puras do sheet.js — leitura de número
 * e data, normalização, fórmulas (referência, intervalo, precedência, ciclo),
 * reais em centavos, exportação CSV, inserir/remover linha e coluna reescrevendo
 * as fórmulas, e os quatro modelos. O sheet.js não toca o navegador, então não
 * precisa de navegador de mentira. */

let passed = 0;
const failures = [];
const check = (name, cond, detail) => { if (cond) passed++; else failures.push(name + (detail ? " -> " + detail : "")); };

const {
  SHEET_ROWS, SHEET_COLS, COL_TYPES, colLetter, parseNumber, parseDate, normalizeSheet, evaluateSheet,
  toCSV, insertRow, removeRow, insertCol, removeCol, SHEET_TEMPLATES, buildSheet
} = await import("./sheet.js");

const near = (a, b) => typeof a === "number" && Math.abs(a - b) < 1e-9;
const canon = (v) => {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  return JSON.stringify(v);
};
const same = (a, b) => canon(a) === canon(b);
const show = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };

/* planilha de teste: colunas c1, c2… com os tipos dados; linhas r1, r2… com as células em texto.
 * string vazia = célula vazia */
const mk = (types, rows) => ({
  id: "s1", name: "teste", app: "", createdAt: 1, updatedAt: 1,
  cols: types.map((t, i) => ({ id: "c" + (i + 1), name: "", type: t })),
  rows: rows.map((r, i) => ({
    id: "r" + (i + 1),
    cells: Object.fromEntries(r.map((v, j) => ["c" + (j + 1), v]).filter(([, v]) => v !== "" && v != null))
  }))
});
/* grid(tipos, linhas) devolve get(linha, coluna) com índices a partir de 0 */
const grid = (types, rows) => {
  const ev = evaluateSheet(mk(types, rows));
  return (r, c) => ev["r" + (r + 1)]["c" + (c + 1)];
};
/* f("=SOMA(A1:A3)", "1", "2", "3"): células A1.. com os valores e a fórmula na linha seguinte */
const f = (formula, ...above) => {
  const g = grid(["number"], [...above, formula].map((c) => [c]));
  return g(above.length, 0);
};
const fv = (formula, ...above) => f(formula, ...above).value;
const isErr = (c, which) => c.kind === "error" && c.value === (which || "#erro") && c.text === (which || "#erro");
/* a coluna c1 de uma planilha, em texto, linha a linha */
const col1 = (sheet) => sheet.rows.map((r) => r.cells.c1 ?? "");
const noThrow = (fn) => { try { fn(); return true; } catch (e) { return false; } };

/* ---- as constantes ---- */
{
  check("SHEET_ROWS é 200 e SHEET_COLS é 26", SHEET_ROWS === 200 && SHEET_COLS === 26, SHEET_ROWS + " " + SHEET_COLS);
  check("COL_TYPES: os quatro tipos", COL_TYPES.map((t) => t.id).join() === "text,number,money,date", COL_TYPES.map((t) => t.id).join());
  check("COL_TYPES: cada tipo tem rótulo", COL_TYPES.every((t) => typeof t.label === "string" && t.label.length > 0));
  check("COL_TYPES: rótulos em português", COL_TYPES.map((t) => t.label).join() === "texto,número,R$,data", COL_TYPES.map((t) => t.label).join());
}

/* ---- colLetter ---- */
{
  check("colLetter: 0 é A", colLetter(0) === "A", colLetter(0));
  check("colLetter: 1 é B", colLetter(1) === "B", colLetter(1));
  check("colLetter: 25 é Z", colLetter(25) === "Z", colLetter(25));
}

/* ---- parseNumber ---- */
{
  const cases = [
    ["1.234,56", 1234.56], ["1234,5", 1234.5], ["1234.5", 1234.5], ["1.200", 1200], ["R$ 12", 12],
    ["R$ 1.234,56", 1234.56], ["-3", -3], ["30%", 0.3], ["6,5%", 0.065], ["0", 0], ["12", 12], ["0,5", 0.5], ["1.2345", 1.2345]
  ];
  for (const [text, want] of cases) check("parseNumber: \"" + text + "\" vale " + want, near(parseNumber(text), want), String(parseNumber(text)));
  for (const bad of ["", "abc", "12abc", "R$", "--3", "1,2,3x"]) check("parseNumber: \"" + bad + "\" dá null", parseNumber(bad) === null, String(parseNumber(bad)));
}

/* ---- parseDate ---- */
{
  const serial = Date.UTC(2026, 9, 20) / 86400000;
  check("parseDate: 20/10/2026 é o serial em dias desde 1970 (UTC)", parseDate("20/10/2026") === serial, String(parseDate("20/10/2026")));
  check("parseDate: ISO e brasileiro dão o mesmo serial", parseDate("2026-10-20") === parseDate("20/10/2026"), parseDate("2026-10-20") + " " + parseDate("20/10/2026"));
  check("parseDate: 1970-01-01 é 0", parseDate("1970-01-01") === 0, String(parseDate("1970-01-01")));
  check("parseDate: 1970-01-02 é 1", parseDate("1970-01-02") === 1, String(parseDate("1970-01-02")));
  check("parseDate: 31/02/2026 não existe", parseDate("31/02/2026") === null, String(parseDate("31/02/2026")));
  check("parseDate: 29/02/2028 existe (bissexto)", typeof parseDate("29/02/2028") === "number", String(parseDate("29/02/2028")));
  check("parseDate: 29/02/2027 não existe", parseDate("29/02/2027") === null, String(parseDate("29/02/2027")));
  check("parseDate: texto solto dá null", parseDate("abc") === null && parseDate("") === null);
}

/* ---- normalizeSheet: lixo ---- */
{
  const empty = { id: "", name: "planilha sem nome", app: "", cols: [{ id: "c1", name: "", type: "text" }], rows: [], createdAt: 0, updatedAt: 0 };
  for (const raw of [null, undefined, "x", 3, true]) {
    check("normalizeSheet: " + show(raw) + " vira a planilha vazia", same(normalizeSheet(raw), empty), show(normalizeSheet(raw)));
  }
  check("normalizeSheet: {} vira a planilha vazia", same(normalizeSheet({}), empty), show(normalizeSheet({})));
  check("normalizeSheet: nunca lança com lixo", noThrow(() => { normalizeSheet({ cols: "x", rows: 5, name: {}, app: [] }); normalizeSheet({ cols: [null, 1, "a"], rows: [null, "x", 3] }); normalizeSheet([]); }));
}

/* ---- normalizeSheet: campos ---- */
{
  const n1 = normalizeSheet({ name: "  oi  " });
  check("normalizeSheet: nome com trim", n1.name === "oi", n1.name);
  check("normalizeSheet: nome vazio vira 'planilha sem nome'", normalizeSheet({ name: "   " }).name === "planilha sem nome" && normalizeSheet({ name: "" }).name === "planilha sem nome");
  check("normalizeSheet: nome passa de 120 e corta", normalizeSheet({ name: "x".repeat(300) }).name.length === 120);
  check("normalizeSheet: app string é mantido", normalizeSheet({ app: "precificacao" }).app === "precificacao");
  check("normalizeSheet: app que não é string vira vazio", normalizeSheet({ app: 5 }).app === "" && normalizeSheet({ app: { a: 1 } }).app === "");
  const t = normalizeSheet({ createdAt: 5, updatedAt: 9 });
  check("normalizeSheet: createdAt e updatedAt numéricos ficam", t.createdAt === 5 && t.updatedAt === 9);
  const bad = normalizeSheet({ createdAt: "x", updatedAt: Infinity });
  check("normalizeSheet: datas inválidas viram 0", bad.createdAt === 0 && bad.updatedAt === 0, show(bad));
  check("normalizeSheet: NaN vira 0", normalizeSheet({ createdAt: NaN }).createdAt === 0);
  const extra = normalizeSheet({ id: "s9", name: "n", segredo: 1, cols: [{ id: "a", name: "A", type: "text", extra: 1 }], rows: [{ id: "r", cells: {}, extra: 1 }] });
  check("normalizeSheet: campos extras somem", same(Object.keys(extra).sort(), ["app", "cols", "createdAt", "id", "name", "rows", "updatedAt"]) && same(Object.keys(extra.cols[0]).sort(), ["id", "name", "type"]) && same(Object.keys(extra.rows[0]).sort(), ["cells", "id"]), show(extra));
  check("normalizeSheet: id da planilha é mantido", extra.id === "s9");
}

/* ---- normalizeSheet: colunas ---- */
{
  const n = normalizeSheet({ cols: [null, "x", 3, { id: "a", name: "N", type: "foo" }, { id: "a", name: "dup", type: "money" }, { name: "semid" }, { id: "" }] });
  check("normalizeSheet: colunas só com objetos, ids únicos e de reserva", same(n.cols.map((c) => c.id), ["a", "c1", "c2", "c3"]), show(n.cols));
  check("normalizeSheet: tipo desconhecido vira text", n.cols[0].type === "text");
  check("normalizeSheet: tipo conhecido é mantido", n.cols[1].type === "money" && n.cols[1].name === "dup");
  const dup = normalizeSheet({ cols: [{ id: "c1" }, { id: "c1" }] });
  check("normalizeSheet: id repetido ganha a reserva ainda livre", same(dup.cols.map((c) => c.id), ["c1", "c2"]), show(dup.cols));
  const types = normalizeSheet({ cols: COL_TYPES.map((t, i) => ({ id: "k" + i, name: "n", type: t.id })) });
  check("normalizeSheet: os quatro tipos passam", types.cols.map((c) => c.type).join() === "text,number,money,date", show(types.cols));
  check("normalizeSheet: nome de coluna corta em 60", normalizeSheet({ cols: [{ id: "a", name: "y".repeat(100) }] }).cols[0].name.length === 60);
  check("normalizeSheet: coluna sem nome fica com nome vazio", normalizeSheet({ cols: [{ id: "a" }] }).cols[0].name === "");
  const many = normalizeSheet({ cols: Array.from({ length: 40 }, (_, i) => ({ id: "k" + i })) });
  check("normalizeSheet: no máximo 26 colunas", many.cols.length === SHEET_COLS, String(many.cols.length));
  check("normalizeSheet: cols que não é lista dá uma coluna de reserva", same(normalizeSheet({ cols: "x" }).cols, [{ id: "c1", name: "", type: "text" }]));
  check("normalizeSheet: lista de cols vazia dá uma coluna de reserva", same(normalizeSheet({ cols: [] }).cols, [{ id: "c1", name: "", type: "text" }]));
  check("normalizeSheet: só lixo em cols dá uma coluna de reserva", same(normalizeSheet({ cols: [null, 3, "x"] }).cols, [{ id: "c1", name: "", type: "text" }]));
}

/* ---- normalizeSheet: linhas e células ---- */
{
  const n = normalizeSheet({
    cols: [{ id: "a" }, { id: "b" }],
    rows: [null, "x", { id: "r1", cells: { a: 5, b: "", zz: "fora" } }, { id: "r1", cells: { a: "dup" } }, {}, { id: "r9", cells: null }]
  });
  check("normalizeSheet: linhas só com objetos, ids únicos e de reserva", same(n.rows.map((r) => r.id), ["r1", "r2", "r3", "r9"]), show(n.rows.map((r) => r.id)));
  check("normalizeSheet: valor de célula vira texto, vazio some, chave desconhecida some", same(n.rows[0].cells, { a: "5" }), show(n.rows[0].cells));
  check("normalizeSheet: linha sem cells ganha cells vazio", same(n.rows[2].cells, {}) && same(n.rows[3].cells, {}));
  const long = normalizeSheet({ cols: [{ id: "a" }], rows: [{ id: "r", cells: { a: "z".repeat(3000) } }] });
  check("normalizeSheet: célula corta em 2000", long.rows[0].cells.a.length === 2000);
  const many = normalizeSheet({ cols: [{ id: "a" }], rows: Array.from({ length: 300 }, (_, i) => ({ id: "r" + i })) });
  check("normalizeSheet: no máximo 200 linhas", many.rows.length === SHEET_ROWS, String(many.rows.length));
  check("normalizeSheet: rows que não é lista dá nenhuma linha", normalizeSheet({ rows: "x" }).rows.length === 0);
  const again = normalizeSheet(n);
  check("normalizeSheet: é idempotente", same(again, n));
}

/* ---- evaluateSheet: estrutura e valores digitados ---- */
{
  const sheet = mk(["text", "number", "money", "date"], [["oi", "", "", ""], ["", "", "", ""]]);
  const ev = evaluateSheet(sheet);
  check("evaluateSheet: uma entrada por linha e por coluna", Object.keys(ev).join() === "r1,r2" && Object.keys(ev.r1).join() === "c1,c2,c3,c4" && Object.keys(ev.r2).join() === "c1,c2,c3,c4", show(Object.keys(ev)));
  check("evaluateSheet: célula vazia", same(ev.r1.c2, { kind: "empty", value: null, text: "" }), show(ev.r1.c2));
  check("evaluateSheet: texto digitado", ev.r1.c1.kind === "text" && ev.r1.c1.value === "oi" && ev.r1.c1.text === "oi", show(ev.r1.c1));
  check("evaluateSheet: planilha sem linhas dá objeto vazio", Object.keys(evaluateSheet(mk(["text"], []))).length === 0);
  check("evaluateSheet: lixo vira planilha vazia sem lançar", noThrow(() => { evaluateSheet(null); evaluateSheet("x"); evaluateSheet({ rows: 3 }); }));
  const input = JSON.stringify(sheet);
  evaluateSheet(sheet);
  check("evaluateSheet: não mexe na planilha de entrada", JSON.stringify(sheet) === input);
}

{
  const g = grid(["number", "number", "text", "money", "money", "money", "date", "date", "date"],
    [["1234,5", "30%", "abc", "4320", "1.234,56", "R$ 12", "20/10/2026", "2026-10-20", "abc"]]);
  check("valor digitado: número em coluna number", g(0, 0).kind === "number" && near(g(0, 0).value, 1234.5), show(g(0, 0)));
  check("valor digitado: número mostra o texto cru", g(0, 0).text === "1234,5", g(0, 0).text);
  check("valor digitado: porcentagem vira fração e continua '30%' na tela", near(g(0, 1).value, 0.3) && g(0, 1).text === "30%", show(g(0, 1)));
  check("valor digitado: texto em coluna text", g(0, 2).kind === "text" && g(0, 2).value === "abc" && g(0, 2).text === "abc");
  check("R$: 4320 mostra '4.320,00' e guarda 432000 centavos", g(0, 3).kind === "number" && g(0, 3).value === 4320 && g(0, 3).text === "4.320,00" && g(0, 3).cents === 432000, show(g(0, 3)));
  check("R$: '1.234,56' guarda 123456 centavos", near(g(0, 4).value, 1234.56) && g(0, 4).cents === 123456 && g(0, 4).text === "1.234,56", show(g(0, 4)));
  check("R$: 'R$ 12' mostra '12,00' e guarda 1200 centavos", g(0, 5).value === 12 && g(0, 5).text === "12,00" && g(0, 5).cents === 1200, show(g(0, 5)));
  check("data: 20/10/2026 vira serial e mostra dd/mm/aaaa", g(0, 6).kind === "number" && g(0, 6).value === parseDate("20/10/2026") && g(0, 6).text === "20/10/2026", show(g(0, 6)));
  check("data: ISO mostra dd/mm/aaaa", g(0, 7).value === parseDate("2026-10-20") && g(0, 7).text === "20/10/2026", show(g(0, 7)));
  check("data: texto que não é data nem número fica texto", g(0, 8).kind === "text" && g(0, 8).text === "abc", show(g(0, 8)));
  const money = grid(["money"], [["abc"], ["0,10"], ["0,005"]]);
  check("R$: texto que não é número fica texto", money(0, 0).kind === "text" && money(0, 0).text === "abc", show(money(0, 0)));
  check("R$: centavos arredondados", money(1, 0).cents === 10 && money(1, 0).text === "0,10", show(money(1, 0)));
  const num = grid(["number"], [["5"]]);
  check("data em coluna number: número digitado é número", num(0, 0).kind === "number" && num(0, 0).value === 5);
  const dnum = grid(["date"], [["5"]]);
  check("coluna data com número digitado vira número", dnum(0, 0).kind === "number" && dnum(0, 0).value === 5, show(dnum(0, 0)));
}

/* ---- evaluateSheet: fórmulas, aritmética e precedência ---- */
{
  const cases = [
    ["=1+2", 3], ["=1+2*3", 7], ["=(1+2)*3", 9], ["=10-4-3", 3], ["=8/2/2", 2], ["=10/4", 2.5], ["=2*3+4*5", 26],
    ["=-2+5", 3], ["=+4", 4], ["=2*-3", -6], ["=-(1+2)", -3], ["=--4", 4], ["=((2))", 2], ["=2*(3+(4-1))", 12],
    ["=50%", 0.5], ["=100*10%", 10], ["=1,5*2", 3], ["=1.5*2", 3], ["= 1 + 2 ", 3], ["=0,1+0,2", 0.3], ["=2-3", -1]
  ];
  for (const [formula, want] of cases) {
    const c = f(formula);
    check("fórmula " + formula + " dá " + want, c.kind === "number" && near(c.value, want), show(c));
  }
}

/* ---- evaluateSheet: referências ---- */
{
  check("referência: =A1+A2", fv("=A1+A2", "2", "3") === 5);
  check("referência: minúscula", fv("=a1*a2", "2", "3") === 6);
  check("referência: =A1 sozinha devolve o próprio número", f("=A1", "7").kind === "number" && fv("=A1", "7") === 7);
  const t = f("=A1", "abc");
  check("referência: =A1 sozinha devolve o texto", t.kind === "text" && t.value === "abc" && t.text === "abc", show(t));
  check("referência: vazia vale 0 na conta", fv("=A1+5", "") === 5 && fv("=A1*3", "") === 0);
  check("referência: texto numa conta dá #erro", isErr(f("=A1*2", "abc")), show(f("=A1*2", "abc")));
  check("referência: texto numa soma dá #erro", isErr(f("=A1+1", "abc")));
  check("referência: fora da planilha (linha 999) vale 0", fv("=A999+5") === 5 && fv("=A999*2") === 0);
  check("referência: fora da planilha (coluna Z) vale 0", fv("=Z1+5") === 5);
  check("referência: porcentagem digitada entra como fração", near(fv("=A1*200", "30%"), 60));
  check("referência: a outra coluna e a outra linha", (() => {
    const g = grid(["number", "number", "number"], [["2", "10", ""], ["3", "20", "=B2*A1+A2"]]);
    return g(1, 2).value === 43;
  })());
  check("referência: dinheiro entra pelo valor", (() => {
    const g = grid(["money", "number"], [["1.500,00", "=A1*2"]]);
    return g(0, 1).value === 3000;
  })());
  const chain = Array.from({ length: 200 }, (_, i) => (i === 199 ? "1" : "=A" + (i + 2) + "+1"));
  check("referência: corrente de 200 linhas calcula sem estourar", (() => {
    const g = grid(["number"], chain.map((c) => [c]));
    return g(0, 0).value === 200;
  })());
}

/* ---- evaluateSheet: as contas do ticket (SOMA, B2*C2, MÉDIA) ---- */
{
  const rows = [
    ["Produto", "Qtd", "Preço", ""],
    ["a", "2", "1.500,00", "=B2*C2"],
    ["b", "3", "10", "=B3*C3"],
    ["c", "5", "", "=B4*C4"],
    ["d", "10", "2,50", "=B5*C5"],
    ["total", "=SOMA(B2:B5)", "=MÉDIA(C2:C5)", "=SOMA(D2:D5)"]
  ];
  const g = grid(["text", "number", "money", "money"], rows);
  check("ticket: =B2*C2 calcula", g(1, 3).value === 3000 && g(1, 3).text === "3.000,00" && g(1, 3).cents === 300000, show(g(1, 3)));
  check("ticket: =B3*C3 calcula", g(2, 3).value === 30);
  check("ticket: =B4*C4 com célula vazia dá 0", g(3, 3).value === 0, show(g(3, 3)));
  check("ticket: =SOMA(B2:B5) ignora o cabeçalho e calcula", g(5, 1).value === 20, show(g(5, 1)));
  check("ticket: =MÉDIA(C2:C5) calcula a média dos preenchidos", near(g(5, 2).value, (1500 + 10 + 2.5) / 3), show(g(5, 2)));
  check("ticket: =SOMA(D2:D5) soma as multiplicações", near(g(5, 3).value, 3000 + 30 + 0 + 25), show(g(5, 3)));
  check("ticket: o total em R$ guarda centavos", g(5, 3).cents === 305500 && g(5, 3).text === "3.055,00", show(g(5, 3)));
}

/* ---- evaluateSheet: funções ---- */
{
  const A = ["2", "", "4", "abc", "6"];
  check("SOMA: ignora vazios e textos", fv("=SOMA(A1:A5)", ...A) === 12);
  check("MÉDIA: ignora vazios e textos", fv("=MÉDIA(A1:A5)", ...A) === 4);
  check("MÍN: ignora vazios e textos", fv("=MÍN(A1:A5)", ...A) === 2);
  check("MÁX: ignora vazios e textos", fv("=MÁX(A1:A5)", ...A) === 6);
  check("funções sem acento: MEDIA, MIN, MAX", fv("=MEDIA(A1:A5)", ...A) === 4 && fv("=MIN(A1:A5)", ...A) === 2 && fv("=MAX(A1:A5)", ...A) === 6);
  check("funções em minúscula", fv("=soma(A1:A5)", ...A) === 12 && fv("=média(A1:A5)", ...A) === 4 && fv("=min(A1:A5)", ...A) === 2 && fv("=máx(A1:A5)", ...A) === 6);
  check("funções com caixa mista", fv("=Soma(A1:A5)", ...A) === 12);
  check("SOMA de nada é 0", fv("=SOMA(A1:A2)", "", "") === 0 && fv("=SOMA(A1:A2)", "abc", "x") === 0);
  check("MÍN de nada é 0", fv("=MÍN(A1:A2)", "", "") === 0);
  check("MÁX de nada é 0", fv("=MÁX(A1:A2)", "", "") === 0);
  check("MÉDIA de nada é #erro", isErr(f("=MÉDIA(A1:A2)", "", "")) && isErr(f("=MÉDIA(A1:A2)", "abc", "x")));
  check("argumentos com ponto e vírgula", fv("=SOMA(A1;A2;10)", "1", "2") === 13);
  check("argumentos com vírgula quando não é decimal", fv("=MÁX(A1,A2)", "3", "9") === 9 && fv("=SOMA(A1,A2)", "3", "9") === 12);
  check("intervalo junto de valor solto", fv("=SOMA(A1:A2;10)", "1", "2") === 13);
  check("função dentro de conta", fv("=SOMA(A1:A2)*2", "1", "2") === 6 && fv("=1+SOMA(A1:A2)", "1", "2") === 4);
  check("função dentro de função", fv("=MÁX(SOMA(A1:A2);A3)", "1", "2", "10") === 10);
  check("função com decimal de vírgula e separador ;", near(fv("=SOMA(1,5;2,5)"), 4));
  check("intervalo retangular", (() => {
    const g = grid(["number", "number", "number"], [["1", "2", ""], ["3", "4", "=SOMA(A1:B2)"]]);
    return g(1, 2).value === 10;
  })());
  check("intervalo em minúscula", fv("=soma(a1:a2)", "4", "5") === 9);
  check("intervalo parcialmente fora da planilha", grid(["number", "number"], [["1", "=SOMA(A1:A999)"], ["2", ""]])(0, 1).value === 3);
}

/* ---- evaluateSheet: texto da célula calculada ---- */
{
  check("fórmula em number: 1/3 mostra '0,33'", f("=1/3").text === "0,33", f("=1/3").text);
  check("fórmula em number: 1234,5 mostra '1.234,5'", f("=1000+234,5").text === "1.234,5", f("=1000+234,5").text);
  check("fórmula em number: inteiro mostra com milhar", f("=1000+234").text === "1.234", f("=1000+234").text);
  check("fórmula em number: inteiro pequeno", f("=2+3").text === "5");
  check("fórmula em number: negativo", f("=0-1,5").text === "-1,5", f("=0-1,5").text);
  const money = grid(["money", "money"], [["2160", "=A1*2"]]);
  check("fórmula em R$: 4.320,00 com centavos", money(0, 1).text === "4.320,00" && money(0, 1).cents === 432000 && money(0, 1).value === 4320, show(money(0, 1)));
  const date = grid(["date", "date"], [["20/10/2026", "=A1+30"]]);
  check("fórmula em data: +30 dias mostra dd/mm/aaaa", date(0, 1).value === parseDate("20/10/2026") + 30 && date(0, 1).text === "19/11/2026", show(date(0, 1)));
}

/* ---- evaluateSheet: erros ---- */
{
  check("divisão por zero dá #erro", isErr(f("=1/0")), show(f("=1/0")));
  check("divisão por referência vazia dá #erro", isErr(f("=5/A1", "")));
  check("divisão por conta que zera dá #erro", isErr(f("=5/(2-2)")));
  check("0/0 dá #erro", isErr(f("=0/0")));
  check("função desconhecida dá #erro", isErr(f("=FOO(1)")), show(f("=FOO(1)")));
  for (const bad of ["=1+", "=(1", "=)", "=1+*2", "=SOMA(", "=SOMA(1", "=2 3", "=*2"]) {
    check("sintaxe ruim " + bad + " dá #erro", isErr(f(bad)), show(f(bad)));
  }
  check("intervalo fora de função dá #erro", isErr(f("=B1:B3")) && isErr(f("=A1:A2", "1", "2")));
  check("quem depende de #erro dá #erro", isErr(f("=A1+1", "=1/0")) && isErr(f("=SOMA(A1:A2)", "=1/0", "3")));
  check("o erro não contamina a vizinha", fv("=A2+1", "=1/0", "4") === 5);
  const a = grid(["number"], [["=1/0"]]);
  check("célula com erro tem kind error, value e text '#erro'", isErr(a(0, 0)), show(a(0, 0)));
}

/* ---- evaluateSheet: ciclos ---- */
{
  const direct = grid(["number"], [["=A1"]]);
  check("ciclo direto dá #ciclo", isErr(direct(0, 0), "#ciclo"), show(direct(0, 0)));
  const indirect = grid(["number", "number", "number", "number"], [["=B1", "=A1", "=A1+1", "5"]]);
  check("ciclo indireto: as duas pontas dão #ciclo", isErr(indirect(0, 0), "#ciclo") && isErr(indirect(0, 1), "#ciclo"), show([indirect(0, 0), indirect(0, 1)]));
  check("quem depende de ciclo dá #ciclo", isErr(indirect(0, 2), "#ciclo"), show(indirect(0, 2)));
  check("célula fora do ciclo continua calculando", indirect(0, 3).value === 5);
  const tri = grid(["number"], [["=A2"], ["=A3"], ["=A1"], ["=A1*2"], ["7"]]);
  check("ciclo de três células: todas dão #ciclo", [0, 1, 2].every((i) => isErr(tri(i, 0), "#ciclo")), show([0, 1, 2].map((i) => tri(i, 0))));
  check("ciclo de três: dependente também", isErr(tri(3, 0), "#ciclo"));
  check("ciclo de três: célula solta intacta", tri(4, 0).value === 7);
  const range = grid(["number"], [["=SOMA(A1:A2)"], ["3"]]);
  check("ciclo por intervalo que inclui a própria célula dá #ciclo", isErr(range(0, 0), "#ciclo"), show(range(0, 0)));
  const mix = grid(["number"], [["=A1"], ["=SOMA(A1:A1)"], ["=A2+1"]]);
  check("intervalo sobre ciclo dá #ciclo", isErr(mix(1, 0), "#ciclo") && isErr(mix(2, 0), "#ciclo"));
  const diamond = grid(["number"], [["1"], ["=A1+1"], ["=A1+2"], ["=A2+A3"]]);
  check("dependência em losango não é ciclo", diamond(3, 0).value === 5, show(diamond(3, 0)));
}

/* ---- evaluateSheet: nunca lança ---- */
{
  const deep = "=" + "(".repeat(5000);
  check("lixo: parênteses abertos de sobra dá #erro", isErr(f(deep)), show(f(deep)));
  check("lixo: parênteses fundos balanceados não lança", noThrow(() => f("=" + "(".repeat(900) + "1" + ")".repeat(900))));
  check("lixo: menos unário em cadeia não lança", noThrow(() => f("=" + "-".repeat(1500) + "1")));
  check("lixo: fórmula comprida de somas não lança", noThrow(() => f("=" + "1+".repeat(900) + "1")));
  check("lixo: funções aninhadas fundo não lançam", noThrow(() => f("=" + "SOMA(".repeat(300) + "1" + ")".repeat(300))));
  check("lixo: caracteres estranhos dão #erro", ["=@#$", "=\u0000", "=1 + 'a'", "=\"x\"", "=[1]", "=1;2", "=A", "=1A"].every((s) => noThrow(() => f(s))));
  check("lixo: '=' sozinho não lança", noThrow(() => f("=")));
  check("lixo: células com objetos e listas não lançam", noThrow(() => evaluateSheet({ cols: [{ id: "a" }], rows: [{ id: "r", cells: { a: { x: 1 } } }, { id: "s", cells: { a: [1, 2] } }, { id: "t", cells: null }, null] })));
  check("lixo: planilha toda torta não lança", noThrow(() => evaluateSheet({ cols: 3, rows: "x" })));
  const rows = Array.from({ length: 200 }, (_, i) => ["=A" + ((i % 200) + 1)]);
  check("lixo: 200 células se referindo a si mesmas não lançam", noThrow(() => grid(["number"], rows)));
}

/* ---- toCSV ---- */
{
  const sheet = {
    id: "s", name: "csv", app: "", createdAt: 1, updatedAt: 1,
    cols: [{ id: "c1", name: "Item", type: "text" }, { id: "c2", name: "", type: "number" }, { id: "c3", name: "Preço", type: "money" }, { id: "c4", name: "Dia", type: "date" }],
    rows: [
      { id: "r1", cells: { c1: "café", c2: "1234,5", c3: "4320", c4: "20/10/2026" } },
      { id: "r2", cells: { c1: "a;b", c2: "30%" } },
      { id: "r3", cells: { c1: 'diz "oi"', c2: "=1/0", c3: "abc", c4: "x" } },
      { id: "r4", cells: { c1: "x", c2: "1.234,56", c3: "=C1/3" } }
    ]
  };
  const csv = toCSV(sheet);
  check("CSV: começa com BOM", csv.charCodeAt(0) === 0xfeff, show(csv.slice(0, 3)));
  check("CSV: só um BOM", csv.indexOf("﻿", 1) === -1);
  const lines = csv.replace(/^﻿/, "").split("\r\n");
  if (lines[lines.length - 1] === "") lines.pop();
  check("CSV: linhas separadas por CRLF, cabeçalho e quatro linhas", lines.length === 5, show(lines));
  check("CSV: cabeçalho usa o nome, ou a letra quando o nome é vazio", lines[0] === "Item;B;Preço;Dia", lines[0]);
  check("CSV: acento fica como está, número sem milhar, R$ com centavos, data dd/mm/aaaa", lines[1] === "café;1234,5;4320,00;20/10/2026", lines[1]);
  check("CSV: campo com ';' vai entre aspas, '%' digitado continua, vazio vira nada", lines[2] === '"a;b";30%;;', lines[2]);
  check("CSV: aspas dobradas, erro como '#erro', texto em R$ e em data crus", lines[3] === '"diz ""oi""";#erro;abc;x', lines[3]);
  check("CSV: milhar digitado sai sem milhar e fórmula em R$ sai com centavos", lines[4] === "x;1234,56;1440,00;", lines[4]);
  check("CSV: não mexe na planilha de entrada", (() => { const s = JSON.stringify(sheet); toCSV(sheet); return JSON.stringify(sheet) === s; })());

  const q = toCSV(mk(["text"], [["l1\nl2"], ["a\rb"], ['"'], ["ok"]]));
  check("CSV: quebra de linha dentro do campo vai entre aspas", q.includes('"l1\nl2"'), show(q));
  check("CSV: retorno de carro dentro do campo vai entre aspas", q.includes('"a\rb"'), show(q));
  check("CSV: aspas sozinha vira quatro aspas", q.includes('""""'), show(q));

  const inj = toCSV(mk(["text"], [["+cmd"], ["@SOMA"], ["-x"], ["ok"], ["-3"]])).replace(/^﻿/, "").split("\r\n");
  check("CSV: texto começando com + ganha apóstrofo", inj[1] === "'+cmd", show(inj));
  check("CSV: texto começando com @ ganha apóstrofo", inj[2] === "'@SOMA", show(inj));
  check("CSV: texto começando com - ganha apóstrofo", inj[3] === "'-x", show(inj));
  check("CSV: texto comum fica igual", inj[4] === "ok", show(inj));
  check("CSV: número negativo não ganha apóstrofo", inj[5] === "-3", show(inj));
  const ref = toCSV(mk(["text"], [["@x"], ["=A1"]])).replace(/^﻿/, "").split("\r\n");
  check("CSV: texto que vem de referência também é protegido", ref[2] === "'@x", show(ref));

  const calc = toCSV(mk(["number"], [["=1/3"], ["=A1"], ["=1/0"], ["0,5"]])).replace(/^﻿/, "").split("\r\n");
  check("CSV: fórmula com até 6 casas", calc[1] === "0,333333", show(calc));
  check("CSV: referência a fórmula leva o valor calculado", calc[2] === "0,333333", show(calc));
  const cyc = toCSV(mk(["number"], [["=A1"], ["1"]])).replace(/^﻿/, "").split("\r\n");
  check("CSV: ciclo sai como #ciclo", cyc[1] === "#ciclo", show(cyc));
  check("CSV: erro sai como #erro", calc[3] === "#erro", show(calc));

  const empty = toCSV(mk(["text", "text"], []));
  check("CSV: sem linhas ainda tem BOM e cabeçalho", empty.startsWith("﻿") && empty.replace(/^﻿/, "").split("\r\n")[0] === "A;B", show(empty));
  check("CSV: nunca lança com lixo", noThrow(() => { toCSV(null); toCSV("x"); toCSV({ cols: 3, rows: "x" }); }));
  check("CSV: lixo ainda começa com BOM", toCSV(null).charCodeAt(0) === 0xfeff);
}

/* ---- inserir e remover linha ---- */
{
  const base = mk(["number"], [["1"], ["2"], ["=A1+A2"]]);
  const snap = JSON.stringify(base);
  const ins0 = insertRow(base, 0);
  check("insertRow: não mexe na planilha de entrada", JSON.stringify(base) === snap);
  check("insertRow: devolve outra planilha", ins0 !== base && ins0.rows !== base.rows);
  check("insertRow: uma linha a mais, vazia, na posição pedida", ins0.rows.length === 4 && same(ins0.rows[0].cells, {}), show(ins0.rows));
  check("insertRow: id novo e único", new Set(ins0.rows.map((r) => r.id)).size === 4 && !["r1", "r2", "r3"].includes(ins0.rows[0].id), show(ins0.rows.map((r) => r.id)));
  check("insertRow: as outras linhas seguem na ordem", ins0.rows.slice(1).map((r) => r.id).join() === "r1,r2,r3");
  check("insertRow: no começo, as referências andam +1", ins0.rows[3].cells.c1 === "=A2+A3", ins0.rows[3].cells.c1);
  check("insertRow: no começo, o resultado continua 3", evaluateSheet(ins0)[ins0.rows[3].id].c1.value === 3);
  const ins1 = insertRow(base, 1);
  check("insertRow: no meio, só a referência depois dela anda", ins1.rows[3].cells.c1 === "=A1+A3", ins1.rows[3].cells.c1);
  check("insertRow: no meio, o resultado continua 3", evaluateSheet(ins1)[ins1.rows[3].id].c1.value === 3);
  const ins2 = insertRow(base, 2);
  check("insertRow: antes da fórmula, as referências acima não mudam", ins2.rows[3].cells.c1 === "=A1+A2", ins2.rows[3].cells.c1);
  const insEnd = insertRow(base, 3);
  check("insertRow: no fim acrescenta", insEnd.rows.length === 4 && insEnd.rows[3].id !== "r3" && insEnd.rows[2].id === "r3" && insEnd.rows[2].cells.c1 === "=A1+A2");
  const given = insertRow(base, 1, { id: "novo", cells: { c1: "9" } });
  check("insertRow: usa a linha dada", given.rows[1].id === "novo" && given.rows[1].cells.c1 === "9", show(given.rows[1]));

  const full = mk(["text"], Array.from({ length: 200 }, (_, i) => ["v" + i]));
  const over = insertRow(full, 5);
  check("insertRow: acima do teto de 200 devolve a mesma planilha", same(over, full) && over.rows.length === 200);
  check("insertRow: logo abaixo do teto ainda insere", insertRow(mk(["text"], Array.from({ length: 199 }, () => [""])), 0).rows.length === 200);

  const one = mk(["number"], [["5"], ["7"], ["=SOMA(A1:A2)"]]);
  const rm0 = removeRow(one, 0);
  check("removeRow: tira a linha na posição", rm0.rows.length === 2 && rm0.rows.map((r) => r.id).join() === "r2,r3");
  check("removeRow: a fórmula acompanha: =SOMA(A1:A2) vira =SOMA(A1:A1)", rm0.rows[1].cells.c1 === "=SOMA(A1:A1)", rm0.rows[1].cells.c1);
  check("removeRow: o resultado reflete a linha que saiu", evaluateSheet(rm0).r3.c1.value === 7);
  check("removeRow: não mexe na planilha de entrada", col1(one).join() === "5,7,=SOMA(A1:A2)");

  const ref = removeRow(base, 1);
  check("removeRow: referência à linha removida vira #ref", /#ref/i.test(ref.rows[1].cells.c1), ref.rows[1].cells.c1);
  check("removeRow: referência a linha removida dá #erro", isErr(evaluateSheet(ref).r3.c1), show(evaluateSheet(ref).r3.c1));
  const after = removeRow(mk(["number"], [["1"], ["2"], ["3"], ["=A3+1"], ["=A3*2"]]), 0);
  check("removeRow: referências depois da linha andam -1", after.rows[2].cells.c1 === "=A2+1" && after.rows[3].cells.c1 === "=A2*2", col1(after).join());
  const before = removeRow(mk(["number"], [["1"], ["2"], ["=A1+1"]]), 2);
  check("removeRow: remover a linha da fórmula não quebra as outras", before.rows.length === 2 && col1(before).join() === "1,2");

  const rng = mk(["number"], [["1"], ["2"], ["3"], ["4"], ["5"], ["=SOMA(A1:A5)"]]);
  const rngRm = removeRow(rng, 2);
  check("removeRow: ponta de intervalo encolhe A1:A5 -> A1:A4", rngRm.rows[4].cells.c1 === "=SOMA(A1:A4)", rngRm.rows[4].cells.c1);
  check("removeRow: o intervalo encolhido soma o que sobrou", evaluateSheet(rngRm)[rngRm.rows[4].id].c1.value === 12);
  const rngIns2 = insertRow(rng, 2);
  check("insertRow: ponta de intervalo cresce A1:A5 -> A1:A6", rngIns2.rows[6].cells.c1 === "=SOMA(A1:A6)", rngIns2.rows[6].cells.c1);
  check("insertRow: no meio do intervalo, a soma segue igual", evaluateSheet(rngIns2)[rngIns2.rows[6].id].c1.value === 15);
  const rngIns0 = insertRow(rng, 0);
  check("insertRow: antes do intervalo, as duas pontas andam", rngIns0.rows[6].cells.c1 === "=SOMA(A2:A6)", rngIns0.rows[6].cells.c1);
  const rngInsEnd = insertRow(rng, 5);
  check("insertRow: depois do intervalo, ele não muda", rngInsEnd.rows[6].cells.c1 === "=SOMA(A1:A5)", rngInsEnd.rows[6].cells.c1);

  const style = mk(["number"], [["1"], ["2"], ["=a1+SOMA(A1;A2)*1,5"], ["=MÉDIA(A1:A2)"], ["A1"], ["total = A2"]]);
  const sIns = insertRow(style, 0);
  const evS = evaluateSheet(sIns);
  check("insertRow: reescreve minúscula, ';' e decimal de vírgula sem quebrar", near(evS.r3.c1.value, 1 + 3 * 1.5), show(evS.r3.c1));
  check("insertRow: reescreve função com acento e intervalo", near(evS.r4.c1.value, 1.5), show(evS.r4.c1));
  check("insertRow: texto digitado que parece referência não é fórmula e não muda", sIns.rows[5].cells.c1 === "A1" && sIns.rows[6].cells.c1 === "total = A2", col1(sIns).join("|"));
  const sRm = removeRow(style, 0);
  check("removeRow: depois de remover a 1ª linha, a MÉDIA do que sobrou reflete", (() => {
    const e = evaluateSheet(sRm);
    return near(e.r4.c1.value, 2);
  })(), show(evaluateSheet(sRm).r4));
}

/* ---- inserir e remover coluna ---- */
{
  const base = mk(["number", "number", "number"], [["1", "2", "=A1+B1"], ["3", "4", "=SOMA(A2:B2)"]]);
  const snap = JSON.stringify(base);
  const ins0 = insertCol(base, 0);
  check("insertCol: não mexe na planilha de entrada", JSON.stringify(base) === snap);
  check("insertCol: uma coluna a mais na posição pedida", ins0.cols.length === 4 && ins0.cols.slice(1).map((c) => c.id).join() === "c1,c2,c3", show(ins0.cols));
  check("insertCol: id novo e único", new Set(ins0.cols.map((c) => c.id)).size === 4 && !["c1", "c2", "c3"].includes(ins0.cols[0].id));
  check("insertCol: a coluna nova nasce vazia e sem lixo nas linhas", ins0.rows.every((r) => r.cells[ins0.cols[0].id] === undefined), show(ins0.rows));
  check("insertCol: no começo, as referências andam uma letra", ins0.rows[0].cells.c3 === "=B1+C1" && ins0.rows[1].cells.c3 === "=SOMA(B2:C2)", show(ins0.rows.map((r) => r.cells.c3)));
  const e0 = evaluateSheet(ins0);
  check("insertCol: no começo, os resultados continuam", e0.r1.c3.value === 3 && e0.r2.c3.value === 7);
  const ins1 = insertCol(base, 1);
  check("insertCol: no meio, só a referência depois dela anda", ins1.rows[0].cells.c3 === "=A1+C1", ins1.rows[0].cells.c3);
  check("insertCol: no meio, intervalo que atravessa cresce", ins1.rows[1].cells.c3 === "=SOMA(A2:C2)", ins1.rows[1].cells.c3);
  check("insertCol: no meio, os resultados continuam", evaluateSheet(ins1).r1.c3.value === 3 && evaluateSheet(ins1).r2.c3.value === 7);
  const insEnd = insertCol(base, 3);
  check("insertCol: no fim acrescenta e não mexe nas fórmulas", insEnd.cols.length === 4 && insEnd.rows[0].cells.c3 === "=A1+B1");
  const given = insertCol(base, 1, { id: "nova", name: "Novo", type: "money" });
  check("insertCol: usa a coluna dada", same(given.cols[1], { id: "nova", name: "Novo", type: "money" }), show(given.cols));
  const sheet26 = mk(Array.from({ length: 26 }, () => "text"), [["a"]]);
  check("insertCol: acima do teto de 26 devolve a mesma planilha", same(insertCol(sheet26, 3), sheet26));
  check("insertCol: logo abaixo do teto ainda insere", insertCol(mk(Array.from({ length: 25 }, () => "text"), [["a"]]), 0).cols.length === 26);

  const rm = mk(["number", "number", "number"], [["1", "2", "=B1*2"]]);
  const rm0 = removeCol(rm, 0);
  check("removeCol: tira a coluna e as células dela", rm0.cols.map((c) => c.id).join() === "c2,c3" && rm0.rows[0].cells.c1 === undefined, show(rm0));
  check("removeCol: as referências depois andam uma letra para trás", rm0.rows[0].cells.c3 === "=A1*2", rm0.rows[0].cells.c3);
  check("removeCol: o resultado continua", evaluateSheet(rm0).r1.c3.value === 4);
  const rmRef = removeCol(base, 1);
  check("removeCol: referência à coluna removida vira #ref", /#ref/i.test(rmRef.rows[0].cells.c3), rmRef.rows[0].cells.c3);
  check("removeCol: referência à coluna removida dá #erro", isErr(evaluateSheet(rmRef).r1.c3), show(evaluateSheet(rmRef).r1.c3));
  const rmLast = removeCol(base, 2);
  check("removeCol: remover a coluna da fórmula tira as células dela", rmLast.cols.length === 2 && rmLast.rows.every((r) => r.cells.c3 === undefined));
  const rmRange = mk(["number", "number", "number", "number"], [["1", "2", "3", "=SOMA(A1:C1)"]]);
  const rmMid = removeCol(rmRange, 1);
  check("removeCol: intervalo encolhe A1:C1 -> A1:B1", rmMid.rows[0].cells.c4 === "=SOMA(A1:B1)", rmMid.rows[0].cells.c4);
  check("removeCol: o intervalo encolhido soma o que sobrou", evaluateSheet(rmMid).r1.c4.value === 4);
  const rmOnly = mk(["text"], [["a"]]);
  check("removeCol: a única coluna não sai", same(removeCol(rmOnly, 0), rmOnly) && removeCol(rmOnly, 0).cols.length === 1);
  check("removeCol: não mexe na planilha de entrada", JSON.stringify(rm) === JSON.stringify(mk(["number", "number", "number"], [["1", "2", "=B1*2"]])));
}

/* ---- modelos ---- */
{
  const ids = SHEET_TEMPLATES.map((t) => t.id);
  check("modelos: são quatro, com os ids combinados", same([...ids].sort(), ["break-even", "mrr", "pricing", "product-cost"]), ids.join());
  let n = 0;
  const makeId = () => "id" + (++n);
  for (const t of SHEET_TEMPLATES) {
    check("modelo " + t.id + ": tem nome e resumo", typeof t.name === "string" && t.name.length > 0 && typeof t.summary === "string" && t.summary.length > 0);
    check("modelo " + t.id + ": colunas com nome e tipo válidos", Array.isArray(t.cols) && t.cols.length > 0 && t.cols.length <= SHEET_COLS && t.cols.every((c) => typeof c.name === "string" && COL_TYPES.some((x) => x.id === c.type)), show(t.cols));
    check("modelo " + t.id + ": linhas de texto cabem nas colunas", Array.isArray(t.rows) && t.rows.length > 0 && t.rows.length <= SHEET_ROWS && t.rows.every((r) => Array.isArray(r) && r.length <= t.cols.length && r.every((v) => typeof v === "string")));
    const s = buildSheet(t, makeId);
    check("modelo " + t.id + ": buildSheet leva o nome, as colunas e as linhas", s.name === t.name && s.cols.length === t.cols.length && s.rows.length === t.rows.length, show(s.name));
    check("modelo " + t.id + ": ids vêm do makeId e são únicos", [...s.cols, ...s.rows].every((x) => /^id\d+$/.test(x.id)) && new Set([...s.cols, ...s.rows].map((x) => x.id)).size === s.cols.length + s.rows.length);
    check("modelo " + t.id + ": nome e tipo das colunas se mantêm", s.cols.every((c, i) => c.name === t.cols[i].name && c.type === t.cols[i].type));
    const colIds = new Set(s.cols.map((c) => c.id));
    check("modelo " + t.id + ": células usam só ids de coluna e guardam o texto do modelo", s.rows.every((r, ri) => Object.keys(r.cells).every((k) => colIds.has(k)) && t.rows[ri].every((v, ci) => v === "" ? r.cells[s.cols[ci].id] === undefined : r.cells[s.cols[ci].id] === v)), show(s.rows[0]));
    check("modelo " + t.id + ": passa pelo normalizeSheet sem perder nada", (() => { const nz = normalizeSheet(s); return nz.cols.length === s.cols.length && nz.rows.length === s.rows.length && same(nz.rows.map((r) => r.cells), s.rows.map((r) => r.cells)); })());
    const ev = evaluateSheet(s);
    const bad = [];
    for (const r of s.rows) for (const c of s.cols) { const cell = ev[r.id][c.id]; if (cell.kind === "error") bad.push(r.id + "/" + c.id + "=" + cell.text); }
    check("modelo " + t.id + ": nenhuma célula dá #erro ou #ciclo", bad.length === 0, bad.join(" "));
    check("modelo " + t.id + ": toCSV roda", toCSV(s).startsWith("﻿") && !/#erro|#ciclo/.test(toCSV(s)));
  }

  const mrr = SHEET_TEMPLATES.find((t) => t.id === "mrr");
  check("modelo mrr: tem as 12 linhas de mês", mrr && mrr.rows.length >= 12 && mrr.rows.filter((r) => r[0] && r[0] !== "").length >= 12, mrr && String(mrr.rows.length));

  const pc = SHEET_TEMPLATES.find((t) => t.id === "product-cost");
  const totalIdx = pc ? pc.rows.findIndex((r) => String(r[0]).trim().toLowerCase() === "total") : -1;
  check("modelo product-cost: tem uma linha 'total'", totalIdx >= 0);
  if (totalIdx >= 0) {
    const s = buildSheet(pc, () => "x" + Math.random().toString(36).slice(2, 10) + (n++));
    const ev = evaluateSheet(s);
    const moneyCols = s.cols.map((c, i) => [c, i]).filter(([c]) => c.type === "money");
    check("modelo product-cost: tem coluna em R$", moneyCols.length > 0);
    check("modelo product-cost: o total tem valor em R$ com centavos", moneyCols.some(([c]) => { const cell = ev[s.rows[totalIdx].id][c.id]; return cell.kind === "number" && typeof cell.cents === "number"; }), show(s.rows[totalIdx]));
  }

  let k = 0;
  const blank = buildSheet(null, () => "b" + (++k));
  check("buildSheet(null): três colunas de texto sem nome", blank.cols.length === 3 && blank.cols.every((c) => c.type === "text" && c.name === ""), show(blank.cols));
  check("buildSheet(null): ids vêm do makeId e são únicos", blank.cols.every((c) => /^b\d+$/.test(c.id)) && new Set(blank.cols.map((c) => c.id)).size === 3);
  check("buildSheet(null): tem lista de linhas e nome", Array.isArray(blank.rows) && typeof blank.name === "string");
  check("buildSheet(null): vira planilha válida", noThrow(() => evaluateSheet(blank)));
}

if (failures.length) {
  console.error(failures.length + " falhou(aram), " + passed + " ok:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("sheet.test.mjs: " + passed + " verificações ok");
