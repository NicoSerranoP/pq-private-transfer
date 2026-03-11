// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RingRegev
 * @notice On-chain homomorphic add and sub for Ring Regev ciphertexts.
 *
 * Ciphertext encoding: two polynomials of degree N=1024, each coefficient
 * stored as 4-byte little-endian uint32.  Total size = 2 * 1024 * 4 = 8192 bytes.
 *
 * Operations are coefficient-wise mod q = 2^27 = 134217728.
 * No keygen, encrypt, or decrypt is performed on-chain.
 */
library RingRegev {
    uint256 internal constant Q = 134217728; // 2^27
    uint256 internal constant N = 1024;
    uint256 internal constant CIPHERTEXT_BYTES = 8192; // 2 * N * 4

    error InvalidCiphertextLength();

    /**
     * @notice Coefficient-wise homomorphic addition: result[i] = (a[i] + b[i]) mod q
     */
    function add(bytes memory a, bytes memory b) internal pure returns (bytes memory result) {
        if (a.length != CIPHERTEXT_BYTES || b.length != CIPHERTEXT_BYTES) {
            revert InvalidCiphertextLength();
        }
        result = new bytes(CIPHERTEXT_BYTES);
        uint256 coeffCount = 2 * N;
        for (uint256 i = 0; i < coeffCount; ) {
            uint256 offset = i * 4;
            uint256 ca = _readLE32(a, offset);
            uint256 cb = _readLE32(b, offset);
            uint256 cr = (ca + cb) % Q;
            _writeLE32(result, offset, cr);
            unchecked { ++i; }
        }
    }

    /**
     * @notice Coefficient-wise homomorphic subtraction: result[i] = (a[i] - b[i] + q) mod q
     * Result is always non-negative.
     */
    function sub(bytes memory a, bytes memory b) internal pure returns (bytes memory result) {
        if (a.length != CIPHERTEXT_BYTES || b.length != CIPHERTEXT_BYTES) {
            revert InvalidCiphertextLength();
        }
        result = new bytes(CIPHERTEXT_BYTES);
        uint256 coeffCount = 2 * N;
        for (uint256 i = 0; i < coeffCount; ) {
            uint256 offset = i * 4;
            uint256 ca = _readLE32(a, offset);
            uint256 cb = _readLE32(b, offset);
            uint256 cr = (ca + Q - cb) % Q;
            _writeLE32(result, offset, cr);
            unchecked { ++i; }
        }
    }

    /** @dev Read 4-byte little-endian uint32 from bytes at offset */
    function _readLE32(bytes memory data, uint256 offset) private pure returns (uint256) {
        return uint256(uint8(data[offset]))
            | (uint256(uint8(data[offset + 1])) << 8)
            | (uint256(uint8(data[offset + 2])) << 16)
            | (uint256(uint8(data[offset + 3])) << 24);
    }

    /** @dev Write uint32 value to bytes at offset as 4-byte little-endian */
    function _writeLE32(bytes memory data, uint256 offset, uint256 value) private pure {
        data[offset]     = bytes1(uint8(value));
        data[offset + 1] = bytes1(uint8(value >> 8));
        data[offset + 2] = bytes1(uint8(value >> 16));
        data[offset + 3] = bytes1(uint8(value >> 24));
    }
}
