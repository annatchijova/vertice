import { decodeEventLog, getAddress, keccak256, parseAbi, stringToHex, type Address, type Hex, type PublicClient } from "viem";
import type { Currency } from "@/domain/invoice";
import {
  SOL_CHECK_STATUS,
  SOL_VERDICT,
  ZERO_ADDRESS,
  ZERO_HASH,
  type CheckStatus,
  type Evidence,
  type Verdict,
} from "@/domain/proof/verifier";
import { CHAIN_ID, DEPLOYMENTS, paymentBatchAbi } from "./contracts";

/**
 * Adquisición de evidencia RPC_ATTESTED (port de web/src/evidence.ts a viem PublicClient).
 * Lee tx + receipt de Arbitrum One y decodifica por separado:
 *   - el Transfer que emitió el token (ARGt o BRAt),
 *   - el PaymentExecuted que emitió el PaymentBatch.
 * Nunca copia uno en el otro: ORDER_BINDING compara ambos.
 * Todo lo que no se puede leer termina en InsufficientEvidence (nunca se inventa un dato).
 */

export const REQUIRED_CONFIRMATIONS = 1n;

const transferAbi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

export const registryAbi = parseAbi([
  "struct Claim { bytes32 transactionHash; uint256 chainId; address paymentBatchContract; bytes32 runId; bytes32 invoiceRef; bool assertsToken; address token; bool assertsSender; address sender; bool assertsRecipient; address recipient; bool assertsAmount; uint256 amount; }",
  "struct Evidence { bool available; bytes32 transactionHash; uint256 chainId; uint256 blockNumber; bytes32 blockHash; bool successful; address paymentBatchContract; bytes32 paymentExecutedRunId; bytes32 paymentExecutedInvoiceRef; address paymentExecutedRecipient; uint256 paymentExecutedAmount; address transferToken; address transferSender; address transferRecipient; uint256 transferAmount; bytes32 finalityPolicyId; uint64 requiredConfirmations; uint64 observedConfirmations; }",
  "struct Receipt { uint16 schemaVersion; uint8 evidenceAssurance; uint8 verdict; uint8[10] checks; bytes32 transactionHash; uint256 chainId; uint256 blockNumber; bytes32 blockHash; bytes32 providerId; uint64 observedAt; uint64 recordedAt; bytes32 claimDigest; bytes32 evidenceDigest; Claim claim; Evidence evidence; }",
  "function getReceiptForClaim(bytes32 runId, bytes32 invoiceRef) view returns (Receipt)",
  "function receiptIdForClaim(bytes32) view returns (bytes32)",
  "function publisher() view returns (address)",
]);

export class InsufficientEvidence extends Error {
  /** Si la tx paga varias facturas y no se dijo cuál, los pagos del lote para elegir. */
  constructor(message: string, readonly payments?: BatchPayment[]) {
    super(message);
  }
}
const fail = (msg: string): never => {
  throw new InsufficientEvidence(msg);
};

export type BatchPayment = { invoiceRef: Hex; recipient: Address; amount: bigint };

export type RegistryReceipt = {
  receiptId: Hex;
  publisher: Address;
  verdict: Verdict;
  checks: CheckStatus[];
  observedAt: number;
  recordedAt: number;
  transactionHash: Hex;
};

export type AcquiredEvidence = {
  evidence: Evidence;
  currency: Currency;
  token: Address;
  batch: Address;
  registry: Address;
  txFrom: Address;
  timestamp: number;
  gasUsed: bigint;
  /** Todos los pagos del lote (una tx puede pagar varias facturas). */
  batchPayments: BatchPayment[];
  observedAt: number;
};

const finalityPolicyId = (chainId: bigint, confirmations: bigint) =>
  keccak256(stringToHex(`vertice/finality/v1:${chainId}:${confirmations}`));

const lower = (a: string) => a.toLowerCase();

/**
 * @param invoiceRef  si la tx paga varias facturas, cuál se está verificando.
 */
export async function acquireEvidence(client: PublicClient, txHash: Hex, invoiceRef?: Hex): Promise<AcquiredEvidence> {
  const observedAt = Math.floor(Date.now() / 1000);

  const chainId = BigInt(await client.getChainId().catch(() => fail("No se pudo leer la red del RPC.")));
  if (chainId !== BigInt(CHAIN_ID)) fail(`El RPC responde la red ${chainId}, no Arbitrum One.`);

  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash: txHash }).catch(() => null),
    client.getTransactionReceipt({ hash: txHash }).catch(() => null),
  ]);
  if (!tx || !receipt) fail("Arbitrum One no devuelve esta transacción (no existe, todavía no se incluyó o el RPC no respondió).");
  if (lower(tx!.hash) !== lower(txHash) || lower(receipt!.transactionHash) !== lower(txHash)) {
    fail("El hash difiere entre el pedido, la transacción y el receipt.");
  }

  const [head, block] = await Promise.all([
    client.getBlockNumber().catch(() => fail("No se pudo leer el último bloque.")),
    client.getBlock({ blockHash: receipt!.blockHash }).catch(() => fail("No se pudo leer el bloque de la transacción.")),
  ]);
  if (head < receipt!.blockNumber) fail("El RPC informa un último bloque anterior a la transacción.");

  // ¿Qué PaymentBatch emitió eventos en esta tx?
  const deployment = (Object.entries(DEPLOYMENTS) as [Currency, (typeof DEPLOYMENTS)[Currency]][]).find(([, d]) =>
    receipt!.logs.some((l) => lower(l.address) === lower(d.batch)),
  ) ?? (Object.entries(DEPLOYMENTS) as [Currency, (typeof DEPLOYMENTS)[Currency]][]).find(([, d]) => tx!.to && lower(tx!.to) === lower(d.batch));

  const successful = receipt!.status === "success";
  if (!deployment && successful) fail("La transacción no pasó por ningún PaymentBatch de VÉRTICE (ARGt ni BRAt).");
  const [currency, d] = deployment ?? (["ARGt", DEPLOYMENTS.ARGt] as const);

  type PE = BatchPayment & { runId: Hex; logIndex: number };
  type TR = { token: Address; from: Address; to: Address; value: bigint; logIndex: number };
  const executed: PE[] = [];
  const transfers: TR[] = [];

  for (const log of receipt!.logs) {
    const emitter = lower(log.address);
    if (emitter === lower(d.batch)) {
      try {
        const ev = decodeEventLog({ abi: paymentBatchAbi, data: log.data, topics: log.topics, strict: true });
        if (ev.eventName === "PaymentExecuted") {
          const a = ev.args as { runId: Hex; invoiceRef: Hex; recipient: Address; amount: bigint };
          executed.push({ ...a, recipient: getAddress(a.recipient), logIndex: log.logIndex });
        }
      } catch {
        fail("El PaymentBatch emitió un PaymentExecuted mal formado.");
      }
    } else if (emitter === lower(d.token)) {
      try {
        const ev = decodeEventLog({ abi: transferAbi, data: log.data, topics: log.topics, strict: true });
        if (ev.eventName === "Transfer") {
          transfers.push({ token: getAddress(log.address), from: getAddress(ev.args.from), to: getAddress(ev.args.to), value: ev.args.value, logIndex: log.logIndex });
        }
      } catch {
        // approve/otros eventos del token: no son Transfer
      }
    }
  }

  let pe: PE | undefined;
  let tr: TR | undefined;
  if (successful) {
    if (executed.length === 0) fail("La transacción no tiene ningún PaymentExecuted.");
    if (invoiceRef) {
      pe = executed.find((e) => lower(e.invoiceRef) === lower(invoiceRef));
      // Si la factura afirmada no está en el lote, se evalúa contra el único pago (o falla INVOICE_REF), nunca se inventa.
      if (!pe && executed.length === 1) pe = executed[0];
      if (!pe) fail("El lote paga varias facturas y ninguna coincide con la referencia afirmada.");
    } else {
      if (executed.length > 1) {
        throw new InsufficientEvidence(
          `El lote paga ${executed.length} facturas. Elegí cuál querés verificar.`,
          executed.map(({ invoiceRef, recipient, amount }) => ({ invoiceRef, recipient, amount })),
        );
      }
      pe = executed[0];
    }
    // safeTransferFrom emite el Transfer justo antes de cada PaymentExecuted: se toma el Transfer anterior más cercano.
    tr = transfers.filter((t) => t.logIndex < pe!.logIndex).sort((a, b) => b.logIndex - a.logIndex)[0];
    if (!tr) fail(`No hay un Transfer de ${currency} que acompañe al PaymentExecuted.`);
  }

  const evidence: Evidence = {
    available: true,
    transactionHash: receipt!.transactionHash,
    chainId,
    blockNumber: receipt!.blockNumber,
    blockHash: receipt!.blockHash,
    successful,
    paymentBatchContract: getAddress(d.batch),
    paymentExecutedRunId: pe?.runId ?? ZERO_HASH,
    paymentExecutedInvoiceRef: pe?.invoiceRef ?? ZERO_HASH,
    paymentExecutedRecipient: pe?.recipient ?? ZERO_ADDRESS,
    paymentExecutedAmount: pe?.amount ?? 0n,
    transferToken: tr?.token ?? ZERO_ADDRESS,
    transferSender: tr?.from ?? ZERO_ADDRESS,
    transferRecipient: tr?.to ?? ZERO_ADDRESS,
    transferAmount: tr?.value ?? 0n,
    finalityPolicyId: finalityPolicyId(chainId, REQUIRED_CONFIRMATIONS),
    requiredConfirmations: REQUIRED_CONFIRMATIONS,
    observedConfirmations: head - receipt!.blockNumber + 1n,
  };

  return {
    evidence,
    currency,
    token: getAddress(d.token),
    batch: getAddress(d.batch),
    registry: getAddress(d.registry),
    txFrom: getAddress(tx!.from),
    timestamp: Number(block.timestamp),
    gasUsed: receipt!.gasUsed,
    batchPayments: executed.map(({ invoiceRef, recipient, amount }) => ({ invoiceRef, recipient, amount })),
    observedAt,
  };
}

/** Recibo publicado en PaymentReceiptRegistry para (runId, invoiceRef), si existe. null = no hay. */
export async function readRegistryReceipt(client: PublicClient, registry: Address, runId: Hex, invoiceRef: Hex): Promise<RegistryReceipt | null> {
  const r = { address: registry, abi: registryAbi } as const;
  const [receipt, publisher, receiptId] = await Promise.all([
    client.readContract({ ...r, functionName: "getReceiptForClaim", args: [runId, invoiceRef] }),
    client.readContract({ ...r, functionName: "publisher" }),
    client.readContract({
      ...r,
      functionName: "receiptIdForClaim",
      args: [keccak256(`0x${runId.slice(2)}${invoiceRef.slice(2)}`)],
    }),
  ]);
  if (receipt.schemaVersion === 0) return null;
  return {
    receiptId,
    publisher,
    verdict: SOL_VERDICT[receipt.verdict] ?? "INSUFFICIENT_EVIDENCE",
    checks: receipt.checks.map((c) => SOL_CHECK_STATUS[c] ?? "ABSTAIN"),
    observedAt: Number(receipt.observedAt),
    recordedAt: Number(receipt.recordedAt),
    transactionHash: receipt.transactionHash,
  };
}
