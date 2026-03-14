# Validation — remove-enc-balance-sender

## Verdict

- Status: **PASS**
- Validation task: `task-1773518392-a718`
- Validation key: `pdd:remove-enc-balance-sender:validation`

Supersedes the earlier failed localhost E2E pass. The failure was traced to Hardhat 3 using the `node` simulated network for `hardhat node` while only `networks.default` was pinned to Prague. After aligning both simulated networks to Prague and adding a regression test, the validation fix passed review and the validation task now closes successfully.

## 0. Code-task completion verification

All implementation code-task files under `.agents/scratchpad/implementation/remove-enc-balance-sender/tasks/` are marked `status: completed` and have `completed: 2026-03-14`.

Verified files:
- `task-01-lock-reduced-transfer-proof-api-in-crypto-tests.code-task.md`
- `task-02-implement-reduced-crypto-transfer-surface.code-task.md`
- `task-03-update-solidity-transfer-abi-and-generated-metadata.code-task.md`
- `task-04-update-frontend-transfer-flow.code-task.md`
- `task-05-sync-protocol-documentation.code-task.md`

Runtime-task audit: the only open runtime task at validation time was the validation task itself; the implementation runtime tasks had already been closed.

## 1. Automated tests

Passed:
- `pnpm --filter @pq/crypto test`
- `pnpm --filter @pq/crypto check-types`
- `pnpm compile`
- `pnpm hardhat:test`
- `pnpm next:check-types`
- `pnpm next:build`
- `pnpm lint`

Observed results:
- crypto tests: `26` passing
- Hardhat tests: `43` passing
- frontend build: `/transfer` statically generated successfully
- lint: exited `0` with warnings only

## 2. Build / lint / type-check

Passed:
- build: `pnpm compile`, `pnpm next:build`
- type-check: `pnpm --filter @pq/crypto check-types`, `pnpm next:check-types`
- lint: `pnpm lint` exited successfully

Notes:
- `pnpm lint` reported 10 non-failing Prettier warnings in `packages/hardhat/test/PrivateTransfer.test.ts`, but no lint errors.
- `pnpm next:build` emitted the pre-existing Next.js ESLint-plugin warning, but the build completed successfully.

## 3. Code quality review

### YAGNI

Pass. The implementation removes repo-wide legacy sender-array plumbing instead of adding compatibility shims or parallel layouts.

### KISS

Pass. The reduced transfer surface is straightforward across crypto, Solidity, frontend, generated ABI metadata, and docs. The only notable addition is a small typed `makeZeroPolynomial()` helper in the transfer page to replace prior `as any` placeholders.

### Idiomatic

Pass. The changes follow existing repo patterns:
- crypto types remain explicit and minimal
- the Solidity contract preserves existing error/guard patterns
- the frontend continues to use the existing scaffold hooks and notification flow
- ABI metadata remains generated through the normal Hardhat deployment flow

## 4. Manual E2E validation

### Browser/frontend reachability

- `curl -I http://127.0.0.1:3000/transfer` returned `HTTP/1.1 200 OK`
- fetching `/transfer` returned the expected transfer-page copy markers:
  - `Transfer`
  - `encrypted ETH`
  - `dummy recipients`

### Shared localhost caveat

The shared `8545` node in this environment was still a stale pre-fix process. Direct live transfer attempts against that existing node failed in two ways:

- `estimateGas` failed with `missing revert data`
- forcing `gasLimit: 30000000` failed with `Transaction gas limit is 30000000 and exceeds transaction gas cap of 16777216`

That failure is consistent with Osaka's stale gas cap and does **not** reflect the repaired repo config, because the fix only applies to freshly started `hardhat node` processes.

### Fresh-node E2E pass

Passed:
- `pnpm --filter @se-2/hardhat exec hardhat test test/NodeNetworkConfig.test.ts`
- `pnpm --filter @se-2/hardhat check-types`
- `pnpm compile`
- `pnpm hardhat:test`

Step-by-step manual scenario against a **fresh** repaired node on `8556`:

1. Started `pnpm exec hardhat node --port 8556` from `packages/hardhat`.
2. Verified the node responded with `eth_chainId = 0x7a69`.
3. Deployed a fresh `PrivateTransfer` from the current compiled artifact to the fresh node.
4. Registered five users (sender + four recipients) with non-zero commitments and ciphertext payloads.
5. Submitted the reduced-ABI transfer call:
   - `transfer(recipients, encBalanceToUpdateReceiver, encTotal, commitment, proofInputs)`
   - explicit `gasLimit: 30000000`
6. Verified the transaction mined successfully:
   - `status: 1`
   - `gasUsed: 28400686`
   - `txHash: 0xb74025a2b7ed9451f8de1b6a3c44612ecda9e26d8e6997a865831acbbc2d0e0d`
7. Verified the sender encrypted balance changed and the first recipient encrypted balance changed.
8. Verified the `Transferred` event emitted with the expected sender and all four recipients.
9. Replayed the exact same commitment payload.
10. Verified the replay attempt reverted (`replay.reverted: true`), confirming replay protection on the repaired node path.

Notes:
- port `8545` was already occupied by a stale shared node, so the authoritative manual E2E run used a fresh repo-owned node on `8556` rather than killing another process in a shared environment
- the replay error text from ethers was generic (`could not coalesce error`), but the second transaction did revert and no second success receipt was produced

## 5. Final decision

Validation passes. The earlier localhost failure was fixed by aligning Hardhat's `default` and `node` simulated-network configs on Prague, the regression is covered by tests, the frontend `/transfer` route is reachable, and a full live transfer-plus-replay scenario succeeds on a fresh repaired node.
