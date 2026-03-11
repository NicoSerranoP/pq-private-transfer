# PQ Private Transfer Protocol — Rough Idea

## Overview
Post-quantum anonymous transfer protocol on Ethereum using:
- Ring Regev (RLWE) homomorphic encryption for confidential balances
- Client-side STARKs for zero-knowledge proofs
- N=4 recipients per transfer (1 real + 3 dummies) for recipient anonymity

## Tech Stack
- Smart Contracts: Solidity + Hardhat
- Frontend: NextJS (Scaffold-ETH)
- HE: Ring Regev (n=1024, q=2^27)
- ZK: Client-side STARK prover/verifier
- Target: L2 (Optimism or Base)

## Key Complexity
- Each ciphertext ~8KB (two 1024-coefficient polynomials over Z_q)
- Transfer calldata ~72KB (4+4+1 ciphertexts)
- STARK circuits must prove Ring Regev polynomial operations inside the proof
- On-chain STARK verifier needed for all three operations

## Phases
1. Research (HE libs, STARK provers, gas costs)
2. Crypto primitives (TypeScript)
3. Smart Contract
4. Frontend
5. Integration Testing
