# Idea Honing

## Q1 (iteration 1)

When removing `enc_balance_to_update_sender[N]` from the public outputs, should the circuit still internally compute and verify the homomorphic sum (i.e., keep constraint 8 as a private/internal check), or should the constraint be removed entirely since enc_total is already proven to be a valid encryption of the correct total via constraints 3 and 7?

Recorded: 2026-03-14

## Q2 (iteration 2)

Can this change break compatibility with existing transfer proofs/callers, or must the repo support both the old and new transfer public-output layouts during a migration period?

### A2

Yes — removing `enc_balance_to_update_sender[N]` is a breaking compatibility change for the current transfer proof/call surface.

Why:
- `docs/Protocol_Design.md` defines `enc_balance_to_update_sender[N]` as part of the transfer public outputs today.
- `packages/crypto/src/stark/transferCircuit.ts` serializes those sender ciphertexts directly into the transfer proof public input byte layout, so existing proofs are bound to the old layout.
- `packages/hardhat/contracts/PrivateTransfer.sol` exposes `transfer(recipients, encBalanceToUpdateReceiver, encBalanceToUpdateSender, encTotal, commitment, proofInputs)`, so existing callers and generated ABIs expect that argument.
- `packages/nextjs/app/transfer/page.tsx` currently generates and submits the sender ciphertext array, so the frontend is also wired to the old shape.

Recommended requirement for this repo: do **not** support both layouts in parallel unless there is an explicit migration requirement outside this repository.

Reasoning:
- This repo is a prototype with a single mocked verifier path, a single proof serialization format, and a single contract/frontend ABI path.
- Carrying both layouts would add versioning complexity across the crypto package, verifier/public-input serialization, contract ABI, frontend caller, tests, and docs.
- The simpler and safer repo-level change is to update all components atomically to the new layout and treat old proofs/callers as incompatible.

Migration note:
- Any proof generated with the old public-input layout will no longer verify against the new layout.
- Any caller built against the old `transfer` ABI will need to be regenerated or updated.
- If backward compatibility is required later, it should be an explicit design decision with proof-version tagging or dual entrypoints/verifiers, not an implicit requirement of this change.

Recorded: 2026-03-14T18:58:00Z

## 2026-03-14
- Question: Should transfer circuit constraint 8 remain as an internal homomorphic-sum check after removing enc_balance_to_update_sender from public outputs, or should it be removed entirely because constraints 3 and 7 already prove enc_total?

### A1

Remove transfer constraint 8 entirely; do **not** keep it as an internal/private-only homomorphic-sum check.

Why:
- After removing `enc_balance_to_update_sender[N]` from the transfer public outputs, there is no remaining on-chain-consumed artifact that needs the per-recipient sender-key ciphertexts.
- The actual safety property the contract relies on is only that sender deduction uses the correct `enc_total`, and that is already enforced by the remaining transfer constraints:
  - constraint 3 binds `total` to `sum(amounts[i])`
  - constraint 7 binds `enc_total` to `Encrypt(total, pkB, r_total)`
- Keeping a hidden/internal version of `enc_balance_to_update_sender[N]` solely to preserve constraint 8 would not strengthen the proof in a meaningful way; it would just duplicate the same witness relation through an extra intermediate ciphertext array that the contract never reads.
- The receiver ciphertexts cannot replace this homomorphic check because they are encrypted under recipient public keys, not `pkB`, so they are not algebraically composable into `enc_total` under the sender key.

Requirement impact:
- Remove transfer public output `enc_balance_to_update_sender[N]`.
- Remove transfer private inputs `r_sender[N]` and any witness generation for sender-key per-recipient ciphertexts.
- Remove transfer constraint 8 altogether rather than keeping a private-only variant.
- Retain the proof obligations that matter for correctness: decrypt sender balance, enforce `total <= balance`, enforce `sum(amounts) == total`, produce valid recipient ciphertexts, and prove `enc_total == Encrypt(total, pkB, r_total)`.

This should be treated as the intended repo-wide simplification: the protocol moves from "prove per-recipient sender-key ciphertexts sum to enc_total" to "prove enc_total is the encryption of the already-constrained total".

Recorded: 2026-03-14T18:58:03Z
