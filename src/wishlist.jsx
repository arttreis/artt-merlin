/* merlin · a vitrine
   o que se quer comprar, em coletâneas. não é nota: nota amadurece e vira
   tarefa; o item da vitrine tem preço, link e foto, e termina como dinheiro
   saindo — por isso "comprei" lança a saída no financeiro. */
import "./shared/base.css";
import "./wishlist.css";
import {
  initPage, newId, today, isDay, brl, notify, cloud, collection,
  uploadFile, deleteFile, fileUrl, foldKey
} from "./shared/core.js";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  mount, useCollection, useHash, setHash, useKeydown, isTyping,
  useFields, Form, Field, MoneyInput, DateField, icon
} from "./shared/ui.jsx";

initPage("wishlist");

/* ---------- os documentos ----------
   uma coleção só, dois tipos, como o financeiro: a coletânea ("list") e o
   item ("item"), que aponta para ela pelo id. o item mora fora da coletânea
   porque é editado sozinho — mudar um preço não regrava a lista inteira. */
const normalizePhoto = (p) => p && p.id
  ? { id: String(p.id), name: String(p.name || "").slice(0, 120), type: String(p.type || ""), size: +p.size || 0, at: +p.at || 0 }
  : null;

/* a lista de compras: as mesmas cinco categorias que a pessoa já usa fora do
   Merlin (colar num bloco de notas, por urgência ou por onde compra). não
   substitui a coletânea — é um segundo eixo, opcional, que a visão "compras"
   usa para agrupar em vez de agrupar por coletânea. */
const BUCKETS = [
  { id: "asap", label: "asap" },
  { id: "longterm", label: "a prazo" },
  { id: "online", label: "online" },
  { id: "presencial", label: "presencial" },
  { id: "mercado", label: "mercado" }
];
const bucketLabel = (id) => (BUCKETS.find((b) => b.id === id) || {}).label || "";

function normalize(d) {
  const base = {
    id: String(d.id || ""),
    type: d.type === "list" ? "list" : "item",
    order: Number.isFinite(+d.order) ? +d.order : 0,
    createdAt: +d.createdAt || Date.now(),
    updatedAt: +d.updatedAt || +d.createdAt || Date.now()
  };
  if (base.type === "list") return { ...base, name: String(d.name || "").slice(0, 80) };
  const b = d.bought && typeof d.bought === "object" ? d.bought : null;
  return {
    ...base,
    list: String(d.list || ""),
    name: String(d.name || "").slice(0, 140),
    price: Math.round(Math.abs(+d.price)) || 0,
    url: String(d.url || "").slice(0, 1000),
    photo: normalizePhoto(d.photo),
    note: String(d.note || "").slice(0, 2000),
    /* comprado guarda o dia, o que se pagou de fato e o lançamento que nasceu
       no financeiro — desmarcar a compra apaga o lançamento junto */
    bought: b && isDay(b.day) ? { day: b.day, amount: Math.round(Math.abs(+b.amount)) || 0, entry: String(b.entry || "") } : null,
    bucket: BUCKETS.some((x) => x.id === d.bucket) ? d.bucket : "",
    qty: String(d.qty || "").slice(0, 12)
  };
}

const byOrder = (a, b) => a.order - b.order || a.createdAt - b.createdAt;
const itemsOf = (store, listId) => store.all().filter((d) => d.type === "item" && d.list === listId).sort(byOrder);
const sum = (items, pick) => items.reduce((s, it) => s + pick(it), 0);

/* o link aparece como a loja: "amazon.com.br" diz mais que a url inteira */
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
}
/* quem cola "amazon.com.br/xyz" sem o https também quer um link que abre */
const withScheme = (url) => !url || /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : "https://" + url;

/* as categorias vêm do financeiro, que é o dono delas. sem config ainda, a
   lista padrão dele — a mesma que ele usaria ao abrir. */
const FALLBACK_CATEGORIES = ["Básicas/PF", "Básicas/PJ", "Lazer", "Recorrente", "Ferramentas", "Freela", "Investimento", "Outros"];
function financeCategories() {
  const cfg = collection("finance").get("config");
  return cfg && Array.isArray(cfg.categories) && cfg.categories.length ? cfg.categories.map(String) : FALLBACK_CATEGORIES;
}

/* ---------- a pagina ----------
   o hash é a coletânea aberta: "wishlist.html#<id>" entra direto nela, e é o
   que a busca da sidebar usa. sem hash, a vitrine inteira. */
function Wishlist() {
  const store = useCollection("wishlist", { normalize });
  const hash = useHash();
  const [view, setView] = useState("vitrine");   // "vitrine" | "compras"
  const [form, setForm] = useState(null);   // { type: "list"|"item"|"buy"|"paste", id, list? } | null
  const lists = store.all().filter((d) => d.type === "list").sort(byOrder);
  const open = view === "vitrine" ? (lists.find((l) => l.id === hash) || null) : null;

  useKeydown((e) => {
    if (form || isTyping() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "n") { e.preventDefault(); setForm(open ? { type: "item", id: "", list: open.id } : { type: "list", id: "" }); }
  });

  /* ---------- acoes ---------- */
  const removeList = (l) => {
    const items = itemsOf(store, l.id);
    store.remove(l.id);
    items.forEach((it) => store.remove(it.id));
    setHash("");
    /* as fotos ficam no bucket: apagá-las agora quebraria o desfazer */
    notify("coletânea apagada", () => store.saveMany([l, ...items]));
  };
  const removeItem = (it) => {
    const before = store.remove(it.id);
    if (before) notify("item apagado", () => store.save(before));
  };
  const unbuy = (it) => {
    const finance = collection("finance");
    const entry = it.bought && it.bought.entry ? finance.remove(it.bought.entry) : null;
    store.save({ ...it, bought: null, updatedAt: Date.now() });
    notify(entry ? "compra desfeita, e o lançamento saiu do financeiro" : "compra desfeita", () => {
      if (entry) finance.save(entry);
      store.save({ ...store.get(it.id), bought: it.bought, updatedAt: Date.now() });
    });
  };

  return (
    <>
      <div className="tabs" role="tablist">
        <button className="tab" type="button" role="tab" aria-selected={String(view === "vitrine")} onClick={() => setView("vitrine")}>vitrine</button>
        <button className="tab" type="button" role="tab" aria-selected={String(view === "compras")} onClick={() => setView("compras")}>compras</button>
      </div>

      {view === "compras"
        ? <ShoppingView store={store}
            onNewItem={() => setForm({ type: "item", id: "", list: "" })}
            onEditItem={(it) => setForm({ type: "item", id: it.id, list: it.list })}
            onBuy={(it) => setForm({ type: "buy", id: it.id })}
            onUnbuy={unbuy}
            onPaste={() => setForm({ type: "paste" })} />
        : open
        ? <ListView store={store} list={open}
            onBack={() => setHash("")}
            onEditList={() => setForm({ type: "list", id: open.id })}
            onNewItem={() => setForm({ type: "item", id: "", list: open.id })}
            onEditItem={(it) => setForm({ type: "item", id: it.id, list: it.list })}
            onBuy={(it) => setForm({ type: "buy", id: it.id })}
            onUnbuy={unbuy} />
        : <Shelf store={store} lists={lists}
            onOpen={(l) => setHash(l.id)}
            onNewList={() => setForm({ type: "list", id: "" })} />}

      {form && form.type === "list" && <ListForm store={store} id={form.id} count={lists.length}
        onCreated={(l) => setHash(l.id)} onRemove={removeList} onClose={() => setForm(null)} />}
      {form && form.type === "item" && <ItemForm store={store} id={form.id} listId={form.list} lists={lists}
        onRemove={removeItem} onUnbuy={unbuy} onClose={() => setForm(null)} />}
      {form && form.type === "buy" && <BuyForm store={store} id={form.id} onClose={() => setForm(null)} />}
      {form && form.type === "paste" && <PasteForm store={store} onClose={() => setForm(null)} />}
    </>
  );
}

/* ---------- compras: as mesmas coisas, agrupadas por urgência/canal em vez
   de coletânea. cruza com qualquer item da vitrine que tenha ganhado um
   bucket, e também guarda itens sem coletânea nenhuma (list vazio) — o caso
   comum de "2x tênis" colado de um bloco de notas. ---------- */
function ShoppingView({ store, onNewItem, onEditItem, onBuy, onUnbuy, onPaste }) {
  const items = store.all().filter((d) => d.type === "item" && d.bucket);
  const left = items.filter((it) => !it.bought);
  return (
    <>
      <div className="header">
        <div>
          <h1>compras</h1>
          {left.length > 0 && <p className="sub">{left.length + (left.length === 1 ? " item" : " itens")}</p>}
        </div>
        <div className="actions">
          <button className="pill pill--icon" type="button" title="colar uma lista" aria-label="colar uma lista" onClick={onPaste}>{icon("copy")}</button>
          <button className="pill pill--green" type="button" title="novo item (n)" onClick={onNewItem}>{icon("plus")}item</button>
        </div>
      </div>

      {!items.length && <p className="empty">Nada na lista de compras ainda. Cole o que você já tem escrito em algum lugar, ou guarde item a item.</p>}

      {BUCKETS.map((b) => {
        const bLeft = left.filter((it) => it.bucket === b.id).sort(byOrder);
        const bBought = items.filter((it) => it.bucket === b.id && it.bought);
        if (!bLeft.length && !bBought.length) return null;
        return (
          <section key={b.id} className="shopping-group">
            <p className="shopping-group__head"><span className="t-mono">{b.label}</span>{bLeft.length > 0 && <span className="weak">{bLeft.length}</span>}</p>
            {bLeft.length > 0 && (
              <div className="wish-grid">
                {bLeft.map((it) => <ItemCard key={it.id} it={it} onEdit={() => onEditItem(it)} onBuy={() => onBuy(it)} />)}
              </div>
            )}
            {bBought.length > 0 && (
              <div className="wish-grid wish-grid--bought">
                {bBought.map((it) => <ItemCard key={it.id} it={it} onEdit={() => onEditItem(it)} onUnbuy={() => onUnbuy(it)} />)}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

/* ---------- a vitrine inteira: as coletâneas lado a lado ---------- */
function Shelf({ store, lists, onOpen, onNewList }) {
  const items = store.all().filter((d) => d.type === "item");
  const wanted = items.filter((it) => !it.bought);
  return (
    <>
      <div className="header">
        <div>
          <h1>vitrine</h1>
          {wanted.length > 0 && <p className="sub">{wanted.length + (wanted.length === 1 ? " item" : " itens") + " · faltam " + brl(sum(wanted, (it) => it.price))}</p>}
        </div>
        <div className="actions">
          <button className="pill pill--green" type="button" title="nova coletânea (n)" onClick={onNewList}>{icon("plus")}coletânea</button>
        </div>
      </div>

      {!lists.length && <p className="empty">O que você quer comprar, agrupado em coletâneas — com preço, link e foto. O “+” abre a primeira.</p>}

      {lists.length > 0 && (
        <div className="shelf">
          {lists.map((l) => {
            const all = itemsOf(store, l.id);
            const left = all.filter((it) => !it.bought);
            /* a capa são as fotos do que ainda falta; comprado não enfeita vitrine */
            const covers = left.filter((it) => it.photo).slice(0, 4);
            return (
              <button key={l.id} type="button" className="shelf__card" onClick={() => onOpen(l)}>
                <span className={"shelf__cover shelf__cover--" + Math.max(1, covers.length)}>
                  {covers.length
                    ? covers.map((it) => <img key={it.id} src={fileUrl(it.photo.id)} alt="" loading="lazy" />)
                    : <i className="shelf__blank">{l.name.slice(0, 1)}</i>}
                </span>
                <span className="shelf__name">{l.name}</span>
                <span className="shelf__meta">
                  {all.length
                    ? left.length + " de " + all.length + (left.length ? " · " + brl(sum(left, (it) => it.price)) : "")
                    : "vazia"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ---------- uma coletânea aberta ---------- */
function ListView({ store, list, onBack, onEditList, onNewItem, onEditItem, onBuy, onUnbuy }) {
  const [showBought, setShowBought] = useState(false);
  const all = itemsOf(store, list.id);
  const left = all.filter((it) => !it.bought);
  const bought = all.filter((it) => it.bought).sort((a, b) => (b.bought.day > a.bought.day ? 1 : -1));
  const spent = sum(bought, (it) => it.bought.amount);
  const sub = [
    left.length ? "faltam " + brl(sum(left, (it) => it.price)) : "",
    bought.length ? "já foi " + brl(spent) : ""
  ].filter(Boolean).join(" · ");

  return (
    <>
      <div className="header">
        <div>
          <button className="wish-back" type="button" onClick={onBack}>{icon("arrowLeft")}vitrine</button>
          <h1>{list.name}</h1>
          {sub && <p className="sub">{sub}</p>}
        </div>
        <div className="actions">
          <button className="pill pill--icon" type="button" title="editar coletânea" aria-label="editar coletânea" onClick={onEditList}>{icon("pencil")}</button>
          <button className="pill pill--green" type="button" title="novo item (n)" onClick={onNewItem}>{icon("plus")}item</button>
        </div>
      </div>

      {!all.length && <p className="empty">Nada nesta coletânea ainda. O “+” guarda o primeiro item — cole a foto com ctrl v.</p>}

      {left.length > 0 && (
        <div className="wish-grid">
          {left.map((it) => <ItemCard key={it.id} it={it} onEdit={() => onEditItem(it)} onBuy={() => onBuy(it)} />)}
        </div>
      )}

      {bought.length > 0 && (
        <section className="wish-bought">
          <button className="wish-bought__toggle" type="button" aria-expanded={showBought} onClick={() => setShowBought((v) => !v)}>
            {icon(showBought ? "chevronDown" : "chevronRight")}
            <span>comprados · {bought.length}</span>
          </button>
          {showBought && (
            <div className="wish-grid wish-grid--bought">
              {bought.map((it) => <ItemCard key={it.id} it={it} onEdit={() => onEditItem(it)} onUnbuy={() => onUnbuy(it)} />)}
            </div>
          )}
        </section>
      )}
    </>
  );
}

function ItemCard({ it, onEdit, onBuy, onUnbuy }) {
  const host = hostOf(it.url);
  return (
    <article className={"wish" + (it.bought ? " is-bought" : "")}>
      <button className="wish__open" type="button" onClick={onEdit} aria-label={"editar " + it.name}>
        <span className="wish__photo">
          {it.photo ? <img src={fileUrl(it.photo.id)} alt="" loading="lazy" /> : <i>{it.name.slice(0, 1)}</i>}
        </span>
        <span className="wish__name">{it.qty && <b className="wish__qty">{it.qty}</b>}{it.name}</span>
        <span className="wish__meta">
          {it.bought
            ? <>{brl(it.bought.amount)} · {it.bought.day.split("-").reverse().slice(0, 2).join("/")}</>
            : <>{it.price ? brl(it.price) : <span className="weak">sem preço</span>}{host ? " · " + host : ""}</>}
        </span>
      </button>
      <span className="wish__actions row-actions">
        {it.url && <a className="action" href={withScheme(it.url)} target="_blank" rel="noreferrer" title={"abrir " + (host || "link")} aria-label="abrir link">{icon("link")}</a>}
        {onBuy && <button className="action" type="button" title="comprei" aria-label="comprei" onClick={onBuy}>{icon("check")}</button>}
        {onUnbuy && <button className="action" type="button" title="desfazer compra" aria-label="desfazer compra" onClick={onUnbuy}>{icon("x")}</button>}
      </span>
    </article>
  );
}

/* ---------- a caixa da coletânea: criar e editar são a mesma ---------- */
function ListForm({ store, id, count, onCreated, onRemove, onClose }) {
  const l = id ? store.get(id) : null;
  const [v, bind] = useFields({ name: l ? l.name : "" });
  if (id && !l) return null;
  const submit = () => {
    const name = v.name.trim().slice(0, 80);
    if (!name) { notify("a coletânea precisa de um nome"); return false; }
    const now = Date.now();
    if (l) { store.save({ ...l, name, updatedAt: now }); return; }
    const doc = store.save({ id: newId(), type: "list", name, order: count, createdAt: now, updatedAt: now });
    onCreated(doc);
  };
  return (
    <Form title={l ? "coletânea" : "nova coletânea"} submit={l ? "salvar" : "criar"} remove={l ? "apagar" : ""}
        onRemove={() => onRemove(l)} onClose={onClose} onSubmit={submit}>
      <Field label="nome" full><input className="input" maxLength="80" required placeholder="escritório, viagem, casa nova…" {...bind("name")} /></Field>
    </Form>
  );
}

/* ---------- a caixa do item ----------
   a foto sobe na hora em que chega (colar, arrastar ou escolher), porque o
   documento só guarda o bilhete. se a caixa fechar sem salvar, a foto nova
   sai do bucket; se salvar trocando a foto, sai a antiga. */
function ItemForm({ store, id, listId, lists, onRemove, onUnbuy, onClose }) {
  const it = id ? store.get(id) : null;
  const [v, bind, set] = useFields({
    name: it ? it.name : "",
    price: it ? it.price : 0,
    url: it ? it.url : "",
    list: it ? it.list : listId,
    note: it ? it.note : "",
    qty: it ? it.qty : "",
    bucket: it ? it.bucket : ""
  });
  const [photo, setPhoto] = useState(it ? it.photo : null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  const saved = useRef(false);
  const initial = it ? it.photo : null;
  /* a foto atual num ref: o efeito de desmontar lê a última, não a do primeiro render */
  const current = useRef(photo);
  current.current = photo;

  const take = async (files) => {
    const file = Array.from(files || []).find((f) => f && f.size && /^image\//.test(f.type));
    if (!file) return;
    setBusy(true);
    try {
      const up = await uploadFile(file);
      setPhoto((prev) => { if (prev && prev !== initial) deleteFile(prev.id); return up; });
    } catch (e) { notify(e.message || "não consegui subir a foto"); }
    finally { setBusy(false); }
  };

  /* colar vale na caixa inteira: ctrl v com uma imagem na área de transferência
     não tem texto nenhum a perder, então não há campo de quem roubar */
  useEffect(() => {
    const f = (e) => {
      const files = Array.from((e.clipboardData || {}).items || []).filter((i) => i.kind === "file").map((i) => i.getAsFile());
      if (!files.some((x) => x && /^image\//.test(x.type))) return;
      e.preventDefault();
      take(files);
    };
    document.addEventListener("paste", f);
    return () => document.removeEventListener("paste", f);
  }, []);

  useEffect(() => () => {
    const last = current.current;
    if (!saved.current && last && last !== initial) deleteFile(last.id);
  }, []);

  if (id && !it) return null;

  const submit = () => {
    const name = v.name.trim().slice(0, 140);
    if (!name) { notify("o item precisa de um nome"); return false; }
    if (busy) { notify("a foto ainda está subindo"); return false; }
    const now = Date.now();
    const doc = {
      name, price: Math.round(+v.price) || 0, url: v.url.trim(), list: v.list || listId,
      note: v.note, photo, updatedAt: now,
      qty: v.qty.trim().slice(0, 12), bucket: v.bucket
    };
    saved.current = true;
    if (initial && (!photo || photo.id !== initial.id)) deleteFile(initial.id);
    if (it) store.save({ ...it, ...doc });
    else store.save({ id: newId(), type: "item", order: now, bought: null, createdAt: now, ...doc });
  };

  const clearPhoto = () => {
    if (photo && photo !== initial) deleteFile(photo.id);
    setPhoto(null);
  };

  return (
    <Form title={it ? "item" : "novo item"} submit={it ? "salvar" : "guardar"} remove={it ? "apagar" : ""}
        aside={it && it.bought ? <button className="dialog__remove" type="button" title="desfazer compra" aria-label="Desfazer compra" onClick={() => { onClose(); onUnbuy(it); }}>{icon("undo")}</button> : null}
        onRemove={() => onRemove(it)} onClose={onClose} onSubmit={submit}>
      <Field label="nome" full><input className="input" maxLength="140" required placeholder="cadeira, fone, tênis…" {...bind("name")} /></Field>
      <Field label="quantidade"><input className="input" maxLength="12" placeholder="2x, ~1…" {...bind("qty")} /></Field>
      <Field label="preço"><MoneyInput placeholder="0,00" value={v.price} onChange={(c) => set("price", c)} /></Field>
      <Field label="coletânea">
        <select className="select" {...bind("list")}><option value="">— nenhuma —</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
      </Field>
      <Field label="lista de compras">
        <select className="select" {...bind("bucket")}><option value="">— fora da lista —</option>{BUCKETS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select>
      </Field>
      <Field label="link" full><input className="input" type="url" inputMode="url" placeholder="https://…" {...bind("url")} /></Field>
      <Field label="foto" full>
        <div className={"wish-photo" + (over ? " is-over" : "")}
             onDragOver={(e) => { e.preventDefault(); setOver(true); }}
             onDragLeave={() => setOver(false)}
             onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}>
          {photo
            ? <span className="wish-photo__img"><img src={fileUrl(photo.id)} alt="" /></span>
            : <span className="wish-photo__hint">{busy ? "subindo…" : <>cole com <kbd>ctrl</kbd> <kbd>v</kbd>, arraste ou escolha</>}</span>}
          <span className="wish-photo__foot">
            <button className="pill pill--mini" type="button" disabled={busy} onClick={() => inputRef.current && inputRef.current.click()}>{photo ? "trocar" : "escolher"}</button>
            {photo && <button className="pill pill--mini" type="button" onClick={clearPhoto}>tirar</button>}
            {!cloud.signedIn && <span className="weak small">entre para anexar — a foto precisa de onde morar</span>}
          </span>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
                 onChange={(e) => { take(e.currentTarget.files); e.currentTarget.value = ""; }} />
        </div>
      </Field>
      <Field label="nota" full><textarea className="textarea" rows="2" maxLength="2000" placeholder="tamanho, cor, cupom…" {...bind("note")} /></Field>
    </Form>
  );
}

/* ---------- colar uma lista ----------
   quem já escreve a lista de compras em outro lugar (bloco de notas, IA) não
   quer recadastrar item a item. cabeçalho em negrito vira a categoria; cada
   linha vira um item, com "2x"/"10x"/"~2" na frente virando a quantidade —
   o mesmo formato solto que a pessoa já usa fora do Merlin. */
const BUCKET_ALIASES = { asap: "asap", longterm: "longterm", aprazo: "longterm", online: "online", presencial: "presencial", mercado: "mercado" };
function parseShoppingText(text) {
  let bucket = "";
  const out = [];
  String(text || "").split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    const header = line.match(/^\*{1,2}([^*]+?)\*{1,2}:?$/);
    if (header) { bucket = BUCKET_ALIASES[foldKey(header[1])] || bucket; return; }
    const bullet = line.match(/^[-*•]\s+(.+)$/);
    if (!bullet || !bucket) return;
    const rest = bullet[1].trim();
    const qtyMatch = rest.match(/^(~?\d+x?)\s+(.+)$/i);
    out.push({ name: (qtyMatch ? qtyMatch[2] : rest).slice(0, 140), qty: qtyMatch ? qtyMatch[1] : "", bucket });
  });
  return out;
}
const PASTE_SAMPLE = "**asap**\n- 2x tênis\n- ~2 camisetas\n\n**mercado**\n- 1 coca 2l\n- tomate";

function PasteForm({ store, onClose }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseShoppingText(text), [text]);
  const submit = () => {
    if (!parsed.length) { notify("não reconheci nenhum item — comece com um cabeçalho em negrito, tipo **asap**"); return false; }
    const now = Date.now();
    const docs = parsed.map((p, i) => ({
      id: newId(), type: "item", list: "", name: p.name, price: 0, url: "", photo: null, note: "",
      bought: null, bucket: p.bucket, qty: p.qty, order: now + i, createdAt: now, updatedAt: now
    }));
    store.saveMany(docs);
    notify(docs.length === 1 ? "1 item guardado" : docs.length + " itens guardados");
  };
  return (
    <Form title="colar uma lista" wide
        sub="cabeçalhos em negrito (**asap**, **online**…) viram a categoria; cada linha vira um item"
        submit="guardar" onSubmit={submit} onClose={onClose}>
      <div className="full">
        <label className="field-label" htmlFor="wish-paste">lista</label>
        <textarea className="textarea" id="wish-paste" rows="14" spellCheck="false" placeholder={PASTE_SAMPLE}
          value={text} onChange={(e) => setText(e.currentTarget.value)} />
      </div>
      {text.trim() && (
        <p className="full weak small">
          {parsed.length ? parsed.length + (parsed.length === 1 ? " item reconhecido" : " itens reconhecidos") : "nenhum item reconhecido ainda"}
        </p>
      )}
    </Form>
  );
}

/* ---------- comprei ----------
   o preço anotado é a sugestão; o que se pagou de fato é o que vai para o
   financeiro. lançar é o padrão, mas dá para desmarcar (foi presente, foi
   no cartão que o financeiro já conta como parcelado). */
function BuyForm({ store, id, onClose }) {
  const it = store.get(id);
  const categories = financeCategories();
  const [v, bind, set] = useFields({
    amount: it ? it.price : 0,
    day: today(),
    launch: true,
    category: categories.includes("Outros") ? "Outros" : categories[0]
  });
  if (!it) return null;
  const submit = () => {
    const amount = Math.round(+v.amount) || 0;
    const day = isDay(v.day) ? v.day : today();
    if (v.launch && !amount) { notify("preciso do valor para lançar no financeiro"); return false; }
    const now = Date.now();
    let entry = null;
    if (v.launch) {
      entry = collection("finance").save({
        id: newId(), type: "entry", name: it.name, amount, day, kind: "out",
        category: v.category, paid: true, origin: { type: "wishlist", id: it.id },
        createdAt: now, updatedAt: now
      });
    }
    store.save({ ...it, bought: { day, amount, entry: entry ? entry.id : "" }, updatedAt: now });
    notify(entry ? "comprado, e a saída foi para o financeiro" : "comprado", () => {
      if (entry) collection("finance").remove(entry.id);
      store.save({ ...store.get(it.id), bought: null, updatedAt: Date.now() });
    });
  };
  return (
    <Form title="comprei" sub={it.name} submit="marcar comprado" onClose={onClose} onSubmit={submit}>
      <Field label="valor pago"><MoneyInput value={v.amount} onChange={(c) => set("amount", c)} /></Field>
      <Field label="data"><DateField {...bind("day")} /></Field>
      <label className="row full"><input type="checkbox" {...bind("launch", "check")} /> lançar a saída no financeiro</label>
      {v.launch && (
        <Field label="categoria">
          <select className="select" {...bind("category")}>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </Field>
      )}
    </Form>
  );
}

mount(<Wishlist />, "app");
