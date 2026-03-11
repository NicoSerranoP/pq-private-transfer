// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { RingRegev } from "./RingRegev.sol";
import { DepositVerifier } from "./verifiers/DepositVerifier.sol";
import { TransferVerifier } from "./verifiers/TransferVerifier.sol";
import { WithdrawVerifier } from "./verifiers/WithdrawVerifier.sol";

/**
 * @title PrivateTransfer
 * @notice Anonymous transfer protocol using Ring Regev homomorphic encryption.
 *
 * Encrypted balances (~8KB each) are stored per account.
 * All amounts are hidden — only STARK proofs confirm validity.
 * Recipient anonymity is achieved via N=4 recipients (1 real + 3 dummies).
 */
contract PrivateTransfer is ReentrancyGuard {

    // ── Custom errors ─────────────────────────────────────────────────────────

    error AlreadyRegistered();
    error NotRegistered();
    error MustDepositETH();
    error AmountMustBePositive();
    error InsufficientContractBalance();
    error InvalidProof();
    error LengthMismatch();
    error RecipientNotRegistered();
    error InsufficientPool(uint256 registered, uint256 required);
    error InvalidRecipients();
    error ETHTransferFailed();
    error TransferAlreadyUsed();

    // ── Data structures ───────────────────────────────────────────────────────

    struct Account {
        bytes encryptedBalance; // Ring Regev ciphertext ~8KB
        bytes publicKey;        // RLWE public key ~8KB
    }

    mapping(address => Account) public accounts;
    mapping(bytes32 => bool) public usedTransfers;
    uint256 public totalDeposits;
    uint256 public totalRegistered;

    // Deployed verifier instances
    DepositVerifier  private immutable _depositVerifier;
    TransferVerifier private immutable _transferVerifier;
    WithdrawVerifier private immutable _withdrawVerifier;

    // ── Events ────────────────────────────────────────────────────────────────

    event Registered(address indexed user, uint256 depositAmount);
    event Transferred(address indexed sender, address[] recipients);
    event Withdrawn(address indexed user, uint256 amount);

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor() {
        _depositVerifier  = new DepositVerifier();
        _transferVerifier = new TransferVerifier();
        _withdrawVerifier = new WithdrawVerifier();
    }

    // ── Register ──────────────────────────────────────────────────────────────

    /**
     * @notice Register an account by depositing ETH and setting an encrypted initial balance.
     * @param pk            RLWE public key
     * @param initialBalance RingRegev ciphertext of msg.value
     * @param commitment    STARK proof commitment
     * @param proofInputs   STARK proof serialized public inputs
     */
    function register(
        bytes calldata pk,
        bytes calldata initialBalance,
        bytes32 commitment,
        bytes calldata proofInputs
    ) external payable {
        if (accounts[msg.sender].publicKey.length > 0) revert AlreadyRegistered();
        if (msg.value == 0) revert MustDepositETH();
        if (!_depositVerifier.verify(commitment, proofInputs)) revert InvalidProof();

        accounts[msg.sender] = Account(initialBalance, pk);
        totalDeposits += msg.value;
        totalRegistered += 1;

        emit Registered(msg.sender, msg.value);
    }

    // ── Withdraw ──────────────────────────────────────────────────────────────

    /**
     * @notice Withdraw ETH by proving ownership of an encrypted balance >= amount.
     * @param amount        Plaintext withdrawal amount (visible on-chain)
     * @param encNewBalance RingRegev.Encrypt(balance - amount, pkB)
     * @param commitment    STARK proof commitment
     * @param proofInputs   STARK proof serialized public inputs
     */
    function withdraw(
        uint256 amount,
        bytes calldata /* encAmount */,
        bytes calldata encNewBalance,
        bytes32 commitment,
        bytes calldata proofInputs
    ) external nonReentrant {
        if (amount == 0) revert AmountMustBePositive();
        if (accounts[msg.sender].publicKey.length == 0) revert NotRegistered();
        if (address(this).balance < amount) revert InsufficientContractBalance();
        if (!_withdrawVerifier.verify(commitment, proofInputs)) revert InvalidProof();

        // Effects
        accounts[msg.sender].encryptedBalance = encNewBalance;
        totalDeposits -= amount;

        // Interaction
        (bool ok, ) = msg.sender.call{ value: amount }("");
        if (!ok) revert ETHTransferFailed();

        emit Withdrawn(msg.sender, amount);
    }

    // ── Transfer ──────────────────────────────────────────────────────────────

    /**
     * @notice Transfer encrypted amounts to N=4 recipients (1 real + 3 dummies).
     * @param recipients                  Array of N recipient addresses
     * @param encBalanceToUpdateReceiver  HEpk_i(amount_i) for each recipient
     * @param encBalanceToUpdateSender    HEpkB(amount_i) for each recipient (for sender deduction)
     * @param encTotal                    HEpkB(total) — sum of all amounts
     * @param commitment                  STARK proof commitment
     * @param proofInputs                 STARK proof serialized public inputs
     */
    function transfer(
        address[] calldata recipients,
        bytes[] calldata encBalanceToUpdateReceiver,
        bytes[] calldata encBalanceToUpdateSender,
        bytes calldata encTotal,
        bytes32 commitment,
        bytes calldata proofInputs
    ) external {
        uint256 n = recipients.length;
        if (n != encBalanceToUpdateReceiver.length || n != encBalanceToUpdateSender.length) revert LengthMismatch();
        if (accounts[msg.sender].publicKey.length == 0) revert NotRegistered();
        // Need at least n+1 registered users (sender + n distinct recipients)
        if (totalRegistered < n + 1) revert InsufficientPool(totalRegistered, n + 1);
        if (!_transferVerifier.verify(commitment, proofInputs)) revert InvalidProof();

        // Verify all recipients are registered, distinct, and not the sender
        for (uint256 i = 0; i < n; ) {
            address r = recipients[i];
            if (accounts[r].publicKey.length == 0) revert RecipientNotRegistered();
            if (r == msg.sender) revert InvalidRecipients();
            // Check for duplicates: compare against all previous recipients
            for (uint256 j = 0; j < i; ) {
                if (recipients[j] == r) revert InvalidRecipients();
                unchecked { ++j; }
            }
            unchecked { ++i; }
        }

        // Nullifier check: prevent double-spend via commitment replay
        if (usedTransfers[commitment]) revert TransferAlreadyUsed();

        // Mark commitment as used (nullifier) to prevent double-spend
        usedTransfers[commitment] = true;

        // Deduct total from sender
        accounts[msg.sender].encryptedBalance = RingRegev.sub(
            accounts[msg.sender].encryptedBalance,
            encTotal
        );

        // Credit each recipient
        for (uint256 i = 0; i < n; ) {
            accounts[recipients[i]].encryptedBalance = RingRegev.add(
                accounts[recipients[i]].encryptedBalance,
                encBalanceToUpdateReceiver[i]
            );
            unchecked { ++i; }
        }

        emit Transferred(msg.sender, recipients);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    function isRegistered(address user) external view returns (bool) {
        return accounts[user].publicKey.length > 0;
    }
}
