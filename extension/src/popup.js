/* merlin · o popup da nota rapida
   tres telas, sem framework: e-mail, codigo, nota. cada uma redesenha o
   #app inteiro — simples o bastante pra nao precisar de React aqui. */
import { getSession, requestCode, signIn, signOut, saveNote } from "./lib.js";

const app = document.getElementById("app");

async function boot() {
  const session = await getSession();
  if (session) renderNote(session);
  else renderEmail();
}

function renderEmail() {
  app.innerHTML = `
    <h1>merlin</h1>
    <p class="hint">entre com seu e-mail pra guardar notas rápidas.</p>
    <input id="email" type="email" placeholder="você@guessless.com.br" autofocus>
    <button id="send">pedir código</button>
    <p class="error" id="err"></p>
  `;
  const email = app.querySelector("#email");
  const err = app.querySelector("#err");
  const send = app.querySelector("#send");
  const go = async () => {
    const v = email.value.trim();
    if (!v) { err.textContent = "digite um e-mail"; return; }
    send.disabled = true; err.textContent = "";
    try { await requestCode(v); renderCode(v); }
    catch (e) { err.textContent = e.message; send.disabled = false; }
  };
  send.onclick = go;
  email.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
}

function renderCode(email) {
  app.innerHTML = `
    <h1>merlin</h1>
    <p class="hint">o código chegou em ${email}.</p>
    <input id="code" inputmode="numeric" maxlength="6" placeholder="000000" autofocus>
    <button id="confirm">entrar</button>
    <button class="ghost" id="back" type="button">usar outro e-mail</button>
    <p class="error" id="err"></p>
  `;
  const code = app.querySelector("#code");
  const err = app.querySelector("#err");
  const confirm = app.querySelector("#confirm");
  const go = async () => {
    const v = code.value.trim();
    if (v.length !== 6) { err.textContent = "o código tem 6 dígitos"; return; }
    confirm.disabled = true; err.textContent = "";
    try { const s = await signIn(email, v); renderNote(s); }
    catch (e) { err.textContent = e.message; confirm.disabled = false; }
  };
  confirm.onclick = go;
  code.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  app.querySelector("#back").onclick = renderEmail;
}

function renderNote(session) {
  app.innerHTML = `
    <div class="row"><h1>merlin</h1><button class="ghost" id="out" type="button">sair</button></div>
    <p class="hint">${session.email || ""}</p>
    <textarea id="text" placeholder="escreva…" autofocus></textarea>
    <button id="save">guardar</button>
    <p class="error" id="err"></p>
  `;
  const text = app.querySelector("#text");
  const err = app.querySelector("#err");
  const save = app.querySelector("#save");
  const go = async () => {
    const v = text.value.trim();
    if (!v) return;
    save.disabled = true; err.textContent = "";
    try { await saveNote(v); window.close(); }
    catch (e) { err.textContent = e.message; save.disabled = false; }
  };
  save.onclick = go;
  text.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); } });
  app.querySelector("#out").onclick = async () => { await signOut(); renderEmail(); };
}

boot();
