import type { CSSProperties } from "react";
import type { Tone } from "./model";

const INVERSE: CSSProperties = { color: "var(--on-inverse)", background: "var(--inverse)" };

const CLASS: Record<Tone, string> = {
  auto: "vx-badge",
  signed: "vx-badge",
  pending: "vx-badge vx-badge--pending",
  failed: "vx-badge vx-badge--not-verified",
  insufficient: "vx-badge vx-badge--insufficient",
};

export function StatusBadge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={CLASS[tone]} style={tone === "auto" || tone === "signed" ? INVERSE : undefined}>
      {children}
    </span>
  );
}

/** Punto de color de los chips del encabezado. */
export function ToneDot({ tone }: { tone: Tone | "verified" }) {
  const base: CSSProperties = { width: 8, height: 8, borderRadius: "50%", boxSizing: "border-box", flex: "none" };
  const style: Record<Tone | "verified", CSSProperties> = {
    auto: { background: "var(--inverse)" },
    signed: { background: "var(--verified)" },
    verified: { background: "var(--verified)" },
    pending: { border: "1.5px solid var(--pending)" },
    failed: { background: "var(--failed)" },
    insufficient: { background: "var(--insufficient)" },
  };
  return <span style={{ ...base, ...style[tone] }} />;
}

/** Link que cubre toda la card/fila: permite links internos (Arbiscan) sin anidar <a>. */
export const STRETCHED: CSSProperties = { position: "absolute", inset: 0, zIndex: 1, borderRadius: "inherit" };
export const ABOVE: CSSProperties = { position: "relative", zIndex: 2 };
