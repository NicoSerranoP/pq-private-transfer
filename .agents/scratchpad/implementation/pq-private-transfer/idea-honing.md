# Idea Honing — pq-private-transfer

## Q1 (iteration 1)
**Question:** If Phase 1 research finds no production-ready client-side STARK library that can handle circuits of the required complexity (Ring Regev operations over 1024-degree polynomials running in the browser), what should the prototype do?

**Why this is critical:** The Transfer Circuit alone requires proving ~8 Ring Regev encryptions plus NTT-based polynomial multiplications inside a STARK trace. No mainstream WASM STARK prover (Stone, Stwo, Winterfell) ships with turnkey support for arbitrary constraint systems in browser environments today. If Phase 1 discovers this gap, it blocks Phase 2 entirely unless a fallback is defined.

**Answer:** Use **(a) stub proofs** for the prototype, with the STARKVerifier designed as a swappable interface from day one.

**Reasoning:**

1. **Option (c) Groth16 is off the table.** Groth16 requires a trusted setup and uses elliptic curve pairings — broken by Shor's algorithm. Pivoting to Groth16 eliminates the entire post-quantum security argument, which is the protocol's core value proposition. Plonky2 uses FRI-based inner proofs but its outer recursion layer is not fully PQ-secure either. Introducing non-PQ primitives for convenience would misrepresent what the prototype demonstrates.

2. **Option (b) blocking is not viable.** The STARK toolchain is the hardest piece but not the only piece. Blocking Phase 2–4 behind prover availability means the contract architecture, HE operations, and frontend UX cannot be validated. The prototype exists to validate the full protocol design — blocking freezes all of it on a single toolchain dependency.

3. **Option (a) stub proofs is the right call** because:
   - The `STARKVerifier` is a single, isolated contract interface. Making it a no-op (always returns true) in development mode isolates the toolchain risk without infecting any other component.
   - All other layers — Ring Regev encryption/decryption, homomorphic add/sub, calldata layout, balance update logic, frontend UX, and integration tests — can be fully built and tested with stub proofs.
   - When a real prover ships (Stwo + WASM, Risc0 zkVM WASM, or Winterfell compiled to WASM), swapping in the real verifier requires changing exactly one contract and one TypeScript prover call. Everything else remains unchanged.

**What Phase 1 MUST specifically investigate:**
- **Stwo** (StarkWare's Circle STARK prover in Rust): has an active WASM build target as of early 2025. Benchmark it against the Transfer Circuit trace size.
- **Risc0 zkVM (WASM prover)**: compiles arbitrary Rust programs to ZK proofs; the guest program can implement Ring Regev operations directly. The WASM prover is ~50 MB but runs client-side.
- **Winterfell** (Meta's Rust STARK library): compiles to WASM; requires manually writing AIR constraints for NTT/polynomial arithmetic — feasible but labor-intensive.

If Phase 1 finds none of these viable within the prototype timeline, proceed with stub proofs and document the open gap clearly in `docs/research.md`. The circuit constraints are purely arithmetic (polynomial multiplication over Z_q), so they are tractable for any AIR-based STARK prover — the bottleneck is browser delivery, not circuit expressiveness.

## Q2 (iteration 2)
**Question:** The Ring Regev plaintext space is `Z_q` with `q = 2^27 ≈ 134M`, but Ethereum values are in wei (1 ETH = 10^18 wei), which overflows `q` by ~10^10×. What denomination or scaling factor should be used when encoding ETH amounts as Ring Regev plaintexts — e.g., encode in gwei (max ~0.134 ETH), a custom unit like "finney" (0.001 ETH each, max ~134 finney ≈ 0.134 ETH), or something else? This affects the Ring Regev encode/decode functions, the STARK range-check constraints, and the contract's register/withdraw logic.

**Why this is critical:** If the encoding unit is not defined, Phase 2 cannot implement `ringRegev.ts` correctly, the deposit circuit constraint `initialBalance == Encrypt(msg.value, pk, r)` is undefined (msg.value in wei overflows q), and the frontend cannot correctly convert user-entered ETH amounts to plaintexts.

**Answer:** Use **szabo (1 szabo = 10¹² wei = 1 microETH)** as the protocol denomination unit.

**Analysis of options:**

| Denomination | Wei value | Max balance | Verdict |
|---|---|---|---|
| gwei | 10⁹ | ~0.134 ETH | Too small — unusable |
| szabo (microETH) | 10¹² | ~134 ETH | ✅ Practical range |
| finney (milliETH) | 10¹⁵ | ~134,000 ETH | Excessive precision loss |

With q = 2²⁷ = 134,217,728:
- Max plaintext: 134,217,727 szabo ≈ **134.2 ETH per account**
- Minimum transfer: 1 szabo = 0.000001 ETH (1 microETH)
- This is sufficient for a prototype privacy protocol

**Concrete impact on each layer:**

1. **`ringRegev.ts` encode/decode:**
   ```typescript
   const UNIT = 1_000_000_000_000n; // 10^12 wei = 1 szabo
   function encodeAmount(wei: bigint): number { return Number(wei / UNIT); }
   function decodeAmount(plaintext: number): bigint { return BigInt(plaintext) * UNIT; }
   ```

2. **Solidity contract:**
   ```solidity
   uint256 constant PROTOCOL_UNIT = 1e12; // 1 szabo
   // register: protocolAmount = msg.value / PROTOCOL_UNIT
   require(msg.value % PROTOCOL_UNIT == 0, "amount not divisible by protocol unit");
   uint256 protocolAmount = msg.value / PROTOCOL_UNIT;
   // withdraw: amountWei = amount * PROTOCOL_UNIT
   (bool ok,) = msg.sender.call{value: amount * PROTOCOL_UNIT}("");
   ```

3. **Deposit circuit constraint (corrected):**
   ```
   Public input: depositAmount = msg.value / PROTOCOL_UNIT  (in protocol units, fits in Z_q)
   Constraint: initialBalance == RingRegev.Encrypt(depositAmount, pk, r)
   ```

4. **STARK range checks:** All use protocol-unit values, so `0 <= amount < 2^27` is the natural bound. No change to circuit structure.

5. **Frontend:** Convert user-entered ETH to szabo before passing to the crypto layer: `parseEther(input) / UNIT`.

**One nuance:** Deposits must be multiples of 1 szabo. This is not a practical limitation — the UI can enforce it and the contract should `require(msg.value % PROTOCOL_UNIT == 0)`.

## Q3 (iteration 3)
**Question:** In Ring Regev (RLWE), homomorphic addition accumulates noise: each `HomAdd(c1, c2)` produces a ciphertext with noise `e1 + e2`. With `q = 2^27` and small initial noise `σ`, an account can sustain roughly `q / (2σ)` additions before noise overflows and decryption fails. A dummy recipient receives `HomAdd(encBalance, Encrypt(0))` on every transfer that selects them — meaning popular dummy accounts could silently become undecryptable over time. Is there a re-encryption/refresh mechanism planned, or should the protocol bound how many times an account can be selected as a dummy per epoch?

**Why this is critical:** Without a noise management strategy, Ring Regev homomorphic correctness breaks for active users. The STARK proofs prove amount correctness but cannot detect a corrupted ciphertext caused by noise overflow. Silent balance corruption is a protocol safety failure — the user's funds become unrecoverable with no on-chain signal.

**Answer:** Add a `refresh()` contract function as the primary noise management mechanism. Epoch-based dummy bounding is a complementary safety net but is not sufficient on its own.

**Noise budget analysis with the protocol parameters:**

In Ring Regev (enc = (a·r + e₁, b·r + e₂ + m)), the decryption noise after k HomAdds grows as:

```
noise_k ≈ k · (n · σ_enc²)   (coefficient-wise, from ring multiplication spread)
```

With n=1024, a typical Gaussian σ_enc≈3 (standard RLWE parameters):
- Per-encryption noise magnitude: ~n · σ² ≈ 1024 · 9 ≈ 9 216 per coefficient
- Decryption bound: noise must remain below q/2 = 67 108 864
- Rough budget: q / (2 · n · σ²) ≈ 67M / 9 216 ≈ **7 000 HomAdds**

For a prototype with N=4 dummies chosen uniformly at random from the registered pool of size P:
- Expected dummy selections per account per transfer: (N-1)/P = 3/P
- A pool of 100 accounts: ~0.03 selections/transfer → ~230 000 transfers before any one account hits 7 000
- A pool of 10 accounts: ~0.3 selections/transfer → ~23 000 transfers before risk

So for the prototype the noise accumulation is not an acute problem. For production it is.

**Chosen approach: `refresh()` function**

Add a fourth function to the contract that lets a user non-interactively re-encrypt their balance at any time:

```solidity
function refresh(
    bytes calldata encNewBalance,  // Fresh encryption of same plaintext
    bytes calldata proof           // STARK: Decrypt(encOld, sk) == Decrypt(encNew, sk)
) external
```

The STARK proof (RefreshCircuit) has the structure:
```
Public inputs:  pkB, encOldBalance, encNewBalance
Private inputs: pvkB, plaintext_balance, r_new
Constraints:
  1. Decrypt(encOldBalance, pvkB)  == plaintext_balance
  2. encNewBalance                 == RingRegev.Encrypt(plaintext_balance, pkB, r_new)
```

This resets noise to σ_fresh. The user calls it at their discretion — no on-chain rate limiting required. The constraint is identical in structure to the Withdrawal circuit (decrypt + re-encrypt), so the circuit implementation reuses the same gadgets.

**Why not epoch-based dummy bounding?**

Epoch bounding (e.g., max K dummy selections per account per N blocks) has two problems:
1. It is *visible on-chain*: a selection counter per account leaks information about how often each account participates as a dummy, eroding anonymity.
2. It does not fix existing ciphertexts that already carry accumulated noise — it only slows future damage.

Epoch bounding can still serve as a **hard safety guard** (revert if an account has been selected as dummy more than `MAX_DUMMY_USES` times without a refresh) to prevent silent failure, but it is not a substitute for refresh. Document `MAX_DUMMY_USES = 5000` as a conservative default in the contract constants.

**Revised Data Structures:**

Add a `noiseCount` field to `Account` to enable the safety guard without requiring full selection history:

```solidity
struct Account {
    bytes     encryptedBalance;
    bytes     publicKey;
    uint32    noiseCount;         // incremented each HomAdd, reset on refresh
}

uint32 constant MAX_DUMMY_USES = 5000;

// In transfer(), before HomAdd on a recipient:
require(accounts[recipients[i]].noiseCount < MAX_DUMMY_USES, "account needs refresh");
accounts[recipients[i]].noiseCount++;

// In refresh():
accounts[msg.sender].noiseCount = 0;
```

**Summary of changes to the design:**

1. Add `RefreshCircuit` to Phase 2 (uses same gadgets as Withdrawal circuit — low incremental cost)
2. Add `refresh()` to the Phase 3 contract spec
3. Add `noiseCount` field to the `Account` struct
4. Add `MAX_DUMMY_USES = 5000` constant
5. Add a refresh page/button to the Phase 4 frontend (simple single-call UI)
6. Add "refresh before noise overflow" as an integration test scenario in Phase 5

## Q5 (iteration 5 — triggered by design.rejected)

**Question:** When the frontend auto-selects 3 dummy recipients for a transfer, what is the minimum required pool size (i.e., how many registered accounts must exist besides the real recipient and the sender), what selection strategy should be used (e.g., uniformly random from all registered accounts), and what should happen if the pool has fewer than 3 eligible accounts — should the transfer be blocked, padded with dummy zero-addresses, or allowed to proceed with fewer dummies?

**Why this is critical:** The Design Critic rejected the design because "auto-select 3 dummies" has no spec. Without a defined selection strategy, minimum pool size, and under-population fallback, the frontend transfer page cannot be implemented — there is no spec for which addresses to choose, and no error handling for the case where there aren't enough registered users. This directly blocks Phase 4.

**Answer:** Use **uniformly random selection without replacement** from the eligible pool. The minimum eligible pool size is **3**. If fewer than 3 eligible accounts exist, **block the transfer** with a clear error.

**Eligible pool definition:**

The eligible pool for dummy selection is: all registered accounts **excluding** (a) the sender (`msg.sender`) and (b) the real recipient. This gives the maximum anonymity set without forcing the sender or real recipient to appear as their own dummy.

Additionally, filter out accounts where `noiseCount >= MAX_DUMMY_USES` — selecting such an account would cause the on-chain `transfer()` to revert, wasting the user's proof generation time. The frontend fetches eligible accounts by reading `Registered` events from the contract.

**Selection strategy: uniformly random without replacement**

Uniformly random selection is the correct choice for two reasons:

1. **Anonymity**: Uniform random maximizes entropy over dummy assignments. Any non-uniform strategy (e.g., least-used, most-used, alphabetical by address) creates exploitable bias — an adversary who knows the selection rule can narrow down which accounts are likely dummies vs. the real recipient.
2. **Simplicity**: Uniform random requires no extra state tracking in localStorage or on-chain beyond the existing `noiseCount` guard. No new mechanisms are needed.

**Minimum pool size: 3**

The Transfer circuit is fixed at N=4 (1 real + 3 dummies). Allowing fewer than 3 dummies would require changing the circuit and contract signature, which defeats the anonymity model entirely. Padding with zero-addresses is not viable — unregistered addresses revert on-chain (`require(accounts[r].publicKey != 0, "recipient not registered")`), and there is no public key to encrypt to.

Therefore: the eligible pool must contain **at least 3 accounts**. If it contains exactly 3, those 3 are the dummies (deterministic but still correct — anonymity holds as long as the adversary cannot predict which of the 4 is real). If it contains ≥ 4, sample 3 uniformly at random.

**Under-population handling: block the transfer**

If the eligible pool has fewer than 3 accounts, block the transfer client-side with the error:

> *"Not enough registered accounts to anonymize your transfer. At least 3 other registered users are required (you need {{3 - pool.length}} more)."*

This is the only safe option:
- **Padding with zero-addresses**: reverts on-chain; not viable
- **Fewer than 3 dummies**: changes N, breaks circuit and contract; not viable
- **Blocking**: honest, correct, clearly communicates what the user needs to do

**`DummyPoolStatus.tsx` component:**

This component should proactively show the current pool size and warn before the user reaches the transfer page:

```typescript
// Eligible pool size = registered accounts - sender - real recipient - accounts with noiseCount >= MAX_DUMMY_USES
const eligibleCount = registeredAccounts.filter(addr =>
  addr !== sender && addr !== recipient && accounts[addr].noiseCount < MAX_DUMMY_USES
).length;

// States:
// eligibleCount >= 3: OK, show count
// eligibleCount == 2: warning "1 more user must register to enable transfers"
// eligibleCount < 2: error "Transfers unavailable: not enough registered users"
```

**Summary of changes to the design:**

1. Transfer page: fetch `Registered` events to build eligible pool; select 3 uniformly at random; filter out noiseCount-saturated accounts
2. If eligible pool < 3: show blocking error; disable "Generate Proof" button
3. `DummyPoolStatus.tsx`: live count of eligible dummy accounts with warning at < 3
4. No new circuits or contract functions needed — this is purely frontend logic

## Q4 (iteration 4)
**Question:** The Ring Regev private key is the only way to decrypt the user's encrypted balance. Should the RLWE private key be derived deterministically from the user's Ethereum wallet (e.g., by signing a fixed message with MetaMask and using the signature bytes as an RLWE seed), or should it be a randomly generated key stored only in `localStorage`? The deterministic approach means the wallet private key is the backup — if the wallet is compromised, so is the RLWE balance; but users can always recover. The random approach means users must explicitly export and back up the key — losing it means funds are permanently locked on-chain.

**Why this is critical:** This single decision determines the `ringRegev.keygen()` API signature (takes a seed vs. random), the key storage UX in Phase 4 (no backup button needed vs. mandatory export flow), and the security model (wallet compromise = balance compromise vs. independent key compromise). If left undefined, Phase 2 and Phase 4 will make incompatible assumptions about key lifecycle.

**Answer:** Use **deterministic derivation from wallet signature** for the prototype, with explicit documentation of the post-quantum limitation this introduces.

**Analysis of the PQ security tradeoff:**

The most important nuance is that deterministic derivation from an ECDSA wallet signature is *not* post-quantum secure:

- A quantum adversary running Shor's algorithm can recover the ECDSA wallet private key from the public key
- From the wallet private key, they can recompute the same deterministic RLWE seed
- This breaks the RLWE private key even though RLWE itself is PQ-secure

So in a production PQ protocol, the RLWE key **must** be independent of any classical cryptography for the PQ claim to hold.

However, for this prototype the deterministic approach is the right choice for the following reasons:

**1. Prototype goal is to validate HE + STARK mechanics, not key management.**
The entire value of this prototype is demonstrating that Ring Regev homomorphic operations + STARK proofs work correctly on-chain. Key management is a separable UX problem — getting it wrong doesn't break the cryptographic primitives being tested.

**2. localStorage-only random keys cause unacceptable test friction.**
Even in development: clearing cookies, opening incognito, switching browsers, or clearing site data permanently locks test funds. This forces every developer and tester to manually manage key backups before touching the UI — high friction, low reward during prototype validation.

**3. Deterministic keygen keeps the `ringRegev.ts` API extensible.**
If Phase 2 defines `keygen(seed: Uint8Array)` rather than `keygen()`, swapping the seed source (from wallet signature to BIP-39 mnemonic or hardware-backed key) in a future version requires changing only the Phase 4 key derivation call — not the Ring Regev library. The API is forward-compatible.

**Concrete API for Phase 2:**
```typescript
// packages/crypto/ringRegev.ts
export function keygen(seed: Uint8Array): { pk: PublicKey; sk: SecretKey };
// seed must be at least 32 bytes of cryptographically random data
```

**Concrete key derivation for Phase 4:**
```typescript
// Prompt MetaMask to sign a fixed, human-readable message
const rawSig = await wallet.signMessage("pq-private-transfer-v1");
// Hash to 32 bytes (removes ECDSA structure, consistent length)
const seed = keccak256(toBytes(rawSig));
const { pk, sk } = keygen(hexToBytes(seed));
// sk stored in localStorage; pk registered on-chain
localStorage.setItem("pq-transfer-sk", bytesToHex(sk));
```

**Why `keccak256(signature)` rather than raw signature bytes:**
- Raw ECDSA signatures are 65 bytes with `v`, `r`, `s` structure. Feeding this directly into RLWE polynomial sampling could introduce non-uniform distributions if the sampling is naive.
- Hashing first (a) normalizes to 32 bytes, (b) removes ECDSA structure, (c) keeps the seed deterministic.

**Security model for Phase 4 documentation (be honest):**
| Scenario | Deterministic (chosen) | Random localStorage |
|---|---|---|
| Wallet compromised | RLWE key leaked | RLWE key safe |
| localStorage cleared | Key recoverable via wallet | Funds permanently locked |
| User moves to new device | Sign to recover | Requires manual backup import |
| Quantum adversary | RLWE key breakable via ECDSA | RLWE key safe (PQ holds) |
| Production readiness | ⚠️ Not PQ-secure | ✅ PQ-secure with UX work |

The Phase 4 UI should display a banner: *"Your privacy key is derived from your wallet signature. Security is equivalent to your wallet's security, not post-quantum secure. This is a prototype limitation."*

**Production path:**
If the protocol moves to production, the correct approach is: generate a random RLWE key client-side, encrypt the backup with a user-controlled password (AES-GCM), and require the user to download or store the encrypted backup before any deposit. The `keygen(seed)` API already supports this — only the Phase 4 key generation and storage logic changes.

**Summary of changes to the design:**
1. Phase 2: `ringRegev.keygen(seed: Uint8Array)` — no changes to HE math, seed just initializes the polynomial sampler
2. Phase 4: Key derivation via `keccak256(sign("pq-private-transfer-v1"))` on first use; store sk in localStorage
3. Phase 4: Show a "prototype limitation" banner in the UI
4. No new circuits or contract functions needed


## Q7 (iteration 7 — triggered by design.rejected CONCERN 3)

**Question:** The Design Critic flagged that `noiseCount` is only specified to increment on `HomAdd` operations. However, `transfer()` also performs a `HomSub` on the *sender's* balance (subtracting the total transferred amount). In Ring Regev, `HomSub(c1, c2)` negates the second ciphertext's noise and adds it to the first — so the sender's ciphertext accumulates noise with each `HomSub` just as recipients' ciphertexts do with `HomAdd`. Should `noiseCount` be incremented for **any** homomorphic operation (both HomAdd and HomSub), or only for HomAdd? And concretely: in `transfer()`, after the sender's balance is updated via HomSub, should `accounts[msg.sender].noiseCount` be incremented and checked against `MAX_DUMMY_USES`?

**Why this is critical:** If HomSub is excluded from the `noiseCount` tracking, the sender's ciphertext could silently accumulate noise beyond the decryptable threshold without triggering the `MAX_DUMMY_USES` safety guard. A sender who makes thousands of transfers would eventually be unable to decrypt their own balance, losing access to funds with no on-chain signal. Conversely, if HomSub *must* be counted, the contract spec needs to be updated to increment and check `noiseCount` on the sender's side in `transfer()`, not only on recipients' side.

## Q7 — Answer (iteration 8 — triggered by design.rejected CONCERN 3)

**Question:** Should `noiseCount` increment for HomSub (sender balance update in `transfer()`) as well as HomAdd (recipient updates)?

**Answer:** Yes. `noiseCount` must increment for **any** homomorphic operation — both HomAdd and HomSub. The Ring Regev noise analysis shows they are equivalent in their noise accumulation effect.

**Noise analysis:**

In Ring Regev, a ciphertext `c = (u, v)` carries noise `e` such that decryption succeeds if `||e|| < q/4`.

- `HomAdd(c1, c2) = (u1+u2, v1+v2)` → noise of result: `e1 + e2` → magnitude ≈ `||e1|| + ||e2||`
- `HomSub(c1, c2) = (u1-u2, v1-v2)` → noise of result: `e1 - e2` → magnitude ≈ `||e1|| + ||e2||`

The sign of subtraction does not reduce the noise magnitude. In the worst case (and in expectation for Gaussian noise), `||e1 - e2|| ≈ ||e1|| + ||e2||` because the noise vectors are uncorrelated. The noise budget is consumed equally by HomAdd and HomSub.

**Concrete contract change:**

In `transfer()`, the sender's balance is updated via `HomSub(encBalance, encTotal)`. After this operation, the sender's ciphertext carries more noise. Therefore:

1. **Add a pre-check for the sender** before performing the HomSub:
   ```solidity
   require(accounts[msg.sender].noiseCount < MAX_DUMMY_USES, "sender account needs refresh");
   ```

2. **Increment the sender's noiseCount** after the HomSub:
   ```solidity
   accounts[msg.sender].noiseCount++;
   ```

This is symmetric with what already happens on the recipient side for HomAdd. The semantics of `noiseCount` should be: *the number of homomorphic operations (add or sub) applied to this account's ciphertext since last refresh*.

**`noiseCount` semantic update:**

The Account struct docstring and the `noiseCount` field description should read:
> `noiseCount` — number of homomorphic operations (HomAdd OR HomSub) applied since last `refresh()`. Reset to 0 on refresh.

**Summary of changes to the design:**

1. In `transfer()`: add `require(accounts[msg.sender].noiseCount < MAX_DUMMY_USES)` and `accounts[msg.sender].noiseCount++` for the sender's HomSub, alongside the existing check/increment for each recipient's HomAdd.
2. Update the `noiseCount` docstring to clarify it tracks both HomAdd and HomSub operations.
3. No circuit changes needed — this is purely a contract-level tracking change.

---

## Q8 (iteration 8 — triggered by design.rejected CONCERN 4)

**Question:** The `transfer()` function accepts `encBalanceToUpdateSender[4]` — four ciphertexts, each encrypting `amounts[i]` under the *sender's* public key `pkB`. The STARK verifier uses these as public inputs to verify constraint 6 (`enc_balance_to_update_sender[i] == Encrypt(amounts[i], pkB, r_sender[i])`) and constraint 8 (`HomomorphicSum(enc_balance_to_update_sender) == enc_total`). Separately, the sender's on-chain balance is updated via `HomSub(encBalance, encTotal)` using only `encTotal`.

Given this, is the contract's role for `encBalanceToUpdateSender[4]` **purely to pass them as public inputs to the STARK verifier** — with no on-chain HomOp performed on them individually, no storage written for them, and no per-element usage after the verifier call? Or does the contract also perform some on-chain operation on these four ciphertexts directly (e.g., individual HomSubs, or storing them for future use)?

**Why this is critical:** If `encBalanceToUpdateSender[4]` are only passed to the verifier and immediately discarded, the contract spec can state this explicitly and the four ciphertexts can be treated as ephemeral calldata. If the contract must also use them on-chain (e.g., to build `encTotal` via on-chain HomSum rather than accepting `encTotal` directly), the data flow in the contract spec is wrong and needs to be redesigned. The Design Critic flagged this as CONCERN 4 — leaving it implicit blocks a precise contract implementation.

## Q8 — Answer (iteration 9)

**Answer:** `encBalanceToUpdateSender[4]` are **purely calldata public inputs** to the STARK verifier. The contract performs no on-chain HomOp on them, does not store them, and discards them after the verifier call. `encTotal` is the sole ciphertext used for the on-chain balance update.

**Reasoning:**

The data flow in `transfer()` has two distinct layers:

**Layer 1 — Verification (via STARK verifier):**
The verifier receives all of the following as public inputs:
- `pkB` (sender's public key)
- `encBalanceToUpdateSender[4]` — the four per-recipient sender ciphertexts
- `encTotal` — the HomSum of the above

The verifier checks constraint 8: `HomSum(encBalanceToUpdateSender) == encTotal`. This is a proof-internal check. The contract does NOT need to recompute HomSum on-chain — the STARK proof already asserts its correctness cryptographically. Recomputing it on-chain would be:
1. **Redundant**: The proof already certifies the relationship
2. **Expensive**: HomSum over 4 × 8KB ciphertexts ≈ 32KB of polynomial arithmetic on-chain

**Layer 2 — Balance update (on-chain state mutation):**
The contract uses only `encTotal` to update the sender's stored balance:
```solidity
accounts[msg.sender].encryptedBalance = RingRegevLib.sub(
    accounts[msg.sender].encryptedBalance,
    encTotal
);
```

`encBalanceToUpdateSender[4]` are not used beyond the verifier call. They are calldata-only, not stored, not iterated over by the contract logic.

**Explicit contract data flow for `transfer()`:**

```
Step 1: Freshness check
  require(keccak256(encBalance) == accounts[msg.sender].encBalanceHash)

Step 2: Noise guard (sender)
  require(accounts[msg.sender].noiseCount < MAX_DUMMY_USES)

Step 3: STARK verification
  verifier.verifyTransfer(
    abi.encode(pkB, recipients[4], encBalance, encUpdReceiver[4], encUpdSender[4], encTotal),
    proof
  )
  // encUpdSender[4] is ONLY used here — as public inputs to the verifier

Step 4: Update 4 recipient balances (HomAdd for each)
  for i in [0..3]:
    require(accounts[recipients[i]].noiseCount < MAX_DUMMY_USES)
    accounts[recipients[i]].encryptedBalance = RingRegevLib.add(
      accounts[recipients[i]].encryptedBalance,
      encUpdReceiver[i]
    )
    accounts[recipients[i]].noiseCount++
    accounts[recipients[i]].encBalanceHash = keccak256(accounts[recipients[i]].encryptedBalance)

Step 5: Update sender balance (HomSub using encTotal only)
  accounts[msg.sender].encryptedBalance = RingRegevLib.sub(
    accounts[msg.sender].encryptedBalance,
    encTotal
  )
  accounts[msg.sender].noiseCount++
  accounts[msg.sender].encBalanceHash = keccak256(accounts[msg.sender].encryptedBalance)

  // encUpdSender[4] is NOT used in steps 4 or 5
```

**Why `encUpdSender[4]` exists at all (the protocol rationale):**

The sender encrypts each `amounts[i]` under their own key (`pkB`) — once for each recipient — in addition to encrypting them for each recipient under `pk[i]`. The circuit needs `encUpdSender[4]` to prove that:
1. The sender correctly committed to the amounts sent to each recipient (not just the total)
2. The HomSum of those per-recipient commitments equals `encTotal`

Without `encUpdSender[4]`, the circuit could not separately verify constraint 6 and constraint 8 — the sender could lie about how the total was distributed without the circuit detecting it. But this is a proof-validity concern, not an on-chain state concern. The contract does not care about the per-recipient distribution — only about the total deducted from the sender's balance.

**Summary of changes to the design:**

1. In the contract spec and code comments, explicitly state: `encBalanceToUpdateSender[4]` are ephemeral calldata — passed to the STARK verifier as public inputs, not stored or operated on by the contract.
2. Clarify the `transfer()` function comment: the sender balance update uses only `encTotal`, not the individual `encUpdSender` elements.
3. No circuit changes, no contract logic changes — this is a documentation/spec clarification only.

---

## Q6 (iteration 6 — triggered by design.rejected FAIL 1)

**Question:** The Design Critic flagged that the contract never verifies the proof's `encBalance` public input matches what's actually stored in `accounts[msg.sender].encryptedBalance`. Without this check, a user could generate a valid proof against an *old* encrypted balance (e.g., a pre-transfer snapshot with a higher balance), then submit it after their balance has been depleted. Should the contract perform a byte-level equality check — `require(keccak256(proof.encBalance) == keccak256(accounts[msg.sender].encryptedBalance), "stale proof")` — in `transfer()`, `withdraw()`, and `refresh()`? Or is there a different mechanism (e.g., a nonce/commitment scheme, or relying purely on the STARK verifier) that should enforce freshness?

**Why this is critical:** Without this or an equivalent check, the stale-state replay attack is possible: a proof generated when the sender had 100 ETH can be replayed after spending 99 ETH, because the contract never confirms the proof was generated against the current on-chain state. This is FAIL 1 from the Design Critic and blocks finalization of the smart contract spec.

**Answer:** Use a **stored `bytes32 encBalanceHash` field in the Account struct** as the freshness anchor, checked with a single `keccak256` call on the calldata argument.

**Why the other options are weaker:**

**Option: Pure STARK verifier reliance** — Not viable. The STARK verifier only sees what the contract passes as public inputs. It has no independent access to the on-chain stored ciphertext. The contract must explicitly confirm the freshness of the public input it hands to the verifier.

**Option: Nonce/commitment scheme** — A per-account `uint256 nonce` that increments on each balance update and is included as a STARK circuit public input would work, but it:
1. Requires adding a nonce constraint to all three circuits (Transfer, Withdrawal, Refresh)
2. Requires the frontend to query the current nonce before generating every proof
3. Provides *weaker* binding than a ciphertext hash — the nonce confirms "this proof was generated at state N" but does not cryptographically bind the proof to the specific ciphertext bytes stored at state N. If a future bug ever allows a nonce collision, the proof could be replayed with a different ciphertext.

**Recommended: `encBalanceHash` field in Account**

Add a `bytes32 encBalanceHash` field to the Account struct. Set it to `keccak256(encryptedBalance)` whenever `encryptedBalance` is written. Each balance-modifying function checks the calldata `encBalance` argument against this hash before passing anything to the verifier.

```solidity
struct Account {
    bytes     encryptedBalance;   // ~8KB Ring Regev ciphertext
    bytes     publicKey;
    bytes32   encBalanceHash;     // keccak256(encryptedBalance), updated on every write
    uint32    noiseCount;
}
```

**Freshness check in transfer(), withdraw(), and refresh():**
```solidity
require(
    keccak256(encBalance) == accounts[msg.sender].encBalanceHash,
    "stale proof: encBalance does not match current on-chain state"
);
```

**Gas impact:** The check reads one `bytes32` slot (cold: 2100 gas, warm: 100 gas) and hashes the calldata `encBalance` argument (6 gas per 32 bytes → ~1536 gas for 8KB). Total: ~1600–3600 gas per call, negligible on L2.

**Update rule (consistent across all paths):**
- `register()`: `accounts[msg.sender].encBalanceHash = keccak256(initialBalance)`
- `transfer()`: For receiver HomAdd updates — after computing the new encryptedBalance, set `encBalanceHash = keccak256(newEncryptedBalance)`. For the sender's balance update, same rule applies.
- `withdraw()` and `refresh()`: Set `encBalanceHash = keccak256(encNewBalance)` after storing the new ciphertext.

**No circuit changes required.** The `encBalance` argument is already a public input in all three circuits. The contract merely adds a pre-verification gate to confirm the proof was generated against the current ciphertext.

**Summary of changes to the design:**

1. Add `encBalanceHash bytes32` to the `Account` struct
2. Set `encBalanceHash` on every balance write (register, transfer receiver/sender update, withdraw, refresh)
3. Add `require(keccak256(encBalance) == accounts[msg.sender].encBalanceHash)` at the top of `transfer()`, `withdraw()`, and `refresh()` — before any proof verification
4. No circuit changes needed
