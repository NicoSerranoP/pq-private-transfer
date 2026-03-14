---
status: completed
created: 2026-03-14
started: 2026-03-14
completed: 2026-03-14
---
# Task: Sync protocol documentation

## Description
Update the protocol design documentation so it matches the shipped implementation that removes `enc_balance_to_update_sender`, `r_sender`, and transfer constraint 8.

## Background
`docs/Protocol_Design.md` is the source of truth for the protocol design. It still describes the legacy transfer structure, calldata budget, witness randomness, constraint numbering, and Solidity transfer surface. The documentation must be brought in line with the implemented breaking change.

## Reference Documentation
**Required:**
- Design: .agents/scratchpad/implementation/remove-enc-balance-sender/design.md

**Additional References:**
- .agents/scratchpad/implementation/remove-enc-balance-sender/context.md (codebase patterns)
- .agents/scratchpad/implementation/remove-enc-balance-sender/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Update `docs/Protocol_Design.md` transfer calldata estimates to remove the sender-array line item and reduce the total.
2. Remove `enc_balance_to_update_sender[N]` from the transfer data structure and public outputs.
3. Remove `r_sender[N]` from transfer private inputs.
4. Delete transfer constraint 8 and update surrounding prose and Solidity call examples to the reduced transfer surface.

## Dependencies
- Task 02: `.agents/scratchpad/implementation/remove-enc-balance-sender/tasks/task-02-implement-reduced-crypto-transfer-surface.code-task.md`
- Task 03: `.agents/scratchpad/implementation/remove-enc-balance-sender/tasks/task-03-update-solidity-transfer-abi-and-generated-metadata.code-task.md`
- Task 04: `.agents/scratchpad/implementation/remove-enc-balance-sender/tasks/task-04-update-frontend-transfer-flow.code-task.md`

## Implementation Approach
1. TDD: Compare the current protocol document against the implemented crypto, contract, and frontend surfaces to identify stale references.
2. Implement the minimal documentation edits needed to describe the reduced transfer model accurately.
3. Refactor nearby prose for clarity while preserving the existing document structure and intent.

## Acceptance Criteria

1. **Transfer model matches code**
   - Given the documentation is updated
   - When a reader inspects the transfer structure, witness inputs, and public outputs
   - Then they see only the reduced sender-deduction path using `enc_total`

2. **Calldata and constraints are corrected**
   - Given the documentation is updated
   - When a reader reviews calldata estimates and transfer constraints
   - Then the removed sender-array budget and constraint 8 are gone

3. **Documented ABI matches implementation**
   - Given the contract and frontend have been updated
   - When the protocol document describes the transfer call surface
   - Then it matches the reduced ABI used in code

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running the test suite
   - Then all tests for this task pass

## Metadata
- **Complexity**: Low
- **Labels**: docs, protocol, breaking-change
- **Required Skills**: Technical writing, protocol consistency, repo documentation
