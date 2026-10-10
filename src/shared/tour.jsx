/* merlin · a apresentação
   um passo de cada vez, com o rodapé mostrando onde você está e o "pular"
   sempre à mão. cada passo tem um desenho feito de pedaços do próprio produto,
   porque um ícone genérico não ensina nada.

   morava na home (index.jsx). quando a home deixou de existir e o dia virou a
   primeira tela (09/10/2026, VISAO 9), ela veio para cá: o Hoje a mostra para
   quem nunca a viu, e o perfil a abre para quem quiser rever.

   reescrita junto: são seis passos, um por lugar da barra, na ordem em que
   alguém usa — o tempo, o que se repete, o que ainda não é tarefa, o produto e
   quem chega até ele, o dinheiro, e o campo que vale em todo lugar. */
import "./tour.css";
import { useState, useEffect } from "react";
import { icon, NAV_ICONS } from "./icons.jsx";

const TOUR = [
  {
    title: "hoje é o seu tempo",
    text: "O dia é a primeira tela: a barra se gasta com o relógio e o número grande diz quanto ainda cabe. Semana e mês são o mesmo lugar visto de longe. No computador, o rastreador mostra esse número por cima de tudo."
  },
  {
    title: "a semana de sempre se monta sozinha",
    text: "O que se repete — almoço, academia, a reunião de segunda — fica na rotina e vira tarefa sozinho quando a semana abre. Os hábitos de hoje e o “como foi o dia” ficam ao lado da fila."
  },
  {
    title: "o que ainda não é tarefa",
    text: "Em Ideias, o que apareceu vira nota, com checklist, e o que pede galhos vira mapa. Nada disso custa minuto até virar tarefa, com dia e duração."
  },
  {
    title: "do produto a quem usa",
    text: "Em Produtos você desenha o app — conceito, banco, telas — e sai com o prompt para construir. Distribuição guarda os funis e o conteúdo que levam gente até ele; Clientes, quem chegou, de lead a pagante."
  },
  {
    title: "dinheiro sem se enganar",
    text: "No financeiro, cheio é o que aconteceu e tracejado é o que você previu; fixos e parcelas chegam como sugestão e só contam depois de lançados. Na vitrine, o “comprei” já vira saída."
  },
  {
    title: "um campo para tudo",
    text: "Ctrl K busca, cria e pergunta: com duração vai para hoje, sem duração vira ideia, e com “?” é pergunta ao Merlin. Entrando com o e-mail, o mesmo Merlin aparece em qualquer aparelho."
  }
];

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
   um com a forma do que ensina — uma grade, um fluxo, um quadro, uma barra */
function TourArt({ step }) {
  if (step === 0) return (
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
  if (step === 1) return (
    <div className="ta ta--routine" aria-hidden="true">
      <div className="ta__rblock"><b>almoço</b><small>seg a sex · 12h · 1h</small></div>
      <span className="ta__arrow">{icon("arrow")}</span>
      <div className="ta__rdays">
        {["seg", "ter", "qua", "qui", "sex"].map((d) => <span key={d}><small>{d}</small><i /></span>)}
      </div>
    </div>
  );
  if (step === 2) return (
    <div className="ta ta--pull" aria-hidden="true">
      <div className="ta__card">
        <b>landing do lançamento</b>
        <span className="ta__check is-done">escrever a promessa</span>
        <span className="ta__check">gravar o vídeo da demo</span>
      </div>
      <span className="ta__arrow">{icon("task")}</span>
      <div className="ta__card ta__card--task"><b>gravar o vídeo da demo</b><small>qui · 45m</small></div>
    </div>
  );
  if (step === 3) return (
    <div className="ta ta--pipe" aria-hidden="true">
      <div className="ta__stages">
        <div><small>lead</small><i /><i /></div>
        <div><small>teste</small><i className="is-hot" /></div>
        <div className="is-won"><small>cliente</small><i /></div>
      </div>
      <div className="ta__chips"><span>{NAV_ICONS.apps}produtos</span><span>{NAV_ICONS.funnels}funis</span><span>{NAV_ICONS.content}conteúdo</span></div>
    </div>
  );
  if (step === 4) return (
    <div className="ta ta--money" aria-hidden="true">
      <p className="ta__money"><small>na conta</small><b>R$ 3.210</b></p>
      <span className="ta__split"><i style={{ width: "46%" }} /><em style={{ width: "30%" }} /></span>
      <p className="ta__legend"><i className="is-real" />aconteceu <i className="is-forecast" />previsto</p>
    </div>
  );
  return (
    <div className="ta ta--keys" aria-hidden="true">
      <div className="ta__keyrow">
        <span className="ta__key"><kbd>ctrl</kbd><kbd>k</kbd></span>
        <span className="ta__key ta__key--plus">{icon("plus")}</span>
        <span className="ta__key ta__key--spark">{icon("spark")}</span>
      </div>
      <div className="ta__sync">
        <span className="ta__device">{NAV_ICONS.calendar}</span>
        <span className="ta__link" />
        <span className="ta__device">{NAV_ICONS.notes}</span>
      </div>
    </div>
  );
}
