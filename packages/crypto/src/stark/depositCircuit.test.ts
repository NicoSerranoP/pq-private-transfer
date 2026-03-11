import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, throws } from "node:assert";
import { keygen, encrypt } from "../ringRegev.js";
import { proveDeposit, verifyDeposit } from "./depositCircuit.js";

describe("depositCircuit", () => {
  it("prove/verify roundtrip succeeds", () => {
    const { pk, sk } = keygen();
    const depositAmount = 100n;
    const r = Array.from({ length: 1024 }, () => BigInt((Math.random() * 3) | 0) - 1n);
    const initialBalance = encrypt(depositAmount, pk, r);

    const proof = proveDeposit({ pk, initialBalance, depositAmount }, { r });
    const valid = verifyDeposit({ pk, initialBalance, depositAmount }, proof);
    strictEqual(valid, true);
  });

  it("proof has 32-byte commitment", () => {
    const { pk } = keygen();
    const depositAmount = 50n;
    const r = Array.from({ length: 1024 }, () => 0n);
    const initialBalance = encrypt(depositAmount, pk, r);

    const proof = proveDeposit({ pk, initialBalance, depositAmount }, { r });
    strictEqual(proof.commitment.length, 32);
  });

  it("tampered commitment fails verification", () => {
    const { pk } = keygen();
    const depositAmount = 200n;
    const r = Array.from({ length: 1024 }, () => 0n);
    const initialBalance = encrypt(depositAmount, pk, r);

    const proof = proveDeposit({ pk, initialBalance, depositAmount }, { r });
    const tampered = {
      commitment: new Uint8Array(32).fill(0xff),
      inputs: proof.inputs,
    };
    strictEqual(verifyDeposit({ pk, initialBalance, depositAmount }, tampered), false);
  });

  it("tampered inputs fail verification", () => {
    const { pk } = keygen();
    const depositAmount = 300n;
    const r = Array.from({ length: 1024 }, () => 0n);
    const initialBalance = encrypt(depositAmount, pk, r);

    const proof = proveDeposit({ pk, initialBalance, depositAmount }, { r });
    const tampered = {
      commitment: proof.commitment,
      inputs: new Uint8Array(proof.inputs.length).fill(0xab),
    };
    strictEqual(verifyDeposit({ pk, initialBalance, depositAmount }, tampered), false);
  });
});
