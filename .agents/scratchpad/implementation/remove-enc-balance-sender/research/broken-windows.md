## Broken Windows

### [packages/nextjs/app/transfer/page.tsx:11] Unused crypto import
**Type**: dead-code
**Risk**: Low
**Fix**: Remove the unused `serializePublicKey` import while touching the transfer page.
**Code**:
```ts
  serializeCiphertext,
  serializePublicKey,
} from "@pq/crypto";
```
