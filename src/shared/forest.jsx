/* merlin · a floresta
   a cena do inicio (VISAO, 10): uma floresta com um lago e, no alto do morro,
   a torre do Merlin com a janela acesa. ela acompanha a hora — amanhecer,
   dia, entardecer, noite — junto com a pergunta que o inicio faz. o Arthur
   escolheu a floresta (Avalon) entre quatro temas em 10/10/2026.

   tudo e SVG desenhado aqui, sem imagem: pesa quase nada, escala em qualquer
   tela e troca de cor so trocando a paleta. as arvores e as estrelas saem de
   um gerador com semente fixa, entao a floresta e sempre a MESMA floresta —
   so a luz muda. */
import "./forest.css";

export const phaseOf = (h) => (h >= 5 && h < 8 ? "dawn" : h >= 8 && h < 17 ? "day" : h >= 17 && h < 19 ? "dusk" : "night");

const PALETTE = {
  dawn:  { sky: ["#2b2f55", "#c9889a", "#f3c59b"], hill: "#3a3550", far: "#2c2a40", near: "#17151f", lake: ["#8a6f8f", "#2c2a40"], mist: 0.55, light: "#ffd7a8" },
  day:   { sky: ["#5fa3d6", "#9fcbe6", "#d9ecf2"], hill: "#5d8a73", far: "#3f6b58", near: "#22392f", lake: ["#8fc1d6", "#3f6b58"], mist: 0.35, light: "#fff6d8" },
  dusk:  { sky: ["#1f2547", "#7a4a6e", "#e79a6a"], hill: "#3b3048", far: "#2a2236", near: "#141019", lake: ["#b07a76", "#2a2236"], mist: 0.45, light: "#ffc27a" },
  night: { sky: ["#05070f", "#0b1430", "#1b2a4a"], hill: "#141c2e", far: "#0e1524", near: "#070a12", lake: ["#1f3253", "#0b1222"], mist: 0.25, light: "#ffe7a3" }
};

/* gerador com semente: a mesma floresta em toda carga */
function rng(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function pine(x, base, h, w) {
  const t = base - h;
  const a = (k) => base - h * k;
  return "M" + x + "," + t +
    " L" + (x + w * 0.32) + "," + a(0.62) + " L" + (x + w * 0.18) + "," + a(0.62) +
    " L" + (x + w * 0.42) + "," + a(0.3) + " L" + (x + w * 0.24) + "," + a(0.3) +
    " L" + (x + w * 0.5) + "," + base + " L" + (x - w * 0.5) + "," + base +
    " L" + (x - w * 0.24) + "," + a(0.3) + " L" + (x - w * 0.42) + "," + a(0.3) +
    " L" + (x - w * 0.18) + "," + a(0.62) + " L" + (x - w * 0.32) + "," + a(0.62) + " Z";
}

function row(seed, count, base, minH, maxH) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = (i / count) * 1500 - 30 + r() * 40;
    const h = minH + r() * (maxH - minH);
    out.push(pine(Math.round(x), base + Math.round(r() * 8), Math.round(h), Math.round(h * 0.42)));
  }
  return out.join(" ");
}

const FAR = row(7, 46, 300, 40, 80);
const NEAR = row(13, 30, 420, 90, 170);
const STARS = (() => {
  const r = rng(29);
  return Array.from({ length: 70 }, () => ({ x: Math.round(r() * 1440), y: Math.round(r() * 200), s: r() < 0.15 ? 1.6 : 0.9, d: (r() * 4).toFixed(1) }));
})();
const FLIES = (() => {
  const r = rng(41);
  return Array.from({ length: 16 }, () => ({ x: Math.round(150 + r() * 1140), y: Math.round(310 + r() * 90), d: (r() * 5).toFixed(1) }));
})();

export function Forest({ phase }) {
  const p = PALETTE[phase] || PALETTE.night;
  const dark = phase === "night" || phase === "dusk";
  const sunY = { dawn: 230, day: 70, dusk: 210, night: 80 }[phase];
  const sunX = { dawn: 260, day: 1080, dusk: 1180, night: 1150 }[phase];
  return (
    <svg className={"forest forest--" + phase} viewBox="0 0 1440 420" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="fo-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky[0]} /><stop offset="0.65" stopColor={p.sky[1]} /><stop offset="1" stopColor={p.sky[2]} />
        </linearGradient>
        <linearGradient id="fo-lake" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.lake[0]} /><stop offset="1" stopColor={p.lake[1]} />
        </linearGradient>
        <radialGradient id="fo-glow">
          <stop offset="0" stopColor={p.light} stopOpacity="0.55" /><stop offset="1" stopColor={p.light} stopOpacity="0" />
        </radialGradient>
        <filter id="fo-blur"><feGaussianBlur stdDeviation="14" /></filter>
      </defs>

      <rect width="1440" height="420" fill="url(#fo-sky)" />
      {dark && STARS.map((s, i) => <circle key={i} className="forest__star" cx={s.x} cy={s.y} r={s.s} style={{ animationDelay: s.d + "s" }} />)}

      <circle cx={sunX} cy={sunY} r="120" fill="url(#fo-glow)" />
      {phase === "night"
        ? <g><circle cx={sunX} cy={sunY} r="26" fill="#f4ecd2" /><circle cx={sunX + 10} cy={sunY - 6} r="22" fill={p.sky[0]} opacity="0.85" /></g>
        : <circle cx={sunX} cy={sunY} r={phase === "day" ? 24 : 30} fill={p.light} />}

      {/* o morro com a torre do Merlin: a janela acende quando escurece */}
      <path d="M-20,300 C200,190 380,200 560,250 C700,285 820,240 960,215 C1120,190 1300,240 1460,270 L1460,420 L-20,420 Z" fill={p.hill} />
      <g transform="translate(372,168)">
        <rect x="-9" y="0" width="18" height="44" fill={p.far} />
        <path d="M-13,0 L0,-22 L13,0 Z" fill={p.far} />
        <rect x="-3" y="12" width="6" height="8" rx="1" fill={dark || phase === "dawn" ? p.light : p.hill} className={dark ? "forest__window" : ""} />
      </g>

      <path d={FAR} fill={p.far} />
      <ellipse className="forest__mist" cx="520" cy="300" rx="420" ry="26" fill="#fff" opacity={p.mist * 0.5} filter="url(#fo-blur)" />
      <ellipse className="forest__mist forest__mist--b" cx="1080" cy="306" rx="380" ry="22" fill="#fff" opacity={p.mist * 0.45} filter="url(#fo-blur)" />

      {/* o lago, com o reflexo da luz */}
      <rect x="0" y="318" width="1440" height="60" fill="url(#fo-lake)" />
      <rect x={sunX - 50} y="326" width="100" height="2" fill={p.light} opacity="0.45" />
      <rect x={sunX - 30} y="336" width="60" height="2" fill={p.light} opacity="0.3" />
      <rect x={sunX - 16} y="346" width="32" height="2" fill={p.light} opacity="0.2" />

      <path d={NEAR} fill={p.near} />
      <rect x="0" y="404" width="1440" height="16" fill={p.near} />
      {dark && FLIES.map((f, i) => <circle key={i} className="forest__fly" cx={f.x} cy={f.y} r="2" fill="#fff3a0" style={{ animationDelay: f.d + "s" }} />)}
    </svg>
  );
}
