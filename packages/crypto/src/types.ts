/** n=1024 coefficients in Z_q, q=2^27 */
export type Polynomial = bigint[];

/** Ring Regev ciphertext: (a, b) where a,b ∈ R_q */
export type Ciphertext = {
  a: Polynomial;
  b: Polynomial;
};

/** Ring Regev public key: (a, b) where b = a·s + e */
export type PublicKey = {
  a: Polynomial;
  b: Polynomial;
};

/** Ring Regev secret key: s ∈ R_q */
export type SecretKey = Polynomial;

/** Mock STARK proof */
export type ZKProof = {
  /** SHA-256 commitment over public inputs */
  commitment: Uint8Array;
  /** Serialized public inputs */
  inputs: Uint8Array;
};
