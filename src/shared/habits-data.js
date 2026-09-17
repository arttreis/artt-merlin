/* merlin · o miolo dos habitos, sem tela
   normalize, os tipos de frequencia e "o que e esperado hoje" — extraidos de
   habits.jsx para a home poder marcar um habito direto no bento sem puxar a
   pagina inteira (que monta seu proprio initPage/mount). funcoes puras, sem
   colecao nem DOM: quem chama passa o documento e recebe de volta o que
   precisa saber ou gravar. */
import { dateOf } from "./core.js";

export const SCHEDULES = [
  { id: "daily", label: "todo dia" },
  { id: "perWeek", label: "vezes por semana" },
  { id: "weekdays", label: "dias da semana" }
];
export const COLORS = [
  { id: 5, label: "verde" }, { id: 1, label: "azul" }, { id: 2, label: "laranja" },
  { id: 3, label: "rosa" }, { id: 4, label: "roxo" }, { id: 6, label: "ciano" }
];

export function normalize(d) {
  const s = d.schedule && typeof d.schedule === "object" ? d.schedule : {};
  return {
    id: d.id,
    name: String(d.name || "").slice(0, 80),
    schedule: {
      type: SCHEDULES.some((x) => x.id === s.type) ? s.type : "daily",
      times: Math.min(7, Math.max(1, Math.round(+s.times || 3))),
      weekdays: Array.isArray(s.weekdays) ? s.weekdays.map(Number).filter((n) => n >= 0 && n <= 6) : [1, 2, 3, 4, 5]
    },
    min: Math.max(0, Math.round(+d.min || 0)),
    color: +d.color || 5,
    order: Number.isFinite(+d.order) ? +d.order : 0,
    archived: !!d.archived,
    marks: d.marks && typeof d.marks === "object" ? d.marks : {},
    createdAt: +d.createdAt || Date.now(),
    updatedAt: +d.updatedAt || +d.createdAt || Date.now()
  };
}

/* o dia e "esperado" quando a frequencia pede marca nele. quem e N vezes por
   semana nao tem dia fixo: nenhum e esperado, e a conta e por semana. */
export function isExpected(h, day) {
  const s = h.schedule;
  if (s.type === "daily") return true;
  if (s.type === "weekdays") return s.weekdays.includes(dateOf(day).getDay());
  return false;
}

/* marca/desmarca o dia: a mesma acao de habits.jsx, pronta pra qualquer
   tela chamar com a colecao que ja tem em mao. */
export function toggleMark(habits, h, day, today) {
  if (day > today) return;
  const marks = { ...h.marks };
  if (marks[day]) delete marks[day]; else marks[day] = true;
  habits.save({ ...h, marks, updatedAt: Date.now() });
}
