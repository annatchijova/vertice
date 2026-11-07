import type { Address, Hex } from "viem";

/**
 * Port 1:1 de `src/PaymentVerifier.sol` → `evaluate()`.
 * Mismo orden de chequeos, mismo veredicto, FAIL domina y lo no afirmado queda ABSTAIN.
 *
 * Única diferencia con el contrato (igual que el PROOF de web/): `runId` e `invoiceRef`
 * son afirmaciones opcionales. Quien pega solo un hash no conoce el runId interno del lote,
 * así que esos dos chequeos quedan ABSTAIN en vez de FAIL contra cero.
 * Cuando el link viene de OPS, OPS afirma ambos y se comparan como en el contrato.
 */

export const CHECK_IDS = [
  "CHAIN_ID",
  "TRANSACTION_HASH",
  "EXECUTION",
  "RUN_ID",
  "INVOICE_REF",
  "ORDER_BINDING",
  "TOKEN",
  "SENDER",
  "RECIPIENT",
  "AMOUNT",
] as const;
export type CheckId = (typeof CHECK_IDS)[number];
export type CheckStatus = "PASS" | "FAIL" | "ABSTAIN";
export type Verdict = "VERIFIED" | "NOT_VERIFIED" | "INSUFFICIENT_EVIDENCE";

/** Mismo orden que el enum de Solidity, para decodificar recibos del registry. */
export const SOL_CHECK_STATUS: CheckStatus[] = ["ABSTAIN", "PASS", "FAIL"];
export const SOL_VERDICT: Verdict[] = ["VERIFIED", "NOT_VERIFIED", "INSUFFICIENT_EVIDENCE"];

export const ZERO_HASH: Hex = `0x${"0".repeat(64)}`;
export const ZERO_ADDRESS: Address = `0x${"0".repeat(40)}`;

export type Claim = {
  transactionHash: Hex;
  chainId: bigint;
  paymentBatchContract?: Address;
  runId?: Hex;
  invoiceRef?: Hex;
  token?: Address;
  sender?: Address;
  recipient?: Address;
  amount?: bigint;
};

/** `PaymentVerifier.Evidence`: los campos transfer* y paymentExecuted* salen de DOS logs distintos. */
export type Evidence = {
  available: boolean;
  transactionHash: Hex;
  chainId: bigint;
  blockNumber: bigint;
  blockHash: Hex;
  successful: boolean;
  paymentBatchContract: Address;
  paymentExecutedRunId: Hex;
  paymentExecutedInvoiceRef: Hex;
  paymentExecutedRecipient: Address;
  paymentExecutedAmount: bigint;
  transferToken: Address;
  transferSender: Address;
  transferRecipient: Address;
  transferAmount: bigint;
  finalityPolicyId: Hex;
  requiredConfirmations: bigint;
  observedConfirmations: bigint;
};

export type Check = { id: CheckId; status: CheckStatus };
export type Evaluation = { verdict: Verdict; checks: Check[] };

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const same = (ok: boolean): CheckStatus => (ok ? "PASS" : "FAIL");

export function evaluate(claim: Claim, evidence: Evidence, expectedChainId: bigint): Evaluation {
  if (
    !evidence.available ||
    evidence.finalityPolicyId === ZERO_HASH ||
    evidence.requiredConfirmations === 0n ||
    evidence.observedConfirmations < evidence.requiredConfirmations
  ) {
    return { verdict: "INSUFFICIENT_EVIDENCE", checks: [] };
  }

  const status: Record<CheckId, CheckStatus> = {
    CHAIN_ID: same(claim.chainId === expectedChainId && evidence.chainId === expectedChainId),
    TRANSACTION_HASH: same(eq(claim.transactionHash, evidence.transactionHash)),
    EXECUTION: same(evidence.successful),
    RUN_ID:
      claim.runId === undefined
        ? "ABSTAIN"
        : same(
            (claim.paymentBatchContract === undefined || eq(claim.paymentBatchContract, evidence.paymentBatchContract)) &&
              eq(claim.runId, evidence.paymentExecutedRunId),
          ),
    INVOICE_REF: claim.invoiceRef === undefined ? "ABSTAIN" : same(eq(claim.invoiceRef, evidence.paymentExecutedInvoiceRef)),
    // Siempre se evalúa (nunca ABSTAIN): el PaymentExecuted del lote tiene que coincidir con el Transfer real del token.
    ORDER_BINDING: same(
      eq(evidence.paymentExecutedRecipient, evidence.transferRecipient) &&
        evidence.paymentExecutedAmount === evidence.transferAmount,
    ),
    TOKEN: claim.token === undefined ? "ABSTAIN" : same(eq(claim.token, evidence.transferToken)),
    SENDER: claim.sender === undefined ? "ABSTAIN" : same(eq(claim.sender, evidence.transferSender)),
    RECIPIENT: claim.recipient === undefined ? "ABSTAIN" : same(eq(claim.recipient, evidence.transferRecipient)),
    AMOUNT: claim.amount === undefined ? "ABSTAIN" : same(claim.amount === evidence.transferAmount),
  };

  const checks = CHECK_IDS.map((id) => ({ id, status: status[id] }));
  return { verdict: checks.some((c) => c.status === "FAIL") ? "NOT_VERIFIED" : "VERIFIED", checks };
}

/** Escalera de garantía de Veridra. Esta versión solo alcanza RPC_ATTESTED. */
export const ASSURANCE_LADDER = [
  { id: "RPC_ATTESTED", reached: true },
  { id: "RECENT_BLOCKHASH_PROOF", reached: false },
  { id: "PERSISTENT_ROOT_PROOF", reached: false },
] as const;
