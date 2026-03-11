# Idea Honing — PQ Private Transfer Protocol

## Q&A Log

---

### Q1 (iteration 1)

**Gap identified:** The STARK circuits must prove Ring Regev polynomial arithmetic (NTT-based polynomial multiplication over Z_q with n=1024 coefficients). This is extremely complex to encode in any STARK constraint system — each Ring Regev encryption involves a polynomial multiplication that would require thousands of constraints. No existing STARK library (Stone, Stwo, Winterfell) has ready-made gadgets for RLWE operations.

**Critical question:** For the prototype, should the STARK circuits prove the *full Ring Regev polynomial arithmetic* inside the proof (i.e., real ZK constraints over polynomial operations in Z_q), or is an abstracted representation acceptable — for example, treating the encryption as a native field operation over a simpler representation?

**Answer (iteration 2):**

**Use a mock/stub STARK prover for the prototype.** Here is the reasoning:

**Why full polynomial arithmetic STARKs are not feasible for this prototype:**

1. **Constraint count is prohibitive.** A single Ring Regev encryption (`n=1024`, `q=2²⁷`) requires at least 2 NTT passes (forward + inverse) plus pointwise multiplication. Each NTT over a length-1024 polynomial involves ~5,120 butterfly operations. The Transfer circuit calls `RingRegev.Encrypt` 9 times (4 receiver + 4 sender + 1 total) plus one `Decrypt`. Total constraint count: hundreds of thousands to millions. STARK prover time at this scale in WASM: **minutes, not seconds** — the <5s target is unachievable.

2. **No ready-made JS/WASM STARK library supports RLWE gadgets.** Stone (Cairo VM), Stwo (circle STARKs), and Winterfell (Rust) all require custom circuit encodings. None expose RLWE-specific gadgets. Building one from scratch is a multi-month research effort.

3. **VM-based provers (RISC Zero, SP1) could encode Rust Ring Regev natively**, but their WASM browser runtimes are experimental, slow, and not production-ready for client-side use.

**Recommended approach for prototype:**

Implement a **mock STARK prover** with the correct TypeScript interface:

```typescript
// packages/crypto/stark/prover.ts
export async function generateProof(circuit, publicInputs, privateInputs): Promise<ZKProof>
export async function verifyProof(circuit, publicInputs, proof): Promise<boolean>
```

- The proof is a deterministic hash/commitment over the public inputs (not real ZK)
- The on-chain `STARKVerifier` contract checks proof format and that inputs are well-formed
- The interface is identical to what a real STARK prover would expose
- **Clearly documented** as a stub in code comments and `docs/research.md`

This allows all other components (HE, contract, frontend) to be built, tested, and validated end-to-end. The real STARK proof system is a drop-in replacement in Phase 2 when a suitable prover becomes available (likely SP1 or custom Stwo circuits in the future).

**What is NOT mocked:** The Ring Regev homomorphic encryption and arithmetic is implemented in full — `encrypt`, `decrypt`, `add`, `sub` over `R_q` with NTT. Only the ZK proof generation/verification is stubbed.

**Status:** Answered ✓

---

### Q2 (iteration 3)

**Gap identified:** The Transfer function requires exactly N=4 recipients (1 real + 3 dummies). The sender must provide 4 registered addresses. But if fewer than 3 other registered users exist, there aren't enough accounts to fill the dummy slots.

**Critical question:** When there are fewer than 3 other registered users in the pool, what should happen to a transfer attempt? Options:
- Block the transfer entirely until the anonymity pool is large enough
- Allow the sender to reuse their own account(s) as dummies (self-transfers)
- Allow the same registered address to appear multiple times as a dummy

**Answer (iteration 4):**

**Block the transfer entirely** until the anonymity pool is large enough. Here is the reasoning:

**Why the other options weaken or break anonymity:**

1. **Sender as dummy:** If the sender lists their own address as one of the 4 recipients, an on-chain observer immediately narrows the real recipient candidates — they know the sender is definitely one of the 4 addresses, reducing the anonymity set to 3 (or less). This partially defeats the point of the protocol.

2. **Duplicate dummies:** If the same address appears in multiple dummy slots, an observer who notices the duplicate knows those slots share a key, and can eliminate them. In the worst case (same address 3 times), the anonymity set collapses to 2 (real + repeated dummy). This is worse than useless for privacy.

**Why blocking is correct:**

The anonymity guarantee is binary: either there are 3 distinct dummy accounts available or the protocol cannot offer its stated privacy property. Allowing a degraded transfer misleads users into thinking they have privacy when they don't. For a prototype, it is better to be honest about the limitation.

**Concrete requirement:**

The transfer requires exactly 4 distinct recipient addresses, all registered, all different from the sender. This means:
- Minimum: **5 total registered users** (sender + real recipient + 3 distinct dummies)
- The contract stores `uint256 public totalRegistered` incremented in `register()`
- The contract validates that all 4 recipient addresses are registered, distinct, and ≠ sender
- The frontend checks `totalRegistered >= 5` before enabling the Transfer UI and shows: *"Not enough users in pool — need at least 4 others registered (currently X)"*
- If the validation fails on-chain, the transaction reverts with `InsufficientPool(uint256 have, uint256 need)`

**What the frontend does:**

The frontend auto-selects 3 dummies randomly from the registered pool (filtered: exclude sender and real recipient). If fewer than 3 candidates exist after filtering, it shows the pool-too-small error. The list of registered users is fetched from `Registered` events or a public view function.

**Status:** Answered ✓

---

## Q3: Top-up deposits after initial registration

**Question (iteration 5):**

`register()` in the Protocol Design explicitly checks `accounts[msg.sender].publicKey == 0`, blocking re-registration. There is no `deposit()` function in the current design. This means a user's balance can only grow by *receiving transfers* — they cannot add more ETH after their initial registration.

Is this intentional? Or should there be a separate `deposit()` function that homomorphically adds a new encrypted amount to the user's existing balance?

The answer matters because:
- If **no top-up**: The contract is simpler, and a user who runs out of balance must withdraw everything, de-register (or use a new address), and re-register
- If **yes, add a `deposit()` function**: It uses the same Deposit Circuit (proving the new encrypted amount = msg.value), then does an on-chain `HE.add(existingBalance, newEncryptedAmount)` to update the stored ciphertext

**Answer (iteration 6):**

**Top-up deposits are IN SCOPE and should reuse the existing Deposit Circuit.** Here is the reasoning:

**Why top-ups are necessary:**

Without a `deposit()` function, a user's ETH can only leave the protocol (via withdrawals) or enter once (at registration). If a user spends down their balance to near zero through transfers, they are stuck: they cannot transfer to others, and cannot top up without fully withdrawing, abandoning their registered identity, and creating a new address. This breaks practical usability for any repeated-use scenario.

**Why the existing Deposit Circuit is sufficient:**

The Deposit Circuit already specifies exactly what is needed:
```
Public inputs:  pk, encAmount, depositAmount
Private inputs: r
Constraints:
  1. encAmount == RingRegev.Encrypt(depositAmount, pk, r)
```
A top-up proof uses the same circuit with the same constraints. The only difference is in the contract: instead of storing `encAmount` as the initial balance, the contract computes `HE.add(existingBalance, encAmount)` and stores the result.

**Concrete requirement:**

Add a `deposit()` function to the `PrivateTransfer` contract:

```solidity
function deposit(
    bytes calldata encAmount,    // RingRegev.Encrypt(msg.value, pk, r)
    bytes calldata depositProof  // Same STARK Deposit Circuit proof
) external payable
```

- Caller must already be registered (revert with `NotRegistered()` if `pk == 0`)
- The STARK verifier uses the same `DepositVerifier` contract as `register()`
- On-chain: `accounts[msg.sender].encryptedBalance = RingRegev.add(existingBalance, encAmount)`
- Emits `Deposited(address indexed user, uint256 amount)`
- `totalDeposits += msg.value`

**Frontend:** Add a "Top-up" button on the balance/register page. Same UX flow as register (input ETH amount, generate proof, submit tx).

**Status:** Answered ✓


---

## Requirements Complete

After 3 questions, all critical gaps are resolved:

1. **STARK prover**: Mock/stub for prototype (real HE implemented, ZK stubbed)
2. **Anonymity pool**: Block transfer when pool < 5; contract validates distinctness
3. **Top-up deposits**: `deposit()` function in scope, reuses Deposit Circuit with `HE.add`

Remaining items are implementation decisions (registered users via events, serialization format, etc.) that do not require user input.

**Status:** Requirements complete ✓

---

## Post-Rejection Q&A

### design.rejected reasons
1. FAIL: NTT claimed with q=2²⁷ (power of 2, not prime — NTT requires prime q≡1 mod 2n)
2. FAIL: No double-spend prevention — test scenario 5 cannot pass without nullifier/spent-encTotal map
3. CONCERN: deposit() DepositVerifier needs pk from on-chain storage — not stated explicitly
4. CONCERN: InsufficientContractBalance missing from withdraw() CEI spec
5. CONCERN: Serialization bridge TypeScript bigint[]↔Solidity uint32[1024] not specified

FAIL 1 can be resolved by architect without user input (use schoolbook O(n²) multiplication — q=2²⁷ stays unchanged).
Concerns 3/4/5 are clarifications the architect can handle.
FAIL 2 requires a user decision: add on-chain nullifier or defer + remove test scenario 5.

### Q4 (addressing design rejection FAIL 2)

For double-spend protection: should the contract store a `keccak256(encTotal)` nullifier on each transfer (preventing replay of the same encrypted total), or should double-spend prevention be deferred to when real ZK proofs replace the mock (since real nullifiers live in the circuit), with test scenario 5 removed from the current scope?

**Option A — Add nullifier now:** `mapping(bytes32 => bool) public usedTransfers` in the contract; `transfer()` checks and sets `keccak256(encTotal)`. Adds one SSTORE per transfer (~20k gas). Test scenario 5 stays in scope.

**Option B — Defer:** Remove test scenario 5 from Phase 5. Document that double-spend prevention is a property of the real ZK circuit (nullifier in proof), not the mock. Simpler contract for now.

### A4 — Double-spend prevention (Q4 answer)

**Decision: Option A — Add `keccak256(encTotal)` nullifier map to the contract now.**

Key reasoning:
- The mock prover makes Option A MORE necessary: the mock verifier accepts any well-formed proof, so there's zero ZK-based replay protection. Without a nullifier, replaying `transfer()` with the same `encTotal` bytes silently corrupts balances (no revert, double-deduction from sender).
- `keccak256(encTotal)` is a reliable per-transfer fingerprint. Fresh encryption randomness (`r_total`) ensures honest transfers produce distinct ciphertexts; a replay uses identical bytes.
- Contract addition: `mapping(bytes32 => bool) public usedTransfers;` — checked and set in `transfer()`, reverts with `TransferAlreadyUsed()` if seen before.
- 20k gas per transfer is acceptable — it's a correctness invariant.
- Test scenario 5 (double-spend) stays in scope and must pass.
- When real ZK replaces the mock, the on-chain nullifier complements (not duplicates) the circuit-level nullifier.

**Contract change summary:**
- Add field: `mapping(bytes32 => bool) public usedTransfers`
- Add error: `error TransferAlreadyUsed()`
- In `transfer()` CEI checks: `bytes32 nullifier = keccak256(encTotal); if (usedTransfers[nullifier]) revert TransferAlreadyUsed(); usedTransfers[nullifier] = true;`

---
### Q5 — Overdraft/underflow enforcement with mock prover

**Context:** CONCERN 4 from Design Critic: test scenarios 3 and 6 say "proof must fail" for overdraft and underflow. But the mock prover accepts any well-formed proof — a malicious caller bypassing the client can submit a forged proof and overdraw. Should the contract:

(a) Add non-ZK guards to partially enforce these (e.g., track a total "claimed balance" counter alongside the encrypted balance, reject if amount > total deposited by sender), or

(b) Label these test scenarios as "client-side only — contract relies on real ZK for enforcement", and accept that the mock-prover prototype is not overdraft-proof?

**Q5 asked:** For the overdraft and withdrawal underflow constraints, should the contract add any non-ZK on-chain guards during the mock-prover phase, or should those test scenarios be re-labeled as client-side-only and explicitly noted as a known mock-prover limitation?

### A5 — Overdraft/underflow enforcement with mock prover (Q5 answer)

**Decision: Option B — Re-label test scenarios 3 and 6 as client-side-only enforcement, with an explicit mock-prover limitation note.**

Key reasoning:

1. **A parallel plaintext tracker breaks the protocol's fundamental privacy guarantee.** The entire purpose of Ring Regev HE is that the contract never knows plaintext balance amounts. Storing a secondary plaintext balance — even a partial one (total deposited minus total withdrawn) — would expose real ETH flows to any on-chain observer. The privacy model is binary: either the contract knows plaintext amounts or it doesn't.

2. **No viable non-ZK on-chain guard exists for encrypted balances.** You cannot verify `claimedAmount > encryptedBalance` without decrypting the balance, and decryption requires the user's private key (never on-chain). Any proxy metric (e.g., total ETH deposited by sender) would be inaccurate: users receive encrypted funds from others without any on-chain ETH trace.

3. **The mock phase is explicitly prototype-grade.** Design doc already states: "real HE, stubbed ZK." Malicious callers bypassing the client was always an acknowledged limitation. Test scenarios 3 and 6 should reflect reality.

4. **The real ZK circuits are the correct enforcement boundary.** In production, Transfer Circuit constraint 2 (`0 <= total <= plaintext_balance`) and Withdrawal Circuit constraint 2 (`plaintext_balance >= amount`) cryptographically prevent these attacks. The contract should be designed as if real ZK exists — because it eventually will.

**Required design.md changes:**
- Test scenario 3: "Overdraft attempt — client refuses to generate proof when `total > plaintext_balance` (Transfer Circuit constraint 2). **Mock-prover limitation: a malicious caller bypassing the client can submit a forged proof. On-chain overdraft protection is enforced by the real ZK circuit in production.**"
- Test scenario 6: "Withdrawal underflow — client refuses to generate proof when `amount > plaintext_balance` (Withdrawal Circuit constraint 2). **Mock-prover limitation: same as above.**"
- Add a "Mock-Prover Limitations" section to design.md explicitly listing what the prototype does NOT enforce at the contract level.

