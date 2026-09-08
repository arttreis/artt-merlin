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
  initPage, today, dateOf, mondayOf, addDays, brl,
  sendToDay, parseMentions, parseDuration, clientName, seen, markSeen
} from "./shared/core.js";
import { loadDay, budget, pendingOf, isStale, fmt, longFmt, clock } from "./shared/day.js";
import { useState, useEffect } from "react";
import { mount, useCollection, useCloud, useClients, Dialog, icon } from "./shared/ui.jsx";
import { NAV_ICONS } from "./shared/icons.jsx";

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

mount(<Home />, "app");
