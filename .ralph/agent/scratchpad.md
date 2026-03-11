
---
## Iteration: Register Page (task-1773217230-1cc6)

### Context
- Crypto package: `@pq/crypto` with keygen/encrypt/proveDeposit, serializePublicKey/serializeCiphertext
- Contract: PrivateTransfer.register(pk, initialBalance, commitment, proofInputs)
- Max plaintext: 16384 units. Scale: 1 unit = 1e15 wei = 0.001 ETH

### Completed
1. Added `@pq/crypto: workspace:*` to nextjs/package.json
2. Added `transpilePackages: ["@pq/crypto"]` + `extensionAlias` in next.config.ts
3. Added PrivateTransfer ABI to deployedContracts.ts (placeholder address 0x00...00)
4. Created utils/pq/amounts.ts (AMOUNT_SCALE, weiToUnits, toHex, toBytes32)
5. Created utils/pq/keyStorage.ts (saveSecretKey, loadSecretKey, hasSecretKey)
6. Created app/register/page.tsx - full register flow
7. Added Register/Transfer/Withdraw links to Header.tsx

### For Transfer/Withdraw pages
- Import from `@pq/crypto`: proveTransfer, proveWithdraw, encrypt, decrypt, etc.
- Import from `~~/utils/pq/amounts`: AMOUNT_SCALE, weiToUnits, toHex, toBytes32
- Import from `~~/utils/pq/keyStorage`: loadSecretKey
- Contract write hook: `useScaffoldWriteContract({ contractName: "PrivateTransfer" })`
- Read registered accounts with: `useScaffoldReadContract({ contractName: "PrivateTransfer", functionName: "isRegistered", args: [addr] })`
- Read account balance (ciphertext): `useScaffoldReadContract({ contractName: "PrivateTransfer", functionName: "accounts", args: [addr] })`
- Decrypt: `decrypt(deserializeCiphertext(hexToBytes(encBal)), sk) * AMOUNT_SCALE` → wei

---
## Iteration: Transfer + Withdraw Pages (tasks 36fa + 0bd1)

### Completed
- Created `app/transfer/page.tsx`:
  - Reads sender account (encBal, pk) via `useScaffoldReadContract`
  - Reads recipient account via `useScaffoldReadContract` (conditional on valid address)
  - Collects registered addresses from `Registered` events via `useScaffoldEventHistory`
  - Reads dummy PKs in async handler via `usePublicClient` + `publicClient.readContract`
  - Encrypts real amount for recipient, 0 for each dummy, all under respective PKs
  - Encrypts amounts under sender PK for deduction, generates STARK proof, submits tx

- Created `app/withdraw/page.tsx`:
  - Reads account (encBal, pk) via `useScaffoldReadContract`
  - Decrypts balance client-side for display
  - Encrypts withdrawal amount + new balance, generates STARK proof, submits tx
  - Shows decrypted balance in a stat card

### Build: passes (✓ Compiled, ✓ 12/12 static pages)

---
## Iteration: Design Review (task-1773210644-0d4a)

### Review Summary

Reviewing design.md against requirements.md (R1–R14).

**COMPLETENESS**
- R1–R14: All requirements addressed. ✓
- Error handling: Complete error table in section 7. ✓
- CEI patterns: Specified for all 4 functions. ✓
- Mock limitations: Explicitly documented in section 8a. ✓

**ISSUES FOUND**

CONCERN-1: Section 4.4 withdraw CEI is missing the `emit Withdrawn(...)` step. The CEI steps jump straight from effect to interact with no emit. R7 requires this event. Minor gap but an implementer following only this spec might forget it.

CONCERN-2: The role of `encBalanceToUpdateSender[4]` in `transfer()` is not explicit. The CEI steps (6–8) only use `encTotal` for sender balance update. An implementer may wonder: is the contract supposed to also do `homomorphicSum(encBalanceToUpdateSender) == encTotal` on-chain, or is this purely a proof public input? Section 8a covers mock limitations implicitly but section 4.4 transfer CEI should explicitly state "encBalanceToUpdateSender[4] is passed to TransferVerifier.verify() as public inputs only; it is NOT used for direct balance updates."

CONCERN-3: Execution gas for on-chain SSTORE writes is unaddressed. Appendix A quotes ~$0.5 calldata cost on L2, but executing 5 × 256-slot SSTORE updates (8KB per ciphertext, 5 accounts per transfer) = ~6.4M execution gas per transfer. At L2 prices this is acceptable for a prototype but no estimate is provided. Not a blocker but developer should profile.

CONCERN-4: Class diagram (section 5) omits `deposit()` from PrivateTransfer. Minor.

CONCERN-5: File structure section has no section header (jumps from 8a into the tree). Formatting only.

**FEASIBILITY**
- Schoolbook O(n²): feasible for prototype (multiply only in keygen/encrypt). ✓
- RingRegev.sol add/sub: coefficient-wise, no NTT needed. ✓
- Mock verifier: simple hash check. ✓
- L2 deployment: acknowledged in Appendix A/C. ✓

**SIMPLICITY**: No over-engineering. Scope is appropriate. ✓
**TESTABILITY**: 7 concrete scenarios. Unit tests specified per function. ✓
**CLARITY**: Sufficient for a developer to implement.

### Verdict: APPROVE
All concerns are non-blocking for a prototype. No FAIL items found. The mock-prover limitations are thoroughly documented in section 8a, which is exactly what a prototype design should do. The 5 concerns are minor and can be addressed during implementation.

---
## Iteration: Explorer Research (design.approved event)

### Current State After Research

**packages/crypto/** ✅ COMPLETE
- All types, ringRegev, stark circuits, tests, index

**packages/hardhat/contracts/** — MOSTLY DONE, key gaps:
- `PrivateTransfer.sol` exists but is missing:
  1. `deposit()` function
  2. `totalRegistered` state + pool size check (`>= 5` in transfer)
  3. Duplicate recipient + self-recipient check in transfer
  4. `usedTransfers` nullifier map (double-spend prevention)
  5. Custom errors: `InsufficientPool(uint256,uint256)`, `InvalidRecipients()`, `ZeroAmount()`, `TransferAlreadyUsed()`, `ETHTransferFailed()`
  6. `require(ok, ...)` → `if (!ok) revert ETHTransferFailed()`
- Missing tests for: pool size, duplicate/self recipient, double-spend, deposit()
- `deployedContracts.ts` ABI missing deposit() + new errors

**packages/nextjs/** — MOSTLY DONE
- All three pages exist
- Utils done
- Components NOT created: BalanceDisplay, ProofStatus, DummyPoolStatus
- Web Worker NOT created
- `runHardhatDeployWithPK.ts` still points to SE2Token (broken windows)

### What Planner should know
- Highest priority: PrivateTransfer.sol gaps (atomic with tests + ABI sync)
- Second: missing test cases for PrivateTransfer
- Third: deploy script fix (1-line change)
- Fourth: frontend components (BalanceDisplay uses sk from localStorage to decrypt)

---
## Iteration: Contract Security Checks (task-1773226271-c95e)

### Completed
Added missing security features to `PrivateTransfer.sol`:
1. `totalRegistered` counter (incremented in `register()`)
2. Pool size check in `transfer()`: `totalRegistered >= n + 1` → `InsufficientPool(registered, required)`
3. Self-recipient check: `msg.sender` not in recipients → `InvalidRecipients()`
4. Duplicate recipient check: O(n²) loop → `InvalidRecipients()`
5. Replaced `require(ok, "ETH transfer failed")` → `if (!ok) revert ETHTransferFailed()`
6. Added custom errors: `InsufficientPool`, `InvalidRecipients`, `ETHTransferFailed`
7. Updated `deployedContracts.ts` ABI: new errors + `totalRegistered` function
8. Updated tests: fixed recipients (sender cannot be in list), added 4 new test cases

All 39 tests pass (was 35).

### Remaining gaps (for future iterations)
- `usedTransfers` nullifier map still not implemented (double-spend prevention) - may be skipped if STARK proof handles it
- Frontend components: BalanceDisplay, ProofStatus, DummyPoolStatus not created
- Web Worker for STARK proving not created

---
## Iteration: Double-Spend Fix (review.rejected on task-1773226271-c95e)

### Issue
- `usedTransfers` nullifier mapping was missing
- `TransferAlreadyUsed` error was missing from contract and ABI
- Mock verifier did not prevent commitment replay

### Fix Applied
1. Added `mapping(bytes32 => bool) public usedTransfers` to PrivateTransfer.sol
2. Added `TransferAlreadyUsed()` custom error
3. Nullifier check placed AFTER recipient validation (so invalid-recipient calls still get the right error, not TransferAlreadyUsed)
4. Commitment marked used only after all validations pass
5. Updated `deployedContracts.ts` ABI: added `TransferAlreadyUsed` error + `usedTransfers` view function
6. Added double-spend test; used unique commitments (validCommitment2, validCommitment3) to avoid test pollution
7. All 40 tests pass (was 39)

---
## Iteration: Validation (task-1773227819-1906)

### Result: FAIL

**All tests pass (40 hardhat + 26 crypto), build clean, E2E scenarios verified.**

**Single blocking issue:**
- `PrivateTransfer.sol` line 104: `bytes calldata encAmount` is unused in `withdraw()` body
- Solidity compiler emits a warning
- YAGNI violation: dead parameter

**Fix:** Change `bytes calldata encAmount,` → `bytes calldata /* encAmount */,`

After fix: re-run compile (no warnings) + tests (40/40 still pass).

**Secondary non-blocking concern (not FAIL):**
- `deserializeCiphertext` used to deserialize public keys in frontend pages
  - Works correctly (types are structurally identical), but misleading
  - Could add `deserializePublicKey` alias in crypto package

- task-05 frontmatter says `pending` — stale metadata, actual verifier contracts and 9 tests all pass

---
## Iteration: Resume after validation.failed

### State
Validation failed due to one blocking issue:
- PrivateTransfer.sol: `bytes calldata encAmount` unused parameter in `withdraw()`
- Fix: change to `bytes calldata /* encAmount */,`

Task task-1773228662-2ef6 created. Dispatching to Builder via validation.failed.

---
## Iteration: Validation Pass (task-1773228929-281a)

### Result: PASS

All checks green:
- 26/26 crypto tests pass
- 40/40 hardhat tests pass  
- Build: ✓ 12/12 static pages, no warnings
- Lint: clean

**YAGNI fix applied:** removed `removeSecretKey` and `hasSecretKey` from keyStorage.ts — both exported but never used. Build + lint still pass after removal.

Emitting validation.passed → Committer.
