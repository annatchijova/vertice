import json
import unittest
from unittest.mock import patch

import mcp_server


TX_HASH = "0x" + "aa" * 32
SENDER = "0x" + "11" * 20
RECIPIENT = "0x" + "22" * 20
OTHER_RECIPIENT = "0x" + "55" * 20
RUN_ID = "0x" + "33" * 32
INVOICE_REF = "0x" + "44" * 32
OTHER_INVOICE_REF = "0x" + "66" * 32


def address_topic(address: str) -> str:
    return "0x" + "0" * 24 + address[2:]


def word(value: int) -> str:
    return "0x" + value.to_bytes(32, "big").hex()


def transfer(recipient: str, amount: int) -> dict:
    return {
        "address": mcp_server.ARGT_ADDRESS,
        "topics": [mcp_server.TRANSFER_TOPIC, address_topic(SENDER), address_topic(recipient)],
        "data": word(amount),
    }


def payment(run_id: str, invoice_ref: str, recipient: str, amount: int) -> dict:
    return {
        "address": mcp_server.PAYMENT_BATCH_ADDRESS,
        "topics": [mcp_server.PAYMENT_EXECUTED_TOPIC, run_id, invoice_ref, address_topic(recipient)],
        "data": word(amount),
    }


def receipt(logs: list[dict], block: int = 100) -> dict:
    return {
        "status": "0x1",
        "blockNumber": hex(block),
        "to": mcp_server.PAYMENT_BATCH_ADDRESS,
        "logs": logs,
    }


class McpSecurityTests(unittest.TestCase):
    def test_wrong_chain_abstains_before_reading_receipt(self):
        def rpc(method, _params):
            self.assertEqual(method, "eth_chainId")
            return "0x1"

        with patch.object(mcp_server, "_rpc", side_effect=rpc):
            result = mcp_server.verify_payment(TX_HASH, RECIPIENT, "500", INVOICE_REF, RUN_ID)
        self.assertEqual(result["verdict"], "INSUFFICIENT_EVIDENCE")

    def test_insufficient_confirmations_abstains(self):
        fake_receipt = receipt([transfer(RECIPIENT, 500), payment(RUN_ID, INVOICE_REF, RECIPIENT, 500)])

        def rpc(method, _params):
            return {"eth_chainId": "0xa4b1", "eth_blockNumber": "0x6e", "eth_getTransactionReceipt": fake_receipt}[method]

        with patch.object(mcp_server, "_rpc", side_effect=rpc), patch.object(mcp_server, "MIN_CONFIRMATIONS", 12):
            result = mcp_server.verify_payment(TX_HASH, RECIPIENT, "500", INVOICE_REF, RUN_ID)
        self.assertEqual(result["verdict"], "INSUFFICIENT_EVIDENCE")
        self.assertEqual(result["observedConfirmations"], 11)

    def test_multiple_payments_selects_claimed_pair(self):
        fake_receipt = receipt(
            [
                transfer(RECIPIENT, 500),
                payment(RUN_ID, INVOICE_REF, RECIPIENT, 500),
                transfer(OTHER_RECIPIENT, 700),
                payment(RUN_ID, OTHER_INVOICE_REF, OTHER_RECIPIENT, 700),
            ],
            block=100,
        )

        def rpc(method, _params):
            return {"eth_chainId": "0xa4b1", "eth_blockNumber": "0x200", "eth_getTransactionReceipt": fake_receipt}[method]

        with patch.object(mcp_server, "_rpc", side_effect=rpc), patch.object(mcp_server, "MIN_CONFIRMATIONS", 12):
            result = mcp_server.verify_payment(TX_HASH, RECIPIENT, "500", INVOICE_REF, RUN_ID)
        self.assertEqual(result["verdict"], "VERIFIED")

    def test_oversized_proposal_is_rejected(self):
        with patch.object(mcp_server, "MAX_INVOICES", 1):
            result = mcp_server.create_payment_proposal([{}, {}])
        self.assertFalse(result["ok"])

    def test_typo_in_recipient_is_suggested_not_auto_corrected(self):
        typo_recipient = RECIPIENT[:-1] + ("3" if RECIPIENT[-1] != "3" else "4")
        policy = json.dumps({
            "approvedRecipients": [RECIPIENT],
            "maxAmountPerPayment": "1000000000000000000000",
            "maxAmountPerBatch": "2000000000000000000000",
        })
        with patch.dict("os.environ", {"VERTICE_POLICY_JSON": policy}):
            result = mcp_server.create_payment_proposal(
                [{"invoiceId": "INV-1", "recipient": typo_recipient, "amount": "100000000000000000000"}]
            )
        self.assertEqual(result["accepted"], [])
        excluded = result["excluded"][0]
        self.assertIn("POSSIBLE_TYPO", excluded["reasons"])
        self.assertEqual(excluded["typoSuggestion"]["suggestedRecipient"], RECIPIENT)

    def test_unrelated_recipient_is_not_treated_as_typo(self):
        policy = json.dumps({
            "approvedRecipients": [RECIPIENT],
            "maxAmountPerPayment": "1000000000000000000000",
            "maxAmountPerBatch": "2000000000000000000000",
        })
        with patch.dict("os.environ", {"VERTICE_POLICY_JSON": policy}):
            result = mcp_server.create_payment_proposal(
                [{"invoiceId": "INV-1", "recipient": OTHER_RECIPIENT, "amount": "100000000000000000000"}]
            )
        excluded = result["excluded"][0]
        self.assertIn("RECIPIENT_NOT_APPROVED", excluded["reasons"])
        self.assertNotIn("typoSuggestion", excluded)


if __name__ == "__main__":
    unittest.main()
