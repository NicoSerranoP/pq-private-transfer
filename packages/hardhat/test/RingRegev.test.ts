import { expect } from "chai";
import { network } from "hardhat";
import type { RingRegevHarness } from "../typechain-types/index.js";

const Q = 134217728n; // 2^27
const N = 1024;
const CIPHERTEXT_BYTES = 8192; // 2 polys × 1024 coeffs × 4 bytes

/** Encode a coefficient array (2048 uint32s = 2 polynomials) into a 8192-byte LE buffer */
function encodeCiphertext(coeffs: bigint[]): Uint8Array {
  if (coeffs.length !== 2 * N) throw new Error("expected 2048 coefficients");
  const buf = new Uint8Array(CIPHERTEXT_BYTES);
  for (let i = 0; i < 2 * N; i++) {
    const v = Number(coeffs[i] & 0xffffffffn);
    buf[i * 4 + 0] = v & 0xff;
    buf[i * 4 + 1] = (v >> 8) & 0xff;
    buf[i * 4 + 2] = (v >> 16) & 0xff;
    buf[i * 4 + 3] = (v >> 24) & 0xff;
  }
  return buf;
}

/** Decode a 8192-byte LE buffer back to 2048 uint32 coefficients */
function decodeCiphertext(buf: Uint8Array): bigint[] {
  const coeffs: bigint[] = [];
  for (let i = 0; i < 2 * N; i++) {
    const v =
      BigInt(buf[i * 4]) |
      (BigInt(buf[i * 4 + 1]) << 8n) |
      (BigInt(buf[i * 4 + 2]) << 16n) |
      (BigInt(buf[i * 4 + 3]) << 24n);
    coeffs.push(v);
  }
  return coeffs;
}

describe("RingRegev", function () {
  let harness: RingRegevHarness;

  before(async function () {
    const { ethers } = await network.connect();
    harness = await ethers.deployContract("RingRegevHarness");
  });

  it("add: identity (enc_a + enc_zero = enc_a)", async function () {
    const aCoeffs = Array.from({ length: 2 * N }, (_, i) => BigInt(i % 1000));
    const zeroCoeffs = new Array<bigint>(2 * N).fill(0n);

    const encA = encodeCiphertext(aCoeffs);
    const encZero = encodeCiphertext(zeroCoeffs);

    const result = await harness.add(encA, encZero);
    const resultBuf = Buffer.from(result.slice(2), "hex");
    const resultCoeffs = decodeCiphertext(new Uint8Array(resultBuf));

    for (let i = 0; i < 2 * N; i++) {
      expect(resultCoeffs[i]).to.equal(aCoeffs[i]);
    }
  });

  it("sub: self-cancel (enc_a - enc_a = enc_zero)", async function () {
    const aCoeffs = Array.from({ length: 2 * N }, (_, i) => BigInt((i * 37) % Number(Q)));
    const encA = encodeCiphertext(aCoeffs);

    const result = await harness.sub(encA, encA);
    const resultBuf = Buffer.from(result.slice(2), "hex");
    const resultCoeffs = decodeCiphertext(new Uint8Array(resultBuf));

    for (let i = 0; i < 2 * N; i++) {
      expect(resultCoeffs[i]).to.equal(0n);
    }
  });

  it("add: output has length 8192 bytes", async function () {
    const aCoeffs = new Array<bigint>(2 * N).fill(1n);
    const bCoeffs = new Array<bigint>(2 * N).fill(2n);
    const result = await harness.add(encodeCiphertext(aCoeffs), encodeCiphertext(bCoeffs));
    // result is hex-encoded bytes string: "0x..." → length = 2 + 8192*2
    expect(result.length).to.equal(2 + CIPHERTEXT_BYTES * 2);
  });

  it("add: overflow wraps mod q", async function () {
    // Set coeff[0] of poly a to Q-1, poly b to 2 → sum = Q+1 → mod Q = 1
    const aCoeffs = new Array<bigint>(2 * N).fill(0n);
    const bCoeffs = new Array<bigint>(2 * N).fill(0n);
    aCoeffs[0] = Q - 1n;
    bCoeffs[0] = 2n;

    const result = await harness.add(encodeCiphertext(aCoeffs), encodeCiphertext(bCoeffs));
    const resultBuf = Buffer.from(result.slice(2), "hex");
    const resultCoeffs = decodeCiphertext(new Uint8Array(resultBuf));

    expect(resultCoeffs[0]).to.equal((Q - 1n + 2n) % Q);
  });

  it("sub: underflow wraps mod q (always positive)", async function () {
    // a[0] = 1, b[0] = 3 → 1 - 3 + Q = Q-2
    const aCoeffs = new Array<bigint>(2 * N).fill(0n);
    const bCoeffs = new Array<bigint>(2 * N).fill(0n);
    aCoeffs[0] = 1n;
    bCoeffs[0] = 3n;

    const result = await harness.sub(encodeCiphertext(aCoeffs), encodeCiphertext(bCoeffs));
    const resultBuf = Buffer.from(result.slice(2), "hex");
    const resultCoeffs = decodeCiphertext(new Uint8Array(resultBuf));

    expect(resultCoeffs[0]).to.equal((1n - 3n + Q) % Q);
  });

  it("add/sub: invalid length reverts with InvalidCiphertextLength", async function () {
    const valid = encodeCiphertext(new Array<bigint>(2 * N).fill(0n));
    const short = new Uint8Array(100);

    await expect(harness.add(short, valid)).to.be.revertedWithCustomError(harness, "InvalidCiphertextLength");
    await expect(harness.add(valid, short)).to.be.revertedWithCustomError(harness, "InvalidCiphertextLength");
    await expect(harness.sub(short, valid)).to.be.revertedWithCustomError(harness, "InvalidCiphertextLength");
    await expect(harness.sub(valid, short)).to.be.revertedWithCustomError(harness, "InvalidCiphertextLength");
  });
});
