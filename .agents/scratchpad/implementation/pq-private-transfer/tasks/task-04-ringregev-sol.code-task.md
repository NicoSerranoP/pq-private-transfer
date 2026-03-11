---
status: completed
created: 2026-03-11
started: 2026-03-11
completed: 2026-03-11
---
# Task: RingRegev.sol + Tests

## Description
Implement `RingRegev.sol` — a Solidity library that performs coefficient-wise homomorphic addition and subtraction on Ring Regev ciphertexts. These operations are the on-chain HE primitives used by `PrivateTransfer.sol` to update encrypted balances.

## Background
The protocol stores balances as Ring Regev ciphertexts (~8KB each, serialized as `bytes`). On-chain operations are limited to `add` and `sub` — both are coefficient-wise mod `q=2²⁷=134217728`. Full polynomial multiplication is NOT needed on-chain (no keygen, no encrypt, no decrypt).

Ciphertext serialization: 4-byte little-endian per coefficient, 1024 coefficients per polynomial, 2 polynomials per ciphertext = 8192 bytes total. The library must parse this format using manual byte loops (not `abi.decode`, which pads uint32 to 32 bytes and is incompatible).

## Reference Documentation
**Required:**
- Design: .agents/scratchpad/implementation/pq-private-transfer/design.md

**Additional References:**
- .agents/scratchpad/implementation/pq-private-transfer/context.md (codebase patterns)
- .agents/scratchpad/implementation/pq-private-transfer/plan.md (overall strategy)
- packages/crypto/src/ringRegev.ts (TypeScript reference implementation)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. Solidity ^0.8.20, library (not contract)
2. `q = 134217728` (2²⁷) as a constant
3. `N = 1024` polynomial degree as a constant
4. Function `add(bytes memory a, bytes memory b) internal pure returns (bytes memory)` — coefficient-wise addition mod q
5. Function `sub(bytes memory a, bytes memory b) internal pure returns (bytes memory)` — coefficient-wise subtraction mod q (result always positive)
6. Manual 4-byte LE decoding: `uint32(uint8(data[i*4])) | (uint32(uint8(data[i*4+1])) << 8) | ...`
7. Manual 4-byte LE encoding for output
8. Revert with `InvalidCiphertextLength()` if either input is not 8192 bytes
9. Hardhat project in `packages/hardhat/` using Mocha+Chai test runner

## Dependencies
- Steps 1-3 complete (packages/crypto exists with types and ringRegev.ts)
- Hardhat project at `packages/hardhat/` (already scaffolded by SE-2)

## Implementation Approach
1. Write failing tests in `packages/hardhat/test/RingRegev.test.ts` covering all 6 test cases
2. Create `packages/hardhat/contracts/RingRegev.sol` with the library
3. Create a thin test harness contract `packages/hardhat/contracts/test/RingRegevHarness.sol` that wraps library calls (libraries with internal functions can't be called directly from tests)
4. Make tests pass; verify gas report output

## Acceptance Criteria

1. **Add identity**
   - Given an encrypted ciphertext `enc_a` and a fresh `enc_zero` (all coefficients 0)
   - When `RingRegev.add(enc_a, enc_zero)` is called
   - Then result equals `enc_a` coefficient-wise

2. **Sub identity**
   - Given an encrypted ciphertext `enc_a`
   - When `RingRegev.sub(enc_a, enc_a)` is called
   - Then result has all coefficients equal to 0

3. **Add output length**
   - Given two valid 8192-byte ciphertexts
   - When `add(a, b)` is called
   - Then returned bytes have length 8192

4. **Overflow mod q**
   - Given two ciphertexts where coefficient[0] sums to more than q
   - When `add(a, b)` is called
   - Then coefficient[0] in result equals `(a[0] + b[0]) % q` (wraps correctly)

5. **Underflow mod q**
   - Given ciphertext a where a[0] < b[0]
   - When `sub(a, b)` is called
   - Then coefficient[0] in result equals `(a[0] - b[0] + q) % q` (always positive)

6. **Length mismatch reverts**
   - Given one input with length ≠ 8192 bytes
   - When `add(a, b)` or `sub(a, b)` is called
   - Then transaction reverts with `InvalidCiphertextLength()`

7. **All unit tests pass**
   - Given the implementation is complete
   - When running `cd packages/hardhat && npx hardhat test --grep RingRegev`
   - Then all 6 test cases pass

## Metadata
- **Complexity**: Medium
- **Labels**: solidity, cryptography, library
- **Required Skills**: Solidity 0.8+, Hardhat, Ring Regev encoding
