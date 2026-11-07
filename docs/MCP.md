# VÉRTICE MCP

## Propósito

`mcp_server.py` exposes a read-only Model Context Protocol surface for the
VÉRTICE backend. It lets an agent inspect policy, prepare a deterministic
payment proposal, read real Arbitrum receipts, and verify evidence for any
configured Twin Stablecoin (today: ARGt and BRAt, each with its own
`PaymentBatch` deployment — see `get_token_config`).

The server deliberately has no private-key access and no transaction-writing
tool. It cannot deploy contracts, call `approve`, call `payBatch`, sign a
wallet transaction, or publish a receipt. Human wallet approval remains the
authority for payments that cross the configured threshold.

## Tools

| Tool | Effect | Purpose |
|---|---|---|
| `get_chain_status` | Read-only RPC | Reads Arbitrum chain ID and latest block. |
| `get_business_policy` | Read-only local config | Returns caps, token, chain, and approved recipients for one `currency`; never secrets. |
| `get_token_config` | Read-only constants | Returns token, `PaymentBatch`, and registry addresses for every configured currency. |
| `list_invoices` | Read-only local file | Loads an optional JSON fixture; missing data is explicit. |
| `create_payment_proposal` | Pure local computation | Applies allowlist, duplicate, amount, and batch-cap checks for one `currency`. It never submits. |
| `read_payment_status` | Read-only RPC | Reads a real receipt and reports pending, success, or reverted. |
| `verify_payment` | Read-only RPC | Re-derives one `currency`'s `Transfer` and `PaymentExecuted` facts and returns `VERIFIED`, `NOT_VERIFIED`, or `INSUFFICIENT_EVIDENCE`. |

`get_business_policy`, `create_payment_proposal`, and `verify_payment` all take an
optional `currency` argument (default `"ARGt"`; also `"BRAt"`) selecting which
Twin Stablecoin's token/`PaymentBatch` pair to use. Adding a new currency means
adding one entry to the `CURRENCIES` dict in `mcp_server.py` (token + PaymentBatch
+ receipt registry addresses) — the tool logic itself does not change per
currency. `VERTICE_POLICY_JSON`'s caps and approved recipients are currently
shared across every currency; per-currency policy would be the next step if a
business needs different limits per supplier country.

## Configuration

```shell
export ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
# ARGt (default currency)
export ARGT_ADDRESS=0x59863989d080b22476db95656d0c3cc18be92214
export PAYMENT_BATCH_ADDRESS=0x21bf9822877502ea7e5c2f973c0e335174763965
export PAYMENT_RECEIPT_REGISTRY_ADDRESS=0xc07e0a1854676aaa05f769d6f21db89f9b9487d9
# BRAt
export BRAT_ADDRESS=0xc4ed6aba5373d78e160f4df39e011f078be54df8
export BRAT_PAYMENT_BATCH_ADDRESS=0xb6653422431c5419df650d38d3b90c29f3a947ca
export BRAT_PAYMENT_RECEIPT_REGISTRY_ADDRESS=0xe7271fbcc7f22a21485331d4581f6a8c7f6745c7
# Optional JSON policy and invoice fixture:
export VERTICE_POLICY_JSON='{"approvedRecipients":[],"maxAmountPerPayment":"10000000000000000000000","maxAmountPerBatch":"50000000000000000000000"}'
export VERTICE_INVOICES_PATH=/absolute/path/invoices.json
```

Do not put private keys, RPC credentials, or `.env` files in the repository.

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
