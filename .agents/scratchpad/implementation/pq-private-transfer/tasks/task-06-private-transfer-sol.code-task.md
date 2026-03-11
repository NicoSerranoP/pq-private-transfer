---
status: completed
created: 2026-03-11
started: 2026-03-11
completed: 2026-03-11
---
# Task: PrivateTransfer.sol + Deploy

## Description
Implement the main `PrivateTransfer.sol` contract that ties together `RingRegev.sol` and the three verifier contracts. Implement the Hardhat Ignition deployment module and update the deploy entry script. This is the centerpiece of the on-chain protocol.

## Background
The contract stores encrypted balances per user and enforces protocol rules via STARK proof verification. Key invariants:
- Only registered users can transfer or withdraw
- Transfer requires 4 recipients (all must be registered, no duplicates, sender not in list)
- Transfer pool minimum: `totalRegistered >= 5` (1 real + 3 dummies + spare)
- Double-spend prevention: `usedTransfers` mapping keyed on `keccak256(encTotal)`
- Reentrancy guard on `withdraw()` (ETH transfer)
- CEI pattern: all checks → all effects → ETH transfer (withdraw only)

See design.md Section 4.4 for full CEI specs for each function.

The project uses **Hardhat Ignition** (not hardhat-deploy). The deploy entry at `packages/hardhat/scripts/runHardhatDeployWithPK.ts` hardcodes `ignition/modules/SE2Token.ts` — this MUST be updated to point to `ignition/modules/PrivateTransfer.ts`.

## Reference Documentation
**Required:**
- Design: .agents/scratchpad/implementation/pq-private-transfer/design.md

**Additional References:**
- .agents/scratchpad/implementation/pq-private-transfer/context.md (Hardhat Ignition patterns, ESM module system)
- .agents/scratchpad/implementation/pq-private-transfer/plan.md (test cases — 17 PrivateTransfer tests)
- packages/hardhat/contracts/RingRegev.sol (Step 4 output)
- packages/hardhat/contracts/verifiers/ (Step 5 output)

**Note:** You MUST read the design document before beginning implementation.

## Technical Requirements
1. `packages/hardhat/contracts/PrivateTransfer.sol` — Solidity ^0.8.20
2. Imports: `ReentrancyGuard` from `@openzeppelin/contracts/utils/ReentrancyGuard.sol`, `RingRegev` library
3. State:
   ```solidity
   struct Account { bytes encryptedBalance; bytes publicKey; }
   mapping(address => Account) public accounts;
   mapping(bytes32 => bool) public usedTransfers;
   uint256 public totalRegistered;
   uint256 public totalDeposits;
   IVerifier public depositVerifier;
   IVerifier public transferVerifier;
   IVerifier public withdrawVerifier;
   ```
4. Custom errors: `AlreadyRegistered`, `NotRegistered`, `InvalidProof`, `InsufficientPool`, `InvalidRecipients`, `TransferAlreadyUsed`, `ZeroAmount`, `InsufficientContractBalance`
5. Events: `Registered(address indexed, uint256)`, `Transferred(address indexed, address[4])`, `Withdrawn(address indexed, uint256)`
6. `register(bytes pk, bytes initialBalance, bytes depositProof)` payable — full CEI per design
7. `deposit(bytes encNewBalance, bytes depositProof)` payable — full CEI per design
8. `transfer(address[4] recipients, bytes[4] encBalanceToUpdateReceiver, bytes[4] encBalanceToUpdateSender, bytes encTotal, bytes proof)` — full CEI per design
9. `withdraw(uint256 amount, bytes encAmount, bytes encNewBalance, bytes proof)` nonReentrant — full CEI per design
10. Hardhat Ignition module at `packages/hardhat/ignition/modules/PrivateTransfer.ts`
11. Update `packages/hardhat/scripts/runHardhatDeployWithPK.ts` to reference the new module
12. Tests in `packages/hardhat/test/PrivateTransfer.test.ts` — all 17 test cases

## Dependencies
- Step 4: RingRegev.sol
- Step 5: Verifier contracts (DepositVerifier, TransferVerifier, WithdrawVerifier)

## Implementation Approach
1. Write all 17 failing tests in `PrivateTransfer.test.ts`
2. Implement `PrivateTransfer.sol` using `RingRegev` library and verifier contracts
3. Create Ignition module; update deploy entry script
4. Run `pnpm deploy` on local network; confirm deployment succeeds
5. Run full test suite; all 17 must pass; gas report visible

## Acceptance Criteria

1. **register() stores account**
   - Given an unregistered address calls `register(pk, initialBalance, proof)` with valid ETH
   - When the transaction succeeds
   - Then `accounts[msg.sender].publicKey == pk`, `totalRegistered` incremented, `totalDeposits` incremented

2. **register() reverts AlreadyRegistered**
   - Given an already-registered address
   - When `register()` is called again
   - Then reverts with `AlreadyRegistered()`

3. **register() reverts InvalidProof**
   - Given a malformed proof (zero commitment)
   - When `register()` is called
   - Then reverts with `InvalidProof()`

4. **deposit() reverts NotRegistered**
   - Given an unregistered address calls `deposit()`
   - When the transaction is submitted
   - Then reverts with `NotRegistered()`

5. **deposit() updates balance**
   - Given a registered user calls `deposit()` with valid proof and ETH
   - When the transaction succeeds
   - Then `accounts[user].encryptedBalance` is updated, `totalDeposits` incremented

6. **transfer() reverts InsufficientPool**
   - Given fewer than 5 registered users
   - When `transfer()` is called
   - Then reverts with `InsufficientPool()`

7. **transfer() reverts InvalidRecipients (unregistered)**
   - Given a recipient address that is not registered
   - When `transfer()` is called
   - Then reverts with `InvalidRecipients()`

8. **transfer() reverts InvalidRecipients (duplicate)**
   - Given duplicate addresses in the recipients array
   - When `transfer()` is called
   - Then reverts with `InvalidRecipients()`

9. **transfer() reverts InvalidRecipients (sender in list)**
   - Given `msg.sender` appears in recipients
   - When `transfer()` is called
   - Then reverts with `InvalidRecipients()`

10. **transfer() updates all 5 balances**
    - Given valid transfer with 5 registered users
    - When `transfer()` succeeds
    - Then sender balance updated (sub encTotal), all 4 recipient balances updated (add encBalanceToUpdateReceiver)

11. **transfer() reverts TransferAlreadyUsed**
    - Given same `encTotal` submitted twice
    - When second `transfer()` is called
    - Then reverts with `TransferAlreadyUsed()`

12. **transfer() reverts InvalidProof**
    - Given tampered proof (zero commitment)
    - When `transfer()` is called
    - Then reverts with `InvalidProof()`

13. **withdraw() reverts NotRegistered**
    - Given unregistered caller
    - When `withdraw()` is called
    - Then reverts with `NotRegistered()`

14. **withdraw() reverts ZeroAmount**
    - Given `amount == 0`
    - When `withdraw()` is called
    - Then reverts with `ZeroAmount()`

15. **withdraw() reverts InsufficientContractBalance**
    - Given contract ETH balance < amount
    - When `withdraw()` is called
    - Then reverts with `InsufficientContractBalance()`

16. **withdraw() sends ETH and updates balance**
    - Given registered user with contract holding ETH, valid proof
    - When `withdraw(amount, encAmount, encNewBalance, proof)` succeeds
    - Then user receives `amount` ETH, `encryptedBalance` updated, `totalDeposits` decremented

17. **withdraw() reentrancy protection**
    - Given a malicious contract trying to re-enter `withdraw()`
    - When reentrancy is attempted
    - Then second call reverts (nonReentrant guard)

18. **All 17 unit tests pass**
    - Given the implementation is complete
    - When running `cd packages/hardhat && npx hardhat test --grep PrivateTransfer`
    - Then all 17 test cases pass

19. **Deploy succeeds**
    - Given local Hardhat node is running
    - When `pnpm deploy` is run
    - Then all 4 contracts deploy without error

## Metadata
- **Complexity**: High
- **Labels**: solidity, main-contract, deploy, CEI, reentrancy
- **Required Skills**: Solidity 0.8+, Hardhat Ignition, OpenZeppelin, Ring Regev
