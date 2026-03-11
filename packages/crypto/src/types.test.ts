import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  Polynomial,
  Ciphertext,
  PublicKey,
  SecretKey,
  ZKProof,
} from "./types.js";

describe("types", () => {
  it("Polynomial is an array of bigints with length 1024", () => {
    const p: Polynomial = new Array<bigint>(1024).fill(0n);
    assert.equal(p.length, 1024);
    assert.equal(typeof p[0], "bigint");
  });

  it("Ciphertext has a and b polynomials", () => {
    const a: Polynomial = new Array<bigint>(1024).fill(0n);
    const b: Polynomial = new Array<bigint>(1024).fill(0n);
    const ct: Ciphertext = { a, b };
    assert.equal(ct.a.length, 1024);
    assert.equal(ct.b.length, 1024);
  });

  it("PublicKey has a and b polynomials", () => {
    const a: Polynomial = new Array<bigint>(1024).fill(0n);
    const b: Polynomial = new Array<bigint>(1024).fill(0n);
    const pk: PublicKey = { a, b };
    assert.equal(pk.a.length, 1024);
    assert.equal(pk.b.length, 1024);
  });

  it("SecretKey is a Polynomial", () => {
    const sk: SecretKey = new Array<bigint>(1024).fill(0n);
    assert.equal(sk.length, 1024);
    assert.equal(typeof sk[0], "bigint");
  });

  it("ZKProof has commitment and inputs fields", () => {
    const proof: ZKProof = {
      commitment: new Uint8Array(32),
      inputs: new Uint8Array(64),
    };
    assert.equal(proof.commitment.length, 32);
    assert.equal(proof.inputs.length, 64);
  });
});
