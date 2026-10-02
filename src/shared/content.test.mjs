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

console.log("\n" + passed + " passaram, " + failures.length + " falharam");
if (failures.length) { console.log("\nFALHAS:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
