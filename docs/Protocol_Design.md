## Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| **Homomorphic Encryption** | Ring Regev (RLWE) | Polynomial ring `R_q = Z_q[x]/(x^n + 1)`, additive HE, PQ-secure |
| **Zero Knowledge Proofs** | Client-side STARK | Efficient prover on client, PQ-secure (hash-based, no trusted setup) |
| **On-chain verification** | STARK verifier | Logarithmic verification cost, no elliptic curve assumptions |

> Both primitives are post-quantum secure. Ring Regev hardness relies on RLWE, STARKs rely only on collision-resistant hash functions — neither is broken by Shor's algorithm.

### Parameters (Prototype)

| Parameter | Value | Reason |
|---|---|---|
| `n` | 1024 | 128-bit PQ security level against RLWE attacks |
| `q` | 2²⁷ (134 217 728) | Balances noise budget and ciphertext size |
| `N` | 4 | 1 real recipient + 3 dummies |

**Ciphertext size:** each ciphertext is a pair `(a, b) ∈ R_q²`
```
1 coefficient = 27 bits ≈ 4 bytes
1 polynomial  = 1024 × 4 = 4 KB
1 ciphertext  = 2 polynomials = 8 KB
```

**Per transfer calldata breakdown:**
```
enc_balance_to_update_receiver[4]  = 4 × 8 KB = 32 KB
enc_balance_to_update_sender[4]    = 4 × 8 KB = 32 KB
enc_total                          =     1 × 8 KB =  8 KB
─────────────────────────────────────────────────────────
Total ciphertext calldata          ≈ 72 KB
```

> For the prototype this is acceptable. Production would compress coefficients and batch multiple transfers.

---

## Full Protocol Design

### Data Structures

```
Account {
  encrypted_balance: Ciphertext  // HE(balance) under owner's pk
  public_key: PK
}

Transfer {
  recipients: address[N]                      // 1 real + N-1 dummies
  enc_balance_to_update_receiver: Ciphertext[N]  // HEpk_i(amount_i)
  enc_balance_to_update_sender: Ciphertext[N]    // HEpkB(amount_i) for each i
  enc_total: Ciphertext                       // HEpkB(sum) for sender deduction
  proof: ZKProof
}
```

---

## Circuit Design

### A) Deposit Circuit (used in `register`)

Proves that `initialBalance` is a valid encryption of `msg.value` under `pk`.

#### Public Inputs
```
1. pk              // registering user's public key
2. initialBalance  // HEpk(msg.value)
3. msg.value       // plaintext deposit amount (visible on-chain anyway)
```

#### Private Inputs
```
1. r               // randomness used in encryption
```

#### Constraints
```
1. initialBalance == RingRegev.Encrypt(msg.value, pk, r)
```

---

### B) Transfer Circuit (used in `transfer`)

### Public Inputs
```
1. pkB                          // sender public key
2. pk[N]                        // all recipient public keys (real + dummies)
3. HEpkB(balance_B)             // sender's on-chain encrypted balance
```

### Private Inputs
```
1. pvkB                         // sender private key
2. plaintext_balance_B          // sender decrypted balance
3. amounts[N]                   // amount_i per recipient (one real, rest 0)
4. total                        // sum of amounts[N]
5. r_receiver[N]                // randomness for receiver-key encryptions
6. r_sender[N]                  // randomness for sender-key encryptions
7. r_total                      // randomness for total encryption
```

### Public Outputs
```
1. enc_balance_to_update_receiver[N]  // HEpk_i(amount_i) — added to recipient balances
2. enc_balance_to_update_sender[N]   // HEpkB(amount_i)  — for sum verification on-chain
3. enc_total                         // HEpkB(total)     — subtracted from sender balance
```

### Constraints (encoded as STARK trace)
```
1. Decrypt(HEpkB(balance_B), pvkB) == plaintext_balance_B

2. 0 <= total <= plaintext_balance_B

3. sum(amounts[i] for i in N) == total

4. amounts[i] >= 0  for all i in N

5. enc_balance_to_update_receiver[i] == RingRegev.Encrypt(amounts[i], pk[i], r_receiver[i])  for all i
6. enc_balance_to_update_sender[i]   == RingRegev.Encrypt(amounts[i], pkB,   r_sender[i])    for all i

7. enc_total == RingRegev.Encrypt(total, pkB, r_total)

// Homomorphic sum verification (done inside circuit):
8. RingRegev.HomomorphicSum(enc_balance_to_update_sender[N]) == enc_total
```

> Constraint 8 lets the contract trust `enc_total` without re-summing ciphertexts — the proof guarantees consistency.

---

### C) Withdrawal Circuit (used in `withdraw`)

Proves the user owns a balance >= withdrawal amount without revealing the balance.

#### Public Inputs
```
1. pkB              // withdrawer's public key
2. encBalance       // HEpkB(balance)   — current on-chain balance
3. encAmount        // HEpkB(amount)    — encryption of withdrawal amount
4. encNewBalance    // HEpkB(balance - amount)
5. amount           // plaintext withdrawal amount (visible on-chain)
```

#### Private Inputs
```
1. pvkB             // withdrawer's private key
2. plaintext_balance // decrypted current balance
3. r_amount         // randomness used to encrypt amount
4. r_new_balance    // randomness used to encrypt new balance
```

#### Constraints
```
1. Decrypt(encBalance, pvkB)    == plaintext_balance
2. plaintext_balance            >= amount             (no underflow)
3. amount                       >= 0
4. encAmount                    == RingRegev.Encrypt(amount, pkB, r_amount)
5. encNewBalance                == RingRegev.Encrypt(plaintext_balance - amount, pkB, r_new_balance)

// Homomorphic consistency check:
6. RingRegev.sub(encBalance, encAmount) == encNewBalance
```

> Constraint 6 lets the contract trust `encNewBalance` is consistent with the current on-chain balance, preventing a user from lying about their new balance after withdrawal.

---

```solidity
contract PrivateTransfer {

    struct Account {
        Ciphertext encryptedBalance;
        PublicKey  publicKey;
    }

    mapping(address => Account) public accounts;

    // -------------------------------------------------------
    // Registration
    // -------------------------------------------------------

    // User sends ETH on registration — msg.value is encrypted
    // client-side as RingRegev.Encrypt(msg.value, pk) and passed in
    function register(PublicKey calldata pk, Ciphertext calldata initialBalance) external payable {
        require(accounts[msg.sender].publicKey == 0, "already registered");
        require(msg.value > 0, "must deposit ETH on registration");

        // initialBalance must be a valid encryption of msg.value under pk.
        // The STARK proof ensures Decrypt(initialBalance, sk) == msg.value
        // without revealing sk or the plaintext to the contract.
        require(STARKVerifier.verifyDeposit(pk, initialBalance, msg.value, depositProof), "invalid deposit proof");

        accounts[msg.sender] = Account(initialBalance, pk);
        totalDeposits += msg.value;

        emit Registered(msg.sender, msg.value);
    }

    // -------------------------------------------------------
    // Withdrawal
    // -------------------------------------------------------

    // User proves they own an encrypted balance >= amount,
    // contract pays out amount in ETH and deducts from encrypted balance.
    function withdraw(
        uint256      amount,
        Ciphertext   calldata encAmount,   // RingRegev.Encrypt(amount, pkB)
        Ciphertext   calldata encNewBalance, // RingRegev.Encrypt(balance - amount, pkB)
        ZKProof      calldata proof
    ) external {
        require(amount > 0, "amount must be > 0");
        require(address(this).balance >= amount, "insufficient contract balance");

        // Proof verifies (without revealing balance):
        // 1. Decrypt(encCurrentBalance, pvkB) == plaintext_balance
        // 2. Decrypt(encAmount, pvkB)         == amount
        // 3. Decrypt(encNewBalance, pvkB)     == plaintext_balance - amount
        // 4. plaintext_balance >= amount      (no underflow)
        // 5. encCurrentBalance == accounts[msg.sender].encryptedBalance
        WithdrawPublicInput memory pub = WithdrawPublicInput({
            pkB            : accounts[msg.sender].publicKey,
            encBalance     : accounts[msg.sender].encryptedBalance,
            encAmount      : encAmount,
            encNewBalance  : encNewBalance,
            amount         : amount
        });

        require(STARKVerifier.verifyWithdraw(pub, proof), "invalid withdrawal proof");

        // Update encrypted balance to HE(balance - amount)
        accounts[msg.sender].encryptedBalance = encNewBalance;
        totalDeposits -= amount;

        // Transfer ETH to user
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "ETH transfer failed");

        emit Withdrawn(msg.sender, amount);
    }

    // -------------------------------------------------------
    // Transfer
    // -------------------------------------------------------

    function transfer(
        address[]    calldata recipients,                   // length N
        Ciphertext[] calldata encBalanceToUpdateReceiver,   // HEpk_i(amount_i), length N
        Ciphertext[] calldata encBalanceToUpdateSender,     // HEpkB(amount_i),  length N
        Ciphertext   calldata encTotal,                     // HEpkB(total)
        ZKProof      calldata proof
    ) external {
        uint N = recipients.length;
        require(N == encBalanceToUpdateReceiver.length, "length mismatch");
        require(N == encBalanceToUpdateSender.length,   "length mismatch");

        // ── 1. Build public inputs for verifier ──────────────────

        PublicKey[] memory recipientKeys = new PublicKey[](N);
        for (uint i = 0; i < N; i++) {
            address r = recipients[i];
            require(accounts[r].publicKey != 0, "recipient not registered");
            recipientKeys[i] = accounts[r].publicKey;
        }

        PublicInput memory pub = PublicInput({
            pkB                         : accounts[msg.sender].publicKey,
            recipientKeys               : recipientKeys,
            encBalanceB                 : accounts[msg.sender].encryptedBalance,
            encBalanceToUpdateReceiver  : encBalanceToUpdateReceiver,
            encBalanceToUpdateSender    : encBalanceToUpdateSender,
            encTotal                    : encTotal
        });

        // ── 2. Verify STARK proof ────────────────────────────────

        require(STARKVerifier.verify(pub, proof), "invalid proof");

        // ── 3. Deduct from sender (Ring Regev homomorphic sub) ───

        accounts[msg.sender].encryptedBalance = RingRegev.sub(
            accounts[msg.sender].encryptedBalance,
            encTotal
        );

        // ── 4. Credit all recipients (Ring Regev homomorphic add)

        for (uint i = 0; i < N; i++) {
            accounts[recipients[i]].encryptedBalance = RingRegev.add(
                accounts[recipients[i]].encryptedBalance,
                encBalanceToUpdateReceiver[i]
            );
        }
    }
}
```

---

## What the adversary sees on-chain

```
msg.sender  = Bob                          // sender known
recipients  = [Alice, Carol, Dave, Eve]    // can't tell which is real
encBalancesToUpdate = [HE(?), HE(?), HE(?), HE(?)] // all ciphertexts, indistinguishable
encTotal    = HE(?)                        // total deducted, hidden
proof       = π                            // only proves validity, reveals nothing
```

---

## Security Properties

| Property | Status | Mechanism |
|---|---|---|
| Sender identity | ⚠️ Visible | `msg.sender` is always public |
| Recipient anonymity | ✅ | 1-of-N indistinguishable |
| Amount privacy | ✅ | All amounts encrypted |
| Balance integrity | ✅ | ZK constraint 2 prevents overdraft |
| No inflation | ✅ | ZK constraints 3 + 8 |
| Dummy indistinguishability | ✅ | Enc(0) == Enc(x) under randomized HE |
| Double spend | ✅ | On-chain balance updated atomically |
