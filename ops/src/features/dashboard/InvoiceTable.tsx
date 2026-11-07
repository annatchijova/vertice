import Link from "next/link";
import { formatAmount, shortHash } from "@/domain/format";
import { invoiceProofHref } from "@/features/proof/claim";
import { supplierName, type Row } from "./model";
import { ABOVE, STRETCHED, StatusBadge } from "./StatusBadge";

const COLS = "1fr 1.3fr 0.8fr 0.9fr 1.1fr 1fr";

export function InvoiceTable({ rows }: { rows: Row[] }) {
  return (
    <div className="vx-card" style={{ padding: 0, gap: 0, overflow: "hidden", borderRadius: "var(--radius-lg)" }}>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 820 }}>
          <div
            className="vx-label"
            style={{ display: "grid", gridTemplateColumns: COLS, gap: 16, padding: "12px 20px", background: "var(--canvas)", borderBottom: "1px solid var(--line)" }}
          >
            <span>Factura</span><span>Proveedor</span><span>Origen</span><span style={{ textAlign: "right" }}>Monto</span><span>Camino</span><span>Estado</span>
          </div>
          {rows.map((row) => {
            const { invoice } = row;
            const name = supplierName(invoice);
            return (
              <div
                key={invoice.id}
                style={{
                  position: "relative", display: "grid", gridTemplateColumns: COLS, gap: 16, alignItems: "center",
                  padding: "14px 20px", borderBottom: "1px solid var(--line)", color: "var(--ink-900)",
                }}
              >
                <span className="vx-mono" style={{ fontSize: 12, color: "var(--ink-500)" }}>{invoice.number}</span>
                <span className="t-title" style={{ fontSize: 14 }}>{name}</span>
                <span className="t-small" style={{ color: "var(--ink-700)" }}>
                  {invoice.supplier.country} · <span className="vx-mono" style={{ fontSize: 12 }}>{invoice.originCurrency}</span>
                </span>
                <span className="vx-mono" style={{ fontSize: 13, textAlign: "right" }}>
                  {formatAmount(invoice.amount)} <span style={{ color: "var(--ink-500)" }}>{invoice.currency}</span>
                </span>
                <span className="t-small" style={{ color: "var(--ink-500)" }}>{row.pathLabel}</span>
                <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <StatusBadge tone={row.tone}>{row.badgeShort}</StatusBadge>
                  {row.txHash && (
                    <Link href={invoiceProofHref(row.invoice, row.txHash, row.pf.payment?.runId ?? row.invoice.executed?.runId)} title="Verificar en PROOF" className="vx-mono" style={{ ...ABOVE, fontSize: 11, color: "var(--ink-700)" }}>
                      {shortHash(row.txHash)} · PROOF
                    </Link>
                  )}
                </span>
                <Link href={row.href} aria-label={`Abrir ${invoice.number} · ${name}`} style={STRETCHED} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
