// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PaymentReceiptRegistry} from "../src/PaymentReceiptRegistry.sol";
import {PaymentVerifier} from "../src/PaymentVerifier.sol";

contract PaymentReceiptRegistryTest is Test {
    PaymentReceiptRegistry internal registry;

    address internal publisher = makeAddr("publisher");
    address internal stranger = makeAddr("stranger");
    address internal constant BATCH = address(0xBA7C4);
    bytes32 internal constant RUN_ID = keccak256("run-1");
    bytes32 internal constant INVOICE_REF = keccak256("INV-001");
    bytes32 internal constant PROVIDER_ID = keccak256("arbitrum-rpc-primary");

    function setUp() public {
        registry = new PaymentReceiptRegistry(publisher);
        vm.warp(1_700_000_000);
    }

    function _claim() internal view returns (PaymentVerifier.Claim memory) {
        return PaymentVerifier.Claim({
            transactionHash: keccak256("tx-1"),
            chainId: block.chainid,
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

    function _evidence(bytes32 transactionHash) internal view returns (PaymentVerifier.Evidence memory) {
        return PaymentVerifier.Evidence({
            available: true,
            transactionHash: transactionHash,
            chainId: block.chainid,
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

    function test_RevertWhen_NonPublisherPublishes() public {
        PaymentVerifier.Claim memory claim = _claim();
        PaymentVerifier.Evidence memory evidence = _evidence(claim.transactionHash);

        vm.expectRevert(abi.encodeWithSelector(PaymentReceiptRegistry.UnauthorizedPublisher.selector, stranger));
        vm.prank(stranger);
        registry.publish(claim, evidence, PROVIDER_ID, uint64(block.timestamp));
    }

    function test_PublishVerifiedReceipt_StoresAndEmits() public {
        PaymentVerifier.Claim memory claim = _claim();
        PaymentVerifier.Evidence memory evidence = _evidence(claim.transactionHash);

        vm.prank(publisher);
        bytes32 receiptId = registry.publish(claim, evidence, PROVIDER_ID, uint64(block.timestamp));

        PaymentReceiptRegistry.Receipt memory stored = registry.getReceipt(receiptId);
        assertEq(uint8(stored.verdict), uint8(PaymentVerifier.Verdict.VERIFIED));
        assertEq(stored.evidenceAssurance, registry.RPC_ATTESTED());
        assertEq(stored.transactionHash, claim.transactionHash);

        PaymentReceiptRegistry.Receipt memory byClaim = registry.getReceiptForClaim(RUN_ID, INVOICE_REF);
        assertEq(uint8(byClaim.verdict), uint8(PaymentVerifier.Verdict.VERIFIED));
    }

    function test_RepublishingIdenticalClaim_IsIdempotent() public {
        PaymentVerifier.Claim memory claim = _claim();
        PaymentVerifier.Evidence memory evidence = _evidence(claim.transactionHash);

        vm.prank(publisher);
        bytes32 first = registry.publish(claim, evidence, PROVIDER_ID, uint64(block.timestamp));

        vm.prank(publisher);
        bytes32 second = registry.publish(claim, evidence, PROVIDER_ID, uint64(block.timestamp));

        assertEq(first, second);
    }

    /// @dev Uniqueness invariant: once (runId, invoiceRef) has a receipt, a
    /// conflicting claim for the same pair (different transaction, amount,
    /// etc.) must not silently overwrite it.
    function test_RevertWhen_ConflictingClaimReusesRunIdAndInvoiceRef() public {
        PaymentVerifier.Claim memory claim = _claim();
        PaymentVerifier.Evidence memory evidence = _evidence(claim.transactionHash);

        vm.prank(publisher);
        bytes32 firstReceiptId = registry.publish(claim, evidence, PROVIDER_ID, uint64(block.timestamp));

        PaymentVerifier.Claim memory conflicting = claim;
        conflicting.transactionHash = keccak256("tx-2");
        PaymentVerifier.Evidence memory conflictingEvidence = _evidence(conflicting.transactionHash);

        bytes32 uniquenessKey = keccak256(abi.encode(RUN_ID, INVOICE_REF));
        vm.expectRevert(
            abi.encodeWithSelector(PaymentReceiptRegistry.ConflictingClaim.selector, uniquenessKey, firstReceiptId)
        );
        vm.prank(publisher);
        registry.publish(conflicting, conflictingEvidence, PROVIDER_ID, uint64(block.timestamp));
    }

    function test_RevertWhen_ClaimMissingRunId() public {
        PaymentVerifier.Claim memory claim = _claim();
        claim.runId = bytes32(0);
        PaymentVerifier.Evidence memory evidence = _evidence(claim.transactionHash);

        vm.expectRevert(PaymentReceiptRegistry.InvalidClaim.selector);
        vm.prank(publisher);
        registry.publish(claim, evidence, PROVIDER_ID, uint64(block.timestamp));
    }

    function test_RevertWhen_AssertsFlagFalseButFieldNonZero() public {
        PaymentVerifier.Claim memory claim = _claim();
        claim.recipient = address(0xB0B); // assertsRecipient is false
        PaymentVerifier.Evidence memory evidence = _evidence(claim.transactionHash);

        vm.expectRevert(PaymentReceiptRegistry.InvalidClaim.selector);
        vm.prank(publisher);
        registry.publish(claim, evidence, PROVIDER_ID, uint64(block.timestamp));
    }

    function test_RevertWhen_ObservedAtInFuture() public {
        PaymentVerifier.Claim memory claim = _claim();
        PaymentVerifier.Evidence memory evidence = _evidence(claim.transactionHash);

        vm.expectRevert(
            abi.encodeWithSelector(
                PaymentReceiptRegistry.FutureObservation.selector, uint64(block.timestamp + 1), block.timestamp
            )
        );
        vm.prank(publisher);
        registry.publish(claim, evidence, PROVIDER_ID, uint64(block.timestamp + 1));
    }

    function test_PublishesInsufficientEvidenceReceipt_WhenEvidenceUnavailable() public {
        PaymentVerifier.Claim memory claim = _claim();
        PaymentVerifier.Evidence memory evidence = _evidence(claim.transactionHash);
        evidence.available = false;

        vm.prank(publisher);
        bytes32 receiptId = registry.publish(claim, evidence, PROVIDER_ID, uint64(block.timestamp));

        PaymentReceiptRegistry.Receipt memory stored = registry.getReceipt(receiptId);
        assertEq(uint8(stored.verdict), uint8(PaymentVerifier.Verdict.INSUFFICIENT_EVIDENCE));
    }
}
