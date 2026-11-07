import type { Address, Hex } from "viem";
import { isAddress, isHex } from "viem";
import { ARBITRUM_CHAIN_ID } from "./chain.js";
import { acquirePaymentEvidence, InsufficientEvidenceError, type PaymentEvidence } from "./evidence.js";

/**
 * TypeScript mirror of `src/PaymentVerifier.sol`'s `evaluate()` — same
 * VERIFIED / NOT_VERIFIED / INSUFFICIENT_EVIDENCE verdict, same FAIL-dominates
 * rule, same ABSTAIN for anything the claimant didn't assert. This re-derives
 * the comparison client-side from freshly acquired evidence rather than
 * trusting a server, matching Veridra's RPC_ATTESTED honesty level: the RPC
 * response is not cryptographically authenticated, only internally
 * consistent (see evidence.ts).
 *
 * Narrower than the deployed contract in one way: `runId`/`invoiceRef` are
 * optional assertions here (most people checking a payment only have a
 * transaction hash, not the batch's internal runId), not mandatory identity
 * fields — this is a client-side quick-check, not the on-chain receipt
 * registry's `publish()`, which still requires them.
 */

export const CHECK_NAMES = [
  "chainId",
  "transactionHash",
  "execution",
  "runId",
  "invoiceRef",
  "orderBinding",
  "token",
  "sender",
  "recipient",
  "amount",
] as const;
export type CheckName = (typeof CHECK_NAMES)[number];
export type CheckStatus = "ABSTAIN" | "PASS" | "FAIL";
export type NamedCheck = { name: CheckName; status: CheckStatus };
export type Verdict = "VERIFIED" | "NOT_VERIFIED" | "INSUFFICIENT_EVIDENCE";

export type Evaluation = { verdict: Verdict; checks: NamedCheck[] };

export type ClaimInput = {
  transactionHash: string;
  runId: string;
  invoiceRef: string;
  token: string;
  sender: string;
  recipient: string;
  amountBaseUnits: string;
};

export class InvalidClaimError extends Error {}

function trimmedOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export type Claim = {
  transactionHash: Hex;
  runId?: Hex | undefined;
  invoiceRef?: Hex | undefined;
  token?: Address | undefined;
  sender?: Address | undefined;
  recipient?: Address | undefined;
  amount?: bigint | undefined;
};

export function buildClaim(input: ClaimInput): Claim {
  const transactionHash = input.transactionHash.trim();
  if (!isHex(transactionHash) || transactionHash.length !== 66) {
    throw new InvalidClaimError("A transaction hash is 0x followed by exactly 64 hex characters.");
  }

  const parseBytes32 = (raw: string | undefined, label: string): Hex | undefined => {
    if (raw === undefined) return undefined;
    if (!isHex(raw) || raw.length !== 66) throw new InvalidClaimError(`${label} must be 0x followed by exactly 64 hex characters.`);
    return raw;
  };
  const parseAddress = (raw: string | undefined, label: string): Address | undefined => {
    if (raw === undefined) return undefined;
    if (!isAddress(raw)) throw new InvalidClaimError(`${label} must be a valid address (0x followed by 40 hex characters).`);
    return raw;
  };
  const parseAmount = (raw: string | undefined): bigint | undefined => {
    if (raw === undefined) return undefined;
    if (!/^(0|[1-9][0-9]*)$/.test(raw)) throw new InvalidClaimError("Amount must be digits only, no decimals or separators.");
    return BigInt(raw);
  };

  return {
    transactionHash,
    runId: parseBytes32(trimmedOrUndefined(input.runId), "Run ID"),
    invoiceRef: parseBytes32(trimmedOrUndefined(input.invoiceRef), "Invoice reference"),
    token: parseAddress(trimmedOrUndefined(input.token), "Token address"),
    sender: parseAddress(trimmedOrUndefined(input.sender), "Sender"),
    recipient: parseAddress(trimmedOrUndefined(input.recipient), "Recipient"),
    amount: parseAmount(trimmedOrUndefined(input.amountBaseUnits)),
  };
}

function same(matches: boolean): CheckStatus {
  return matches ? "PASS" : "FAIL";
}

export function evaluate(claim: Claim, evidence: PaymentEvidence): Evaluation {
  if (
    !evidence.available ||
    evidence.finalityPolicyId === ("0x" + "0".repeat(64)) ||
    evidence.requiredConfirmations === 0n ||
    evidence.observedConfirmations < evidence.requiredConfirmations
  ) {
    return { verdict: "INSUFFICIENT_EVIDENCE", checks: [] };
  }

  const checks: NamedCheck[] = [
    { name: "chainId", status: same(evidence.chainId === ARBITRUM_CHAIN_ID) },
    { name: "transactionHash", status: same(claim.transactionHash.toLowerCase() === evidence.transactionHash.toLowerCase()) },
    { name: "execution", status: same(evidence.successful) },
    {
      name: "runId",
      status: claim.runId === undefined ? "ABSTAIN" : same(claim.runId.toLowerCase() === evidence.paymentExecutedRunId.toLowerCase()),
    },
    {
      name: "invoiceRef",
      status:
        claim.invoiceRef === undefined
          ? "ABSTAIN"
          : same(claim.invoiceRef.toLowerCase() === evidence.paymentExecutedInvoiceRef.toLowerCase()),
    },
    // Always evaluated, never ABSTAIN — mirrors ORDER_BINDING_CHECK in
    // PaymentVerifier.sol: PaymentBatch's own bookkeeping must agree with
    // the independently read ARGt Transfer, or this is NOT_VERIFIED no
    // matter what the claimant asserted.
    {
      name: "orderBinding",
      status: same(
        evidence.paymentExecutedRecipient.toLowerCase() === evidence.transferRecipient.toLowerCase() &&
          evidence.paymentExecutedAmount === evidence.transferAmount,
      ),
    },
    {
      name: "token",
      status: claim.token === undefined ? "ABSTAIN" : same(claim.token.toLowerCase() === evidence.transferToken.toLowerCase()),
    },
    {
      name: "sender",
      status: claim.sender === undefined ? "ABSTAIN" : same(claim.sender.toLowerCase() === evidence.transferSender.toLowerCase()),
    },
    {
      name: "recipient",
      status:
        claim.recipient === undefined ? "ABSTAIN" : same(claim.recipient.toLowerCase() === evidence.transferRecipient.toLowerCase()),
    },
    { name: "amount", status: claim.amount === undefined ? "ABSTAIN" : same(claim.amount === evidence.transferAmount) },
  ];

  const verdict: Verdict = checks.some((check) => check.status === "FAIL") ? "NOT_VERIFIED" : "VERIFIED";
  return { verdict, checks };
}

export type CheckResult =
  | { status: "checking" }
  | {
      status: "result";
      verdict: Verdict;
      checks: NamedCheck[];
      transactionHash: Hex;
      blockNumber?: bigint;
      confirmations?: { observed: bigint; required: bigint };
      rawEvidence: PaymentEvidence;
    }
  | { status: "unavailable" | "error"; message: string };

/** Never throws: every failure becomes a scoped result so the page can always render something. */
export async function checkPayment(claim: Claim): Promise<CheckResult> {
  try {
    const acquired = await acquirePaymentEvidence(claim.transactionHash);
    const evaluation = evaluate(claim, acquired.evidence);
    return {
      status: "result",
      verdict: evaluation.verdict,
      checks: evaluation.checks,
      transactionHash: acquired.evidence.transactionHash,
      blockNumber: acquired.evidence.blockNumber,
      confirmations: { observed: acquired.evidence.observedConfirmations, required: acquired.evidence.requiredConfirmations },
      rawEvidence: acquired.evidence,
    };
  } catch (error) {
    if (error instanceof InsufficientEvidenceError) return { status: "unavailable", message: error.message };
    return { status: "error", message: error instanceof Error ? error.message : "Unknown error" };
  }
}
