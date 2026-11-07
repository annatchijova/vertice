import type { Currency, Invoice } from "./invoice";
import { AUTO_EXECUTION_THRESHOLD, PRICE_ALERT_PCT } from "./policy";
import { formatAmount, shortAddr, toUnits } from "./format";

/** Estado on-chain necesario para decidir. Lo arma infrastructure/chain/useChainSnapshot. */
export type CurrencyState = {
  perPaymentCap: bigint;
  batchCap: bigint;
  /** saldo de la wallet que paga (conectada, o la operativa si no hay conexión) */
  balance: bigint;
  allowance: bigint;
  /** dirección en minúsculas → aprobada en el PaymentBatch */
  approved: Record<string, boolean>;
  /** invoiceRef (minúsculas) → PaymentExecuted on-chain */
  payments: Record<string, OnchainPayment>;
};
export type OnchainPayment = { txHash: `0x${string}`; blockNumber: bigint; runId: `0x${string}`; recipient: string; amount: bigint };
export type ChainSnapshot = {
  source: "live" | "snapshot";
  blockNumber: bigint;
  currencies: Record<Currency, CurrencyState>;
};

export type CheckStatus = "pass" | "fail" | "alert" | "abstain";
export type Check = {
  key: "allowlist" | "typo" | "unique" | "price" | "cap" | "funds" | "threshold";
  name: string;
  detail: string;
  status: CheckStatus;
  /** texto corto a la derecha del check: Pass, Fail, Tipeo, Alerta, Auto, Firma, No corre… */
  result: string;
};

export type Path = "auto" | "firma" | "excepcion";
export type ExceptionReason = "TYPO" | "NO_FUNDS" | "PRICE_ALERT" | "OVER_CAP" | "RECIPIENT_NOT_APPROVED";
/** orden de prioridad para el titular de la card / detalle */
const REASON_ORDER: ExceptionReason[] = ["TYPO", "NO_FUNDS", "PRICE_ALERT", "OVER_CAP", "RECIPIENT_NOT_APPROVED"];

export const REASON_LABEL: Record<ExceptionReason, string> = {
  TYPO: "Bloqueada · tipeo",
  NO_FUNDS: "Sin fondos BRAt", // único caso hoy; si aparece otra moneda, usar `Sin fondos ${currency}`
  PRICE_ALERT: "Revisar · precio",
  OVER_CAP: "Supera el tope",
  RECIPIENT_NOT_APPROVED: "No aprobado",
};

export type Preflight = {
  invoice: Invoice;
  path: Path;
  /** ya pagada on-chain (fixture o PaymentExecuted leído en vivo) */
  executed: boolean;
  /** evento on-chain del pago, si se encontró */
  payment?: OnchainPayment;
  reasons: ExceptionReason[];
  primaryReason?: ExceptionReason;
  checks: Check[];
  amountUnits: bigint;
  /** promedio de los últimos 3 meses y variación porcentual (entera) */
  average: number;
  pricePct: number;
  typo?: { position: number; expected: string; got: string };
};

function typoDiff(a: string, b: string) {
  const x = a.toLowerCase(), y = b.toLowerCase();
  if (x === y || x.length !== y.length) return undefined;
  const diffs = [...x].map((c, i) => (c !== y[i] ? i : -1)).filter((i) => i >= 0);
  if (diffs.length > 2) return undefined;
  const i = diffs[0];
  // position: 1-based sobre los 42 caracteres (incluye 0x)
  return { position: i + 1, expected: x[i], got: y[i] };
}

export function preflight(invoice: Invoice, snap: ChainSnapshot): Preflight {
  const st = snap.currencies[invoice.currency];
  const amountUnits = toUnits(invoice.amount);
  const payment = st.payments[invoice.invoiceRef.toLowerCase()];
  const executed = Boolean(invoice.executed) || Boolean(payment);
  const reasons: ExceptionReason[] = [];
  const checks: Check[] = [];

  // 1. Allowlist on-chain (+ detección de tipeo contra la dirección registrada del proveedor)
  const approved = st.approved[invoice.payTo.toLowerCase()] ?? false;
  const typo = typoDiff(invoice.supplier.registeredAddress, invoice.payTo);
  checks.push({
    key: "allowlist",
    name: "Destinatario en allowlist",
    detail: approved ? `${shortAddr(invoice.payTo)} · aprobado en el contrato ${invoice.currency}` : "RECIPIENT_NOT_APPROVED",
    status: approved ? "pass" : "fail",
    result: approved ? "Pass" : "Fail",
  });
  if (typo) {
    reasons.push("TYPO");
    checks.push({
      key: "typo",
      name: "Parecida a la dirección registrada",
      detail: `41 de 42 caracteres · posición ${typo.position}`,
      status: "fail",
      result: "Tipeo",
    });
  }
  if (!approved) reasons.push("RECIPIENT_NOT_APPROVED");

  // 2. Número de factura único (PaymentExecuted on-chain)
  const paid = Boolean(payment);
  checks.push({
    key: "unique",
    name: "Número de factura único",
    detail: executed ? "pagada una sola vez, en esta transacción" : paid ? "ya existe un pago con ese número" : "sin pagos previos con ese número",
    status: !executed && paid ? "fail" : "pass",
    result: !executed && paid ? "Fail" : "Pass",
  });

  // 3. Precio vs. últimos 3 meses
  const average = invoice.history.reduce((s, h) => s + Number(h.amount), 0) / invoice.history.length;
  const pricePct = Math.round(((Number(invoice.amount) - average) / average) * 100);
  const priceAlert = pricePct > PRICE_ALERT_PCT;
  if (priceAlert) reasons.push("PRICE_ALERT");
  checks.push({
    key: "price",
    name: "Precio vs. últimos 3 meses",
    detail: `promedio ${formatAmount(average)} · ${pricePct >= 0 ? "+" : ""}${pricePct}%${priceAlert ? ` · alerta desde ${PRICE_ALERT_PCT}%` : ""}`,
    status: priceAlert ? "alert" : "pass",
    result: priceAlert ? "Alerta" : "Pass",
  });

  // 4. Tope duro del contrato
  const overCap = amountUnits > st.perPaymentCap;
  if (overCap) reasons.push("OVER_CAP");
  checks.push({
    key: "cap",
    name: "Tope por pago del contrato",
    detail: `${formatAmount(amountUnits)} ${overCap ? ">" : "≤"} ${formatAmount(st.perPaymentCap)} ${invoice.currency}`,
    status: overCap ? "fail" : "pass",
    result: overCap ? "Fail" : "Pass",
  });

  // 5. Fondos (solo si todavía hay que pagarla)
  if (!executed) {
    const noFunds = st.balance < amountUnits;
    if (noFunds && st.balance === 0n) reasons.push("NO_FUNDS");
    checks.push({
      key: "funds",
      name: `Saldo ${invoice.currency} de la wallet`,
      detail: `${formatAmount(st.balance)} ${invoice.currency} disponibles`,
      status: noFunds ? "fail" : "pass",
      result: noFunds ? "Sin fondos" : "Pass",
    });
    if (noFunds && st.balance > 0n) reasons.push("NO_FUNDS");
  }

  // 6. Umbral de auto-ejecución
  const isException = reasons.length > 0;
  const underThreshold = amountUnits <= AUTO_EXECUTION_THRESHOLD;
  const path: Path = isException ? "excepcion" : underThreshold ? "auto" : "firma";
  const thr = formatAmount(AUTO_EXECUTION_THRESHOLD);
  checks.push({
    key: "threshold",
    name: "Umbral de auto-ejecución",
    detail: isException
      ? `${formatAmount(amountUnits)} ${underThreshold ? "≤" : ">"} ${thr} · no aplica: excepción`
      : `${formatAmount(amountUnits)} ${underThreshold ? "≤" : ">"} ${thr}`,
    status: isException ? "abstain" : underThreshold ? "pass" : "abstain",
    result: isException ? "No corre" : underThreshold ? "Auto" : "Firma",
  });

  const sorted = REASON_ORDER.filter((r) => reasons.includes(r));
  return { invoice, path, executed, payment, reasons: sorted, primaryReason: sorted[0], checks, amountUnits, average, pricePct, typo };
}

export const preflightAll = (invoices: Invoice[], snap: ChainSnapshot) => invoices.map((i) => preflight(i, snap));
