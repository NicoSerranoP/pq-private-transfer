# Requirements — Remove `enc_balance_to_update_sender`

## Overview

This change simplifies the transfer protocol so sender deduction is represented only by `enc_total`.
The protocol, proof public-input serialization, contract ABI, frontend caller flow, and tests all move to the new shape together.
Backward compatibility with the old transfer layout is intentionally out of scope for this repository change.

## Consolidated requirements

1. The transfer protocol surface must remove `enc_balance_to_update_sender[N]` entirely.

2. The transfer private witness must remove `r_sender[N]` and any generation of per-recipient sender-key ciphertexts.

3. Transfer correctness must continue to be enforced by the remaining constraints:
   - decrypt sender balance
   - enforce `0 <= total <= plaintext_balance_B`
   - enforce `sum(amounts[i]) == total`
   - enforce `amounts[i] >= 0`
   - prove each recipient update ciphertext encrypts `amount_i` under the corresponding recipient public key
   - prove `enc_total == Encrypt(total, pkB, r_total)`

4. Transfer constraint 8, the homomorphic sum check over `enc_balance_to_update_sender[N]`, must be removed entirely rather than retained as a hidden internal check.

5. The transfer call surface becomes conceptually:

   ```
   transfer(recipients[4], encBalanceToUpdateReceiver[4], encTotal, proof)
   ```

   In the current repo that maps to the existing proof fields and commitment/proof input arguments, but without the sender ciphertext array.

6. The proof public-input serialization for transfer must change accordingly:
   - old layout included `encBalanceToUpdateSender[4]`
   - new layout excludes it
   - old transfer proofs are therefore incompatible with the new verifier/public-input layout

7. The Solidity ABI for `PrivateTransfer.transfer` must remove the sender ciphertext array argument.

8. The frontend transfer flow must stop computing, proving, serializing, and submitting `encBalanceToUpdateSender`.

9. Repository documentation must be updated to reflect:
   - the reduced calldata footprint
   - the simplified transfer data structure
   - the updated public/private inputs and constraints
   - the intentional breaking-change compatibility posture

10. Tests must be updated repo-wide so the new transfer surface is the only supported one, including crypto serialization tests and contract tests.

## Non-requirements

- No dual-layout support for old and new transfer proofs.
- No migration shim, version-tagged proof format, or alternate transfer entrypoint.
- No replacement hidden witness structure solely to preserve the removed homomorphic-sum check.
