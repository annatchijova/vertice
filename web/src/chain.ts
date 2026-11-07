import { keccak256, stringToHex, type Address } from "viem";

export const ARBITRUM_CHAIN_ID = 42_161n;
export const ARBITRUM_RPC_URL = "https://arb1.arbitrum.io/rpc";
export const EXPLORER_TX_URL = "https://arbiscan.io/tx/";
export const EXPLORER_ADDRESS_URL = "https://arbiscan.io/address/";

/** Same derivation the deploy/CLI tooling would use, so a UI check and a script check name the same source. */
export const RPC_PROVIDER_ID: `0x${string}` = keccak256(stringToHex(`vertice/rpc/${ARBITRUM_RPC_URL}`));

/**
 * Arbitrum has fast soft confirmation but is not instantly final; this bounds the
 * risk of reading a payment before the sequencer's ordering has settled, the same
 * way Veridra's REQUIRED_CONFIRMATIONS bounded Monad's. This is a bound, not a
 * proof of finality.
 */
export const REQUIRED_CONFIRMATIONS = 1n;

export const RPC_TIMEOUT_MILLISECONDS = 15_000;

/** ARGt (Twin Stablecoin, Argentine peso) on Arbitrum One. Source: stablecoins.twin.finance. */
export const ARGT_TOKEN_ADDRESS: Address = "0x59863989d080B22476DB95656d0C3CC18be92214";

/** VÉRTICE's own deployed contracts on Arbitrum One. */
export const PAYMENT_BATCH_ADDRESS: Address = "0x21Bf9822877502Ea7e5C2F973c0E335174763965";
export const PAYMENT_RECEIPT_REGISTRY_ADDRESS: Address = "0xc07e0a1854676AaA05F769D6f21db89F9B9487D9";
