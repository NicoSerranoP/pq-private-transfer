import { sha256 } from "@noble/hashes/sha256";
import { serializePublicKey, serializeCiphertext } from "../ringRegev.js";
import type { Ciphertext, PublicKey, SecretKey, ZKProof, Polynomial } from "../types.js";

export type TransferPublicInputs = {
  pkB: PublicKey;
  pks: [PublicKey, PublicKey, PublicKey, PublicKey];
  encBalanceSender: Ciphertext;
  encBalanceToUpdateReceiver: [Ciphertext, Ciphertext, Ciphertext, Ciphertext];
  encTotal: Ciphertext;
};

export type TransferPrivateInputs = {
  pvkB: SecretKey;
  plainBalance: bigint;
  amounts: [bigint, bigint, bigint, bigint];
  total: bigint;
  rReceiver: [Polynomial, Polynomial, Polynomial, Polynomial];
  rTotal: Polynomial;
};

function serializeTransferPublic(pub: TransferPublicInputs): Uint8Array {
  const parts: Uint8Array[] = [
    serializePublicKey(pub.pkB),
    ...pub.pks.map(serializePublicKey),
    serializeCiphertext(pub.encBalanceSender),
    ...pub.encBalanceToUpdateReceiver.map(serializeCiphertext),
    serializeCiphertext(pub.encTotal),
  ];
  const totalLen = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/**
 * Mock STARK prover for the Transfer circuit.
 * Private inputs are accepted but not cryptographically verified (prototype).
 */
export function proveTransfer(pub: TransferPublicInputs, _priv: TransferPrivateInputs): ZKProof {
  const inputs = serializeTransferPublic(pub);
  const commitment = sha256(inputs);
  return { commitment, inputs };
}

/**
 * Mock STARK verifier for the Transfer circuit.
 */
export function verifyTransfer(pub: TransferPublicInputs, proof: ZKProof): boolean {
  if (proof.commitment.length !== 32) return false;
  const expected = serializeTransferPublic(pub);
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
