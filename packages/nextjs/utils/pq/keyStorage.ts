/**
 * Browser localStorage helpers for PQ private key management.
 * Secret keys are serialized as JSON arrays of strings (bigint[]).
 * They never leave the client.
 */
import type { SecretKey } from "@pq/crypto";

const SK_PREFIX = "pq_sk_";

export function saveSecretKey(address: string, sk: SecretKey): void {
  const serialized = JSON.stringify(sk.map(String));
  localStorage.setItem(`${SK_PREFIX}${address.toLowerCase()}`, serialized);
}

export function loadSecretKey(address: string): SecretKey | null {
  const raw = localStorage.getItem(`${SK_PREFIX}${address.toLowerCase()}`);
  if (!raw) return null;
  try {
    const parsed: string[] = JSON.parse(raw);
    return parsed.map(BigInt);
  } catch {
    return null;
  }
}
