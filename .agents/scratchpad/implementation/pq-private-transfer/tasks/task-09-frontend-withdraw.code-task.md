---
status: completed
created: 2026-03-11
started: 2026-03-11
completed: 2026-03-11
---
# Task: Frontend — Withdraw Page

## Description
Build the Withdraw page at `app/withdraw/page.tsx`. Users enter a withdrawal amount; the UI decrypts their current balance client-side to validate they have sufficient funds, generates a STARK Withdraw proof in the Web Worker, and submits the `withdraw()` transaction. ETH lands directly in their wallet.

## Background
The withdrawal flow:
1. Fetch `accounts[address].encryptedBalance` from contract
2. Decrypt with local `sk` to get `plaintext_balance`
3. User enters `amount` (must be ≤ plaintext_balance)
4. Generate Withdraw circuit proof: `prove({ pkB, encBalance, encAmount, encNewBalance, amount, pvkB, plaintext_balance, r_amount, r_new_balance })`
5. Submit `withdraw(amount, encAmount, encNewBalance, proof)`

The contract sends ETH via `call{value: amount}` — user receives real ETH in their wallet.

Note: The mock-prover limitation means the contract cannot enforce `amount <= plaintext_balance` on-chain; this is only enforced client-side by the circuit (documented limitation).

## Reference Documentation
**Required:**
- Design: .agents/scratchpad/implementation/pq-private-transfer/design.md

**Additional References:**
- .agents/scratchpad/implementation/pq-private-transfer/context.md (SE-2 patterns)
- packages/crypto/src/stark/withdrawCircuit.ts (Withdraw circuit inputs/outputs)
- packages/nextjs/app/register/page.tsx (Step 7 — pattern to follow)
- packages/nextjs/app/transfer/page.tsx (Step 8 — pattern to follow)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. `packages/nextjs/app/withdraw/page.tsx` — "use client", amount input, current balance display, submit button
2. Fetch and decrypt balance on page load (use `BalanceDisplay` from Step 7)
3. Client-side validation: `amount <= decryptedBalance`; show error if exceeded
4. Extend Web Worker to handle Withdraw circuit
5. Use `useScaffoldWriteContract` for the withdraw transaction
6. Show transaction success with received ETH amount
7. After successful withdraw: refresh balance display (it should decrease)
8. DaisyUI styling throughout

## Dependencies
- Step 6: PrivateTransfer.sol (`withdraw()` function)
- Step 7: `BalanceDisplay`, Web Worker, `ProofStatus` (reuse all)

## Implementation Approach
1. Implement Withdraw page with amount input wired to client-side validation
2. Extend Web Worker to handle Withdraw circuit inputs
3. Wire `useScaffoldWriteContract` for submission
4. Manual test: Bob withdraws 0.05 ETH after receiving transfer; verify ETH in wallet

## Acceptance Criteria

1. **Balance displayed**
   - Given registered user visits `/withdraw`
   - When page loads
   - Then decrypted balance shown (e.g. "Your balance: 0.05 ETH")

2. **Amount validation**
   - Given user enters amount > decrypted balance
   - When amount field is filled
   - Then error shown "Amount exceeds balance" and submit disabled

3. **Proof generated in Web Worker**
   - Given valid amount entered
   - When user clicks "Generate Proof"
   - Then Web Worker generates Withdraw circuit proof; ProofStatus shows progress and completion

4. **Withdraw transaction submitted**
   - Given valid proof ready
   - When user submits
   - Then `withdraw(amount, encAmount, encNewBalance, proof)` called on contract

5. **ETH received**
   - Given successful withdraw
   - When transaction confirmed
   - Then user's wallet balance increases by `amount` ETH; `Withdrawn` event emitted

6. **Balance updated**
   - Given withdraw succeeds
   - When balance is refreshed
   - Then `BalanceDisplay` shows reduced balance (`plaintext_balance - amount`)

7. **Manual test passes**
   - Given Bob received 0.05 ETH transfer on local network
   - When Bob withdraws 0.05 ETH via UI
   - Then transaction succeeds, Bob receives 0.05 ETH in wallet, balance shows 0

## Metadata
- **Complexity**: Medium
- **Labels**: frontend, nextjs, withdraw, ETH-transfer
- **Required Skills**: Next.js 15 App Router, React, Scaffold-ETH hooks, wagmi
