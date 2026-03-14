---
status: completed
created: 2026-03-14
started: 2026-03-14
completed: 2026-03-14
---
# Task: Update frontend transfer flow

## Description
Remove sender-side per-recipient ciphertext generation from the Next.js transfer page and update the proof and contract submission flow to use only receiver ciphertexts plus `encTotal`.

## Background
The frontend currently mirrors the removed sender array through encryption, proof construction, and typed contract invocation. After the crypto and Solidity surfaces change, the transfer page must align so the user-facing flow compiles and encodes the reduced call correctly.

## Reference Documentation
**Required:**
- Design: .agents/scratchpad/implementation/remove-enc-balance-sender/design.md

**Additional References:**
- .agents/scratchpad/implementation/remove-enc-balance-sender/context.md (codebase patterns)
- .agents/scratchpad/implementation/remove-enc-balance-sender/plan.md (overall strategy)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Update `packages/nextjs/app/transfer/page.tsx` to stop generating sender-key per-recipient ciphertexts.
2. Remove `rSender` plumbing from the `proveTransfer` call.
3. Keep receiver-key ciphertext generation, `encTotal` generation, and the rest of the UX flow intact.
4. Submit only recipients, receiver ciphertexts, `encTotal`, commitment, and proof inputs through the typed contract call.

## Dependencies
- Task 02: `.agents/scratchpad/implementation/remove-enc-balance-sender/tasks/task-02-implement-reduced-crypto-transfer-surface.code-task.md`
- Task 03: `.agents/scratchpad/implementation/remove-enc-balance-sender/tasks/task-03-update-solidity-transfer-abi-and-generated-metadata.code-task.md`

## Implementation Approach
1. TDD: Adjust the transfer page to the reduced crypto and ABI types so frontend type-checking exposes remaining legacy references.
2. Implement the minimal flow changes needed to remove sender-array generation and submission.
3. Refactor unused imports and local helpers while keeping the page behavior unchanged for users.

## Acceptance Criteria

1. **Frontend proof inputs are reduced**
   - Given the transfer page prepares proof inputs
   - When it constructs the transfer witness and public inputs
   - Then it no longer includes `encBalanceToUpdateSender` or `rSender`

2. **Frontend contract call is reduced**
   - Given a transfer is submitted from the page
   - When the typed write call is encoded
   - Then it passes only recipients, receiver ciphertexts, `encTotal`, commitment, and proof inputs

3. **Frontend validation stays green**
   - Given the reduced transfer flow is implemented
   - When Next.js type-check and build commands run
   - Then they pass against the regenerated ABI metadata

4. **Unit Tests Pass**
   - Given the implementation is complete
   - When running the test suite
   - Then all tests for this task pass

## Metadata
- **Complexity**: Medium
- **Labels**: nextjs, frontend, typescript, abi
- **Required Skills**: Next.js, TypeScript, Scaffold-ETH hooks, frontend build validation
