/* merlin · clientes
   quem fechou. cada cliente abre numa pagina: o que importa em cima (as
   propriedades e o que falta), e embaixo as abas — pagina, notas, arquivos,
   tarefas, historico, canais, objetivos e cofre. quem ainda nao fechou mora
   em prospeccao.html, no mesmo documento. */
import "./shared/base.css";
import "./clients.css";
import {
  initPage, collection, newId, notify, api, cloud, newNote, today,
  dateLabel, dayOf, brl, parseMoney, parseDuration, formatMin,
  uploadFile, deleteFile, fileUrl, isImage, FILE_TYPES
} from "./shared/core.js";
import { useState, useEffect, useRef, useLayoutEffect, Fragment } from "react";
import {
  mount, useCollection, useHash, setHash, useKeydown, isTyping,
  useFields, Form, Field, Dialog, Markdown, TemplatePicker, EmptyStart, ChannelThumb, icon,
  useDelegate, DelegateDialog, DateField, MoneyInput
} from "./shared/ui.jsx";
import {
  normalize, STATUS_LABEL, CLIENT_STATUSES, RECURRENCES, RECURRENCE_LABEL, FILE_KINDS, kindFromName,
  isClient, isPipeline, journalEntry, syncNext, waUrl, igUrl, siteUrl
} from "./shared/client-doc.js";
import { normalize as normalizeTask } from "./shared/tasks.js";
import { TaskDialog } from "./shared/task-form.jsx";
import {
  CHANNEL_TYPES, CHANNEL_LABEL, CHANNEL_CHECKLISTS, FUNNEL_TEMPLATES, funnelGroups, funnelChain, buildFunnel,
  CLIENT_TEMPLATES, clientGroups, clientChannels, buildClient
} from "./shared/templates.js";
import { layoutNodes } from "./shared/funnel-layout.js";

initPage("clients");

/* ---------- forma do documento ----------
   valores de enum em ingles no documento; o rotulo em portugues so na tela. */

const JOURNAL_TYPES = ["note", "meeting", "decision", "delivery"];
/* "event" e o que o sistema escreve sozinho (fechou, mudou de status, subiu
   contrato): nao aparece na caixa de registrar, so na linha do tempo */
const JOURNAL_LABEL = { note: "nota", meeting: "reunião", decision: "decisão", delivery: "entrega", event: "marco" };

/* o vocabulario de canal (tipos, rotulos e o checklist de cada um) mora em
   shared/templates.js, junto dos funis de cada canal: e o mesmo assunto. */

/* a ordem é a do uso, não a do organograma: quem abre um cliente quer saber o
   que fazer (backlog) e o que aconteceu (diário) muito mais vezes do que quer
   reler o CNPJ. a ficha desceu por isso, e não por ser menos importante.

   a aba de ofertas saiu. ela era write-only: nada no sistema lia
   `client.offers` além da pauta de reunião — nem o funil, que tem a própria
   lista de ofertas com promessa, garantia e escada, e que é a oferta comercial
   de verdade. e o enum dela era um híbrido que ensinava o mal-entendido:
   "produto" e "serviço" puxam para catálogo, "bump" e "upsell" para oferta
   comercial. o catálogo tem sistema de registro próprio — o Mercado Livre, a
   Shopify — e uma segunda verdade aqui dentro é uma que ninguém mantém. */
/* o painel e a ficha sairam: o que eles mostravam subiu para o topo da pagina
   (as propriedades e o "falta"), que e visto sem clicar em aba nenhuma. o
   backlog virou "tarefas": o que tem data mora no calendario, e o que ainda
   nao tem continua aqui, esperando virar tarefa. o diario virou "historico". */
const TABS = [
  { id: "page", label: "página" },
  { id: "notes", label: "notas" },
  { id: "files", label: "arquivos" },
  { id: "tasks", label: "tarefas" },
  { id: "journal", label: "histórico" },
  { id: "channels", label: "canais" },
  { id: "goals", label: "objetivos" },
  { id: "vault", label: "cofre" }
];
const TAB_IDS = TABS.map((t) => t.id);

/* a forma do documento mora em shared/client-doc.js: a prospeccao grava na
   mesma colecao, e dois normalizadores apagariam os campos um do outro. */

/* icones que nao moram no core por serem exclusivos desta pagina */
const BoltIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
  </svg>
);
const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
  </svg>
);
const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
  </svg>
);

const isNarrow = () => matchMedia("(max-width:880px)").matches;
const journalDate = (at) => dateLabel(dayOf(new Date(at)), true);

/* ---------- a lista ---------- */

const lastContact = (c) => c.journal.reduce((m, e) => Math.max(m, +e.at || 0), c.createdAt);
/* "faz tempo": so vale a pena avisar de quem esta ativo — cliente pausado
   ou encerrado nao precisa de contato, entao nao ganha o traço. */
const isStale = (c) => c.status === "active" && (Date.now() - lastContact(c)) > 14 * 86400000;
function compareClients(a, b) {
  const pa = a.status === "active" ? 0 : 1, pb = b.status === "active" ? 0 : 1;
  return pa - pb || a.name.localeCompare(b.name, "pt-BR");
}
function compareBacklog(a, b) {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.due && b.due) return a.due.localeCompare(b.due) || a.createdAt - b.createdAt;
  if (a.due) return -1;
  if (b.due) return 1;
  return a.createdAt - b.createdAt;
}

/* ---------- cofre de acessos: a criptografia ----------
   segredo e nota de cada item viajam cifrados (AES-GCM 256) com uma chave
   derivada por PBKDF2 da senha-mestra + um sal do sistema. o servidor —
   e qualquer sincronia — so vai ver o campo "encrypted" em base64: sem a
   senha-mestra, e so ruido. rotulo/usuario/url ficam em claro no documento
   porque sao o indice do cofre (para listar sem destrancar nada faria
   sentido, mas aqui a tela inteira pede a senha antes de mostrar qualquer
   coisa — mais simples, e o cliente ja tem poucos acessos). */

function toBase64(bytes) {
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
function fromBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/* deriva a chave e devolve so o CryptoKey, nao extraivel: a senha em texto
   puro nao sobrevive alem desta funcao, e a chave em si nunca vira bytes
   legiveis por outro codigo desta pagina — so o subtle.encrypt/decrypt a
   usam. 300 mil iteracoes e o piso atual do OWASP para PBKDF2-SHA256: lento
   o bastante para encarecer forca bruta, rapido o bastante para nao incomodar
   quem digita a senha certa uma vez por sessao. */
async function deriveKey(password, saltBase64) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromBase64(saltBase64), iterations: 300000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
async function encryptItem(key, secret, note) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify({ secret, note }));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { encrypted: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
}
/* AES-GCM autentica o que cifra: com a chave errada isto lanca (nao devolve
   lixo silencioso) — e exatamente o sinal que usamos para dizer "senha não
   bate" em vez de mostrar um segredo qualquer decifrado errado. */
async function decryptItem(key, item) {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(item.iv) }, key, fromBase64(item.encrypted)
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

function copyText(text, msg) {
  if (!text) return;
  navigator.clipboard?.writeText(text).then(() => notify(msg)).catch(() => notify("não consegui copiar"));
}

/* ---------- Merlin: o contexto da reuniao ---------- */

function contractText(c) {
  const parts = [];
  if (c.contract.scope) parts.push(c.contract.scope);
  parts.push(brl(c.contract.value));
  if (c.contract.recurrence) parts.push(RECURRENCE_LABEL[c.contract.recurrence]);
  return parts.join(" — ");
}
function meetingContext(c) {
  return {
    name: c.name,
    status: STATUS_LABEL[c.status] || c.status,
    summary: c.summary,
    contract: contractText(c),
    goals: c.goals.map((g) => g.text + " · " + (g.keyResult || "") + " · " + (g.due || "sem prazo") + " · " + (g.done ? "feito" : "aberto")),
    backlog: c.backlog.filter((b) => !b.done).map((b) => b.text + " · " + (b.due || "sem prazo")),
    channels: c.channels.map((ch) => {
      const done = ch.items.filter((i) => i.done).length;
      const missing = ch.items.filter((i) => !i.done).map((i) => i.text);
      return ch.name + " · " + done + " de " + ch.items.length + " feitos · faltam: " + (missing.join(", ") || "nada");
    }),
    journal: c.journal.slice().sort((a, b) => b.at - a.at).slice(0, 15)
      .map((e) => journalDate(e.at) + " · " + (JOURNAL_LABEL[e.type] || e.type) + " · " + e.text),
    /* as ofertas vêm dos funis dele, que é onde elas moram desde que a aba do
       cliente saiu. por id, nunca por cópia: se o funil mudar o preço, a pauta
       da próxima reunião já sai com o novo. */
    offers: collection("funnels").all()
      .filter((f) => f.client === c.id)
      .flatMap((f) => (f.offers || []).map((o) => o.name + " · " + brl(o.price) + " · " + f.name))
  };
}

/* ---------- a pagina ----------
   o estado de tela mora aqui: o cliente aberto, a aba, as caixas abertas, a
   chave-mestra do cofre. nada disso e documento — some ao recarregar. */
function Clients() {
  /* clients.html e a dona da colecao "clients". initPage() ja a abriu para
     as outras paginas terem nome e status; passar o normalizador aqui a
     entrega a colecao existente. */
  const clients = useCollection("clients", { normalize });
  /* funis sao de funnels.html: aqui so lemos os de cada canal e criamos um
     vazio a partir dele */
  const funnels = useCollection("funnels");
  /* "config" e o unico doc desta colecao: guarda o sal (16 bytes, base64)
     que deriva a chave-mestra do cofre para o sistema inteiro. nao ha um por
     cliente porque a senha-mestra tambem e uma so — o Arthur digita ela uma
     vez por sessao, nao uma por cliente. */
  const vaultStore = useCollection("vault");
  const hash = useHash();
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("page");
  const [newForm, setNewForm] = useState(null);         // { name?, summary?, ideaOrigin?, template? } | null
  const [confirming, setConfirming] = useState(false);
  const [meeting, setMeeting] = useState(null);         // texto da pauta | null
  const [thinking, setThinking] = useState(false);
  /* o cofre inteiro do sistema abre com UMA chave (Web Crypto, nao
     extraivel): ela mora só neste estado, nunca em localStorage/colecao, e
     some quando a aba fecha, recarrega ou o Arthur clica "trancar". sem isso
     guardado em lugar nenhum, nao existe "esqueci a senha e recupero depois"
     — perder a senha-mestra perde o cofre. e escolha: e o preco de nem o
     servidor, nem este navegador amanha, conseguirem ler os segredos sem ela. */
  const [masterKey, setMasterKey] = useState(null);
  const [vaultDialog, setVaultDialog] = useState(null); // { error } | null
  /* o id aberto, legivel de dentro de closures velhas (efeito do hash,
     desfazer, atalhos) sem depender do render em que nasceram */
  const selectedRef = useRef(null);
  selectedRef.current = selectedId;

  const doc = selectedId ? clients.get(selectedId) : null;
  /* prospecto e perdido moram na prospeccao: aqui so quem fechou */
  const list = clients.all().filter(isClient).sort(compareClients);

  /* ---------- abrir / fechar o painel ---------- */

  /* tira o #id da url sem entrar no historico, e avisa o useHash na hora —
     e isso que o setHash do ui.jsx faz, porque o replaceState sozinho nao
     dispara hashchange */
  const clearHash = () => setHash("");
  const openClient = (id) => {
    const c = clients.get(id);
    if (!c) return;
    /* um link antigo (busca, nota, tarefa) ainda pode apontar para quem esta
       no funil: a pagina dele e a da prospeccao */
    if (!isClient(c)) { location.replace("prospecting.html#" + encodeURIComponent(id)); return; }
    setSelectedId(id);
    setTab("page");
    if (location.hash.slice(1) !== id) setHash(id);
  };
  const closePanel = () => { setSelectedId(null); clearHash(); };
  const openNew = (prefill) => setNewForm(prefill || {});
  const closeNew = () => { setNewForm(null); if (!selectedRef.current) clearHash(); };

  /* ---------- rota por hash ----------
     "#<id>" abre o cliente; "#new?idea=<id>" abre a caixa de novo cliente
     (o parametro e o campo ideaOrigin seguem com o nome antigo: sao dado
     gravado, e renomea-los custaria uma migracao por cosmetica)
     ja com o titulo e o corpo da nota (leitura so: quem normaliza e e dona
     da colecao "notes" e notes.html). hash vazio fecha o painel. */
  useEffect(() => {
    if (!hash) { if (selectedRef.current) closePanel(); return; }
    if (hash.startsWith("new")) {
      const q = new URLSearchParams(hash.split("?")[1] || "");
      const noteId = q.get("idea");
      const note = noteId ? collection("notes").get(noteId) : null;
      openNew(note ? { name: String(note.title || ""), summary: String(note.body || ""), ideaOrigin: noteId } : null);
      return;
    }
    if (clients.has(hash)) openClient(hash);
  }, [hash]);

  /* o cliente aberto sumiu (apagado em outra aba ou na nuvem): fecha o painel */
  useEffect(() => { if (selectedId && !clients.has(selectedId)) closePanel(); });

  /* ---------- gravar ----------
     toda edicao passa por aqui: copia o doc vivo, muda, carimba e grava.
     ler de novo da colecao (e nao do render) evita que duas edicoes no mesmo
     tick pisem uma na outra. */
  const update = (mutate) => {
    const current = clients.get(selectedRef.current);
    if (!current) return;
    const d = structuredClone(current);
    mutate(d);
    d.updatedAt = Date.now();
    clients.save(d);
  };
  const updateItem = (listOf, id, mutate) => update((d) => {
    const arr = listOf(d);
    const x = arr && arr.find((i) => i.id === id);
    if (x) mutate(x);
  });
  /* remove um item de um array que vive dentro do doc aberto, sempre com
     desfazer — e a mesma casca para contato, link, canal, item de canal,
     objetivo, passo, item de backlog, oferta e acesso do cofre. o desfazer
     reinsere na mesma posicao, por cima do que mudou desde entao. */
  const removeFrom = (listOf, id, text) => {
    const current = clients.get(selectedRef.current);
    if (!current) return;
    const d = structuredClone(current);
    const arr = listOf(d);
    if (!arr) return;
    const i = arr.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [removed] = arr.splice(i, 1);
    d.updatedAt = Date.now();
    clients.save(d);
    notify(text, () => {
      const now = clients.get(d.id);
      if (!now) return;
      const back = structuredClone(now);
      const arr2 = listOf(back);
      if (!arr2) return;
      arr2.splice(Math.min(i, arr2.length), 0, removed);
      back.updatedAt = Date.now();
      clients.save(back);
    });
  };
  /* clearOffers e declarado mais abaixo; a seta adia a leitura para a hora do
     clique, em vez de estourar no render por ler um const que ainda nao nasceu. */
  const ctx = { update, updateItem, removeFrom, funnels, setTab, clearOffers: () => clearOffers(), backToPipeline: () => backToPipeline() };

  /* ---------- criar e apagar ---------- */

  const createClient = ({ name, status, summary, ideaOrigin, template }) => {
    const now = Date.now();
    /* o modelo entra por baixo: nome e status sao sempre o que a pessoa
       escolheu na caixa, e o resto (canais com checklist, objetivos,
       backlog) vem dele. dali pra frente e texto — o documento nao guarda
       de que modelo veio, e o modelo nunca mais o alcanca. */
    const seed = template ? buildClient(template, name) : null;
    const created = normalize({
      ...(seed || {}),
      id: newId(), name, status,
      summary: summary || (seed ? seed.summary : ""),
      ideaOrigin: ideaOrigin || "", createdAt: now, updatedAt: now
    });
    created.journal = [journalEntry(ideaOrigin ? "entrou como cliente, a partir de uma nota" : "entrou direto como cliente, sem passar pela prospecção")];
    created.wonAt = now;
    clients.save(created);
    setNewForm(null);
    openClient(created.id);
    /* a caixa ja fechou aqui; devolver false impede o Form de chamar o
       closeNew, que limparia o hash que acabamos de escrever */
    return false;
  };
  const deleteClient = () => {
    if (!doc) return;
    const id = doc.id, name = doc.name;
    const before = clients.remove(id);
    setConfirming(false);
    closePanel();
    notify('cliente "' + name + '" apagado', () => { clients.save(before); openClient(id); });
  };
  /* fechou e nao era bem isso: volta para a negociacao, com o que ja se sabe */
  const backToPipeline = () => {
    if (!doc) return;
    const id = doc.id;
    update((d) => { d.status = "prospect"; d.stage = "negotiation"; d.stageAt = Date.now(); d.journal.push(journalEntry("voltou para a prospecção, em negociação")); });
    /* sem desfazer: a pagina muda logo em seguida, e o caminho de volta e o
       "fechou" de la, que registra de novo */
    location.href = "prospecting.html#" + encodeURIComponent(id);
  };

  /* ---------- Merlin: preparar reuniao ---------- */

  /* limpar as ofertas antigas é uma decisão, não uma faxina: só acontece
     quando a pessoa diz que já as levou para o funil, e desfaz. */
  const clearOffers = () => {
    if (!doc) return;
    const before = doc.offers;
    update((d) => { d.offers = []; });
    notify("limpei as ofertas antigas", () => update((d) => { d.offers = before; }));
  };

  const askMeeting = async () => {
    if (!doc || thinking) return;
    setThinking(true);
    try {
      const r = await api("/merlin", { method: "POST", body: JSON.stringify({ task: "meeting", context: meetingContext(doc) }) });
      if (r.ok) setMeeting(r.body.text || "");
      else if (r.status === 401) notify("entre para usar o Merlin");
      else notify(r.body.error || "o Merlin não respondeu — tenta de novo daqui a pouco");
    } catch (e) {
      notify("não consegui falar com o Merlin");
    } finally { setThinking(false); }
  };
  /* nao entra sozinha porque isto e uma sugestao de pauta, nao um fato — o
     diario e o registro do que realmente aconteceu na reuniao (append only,
     de proposito). guardar e um gesto do Arthur depois de ler e concordar com
     o que o Merlin escreveu, nunca automatico. */
  const keepMeeting = () => {
    if (!doc) return;
    const text = meeting;
    update((d) => { d.journal.push({ id: newId(), at: Date.now(), type: "meeting", text }); });
    setMeeting(null);
    notify("pauta guardada no histórico");
  };

  /* ---------- cofre: a chave ---------- */

  const openVaultDialog = (error) => setVaultDialog({ error: error || "" });
  const lockVault = () => setMasterKey(null);
  const unlockVault = async (password) => {
    let config = vaultStore.get("config");
    if (!config) {
      config = { id: "config", salt: toBase64(crypto.getRandomValues(new Uint8Array(16))) };
      vaultStore.save(config);
    }
    const key = await deriveKey(password, config.salt);
    setMasterKey(key);
    setVaultDialog(null);
  };
  const vault = { key: masterKey, open: openVaultDialog, lock: lockVault };

  /* ---------- atalhos: n abre um cliente novo, / vai para a busca ----------
     Esc e dos dialogos, que se fecham sozinhos; fora deles, no celular, Esc
     volta do painel para a lista. */
  useKeydown((e) => {
    if (e.key === "Escape") { if (selectedRef.current && isNarrow()) closePanel(); return; }
    if (isTyping()) return;
    if (e.key === "/") {
      e.preventDefault();
      const s = document.getElementById("sb-search");
      if (s) { s.focus(); s.select(); }
      return;
    }
    if (e.key === "n" || e.key === "N") { e.preventDefault(); openNew(); }
  });

  return (
    <>
      <div className="header">
        <div>
          <h1>clientes</h1>
          <ClientsSummary list={list} />
        </div>
        <div className="actions">
          <button className="pill pill--green" type="button" id="new-client-btn" onClick={() => openNew()}>{icon("plus")}cliente</button>
        </div>
      </div>

      {/* sem nenhum cliente, a tela de duas colunas nao tem o que mostrar em
          nenhuma das duas. no lugar dela, os tipos de negocio: escolher um
          ja monta os canais com checklist, os objetivos e o backlog. */}
      {!list.length ? (
        <EmptyStart
          title="de que tipo é o primeiro cliente?"
          text="Cada modelo é um tipo de negócio, não um cliente de mentira. Ele nasce com os canais daquele tipo (cada um com o próprio checklist), os objetivos que aquela operação persegue e o backlog do que precisa existir antes de qualquer campanha. Tudo editável a partir daí."
          groups={clientGroups().map((g) => ({
            ...g,
            items: g.items.map((t) => ({ ...t, hint: clientChannels(t).join(" · ") }))
          }))}
          thumb={(t) => <ChannelThumb labels={clientChannels(t)} />}
          onPick={(t) => setNewForm({ template: t.id })}
          onBlank={() => openNew({ template: "" })}
          blankRow blankLabel="cliente em branco" blankNote="a ficha vazia, e você preenche" />
      ) : (
      <div className="clients-screen" id="screen" data-view={selectedId ? "panel" : "list"}>
        <section className="list-column">
          {CLIENT_STATUSES.map((st) => {
            const group = list.filter((c) => c.status === st);
            if (!group.length) return null;
            return (
              <div key={st} className="client-group">
                <p className="client-group__head"><span className="t-mono">{STATUS_LABEL[st]}</span><span className="t-mono">{group.length}</span></p>
                <ul className="list" id={st === "active" ? "client-list" : undefined}>
                  {group.map((c) => <ClientRow key={c.id} c={c} active={c.id === selectedId} onOpen={() => openClient(c.id)} />)}
                </ul>
              </div>
            );
          })}
        </section>

        <section className="panel-column">
          {doc
            ? <Panel key={doc.id} doc={doc} tab={tab} ctx={ctx} vault={vault} thinking={thinking}
                onBack={closePanel} onDelete={() => setConfirming(true)} onMeeting={askMeeting} />
            : <div className="block" id="panel-empty"><p className="empty">escolha um cliente na lista, ou crie um novo</p></div>}
        </section>
      </div>
      )}

      {newForm && <ClientForm prefill={newForm} onCreate={createClient} onClose={closeNew} />}
      {confirming && doc && (
        <Dialog title="apagar cliente?" label="Confirmar" onClose={() => setConfirming(false)}
            sub={'isso apaga "' + doc.name + '" e tudo que está nele — dá para desfazer logo em seguida.'}
            actions={<><button className="pill" type="button" onClick={() => setConfirming(false)}>cancelar</button><button className="pill pill--green" type="button" id="confirm-delete-btn" onClick={deleteClient}>apagar</button></>} />
      )}
      {meeting != null && <MeetingDialog text={meeting} onClose={() => setMeeting(null)} onKeep={keepMeeting} />}
      {vaultDialog && <VaultPasswordForm isNew={!vaultStore.get("config")} error={vaultDialog.error} onUnlock={unlockVault} onClose={() => setVaultDialog(null)} />}
    </>
  );
}

/* ---------- o resumo do cabecalho ----------
   os numeros moram numa frase, e nao numa fileira de cartoes iguais: a tela
   de clientes e a lista e a pagina, e o numero so acompanha. */
function ClientsSummary({ list }) {
  if (!list.length) return <p className="sub">quem fechou: a página, os arquivos, as tarefas e o histórico de cada um</p>;
  const active = list.filter((c) => c.status === "active");
  const monthly = active.filter((c) => c.contract.recurrence === "monthly").reduce((s, c) => s + c.contract.value, 0);
  const stale = active.filter(isStale).length;
  const parts = [<><b>{active.length}</b> {active.length === 1 ? "ativo" : "ativos"}</>];
  if (monthly) parts.push(<><b>{brl(monthly)}</b> por mês em contrato</>);
  if (stale) parts.push(<><b>{stale}</b> sem registro há mais de 14 dias</>);
  return <p className="sub sub--numbers">{parts.map((p, i) => <Fragment key={i}>{i ? " · " : ""}{p}</Fragment>)}</p>;
}

const initial = (name) => ((String(name || "").match(/[a-z0-9à-ÿ]/i) || ["?"])[0]).toUpperCase();

/* ---------- um cliente na lista ----------
   sem filtro: a lista e curta, agrupada por status, e a busca global da
   sidebar acha qualquer cliente pelo nome */
function ClientRow({ c, active, onOpen }) {
  const detail = [String(c.contract.scope || "").split("\n")[0], c.contract.value ? brl(c.contract.value) + (c.contract.recurrence === "monthly" ? "/mês" : "") : ""].filter(Boolean).join(" · ");
  return (
    <li className={"line client-row" + (active ? " is-active" : "")} data-id={c.id} tabIndex="0" role="button"
        onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
      <span className="avatar" aria-hidden="true">{initial(c.name)}</span>
      <span className="client-row__text">
        <span className="name">{c.name}</span>
        {detail && <small>{detail}</small>}
      </span>
      {isStale(c) && <span className="client-row__stale" title="mais de 14 dias sem registro no histórico" />}
    </li>
  );
}

/* a barra de cima de cada aba: o rotulo e o "+" que abre a caixa de criar —
   nenhum formulario fica aberto no meio da lista */
const TabBar = ({ label, button, id, onAdd }) => (
  <p className="heading mb2"><span className="t-mono">{label}</span>{onAdd && <button className="pill pill--mini" type="button" id={id} onClick={onAdd}>{icon("plus")}{button}</button>}</p>
);

/* um textarea de uma linha que cresce com o texto: o escopo do contrato as
   vezes e uma frase, as vezes um paragrafo, e um <input> comeria as quebras */
function AutoText({ value, onChange, ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => { const t = ref.current; if (t) { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; } }, [value]);
  return <textarea ref={ref} rows="1" {...rest} value={value} onChange={onChange} />;
}

/* ---------- a pagina do cliente ---------- */
function Panel({ doc, tab, ctx, vault, thinking, onBack, onDelete, onMeeting }) {
  const [taskFor, setTaskFor] = useState(null);   // {title, backlogId?} | null
  const tasks = useCollection("tasks", { normalize: normalizeTask });
  const openTasks = tasks.all().filter((t) => t.client === doc.id && !t.done).length;
  const notesCount = collection("notes").all().filter((n) => n.client === doc.id && n.stage !== "archived").length;
  const counts = { notes: notesCount, files: doc.files.length, tasks: openTasks + doc.backlog.filter((b) => !b.done).length };
  const content =
    tab === "notes" ? <ClientNotes doc={doc} /> :
    tab === "files" ? <Files doc={doc} ctx={ctx} /> :
    tab === "tasks" ? <ClientTasks doc={doc} ctx={ctx} tasks={tasks} onTask={setTaskFor} /> :
    tab === "journal" ? <Journal doc={doc} ctx={ctx} /> :
    tab === "channels" ? <Channels doc={doc} ctx={ctx} /> :
    tab === "goals" ? <Goals doc={doc} ctx={ctx} /> :
    tab === "vault" ? <Vault doc={doc} ctx={ctx} masterKey={vault.key} openDialog={vault.open} lock={vault.lock} /> :
    <PageTab doc={doc} ctx={ctx} />;
  return (
    <div id="client-panel" className="client-page block">
      <div className="panel-head">
        <button className="pill back-btn" type="button" id="back-btn" onClick={onBack}>‹ clientes</button>
        <span className="spacer" />
        <button className="pill pill--mini" type="button" onClick={() => setTaskFor({ title: "" })}>{icon("plus")}tarefa</button>
        <button className="pill pill--mini" type="button" id="meeting-btn" disabled={thinking} onClick={onMeeting}
            title="pedir ao Merlin uma pauta a partir da página, canais, objetivos e histórico">
          {thinking ? "pensando…" : <><BoltIcon /> preparar reunião</>}
        </button>
        <button className="pill pill--mini" type="button" title="devolve para a prospecção, em negociação" onClick={ctx.backToPipeline}>voltar para a prospecção</button>
        <button className="action" type="button" id="delete-client-btn" title="apagar cliente" aria-label="Apagar cliente" onClick={onDelete}>{icon("trash")}</button>
      </div>

      <div className="client-hero">
        <span className="avatar avatar--big" aria-hidden="true">{initial(doc.name)}</span>
        <div className="client-hero__names">
          <input className="client-hero__name" id="panel-name" aria-label="nome" placeholder="sem nome" value={doc.name}
                 onChange={(e) => ctx.update((d) => { d.name = e.currentTarget.value.slice(0, 120); })} />
          <input className="client-hero__brand" aria-label="operação ou marca" placeholder="operação / marca" value={doc.brand}
                 onChange={(e) => ctx.update((d) => { d.brand = e.currentTarget.value.slice(0, 120); })} />
        </div>
      </div>

      <Properties doc={doc} ctx={ctx} />
      <Pending doc={doc} ctx={ctx} />

      <div className="tabs" id="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} className="tab" type="button" role="tab" data-tab={t.id} aria-selected={tab === t.id} onClick={() => ctx.setTab(t.id)}>
            {t.label}{counts[t.id] ? <span className="tab__count">{counts[t.id]}</span> : null}
          </button>
        ))}
      </div>
      <div id="tab-content" role="tabpanel">{content}</div>

      {taskFor && <TaskDialog title={taskFor.title} client={doc.id} origin={{ type: "client", id: doc.id }}
                              heading={taskFor.backlogId ? "virar tarefa" : "nova tarefa"}
                              onClose={() => setTaskFor(null)}
                              onCreated={() => { if (taskFor.backlogId) ctx.update((d) => { d.backlog = d.backlog.filter((b) => b.id !== taskFor.backlogId); }); }} />}
    </div>
  );
}

/* ---------- as propriedades ----------
   o que se consulta toda vez que o cliente abre, numa ficha de duas colunas:
   o rotulo a esquerda, o valor editavel no lugar a direita. vazio fica cinza
   e continua clicavel — nao ha modo de edicao, so o campo. */
const Prop = ({ label, children }) => (
  <div className="prop"><span className="prop__k">{label}</span><div className="prop__v">{children}</div></div>
);

function Properties({ doc, ctx }) {
  const { update } = ctx;
  const setStatus = (st) => {
    if (doc.status === st) return;
    update((d) => { d.status = st; d.journal.push(journalEntry("status: " + STATUS_LABEL[st])); });
    const now = collection("clients").get(doc.id);
    if (now) syncNext(now);
  };
  const setNext = (patch) => {
    update((d) => { Object.assign(d, patch); });
    const now = collection("clients").get(doc.id);
    if (now) syncNext(now);
  };
  const open = (href, label) => href ? <a className="prop__open" href={href} target="_blank" rel="noopener">{label}</a> : null;
  const origin = doc.ideaOrigin && collection("notes").get(doc.ideaOrigin);
  const cameFrom = [doc.source, origin ? "nota: " + (origin.title || "sem título") : ""].filter(Boolean).join(" · ");
  return (
    <div className="props">
      <Prop label="status">
        <div className="chips">
          {CLIENT_STATUSES.map((st) => (
            <button key={st} type="button" className={"chip" + (st === "active" ? " chip--green" : "")} aria-pressed={doc.status === st} onClick={() => setStatus(st)}>{STATUS_LABEL[st]}</button>
          ))}
        </div>
      </Prop>
      <Prop label="o que foi fechado">
        <AutoText className="prop__input" placeholder="vazio" value={doc.contract.scope}
                  onChange={(e) => update((d) => { d.contract.scope = e.currentTarget.value; })} />
      </Prop>
      <Prop label="valor">
        <MoneyInput className="prop__input prop__input--money" placeholder="0,00" value={doc.contract.value} onChange={(v) => update((d) => { d.contract.value = v; })} />
        <select className="prop__select" aria-label="recorrência" value={doc.contract.recurrence} onChange={(e) => update((d) => { d.contract.recurrence = e.currentTarget.value; })}>
          <option value="">sem recorrência</option>
          {RECURRENCES.filter(Boolean).map((r) => <option key={r} value={r}>{RECURRENCE_LABEL[r]}</option>)}
        </select>
      </Prop>
      <Prop label="início e fim">
        <DateField className="prop__date" value={doc.contract.start} onChange={(e) => update((d) => { d.contract.start = e.currentTarget.value; })} />
        <span className="prop__sep">até</span>
        <DateField className="prop__date" value={doc.contract.end} onChange={(e) => update((d) => { d.contract.end = e.currentTarget.value; })} />
      </Prop>
      <Prop label="whatsapp">
        <input className="prop__input" id="prop-whatsapp" inputMode="tel" placeholder="vazio" value={doc.whatsapp} onChange={(e) => update((d) => { d.whatsapp = e.currentTarget.value; })} />
        {open(waUrl(doc.whatsapp), "conversar")}
      </Prop>
      <Prop label="e-mail">
        <input className="prop__input" type="email" placeholder="vazio" value={doc.email} onChange={(e) => update((d) => { d.email = e.currentTarget.value; })} />
        {doc.email && <a className="prop__open" href={"mailto:" + doc.email}>escrever</a>}
      </Prop>
      <Prop label="instagram">
        <input className="prop__input" placeholder="vazio" value={doc.instagram} onChange={(e) => update((d) => { d.instagram = e.currentTarget.value; })} />
        {open(igUrl(doc.instagram), "abrir")}
      </Prop>
      <Prop label="site">
        <input className="prop__input" placeholder="vazio" value={doc.site} onChange={(e) => update((d) => { d.site = e.currentTarget.value; })} />
        {open(siteUrl(doc.site), "abrir")}
      </Prop>
      <Prop label="próximo passo">
        <input className="prop__input prop__input--next" id="prop-next" placeholder="o que move esse cliente agora" value={doc.next}
               onChange={(e) => update((d) => { d.next = e.currentTarget.value.slice(0, 200); })}
               onBlur={() => { const now = collection("clients").get(doc.id); if (now) syncNext(now); }} />
        <DateField className="prop__date" title="quando — vira tarefa no calendário" value={doc.nextDate} onChange={(e) => setNext({ nextDate: e.currentTarget.value })} />
      </Prop>
      {!!(cameFrom || doc.wonAt) && (
        <Prop label="veio de">
          <span className="prop__text">
            {origin ? <a className="link" href={"notes.html#" + encodeURIComponent(origin.id)}>{cameFrom}</a> : (cameFrom || "direto")}
            {doc.wonAt ? " · fechou em " + dateLabel(dayOf(new Date(doc.wonAt)), true) : ""}
          </span>
        </Prop>
      )}
    </div>
  );
}

/* ---------- o que falta ----------
   eram sete abas vazias e um bloco de "primeiros passos" que sumia por idade.
   agora e uma linha de botoes: cada um some quando a coisa existe, e leva
   direto para onde ela se resolve. */
function Pending({ doc, ctx }) {
  const focus = (id) => { const el = document.getElementById(id); if (el) { el.focus(); el.scrollIntoView({ block: "center", behavior: "smooth" }); } };
  const items = [];
  if (doc.status === "active" && !doc.files.some((f) => f.kind === "contrato")) items.push(["subir contrato", () => ctx.setTab("files")]);
  if (doc.status === "active" && !doc.next) items.push(["definir próximo passo", () => focus("prop-next")]);
  if (!doc.whatsapp && !doc.email && !doc.contacts.length) items.push(["cadastrar contato", () => focus("prop-whatsapp")]);
  if (!doc.journal.some((e) => e.type !== "event")) items.push(["registrar a primeira conversa", () => ctx.setTab("journal")]);
  if (!items.length) return null;
  return (
    <div className="pending">
      <span className="t-mono">falta</span>
      {items.map(([label, go]) => <button key={label} className="pill pill--mini pending__item" type="button" onClick={go}>{label}</button>)}
    </div>
  );
}

/* ---------- aba: pagina ----------
   o texto livre do cliente em markdown, e embaixo quem e quem (pessoas) e os
   enderecos que se abrem toda semana (links). abre lendo; clicar no texto
   escreve. */
function PageTab({ doc, ctx }) {
  const { update, updateItem, removeFrom } = ctx;
  const [editing, setEditing] = useState(!doc.summary.trim());
  const [adding, setAdding] = useState("");
  const areaRef = useRef(null);
  useLayoutEffect(() => { const t = areaRef.current; if (t) { t.style.height = "auto"; t.style.height = Math.max(160, t.scrollHeight) + "px"; } }, [editing, doc.summary]);
  const contactsOf = (d) => d.contacts, linksOf = (d) => d.links;
  return (
    <div className="column">
      <div className="page-text">
        <p className="heading">
          <span className="t-mono">página</span>
          {!!doc.summary.trim() && <button className="link" type="button" onClick={() => setEditing((v) => !v)}>{editing ? "ver formatado" : "editar"}</button>}
        </p>
        {editing
          ? <textarea ref={areaRef} className="page-text__input" autoFocus={!!doc.summary}
                      placeholder="o que importa sobre esse cliente: contexto, entregas, acessos, combinados. markdown simples vale."
                      value={doc.summary} onChange={(e) => update((d) => { d.summary = e.currentTarget.value; })} />
          : <div className="page-text__read" title="clique para editar" onClick={(e) => { if (!e.target.closest("a")) setEditing(true); }}>
              <Markdown text={doc.summary} />
            </div>}
      </div>

      <div className="grid">
        <div className="col-6">
          <p className="heading"><span className="t-mono">pessoas</span><button className="pill pill--mini" type="button" id="add-contact" onClick={() => setAdding("contact")}>{icon("plus")}pessoa</button></p>
          <div id="contact-list" className="column">
            {doc.contacts.length ? doc.contacts.map((k) => (
              <div key={k.id} className="editable-line" data-id={k.id}>
                <input className="input small" placeholder="nome" value={k.name} onChange={(e) => updateItem(contactsOf, k.id, (x) => { x.name = e.currentTarget.value; })} />
                <input className="input small" placeholder="papel" value={k.role} onChange={(e) => updateItem(contactsOf, k.id, (x) => { x.role = e.currentTarget.value; })} />
                <input className="input small" placeholder="whatsapp" value={k.whatsapp} onChange={(e) => updateItem(contactsOf, k.id, (x) => { x.whatsapp = e.currentTarget.value; })} />
                <input className="input small" placeholder="e-mail" value={k.email} onChange={(e) => updateItem(contactsOf, k.id, (x) => { x.email = e.currentTarget.value; })} />
                <button className="action" type="button" aria-label="Remover pessoa" onClick={() => removeFrom(contactsOf, k.id, "pessoa removida")}>{icon("trash")}</button>
              </div>)) : <p className="empty">só o contato principal, lá em cima</p>}
          </div>
        </div>
        <div className="col-6">
          <p className="heading"><span className="t-mono">links</span><button className="pill pill--mini" type="button" id="add-link" onClick={() => setAdding("link")}>{icon("plus")}link</button></p>
          <div id="link-list" className="column">
            {doc.links.length ? doc.links.map((k) => (
              <div key={k.id} className="editable-line" data-id={k.id}>
                <input className="input small" placeholder="rótulo" value={k.label} onChange={(e) => updateItem(linksOf, k.id, (x) => { x.label = e.currentTarget.value; })} />
                <input className="input small" placeholder="https://…" value={k.url} onChange={(e) => updateItem(linksOf, k.id, (x) => { x.url = e.currentTarget.value; })} />
                {siteUrl(k.url) && <a className="action" href={siteUrl(k.url)} target="_blank" rel="noopener" aria-label="Abrir">{icon("link")}</a>}
                <button className="action" type="button" aria-label="Remover link" onClick={() => removeFrom(linksOf, k.id, "link removido")}>{icon("trash")}</button>
              </div>)) : <p className="empty">painel, drive, planilha — o que se abre toda semana</p>}
          </div>
        </div>
      </div>

      {!!doc.offers.length && (
        <div>
          <p className="heading">
            <span className="t-mono">ofertas cadastradas aqui antes</span>
            <button className="pill pill--mini" type="button" onClick={ctx.clearOffers}>já movi, pode limpar</button>
          </p>
          <ul className="list">
            {doc.offers.map((o) => <li key={o.id} className="line"><span className="name">{o.name}</span><span className="measure">{o.price ? brl(o.price) : "—"}</span></li>)}
          </ul>
          <p className="note">Oferta agora mora no funil, junto da promessa, da garantia e da escada. Estas continuam guardadas até você mandar limpar.</p>
        </div>
      )}

      {adding === "contact" && <ContactForm onClose={() => setAdding("")} onAdd={(k) => update((d) => { d.contacts.push(k); })} />}
      {adding === "link" && <LinkForm onClose={() => setAdding("")} onAdd={(k) => update((d) => { d.links.push(k); })} />}
    </div>
  );
}

/* ---------- aba: notas ----------
   as notas ligadas a este cliente. nao ha segunda caixa de notas: a nota
   continua morando em notes.html, e aqui e so a janela para as dele. */
function ClientNotes({ doc }) {
  const notes = useCollection("notes");
  const [form, setForm] = useState(false);
  const mine = notes.all().filter((n) => n.client === doc.id && n.stage !== "archived").sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const firstLine = (body) => String(body || "").split(/\r?\n/).map((l) => l.replace(/^[#\-*\d.)\s\[\]x]+/i, "").trim()).find(Boolean) || "";
  return (
    <>
      <TabBar label="notas" button="nota" onAdd={() => setForm(true)} />
      {mine.length
        ? <div className="note-cards">
            {mine.map((n) => (
              <a key={n.id} className="note-card" href={"notes.html#" + encodeURIComponent(n.id)}>
                <b>{n.title || "sem título"}</b>
                {firstLine(n.body) && <span>{firstLine(n.body)}</span>}
                <small className="t-mono">{dateLabel(dayOf(new Date(n.updatedAt || n.createdAt)))}</small>
              </a>
            ))}
          </div>
        : <p className="empty">reunião, ideia, o que ele falou na call — nota com este cliente aparece aqui</p>}
      {form && <ClientNoteForm onClose={() => setForm(false)} onCreate={(title) => {
        const n = newNote({ title, client: doc.id });
        if (n) location.href = "notes.html#" + encodeURIComponent(n.id);
      }} />}
    </>
  );
}

function ClientNoteForm({ onClose, onCreate }) {
  const [v, bind] = useFields({ title: "" });
  const submit = () => { const t = v.title.trim(); if (!t) { notify("a nota precisa de um título"); return false; } onCreate(t); };
  return (
    <Form title="nova nota" sub="nasce ligada a este cliente e abre em notas" submit="criar e abrir" onSubmit={submit} onClose={onClose}>
      <Field label="título" full><input className="input" required maxLength="300" {...bind("title")} /></Field>
    </Form>
  );
}

/* ---------- aba: arquivos ----------
   contrato, proposta, nota fiscal. o binario vai para o R2 (o mesmo dos prints
   das notas); o documento guarda o bilhete e o tipo, que sai do nome do arquivo
   e da para trocar. */
function Files({ doc, ctx }) {
  const [busy, setBusy] = useState(0);
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  const order = (k) => { const i = FILE_KINDS.indexOf(k); return i < 0 ? 99 : i; };
  const files = doc.files.slice().sort((a, b) => order(a.kind) - order(b.kind) || b.at - a.at);
  const take = async (list) => {
    const chosen = Array.from(list || []).filter((f) => f && f.size);
    if (!chosen.length) return;
    if (!cloud.signedIn) { notify("entre para subir arquivos — eles precisam de onde morar"); return; }
    setBusy((n) => n + chosen.length);
    const added = [];
    for (const f of chosen) {
      try { const up = await uploadFile(f); added.push({ ...up, kind: kindFromName(f.name) }); }
      catch (e) { notify(e.message || "não consegui subir " + f.name); }
      finally { setBusy((n) => n - 1); }
    }
    if (added.length) ctx.update((d) => {
      d.files = d.files.concat(added);
      added.forEach((f) => d.journal.push(journalEntry("arquivo: " + f.name + " (" + f.kind + ")")));
    });
  };
  const remove = (f) => {
    ctx.update((d) => { d.files = d.files.filter((x) => x.id !== f.id); });
    deleteFile(f.id);
    notify("arquivo apagado");
  };
  return (
    <>
      <label className={"drop" + (over ? " is-over" : "")}
             onDragOver={(e) => { e.preventDefault(); setOver(true); }}
             onDragLeave={() => setOver(false)}
             onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}>
        <input ref={inputRef} type="file" multiple hidden accept={FILE_TYPES.join(",")}
               onChange={(e) => { take(e.currentTarget.files); e.currentTarget.value = ""; }} />
        <b>{busy ? "subindo " + busy + (busy === 1 ? " arquivo…" : " arquivos…") : "arraste arquivos aqui"}</b>
        <span>{busy ? "" : "ou clique para escolher · pdf e imagem, até 8 MB"}</span>
      </label>
      {!cloud.signedIn && <p className="note mt2">entre para subir arquivos — eles moram na nuvem, não neste navegador.</p>}
      {files.length
        ? <ul className="list mt">
            {files.map((f) => (
              <li key={f.id} className={"line file-line" + (f.kind === "contrato" ? " is-contract" : "")}>
                <span className="file-line__ext">{isImage(f.type) ? "img" : (String(f.name).split(".").pop() || "").slice(0, 4)}</span>
                <a className="name" href={fileUrl(f.id)} target="_blank" rel="noopener">{f.name || "arquivo"}</a>
                <select className="file-line__kind" aria-label="tipo" value={f.kind}
                        onChange={(e) => { const kind = e.currentTarget.value; ctx.update((d) => { const x = d.files.find((y) => y.id === f.id); if (x) x.kind = kind; }); }}>
                  {FILE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <span className="measure">{f.at ? dateLabel(dayOf(new Date(f.at))) : ""}</span>
                <div className="row-actions">
                  <button className="action" type="button" aria-label={"Apagar " + f.name} onClick={() => remove(f)}>{icon("trash")}</button>
                </div>
              </li>
            ))}
          </ul>
        : <p className="empty">nada guardado ainda. contrato primeiro.</p>}
    </>
  );
}

/* ---------- aba: tarefas ----------
   duas listas, porque sao duas coisas: o que ja tem dia (mora no calendario, e
   aqui so aparece) e o que ainda nao tem (o antigo backlog, que espera virar
   tarefa). so o dia tem minutos — a lista sem data nao cobra nenhum. */
function ClientTasks({ doc, ctx, tasks, onTask }) {
  const [form, setForm] = useState(false);
  const delegate = useDelegate();
  const { updateItem, removeFrom } = ctx;
  const backlogOf = (d) => d.backlog;
  const t0 = today();
  const dated = tasks.all().filter((t) => t.client === doc.id)
    .sort((a, b) => (a.done - b.done) || (a.done ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  const open = dated.filter((t) => !t.done), done = dated.filter((t) => t.done).slice(0, 5);
  const undated = doc.backlog.filter((b) => !b.done).sort(compareBacklog);
  const ask = (b) => delegate.ask({
    id: b.id, title: b.text, min: b.min, due: b.due, client: doc.id,
    about: aboutClient(doc), where: "as tarefas sem data do cliente", origin: { type: "client", id: doc.id }
  });
  const toggle = (t) => tasks.save({ ...t, done: !t.done, updatedAt: Date.now() });
  const whenOf = (t) => t.date === t0 ? "hoje" : dateLabel(t.date);
  return (
    <>
      <p className="heading mb2"><span className="t-mono">com dia</span><button className="pill pill--mini" type="button" onClick={() => onTask({ title: "" })}>{icon("plus")}tarefa</button></p>
      {open.length || done.length
        ? <ul className="list">
            {open.concat(done).map((t) => (
              <li key={t.id} className={"line" + (t.done ? " is-done" : "")}>
                <button className="action mark" type="button" data-done={t.done} aria-label="Marcar feita" onClick={() => toggle(t)}>{icon("check")}</button>
                <span className="name">{t.title}</span>
                {t.min > 0 && <span className="measure">{formatMin(t.min)}</span>}
                <a className={"measure task-when" + (!t.done && t.date < t0 ? " is-late" : "")} href={"calendar.html#" + t.date} title="abrir no calendário">{whenOf(t)}</a>
              </li>
            ))}
          </ul>
        : <p className="empty">nenhuma tarefa com dia para este cliente</p>}

      <p className="heading mt mb2"><span className="t-mono">sem dia</span><button className="pill pill--mini" type="button" id="add-backlog" onClick={() => setForm(true)}>{icon("plus")}sem dia</button></p>
      {undated.length
        ? <ul className="list" id="backlog-list">
            {undated.map((b) => (
              <li key={b.id} className="line" data-id={b.id}>
                <button className="action mark" type="button" data-done={b.done} aria-label="Marcar feito" onClick={() => updateItem(backlogOf, b.id, (x) => { x.done = !x.done; })}>{icon("check")}</button>
                <span className="name">{b.text}</span>
                {b.min > 0 && <span className="measure">{formatMin(b.min)}</span>}
                {b.due && <span className="measure" title="prazo">{dateLabel(b.due)}</span>}
                <div className="row-actions">
                  <button className="action" type="button" disabled={!!delegate.busy} data-thinking={delegate.busy === b.id ? "yes" : null}
                    title={delegate.busy === b.id ? "pensando…" : "perguntar ao merlin: dá pra fazer com o Claude?"}
                    aria-label="Perguntar ao merlin se dá para fazer com o Claude" onClick={() => ask(b)}>{icon("spark")}</button>
                  <button className="action" type="button" title="virar tarefa com dia" aria-label="Virar tarefa" onClick={() => onTask({ title: b.text + (b.min ? " " + formatMin(b.min) : ""), backlogId: b.id })}>{icon("task")}</button>
                  <button className="action" type="button" aria-label="Remover" onClick={() => removeFrom(backlogOf, b.id, "item removido")}>{icon("trash")}</button>
                </div>
              </li>))}
          </ul>
        : <p className="empty" id="backlog-empty">nada esperando dia</p>}
      {form && <BacklogForm onClose={() => setForm(false)} onAdd={(item) => ctx.update((d) => { d.backlog.push(item); })} />}
      {delegate.answer && <DelegateDialog answer={delegate.answer} onClose={delegate.close} />}
    </>
  );
}

function ContactForm({ onClose, onAdd }) {
  const [v, bind] = useFields({ name: "", role: "", whatsapp: "", email: "" });
  const submit = () => {
    const name = v.name.trim();
    if (!name) { notify("o contato precisa de um nome"); return false; }
    onAdd({ id: newId(), name, role: v.role.trim(), whatsapp: v.whatsapp.trim(), email: v.email.trim() });
  };
  return (
    <Form title="novo contato" submit="adicionar" onSubmit={submit} onClose={onClose}>
      <Field label="nome" full><input className="input" required maxLength="80" {...bind("name")} /></Field>
      <Field label="papel"><input className="input" maxLength="60" placeholder="quem é essa pessoa ali dentro" {...bind("role")} /></Field>
      <Field label="whatsapp"><input className="input" maxLength="40" inputMode="tel" {...bind("whatsapp")} /></Field>
      <Field label="e-mail" full><input className="input" type="email" maxLength="120" {...bind("email")} /></Field>
    </Form>
  );
}

function LinkForm({ onClose, onAdd }) {
  const [v, bind] = useFields({ label: "", url: "" });
  const submit = () => {
    const label = v.label.trim(), url = v.url.trim();
    if (!label && !url) { notify("o link precisa de um rótulo ou de um endereço"); return false; }
    onAdd({ id: newId(), label: label || url, url });
  };
  return (
    <Form title="novo link" submit="adicionar" onSubmit={submit} onClose={onClose}>
      <Field label="rótulo" full><input className="input" required maxLength="60" placeholder="painel do ML, drive, contrato…" {...bind("label")} /></Field>
      <Field label="endereço" full><input className="input" type="url" maxLength="500" placeholder="https://…" {...bind("url")} /></Field>
    </Form>
  );
}

/* ---------- "novo item" no fim de uma lista: Enter ou o botao acrescentam ---------- */
function NewItemRow({ placeholder, button, top, onAdd }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (!t) return;
    onAdd(t);
    setText("");
  };
  return (
    <div className={"form-row" + (top ? " mt2" : "")}>
      <input className="input" placeholder={placeholder} value={text} onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
      <button className="pill pill--mini" type="button" onClick={add}>{button}</button>
    </div>
  );
}

/* ---------- aba: canais ---------- */
function Channels({ doc, ctx }) {
  const [form, setForm] = useState(false);
  return (
    <>
      <TabBar label="canais" button="canal" id="add-channel" onAdd={() => setForm(true)} />
      <div className="column" id="channel-list">
        {doc.channels.length
          ? doc.channels.map((ch) => <Channel key={ch.id} doc={doc} ch={ch} ctx={ctx} />)
          : <p className="empty">nenhum canal cadastrado ainda</p>}
      </div>
      {form && <ChannelForm onClose={() => setForm(false)} onAdd={(channel) => ctx.update((d) => { d.channels.push(channel); })} />}
    </>
  );
}

function ChannelForm({ onClose, onAdd }) {
  const [v, bind] = useFields({ type: CHANNEL_TYPES[0], name: "" });
  const submit = () => {
    onAdd({
      id: newId(), type: v.type, name: v.name.trim() || CHANNEL_LABEL[v.type], url: "", note: "",
      items: (CHANNEL_CHECKLISTS[v.type] || []).map((text) => ({ id: newId(), text, done: false }))
    });
  };
  return (
    <Form title="novo canal" sub="o canal já nasce com o checklist do tipo" submit="adicionar" onSubmit={submit} onClose={onClose}>
      <Field label="tipo"><select className="select" {...bind("type")}>{CHANNEL_TYPES.map((t) => <option key={t} value={t}>{CHANNEL_LABEL[t]}</option>)}</select></Field>
      <Field label="nome (opcional)"><input className="input" maxLength="80" {...bind("name")} /></Field>
    </Form>
  );
}

function Channel({ doc, ch, ctx }) {
  const { update, updateItem, removeFrom, funnels } = ctx;
  const done = ch.items.filter((i) => i.done).length;
  const pct = ch.items.length ? Math.round((done / ch.items.length) * 100) : 0;
  const channelFunnels = funnels.all().filter((f) => f.client === doc.id && f.channel === ch.id);
  const channelsOf = (d) => d.channels;
  const itemsOf = (d) => { const c = d.channels.find((x) => x.id === ch.id); return c ? c.items : null; };
  const [funnelForm, setFunnelForm] = useState(false);
  return (
    <div className="channel block block--flat" data-id={ch.id}>
      <div className="item-head">
        <span className="badge">{CHANNEL_LABEL[ch.type] || ch.type}</span>
        <input className="input input--pill" value={ch.name} onChange={(e) => updateItem(channelsOf, ch.id, (x) => { x.name = e.currentTarget.value; })} />
        <button className="action" type="button" aria-label="Remover canal" onClick={() => removeFrom(channelsOf, ch.id, "canal removido")}>{icon("trash")}</button>
      </div>
      {ch.items.length ? (
        <>
          <div className="bar"><i style={{ width: pct + "%" }} /></div>
          <p className="small weak mt2">{done} de {ch.items.length}</p>
          <ul className="list mt2">
            {ch.items.map((i) => (
              <li key={i.id} className={"line" + (i.done ? " is-done" : "")} data-item={i.id}>
                <button className="action mark" type="button" data-done={i.done} aria-label="Marcar feito" onClick={() => updateItem(itemsOf, i.id, (x) => { x.done = !x.done; })}>{icon("check")}</button>
                <input className="input item-text" value={i.text} onChange={(e) => updateItem(itemsOf, i.id, (x) => { x.text = e.currentTarget.value; })} />
                <button className="action" type="button" aria-label="Remover item" onClick={() => removeFrom(itemsOf, i.id, "item removido")}>{icon("x")}</button>
              </li>))}
          </ul>
          <NewItemRow placeholder="novo item" button="+ item" top onAdd={(text) => update((d) => { const arr = itemsOf(d); if (arr) arr.push({ id: newId(), text, done: false }); })} />
        </>
      ) : <p className="empty">canal sem checklist — use a nota para anotar o que precisar</p>}
      <label className="field-label mt2">nota</label>
      <textarea className="textarea" value={ch.note} onChange={(e) => updateItem(channelsOf, ch.id, (x) => { x.note = e.currentTarget.value; })} />
      <div className="channel-funnels">
        <p className="heading"><span className="t-mono">funis</span><button className="pill pill--mini" type="button" onClick={() => setFunnelForm(true)}>novo funil</button></p>
        {channelFunnels.length
          ? <ul className="list">{channelFunnels.map((f) => <li key={f.id} className="line"><a className="link name" href={"funnels.html#" + f.id}>{f.name}</a></li>)}</ul>
          : <p className="empty">nenhum funil ligado a este canal</p>}
      </div>
      {funnelForm && <ChannelFunnelForm doc={doc} ch={ch} funnels={funnels} onClose={() => setFunnelForm(false)} />}
    </div>
  );
}

/* o funil de um canal: o modelo ja vem filtrado pelo tipo do canal (dois por
   canal, no minimo), e o funil nasce ligado ao cliente e ao canal — e abre. */
function ChannelFunnelForm({ doc, ch, funnels, onClose }) {
  const groups = funnelGroups(ch.type);
  const [v, bind, set] = useFields({ name: doc.name + " · " + ch.name, template: "" });
  const tpl = v.template ? FUNNEL_TEMPLATES.find((t) => t.id === v.template) : null;
  const submit = () => {
    const name = v.name.trim().slice(0, 80);
    if (!name) { notify("o funil precisa de um nome"); return false; }
    const now = Date.now();
    const f = {
      id: newId(), name, client: doc.id, channel: ch.id,
      nodes: [], edges: [], creatives: [], automations: [], offers: [], triggers: [],
      period: { from: "", to: "" }, snapshots: [], createdAt: now, updatedAt: now
    };
    if (tpl) {
      const parts = buildFunnel(tpl);
      f.nodes = layoutNodes(parts.nodes, parts.edges);
      f.edges = parts.edges;
      f.creatives = parts.creatives;
      f.automations = parts.automations;
      f.offers = parts.offers;
      f.triggers = parts.triggers;
    }
    funnels.save(f);
    location.href = "funnels.html#" + f.id;
  };
  return (
    <Form title="novo funil" sub={"do canal " + (CHANNEL_LABEL[ch.type] || ch.type)} submit="criar e abrir" onSubmit={submit} onClose={onClose}>
      <Field label="nome" full><input className="input" maxLength="80" required {...bind("name")} /></Field>
      <Field label="modelo" full>
        <TemplatePicker groups={groups} empty="funil em branco"
                        value={v.template} onChange={(id) => set("template", id)} />
        {tpl && (
          <>
            <p className="tpl-note">{tpl.summary}</p>
            <p className="tpl-chain">{funnelChain(tpl).join(" → ")}</p>
          </>
        )}
      </Field>
    </Form>
  );
}

/* ---------- aba: objetivos ---------- */
function Goals({ doc, ctx }) {
  const [form, setForm] = useState(false);
  const sorted = doc.goals.slice().sort((a, b) => (a.done - b.done) || (a.due || "9999").localeCompare(b.due || "9999"));
  return (
    <>
      <TabBar label="objetivos" button="objetivo" id="add-goal" onAdd={() => setForm(true)} />
      <div className="column" id="goal-list">
        {sorted.length
          ? sorted.map((g) => <Goal key={g.id} g={g} ctx={ctx} />)
          : <p className="empty">nenhum objetivo ainda</p>}
      </div>
      {form && <GoalForm onClose={() => setForm(false)} onAdd={(goal) => ctx.update((d) => { d.goals.push(goal); })} />}
    </>
  );
}

function GoalForm({ onClose, onAdd }) {
  const [v, bind] = useFields({ text: "", keyResult: "", due: "" });
  const submit = () => {
    const text = v.text.trim();
    if (!text) { notify("o objetivo precisa de um título"); return false; }
    onAdd({ id: newId(), text, keyResult: v.keyResult.trim(), due: v.due || "", done: false, steps: [] });
  };
  return (
    <Form title="novo objetivo" submit="adicionar" onSubmit={submit} onClose={onClose}>
      <Field label="título" full><input className="input" required maxLength="140" {...bind("text")} /></Field>
      <Field label="resultado-chave"><input className="input" maxLength="140" {...bind("keyResult")} /></Field>
      <Field label="prazo"><DateField {...bind("due")} /></Field>
    </Form>
  );
}

function Goal({ g, ctx }) {
  const { update, updateItem, removeFrom } = ctx;
  const goalsOf = (d) => d.goals;
  const stepsOf = (d) => { const x = d.goals.find((y) => y.id === g.id); return x ? x.steps : null; };
  const done = g.steps.filter((p) => p.done).length;
  return (
    <div className={"block block--flat" + (g.done ? " is-finished" : "")} data-id={g.id}>
      <div className="item-head">
        <button className="action mark" type="button" data-done={g.done} aria-label="Marcar feito" onClick={() => updateItem(goalsOf, g.id, (x) => { x.done = !x.done; })}>{icon("check")}</button>
        <input className="input" placeholder="título" value={g.text} onChange={(e) => updateItem(goalsOf, g.id, (x) => { x.text = e.currentTarget.value; })} />
        {g.due && <span className="badge">{dateLabel(g.due)}</span>}
        <button className="action" type="button" aria-label="Remover objetivo" onClick={() => removeFrom(goalsOf, g.id, "objetivo removido")}>{icon("trash")}</button>
      </div>
      <div className="form-row">
        <input className="input" placeholder="resultado-chave" value={g.keyResult} onChange={(e) => updateItem(goalsOf, g.id, (x) => { x.keyResult = e.currentTarget.value; })} />
        <DateField value={g.due} onChange={(e) => updateItem(goalsOf, g.id, (x) => { x.due = e.currentTarget.value; })} />
      </div>
      <p className="heading mt2"><span className="t-mono">passos</span><span className="small weak">{done} de {g.steps.length}</span></p>
      <ul className="list">
        {g.steps.map((p) => (
          <li key={p.id} className={"line" + (p.done ? " is-done" : "")} data-step={p.id}>
            <button className="action mark" type="button" data-done={p.done} aria-label="Marcar feito" onClick={() => updateItem(stepsOf, p.id, (x) => { x.done = !x.done; })}>{icon("check")}</button>
            <input className="input item-text" value={p.text} onChange={(e) => updateItem(stepsOf, p.id, (x) => { x.text = e.currentTarget.value; })} />
            <button className="action" type="button" aria-label="Remover passo" onClick={() => removeFrom(stepsOf, p.id, "passo removido")}>{icon("x")}</button>
          </li>))}
      </ul>
      <NewItemRow placeholder="novo passo" button="+ passo" onAdd={(text) => update((d) => { const arr = stepsOf(d); if (arr) arr.push({ id: newId(), text, done: false }); })} />
    </div>
  );
}

/* ---------- o que ainda nao tem dia ----------
   e aqui que a demanda do cliente aparece antes de custar minuto: ao lado de
   "virar tarefa" mora a outra pergunta, a de quem talvez nao precise virar
   nada — "da pra fazer com Claude?". */

/* o que o merlin precisa saber do cliente para julgar a demanda: quem e, o que
   faz e por onde vende. o backlog inteiro e o diario seriam ruido aqui. */
const aboutClient = (c) => [
  c.name + (c.summary ? " — " + c.summary : ""),
  c.channels.length ? "canais: " + c.channels.map((ch) => ch.name).join(", ") : ""
].filter(Boolean).join(" · ");

function BacklogForm({ onClose, onAdd }) {
  const [v, bind] = useFields({ text: "", duration: "", due: "" });
  const submit = () => {
    const parsed = parseDuration(v.text.trim());
    const text = parsed.title || v.text.trim();
    if (!text) { notify("a tarefa precisa de um título"); return false; }
    const min = parseDuration(v.duration).min || parsed.min;
    onAdd({ id: newId(), text, min, due: v.due || "", done: false, createdAt: Date.now() });
  };
  return (
    <Form title="sem dia, por enquanto" sub="fica na lista do cliente até virar tarefa com dia" submit="adicionar" onSubmit={submit} onClose={onClose}>
      <Field label="tarefa" full><input className="input" required maxLength="200" placeholder="o que fazer · 45m" {...bind("text")} /></Field>
      <Field label="duração"><input className="input input--mono" placeholder="45m, 1h30" {...bind("duration")} /></Field>
      <Field label="prazo"><DateField {...bind("due")} /></Field>
    </Form>
  );
}

/* ---------- aba: historico (so acrescenta) ----------
   o que aconteceu, numa linha do tempo. o que o sistema escreve sozinho
   (fechou, mudou de status, subiu arquivo) e um marco curto; o que a pessoa
   registra (reuniao, decisao, entrega) ganha o texto inteiro. */
function Journal({ doc, ctx }) {
  const [form, setForm] = useState(false);
  const entries = doc.journal.slice().sort((a, b) => b.at - a.at);
  return (
    <>
      <TabBar label="histórico" button="registro" id="add-journal" onAdd={() => setForm(true)} />
      {entries.length
        ? <ol className="timeline" id="journal-list">
            {entries.map((e) => (
              <li key={e.id} className={"timeline__item" + (e.type === "event" ? " is-event" : "")}>
                <p className="timeline__head"><span className="t-mono">{journalDate(e.at)}</span>{e.type !== "event" && <span className="badge">{JOURNAL_LABEL[e.type] || e.type}</span>}</p>
                {e.type === "event" ? <p className="timeline__event">{e.text}</p> : <Markdown className="journal-text" text={e.text} />}
              </li>))}
          </ol>
        : <p className="empty" id="journal-empty">nada registrado ainda</p>}
      {form && <JournalForm onClose={() => setForm(false)} onAdd={(entry) => ctx.update((d) => { d.journal.push(entry); })} />}
    </>
  );
}

function JournalForm({ onClose, onAdd }) {
  const [v, bind] = useFields({ type: JOURNAL_TYPES[0], text: "" });
  const submit = () => {
    const text = v.text.trim();
    if (!text) { notify("escreve o que aconteceu"); return false; }
    onAdd({ id: newId(), at: Date.now(), type: v.type, text });
  };
  return (
    <Form title="registrar no histórico" sub="só acrescenta: o que aconteceu, com data de hoje" submit="registrar" onSubmit={submit} onClose={onClose}>
      <Field label="tipo" full><select className="select" {...bind("type")}>{JOURNAL_TYPES.map((t) => <option key={t} value={t}>{JOURNAL_LABEL[t]}</option>)}</select></Field>
      <Field label="o que aconteceu" full><textarea className="textarea" required placeholder="markdown simples vale" {...bind("text")} /></Field>
    </Form>
  );
}

/* ---------- aba: cofre ----------
   sem chave, a aba mostra o cadeado e ja pede a senha. com chave, decifra
   todos os itens de uma vez (e a mesma chave em todo item: falhou para um,
   falha para todos — esquece a chave e volta a pedir a senha em vez de
   mostrar qualquer coisa pela metade). */
function Vault({ doc, ctx, masterKey, openDialog, lock }) {
  const items = doc.vault.items;
  const itemsKey = JSON.stringify(items);
  const [plain, setPlain] = useState(null);       // id -> {secret, note} ja decifrados, so em memoria
  const [editingId, setEditingId] = useState(null);
  const [formGen, setFormGen] = useState(0);      // troca a key do formulario para ele nascer vazio de novo
  const itemsOf = (d) => d.vault.items;

  /* entrar na aba sem chave pede a senha na hora */
  useEffect(() => { if (!masterKey) openDialog(); }, []);

  /* decifrar e assincrono; o Arthur pode trocar de aba ou de cliente no
     meio do caminho — o `cancelled` larga o resultado de quem ja saiu */
  useEffect(() => {
    if (!masterKey) { setPlain(null); return; }
    let cancelled = false;
    Promise.all(items.map(async (item) => [item.id, await decryptItem(masterKey, item)]))
      .then((pairs) => { if (!cancelled) setPlain(Object.fromEntries(pairs)); })
      .catch(() => { if (!cancelled) { lock(); openDialog("senha não bate"); } });
    return () => { cancelled = true; };
  }, [masterKey, itemsKey]);

  if (!masterKey) return (
    <div className="block" id="vault-locked">
      <p className="empty">cofre trancado — entre com a senha-mestra para ver os acessos deste cliente.</p>
      <button className="pill pill--green" type="button" id="unlock-vault-btn" onClick={() => openDialog()}>destrancar</button>
    </div>
  );
  if (!plain) return null;

  const editing = editingId ? items.find((x) => x.id === editingId) : null;
  const saveItem = async (v) => {
    const label = v.label.trim();
    if (!label) return;
    const { encrypted, iv } = await encryptItem(masterKey, v.secret, v.note);
    const patch = { label, user: v.user.trim(), url: v.url.trim(), encrypted, iv };
    if (editing) ctx.updateItem(itemsOf, editing.id, (x) => { Object.assign(x, patch); });
    else ctx.update((d) => { d.vault.items.push({ id: newId(), ...patch }); });
    setEditingId(null);
    setFormGen((n) => n + 1);
  };
  return (
    <>
      <div className="block mb">
        <p className="heading"><span className="t-mono">cofre de acessos</span><button className="pill pill--mini" type="button" id="lock-vault-btn" onClick={() => { lock(); openDialog(); }}>trancar</button></p>
        <p className="small weak">cifrado neste navegador (AES-GCM); a senha-mestra nunca é gravada, e o servidor só guarda o texto cifrado.</p>
      </div>
      <VaultForm key={editing ? editing.id : "new-" + formGen} item={editing} plain={editing ? plain[editing.id] : null} onSave={saveItem} onCancel={() => setEditingId(null)} />
      <div className="column" id="vault-list">
        {items.length
          ? items.map((item) => <VaultItem key={item.id + ":" + item.iv} item={item} plain={plain[item.id] || {}}
              onEdit={() => setEditingId(item.id)} onRemove={() => ctx.removeFrom(itemsOf, item.id, "acesso apagado")} />)
          : <p className="empty">nenhum acesso guardado ainda</p>}
      </div>
    </>
  );
}

function VaultForm({ item, plain, onSave, onCancel }) {
  const [v, bind] = useFields({
    label: item ? item.label : "", user: item ? item.user : "", secret: plain ? plain.secret : "",
    url: item ? item.url : "", note: plain ? plain.note : ""
  });
  return (
    <div className="block mb" id="vault-form">
      <p className="heading"><span className="t-mono">{item ? "editar acesso" : "novo acesso"}</span></p>
      <div className="form-grid">
        <input className="input" id="vault-label" placeholder="rótulo (ex.: painel Shopify)" {...bind("label")} />
        <input className="input" id="vault-user" placeholder="usuário" {...bind("user")} />
        <input className="input mono" id="vault-secret" placeholder="senha / segredo" {...bind("secret")} />
        <input className="input" id="vault-url" placeholder="url (opcional)" {...bind("url")} />
      </div>
      <textarea className="textarea mt2" id="vault-note" placeholder="nota (opcional)" {...bind("note")} />
      <div className="row mt2">
        <button className="pill pill--green" type="button" id="save-vault-btn" onClick={() => onSave(v)}>{item ? "salvar" : "adicionar"}</button>
        {item && <button className="pill" type="button" id="cancel-vault-btn" onClick={onCancel}>cancelar</button>}
      </div>
    </div>
  );
}

function VaultItem({ item, plain, onEdit, onRemove }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="block block--flat" data-id={item.id}>
      <div className="item-head">
        <span className="name">{item.label || "(sem rótulo)"}</span>
        <button className="action" type="button" aria-label="Editar acesso" onClick={onEdit}>{icon("pencil")}</button>
        <button className="action" type="button" aria-label="Apagar acesso" onClick={onRemove}>{icon("trash")}</button>
      </div>
      <div className="vault-line">
        <span className="t-mono weak">usuário</span>
        <span className="vault-value">{item.user ? item.user : <span className="weak">—</span>}</span>
        {item.user && <button className="action" type="button" aria-label="Copiar usuário" onClick={() => copyText(item.user, "usuário copiado")}><CopyIcon /></button>}
      </div>
      <div className="vault-line">
        <span className="t-mono weak">senha</span>
        <span className="vault-value mono" data-secret={shown ? "visible" : "hidden"}>{shown ? (plain.secret || "(vazio)") : "••••••••"}</span>
        <button className="action" type="button" aria-label="Mostrar senha" onClick={() => setShown((s) => !s)}><EyeIcon /></button>
        <button className="action" type="button" aria-label="Copiar senha" onClick={() => copyText(plain.secret, "senha copiada")}><CopyIcon /></button>
      </div>
      {item.url && <div className="vault-line"><span className="t-mono weak">link</span><a className="link vault-value" href={item.url} target="_blank" rel="noopener">{item.url}</a></div>}
      {plain.note && <p className="small weak mt2">{plain.note}</p>}
    </div>
  );
}

/* a senha-mestra: criar (primeira vez no sistema) ou destrancar */
function VaultPasswordForm({ isNew, error, onUnlock, onClose }) {
  const [v, bind] = useFields({ password: "" });
  /* devolve false sempre: quem fecha a caixa e o unlock, depois de derivar
     a chave — ate la ela fica aberta, como antes */
  const submit = () => { if (v.password) onUnlock(v.password); return false; };
  return (
    <Form title={isNew ? "criar a senha-mestra do cofre" : "destrancar o cofre"} submit="destrancar" onSubmit={submit} onClose={onClose}
        sub={isNew
          ? "essa senha cifra os acessos guardados aqui, só neste navegador — nem o Merlin, nem o servidor a conhecem."
          : "a mesma senha de sempre, pedida de novo porque a aba recarregou ou o cofre foi trancado."}>
      <Field label="senha-mestra" full><input className="input" id="vault-password" type="password" autoComplete="current-password" placeholder="só fica na memória desta aba" {...bind("password")} /></Field>
      <p className="small weak full">sem recuperação: se esquecer a senha-mestra, o cofre é perdido.</p>
      {error && <p className="small full" id="vault-error">{error}</p>}
    </Form>
  );
}

/* ---------- a pauta do merlin ---------- */
function MeetingDialog({ text, onClose, onKeep }) {
  return (
    <Dialog title="pauta da reunião" label="Preparar reunião" wide onClose={onClose}
        actions={<><button className="pill" type="button" onClick={onClose}>fechar</button><button className="pill pill--green" type="button" id="keep-meeting-btn" onClick={onKeep}>guardar no histórico</button></>}>
      <Markdown className="meeting-text" text={text} />
    </Dialog>
  );
}

/* ---------- caixa: novo cliente ---------- */
function ClientForm({ prefill, onCreate, onClose }) {
  const first = CLIENT_TEMPLATES.find((t) => t.id === prefill.template);
  const [v, bind, set] = useFields({ name: prefill.name || (first ? first.name : ""), status: "active" });
  /* o modelo é o TIPO DE NEGÓCIO, não um cliente de mentira: ele traz os
     canais com o checklist de cada um, os objetivos que aquele tipo de
     operação persegue e o backlog do que precisa existir antes. depois de
     criado, nada disso lembra que veio de um modelo. */
  const [tplId, setTplId] = useState(prefill.template || "");
  const tpl = CLIENT_TEMPLATES.find((t) => t.id === tplId) || null;
  /* escolher o modelo com o nome ainda em branco preenche o nome: quase
     sempre ele é provisório mesmo, e um campo obrigatório vazio depois de
     uma escolha parece que a escolha não valeu. */
  const choose = (id) => {
    setTplId(id);
    const t = CLIENT_TEMPLATES.find((x) => x.id === id);
    if (t && !v.name.trim()) set("name", t.name);
  };
  const submit = () => {
    const name = v.name.trim();
    if (!name) return false;
    return onCreate({
      name, status: v.status, summary: prefill.summary || "",
      ideaOrigin: prefill.ideaOrigin || "", template: tpl
    });
  };
  /* quem veio da tela de escolher já escolheu: a caixa não repete a lista,
     só diz qual foi. a lista fica para quem abriu pelo botão do cabeçalho. */
  const chosen = "template" in prefill;
  return (
    <Form title="novo cliente" sub={chosen ? (tpl ? "modelo: " + tpl.name : "em branco") : undefined} submit="criar" onSubmit={submit} onClose={onClose}>
      <Field label="nome" full><input className="input" required {...bind("name")} /></Field>
      <Field label="status" full><select className="select" {...bind("status")}>{CLIENT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></Field>
      {(!chosen || tpl) && (
        <Field label={chosen ? "o que ele traz" : "modelo"} full>
          {!chosen && <TemplatePicker groups={clientGroups()} empty="em branco" value={tplId} onChange={choose} id="client-tpl" />}
          {tpl && <>
            <p className="tpl-note">{tpl.summary}</p>
            <p className="tpl-chain">{clientChannels(tpl).join(" · ")} · {tpl.goals.length} objetivos · {tpl.backlog.length} no backlog</p>
          </>}
        </Field>
      )}
    </Form>
  );
}

mount(<Clients />, "app");
