// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Mock STARK verifier for the Deposit circuit.
/// @dev Accepts any well-formed proof (non-zero commitment + non-empty inputs).
///      Real ZK verification is not implemented — this is a prototype-phase mock.
///      See design.md Section 8a for documented mock-prover limitations.
contract DepositVerifier {
    function verify(bytes32 commitment, bytes calldata inputs) external pure returns (bool) {
        return commitment != bytes32(0) && inputs.length > 0;
    }
}
