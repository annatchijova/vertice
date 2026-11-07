# VÉRTICE MCP

## Propósito

`mcp_server.py` exposes a read-only Model Context Protocol surface for the
VÉRTICE backend. It lets an agent inspect policy, prepare a deterministic
payment proposal, read real Arbitrum receipts, and verify ARGt evidence.

The server deliberately has no private-key access and no transaction-writing
tool. It cannot deploy contracts, call `approve`, call `payBatch`, sign a
wallet transaction, or publish a receipt. Human wallet approval remains the
authority for payments that cross the configured threshold.

## Tools

| Tool | Effect | Purpose |
|---|---|---|
| `get_chain_status` | Read-only RPC | Reads Arbitrum chain ID and latest block. |
| `get_business_policy` | Read-only local config | Returns caps, token, chain, and approved recipients; never secrets. |
| `get_token_config` | Read-only constants | Returns ARGt, `PaymentBatch`, and registry addresses. |
| `list_invoices` | Read-only local file | Loads an optional JSON fixture; missing data is explicit. |
| `create_payment_proposal` | Pure local computation | Applies allowlist, duplicate, amount, and batch-cap checks. It never submits. |
| `read_payment_status` | Read-only RPC | Reads a real receipt and reports pending, success, or reverted. |
| `verify_payment` | Read-only RPC | Re-derives ARGt `Transfer` and `PaymentExecuted` facts and returns `VERIFIED`, `NOT_VERIFIED`, or `INSUFFICIENT_EVIDENCE`. |

## Configuration

```shell
export ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
export VERTICE_MIN_CONFIRMATIONS=12
export ARGT_ADDRESS=0x59863989d080b22476db95656d0c3cc18be92214
export PAYMENT_BATCH_ADDRESS=0x21bf9822877502ea7e5c2f973c0e335174763965
export PAYMENT_RECEIPT_REGISTRY_ADDRESS=0xc07e0a1854676aaa05f769d6f21db89f9b9487d9
# Optional JSON policy and invoice fixture:
export VERTICE_POLICY_JSON='{"approvedRecipients":[],"maxAmountPerPayment":"10000000000000000000000","maxAmountPerBatch":"50000000000000000000000"}'
export VERTICE_INVOICES_PATH=/absolute/path/invoices.json
```

Do not put private keys, RPC credentials, or `.env` files in the repository.

`verify_payment` checks `eth_chainId` on every call, requires the configured minimum
confirmations, and rejects an ambiguous batch instead of selecting the last event. The
default is 12 confirmations; lower it only for a clearly documented test environment.

The MCP itself is not an operating-system sandbox. Run it with a dedicated unprivileged
user, a minimal environment, a read-only filesystem except for an explicit workspace, and
network egress restricted to the selected RPC. If Claude is launched over SSH, verify
those controls in the host runtime rather than inferring them from this server.

## Run with stdio

```shell
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python mcp_server.py
```

Example Claude configuration:

```json
{
  "mcpServers": {
    "vertice": {
      "command": "/absolute/path/vertice/.venv/bin/python",
      "args": ["/absolute/path/vertice/mcp_server.py"],
      "env": {
        "ARBITRUM_RPC_URL": "https://arb1.arbitrum.io/rpc"
      }
    }
  }
}
```

## Evidence boundary

The MCP treats invoice content and configured policy as inputs. A successful
verification is derived from the RPC receipt and two independent log shapes:
the ARGt ERC-20 `Transfer` and VÉRTICE's `PaymentExecuted`. A missing receipt,
missing event, insufficient finality, or malformed claim must not become a
successful payment assertion.
