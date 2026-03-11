---
status: completed
created: 2026-03-11
started: 2026-03-11
completed: 2026-03-11
---
# Task: Frontend — Register Page

## Description
Build the Register page at `app/register/page.tsx`, the `BalanceDisplay` component, the `ProofStatus` component, and the STARK Web Worker. This is the entry point for users — they generate a keypair, encrypt their deposit, generate a STARK proof, and submit the `register()` transaction.

## Background
Key design constraints:
- Private key NEVER leaves the browser — stored in `localStorage` only
- STARK proof generation is CPU-intensive — MUST run in a Web Worker to keep UI responsive
- Balance is decrypted client-side using the local private key — never sent to server
- The `packages/crypto` library (from Phase 2) is the crypto backend

The SE-2 frontend uses Next.js 15 App Router (`app/` directory), `"use client"` for interactive pages, `useScaffoldWriteContract` for contract writes, and DaisyUI for styling.

## Reference Documentation
**Required:**
- Design: .agents/scratchpad/implementation/pq-private-transfer/design.md

**Additional References:**
- .agents/scratchpad/implementation/pq-private-transfer/context.md (SE-2 patterns, Next.js 15 App Router)
- packages/crypto/src/index.ts (crypto API)
- packages/nextjs/app/page.tsx (existing page pattern to follow)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. `packages/nextjs/app/register/page.tsx` — "use client", ETH amount input, generate keypair button, submit register tx
2. `packages/nextjs/components/BalanceDisplay.tsx` — reads `accounts[address].encryptedBalance` from contract, decrypts with local sk, displays ETH equivalent
3. `packages/nextjs/components/ProofStatus.tsx` — shows proof generation progress (idle/generating/done/error states)
4. `packages/nextjs/workers/starkProver.worker.ts` — Web Worker that accepts `{ circuit, inputs }` message and posts back `{ proof }` or `{ error }`
5. Use `useScaffoldWriteContract` for the register transaction
6. Use `useScaffoldReadContract` to fetch `accounts[address]`
7. Store `{ sk, pk }` in `localStorage` under key `pq-private-transfer-keypair`
8. Handle case where user already has a key in localStorage (show existing key info, allow re-registration)
9. DaisyUI styling throughout

## Dependencies
- Step 6: PrivateTransfer.sol deployed (ABI available in `deployedContracts.ts`)
- packages/crypto: crypto API available

## Implementation Approach
1. Create the Web Worker file first (testable in isolation)
2. Implement ProofStatus component
3. Implement BalanceDisplay component
4. Implement Register page wiring everything together
5. Manual test: register with 0.1 ETH, verify key in localStorage, balance displayed correctly

## Acceptance Criteria

1. **Keypair generation**
   - Given user visits `/register`
   - When they click "Generate Keypair"
   - Then a new `{ pk, sk }` is generated via `packages/crypto` and stored in `localStorage`

2. **Register transaction submitted**
   - Given a keypair is generated and ETH amount entered
   - When user clicks "Register"
   - Then STARK proof is generated in Web Worker, `register(pk, initialBalance, proof)` is called, `Registered` event appears

3. **Balance display**
   - Given user is registered with 0.1 ETH
   - When `BalanceDisplay` renders
   - Then it decrypts `encryptedBalance` from contract storage and shows `0.1 ETH` (approximately)

4. **ProofStatus spinner**
   - Given proof generation starts
   - When Web Worker is computing
   - Then `ProofStatus` shows a loading state; UI remains responsive (no freeze)

5. **Proof done state**
   - Given Web Worker completes
   - When proof is received
   - Then `ProofStatus` shows "Proof ready" and submit button becomes enabled

6. **Manual test passes**
   - Given local network running and contract deployed
   - When user completes the register flow
   - Then transaction succeeds, `Registered` event emitted, balance shown on page

## Metadata
- **Complexity**: High
- **Labels**: frontend, nextjs, register, web-worker, crypto
- **Required Skills**: Next.js 15 App Router, React, Web Workers, Scaffold-ETH hooks, wagmi
