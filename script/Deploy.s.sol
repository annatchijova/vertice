// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PaymentBatch} from "../src/PaymentBatch.sol";
import {PaymentReceiptRegistry} from "../src/PaymentReceiptRegistry.sol";

/// @notice Deploys PaymentBatch and PaymentReceiptRegistry.
/// @dev Reads configuration from environment variables so no address or
/// cap is hardcoded:
///   ARGT_ADDRESS         - the ERC-20 token PaymentBatch pays in (required)
///   OWNER_ADDRESS        - policy admin for PaymentBatch (default: broadcaster)
///   PUBLISHER_ADDRESS    - sole publisher for PaymentReceiptRegistry (default: broadcaster)
///   MAX_AMOUNT_PER_PAYMENT - 18-decimal units (default: 10_000e18)
///   MAX_AMOUNT_PER_BATCH   - 18-decimal units (default: 50_000e18)
contract Deploy is Script {
    function run() external returns (PaymentBatch batch, PaymentReceiptRegistry registry) {
        address argt = vm.envAddress("ARGT_ADDRESS");

        uint256 deployerKey = vm.envOr("PRIVATE_KEY", uint256(0));
        address broadcaster = deployerKey != 0 ? vm.addr(deployerKey) : msg.sender;

        address owner = vm.envOr("OWNER_ADDRESS", broadcaster);
        address publisher = vm.envOr("PUBLISHER_ADDRESS", broadcaster);
        uint256 maxPerPayment = vm.envOr("MAX_AMOUNT_PER_PAYMENT", uint256(10_000e18));
        uint256 maxPerBatch = vm.envOr("MAX_AMOUNT_PER_BATCH", uint256(50_000e18));

        vm.startBroadcast();
        batch = new PaymentBatch(argt, owner, maxPerPayment, maxPerBatch);
        registry = new PaymentReceiptRegistry(publisher);
        vm.stopBroadcast();

        console2.log("PaymentBatch deployed at:", address(batch));
        console2.log("PaymentReceiptRegistry deployed at:", address(registry));
        console2.log("Token (ARGt):", argt);
        console2.log("Owner:", owner);
        console2.log("Publisher:", publisher);
        console2.log("Max per payment:", maxPerPayment);
        console2.log("Max per batch:", maxPerBatch);
    }
}
