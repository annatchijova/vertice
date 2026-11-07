// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PaymentBatch} from "../../src/PaymentBatch.sol";

/// @dev Malicious token that tries to re-enter `payBatch` with the same runId
/// mid-transfer, to prove the contract's checks-effects-interactions ordering
/// actually blocks a replay instead of merely being "intended" to.
contract ReentrantERC20 is ERC20 {
    PaymentBatch public target;
    bytes32 public replayRunId;
    address[] internal replayRecipients;
    uint256[] internal replayAmounts;
    bytes32[] internal replayInvoiceRefs;
    bool internal armed;

    constructor() ERC20("Evil ARGt", "eARGt") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(
        PaymentBatch target_,
        bytes32 runId,
        address[] calldata recipients,
        uint256[] calldata amounts,
        bytes32[] calldata invoiceRefs
    ) external {
        target = target_;
        replayRunId = runId;
        replayRecipients = recipients;
        replayAmounts = amounts;
        replayInvoiceRefs = invoiceRefs;
        armed = true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        bool ok = super.transferFrom(from, to, amount);
        if (armed) {
            armed = false; // avoid infinite recursion in the test
            // Low-level call: the attacker's reentrant attempt must not
            // propagate its revert into the outer, legitimate transfer. A
            // direct Solidity call here would bubble the inner revert up and
            // make the whole test vacuous (outer call failing is not what
            // we're testing for).
            (bool reentryOk,) = address(target)
                .call(
                    abi.encodeCall(
                        PaymentBatch.payBatch, (replayRunId, replayRecipients, replayAmounts, replayInvoiceRefs)
                    )
                );
            reentryOk; // expected to be false (RunAlreadyExecuted); outer call must still succeed
        }
        return ok;
    }
}
