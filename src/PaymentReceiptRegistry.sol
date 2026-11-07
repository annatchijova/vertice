// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {PaymentVerifier} from "./PaymentVerifier.sol";

/// @title PaymentReceiptRegistry
/// @notice Immutable onchain record of a named publisher's RPC-based payment
///         verification (VÉRTICE PROOF). The contract compares normalized
///         facts and anchors the result; it does not fetch RPC data or
///         prove that the publisher told the truth about its RPC source.
/// @dev Ported from Veridra's `VeridraReceiptRegistry.sol`. The immutable
///      publisher is the Level 1 trust authority. Receipts use assurance
///      code 1 (RPC_ATTESTED) only — VÉRTICE does not implement Veridra's
///      stronger Merkle-Patricia inclusion-proof levels for P0; that ladder
///      is documented here only as a scope boundary, not reimplemented.
///      `(runId, invoiceRef)` is the uniqueness key: publishing twice for
///      the same pair is idempotent and returns the first receipt, so a
///      receipt can never be silently overwritten by a conflicting claim.
contract PaymentReceiptRegistry {
    uint16 public constant RECEIPT_SCHEMA_VERSION = 1;
    uint8 public constant RPC_ATTESTED = 1;

    address public immutable publisher;

    struct Receipt {
        uint16 schemaVersion;
        uint8 evidenceAssurance;
        PaymentVerifier.Verdict verdict;
        PaymentVerifier.CheckStatus[10] checks;
        bytes32 transactionHash;
        uint256 chainId;
        uint256 blockNumber;
        bytes32 blockHash;
        bytes32 providerId;
        uint64 observedAt;
        uint64 recordedAt;
        bytes32 claimDigest;
        bytes32 evidenceDigest;
        PaymentVerifier.Claim claim;
        PaymentVerifier.Evidence evidence;
    }

    /// @dev keccak256(runId, invoiceRef) -> receiptId. Enforces the
    /// uniqueness invariant: a given invoice within a given batch can only
    /// ever resolve to one published receipt.
    mapping(bytes32 uniquenessKey => bytes32 receiptId) public receiptIdForClaim;
    mapping(bytes32 receiptId => Receipt receipt) private receipts;

    error UnauthorizedPublisher(address caller);
    error InvalidPublisher();
    error InvalidClaim();
    error InvalidEvidence();
    error InvalidProvenance();
    error FutureObservation(uint64 observedAt, uint256 currentTimestamp);
    error ConflictingClaim(bytes32 uniquenessKey, bytes32 existingReceiptId);

    event ReceiptPublished(
        bytes32 indexed receiptId,
        bytes32 indexed runId,
        bytes32 indexed invoiceRef,
        bytes32 transactionHash,
        uint256 chainId,
        address publisher,
        uint16 schemaVersion,
        uint8 evidenceAssurance,
        PaymentVerifier.Verdict verdict,
        bytes32 providerId,
        uint64 observedAt,
        uint64 recordedAt,
        bytes32 claimDigest,
        bytes32 evidenceDigest
    );

    /// @param publisher_ Sole address allowed to submit RPC-derived evidence.
    constructor(address publisher_) {
        if (publisher_ == address(0)) revert InvalidPublisher();
        publisher = publisher_;
    }

    /// @notice Record the immutable result of comparing a claim with evidence
    ///         acquired from a named RPC source.
    /// @param claim Bounded payment assertions. Optional fields use explicit
    ///              `asserts*` flags so address(0) is never mistaken for an
    ///              implicit assertion.
    /// @param evidence Normalized transaction, Transfer-log, and
    ///                 PaymentExecuted-log facts from the RPC.
    /// @param providerId Stable identifier for the configured RPC/provider;
    ///                   do not pass an endpoint containing credentials.
    /// @param observedAt Publisher host's Unix observation time, not a chain
    ///                   timestamp and not signed by the provider.
    /// @return receiptId Stable digest; a repeat publication for the same
    ///                   `(runId, invoiceRef)` is idempotent only if it
    ///                   reproduces the exact same receipt — a differing
    ///                   claim or evidence for an already-claimed
    ///                   `(runId, invoiceRef)` reverts instead of silently
    ///                   overwriting the first receipt.
    function publish(
        PaymentVerifier.Claim calldata claim,
        PaymentVerifier.Evidence calldata evidence,
        bytes32 providerId,
        uint64 observedAt
    ) external returns (bytes32 receiptId) {
        if (msg.sender != publisher) revert UnauthorizedPublisher(msg.sender);
        if (
            claim.transactionHash == bytes32(0) || claim.chainId == 0 || claim.paymentBatchContract == address(0)
                || claim.runId == bytes32(0) || claim.invoiceRef == bytes32(0)
                || (!claim.assertsToken && claim.token != address(0))
                || (!claim.assertsSender && claim.sender != address(0))
                || (!claim.assertsRecipient && claim.recipient != address(0))
                || (!claim.assertsAmount && claim.amount != 0)
        ) {
            revert InvalidClaim();
        }
        if (providerId == bytes32(0) || observedAt == 0) {
            revert InvalidProvenance();
        }
        if (observedAt > block.timestamp) {
            revert FutureObservation(observedAt, block.timestamp);
        }

        if (evidence.available) {
            if (evidence.transactionHash == bytes32(0) || evidence.chainId == 0 || evidence.blockHash == bytes32(0)) {
                revert InvalidEvidence();
            }
        }

        PaymentVerifier.Evaluation memory evaluation = PaymentVerifier.evaluate(claim, evidence, block.chainid);
        bytes32 claimDigest = keccak256(abi.encode(claim));
        bytes32 evidenceDigest = keccak256(abi.encode(evidence));
        uint64 recordedAt = uint64(block.timestamp);

        receiptId = keccak256(
            abi.encode(
                RECEIPT_SCHEMA_VERSION,
                RPC_ATTESTED,
                block.chainid,
                address(this),
                claimDigest,
                evidenceDigest,
                providerId,
                observedAt,
                evaluation.verdict,
                evaluation.checks
            )
        );

        bytes32 uniquenessKey = keccak256(abi.encode(claim.runId, claim.invoiceRef));
        bytes32 existingReceiptId = receiptIdForClaim[uniquenessKey];
        if (existingReceiptId != bytes32(0)) {
            if (existingReceiptId == receiptId) return receiptId;
            revert ConflictingClaim(uniquenessKey, existingReceiptId);
        }

        Receipt storage stored = receipts[receiptId];
        stored.schemaVersion = RECEIPT_SCHEMA_VERSION;
        stored.evidenceAssurance = RPC_ATTESTED;
        stored.verdict = evaluation.verdict;
        stored.checks = evaluation.checks;
        stored.transactionHash = claim.transactionHash;
        stored.chainId = block.chainid;
        stored.providerId = providerId;
        stored.observedAt = observedAt;
        stored.recordedAt = recordedAt;
        stored.claimDigest = claimDigest;
        stored.evidenceDigest = evidenceDigest;
        stored.claim = claim;
        stored.evidence = evidence;

        if (evidence.available) {
            stored.blockNumber = evidence.blockNumber;
            stored.blockHash = evidence.blockHash;
        }

        receiptIdForClaim[uniquenessKey] = receiptId;

        emit ReceiptPublished(
            receiptId,
            claim.runId,
            claim.invoiceRef,
            claim.transactionHash,
            block.chainid,
            msg.sender,
            RECEIPT_SCHEMA_VERSION,
            RPC_ATTESTED,
            evaluation.verdict,
            providerId,
            observedAt,
            recordedAt,
            claimDigest,
            evidenceDigest
        );
    }

    /// @notice Return the stored immutable receipt. A zero schema version
    ///         means no receipt exists for the supplied id.
    function getReceipt(bytes32 receiptId) external view returns (Receipt memory) {
        return receipts[receiptId];
    }

    /// @notice Look up the receipt published for a given invoice within a
    ///         given batch, if any.
    function getReceiptForClaim(bytes32 runId, bytes32 invoiceRef) external view returns (Receipt memory) {
        return receipts[receiptIdForClaim[keccak256(abi.encode(runId, invoiceRef))]];
    }
}
