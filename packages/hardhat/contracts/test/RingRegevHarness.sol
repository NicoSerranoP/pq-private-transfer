// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../RingRegev.sol";

/**
 * @title RingRegevHarness
 * @notice Thin wrapper exposing RingRegev library functions for testing.
 * Internal library functions cannot be called directly from test runners.
 */
contract RingRegevHarness {
    function add(bytes calldata a, bytes calldata b) external pure returns (bytes memory) {
        return RingRegev.add(a, b);
    }

    function sub(bytes calldata a, bytes calldata b) external pure returns (bytes memory) {
        return RingRegev.sub(a, b);
    }
}
