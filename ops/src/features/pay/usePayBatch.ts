"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  getAddress,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { useAccount, useConnect, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { injected } from "wagmi/connectors";
import type { Invoice } from "@/domain/invoice";
import { formatAmount, shortAddr, toUnits } from "@/domain/format";
import { CHAIN_ID, DEPLOYMENTS, erc20Abi, paymentBatchAbi } from "@/infrastructure/chain/contracts";

export type PayStatus =
  | "idle"
  | "connecting"
  | "switching-network"
  | "checking"
  | "approving"
  | "waiting-approve"
  | "paying"
  | "waiting-receipt"
  | "done"
  | "error";

export const IN_PROGRESS: PayStatus[] = [
  "connecting",
  "switching-network",
  "checking",
  "approving",
  "waiting-approve",
  "paying",
  "waiting-receipt",
];

/** Primer bloque útil de los PaymentBatch (mismo que useChainSnapshot). */
const FROM_BLOCK = 522_100_000n;

/** Error con mensaje ya listo para mostrar (guardas del cliente). */
class PayGuardError extends Error {}

const ERROR_MESSAGES: Record<string, string> = {
  RunAlreadyExecuted: "Este lote ya se ejecutó on-chain (runId repetido).",
  EmptyBatch: "El lote está vacío.",
  LengthMismatch: "El lote está mal armado (largos distintos).",
  RecipientNotApproved: "El destinatario no está aprobado en PaymentBatch.",
  ZeroAmount: "Hay un monto en cero.",
  ExceedsPerPaymentCap: "Un pago supera el tope de 1.000,00 por pago.",
  ExceedsBatchCap: "El lote supera el tope de 2.000,00 por lote.",
  ZeroAddress: "Hay una dirección vacía en el lote.",
};

export function describePayError(err: unknown): string {
  if (err instanceof PayGuardError) return err.message;
  if (err instanceof BaseError) {
    const rejected = err.walk((e) => e instanceof UserRejectedRequestError || (e as { code?: number }).code === 4001);
    if (rejected) return "Cancelaste la firma en la wallet.";
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name && ERROR_MESSAGES[name]) return ERROR_MESSAGES[name];
      if (reverted.reason) return `El contrato rechazó la operación: ${reverted.reason}`;
      return "El contrato rechazó la operación.";
    }
    if (err.name === "ProviderNotFoundError") return "No encontramos una wallet en el navegador. Instalá MetaMask o Rabby.";
    if (err.name === "ConnectorAlreadyConnectedError") return "La wallet ya está conectada. Reintentá.";
    if (/insufficient funds/i.test(err.message)) return "No tenés ETH suficiente en Arbitrum para pagar el gas.";
    return err.shortMessage || err.message;
  }
  if ((err as { code?: number })?.code === 4001) return "Cancelaste la firma en la wallet.";
  if (err instanceof Error) return err.message;
  return "Algo salió mal. Reintentá.";
}

const STEP_LABELS = (total: string, currency: string, needsApprove: boolean): Record<PayStatus, string | null> => {
  const n = needsApprove ? 2 : 1;
  return {
    idle: null,
    connecting: "Conectá tu wallet…",
    "switching-network": "Cambiá a Arbitrum One en tu wallet…",
    checking: "Verificando topes, destinatario y saldo on-chain…",
    approving: `1/2 · Aprobá ${total} ${currency} en tu wallet…`,
    "waiting-approve": "1/2 · Esperando confirmación del approve en Arbitrum…",
    paying: `${n}/${n} · Firmá payBatch en tu wallet…`,
    "waiting-receipt": "Esperando confirmación en Arbitrum…",
    done: null,
    error: null,
  };
};

export function usePayBatch(invoices: Invoice[]) {
  const queryClient = useQueryClient();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const account = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [status, setStatus] = useState<PayStatus>("idle");
  const [needsApprove, setNeedsApprove] = useState(true);
  const [approveHash, setApproveHash] = useState<Hex | null>(null);
  const [payHash, setPayHash] = useState<Hex | null>(null);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const currency = invoices[0]?.currency;
  const total = invoices.reduce((s, i) => s + toUnits(i.amount), 0n);
  const step = STEP_LABELS(formatAmount(total), currency ?? "", needsApprove)[status];

  const reset = useCallback(() => {
    if (busy.current) return;
    setStatus("idle");
    setApproveHash(null);
    setPayHash(null);
    setReceipt(null);
    setError(null);
  }, []);

  const pay = useCallback(async (): Promise<Hex | null> => {
    if (busy.current) return null;
    busy.current = true;
    setError(null);
    setApproveHash(null);
    setPayHash(null);
    setReceipt(null);

    try {
      // ---- 0. Validación del lote (sin red) ----
      if (invoices.length === 0) throw new PayGuardError("No hay facturas para pagar.");
      if (!currency || invoices.some((i) => i.currency !== currency))
        throw new PayGuardError("Todas las facturas del lote tienen que ser de la misma moneda.");
      if (invoices.some((i) => i.executed)) throw new PayGuardError("Una de las facturas ya figura pagada on-chain.");
      if (!publicClient) throw new PayGuardError("No hay conexión con Arbitrum. Reintentá.");
      const d = DEPLOYMENTS[currency];
      const recipients = invoices.map((i) => getAddress(i.payTo));
      const amounts = invoices.map((i) => toUnits(i.amount, d.decimals));
      const invoiceRefs = invoices.map((i) => i.invoiceRef);
      if (amounts.some((a) => a <= 0n)) throw new PayGuardError("Hay un monto en cero.");

      // ---- 1. Conectar ----
      let payer: Address | undefined = account.address;
      let chainId = account.chainId;
      if (!account.isConnected || !payer) {
        setStatus("connecting");
        const res = await connectAsync({ connector: connectors[0] ?? injected() });
        payer = res.accounts[0];
        chainId = res.chainId;
      }
      if (!payer) throw new PayGuardError("La wallet no devolvió ninguna cuenta.");

      // ---- 2. Red ----
      if (chainId !== CHAIN_ID) {
        setStatus("switching-network");
        await switchChainAsync({ chainId: CHAIN_ID });
      }

      // ---- 3. Guardas on-chain antes de cualquier firma ----
      setStatus("checking");
      const batch = { address: d.batch, abi: paymentBatchAbi } as const;
      const token = { address: d.token, abi: erc20Abi } as const;
      const [perPaymentCap, batchCap, balance, allowance, ...approved] = await Promise.all([
        publicClient.readContract({ ...batch, functionName: "maxAmountPerPayment" }),
        publicClient.readContract({ ...batch, functionName: "maxAmountPerBatch" }),
        publicClient.readContract({ ...token, functionName: "balanceOf", args: [payer] }),
        publicClient.readContract({ ...token, functionName: "allowance", args: [payer, d.batch] }),
        ...recipients.map((r) => publicClient.readContract({ ...batch, functionName: "approvedRecipients", args: [r] })),
      ]);
      const big = amounts.find((a) => a > (perPaymentCap as bigint));
      if (big !== undefined)
        throw new PayGuardError(`${formatAmount(big)} ${currency} supera el tope de ${formatAmount(perPaymentCap as bigint)} por pago. No se envió nada.`);
      if (total > (batchCap as bigint))
        throw new PayGuardError(`El lote (${formatAmount(total)} ${currency}) supera el tope de ${formatAmount(batchCap as bigint)} por lote. No se envió nada.`);
      const notApproved = recipients.find((_, i) => approved[i] !== true);
      if (notApproved)
        throw new PayGuardError(`${shortAddr(notApproved)} no está aprobado en PaymentBatch. No se envió nada.`);
      if ((balance as bigint) < total)
        throw new PayGuardError(
          `Saldo insuficiente: tenés ${formatAmount(balance as bigint)} ${currency} y el lote es de ${formatAmount(total)}. No se envió nada.`,
        );

      // Doble pago: el contrato solo deduplica por runId, no por factura.
      try {
        const logs = await publicClient.getLogs({
          address: d.batch,
          event: paymentBatchAbi.find((x) => x.type === "event" && x.name === "PaymentExecuted") as never,
          args: { invoiceRef: invoiceRefs } as never,
          fromBlock: FROM_BLOCK,
        });
        if (logs.length > 0) throw new PayGuardError("Esta factura ya se pagó on-chain. No se envió nada.");
      } catch (e) {
        if (e instanceof PayGuardError) throw e;
        // RPC sin getLogs: seguimos, la guarda de executed ya corrió con los datos locales.
      }

      // ---- 4. Approve (solo si hace falta) ----
      const mustApprove = (allowance as bigint) < total;
      setNeedsApprove(mustApprove);
      if (mustApprove) {
        setStatus("approving");
        const hash = await writeContractAsync({
          ...token,
          functionName: "approve",
          args: [d.batch, total],
          account: payer,
          chainId: CHAIN_ID,
        });
        setApproveHash(hash);
        setStatus("waiting-approve");
        const r = await publicClient.waitForTransactionReceipt({ hash });
        if (r.status !== "success") throw new PayGuardError("El approve revirtió on-chain. No se pagó nada.");
        // El RPC puede tardar en reflejar el allowance nuevo: esperamos a verlo antes de simular.
        for (let i = 0; i < 10; i++) {
          const a = await publicClient.readContract({ ...token, functionName: "allowance", args: [payer, d.batch] });
          if ((a as bigint) >= total) break;
          await new Promise((res) => setTimeout(res, 1000));
        }
      }

      // ---- 5. Simular y firmar payBatch ----
      setStatus("paying");
      const runId = keccak256(stringToHex(`vertice-ops:${invoices.map((i) => i.id).join(",")}:${Date.now()}`));
      const args = [runId, recipients, amounts, invoiceRefs] as const;
      await publicClient.simulateContract({ ...batch, functionName: "payBatch", args, account: payer });
      const hash = await writeContractAsync({
        ...batch,
        functionName: "payBatch",
        args,
        account: payer,
        chainId: CHAIN_ID,
      });
      setPayHash(hash);

      // ---- 6. Recibo ----
      setStatus("waiting-receipt");
      const r = await publicClient.waitForTransactionReceipt({ hash });
      setReceipt(r);
      if (r.status !== "success") throw new PayGuardError("payBatch revirtió on-chain. Revisá la tx en Arbiscan.");

      setStatus("done");
      void queryClient.invalidateQueries({ queryKey: ["chain-snapshot"] });
      return hash;
    } catch (e) {
      setError(describePayError(e));
      setStatus("error");
      void queryClient.invalidateQueries({ queryKey: ["chain-snapshot"] });
      return null;
    } finally {
      busy.current = false;
    }
  }, [invoices, currency, total, publicClient, account.address, account.chainId, account.isConnected, connectAsync, connectors, switchChainAsync, writeContractAsync, queryClient]);

  return {
    status,
    step,
    inProgress: IN_PROGRESS.includes(status),
    needsApprove,
    total,
    currency,
    approveHash,
    payHash,
    receipt,
    error,
    pay,
    reset,
  };
}
