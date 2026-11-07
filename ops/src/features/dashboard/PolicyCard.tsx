import type { ChainSnapshot } from "@/domain/preflight";
import { AUTO_EXECUTION_THRESHOLD } from "@/domain/policy";
import { formatAmount, formatBlock } from "@/domain/format";

const CHIP = {
  fontSize: 12, padding: "6px 10px", borderRadius: "var(--radius-sm)", background: "var(--sunken)", color: "var(--ink-700)",
} as const;

export function ChainNote({ snapshot, isLive }: { snapshot: ChainSnapshot; isLive: boolean }) {
  return (
    <span className="vx-mono" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-500)" }}>
      <span
        aria-hidden="true"
        style={{ width: 6, height: 6, borderRadius: "50%", background: isLive ? "var(--verified)" : "var(--ink-400)" }}
      />
      {isLive ? `en vivo · bloque ${formatBlock(snapshot.blockNumber)}` : `datos on-chain: snapshot bloque ${formatBlock(snapshot.blockNumber)}`}
    </span>
  );
}

export function PolicyCard({ snapshot, isLive }: { snapshot: ChainSnapshot; isLive: boolean }) {
  const { ARGt, BRAt } = snapshot.currencies;
  const sameCaps = ARGt.perPaymentCap === BRAt.perPaymentCap && ARGt.batchCap === BRAt.batchCap;
  const caps = sameCaps
    ? [`Tope duro del contrato · ${formatAmount(ARGt.perPaymentCap)} por pago`, `Tope duro del contrato · ${formatAmount(ARGt.batchCap)} por lote`]
    : [
        `Tope duro ARGt · ${formatAmount(ARGt.perPaymentCap)} por pago / ${formatAmount(ARGt.batchCap)} por lote`,
        `Tope duro BRAt · ${formatAmount(BRAt.perPaymentCap)} por pago / ${formatAmount(BRAt.batchCap)} por lote`,
      ];

  return (
    <section id="politica" aria-label="Política de pagos" className="vx-card" style={{ borderRadius: "var(--radius-lg)", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 640 }}>
          <span className="vx-label">Política · umbral de auto-ejecución</span>
          <p style={{ margin: 0, display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 }}>
            <span className="vx-amount vx-amount--sm">
              <span className="vx-amount__value">{formatAmount(AUTO_EXECUTION_THRESHOLD)}</span>
              <span className="vx-amount__unit">por pago</span>
            </span>
          </p>
          <p className="t-small" style={{ margin: 0, color: "var(--ink-700)" }}>
            Hasta ese monto, la wallet operativa paga sola por política, dentro de los topes del contrato. Por encima, o ante
            cualquier excepción, firmás vos con PAGAR.
          </p>
        </div>
        <ChainNote snapshot={snapshot} isLive={isLive} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {caps.map((c) => (
          <span key={c} className="vx-mono" style={CHIP}>{c}</span>
        ))}
        <span className="vx-mono" style={CHIP}>Solo direcciones en allowlist</span>
        <span className="vx-mono" style={CHIP}>Moneda de pago: ARGt · BRAt</span>
      </div>
    </section>
  );
}
