/* merlin · o início
   a página inicial no sentido que o navegador deu à palavra: o relógio grande,
   um campo no meio, e um bento embaixo com blocos de formatos diferentes —
   favoritos, atalhos em grade de ícones, o dia, as notas e a citação.

   por que ela existe: até aqui a porta de entrada do Merlin era o dia, e
   entrar no sistema significava ser recebido por uma fila com minutos. o dia
   continua sendo o centro, mas ele agora é um destino, não o corredor.

   o que ela NÃO é: um painel de métricas. e a fila de hoje é uma JANELA —
   clicar leva ao dia, que continua sendo o único que escreve no documento do
   dia. um segundo escritor é a forma exata do bug que o vínculo com a semana
   fechou.

   quem nunca esteve aqui não vê nada disso: vê a porta (o <Landing/>), que é
   um estado deste mesmo arquivo. */
import "./shared/base.css";
import "./index.css";
import {
  initPage, today, dateOf, sundayOf, addDays, newId, notify, signIn,
  sendToDay, newNote, parseMentions, readDuration, clientName, seen, markSeen,
  isNewHere, safeUrl, hostOf, readPrefs
} from "./shared/core.js";
import { budget, pendingOf, costOf, fmt, longFmt, clock } from "./shared/day.js";
import { normalize as normalizeTask, dayDoc, overdue } from "./shared/tasks.js";
import { normalize as normalizeBlock, copyRoutine } from "./shared/routine.js";
import { useState, useEffect, useLayoutEffect } from "react";
import { mount, useCollection, useCloud, useClients, Form, Field, useFields, icon } from "./shared/ui.jsx";
import { NAV_ICONS, LOGO } from "./shared/icons.jsx";

initPage("home");

/* ---------- a hora do dia, em palavra ---------- */
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "boa madrugada";
  if (h < 12) return "bom dia";
  if (h < 18) return "boa tarde";
  return "boa noite";
}
const longDate = () =>
  new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" })
    .format(dateOf(today()));

/* ---------- a citação do dia ----------
   uma lista fixa, e o dia do ano escolhe. sem servidor e sem sorteio: sorteio
   trocaria a frase a cada pintura, e uma citação que muda quando você volta
   para a aba não é uma citação — é ruído. o mesmo dia devolve a mesma frase. */
const QUOTES = [
  ["Não é que temos pouco tempo: é que perdemos muito dele.", "Sêneca"],
  ["O que se mede melhora. O que se mede todo dia, muda.", "Peter Drucker"],
  ["A melhor maneira de prever o futuro é criá-lo.", "Peter Drucker"],
  ["Simplicidade é o último grau de sofisticação.", "Leonardo da Vinci"],
  ["Não basta estar ocupado. A pergunta é: ocupado com o quê?", "Thoreau"],
  ["Quem tem um porquê enfrenta quase qualquer como.", "Nietzsche"],
  ["Comece de onde você está. Use o que você tem. Faça o que puder.", "Arthur Ashe"],
  ["A perfeição se alcança quando não há mais nada a tirar.", "Saint-Exupéry"],
  ["Ordem e simplificação são os primeiros passos para dominar um assunto.", "Thomas Mann"],
  ["Amadores esperam inspiração. O resto de nós apenas aparece e trabalha.", "Chuck Close"],
  ["Disciplina é escolher entre o que você quer agora e o que você mais quer.", "Abraham Lincoln"],
  ["Feito é melhor que perfeito.", "Sheryl Sandberg"],
  ["Um objetivo sem um plano é apenas um desejo.", "Saint-Exupéry"],
  ["O tempo é o recurso mais escasso; se ele não for gerido, nada mais pode ser.", "Peter Drucker"],
  ["Nada é particularmente difícil se você o divide em tarefas pequenas.", "Henry Ford"],
  ["A qualidade não é um ato, é um hábito.", "Aristóteles"],
  ["Fique longe de quem tenta diminuir suas ambições.", "Mark Twain"],
  ["O segredo de ir em frente é começar.", "Mark Twain"],
  ["Concentrar-se é dizer não.", "Steve Jobs"],
  ["Se você não sabe para onde vai, qualquer caminho serve.", "Lewis Carroll"],
  ["Você não sobe uma montanha olhando para o topo, e sim para o próximo passo.", "provérbio"],
  ["Quem quer fazer alguma coisa encontra um meio; quem não quer encontra uma desculpa.", "provérbio árabe"],
  ["Devagar se vai ao longe.", "provérbio português"],
  ["A pressa é inimiga da precisão, não do progresso.", "anônimo"],
  ["Escolher é abrir mão. É por isso que é difícil.", "anônimo"],
  ["Um dia de cada vez ainda é a única velocidade que existe.", "anônimo"],
  ["O plano não sobrevive ao contato com a semana. Ter um plano, sim.", "anônimo"],
  ["Trabalho que não cabe no dia não é prioridade: é vontade.", "anônimo"],
  ["Lista sem duração é lista de desejos.", "anônimo"],
  ["O que você não escreve, você carrega.", "anônimo"]
];
/* o dia do ano escolhe, então a frase é a mesma da manhã até a noite */
function quoteOfDay() {
  const d = dateOf(today());
  const day = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return QUOTES[day % QUOTES.length];
}

/* ---------- a apresentação ----------
   um passo de cada vez, com o rodapé mostrando onde você está e o "pular"
   sempre à mão. quatro cartões empilhados numa caixa eram quatro parágrafos
   que ninguém lê até o fim — e cada passo agora tem um desenho feito de
   pedaços do próprio produto, porque um ícone genérico não ensina nada. */
const TOUR = [
  {
    title: "só o dia tem minutos",
    text: "O dia é uma fila com duração obrigatória, e a barra do topo se gasta sozinha com o relógio. Todo o resto do sistema é reservatório sem hora."
  },
  {
    title: "nada entra sozinho",
    text: "Nota, cartão da semana, objetivo, item de backlog: nada vira tarefa por conta própria. Vira quando você puxa — e puxar cobra o pedágio da duração."
  },
  {
    title: "criar é sempre o mesmo gesto",
    text: "Em toda tela, o “+” abre uma caixa com os campos. Nenhuma lista tem formulário aberto no meio e nenhuma tela tem filtro: a busca acha qualquer coisa pelo nome."
  },
  {
    title: "o que é seu fica seu",
    text: "Tudo mora primeiro no seu navegador. Entrando com seu e-mail, o mesmo Merlin aparece em qualquer aparelho — e cada endereço tem um Merlin inteiro e separado."
  }
];

function Tour({ onClose }) {
  const [i, setI] = useState(0);
  const last = i === TOUR.length - 1;
  const step = TOUR[i];
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Apresentação do Merlin">
      <div className="tour__box">
        <button className="tour__skip" type="button" onClick={onClose}>pular</button>
        <div className="tour__art"><TourArt step={i} /></div>
        <div className="tour__words">
          <h2>{step.title}</h2>
          <p>{step.text}</p>
        </div>
        <div className="tour__foot">
          <span className="tour__dots" aria-hidden="true">
            {TOUR.map((s, n) => <i key={s.title} className={n === i ? "is-on" : ""} />)}
          </span>
          <button className="tour__next" type="button" onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? "começar" : "continuar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* o desenho de cada passo: pedaços de tela de verdade, em miniatura */
function TourArt({ step }) {
  if (step === 0) return (
    <div className="ta ta--day" aria-hidden="true">
      <p className="ta__big">2h40<small>de sobra</small></p>
      <div className="ta__bar"><i style={{ width: "58%" }} /></div>
      <div className="ta__row"><span className="ta__mark" /><b>gravar o vídeo</b><span className="ta__min">1h30</span></div>
      <div className="ta__row"><span className="ta__mark" /><b>revisar a proposta</b><span className="ta__min">45m</span></div>
    </div>
  );
  if (step === 1) return (
    <div className="ta ta--pull" aria-hidden="true">
      <div className="ta__card">frete grátis no ML<small>uma nota</small></div>
      <span className="ta__arrow">{icon("clock")}</span>
      <div className="ta__card ta__card--ask">quanto custa?<small>45m</small></div>
    </div>
  );
  if (step === 2) return (
    <div className="ta ta--form" aria-hidden="true">
      <span className="ta__plus">{icon("plus")}</span>
      <div className="ta__dialog">
        <b>novo cliente</b>
        <span className="ta__field" /><span className="ta__field" />
        <span className="ta__btn">criar</span>
      </div>
    </div>
  );
  return (
    <div className="ta ta--mine" aria-hidden="true">
      <span className="ta__device">{NAV_ICONS.home}</span>
      <span className="ta__link" />
      <span className="ta__device">{NAV_ICONS.day}</span>
      <p className="ta__seal t-mono">só seu</p>
    </div>
  );
}

/* ---------- o campo do meio ----------
   o análogo da barra de endereço: uma linha só, e o Enter decide o destino.
   com duração no texto, entra na fila de hoje; sem duração, vira nota na hora.
   a gramática é a estrita do core — a mesma que o dia usa. */
function Capture() {
  const [text, setText] = useState("");
  const read = (raw) => {
    const m = parseMentions(raw);
    const { min, title } = readDuration(m.title);
    return { title: title.trim(), min, client: m.client || "" };
  };
  const ghost = text.trim() ? read(text) : null;
  const submit = (e) => {
    e.preventDefault();
    const r = read(text);
    if (!r.title) return;
    sendToDay({ title: r.title, min: r.min, client: r.client });
    setText("");
  };
  return (
    <form className="hm-capture" autoComplete="off" onSubmit={submit}>
      <label className="hm-capture__field">
        {icon("plus")}
        <input id="hm-field" maxLength="300" placeholder="escreva o que apareceu…" aria-label="Escreva uma tarefa ou uma nota"
               value={text} onChange={(e) => setText(e.currentTarget.value)} />
        <kbd>enter</kbd>
      </label>
      {ghost && ghost.title && (
        <p className="hm-ghost">
          {ghost.min
            ? <>entra na <b>fila de hoje</b> quando você abrir o dia, ocupando {longFmt(ghost.min)}</>
            : <>vira <b>uma nota</b> — sem duração, não custa minuto nenhum</>}
          {ghost.client && clientName(ghost.client) ? <> · {clientName(ghost.client)}</> : null}
        </p>
      )}
    </form>
  );
}

/* ---------- os blocos ---------- */

/* o dia, no bloco alto: o número grande e a barra que se gasta. é o mesmo
   budget() da tela do dia — uma sobra calculada de dois jeitos seriam duas
   verdades sobre o mesmo dia, e a que aparece primeiro vence.

   "outro dia" morreu junto com o documento do dia: a fila de hoje é sempre a
   de hoje, porque hoje é uma consulta por data e não um estado guardado. o
   que ficou para trás tem lugar próprio, e é o calendário quem o mostra. */
function DayBlock({ doc, late }) {
  const b = budget(doc);
  const open = pendingOf(doc);
  const used = b.window ? Math.min(100, Math.round(((b.elapsed + b.liveReserve) / b.window) * 100)) : 0;
  const busy = b.window ? Math.max(0, Math.min(100 - used, Math.round((b.committed / b.window) * 100))) : 0;
  return (
    <a className="bx bx--day" href="calendar.html#day">
      <p className="bx__head">
        <span className="t-mono">o dia</span>
        <span className="t-mono bx__aside">{clock(doc.start)}–{clock(doc.end)}</span>
      </p>
      {/* três estados, e o terceiro é o que aparece toda noite: passou da hora
          de fechar. sem ele o bloco dizia "— além do que cabe" às 20h com a
          fila vazia, porque a sobra e o estouro são ambos zero quando a janela
          acabou. o dia não estourou: ele terminou. */}
      {b.overtime
        ? <p className="bx__big is-over">{clock(doc.end)}<small>{open.length ? "passou, e ainda há fila" : "passou. o dia fechou."}</small></p>
        : <p className={"bx__big" + (b.slack > 0 ? "" : " is-over")}>
            {b.slack > 0 ? fmt(b.slack) : fmt(b.overflow)}
            <small>{b.slack > 0 ? "ainda cabe" : "além do que cabe"}</small>
          </p>}
      <div className="bx__track" aria-hidden="true">
        <i className="bx__used" style={{ width: used + "%" }} />
        <i className="bx__busy" style={{ width: busy + "%" }} />
      </div>
      <ul className="bx__queue">
        {open.slice(0, 4).map((t) => (
          <li key={t.id}>
            <span className="bx__dot" aria-hidden="true" />
            <b>{t.title}</b>
            <span className="t-mono">{fmt(costOf(t))}</span>
          </li>))}
        {!open.length && <li className="bx__none">nada na fila</li>}
      </ul>
      {open.length > 4 && <p className="bx__more t-mono">e mais {open.length - 4}</p>}
      {late > 0 && <p className="bx__more t-mono">{late + (late === 1 ? " de antes de hoje" : " abertas de antes de hoje")}</p>}
    </a>
  );
}

/* os atalhos em grade de ícones. o número vivo vira uma bolinha no canto, e
   não uma frase embaixo do nome: nove frases era o que fazia a home parecer
   um relatório em vez de um lugar de onde se parte. */
const QUICK = [
  { id: "calendar", label: "calendário", href: "calendar.html", n: "dayOpen" },
  { id: "routine", label: "rotina", href: "routine.html", n: "" },
  { id: "notes", label: "notas", href: "notes.html", n: "notes" },
  { id: "clients", label: "clientes", href: "clients.html", n: "clients" },
  { id: "funnels", label: "funis", href: "funnels.html", n: "funnels" },
  { id: "maps", label: "mapas", href: "maps.html", n: "maps" },
  { id: "finance", label: "financeiro", href: "finance.html", n: "" },
  { id: "habits", label: "hábitos", href: "habits.html", n: "habits" },
  { id: "plans", label: "planos", href: "plans.html", n: "goals" }
];
function QuickBlock({ counts }) {
  return (
    <section className="bx bx--quick">
      <p className="bx__head"><span className="t-mono">atalhos</span></p>
      <div className="quick">
        {QUICK.map((q) => (
          <a key={q.id} className="quick__item" href={q.href}
             title={q.n && counts[q.n] ? q.label + " · " + counts[q.n] : q.label}>
            <span className="quick__icon">{NAV_ICONS[q.id]}</span>
            <span className="quick__name">{q.label}</span>
            {!!(q.n && counts[q.n]) && <i className="quick__badge">{counts[q.n]}</i>}
          </a>))}
      </div>
    </section>
  );
}

function FavBlock({ bookmarks }) {
  const [form, setForm] = useState(null);
  const list = bookmarks.all().sort((a, b) => (a.order || 0) - (b.order || 0));
  return (
    <section className="bx">
      <p className="bx__head">
        <span className="t-mono">favoritos</span>
        <button className="bx__add" type="button" aria-label="Guardar um site" onClick={() => setForm({ id: "" })}>{icon("plus")}</button>
      </p>
      {list.length
        ? <ul className="favs">
            {list.slice(0, 6).map((k) => (
              <li key={k.id}>
                {/* a marca é a inicial, não um favicon: pedir o ícone a um
                    serviço de terceiro entregaria a ele a lista de tudo que
                    você guarda, e o produto é feito sobre o contrário. */}
                <span className="favs__mark t-mono" aria-hidden="true">{(k.name || hostOf(k.url) || "?").trim()[0].toUpperCase()}</span>
                <a href={k.url} target="_blank" rel="noreferrer">
                  <b>{k.name || hostOf(k.url)}</b>
                  <small>{hostOf(k.url)}</small>
                </a>
                <button className="favs__edit" type="button" aria-label="Editar" onClick={() => setForm({ id: k.id })}>{icon("pencil")}</button>
              </li>))}
          </ul>
        : <p className="bx__empty">Nenhum site guardado ainda.</p>}
      {form && <BookmarkForm bookmarks={bookmarks} id={form.id} count={list.length} onClose={() => setForm(null)} />}
    </section>
  );
}

function BookmarkForm({ bookmarks, id, count, onClose }) {
  const k = id ? bookmarks.get(id) : null;
  const [v, bind] = useFields({ name: k ? k.name : "", url: k ? k.url : "" });
  const submit = () => {
    const url = safeUrl(v.url);
    if (!url) { notify("preciso de um endereço que dê para abrir"); return false; }
    const now = Date.now();
    bookmarks.save(k
      ? { ...k, name: v.name.trim().slice(0, 60), url, updatedAt: now }
      : { id: newId(), name: v.name.trim().slice(0, 60), url, order: count, createdAt: now, updatedAt: now });
  };
  const remove = () => {
    const before = bookmarks.remove(id);
    if (before) notify("favorito apagado", () => bookmarks.save(before));
  };
  return (
    <Form title={k ? "editar favorito" : "novo favorito"} submit="guardar"
          remove={k ? "apagar" : ""} onRemove={k ? remove : null}
          onSubmit={submit} onClose={onClose}>
      <Field label="nome" full><input className="input" maxLength="60" placeholder="como você chama esse lugar" {...bind("name")} /></Field>
      <Field label="endereço" full><input className="input" required maxLength="500" placeholder="mercadolivre.com.br" {...bind("url")} /></Field>
    </Form>
  );
}

function NoteBlock({ notes }) {
  const live = notes.all()
    .filter((n) => n.stage !== "archived")
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const [text, setText] = useState("");
  const add = (e) => {
    e.preventDefault();
    const m = parseMentions(text);
    const title = m.title.trim();
    if (!title) return;
    newNote({ title, client: m.client || "" });
    setText("");
  };
  return (
    <section className="bx">
      <p className="bx__head">
        <span className="t-mono">notas</span>
        <a className="bx__aside" href="notes.html">todas</a>
      </p>
      {live.length
        ? <ul className="notes-mini">
            {live.slice(0, 4).map((n) => (
              <li key={n.id}><a href={"notes.html#" + encodeURIComponent(n.id)}>{n.title || "sem título"}</a></li>))}
          </ul>
        : <p className="bx__empty">Nada guardado. O que não é tarefa cabe aqui.</p>}
      <form className="notes-mini__form" autoComplete="off" onSubmit={add}>
        <input maxLength="300" placeholder="uma nota…" aria-label="Nova nota"
               value={text} onChange={(e) => setText(e.currentTarget.value)} />
      </form>
    </section>
  );
}

function QuoteBlock() {
  const [text, who] = quoteOfDay();
  return (
    <section className="bx bx--quote">
      <span className="quote__mark" aria-hidden="true">“</span>
      <p className="quote__text">{text}</p>
      <p className="quote__who t-mono">{who}</p>
    </section>
  );
}

/* ---------- a landing ----------
   o primeiro quadro de quem nunca esteve aqui. não há fila de espera porque
   não há fila: o Merlin já funciona inteiro sem conta, e a porta diz isso.
   ela não é uma rota — é um estado deste mesmo arquivo. */
function Landing({ onGuest }) {
  return (
    <div className="lg">
      <div className="lg__art">
        <span className="lg__logo">{LOGO}<b>merlin</b></span>
        <div className="lg__grade" aria-hidden="true" />
        <div className="lg__words">
          <p className="lg__badge"><i />um sistema de uma pessoa só</p>
          <h1>o dia é o único lugar com <em>minutos</em></h1>
          <p className="lg__sub">
            Tudo o mais — as notas, a semana, os clientes, os funis, o dinheiro — é
            reservatório sem hora. O trabalho entra no seu dia quando você puxa, e
            pagando o pedágio da duração. É por isso que o número grande é confiável.
          </p>
        </div>
      </div>

      <div className="lg__door">
        <h2>comece agora</h2>
        <p className="lg__lead">Sem cadastro, sem cartão, sem espera. O Merlin nasce
        neste navegador e é seu no primeiro clique.</p>
        <button className="lg__cta" type="button" onClick={onGuest}>abrir o meu Merlin</button>
        <p className="lg__fine">Fica só aqui. Nada sobe para lugar nenhum enquanto você não entrar.</p>
        <div className="lg__or"><span>já tem acesso?</span></div>
        <button className="lg__ghost" type="button" onClick={() => signIn.show()}>entrar com e-mail</button>
        <p className="lg__fine">Um código de seis dígitos, sem senha para decorar.</p>
      </div>
    </div>
  );
}

function Home() {
  const c = useCloud();
  useClients();
  const tasks = useCollection("tasks", { normalize: normalizeTask });
  const notes = useCollection("notes");
  const funnels = useCollection("funnels");
  const maps = useCollection("maps");
  const habits = useCollection("habits");
  const plans = useCollection("plans");
  const clientsCol = useCollection("clients");
  const bookmarks = useCollection("bookmarks");
  const routine = useCollection("routine", { normalize: normalizeBlock });

  /* o início mostra o dia, e o dia pode ter reunião da rotina: copia a semana
     daqui também, senão ela só apareceria depois de abrir o calendário */
  useEffect(() => {
    const run = () => copyRoutine(routine, tasks);
    run();
    const offs = [tasks.onChange(run), routine.onChange(run), c.onStatus(run)];
    return () => offs.forEach((off) => off());
  }, []);

  /* o dia virou uma consulta na coleção de tarefas: a coleção já avisa quando
     muda (outra aba, nuvem), então aqui só resta o relógio — a barra se gasta
     sozinha, e é ele quem redesenha. */
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const [tour, setTour] = useState(() => !seen("tour") || location.hash === "#apresentacao");
  const closeTour = () => {
    setTour(false);
    markSeen("tour");
    if (location.hash) history.replaceState(null, "", location.pathname);
    /* a quick win: quem acabou de ler é devolvido ao campo, com o cursor
       dentro. o pior quadro depois de uma apresentação é não saber o que fazer. */
    requestAnimationFrame(() => { const f = document.getElementById("hm-field"); if (f) f.focus(); });
  };
  useEffect(() => {
    const f = () => { if (location.hash === "#apresentacao") setTour(true); };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);

  const t = today();
  const weekStart = sundayOf(t);
  const weekDays = new Set(Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)));
  const allTasks = tasks.all();
  const today_ = dayDoc(allTasks, t, readPrefs());
  const late = overdue(allTasks, t).length;
  const counts = {
    dayOpen: pendingOf(today_).length,
    weekOpen: allTasks.filter((x) => !x.done && !x.reserved && weekDays.has(x.date)).length,
    notes: notes.all().filter((n) => n.stage !== "archived").length,
    clients: clientsCol.all().filter((x) => x.status !== "closed").length,
    funnels: funnels.all().length,
    maps: maps.all().length,
    habits: habits.all().filter((h) => !h.archived && !(h.marks && h.marks[t])).length,
    goals: plans.all().reduce((s, p) => s + (p.goals || []).filter((g) => !g.done).length, 0)
  };

  const now = new Date();
  const name = c.signedIn && c.email ? String(c.email).split("@")[0] : "";

  return (
    <div className="hm">
      <header className="hm-top">
        <span className="hm-hello">{greeting()}{name ? ", " + name : ""}</span>
        <a className="hm-me" href="profile.html">
          <span className={"hm-me__av" + (name ? "" : " is-out")}>{name ? name[0].toUpperCase() : "?"}</span>
          <span>{c.signedIn ? "sincronizado" : "só neste navegador"}</span>
        </a>
      </header>

      <section className="hm-clock">
        <p className="hm-time">{String(now.getHours()).padStart(2, "0")}<i>:</i>{String(now.getMinutes()).padStart(2, "0")}</p>
        <p className="hm-date">{longDate()}</p>
      </section>

      <Capture />

      <section className="hm-bento">
        <FavBlock bookmarks={bookmarks} />
        <QuickBlock counts={counts} />
        <DayBlock doc={today_} late={late} />
        <NoteBlock notes={notes} />
        <QuoteBlock />
      </section>

      <p className="hm-foot">
        <a href="index.html#apresentacao" onClick={(e) => { e.preventDefault(); setTour(true); }}>a apresentação</a>
      </p>

      {tour && <Tour onClose={closeTour} />}
    </div>
  );
}

/* ---------- qual dos dois quadros ----------
   decidido de forma SÍNCRONA, aqui no módulo, antes do mount: esperar o
   servidor dizer quem é você faria a página nascer vazia e se corrigir depois,
   e o Merlin funciona inteiro sem conexão.

   `bare` na raiz tira a barra de navegação. tira a BARRA, não a casca: o
   diálogo de entrar mora dentro dela, e é ele que a landing abre. */
function Root() {
  const [bare, setBare] = useState(() => isNewHere() && !seen("landing"));
  useLayoutEffect(() => { document.documentElement.classList.toggle("bare", bare); }, [bare]);
  const enter = () => { markSeen("landing"); setBare(false); };
  return bare ? <Landing onGuest={enter} /> : <Home />;
}

mount(<Root />, "app");
