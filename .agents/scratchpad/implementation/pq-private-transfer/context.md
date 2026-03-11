# Implementation Context — PQ Private Transfer

## Summary

**Updated after design.approved event (2026-03-11).** Design approved. Significant work already done.
See current state below — gaps identified that need the Builder phase.

## ✅ ALREADY DONE

### packages/crypto/ — COMPLETE
- `src/types.ts` — Polynomial, Ciphertext, PublicKey, SecretKey, ZKProof
- `src/ringRegev.ts` — keygen, encrypt, decrypt, add, sub, homomorphicSum, serialize/deserialize  
- `src/stark/depositCircuit.ts` — proveDeposit, verifyDeposit with SHA-256 mock
- `src/stark/transferCircuit.ts` — proveTransfer, verifyTransfer
- `src/stark/withdrawCircuit.ts` — proveWithdraw, verifyWithdraw
- `src/index.ts` — re-exports everything
- `src/ringRegev.test.ts`, `src/stark/*.test.ts` — tests using `node:test`
- `package.json` — `@noble/hashes` dep, `tsx` test runner
- `tsconfig.json` — ESM

### packages/hardhat/contracts/ — COMPLETE
- `RingRegev.sol` — `add()` and `sub()` library functions, 4-byte LE encoding
- `verifiers/DepositVerifier.sol`, `TransferVerifier.sol`, `WithdrawVerifier.sol` — mock verifiers
- `test/RingRegevHarness.sol` — test wrapper for library functions
- `PrivateTransfer.sol` — `register()`, `withdraw()`, `transfer()` (see GAPS below)
- `ignition/modules/PrivateTransfer.ts` — Hardhat Ignition deploy module

### packages/hardhat/test/ — COMPLETE
- `RingRegev.test.ts` — add/sub identity, overflow/underflow, length validation
- `Verifiers.test.ts` — parameterized accept/reject tests for all 3 verifiers
- `PrivateTransfer.test.ts` — register, withdraw, transfer basic coverage

### packages/nextjs/ — COMPLETE
- `app/register/page.tsx`, `app/transfer/page.tsx`, `app/withdraw/page.tsx` — full pages
- `utils/pq/amounts.ts` — AMOUNT_SCALE, weiToUnits, unitsToWei, toHex, toBytes32
- `utils/pq/keyStorage.ts` — saveSecretKey, loadSecretKey, hasSecretKey, removeSecretKey
- `contracts/deployedContracts.ts` — PrivateTransfer ABI manually maintained (address=0x000)
- `next.config.ts` — transpilePackages + extensionAlias for @pq/crypto

---

## ❌ GAPS — What the Builder must implement

### 1. PrivateTransfer.sol — Missing features (HIGH PRIORITY)
File: `packages/hardhat/contracts/PrivateTransfer.sol`

| Gap | Design ref |
|-----|-----------|
| `deposit()` function missing | Design 4.4 |
| `totalRegistered` state variable missing | Design 4.4 |
| Pool size check `totalRegistered >= 5` in `transfer()` missing | Design 4.4 |
| Duplicate recipient check in `transfer()` missing | Design 4.4 |
| Self-recipient check (`recipients[i] != msg.sender`) missing | Design 4.4 |
| `usedTransfers` nullifier mapping missing (double-spend prevention) | Design 4.4 |
| Custom errors: `InsufficientPool`, `InvalidRecipients`, `ZeroAmount`, `TransferAlreadyUsed`, `ETHTransferFailed` | Design 7 |
| `require(ok, "ETH transfer failed")` should be `if (!ok) revert ETHTransferFailed()` | Design 7 |

### 2. PrivateTransfer.test.ts — Missing tests
File: `packages/hardhat/test/PrivateTransfer.test.ts`

| Missing test | Design ref |
|-------------|-----------|
| Pool size check (`InsufficientPool`) in transfer | Design 8 |
| Duplicate recipients in transfer (`InvalidRecipients`) | Design 8 |
| Self as recipient in transfer (`InvalidRecipients`) | Design 8 |
| Double-spend prevention (`TransferAlreadyUsed`) | Design 8 |
| `deposit()` function: adds to balance, requires registration, invalid proof rejects | Design 8 |

### 3. deployedContracts.ts — ABI out of sync
File: `packages/nextjs/contracts/deployedContracts.ts`
- Must add `deposit()` function ABI entry after contract is updated
- Missing errors: `InsufficientPool`, `InvalidRecipients`, `ZeroAmount`, `TransferAlreadyUsed`, `ETHTransferFailed`

### 4. Frontend components — Not yet created
- `packages/nextjs/components/BalanceDisplay.tsx`
- `packages/nextjs/components/ProofStatus.tsx`
- `packages/nextjs/components/DummyPoolStatus.tsx`
- `packages/nextjs/workers/starkProver.worker.ts`
(Note: web worker integration is nice-to-have; current pages run proof sync without blocking UI indicator)

### 5. runHardhatDeployWithPK.ts — Hardcoded old module path
File: `packages/hardhat/scripts/runHardhatDeployWithPK.ts:10`
- Change `IGNITION_MODULE = "ignition/modules/SE2Token.ts"` → `"ignition/modules/PrivateTransfer.ts"`

---

## PRIORITY ORDER for Builder

1. **PrivateTransfer.sol** — add deposit(), totalRegistered, pool check, duplicate/self check, nullifier, custom errors (atomic, high value)
2. **PrivateTransfer.test.ts** — add missing test cases
3. **deployedContracts.ts** — sync ABI with updated contract
4. **runHardhatDeployWithPK.ts** — fix hardcoded module path
5. **Frontend components** — BalanceDisplay, ProofStatus, DummyPoolStatus (can be deferred)

---

---

## Integration Points

### 1. Hardhat Ignition (CRITICAL)
The project uses **Hardhat Ignition**, not hardhat-deploy.
- Deploy script: `packages/hardhat/scripts/runHardhatDeployWithPK.ts` hardcodes `ignition/modules/SE2Token.ts`
- Must create `packages/hardhat/ignition/modules/PrivateTransfer.ts` deploying:
  1. `DepositVerifier`
  2. `TransferVerifier`
  3. `WithdrawVerifier`
  4. `PrivateTransfer` (constructor takes 3 verifier addresses)
- Must update deploy script to reference `ignition/modules/PrivateTransfer.ts`
- After deploy, `generateTsAbis.ts` auto-generates `packages/nextjs/contracts/deployedContracts.ts`

### 2. packages/crypto (NEW PACKAGE)
- Does not exist — must create from scratch
- Workspace config (`packages/*`) auto-includes it
- Add to `packages/hardhat/package.json` and `packages/nextjs/package.json`:
  ```json
  "@pq/crypto": "workspace:*"
  ```
- Package name: `@pq/crypto`
- **SHA-256 for mock STARK**: use `@noble/hashes/sha256` — browser + Node compatible

### 3. OpenZeppelin ReentrancyGuard
- Available at `@openzeppelin/contracts/utils/ReentrancyGuard.sol` (v5.0.2)
- OZ v5 syntax: `import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol"`

### 4. Frontend (Next.js App Router)
- New pages go in `packages/nextjs/app/register/page.tsx`, etc.
- Worker: `packages/nextjs/workers/starkProver.worker.ts`
- Use `useScaffoldReadContract` / `useScaffoldWriteContract` (not the deprecated variants)
- BalanceDisplay reads `accounts[address]` struct from contract

---

## Constraints Discovered

1. **No `packages/crypto` yet** — full package setup required before any other work
2. **`hardhat-gas-reporter` not installed** — needed for Phase 3 success criteria; Builder must `pnpm add -D hardhat-gas-reporter` in hardhat package
3. **Ignition not hardhat-deploy** — all deployment scripts must use `buildModule` from `@nomicfoundation/hardhat-ignition/modules`
4. **Deploy script must be updated** — `runHardhatDeployWithPK.ts:10` hardcodes old module path
5. **Mocha+Chai, not Jest** — all test files use `describe/it/before` pattern, `expect(x).to.equal(y)` assertions
6. **ESM throughout hardhat** — imports in test files should use `.js` extensions or rely on tsx's resolution
7. **`bytes` in Solidity** — ciphertexts stored as `bytes`, not `uint32[1024]`; manual loop for deserialization (R13)
8. **PrivateTransfer constructor** — must accept 3 verifier contract addresses as constructor parameters
9. **No existing test files** — all contract tests start from scratch

---

## File Structure to Create

```
packages/
  crypto/                          ← NEW package
    package.json
    tsconfig.json
    src/
      types.ts
      ringRegev.ts
      stark/
        depositCircuit.ts
        transferCircuit.ts
        withdrawCircuit.ts

  hardhat/
    contracts/                     ← NEW files
      RingRegev.sol
      PrivateTransfer.sol
      verifiers/
        DepositVerifier.sol
        TransferVerifier.sol
        WithdrawVerifier.sol
    ignition/modules/
      PrivateTransfer.ts           ← NEW ignition module
    test/
      RingRegev.test.ts            ← NEW
      PrivateTransfer.test.ts      ← NEW
    scripts/
      runHardhatDeployWithPK.ts    ← MODIFY (update IGNITION_MODULE constant)

  nextjs/
    app/
      register/page.tsx            ← NEW
      transfer/page.tsx            ← NEW
      withdraw/page.tsx            ← NEW
    components/
      BalanceDisplay.tsx           ← NEW
      ProofStatus.tsx              ← NEW
      DummyPoolStatus.tsx          ← NEW
    workers/
      starkProver.worker.ts        ← NEW
```

---

## Implementation Order (for Planner)

1. **packages/crypto** — no dependencies; needed by all other phases
2. **Solidity contracts** — depends on crypto for test helpers
3. **Ignition module + deploy script update** — depends on contracts
4. **Contract tests** — depends on contracts + crypto
5. **Frontend pages/components** — depends on deployed contracts (ABI)

---

## Serialization Quick Reference (R13)

| Item | Bytes | Format |
|------|-------|--------|
| Polynomial (n=1024 coefficients) | 4096 | 4-byte LE per coeff |
| Ciphertext (a, b polynomials) | 8192 | a bytes || b bytes |
| PublicKey | 8192 | identical to Ciphertext |

TypeScript: `serializePolynomial(p: Polynomial): Uint8Array` — BigInt → 4-byte LE  
Solidity: `for (uint i = 0; i < 1024; i++) { poly[i] = uint32(uint8(data[i*4])) | (uint32(uint8(data[i*4+1])) << 8) | ... }`
