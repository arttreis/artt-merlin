/* merlin · a apresentação
   um passo de cada vez, com o rodapé mostrando onde você está e o "pular"
   sempre à mão. cada passo tem um desenho feito de pedaços do próprio produto,
   porque um ícone genérico não ensina nada.

   morou na home, depois no Hoje do calendário (09/10/2026, VISAO 9). desde o
   menu por área (19/10/2026, VISAO 13) ela abre uma vez no início, que é a
   conversa, e o perfil a abre para quem quiser rever. a chave mudou de "tour"
   para "tour-areas": quem já tinha visto a antiga vê esta uma vez.

   são seis passos, na ordem em que alguém chega: a conversa, o que falta, o
   menu com as cinco áreas, e as áreas em três pares — organização, trabalho
   com o inbox, finanças com a saúde. */
import "./tour.css";
import { useState, useEffect } from "react";
import { icon, NAV_ICONS } from "./icons.jsx";

const TOUR = [
  {
    title: "fale com o Merlin",
    text: "O início é uma conversa. Conte o que aconteceu (“gastei 45 no almoço”), pergunte (“o que tenho na quinta?”) ou peça uma opinião. O que ele for lançar aparece num cartão para você confirmar, com desfazer."
  },
  {
    title: "o que falta, uma coisa por vez",
    text: "Escreva “o que falta hoje?” e ele responde com a próxima coisa: o que fazer, por que agora e quanto custa. A sessão de foco começa ali. No inbox, “o que falta” abre a mesma resposta."
  },
  {
    title: "o resto mora no menu",
    text: "Saúde, trabalho, organização, finanças e inbox: o menu abre no alto, em qualquer tela. O Ctrl K leva a qualquer página pelo nome, e o + cria em qualquer lugar."
  },
  {
    title: "só o dia tem minutos",
    text: "Em organização, o calendário: a barra se gasta com o relógio e o número grande diz quanto ainda cabe. A rotina monta a semana sozinha, e as notas não custam minuto até virar tarefa, com dia e duração."
  },
  {
    title: "do produto a quem usa",
    text: "Em trabalho, você desenha o produto e sai com o prompt para construir; conteúdo, funis e mapas levam gente até ele. No inbox ficam os leads e os clientes, que esperam uma resposta."
  },
  {
    title: "dinheiro e hábitos sem se enganar",
    text: "Em finanças, cheio é o que aconteceu e tracejado é o que você previu. Em saúde, os hábitos do mês. Entrando com o e-mail, o mesmo Merlin aparece em qualquer aparelho."
  }
];

/* as cinco áreas do passo 3, com o ícone e o nome do menu (core.js, SECTIONS) */
const AREAS = [["habits", "saúde"], ["apps", "trabalho"], ["calendar", "organização"], ["finance", "finanças"], ["inbox", "inbox"]];

export function Tour({ onClose }) {
  const [i, setI] = useState(0);
  const last = i === TOUR.length - 1;
  const step = TOUR[i];
  const go = (n) => setI(Math.max(0, Math.min(TOUR.length - 1, n)));
  /* setas andam, Esc pula — quem lê com a mão no teclado não precisa do mouse */
  useEffect(() => {
    const f = (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); last ? onClose() : go(i + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
      else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [i, last, onClose]);
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Apresentação do Merlin">
      <div className="tour__box">
        <button className="tour__skip" type="button" onClick={onClose}>pular</button>
        <div className="tour__art"><TourArt step={i} /></div>
        <div className="tour__words" aria-live="polite">
          <p className="tour__count">{i + 1} de {TOUR.length}</p>
          <h2>{step.title}</h2>
          <p>{step.text}</p>
        </div>
        <div className="tour__foot">
          <span className="tour__dots">
            {TOUR.map((s, n) => (
              <button key={s.title} type="button" className={n === i ? "is-on" : ""}
                      aria-label={"passo " + (n + 1) + ": " + s.title} aria-current={n === i ? "step" : undefined}
                      onClick={() => go(n)}><i /></button>
            ))}
          </span>
          <span className="tour__nav">
            {i > 0 && <button className="tour__back" type="button" onClick={() => go(i - 1)}>voltar</button>}
            <button className="tour__next" type="button" onClick={() => (last ? onClose() : go(i + 1))}>
              {last ? "começar" : "continuar"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

/* o desenho de cada passo: pedaços de tela de verdade, em miniatura, e cada
   um com a forma do que ensina — uma conversa, um cartão, um menu, uma grade,
   um fluxo, uma barra */
function TourArt({ step }) {
  if (step === 0) return (
    <div className="ta ta--talk" aria-hidden="true">
      <p className="ta__said">gastei 45 no almoço</p>
      <p className="ta__done">✓ lançado · almoço · R$ 45</p>
    </div>
  );
  if (step === 1) return (
    <div className="ta ta--next" aria-hidden="true">
      <div className="ta__card ta__card--next">
        <small>agora</small>
        <b>gravar o vídeo da demo <span className="ta__cost">· 45m</span></b>
        <span className="ta__why">começa em 10 min</span>
        <span className="ta__acts"><i className="is-main">começar foco</i><i>concluir</i></span>
      </div>
      <small className="ta__count">faltam 3 · 2 feitas</small>
    </div>
  );
  if (step === 2) return (
    <div className="ta ta--menu" aria-hidden="true">
      <div className="ta__areas">
        {AREAS.map(([k, label]) => <span key={k}>{NAV_ICONS[k]}<small>{label}</small></span>)}
      </div>
      <div className="ta__keyrow">
        <span className="ta__key"><kbd>ctrl</kbd><kbd>k</kbd></span>
        <span className="ta__key ta__key--plus">{icon("plus")}</span>
      </div>
    </div>
  );
  if (step === 3) return (
    <div className="ta ta--cal" aria-hidden="true">
      <div className="ta__tabs"><span className="is-on">dia</span><span>semana</span><span>mês</span></div>
      <div className="ta__week">
        {["seg", "ter", "qua", "qui", "sex"].map((d, n) => (
          <div key={d} className="ta__col">
            <small>{d}</small>
            {n === 0 && <i className="ta__blk" style={{ height: 30 }} />}
            {n === 1 && <><i className="ta__blk ta__blk--soft" style={{ height: 16 }} /><i className="ta__blk" style={{ height: 22 }} /></>}
            {n === 2 && <i className="ta__blk ta__blk--meet" style={{ height: 20, marginTop: 12 }} />}
            {n === 3 && <i className="ta__blk" style={{ height: 40 }} />}
            {n === 4 && <i className="ta__blk ta__blk--soft" style={{ height: 18, marginTop: 20 }} />}
          </div>
        ))}
      </div>
      <div className="ta__daybar"><b>2h40</b><span className="ta__bar"><i style={{ width: "58%" }} /></span><small>ainda cabe hoje</small></div>
    </div>
  );
  if (step === 4) return (
    <div className="ta ta--pipe" aria-hidden="true">
      <div className="ta__stages">
        <div><small>lead</small><i /><i /></div>
        <div><small>teste</small><i className="is-hot" /></div>
        <div className="is-won"><small>cliente</small><i /></div>
      </div>
      <div className="ta__chips"><span>{NAV_ICONS.apps}produtos</span><span>{NAV_ICONS.content}conteúdo</span><span>{NAV_ICONS.funnels}funis</span></div>
    </div>
  );
  return (
    <div className="ta ta--money" aria-hidden="true">
      <p className="ta__money"><small>na conta</small><b>R$ 3.210</b></p>
      <span className="ta__split"><i style={{ width: "46%" }} /><em style={{ width: "30%" }} /></span>
      <p className="ta__legend"><i className="is-real" />aconteceu <i className="is-forecast" />previsto</p>
    </div>
  );
}
