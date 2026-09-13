/* merlin · as tarefas
 *
 * uma colecao so para o que tem data. ate 09/09/2026 havia duas: o documento
 * do dia (`merlin:day`, uma fila de hoje) e a colecao da semana (cartoes com
 * um campo `day`). eram a mesma coisa gravada de dois jeitos, e por isso
 * viviam desencontradas: o cartao da semana virava tarefa do dia por um gesto
 * de "puxar", que CRIAVA uma segunda coisa e deixava um fio (`inDay`) para as
 * duas se reconciliarem. o fio precisava ser costurado nos dois sentidos —
 * concluir no dia fechava o cartao, fechar o cartao fechava a tarefa, apagar
 * de um lado desamarrava o outro — e cada um desses caminhos foi um bug antes
 * de virar codigo.
 *
 * o Arthur pediu que dia e semana fossem sincronizados. a resposta honesta a
 * esse pedido nao e mais reconciliacao: e nao haver duas coisas. uma tarefa
 * tem uma data; o dia e a semana e o mes sao TRES JEITOS DE OLHAR a mesma
 * lista, e nao tres lugares onde ela mora.
 *
 * o que NAO mudou, e e o principio da casa: so o dia tem minutos. a duracao
 * continua sendo cobrada quando a tarefa entra em HOJE — a semana e o mes
 * mostram o que ha, sem prometer que cabe. `min` pode ser zero em qualquer
 * data que nao seja hoje; a visao do dia e a unica que exige o numero, porque
 * e a unica que faz uma conta com ele.
 *
 * sem React e sem pixel aqui: entra documento, sai documento.
 */
import { collection, newId, today, isDay, api, cloud } from "./core.js";

export const MINUTES = 1440;
const CLICKUP_ID = /^[A-Za-z0-9]{1,32}$/;

export const tasks = () => collection("tasks", { normalize });

/* ---------- o documento ---------- */

export function normalize(t) {
  t = t || {};
  const origin = t.origin && typeof t.origin === "object" && t.origin.type && t.origin.id
    ? { type: String(t.origin.type).slice(0, 32), id: String(t.origin.id).slice(0, 64) }
    : null;
  return {
    id: String(t.id),
    title: String(t.title || "").slice(0, 300),
    /* a data e o que substituiu as duas moradas. sem data valida, hoje: um
       documento que chegou torto vira uma tarefa visivel e corrigivel, e nao
       uma tarefa invisivel em lugar nenhum. */
    date: isDay(t.date) ? t.date : today(),
    min: Number.isFinite(+t.min) && +t.min > 0 ? Math.min(Math.round(+t.min), MINUTES) : 0,
    done: !!t.done,
    /* reserva ocupa a janela sem ser trabalho: almoco, reuniao, bloco fixo.
       nao se conclui, nao devolve tempo, nao entra na fila — so encolhe o dia. */
    reserved: !!t.reserved,
    /* id da tarefa no ClickUp, nao a URL: o href se monta na tela, e assim nao
       existe caminho para um "javascript:" entrar por um titulo. */
    clickup: CLICKUP_ID.test(String(t.clickup || "")) ? String(t.clickup) : "",
    client: String(t.client || "").slice(0, 64),
    /* a ordem dentro do dia. e a prioridade — a fila do dia nao tem campo de
       prioridade justamente porque a ordem e ela. */
    order: Number.isFinite(+t.order) ? +t.order : 0,
    /* toda semana de novo. so a origem espalha copia; a copia carrega
       recurringSource e nunca vira, ela mesma, uma nova origem. */
    recurring: !!t.recurring,
    recurringSource: String(t.recurringSource || "").slice(0, 64),
    origin,
    createdAt: +t.createdAt || Date.now(),
    updatedAt: +t.updatedAt || +t.createdAt || Date.now()
  };
}

/* ---------- as tres perguntas que as tres visoes fazem ---------- */

const byOrder = (a, b) => (a.order - b.order) || (a.createdAt - b.createdAt);

/* a fila de um dia, na ordem: aberto primeiro, concluido no fim. e a mesma
   ordenacao para o dia, a coluna da semana e a celula do mes — tres visoes
   que ordenassem diferente seriam tres listas. */
export function onDate(all, date) {
  const list = all.filter((t) => t.date === date);
  return list.filter((t) => !t.done).sort(byOrder)
    .concat(list.filter((t) => t.done).sort((a, b) => a.updatedAt - b.updatedAt));
}

export const inRange = (all, from, to) =>
  all.filter((t) => t.date >= from && t.date <= to).sort(byOrder);

/* o que ficou para tras: aberto, com data anterior a hoje. era a "fila de
   ontem" do dia e os "atrasados" da semana, que eram a mesma pergunta feita
   sobre duas listas diferentes. */
export const overdue = (all, from) =>
  all.filter((t) => !t.done && t.date < (from || today())).sort((a, b) => a.date.localeCompare(b.date) || byOrder(a, b));

/* o documento que a conta do dia (shared/day.js) sabe ler. ela nao precisa
   saber que existe colecao: continua recebendo {tasks, start, end}. */
export const dayDoc = (all, date, prefs) =>
  ({ tasks: onDate(all, date), day: date, start: prefs.dayStart, end: prefs.dayEnd });

/* uma ordem nova para o topo: quem entra fica na frente do que ja estava */
export const topOrder = (all, date) =>
  Math.min(0, ...all.filter((t) => t.date === date).map((t) => t.order)) - 1;

export function newTask(spec) {
  const now = Date.now();
  return normalize({
    id: newId(),
    title: spec.title,
    date: spec.date || today(),
    min: spec.min || 0,
    reserved: !!spec.reserved,
    clickup: spec.clickup || "",
    client: spec.client || "",
    order: Number.isFinite(+spec.order) ? +spec.order : now,
    recurring: !!spec.recurring,
    recurringSource: spec.recurringSource || "",
    origin: spec.origin || null,
    createdAt: now, updatedAt: now
  });
}

/* ---------- a juncao das duas colecoes antigas ----------
   roda antes da primeira pintura e de novo depois que a nuvem responde, como
   a mudanca de nome das ideias. o que ela aprendeu com aquela:

   - o cartao da semana entra por `adopt()`, com o carimbo `v` PRESERVADO. sem
     isso, o aparelho que migrasse por ultimo carregando uma copia velha
     ganharia por ser a gravacao mais recente.
   - a marca de "ja fiz" so e posta quando a fonte esta completa: com sessao,
     depois de a colecao da semana ter baixado.

   e uma coisa que so este caso tem: a tarefa do dia que VEIO de um cartao
   (origin.type === "week") nao vira uma tarefa nova. ela era a copia, e o
   cartao era o original — juntar as duas era exatamente o pedido. o que a
   copia sabia e o cartao nao (a data de quando foi puxada, a duracao que o
   pedagio cobrou, a conclusao) e transferido para o cartao antes de ela ser
   descartada.

   os documentos do dia que estao no servidor sao lidos junto: o dia vivia num
   `merlin:day` por aparelho, e migrar so o deste navegador deixaria para tras
   a fila que ficou no outro. e leitura — nada la e apagado. */

const DONE_KEY = "merlin:merged:tasks";
const WEEKEND = "weekend:";

const dateOfCard = (day) => {
  if (!day) return today();
  if (!String(day).startsWith(WEEKEND)) return isDay(day) ? day : today();
  /* o fim de semana era UMA coluna com a data da segunda. sabado e a primeira
     data real que aquela coluna representava. */
  const monday = String(day).slice(WEEKEND.length);
  if (!isDay(monday)) return today();
  const d = new Date(monday + "T12:00:00");
  d.setDate(d.getDate() + 5);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

/* le o documento do dia como ele foi gravado, sem depender do shared/day.js:
   aqui so interessam as tarefas e de que dia elas eram. */
function readDayDoc(raw) {
  if (!raw || !Array.isArray(raw.tasks)) return null;
  return { day: isDay(raw.day) ? raw.day : today(), tasks: raw.tasks.filter((t) => t && t.title) };
}

function localDayDoc() {
  try { return readDayDoc(JSON.parse(localStorage.getItem("merlin:day"))); }
  catch (e) { return null; }
}

/* junta uma lista de documentos-de-dia com a colecao da semana e devolve o
   que gravar. funcao pura: e por isso que da para testar sem navegador. */
export function mergeInto(weekEntries, dayDocs) {
  const adopted = [];   // cartoes, com o carimbo preservado
  const saved = [];     // tarefas que vieram do documento do dia
  const byCard = new Map();

  (weekEntries || []).forEach((e) => {
    const c = e.doc;
    if (!c || c.deleted || !c.title) return;
    const task = {
      id: c.id, title: String(c.title), date: dateOfCard(c.day),
      min: +c.min || 0, done: !!c.done, reserved: false,
      clickup: "", client: c.client || "",
      order: Number.isFinite(+c.order) ? +c.order : (+c.createdAt || 0),
      recurring: !!c.recurring, recurringSource: c.recurringSource || "",
      origin: c.origin || null,
      createdAt: +c.createdAt || Date.now(), updatedAt: +c.updatedAt || Date.now(),
      v: e.v
    };
    byCard.set(c.id, task);
    adopted.push(task);
  });

  (dayDocs || []).forEach((doc) => {
    doc.tasks.forEach((t) => {
      const from = t.origin && t.origin.type === "week" ? byCard.get(t.origin.id) : null;
      if (from) {
        /* a copia devolve ao original o que soube enquanto esteve no dia */
        from.date = doc.day;
        if (t.min) from.min = t.min;
        if (t.done) from.done = true;
        return;
      }
      saved.push({
        id: String(t.id || newId()), title: String(t.title), date: doc.day,
        min: +t.min || 0, done: !!t.done, reserved: !!t.reserved,
        clickup: String(t.clickup || ""), client: String(t.client || ""),
        /* a fila do dia era uma ORDEM, e nao um numero gravado: a posicao no
           array era a prioridade. ela vira o campo `order` aqui, e e o unico
           lugar do sistema onde isso precisa ser traduzido. */
        order: doc.tasks.indexOf(t),
        recurring: false, recurringSource: "",
        origin: t.origin && t.origin.type !== "week" ? t.origin : null,
        createdAt: Date.now(), updatedAt: Date.now()
      });
    });
  });

  return { adopted, saved };
}

export function migrateTasks(complete) {
  try { if (localStorage.getItem(DONE_KEY)) return; } catch (e) { return; }
  const week = collection("week");
  const entries = week.entries();
  const docs = [];
  const local = localDayDoc();
  if (local) docs.push(local);

  const store = tasks();
  writeMerged(store, mergeInto(entries, docs));

  /* a marca so e posta quando a fonte esta completa. com sessao, isso e
     depois de a semana ter baixado — e depois de os dias do servidor terem
     sido lidos, o que acontece uma vez, na passada completa. */
  if (!complete) return;
  if (cloud.signedIn && !week.hasDownloaded()) return;
  if (cloud.signedIn) { pullServerDays().catch(() => {}); return; }
  try { localStorage.setItem(DONE_KEY, String(adopted.length + saved.length)); } catch (e) {}
}

/* a migracao roda mais de uma vez antes de se dar por encerrada (uma antes da
   primeira pintura, outra depois da nuvem). o `adopt` ja se protege sozinho —
   ele recusa carimbo que nao seja maior —, mas o `save` nao: uma tarefa que
   voce editou entre uma passada e outra seria reescrita com o texto original.
   por isso o que ja existe aqui nao e tocado de novo. */
function writeMerged(store, { adopted, saved }) {
  const fresh = saved.filter((t) => !store.has(t.id)).map(normalize);
  if (adopted.length) store.adopt(adopted);
  if (fresh.length) store.saveMany(fresh);
  return adopted.length + fresh.length;
}

/* os dias que ficaram no servidor, de todos os aparelhos. so leitura: os
   documentos continuam la, e e por isso que esta migracao nao tem volta a dar
   — nada foi apagado do outro lado. */
async function pullServerDays() {
  try { if (localStorage.getItem(DONE_KEY)) return; } catch (e) { return; }
  const r = await api("/days?since=0", { method: "GET" });
  if (!r.ok) return;                       /* tenta de novo na proxima abertura */
  const docs = (r.body.days || []).map((d) => readDayDoc(d.doc)).filter(Boolean);
  const n = writeMerged(tasks(), mergeInto(collection("week").entries(), docs));
  try { localStorage.setItem(DONE_KEY, String(n)); } catch (e) {}
}
