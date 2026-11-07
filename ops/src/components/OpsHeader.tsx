import Link from "next/link";
import { EXTERNAL_LINKS } from "@/infrastructure/chain/contracts";

/** Header compartido: logo (único lugar con el gradiente naranja junto a PAGAR) + acción opcional a la derecha. */
export function OpsHeader({ right, product = "OPS" }: { right?: React.ReactNode; product?: "OPS" | "PROOF" }) {
  return (
    <header
      style={{
        maxWidth: 1240, margin: "0 auto", padding: "20px 32px", display: "flex", flexWrap: "wrap",
        alignItems: "center", justifyContent: "space-between", gap: 16,
      }}
    >
      <Link href={product === "OPS" ? "/ops" : "/proof"} style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
        <svg width="20" height="18" viewBox="0 0 24 22" aria-hidden="true">
          <defs>
            <linearGradient id="vx-logo-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ff6600" />
              <stop offset="1" stopColor="#ff3300" />
            </linearGradient>
          </defs>
          <path d="M12 1 L23 21 H1 Z" fill="url(#vx-logo-g)" />
        </svg>
        <span className="vx-serif" style={{ fontSize: 20, color: "var(--ink-900)" }}>Vértice</span>
        <span className="vx-label" style={{ paddingLeft: 4 }}>{product}</span>
      </Link>
      <nav style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <ExternalNavLinks showProof={product === "OPS"} />
        {right}
      </nav>
    </header>
  );
}

/** Enlaces externos: el verificador real, el repo, y las slides (cuando existan). */
function ExternalNavLinks({ showProof }: { showProof: boolean }) {
  const linkStyle: React.CSSProperties = { color: "var(--ink-700)", textDecoration: "none" };
  return (
    <>
      {showProof && (
        <a href={EXTERNAL_LINKS.proof} target="_blank" rel="noopener noreferrer" className="vx-label" style={linkStyle}>
          Verificador real ↗
        </a>
      )}
      <a href={EXTERNAL_LINKS.github} target="_blank" rel="noopener noreferrer" className="vx-label" style={linkStyle}>
        GitHub ↗
      </a>
      {EXTERNAL_LINKS.slides && (
        <a href={EXTERNAL_LINKS.slides} target="_blank" rel="noopener noreferrer" className="vx-label" style={linkStyle}>
          Slides ↗
        </a>
      )}
    </>
  );
}

export function BackToBatch() {
  return (
    <Link href="/ops" className="vx-btn vx-btn--ghost vx-btn--sm">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 6l-6 6 6 6" />
      </svg>
      Volver al lote
    </Link>
  );
}
