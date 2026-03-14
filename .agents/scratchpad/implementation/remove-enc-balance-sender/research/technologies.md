## Technologies and Tooling

### Workspace and validation commands

- Root workspace scripts in `package.json:10-50` expose the main validation entrypoints:
  - `pnpm compile` → Hardhat compile only
  - `pnpm test` / `pnpm hardhat:test` → Hardhat contract tests
  - `pnpm next:build` → Next.js production build
  - `pnpm next:check-types` → Next.js type check
- `packages/crypto/package.json:9-12` defines crypto-package validation with:
  - `node --import tsx/esm --test src/*.test.ts src/**/*.test.ts`
  - `tsc --noEmit`
- `packages/hardhat/package.json:10-23` confirms Hardhat uses `hardhat build`, `hardhat test`, ESLint, and TypeScript checks.
- `packages/nextjs/package.json:5-17` confirms the frontend uses Next.js App Router with `next build`, ESLint, and TypeScript checks.

### ABI generation path

- `packages/hardhat/scripts/generateTsAbis.ts:156-182` is the checked-in ABI generation path for `packages/nextjs/contracts/deployedContracts.ts`.
- The script reads deployment/build-info data and writes a formatted TypeScript contract map into `../nextjs/contracts/deployedContracts.ts`, so ABI changes should follow the repo’s normal Hardhat regeneration flow instead of manual edits where possible.

### Relevant libraries and runtime surfaces

- `packages/nextjs/package.json:18-41` shows the frontend depends on `@pq/crypto`, `next`, `wagmi`, `viem`, and Scaffold-UI / Scaffold-ETH packages.
- `packages/crypto/src/index.ts:17-18` re-exports `TransferPublicInputs`, `TransferPrivateInputs`, `proveTransfer`, and `verifyTransfer`, so downstream type breakage will flow through the package entrypoint naturally once `transferCircuit.ts` changes.
- `packages/hardhat/contracts/PrivateTransfer.sol:4-8` uses OpenZeppelin `ReentrancyGuard` plus local `RingRegev` and verifier contracts.

### Prototype verifier constraint

- `packages/hardhat/contracts/verifiers/TransferVerifier.sol:4-10` is a mock verifier that only checks `commitment != 0` and `inputs.length > 0`.
- `packages/hardhat/contracts/verifiers/DepositVerifier.sol:4-10` and `packages/hardhat/contracts/verifiers/WithdrawVerifier.sol:4-10` follow the same prototype pattern.

Implication:

- The Solidity transfer path does **not** currently bind calldata fields to proof bytes beyond “non-zero commitment + non-empty inputs”.
- Because of that, serialization/layout regressions are primarily caught by:
  - `packages/crypto/src/stark/transferCircuit.test.ts`
  - typed frontend call sites and `deployedContracts.ts`
  - explicit frontend build/type-check validation

### Generated artifact constraint

- `packages/hardhat/ignition/deployments/chain-31337/build-info/solc-0_8_30-a93cbe9086382cdf97059c8f24a6c803385dc3a8.json:40` still embeds the old transfer signature and source snapshot.

Implication:

- There are generated Hardhat-side artifacts in the repo that may continue to mention `encBalanceToUpdateSender` until the normal compile/deploy generation flow is rerun.
- Builders should treat those as generated outputs to refresh, not as primary hand-edited source files.
