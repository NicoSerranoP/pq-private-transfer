# Context — Remove `enc_balance_to_update_sender`

## Summary

The approved design matches the repo structure closely.
The change is concentrated in five source surfaces plus generated ABI outputs:

1. `docs/Protocol_Design.md`
2. `packages/crypto/src/stark/transferCircuit.ts`
3. `packages/crypto/src/stark/transferCircuit.test.ts`
4. `packages/hardhat/contracts/PrivateTransfer.sol`
5. `packages/hardhat/test/PrivateTransfer.test.ts`
6. `packages/nextjs/app/transfer/page.tsx`
7. `packages/nextjs/contracts/deployedContracts.ts` and any regenerated Hardhat deployment/build artifacts

## Integration points

### 1. Protocol docs

- `docs/Protocol_Design.md:26-33` still budgets 32 KB for `enc_balance_to_update_sender[4]` and totals transfer ciphertext calldata at about 72 KB.
- `docs/Protocol_Design.md:49-55` and `docs/Protocol_Design.md:95-129` still model the removed transfer output, witness randomness, and constraint 8.
- `docs/Protocol_Design.md:249-297` still documents the old Solidity `transfer` signature and length check.
- `docs/Protocol_Design.md:317-325` still cites constraints `3 + 8` for the “No inflation” property.

### 2. Crypto serialization and type surface

- `packages/crypto/src/stark/transferCircuit.ts:5-22` is the authoritative TypeScript type surface for transfer proof inputs.
- `packages/crypto/src/stark/transferCircuit.ts:24-40` is the byte-layout definition that must shrink by four serialized ciphertexts once the sender array is removed.
- `packages/crypto/src/index.ts:17-18` re-exports these transfer types/functions, so downstream compile failures will naturally identify remaining callers.

### 3. Solidity ABI and behavior

- `packages/hardhat/contracts/PrivateTransfer.sol:135-142` is the transfer entrypoint to simplify from six arguments to five.
- `packages/hardhat/contracts/PrivateTransfer.sol:143-145` is the only contract logic that directly depends on the removed sender array; the rest of the function already operates solely on `encTotal` and receiver ciphertexts.
- The remaining transfer invariants to preserve are in `packages/hardhat/contracts/PrivateTransfer.sol:145-184`: sender registration, pool-size minimum, recipient validation, nullifier replay prevention, sender debit with `encTotal`, and recipient credits with `encBalanceToUpdateReceiver`.

### 4. Frontend proving/submission flow

- `packages/nextjs/app/transfer/page.tsx:160-178` currently performs three encryption steps: receiver updates, sender updates, and `encTotal`.
- `packages/nextjs/app/transfer/page.tsx:180-198` passes `encBalanceToUpdateSender` and `rSender` into `proveTransfer`.
- `packages/nextjs/app/transfer/page.tsx:202-212` submits the removed array through the typed `transfer` contract call.

Builder guidance:

- Remove only the sender-array path.
- Keep the registered-user discovery, dummy selection, balance decryption, recipient-key fetch, `encTotal` encryption, and commitment/proof submission flow intact.
- After deleting `rSender`, the remaining placeholder witness fields (`rReceiver`, `rTotal`) can stay in the current mock style unless the builder chooses a clearer typed representation already used nearby.

### 5. Tests and validation coverage

- `packages/crypto/src/stark/transferCircuit.test.ts:12-117` should be updated first or alongside the implementation because it directly asserts the serialization shape.
- `packages/hardhat/test/PrivateTransfer.test.ts:227-391` contains every contract transfer call site that must switch to the new ABI.
- The existing contract tests already cover the one length check that should remain (`recipients.length == encBalanceToUpdateReceiver.length`), so coverage can be preserved with simpler fixtures.

## Constraints and considerations

### On-chain verifier is a prototype mock

- `packages/hardhat/contracts/verifiers/TransferVerifier.sol:4-10` only checks for non-zero commitment and non-empty proof inputs.

Why this matters:

- Solidity tests will **not** detect a mismatch between the new calldata ABI and the reduced crypto proof serialization.
- The binding compatibility checks live in crypto tests, frontend typing, and frontend build/type-check validation.
- Builders should not rely on contract tests alone to validate this change.

### ABI metadata is generated and checked in

- `packages/hardhat/scripts/generateTsAbis.ts:160-182` writes `packages/nextjs/contracts/deployedContracts.ts`.
- `packages/nextjs/contracts/deployedContracts.ts:252-289` currently exposes the old transfer ABI to all Scaffold-ETH hooks.

Why this matters:

- If the Solidity signature changes without regenerating the checked-in metadata, the frontend will keep encoding the old call surface.
- Prefer refreshing this file via the normal Hardhat compile/deploy generation path; if a manual edit is temporarily needed to keep the repo green, it should still be reconciled with generated output before handoff.

### Generated Hardhat deployment/build artifacts may also carry the old signature

- `packages/hardhat/ignition/deployments/chain-31337/build-info/solc-0_8_30-a93cbe9086382cdf97059c8f24a6c803385dc3a8.json:40` still contains the old source snapshot/signature.

Why this matters:

- Search results after the source change may still show `encBalanceToUpdateSender` inside generated artifacts until Hardhat regeneration runs.
- Treat those as generated outputs; do not let them distract from the primary source edits.

## Recommended builder validation

Run the repo’s existing commands with emphasis on the surfaces that actually bind this change:

1. `pnpm --filter @pq/crypto test`
2. `pnpm --filter @pq/crypto check-types`
3. `pnpm compile`
4. `pnpm hardhat:test`
5. `pnpm next:check-types`
6. `pnpm next:build`

Rationale:

- The design-review concern about “optional” frontend compile verification should be resolved concretely here: root `pnpm compile` only covers Hardhat, not Next.js.
- `pnpm next:build` or at minimum `pnpm next:check-types` is needed to verify the typed frontend call path against regenerated ABI metadata.
