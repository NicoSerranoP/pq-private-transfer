# PQ Private Transfer — Implementation Plan

## Test Strategy

### Unit Tests — TypeScript (`packages/crypto/`)

| Module | Test Cases |
|--------|-----------|
| `types.ts` | Compile check; correct structure of `Polynomial`, `Ciphertext`, `PublicKey`, `SecretKey`, `ZKProof` |
| `ringRegev.ts` — keygen | Returns `{ pk, sk }` with correct dimensions (pk.a.length == 1024, sk.length == 1024) |
| `ringRegev.ts` — encrypt/decrypt | Roundtrip: `decrypt(encrypt(m, pk), sk) == m` for m=0, m=1000, m=MAX |
| `ringRegev.ts` — HE.add | `decrypt(add(encrypt(a), encrypt(b))) == a + b` |
| `ringRegev.ts` — HE.sub | `decrypt(sub(encrypt(a), encrypt(b))) == a - b` |
| `ringRegev.ts` — homomorphicSum | `decrypt(homomorphicSum([e1,e2,e3,e4])) == sum` |
| `ringRegev.ts` — serialize | `deserializeCiphertext(serializeCiphertext(ct))` equals original |
| `ringRegev.ts` — serialize | Output length: 8192 bytes for ciphertext, 4096 bytes for polynomial |
| `depositCircuit.ts` | `prove()` returns `{ commitment, inputs }` with non-empty fields; `verify()` returns true for valid proof |
| `depositCircuit.ts` | `verify()` returns false for tampered commitment (zero bytes) |
| `depositCircuit.ts` | `verify()` returns false for empty inputs |
| `transferCircuit.ts` | prove/verify roundtrip succeeds |
| `transferCircuit.ts` | verify rejects malformed proof |
| `withdrawCircuit.ts` | prove/verify roundtrip succeeds |
| `withdrawCircuit.ts` | verify rejects malformed proof |

### Unit Tests — Solidity (`packages/hardhat/test/`)

**`RingRegev.test.ts`**

| Test | Description |
|------|-------------|
| `add identity` | `add(enc_a, enc_zero) == enc_a` (coefficient-wise) |
| `sub identity` | `sub(enc_a, enc_a) == enc_zero` |
| `add roundtrip` | `add(a, b)` produces correct serialized output length |
| `overflow mod q` | Adding coefficients that overflow wraps correctly mod `q=2²⁷` |
| `underflow mod q` | Subtracting yields positive result (modular arithmetic) |
| `mismatched length reverts` | `add` with different length inputs reverts |

**`Verifiers.test.ts`** (DepositVerifier, TransferVerifier, WithdrawVerifier — same three cases each)

| Test | Description |
|------|-------------|
| `accepts valid proof` | Well-formed proof (non-zero commitment, non-empty inputs) → true |
| `rejects zero commitment` | All-zero commitment bytes → false / InvalidProof |
| `rejects empty inputs` | Empty inputs field → false / InvalidProof |

**`PrivateTransfer.test.ts`**

| Function | Test Cases |
|----------|-----------|
| `register()` | Stores account (pk, initialBalance); increments `totalRegistered`; increments `totalDeposits` |
| `register()` | Reverts `AlreadyRegistered` on second call from same address |
| `register()` | Reverts `InvalidProof` if proof is malformed |
| `deposit()` | Reverts `NotRegistered` for unregistered caller |
| `deposit()` | Adds to balance via RingRegev.add; increments `totalDeposits` |
| `transfer()` | Reverts `InsufficientPool` when totalRegistered < 5 |
| `transfer()` | Reverts `InvalidRecipients` for unregistered recipient |
| `transfer()` | Reverts `InvalidRecipients` for duplicate recipient |
| `transfer()` | Reverts `InvalidRecipients` if sender is in recipients |
| `transfer()` | Updates sender balance (sub encTotal); updates all 4 recipient balances |
| `transfer()` | Reverts `TransferAlreadyUsed` on duplicate encTotal |
| `transfer()` | Reverts `InvalidProof` for tampered proof |
| `withdraw()` | Reverts `NotRegistered` for unregistered caller |
| `withdraw()` | Reverts `ZeroAmount` for amount=0 |
| `withdraw()` | Reverts `InsufficientContractBalance` when contract has no ETH |
| `withdraw()` | Sends ETH, updates encryptedBalance, decrements totalDeposits |
| `withdraw()` | Reentrancy: nonReentrant prevents reentrant call |

### Integration Test Scenarios

1. **Full register flow**: Register 6 accounts, verify all have stored pk + balance, totalRegistered=6
2. **Transfer pool check**: With 4 registered users, transfer reverts InsufficientPool; with 5+ it proceeds
3. **Double spend**: Register 5+ accounts, transfer once → succeeds; transfer with same encTotal → TransferAlreadyUsed

### E2E Test Scenario (Manual — Hardhat local network)

**Actors:** Alice (sender), Bob (real recipient), Carol/Dave/Eve (dummies), Frank (extra to meet pool=5 minimum)

**Steps:**
1. Start `pnpm chain` in background
2. Run `pnpm deploy` — PrivateTransfer deploys with 3 verifiers
3. Open frontend at `http://localhost:3000`
4. **Register Alice** on `/register` with 0.1 ETH — see `Registered` event, balance shows 0.1 ETH equivalent
5. **Register Bob, Carol, Dave, Eve, Frank** — pool shows ≥ 5 on Transfer page
6. **Transfer from Alice to Bob (0.05 ETH)** on `/transfer`:
   - System auto-selects 3 dummies from pool
   - STARK proof generated in Web Worker (ProofStatus spinner shown)
   - Tx succeeds, `Transferred` event emitted
   - Alice balance decreases; Bob balance increases; dummy balances unchanged (decrypt to same value)
7. **Bob withdraws 0.05 ETH** on `/withdraw`:
   - Bob decrypts balance, sees 0.05 ETH
   - Enters 0.05, proof generated, tx succeeds
   - Bob receives 0.05 ETH on-chain
8. **Adversarial: Double spend** — Alice submits same transfer proof again → tx reverts `TransferAlreadyUsed()`
9. **Adversarial: Unregistered recipient** — Transfer to random address → tx reverts `InvalidRecipients()`

**Expected outcome:** Full flow completes. On-chain observer sees equal-looking updates to all 4 recipient accounts and cannot identify Bob as the real recipient.

---

## Implementation Steps (TDD Order)

### Step 1: `packages/crypto` — Package Setup + Types
- **Files:** `packages/crypto/package.json`, `packages/crypto/tsconfig.json`, `packages/crypto/src/types.ts`
- **Tests:** `packages/crypto/src/types.test.ts` — import all types, verify expected shapes compile
- **Integrates with:** Nothing yet — standalone
- **Demo:** `cd packages/crypto && pnpm test` passes

### Step 2: `packages/crypto` — Ring Regev Core
- **Files:** `packages/crypto/src/ringRegev.ts`
- **Tests:** `packages/crypto/src/ringRegev.test.ts` — all encrypt/decrypt/add/sub/serialize unit tests
- **Integrates with:** Step 1 types
- **Demo:** Encrypt m=1000, add two ciphertexts, decrypt sum = 2000; serialize→deserialize roundtrip preserves values

### Step 3: `packages/crypto` — Mock STARK Circuits
- **Files:** `packages/crypto/src/stark/depositCircuit.ts`, `transferCircuit.ts`, `withdrawCircuit.ts`
- **Tests:** `packages/crypto/src/stark/*.test.ts` — prove/verify roundtrip + rejection of malformed proofs
- **Integrates with:** Step 1 types
- **Demo:** All three circuits produce valid proofs; tampered proof (zero commitment) is rejected

### Step 4: `RingRegev.sol` + Tests
- **Files:** `packages/hardhat/contracts/RingRegev.sol`, `packages/hardhat/test/RingRegev.test.ts`
- **Tests:** All RingRegev.test.ts cases — add/sub mod q, overflow/underflow, length mismatch
- **Integrates with:** Standalone library
- **Demo:** `pnpm test --grep RingRegev` passes; gas report shows add/sub gas costs

### Step 5: Verifier Contracts + Tests
- **Files:** `packages/hardhat/contracts/verifiers/DepositVerifier.sol`, `TransferVerifier.sol`, `WithdrawVerifier.sol`, `packages/hardhat/test/Verifiers.test.ts`
- **Tests:** Accepts valid mock proof; rejects zero commitment; rejects empty inputs (9 tests total)
- **Integrates with:** Step 3 (same mock proof format as TypeScript circuits)
- **Demo:** `pnpm test --grep Verifier` — all 9 tests pass

### Step 6: `PrivateTransfer.sol` + Ignition Module + Deploy Script
- **Files:** `packages/hardhat/contracts/PrivateTransfer.sol`, `packages/hardhat/ignition/modules/PrivateTransfer.ts`, update `packages/hardhat/scripts/runHardhatDeployWithPK.ts`
- **Tests:** `packages/hardhat/test/PrivateTransfer.test.ts` — all function cases (17 tests)
- **Integrates with:** Steps 4, 5
- **Demo:** `pnpm deploy` deploys all 4 contracts; `pnpm test` full suite passes

### Step 7: Frontend — Register Page + BalanceDisplay + Web Worker
- **Files:** `packages/nextjs/app/register/page.tsx`, `packages/nextjs/components/BalanceDisplay.tsx`, `packages/nextjs/components/ProofStatus.tsx`, `packages/nextjs/workers/starkProver.worker.ts`
- **Tests:** Manual — register with 0.1 ETH, see balance display update
- **Integrates with:** Steps 2, 3, 6 (deployed contract ABI)
- **Demo:** User registers from UI; key in localStorage; balance decrypted and shown; top-up deposit works

### Step 8: Frontend — Transfer Page + DummyPoolStatus
- **Files:** `packages/nextjs/app/transfer/page.tsx`, `packages/nextjs/components/DummyPoolStatus.tsx`
- **Tests:** Manual — need ≥5 registered users; transfer to Bob; all 4 accounts updated on-chain
- **Integrates with:** Step 7 (registered user pool from Registered events)
- **Demo:** Transfer page fetches pool, shows count, auto-selects dummies, proof in Web Worker, submits tx

### Step 9: Frontend — Withdraw Page
- **Files:** `packages/nextjs/app/withdraw/page.tsx`
- **Tests:** Manual — Bob withdraws 0.05 ETH after receiving transfer
- **Integrates with:** Steps 7, 8
- **Demo:** Bob decrypts balance, enters amount, generates proof, withdraws — receives ETH in wallet

---

## Success Criteria (Full Protocol)
- [ ] `packages/crypto` tests: encrypt/decrypt roundtrip, HE add/sub, serialize/deserialize, mock proof roundtrip
- [ ] Hardhat tests: 100% function coverage on RingRegev.sol, all 3 verifiers, PrivateTransfer.sol
- [ ] Gas report generated showing register/deposit/transfer/withdraw costs
- [ ] E2E manual scenario: register → transfer → withdraw → double-spend rejected
- [ ] On-chain observer cannot distinguish real from dummy recipient
- [ ] Private key never leaves browser (localStorage only)
