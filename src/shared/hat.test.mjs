/* merlin · testes do chapéu (shared/hat.js)
   puro: roda em node, sem navegador. `node src/shared/hat.test.mjs`

   o chapéu é feito de números, e número errado não quebra nada: só deixa o
   personagem esquisito, e ninguém percebe até ver. o que estes testes
   seguram é o que dá para errar sem ver — um humor com nome de número
   trocado, um olho que escapa do cone, uma pálpebra que vira o olho do
   avesso. */
import { REST, MOODS, GESTURES, chatMood, spine, eyeShape, hatShape, CONE_L, CONE_W, TIP, EYE_MARGIN } from "./hat.js";

let ok = 0, bad = 0;
const check = (name, cond, extra) => {
  if (cond) ok++;
  else { bad++; console.log("✗ " + name + (extra ? " — " + extra : "")); }
};
const pose = (mood, extra) => ({ ...REST, ...Object.fromEntries(Object.entries(MOODS[mood]).filter(([k]) => k in REST)), ...extra });

/* ---- os humores só falam a língua do chapéu ----
   um "blsuh: 1" num humor não dá erro: o número é ignorado e o humor sai
   sem a bochecha, sem ninguém saber por quê */
for (const [name, mood] of Object.entries(MOODS)) {
  const unknown = Object.keys(mood).filter((k) => !(k in REST) && !GESTURES.includes(k));
  check("o humor " + name + " só usa números que o chapéu conhece", unknown.length === 0, unknown.join(" "));
  const kicks = Object.keys(mood.kick || {}).filter((k) => !(k in REST));
  check("o pulo do " + name + " só empurra números do chapéu", kicks.length === 0, kicks.join(" "));
}
check("todo humor que a conversa usa existe", ["idle", "listening", "thinking", "working", "talking", "done", "confused"].every((m) => m in MOODS));

/* ---- a espinha ---- */
{
  const straight = spine({ ...REST, bend: 0 });
  check("sem tombar, o cone é reto", straight.pts.every(([x]) => Math.abs(x) < 1e-9));
  const top = straight.pts[straight.pts.length - 1];
  check("sem tombar, a altura é o comprimento", Math.abs(top[1] - straight.pts[0][1] + CONE_L) < 1e-6, String(top[1]));
  const bent = spine({ ...REST, bend: 1 });
  check("tombar leva a ponta para a direita", bent.pts[bent.pts.length - 1][0] > 10, String(bent.pts[bent.pts.length - 1][0]));
  check("tombar para o outro lado leva para a esquerda", spine({ ...REST, bend: -1 }).pts[30][0] < -10);
  check("a base é a mais larga", Math.abs(straight.wid[0] - CONE_W) < 1e-9);
  check("a ponta tem a largura da ponta", Math.abs(straight.wid[straight.wid.length - 1] - TIP) < 1e-9);
  check("a largura só afina para cima", straight.wid.every((w, i) => i === 0 || w < straight.wid[i - 1]));
}

/* ---- o olho ---- */
{
  const top = (P) => Math.min(...P.map(([, y]) => y));
  const bottom = (P) => Math.max(...P.map(([, y]) => y));
  const open = eyeShape(9, 14, 0, 0, 0, 1);
  check("o olho tem 28 pontos", open.length === 28);
  check("o olho aberto é tão alto quanto pediu", Math.abs(bottom(open) - top(open) - 14) < 0.01, String(bottom(open) - top(open)));
  const lids = [0, 0.3, 0.6, 0.9].map((l) => eyeShape(9, 14, l, 0, 0, 1));
  check("a pálpebra desce por cima", lids.every((P, i) => i === 0 || top(P) > top(lids[i - 1])));
  check("a pálpebra não mexe embaixo", lids.every((P) => Math.abs(bottom(P) - 7) < 0.01));
  check("nem fechada a pálpebra vira o olho do avesso", lids.every((P) => top(P) < bottom(P)));
  /* inner = 1: o meio do rosto fica do lado de x positivo */
  const angry = eyeShape(9, 14, 0.2, 0.8, 0, 1);
  const innerTop = Math.min(...angry.filter(([x]) => x > 3).map(([, y]) => y));
  const outerTop = Math.min(...angry.filter(([x]) => x < -3).map(([, y]) => y));
  check("bravo desce o canto de dentro", innerTop > outerTop, innerTop + " x " + outerTop);
  const middle = (P) => P.reduce((m, p) => (Math.abs(p[0]) < Math.abs(m[0]) ? p : m))[1];
  const smile = eyeShape(9, 6, 0, 0, 0.8, 1), flat = eyeShape(9, 6, 0, 0, 0, 1), asleep = eyeShape(9, 6, 0, 0, -0.5, 1);
  check("o arco sobe o meio do olho (∩)", middle(smile) < middle(flat));
  check("o arco negativo desce o meio (‿)", middle(asleep) > middle(flat));
  check("nenhum número sai torto", [open, angry, smile, asleep].flat(2).every(Number.isFinite));
}

/* ---- o olho fica dentro do cone ----
   o olho é branco e o fundo do app é escuro: um olho que passa da borda do
   cone parece cortado. em todo humor, olhando para os quatro cantos */
for (const name of Object.keys(MOODS)) {
  for (const gx of [-1.2, 0, 1.2]) for (const gy of [-1.2, 0, 1.2]) {
    const { eyes } = hatShape(pose(name, { gx, gy }));
    eyes.forEach((e, i) => {
      const room = e.coneWidth - (Math.abs(e.off) + e.w / 2);
      check("em " + name + " olhando " + gx + "," + gy + " o olho " + (i ? "direito" : "esquerdo") + " cabe no cone",
        room >= EYE_MARGIN - 1e-6, room.toFixed(2));
    });
  }
}

/* ---- tudo o que se desenha sai desenhável ---- */
for (const name of Object.keys(MOODS)) {
  const s = hatShape(pose(name), 1.5);
  const paths = [s.cone, s.band, s.brim, ...s.eyes.map((e) => e.d)];
  check("o " + name + " sai sem NaN no desenho", paths.every((d) => typeof d === "string" && d.length > 20 && !d.includes("NaN")));
}

/* ---- o humor na conversa ---- */
{
  const busy = { text: "montando o rascunho…", mood: "working" };
  check("esperando, o humor é o da espera", chatMood({ thinking: busy, feeling: "done", typing: true }) === "working");
  check("espera sem humor é pensar", chatMood({ thinking: { text: "…" }, feeling: null, typing: false }) === "thinking");
  check("a reação ganha de quem escreve", chatMood({ thinking: false, feeling: "confused", typing: true }) === "confused");
  check("escrevendo, ele ouve", chatMood({ thinking: false, feeling: null, typing: true }) === "listening");
  check("sem nada, parado", chatMood({ thinking: false, feeling: null, typing: false }) === "idle");
  check("todo humor que a conversa devolve existe", [busy, false].every((t) => chatMood({ thinking: t, feeling: null, typing: false }) in MOODS));
}

console.log("chapéu: " + ok + " verificações ok" + (bad ? ", " + bad + " falharam" : ""));
if (bad) process.exit(1);
