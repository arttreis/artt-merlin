/* merlin · o miolo do time, sem tela
   a coleção `team` é um documento por pessoa (PRD meu-negocio, D5):
   `{id, name, role, cost, since, next, deliveries: [{id, day, text}],
   archived, fixed}`. `cost` é em centavos por mês (0 = sem custo), `next` é a
   próxima conversa e `fixed` é o id do fixo de saída no caixa da empresa,
   quando a pessoa foi lançada lá.

   cadastro leve, não vigilância: só o que o dono anota. sem horas, ponto,
   ranking, avaliação nem login. "saiu do time" arquiva e mantém as entregas.
   nome e custo de cada um nunca vão ao retrato por nome (o T6 manda só a
   contagem e o total).

   quem grava são duas portas: a aba (team.jsx) e a caixa da conversa
   (assistant-actions.js, `team-add` e `team-delivery`). as duas passam por
   `personDoc` e `addDelivery`, para a regra ser uma só. */
import { newId, isDay, foldKey, brl } from "./core.js";

export const NAME_MAX = 80;
export const ROLE_MAX = 40;
export const TEXT_MAX = 140;

const clean = (s, max) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, max).trim();
const cents = (v) => Math.round(Math.abs(+v)) || 0;

/* o papel como se diz na tela, curto: "a Ana entra como designer" é design.
   o que não está aqui fica como foi escrito ("sócio") */
const SAID = {
  designer: "design", desenho: "design", design: "design",
  dev: "dev", developer: "dev", desenvolvedor: "dev", desenvolvedora: "dev", programador: "dev", programadora: "dev",
  vendas: "vendas", vendedor: "vendas", vendedora: "vendas", comercial: "vendas",
  suporte: "suporte", atendimento: "suporte", atendente: "suporte",
  freela: "freela", freelancer: "freela"
};
export const roleOf = (v) => SAID[foldKey(v)] || clean(v, ROLE_MAX);

function normalizeDelivery(x) {
  if (!x || !isDay(x.day)) return null;
  const text = clean(x.text, TEXT_MAX);
  return text ? { id: String(x.id || newId()), day: x.day, text } : null;
}

export function normalize(d) {
  return {
    id: String(d.id || ""),
    name: clean(d.name, NAME_MAX),
    role: clean(d.role, ROLE_MAX),
    cost: cents(d.cost),
    since: isDay(d.since) ? d.since : "",
    next: isDay(d.next) ? d.next : "",
    deliveries: (Array.isArray(d.deliveries) ? d.deliveries : []).map(normalizeDelivery).filter(Boolean),
    archived: !!d.archived,
    fixed: String(d.fixed || ""),
    createdAt: +d.createdAt || Date.now(),
    updatedAt: +d.updatedAt || +d.createdAt || Date.now()
  };
}

const active = (list) => (list || []).filter((p) => p && p.id && !p.deleted && !p.archived);

/* quem está no time hoje, por nome */
export const activeTeam = (list) => active(list).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));

/* o custo do time por mês: quem saiu não conta */
export const teamTotal = (list) => active(list).reduce((s, p) => s + cents(p.cost), 0);

/* a pessoa dita pelo nome, sem acento e sem caixa: "ana" acha "Ana". sem
   ninguém com o nome inteiro, vale o primeiro nome, se só uma pessoa o tiver
   ("ana" acha "Ana Souza"); duas Anas é ambíguo, e a caixa pede para escolher */
export function findPerson(list, name) {
  const k = foldKey(name);
  if (!k) return null;
  const people = active(list);
  const exact = people.find((p) => foldKey(p.name) === k);
  if (exact) return exact;
  const first = people.filter((p) => foldKey(String(p.name).split(" ")[0]) === k);
  return first.length === 1 ? first[0] : null;
}

/* "R$ 3.000/mês"; sem custo, nada */
export const costLabel = (c) => (cents(c) ? brl(cents(c)).replace(/,00$/, "") + "/mês" : "");

/* "Ana · design · R$ 3.000/mês": a linha da lista e a da confirmação */
export const personLine = (p) => [p.name, p.role, costLabel(p.cost)].filter(Boolean).join(" · ");

/* a pessoa pronta para gravar, ou o erro que a tela mostra. com `before`
   (a pessoa que se corrige), mantém o id, as entregas, o arquivo e o fixo */
export function personDoc(spec, before, now = Date.now()) {
  const s = spec || {};
  const name = clean(s.name, NAME_MAX);
  if (!name) return { error: "qual é o nome?" };
  const b = before || null;
  return { doc: {
    id: b ? b.id : newId(),
    name,
    role: roleOf(s.role),
    cost: cents(s.cost),
    since: isDay(s.since) ? s.since : "",
    next: isDay(s.next) ? s.next : "",
    deliveries: b && Array.isArray(b.deliveries) ? b.deliveries : [],
    archived: b ? !!b.archived : false,
    fixed: b ? String(b.fixed || "") : "",
    createdAt: b && b.createdAt ? b.createdAt : now,
    updatedAt: now
  } };
}

/* uma entrega anotada: o que e quando. o dia que ainda não chegou não se
   anota, como no resto do Merlin */
export function addDelivery(person, spec, today) {
  const s = spec || {};
  const day = isDay(s.date) ? s.date : today;
  if (day > today) return { error: "esse dia ainda não chegou" };
  const text = clean(s.text, TEXT_MAX);
  if (!text) return { error: "o que foi entregue?" };
  const list = Array.isArray(person.deliveries) ? person.deliveries : [];
  return { doc: { ...person, deliveries: [...list, { id: newId(), day, text }], updatedAt: Date.now() } };
}

/* da mais nova para a mais antiga; no mesmo dia, a anotada por último primeiro */
export const deliveriesOf = (p) => (p.deliveries || []).map((d, i) => [d, i])
  .sort((a, b) => b[0].day.localeCompare(a[0].day) || b[1] - a[1]).map(([d]) => d);

/* "Ana · landing", com o dia no fim só quando não é hoje */
export const deliveryLine = (p, d, today) =>
  [p.name, d.text, d.day && d.day !== today ? d.day.slice(8, 10) + "/" + d.day.slice(5, 7) : ""].filter(Boolean).join(" · ");

/* "saiu do time": arquiva, e as entregas ficam */
export const archivePerson = (p) => ({ ...p, archived: true, updatedAt: Date.now() });

/* o custo vira um fixo de saída no caixa da empresa (D5). dia 5 porque é
   quando a maioria paga; muda-se na aba fixos do caixa. "Outros" porque as
   categorias da empresa não têm uma para gente, e o nome já diz quem é */
export const fixedFor = (p, before) => ({
  id: (before && before.id) || newId(),
  type: "fixed",
  book: "business",
  name: p.name + (p.role ? " · " + p.role : ""),
  amount: cents(p.cost),
  kind: "out",
  category: "Outros",
  dayOfMonth: (before && before.dayOfMonth) || 5,
  active: true
});

/* ---------- gravar ----------
   a aba e a caixa da conversa gravam pelas mesmas duas funções, e as duas
   devolvem a linha da confirmação e o desfazer. `team` é a coleção do time e
   `cash` o livro da empresa já aberto (bookCollection), nunca a coleção crua */

/* a pessoa nova no time e, com `launch` e custo, o fixo dela no caixa:
   "no time · Ana · design · R$ 3.000/mês". o desfazer apaga os dois */
export function joinTeam(team, cash, doc, launch) {
  const fx = launch && doc.cost ? fixedFor(doc) : null;
  const saved = fx ? { ...doc, fixed: fx.id } : doc;
  team.save(saved);
  if (fx) cash.save(fx);
  return {
    doc: saved,
    line: personLine(saved),
    undo: () => { team.remove(saved.id); if (fx) cash.remove(fx.id); }
  };
}

/* a entrega anotada (o `doc` do addDelivery): "Ana · landing". a pessoa que
   nasceu com ela (o "novo no time" da conversa) some no desfazer; a que já
   existia volta a ser como era */
export function noteDelivery(team, doc, today) {
  const before = team.get(doc.id);
  team.save(doc);
  const last = doc.deliveries[doc.deliveries.length - 1];
  return {
    line: deliveryLine(doc, last, today),
    undo: () => { if (before) team.save({ ...before, updatedAt: Date.now() }); else team.remove(doc.id); }
  };
}
