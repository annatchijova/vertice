"use client";

import { useAccount, useReadContract } from "wagmi";
import type { Invoice } from "@/domain/invoice";
import { formatAmount, shortAddr, shortHash } from "@/domain/format";
import { CHAIN_ID, DEPLOYMENTS, erc20Abi, txUrl } from "@/infrastructure/chain/contracts";
import { usePayBatch } from "./usePayBatch";

/**
 * CONTRATO PÚBLICO (lo usan Dashboard y Detalle — no cambiar la firma de props):
 *   <PayButton invoices={[...]} fullWidth onPaid={(txHash) => …} />
 * Todas las facturas deben ser de la misma `currency`. Muestra "Pagar 800,00" con .vx-btn--pay
 * y maneja conectar wallet → red Arbitrum → approve → payBatch → recibo, con estados y errores.
 */
export type PayButtonProps = {
  invoices: Invoice[];
  fullWidth?: boolean;
  onPaid?: (txHash: `0x${string}`) => void;
};

const small = { fontSize: 13, lineHeight: 1.4, margin: 0 } as const;
const tiny = { fontSize: 11, lineHeight: 1.4, margin: 0, color: "var(--ink-500)" } as const;

export function PayButton({ invoices, fullWidth, onPaid }: PayButtonProps) {
  const { status, step, inProgress, total, currency, approveHash, payHash, error, pay, reset } = usePayBatch(invoices);
  const { address, isConnected, chainId, chain } = useAccount();

  const token = currency ? DEPLOYMENTS[currency].token : undefined;
  const { data: balance } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: Boolean(address && token), refetchInterval: 15_000 },
  });
  const insufficient = isConnected && typeof balance === "bigint" && balance < total;
  const wrongNetwork = isConnected && chainId !== CHAIN_ID;

  const handleClick = async () => {
    const hash = await pay();
    if (hash) onPaid?.(hash);
  };

  const align = fullWidth ? "stretch" : "flex-start";

  if (status === "done" && payHash) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: align, width: fullWidth ? "100%" : undefined }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="vx-badge vx-badge--verified">Pagado · Verified</span>
          <span className="vx-mono" style={{ fontSize: 13 }}>
            {formatAmount(total)} {currency}
          </span>
        </div>
        <a
          className="vx-mono"
          href={txUrl(payHash)}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12, color: "var(--ink-700)" }}
        >
          tx {shortHash(payHash)} · ver en Arbiscan ↗
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: align, width: fullWidth ? "100%" : undefined }}>
      <button
        type="button"
        className="vx-btn vx-btn--pay"
        style={fullWidth ? { width: "100%" } : undefined}
        disabled={inProgress || invoices.length === 0}
        aria-busy={inProgress}
        onClick={handleClick}
      >
        Pagar {formatAmount(total)}
      </button>

      {inProgress && step && (
        <p role="status" aria-live="polite" style={{ ...small, color: "var(--ink-700)" }}>
          {step}
        </p>
      )}

      {inProgress && approveHash && (
        <a className="vx-mono" href={txUrl(approveHash)} target="_blank" rel="noreferrer" style={{ ...tiny, textDecoration: "underline" }}>
          approve {shortHash(approveHash)} ↗
        </a>
      )}
      {inProgress && payHash && (
        <a className="vx-mono" href={txUrl(payHash)} target="_blank" rel="noreferrer" style={{ ...tiny, textDecoration: "underline" }}>
          payBatch {shortHash(payHash)} ↗
        </a>
      )}

      {status === "error" && error && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <p role="alert" style={{ ...small, color: "var(--failed)" }}>
            {error}
          </p>
          <button type="button" className="vx-btn vx-btn--ghost vx-btn--sm" onClick={reset}>
            Reintentar
          </button>
        </div>
      )}

      {isConnected && address ? (
        <p className="vx-mono" style={tiny}>
          {shortAddr(address)} · {wrongNetwork ? "red incorrecta (cambiá a Arbitrum One)" : (chain?.name ?? "Arbitrum One")}
          {typeof balance === "bigint" && ` · saldo ${formatAmount(balance)} ${currency}`}
        </p>
      ) : (
        <p style={tiny}>Al tocar Pagar te pedimos conectar la wallet.</p>
      )}

      {insufficient && (
        <p style={{ ...small, color: "var(--insufficient)" }}>
          Saldo insuficiente en esta wallet: tenés {formatAmount(balance as bigint)} {currency} y necesitás {formatAmount(total)}.
        </p>
      )}
    </div>
  );
}
