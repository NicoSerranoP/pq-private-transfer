---
status: completed
created: 2026-03-11
started: 2026-03-11
completed: 2026-03-11
---
# Task: Verifier Contracts + Tests

## Description
Implement the three mock STARK verifier contracts: `DepositVerifier.sol`, `TransferVerifier.sol`, and `WithdrawVerifier.sol`. Each verifier checks that a submitted ZKProof has a non-zero commitment and non-empty inputs field — matching the mock STARK format produced by the TypeScript circuits in `packages/crypto`.

## Background
The protocol uses mock STARK proofs for the prototype phase. A valid mock proof is: `{ commitment: bytes32 (non-zero SHA-256 hash), inputs: bytes (non-empty) }`. Real ZK verification is not implemented — the verifiers accept any well-formed proof. This is a documented mock-prover limitation (see design.md Section 8a).

The verifier interface is shared: `function verify(bytes32 commitment, bytes calldata inputs) external pure returns (bool)`. The `PrivateTransfer.sol` contract calls each verifier with the proof data submitted by users.

## Reference Documentation
**Required:**
- Design: .agents/scratchpad/implementation/pq-private-transfer/design.md

**Additional References:**
- .agents/scratchpad/implementation/pq-private-transfer/context.md (codebase patterns)
- packages/crypto/src/stark/ (TypeScript mock circuit reference — same proof format)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Three contracts: `DepositVerifier.sol`, `TransferVerifier.sol`, `WithdrawVerifier.sol` in `packages/hardhat/contracts/verifiers/`
2. Each implements `function verify(bytes32 commitment, bytes calldata inputs) external pure returns (bool)`
3. Returns `false` (not revert) when `commitment == bytes32(0)` or `inputs.length == 0`
4. Returns `true` for any other well-formed input
5. Solidity ^0.8.20
6. Tests in `packages/hardhat/test/Verifiers.test.ts` — 3 cases × 3 contracts = 9 tests

## Dependencies
- Step 3 complete (TypeScript mock circuits define the proof format)
- Step 4 complete (Hardhat project has working test infrastructure)

## Implementation Approach
1. Write all 9 failing tests in `Verifiers.test.ts`
2. Implement all three verifier contracts (they are identical except for contract name/NatSpec)
3. Run tests; all 9 must pass

## Acceptance Criteria

1. **Accepts valid proof (×3 contracts)**
   - Given a proof with `commitment = keccak256("test")` (non-zero) and `inputs = "0x1234"` (non-empty)
   - When `verify(commitment, inputs)` is called on each verifier
   - Then returns `true`

2. **Rejects zero commitment (×3 contracts)**
   - Given a proof where `commitment = bytes32(0)`
   - When `verify(commitment, inputs)` is called
   - Then returns `false`

3. **Rejects empty inputs (×3 contracts)**
   - Given a proof where `inputs.length == 0`
   - When `verify(commitment, inputs)` is called
   - Then returns `false`

4. **All 9 unit tests pass**
   - Given the implementation is complete
   - When running `cd packages/hardhat && npx hardhat test --grep Verifier`
   - Then all 9 test cases pass

## Metadata
- **Complexity**: Low
- **Labels**: solidity, verifier, mock-proof
- **Required Skills**: Solidity 0.8+, Hardhat, mock STARK format
