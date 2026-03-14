---
status: completed
created: 2026-03-14
started: 2026-03-14
completed: 2026-03-14
---
# Task: Update Solidity transfer ABI and generated metadata

## Description
Simplify the `PrivateTransfer.transfer` contract entrypoint to remove the sender ciphertext array, update contract tests to the new signature, and regenerate the checked-in ABI metadata consumed by the frontend.

## Background
The contract already uses only `encTotal` for sender debit. The removed sender array is currently dead ABI surface plus a length check. This task aligns the Solidity surface, tests, and generated metadata with the approved breaking change.

## Reference Documentation
**Required:**
- Design: .agents/scratchpad/implementation/remove-enc-balance-sender/design.md

**Additional References:**
- .agents/scratchpad/implementation/remove-enc-balance-sender/context.md (codebase patterns)
- .agents/scratchpad/implementation/remove-enc-balance-sender/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Update `packages/hardhat/contracts/PrivateTransfer.sol` so `transfer` accepts only recipients, receiver ciphertexts, `encTotal`, commitment, and proof inputs.
2. Remove the sender-array length check while preserving the receiver-array length check and all existing transfer guards.
3. Update `packages/hardhat/test/PrivateTransfer.test.ts` call sites and fixtures to the new ABI.
4. Regenerate checked-in ABI outputs, including `packages/nextjs/contracts/deployedContracts.ts`, through the normal Hardhat flow.

## Dependencies
- Task 02: `.agents/scratchpad/implementation/remove-enc-balance-sender/tasks/task-02-implement-reduced-crypto-transfer-surface.code-task.md`
- Existing Hardhat compile and test workflow

## Implementation Approach
1. TDD: Update contract tests to the reduced transfer signature and confirm they fail before the Solidity change.
2. Implement the ABI simplification in `PrivateTransfer.sol` with only the necessary behavioral edits.
3. Regenerate ABI metadata and rerun compile/test commands until Solidity and generated outputs agree.

## Acceptance Criteria

1. **Transfer ABI is reduced**
   - Given the contract source is updated
   - When `PrivateTransfer.transfer` is called
   - Then it accepts five arguments and no longer exposes `encBalanceToUpdateSender`

2. **Existing transfer protections remain intact**
   - Given the reduced ABI is in place
   - When contract tests exercise invalid proof, replay, registration, recipient, and pool checks
   - Then the same protections continue to revert as expected

3. **Generated metadata matches the contract**
   - Given the Solidity signature has changed
   - When the normal Hardhat generation flow runs
   - Then the checked-in ABI metadata exposes the new transfer signature

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running the test suite
   - Then all tests for this task pass

## Metadata
- **Complexity**: High
- **Labels**: solidity, abi, hardhat, testing, generation
- **Required Skills**: Solidity, Hardhat, ABI regeneration, contract testing
