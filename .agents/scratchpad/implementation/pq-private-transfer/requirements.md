# Requirements — PQ Private Transfer Protocol

Consolidated from `rough-idea.md` and `idea-honing.md` (4 gaps resolved).

---

## R1 — Denomination: szabo (microETH)

- Protocol unit: **1 szabo = 10¹² wei = 1 microETH**
- Max plaintext value: q − 1 = 134,217,727 szabo ≈ **134 ETH**
- Minimum transfer: 1 szabo = 0.000001 ETH
- Deposits must be exact multiples of 1 szabo; contract enforces `require(msg.value % 1e12 == 0)`
- `PROTOCOL_UNIT = 1e12` constant in Solidity and TypeScript
- Encode: `protocolAmount = weiAmount / PROTOCOL_UNIT`
- Decode: `weiAmount = protocolAmount * PROTOCOL_UNIT`

## R2 — STARK Strategy: Stub Proofs with Swappable Verifier

- Phase 2–4 use **stub STARK proofs** (verifier always returns true in dev mode)
- `STARKVerifier` is an isolated interface; swapping to a real prover changes only one contract + one TS call
- Phase 1 MUST benchmark Stwo (WASM), Risc0 zkVM (WASM), and Winterfell (WASM) against Transfer Circuit trace size
- If no viable client-side prover found in Phase 1, document the gap and continue with stubs
- Non-PQ provers (Groth16, Plonky2) are explicitly excluded

## R3 — Noise Management: refresh() + noiseCount + MAX_DUMMY_USES

- `Account` struct includes `uint32 noiseCount` (incremented each HomAdd on that account, reset on refresh)
- `MAX_DUMMY_USES = 5000` constant in Solidity
- `transfer()` reverts if any recipient's `noiseCount >= MAX_DUMMY_USES`
- `refresh()` contract function allows users to re-encrypt their balance with fresh noise:
  ```solidity
  function refresh(bytes calldata encNewBalance, bytes calldata proof) external
  ```
- RefreshCircuit (Phase 2): `Decrypt(encOld, pvk) == plaintext; encNew == Encrypt(plaintext, pk, r_new)`
- Reuses the same gadgets as the Withdrawal circuit
- Frontend includes a refresh button/page

## R4 — Key Derivation: Deterministic from Wallet Signature

- `ringRegev.keygen(seed: Uint8Array)` — seed-based, not random
- Frontend derives seed: `keccak256(sign("pq-private-transfer-v1"))` via MetaMask
- Private key (`sk`) stored in `localStorage`; public key (`pk`) registered on-chain
- UI displays a prototype-limitation banner: *"Your privacy key is derived from your wallet signature. Security is equivalent to your wallet's security, not post-quantum secure."*
- Production path (future): generate random key, encrypt backup with user password, require export before deposit

---

## Core Protocol Requirements (from rough-idea.md + Protocol_Design.md)

### Cryptographic Parameters
- Ring: `R_q = Z_q[x]/(x^n + 1)`, `n = 1024`, `q = 2²⁷ = 134,217,728`
- NTT-based polynomial multiplication
- Ciphertext: 2 polynomials × 4 KB = **8 KB per ciphertext**
- Per-transfer calldata: 4 × 8 KB + 4 × 8 KB + 8 KB = **72 KB total ciphertext**

### Smart Contract (Hardhat + Solidity ^0.8.20)

| Function   | Description                                                      |
|------------|------------------------------------------------------------------|
| `register` | Payable; stores `HEpk(msg.value)` as initial balance            |
| `transfer` | Verifies STARK proof; atomically updates N=4 encrypted balances |
| `withdraw` | Verifies STARK proof; pays ETH; updates encrypted balance       |
| `refresh`  | Re-encrypts balance with fresh noise; resets noiseCount         |

Data structure:
```solidity
struct Account {
    bytes   encryptedBalance;  // ~8 KB
    bytes   publicKey;
    uint32  noiseCount;
}
uint32 constant MAX_DUMMY_USES = 5000;
uint256 constant PROTOCOL_UNIT = 1e12;  // 1 szabo
mapping(address => Account) public accounts;
uint256 public totalDeposits;
```

### Circuits (Phase 2)

| Circuit    | Public Inputs                                    | Key Constraints                                  |
|------------|--------------------------------------------------|--------------------------------------------------|
| Deposit    | pk, initialBalance, depositAmount                | initialBalance == Encrypt(depositAmount, pk, r) |
| Transfer   | pkB, pk[4], encBalanceB, encUpdReceiver[4], encUpdSender[4], encTotal | Decrypt+range+sums+encryptions+HomSum |
| Withdrawal | pkB, encBalance, encAmount, encNewBalance, amount | Decrypt+range+encrypt+HomSub consistency        |
| Refresh    | pkB, encOldBalance, encNewBalance                | Decrypt(old)==Decrypt(new), encNew==Encrypt(plain, pk, r_new) |

### Frontend (NextJS + Scaffold-ETH)
- Key derivation on first use (sign + keccak256)
- STARK proving in Web Worker
- Private key never sent to server; stored only in localStorage
- Pages: register, transfer, withdraw, refresh
- Balance decrypted client-side only

### Integration Tests (7 required)
1. Happy path: register → transfer → recipient withdraws
2. Dummy recipients receive encrypted zeros; real balance updates correctly
3. Overdraft attempt: proof fails
4. Invalid proof: contract rejects
5. Double spend: second tx fails
6. Withdrawal underflow: proof fails
7. Unregistered recipient: reverts
8. (Additional) Refresh before noiseCount reaches MAX_DUMMY_USES
