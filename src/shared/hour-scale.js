/* merlin · a regua da grade de horas
   a semana do calendario e a rotina desenham a mesma folha, e ate 14/09/2026
   cada hora tinha 44px. agora a hora dentro da janela do dia (o comeco e o fim
   que o perfil guarda) e mais alta, e a de fora encolhe: a madrugada existe,
   mas nao merece o mesmo espaco que o expediente.

   com alturas diferentes, "minuto / 60 * 44" deixou de valer. tudo que vira
   pixel (topo, altura, linha do agora) ou volta de pixel pra minuto (clique,
   arrastar, puxar a borda) passa por aqui. */

import { useLayoutEffect, useState } from "react";

/* a hora de fora tem altura fixa e baixa; a de dentro divide o que sobra da
   tela, entre um piso (abaixo dele o bloco de meia hora nao cabe o nome) e um
   teto (acima dele a grade fica frouxa). a ideia e a semana caber sem rolar. */
export const HOUR_OFF = 16;
const ON_MIN = 40, ON_MAX = 72;

function windowOf(dayStart, dayEnd) {
  let s = Math.max(0, Math.min(1440, dayStart || 0));
  let e = Math.max(0, Math.min(1440, dayEnd || 0));
  /* janela invalida: o dia inteiro fica ativo, que e o jeito antigo */
  if (e <= s) { s = 0; e = 1440; }
  return [s, e];
}

/* a altura da hora ativa que faz as 24 horas caberem em `avail` pixels */
export function fitHour(avail, dayStart, dayEnd) {
  const [s, e] = windowOf(dayStart, dayEnd);
  const on = (e - s) / 60, off = 24 - on;
  if (!avail || !on) return ON_MIN;
  return Math.max(ON_MIN, Math.min(ON_MAX, Math.floor((avail - off * HOUR_OFF) / on)));
}

/* mede o espaco da rolagem (menos o cabecalho grudado) e devolve a regua que
   cabe nele; mede de novo quando a janela muda de tamanho */
export function useHourScale(scrollRef, dayStart, dayEnd) {
  const [avail, setAvail] = useState(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const head = el.querySelector(".wk__head");
      setAvail(el.clientHeight - (head ? head.offsetHeight : 0) - 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return hourScale(dayStart, dayEnd, fitHour(avail, dayStart, dayEnd));
}

export function hourScale(dayStart, dayEnd, hourOn = ON_MIN) {
  const [s, e] = windowOf(dayStart, dayEnd);
  const HOUR_ON = hourOn;
  const offPx = (min) => min / 60 * HOUR_OFF;
  const onPx = (min) => min / 60 * HOUR_ON;
  const top = offPx(s), mid = onPx(e - s);

  /* minuto -> pixel a partir do topo da grade */
  const y = (min) => {
    const m = Math.max(0, Math.min(1440, min));
    if (m <= s) return offPx(m);
    if (m <= e) return top + onPx(m - s);
    return top + mid + offPx(m - e);
  };
  /* pixel -> minuto, o inverso */
  const minute = (px) => {
    if (px <= top) return px / HOUR_OFF * 60;
    if (px <= top + mid) return s + (px - top) / HOUR_ON * 60;
    return e + (px - top - mid) / HOUR_OFF * 60;
  };
  /* uma linha fina no comeco de cada hora, num gradiente so: a lane nao
     precisa de 24 elementos a mais, e o clique continua caindo nela */
  const stops = [];
  for (let h = 0; h < 24; h++) {
    const p = y(h * 60);
    stops.push("var(--line-soft) " + p + "px", "var(--line-soft) " + (p + 1) + "px", "transparent " + (p + 1) + "px", "transparent " + y((h + 1) * 60) + "px");
  }
  return {
    y, minute,
    height: y(1440),
    lines: "linear-gradient(to bottom," + stops.join(",") + ")"
  };
}
