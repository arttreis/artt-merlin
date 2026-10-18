/* merlin · o retrato
 *
 * a pergunta feita ao Merlin chegava sabendo só o dia de hoje (o `briefOf` do
 * início) ou só a tela de onde veio. "o que tenho quinta?" não tinha resposta,
 * e "continuar na conversa" chegava sem contexto nenhum. o retrato é o resumo
 * das áreas que vai junto de TODA pergunta (PRD da secretária, D8): montado
 * no navegador, das coleções da própria pessoa, na hora da pergunta, e nunca
 * guardado. o Worker não lê documento nenhum para isso (o teste 13d vale).
 *
 * a janela é de 30 dias para trás e 7 para frente. cada seção tem um
 * orçamento de caracteres e corta por item inteiro, terminando em "e mais N";
 * o texto todo não passa de PORTRAIT_MAX, que é o mesmo teto do Worker.
 *
 * o que NUNCA entra: contatos, cofre, arquivos, contratos, diário do cliente,
 * corpo das notas, roteiros, dívidas e investimentos (das notas, só o título, o
 * estágio e a data). do cliente, só o nome
 * (e do lead, a etapa, os dias e o próximo passo).
 *
 * a lista SECTIONS é o ponto de composição: uma seção nova (o dinheiro, os
 * clientes, o conteúdo) é uma linha a mais nela.
 *
 * sem React e sem coleção aberta aqui: entra lista, sai texto. quem abre as
 * coleções é a tela (useCollection), e `portraitData` só lê o que ela abriu.
 */
import { dayDoc, dayTasks, overdue, inRange } from "./tasks.js";
import { budget as budgetOf, doneOf, reservesOf, fmt, clock } from "./day.js";
import { focusMinutes, meetingMinutes } from "./focus.js";
import { pipelineToday } from "./client-doc.js";
import { contentToday } from "./content-script.js";
import { normalize as normalizeHabit, isExpected, monthStats, streakOf as habitStreak, weekProgress } from "./habits-data.js";

export const PORTRAIT_MAX = 6000;
const BACK = 30;
const AHEAD = 7;
const LOADING = "ainda carregando";
/* os estágios da nota, como a tela das notas os chama (arquivada não entra) */
const NOTE_STAGE = { seed: "semente", exploring: "explorando", defined: "definida", executing: "executando" };

/* as fontes que a resposta pode citar: a lista fechada que o Worker filtra */
export const SOURCES = ["dia", "agenda", "rotina", "semana", "dinheiro", "clientes", "leads", "conteúdo", "hábitos", "notas", "produtos"];

/* ---------- datas, sem o core ---------- */

const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const pad = (n) => String(n).padStart(2, "0");
const dayOf = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const dateOf = (day) => { const [y, m, d] = day.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (day, n) => { const d = dateOf(day); d.setDate(d.getDate() + n); return dayOf(d); };
const dayLabel = (day) => { const d = dateOf(day); return WEEKDAY[d.getDay()] + " " + pad(d.getDate()) + "/" + pad(d.getMonth() + 1); };
const shortDate = (day) => day.slice(8, 10) + "/" + day.slice(5, 7);

/* o nome de cliente e de lead é digitado por gente: sem quebra de linha, para
   que não vire uma linha a mais do retrato */
const nameOf = (v) => String(v || "").replace(/\s+/g, " ").trim() || "sem nome";

/* zero é "0m" aqui, e não o "—" da tela: o Merlin lê texto, não traço */
const dur = (min) => (min ? fmt(min) : "0m");

/* do cliente, só o nome. a tarefa guarda o id; sem cliente achado, o texto
   que estiver no campo (o que veio do ClickUp, por exemplo) */
function clientOf(id, clients) {
  if (!id) return "";
  const c = clients.find((x) => x && (x.id === id || x.name === id));
  return c ? String(c.name || "") : String(id);
}
const at = (t) => (t.at != null ? clock(t.at) + " " : "");
const withClient = (id, clients) => { const n = clientOf(id, clients); return n ? " · @" + n : ""; };

/* os dias de um bloco da rotina: corrida seguida vira "seg–sex", a semana
   inteira vira "todo dia", o resto vai solto. a semana começa na segunda */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export function daysLabel(days) {
  const set = new Set(days);
  if (set.size === 7) return "todo dia";
  const runs = [];
  WEEK_ORDER.forEach((d, i) => {
    if (!set.has(d)) return;
    const last = runs[runs.length - 1];
    if (last && last.end === i - 1) last.end = i; else runs.push({ start: i, end: i });
  });
  return runs.map((r) => {
    const a = WEEKDAY[WEEK_ORDER[r.start]], b = WEEKDAY[WEEK_ORDER[r.end]];
    return r.end - r.start >= 2 ? a + "–" + b : r.end > r.start ? a + ", " + b : a;
  }).join(", ");
}

/* a sequência de dias fechados, como a do início: hoje ainda aberto não
   quebra a conta */
function streakOf(closes, day) {
  const closed = new Set(closes.map((c) => c && c.id));
  let n = 0;
  let d = closed.has(day) ? day : addDays(day, -1);
  while (closed.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

/* ---------- as seções ----------
   cada uma: {id, label, budget, max?, needs, build(data, now) -> linhas}.
   `needs` são as coleções sem as quais a seção diria "nada" sem saber;
   `max` é quantos itens entram antes de o resto virar "e mais N". */
export const SECTIONS = [
  {
    id: "today", label: "hoje", budget: 1200, needs: ["tasks"],
    build({ tasks, routine, clients, prefs }, now) {
      const day = dayOf(now);
      /* a sobra é a das três telas (tasks.js, dayTasks): a cópia da rotina
         conta, mesmo quando o calendário não a mostra (D11, uma sobra só) */
      const doc = dayDoc(dayTasks(tasks, routine).count, day, prefs);
      const b = budgetOf(doc, undefined, now.getHours() * 60 + now.getMinutes());
      const slack = b.overtime ? "o dia já acabou" : b.slack >= 0 ? "cabem " + dur(b.slack) : "passa " + dur(b.overflow) + " do que cabe";
      const lines = ["agora " + clock(now.getHours() * 60 + now.getMinutes()) + " · janela " + clock(doc.start) + "–" + clock(doc.end) + " · " + slack];
      const from = addDays(day, -BACK);
      const late = overdue(tasks, day).filter((t) => t.date >= from);
      if (late.length) lines.push("atrasadas: " + late.length + " · " + late.slice(0, 5).map((t) => t.title + " (" + shortDate(t.date) + ")").join("; "));
      reservesOf(doc).filter((t) => !t.done).sort((x, y) => (x.at ?? 1e4) - (y.at ?? 1e4))
        .forEach((t) => lines.push("compromisso: " + at(t) + t.title + (t.min ? " · " + fmt(t.min) : "") + withClient(t.client, clients)));
      if (!b.open.length) lines.push("fila aberta: nada");
      b.open.forEach((t) => lines.push("aberta: " + at(t) + t.title + " · " + (t.min ? fmt(t.min) : "sem duração") + withClient(t.client, clients)));
      doneOf(doc).forEach((t) => lines.push("feita: " + t.title));
      return lines;
    }
  },
  {
    id: "agenda", label: "agenda dos próximos 7 dias (a rotina vem à parte)", budget: 1600, needs: ["tasks"],
    build({ tasks, clients }, now) {
      const day = dayOf(now);
      /* a cópia da rotina só existe na semana aberta; contá-la aqui faria a
         quinta desta semana ter a daily e a da próxima não. a rotina inteira
         vai na seção dela */
      const ahead = inRange(tasks, addDays(day, 1), addDays(day, AHEAD))
        .filter((t) => !t.done && !(t.origin && t.origin.type === "routine"));
      const lines = [];
      for (let i = 1; i <= AHEAD; i++) {
        const d = addDays(day, i);
        const list = ahead.filter((t) => t.date === d);
        const label = dayLabel(d);
        list.filter((t) => t.at != null).sort((x, y) => x.at - y.at)
          .forEach((t) => lines.push(label + " " + clock(t.at) + " " + t.title + (t.min ? " · " + fmt(t.min) : "") + withClient(t.client, clients)));
        const loose = list.filter((t) => t.at == null);
        if (loose.length) lines.push(label + " · " + loose.length + " sem hora: " + loose.slice(0, 3).map((t) => t.title).join("; "));
      }
      return lines.length ? lines : ["nada nos próximos 7 dias"];
    }
  },
  {
    id: "routine", label: "rotina", budget: 600, max: 12, needs: ["routine"],
    build({ routine, clients }, now) {
      const day = dayOf(now);
      const lines = routine.filter((b) => b && b.days && b.days.length && (!b.until || b.until > day))
        .sort((x, y) => (x.at ?? 1e4) - (y.at ?? 1e4))
        .map((b) => [b.title, daysLabel(b.days), b.at != null ? clock(b.at) : "", b.min ? fmt(b.min) : ""].filter(Boolean).join(" · ") + withClient(b.client, clients));
      return lines.length ? lines : ["nenhum bloco"];
    }
  },
  {
    id: "week", label: "semana", budget: 250, needs: ["sessions", "tasks", "closes"],
    build({ tasks, sessions, closes, profile }, now) {
      const day = dayOf(now);
      const me = profile || {};
      const streak = streakOf(closes, day);
      return [
        "foco " + dur(focusMinutes(sessions, day, now.getTime())) + (+me.focusGoal ? " de " + me.focusGoal + "h" : "") +
        " · reunião " + dur(meetingMinutes(tasks, day)) + (+me.meetingCap ? " (teto " + me.meetingCap + "h)" : "") +
        " · " + streak + (streak === 1 ? " dia fechado" : " dias fechados seguidos")
      ];
    }
  },
  {
    id: "products", label: "produtos", budget: 200, max: 5, needs: ["apps"],
    build({ apps }) {
      const names = apps.map((a) => String((a && a.name) || "").trim()).filter(Boolean);
      return names.length ? names : ["nenhum"];
    }
  },
  /* os leads e os clientes dividem 500 caracteres, com os rótulos: 250 + 230
     de texto, mais os rótulos e a linha em branco. as contas
     (parado, atrasado, sem registro) moram em client-doc.js (pipelineToday) */
  {
    id: "leads", label: "leads", budget: 250, needs: ["clients"],
    build({ clients }, now) {
      const p = pipelineToday(clients, dayOf(now), now.getTime());
      if (!p.stages.some((s) => s.count)) return ["nenhum lead no funil · abra a prospecção para cadastrar"];
      return [
        "etapas: " + p.stages.filter((s) => s.count).map((s) => s.label + " " + s.count).join(" · "),
        ...p.late.map((c) => "contato atrasado: " + nameOf(c.name) + " · " + shortDate(c.nextDate)),
        ...p.stuck.map((c) => "parado: " + nameOf(c.name) + " · " + c.label + " · " + c.days + "d"),
        ...p.noNext.map((c) => "sem próximo passo: " + nameOf(c.name))
      ];
    }
  },
  {
    id: "clients", label: "clientes", budget: 230, needs: ["clients"],    build({ clients }, now) {
      const day = dayOf(now);
      const p = pipelineToday(clients, day, now.getTime());
      /* o vencido de antes da janela de 30 dias não entra, como nas tarefas */
      const from = addDays(day, -BACK);
      const lines = [
        ...p.stale.map((c) => "sem registro há 14+ dias: " + nameOf(c.name) + " · " + c.days + "d"),
        ...p.backlog.filter((b) => b.due >= from).map((b) =>
          "backlog " + (b.when === "overdue" ? "vencido " + shortDate(b.due) : b.when === "today" ? "hoje" : dayLabel(b.due)) +
          ": " + nameOf(b.client) + " · " + nameOf(b.text))
      ];
      return lines.length ? lines : ["nada pendente nos clientes"];
    }
  },
  {
    /* o roteiro nunca entra: da peça, só o título, o dia, a etapa e o formato.
       a falta do ritmo só aparece para quem gravou um ritmo (contentToday) */
    id: "content", label: "conteúdo", budget: 300, needs: ["content", "cadence", "clients"],
    build({ content, cadence, clients }, now) {
      const day = dayOf(now);
      const named = (id) => { const c = clients.find((x) => x && x.id === id); return c ? String(c.name || "") : ""; };
      const c = contentToday(content, cadence, day, named);
      const lines = c.gaps.map((g) => g.who + ": " + g.text);
      if (c.rhythm && !c.gaps.length) lines.push("semana coberta");
      if (c.late.length) {
        /* os títulos entram inteiros e só até a linha encher: o resto vira o número */
        let titles = "";
        for (const p of c.late.slice(0, 3)) {
          const next = (titles ? titles + "; " : "") + p.title + " (" + shortDate(p.date) + ")";
          if (next.length > 120) break;
          titles = next;
        }
        lines.push("atrasadas: " + c.late.length + (titles ? " · " + titles : ""));
      }
      c.next7.forEach((p) => lines.push(dayLabel(p.date) + " " + p.title + " · " + p.stage + " · " + p.format));
      if (!lines.length) return [content.length ? "nada marcado nos próximos 7 dias" : "sem conteúdo ainda"];
      return lines;
    }
  },
  {
    /* uma linha por hábito: hoje, o mês e a sequência. as contas são as da
       tela dos hábitos (habits-data.js), com a taxa que nunca passa de 100% */
    id: "habits", label: "hábitos", budget: 170, needs: ["habits"],
    build({ habits }, now) {
      const day = dayOf(now);
      const list = habits.filter((h) => h && h.id).map(normalizeHabit).filter((h) => !h.archived)
        .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
      if (!list.length) return ["nenhum hábito ainda (criar: o botão + em hábitos)"];
      return list.map((h) => {
        const perWeek = h.schedule.type === "perWeek";
        const w = perWeek ? weekProgress(h, day) : null;
        const hoje = perWeek
          ? (w.done >= w.goal ? "semana completa" : "falta " + (w.goal - w.done) + " de " + w.goal + " nesta semana")
          : isExpected(h, day) ? (h.marks[day] ? "hoje feito" : "hoje falta") : "";
        const m = monthStats(h, day.slice(0, 7), day);
        return [h.name, hoje, "mês " + m.done + "/" + m.expected + " " + m.rate + "%", "seq " + habitStreak(h, day) + (perWeek ? "sem" : "d")].filter(Boolean).join(" · ");
      });
    }
  },
  {
    /* só o título, o estágio e a data da última mudança: o corpo, os passos e
       os anexos nunca entram. as 8 mais recentes, sem as arquivadas */
    id: "notes", label: "notas", budget: 130, max: 8, needs: ["notes"],
    build({ notes }) {
      const stamp = (n) => +n.updatedAt || +n.createdAt || 0;
      const lines = notes.filter((n) => n && n.stage !== "archived").sort((a, b) => stamp(b) - stamp(a))
        .map((n) => {
          const title = String(n.title || "").replace(/\s+/g, " ").trim() || "sem título";
          return title + " · " + (NOTE_STAGE[n.stage] || NOTE_STAGE.seed) + (stamp(n) ? " · " + shortDate(dayOf(new Date(stamp(n)))) : "");
        });
      return lines.length ? lines : ["nenhuma nota ainda"];
    }
  }
];

/* ---------- o corte ----------
   entra item inteiro ou não entra: o título cortado no meio é pior que o
   título que não veio, porque o Merlin o lê como se fosse o nome. `hidden` são
   os que já ficaram de fora antes (o `max` da seção) */
export function fit(items, budget, hidden = 0) {
  const total = items.length + hidden;
  let text = "", k = 0;
  for (; k < items.length; k++) {
    const next = (text ? text + "\n" : "") + items[k];
    const rest = total - k - 1;
    if ((next + (rest ? "\ne mais " + rest : "")).length > budget) break;
    text = next;
  }
  if (k < total) text = (text ? text + "\n" : "") + "e mais " + (total - k);
  return text;
}

const EMPTY = { tasks: [], routine: [], sessions: [], apps: [], closes: [], clients: [], content: [], cadence: [], habits: [], notes: [], profile: null, loading: [] };
const DEFAULT_WINDOW = { dayStart: 540, dayEnd: 1140 };

export function portraitOf(data, now = new Date()) {
  const d = { ...EMPTY, ...(data || {}) };
  d.prefs = { ...DEFAULT_WINDOW, ...(d.prefs || {}) };
  const loading = new Set(d.loading || []);
  const sections = [];
  let used = 0;
  for (const s of SECTIONS) {
    const head = s.label + ":\n";
    const gap = sections.length ? 2 : 0;
    const room = Math.min(s.budget, PORTRAIT_MAX - used - gap - head.length);
    /* sem espaço para nem um item, a seção não vai: melhor ausente que vazia */
    if (room < 20) continue;
    const isLoading = s.needs.some((n) => loading.has(n));
    let text;
    if (isLoading) text = LOADING;
    else {
      const items = s.build(d, now);
      const shown = s.max ? items.slice(0, s.max) : items;
      text = fit(shown, room, items.length - shown.length);
    }
    sections.push({ id: s.id, label: s.label, text, loading: isLoading });
    used += gap + head.length + text.length;
  }
  return { text: sections.map((s) => s.label + ":\n" + s.text).join("\n\n"), sections };
}

/* ---------- da tela para o retrato ----------
   `cols` são as coleções que a tela já abriu com useCollection. com sessão, a
   que ainda não desceu da nuvem entra em `loading`, e a seção dela diz "ainda
   carregando" em vez de "nada" — num aparelho novo, as duas coisas parecem
   iguais e só uma é verdade */
export function portraitData(cols, { signedIn, prefs } = {}) {
  const list = (c) => (c ? c.all() : []);
  return {
    tasks: list(cols.tasks),
    routine: list(cols.routine),
    sessions: list(cols.sessions),
    apps: list(cols.apps),
    closes: list(cols.closes),
    clients: list(cols.clients),
    content: list(cols.content),
    cadence: list(cols.cadence),
    habits: list(cols.habits),
    notes: list(cols.notes),
    profile: cols.profile ? cols.profile.get("me") : null,
    prefs,
    loading: signedIn ? Object.keys(cols).filter((k) => cols[k] && !cols[k].hasDownloaded()) : []
  };
}

/* espera a primeira descida, por no máximo `ms`. a coleção aberta depois da
   sincronização da página não desce sozinha até a aba voltar a ficar
   visível: aqui ela ganha o empurrão */
export function waitPortrait(cols, signedIn, ms = 5000) {
  const all = Object.values(cols).filter(Boolean);
  if (!signedIn || all.every((c) => c.hasDownloaded())) return Promise.resolve();
  all.forEach((c) => { if (!c.hasDownloaded()) Promise.resolve(c.sync && c.sync()).catch(() => {}); });
  const t0 = Date.now();
  return new Promise((done) => {
    const tick = () => (all.every((c) => c.hasDownloaded()) || Date.now() - t0 >= ms ? done() : setTimeout(tick, 100));
    tick();
  });
}

/* "vi o dia e a agenda": a linha discreta embaixo da resposta */
const ARTICLE = { dia: "o", agenda: "a", rotina: "a", semana: "a", dinheiro: "o", clientes: "os", leads: "os", "conteúdo": "o", "hábitos": "os", notas: "as", produtos: "os" };
export function sourcesLine(list) {
  const named = (Array.isArray(list) ? list : []).filter((s) => SOURCES.includes(s)).map((s) => ARTICLE[s] + " " + s);
  if (!named.length) return "";
  return "vi " + (named.length === 1 ? named[0] : named.slice(0, -1).join(", ") + " e " + named[named.length - 1]);
}
