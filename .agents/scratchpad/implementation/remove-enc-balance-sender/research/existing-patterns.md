## Existing Patterns

### Protocol documentation defines the current transfer surface and constraint set

- `docs/Protocol_Design.md:26-33` quantifies current calldata with both receiver and sender ciphertext arrays, totaling about 72 KB.
- `docs/Protocol_Design.md:49-55` defines `Transfer` with `enc_balance_to_update_receiver[N]`, `enc_balance_to_update_sender[N]`, `enc_total`, and `proof`.
- `docs/Protocol_Design.md:95-129` defines transfer private inputs with `r_sender[N]`, public outputs with `enc_balance_to_update_sender[N]`, and constraint 8 as `HomomorphicSum(enc_balance_to_update_sender[N]) == enc_total`.
- `docs/Protocol_Design.md:249-297` shows the example Solidity `transfer` surface with both ciphertext arrays and a dual length check before sender deduction via `encTotal`.
- `docs/Protocol_Design.md:317-325` currently attributes “No inflation” to constraints `3 + 8`, so the security-properties table also needs to move to the reduced constraint set.

### Crypto transfer serialization is a plain concatenation over the public inputs

- `packages/crypto/src/stark/transferCircuit.ts:5-22` defines `TransferPublicInputs` with `encBalanceToUpdateSender` and `TransferPrivateInputs` with `rSender`.
- `packages/crypto/src/stark/transferCircuit.ts:24-40` serializes transfer public inputs in this exact order:
  1. `pkB`
  2. recipient `pks[4]`
  3. `encBalanceSender`
  4. `encBalanceToUpdateReceiver[4]`
  5. `encBalanceToUpdateSender[4]`
  6. `encTotal`
- `packages/crypto/src/stark/transferCircuit.ts:47-67` shows the mock prover/verifier pattern: `proveTransfer` hashes serialized public inputs, and `verifyTransfer` recomputes the same byte sequence plus the commitment hash.

### Frontend transfer flow mirrors the crypto type surface directly

- `packages/nextjs/app/transfer/page.tsx:49-56` uses `useScaffoldEventHistory` on `Registered` for dummy-recipient selection and `useScaffoldWriteContract` for submission.
- `packages/nextjs/app/transfer/page.tsx:96-111` filters registered users into dummy candidates and requires `N - 1` alternatives before proving.
- `packages/nextjs/app/transfer/page.tsx:137-147` fetches dummy public keys with `publicClient.readContract({ functionName: "accounts" })`.
- `packages/nextjs/app/transfer/page.tsx:149-178` builds the 4-slot recipient pool, encrypts receiver updates, encrypts the removed sender array separately, and encrypts `encTotal`.
- `packages/nextjs/app/transfer/page.tsx:180-212` calls `proveTransfer` with both ciphertext arrays and submits `transfer(recipients, encReceiver, encSender, encTotal, commitment, proofInputs)` through the typed Scaffold-ETH hook.

### Solidity transfer logic already uses only `encTotal` for sender deduction

- `packages/hardhat/contracts/PrivateTransfer.sol:126-145` documents the current ABI with `encBalanceToUpdateSender` and rejects length mismatch if either ciphertext array length differs from `recipients.length`.
- `packages/hardhat/contracts/PrivateTransfer.sol:146-167` preserves the rest of the transfer invariants independently of the removed sender array: registered sender check, pool-size check, recipient registration/distinctness checks, and commitment replay protection.
- `packages/hardhat/contracts/PrivateTransfer.sol:169-184` deducts the sender with `RingRegev.sub(accounts[msg.sender].encryptedBalance, encTotal)` and credits recipients only with `encBalanceToUpdateReceiver[i]`. The removed sender array is not consumed after the initial length check.

### Tests use explicit fixtures that should be reduced rather than reshaped

- `packages/crypto/src/stark/transferCircuit.test.ts:12-47` constructs positive transfer fixtures with `rSender`, `encBalanceToUpdateSender`, and `encTotal`, then round-trips through `proveTransfer`/`verifyTransfer`.
- `packages/crypto/src/stark/transferCircuit.test.ts:50-117` repeats the same public/private fixture shape for proof-commitment and tampering tests, so the cleanup should remain a fixture simplification rather than a test rewrite.
- `packages/hardhat/test/PrivateTransfer.test.ts:227-391` exercises the transfer contract with helper ciphertext arrays and covers the success path, event emission, length mismatch, sender/recipient registration failures, invalid proof, invalid recipients, insufficient pool, and replay protection. Every call site currently passes the removed sender array.

### Generated frontend contract metadata is checked in and typed against the current ABI

- `packages/nextjs/contracts/deployedContracts.ts:252-289` includes the `transfer` ABI entry with six inputs, including `encBalanceToUpdateSender`.
- `packages/nextjs/utils/scaffold-eth/contract.ts:32` and related Scaffold-ETH hooks load `deployedContracts.ts`, so stale ABI metadata will immediately propagate into frontend typing and runtime encoding.
