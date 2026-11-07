import { isAddress, isHex, parseUnits, type Address, type Hex } from "viem";
import type { Claim } from "@/domain/proof/verifier";
import { CHAIN_ID } from "@/infrastructure/chain/contracts";

/** Lo que afirma quien pide la verificación. Viaja en la URL: /proof/<hash>?runId=…&invoiceRef=…&recipient=…&amount=500.00 */
export type ClaimParams = {
  runId?: string;
  invoiceRef?: string;
  token?: string;
  sender?: string;
  recipient?: string;
  /** decimal en la moneda del pago (18 decimales), ej. "500.00" */
  amount?: string;
};

export const CLAIM_KEYS = ["runId", "invoiceRef", "recipient", "amount", "token", "sender"] as const;

export const isTxHash = (v: string): v is Hex => isHex(v) && v.length === 66;
const isBytes32 = isTxHash;
const isAmount = (v: string) => /^\d+(\.\d{1,18})?$/.test(v);

export type ParsedClaim = { claim: Claim; errors: string[] };

/** Ignora (y reporta) lo mal formado: un campo inválido no se afirma, no se adivina. */
export function parseClaim(txHash: Hex, p: ClaimParams): ParsedClaim {
  const errors: string[] = [];
  const claim: Claim = { transactionHash: txHash, chainId: BigInt(CHAIN_ID) };
  const t = (v?: string) => v?.trim() || undefined;

  const runId = t(p.runId);
  if (runId) (isBytes32(runId) ? (claim.runId = runId) : errors.push("runId"));
  const invoiceRef = t(p.invoiceRef);
  if (invoiceRef) (isBytes32(invoiceRef) ? (claim.invoiceRef = invoiceRef) : errors.push("invoiceRef"));
  for (const k of ["token", "sender", "recipient"] as const) {
    const v = t(p[k]);
    if (v) (isAddress(v, { strict: false }) ? (claim[k] = v as Address) : errors.push(k));
  }
  const amount = t(p.amount)?.replace(",", ".");
  if (amount) (isAmount(amount) ? (claim.amount = parseUnits(amount, 18)) : errors.push("amount"));
  return { claim, errors };
}

export function proofHref(txHash: string, p: ClaimParams = {}): string {
  const q = new URLSearchParams();
  for (const k of CLAIM_KEYS) if (p[k]) q.set(k, p[k]!);
  const s = q.toString();
  return `/proof/${txHash}${s ? `?${s}` : ""}`;
}

/**
 * Link de OPS → PROOF para una factura pagada. OPS afirma lo que sabe de la factura
 * (destinatario, monto, invoiceRef) y el runId con el que firmó el lote.
 * Token y remitente no se afirman: quedan ABSTAIN, como en el expediente de diseño.
 */
export function invoiceProofHref(
  inv: { payTo: string; amount: string; invoiceRef: string },
  txHash: string,
  runId?: string,
): string {
  return proofHref(txHash, { recipient: inv.payTo, amount: inv.amount, invoiceRef: inv.invoiceRef, runId });
}
