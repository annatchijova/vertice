import { decodeEventLog, getAddress, keccak256, stringToHex, type Address, type Hex } from "viem";
import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_RPC_URL,
  ARGT_TOKEN_ADDRESS,
  PAYMENT_BATCH_ADDRESS,
  REQUIRED_CONFIRMATIONS,
  RPC_PROVIDER_ID,
  RPC_TIMEOUT_MILLISECONDS,
} from "./chain.js";

/**
 * Ported from Veridra's `offchain/src/rpcEvidence.ts` (annatchijova/veridra),
 * which acquires RPC_ATTESTED-level evidence for a native-asset transfer on
 * Monad. This version reads two independent logs from the same Arbitrum
 * receipt instead of one native transfer: the ERC-20 `Transfer` emitted by
 * ARGt, and the `PaymentExecuted` event emitted by VÉRTICE's own
 * `PaymentBatch` contract — kept separate all the way through so the
 * comparator in verify.ts can cross-check them, instead of trusting either
 * alone. See `src/PaymentVerifier.sol`'s ORDER_BINDING_CHECK for why.
 */

const MAX_RPC_RESPONSE_BYTES = 2_000_000;
const MAX_UINT64 = (1n << 64n) - 1n;

const TRANSFER_TOPIC = keccak256(stringToHex("Transfer(address,address,uint256)"));
const TRANSFER_ABI = [
  {
    type: "event",
    name: "Transfer",
    anonymous: false,
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
  },
] as const;

const PAYMENT_EXECUTED_TOPIC = keccak256(stringToHex("PaymentExecuted(bytes32,bytes32,address,uint256)"));
const PAYMENT_EXECUTED_ABI = [
  {
    type: "event",
    name: "PaymentExecuted",
    anonymous: false,
    inputs: [
      { indexed: true, name: "runId", type: "bytes32" },
      { indexed: true, name: "invoiceRef", type: "bytes32" },
      { indexed: true, name: "recipient", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
  },
] as const;

export type PaymentEvidence = {
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

export type AcquiredPaymentEvidence = {
  providerId: Hex;
  observedAt: bigint;
  evidence: PaymentEvidence;
};

export class InsufficientEvidenceError extends Error {
  readonly code = "INSUFFICIENT_EVIDENCE";
  constructor(message: string) {
    super(message);
    this.name = "InsufficientEvidenceError";
  }
}

type JsonObject = Record<string, unknown>;

function fail(message: string): never {
  throw new InsufficientEvidenceError(message);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(object: JsonObject, name: string): string {
  const value = object[name];
  if (typeof value !== "string") fail(`RPC field ${name} is missing or not a string`);
  return value;
}

function hexField(object: JsonObject, name: string, bytes?: number): Hex {
  const value = stringField(object, name);
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) fail(`RPC field ${name} is malformed hex`);
  if (bytes !== undefined && value.length !== 2 + bytes * 2) fail(`RPC field ${name} has the wrong byte length`);
  return value as Hex;
}

function hashField(object: JsonObject, name: string): Hex {
  return hexField(object, name, 32);
}

function quantity(value: unknown, field: string): bigint {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)) {
    fail(`RPC quantity ${field} is malformed`);
  }
  if ((value as string).length > 66) fail(`RPC quantity ${field} exceeds uint256`);
  return BigInt(value as string);
}

function checkedUint64(value: bigint, label: string): bigint {
  if (value < 0n || value > MAX_UINT64) fail(`${label} does not fit uint64`);
  return value;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.ok) fail(`RPC returned HTTP ${response.status}`);
  const declaredSize = response.headers.get("content-length");
  if (declaredSize !== null) {
    if (!/^\d+$/.test(declaredSize)) fail("RPC content length is malformed");
    if (BigInt(declaredSize) > BigInt(MAX_RPC_RESPONSE_BYTES)) fail("RPC response exceeds the configured size bound");
  }
  if (response.body === null) fail("RPC response body is missing");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > MAX_RPC_RESPONSE_BYTES) {
      await reader.cancel();
      fail("RPC response exceeds the configured size bound");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    fail("RPC response is not valid UTF-8 JSON");
  }
}

async function rpcCall(url: string, method: string, params: readonly unknown[]): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "vertice-rpc-1", method, params }),
      redirect: "error",
      signal: AbortSignal.timeout(RPC_TIMEOUT_MILLISECONDS),
    });
  } catch {
    fail(`RPC request failed for ${method}`);
  }
  const payload = await readBoundedJson(response);
  if (!isObject(payload) || payload.jsonrpc !== "2.0" || payload.id !== "vertice-rpc-1") {
    fail(`RPC returned an invalid envelope for ${method}`);
  }
  if (payload.error !== undefined) fail(`RPC reported an error for ${method}`);
  if (!("result" in payload)) fail(`RPC omitted the result for ${method}`);
  return payload.result;
}

function objectResult(value: unknown, label: string): JsonObject {
  if (!isObject(value)) fail(`${label} is unavailable or malformed`);
  return value;
}

function bytes32(value: Hex): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) fail("Expected a bytes32 value");
  return value;
}

function finalityPolicyId(chainId: bigint, confirmations: bigint): Hex {
  return keccak256(stringToHex(`vertice/finality/v1:${chainId.toString(10)}:${confirmations.toString(10)}`));
}

/**
 * Acquire RPC_ATTESTED evidence for one VÉRTICE payment from Arbitrum: the
 * Transfer the ARGt token actually emitted, and the PaymentExecuted event
 * VÉRTICE's own contract emitted in the same transaction — read as two
 * separate facts, never one copied into the other. Never throws a raw error;
 * every failure becomes InsufficientEvidenceError.
 */
export async function acquirePaymentEvidence(transactionHash: Hex): Promise<AcquiredPaymentEvidence> {
  bytes32(transactionHash);
  const observedAt = checkedUint64(BigInt(Math.floor(Date.now() / 1000)), "observedAt");

  const [chainValue, transactionValue, receiptValue] = await Promise.all([
    rpcCall(ARBITRUM_RPC_URL, "eth_chainId", []),
    rpcCall(ARBITRUM_RPC_URL, "eth_getTransactionByHash", [transactionHash]),
    rpcCall(ARBITRUM_RPC_URL, "eth_getTransactionReceipt", [transactionHash]),
  ]);
  const rpcChainId = quantity(chainValue, "chainId");
  if (rpcChainId !== ARBITRUM_CHAIN_ID) fail("RPC chain ID does not match Arbitrum One");
  if (transactionValue === null || receiptValue === null) fail("Transaction or receipt is not available yet");
  const transaction = objectResult(transactionValue, "Transaction");
  const receipt = objectResult(receiptValue, "Receipt");

  const txHash = hashField(transaction, "hash");
  const receiptHash = hashField(receipt, "transactionHash");
  if (txHash.toLowerCase() !== transactionHash.toLowerCase() || receiptHash.toLowerCase() !== txHash.toLowerCase()) {
    fail("Transaction hash differs across request, transaction, and receipt");
  }
  const blockNumber = quantity(receipt.blockNumber, "receipt.blockNumber");
  const blockHash = hashField(receipt, "blockHash");

  const headValue = await rpcCall(ARBITRUM_RPC_URL, "eth_blockNumber", []);
  const head = quantity(headValue, "headBlockNumber");
  if (head < blockNumber) fail("RPC head precedes the transaction block");
  const observedConfirmations = checkedUint64(head - blockNumber + 1n, "observedConfirmations");

  const statusValue = receipt.status;
  if (statusValue !== "0x0" && statusValue !== "0x1") fail("Receipt execution status is unsupported");
  const successful = statusValue === "0x1";

  const logsValue = receipt.logs;
  if (!Array.isArray(logsValue)) fail("Receipt logs are missing or malformed");

  const transfers: { token: Address; sender: Address; recipient: Address; amount: bigint }[] = [];
  const paymentExecutedEvents: {
    runId: Hex;
    invoiceRef: Hex;
    recipient: Address;
    amount: bigint;
  }[] = [];

  for (const rawLog of logsValue) {
    if (!isObject(rawLog)) fail("Receipt contains a malformed log");
    const emitter = getAddress(hexField(rawLog, "address", 20));
    const topicsValue = rawLog.topics;
    if (!Array.isArray(topicsValue) || topicsValue.length === 0) fail("Receipt contains malformed log topics");
    const topic0 = topicsValue[0];
    if (typeof topic0 !== "string") fail("Receipt log is missing its topic0");
    const data = hexField(rawLog, "data");
    const topics = topicsValue.map((topic) => {
      if (typeof topic !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(topic)) fail("Log topic is malformed");
      return topic as Hex;
    });

    if (topic0.toLowerCase() === TRANSFER_TOPIC.toLowerCase() && emitter.toLowerCase() === ARGT_TOKEN_ADDRESS.toLowerCase()) {
      if (topics.length !== 3) fail("ARGt Transfer log has an invalid topic count");
      try {
        const decoded = decodeEventLog({ abi: TRANSFER_ABI, data, topics: topics as [Hex, Hex, Hex], strict: true });
        if (decoded.eventName === "Transfer") {
          transfers.push({
            token: emitter,
            sender: getAddress(decoded.args.from),
            recipient: getAddress(decoded.args.to),
            amount: decoded.args.value,
          });
        }
      } catch {
        fail("ARGt emitted an unsupported or malformed Transfer log");
      }
      continue;
    }

    if (
      topic0.toLowerCase() === PAYMENT_EXECUTED_TOPIC.toLowerCase() &&
      emitter.toLowerCase() === PAYMENT_BATCH_ADDRESS.toLowerCase()
    ) {
      if (topics.length !== 4) fail("PaymentExecuted log has an invalid topic count");
      try {
        const decoded = decodeEventLog({
          abi: PAYMENT_EXECUTED_ABI,
          data,
          topics: topics as [Hex, Hex, Hex, Hex],
          strict: true,
        });
        if (decoded.eventName === "PaymentExecuted") {
          paymentExecutedEvents.push({
            runId: decoded.args.runId,
            invoiceRef: decoded.args.invoiceRef,
            recipient: getAddress(decoded.args.recipient),
            amount: decoded.args.amount,
          });
        }
      } catch {
        fail("PaymentBatch emitted an unsupported or malformed PaymentExecuted log");
      }
    }
  }

  if (!successful) fail("Transaction execution failed");
  if (transfers.length !== 1) fail("Transaction does not contain exactly one ARGt Transfer");
  if (paymentExecutedEvents.length !== 1) fail("Transaction does not contain exactly one PaymentExecuted event");
  const transfer = transfers[0]!;
  const paymentExecuted = paymentExecutedEvents[0]!;

  const finalityPolicy = finalityPolicyId(ARBITRUM_CHAIN_ID, REQUIRED_CONFIRMATIONS);
  const evidence: PaymentEvidence = {
    available: true,
    transactionHash: txHash,
    chainId: rpcChainId,
    blockNumber,
    blockHash,
    successful,
    paymentBatchContract: PAYMENT_BATCH_ADDRESS,
    paymentExecutedRunId: paymentExecuted.runId,
    paymentExecutedInvoiceRef: paymentExecuted.invoiceRef,
    paymentExecutedRecipient: paymentExecuted.recipient,
    paymentExecutedAmount: paymentExecuted.amount,
    transferToken: transfer.token,
    transferSender: transfer.sender,
    transferRecipient: transfer.recipient,
    transferAmount: transfer.amount,
    finalityPolicyId: finalityPolicy,
    requiredConfirmations: REQUIRED_CONFIRMATIONS,
    observedConfirmations,
  };

  return { providerId: RPC_PROVIDER_ID, observedAt, evidence };
}
