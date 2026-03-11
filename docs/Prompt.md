# PQ Private Transfer Protocol

## Project Overview
Implement a post-quantum anonymous transfer protocol on Ethereum using Scaffold-ETH (Hardhat + NextJS).
The protocol uses Ring Regev (RLWE) homomorphic encryption for confidential balances and client-side STARKs for zero-knowledge proofs.
Transfers achieve recipient anonymity via ORAM-inspired dummy recipients (N=4: 1 real + 3 dummies).

## Tech Stack
- **Smart Contracts:** Solidity + Hardhat
- **Frontend:** NextJS (Scaffold-ETH)
- **HE Library:** Ring Regev (RLWE), `n=1024`, `q=2²⁷`
- **ZK Library:** Client-side STARK prover/verifier
- **Parameters:** N=4 recipients per transfer

---

# Phase 1: Research
Research existing implementations and document findings before writing any code.

## Tasks
1. Research Solidity patterns for storing and operating on large byte arrays (ciphertexts ~8KB each)
2. Research available JS/TS libraries for RLWE Ring Regev encryption (`n=1024`, `q=2²⁷`)
3. Research available client-side STARK provers (e.g. Stone, Winterfell, Stwo) and their JS/WASM bindings
4. Research gas costs for storing and emitting 72KB of ciphertext calldata on L2 (Optimism or Base)
5. Document findings in `docs/research.md`

## Success Criteria
- [ ] Chosen HE library documented with justification
- [ ] Chosen STARK prover documented with justification
- [ ] Target L2 network selected and gas estimates documented
- [ ] `docs/research.md` created

<!-- After Phase 1 complete, update prompt for Phase 2 -->

---

# Phase 2: Cryptographic Primitives
Implement and validate the core HE and ZK primitives used by all features.

## Objective
Build the cryptographic layer that the smart contract and frontend will depend on.

## Requirements
1. Implement Ring Regev encryption/decryption (`n=1024`, `q=2²⁷`)
2. Implement homomorphic add and sub on ciphertexts
3. Implement the three STARK circuits (Deposit, Transfer, Withdrawal)
4. Expose all primitives as a clean TypeScript API under `packages/crypto/`for reusability between hardhat and nextjs packages

## Technical Specifications
- Language: TypeScript
- Ring: `R_q = Z_q[x]/(x^n + 1)`, `n=1024`, `q=134217728`
- NTT-based polynomial multiplication for performance
- STARK prover runs entirely client-side (no server)

## File Structure
```
packages/crypto/
  ringRegev.ts      // keygen, encrypt, decrypt, add, sub
  stark/
    depositCircuit.ts
    transferCircuit.ts
    withdrawCircuit.ts
  types.ts          // Ciphertext, PublicKey, ZKProof, etc.
```

## Circuit Specifications

### Deposit Circuit
```
Public inputs:  pk, initialBalance, depositAmount
Private inputs: r (encryption randomness)
Constraints:
  1. initialBalance == RingRegev.Encrypt(depositAmount, pk, r)
```

### Transfer Circuit
```
Public inputs:  pkB, pk[4], HEpkB(balanceB),
                enc_balance_to_update_receiver[4],
                enc_balance_to_update_sender[4], enc_total
Private inputs: pvkB, plaintext_balance, amounts[4], total, r_receiver[4], r_sender[4], r_total
Constraints:
  1. Decrypt(HEpkB(balanceB), pvkB)                        == plaintext_balance
  2. 0 <= total <= plaintext_balance
  3. sum(amounts[i])                                        == total
  4. amounts[i] >= 0                                        for all i
  5. enc_balance_to_update_receiver[i]                      == RingRegev.Encrypt(amounts[i], pk[i], r_receiver[i])
  6. enc_balance_to_update_sender[i]                        == RingRegev.Encrypt(amounts[i], pkB, r_sender[i])
  7. enc_total                                              == RingRegev.Encrypt(total, pkB, r_total)
  8. RingRegev.HomomorphicSum(enc_balance_to_update_sender) == enc_total
```

### Withdrawal Circuit
```
Public inputs:  pkB, encBalance, encAmount, encNewBalance, amount
Private inputs: pvkB, plaintext_balance, r_amount, r_new_balance
Constraints:
  1. Decrypt(encBalance, pvkB)      == plaintext_balance
  2. plaintext_balance              >= amount
  3. amount                         >= 0
  4. encAmount                      == RingRegev.Encrypt(amount, pkB, r_amount)
  5. encNewBalance                  == RingRegev.Encrypt(plaintext_balance - amount, pkB, r_new_balance)
  6. RingRegev.sub(encBalance, encAmount) == encNewBalance
```

## Success Criteria
- [ ] `ringRegev.ts` passes encrypt/decrypt roundtrip tests
- [ ] Homomorphic add/sub preserves plaintext correctness
- [ ] All three STARK proofs generate and verify correctly
- [ ] Prover time measured and documented (target: <5s on mid-range device)
- [ ] TypeScript types exported cleanly

---

# Phase 3: Smart Contract
Implement the `PrivateTransfer` Solidity contract.

## Objective
Deploy a contract that stores encrypted balances and verifies STARK proofs for deposit, transfer, and withdrawal.

## Requirements
1. Implement `register()` — payable, stores `HEpk(msg.value)` as initial balance
2. Implement `transfer()` — verifies STARK proof, updates N=4 encrypted balances atomically
3. Implement `withdraw()` — verifies STARK proof, pays ETH and updates encrypted balance
4. Implement on-chain `RingRegev.add()` and `RingRegev.sub()` as a Solidity library
5. Implement `STARKVerifier` contract for each of the three circuits

## Technical Specifications
- Framework: Hardhat
- Language: Solidity ^0.8.20
- Network: L2 (configured in `hardhat.config.ts`)
- Ciphertext stored as `bytes` (each ~8KB)

## Data Structures
```solidity
struct Account {
    bytes     encryptedBalance; // RingRegev ciphertext ~8KB
    bytes     publicKey;        // RLWE public key
}
mapping(address => Account) public accounts;
uint256 public totalDeposits;
```

## Functions

### register
```solidity
function register(
    bytes calldata pk,
    bytes calldata initialBalance,
    bytes calldata depositProof     // STARK proof for deposit circuit
) external payable
```

### transfer
```solidity
function transfer(
    address[]  calldata recipients,                  // length 4
    bytes[]    calldata encBalanceToUpdateReceiver,  // length 4
    bytes[]    calldata encBalanceToUpdateSender,    // length 4
    bytes      calldata encTotal,
    bytes      calldata proof
) external
```

### withdraw
```solidity
function withdraw(
    uint256    amount,
    bytes      calldata encAmount,
    bytes      calldata encNewBalance,
    bytes      calldata proof
) external
```

## Events
```solidity
event Registered(address indexed user, uint256 depositAmount);
event Transferred(address indexed sender, address[4] recipients);
event Withdrawn(address indexed user, uint256 amount);
```

## Success Criteria
- [ ] All three functions deploy and execute on local Hardhat network
- [ ] STARK verifier rejects invalid proofs
- [ ] Reentrancy guard on `withdraw()`
- [ ] Gas report generated via `hardhat-gas-reporter`
- [ ] 100% function coverage in tests

---

# Phase 4: Frontend
Build the NextJS UI using Scaffold-ETH components.

## Objective
Provide a minimal but functional UI for all three user flows: register, transfer, and withdraw.

## Requirements
1. **Register page** — input ETH amount, generate keypair client-side, encrypt deposit, generate STARK proof, submit tx
2. **Transfer page** — input recipient address and amount, auto-select 3 dummy accounts from registered pool, generate STARK proof, submit tx
3. **Withdraw page** — input withdrawal amount, generate STARK proof, submit tx
4. **Balance display** — decrypt and display own balance client-side (never sent to server)
5. Reuse Scaffold-ETH hooks (`useScaffoldContractWrite`, `useScaffoldContractRead`)

## Technical Specifications
- Framework: NextJS (Scaffold-ETH)
- Crypto: `lib/crypto/` from Phase 2
- Key storage: browser `localStorage` (private key never leaves client)
- STARK proving: Web Worker to avoid blocking UI

## Pages & Components
```
pages/
  register.tsx
  transfer.tsx
  withdraw.tsx
components/
  BalanceDisplay.tsx   // decrypts and shows balance
  ProofStatus.tsx      // shows STARK prover progress
  DummyPoolStatus.tsx  // shows available dummy accounts count
```

## Success Criteria
- [ ] Full register → transfer → withdraw flow works end-to-end
- [ ] STARK proof generated in Web Worker (UI remains responsive)
- [ ] Private key never leaves the browser
- [ ] Balance decrypted and displayed correctly
- [ ] Works on Hardhat local network

---

# Phase 5: Integration Testing & Validation

## Objective
Validate the full end-to-end protocol correctness and security properties.

## Test Scenarios
1. **Happy path** — register, transfer to real recipient, recipient withdraws
2. **Dummy recipients** — verify dummy balances receive encrypted zeros, real balance updates correctly
3. **Overdraft attempt** — transfer amount > balance, proof must fail
4. **Invalid proof** — tampered proof rejected by contract
5. **Double spend** — same balance used twice, second tx must fail
6. **Withdrawal underflow** — withdraw more than balance, proof must fail
7. **Unregistered recipient** — transfer to address with no account must revert

## Success Criteria
- [ ] All 7 scenarios pass
- [ ] Recipient anonymity validated: on-chain observer cannot distinguish real from dummy
- [ ] No plaintext amounts visible in tx calldata or events
- [ ] Full flow documented in `docs/protocol.md`
- [ ] README updated with setup and run instructions
