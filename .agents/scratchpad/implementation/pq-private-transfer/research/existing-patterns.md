# Existing Patterns — PQ Private Transfer

**Updated 2026-03-11: packages/crypto ALREADY EXISTS; most implementation is done.**

## Deployment System

**Hardhat Ignition** (not hardhat-deploy). This is critical.

- Deploy entry: `packages/hardhat/scripts/runHardhatDeployWithPK.ts:10`
  - Hardcodes `IGNITION_MODULE = "ignition/modules/SE2Token.ts"` ← must change to PrivateTransfer
  - Calls `hardhat ignition deploy <module>`, then runs `generateTsAbis.ts`
- Existing ignition module: `packages/hardhat/ignition/modules/PrivateTransfer.ts` ← ALREADY EXISTS
  - Pattern: `buildModule("PrivateTransferModule", m => { const c = m.contract("PrivateTransfer"); return { c }; })`
  - PrivateTransfer constructor deploys its own verifiers (no constructor args needed in ignition module)
- After deploy, `generateTsAbis.ts` generates `packages/nextjs/contracts/deployedContracts.ts`

## Solidity Conventions

- Solidity version: `^0.8.30` (packages/hardhat/hardhat.config.ts:13)
- Optimizer: enabled, 200 runs
- OpenZeppelin v5.0.2 available: `@openzeppelin/contracts/utils/ReentrancyGuard.sol`
- Existing contract: `packages/hardhat/contracts/SE2Token.sol` — minimal ERC-20

## Testing Patterns

- Test framework: **Mocha + Chai** via `@nomicfoundation/hardhat-toolbox-mocha-ethers`
- Test command: `hardhat test` (packages/hardhat/package.json:scripts.test)
- Test directory: `packages/hardhat/test/`
- **Existing test files:** `RingRegev.test.ts`, `Verifiers.test.ts`, `PrivateTransfer.test.ts`
- TypeScript, ethers v6
- Tests run as ESM (package `"type": "module"`)
- Pattern: `network.connect()` gives `{ ethers }`, signers array, deploy in `before()` hook
- Assertions: `expect(x).to.equal(y)`, `revertedWithCustomError(contract, "ErrorName")`
- Valid proof: `keccak256(toUtf8Bytes("test-proof"))` as commitment + `"0x1234"` as inputs
- Invalid proof: zero bytes32 commitment

## Frontend Patterns

- App Router (Next.js 15), pages in `packages/nextjs/app/<route>/page.tsx`
- Pattern from `app/erc20/page.tsx`:
  - `"use client"` directive at top
  - `import type { NextPage } from "next"`
  - `const PageComponent: NextPage = () => { ... }`
  - `export default PageComponent`
  - Uses `useScaffoldReadContract`, `useScaffoldWriteContract` hooks
  - Uses `@scaffold-ui/components` for UI (AddressInput, etc.)
  - DaisyUI classes (`btn btn-primary`, `card`, etc.)
- `~~/*` path alias maps to `packages/nextjs/*` (tsconfig.json)
- Notifications: `notification` from `~~/utils/scaffold-eth`

## Hook Names (confirmed in hooks/scaffold-eth/index.ts)
- `useScaffoldReadContract` ✅
- `useScaffoldWriteContract` ✅
- `useScaffoldEventHistory` ✅
- `useScaffoldWatchContractEvent` ✅

## TypeScript Config

- Hardhat package: ESM module (`"type": "module"`, `module: "node16"`)
- NextJS: standard Next.js TSConfig, `~~/*` path alias

## packages/crypto/ — ALREADY EXISTS
All exports done. Key facts:
- `proveDeposit(pub, priv): ZKProof` — SHA-256 over serialized public inputs; `priv` is ignored
- `ZKProof = { commitment: Uint8Array (32 bytes), inputs: Uint8Array }`
- On-chain, `commitment` maps to `bytes32`; `inputs` maps to `bytes`
- Contract calls `_depositVerifier.verify(commitment, proofInputs)` passing both separately
- `serializeCiphertext` → 8192 bytes; `serializePublicKey` → 8192 bytes

