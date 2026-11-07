// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal mintable ERC-20 standing in for ARGt in tests.
contract MockERC20 is ERC20 {
    constructor() ERC20("Mock ARGt", "mARGt") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
