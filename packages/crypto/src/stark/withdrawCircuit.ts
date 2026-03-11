import { sha256 } from "@noble/hashes/sha256";
import { serializePublicKey, serializeCiphertext } from "../ringRegev.js";
import type { Ciphertext, PublicKey, SecretKey, ZKProof, Polynomial } from "../types.js";

export type WithdrawPublicInputs = {
  pkB: PublicKey;
  encBalance: Ciphertext;
  encAmount: Ciphertext;
  encNewBalance: Ciphertext;
  amount: bigint;
};

export type WithdrawPrivateInputs = {
  pvkB: SecretKey;
  plainBalance: bigint;
  rAmount: Polynomial;
  rNewBalance: Polynomial;
};

function serializeWithdrawPublic(pub: WithdrawPublicInputs): Uint8Array {
  const pkBytes = serializePublicKey(pub.pkB);
  const encBalBytes = serializeCiphertext(pub.encBalance);
  const encAmtBytes = serializeCiphertext(pub.encAmount);
  const encNewBalBytes = serializeCiphertext(pub.encNewBalance);
  const amtBytes = new Uint8Array(8);
  new DataView(amtBytes.buffer).setBigUint64(0, pub.amount, true);

  const totalLen = pkBytes.length + encBalBytes.length + encAmtBytes.length + encNewBalBytes.length + 8;
  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of [pkBytes, encBalBytes, encAmtBytes, encNewBalBytes, amtBytes]) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/**
 * Mock STARK prover for the Withdrawal circuit.
 * Private inputs are accepted but not cryptographically verified (prototype).
 */
export function proveWithdraw(pub: WithdrawPublicInputs, _priv: WithdrawPrivateInputs): ZKProof {
  const inputs = serializeWithdrawPublic(pub);
  const commitment = sha256(inputs);
  return { commitment, inputs };
}

/**
 * Mock STARK verifier for the Withdrawal circuit.
 */
export function verifyWithdraw(pub: WithdrawPublicInputs, proof: ZKProof): boolean {
  if (proof.commitment.length !== 32) return false;
  const expected = serializeWithdrawPublic(pub);
  if (proof.inputs.length !== expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (proof.inputs[i] !== expected[i]) return false;
  }
  const recomputed = sha256(proof.inputs);
  for (let i = 0; i < 32; i++) {
    if (recomputed[i] !== proof.commitment[i]) return false;
  }
  return true;
}
