/**
 * Amount scaling for Ring Regev plaintext space.
 *
 * Ring Regev parameters: n=1024, q=2^27, delta=2^13
 * Max plaintext = q/delta = 2^14 = 16384 units
 *
 * Scale: 1 unit = 1e15 wei = 0.001 ETH (1 finney)
 * Max deposit = 16384 * 0.001 ETH ≈ 16.384 ETH
 */
export const AMOUNT_SCALE = 1_000_000_000_000_000n; // 1e15 wei per unit

/** Convert wei amount to Ring Regev plaintext units. Truncates remainder. */
export function weiToUnits(wei: bigint): bigint {
  return wei / AMOUNT_SCALE;
}

/** Convert Ring Regev plaintext units back to wei. */
export function unitsToWei(units: bigint): bigint {
  return units * AMOUNT_SCALE;
}

/** Encode Uint8Array as 0x-prefixed hex string for viem. */
export function toHex(buf: Uint8Array): `0x${string}` {
  return `0x${Buffer.from(buf).toString("hex")}` as `0x${string}`;
}

/** Encode Uint8Array as bytes32 hex (pad or slice to 32 bytes). */
export function toBytes32(buf: Uint8Array): `0x${string}` {
  const padded = new Uint8Array(32);
  padded.set(buf.slice(0, 32));
  return toHex(padded);
}
