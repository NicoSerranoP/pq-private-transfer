# PQ Private Transfer — Consolidated Requirements

## Scope
Post-quantum anonymous transfer protocol on Ethereum. Confidential balances via Ring Regev (RLWE) HE. Recipient anonymity via N=4 dummy recipients. Client-side STARK proofs (mock for prototype).

---

## R1 — Cryptographic Parameters
- Ring: `R_q = Z_q[x]/(x^n + 1)`, `n=1024`, `q=2²⁷ = 134 217 728`
- Each ciphertext = pair `(a, b) ∈ R_q²` ≈ 8 KB
- Schoolbook O(n²) polynomial multiplication (NTT requires prime `q ≡ 1 (mod 2n)`; `q=2²⁷` is not prime — NTT is infeasible with these parameters)
- Security level: 128-bit post-quantum (RLWE)

## R2 — STARK Prover (Mock for Prototype)
- Full Ring Regev polynomial arithmetic inside a STARK prover is infeasible at prototype scale (<5s target, no WASM RLWE gadgets in any current library)
- The prototype uses a **mock STARK prover**: deterministic hash/commitment over public inputs, correct TypeScript interface, clearly documented as a stub
- The on-chain `STARKVerifier` checks proof format and input well-formedness only
- Ring Regev HE (encrypt/decrypt/add/sub) is implemented in full — only ZK proof generation/verification is stubbed
- The mock is a drop-in replacement for a real prover in the future

## R3 — Anonymity Pool Minimum
- Transfer requires exactly N=4 distinct recipients (1 real + 3 dummies), all registered, all ≠ sender
- Minimum pool size for any transfer: **5 total registered users** (sender + real + 3 dummies)
- Contract stores `uint256 public totalRegistered` incremented in `register()`
- Contract validates all 4 recipients are registered, distinct, and ≠ sender
- On-chain revert: `InsufficientPool(uint256 have, uint256 need)` if pool too small
- Frontend checks `totalRegistered >= 5` before enabling Transfer UI; auto-selects 3 dummies randomly (excluding sender and real recipient)

## R4 — Top-up Deposits
- A separate `deposit()` function is in scope; re-registration is NOT allowed
- `deposit()` requires caller to be already registered (revert `NotRegistered()` otherwise)
- Uses the same Deposit Circuit as `register()`: proves `encAmount == Encrypt(msg.value, pk, r)`
- On-chain: `accounts[msg.sender].encryptedBalance = RingRegev.add(existingBalance, encAmount)`
- Emits `Deposited(address indexed user, uint256 amount)`
- Frontend: "Top-up" button on balance/register page, same UX as initial registration

## R5 — Smart Contract Functions
| Function | Payable | Requirements |
|---|---|---|
| `register(pk, initialBalance, depositProof)` | ✅ | One-time, verifies Deposit proof, stores balance |
| `deposit(encAmount, depositProof)` | ✅ | Must be registered, HE.add to existing balance |
| `transfer(recipients[4], encBalanceToUpdateReceiver[4], encTotal, proof)` | ❌ | 4 distinct registered recipients ≠ sender, verifies Transfer proof |
| `withdraw(amount, encAmount, encNewBalance, proof)` | ❌ | Verifies Withdrawal proof, CEI pattern, reentrancy guard |

- Transfer no longer includes `encBalanceToUpdateSender[4]` in the proof public outputs, contract ABI, or frontend call surface.
- Transfer also removes sender-side per-recipient randomness `r_sender[4]` and deletes the old homomorphic-sum constraint 8 entirely.
- This is an intentional repo-wide breaking change; the repo does not need dual support for old and new transfer public-input layouts.

## R6 — On-chain HE Library
- Solidity library `RingRegev` with `add(bytes, bytes)` and `sub(bytes, bytes)`
- Ciphertexts stored and passed as `bytes` (coefficient arrays serialized)

## R7 — Events
```solidity
event Registered(address indexed user, uint256 depositAmount);
event Deposited(address indexed user, uint256 amount);
event Transferred(address indexed sender, address[4] recipients);
event Withdrawn(address indexed user, uint256 amount);
```

## R8 — TypeScript Crypto Package
- `packages/crypto/` shared by hardhat (tests) and nextjs (frontend)
- Exports: `ringRegev.ts` (keygen, encrypt, decrypt, add, sub), `stark/` (depositCircuit, transferCircuit, withdrawCircuit), `types.ts`

## R9 — Frontend Pages
- `/register` — generate keypair, encrypt deposit, generate proof, submit tx
- `/transfer` — input recipient + amount, auto-select dummies, generate proof, submit tx
- `/withdraw` — input amount, generate proof, submit tx
- `BalanceDisplay` — decrypt and show own balance (never sent to server)
- STARK proving runs in a Web Worker (UI non-blocking)
- Private key stored in `localStorage` only, never leaves browser

## R10 — Testing
- 100% function coverage for all contract functions
- 7 integration test scenarios (happy path, dummy balances, overdraft, invalid proof, double spend, withdrawal underflow, unregistered recipient)
- Recipient anonymity property: on-chain observer cannot distinguish real from dummy

## R11 — Deployment Target
- L2 (Optimism or Base) — gas estimates in `docs/research.md`
- Local Hardhat network for development and testing

## R12 — Double-Spend Prevention
- `mapping(bytes32 => bool) usedTransfers` stores `keccak256(encTotal)` after each successful transfer
- `transfer()` checks nullifier not used before verifying proof; reverts `TransferAlreadyUsed()` if already used
- Nullifier set AFTER all checks and state updates (CEI)

## R13 — Serialization (TypeScript ↔ Solidity Bridge)
- Polynomials serialized as 4096 bytes: each coefficient as 4-byte little-endian uint32
- Ciphertext = `a || b` = 8192 bytes
- PublicKey has identical layout to Ciphertext
- TypeScript: `serializePolynomial` / `deserializePolynomial` helpers in `ringRegev.ts`
- Solidity: manual loop decoding — `abi.decode(data, (uint32[1024]))` is incompatible because ABI encoding pads each `uint32` to 32 bytes (32768 bytes total, not 4096). Use a byte-loop: `poly[i] = uint32(uint8(data[i*4])) | (uint32(uint8(data[i*4+1])) << 8) | (uint32(uint8(data[i*4+2])) << 16) | (uint32(uint8(data[i*4+3])) << 24)` — `data[i*4]` is `bytes1`; casting directly to `uint32` fails in Solidity 0.8+ (size mismatch); the intermediate `uint8` step is required

## R14 — deposit() uses on-chain pk
- `deposit(bytes encAmount, bytes depositProof)` does NOT take pk as a parameter
- Contract reads `accounts[msg.sender].publicKey` to build verifier public inputs
- Reverts `NotRegistered()` if caller has no account
