---
status: completed
created: 2026-03-14
started: 2026-03-14
completed: 2026-03-14
---
# Task: Lock reduced transfer proof API in crypto tests

## Description
Update the transfer circuit tests so they describe and enforce the reduced transfer proof surface that removes `encBalanceToUpdateSender` and `rSender`. This creates the red test baseline for the repo-wide breaking change.

## Background
The transfer proof layout is the primary compatibility boundary for this repository because the Solidity transfer verifier is currently a mock. The crypto tests must therefore explicitly protect the new five-field public shape and reduced witness structure before implementation proceeds.

## Reference Documentation
**Required:**
- Design: .agents/scratchpad/implementation/remove-enc-balance-sender/design.md

**Additional References:**
- .agents/scratchpad/implementation/remove-enc-balance-sender/context.md (codebase patterns)
- .agents/scratchpad/implementation/remove-enc-balance-sender/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Update `packages/crypto/src/stark/transferCircuit.test.ts` to build `TransferPublicInputs` without `encBalanceToUpdateSender`.
2. Update the same tests to build `TransferPrivateInputs` without `rSender`.
3. Preserve roundtrip, commitment-length, and tamper-failure coverage using the reduced fixture shape.
4. Add or retain an explicit assertion that the reduced public-input shape is sufficient for proof generation and verification.

## Dependencies
- Design approval and implementation plan for `remove-enc-balance-sender`
- Existing transfer circuit test harness in `packages/crypto/src/stark/transferCircuit.test.ts`

## Implementation Approach
1. TDD: Rewrite the transfer proof fixtures and expectations to the reduced API so they fail against the current implementation.
2. Implement only the minimal test-side changes needed to express the new public/private shapes.
3. Refactor duplicated fixture setup for readability while keeping the tests focused on the reduced layout.

## Acceptance Criteria

1. **Reduced public shape is enforced**
   - Given the transfer circuit tests use the updated fixtures
   - When they construct transfer public inputs
   - Then they include only `pkB`, `pks`, `encBalanceSender`, `encBalanceToUpdateReceiver`, and `encTotal`

2. **Reduced private shape is enforced**
   - Given the transfer circuit tests use the updated fixtures
   - When they construct transfer private inputs
   - Then they include `pvkB`, `plainBalance`, `amounts`, `total`, `rReceiver`, and `rTotal` only

3. **Proof regressions remain covered**
   - Given the reduced transfer proof fixtures
   - When the test suite runs roundtrip, commitment-length, and tampered-proof cases
   - Then the assertions still cover success and failure behavior for the new layout

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running the test suite
   - Then all tests for this task pass

## Metadata
- **Complexity**: Medium
- **Labels**: crypto, testing, zk, tdd
- **Required Skills**: TypeScript, Vitest, transfer proof serialization
