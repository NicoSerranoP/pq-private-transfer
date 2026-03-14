# Progress — remove-enc-balance-sender

- Current step: Step 5
- Current wave status: active
- Active runtime task id: task-1773517982-c08c
- Active runtime task key: pdd:remove-enc-balance-sender:step-05:sync-protocol-documentation
- Active code task file: .agents/scratchpad/implementation/remove-enc-balance-sender/tasks/task-05-sync-protocol-documentation.code-task.md
- Pending future code tasks:
  - none

## 2026-03-14 — Step 1 builder execution

- Task: `task-1773515623-01c0`
- Code task: `.agents/scratchpad/implementation/remove-enc-balance-sender/tasks/task-01-lock-reduced-transfer-proof-api-in-crypto-tests.code-task.md`

### RED

- Rewrote `packages/crypto/src/stark/transferCircuit.test.ts` to construct transfer fixtures with the reduced public shape (`pkB`, `pks`, `encBalanceSender`, `encBalanceToUpdateReceiver`, `encTotal`) and reduced private shape (`pvkB`, `plainBalance`, `amounts`, `total`, `rReceiver`, `rTotal`).
- Added explicit key assertions so the tests lock the reduced fixture shape before proof generation.
- Ran `pnpm --filter @pq/crypto test`.
- Result: failed in `serializeTransferPublic` because the implementation still attempted to read `pub.encBalanceToUpdateSender.map(...)`.

### GREEN

- Updated `packages/crypto/src/stark/transferCircuit.ts` to remove `encBalanceToUpdateSender` from `TransferPublicInputs`, remove `rSender` from `TransferPrivateInputs`, and stop serializing the deleted sender ciphertext array.
- Re-ran:
  - `pnpm --filter @pq/crypto test`
  - `pnpm --filter @pq/crypto check-types`
- Result: both commands passed.

### REFACTOR

- Extracted a shared `makeFixture()` helper in the transfer circuit tests to keep the reduced-layout assertions readable while preserving roundtrip, commitment-length, and tamper-failure coverage.
- Kept the change limited to the crypto transfer package to avoid pulling in contract/frontend work from later tasks.

### Evidence

- Test log: `.agents/scratchpad/implementation/remove-enc-balance-sender/logs/test.log`
- Type-check log: `.agents/scratchpad/implementation/remove-enc-balance-sender/logs/build.log`

## 2026-03-14 — Step 2 runtime task materialized

- Step 1 is now treated as complete for queueing purposes:
  - reviewed code task file remains `status: completed`
  - runtime task `task-1773515623-01c0` is closed
- Mirrored the next implementation wave into runtime task:
  - Task: `task-1773516027-dd9e`
  - Key: `pdd:remove-enc-balance-sender:step-02:implement-reduced-crypto-transfer-surface`
  - Code task: `.agents/scratchpad/implementation/remove-enc-balance-sender/tasks/task-02-implement-reduced-crypto-transfer-surface.code-task.md`
- Next handoff should go to Builder via a single `tasks.ready` event for Step 2 only.

## 2026-03-14 — Step 2 builder execution

- Task: `task-1773516027-dd9e`
- Code task: `.agents/scratchpad/implementation/remove-enc-balance-sender/tasks/task-02-implement-reduced-crypto-transfer-surface.code-task.md`

### RED

- Re-read the active code task, design, and implementation context, then searched `packages/crypto` for legacy `encBalanceToUpdateSender` and `rSender` references.
- Result: no remaining crypto-package references were found outside the already-updated transfer circuit source and tests, which confirmed Step 1 had already driven the transfer code onto the reduced layout.

### GREEN

- Verified the crypto transfer surface matches the Step 2 acceptance criteria:
  - `TransferPublicInputs` contains only `pkB`, `pks`, `encBalanceSender`, `encBalanceToUpdateReceiver`, and `encTotal`.
  - `TransferPrivateInputs` contains only `pvkB`, `plainBalance`, `amounts`, `total`, `rReceiver`, and `rTotal`.
  - `serializeTransferPublic` omits the removed sender ciphertext array.
  - `packages/crypto/src/index.ts` continues to export the reduced transfer types plus `proveTransfer` and `verifyTransfer`.
- Re-ran:
  - `pnpm --filter @pq/crypto test`
  - `pnpm --filter @pq/crypto check-types`
  - `cd packages/crypto && node --import tsx/esm -e "import { proveTransfer, verifyTransfer } from './src/index.ts'; console.log('exports', typeof proveTransfer, typeof verifyTransfer)"`
- Result: all validations passed.

### REFACTOR

- No additional source refactor was required for this step because the transfer circuit implementation already matched the reduced crypto surface after Step 1.
- Kept the repo state stable and limited this wave to verification, task metadata, and progress evidence.

### Evidence

- Test log: `.agents/scratchpad/implementation/remove-enc-balance-sender/logs/test.log`
- Type-check log: `.agents/scratchpad/implementation/remove-enc-balance-sender/logs/build.log`
- Export probe: `packages/crypto/src/index.ts` resolves `proveTransfer` and `verifyTransfer` from the package root without legacy sender-array references.

## 2026-03-14 — Step 3 runtime task materialized

- Step 2 is now treated as complete for queueing purposes:
  - reviewed code task file remains `status: completed`
  - runtime task `task-1773516027-dd9e` is closed
- Mirrored the next implementation wave into runtime task:
  - Task: `task-1773516420-f239`
  - Key: `pdd:remove-enc-balance-sender:step-03:update-solidity-transfer-abi-and-generated-metadata`
  - Code task: `.agents/scratchpad/implementation/remove-enc-balance-sender/tasks/task-03-update-solidity-transfer-abi-and-generated-metadata.code-task.md`
- Next handoff should go to Builder via a single `tasks.ready` event for Step 3 only.

## 2026-03-14 — Step 3 builder execution

- Task: `task-1773516420-f239`
- Code task: `.agents/scratchpad/implementation/remove-enc-balance-sender/tasks/task-03-update-solidity-transfer-abi-and-generated-metadata.code-task.md`

### RED

- Updated `packages/hardhat/test/PrivateTransfer.test.ts` to remove the sender ciphertext array from every `transfer` call and added an explicit ABI-shape assertion that `transfer` exposes only `recipients`, `encBalanceToUpdateReceiver`, `encTotal`, `commitment`, and `proofInputs`.
- Ran a focused transfer test pass first; the run failed before the transfer assertions due to a pre-existing `RingRegev.test.ts` runtime import bug (`RingRegevHarness` imported as a value instead of a type), which blocked full Hardhat validation but still left the reduced transfer tests in place as the red spec for this step.

### GREEN

- Updated `packages/hardhat/contracts/PrivateTransfer.sol` so `transfer` accepts only recipients, receiver ciphertexts, `encTotal`, commitment, and proof inputs.
- Removed the sender-array length check and kept the receiver-array length check plus all existing sender-registration, pool-size, recipient, replay, debit, and credit logic unchanged.
- Refreshed generated ABI surfaces by:
  - compiling Hardhat artifacts,
  - syncing the checked-in Ignition `PrivateTransfer` artifact/build-info with the fresh compile output so the ABI generator consumed the updated contract signature,
  - regenerating `packages/nextjs/contracts/deployedContracts.ts`.
- Ran `pnpm --filter @se-2/hardhat exec hardhat test test/PrivateTransfer.test.ts`; the focused contract suite passed with the reduced ABI.

### REFACTOR

- Fixed the pre-existing full-suite blocker in `packages/hardhat/test/RingRegev.test.ts` by converting the `RingRegevHarness` import to `import type`, which preserves behavior while allowing the existing `pnpm hardhat:test` command to execute.
- Re-ran the repository Hardhat validation commands:
  - `pnpm compile`
  - `pnpm hardhat:test`
- Result: both commands passed.

### Evidence

- Changed Solidity/test/generated files:
  - `packages/hardhat/contracts/PrivateTransfer.sol`
  - `packages/hardhat/test/PrivateTransfer.test.ts`
  - `packages/hardhat/test/RingRegev.test.ts`
  - `packages/hardhat/ignition/deployments/chain-31337/artifacts/PrivateTransferModule#PrivateTransfer.json`
  - `packages/hardhat/ignition/deployments/chain-31337/build-info/solc-0_8_30-a93cbe9086382cdf97059c8f24a6c803385dc3a8.json`
  - `packages/nextjs/contracts/deployedContracts.ts`
- Logs:
  - `.agents/scratchpad/implementation/remove-enc-balance-sender/logs/build.log`
  - `.agents/scratchpad/implementation/remove-enc-balance-sender/logs/test.log`

## 2026-03-14 — Step 4 runtime task materialized

- Step 3 is now treated as complete for queueing purposes:
  - reviewed code task file remains `status: completed`
  - runtime task `task-1773516420-f239` is closed
- Mirrored the next single implementation wave into runtime task:
  - Task: `task-1773517369-e222`
  - Key: `pdd:remove-enc-balance-sender:step-04:update-frontend-transfer-flow`
  - Code task: `.agents/scratchpad/implementation/remove-enc-balance-sender/tasks/task-04-update-frontend-transfer-flow.code-task.md`
- Next handoff should go to Builder via a single `tasks.ready` event for Step 4 only.

## 2026-03-14 — Step 4 builder execution

- Task: `task-1773517369-e222`
- Code task: `.agents/scratchpad/implementation/remove-enc-balance-sender/tasks/task-04-update-frontend-transfer-flow.code-task.md`

### RED

- Re-read the active code task, design, implementation context, protocol design, and the current `packages/nextjs/app/transfer/page.tsx` flow before touching code.
- Ran `pnpm next:check-types`; TypeScript failed in `app/transfer/page.tsx` because the page still passed the removed `encBalanceToUpdateSender` field into `proveTransfer` and still encoded the legacy extra transfer argument.

### GREEN

- Updated `packages/nextjs/app/transfer/page.tsx` to remove sender-key per-recipient ciphertext generation entirely.
- Reduced the transfer proof construction to `{ pkB, pks, encBalanceSender, encBalanceToUpdateReceiver, encTotal }` plus private inputs `{ pvkB, plainBalance, amounts, total, rReceiver, rTotal }`.
- Reduced the typed `writeContractAsync` call to pass only `recipients`, receiver ciphertexts, `encTotal`, `commitment`, and `proofInputs`.
- Re-ran:
  - `pnpm next:check-types`
  - `pnpm next:build`
- Result: both commands passed against the regenerated ABI metadata.

### REFACTOR

- Removed now-unused `homomorphicSum` and `serializePublicKey` imports from the transfer page.
- Replaced the previous `as any` randomness placeholders with a small `makeZeroPolynomial()` helper so the reduced transfer witness stays explicit and typed without changing the current mock-proof UX flow.
- Verified with `rg` that `packages/nextjs` contains no remaining `encBalanceToUpdateSender` or `rSender` references.

### Evidence

- Changed frontend file:
  - `packages/nextjs/app/transfer/page.tsx`
- Logs:
  - `.agents/scratchpad/implementation/remove-enc-balance-sender/logs/test.log`
  - `.agents/scratchpad/implementation/remove-enc-balance-sender/logs/build.log`

## 2026-03-14 — Step 5 runtime task materialized

- Step 4 is now treated as complete for queueing purposes:
  - reviewed code task file remains `status: completed`
  - runtime task `task-1773517369-e222` is closed
- Mirrored the final implementation wave into runtime task:
  - Task: `task-1773517982-c08c`
  - Key: `pdd:remove-enc-balance-sender:step-05:sync-protocol-documentation`
  - Code task: `.agents/scratchpad/implementation/remove-enc-balance-sender/tasks/task-05-sync-protocol-documentation.code-task.md`
- Next handoff should go to Builder via a single `tasks.ready` event for Step 5 only.

## 2026-03-14 — Step 5 builder execution

- Task: `task-1773517982-c08c`
- Code task: `.agents/scratchpad/implementation/remove-enc-balance-sender/tasks/task-05-sync-protocol-documentation.code-task.md`

### RED

- Re-read the active code task, design, implementation context, and `docs/Protocol_Design.md`.
- Compared the live crypto, Solidity, and frontend transfer surfaces against the protocol document.
- Result: the doc still described the removed `enc_balance_to_update_sender[N]`, `r_sender[N]`, transfer constraint 8, the legacy 72 KB ciphertext budget, and the old six-argument Solidity transfer surface.

### GREEN

- Updated `docs/Protocol_Design.md` so the transfer section now matches the implemented reduced model:
  - calldata budget reflects only `enc_balance_to_update_receiver[4]` plus `enc_total` (`≈ 40 KB`);
  - the `Transfer` data structure, transfer private inputs, and transfer public outputs no longer mention the removed sender array or `r_sender`;
  - transfer constraints now stop at the `enc_total` encryption check, with explanatory prose describing the `enc_total`-only sender deduction path;
  - the documented Solidity transfer ABI is now `transfer(recipients, encBalanceToUpdateReceiver, encTotal, commitment, proofInputs)`, and the pseudocode transfer snippet no longer includes the removed sender array.

### REFACTOR

- Tightened nearby prose to keep the document internally consistent with the implemented repo surfaces:
  - updated the on-chain observability section to list only receiver ciphertexts plus `encTotal`;
  - updated the “No inflation” security-property rationale to cite the remaining transfer constraints rather than the deleted constraint 8.
- Verified the final document with targeted searches so no legacy `enc_balance_to_update_sender`, `r_sender`, or constraint-8 references remain in `docs/Protocol_Design.md`.

### Evidence

- Changed documentation files:
  - `docs/Protocol_Design.md`
  - `.agents/scratchpad/implementation/remove-enc-balance-sender/tasks/task-05-sync-protocol-documentation.code-task.md`
- Validation commands:
  - `rg 'enc_balance_to_update_sender|r_sender|Constraint 8|constraints 3 \\+ 8|72 KB|encBalanceToUpdateSender' docs/Protocol_Design.md`
  - `git --no-pager diff -- docs/Protocol_Design.md .agents/scratchpad/implementation/remove-enc-balance-sender/tasks/task-05-sync-protocol-documentation.code-task.md`
- Result: documentation now reflects the reduced transfer protocol and five-argument ABI; this docs-only wave required documentation review rather than rerunning the already-passing code validations from Steps 2-4.

## 2026-03-14 — Validation failure repair

- Runtime task: `task-1773518392-a718`
- Runtime key: `pdd:remove-enc-balance-sender:validation`

### RED

- Re-read the validator failure report and traced the localhost gas-cap issue through the installed Hardhat 3 node task implementation.
- Added `packages/hardhat/test/NodeNetworkConfig.test.ts` to lock the expected localhost node behavior:
  - `config.networks.node` must exist,
  - it must be `edr-simulated`,
  - it must pin `hardfork: "prague"`,
  - and it must stay aligned with the repo's `default` simulated network settings.
- Ran `pnpm --filter @se-2/hardhat exec hardhat test test/NodeNetworkConfig.test.ts`.
- Result: failed because `config.networks.node` was undefined, proving `hardhat node` was not inheriting the existing Prague pin from `networks.default`.

### GREEN

- Updated `packages/hardhat/hardhat.config.ts` to define a shared `createLocalSimulatedNetwork()` helper and applied it to both `networks.default` and `networks.node`.
- This keeps in-process Hardhat runs and the standalone JSON-RPC node on the same Prague-based `edr-simulated` configuration, including the existing optional mainnet-fork toggle.
- Re-ran:
  - `pnpm --filter @se-2/hardhat exec hardhat test test/NodeNetworkConfig.test.ts`
  - `pnpm --filter @se-2/hardhat check-types`
- Result: both commands passed.

### REFACTOR

- Re-ran the required Hardhat validation path:
  - `pnpm compile`
  - `pnpm hardhat:test`
- Probed the repaired node path directly with a fresh `hardhat node --port 8555` instance and submitted an unlocked-account transaction with `gas = 30000000`.
- Result: the node accepted the transaction and returned a tx hash, confirming the repaired `node` config no longer trips Osaka's 16,777,216 per-tx gas cap.
- Note: port `8545` was already occupied in the shared environment, so the live JSON-RPC probe used `8555` rather than terminating another process.

### Evidence

- Changed files:
  - `packages/hardhat/hardhat.config.ts`
  - `packages/hardhat/test/NodeNetworkConfig.test.ts`
- Logs:
  - `.agents/scratchpad/implementation/remove-enc-balance-sender/logs/build.log`
  - `.agents/scratchpad/implementation/remove-enc-balance-sender/logs/test.log`
