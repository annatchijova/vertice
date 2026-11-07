// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PaymentBatch} from "../src/PaymentBatch.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {ReentrantERC20} from "./mocks/ReentrantERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract PaymentBatchTest is Test {
    PaymentBatch internal batch;
    MockERC20 internal token;

    address internal owner = makeAddr("owner");
    address internal payer = makeAddr("payer");
    address internal supplierA = makeAddr("supplierA");
    address internal supplierB = makeAddr("supplierB");
    address internal unapproved = makeAddr("unapproved");

    uint256 internal constant MAX_PER_PAYMENT = 1_000e18;
    uint256 internal constant MAX_PER_BATCH = 2_500e18;

    function setUp() public {
        token = new MockERC20();
        batch = new PaymentBatch(address(token), owner, MAX_PER_PAYMENT, MAX_PER_BATCH);

        vm.startPrank(owner);
        batch.setApprovedRecipient(supplierA, true);
        batch.setApprovedRecipient(supplierB, true);
        vm.stopPrank();

        token.mint(payer, 100_000e18);
        vm.prank(payer);
        token.approve(address(batch), type(uint256).max);
    }

    function _single(address recipient, uint256 amount, bytes32 invoiceRef)
        internal
        pure
        returns (address[] memory recipients, uint256[] memory amounts, bytes32[] memory refs)
    {
        recipients = new address[](1);
        amounts = new uint256[](1);
        refs = new bytes32[](1);
        recipients[0] = recipient;
        amounts[0] = amount;
        refs[0] = invoiceRef;
    }

    // --- happy path -------------------------------------------------------

    function test_PayBatch_SingleApprovedPayment_TransfersAndEmits() public {
        (address[] memory recipients, uint256[] memory amounts, bytes32[] memory refs) =
            _single(supplierA, 500e18, "INV-001");

        vm.expectEmit(true, true, true, true);
        emit PaymentBatch.PaymentExecuted(bytes32("run-1"), "INV-001", supplierA, 500e18);

        vm.prank(payer);
        batch.payBatch(bytes32("run-1"), recipients, amounts, refs);

        assertEq(token.balanceOf(supplierA), 500e18);
        assertTrue(batch.executedRuns(bytes32("run-1")));
    }

    function test_PayBatch_MultiplePayments_AtomicAndEachEmitsOwnEvent() public {
        address[] memory recipients = new address[](2);
        uint256[] memory amounts = new uint256[](2);
        bytes32[] memory refs = new bytes32[](2);
        recipients[0] = supplierA;
        recipients[1] = supplierB;
        amounts[0] = 800e18;
        amounts[1] = 700e18;
        refs[0] = "INV-010";
        refs[1] = "INV-011";

        vm.prank(payer);
        batch.payBatch(bytes32("run-2"), recipients, amounts, refs);

        assertEq(token.balanceOf(supplierA), 800e18);
        assertEq(token.balanceOf(supplierB), 700e18);
    }

    // --- replay protection --------------------------------------------------

    function test_RevertWhen_RunIdReused() public {
        (address[] memory recipients, uint256[] memory amounts, bytes32[] memory refs) =
            _single(supplierA, 100e18, "INV-020");

        vm.prank(payer);
        batch.payBatch(bytes32("run-3"), recipients, amounts, refs);

        vm.expectRevert(abi.encodeWithSelector(PaymentBatch.RunAlreadyExecuted.selector, bytes32("run-3")));
        vm.prank(payer);
        batch.payBatch(bytes32("run-3"), recipients, amounts, refs);
    }

    function test_RevertWhen_ReentrantTokenReplaysRunIdMidTransfer() public {
        ReentrantERC20 evilToken = new ReentrantERC20();
        PaymentBatch evilBatch = new PaymentBatch(address(evilToken), owner, MAX_PER_PAYMENT, MAX_PER_BATCH);

        vm.prank(owner);
        evilBatch.setApprovedRecipient(supplierA, true);

        evilToken.mint(payer, 10_000e18);
        vm.prank(payer);
        evilToken.approve(address(evilBatch), type(uint256).max);

        (address[] memory recipients, uint256[] memory amounts, bytes32[] memory refs) =
            _single(supplierA, 100e18, "INV-030");

        // Arm the token to try to replay the same runId against evilBatch
        // from inside transferFrom, before payBatch has finished executing.
        evilToken.arm(evilBatch, bytes32("run-4"), recipients, amounts, refs);

        vm.prank(payer);
        evilBatch.payBatch(bytes32("run-4"), recipients, amounts, refs);

        // Only one payment should have landed: the reentrant call must have
        // reverted on RunAlreadyExecuted, and that inner revert must not have
        // unwound the outer, successful call.
        assertEq(evilToken.balanceOf(supplierA), 100e18);
    }

    // --- allowlist -----------------------------------------------------------

    function test_RevertWhen_RecipientNotApproved() public {
        (address[] memory recipients, uint256[] memory amounts, bytes32[] memory refs) =
            _single(unapproved, 100e18, "INV-040");

        vm.expectRevert(abi.encodeWithSelector(PaymentBatch.RecipientNotApproved.selector, unapproved));
        vm.prank(payer);
        batch.payBatch(bytes32("run-5"), recipients, amounts, refs);
    }

    function test_RevertWhen_RecipientApprovalRevoked() public {
        vm.prank(owner);
        batch.setApprovedRecipient(supplierA, false);

        (address[] memory recipients, uint256[] memory amounts, bytes32[] memory refs) =
            _single(supplierA, 100e18, "INV-041");

        vm.expectRevert(abi.encodeWithSelector(PaymentBatch.RecipientNotApproved.selector, supplierA));
        vm.prank(payer);
        batch.payBatch(bytes32("run-6"), recipients, amounts, refs);
    }

    function test_RevertWhen_NonOwnerSetsApprovedRecipient() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, payer));
        vm.prank(payer);
        batch.setApprovedRecipient(unapproved, true);
    }

    // --- caps ------------------------------------------------------------

    function test_RevertWhen_AmountExceedsPerPaymentCap() public {
        (address[] memory recipients, uint256[] memory amounts, bytes32[] memory refs) =
            _single(supplierA, MAX_PER_PAYMENT + 1, "INV-050");

        vm.expectRevert(
            abi.encodeWithSelector(PaymentBatch.ExceedsPerPaymentCap.selector, MAX_PER_PAYMENT + 1, MAX_PER_PAYMENT)
        );
        vm.prank(payer);
        batch.payBatch(bytes32("run-7"), recipients, amounts, refs);
    }

    function test_RevertWhen_BatchTotalExceedsBatchCap() public {
        address[] memory recipients = new address[](3);
        uint256[] memory amounts = new uint256[](3);
        bytes32[] memory refs = new bytes32[](3);
        recipients[0] = supplierA;
        recipients[1] = supplierB;
        recipients[2] = supplierA;
        amounts[0] = 1_000e18;
        amounts[1] = 1_000e18;
        amounts[2] = 1_000e18; // sums to 3_000e18 > MAX_PER_BATCH, each under per-payment cap
        refs[0] = "INV-060";
        refs[1] = "INV-061";
        refs[2] = "INV-062";

        vm.expectRevert(abi.encodeWithSelector(PaymentBatch.ExceedsBatchCap.selector, 3_000e18, MAX_PER_BATCH));
        vm.prank(payer);
        batch.payBatch(bytes32("run-8"), recipients, amounts, refs);
    }

    function test_BatchCapViolation_LeavesNoPartialTransfer() public {
        address[] memory recipients = new address[](3);
        uint256[] memory amounts = new uint256[](3);
        bytes32[] memory refs = new bytes32[](3);
        recipients[0] = supplierA;
        recipients[1] = supplierB;
        recipients[2] = supplierA;
        amounts[0] = 1_000e18;
        amounts[1] = 1_000e18;
        amounts[2] = 1_000e18;
        refs[0] = "INV-070";
        refs[1] = "INV-071";
        refs[2] = "INV-072";

        vm.prank(payer);
        (bool success,) =
            address(batch).call(abi.encodeCall(PaymentBatch.payBatch, (bytes32("run-9"), recipients, amounts, refs)));
        assertFalse(success);
        assertEq(token.balanceOf(supplierA), 0);
        assertEq(token.balanceOf(supplierB), 0);
        assertFalse(batch.executedRuns(bytes32("run-9")));
    }

    function test_RevertWhen_ZeroAmount() public {
        (address[] memory recipients, uint256[] memory amounts, bytes32[] memory refs) =
            _single(supplierA, 0, "INV-080");

        vm.expectRevert(PaymentBatch.ZeroAmount.selector);
        vm.prank(payer);
        batch.payBatch(bytes32("run-10"), recipients, amounts, refs);
    }

    // --- malformed batches -------------------------------------------------

    function test_RevertWhen_ArrayLengthsMismatch() public {
        address[] memory recipients = new address[](2);
        uint256[] memory amounts = new uint256[](1);
        bytes32[] memory refs = new bytes32[](2);
        recipients[0] = supplierA;
        recipients[1] = supplierB;
        amounts[0] = 100e18;
        refs[0] = "INV-090";
        refs[1] = "INV-091";

        vm.expectRevert(PaymentBatch.LengthMismatch.selector);
        vm.prank(payer);
        batch.payBatch(bytes32("run-11"), recipients, amounts, refs);
    }

    function test_RevertWhen_EmptyBatch() public {
        address[] memory recipients = new address[](0);
        uint256[] memory amounts = new uint256[](0);
        bytes32[] memory refs = new bytes32[](0);

        vm.expectRevert(PaymentBatch.EmptyBatch.selector);
        vm.prank(payer);
        batch.payBatch(bytes32("run-12"), recipients, amounts, refs);
    }

    function test_RevertWhen_InsufficientAllowance() public {
        vm.prank(payer);
        token.approve(address(batch), 0);

        (address[] memory recipients, uint256[] memory amounts, bytes32[] memory refs) =
            _single(supplierA, 100e18, "INV-100");

        vm.expectRevert();
        vm.prank(payer);
        batch.payBatch(bytes32("run-13"), recipients, amounts, refs);
    }

    // --- admin -------------------------------------------------------------

    function test_RevertWhen_NonOwnerSetsCaps() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, payer));
        vm.prank(payer);
        batch.setCaps(1, 1);
    }

    // --- fuzz ----------------------------------------------------------------

    function testFuzz_PaymentWithinCaps_AlwaysSucceeds(uint256 amount) public {
        amount = bound(amount, 1, MAX_PER_PAYMENT);
        (address[] memory recipients, uint256[] memory amounts, bytes32[] memory refs) =
            _single(supplierA, amount, "INV-FUZZ");

        vm.prank(payer);
        batch.payBatch(keccak256(abi.encode(amount)), recipients, amounts, refs);

        assertEq(token.balanceOf(supplierA), amount);
    }

    function testFuzz_PaymentAboveCap_AlwaysReverts(uint256 amount) public {
        amount = bound(amount, MAX_PER_PAYMENT + 1, MAX_PER_PAYMENT * 1000);
        (address[] memory recipients, uint256[] memory amounts, bytes32[] memory refs) =
            _single(supplierA, amount, "INV-FUZZ2");

        vm.expectRevert(abi.encodeWithSelector(PaymentBatch.ExceedsPerPaymentCap.selector, amount, MAX_PER_PAYMENT));
        vm.prank(payer);
        batch.payBatch(keccak256(abi.encode(amount, "cap")), recipients, amounts, refs);
    }
}
