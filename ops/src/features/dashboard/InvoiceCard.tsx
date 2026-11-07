import Link from "next/link";
import { formatAmount, shortHash } from "@/domain/format";
import { invoiceProofHref } from "@/features/proof/claim";
import { supplierName, type Row } from "./model";
import { ABOVE, STRETCHED, StatusBadge } from "./StatusBadge";

const ICON = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export function InvoiceCard({ row }: { row: Row }) {
  const { invoice, pf } = row;
  const name = supplierName(invoice);
  return (
    <article
      className="vx-card vx-card--interactive"
      style={{ position: "relative", color: "var(--ink-900)", gap: 0, padding: 20, borderRadius: "var(--radius-lg)" }}
    >
      <div style={{ display: "flex", flexWrap: "wrap-reverse", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span className="vx-mono" style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-500)", whiteSpace: "nowrap" }}>{invoice.number}</span>
        <StatusBadge tone={row.tone}>{row.badge}</StatusBadge>
      </div>
      <h2 className="vx-serif" style={{ margin: "10px 0 0", fontSize: 22, lineHeight: 1.2 }}>{name}</h2>
      <span className="t-small" style={{ marginTop: 2, color: "var(--ink-500)" }}>
        {invoice.supplier.country} · factura en{" "}
        <span className="vx-mono" style={{ fontSize: 12, color: "var(--ink-700)" }}>{invoice.originCurrency}</span>
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 10, marginTop: 8 }}>
        <span className="vx-amount vx-amount--sm">
          <span className="vx-amount__value">{formatAmount(invoice.amount)}</span>
          <span className="vx-amount__unit">{invoice.currency}</span>
        </span>
        {pf.executed && <span className="vx-badge vx-badge--verified">Verified</span>}
      </div>
      <p
        className="t-small"
        style={{
          margin: "12px 0 0", flex: "1 1 auto", color: "var(--ink-500)",
          display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}
      >
        {row.note}
      </p>
      {row.txHash && (
        <Link href={invoiceProofHref(row.invoice, row.txHash, row.pf.payment?.runId ?? row.invoice.executed?.runId)} title="Verificar en PROOF"
          className="vx-mono"
          style={{ ...ABOVE, alignSelf: "flex-start", marginTop: 8, fontSize: 12, color: "var(--ink-700)" }}
        >
          tx {shortHash(row.txHash)} · PROOF
        </Link>
      )}
      <div
        style={{
          display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginTop: 16, paddingTop: 12,
          borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--ink-500)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <svg {...ICON}><path d="M12 3l8 4v5c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V7z" /></svg>
          {row.allowLabel}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <svg {...ICON}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          {row.pathLabel}
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 500, color: "var(--ink-900)" }}>
          Abrir
          <svg {...ICON}><path d="M7 17L17 7M8 7h9v9" /></svg>
        </span>
      </div>
      <Link href={row.href} aria-label={`Abrir ${invoice.number} · ${name}`} style={STRETCHED} />
    </article>
  );
}
