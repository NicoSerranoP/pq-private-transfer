---
status: completed
created: 2026-03-11
started: 2026-03-11
completed: 2026-03-11
---
# Task: Frontend — Transfer Page

## Description
Build the Transfer page at `app/transfer/page.tsx` and the `DummyPoolStatus` component. Users enter a recipient address and ETH amount; the UI auto-selects 3 dummy recipients from the registered pool, generates a STARK Transfer proof in the Web Worker, and submits the `transfer()` transaction.

## Background
Recipient anonymity is achieved by always sending to exactly 4 recipients: 1 real + 3 dummies. The contract requires `totalRegistered >= 5`. The frontend must:
1. Fetch all registered addresses from `Registered` events (using `useScaffoldEventHistory`)
2. Filter out the sender and the real recipient
3. Randomly sample 3 dummies from the remaining pool
4. Encrypt amounts for all 4 recipients (real amount for Bob, zeros for dummies)

For each of the 4 recipients and the sender, the circuit needs `encBalanceToUpdateReceiver[i]` and `encBalanceToUpdateSender[i]`. These are produced by the TypeScript Transfer circuit in `packages/crypto`.

Pool requirement: if fewer than 4 other registered users exist (after removing sender + real recipient), the UI must block with an error.

## Reference Documentation
**Required:**
- Design: .agents/scratchpad/implementation/pq-private-transfer/design.md

**Additional References:**
- .agents/scratchpad/implementation/pq-private-transfer/context.md (SE-2 event history hook patterns)
- packages/crypto/src/stark/transferCircuit.ts (Transfer circuit inputs/outputs)
- packages/nextjs/app/register/page.tsx (Step 7 output — pattern to follow)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. `packages/nextjs/app/transfer/page.tsx` — "use client", recipient address input, ETH amount input, submit button
2. `packages/nextjs/components/DummyPoolStatus.tsx` — shows count of available dummy candidates (registered users minus sender minus real recipient)
3. Use `useScaffoldEventHistory` to fetch `Registered` events and build the registered pool
4. Auto-select 3 dummies randomly from eligible pool when recipient and amount are entered
5. Generate Transfer circuit proof in the existing Web Worker (extend `starkProver.worker.ts`)
6. Use `useScaffoldWriteContract` for the transfer transaction
7. Disable submit button when pool has fewer than 3 eligible dummies
8. Show all 4 recipient addresses (1 real + 3 dummy) in a summary before submission

## Dependencies
- Step 6: PrivateTransfer.sol (ABI, `transfer()` function signature)
- Step 7: Web Worker and ProofStatus component (reuse them)

## Implementation Approach
1. Implement `DummyPoolStatus` component that reads Registered events
2. Implement Transfer page with recipient/amount inputs
3. Wire dummy selection logic (filter pool, random sample)
4. Extend Web Worker to handle Transfer circuit
5. Wire up `useScaffoldWriteContract` for submission
6. Manual test: 5 registered users, transfer 0.05 ETH from Alice to Bob; verify 4 balance updates on-chain

## Acceptance Criteria

1. **Pool display**
   - Given 6 registered users and sender = Alice, recipient = Bob
   - When Transfer page renders
   - Then `DummyPoolStatus` shows "4 eligible dummies available" (6 - Alice - Bob)

2. **Pool too small**
   - Given only 3 registered users total
   - When Transfer page renders
   - Then submit button is disabled with "Not enough registered users (need 5+)"

3. **Dummy selection**
   - Given a valid pool of 4+ eligible users
   - When recipient and amount are entered
   - Then 3 dummies are auto-selected and shown alongside the real recipient

4. **Transfer transaction**
   - Given valid inputs and proof generated in Web Worker
   - When user submits
   - Then `transfer(recipients, encBalanceToUpdateReceiver, encBalanceToUpdateSender, encTotal, proof)` is called with all 4 recipients

5. **Balance updates on-chain**
   - Given transfer succeeds
   - When Alice checks her balance
   - Then Alice's `encryptedBalance` reflects subtraction; all 4 recipients' balances reflect addition

6. **Manual test passes**
   - Given 5+ registered users on local network
   - When Alice transfers 0.05 ETH to Bob
   - Then `Transferred` event emitted, all 4 accounts updated on-chain

## Metadata
- **Complexity**: High
- **Labels**: frontend, nextjs, transfer, dummy-pool, anonymity
- **Required Skills**: Next.js 15 App Router, React, Scaffold-ETH event history, wagmi
