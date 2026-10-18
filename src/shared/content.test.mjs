/* testa o nucleo puro da tela de conteudo (content-script.js).
 *
 * o que se testa aqui e o que, errado, estraga trabalho sem aparecer na hora:
 * um molde trocado por cima de um roteiro escrito a mao, um gancho que entra
 * na secao errada, uma secao que duplica a cada clique, e a conta do ritmo
 * cobrando dia que ja passou.
 */
import {
  FORMAT_IDS, moldFor, isUntouchedMold, setHook, upsertSection, scriptLines, contentContext,
  rulesOf, ruleGap, cadenceGaps, weekDays, assignDays, gapParts, ME
} from "./content-script.js";

let passed = 0;
const failures = [];
const check = (name, cond, detail) => { if (cond) passed++; else failures.push(name + (detail ? " -> " + detail : "")); };

/* ---------- moldes ---------- */
{
  const heads = {
    reels: ["## gancho · 0 a 3s", "## segurar", "## virada", "## cta"],
    story: ["## tela 1 · gancho", "## tela 3 · interação", "## tela 4 · cta"],
    carousel: ["## capa", "## penúltimo · a virada", "## último · cta"],
    youtube: ["## título e thumb", "## capítulos"],
    email: ["## assunto", "## preheader", "## ps"],
    other: ["## gancho", "## desenvolvimento", "## fechamento"]
  };
  for (const f of FORMAT_IDS) {
    const m = moldFor(f, "minha peça");
    check("molde " + f + ": começa pelo título", m.startsWith("# minha peça\n"), m.split("\n")[0]);
    check("molde " + f + ": tem as seções do formato", heads[f].every((h) => m.includes(h + "\n")), f);
    check("molde " + f + ": nenhum tópico conta no cartão", scriptLines(m) === 0, String(scriptLines(m)));
  }
  check("molde: formato desconhecido cai no de outro", moldFor("tiktok", "x") === moldFor("other", "x"));
  check("molde: sem título vira roteiro", moldFor("reels", "").startsWith("# roteiro\n"));
}

/* ---------- molde intocado ---------- */
{
  const m = moldFor("reels", "título velho");
  check("intocado: o molde do formato, com outro título", isUntouchedMold(m, "reels"));
  check("intocado: espaço sobrando no fim da linha não conta", isUntouchedMold(m.replace("## segurar", "## segurar  "), "reels"));
  check("intocado: molde de outro formato não é", !isUntouchedMold(m, "story"));
  check("intocado: um tópico escrito já é trabalho", !isUntouchedMold(m.replace("## cta\n- ", "## cta\n- link na bio"), "reels"));
  check("intocado: roteiro vazio não é molde", !isUntouchedMold("", "reels"));
  check("intocado: dica apagada já é trabalho", !isUntouchedMold(m.replace("*abre a curiosidade e só fecha no fim*\n", ""), "reels"));
}

/* ---------- gancho ---------- */
{
  const reels = setHook(moldFor("reels", "x"), "faturou 800 mil em 5 meses", "reels");
  check("gancho reels: entra no primeiro tópico do gancho", /## gancho · 0 a 3s\n\*[^\n]*\*\n- faturou 800 mil em 5 meses\n## segurar/.test(reels), reels);
  const twice = setHook(reels, "outro gancho", "reels");
  check("gancho reels: trocar de novo troca, não acrescenta", twice.includes("- outro gancho") && !twice.includes("800 mil"), twice);

  const carousel = setHook(moldFor("carousel", "x"), "a promessa", "carousel");
  check("gancho carrossel: mora na capa", /## capa\n\*[^\n]*\*\n- a promessa\n/.test(carousel), carousel);
  const story = setHook(moldFor("story", "x"), "a primeira tela", "story");
  check("gancho story: mora na tela 1", /## tela 1 · gancho\n- a primeira tela\n/.test(story), story);

  const bare = setHook("# título\n\nalgum texto solto\n", "frase", "youtube");
  check("gancho sem seção: nasce logo depois do título", bare.startsWith("# título\n## gancho\n- frase\n"), bare);
  check("gancho sem nada: vira a seção", setHook("", "frase", "reels") === "## gancho\n- frase\n");
  const empty = setHook("# t\n## gancho\n## resto\n- a", "frase", "other");
  check("gancho com seção sem tópico: entra dentro dela", empty === "# t\n## gancho\n- frase\n## resto\n- a", empty);
  const written = setHook("# t\n## gancho\n- primeira\n- segunda", "nova", "other");
  check("gancho: só a primeira linha muda", written === "# t\n## gancho\n- nova\n- segunda", written);
}

/* ---------- secoes ---------- */
{
  check("seção em roteiro vazio", upsertSection("", "produção", "- take 1") === "## produção\n- take 1\n");
  const one = upsertSection("# t\n## gancho\n- a\n", "produção", "- take 1");
  check("seção nova vai para o fim", one === "# t\n## gancho\n- a\n\n## produção\n- take 1\n", one);
  const again = upsertSection(one, "produção", "- take 2");
  check("seção existente é trocada, não duplicada", again === "# t\n## gancho\n- a\n\n## produção\n- take 2\n" && again.split("## produção").length === 2, again);
  const mid = upsertSection("# t\n## produção\n- velho\n- velho 2\n## publicação\n- legenda\n", "produção", "- novo");
  check("seção no meio: o resto fica", mid === "# t\n## produção\n- novo\n\n## publicação\n- legenda\n", mid);
  const dup = upsertSection("# t\n", "publicação", "## publicação\n- legenda");
  check("seção: o corpo que já vem com o título não duplica", dup.split("## publicação").length === 2, dup);
  const sub = upsertSection("# t\n## produção\n### take 1\n- a\n## cta\n- b", "produção", "- x");
  check("seção: ### é parte da seção, não o fim dela", sub === "# t\n## produção\n- x\n\n## cta\n- b\n", sub);
}

/* ---------- contexto ---------- */
{
  const piece = { id: "p", title: "t", format: "reels", stage: "script", date: "2026-10-05", client: "c1", script: "x".repeat(9000), createdAt: 1 };
  const client = { id: "c1", name: "Fulano", niche: "moda", sells: "vestidos", pain: "p".repeat(2000), summary: "s".repeat(5000), offers: [{ name: "kit verão" }, { name: "" }] };
  const others = Array.from({ length: 40 }, (_, i) => ({ id: "o" + i, title: "peça " + i, client: i % 2 ? "c1" : "", createdAt: i }));
  const ctx = contentContext(piece, client, others);
  check("contexto: roteiro cortado em 4000", ctx.script.length === 4000);
  check("contexto: página cortada em 1200", ctx.page.length === 1200);
  check("contexto: molde do formato vai junto", ctx.mold.includes("## virada") && ctx.mold.length <= 1500);
  check("contexto: formato e etapa em rótulo", ctx.format === "Reels" && ctx.stage === "roteiro", ctx.format + "/" + ctx.stage);
  check("contexto: só as peças do mesmo cliente", ctx.recent.length === 20 && ctx.recent[0] === "peça 39", ctx.recent.length + " " + ctx.recent[0]);
  check("contexto: ofertas sem nome caem", ctx.offers.length === 1 && ctx.offers[0] === "kit verão");
  const mine = contentContext({ ...piece, client: "" }, null, others);
  check("contexto: peça sem cliente vai sem cliente", mine.client === "" && mine.niche === "" && mine.offers.length === 0);
  check("contexto: as últimas 30 do conteúdo próprio", mine.recent.length === 20 && !mine.recent.includes("peça 39"), String(mine.recent.length));
  const many = Array.from({ length: 50 }, (_, i) => ({ id: "m" + i, title: "m" + i, client: "", createdAt: i }));
  check("contexto: no máximo 30 títulos", contentContext({ ...piece, client: "" }, null, many).recent.length === 30);
}

/* ---------- ritmo ---------- */
{
  /* 2026-10-01 e uma quinta. a semana vai de 28/09 (segunda) a 04/10 (domingo) */
  const THU = "2026-10-01";
  const week = weekDays(THU);
  check("semana: segunda a domingo", week[0] === "2026-09-28" && week[6] === "2026-10-04", week.join());
  check("semana: domingo é o fim da própria semana", weekDays("2026-10-04")[0] === "2026-09-28");

  const daily = { n: 1, per: "day", format: "", days: [0, 1, 2, 3, 4, 5, 6] };
  const empty = ruleGap(daily, [], THU);
  check("diário: hoje vazio conta hoje e o resto até domingo", empty.today === 1 && empty.missing === 4, JSON.stringify(empty));
  const covered = ruleGap(daily, [{ date: THU, format: "reels" }], THU);
  check("diário: hoje coberto sai da conta", covered.today === 0 && covered.missing === 3);
  const past = ruleGap(daily, [{ date: "2026-09-28", format: "reels" }], THU);
  check("diário: dia passado vazio não vira cobrança", past.missing === 4, String(past.missing));
  const weekdays = ruleGap({ ...daily, days: [1, 2, 3, 4, 5] }, [], THU);
  check("diário: sem o fim de semana, faltam quinta e sexta", weekdays.missing === 2 && weekdays.days.join() === "2026-10-01,2026-10-02", weekdays.days.join());
  const saturday = ruleGap({ ...daily, days: [1, 2, 3, 4, 5] }, [], "2026-10-03");
  check("diário: sábado fora dos dias não cobra nada", saturday.missing === 0 && saturday.today === 0);
  const two = ruleGap({ ...daily, n: 2 }, [{ date: THU, format: "reels" }], THU);
  check("diário: dia com menos de n peças ainda falta", two.today === 1 && two.missing === 4);

  /* semanal com a semana virando o mes: 28/09 a 04/10 */
  const reels = { n: 3, per: "week", format: "reels", days: [0, 1, 2, 3, 4, 5, 6] };
  const pieces = [
    { date: "2026-09-29", format: "reels" },
    { date: "2026-10-03", format: "reels" },
    { date: "2026-10-03", format: "carousel" },
    { date: "2026-10-06", format: "reels" },
    { date: "", format: "reels" }
  ];
  const wk = ruleGap(reels, pieces, THU);
  check("semanal: conta de segunda a domingo, atravessando o mês", wk.missing === 1, String(wk.missing));
  check("semanal: os dias livres são de hoje em diante, sem reels", wk.days.join() === "2026-10-01,2026-10-02,2026-10-04", wk.days.join());
  check("semanal: peça sem data não conta", ruleGap({ ...reels, n: 1 }, [{ date: "", format: "reels" }], THU).missing === 1);

  check("ritmo zero: nada falta", ruleGap({ ...daily, n: 0 }, [], THU).missing === 0);
  check("ritmo: o próprio nasce com 1 por dia", rulesOf(ME, null).length === 1 && rulesOf(ME, null)[0].n === 1 && rulesOf(ME, null)[0].per === "day");
  check("ritmo: cliente nasce sem ritmo", rulesOf("c1", null).length === 0);
  check("ritmo: zerado é zerado, não volta ao padrão", rulesOf(ME, { id: ME, rules: [] }).length === 0);
  check("ritmo: regra com n zero some", rulesOf(ME, { id: ME, rules: [{ n: 0, per: "day" }] }).length === 0);

  const mineAndClient = [{ date: THU, client: "", format: "reels" }, { date: "2026-10-02", client: "c1", format: "reels" }];
  const g = cadenceGaps(ME, null, mineAndClient, THU);
  check("ritmo: a peça do cliente não cobre o conteúdo próprio", g.active && g.gaps[0].missing === 3, JSON.stringify(g.gaps));
  check("ritmo: semana coberta não tem falta", cadenceGaps(ME, null, weekDays(THU).map((d) => ({ date: d, client: "" })), THU).gaps.length === 0);

  const text = (g) => gapParts(g).map((p) => p.map((x) => x.text || x.strong).join("")).join(" · ");
  check("frase diária", text(empty) === "hoje ainda sem peça · faltam 4 dias nesta semana", text(empty));
  check("frase diária com hoje coberto", text(covered) === "faltam 3 dias nesta semana", text(covered));
  check("frase semanal", text({ per: "week", format: "carousel", missing: 2 }) === "faltam 2 carrosséis nesta semana");
  check("frase semanal no singular", text({ per: "week", format: "reels", missing: 1 }) === "falta 1 reels nesta semana");

  const assigned = assignDays(["a", "b", "c"], { days: ["2026-10-01", "2026-10-02"] }, THU);
  check("preencher: cada ideia ganha o próximo dia vazio", assigned.map((x) => x.date).join() === "2026-10-01,2026-10-02,2026-10-02");
  check("preencher: sem dia vazio, fica hoje", assignDays(["a"], { days: [] }, THU)[0].date === THU);
}

/* ---- o conteúdo no retrato (ticket 13): lateOf e contentToday ----
   o que o Merlin lê do conteúdo: o que falta no ritmo, o que está atrasado e o
   que vem nos próximos 7 dias. nada disso pode carregar o roteiro.
   import por namespace: se uma função ainda não existe, só os testes dela
   falham (com o motivo), e o resto do arquivo continua rodando. */
import * as CS from "./content-script.js";
{
  const { lateOf, contentToday, DEFAULT_RULE, ALL_DAYS } = CS;
  const attempt = (name, fn) => { try { fn(); } catch (e) { failures.push(name + " -> lançou: " + e.message); } };

  /* 2026-10-21 é uma quarta. a semana vai de 19/10 (segunda) a 25/10 (domingo) */
  const TODAY = "2026-10-21";
  let seq = 0;
  const piece = (o) => { seq++; return { id: "p" + seq, title: "peça " + seq, date: "", stage: "idea", format: "reels", client: "", script: "", createdAt: seq, ...o }; };
  const ME_DOC = { id: ME, rules: [DEFAULT_RULE] };
  const day = (n) => { const d = new Date(2026, 9, 21 + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

  /* ---- lateOf: o mesmo resultado da conta que morava na tela ---- */
  attempt("lateOf", () => {
    const old = (c, today) => c.date && c.date < today && c.stage !== "published";
    const cases = [
      { date: "", stage: "idea" },
      { stage: "edit" },
      { date: null, stage: "script" },
      ...["idea", "script", "record", "edit", "scheduled", "published"].map((stage) => ({ date: "2026-10-20", stage })),
      { date: "2026-10-21", stage: "edit" },
      { date: "2026-10-21", stage: "published" },
      { date: "2026-10-22", stage: "idea" },
      { date: "2026-10-22", stage: "published" },
      { date: "2025-12-31", stage: "record" },
      { date: "2026-10-20" }
    ];
    check("lateOf existe", typeof lateOf === "function");
    cases.forEach((c) => check("lateOf igual à conta antiga: " + JSON.stringify(c), !!lateOf(c, TODAY) === !!old(c, TODAY)));
    check("lateOf: ontem em edição está atrasada", !!lateOf({ date: "2026-10-20", stage: "edit" }, TODAY));
    check("lateOf: ontem publicada não está", !lateOf({ date: "2026-10-20", stage: "published" }, TODAY));
    check("lateOf: hoje não está atrasada", !lateOf({ date: TODAY, stage: "edit" }, TODAY));
    check("lateOf: sem data não está atrasada", !lateOf({ date: "", stage: "edit" }, TODAY));
    check("lateOf: a virada do ano", !!lateOf({ date: "2026-12-31", stage: "idea" }, "2027-01-01") && !lateOf({ date: "2027-01-01", stage: "idea" }, "2027-01-01"));
  });

  /* ---- "falta peça esta semana?": o ritmo padrão do próprio ---- */
  attempt("faltas do próprio", () => {
    const r = contentToday([piece({ date: day(2) })], [ME_DOC], TODAY);
    check("hoje: devolve gaps, rhythm, late e next7", ["gaps", "rhythm", "late", "next7"].every((k) => k in r), Object.keys(r).join());
    check("faltas: o próprio com falta gera uma entrada", r.gaps.length === 1 && r.gaps[0].owner === ME, JSON.stringify(r.gaps));
    check("faltas: o próprio chama 'seu conteúdo'", r.gaps[0].who === "seu conteúdo", r.gaps[0].who);
    check("faltas: hoje sem peça e quarta, quinta, sábado e domingo", r.gaps[0].text === "hoje ainda sem peça · faltam 4 dias nesta semana", r.gaps[0].text);
    check("faltas: há ritmo ativo", r.rhythm === true);
  });

  /* o dia que já passou vazio não vira cobrança, e hoje coberto sai da frase */
  attempt("faltas: hoje coberto", () => {
    const r = contentToday([piece({ date: TODAY }), piece({ date: day(2) })], [ME_DOC], TODAY);
    check("faltas: com hoje coberto, só os dias que sobram", r.gaps.length === 1 && r.gaps[0].text === "faltam 3 dias nesta semana", JSON.stringify(r.gaps));
  });

  /* a semana toda coberta: sem falta, mas com ritmo (é o que diz "semana coberta") */
  attempt("semana coberta", () => {
    const pieces = [0, 1, 2, 3, 4].map((n) => piece({ date: day(n) })); // quarta a domingo
    const r = contentToday(pieces, [ME_DOC], TODAY);
    check("coberta: nenhuma falta", r.gaps.length === 0, JSON.stringify(r.gaps));
    check("coberta: mas há ritmo", r.rhythm === true);
  });

  /* ---- ritmo semanal de cliente ---- */
  attempt("ritmo semanal de cliente", () => {
    const docs = [{ id: "c-a", rules: [{ n: 2, per: "week", format: "reels" }] }];
    const nameOf = (id) => ({ "c-a": "Loja A" }[id] || "");
    const pieces = [
      piece({ date: day(1), format: "reels", client: "c-a" }),
      piece({ date: day(2), format: "carousel", client: "c-a" }), // outro formato não conta
      piece({ date: day(2), format: "reels", client: "" }) // peça do próprio não conta para o cliente
    ];
    const r = contentToday(pieces, docs, TODAY, nameOf);
    check("semanal: o cliente com falta gera uma entrada", r.gaps.length === 1 && r.gaps[0].owner === "c-a", JSON.stringify(r.gaps));
    check("semanal: 'Loja A: falta 1 reels'", r.gaps[0].who + ": " + r.gaps[0].text === "Loja A: falta 1 reels nesta semana", r.gaps[0].who + ": " + r.gaps[0].text);
    check("semanal: sem documento do próprio, o próprio não gera falta", !r.gaps.some((g) => g.owner === ME));
    check("semanal: há ritmo ativo", r.rhythm === true);
    const full = contentToday([...pieces, piece({ date: day(3), format: "reels", client: "c-a" })], docs, TODAY, nameOf);
    check("semanal: com as 2 peças, não falta", full.gaps.length === 0 && full.rhythm === true, JSON.stringify(full.gaps));
    const noName = contentToday(pieces, docs, TODAY);
    check("semanal: sem nameOf, o nome é o id", noName.gaps.length === 1 && noName.gaps[0].who === "c-a", JSON.stringify(noName.gaps));
  });

  /* ---- vários donos e várias regras ---- */
  attempt("vários donos", () => {
    const docs = [
      { id: "c-a", rules: [{ n: 1, per: "week", format: "" }] },
      ME_DOC
    ];
    const r = contentToday([], docs, TODAY, (id) => (id === "c-a" ? "Loja A" : ""));
    check("donos: o próprio vem primeiro, mesmo depois na lista", r.gaps.length === 2 && r.gaps[0].owner === ME && r.gaps[1].owner === "c-a", JSON.stringify(r.gaps.map((g) => g.owner)));
    check("donos: o cliente semanal sem formato fala 'peça'", r.gaps[1].text === "falta 1 peça nesta semana", r.gaps[1].text);

    const two = contentToday([], [{ id: ME, rules: [DEFAULT_RULE, { n: 2, per: "week", format: "reels", days: ALL_DAYS }] }], TODAY);
    check("donos: as faltas do mesmo dono vêm numa entrada só, separadas por ' · '",
      two.gaps.length === 1 && two.gaps[0].text === "hoje ainda sem peça · faltam 5 dias nesta semana · faltam 2 reels nesta semana", JSON.stringify(two.gaps));
  });

  /* ---- sem ritmo, sem falta ---- */
  attempt("sem ritmo", () => {
    const pieces = [piece({ date: day(1) })];
    const none = contentToday(pieces, [], TODAY);
    check("sem documento nenhum: nenhuma falta, nem a do próprio", none.gaps.length === 0, JSON.stringify(none.gaps));
    check("sem documento nenhum: sem ritmo", none.rhythm === false);
    const off = contentToday(pieces, [{ id: ME, rules: [] }], TODAY);
    check("próprio com a lista vazia: nenhuma falta", off.gaps.length === 0, JSON.stringify(off.gaps));
    check("próprio com a lista vazia: sem ritmo", off.rhythm === false);
    const zero = contentToday(pieces, [{ id: ME, rules: [{ n: 0, per: "day" }] }], TODAY);
    check("regra com n zero: sem falta e sem ritmo", zero.gaps.length === 0 && zero.rhythm === false, JSON.stringify(zero));
    const noName = contentToday([], [{ id: "c-x", rules: [{ n: 1, per: "week" }] }], TODAY, () => "");
    check("cliente sem nome é pulado", noName.gaps.length === 0, JSON.stringify(noName.gaps));
    const noPieces = contentToday([], [ME_DOC], TODAY);
    check("sem nenhuma peça: nada atrasado, nada nos próximos 7, a semana inteira por cobrir", noPieces.late.length === 0 && noPieces.next7.length === 0 && noPieces.gaps.length === 1);
  });

  /* ---- atrasadas ---- */
  attempt("atrasadas", () => {
    const late = piece({ title: "ontem em edição", date: day(-1), stage: "edit", format: "reels", client: "c-a" });
    const done = piece({ title: "ontem publicada", date: day(-1), stage: "published" });
    const r = contentToday([late, done], [], TODAY);
    check("atrasada: ontem em edição está em late", r.late.length === 1 && r.late[0].id === late.id, JSON.stringify(r.late));
    check("atrasada: a mesma publicada não está", !r.late.some((x) => x.id === done.id));
    check("atrasada: traz id, título, data, etapa e formato em rótulo, e o cliente",
      JSON.stringify(r.late[0]) === JSON.stringify({ id: late.id, title: "ontem em edição", date: day(-1), stage: "editar", format: "Reels", client: "c-a" }), JSON.stringify(r.late[0]));

    const many = [
      piece({ title: "c", date: day(-1) }), piece({ title: "a", date: day(-9) }), piece({ title: "b", date: day(-4) }),
      piece({ title: "hoje", date: TODAY }), piece({ title: "sem data" }), piece({ title: "futura", date: day(3) })
    ];
    const o = contentToday(many, [], TODAY);
    check("atrasadas: ordenadas pela data, as mais velhas primeiro", o.late.map((x) => x.title).join() === "a,b,c", o.late.map((x) => x.title).join());
    check("atrasadas: hoje, sem data e futuro não entram", o.late.length === 3);
    for (const [stage, label] of [["idea", "ideia"], ["script", "roteiro"], ["record", "gravar"], ["edit", "editar"], ["scheduled", "agendado"]]) {
      const x = contentToday([piece({ date: day(-1), stage })], [], TODAY).late[0];
      check("atrasada: a etapa " + stage + " vira '" + label + "'", !!x && x.stage === label, JSON.stringify(x));
    }
    check("atrasada: o formato carrossel vira o rótulo", contentToday([piece({ date: day(-1), format: "carousel" })], [], TODAY).late[0].format === "carrossel");
  });

  /* ---- próximos 7 dias ---- */
  attempt("próximos 7 dias", () => {
    const soon = piece({ title: "daqui a 2", date: day(2), stage: "script", format: "carousel", client: "c-a" });
    const far = piece({ title: "daqui a 9", date: day(9) });
    const r = contentToday([far, soon], [], TODAY);
    check("próximos 7: só a de daqui a 2 entra", r.next7.length === 1 && r.next7[0].id === soon.id, JSON.stringify(r.next7));
    check("próximos 7: traz a etapa em rótulo, o formato em rótulo e o cliente",
      JSON.stringify(r.next7[0]) === JSON.stringify({ id: soon.id, title: "daqui a 2", date: day(2), stage: "roteiro", format: "carrossel", client: "c-a" }), JSON.stringify(r.next7[0]));

    const edge = [
      piece({ title: "hoje", date: day(0), stage: "edit" }),
      piece({ title: "mais 7", date: day(7) }),
      piece({ title: "mais 8", date: day(8) }),
      piece({ title: "ontem", date: day(-1) }),
      piece({ title: "sem data" }),
      piece({ title: "hoje publicada", date: day(0), stage: "published" }),
      piece({ title: "mais 3 publicada", date: day(3), stage: "published" }),
      piece({ title: "mais 5", date: day(5), stage: "scheduled" })
    ];
    const e = contentToday(edge, [], TODAY);
    check("próximos 7: de hoje até hoje+7, inclusive, só as não publicadas, por data", e.next7.map((x) => x.title).join() === "hoje,mais 5,mais 7", e.next7.map((x) => x.title).join());
    check("próximos 7: a etapa de hoje em edição é 'editar'", e.next7[0].stage === "editar" && e.next7[1].stage === "agendado", JSON.stringify(e.next7));
    check("próximos 7: o atrasado não entra aqui", !e.next7.some((x) => x.title === "ontem") && e.late.some((x) => x.title === "ontem"));
    check("próximos 7: a virada do mês", contentToday([piece({ date: "2026-11-02" })], [], "2026-10-28").next7.length === 1 && contentToday([piece({ date: "2026-11-06" })], [], "2026-10-28").next7.length === 0);
  });

  /* ---- o roteiro nunca sai daqui ---- */
  attempt("roteiro", () => {
    const secret = "ROTEIRO-SECRETO-XYZ";
    const script = "# t\n## gancho\n- " + secret;
    const pieces = [
      piece({ title: "atrasada", date: day(-2), stage: "script", script }),
      piece({ title: "da semana", date: day(2), stage: "record", script }),
      piece({ title: "da Loja", date: day(1), client: "c-a", script })
    ];
    const r = contentToday(pieces, [ME_DOC, { id: "c-a", rules: [{ n: 1, per: "day" }] }], TODAY, () => "Loja A");
    check("roteiro: a atrasada e a da semana vieram", r.late.length === 1 && r.next7.length === 2);
    check("roteiro: nenhum campo carrega o roteiro", ![...r.late, ...r.next7].some((x) => "script" in x), JSON.stringify(r.next7[0]));
    check("roteiro: o texto do roteiro não aparece em lugar nenhum do resultado", !JSON.stringify(r).includes(secret));
    check("roteiro: só os campos combinados", [...r.late, ...r.next7].every((x) => Object.keys(x).sort().join() === "client,date,format,id,stage,title"), JSON.stringify(Object.keys(r.next7[0])));
  });

  /* ---- a peça do cliente não cobre o próprio, e a conta não mexe no que recebe ---- */
  attempt("isolamento", () => {
    const pieces = [piece({ date: TODAY, client: "c-a" }), piece({ date: day(1), client: "c-a" })];
    const docs = [ME_DOC];
    const before = JSON.stringify([pieces, docs]);
    const r = contentToday(pieces, docs, TODAY);
    check("isolamento: a peça de cliente não cobre o conteúdo próprio", r.gaps.length === 1 && r.gaps[0].text === "hoje ainda sem peça · faltam 5 dias nesta semana", JSON.stringify(r.gaps));
    check("isolamento: as peças de cliente aparecem nos próximos 7", r.next7.length === 2);
    check("contentToday não altera o que recebe", JSON.stringify([pieces, docs]) === before);
  });
}

console.log("\n" + passed + " passaram, " + failures.length + " falharam");
if (failures.length) { console.log("\nFALHAS:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
