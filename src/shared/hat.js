/* merlin · o chapéu
   ---------------------------------------------------------------
   o Merlin em pessoa: um chapéu de mago desenhado inteiro em código, no
   espírito do Grok Bot (VISAO, 12). nada aqui é imagem nem keyframe: o
   chapéu é um punhado de números (quanto a ponta tomba, para onde os
   olhos olham, quanto a pálpebra desce) e cada humor é só um alvo para
   esses números. uma mola leva cada número de onde ele está até o alvo,
   então qualquer humor vira qualquer outro sem corte, até no meio de uma
   troca.

   a forma (hatShape) é pura e se prova sem navegador (hat.test.mjs). quem
   mexe no DOM é só o createHat, e só quando é chamado.

     const chapeu = createHat(svg, { mood: "idle" })
     chapeu.set("thinking")   // um dos MOODS
     chapeu.look(x, y)        // olha para um ponto (-1..1); null solta
     chapeu.destroy()

   a cor sai de token: o roxo --merlin e o --on-merlin do olho são do
   personagem; as faíscas de quando ele termina alguma coisa usam o --accent.
   --------------------------------------------------------------- */

const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const r2 = (n) => Math.round(n * 100) / 100;
const pt = (p) => r2(p[0]) + " " + r2(p[1]);
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/* o repouso. todo humor parte daqui e só diz o que muda */
export const REST = {
  // o corpo
  hop: 0,      // pulo, em unidades do viewBox (negativo sobe)
  squash: 0,   // + achata, - estica
  tilt: 0,     // o chapéu inteiro inclina (rad)
  lean: 0,     // o cone pende sobre a aba (rad)
  bend: 1,     // a ponta tomba (rad, + para a direita)
  curl: 0,     // a ponta enrola, só no fim (rad)
  flap: 0,     // a aba: + as pontas sobem, - caem
  // os olhos
  gx: 0, gy: 0, // para onde olha (-1..1)
  open: 1,      // abertura: 0 fechado, 1.3 arregalado
  size: 1,
  lid: 0,       // a pálpebra de cima (0..0.9)
  slant: 0,     // + bravo (o canto de dentro desce), - triste
  arc: 0,       // + o olho sorri (∩), - dorme (‿)
  // o olho direito em relação ao esquerdo
  rOpen: 0, rY: 0,
  // os movimentos são amplitudes, para que entrar e sair deles também seja suave
  breathe: 1, sway: 1, swing: 0, wobble: 0, bob: 0,
  // os efeitos (0..1)
  dots: 0, orbit: 0
};
const KEYS = Object.keys(REST);

/* o que um humor pode ter além dos números: gestos de uma vez só */
export const GESTURES = ["glance", "kick", "burst"];

/* três molas: o olho é rápido, o corpo balança, o efeito entra devagar */
const EYES = ["gx", "gy", "open", "size", "lid", "slant", "arc", "rOpen", "rY"];
const SOFT = ["breathe", "sway", "swing", "wobble", "bob", "dots", "orbit"];
const SPRING = Object.fromEntries(KEYS.map((k) => [k, EYES.includes(k) ? [520, 36] : SOFT.includes(k) ? [60, 15.5] : [190, 15]]));

/* os humores da conversa. a folha de personagem do protótipo (.tmp/chapeu)
   tem outros (feliz, triste, dormindo, aviso…); entram aqui quando uma tela
   precisar deles, não antes */
export const MOODS = {
  idle:      { glance: 1 },
  listening: { gy: 0.55, open: 1.1, size: 1.04, bend: 0.5, lean: 0.05, squash: -0.03, sway: 0.4 },
  thinking:  { gx: 0.4, gy: -0.6, lid: 0.12, bend: 0.9, swing: 1, sway: 0, dots: 1 },
  working:   { gy: 0.25, lid: 0.32, bend: 0.75, wobble: 1, sway: 0, orbit: 1 },
  talking:   { arc: 0.3, open: 0.85, bend: 0.8, bob: 1, glance: 0.35 },
  done:      { arc: 0.8, open: 0.5, bend: 0.35, flap: 0.3, sway: 0.5, burst: true, kick: { hop: -90, squash: -2 } },
  confused:  { curl: 2.9, bend: 1.3, tilt: 0.12, gx: -0.35, gy: -0.4, rOpen: -0.3, rY: -1.4, sway: 0.3 }
};

/* o humor na conversa: o que está acontecendo ganha do que acabou de
   acontecer, que ganha de quem está escrevendo. `thinking` é o que a tela
   mostra enquanto espera ({text, mood}); `feeling`, a reação de um instante
   ao que chegou */
export function chatMood({ thinking, feeling, typing }) {
  if (thinking) return thinking.mood || "thinking";
  if (feeling) return feeling;
  return typing ? "listening" : "idle";
}

/* ---------- a forma ----------
   o cone é uma espinha: cada pedaço tem um ângulo, e a ponta tomba somando
   ângulo do meio para cima. a largura afina da base até a ponta, e o
   contorno é a espinha empurrada para os dois lados. */
export const BRIM_RX = 40, BRIM_RY = 8.4;
export const CONE_W = 28.5, CONE_L = 58, TIP = 3, BASE = -2.5, N = 30;
const EYE_S = 0.29, EYE_PHI = 0.5, EYE_W = 9.4, EYE_H = 13.6;
/* quanto o olho fica longe da borda do cone, no mínimo: o branco dele
   encostado na borda parece um olho cortado */
export const EYE_MARGIN = 2.4;

export function spine(p, t = 0) {
  const pts = [], ang = [], wid = [];
  const ds = CONE_L / N;
  let x = 0, y = BASE;
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const a = p.lean * s
      + p.bend * ease(0.25, 1, s)
      + p.curl * Math.pow(Math.max(0, (s - 0.5) / 0.5), 2)
      + 0.24 * p.wobble * Math.sin(t * 8 - s * 3.4) * s * s;
    pts.push([x, y]); ang.push(a);
    wid.push(TIP + (CONE_W - TIP) * Math.pow(1 - s, 1.18));
    x += Math.sin(a) * ds; y -= Math.cos(a) * ds;
  }
  return { pts, ang, wid };
}

/* um ponto qualquer da espinha, entre duas amostras */
function at(sp, s) {
  const f = clamp(s, 0, 1) * N, i = Math.min(N - 1, Math.floor(f)), u = f - i;
  return {
    x: lerp(sp.pts[i][0], sp.pts[i + 1][0], u), y: lerp(sp.pts[i][1], sp.pts[i + 1][1], u),
    a: lerp(sp.ang[i], sp.ang[i + 1], u), w: lerp(sp.wid[i], sp.wid[i + 1], u)
  };
}

/* curva suave pelos pontos: cada ponto vira controle e a curva passa pelos
   meios. nunca passa do polígono, então não incha nos cantos. */
function through(P) {
  let d = "";
  for (let i = 1; i < P.length - 1; i++) d += " Q" + pt(P[i]) + " " + pt(mid(P[i], P[i + 1]));
  return d + " L" + pt(P[P.length - 1]);
}
function closed(P) {
  const n = P.length;
  let d = "M" + pt(mid(P[n - 1], P[0]));
  for (let i = 0; i < n; i++) d += " Q" + pt(P[i]) + " " + pt(mid(P[i], P[(i + 1) % n]));
  return d + "Z";
}

function cone(sp) {
  const R = [], L = [];
  for (let i = 0; i <= N; i++) {
    const c = Math.cos(sp.ang[i]), s = Math.sin(sp.ang[i]), w = sp.wid[i];
    R.push([sp.pts[i][0] + c * w, sp.pts[i][1] + s * w]);
    L.push([sp.pts[i][0] - c * w, sp.pts[i][1] - s * w]);
  }
  const tr = r2(sp.wid[N]);
  // a base é a frente de uma elipse em perspectiva: assenta o cone na aba
  const d = "M" + pt(R[0]) + through(R) + " A" + tr + " " + tr + " 0 0 0 " + pt(L[N])
    + through(L.slice().reverse()) + " Q" + pt([sp.pts[0][0], BASE + sp.wid[0] * 0.42]) + " " + pt(R[0]) + "Z";
  return { d, R, L };
}

/* a fita: o pé do cone, com a borda de cima na mesma perspectiva */
function band(sp, R, L) {
  const j = 3, q = sp.pts[j], a = sp.ang[j], dip = sp.wid[j] * 0.42;
  return "M" + pt(L[0]) + " Q" + pt([sp.pts[0][0], BASE + sp.wid[0] * 0.42]) + " " + pt(R[0])
    + " L" + pt(R[j]) + " Q" + pt([q[0] - Math.sin(a) * dip, q[1] + Math.cos(a) * dip]) + " " + pt(L[j]) + "Z";
}

function brim(flap) {
  const P = [];
  for (let i = 0; i < 36; i++) {
    const th = (i / 36) * TAU, x = BRIM_RX * Math.cos(th), k = x / BRIM_RX;
    P.push([x, BRIM_RY * Math.sin(th) - flap * 4.5 * k * k * k * k]);
  }
  return closed(P);
}

/* o olho: um quadrado de canto redondo (superelipse) que a pálpebra corta
   por cima e o arco entorta. inner diz para que lado fica o meio do rosto,
   que é onde o bravo desce e o triste sobe. y cresce para baixo. */
export function eyeShape(w, h, lid, slant, arc, inner, w0 = EYE_W) {
  const a = Math.max(w / 2, 0.3), b = Math.max(h / 2, 0.75);
  const e = 2 / 3.6, L = clamp(lid, 0, 0.9), bend = arc * w0 * 0.5;
  const out = [];
  for (let i = 0; i < 28; i++) {
    const th = (i / 28) * TAU, c = Math.cos(th), s = Math.sin(th);
    const x = a * Math.sign(c) * Math.pow(Math.abs(c), e);
    let y = b * Math.sign(s) * Math.pow(Math.abs(s), e);
    const k = x / a;
    const top = Math.min(-b + L * 2 * b + slant * inner * k * b * 0.62, b - 0.6);
    if (y < top) y = top;
    out.push([x, y - bend * (1 - k * k)]);
  }
  return out;
}

/* os dois olhos moram na superfície do cone: girar o olhar escorrega os
   dois em volta dele, e o de trás afina, como numa cabeça redonda */
function eyePair(sp, p) {
  const yaw = clamp(p.gx, -1.2, 1.2) * 0.6;
  return [-1, 1].map((side) => {
    const right = side > 0;
    const q = at(sp, EYE_S - clamp(p.gy, -1.2, 1.2) * 0.07);
    const phi = side * EYE_PHI + yaw;
    const fore = Math.max(0.2, Math.cos(phi));
    const nx = Math.cos(q.a), ny = Math.sin(q.a), dx = -Math.sin(q.a), dy = Math.cos(q.a);
    const w = EYE_W * p.size * fore;
    const lim = Math.max(0, q.w - w / 2 - EYE_MARGIN);
    const off = clamp(q.w * Math.sin(phi) * 0.96, -lim, lim), down = right ? p.rY : 0;
    const cx = q.x + nx * off + dx * down, cy = q.y + ny * off + dy * down;
    const h = EYE_H * p.size * clamp(p.open + (right ? p.rOpen : 0), 0.04, 1.5);
    const P = eyeShape(w, h, p.lid, p.slant, p.arc, -side, EYE_W * p.size)
      .map(([x, y]) => [cx + nx * x + dx * y, cy + ny * x + dy * y]);
    return { d: closed(P), off, w, h, coneWidth: q.w };
  });
}

/* tudo o que se desenha, a partir dos números */
export function hatShape(p, t = 0) {
  const sp = spine(p, t);
  const c = cone(sp);
  const ta = sp.ang[N], tw = sp.wid[N];
  return {
    spine: sp,
    cone: c.d,
    band: band(sp, c.R, c.L),
    brim: brim(p.flap),
    eyes: eyePair(sp, p),
    tip: [sp.pts[N][0] + Math.sin(ta) * tw, sp.pts[N][1] - Math.cos(ta) * tw],
    orbit: at(sp, 0.6)
  };
}

/* a faísca do Merlin, a mesma dos botões de IA, só que de pontas curvas */
function spark(x, y, r, rot = 0) {
  const P = [];
  for (let i = 0; i < 4; i++) {
    const a = rot + (i * Math.PI) / 2;
    P.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
  }
  let d = "M" + pt(P[0]);
  for (let i = 0; i < 4; i++) d += " Q" + r2(x) + " " + r2(y) + " " + pt(P[(i + 1) % 4]);
  return d + "Z";
}

/* ---------- o personagem ---------- */
const NS = "http://www.w3.org/2000/svg";
const BODY = "fill:var(--merlin)";
const RING = "fill:none;stroke:var(--merlin);stroke-width:1;stroke-linecap:round";

export function createHat(svg, opts = {}) {
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const make = (tag, parent, style) => {
    const e = document.createElementNS(NS, tag);
    if (style) e.setAttribute("style", style);
    parent.appendChild(e);
    return e;
  };
  // tight: só o chapéu, para caber num botão; sem ele sobra céu para os efeitos
  svg.setAttribute("viewBox", opts.tight ? "9 19 82 82" : "0 0 100 100");
  svg.style.overflow = "visible";
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const root = make("g", svg);
  const back = make("g", root);
  const ringBack = make("path", back, RING);
  const orbBack = [0, 1, 2].map(() => make("path", back, BODY));
  const brimEl = make("path", root, BODY);
  const coneEl = make("path", root, BODY);
  const bandEl = make("path", root, "fill:color-mix(in oklab,var(--merlin) 66%,black)");
  const eyeEl = [0, 1].map(() => make("path", root, "fill:var(--on-merlin)"));
  const front = make("g", root);
  const ringFront = make("path", front, RING);
  const orbFront = [0, 1, 2].map(() => make("path", front, BODY));
  const dotEl = [0, 1, 2].map(() => make("circle", front, BODY));
  const sparkEl = Array.from({ length: 8 }, (_, i) => make("path", front, i % 2 ? BODY : "fill:var(--accent)"));

  const cur = { ...REST }, vel = Object.fromEntries(KEYS.map((k) => [k, 0]));
  // o relógio de cada chapéu começa num ponto diferente, para não andarem em coro
  const born = performance.now() - Math.random() * 9000;
  const clock = () => (performance.now() - born) / 1000;
  let name = null, cfg = MOODS.idle, target = { ...REST };
  let last = performance.now(), raf = 0;
  let blinkAt = clock() + 0.8 + Math.random() * 2.5, blinkT = -9, twice = false;
  let glanceAt = 0, glance = [0, 0], pointer = null;
  let burstT = -9, burstAng = [], prevHop = 0, lag = 0;

  const vis = (el, o) => el.setAttribute("opacity", r2(clamp(o, 0, 1)));

  function set(next) {
    if (next === name) return;
    const first = name === null;
    name = next in MOODS ? next : "idle";
    cfg = MOODS[name];
    target = { ...REST };
    for (const k in cfg) if (k in REST) target[k] = cfg[k];
    // o primeiro humor já nasce pronto; dali em diante, tudo é mola
    if (first) Object.assign(cur, target);
    if (cfg.kick) for (const k in cfg.kick) vel[k] += cfg.kick[k];
    if (cfg.burst) {
      burstT = clock();
      burstAng = sparkEl.map((_, i) => (i * TAU) / 8 + (Math.random() - 0.5) * 0.5);
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    // o svg saiu da página: o laço para sozinho, sem depender de quem o criou
    if (!svg.isConnected) return destroy();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - born) / 1000;

    // para onde olhar: quem chamou manda; sem isso, o humor e umas olhadas em volta
    let gx = target.gx, gy = target.gy;
    if (cfg.glance && !pointer) {
      if (t > glanceAt) {
        glance = Math.random() < 0.35 ? [0, 0] : [(Math.random() * 2 - 1) * 0.75, (Math.random() * 2 - 1) * 0.4];
        glanceAt = t + 1.4 + Math.random() * 3.2;
      }
      gx += glance[0] * cfg.glance; gy += glance[1] * cfg.glance;
    }
    if (pointer) { gx = lerp(gx, pointer[0], 0.85); gy = lerp(gy, pointer[1], 0.85); }

    // as molas, em dois meios passos
    for (let step = 0; step < 2; step++) {
      const h = dt / 2;
      for (const k of KEYS) {
        const g = k === "gx" ? gx : k === "gy" ? gy : target[k];
        const [K, C] = SPRING[k];
        vel[k] += (K * (g - cur[k]) - C * vel[k]) * h;
        cur[k] += vel[k] * h;
      }
    }

    // o movimento por cima das molas; com movimento reduzido, nenhum
    const p = { ...cur }, m = reduce ? 0 : 1;
    p.squash += 0.014 * p.breathe * m * Math.sin((TAU * t) / 3.2);
    p.tilt += 0.025 * p.sway * m * Math.sin((TAU * t) / 6.3);
    p.bend += 0.12 * p.sway * m * Math.sin((TAU * t) / 4.4 + 0.8);
    p.bend += 0.3 * p.swing * m * Math.sin((TAU * t) / 1.9);
    p.tilt += 0.03 * p.swing * m * Math.sin((TAU * t) / 1.9 - 0.6);
    const bo = Math.abs(Math.sin((TAU * t) / 0.9));
    p.hop += -2.2 * p.bob * m * bo;
    p.squash += 0.035 * p.bob * m * (0.5 - bo);
    p.bend += 0.12 * p.bob * m * Math.sin((TAU * t) / 0.9 - 1);

    // a aba e a ponta ficam para trás no pulo e chegam depois no pouso
    const dh = (p.hop - prevHop) / Math.max(dt, 0.001);
    prevHop = p.hop;
    lag = lerp(lag, clamp(dh, -120, 120), 0.3);
    p.flap += lag * 0.006;
    p.bend -= lag * 0.004;

    // piscar: de vez em quando, às vezes duas seguidas
    if (t >= blinkAt) { blinkT = t; twice = Math.random() < 0.18; blinkAt = t + 2 + Math.random() * 4.5; }
    const bt = t - blinkT;
    const shut = bt < 0.16 ? Math.sin((Math.PI * bt) / 0.16) : twice && bt > 0.24 && bt < 0.4 ? Math.sin((Math.PI * (bt - 0.24)) / 0.16) : 0;
    p.open *= 1 - 0.92 * shut;

    draw(p, t);
  }

  function draw(p, t) {
    // com movimento reduzido os efeitos ficam parados; o piscar e as trocas andam
    const te = reduce ? 0 : t;
    const sx = 1 + p.squash * 0.6, sy = 1 - p.squash;
    root.setAttribute("transform", "translate(50 " + r2(82 + p.hop) + ") rotate(" + r2(p.tilt * DEG) + ") scale(" + r2(sx) + " " + r2(sy) + ")");
    const s = hatShape(p, te);
    coneEl.setAttribute("d", s.cone);
    bandEl.setAttribute("d", s.band);
    brimEl.setAttribute("d", s.brim);
    s.eyes.forEach((e, i) => eyeEl[i].setAttribute("d", e.d));

    // pensando: três pontos que sobem do alto do chapéu, um de cada vez
    const DOT = [[15, -63, 1.5], [22, -68, 2], [30, -71, 2.5]];
    dotEl.forEach((el, i) => {
      if (p.dots < 0.01) return vis(el, 0);
      const pulse = 0.5 + 0.5 * Math.sin(te * 5.2 - i * 0.9);
      el.setAttribute("cx", DOT[i][0]); el.setAttribute("cy", r2(DOT[i][1] - pulse * 1.2));
      el.setAttribute("r", r2(DOT[i][2] * p.dots * (0.75 + 0.35 * pulse)));
      vis(el, p.dots * (0.35 + 0.65 * pulse));
    });

    // trabalhando: faíscas em órbita; a metade de trás passa atrás do cone
    if (p.orbit > 0.01) {
      const o = s.orbit, RX = 27, RY = 6.5, T = -0.12;
      const E = (th) => {
        const x = RX * Math.cos(th), y = RY * Math.sin(th);
        return [o.x + x * Math.cos(T) - y * Math.sin(T), o.y + x * Math.sin(T) + y * Math.cos(T)];
      };
      const arc = (a, b) => "M" + pt(E(a)) + " A" + RX + " " + RY + " " + r2(T * DEG) + " 0 1 " + pt(E(b));
      ringBack.setAttribute("d", arc(Math.PI, TAU));
      ringFront.setAttribute("d", arc(0, Math.PI));
      vis(ringBack, p.orbit * 0.25); vis(ringFront, p.orbit * 0.4);
      for (let i = 0; i < 3; i++) {
        const th = te * 2.3 + (i * TAU) / 3 + 0.5, [x, y] = E(th), depth = Math.sin(th);
        const on = depth > 0 ? orbFront[i] : orbBack[i], off = depth > 0 ? orbBack[i] : orbFront[i];
        on.setAttribute("d", spark(x, y, 3.4 * (0.8 + 0.3 * depth) * p.orbit, te * 1.5));
        vis(on, p.orbit); vis(off, 0);
      }
    } else [ringBack, ringFront, ...orbBack, ...orbFront].forEach((el) => vis(el, 0));

    // pronto: faíscas que saem da ponta
    const bt = t - burstT;
    sparkEl.forEach((el, i) => {
      if (bt > 0.9) return vis(el, 0);
      const u = bt / 0.9, e = 1 - Math.pow(1 - u, 3), a = burstAng[i], dist = 4 + 13 * e;
      el.setAttribute("d", spark(s.tip[0] + Math.cos(a) * dist, s.tip[1] + Math.sin(a) * dist, 3.6 * (1 - u) + 0.3, a));
      vis(el, 1 - u * u);
    });
  }

  function destroy() { cancelAnimationFrame(raf); raf = 0; }

  set(opts.mood || "idle");
  raf = requestAnimationFrame(frame);

  return {
    set,
    look(x, y) { pointer = x == null ? null : [clamp(x, -1, 1), clamp(y, -1, 1)]; },
    destroy,
    get mood() { return name; }
  };
}
