"use client";

import { useQuery } from "@tanstack/react-query";
import { getAddress, parseUnits, type Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { arbitrum } from "wagmi/chains";
import type { Currency } from "@/domain/invoice";
import type { ChainSnapshot, CurrencyState, OnchainPayment } from "@/domain/preflight";
import { INVOICES } from "@/data/invoices";
import { DEPLOYMENTS, OPERATIVE_WALLET, erc20Abi, paymentBatchAbi } from "./contracts";

/** Primer bloque útil: aprobación de 0x981d en ARGt fue en 522117617. */
const FROM_BLOCK = 522_100_000n;
const CURRENCIES: Currency[] = ["ARGt", "BRAt"];
const PAYEE = "0x981dce900787aed11e8e4489860907d2892f70ed";

/**
 * Estado leído con viem el 07/11 en el bloque 522148062. Se usa SOLO si el RPC falla,
 * y la UI lo marca como "snapshot" (nunca se presenta como lectura en vivo).
 */
export const STATIC_SNAPSHOT: ChainSnapshot = {
  source: "snapshot",
  blockNumber: 522148062n,
  currencies: {
    ARGt: {
      perPaymentCap: parseUnits("1000", 18),
      batchCap: parseUnits("2000", 18),
      balance: parseUnits("1500", 18),
      allowance: parseUnits("500", 18),
      approved: { [PAYEE]: true },
      payments: {
        "0x99c5fad1f0657ed78631a52dbb63d20e4344e99aa4a17545075add66b6ed52b4": {
          txHash: "0x704fb8b5c104bf4e6f1b8f33140ca6079c53516741e0fe99d45b745c005cabfc",
          blockNumber: 522117760n,
          runId: "0xcb7429a0bd1c93f0077be87ec03347c0dc647ed59a372b2f731f4fadf53c5cd6",
          recipient: PAYEE,
          amount: parseUnits("500", 18),
        },
      },
    },
    BRAt: {
      perPaymentCap: parseUnits("1000", 18),
      batchCap: parseUnits("2000", 18),
      balance: 0n,
      allowance: 0n,
      approved: { [PAYEE]: true },
      payments: {},
    },
  },
};

const payTos = [...new Set(INVOICES.map((i) => i.payTo.toLowerCase()))] as Address[];

/**
 * Lee topes, allowlist (para cada payTo de las facturas), saldo/allowance de la wallet que paga
 * y los PaymentExecuted de ambos PaymentBatch. Refresca cada 15 s.
 */
export function useChainSnapshot() {
  const client = usePublicClient({ chainId: arbitrum.id });
  const { address } = useAccount();
  const payer = (address ?? OPERATIVE_WALLET) as Address;

  const query = useQuery({
    queryKey: ["chain-snapshot", payer],
    enabled: Boolean(client),
    refetchInterval: 30_000,
    retry: 4,
    queryFn: async (): Promise<ChainSnapshot> => {
      const c = client!;
      const blockNumber = await c.getBlockNumber();
      const entries = await Promise.all(
        CURRENCIES.map(async (cur): Promise<[Currency, CurrencyState]> => {
          const d = DEPLOYMENTS[cur];
          const batch = { address: d.batch, abi: paymentBatchAbi } as const;
          const token = { address: d.token, abi: erc20Abi } as const;
          const [perPaymentCap, batchCap, balance, allowance, ...approvals] = await Promise.all([
            c.readContract({ ...batch, functionName: "maxAmountPerPayment" }),
            c.readContract({ ...batch, functionName: "maxAmountPerBatch" }),
            c.readContract({ ...token, functionName: "balanceOf", args: [payer] }),
            c.readContract({ ...token, functionName: "allowance", args: [payer, d.batch] }),
            ...payTos.map((a) => c.readContract({ ...batch, functionName: "approvedRecipients", args: [getAddress(a)] })),
          ]);
          const logs = await c.getLogs({
            address: d.batch,
            event: paymentBatchAbi.find((x) => x.type === "event" && x.name === "PaymentExecuted") as never,
            fromBlock: FROM_BLOCK,
            toBlock: blockNumber,
          });
          const payments: Record<string, OnchainPayment> = {};
          for (const l of logs as unknown as { args: { runId: `0x${string}`; invoiceRef: `0x${string}`; recipient: string; amount: bigint }; transactionHash: `0x${string}`; blockNumber: bigint }[]) {
            payments[l.args.invoiceRef.toLowerCase()] = {
              txHash: l.transactionHash,
              blockNumber: l.blockNumber,
              runId: l.args.runId,
              recipient: l.args.recipient,
              amount: l.args.amount,
            };
          }
          return [
            cur,
            {
              perPaymentCap: perPaymentCap as bigint,
              batchCap: batchCap as bigint,
              balance: balance as bigint,
              allowance: allowance as bigint,
              approved: Object.fromEntries(payTos.map((a, i) => [a, approvals[i] as boolean])),
              payments,
            },
          ];
        }),
      );
      return { source: "live", blockNumber, currencies: Object.fromEntries(entries) as ChainSnapshot["currencies"] };
    },
  });

  return {
    snapshot: query.data ?? STATIC_SNAPSHOT,
    isLive: Boolean(query.data),
    isLoading: query.isLoading,
    error: query.error,
    payer,
    refetch: query.refetch,
  };
}
