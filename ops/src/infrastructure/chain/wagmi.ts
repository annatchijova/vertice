import { http, createConfig } from "wagmi";
import { arbitrum } from "wagmi/chains";
import { injected } from "wagmi/connectors";

/** El RPC público limita pedidos: para la demo conviene NEXT_PUBLIC_ARBITRUM_RPC con una key propia. */
export const RPC_URL = process.env.NEXT_PUBLIC_ARBITRUM_RPC ?? "https://arb1.arbitrum.io/rpc";

export const wagmiConfig = createConfig({
  chains: [arbitrum],
  connectors: [injected()],
  // batch.multicall agrupa los readContract concurrentes en una sola llamada eth_call
  batch: { multicall: true },
  transports: { [arbitrum.id]: http(RPC_URL, { batch: true, retryCount: 3 }) },
  ssr: true,
});
