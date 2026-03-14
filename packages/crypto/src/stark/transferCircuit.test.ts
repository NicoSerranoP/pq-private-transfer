import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { keygen, encrypt } from "../ringRegev.js";
import { proveTransfer, verifyTransfer } from "./transferCircuit.js";
import type { TransferPublicInputs, TransferPrivateInputs } from "./transferCircuit.js";

function makeZeroR(): bigint[] {
  return Array.from({ length: 1024 }, () => 0n);
}

function makeFixture() {
  const sender = keygen();
  const recipients = [keygen(), keygen(), keygen(), keygen()];
  const pks = recipients.map((r) => r.pk) as [typeof recipients[0]["pk"], typeof recipients[0]["pk"], typeof recipients[0]["pk"], typeof recipients[0]["pk"]];

  const plainBalance = 500n;
  const total = 100n;
  const amounts = [100n, 0n, 0n, 0n] as [bigint, bigint, bigint, bigint];
  const rReceiver = [makeZeroR(), makeZeroR(), makeZeroR(), makeZeroR()] as [bigint[], bigint[], bigint[], bigint[]];
  const rTotal = makeZeroR();

  const pub = {
    pkB: sender.pk,
    pks,
    encBalanceSender: encrypt(plainBalance, sender.pk, makeZeroR()),
    encBalanceToUpdateReceiver: amounts.map((a, i) => encrypt(a, pks[i], rReceiver[i])) as [any, any, any, any],
    encTotal: encrypt(total, sender.pk, rTotal),
  } satisfies TransferPublicInputs;
  const priv = {
    pvkB: sender.sk,
    plainBalance,
    amounts,
    total,
    rReceiver,
    rTotal,
  } satisfies TransferPrivateInputs;

  return { pub, priv };
}

describe("transferCircuit", () => {
  it("prove/verify roundtrip succeeds with the reduced transfer API", () => {
    const { pub, priv } = makeFixture();

    deepStrictEqual(Object.keys(pub).sort(), ["encBalanceSender", "encBalanceToUpdateReceiver", "encTotal", "pkB", "pks"]);
    deepStrictEqual(Object.keys(priv).sort(), ["amounts", "plainBalance", "pvkB", "rReceiver", "rTotal", "total"]);

    const proof = proveTransfer(pub, priv);
    strictEqual(verifyTransfer(pub, proof), true);
  });

  it("proof has 32-byte commitment", () => {
    const { pub, priv } = makeFixture();
    const proof = proveTransfer(pub, priv);
    strictEqual(proof.commitment.length, 32);
  });

  it("tampered commitment fails verification", () => {
    const { pub, priv } = makeFixture();
    const proof = proveTransfer(pub, priv);
    const tampered = { commitment: new Uint8Array(32).fill(0xff), inputs: proof.inputs };
    strictEqual(verifyTransfer(pub, tampered), false);
  });
});
