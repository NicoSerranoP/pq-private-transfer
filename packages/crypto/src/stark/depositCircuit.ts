import { sha256 } from "@noble/hashes/sha256";
import { serializePublicKey, serializeCiphertext } from "../ringRegev.js";
import type { Ciphertext, PublicKey, SecretKey, ZKProof, Polynomial } from "../types.js";

export type DepositPublicInputs = {
  pk: PublicKey;
  initialBalance: Ciphertext;
  depositAmount: bigint;
};

export type DepositPrivateInputs = {
  r: Polynomial;
};

/** Serialize deposit public inputs to bytes for hashing */
function serializeDepositPublic(pub: DepositPublicInputs): Uint8Array {
  const pkBytes = serializePublicKey(pub.pk);
  const balBytes = serializeCiphertext(pub.initialBalance);
  const amtBytes = new Uint8Array(8);
  const view = new DataView(amtBytes.buffer);
  // depositAmount fits in u64 for prototype purposes
  view.setBigUint64(0, pub.depositAmount, true);
  const out = new Uint8Array(pkBytes.length + balBytes.length + 8);
  out.set(pkBytes, 0);
  out.set(balBytes, pkBytes.length);
  out.set(amtBytes, pkBytes.length + balBytes.length);
  return out;
}

/**
 * Mock STARK prover for the Deposit circuit.
 * Private inputs are accepted but not cryptographically verified (prototype).
 */
export function proveDeposit(pub: DepositPublicInputs, _priv: DepositPrivateInputs): ZKProof {
  const inputs = serializeDepositPublic(pub);
  const commitment = sha256(inputs);
  return { commitment, inputs };
}

/**
 * Mock STARK verifier for the Deposit circuit.
 * Accepts proof iff commitment == SHA-256(inputs) and inputs match public state.
 */
export function verifyDeposit(pub: DepositPublicInputs, proof: ZKProof): boolean {
  if (proof.commitment.length !== 32) return false;
  const expected = serializeDepositPublic(pub);
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
