/* merlin · o início
   a página inicial no sentido que o navegador deu à palavra: um campo no meio
   e os atalhos embaixo. o que ela acrescenta é que cada atalho não é só um
   link — ele diz o número que faria você abrir aquilo.

   por que ela existe: até aqui a porta de entrada do Merlin era o dia, e
   entrar no sistema significava ser recebido por uma fila com minutos. o dia
   continua sendo o centro, mas ele agora é um destino, não o corredor.

   o que ela NÃO é: um painel. nada aqui se edita, nada aqui se conclui, e
   nenhum número tem gráfico. cada bloco é uma frase e uma porta. */
import "./shared/base.css";
import "./index.css";
import {
  initPage, today, dateOf, mondayOf, addDays, brl, newId, notify, signIn,
  sendToDay, newNote, parseMentions, parseDuration, clientName, seen, markSeen,
  isNewHere, safeUrl, hostOf
} from "./shared/core.js";
import { loadDay, budget, pendingOf, isStale, fmt, longFmt, clock } from "./shared/day.js";
import { useState, useEffect, useLayoutEffect } from "react";
import { mount, useCollection, useCloud, useClients, Dialog, Form, Field, useFields, icon } from "./shared/ui.jsx";
import { NAV_ICONS, LOGO } from "./shared/icons.jsx";

initPage("home");

const WEEKEND = "weekend:";

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

/* ---------- os atalhos ----------
   a ordem é a da navegação, e cada um sabe dizer de si mesmo em uma linha.
   `line` recebe tudo o que o início já leu e devolve texto — nunca busca nada
   por conta própria, para um atalho não conseguir deixar a página lenta. */
const TILES = [
  {
    id: "day", label: "o dia", href: "day.html",
    line: (d) => {
      if (d.stale) return "a fila é de outro dia";
      if (!d.open) return "nada na fila";
      return d.open + (d.open === 1 ? " na fila" : " na fila") + " · " + (d.slack > 0 ? fmt(d.slack) + " de sobra" : "não cabe mais nada");
    }
  },
  {
    id: "week", label: "a semana", href: "week.html",
    line: (d) => (d.weekOpen ? d.weekOpen + (d.weekOpen === 1 ? " cartão aberto" : " cartões abertos") : "a semana está limpa")
  },
  {
    id: "notes", label: "as notas", href: "notes.html",
    line: (d) => (d.notes ? d.notes + (d.notes === 1 ? " nota" : " notas") : "nenhuma nota ainda")
  },
  {
    id: "clients", label: "os clientes", href: "clients.html",
    line: (d) => (d.clients ? d.clients + (d.clients === 1 ? " cliente" : " clientes") : "nenhum cliente ainda")
  },
  {
    id: "funnels", label: "os funis", href: "funnels.html",
    line: (d) => (d.funnels ? d.funnels + (d.funnels === 1 ? " funil" : " funis") : "nenhum funil ainda")
  },
  {
    id: "maps", label: "os mapas", href: "maps.html",
    line: (d) => (d.maps ? d.maps + (d.maps === 1 ? " mapa" : " mapas") : "nenhum mapa ainda")
  },
  {
    id: "finance", label: "o financeiro", href: "finance.html",
    /* o saldo previsto é conta da própria página (projeção de fixas, dívidas e
       cartão); aqui fica o que já foi lançado neste mês, que é verdade sem
       depender daquela máquina inteira. */
    line: (d) => (d.moneyEntries ? brl(d.moneyIn - d.moneyOut, true) + " neste mês" : "nada lançado neste mês")
  },
  {
    id: "habits", label: "os hábitos", href: "habits.html",
    line: (d) => (d.habits ? d.habitsToday + " de " + d.habits + " marcados hoje" : "nenhum hábito ainda")
  },
  {
    id: "plans", label: "os planos", href: "plans.html",
    line: (d) => (d.goals ? d.goals + (d.goals === 1 ? " objetivo aberto" : " objetivos abertos") : "nenhum objetivo ainda")
  }
];

/* ---------- a apresentação ----------
   o Merlin tem nove telas e um princípio; sem isto, a primeira visita é uma
   lista de links. são cartões, não um passo a passo: ninguém tem que fazer
   nada para chegar ao próximo. */
const TOUR = [
  {
    title: "só o dia tem minutos",
    text: "Esse é o princípio que amarra tudo. O dia é uma fila com duração obrigatória, e a barra do topo se gasta sozinha com o relógio. Todo o resto do sistema é reservatório sem hora."
  },
  {
    title: "nada entra sozinho",
    text: "Nota, cartão da semana, objetivo, item de backlog: nada vira tarefa por conta própria. Vira quando você puxa — e puxar cobra o pedágio da duração. É por isso que o número grande do dia é confiável."
  },
  {
    title: "criar é sempre o mesmo gesto",
    text: "Em toda tela, o “+” abre uma caixa com os campos. Nenhuma lista tem formulário aberto no meio e nenhuma tela tem filtro: a busca da barra (ctrl k) acha qualquer coisa pelo nome."
  },
  {
    title: "o que é seu fica seu",
    text: "Tudo mora primeiro no seu navegador. Se você entrar com seu e-mail, o mesmo Merlin aparece em qualquer aparelho — e ninguém mais vê o seu: cada endereço tem um Merlin inteiro e separado."
  }
];

function Tour({ onClose }) {
  return (
    <Dialog title="o Merlin em quatro frases" wide label="Apresentação do Merlin" onClose={onClose}
            actions={<button className="pill pill--green" type="button" onClick={onClose}>entendi</button>}>
      <div className="tour">
        {TOUR.map((t) => (
          <section key={t.title}>
            <b>{t.title}</b>
            <p>{t.text}</p>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

/* ---------- o campo do meio ----------
   o análogo da barra de endereço: uma linha só, e o Enter decide o destino.
   com duração no texto, vai para a fila de hoje; sem duração, cai na caixa de
   notas — e sem duração ela nasce agora, não quando o dia abrir.
   não inventamos um terceiro destino: o início escreve o mesmo bilhete que
   qualquer outro módulo escreveria. */
function Capture() {
  const [text, setText] = useState("");
  const [ghost, setGhost] = useState(null);

  const read = (raw) => {
    const m = parseMentions(raw);
    const { min, title } = parseDuration(m.title);
    return { title: title.trim(), min, client: m.client || "" };
  };

  const preview = (raw) => {
    const t = raw.trim();
    if (!t) { setGhost(null); return; }
    const r = read(t);
    if (!r.title) { setGhost(null); return; }
    setGhost(r);
  };

  const submit = (e) => {
    e.preventDefault();
    const r = read(text);
    if (!r.title) return;
    sendToDay({ title: r.title, min: r.min, client: r.client });
    setText(""); setGhost(null);
  };

  return (
    <form className="hm-capture" autoComplete="off" onSubmit={submit}>
      <label className="hm-capture__field">
        {icon("plus")}
        <input id="hm-field" maxLength="300" placeholder="escreve o que apareceu…" aria-label="Escreva uma tarefa ou uma nota"
               value={text} onChange={(e) => { setText(e.currentTarget.value); preview(e.currentTarget.value); }} />
      </label>
      {ghost && (
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

/* ---------- a faixa: as notas e os favoritos ----------
   o que a start page de navegador tem e a nossa não tinha: as coisas que se
   consulta e se guarda, sem sair da tela. duas colunas, e nenhuma delas é um
   reservatório novo — as notas são a mesma coleção de notes.html, e favorito
   não é trabalho de ninguém: é um lugar aonde se vai. */

function NoteStrip({ notes }) {
  const live = notes.all()
    .filter((n) => n.stage !== "archived")
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 5);
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
    <section className="block hm-strip">
      <p className="heading">
        <span className="t-mono">notas</span>
        <a className="link" href="notes.html">todas</a>
      </p>
      {live.length
        ? <ul className="list">
            {live.map((n) => (
              <li key={n.id} className="line">
                <a className="name" href={"notes.html#" + encodeURIComponent(n.id)}>{n.title || "sem título"}</a>
              </li>))}
          </ul>
        : <p className="empty">Nada guardado ainda. O que não é tarefa cabe aqui.</p>}
      {/* escrever aqui grava a nota na hora: sem duração ela não custa minuto
          nenhum, então nunca precisou passar pelo dia. */}
      <form className="hm-strip__form" autoComplete="off" onSubmit={add}>
        <input maxLength="300" placeholder="uma nota…" aria-label="Nova nota"
               value={text} onChange={(e) => setText(e.currentTarget.value)} />
      </form>
    </section>
  );
}

function BookmarkStrip({ bookmarks }) {
  const [form, setForm] = useState(null);   // { id } | null
  const list = bookmarks.all().sort((a, b) => (a.order || 0) - (b.order || 0));
  const move = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= list.length) return;
    const a = list[i], b = list[j];
    bookmarks.saveMany([{ ...a, order: b.order || j, updatedAt: Date.now() }, { ...b, order: a.order || i, updatedAt: Date.now() }]);
  };
  return (
    <section className="block hm-strip">
      <p className="heading">
        <span className="t-mono">favoritos</span>
        <button className="pill pill--mini" type="button" onClick={() => setForm({ id: "" })}>{icon("plus")}site</button>
      </p>
      {list.length
        ? <ul className="list">
            {list.map((k, i) => (
              <li key={k.id} className="line hm-fav">
                {/* a marca é a inicial, não um favicon: pedir o ícone a um
                    serviço de terceiro entregaria a ele a lista de tudo que
                    você guarda, e o produto inteiro é feito sobre o contrário. */}
                <span className="hm-fav__mark t-mono" aria-hidden="true">{(k.name || hostOf(k.url) || "?").trim()[0].toUpperCase()}</span>
                <a className="name" href={k.url} target="_blank" rel="noreferrer">
                  {k.name || hostOf(k.url)}
                  <small>{hostOf(k.url)}</small>
                </a>
                <span className="row-actions">
                  <button className="action" type="button" title="subir" disabled={i === 0} onClick={() => move(i, -1)}>{icon("chevronUp")}</button>
                  <button className="action" type="button" title="descer" disabled={i === list.length - 1} onClick={() => move(i, 1)}>{icon("chevronDown")}</button>
                  <button className="action" type="button" title="editar" onClick={() => setForm({ id: k.id })}>{icon("pencil")}</button>
                </span>
              </li>))}
          </ul>
        : <p className="empty">Nenhum site guardado. O “+” guarda o primeiro.</p>}
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

/* ---------- a landing ----------
   o primeiro quadro de quem nunca esteve aqui. o anexo acertou a forma —
   duas colunas, um cartão grande à esquerda, uma ação à direita, muito
   respiro — e a promessa é que muda: não há fila de espera, porque não há
   fila. o Merlin já funciona inteiro sem conta, e é isso que a porta diz.

   ela não é uma rota: é um estado do próprio início. sem URL nova, sem
   redirect, e sem jeito de prender numa página de marketing quem já tem
   trabalho guardado — `isNewHere()` responde isso antes da primeira pintura. */
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
        <button className="lg__ghost" type="button" onClick={() => signIn.show()}>
          entrar com e-mail
        </button>
        <p className="lg__fine">Um código de seis dígitos, sem senha para decorar.</p>
      </div>
    </div>
  );
}

function Home() {
  const c = useCloud();
  useClients();
  const week = useCollection("week");
  const notes = useCollection("notes");
  const funnels = useCollection("funnels");
  const maps = useCollection("maps");
  const finance = useCollection("finance");
  const habits = useCollection("habits");
  const plans = useCollection("plans");
  const clientsCol = useCollection("clients");
  const bookmarks = useCollection("bookmarks");

  /* o dia não é coleção: é um documento no navegador. relemos no evento de
     storage (outra aba) e a cada minuto, que é o passo do relógio da barra. */
  const [dayDoc, setDayDoc] = useState(loadDay);
  useEffect(() => {
    const f = (e) => { if (!e || e.key === "merlin:day") setDayDoc(loadDay()); };
    window.addEventListener("storage", f);
    const t = setInterval(() => setDayDoc(loadDay()), 60000);
    return () => { window.removeEventListener("storage", f); clearInterval(t); };
  }, []);

  const [tour, setTour] = useState(() => !seen("tour") || location.hash === "#apresentacao");
  const closeTour = () => {
    setTour(false);
    markSeen("tour");
    if (location.hash) history.replaceState(null, "", location.pathname);
    /* a quick win: quem acabou de ler as quatro frases é devolvido ao campo,
       com o cursor dentro. o pior quadro possível depois de uma apresentação é
       nove ladrilhos dizendo "nenhum" e nenhuma sugestão do que fazer. */
    requestAnimationFrame(() => { const f = document.getElementById("hm-field"); if (f) f.focus(); });
  };
  useEffect(() => {
    const f = () => { if (location.hash === "#apresentacao") setTour(true); };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);

  /* ---------- os números, todos numa passada ---------- */
  const t = today();
  const monday = mondayOf(t);
  const weekDays = new Set(Array.from({ length: 7 }, (_, i) => addDays(monday, i)).concat([WEEKEND + monday]));
  const b = budget(dayDoc);
  const month = t.slice(0, 7);
  const monthEntries = finance.all().filter((d) => d.type === "entry" && String(d.day || "").startsWith(month));
  const habitList = habits.all().filter((h) => !h.archived);

  const data = {
    stale: isStale(dayDoc),
    open: pendingOf(dayDoc).length,
    slack: b.slack,
    weekOpen: week.all().filter((c) => !c.done && weekDays.has(c.day)).length,
    notes: notes.all().filter((n) => n.stage !== "archived").length,
    clients: clientsCol.all().filter((c) => c.status !== "closed").length,
    funnels: funnels.all().length,
    maps: maps.all().length,
    moneyEntries: monthEntries.length,
    moneyIn: monthEntries.filter((e) => e.kind === "in").reduce((s, e) => s + (+e.amount || 0), 0),
    moneyOut: monthEntries.filter((e) => e.kind === "out").reduce((s, e) => s + (+e.amount || 0), 0),
    habits: habitList.length,
    habitsToday: habitList.filter((h) => h.marks && h.marks[t]).length,
    goals: plans.all().reduce((s, p) => s + (p.goals || []).filter((g) => !g.done).length, 0)
  };

  const name = c.signedIn && c.email ? String(c.email).split("@")[0] : "";
  /* a frase de hoje sai da mesma conta da barra do dia, não de uma segunda
     leitura: se as duas discordassem, a que aparece primeiro venceria. */
  const headline = data.stale
    ? "a fila aberta é de outro dia — o dia pergunta o que fazer com ela"
    : !data.open
      ? "o dia está vazio. " + fmt(b.remaining) + " até " + clock(dayDoc.end) + "."
      : b.slack > 0
        ? longFmt(b.slack) + " de sobra depois do que já está na fila"
        : "a fila já passa do que cabe hoje";

  return (
    <>
      <section className="hm-hero">
        <p className="hm-when t-mono">{longDate()}</p>
        <h1>{greeting()}{name ? ", " + name : ""}</h1>
        <p className="hm-headline">{headline}</p>
        <Capture />
      </section>

      <section className="hm-band">
        <NoteStrip notes={notes} />
        <BookmarkStrip bookmarks={bookmarks} />
      </section>

      <section className="hm-dial">
        {TILES.map((tile) => (
          <a key={tile.id} className="hm-tile" href={tile.href}>
            <span className="hm-tile__icon">{NAV_ICONS[tile.id]}</span>
            <b>{tile.label}</b>
            <span className="hm-tile__line">{tile.line(data)}</span>
          </a>
        ))}
      </section>

      <p className="hm-foot">
        {c.signedIn
          ? <>o mesmo Merlin em todos os seus aparelhos · <a href="profile.html">perfil</a></>
          : <>este Merlin vive só neste navegador · <a href="profile.html">entrar no perfil</a></>}
        {" · "}
        <a href="index.html#apresentacao" onClick={(e) => { e.preventDefault(); setTour(true); }}>a apresentação</a>
      </p>

      {tour && <Tour onClose={closeTour} />}
    </>
  );
}

/* ---------- qual dos dois quadros ----------
   decidido de forma SÍNCRONA, aqui no módulo, antes do mount: esperar o
   servidor dizer quem é você faria a página nascer vazia e se corrigir depois,
   e o Merlin funciona inteiro sem conexão.

   `bare` na raiz tira a barra de navegação. tira a BARRA, não a casca: o
   diálogo de entrar mora dentro dela, e é ele que a landing abre. */
function Root() {
  const [bare, setBare] = useState(isNewHere);
  useLayoutEffect(() => { document.documentElement.classList.toggle("bare", bare); }, [bare]);
  /* "abrir o meu Merlin" não cria conta nem grava nada: só diz que a porta já
     foi atravessada. o recibo mora no mesmo merlin:seen do resto. */
  const enter = () => { markSeen("landing"); setBare(false); };
  if (bare && !seen("landing")) return <Landing onGuest={enter} />;
  return <Home />;
}

mount(<Root />, "app");
