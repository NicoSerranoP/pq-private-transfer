# Memories

## Patterns

### mem-1773515281-82b7
> packages/nextjs/contracts/deployedContracts.ts is generated from Hardhat deployment/build-info by packages/hardhat/scripts/generateTsAbis.ts; refresh it via the normal Hardhat compile/deploy flow instead of hand-editing.
<!-- tags: abi, build, hardhat, nextjs | created: 2026-03-14 -->

## Decisions

## Fixes

### mem-1773517910-baf8
> failure: cmd=printf 'Code task statuses:' && rg '^status:' .agents/scratchpad/implementation/remove-enc-balance-sender/tasks/*.code-task.md && /home/nnico/.nvm/versions/node/v24.12.0/lib/node_modules/@ralph-orchestrator/ralph-cli/node_modules/.bin_real/ralph tools task close task-1773517369-e222, exit=127, error=rg: command not found, next=use the built-in rg tool or grep instead of assuming the shell binary exists
<!-- tags: tooling, error-handling, rg | created: 2026-03-14 -->

### mem-1773517811-1af8
> failure: cmd=cd packages/nextjs && node --import tsx/esm - <<'EOF' ..., exit=1, error=ERR_MODULE_NOT_FOUND for tsx, next=probe generated transfer ABI via JSON artifact with pnpm --filter @se-2/nextjs exec node instead of TS imports
<!-- tags: tooling, error-handling, typescript | created: 2026-03-14 -->

### mem-1773517170-8a42
> failure: cmd=node --input-type=module ABI probe from repo root importing ethers, exit=1, error=ERR_MODULE_NOT_FOUND for ethers, next=run ethers-based probes from packages/hardhat where the dependency is installed
<!-- tags: tooling, error-handling, ethers | created: 2026-03-14 -->

### mem-1773517155-d653
> failure: cmd=node --import tsx/esm inline probe importing packages/nextjs/contracts/deployedContracts.ts from packages/hardhat, exit=1, error=ERR_REQUIRE_CYCLE_MODULE, next=probe generated ABI via JSON artifact or plain file read instead of TS import
<!-- tags: tooling, error-handling, typescript | created: 2026-03-14 -->

### mem-1773515905-76ce
> failure: cmd=node --input-type=module custom transfer probe, exit=1, error=ERR_MODULE_NOT_FOUND for packages/crypto/src/*.js source imports, next=run TypeScript source probes with node --import tsx/esm from the package context
<!-- tags: tooling, error-handling, typescript | created: 2026-03-14 -->

### mem-1773515185-153e
> failure: cmd=/home/nnico/.nvm/versions/node/v24.12.0/lib/node_modules/@ralph-orchestrator/ralph-cli/node_modules/.bin_real/ralph tools task ensure "Research remove-enc-balance-sender" ..., exit=1, error=human-readable ensure output is not a bare task id, next=use --format quiet when scripting task ids
<!-- tags: tooling, error-handling, ralph | created: 2026-03-14 -->

### mem-1773515104-e724
> failure: cmd=python - <<'PY' ... ensure/start design review task, exit=127, error=python: command not found, next=use python3 instead
<!-- tags: tooling, error-handling, python | created: 2026-03-14 -->

## Context

### mem-1773515281-82ee
> TransferVerifier is a prototype mock that only checks non-zero commitment and non-empty proof inputs, so transfer public-input layout changes are enforced by crypto/frontend/tests rather than Solidity verification.
<!-- tags: zk, testing, solidity, crypto | created: 2026-03-14 -->
