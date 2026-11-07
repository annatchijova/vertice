import { formatUnits } from "viem";
import type { Currency, Invoice } from "@/domain/invoice";
import type { ChainSnapshot, ExceptionReason, Path, Preflight } from "@/domain/preflight";
import { REASON_LABEL } from "@/domain/preflight";
import { AUTO_EXECUTION_THRESHOLD } from "@/domain/policy";
import { formatAmount, shortAddr } from "@/domain/format";
import { OPERATIVE_WALLET, txUrl } from "@/infrastructure/chain/contracts";
import { invoiceProofHref } from "@/features/proof/claim";

/** Comprobante de un pago ya ejecutado (fixture real o PaymentExecuted leído en vivo). */
export type PaidRow = {
  invoice: Invoice;
  path: Path;
  txHash: `0x${string}`;
  blockNumber: bigint;
  runId: `0x${string}`;
  /** firmante conocido (solo el fixture real lo trae; el evento no incluye firmante) */
  signer?: string;
  /** true si el evento PaymentExecuted fue leído on-chain (en vivo o en el snapshot estático) */
  verified: boolean;
  amountUnits: bigint;
};

export type PendingRow = {
  invoice: Invoice;
  path: Path;
  reason?: ExceptionReason;
  reasons: ExceptionReason[];
  label: string;
  /** clase del badge del design system */
  badge: "not-verified" | "insufficient" | "pending";
  detail: string;
  amountUnits: bigint;
};

export type CurrencyTotals = { paid: bigint; auto: bigint; firma: bigint; pending: bigint };

export type Closing = {
  total: number;
  paid: PaidRow[];
  pending: PendingRow[];
  totals: Record<Currency, CurrencyTotals>;
  currencies: Currency[];
  originCurrencies: string[];
};

const CURRENCY_ORDER: Currency[] = ["ARGt", "BRAt"];

/** "Empaques del Bajío S.A. de C.V." → "Empaques del Bajío" */
export const shortName = (name: string) => name.replace(/\s+(S\.|Ltda\.).*$/, "");

export const PATH_LABEL: Record<Path, string> = {
  auto: "Auto · por política",
  firma: "Tu firma",
  excepcion: "Excepción",
};

function pendingDetail(p: Preflight, snap: ChainSnapshot): string {
  const inv = p.invoice;
  const st = snap.currencies[inv.currency];
  const cap = `${formatAmount(st.perPaymentCap)} ${inv.currency}`;
  switch (p.primaryReason) {
    case "TYPO":
      return `La dirección de la factura difiere de la registrada en la posición ${p.typo?.position ?? "?"}. Esperando la factura con la dirección corregida.`;
    case "NO_FUNDS":
      return `La wallet tiene ${formatAmount(st.balance)} ${inv.currency}. Hay que fondearla antes de pagar.`;
    case "PRICE_ALERT":
      return `${p.pricePct >= 0 ? "+" : ""}${p.pricePct}% vs. el promedio de los últimos 3 meses${
        p.reasons.includes("OVER_CAP") ? ` y supera el tope de ${cap} del contrato` : ""
      }. Esperando tu decisión.`;
    case "OVER_CAP":
      return `Supera el tope por pago de ${cap} del contrato: el contrato lo rechazaría.`;
    case "RECIPIENT_NOT_APPROVED":
      return "El destinatario no está aprobado en el contrato. Hay que aprobarlo antes de pagar.";
    default:
      return `Pasa todos los checks y supera el umbral de ${formatAmount(AUTO_EXECUTION_THRESHOLD)} ARGt: espera tu firma con PAGAR.`;
  }
}

const badgeFor = (r?: ExceptionReason): PendingRow["badge"] =>
  r === "TYPO" ? "not-verified" : r ? "insufficient" : "pending";

export function buildClosing(preflights: Preflight[], snap: ChainSnapshot): Closing {
  const totals = Object.fromEntries(
    CURRENCY_ORDER.map((c) => [c, { paid: 0n, auto: 0n, firma: 0n, pending: 0n }]),
  ) as Record<Currency, CurrencyTotals>;
  const paid: PaidRow[] = [];
  const pending: PendingRow[] = [];

  for (const p of preflights) {
    const inv = p.invoice;
    const t = totals[inv.currency];
    const txHash = p.payment?.txHash ?? inv.executed?.txHash;
    if (p.executed && txHash) {
      paid.push({
        invoice: inv,
        path: p.path,
        txHash,
        blockNumber: p.payment?.blockNumber ?? inv.executed!.blockNumber,
        runId: p.payment?.runId ?? inv.executed!.runId,
        signer: inv.executed?.signer,
        verified: Boolean(p.payment),
        amountUnits: p.amountUnits,
      });
      t.paid += p.amountUnits;
      if (p.path === "auto") t.auto += p.amountUnits;
      else t.firma += p.amountUnits;
    } else {
      pending.push({
        invoice: inv,
        path: p.path,
        reason: p.primaryReason,
        reasons: p.reasons,
        label: p.primaryReason ? REASON_LABEL[p.primaryReason] : "Requiere tu firma",
        badge: badgeFor(p.primaryReason),
        detail: pendingDetail(p, snap),
        amountUnits: p.amountUnits,
      });
      t.pending += p.amountUnits;
    }
  }

  const used = new Set(preflights.map((p) => p.invoice.currency));
  return {
    total: preflights.length,
    paid,
    pending,
    totals,
    currencies: CURRENCY_ORDER.filter((c) => used.has(c)),
    originCurrencies: [...new Set(preflights.map((p) => p.invoice.originCurrency))].sort(),
  };
}

/** Lista "500,00 ARGt + 950,00 BRAt" (nunca suma entre monedas). */
export function amountsByCurrency(c: Closing, key: keyof CurrencyTotals): { currency: Currency; value: string }[] {
  const list = c.currencies
    .filter((cur) => c.totals[cur][key] > 0n)
    .map((cur) => ({ currency: cur, value: formatAmount(c.totals[cur][key]) }));
  return list.length ? list : [{ currency: c.currencies[0] ?? "ARGt", value: formatAmount(0) }];
}

export const joinAmounts = (xs: { currency: Currency; value: string }[]) =>
  xs.map((x) => `${x.value} ${x.currency}`).join(" y ");

/* ------------------------------------------------------------------ CSV */

const CSV_COLUMNS = [
  "proveedor", "país", "número", "moneda_origen", "moneda_pago", "monto",
  "estado", "camino", "tx_hash", "bloque", "invoice_ref", "run_id",
] as const;

const csvCell = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(c: Closing): string {
  const rows: string[][] = [
    ...c.paid.map((r) => [
      r.invoice.supplier.name, r.invoice.supplier.country, r.invoice.number,
      r.invoice.originCurrency, r.invoice.currency, formatUnits(r.amountUnits, 18),
      r.verified ? "Verified" : "Executed", r.path,
      r.txHash, r.blockNumber.toString(), r.invoice.invoiceRef, r.runId,
    ]),
    ...c.pending.map((r) => [
      r.invoice.supplier.name, r.invoice.supplier.country, r.invoice.number,
      r.invoice.originCurrency, r.invoice.currency, formatUnits(r.amountUnits, 18),
      `Pending · ${r.label}`, r.path,
      "", "", r.invoice.invoiceRef, "",
    ]),
  ];
  return [CSV_COLUMNS.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n");
}

export function downloadCsv(c: Closing, filename = "vertice-cierre-2026-11.csv") {
  // BOM para que Excel lea bien los acentos
  const blob = new Blob(["﻿" + toCsv(c)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* --------------------------------------------------------------- mailto */

/** Solo arma el mailto (no hay backend de mail): el usuario lo envía desde su casilla. */
export function mailtoFor(r: PaidRow): string {
  const inv = r.invoice;
  const subject = `Comprobante de pago · ${inv.number} · ${formatAmount(r.amountUnits)} ${inv.currency}`;
  const body = [
    `Hola, ${inv.supplier.name}:`,
    "",
    `Les enviamos el comprobante del pago de la factura ${inv.number}.`,
    "",
    `Monto: ${formatAmount(r.amountUnits)} ${inv.currency} (factura original en ${inv.originCurrency})`,
    `Destinatario: ${inv.payTo}`,
    `Transacción en Arbitrum One: ${txUrl(r.txHash)}`,
    `Bloque: ${r.blockNumber.toString()}`,
    `Verificación: ${typeof window === "undefined" ? "" : window.location.origin}${invoiceProofHref(inv, r.txHash, r.runId)}`,
    "",
    "Saludos.",
  ].join("\n");
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export const signerLabel = (r: PaidRow) =>
  r.signer
    ? r.signer.toLowerCase() === OPERATIVE_WALLET.toLowerCase()
      ? `wallet operativa ${shortAddr(r.signer)}`
      : `firmó ${shortAddr(r.signer)}`
    : undefined;
