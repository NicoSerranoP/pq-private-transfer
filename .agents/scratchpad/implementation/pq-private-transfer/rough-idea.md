# PQ Private Transfer Protocol — Rough Idea

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

## Phases
1. Research — library selection, gas estimates
2. Cryptographic Primitives — TypeScript Ring Regev + STARK circuits
3. Smart Contract — PrivateTransfer.sol with on-chain verifier
4. Frontend — NextJS UI for register/transfer/withdraw flows
5. Integration Testing — 7 test scenarios
