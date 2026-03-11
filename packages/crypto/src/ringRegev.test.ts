import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  keygen,
  encrypt,
  decrypt,
  add,
  sub,
  homomorphicSum,
  serializePublicKey,
  serializeCiphertext,
  deserializeCiphertext,
} from "./ringRegev.js";

const N = 1024;
const Q = 134217728n; // 2^27

describe("keygen", () => {
  it("returns pk and sk of correct length", () => {
    const { pk, sk } = keygen();
    assert.equal(pk.a.length, N);
    assert.equal(pk.b.length, N);
    assert.equal(sk.length, N);
  });

  it("all coefficients are in [0, q)", () => {
    const { pk, sk } = keygen();
    for (const c of [...pk.a, ...pk.b, ...sk]) {
      assert.ok(c >= 0n && c < Q, `coefficient ${c} out of range`);
    }
  });
});

describe("encrypt / decrypt", () => {
  it("decrypt(encrypt(m)) === m for small values", () => {
    const { pk, sk } = keygen();
    // Max plaintext = Q/DELTA = 16384; use values well within range
    for (const m of [0n, 1n, 42n, 1000n, 10000n]) {
      const ct = encrypt(m, pk);
      const got = decrypt(ct, sk);
      assert.equal(got, m);
    }
  });

  it("deterministic when r is provided", () => {
    const { pk } = keygen();
    const r = new Array(N).fill(0n);
    const ct1 = encrypt(42n, pk, r);
    const ct2 = encrypt(42n, pk, r);
    assert.deepEqual(ct1, ct2);
  });

  it("different r produces different ciphertext", () => {
    const { pk } = keygen();
    const r1 = new Array(N).fill(0n);
    const r2 = new Array(N).fill(1n);
    const ct1 = encrypt(42n, pk, r1);
    const ct2 = encrypt(42n, pk, r2);
    // With overwhelming probability they differ
    assert.notDeepEqual(ct1.b, ct2.b);
  });
});

describe("homomorphic add", () => {
  it("add preserves plaintext sum", () => {
    const { pk, sk } = keygen();
    const m1 = 100n;
    const m2 = 200n;
    const ct1 = encrypt(m1, pk);
    const ct2 = encrypt(m2, pk);
    const ctSum = add(ct1, ct2);
    assert.equal(decrypt(ctSum, sk), m1 + m2);
  });
});

describe("homomorphic sub", () => {
  it("sub preserves plaintext difference", () => {
    const { pk, sk } = keygen();
    const m1 = 500n;
    const m2 = 200n;
    const ct1 = encrypt(m1, pk);
    const ct2 = encrypt(m2, pk);
    const ctDiff = sub(ct1, ct2);
    assert.equal(decrypt(ctDiff, sk), m1 - m2);
  });
});

describe("homomorphicSum", () => {
  it("sums multiple ciphertexts", () => {
    const { pk, sk } = keygen();
    const vals = [10n, 20n, 30n, 40n];
    const cts = vals.map((v) => encrypt(v, pk));
    const ctSum = homomorphicSum(cts);
    assert.equal(decrypt(ctSum, sk), 100n);
  });
});

describe("serialization", () => {
  it("serializeCiphertext produces 8192 bytes", () => {
    const { pk } = keygen();
    const ct = encrypt(1n, pk);
    const bytes = serializeCiphertext(ct);
    assert.equal(bytes.length, 8192);
  });

  it("serializePublicKey produces 8192 bytes", () => {
    const { pk } = keygen();
    const bytes = serializePublicKey(pk);
    assert.equal(bytes.length, 8192);
  });

  it("deserializeCiphertext roundtrips correctly", () => {
    const { pk, sk } = keygen();
    const m = 77n;
    const ct = encrypt(m, pk);
    const bytes = serializeCiphertext(ct);
    const ct2 = deserializeCiphertext(bytes);
    assert.equal(decrypt(ct2, sk), m);
  });
});
