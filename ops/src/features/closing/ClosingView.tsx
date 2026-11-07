"use client";

import Link from "next/link";
import { useMemo } from "react";
import { INVOICES } from "@/data/invoices";
import { preflightAll } from "@/domain/preflight";
import { AUTO_EXECUTION_THRESHOLD } from "@/domain/policy";
import { formatAmount, formatBlock, shortAddr, shortHash } from "@/domain/format";
import type { Invoice } from "@/domain/invoice";
import { useChainSnapshot } from "@/infrastructure/chain/useChainSnapshot";
import { OPERATIVE_WALLET, txUrl } from "@/infrastructure/chain/contracts";
import { invoiceProofHref } from "@/features/proof/claim";
import {
  PATH_LABEL, amountsByCurrency, buildClosing, downloadCsv, joinAmounts, mailtoFor, shortName, signerLabel,
  type Closing, type CurrencyTotals, type PendingRow,
} from "./closing";

const GRID = "1.4fr 0.9fr 0.9fr 1.1fr 1.2fr 0.8fr 1.3fr";
const pl = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function ClosingView() {
  const { snapshot, isLive } = useChainSnapshot();
  const closing = useMemo(() => buildClosing(preflightAll(INVOICES, snapshot), snapshot), [snapshot]);

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "24px 32px 96px", display: "flex", flexDirection: "column", gap: 32 }}>
      <Heading closing={closing} />
      <Totals closing={closing} />
      <Summary closing={closing} capArgt={snapshot.currencies.ARGt.perPaymentCap} />
      <Receipts closing={closing} />
      <Pending closing={closing} />
      <p className="vx-mono" style={{ margin: 0, fontSize: 12, color: "var(--ink-500)" }}>
        {isLive ? "Lectura en vivo" : "Snapshot (RPC no disponible)"} · Arbitrum One · bloque {formatBlock(snapshot.blockNumber)}
      </p>
    </main>
  );
}

function Heading({ closing }: { closing: Closing }) {
  const n = closing.paid.length;
  const m = closing.pending.length;
  const allVerified = closing.paid.every((r) => r.verified);
  const paidText =
    n === 0
      ? "Sin pagos ejecutados todavía."
      : `${n} ${pl(n, "pago", "pagos")} ${allVerified ? pl(n, "verificado", "verificados") : pl(n, "ejecutado", "ejecutados")}.`;
  const pendingText = m === 0 ? "Lote completo." : `${m} ${pl(m, "factura pasa", "facturas pasan")} a diciembre.`;
  return (
    <section style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="vx-label">Cierre del período · Noviembre 2026</span>
        <h1 className="t-h1" style={{ margin: 0 }}>{paidText} {pendingText}</h1>
      </div>
      <button type="button" className="vx-btn vx-btn--primary" onClick={() => downloadCsv(closing)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        </svg>
        Exportar CSV
      </button>
    </section>
  );
}

function Amounts({ closing, k, muted }: { closing: Closing; k: keyof CurrencyTotals; muted?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {amountsByCurrency(closing, k).map((a) => (
        <span key={a.currency} className="vx-amount vx-amount--sm">
          <span className="vx-amount__value" style={muted ? { color: "var(--ink-500)" } : undefined}>{a.value}</span>
          <span className="vx-amount__unit">{a.currency}</span>
        </span>
      ))}
    </div>
  );
}

function Totals({ closing }: { closing: Closing }) {
  const tiles: { label: string; k: keyof CurrencyTotals; muted?: boolean }[] = [
    { label: "Pagado", k: "paid" },
    { label: "Camino auto · por política", k: "auto" },
    { label: "Con tu firma", k: "firma" },
    { label: "Pendiente", k: "pending", muted: true },
  ];
  return (
    <section
      aria-label="Totales"
      style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 1, background: "var(--line)",
        border: "1px solid var(--line)", borderRadius: "var(--radius-md)", overflow: "hidden",
      }}
    >
      {tiles.map((t) => (
        <div key={t.k} style={{ background: "var(--surface)", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="vx-label">{t.label}</span>
          <Amounts closing={closing} k={t.k} muted={t.muted} />
        </div>
      ))}
    </section>
  );
}

/** Nombre corto; si el proveedor aparece más de una vez en el lote, agrega el final del número de factura. */
function who(inv: Invoice, withCountry = true) {
  const dup = INVOICES.filter((i) => i.supplier.name === inv.supplier.name).length > 1;
  const base = shortName(inv.supplier.name);
  if (dup) return `${base} (${inv.number.slice(0, 4)}…${inv.number.slice(-4)})`;
  return withCountry ? `${base} (${inv.supplier.country})` : base;
}

function pendingSentence(r: PendingRow, capArgt: bigint): string {
  const inv = r.invoice;
  const name = who(inv);
  switch (r.reason) {
    case "TYPO":
      return `${name} tiene un tipeo en la dirección de cobro y espera la factura corregida`;
    case "NO_FUNDS":
      return `${name} se paga en ${inv.currency} y la wallet no tiene fondos ${inv.currency}`;
    case "PRICE_ALERT": {
      const pct = Math.round(((Number(inv.amount) - avg(inv)) / avg(inv)) * 100);
      const cap = inv.currency === "ARGt" ? ` y supera el tope de ${formatAmount(capArgt)} ARGt del contrato` : " y supera el tope del contrato";
      return `${name} subió ${pct}% vs. los últimos 3 meses${r.reasons.includes("OVER_CAP") ? cap : ""}: espera tu decisión`;
    }
    case "OVER_CAP":
      return `${name} supera el tope por pago del contrato`;
    case "RECIPIENT_NOT_APPROVED":
      return `${name} tiene un destinatario sin aprobar en el contrato`;
    default:
      return `${name} pasa todos los checks y espera tu firma (${formatAmount(r.amountUnits)} ${inv.currency})`;
  }
}

const avg = (inv: Invoice) => inv.history.reduce((s, h) => s + Number(h.amount), 0) / inv.history.length;

function Summary({ closing, capArgt }: { closing: Closing; capArgt: bigint }) {
  const { paid, pending, total } = closing;
  const thr = formatAmount(AUTO_EXECUTION_THRESHOLD);
  const auto = paid.filter((r) => r.path === "auto");
  const firma = paid.filter((r) => r.path !== "auto");
  const allVerified = paid.every((r) => r.verified);
  const names = (rs: typeof paid) => rs.map((r) => who(r.invoice, false)).join(", ");

  const lead =
    paid.length === 0
      ? `De las ${total} facturas del lote, todavía no hay ninguna pagada.`
      : `De las ${total} facturas del lote, ${paid.length} ${pl(paid.length, "quedó pagada", "quedaron pagadas")} por ${joinAmounts(
          amountsByCurrency(closing, "paid"),
        )}${allVerified ? ", verificado en cadena" : ""}.` +
        (auto.length
          ? ` ${auto.length} por el camino auto (wallet operativa ${shortAddr(OPERATIVE_WALLET)}): ${names(auto)}, porque no superaba el umbral de ${thr} ARGt de tu política.`
          : "") +
        (firma.length ? ` ${firma.length} con tu firma: ${names(firma)}.` : "");

  const rest =
    pending.length === 0
      ? "No quedan facturas pendientes."
      : `${pending.length === 1 ? "Queda 1 pendiente" : `Quedan ${pending.length} pendientes`} por ${joinAmounts(
          amountsByCurrency(closing, "pending"),
        )}: ${pending.map((r) => pendingSentence(r, capArgt)).join("; ")}.`;

  const runs = [...new Set(paid.map((r) => r.runId))];

  return (
    <article className="vx-card" style={{ padding: "clamp(24px, 4vw, 40px)", gap: 16, maxWidth: 860 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span className="vx-label">Resumen del lote</span>
        {runs.length > 0 && (
          <span className="vx-mono" style={{ fontSize: 12, color: "var(--ink-500)" }}>
            {pl(runs.length, "run", "runs")} {runs.map((r) => shortHash(r)).join(" · ")}
          </span>
        )}
      </div>
      <p className="vx-serif" style={{ margin: 0, fontSize: 22, lineHeight: 1.45, color: "var(--ink-900)" }}>{lead}</p>
      <p className="t-body" style={{ margin: 0, color: "var(--ink-700)" }}>
        {rest} Las monedas de origen ({closing.originCurrencies.join(", ")}) quedan en el CSV como referencia; los totales van
        por moneda de pago, sin sumar {closing.currencies.join(" con ")}.
      </p>
      <p className="t-small" style={{ margin: 0, color: "var(--ink-500)" }}>
        Este texto no cambia montos ni estados: los toma del lote y de la lectura en cadena.
      </p>
    </article>
  );
}

function Receipts({ closing }: { closing: Closing }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 className="t-h3" style={{ margin: 0 }}>Comprobantes</h2>
      <div className="vx-card" style={{ padding: 0, gap: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 960 }}>
            <div
              className="vx-label"
              style={{ display: "grid", gridTemplateColumns: GRID, gap: 16, padding: "12px 20px", background: "var(--canvas)", borderBottom: "1px solid var(--line)" }}
            >
              <span>Proveedor</span><span>Origen</span><span style={{ textAlign: "right" }}>Monto</span><span>Camino</span>
              <span>Transacción</span><span>Verificación</span><span>Comprobante</span>
            </div>
            {closing.paid.length === 0 && (
              <p className="t-small" style={{ margin: 0, padding: "16px 20px", color: "var(--ink-500)" }}>Todavía no hay pagos ejecutados.</p>
            )}
            {closing.paid.map((r, i) => (
              <div
                key={r.invoice.id}
                style={{
                  display: "grid", gridTemplateColumns: GRID, gap: 16, alignItems: "center", padding: "16px 20px",
                  borderBottom: i < closing.paid.length - 1 ? "1px solid var(--line)" : undefined,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="t-title" style={{ fontSize: 14 }}>{shortName(r.invoice.supplier.name)}</span>
                  <span className="vx-mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>{r.invoice.number}</span>
                </div>
                <span className="t-small">
                  {r.invoice.supplier.country} · <span className="vx-mono" style={{ fontSize: 12 }}>{r.invoice.originCurrency}</span>
                </span>
                <span className="vx-mono" style={{ fontSize: 13, textAlign: "right" }}>
                  {formatAmount(r.amountUnits)} {r.invoice.currency}
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="t-small">{PATH_LABEL[r.path]}</span>
                  {signerLabel(r) && (
                    <span className="vx-mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>{signerLabel(r)}</span>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <a href={txUrl(r.txHash)} target="_blank" rel="noreferrer" className="vx-mono" style={{ fontSize: 12 }}>
                    {shortHash(r.txHash)}
                  </a>
                  <span className="vx-mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>bloque {formatBlock(r.blockNumber)}</span>
                </div>
                <span>
                  <span className={`vx-badge vx-badge--${r.verified ? "verified" : "pending"}`}>{r.verified ? "Verified" : "Pending"}</span>
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <Link href={invoiceProofHref(r.invoice, r.txHash, r.runId)} className="t-small" style={{ fontWeight: 500 }}>
                    Link a PROOF
                  </Link>
                  <a href={mailtoFor(r)} onClick={(e) => { e.currentTarget.href = mailtoFor(r); }} className="vx-badge vx-badge--pending" style={{ textDecoration: "none" }} title="Abre tu cliente de mail con el comprobante">
                    Mail preparado
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="t-small" style={{ margin: 0, color: "var(--ink-500)" }}>
        El mail al proveedor queda preparado con el monto, el hash y el link a Arbiscan. Lo enviás vos desde tu casilla: Vértice no manda mails.
      </p>
    </section>
  );
}

function Pending({ closing }: { closing: Closing }) {
  if (closing.pending.length === 0) return null;
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 className="t-h3" style={{ margin: 0 }}>Pasan a diciembre</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        {closing.pending.map((r) => (
          <Link
            key={r.invoice.id}
            href={`/ops/facturas/${r.invoice.id}`}
            className="vx-card vx-card--interactive"
            style={{ textDecoration: "none", color: "var(--ink-900)", gap: 8 }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <span className="t-title">{shortName(r.invoice.supplier.name)}</span>
              <span className={`vx-badge vx-badge--${r.badge}`}>{r.label}</span>
            </div>
            <span className="t-small" style={{ color: "var(--ink-500)" }}>
              {r.invoice.supplier.country} · <span className="vx-mono" style={{ fontSize: 12 }}>{r.invoice.originCurrency}</span> ·{" "}
              {formatAmount(r.amountUnits)} {r.invoice.currency} · <span className="vx-mono" style={{ fontSize: 12 }}>{r.invoice.number}</span>
            </span>
            <span className="t-small" style={{ color: "var(--ink-700)" }}>{r.detail}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
