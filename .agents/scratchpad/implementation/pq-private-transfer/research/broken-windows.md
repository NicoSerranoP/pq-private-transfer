# Broken Windows

## [packages/hardhat/scripts/runHardhatDeployWithPK.ts:10] Hardcoded ignition module path

**Type**: magic-values  
**Risk**: Low  
**Fix**: Replace hardcoded `"ignition/modules/SE2Token.ts"` with the new PrivateTransfer module path  
**Note:** Must be updated during Phase 3 Builder — blocks deployment of new contracts.
```typescript
// current
const IGNITION_MODULE = "ignition/modules/SE2Token.ts";
// should become
const IGNITION_MODULE = "ignition/modules/PrivateTransfer.ts";
```
