/* merlin · sessões de foco, meta de horas e teto de reunião (VISAO, 11)
 *
 * a sessão é o tempo de verdade em cima de uma tarefa: começa no rastreador
 * (ou no início), termina com um recibo que compara o que levou com o que
 * você estimou. é o que o Merlin tem de diferente de um cronômetro: a
 * estimativa é o que faz a sobra do dia ser honesta, e a sessão é o que diz
 * se ela estava certa.
 *
 * uma sessão: {id, task, title, start, end, planned} — `end` nulo é a que está
 * rodando. só existe uma rodando por vez.
 *
 * a semana tem duas contas: as horas de foco (a soma das sessões) contra a
 * meta, e as horas de reunião (as reservas do calendário com cara de reunião)
 * contra o teto. o teto é um limite, não uma meta: a semana boa fica abaixo.
 *
 * sem React e sem localStorage aqui: entra lista, sai número. */

/* a mesma lista de cerimônias que faz "reunião" virar reserva (tasks.js) */
const MEETING_RE = /^(?:reuni[ãa]o|call|daily|weekly|monthly|stand ?-?up|planning|refinement|retro(?:spectiva)?|kick ?-?off|alinhamento|mentoria|1:1|1x1)\b/i;
export const isMeeting = (t) => !!t && !!t.reserved && MEETING_RE.test(String(t.title || "").trim());

export const runningOf = (sessions) => sessions.find((s) => s && !s.end) || null;

/* começar e parar moravam duas vezes, no início e no rastreador, e desde
   18/10/2026 o cartão do "o que falta hoje?" é a terceira porta (a secretária,
   D6). recebem a coleção (só `all` e `save`), e não a lista, porque gravar é o
   ponto: começar uma encerra a que estava rodando, e nunca há duas sem `end`.
   o id não vem do core.js para este arquivo continuar sem navegador. */
const sessionId = (at) => "s" + at.toString(36) + Math.random().toString(36).slice(2, 7);

export function stopSession(sessions, now) {
  const cur = runningOf(sessions.all());
  if (!cur) return null;
  const at = now || Date.now();
  const done = { ...cur, end: at, updatedAt: at };
  sessions.save(done);
  return done;
}

export function startSession(sessions, task, now) {
  const at = now || Date.now();
  stopSession(sessions, at);
  const s = { id: sessionId(at), task: task.id, title: task.title, start: at, end: null, planned: task.min || 0, createdAt: at, updatedAt: at };
  sessions.save(s);
  return s;
}

/* minutos de uma sessão; a que está rodando conta até agora */
export const minutesOf = (s, now) => Math.max(0, Math.round(((s.end || now || Date.now()) - s.start) / 60000));

/* a semana começa no domingo, como o calendário: [inicio, fim) em epoch ms */
export function weekBounds(day) {
  const [y, m, d] = day.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return [start.getTime(), end.getTime()];
}

/* foco da semana, em minutos: o que terminou dentro dela e a que roda agora */
export function focusMinutes(sessions, day, now) {
  const [a, b] = weekBounds(day);
  return sessions.filter((s) => s && s.start >= a && s.start < b).reduce((sum, s) => sum + minutesOf(s, now), 0);
}

/* reunião da semana, em minutos: as reservas com cara de reunião, por data */
export function meetingMinutes(tasks, day) {
  const [a, b] = weekBounds(day);
  return tasks.filter((t) => {
    if (!isMeeting(t) || !t.date) return false;
    const [y, m, d] = t.date.split("-").map(Number);
    const at = new Date(y, m - 1, d).getTime();
    return at >= a && at < b;
  }).reduce((sum, t) => sum + (+t.min || 0), 0);
}

/* o recibo do fim da sessão: quanto levou contra o que estava estimado */
export function receipt(s, now) {
  const took = minutesOf(s, now);
  const planned = +s.planned || 0;
  if (!planned) return { took, planned, diff: 0, verdict: "sem estimativa" };
  const diff = took - planned;
  const verdict = Math.abs(diff) <= Math.max(5, planned * 0.1) ? "na estimativa" : diff > 0 ? "passou da estimativa" : "antes da estimativa";
  return { took, planned, diff, verdict };
}

/* ---------- o GitHub ----------
   o navegador lê os eventos públicos do usuário (api.github.com permite, e
   nada passa pelo servidor): os commits empurrados e os PRs abertos ou
   fechados no dia. sem token, então repositório privado não aparece — é o
   preço de não guardar segredo nenhum. */
export function githubDay(events, day) {
  const same = (iso) => {
    const d = new Date(iso);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") === day;
  };
  const commits = [], prs = [];
  (Array.isArray(events) ? events : []).forEach((e) => {
    if (!e || !same(e.created_at)) return;
    const repo = (e.repo && e.repo.name ? e.repo.name.split("/")[1] : "") || "";
    if (e.type === "PushEvent") ((e.payload && e.payload.commits) || []).forEach((c) => commits.push({ repo, message: String(c.message || "").split("\n")[0].slice(0, 120) }));
    if (e.type === "PullRequestEvent" && e.payload && e.payload.pull_request) {
      prs.push({ repo, action: e.payload.pull_request.merged ? "merged" : e.payload.action, title: String(e.payload.pull_request.title || "").slice(0, 120) });
    }
  });
  return { commits, prs };
}
