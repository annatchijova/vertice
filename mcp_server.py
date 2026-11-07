"""VÉRTICE read-only MCP surface.

This server exposes policy preparation and Arbitrum receipt verification to an
agent. It deliberately has no wallet, private-key, signing, approve, deploy,
or transaction-submission capability. The blockchain is the source of truth for
receipt verification; external invoice data remains untrusted input.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP


mcp = FastMCP("vertice-readonly")

RPC_URL = os.environ.get("ARBITRUM_RPC_URL", "https://arb1.arbitrum.io/rpc")
CHAIN_ID = 42161

# Each Twin Stablecoin gets its own PaymentBatch deployment (the contract's
# token address is fixed at construction) but can share one
# PaymentReceiptRegistry, since a Claim already names its paymentBatchContract
# explicitly. Env var names keep the original ARGT_*/PAYMENT_* names for
# ARGt so existing deployments/configuration are not broken by this change.
DEFAULT_CURRENCY = "ARGt"
CURRENCIES: dict[str, dict[str, str]] = {
    "ARGt": {
        "token": os.environ.get(
            "ARGT_ADDRESS", "0x59863989d080b22476db95656d0c3cc18be92214"
        ).lower(),
        "paymentBatch": os.environ.get(
            "PAYMENT_BATCH_ADDRESS", "0x21bf9822877502ea7e5c2f973c0e335174763965"
        ).lower(),
        "receiptRegistry": os.environ.get(
            "PAYMENT_RECEIPT_REGISTRY_ADDRESS",
            "0xc07e0a1854676aaa05f769d6f21db89f9b9487d9",
        ).lower(),
    },
    "BRAt": {
        "token": os.environ.get(
            "BRAT_ADDRESS", "0xc4ed6aba5373d78e160f4df39e011f078be54df8"
        ).lower(),
        "paymentBatch": os.environ.get(
            "BRAT_PAYMENT_BATCH_ADDRESS", "0xb6653422431c5419df650d38d3b90c29f3a947ca"
        ).lower(),
        "receiptRegistry": os.environ.get(
            "BRAT_PAYMENT_RECEIPT_REGISTRY_ADDRESS",
            "0xe7271fbcc7f22a21485331d4581f6a8c7f6745c7",
        ).lower(),
    },
}


def _currency(symbol: str) -> dict[str, str]:
    entry = CURRENCIES.get(symbol)
    if entry is None:
        raise ValueError(f"unknown currency {symbol!r}; configured: {sorted(CURRENCIES)}")
    return entry

ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
HASH_RE = re.compile(r"^0x[a-fA-F0-9]{64}$")
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
PAYMENT_EXECUTED_TOPIC = "0xfa59547ec40fa46063982f8fc7bc22012824f80185f15b2aec111c6b2fb7bf81"

# Bound, not proof: Arbitrum has fast soft confirmation but is not instantly
# final. This mirrors web/src/chain.ts's REQUIRED_CONFIRMATIONS.
REQUIRED_CONFIRMATIONS = 1


def _error(code: str, message: str, **extra: Any) -> dict[str, Any]:
    return {"ok": False, "error": code, "message": message, **extra}


def _require_hash(value: str, name: str = "transaction_hash") -> str:
    if not isinstance(value, str) or not HASH_RE.fullmatch(value):
        raise ValueError(f"{name} must be a 32-byte 0x-prefixed hash")
    return value.lower()


def _require_address(value: str, name: str = "address") -> str:
    if not isinstance(value, str) or not ADDRESS_RE.fullmatch(value):
        raise ValueError(f"{name} must be a 20-byte 0x-prefixed address")
    return value.lower()


def _quantity(value: str, name: str) -> int:
    if not isinstance(value, str) or not value.startswith("0x"):
        raise ValueError(f"RPC field {name} is not a hex quantity")
    return int(value, 16)


def _rpc(method: str, params: list[Any]) -> Any:
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    request = urllib.request.Request(
        RPC_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            # Arbitrum's public RPC sits behind Cloudflare, which returns a
            # bare 403 (error code 1010) for urllib's default User-Agent
            # ("Python-urllib/3.x"). Confirmed empirically: identical request
            # succeeds with curl and with any ordinary browser-shaped UA.
            "User-Agent": "Mozilla/5.0 (compatible; VerticeMCP/1.0)",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            body = json.loads(response.read().decode("utf-8"))
    except (OSError, urllib.error.URLError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"RPC unavailable: {exc}") from exc
    if body.get("error"):
        raise RuntimeError(f"RPC error: {body['error']}")
    return body.get("result")


def _word_address(topic: str) -> str:
    if not isinstance(topic, str) or len(topic) != 66:
        raise ValueError("indexed address topic is malformed")
    return "0x" + topic[-40:].lower()


def _word_uint(data: str) -> int:
    if not isinstance(data, str) or len(data) < 66:
        raise ValueError("event data does not contain a 32-byte word")
    return int(data[2:66], 16)


def _bytes32_topic(topic: str) -> str:
    if not isinstance(topic, str) or len(topic) != 66:
        raise ValueError("bytes32 topic is malformed")
    return topic.lower()


def _load_policy(currency: str = DEFAULT_CURRENCY) -> dict[str, Any]:
    entry = _currency(currency)
    raw = os.environ.get("VERTICE_POLICY_JSON", "")
    if not raw:
        return {
            "currency": currency,
            "chainId": CHAIN_ID,
            "token": entry["token"],
            "paymentBatch": entry["paymentBatch"],
            "decimals": 18,
            "maxAmountPerPayment": os.environ.get("MAX_AMOUNT_PER_PAYMENT", "10000000000000000000000"),
            "maxAmountPerBatch": os.environ.get("MAX_AMOUNT_PER_BATCH", "50000000000000000000000"),
            "approvedRecipients": [],
            "automaticExecutionThreshold": "0",
            "approvalRequiredAbove": "0",
        }
    policy = json.loads(raw)
    if not isinstance(policy, dict):
        raise ValueError("VERTICE_POLICY_JSON must contain an object")
    policy["currency"] = currency
    policy["chainId"] = int(policy.get("chainId", CHAIN_ID))
    policy["token"] = _require_address(policy.get("token", entry["token"]), "policy.token")
    policy["paymentBatch"] = _require_address(
        policy.get("paymentBatch", entry["paymentBatch"]), "policy.paymentBatch"
    )
    recipients = policy.get("approvedRecipients", [])
    if not isinstance(recipients, list):
        raise ValueError("policy.approvedRecipients must be an array")
    policy["approvedRecipients"] = [_require_address(item, "approved recipient") for item in recipients]
    return policy


@mcp.tool()
def get_chain_status() -> dict[str, Any]:
    """Read Arbitrum chain ID and latest block from the configured RPC."""
    try:
        chain_id = _quantity(_rpc("eth_chainId", []), "chainId")
        block_number = _quantity(_rpc("eth_blockNumber", []), "blockNumber")
        return {"ok": True, "chainId": chain_id, "blockNumber": block_number, "rpcUrl": RPC_URL}
    except (RuntimeError, ValueError) as exc:
        return _error("rpc_unavailable", str(exc), rpcUrl=RPC_URL)


@mcp.tool()
def get_business_policy(currency: str = DEFAULT_CURRENCY) -> dict[str, Any]:
    """Return the bounded policy used for proposal preparation, never secrets.

    `currency` selects which Twin Stablecoin's token/PaymentBatch pair to
    report (e.g. "ARGt", "BRAt"); see get_token_config for what is
    configured. Caps and approved recipients come from the same
    VERTICE_POLICY_JSON for every currency in this version.
    """
    try:
        return {"ok": True, "policy": _load_policy(currency)}
    except (ValueError, json.JSONDecodeError) as exc:
        return _error("invalid_policy", str(exc))


@mcp.tool()
def get_token_config() -> dict[str, Any]:
    """Return the fixed Arbitrum configuration for every configured Twin
    Stablecoin: token, PaymentBatch, and PaymentReceiptRegistry addresses.
    Each currency has its own PaymentBatch deployment (its token address is
    fixed at construction); a currency's PaymentReceiptRegistry may be
    shared with another currency since a Claim already names its own
    paymentBatchContract.
    """
    return {
        "ok": True,
        "chainId": CHAIN_ID,
        "decimals": 18,
        "currencies": {
            symbol: {
                "token": entry["token"],
                "paymentBatch": entry["paymentBatch"],
                "receiptRegistry": entry["receiptRegistry"],
            }
            for symbol, entry in CURRENCIES.items()
        },
    }


@mcp.tool()
def read_payment_status(transaction_hash: str) -> dict[str, Any]:
    """Read a real transaction receipt; never treats a missing receipt as success."""
    try:
        tx_hash = _require_hash(transaction_hash)
        receipt = _rpc("eth_getTransactionReceipt", [tx_hash])
        if receipt is None:
            return {"ok": True, "available": False, "transactionHash": tx_hash, "status": "PENDING_OR_NOT_FOUND"}
        return {
            "ok": True,
            "available": True,
            "transactionHash": tx_hash,
            "status": "SUCCESS" if _quantity(receipt["status"], "status") == 1 else "REVERTED",
            "blockNumber": _quantity(receipt["blockNumber"], "blockNumber"),
            "from": receipt.get("from"),
            "to": receipt.get("to"),
            "contractAddress": receipt.get("contractAddress"),
            "gasUsed": _quantity(receipt["gasUsed"], "gasUsed"),
            "logCount": len(receipt.get("logs", [])),
        }
    except (RuntimeError, ValueError, KeyError, TypeError) as exc:
        return _error("invalid_receipt", str(exc))


@mcp.tool()
def verify_payment(
    transaction_hash: str,
    recipient: str,
    amount: str,
    invoice_ref: str,
    run_id: str,
    currency: str = DEFAULT_CURRENCY,
) -> dict[str, Any]:
    """Verify Transfer and PaymentExecuted evidence from one real receipt.

    Returns VERIFIED, NOT_VERIFIED, or INSUFFICIENT_EVIDENCE. The function is
    read-only and derives facts from RPC logs rather than trusting a claim.
    Amount and identifiers use raw 18-decimal/base-unit representations.
    `currency` selects which Twin Stablecoin/PaymentBatch pair to check the
    receipt against (e.g. "ARGt", "BRAt") — see get_token_config.

    Binds the connected RPC to the configured chain and requires
    REQUIRED_CONFIRMATIONS before trusting a receipt (a bound, not a proof,
    of finality). When a transaction's logs contain more than one candidate
    PaymentExecuted or Transfer (a multi-payment batch), this selects only
    the pair whose (runId, invoiceRef) matches the claim and whose Transfer
    agrees with that specific PaymentExecuted's recipient/amount — it never
    silently keeps "the last match".
    """
    try:
        entry = _currency(currency)
        token_address = entry["token"]
        payment_batch_address = entry["paymentBatch"]
        tx_hash = _require_hash(transaction_hash)
        expected_recipient = _require_address(recipient, "recipient")
        if not isinstance(amount, str) or not amount.isdigit() or int(amount) <= 0:
            raise ValueError("amount must be a positive integer string in base units")
        expected_amount = int(amount)
        expected_invoice = _bytes32_topic(invoice_ref)
        expected_run = _bytes32_topic(run_id)

        rpc_chain_id = _quantity(_rpc("eth_chainId", []), "chainId")
        if rpc_chain_id != CHAIN_ID:
            return {
                "ok": True,
                "verdict": "INSUFFICIENT_EVIDENCE",
                "reason": f"connected RPC reports chain {rpc_chain_id}, expected {CHAIN_ID}",
            }

        receipt = _rpc("eth_getTransactionReceipt", [tx_hash])
        if receipt is None:
            return {"ok": True, "verdict": "INSUFFICIENT_EVIDENCE", "reason": "receipt unavailable"}
        if _quantity(receipt.get("status", "0x0"), "status") != 1:
            return {"ok": True, "verdict": "NOT_VERIFIED", "reason": "transaction reverted"}

        receipt_block = _quantity(receipt["blockNumber"], "receipt.blockNumber")
        head_block = _quantity(_rpc("eth_blockNumber", []), "headBlockNumber")
        observed_confirmations = head_block - receipt_block + 1
        if observed_confirmations < REQUIRED_CONFIRMATIONS:
            return {
                "ok": True,
                "verdict": "INSUFFICIENT_EVIDENCE",
                "reason": "below required confirmation depth",
                "observedConfirmations": observed_confirmations,
                "requiredConfirmations": REQUIRED_CONFIRMATIONS,
            }

        transfers: list[dict[str, Any]] = []
        payments: list[dict[str, Any]] = []
        for log in receipt.get("logs", []):
            topics = log.get("topics", [])
            address = str(log.get("address", "")).lower()
            if topics and topics[0].lower() == TRANSFER_TOPIC and address == token_address and len(topics) == 3:
                transfers.append({
                    "token": address,
                    "sender": _word_address(topics[1]),
                    "recipient": _word_address(topics[2]),
                    "amount": _word_uint(log.get("data", "")),
                })
            if (
                topics
                and topics[0].lower() == PAYMENT_EXECUTED_TOPIC
                and address == payment_batch_address
                and len(topics) == 4
            ):
                payments.append({
                    "runId": topics[1].lower(),
                    "invoiceRef": topics[2].lower(),
                    "recipient": _word_address(topics[3]),
                    "amount": _word_uint(log.get("data", "")),
                })

        matching_payments = [p for p in payments if p["runId"] == expected_run and p["invoiceRef"] == expected_invoice]
        if len(matching_payments) != 1:
            return {
                "ok": True,
                "verdict": "INSUFFICIENT_EVIDENCE",
                "reason": "expected exactly one PaymentExecuted log matching (runId, invoiceRef)",
                "matchingPaymentExecutedCount": len(matching_payments),
            }
        payment = matching_payments[0]

        matching_transfers = [
            t for t in transfers if t["recipient"] == payment["recipient"] and t["amount"] == payment["amount"]
        ]
        if len(matching_transfers) != 1:
            return {
                "ok": True,
                "verdict": "INSUFFICIENT_EVIDENCE",
                "reason": "expected exactly one ARGt Transfer matching the PaymentExecuted recipient/amount",
                "matchingTransferCount": len(matching_transfers),
            }
        transfer = matching_transfers[0]

        checks = {
            "transactionSucceeded": True,
            "chainId": rpc_chain_id == CHAIN_ID,
            "confirmations": observed_confirmations >= REQUIRED_CONFIRMATIONS,
            "token": transfer["token"] == token_address,
            "runId": payment["runId"] == expected_run,
            "invoiceRef": payment["invoiceRef"] == expected_invoice,
            "recipient": transfer["recipient"] == expected_recipient and payment["recipient"] == expected_recipient,
            "amount": transfer["amount"] == expected_amount and payment["amount"] == expected_amount,
            "orderBinding": transfer["recipient"] == payment["recipient"] and transfer["amount"] == payment["amount"],
        }
        verdict = "VERIFIED" if all(checks.values()) else "NOT_VERIFIED"
        return {
            "ok": True,
            "verdict": verdict,
            "transactionHash": tx_hash,
            "chainId": CHAIN_ID,
            "observedConfirmations": observed_confirmations,
            "checks": checks,
            "transfer": transfer,
            "paymentExecuted": payment,
        }
    except (RuntimeError, ValueError, KeyError, TypeError) as exc:
        return _error("verification_failed", str(exc))


@mcp.tool()
def list_invoices() -> dict[str, Any]:
    """Read optional local invoice fixtures; missing data is explicit, never a pass."""
    path_value = os.environ.get("VERTICE_INVOICES_PATH")
    if not path_value:
        return {"ok": True, "available": False, "invoices": [], "reason": "VERTICE_INVOICES_PATH is not configured"}
    path = Path(path_value).expanduser()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            return _error("invalid_invoices", "invoice fixture must be a JSON array")
        return {"ok": True, "available": True, "path": str(path), "invoices": data}
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        return _error("invalid_invoices", str(exc), path=str(path))


@mcp.tool()
def create_payment_proposal(
    invoices: list[dict[str, Any]], currency: str = DEFAULT_CURRENCY
) -> dict[str, Any]:
    """Prepare a deterministic proposal without signing or submitting anything.

    `currency` selects which Twin Stablecoin's policy (token, PaymentBatch,
    caps, approved recipients) to apply — see get_business_policy.
    """
    try:
        policy = _load_policy(currency)
        approved = set(policy.get("approvedRecipients", []))
        per_payment_cap = int(policy["maxAmountPerPayment"])
        batch_cap = int(policy["maxAmountPerBatch"])
        seen: set[str] = set()
        accepted: list[dict[str, Any]] = []
        excluded: list[dict[str, Any]] = []
        total = 0
        for invoice in invoices:
            invoice_id = str(invoice.get("invoiceId", ""))
            recipient = str(invoice.get("recipient", "")).lower()
            raw_amount = str(invoice.get("amount", ""))
            reasons: list[str] = []
            if not invoice_id:
                reasons.append("MISSING_INVOICE_ID")
            if invoice_id in seen:
                reasons.append("POSSIBLE_DUPLICATE")
            seen.add(invoice_id)
            if not ADDRESS_RE.fullmatch(recipient) or recipient not in approved:
                reasons.append("RECIPIENT_NOT_APPROVED")
            if not raw_amount.isdigit() or int(raw_amount) <= 0:
                reasons.append("INVALID_AMOUNT")
            amount = int(raw_amount) if raw_amount.isdigit() else 0
            if amount > per_payment_cap:
                reasons.append("EXCEEDS_PER_PAYMENT_CAP")
            if total + amount > batch_cap:
                reasons.append("EXCEEDS_BATCH_CAP")
            item = {"invoiceId": invoice_id, "recipient": recipient, "amount": raw_amount}
            if reasons:
                excluded.append({**item, "action": "EXCLUDED", "reasons": reasons})
            else:
                accepted.append({**item, "action": "READY"})
                total += amount
        return {
            "ok": True,
            "chainId": policy["chainId"],
            "token": policy["token"],
            "accepted": accepted,
            "excluded": excluded,
            "totalAmount": str(total),
            "execution": "NO_TRANSACTION_SUBMITTED",
        }
    except (ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
        return _error("proposal_failed", str(exc))


if __name__ == "__main__":
    mcp.run()
