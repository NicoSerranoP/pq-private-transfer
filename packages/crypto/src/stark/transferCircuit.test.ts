import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import { keygen, encrypt } from "../ringRegev.js";
import { proveTransfer, verifyTransfer } from "./transferCircuit.js";
import type { TransferPublicInputs, TransferPrivateInputs } from "./transferCircuit.js";

function makeZeroR(): bigint[] {
  return Array.from({ length: 1024 }, () => 0n);
}

describe("transferCircuit", () => {
  it("prove/verify roundtrip succeeds", () => {
    const sender = keygen();
    const recipients = [keygen(), keygen(), keygen(), keygen()];
    const pks = recipients.map((r) => r.pk) as [typeof recipients[0]["pk"], typeof recipients[0]["pk"], typeof recipients[0]["pk"], typeof recipients[0]["pk"]];

    const total = 100n;
    const amounts = [100n, 0n, 0n, 0n] as [bigint, bigint, bigint, bigint];
    const rReceiver = [makeZeroR(), makeZeroR(), makeZeroR(), makeZeroR()] as [bigint[], bigint[], bigint[], bigint[]];
    const rSender = [makeZeroR(), makeZeroR(), makeZeroR(), makeZeroR()] as [bigint[], bigint[], bigint[], bigint[]];
    const rTotal = makeZeroR();

    const encBalanceSender = encrypt(500n, sender.pk, makeZeroR());
    const encBalanceToUpdateReceiver = amounts.map((a, i) => encrypt(a, pks[i], rReceiver[i])) as [any, any, any, any];
    const encBalanceToUpdateSender = amounts.map((a) => encrypt(a, sender.pk, makeZeroR())) as [any, any, any, any];
    const encTotal = encrypt(total, sender.pk, rTotal);

    const pub: TransferPublicInputs = {
      pkB: sender.pk,
      pks,
      encBalanceSender,
      encBalanceToUpdateReceiver,
      encBalanceToUpdateSender,
      encTotal,
    };
    const priv: TransferPrivateInputs = {
      pvkB: sender.sk,
      plainBalance: 500n,
      amounts,
      total,
      rReceiver,
      rSender,
      rTotal,
    };

    const proof = proveTransfer(pub, priv);
    strictEqual(verifyTransfer(pub, proof), true);
  });

  it("proof has 32-byte commitment", () => {
    const sender = keygen();
    const pks = [keygen().pk, keygen().pk, keygen().pk, keygen().pk] as [any, any, any, any];
    const pub: TransferPublicInputs = {
      pkB: sender.pk,
      pks,
      encBalanceSender: encrypt(0n, sender.pk, makeZeroR()),
      encBalanceToUpdateReceiver: [
        encrypt(0n, pks[0], makeZeroR()),
        encrypt(0n, pks[1], makeZeroR()),
        encrypt(0n, pks[2], makeZeroR()),
        encrypt(0n, pks[3], makeZeroR()),
      ] as [any, any, any, any],
      encBalanceToUpdateSender: [
        encrypt(0n, sender.pk, makeZeroR()),
        encrypt(0n, sender.pk, makeZeroR()),
        encrypt(0n, sender.pk, makeZeroR()),
        encrypt(0n, sender.pk, makeZeroR()),
      ] as [any, any, any, any],
      encTotal: encrypt(0n, sender.pk, makeZeroR()),
    };
    const priv: TransferPrivateInputs = {
      pvkB: sender.sk,
      plainBalance: 0n,
      amounts: [0n, 0n, 0n, 0n],
      total: 0n,
      rReceiver: [makeZeroR(), makeZeroR(), makeZeroR(), makeZeroR()] as [bigint[], bigint[], bigint[], bigint[]],
      rSender: [makeZeroR(), makeZeroR(), makeZeroR(), makeZeroR()] as [bigint[], bigint[], bigint[], bigint[]],
      rTotal: makeZeroR(),
    };
    const proof = proveTransfer(pub, priv);
    strictEqual(proof.commitment.length, 32);
  });

  it("tampered commitment fails verification", () => {
    const sender = keygen();
    const pks = [keygen().pk, keygen().pk, keygen().pk, keygen().pk] as [any, any, any, any];
    const pub: TransferPublicInputs = {
      pkB: sender.pk,
      pks,
      encBalanceSender: encrypt(0n, sender.pk, makeZeroR()),
      encBalanceToUpdateReceiver: [
        encrypt(0n, pks[0], makeZeroR()),
        encrypt(0n, pks[1], makeZeroR()),
        encrypt(0n, pks[2], makeZeroR()),
        encrypt(0n, pks[3], makeZeroR()),
      ] as [any, any, any, any],
      encBalanceToUpdateSender: [
        encrypt(0n, sender.pk, makeZeroR()),
        encrypt(0n, sender.pk, makeZeroR()),
        encrypt(0n, sender.pk, makeZeroR()),
        encrypt(0n, sender.pk, makeZeroR()),
      ] as [any, any, any, any],
      encTotal: encrypt(0n, sender.pk, makeZeroR()),
    };
    const priv: TransferPrivateInputs = {
      pvkB: sender.sk,
      plainBalance: 0n,
      amounts: [0n, 0n, 0n, 0n],
      total: 0n,
      rReceiver: [makeZeroR(), makeZeroR(), makeZeroR(), makeZeroR()] as [bigint[], bigint[], bigint[], bigint[]],
      rSender: [makeZeroR(), makeZeroR(), makeZeroR(), makeZeroR()] as [bigint[], bigint[], bigint[], bigint[]],
      rTotal: makeZeroR(),
    };
    const proof = proveTransfer(pub, priv);
    const tampered = { commitment: new Uint8Array(32).fill(0xff), inputs: proof.inputs };
    strictEqual(verifyTransfer(pub, tampered), false);
  });
});
