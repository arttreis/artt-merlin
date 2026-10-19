/* merlin · o perfil
   o que e da PESSOA e nao do sistema: quem esta aqui, como o Merlin se
   parece, o que ela ja viu e o que ela tem guardado.

   nasceu porque o tema era um interruptor solto no fim da barra, ao lado de
   nada — e porque nao havia lugar nenhum para "esta e a minha conta" alem de
   um cartao apertado no rodape da navegacao. nada aqui e configuracao do
   produto: o Merlin nao tem preferencias que mudem o que ele faz. */
import "./shared/base.css";
import "./profile.css";
import {
  initPage, cloud, signIn, collection, savedTheme, setTheme, currentTheme,
  seen, markSeen, forgetSeen, notify
} from "./shared/core.js";
import { useState, useEffect } from "react";
import { mount, useCloud, icon } from "./shared/ui.jsx";
import { Tour } from "./shared/tour.jsx";

initPage("profile");

/* as colecoes que a pessoa tem, na ordem da barra (hoje, ideias, produtos,
   distribuicao, clientes, dinheiro) */
const KINDS = [
  { type: "tasks", one: "tarefa", many: "tarefas", href: "calendar.html" },
  { type: "habits", one: "hábito", many: "hábitos", href: "habits.html" },
  { type: "notes", one: "nota", many: "notas", href: "notes.html" },
  { type: "maps", one: "mapa", many: "mapas", href: "maps.html" },
  { type: "apps", one: "produto", many: "produtos", href: "apps.html" },
  { type: "funnels", one: "funil", many: "funis", href: "funnels.html" },
  { type: "content", one: "peça", many: "peças", href: "content.html" },
  { type: "clients", one: "cliente", many: "clientes", href: "clients.html" },
  { type: "finance", one: "lançamento", many: "lançamentos", href: "finance.html" }
];

const THEMES = [
  { id: "", label: "o do sistema" },
  { id: "light", label: "claro" },
  { id: "dark", label: "escuro" }
];

/* o que o Merlin usa para medir a semana e para saber o que você entregou:
   a meta de horas de foco, o teto de reunião e o usuário do GitHub. mora no
   perfil (profile/me), o mesmo documento que o onboarding cria */
function Rhythm() {
  const profile = collection("profile");
  const me = profile.get("me") || { id: "me", createdAt: Date.now() };
  const [v, setV] = useState({ github: me.github || "", focusGoal: me.focusGoal || "", meetingCap: me.meetingCap || "" });
  const save = (e) => {
    e.preventDefault();
    const num = (x) => { const n = Math.round(+String(x).replace(",", ".") || 0); return n > 0 && n <= 120 ? n : ""; };
    profile.save({ ...me, github: v.github.trim().replace(/^@/, ""), focusGoal: num(v.focusGoal), meetingCap: num(v.meetingCap), updatedAt: Date.now() });
    notify("ritmo guardado");
  };
  const bind = (k) => ({ value: v[k], onChange: (e) => setV({ ...v, [k]: e.currentTarget.value }) });
  return (
    <section className="block col-12">
      <p className="heading"><span className="t-mono">o seu ritmo</span></p>
      <p className="note">A semana do início mede o foco contra a meta e a reunião contra o teto. O teto é um limite: a semana boa fica abaixo dele.</p>
      <form className="pf-rhythm" onSubmit={save}>
        <label><span>meta de foco por semana</span><input className="input" inputMode="numeric" placeholder="ex.: 25" {...bind("focusGoal")} /><small>horas</small></label>
        <label><span>teto de reunião por semana</span><input className="input" inputMode="numeric" placeholder="ex.: 6" {...bind("meetingCap")} /><small>horas</small></label>
        <label><span>usuário do GitHub</span><input className="input" placeholder="ex.: arttreis" {...bind("github")} /><small>só o público</small></label>
        <button className="pill pill--accent" type="submit">guardar</button>
      </form>
    </section>
  );
}

function Profile() {
  const c = useCloud();
  /* o tema nao mora em estado: mora na classe do <html>, e o core e quem
     escreve. aqui so guardamos qual foi a ESCOLHA (que pode ser "nenhuma"),
     porque e ela que o botao precisa mostrar como ativa. */
  const [choice, setChoice] = useState(savedTheme);
  const [, redraw] = useState(0);
  const [tour, setTour] = useState(false);
  const email = c.signedIn ? String(c.email || "") : "";

  /* seguir o sistema significa mudar quando ele muda, inclusive com a pagina
     aberta — senao "o do sistema" e so o tema de quando a pagina carregou */
  useEffect(() => {
    if (choice) return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const f = () => { setTheme(""); redraw((n) => n + 1); };
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [choice]);

  const chooseTheme = (id) => { setTheme(id); setChoice(id); redraw((n) => n + 1); };

  const counts = KINDS.map((k) => ({ ...k, n: collection(k.type).all().length }));
  const nothing = counts.every((k) => !k.n);

  return (
    <>
      <div className="header">
        <div>
          <h1>perfil</h1>
          <p className="sub">o que é seu: a sessão, a aparência e o que está guardado.</p>
        </div>
      </div>

      <div className="grid">
        {/* ---------- quem está aqui ---------- */}
        <section className="block col-6">
          <p className="heading"><span className="t-mono">quem está aqui</span></p>
          <div className="pf-who">
            <span className={"pf-avatar" + (email ? "" : " is-out")}>{email ? email[0].toUpperCase() : "?"}</span>
            <div className="pf-who__text">
              <b>{email ? email.split("@")[0] : "só você"}</b>
              <span>{email || "sem sessão — o Merlin vive só neste navegador"}</span>
            </div>
          </div>
          <div className="pf-cloud" data-status={c.status}>
            <i className="dot" />
            <span>{c.status === "synced" ? "sincronizado" : c.status === "offline" ? "sem conexão" : c.status === "error" ? "não consegui sincronizar" : "só neste navegador"}</span>
          </div>
          <p className="note">
            Entrar não é ver: cada e-mail tem o seu Merlin inteiro, e nenhuma consulta
            atravessa essa linha. O que o time divide é o endereço e o custo — nunca o dia,
            o cliente nem o financeiro.
          </p>
          <div className="pf-actions">
            {c.signedIn
              ? <button className="pill" type="button" onClick={() => c.signOut()}>sair</button>
              : <button className="pill pill--accent" type="button" onClick={() => signIn.show()}>entrar</button>}
            {c.status === "error" && <button className="pill" type="button" onClick={() => c.syncAll()}>tentar de novo</button>}
          </div>
        </section>

        {/* ---------- aparência ---------- */}
        <section className="block col-6">
          <p className="heading"><span className="t-mono">aparência</span></p>
          <p className="note">O tema morava solto no fim da barra de navegação. Aqui ele tem
          uma terceira resposta, que o interruptor não sabia dar: seguir o sistema.</p>
          <div className="chips">
            {THEMES.map((t) => (
              <button key={t.id || "auto"} className="chip" type="button"
                      aria-pressed={String(choice === t.id)} onClick={() => chooseTheme(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <p className="pf-now t-mono">agora: {currentTheme() === "light" ? "claro" : "escuro"}</p>

          <div className="pf-sep" />
          <p className="heading"><span className="t-mono">a apresentação</span></p>
          <p className="note">
            {seen("tour-areas")
              ? "Você já viu como o Merlin se organiza. Dá para rever quando quiser."
              : "Você ainda não viu a apresentação — ela abre sozinha no início."}
          </p>
          <div className="pf-actions">
            <button className="pill" type="button" onClick={() => setTour(true)}>{icon("spark")}<span>ver a apresentação</span></button>
            {seen("tour-areas") && (
              <button className="pill" type="button"
                      onClick={() => { forgetSeen("tour-areas"); notify("ela volta a abrir sozinha no início"); }}>
                esquecer que eu vi
              </button>
            )}
          </div>
        </section>

        {/* ---------- o ritmo (VISAO, 11) ---------- */}
        <Rhythm />

        {/* ---------- o que está guardado ---------- */}
        <section className="block col-12">
          <p className="heading"><span className="t-mono">o que está guardado</span></p>
          {nothing
            ? <p className="empty">Nada ainda. O Ctrl K é o jeito mais curto de começar: com duração vai para hoje, sem duração vira nota.</p>
            : (
              <ul className="pf-counts">
                {counts.filter((k) => k.n).map((k) => (
                  <li key={k.type}>
                    <a href={k.href}>
                      <b className="t-mono">{k.n}</b>
                      <span>{k.n === 1 ? k.one : k.many}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          <p className="note">
            Tudo isso mora no seu navegador primeiro. {c.signedIn
              ? "Como você entrou, sobe também para a nuvem e aparece em qualquer aparelho onde você entrar."
              : "Sem entrar, fica só aqui: outro navegador é outro Merlin."}
          </p>
        </section>
      </div>
      {tour && <Tour onClose={() => { setTour(false); markSeen("tour-areas"); }} />}
    </>
  );
}

mount(<Profile />, "app");
