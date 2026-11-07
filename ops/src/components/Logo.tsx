import Link from "next/link";

/**
 * Marca VÉRTICE ("Par"): una V equilátera partida por una ranura de un trazo
 * que no llega al fondo. La mitad izquierda lleva el gradiente de marca (la IA
 * que hace el trabajo); la derecha va en tinta (la persona que autoriza). Las
 * dos se tocan solo en el vértice. Único lugar, junto con PAGAR, donde aparece
 * el gradiente #ff6600 → #ff3300.
 *
 * Construcción: grilla de 48 u, triángulo equilátero (60°), ranura de 3 u.
 */
export function LogoMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="vx-brand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff6600" />
          <stop offset="1" stopColor="#ff3300" />
        </linearGradient>
      </defs>
      <path d="M6 9 H22.5 V28 L24 30.6 V40.2 Z" fill="url(#vx-brand)" />
      <path d="M25.5 9 H42 L24 40.2 V30.6 L25.5 28 Z" fill="currentColor" />
    </svg>
  );
}

/** Lockup horizontal: símbolo + "VÉRTICE" + sufijo opcional (OPS / PROOF). Hereda el color del contexto. */
export function Logo({
  href = "/",
  product,
  className,
  size = 22,
}: {
  href?: string;
  product?: "OPS" | "PROOF";
  className?: string;
  size?: number;
}) {
  return (
    <Link
      href={href}
      className={className}
      aria-label={product ? `Vértice ${product}, inicio` : "Vértice, inicio"}
      style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", color: "var(--ink-900)" }}
    >
      <LogoMark size={size} />
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontWeight: 500,
          fontSize: Math.round(size * 0.68),
          letterSpacing: "0.14em",
          lineHeight: 1,
        }}
      >
        VÉRTICE
      </span>
      {product && <span className="vx-label" style={{ paddingLeft: 2 }}>{product}</span>}
    </Link>
  );
}
