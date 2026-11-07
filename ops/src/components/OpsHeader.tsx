import Link from "next/link";
import { EXTERNAL_LINKS } from "@/infrastructure/chain/contracts";
import { Logo } from "./Logo";

/** Header compartido: logo (único lugar con el gradiente naranja junto a PAGAR) + acción opcional a la derecha. */
export function OpsHeader({ right, product = "OPS" }: { right?: React.ReactNode; product?: "OPS" | "PROOF" }) {
  return (
    <header
      style={{
        maxWidth: 1240, margin: "0 auto", padding: "20px 32px", display: "flex", flexWrap: "wrap",
        alignItems: "center", justifyContent: "space-between", gap: 16,
      }}
    >
      <Logo href={product === "OPS" ? "/ops" : "/proof"} product={product} />
      <nav style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <ExternalNavLinks showProof={product === "OPS"} />
        {product === "PROOF" && (
          <Link href="/ops" className="vx-btn vx-btn--ghost vx-btn--sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
            Volver a OPS
          </Link>
        )}
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
      <a href={EXTERNAL_LINKS.contract} target="_blank" rel="noopener noreferrer" className="vx-label" style={linkStyle}>
        Contrato ↗
      </a>
      <a href={EXTERNAL_LINKS.transaction} target="_blank" rel="noopener noreferrer" className="vx-label" style={linkStyle}>
        Transacción ↗
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
