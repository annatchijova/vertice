// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title PaymentBatch
/// @notice Pays a batch of approved recipients in a single fixed ERC-20 token.
/// @dev The contract never custodies funds: every payment is pulled from the
/// caller's own balance via `transferFrom`, so the caller must `approve` this
/// contract first. This keeps the human-approval path and the bounded
/// automatic-executor path symmetric: whoever calls `payBatch` pays from their
/// own wallet, and the contract only enforces who may receive and how much.
contract PaymentBatch is Ownable {
    using SafeERC20 for IERC20;

    error LengthMismatch();
    error EmptyBatch();
    error RunAlreadyExecuted(bytes32 runId);
    error RecipientNotApproved(address recipient);
    error ZeroAmount();
    error ExceedsPerPaymentCap(uint256 amount, uint256 cap);
    error ExceedsBatchCap(uint256 total, uint256 cap);
    error ZeroAddress();

    /// @notice The ERC-20 token this contract is bound to. Fixed at deployment;
    /// the contract never accepts an arbitrary token or arbitrary call target.
    IERC20 public immutable token;

    mapping(address recipient => bool approved) public approvedRecipients;
    mapping(bytes32 runId => bool executed) public executedRuns;

    uint256 public maxAmountPerPayment;
    uint256 public maxAmountPerBatch;

    event PaymentExecuted(bytes32 indexed runId, bytes32 indexed invoiceRef, address indexed recipient, uint256 amount);
    event RecipientApprovalChanged(address indexed recipient, bool approved);
    event CapsChanged(uint256 maxAmountPerPayment, uint256 maxAmountPerBatch);

    constructor(address token_, address owner_, uint256 maxAmountPerPayment_, uint256 maxAmountPerBatch_)
        Ownable(owner_)
    {
        if (token_ == address(0)) revert ZeroAddress();
        token = IERC20(token_);
        maxAmountPerPayment = maxAmountPerPayment_;
        maxAmountPerBatch = maxAmountPerBatch_;
    }

    /// @notice Approve or revoke a recipient. Only the registry owner (the
    /// merchant's policy admin) may do this — never the automatic executor,
    /// never the LLM.
    function setApprovedRecipient(address recipient, bool approved) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        approvedRecipients[recipient] = approved;
        emit RecipientApprovalChanged(recipient, approved);
    }

    /// @notice Update the per-payment and per-batch caps.
    function setCaps(uint256 maxAmountPerPayment_, uint256 maxAmountPerBatch_) external onlyOwner {
        maxAmountPerPayment = maxAmountPerPayment_;
        maxAmountPerBatch = maxAmountPerBatch_;
        emit CapsChanged(maxAmountPerPayment_, maxAmountPerBatch_);
    }

    /// @notice Pay a batch of invoices to approved recipients, pulling funds
    /// from `msg.sender`. Reverts atomically if any invariant is violated —
    /// there is no partial execution of a batch.
    /// @param runId Unique identifier for this batch. Cannot be reused.
    /// @param recipients Payees, each must already be approved.
    /// @param amounts Amount per payment, parallel to `recipients`.
    /// @param invoiceRefs Off-chain invoice reference per payment, parallel to `recipients`.
    function payBatch(
        bytes32 runId,
        address[] calldata recipients,
        uint256[] calldata amounts,
        bytes32[] calldata invoiceRefs
    ) external {
        if (executedRuns[runId]) revert RunAlreadyExecuted(runId);
        uint256 len = recipients.length;
        if (len == 0) revert EmptyBatch();
        if (len != amounts.length || len != invoiceRefs.length) revert LengthMismatch();

        uint256 perPaymentCap = maxAmountPerPayment;
        uint256 total = 0;
        for (uint256 i = 0; i < len; i++) {
            address recipient = recipients[i];
            uint256 amount = amounts[i];
            if (!approvedRecipients[recipient]) revert RecipientNotApproved(recipient);
            if (amount == 0) revert ZeroAmount();
            if (amount > perPaymentCap) revert ExceedsPerPaymentCap(amount, perPaymentCap);
            total += amount;
        }
        uint256 batchCap = maxAmountPerBatch;
        if (total > batchCap) revert ExceedsBatchCap(total, batchCap);

        // Effects before interactions: mark the run spent before any transfer,
        // so a malicious token cannot re-enter and replay this runId.
        executedRuns[runId] = true;

        for (uint256 i = 0; i < len; i++) {
            address recipient = recipients[i];
            uint256 amount = amounts[i];
            token.safeTransferFrom(msg.sender, recipient, amount);
            emit PaymentExecuted(runId, invoiceRefs[i], recipient, amount);
        }
    }
}
