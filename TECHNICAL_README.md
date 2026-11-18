# VÉRTICE — Technical README

**[English README](README.md) · [README en español](README_ES.md) · English technical · [Español técnico](TECHNICAL_README_ES.md)**

Full technical scope, without softening for a general audience. The Spanish technical
mirror is [`TECHNICAL_README_ES.md`](TECHNICAL_README_ES.md).

## Deployment status by currency — the exact distinction

There are two different levels of “real,” and they must not be conflated:

| | ARGt | BRAt |
|---|---|---|
| `PaymentBatch` deployed on Arbitrum One mainnet | Yes — [`0x21Bf…3965`](https://arbiscan.io/address/0x21Bf9822877502Ea7e5C2F973c0E335174763965) | Yes — [`0xb665…47cA`](https://arbiscan.io/address/0xb6653422431C5419Df650d38D3B90C29f3a947cA) |
| `PaymentReceiptRegistry` deployed | Yes — [`0xc07e…87D9`](https://arbiscan.io/address/0xc07e0a1854676AaA05F769D6f21db89F9B9487D9) | Yes — [`0xE727…45C7`](https://arbiscan.io/address/0xE7271FbcC7f22a21485331D4581f6A8C7f6745C7) |
| Approved demo supplier (`setApprovedRecipient`, real tx) | Yes | Yes |
| MCP recognizes the currency (`CURRENCIES` in `mcp_server.py`) | Yes | Yes |
| **Real payment transaction executed (`payBatch`)** | Yes — [`0x704fb8b5…cabfc`](https://arbiscan.io/tx/0x704fb8b5c104bf4e6f1b8f33140ca6079c53516741e0fe99d45b745c005cabfc) | No — no BRAt funds, so it was not executed |
| `verify_payment` run live against a real transaction | Yes, `VERIFIED` and reconfirmed | No transaction exists to verify |

The deployed contracts and configuration are publicly verifiable on Arbiscan. What is
missing for BRAt is the payment transaction itself: real BRAt funding was not available
in time. This is a funding limitation, not an architectural claim about the shared
contract design.

## Contract architecture

- **`src/PaymentBatch.sol`** pays a batch to owner-managed allowlisted recipients without
  holding funds (`transferFrom` is called against the payer). Invariants: the token is
  fixed at deployment; `runId` cannot be reused and is marked before transfers; per-payment
  and per-batch caps apply; any failed payment reverts the whole batch. A malicious-token
  reentrancy test covers the ordering invariant.
- **`src/PaymentVerifier.sol`** is a pure library ported from
  [Veridra](https://github.com/annatchijova/veridra)'s `PaymentAdjudicator.sol`. It
  compares a `Claim` with `Evidence` and returns `VERIFIED`, `NOT_VERIFIED`, or
  `INSUFFICIENT_EVIDENCE`. A failing check dominates the verdict; unasserted fields
  remain `ABSTAIN`. `ORDER_BINDING_CHECK` is mandatory: `PaymentExecuted` is always
  compared with the token's actual `Transfer` event.
- **`src/PaymentReceiptRegistry.sol`** publishes an idempotent, portable receipt at the
  `RPC_ATTESTED` assurance level. The stronger Merkle–Patricia proof ladder from Veridra
  is outside P0 scope.

The Foundry suite contains 41 tests, including fuzzing and the adversarial reentrancy
test. Run `forge test` from the repository root to reproduce it.

## MCP (`mcp_server.py`)

The complete tool specification, configuration, and limits are in [`docs/MCP.md`](docs/MCP.md).
The tool and pattern inventory is in [`docs/TOOLS.md`](docs/TOOLS.md).

- `get_business_policy`, `create_payment_proposal`, and `verify_payment` accept an
  optional `currency` parameter, defaulting to `ARGt`. Adding a currency is an entry in
  `CURRENCIES`; the rest of the file has no per-currency conditional logic.
- `VERTICE_POLICY_JSON` is currently one policy shared by all configured currencies.
  Different caps by country or supplier are not implemented.

## Red-team and MCP hardening

The complete adversarial audit and applied remediations are in
[`docs/SECURITY_AUDIT_MCP.md`](docs/SECURITY_AUDIT_MCP.md). Closed items include:

- binding `verify_payment` to the actual `eth_chainId`;
- requiring `MIN_CONFIRMATIONS` (12 by default, a bound rather than a proof of finality);
- rejecting ambiguous `(PaymentExecuted, Transfer)` pairs instead of selecting the last event;
- requiring the transaction to target the configured `PaymentBatch`;
- bounding input and RPC response sizes with limits such as `MAX_INVOICES`,
  `MAX_FIELD_LENGTH`, and `MAX_RPC_RESPONSE_BYTES`.

The process can run through `scripts/run_mcp_sandboxed.sh` using bubblewrap; it fails
closed when `bwrap` is unavailable.

**Open items:** the MCP does not provide operating-system isolation outside the optional
launcher (MCP-001), and invoice content reaches the agent as unstructured data without
an explicit untrusted-data marker (MCP-006). Neither issue adds a signing or fund
transfer tool to the MCP.

## Recipient typo detection

There are two independent implementations with different scopes:

- **`mcp_server.py` → `create_payment_proposal`** compares an unapproved recipient with
  the entire allowlist. If exactly one approved address differs by one or two characters,
  it returns `POSSIBLE_TYPO` with `typoSuggestion`, rather than silently correcting it.
  If multiple approved addresses are equally close, it makes no suggestion. The behavior
  is covered by `test_typo_in_recipient_is_suggested_not_auto_corrected` in
  `test_mcp_server.py`.
- **`ops/src/domain/preflight.ts` → `typoDiff`** compares the invoice address with the
  known `registeredAddress` for that specific supplier, using the invoice fixture.

Neither implementation changes an address automatically; both only flag a case for
human review.

## What not to promise

- Simultaneous payment to Brazil, Colombia, Mexico, and Bolivia is product direction,
  not a completed feature. Today, ARGt and BRAt have deployed contracts, while only
  ARGt has a real payment transaction.
- `VÉRTICE OPS` uses mock invoice fixtures, except for the live on-chain reads and the
  real wallet transaction signed by the PAY button.
- The `/ops/cierre` operational close is implemented: it produces per-currency and
  per-path totals, exports a real CSV, and generates a `mailto:` receipt link. It does
  not provide formal accounting or tax-book entries.
- `VÉRTICE PROOF` and `verify_payment` provide `RPC_ATTESTED` assurance: one RPC source
  is checked for internal consistency, but no independent cryptographic state proof is
  implemented. Do not call this “trustless verification.”

## Reproduce this document's state

```shell
forge test                                    # 41/41, contracts
python3 -m unittest test_mcp_server.py -v     # 4/4, MCP
```

To repeat the live ARGt verification, see [`docs/MCP.md`](docs/MCP.md) and pass the
transaction hash
`0x704fb8b5c104bf4e6f1b8f33140ca6079c53516741e0fe99d45b745c005cabfc` to
`verify_payment`.
