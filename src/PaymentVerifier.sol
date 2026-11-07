// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title PaymentVerifier
/// @notice Deterministic comparison of a bounded payment claim against
///         independently re-derived ERC-20 transfer evidence. This library
///         does not fetch RPC data and does not authenticate the evidence
///         source — it only compares normalized facts the caller supplies.
/// @dev Ported from VÉRTICE's prior-art project Veridra
///      (github.com/annatchijova/veridra, `PaymentAdjudicator.sol`), which
///      verifies native-asset transfers on Monad. This version is adapted
///      for ERC-20 payments executed through a `PaymentBatch` contract:
///      - the native `sender`/`recipient`/`asset`/`amount` fields become an
///        ERC-20 `Transfer` log's `from`/`to`/token-contract/`value`;
///      - `runId` and `invoiceRef` are added as mandatory identity fields,
///        since a VÉRTICE claim is "this invoice was paid in this batch",
///        not just "this transaction moved value";
///      - `ORDER_BINDING_CHECK` is new and always evaluated (never ABSTAIN):
///        it cross-checks the `PaymentBatch` contract's own `PaymentExecuted`
///        event against the ERC-20 `Transfer` event, instead of trusting
///        either source alone. This directly applies a lesson from Veridra's
///        `fix: rederive payment facts before inclusion checks` commit — a
///        prior bug there trusted a claim-attached fact instead of
///        re-deriving it from the proven raw evidence. Here, the equivalent
///        mistake would be trusting `PaymentExecuted`'s recorded amount
///        without confirming the `Transfer` log actually moved that amount.
///        The offchain acquisition code is responsible for populating
///        `Evidence.transfer*` and `Evidence.paymentExecuted*` from two
///        independently read logs, not from one trusted source copied
///        twice.
/// @dev Amounts are exact unsigned integers in the token's base unit. No
///      floating point value enters the decision path.
library PaymentVerifier {
    enum CheckStatus {
        ABSTAIN,
        PASS,
        FAIL
    }

    enum Verdict {
        VERIFIED,
        NOT_VERIFIED,
        INSUFFICIENT_EVIDENCE
    }

    uint8 internal constant CHAIN_ID_CHECK = 0;
    uint8 internal constant TRANSACTION_HASH_CHECK = 1;
    uint8 internal constant EXECUTION_CHECK = 2;
    uint8 internal constant RUN_ID_CHECK = 3;
    uint8 internal constant INVOICE_REF_CHECK = 4;
    uint8 internal constant ORDER_BINDING_CHECK = 5;
    uint8 internal constant TOKEN_CHECK = 6;
    uint8 internal constant SENDER_CHECK = 7;
    uint8 internal constant RECIPIENT_CHECK = 8;
    uint8 internal constant AMOUNT_CHECK = 9;
    uint8 internal constant CHECK_COUNT = 10;

    /// @notice What the claimant asserts. `transactionHash`, `chainId`,
    /// `paymentBatchContract`, `runId`, and `invoiceRef` identify the claim
    /// and are always checked. The remaining fields are optional: a
    /// claimant may assert only what they actually know, and an unasserted
    /// field is ABSTAIN rather than a withheld VERIFIED.
    struct Claim {
        bytes32 transactionHash;
        uint256 chainId;
        address paymentBatchContract;
        bytes32 runId;
        bytes32 invoiceRef;
        bool assertsToken;
        address token;
        bool assertsSender;
        address sender;
        bool assertsRecipient;
        address recipient;
        bool assertsAmount;
        uint256 amount;
    }

    /// @notice Independently re-derived facts. `transfer*` fields come from
    /// the ERC-20 `Transfer` log; `paymentExecuted*` fields come from the
    /// `PaymentBatch` contract's own `PaymentExecuted` log for the same
    /// transaction. These must be read from two separate logs by the
    /// offchain acquisition code — never copied from one into the other.
    struct Evidence {
        bool available;
        bytes32 transactionHash;
        uint256 chainId;
        uint256 blockNumber;
        bytes32 blockHash;
        bool successful;
        address paymentBatchContract;
        bytes32 paymentExecutedRunId;
        bytes32 paymentExecutedInvoiceRef;
        address paymentExecutedRecipient;
        uint256 paymentExecutedAmount;
        address transferToken;
        address transferSender;
        address transferRecipient;
        uint256 transferAmount;
        bytes32 finalityPolicyId;
        uint64 requiredConfirmations;
        uint64 observedConfirmations;
    }

    struct Evaluation {
        Verdict verdict;
        CheckStatus[CHECK_COUNT] checks;
    }

    /// @notice Compare each proposition independently. A missing evidence
    /// acquisition, or evidence that has not reached the required
    /// confirmation depth, yields INSUFFICIENT_EVIDENCE before any field is
    /// compared. Once evidence is usable, any FAIL dominates to
    /// NOT_VERIFIED; unasserted optional fields stay ABSTAIN and do not
    /// block VERIFIED.
    function evaluate(Claim memory claim, Evidence memory evidence, uint256 expectedChainId)
        internal
        pure
        returns (Evaluation memory result)
    {
        if (
            !evidence.available || evidence.finalityPolicyId == bytes32(0) || evidence.requiredConfirmations == 0
                || evidence.observedConfirmations < evidence.requiredConfirmations
        ) {
            result.verdict = Verdict.INSUFFICIENT_EVIDENCE;
            return result;
        }

        result.checks[CHAIN_ID_CHECK] = _same(claim.chainId == expectedChainId && evidence.chainId == expectedChainId);
        result.checks[TRANSACTION_HASH_CHECK] = _same(claim.transactionHash == evidence.transactionHash);
        result.checks[EXECUTION_CHECK] = _same(evidence.successful);
        result.checks[RUN_ID_CHECK] = _same(
            claim.paymentBatchContract == evidence.paymentBatchContract && claim.runId == evidence.paymentExecutedRunId
        );
        result.checks[INVOICE_REF_CHECK] = _same(claim.invoiceRef == evidence.paymentExecutedInvoiceRef);

        // Always evaluated, never ABSTAIN: the PaymentBatch contract's own
        // bookkeeping must agree with the independently read ERC-20
        // Transfer log for the same transaction. A mismatch here means the
        // contract's event lied about what actually moved — never treat
        // PaymentExecuted alone as proof of payment.
        result.checks[ORDER_BINDING_CHECK] = _same(
            evidence.paymentExecutedRecipient == evidence.transferRecipient
                && evidence.paymentExecutedAmount == evidence.transferAmount
        );

        result.checks[TOKEN_CHECK] =
            claim.assertsToken ? _same(claim.token == evidence.transferToken) : CheckStatus.ABSTAIN;
        result.checks[SENDER_CHECK] =
            claim.assertsSender ? _same(claim.sender == evidence.transferSender) : CheckStatus.ABSTAIN;
        result.checks[RECIPIENT_CHECK] =
            claim.assertsRecipient ? _same(claim.recipient == evidence.transferRecipient) : CheckStatus.ABSTAIN;
        result.checks[AMOUNT_CHECK] =
            claim.assertsAmount ? _same(claim.amount == evidence.transferAmount) : CheckStatus.ABSTAIN;

        for (uint256 i; i < CHECK_COUNT; ++i) {
            if (result.checks[i] == CheckStatus.FAIL) {
                result.verdict = Verdict.NOT_VERIFIED;
                return result;
            }
        }
        result.verdict = Verdict.VERIFIED;
    }

    function _same(bool matches) private pure returns (CheckStatus) {
        return matches ? CheckStatus.PASS : CheckStatus.FAIL;
    }
}
