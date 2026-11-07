import type { Currency, Invoice } from "@/domain/invoice";
import { REASON_LABEL, type ExceptionReason, type Preflight } from "@/domain/preflight";
import { AUTO_EXECUTION_THRESHOLD } from "@/domain/policy";
import { formatAmount, shortAddr } from "@/domain/format";
import { OPERATIVE_WALLET } from "@/infrastructure/chain/contracts";

export type Filter = "all" | "auto" | "firma" | "exc";
export type View = "grid" | "table";
/** Tono visual del estado: define el badge y el punto de los chips del encabezado. */
export type Tone = "auto" | "signed" | "pending" | "failed" | "insufficient";

export type Row = {
  pf: Preflight;
  invoice: Invoice;
  href: string;
  tone: Tone;
  /** badge de la card */
  badge: string;
  /** badge corto de la tabla */
  badgeShort: string;
  /** "Auto · ≤ 500" | "Firma · > 500" | "Excepción · +39%" */
  pathLabel: string;
  allowLabel: string;
  note: string;
  txHash?: `0x${string}`;
};

const THR = formatAmount(AUTO_EXECUTION_THRESHOLD);
const THR_SHORT = THR.replace(/,00$/, "");

/** "Distribuidora Andina S.R.L." → "Distribuidora Andina" (sin la forma societaria). */
export const supplierName = (i: Invoice) =>
  i.supplier.name.replace(/\s+(S\.R\.L\.|Ltda\.|S\.A\.S\.|S\.A\. de C\.V\.|S\.A\.)$/, "");

const FAILED_REASONS: ExceptionReason[] = ["TYPO", "OVER_CAP", "RECIPIENT_NOT_APPROVED"];

function executorLabel(signer?: string) {
  if (!signer || signer.toLowerCase() === OPERATIVE_WALLET.toLowerCase()) return `la wallet operativa ${shortAddr(OPERATIVE_WALLET)}`;
  return `la wallet ${shortAddr(signer)}`;
}

function exceptionNote(pf: Preflight, capLabel: string): string {
  const { invoice, reasons, primaryReason, pricePct, average } = pf;
  const extraCap = reasons.includes("OVER_CAP") && primaryReason !== "OVER_CAP"
    ? ` Además supera el tope duro del contrato (${capLabel} ${invoice.currency} por pago).`
    : "";
  switch (primaryReason) {
    case "TYPO":
      return "La dirección de pago difiere en 1 carácter de la registrada del proveedor. Aunque está debajo del tope, una excepción nunca se paga sola.";
    case "NO_FUNDS":
      return `${supplierName(invoice)} cobra en ${invoice.currency}, no en ARGt, y la wallet no tiene saldo ${invoice.currency}. Una excepción nunca se paga sola.`;
    case "PRICE_ALERT":
      return `Cobra ${pricePct}% más que su promedio de 3 meses (${formatAmount(average)} ${invoice.currency}).${extraCap}`;
    case "OVER_CAP":
      return `Supera el tope duro del contrato (${capLabel} ${invoice.currency} por pago): el contrato la rechazaría.`;
    case "RECIPIENT_NOT_APPROVED":
      return "La dirección de pago no está aprobada en el contrato. Una excepción nunca se paga sola.";
    default:
      return "";
  }
}

export function toRow(pf: Preflight, capLabel: string): Row {
  const { invoice, path, executed, primaryReason, typo, pricePct } = pf;
  const txHash = pf.payment?.txHash ?? invoice.executed?.txHash;
  const approved = pf.checks.find((c) => c.key === "allowlist")?.status === "pass";
  const allowLabel = typo ? "Dirección distinta" : approved ? "En allowlist" : "Fuera de allowlist";
  const base = { pf, invoice, href: `/ops/facturas/${invoice.id}`, allowLabel, txHash };

  if (path === "auto") {
    return {
      ...base,
      tone: "auto",
      badge: "Auto · por política",
      badgeShort: "Auto",
      pathLabel: `Auto · ≤ ${THR_SHORT}`,
      note: executed
        ? `Debajo de tu umbral y sin excepciones: la ejecutó ${executorLabel(invoice.executed?.signer)}, por política. Ya está verificada en cadena.`
        : "Debajo de tu umbral y sin excepciones: se ejecuta sola, por política.",
    };
  }
  if (path === "firma") {
    return {
      ...base,
      tone: executed ? "signed" : "pending",
      badge: executed ? "Firmada por vos" : "Requiere tu firma",
      badgeShort: executed ? "Firmada" : "Tu firma",
      pathLabel: `Firma · > ${THR_SHORT}`,
      note: executed
        ? "Supera tu umbral de auto-ejecución: la firmaste con PAGAR. Ya está verificada en cadena."
        : `Todo coincide con los meses anteriores, pero supera tu umbral de auto-ejecución (${THR} ${invoice.currency}). Se paga cuando firmes con PAGAR.`,
    };
  }
  const reason = primaryReason ?? "RECIPIENT_NOT_APPROVED";
  const label = REASON_LABEL[reason];
  return {
    ...base,
    tone: FAILED_REASONS.includes(reason) ? "failed" : "insufficient",
    badge: label,
    badgeShort: label.split(" · ")[0],
    pathLabel: reason === "PRICE_ALERT" ? `Excepción · ${pricePct >= 0 ? "+" : ""}${pricePct}%` : "Excepción",
    note: exceptionNote(pf, capLabel),
  };
}

export function matchesFilter(r: Row, f: Filter) {
  if (f === "all") return true;
  if (f === "exc") return r.pf.path === "excepcion";
  return r.pf.path === f;
}

export function matchesQuery(r: Row, q: string) {
  if (!q) return true;
  const i = r.invoice;
  return [i.supplier.name, i.number, i.supplier.country, i.originCurrency, i.currency].join(" ").toLowerCase().includes(q);
}

/** Suma por moneda de pago, en el orden ARGt → BRAt. */
export function sumByCurrency(rows: Row[]): [Currency, bigint][] {
  const acc = new Map<Currency, bigint>();
  for (const r of rows) acc.set(r.invoice.currency, (acc.get(r.invoice.currency) ?? 0n) + r.pf.amountUnits);
  return (["ARGt", "BRAt"] as Currency[]).filter((c) => acc.has(c)).map((c) => [c, acc.get(c)!]);
}

export const formatTotals = (t: [Currency, bigint][]) => t.map(([c, v]) => `${formatAmount(v)} ${c}`).join(" · ");

export const pagos = (n: number) => `${n} ${n === 1 ? "pago" : "pagos"}`;
