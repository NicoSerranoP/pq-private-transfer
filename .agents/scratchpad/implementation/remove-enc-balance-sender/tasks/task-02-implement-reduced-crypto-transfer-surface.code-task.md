---
status: completed
created: 2026-03-14
started: 2026-03-14
completed: 2026-03-14
---
# Task: Implement reduced crypto transfer surface

## Description
Remove `encBalanceToUpdateSender` and `rSender` from the crypto transfer circuit types and serialization so proof generation and verification operate only on the reduced layout.

## Background
The approved design treats this as a breaking change across the repository. The crypto package is the authoritative source for transfer proof type definitions and serialized public-input layout, so it must be updated before contract and frontend callers can align.

## Reference Documentation
**Required:**
- Design: .agents/scratchpad/implementation/remove-enc-balance-sender/design.md

**Additional References:**
- .agents/scratchpad/implementation/remove-enc-balance-sender/context.md (codebase patterns)
- .agents/scratchpad/implementation/remove-enc-balance-sender/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Remove `encBalanceToUpdateSender` from `TransferPublicInputs` in `packages/crypto/src/stark/transferCircuit.ts`.
2. Remove `rSender` from `TransferPrivateInputs` in the same file.
3. Update `serializeTransferPublic`, `proveTransfer`, and `verifyTransfer` to use the reduced layout only.
4. Keep package exports aligned with the new types and functions.

## Dependencies
- Task 01: `.agents/scratchpad/implementation/remove-enc-balance-sender/tasks/task-01-lock-reduced-transfer-proof-api-in-crypto-tests.code-task.md`
- `packages/crypto/src/stark/transferCircuit.ts`

## Implementation Approach
1. TDD: Run the updated crypto tests and confirm they fail against the legacy transfer surface.
2. Implement the minimal type and serialization changes needed to satisfy the reduced proof layout.
3. Refactor any now-unused helpers or imports while keeping package tests and type-checks green.

## Acceptance Criteria

1. **Reduced transfer types compile**
   - Given the crypto transfer circuit source is updated
   - When TypeScript checks `TransferPublicInputs` and `TransferPrivateInputs`
   - Then the removed sender-array fields are no longer part of the transfer API

2. **Serialized public layout is reduced**
   - Given transfer public inputs are serialized for proving and verification
   - When `serializeTransferPublic` runs
   - Then it omits the removed sender ciphertext array entirely

3. **Crypto package validation stays green**
   - Given the reduced transfer surface is implemented
   - When the crypto package tests and type-checks run
   - Then they pass using only the new layout

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running the test suite
   - Then all tests for this task pass

## Metadata
- **Complexity**: Medium
- **Labels**: crypto, serialization, typescript, zk
- **Required Skills**: TypeScript, package validation, proof serialization
