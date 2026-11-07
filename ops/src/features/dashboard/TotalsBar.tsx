import Link from "next/link";
import type { Currency, Invoice } from "@/domain/invoice";
import { formatAmount, shortHash } from "@/domain/format";
import { txUrl } from "@/infrastructure/chain/contracts";
import { PayButton } from "@/features/pay/PayButton";
import { formatTotals, pagos, sumByCurrency, type Row } from "./model";

type Props = {
  rows: Row[];
  onPaid?: (txHash: `0x${string}`) => void;
};

function Amount({ totals, size }: { totals: [Currency, bigint][]; size?: "sm" }) {
  if (totals.length === 0) {
    return (
      <span className={`vx-amount${size ? " vx-amount--sm" : ""}`}>
        <span className="vx-amount__value">0,00</span>
        <span className="vx-amount__unit">ARGt</span>
      </span>
    );
  }
  return (
    <span style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 16 }}>
      {totals.map(([c, v]) => (
        <span key={c} className={`vx-amount${size ? " vx-amount--sm" : ""}`}>
          <span className="vx-amount__value">{formatAmount(v)}</span>
          <span className="vx-amount__unit">{c}</span>
        </span>
      ))}
    </span>
  );
}

export function TotalsBar({ rows, onPaid }: Props) {
  const auto = rows.filter((r) => r.pf.path === "auto" && r.pf.executed);
  const toSign = rows.filter((r) => r.pf.path === "firma" && !r.pf.executed);
  const signed = rows.filter((r) => r.pf.path === "firma" && r.pf.executed);
  const exceptions = rows.filter((r) => r.pf.path === "excepcion");

  // PayButton exige una sola moneda: un botón por moneda (hoy, solo ARGt).
  const signGroups = new Map<Currency, Invoice[]>();
  for (const r of toSign) signGroups.set(r.invoice.currency, [...(signGroups.get(r.invoice.currency) ?? []), r.invoice]);

  const lastAutoTx = auto.find((r) => r.txHash)?.txHash;

  return (
    <section
      aria-label="Totales del lote"
      className="vx-card"
      style={{
        position: "sticky", bottom: 16, zIndex: 10, padding: 0, gap: 0, overflow: "hidden",
        borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lift)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap" }}>
        <div
          style={{
            flex: "1 1 260px", minWidth: 0, padding: "12px 20px", display: "flex", flexDirection: "column", gap: 2,
            background: "var(--canvas)", borderRight: "1px solid var(--line)",
          }}
        >
          <span className="vx-label">Ejecutado auto · {pagos(auto.length)}</span>
          <Amount totals={sumByCurrency(auto)} size="sm" />
          <span className="vx-mono" style={{ fontSize: 12, color: "var(--ink-500)" }}>
            por política · wallet operativa
            {lastAutoTx && (
              <>
                {" · "}
                <a href={txUrl(lastAutoTx)} target="_blank" rel="noreferrer" style={{ color: "var(--ink-700)" }}>
                  tx {shortHash(lastAutoTx)}
                </a>
                {" · "}
                <span style={{ color: "var(--verified)" }}>VERIFIED</span>
              </>
            )}
          </span>
          {signed.length > 0 && (
            <span className="vx-mono" style={{ fontSize: 12, color: "var(--ink-500)" }}>
              + firmado por vos: {formatTotals(sumByCurrency(signed))}
              {signed[0].txHash && (
                <>
                  {" · "}
                  <a href={txUrl(signed[0].txHash)} target="_blank" rel="noreferrer" style={{ color: "var(--ink-700)" }}>
                    tx {shortHash(signed[0].txHash)}
                  </a>
                </>
              )}
            </span>
          )}
        </div>
        <div
          style={{
            flex: "999 1 480px", minWidth: 0, padding: "12px 20px", display: "flex", flexWrap: "wrap",
            alignItems: "center", justifyContent: "space-between", gap: 20,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span className="vx-label">Requiere tu firma · {pagos(toSign.length)}</span>
            <Amount totals={sumByCurrency(toSign)} size="sm" />
            <span className="vx-mono" style={{ fontSize: 12, color: "var(--ink-500)" }}>
              {toSign.length > 0 ? "approve · payBatch" : "nada pendiente de firma"}
              {exceptions.length > 0 && ` · excepciones fuera del total: ${formatTotals(sumByCurrency(exceptions))}`}
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
            <Link href="/ops/cierre" className="vx-btn vx-btn--ghost vx-btn--sm">Ver el cierre</Link>
            {[...signGroups.entries()].map(([c, invoices]) => (
              <PayButton key={c} invoices={invoices} onPaid={onPaid} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
