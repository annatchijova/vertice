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
MIN_CONFIRMATIONS = int(os.environ.get("VERTICE_MIN_CONFIRMATIONS", "12"))
MAX_RPC_RESPONSE_BYTES = 2_000_000
MAX_POLICY_BYTES = 64_000
MAX_INVOICE_FILE_BYTES = 1_000_000
MAX_INVOICES = 500
MAX_FIELD_LENGTH = 256
MAX_UINT256_DECIMAL_DIGITS = 78
ARGT_ADDRESS = os.environ.get(
    "ARGT_ADDRESS", "0x59863989d080b22476db95656d0c3cc18be92214"
).lower()
PAYMENT_BATCH_ADDRESS = os.environ.get(
    "PAYMENT_BATCH_ADDRESS", "0x21bf9822877502ea7e5c2f973c0e335174763965"
).lower()
RECEIPT_REGISTRY_ADDRESS = os.environ.get(
    "PAYMENT_RECEIPT_REGISTRY_ADDRESS", "0xc07e0a1854676aaa05f769d6f21db89f9b9487d9"
).lower()

ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
HASH_RE = re.compile(r"^0x[a-fA-F0-9]{64}$")
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
PAYMENT_EXECUTED_TOPIC = "0xfa59547ec40fa46063982f8fc7bc22012824f80185f15b2aec111c6b2fb7bf81"


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
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            raw_body = response.read(MAX_RPC_RESPONSE_BYTES + 1)
            if len(raw_body) > MAX_RPC_RESPONSE_BYTES:
                raise RuntimeError("RPC response exceeds the size limit")
            body = json.loads(raw_body.decode("utf-8"))
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
    return _require_hash(topic, "bytes32 topic")


def _load_policy() -> dict[str, Any]:
    raw = os.environ.get("VERTICE_POLICY_JSON", "")
    if len(raw.encode("utf-8")) > MAX_POLICY_BYTES:
        raise ValueError("VERTICE_POLICY_JSON exceeds the size limit")
    if not raw:
        return {
            "chainId": CHAIN_ID,
            "token": ARGT_ADDRESS,
            "paymentBatch": PAYMENT_BATCH_ADDRESS,
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
    policy["chainId"] = int(policy.get("chainId", CHAIN_ID))
    policy["token"] = _require_address(policy.get("token", ARGT_ADDRESS), "policy.token")
    policy["paymentBatch"] = _require_address(
        policy.get("paymentBatch", PAYMENT_BATCH_ADDRESS), "policy.paymentBatch"
    )
    recipients = policy.get("approvedRecipients", [])
    if not isinstance(recipients, list):
        raise ValueError("policy.approvedRecipients must be an array")
    if len(recipients) > MAX_INVOICES:
        raise ValueError("policy.approvedRecipients exceeds the size limit")
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
def get_business_policy() -> dict[str, Any]:
    """Return the bounded policy used for proposal preparation, never secrets."""
    try:
        return {"ok": True, "policy": _load_policy()}
    except (ValueError, json.JSONDecodeError) as exc:
        return _error("invalid_policy", str(exc))


@mcp.tool()
def get_token_config() -> dict[str, Any]:
    """Return the fixed ARGt/Arbitrum configuration."""
    return {
        "ok": True,
        "chainId": CHAIN_ID,
        "token": ARGT_ADDRESS,
        "symbol": "ARGt",
        "decimals": 18,
        "paymentBatch": PAYMENT_BATCH_ADDRESS,
        "receiptRegistry": RECEIPT_REGISTRY_ADDRESS,
    }


@mcp.tool()
def read_payment_status(transaction_hash: str) -> dict[str, Any]:
    """Read a real transaction receipt; never treats a missing receipt as success."""
    try:
        tx_hash = _require_hash(transaction_hash)
        chain_id = _quantity(_rpc("eth_chainId", []), "chainId")
        if chain_id != CHAIN_ID:
            return {"ok": True, "available": False, "transactionHash": tx_hash, "status": "WRONG_CHAIN", "chainId": chain_id}
        receipt = _rpc("eth_getTransactionReceipt", [tx_hash])
        if receipt is None:
            return {"ok": True, "available": False, "transactionHash": tx_hash, "status": "PENDING_OR_NOT_FOUND"}
        return {
            "ok": True,
            "available": True,
            "transactionHash": tx_hash,
            "chainId": chain_id,
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
) -> dict[str, Any]:
    """Verify ARGt Transfer and PaymentExecuted evidence from one real receipt.

    Returns VERIFIED, NOT_VERIFIED, or INSUFFICIENT_EVIDENCE. The function is
    read-only and derives facts from RPC logs rather than trusting a claim.
    Amount and identifiers use raw 18-decimal/base-unit representations.
    """
    try:
        tx_hash = _require_hash(transaction_hash)
        expected_recipient = _require_address(recipient, "recipient")
        if (
            not isinstance(amount, str)
            or len(amount) > MAX_UINT256_DECIMAL_DIGITS
            or not amount.isdigit()
            or int(amount) <= 0
        ):
            raise ValueError("amount must be a positive integer string in base units")
        expected_amount = int(amount)
        expected_invoice = _bytes32_topic(invoice_ref)
        expected_run = _bytes32_topic(run_id)
        chain_id = _quantity(_rpc("eth_chainId", []), "chainId")
        if chain_id != CHAIN_ID:
            return {
                "ok": True,
                "verdict": "INSUFFICIENT_EVIDENCE",
                "reason": "RPC is not Arbitrum",
                "chainId": chain_id,
            }
        latest_block = _quantity(_rpc("eth_blockNumber", []), "blockNumber")
        receipt = _rpc("eth_getTransactionReceipt", [tx_hash])
        if receipt is None:
            return {"ok": True, "verdict": "INSUFFICIENT_EVIDENCE", "reason": "receipt unavailable"}
        if _quantity(receipt.get("status", "0x0"), "status") != 1:
            return {"ok": True, "verdict": "NOT_VERIFIED", "reason": "transaction reverted"}
        receipt_block = _quantity(receipt["blockNumber"], "blockNumber")
        if latest_block < receipt_block:
            return {"ok": True, "verdict": "INSUFFICIENT_EVIDENCE", "reason": "receipt is ahead of the RPC head"}
        observed_confirmations = latest_block - receipt_block + 1
        if observed_confirmations < MIN_CONFIRMATIONS:
            return {
                "ok": True,
                "verdict": "INSUFFICIENT_EVIDENCE",
                "reason": "required confirmations not reached",
                "requiredConfirmations": MIN_CONFIRMATIONS,
                "observedConfirmations": observed_confirmations,
            }
        if str(receipt.get("to", "")).lower() != PAYMENT_BATCH_ADDRESS:
            return {"ok": True, "verdict": "NOT_VERIFIED", "reason": "transaction target is not PaymentBatch"}

        transfers: list[dict[str, Any]] = []
        payments: list[dict[str, Any]] = []
        for log in receipt.get("logs", []):
            topics = log.get("topics", [])
            address = str(log.get("address", "")).lower()
            if topics and topics[0].lower() == TRANSFER_TOPIC and address == ARGT_ADDRESS and len(topics) == 3:
                transfers.append({
                    "token": address,
                    "sender": _word_address(topics[1]),
                    "recipient": _word_address(topics[2]),
                    "amount": _word_uint(log.get("data", "")),
                })
            if (
                topics
                and topics[0].lower() == PAYMENT_EXECUTED_TOPIC
                and address == PAYMENT_BATCH_ADDRESS
                and len(topics) == 4
            ):
                payments.append({
                    "runId": topics[1].lower(),
                    "invoiceRef": topics[2].lower(),
                    "recipient": _word_address(topics[3]),
                    "amount": _word_uint(log.get("data", "")),
                })

        matching_payments = [
            item
            for item in payments
            if item["runId"] == expected_run
            and item["invoiceRef"] == expected_invoice
            and item["recipient"] == expected_recipient
            and item["amount"] == expected_amount
        ]
        matching_transfers = [
            item
            for item in transfers
            if item["recipient"] == expected_recipient and item["amount"] == expected_amount
        ]
        if len(matching_payments) != 1 or len(matching_transfers) != 1:
            return {
                "ok": True,
                "verdict": "INSUFFICIENT_EVIDENCE",
                "reason": "payment evidence is missing or ambiguous",
                "transferMatches": len(matching_transfers),
                "paymentExecutedMatches": len(matching_payments),
            }
        transfer = matching_transfers[0]
        payment = matching_payments[0]

        checks = {
            "transactionSucceeded": True,
            "token": transfer["token"] == ARGT_ADDRESS,
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
            "chainId": chain_id,
            "requiredConfirmations": MIN_CONFIRMATIONS,
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
        if path.stat().st_size > MAX_INVOICE_FILE_BYTES:
            return _error("invalid_invoices", "invoice fixture exceeds the byte limit", path=str(path))
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            return _error("invalid_invoices", "invoice fixture must be a JSON array")
        if len(data) > MAX_INVOICES:
            return _error("invalid_invoices", "invoice fixture exceeds the item limit")
        return {"ok": True, "available": True, "path": str(path), "invoices": data}
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        return _error("invalid_invoices", str(exc), path=str(path))


@mcp.tool()
def create_payment_proposal(invoices: list[dict[str, Any]]) -> dict[str, Any]:
    """Prepare a deterministic proposal without signing or submitting anything."""
    try:
        if not isinstance(invoices, list) or len(invoices) > MAX_INVOICES:
            return _error("proposal_failed", "invoices must be an array within the item limit")
        policy = _load_policy()
        approved = set(policy.get("approvedRecipients", []))
        per_payment_cap = int(policy["maxAmountPerPayment"])
        batch_cap = int(policy["maxAmountPerBatch"])
        seen: set[str] = set()
        accepted: list[dict[str, Any]] = []
        excluded: list[dict[str, Any]] = []
        total = 0
        for invoice in invoices:
            if not isinstance(invoice, dict):
                return _error("proposal_failed", "each invoice must be an object")
            invoice_id = str(invoice.get("invoiceId", ""))
            recipient = str(invoice.get("recipient", "")).lower()
            raw_amount = str(invoice.get("amount", ""))
            if len(invoice_id) > MAX_FIELD_LENGTH or len(recipient) > MAX_FIELD_LENGTH:
                return _error("proposal_failed", "invoice field exceeds the length limit")
            if len(raw_amount) > MAX_UINT256_DECIMAL_DIGITS:
                return _error("proposal_failed", "amount exceeds uint256 decimal length")
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
