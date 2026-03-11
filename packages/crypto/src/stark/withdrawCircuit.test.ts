import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import { keygen, encrypt } from "../ringRegev.js";
import { proveWithdraw, verifyWithdraw } from "./withdrawCircuit.js";
import type { WithdrawPublicInputs, WithdrawPrivateInputs } from "./withdrawCircuit.js";

function makeZeroR(): bigint[] {
  return Array.from({ length: 1024 }, () => 0n);
}

describe("withdrawCircuit", () => {
  it("prove/verify roundtrip succeeds", () => {
    const { pk, sk } = keygen();
    const plainBalance = 500n;
    const amount = 200n;
    const encBalance = encrypt(plainBalance, pk, makeZeroR());
    const encAmount = encrypt(amount, pk, makeZeroR());
    const encNewBalance = encrypt(plainBalance - amount, pk, makeZeroR());

    const pub: WithdrawPublicInputs = { pkB: pk, encBalance, encAmount, encNewBalance, amount };
    const priv: WithdrawPrivateInputs = {
      pvkB: sk,
      plainBalance,
      rAmount: makeZeroR(),
      rNewBalance: makeZeroR(),
    };

    const proof = proveWithdraw(pub, priv);
    strictEqual(verifyWithdraw(pub, proof), true);
  });

  it("proof has 32-byte commitment", () => {
    const { pk, sk } = keygen();
    const pub: WithdrawPublicInputs = {
      pkB: pk,
      encBalance: encrypt(100n, pk, makeZeroR()),
      encAmount: encrypt(50n, pk, makeZeroR()),
      encNewBalance: encrypt(50n, pk, makeZeroR()),
      amount: 50n,
    };
    const priv: WithdrawPrivateInputs = {
      pvkB: sk,
      plainBalance: 100n,
      rAmount: makeZeroR(),
      rNewBalance: makeZeroR(),
    };
    const proof = proveWithdraw(pub, priv);
    strictEqual(proof.commitment.length, 32);
  });

  it("tampered inputs fail verification", () => {
    const { pk, sk } = keygen();
    const pub: WithdrawPublicInputs = {
      pkB: pk,
      encBalance: encrypt(100n, pk, makeZeroR()),
      encAmount: encrypt(50n, pk, makeZeroR()),
      encNewBalance: encrypt(50n, pk, makeZeroR()),
      amount: 50n,
    };
    const priv: WithdrawPrivateInputs = {
      pvkB: sk,
      plainBalance: 100n,
      rAmount: makeZeroR(),
      rNewBalance: makeZeroR(),
    };
    const proof = proveWithdraw(pub, priv);
    const tampered = {
      commitment: proof.commitment,
      inputs: new Uint8Array(proof.inputs.length).fill(0xab),
    };
    strictEqual(verifyWithdraw(pub, tampered), false);
  });
});
