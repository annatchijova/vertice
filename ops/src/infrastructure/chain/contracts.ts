import { parseAbi, type Address } from "viem";
import type { Currency } from "@/domain/invoice";

export const CHAIN_ID = 42161;
export const ARBISCAN = "https://arbiscan.io";
export const PROOF_URL = "https://vertice-proof.vercel.app";

/** Wallet operativa: owner de ambos PaymentBatch y firmante de la tx real de ARGt. */
export const OPERATIVE_WALLET: Address = "0xa6b2df351332db16c43630e8290fd893e9c71513";

export const DEPLOYMENTS: Record<Currency, { token: Address; batch: Address; registry: Address; decimals: 18 }> = {
  ARGt: {
    token: "0x59863989d080b22476db95656d0c3cc18be92214",
    batch: "0x21Bf9822877502Ea7e5C2F973c0E335174763965",
    registry: "0xc07e0a1854676AaA05F769D6f21db89F9B9487D9",
    decimals: 18,
  },
  BRAt: {
    token: "0xc4ed6aba5373d78e160f4df39e011f078be54df8",
    batch: "0xb6653422431C5419Df650d38D3B90C29f3a947cA",
    registry: "0xE7271FbcC7f22a21485331D4581f6A8C7f6745C7",
    decimals: 18,
  },
};

export const paymentBatchAbi = parseAbi([
  "function owner() view returns (address)",
  "function maxAmountPerPayment() view returns (uint256)",
  "function maxAmountPerBatch() view returns (uint256)",
  "function approvedRecipients(address) view returns (bool)",
  "function executedRuns(bytes32) view returns (bool)",
  "function payBatch(bytes32 runId, address[] recipients, uint256[] amounts, bytes32[] invoiceRefs)",
  "event PaymentExecuted(bytes32 indexed runId, bytes32 indexed invoiceRef, address indexed recipient, uint256 amount)",
  "error RunAlreadyExecuted(bytes32 runId)",
  "error ZeroAddress()",
  "error EmptyBatch()",
  "error LengthMismatch()",
  "error RecipientNotApproved(address recipient)",
  "error ZeroAmount()",
  "error ExceedsPerPaymentCap(uint256 amount, uint256 cap)",
  "error ExceedsBatchCap(uint256 total, uint256 cap)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

export const txUrl = (hash: string) => `${ARBISCAN}/tx/${hash}`;
export const addressUrl = (addr: string) => `${ARBISCAN}/address/${addr}`;
