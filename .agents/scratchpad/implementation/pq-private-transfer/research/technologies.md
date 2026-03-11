# Technologies Available

## Hardhat Package Dependencies

Key available libraries (packages/hardhat/package.json):
- `@openzeppelin/contracts ~5.0.2` — ReentrancyGuard, ERC20, etc.
- `hardhat ^3.1.0`
- `@nomicfoundation/hardhat-toolbox-mocha-ethers ^3.0.0`
- `ethers ^6.14.0`
- `mocha ^11.0.0`
- `chai ^5.1.2`
- `typescript ^5.8.2`
- `tsx ^4.21.0` — ESM TypeScript runner

**Missing (needed per design):**
- `hardhat-gas-reporter` — NOT installed. Phase 3 success criteria requires it. Must be added.

## NextJS Package Dependencies

Key available libraries (packages/nextjs/package.json):
- `next ~15.2.8`
- `react ~19.2.3`
- `viem 2.39.0`
- `wagmi 2.19.5`
- `@rainbow-me/rainbowkit 2.2.9`
- `@scaffold-ui/components ^0.1.8`
- `daisyui 5.0.9`
- `zustand ~5.0.0` — state management
- `usehooks-ts ~3.1.0`

## Crypto Package (to be created)

`packages/crypto` does not exist. Must create:
- `packages/crypto/package.json`
- `packages/crypto/tsconfig.json`
- `packages/crypto/src/types.ts`
- `packages/crypto/src/ringRegev.ts`
- `packages/crypto/src/stark/depositCircuit.ts`
- `packages/crypto/src/stark/transferCircuit.ts`
- `packages/crypto/src/stark/withdrawCircuit.ts`

Since workspace is `packages/*`, the new package is auto-included.
Import as `"@pq/crypto": "workspace:*"` in dependent package.json files.

No external crypto libraries needed — Ring Regev is implemented from scratch.

For SHA-256 in the mock STARK prover: use `@noble/hashes/sha256` (browser+Node compatible) — avoids Node.js `crypto` module incompatibility in the browser. This needs to be added as a dependency.

## Web Workers

`packages/nextjs/next.config.ts` webpack config does not configure workers explicitly.
Next.js 13+ supports workers via `new Worker(new URL('./worker.ts', import.meta.url))`.
Workers go in `packages/nextjs/workers/`.

## Serialization

From R13 — no additional libraries needed:
- TypeScript: manual BigInt to 4-byte LE in `Uint8Array`
- Solidity: manual byte loop (no `abi.decode` — incompatible with raw packing)

## Blockchain Target

- Development: local Hardhat (chainId 31337)
- Production: Optimism or Base (L2) — already configured in hardhat.config.ts
