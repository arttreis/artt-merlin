/* merlin · a extensao burra
   so sabe autenticar e mandar texto. a normalizacao da nota (titulo, forma
   do documento) e toda do lado do worker, em /api/quick-note — a extensao
   nunca monta um documento sozinha.

   auth: o cookie de sessao do site nao serve aqui, porque a origem da
   extensao (chrome-extension://…) nao e o dominio do worker — o SameSite=Lax
   do cookie e pensado pro site, mesma origem. em vez disso, /api/sign-in
   tambem devolve o token assinado no corpo (alem do cookie, que o site usa),
   e a extensao guarda esse token e manda em x-merlin-token daqui pra frente. */

const DEFAULT_ORIGIN = "https://merlin.arttreis.com.br";

async function getOrigin() {
  const { origin } = await chrome.storage.local.get("origin");
  return origin || DEFAULT_ORIGIN;
}

export async function getSession() {
  const { token, email } = await chrome.storage.local.get(["token", "email"]);
  return token ? { token, email } : null;
}

export async function requestCode(email) {
  const origin = await getOrigin();
  const r = await fetch(origin + "/api/code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email })
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || "não consegui pedir o código");
}

export async function signIn(email, code) {
  const origin = await getOrigin();
  const r = await fetch(origin + "/api/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code })
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body.token) throw new Error(body.error || "código inválido");
  await chrome.storage.local.set({ token: body.token, email: body.email });
  return { email: body.email };
}

export async function signOut() {
  await chrome.storage.local.remove(["token", "email"]);
}

export async function saveNote(text) {
  const session = await getSession();
  if (!session) throw new Error("entre primeiro");
  const origin = await getOrigin();
  const r = await fetch(origin + "/api/quick-note", {
    method: "POST",
    headers: { "content-type": "application/json", "x-merlin-token": session.token },
    body: JSON.stringify({ text })
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    /* token morto (expirou, ou foi trocado por outro sign-in): esquece a
       sessao pra proxima abertura ja pedir e-mail de novo, em vez de repetir
       o mesmo erro pra sempre */
    if (r.status === 401) await signOut();
    throw new Error(body.error || "não consegui guardar a nota");
  }
  return body;
}
