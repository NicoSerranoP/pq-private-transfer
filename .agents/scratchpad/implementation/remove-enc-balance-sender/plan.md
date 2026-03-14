# Implementation Plan — Remove `enc_balance_to_update_sender`

## Scope

Implement the approved breaking change that removes `enc_balance_to_update_sender[N]`, `r_sender[N]`, and transfer constraint 8, leaving `enc_total` as the only sender-deduction ciphertext across docs, crypto serialization, Solidity ABI, frontend callers, generated ABI metadata, and tests.

## Test Strategy

### Unit tests

#### `packages/crypto/src/stark/transferCircuit.test.ts`

1. `prove/verify roundtrip succeeds without sender array`
   - Build `TransferPublicInputs` with `pkB`, `pks`, `encBalanceSender`, `encBalanceToUpdateReceiver`, and `encTotal` only.
   - Build `TransferPrivateInputs` with `pvkB`, `plainBalance`, `amounts`, `total`, `rReceiver`, and `rTotal` only.
   - Expect `verifyTransfer(pub, proveTransfer(pub, priv)) === true`.

2. `proof commitment remains 32 bytes`
   - Rebuild the minimal proof fixture with the reduced public/private shapes.
   - Expect `proof.commitment.length === 32`.

3. `tampered proof still fails verification`
   - Rebuild the reduced fixture, mutate the commitment, and expect `verifyTransfer` to return `false`.

4. `serialized transfer public inputs no longer require sender ciphertexts`
   - If the current tests do not already make this explicit, add an assertion that the reduced public shape is sufficient for proof generation and verification.
   - This is the regression that protects the new proof byte layout because the Solidity transfer verifier is only a mock.

### Integration tests

#### `packages/hardhat/test/PrivateTransfer.test.ts`

1. `transfer updates sender and recipient balances with the new ABI`
   - Call `transfer(recipients, encReceiver, encTotal, commitment, proofInputs)`.
   - Expect sender debit and recipient credit behavior to remain unchanged.

2. `remaining length check still reverts`
   - Call `transfer` with `recipients.length !== encBalanceToUpdateReceiver.length`.
   - Expect `LengthMismatch`.

3. `existing transfer guards remain intact with the new signature`
   - Keep the current rejection coverage for:
     - sender not registered
     - recipient not registered
     - invalid proof
     - sender included as recipient
     - duplicate recipients
     - insufficient pool
     - reused commitment

#### ABI and frontend integration

1. Regenerate `packages/nextjs/contracts/deployedContracts.ts` from the normal Hardhat flow after the Solidity signature changes.
2. Validate that the typed frontend contract call compiles against the regenerated ABI with:
   - `pnpm next:check-types`
   - `pnpm next:build`

### E2E scenario

#### Harness

Real CLI/API commands with the local SE-2 stack.

#### Scenario

1. Run `pnpm chain`.
2. Run `pnpm deploy` so the updated `PrivateTransfer` ABI and generated frontend contract metadata are in sync.
3. Run `pnpm start`.
4. In the browser, connect a local account, register enough users for the pool, and submit a transfer with one real recipient plus three dummies.
5. Expect the transfer transaction to succeed, the sender to be debited via `encTotal`, and the `Transferred` event to include the submitted recipient list.
6. Adversarial attempt: submit a second transfer reusing the same proof commitment payload.
7. Expect the second attempt to fail with the existing replay protection instead of accepting the reused commitment.

This scenario proves the full path still works after the breaking change: frontend proof construction, reduced ABI encoding, contract execution, and replay protection.

## Implementation Steps

### Step 1: Lock the reduced transfer proof API in crypto tests

- Files:
  - `packages/crypto/src/stark/transferCircuit.test.ts`
- Tests to write/update:
  - `prove/verify roundtrip succeeds without sender array`
  - `proof commitment remains 32 bytes`
  - `tampered proof still fails verification`
  - any explicit serialization-shape assertion needed to protect the reduced layout
- Integrates with:
  - the approved design's new `TransferPublicInputs` / `TransferPrivateInputs` contract
- Success criteria:
  - crypto tests clearly describe the new five-field public shape and no longer mention `encBalanceToUpdateSender` or `rSender`
  - tests fail against the old implementation
- Demo:
  - the repo has an executable failing test definition for the reduced transfer proof shape

### Step 2: Implement the reduced crypto surface and keep package validation green

- Files:
  - `packages/crypto/src/stark/transferCircuit.ts`
  - `packages/crypto/src/index.ts` if re-export updates are needed
- Implementation:
  - remove `encBalanceToUpdateSender` from `TransferPublicInputs`
  - remove `rSender` from `TransferPrivateInputs`
  - shrink `serializeTransferPublic` to omit the sender array
  - update any helper logic/types so `proveTransfer` and `verifyTransfer` use the reduced layout only
- Tests/validation:
  - `pnpm --filter @pq/crypto test`
  - `pnpm --filter @pq/crypto check-types`
- Connects to:
  - Step 1's failing crypto tests
  - downstream contract/frontend callers that consume the transfer types
- Success criteria:
  - crypto package passes tests and type-checking using only the new transfer proof layout
- Demo:
  - a reduced transfer proof can be generated and verified locally without sender-side per-recipient ciphertexts

### Step 3: Update Solidity transfer ABI, contract tests, and generated ABI outputs

- Files:
  - `packages/hardhat/contracts/PrivateTransfer.sol`
  - `packages/hardhat/test/PrivateTransfer.test.ts`
  - regenerated Hardhat artifacts, including `packages/nextjs/contracts/deployedContracts.ts`
- Implementation:
  - change `transfer` to accept `recipients`, `encBalanceToUpdateReceiver`, `encTotal`, `commitment`, and `proofInputs`
  - remove the sender-array length check and keep the receiver-array length check
  - preserve sender debit, recipient credits, replay protection, pool-size checks, and recipient validation
  - update all Hardhat test call sites to the new ABI
  - regenerate checked-in ABI metadata from the normal Hardhat flow
- Tests/validation:
  - `pnpm compile`
  - `pnpm hardhat:test`
- Connects to:
  - Step 2's reduced crypto surface
  - typed frontend metadata consumed by the Next.js app
- Success criteria:
  - contract tests pass with the new ABI
  - generated ABI metadata reflects the five-argument transfer entrypoint
- Demo:
  - the contract accepts transfers without `encBalanceToUpdateSender` and all existing on-chain transfer protections still pass their tests

### Step 4: Update the frontend transfer flow to stop generating sender-side per-recipient ciphertexts

- Files:
  - `packages/nextjs/app/transfer/page.tsx`
- Implementation:
  - remove sender-key per-recipient encryption generation
  - remove `rSender` plumbing from `proveTransfer`
  - keep recipient ciphertext generation and `encTotal` generation
  - submit only `recipients`, `encBalanceToUpdateReceiver`, `encTotal`, `commitment`, and `proofInputs`
- Tests/validation:
  - `pnpm next:check-types`
  - `pnpm next:build`
- Connects to:
  - Step 3's regenerated ABI metadata
  - Step 2's updated crypto transfer types
- Success criteria:
  - the Next.js transfer page compiles cleanly against the reduced proof and contract surfaces
- Demo:
  - the frontend can prepare and encode the new transfer call without any reference to the removed sender array

### Step 5: Update protocol documentation to match the shipped implementation

- Files:
  - `docs/Protocol_Design.md`
- Implementation:
  - remove the sender-array calldata line item and reduce the transfer ciphertext total
  - remove `enc_balance_to_update_sender[N]` from transfer structures and public outputs
  - remove `r_sender[N]` from private inputs
  - delete transfer constraint 8 and related explanatory text
  - update the Solidity transfer signature and any prose that still cites the old sender-array consistency path
- Tests/validation:
  - documentation review against the implemented source changes from Steps 2-4
- Connects to:
  - the final reduced protocol surface now enforced in code and tests
- Success criteria:
  - docs describe the same transfer model, calldata estimate, and ABI that the code now implements
- Demo:
  - a reader can follow `docs/Protocol_Design.md` and derive the same `transfer(recipients, encBalanceToUpdateReceiver, encTotal, proof)` surface used in code

## Final Validation Gate

The implementation wave should not be considered complete until all of the following pass:

1. `pnpm --filter @pq/crypto test`
2. `pnpm --filter @pq/crypto check-types`
3. `pnpm compile`
4. `pnpm hardhat:test`
5. `pnpm next:check-types`
6. `pnpm next:build`

## Handoff Notes

1. Treat compatibility as intentionally broken. Do not add dual-layout parsing or ABI shims.
2. Do not keep a hidden/internal version of constraint 8; remove it completely with the sender-array witness structure.
3. Because `TransferVerifier.sol` is a mock, the crypto tests and frontend build are the authoritative regression checks for layout drift.
