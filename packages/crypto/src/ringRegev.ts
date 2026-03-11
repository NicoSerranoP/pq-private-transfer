import type { Ciphertext, PublicKey, SecretKey } from "./types.js";

const N = 1024;
const Q = 134217728n; // 2^27

/**
 * Scaling factor for message encoding.
 * Plaintext m is stored as m * DELTA so noise < DELTA/2 is tolerable.
 * Max plaintext: Q / DELTA = 2^14 = 16384 (use small amounts in tests).
 * With N=1024 ternary errors, expected noise per coeff ≈ 37 << DELTA/2 = 4096.
 *
 * NOTE: This is a prototype implementation. Parameter selection prioritises
 * correctness and clarity over cryptographic security.
 */
const DELTA = 8192n; // 2^13

/** Reduce x into [0, Q) */
function mod(x: bigint): bigint {
  return ((x % Q) + Q) % Q;
}

/** Sample a uniform random polynomial in R_q */
function sampleUniform(): bigint[] {
  const poly = new Array<bigint>(N);
  for (let i = 0; i < N; i++) {
    // Sample 4 random bytes and reduce mod Q (27 bits)
    const rand = BigInt(
      (Math.random() * Number(Q)) | 0
    );
    poly[i] = rand;
  }
  return poly;
}

/** Sample a small-norm error polynomial (coefficients in {-1, 0, 1}) */
function sampleSmall(): bigint[] {
  const poly = new Array<bigint>(N);
  for (let i = 0; i < N; i++) {
    const r = Math.random();
    poly[i] = r < 0.33 ? Q - 1n : r < 0.66 ? 0n : 1n;
  }
  return poly;
}

/** Add two polynomials mod Q */
function polyAdd(a: bigint[], b: bigint[]): bigint[] {
  const result = new Array<bigint>(N);
  for (let i = 0; i < N; i++) {
    result[i] = mod(a[i] + b[i]);
  }
  return result;
}

/** Subtract two polynomials mod Q */
function polySub(a: bigint[], b: bigint[]): bigint[] {
  const result = new Array<bigint>(N);
  for (let i = 0; i < N; i++) {
    result[i] = mod(a[i] - b[i]);
  }
  return result;
}

/**
 * Schoolbook polynomial multiplication mod (x^n + 1) and mod Q.
 * Coefficients of the product are reduced via the negacyclic rule:
 * x^n ≡ -1, so x^(n+k) ≡ -x^k.
 */
function polyMul(a: bigint[], b: bigint[]): bigint[] {
  const result = new Array<bigint>(N).fill(0n);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const k = i + j;
      if (k < N) {
        result[k] = mod(result[k] + a[i] * b[j]);
      } else {
        // x^n ≡ -1 → subtract
        result[k - N] = mod(result[k - N] - a[i] * b[j]);
      }
    }
  }
  return result;
}

/** Encode a scalar message m by scaling: poly[0] = m * DELTA mod Q */
function encodeMessage(m: bigint): bigint[] {
  const poly = new Array<bigint>(N).fill(0n);
  poly[0] = mod(m * DELTA);
  return poly;
}

/**
 * Generate a Ring Regev key pair.
 * pk = (a, b) where b = a·s + e, s = secret key, e = small error
 */
export function keygen(): { pk: PublicKey; sk: SecretKey } {
  const a = sampleUniform();
  const s = sampleSmall();
  const e = sampleSmall();
  // b = a·s + e mod Q in R_q
  const as = polyMul(a, s);
  const b = polyAdd(as, e);
  return {
    pk: { a, b },
    sk: s,
  };
}

/**
 * Encrypt a plaintext scalar m under public key pk.
 * Optional r is the randomness polynomial (for deterministic encryption in tests/proofs).
 * When r is provided, error terms are zero (deterministic; used for ZK proof generation).
 * ct = (a·r + e1, b·r + e2 + m*DELTA)
 */
export function encrypt(m: bigint, pk: PublicKey, r?: bigint[]): Ciphertext {
  const rPoly = r ?? sampleSmall();
  // When r is explicitly provided (deterministic mode), errors are zero
  const e1 = r ? new Array<bigint>(N).fill(0n) : sampleSmall();
  const e2 = r ? new Array<bigint>(N).fill(0n) : sampleSmall();
  // ct.a = pk.a · r + e1
  const ctA = polyAdd(polyMul(pk.a, rPoly), e1);
  // ct.b = pk.b · r + e2 + m (message at coefficient 0)
  const msg = encodeMessage(m);
  const ctB = polyAdd(polyAdd(polyMul(pk.b, rPoly), e2), msg);
  return { a: ctA, b: ctB };
}

/**
 * Decrypt a ciphertext with secret key sk.
 * m ≈ round((ct.b - ct.a · sk)[0] / DELTA) mod (Q/DELTA)
 */
export function decrypt(ct: Ciphertext, sk: SecretKey): bigint {
  const as = polyMul(ct.a, sk);
  const diff = polySub(ct.b, as);
  // diff[0] ≈ m * DELTA + small_noise
  const v = diff[0]; // in [0, Q)
  // Round to nearest multiple of DELTA, then divide
  return ((v + DELTA / 2n) / DELTA) % (Q / DELTA);
}

/**
 * Homomorphic addition: ct1 + ct2.
 * (a1 + a2, b1 + b2) decrypts to m1 + m2 if noise stays small.
 */
export function add(ct1: Ciphertext, ct2: Ciphertext): Ciphertext {
  return {
    a: polyAdd(ct1.a, ct2.a),
    b: polyAdd(ct1.b, ct2.b),
  };
}

/**
 * Homomorphic subtraction: ct1 - ct2.
 * (a1 - a2, b1 - b2) decrypts to m1 - m2 if noise stays small.
 */
export function sub(ct1: Ciphertext, ct2: Ciphertext): Ciphertext {
  return {
    a: polySub(ct1.a, ct2.a),
    b: polySub(ct1.b, ct2.b),
  };
}

/** Homomorphically sum an array of ciphertexts */
export function homomorphicSum(cts: Ciphertext[]): Ciphertext {
  if (cts.length === 0) throw new Error("homomorphicSum requires at least one ciphertext");
  return cts.reduce(add);
}

/** Serialize a polynomial to 4096 bytes (4-byte LE per coefficient) */
function serializePolynomial(poly: bigint[]): Uint8Array {
  const out = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const v = Number(poly[i]);
    out[i * 4 + 0] = v & 0xff;
    out[i * 4 + 1] = (v >> 8) & 0xff;
    out[i * 4 + 2] = (v >> 16) & 0xff;
    out[i * 4 + 3] = (v >> 24) & 0xff;
  }
  return out;
}

/** Deserialize a polynomial from 4096 bytes (4-byte LE per coefficient) */
function deserializePolynomial(data: Uint8Array, offset = 0): bigint[] {
  const poly = new Array<bigint>(N);
  for (let i = 0; i < N; i++) {
    const v =
      data[offset + i * 4] |
      (data[offset + i * 4 + 1] << 8) |
      (data[offset + i * 4 + 2] << 16) |
      (data[offset + i * 4 + 3] << 24);
    poly[i] = BigInt(v >>> 0); // unsigned
  }
  return poly;
}

/** Serialize a ciphertext to 8192 bytes: a polynomial || b polynomial */
export function serializeCiphertext(ct: Ciphertext): Uint8Array {
  const out = new Uint8Array(N * 8);
  out.set(serializePolynomial(ct.a), 0);
  out.set(serializePolynomial(ct.b), N * 4);
  return out;
}

/** Deserialize a ciphertext from 8192 bytes */
export function deserializeCiphertext(data: Uint8Array): Ciphertext {
  const a = deserializePolynomial(data, 0);
  const b = deserializePolynomial(data, N * 4);
  return { a, b };
}

/** Serialize a public key to 8192 bytes: a polynomial || b polynomial */
export function serializePublicKey(pk: PublicKey): Uint8Array {
  const out = new Uint8Array(N * 8);
  out.set(serializePolynomial(pk.a), 0);
  out.set(serializePolynomial(pk.b), N * 4);
  return out;
}
