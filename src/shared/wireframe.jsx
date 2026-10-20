/* merlin · o wireframe de uma tela (PRD desenhos, D2)
   a tela desenhada em baixa fidelidade: moldura de celular e, de cima para
   baixo, um bloco por linha do que ela tem. tudo por atributo (e nao por
   classe), para o PNG sair igual ao que esta na tela. mora aqui, e nao no
   apps.jsx, porque a conversa desenha o rascunho do protótipo com ele
   (assistant.jsx, ticket #95). a regra dos blocos e pura: app-spec.js. */
import { FRAME_W, FRAME_H, WIRE_PAD, wireframeOf, placeWireframe } from "./app-spec.js";

const WIRE_FONT = "Sora, system-ui, sans-serif";
const INNER = FRAME_W - WIRE_PAD * 2;
/* corta o rotulo pela largura: o SVG nao quebra linha sozinho */
const fit = (t, px) => { const n = Math.floor(INNER / px); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

function WireBlock({ b }) {
  const x = WIRE_PAD, y = b.y;
  if (b.kind === "heading") return <text x={x} y={y + 19} fontSize="15" fontWeight="700" fill="var(--ink)">{fit(b.label, 8.4)}</text>;
  if (b.kind === "button") return (
    <g>
      <rect x={x} y={y} width={INNER} height={b.h} rx="9" fill="var(--accent)" />
      <text x={FRAME_W / 2} y={y + b.h / 2 + 4} fontSize="12" fontWeight="600" textAnchor="middle" fill="var(--on-accent)">{fit(b.label, 7)}</text>
    </g>
  );
  if (b.kind === "input") return (
    <g>
      <rect x={x + 0.5} y={y + 0.5} width={INNER - 1} height={b.h - 1} rx="7" fill="var(--surface)" stroke="var(--ink-30)" />
      <text x={x + 10} y={y + b.h / 2 + 4} fontSize="11" fill="var(--ink-50)">{fit(b.label, 6.6)}</text>
    </g>
  );
  if (b.kind === "image") return (
    <g>
      <rect x={x + 0.5} y={y + 0.5} width={INNER - 1} height={b.h - 1} rx="7" fill="var(--fill)" stroke="var(--line)" />
      <path d={"M" + (x + 3) + "," + (y + 3) + " L" + (x + INNER - 3) + "," + (y + b.h - 3) + " M" + (x + INNER - 3) + "," + (y + 3) + " L" + (x + 3) + "," + (y + b.h - 3)} stroke="var(--line)" />
      <text x={FRAME_W / 2} y={y + b.h / 2 + 4} fontSize="10.5" textAnchor="middle" fill="var(--ink-50)" stroke="var(--surface-2)" strokeWidth="4" paintOrder="stroke">{fit(b.label, 6.4)}</text>
    </g>
  );
  if (b.kind === "list") return (
    <g>
      <text x={x} y={y + 11} fontSize="10.5" fontWeight="600" fill="var(--ink-50)">{fit(b.label, 6.4)}</text>
      {[0, 1, 2].map((i) => {
        const ry = y + 18 + i * 21;
        return (
          <g key={i}>
            <circle cx={x + 7} cy={ry + 9} r="7" fill="var(--fill)" stroke="var(--line)" />
            <rect x={x + 22} y={ry + 3} width={INNER * (i === 1 ? 0.5 : 0.62)} height="5" rx="2.5" fill="var(--ink-30)" />
            <rect x={x + 22} y={ry + 12} width={INNER * (i === 2 ? 0.28 : 0.38)} height="4" rx="2" fill="var(--line)" />
          </g>
        );
      })}
    </g>
  );
  return <text x={x} y={y + 13} fontSize="11" fill="var(--ink-70)">{fit(b.label, 6.6)}</text>;
}

export function Wireframe({ screen, className = "ap-wire__svg" }) {
  const { items, hidden } = placeWireframe(wireframeOf(screen.parts));
  return (
    <svg className={className} viewBox={"0 0 " + FRAME_W + " " + FRAME_H} width={FRAME_W} height={FRAME_H}
      fontFamily={WIRE_FONT} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="0.5" width={FRAME_W - 1} height={FRAME_H - 1} rx="24" fill="var(--surface-2)" stroke="var(--line)" />
      <rect x={FRAME_W / 2 - 22} y="9" width="44" height="6" rx="3" fill="var(--line)" />
      <text x={WIRE_PAD} y="31" fontSize="10.5" fill="var(--ink-30)">{fit(screen.name, 6.4)}</text>
      {items.map((b, i) => <WireBlock key={i} b={b} />)}
      {!items.length && (
        <text x={FRAME_W / 2} y={FRAME_H / 2 - 8} fontSize="11.5" textAnchor="middle" fill="var(--ink-50)">
          <tspan x={FRAME_W / 2}>escreva o que a tela tem,</tspan>
          <tspan x={FRAME_W / 2} dy="16">uma coisa por linha</tspan>
        </text>
      )}
      {hidden > 0 && <text x={FRAME_W / 2} y={FRAME_H - 11} fontSize="10.5" textAnchor="middle" fill="var(--ink-50)">+ {hidden} {hidden === 1 ? "coisa" : "coisas"} abaixo</text>}
    </svg>
  );
}
