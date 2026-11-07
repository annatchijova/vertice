"use client";

import { useQuery } from "@tanstack/react-query";
import type { Hex } from "viem";
import { usePublicClient } from "wagmi";
import { arbitrum } from "wagmi/chains";
import { evaluate, type Claim, type Evaluation } from "@/domain/proof/verifier";
import { CHAIN_ID } from "@/infrastructure/chain/contracts";
import {
  acquireEvidence,
  InsufficientEvidence,
  readRegistryReceipt,
  type AcquiredEvidence,
  type BatchPayment,
  type RegistryReceipt,
} from "@/infrastructure/chain/proofEvidence";

export type ProofResult =
  | { kind: "evaluated"; evaluation: Evaluation; acquired: AcquiredEvidence; registry: RegistryReceipt | null | "unreadable" }
  | { kind: "insufficient"; reason: string; observedAt: number; payments?: BatchPayment[] };

export function useProof(txHash: Hex, claim: Claim) {
  const client = usePublicClient({ chainId: arbitrum.id });
  return useQuery({
    queryKey: ["proof", txHash, claim.runId, claim.invoiceRef, claim.token, claim.sender, claim.recipient, claim.amount?.toString()],
    enabled: Boolean(client),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    queryFn: async (): Promise<ProofResult> => {
      try {
        const acquired = await acquireEvidence(client!, txHash, claim.invoiceRef);
        const evaluation = evaluate(claim, acquired.evidence, BigInt(CHAIN_ID));
        let registry: RegistryReceipt | null | "unreadable" = null;
        if (acquired.evidence.successful) {
          registry = await readRegistryReceipt(
            client!,
            acquired.registry,
            acquired.evidence.paymentExecutedRunId,
            acquired.evidence.paymentExecutedInvoiceRef,
          ).catch(() => "unreadable" as const);
        }
        return { kind: "evaluated", evaluation, acquired, registry };
      } catch (e) {
        const reason = e instanceof InsufficientEvidence ? e.message : "No se pudo leer Arbitrum One. Probá reverificar en unos segundos.";
        const payments = e instanceof InsufficientEvidence ? e.payments : undefined;
        return { kind: "insufficient", reason, observedAt: Math.floor(Date.now() / 1000), payments };
      }
    },
  });
}
