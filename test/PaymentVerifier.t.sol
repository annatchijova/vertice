// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PaymentVerifier} from "../src/PaymentVerifier.sol";

contract PaymentVerifierTest is Test {
    uint256 constant CHAIN_ID = 42161;
    address constant BATCH = address(0xBA7C4);
    bytes32 constant RUN_ID = keccak256("run-1");
    bytes32 constant INVOICE_REF = keccak256("INV-001");

    function _claim() internal pure returns (PaymentVerifier.Claim memory) {
        return PaymentVerifier.Claim({
            transactionHash: keccak256("tx-1"),
            chainId: CHAIN_ID,
            paymentBatchContract: BATCH,
            runId: RUN_ID,
            invoiceRef: INVOICE_REF,
            assertsToken: false,
            token: address(0),
            assertsSender: false,
            sender: address(0),
            assertsRecipient: false,
            recipient: address(0),
            assertsAmount: false,
            amount: 0
        });
    }

    function _availableEvidence(bytes32 transactionHash) internal pure returns (PaymentVerifier.Evidence memory) {
        return PaymentVerifier.Evidence({
            available: true,
            transactionHash: transactionHash,
            chainId: CHAIN_ID,
            blockNumber: 100,
            blockHash: keccak256("block-100"),
            successful: true,
            paymentBatchContract: BATCH,
            paymentExecutedRunId: RUN_ID,
            paymentExecutedInvoiceRef: INVOICE_REF,
            paymentExecutedRecipient: address(0xB0B),
            paymentExecutedAmount: 500e18,
            transferToken: address(0xA59),
            transferSender: address(0xA11CE),
            transferRecipient: address(0xB0B),
            transferAmount: 500e18,
            finalityPolicyId: keccak256("finality-v1"),
            requiredConfirmations: 1,
            observedConfirmations: 1
        });
    }

    // --- evidence availability dominates ------------------------------------

    function test_unavailableEvidenceYieldsInsufficient() public pure {
        PaymentVerifier.Claim memory claim = _claim();
        PaymentVerifier.Evidence memory evidence = _availableEvidence(claim.transactionHash);
        evidence.available = false;

        PaymentVerifier.Evaluation memory result = PaymentVerifier.evaluate(claim, evidence, CHAIN_ID);

        assertEq(uint8(result.verdict), uint8(PaymentVerifier.Verdict.INSUFFICIENT_EVIDENCE));
    }

    function test_missingFinalityPolicyYieldsInsufficient() public pure {
        PaymentVerifier.Claim memory claim = _claim();
        PaymentVerifier.Evidence memory evidence = _availableEvidence(claim.transactionHash);
        evidence.finalityPolicyId = bytes32(0);

        PaymentVerifier.Evaluation memory result = PaymentVerifier.evaluate(claim, evidence, CHAIN_ID);

        assertEq(uint8(result.verdict), uint8(PaymentVerifier.Verdict.INSUFFICIENT_EVIDENCE));
    }

    function test_belowRequiredConfirmationsYieldsInsufficient() public pure {
        PaymentVerifier.Claim memory claim = _claim();
        PaymentVerifier.Evidence memory evidence = _availableEvidence(claim.transactionHash);
        evidence.requiredConfirmations = 5;
        evidence.observedConfirmations = 4;

        PaymentVerifier.Evaluation memory result = PaymentVerifier.evaluate(claim, evidence, CHAIN_ID);

        assertEq(uint8(result.verdict), uint8(PaymentVerifier.Verdict.INSUFFICIENT_EVIDENCE));
    }

    // --- happy path and ABSTAIN discipline ----------------------------------

    function test_unassertedFieldsAbstainAndStillVerify() public pure {
        PaymentVerifier.Claim memory claim = _claim();
        PaymentVerifier.Evidence memory evidence = _availableEvidence(claim.transactionHash);

        PaymentVerifier.Evaluation memory result = PaymentVerifier.evaluate(claim, evidence, CHAIN_ID);

        assertEq(uint8(result.verdict), uint8(PaymentVerifier.Verdict.VERIFIED));
        assertEq(uint8(result.checks[PaymentVerifier.TOKEN_CHECK]), uint8(PaymentVerifier.CheckStatus.ABSTAIN));
        assertEq(uint8(result.checks[PaymentVerifier.SENDER_CHECK]), uint8(PaymentVerifier.CheckStatus.ABSTAIN));
        assertEq(uint8(result.checks[PaymentVerifier.RECIPIENT_CHECK]), uint8(PaymentVerifier.CheckStatus.ABSTAIN));
        assertEq(uint8(result.checks[PaymentVerifier.AMOUNT_CHECK]), uint8(PaymentVerifier.CheckStatus.ABSTAIN));
        // runId / invoiceRef / orderBinding are never optional.
        assertEq(uint8(result.checks[PaymentVerifier.RUN_ID_CHECK]), uint8(PaymentVerifier.CheckStatus.PASS));
        assertEq(uint8(result.checks[PaymentVerifier.INVOICE_REF_CHECK]), uint8(PaymentVerifier.CheckStatus.PASS));
        assertEq(uint8(result.checks[PaymentVerifier.ORDER_BINDING_CHECK]), uint8(PaymentVerifier.CheckStatus.PASS));
    }

    function test_matchingAssertedFieldsPass() public pure {
        PaymentVerifier.Claim memory claim = _claim();
        PaymentVerifier.Evidence memory evidence = _availableEvidence(claim.transactionHash);
        claim.assertsToken = true;
        claim.token = evidence.transferToken;
        claim.assertsSender = true;
        claim.sender = evidence.transferSender;
        claim.assertsRecipient = true;
        claim.recipient = evidence.transferRecipient;
        claim.assertsAmount = true;
        claim.amount = evidence.transferAmount;

        PaymentVerifier.Evaluation memory result = PaymentVerifier.evaluate(claim, evidence, CHAIN_ID);

        assertEq(uint8(result.verdict), uint8(PaymentVerifier.Verdict.VERIFIED));
    }

    // --- identity checks: runId / invoiceRef / paymentBatchContract --------

    function test_mismatchedRunIdFails() public pure {
        PaymentVerifier.Claim memory claim = _claim();
        claim.runId = keccak256("different-run");
        PaymentVerifier.Evidence memory evidence = _availableEvidence(claim.transactionHash);

        PaymentVerifier.Evaluation memory result = PaymentVerifier.evaluate(claim, evidence, CHAIN_ID);

        assertEq(uint8(result.verdict), uint8(PaymentVerifier.Verdict.NOT_VERIFIED));
        assertEq(uint8(result.checks[PaymentVerifier.RUN_ID_CHECK]), uint8(PaymentVerifier.CheckStatus.FAIL));
    }

    function test_mismatchedPaymentBatchContractFailsRunIdCheck() public pure {
        PaymentVerifier.Claim memory claim = _claim();
        claim.paymentBatchContract = address(0xDEAD);
        PaymentVerifier.Evidence memory evidence = _availableEvidence(claim.transactionHash);

        PaymentVerifier.Evaluation memory result = PaymentVerifier.evaluate(claim, evidence, CHAIN_ID);

        assertEq(uint8(result.verdict), uint8(PaymentVerifier.Verdict.NOT_VERIFIED));
        assertEq(uint8(result.checks[PaymentVerifier.RUN_ID_CHECK]), uint8(PaymentVerifier.CheckStatus.FAIL));
    }

    function test_mismatchedInvoiceRefFails() public pure {
        PaymentVerifier.Claim memory claim = _claim();
        claim.invoiceRef = keccak256("different-invoice");
        PaymentVerifier.Evidence memory evidence = _availableEvidence(claim.transactionHash);

        PaymentVerifier.Evaluation memory result = PaymentVerifier.evaluate(claim, evidence, CHAIN_ID);

        assertEq(uint8(result.verdict), uint8(PaymentVerifier.Verdict.NOT_VERIFIED));
        assertEq(uint8(result.checks[PaymentVerifier.INVOICE_REF_CHECK]), uint8(PaymentVerifier.CheckStatus.FAIL));
    }

    /// @dev This is the check that directly encodes the lesson from
    /// Veridra's "rederive payment facts" fix: even if the claim matches
    /// PaymentExecuted perfectly, a PaymentExecuted log that disagrees with
    /// the actual ERC-20 Transfer log must still fail. A buggy or malicious
    /// PaymentBatch deployment could emit PaymentExecuted without the
    /// matching transfer ever happening.
    function test_paymentExecutedDisagreeingWithTransferFailsOrderBinding() public pure {
        PaymentVerifier.Claim memory claim = _claim();
        PaymentVerifier.Evidence memory evidence = _availableEvidence(claim.transactionHash);
        evidence.transferAmount = evidence.paymentExecutedAmount - 1;

        PaymentVerifier.Evaluation memory result = PaymentVerifier.evaluate(claim, evidence, CHAIN_ID);

        assertEq(uint8(result.verdict), uint8(PaymentVerifier.Verdict.NOT_VERIFIED));
        assertEq(uint8(result.checks[PaymentVerifier.ORDER_BINDING_CHECK]), uint8(PaymentVerifier.CheckStatus.FAIL));
    }

    function test_paymentExecutedRecipientDivergingFromTransferFailsOrderBinding() public pure {
        PaymentVerifier.Claim memory claim = _claim();
        PaymentVerifier.Evidence memory evidence = _availableEvidence(claim.transactionHash);
        evidence.transferRecipient = address(0xDEAD);

        PaymentVerifier.Evaluation memory result = PaymentVerifier.evaluate(claim, evidence, CHAIN_ID);

        assertEq(uint8(result.verdict), uint8(PaymentVerifier.Verdict.NOT_VERIFIED));
        assertEq(uint8(result.checks[PaymentVerifier.ORDER_BINDING_CHECK]), uint8(PaymentVerifier.CheckStatus.FAIL));
    }

    // --- optional field checks -----------------------------------------------

    function test_mismatchedTokenFails() public pure {
        PaymentVerifier.Claim memory claim = _claim();
        claim.assertsToken = true;
        claim.token = address(0xDEAD);
        PaymentVerifier.Evidence memory evidence = _availableEvidence(claim.transactionHash);

        PaymentVerifier.Evaluation memory result = PaymentVerifier.evaluate(claim, evidence, CHAIN_ID);

        assertEq(uint8(result.verdict), uint8(PaymentVerifier.Verdict.NOT_VERIFIED));
    }

    function test_mismatchedAmountFails() public pure {
        PaymentVerifier.Claim memory claim = _claim();
        claim.assertsAmount = true;
        PaymentVerifier.Evidence memory evidence = _availableEvidence(claim.transactionHash);
        claim.amount = evidence.transferAmount + 1;

        PaymentVerifier.Evaluation memory result = PaymentVerifier.evaluate(claim, evidence, CHAIN_ID);

        assertEq(uint8(result.verdict), uint8(PaymentVerifier.Verdict.NOT_VERIFIED));
    }

    function test_unsuccessfulExecutionFails() public pure {
        PaymentVerifier.Claim memory claim = _claim();
        PaymentVerifier.Evidence memory evidence = _availableEvidence(claim.transactionHash);
        evidence.successful = false;

        PaymentVerifier.Evaluation memory result = PaymentVerifier.evaluate(claim, evidence, CHAIN_ID);

        assertEq(uint8(result.verdict), uint8(PaymentVerifier.Verdict.NOT_VERIFIED));
        assertEq(uint8(result.checks[PaymentVerifier.EXECUTION_CHECK]), uint8(PaymentVerifier.CheckStatus.FAIL));
    }

    function test_transactionHashMismatchFails() public pure {
        PaymentVerifier.Claim memory claim = _claim();
        PaymentVerifier.Evidence memory evidence = _availableEvidence(keccak256("different-tx"));

        PaymentVerifier.Evaluation memory result = PaymentVerifier.evaluate(claim, evidence, CHAIN_ID);

        assertEq(uint8(result.verdict), uint8(PaymentVerifier.Verdict.NOT_VERIFIED));
    }

    /// @dev A claim submitted against the wrong chain must not verify even
    /// if every other field matches.
    function test_wrongExpectedChainIdFails() public pure {
        PaymentVerifier.Claim memory claim = _claim();
        PaymentVerifier.Evidence memory evidence = _availableEvidence(claim.transactionHash);

        PaymentVerifier.Evaluation memory result = PaymentVerifier.evaluate(claim, evidence, CHAIN_ID + 1);

        assertEq(uint8(result.verdict), uint8(PaymentVerifier.Verdict.NOT_VERIFIED));
        assertEq(uint8(result.checks[PaymentVerifier.CHAIN_ID_CHECK]), uint8(PaymentVerifier.CheckStatus.FAIL));
    }

    /// @dev Fuzz: whenever evidence is usable, any single FAIL anywhere in
    /// the checks must dominate to NOT_VERIFIED, and the absence of any
    /// FAIL must yield VERIFIED — independent of which optional field
    /// diverges.
    function testFuzz_failDominatesVerdictWheneverEvidenceIsUsable(
        bool tokenAsserted,
        address tokenClaim,
        bool senderAsserted,
        address senderClaim,
        bool recipientAsserted,
        address recipientClaim,
        bool amountAsserted,
        uint256 amountClaim
    ) public pure {
        PaymentVerifier.Claim memory claim = _claim();
        PaymentVerifier.Evidence memory evidence = _availableEvidence(claim.transactionHash);

        claim.assertsToken = tokenAsserted;
        claim.token = tokenAsserted ? tokenClaim : address(0);
        claim.assertsSender = senderAsserted;
        claim.sender = senderAsserted ? senderClaim : address(0);
        claim.assertsRecipient = recipientAsserted;
        claim.recipient = recipientAsserted ? recipientClaim : address(0);
        claim.assertsAmount = amountAsserted;
        claim.amount = amountAsserted ? amountClaim : 0;

        PaymentVerifier.Evaluation memory result = PaymentVerifier.evaluate(claim, evidence, CHAIN_ID);

        bool anyFail = (tokenAsserted && tokenClaim != evidence.transferToken)
            || (senderAsserted && senderClaim != evidence.transferSender)
            || (recipientAsserted && recipientClaim != evidence.transferRecipient)
            || (amountAsserted && amountClaim != evidence.transferAmount);

        if (anyFail) {
            assertEq(uint8(result.verdict), uint8(PaymentVerifier.Verdict.NOT_VERIFIED));
        } else {
            assertEq(uint8(result.verdict), uint8(PaymentVerifier.Verdict.VERIFIED));
        }
    }
}
