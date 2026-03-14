import { expect } from "chai";
import { network } from "hardhat";
import { keccak256, toUtf8Bytes, parseEther } from "ethers";

const N = 1024;
const CIPHERTEXT_BYTES = 8192;

/** Make a deterministic non-zero ciphertext for testing.
 *  NOTE: bytes are raw and NOT guaranteed to have coefficients < Q.
 *  Use only for tests that don't call RingRegev.sub/add on the result.
 */
function fakeCiphertext(seed: number): Uint8Array {
  const buf = new Uint8Array(CIPHERTEXT_BYTES);
  for (let i = 0; i < CIPHERTEXT_BYTES; i++) {
    buf[i] = (seed + i) & 0xff;
  }
  return buf;
}

const Q = 134217728; // 2^27

/**
 * Make a ciphertext with all coefficients in [0, Q).
 * Safe to use as input to RingRegev.sub and RingRegev.add.
 */
function validCiphertext(seed: number): Uint8Array {
  const buf = new Uint8Array(CIPHERTEXT_BYTES);
  for (let i = 0; i < 2 * N; i++) {
    const coeff = ((seed * 1009 + i * 3) >>> 0) % Q;
    const j = i * 4;
    buf[j] = coeff & 0xff;
    buf[j + 1] = (coeff >> 8) & 0xff;
    buf[j + 2] = (coeff >> 16) & 0xff;
    buf[j + 3] = (coeff >> 24) & 0xff;
  }
  return buf;
}

function fakePk(seed: number): Uint8Array {
  return fakeCiphertext(seed + 200);
}

function toHex(buf: Uint8Array): string {
  return "0x" + Buffer.from(buf).toString("hex");
}

const validCommitment = keccak256(toUtf8Bytes("test-proof"));
const validCommitment2 = keccak256(toUtf8Bytes("test-proof-2"));
const validCommitment3 = keccak256(toUtf8Bytes("test-proof-3"));
const validProofInputs = "0x1234";
const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";

describe("PrivateTransfer", function () {
  let contract: any;
  let ethers: any;
  // Fixed signers — never call network.connect() inside test cases
  let signers: any[];

  before(async function () {
    const conn = await (network as any).connect();
    ethers = conn.ethers;
    signers = await ethers.getSigners();

    const PrivateTransfer = await ethers.getContractFactory("PrivateTransfer");
    contract = await PrivateTransfer.deploy();
    await contract.waitForDeployment();
  });

  // ── register ───────────────────────────────────────────────────────────────

  describe("register", function () {
    it("stores pk and encryptedBalance on first registration", async function () {
      const pk = fakePk(1);
      const initBal = fakeCiphertext(1);

      await contract.connect(signers[1]).register(pk, initBal, validCommitment, validProofInputs, {
        value: parseEther("1"),
      });

      const acc = await contract.accounts(signers[1].address);
      expect(acc.publicKey).to.equal(toHex(pk));
      expect(acc.encryptedBalance).to.equal(toHex(initBal));
    });

    it("increments totalDeposits on registration", async function () {
      const before = await contract.totalDeposits();
      const pk = fakePk(2);
      const initBal = fakeCiphertext(2);

      await contract.connect(signers[2]).register(pk, initBal, validCommitment, validProofInputs, {
        value: parseEther("1"),
      });

      expect(await contract.totalDeposits()).to.equal(before + parseEther("1"));
    });

    it("emits Registered event", async function () {
      const pk = fakePk(3);
      const initBal = fakeCiphertext(3);
      const amount = parseEther("1");

      await expect(
        contract.connect(signers[3]).register(pk, initBal, validCommitment, validProofInputs, { value: amount }),
      )
        .to.emit(contract, "Registered")
        .withArgs(signers[3].address, amount);
    });

    it("reverts if already registered", async function () {
      const pk = fakePk(10);
      const initBal = fakeCiphertext(10);

      await expect(
        contract.connect(signers[1]).register(pk, initBal, validCommitment, validProofInputs, {
          value: parseEther("0.01"),
        }),
      ).to.be.revertedWithCustomError(contract, "AlreadyRegistered");
    });

    it("reverts if msg.value is zero", async function () {
      await expect(
        contract.connect(signers[9]).register(fakePk(9), fakeCiphertext(9), validCommitment, validProofInputs, {
          value: 0,
        }),
      ).to.be.revertedWithCustomError(contract, "MustDepositETH");
    });

    it("reverts if proof is invalid (zero commitment)", async function () {
      await expect(
        contract.connect(signers[10]).register(fakePk(10), fakeCiphertext(10), zeroCommitment, validProofInputs, {
          value: parseEther("0.1"),
        }),
      ).to.be.revertedWithCustomError(contract, "InvalidProof");
    });

    it("isRegistered returns true after registration", async function () {
      expect(await contract.isRegistered(signers[1].address)).to.equal(true);
    });

    it("isRegistered returns false for unregistered address", async function () {
      expect(await contract.isRegistered(signers[19].address)).to.equal(false);
    });
  });

  // ── withdraw ───────────────────────────────────────────────────────────────

  describe("withdraw", function () {
    it("updates encryptedBalance and decrements totalDeposits", async function () {
      const totalBefore = await contract.totalDeposits();
      const encAmount = fakeCiphertext(50);
      const encNewBal = fakeCiphertext(51);
      const amount = parseEther("0.1");

      await contract.connect(signers[1]).withdraw(amount, encAmount, encNewBal, validCommitment, validProofInputs);

      expect(await contract.totalDeposits()).to.equal(totalBefore - amount);
      const acc = await contract.accounts(signers[1].address);
      expect(acc.encryptedBalance).to.equal(toHex(encNewBal));
    });

    it("pays out ETH to caller", async function () {
      const balBefore = await ethers.provider.getBalance(signers[1].address);
      const amount = parseEther("0.01");
      const encAmount = fakeCiphertext(52);
      const encNewBal = fakeCiphertext(53);

      const tx = await contract
        .connect(signers[1])
        .withdraw(amount, encAmount, encNewBal, validCommitment, validProofInputs);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const balAfter = await ethers.provider.getBalance(signers[1].address);

      expect(balAfter).to.equal(balBefore + amount - gasCost);
    });

    it("emits Withdrawn event", async function () {
      const amount = parseEther("0.001");
      await expect(
        contract
          .connect(signers[1])
          .withdraw(amount, fakeCiphertext(54), fakeCiphertext(55), validCommitment, validProofInputs),
      )
        .to.emit(contract, "Withdrawn")
        .withArgs(signers[1].address, amount);
    });

    it("reverts if amount is zero", async function () {
      await expect(
        contract
          .connect(signers[1])
          .withdraw(0, fakeCiphertext(56), fakeCiphertext(57), validCommitment, validProofInputs),
      ).to.be.revertedWithCustomError(contract, "AmountMustBePositive");
    });

    it("reverts if proof is invalid", async function () {
      await expect(
        contract
          .connect(signers[1])
          .withdraw(parseEther("0.001"), fakeCiphertext(58), fakeCiphertext(59), zeroCommitment, validProofInputs),
      ).to.be.revertedWithCustomError(contract, "InvalidProof");
    });

    it("reverts if caller is not registered", async function () {
      await expect(
        contract
          .connect(signers[15])
          .withdraw(parseEther("0.001"), fakeCiphertext(60), fakeCiphertext(61), validCommitment, validProofInputs),
      ).to.be.revertedWithCustomError(contract, "NotRegistered");
    });
  });

  // ── transfer ───────────────────────────────────────────────────────────────

  describe("transfer", function () {
    // signers[4] is the sender; signers[1], signers[2], signers[3], signers[5] are the 4 recipients
    before(async function () {
      // Register signers[4] (sender) and signers[5] (4th recipient) so pool has >= 5 users
      await contract.connect(signers[4]).register(fakePk(4), validCiphertext(400), validCommitment, validProofInputs, {
        value: parseEther("2"),
      });
      await contract.connect(signers[5]).register(fakePk(5), validCiphertext(500), validCommitment, validProofInputs, {
        value: parseEther("1"),
      });
    });

    it("exposes transfer ABI without sender update ciphertexts", async function () {
      const transferFragment = contract.interface.getFunction("transfer");
      expect(transferFragment.inputs.map(({ name }: { name: string }) => name)).to.deep.equal([
        "recipients",
        "encBalanceToUpdateReceiver",
        "encTotal",
        "commitment",
        "proofInputs",
      ]);
    });

    it("updates sender and all 4 recipient encrypted balances", async function () {
      const recipients = [signers[1].address, signers[2].address, signers[3].address, signers[5].address];
      // Use validCiphertext so RingRegev.sub/add won't panic (coefficients must be < Q)
      const encReceiver = [validCiphertext(60), validCiphertext(61), validCiphertext(62), validCiphertext(63)];
      const encTotal = validCiphertext(68);

      const senderBalBefore = (await contract.accounts(signers[4].address)).encryptedBalance;
      const recv0BalBefore = (await contract.accounts(signers[1].address)).encryptedBalance;

      await contract.connect(signers[4]).transfer(recipients, encReceiver, encTotal, validCommitment, validProofInputs);

      // Sender balance changed (RingRegev.sub applied)
      const senderAcc = await contract.accounts(signers[4].address);
      expect(senderAcc.encryptedBalance).to.not.equal(senderBalBefore);

      // Recipient[0] balance changed (RingRegev.add applied)
      const recv0Acc = await contract.accounts(signers[1].address);
      expect(recv0Acc.encryptedBalance).to.not.equal(recv0BalBefore);
    });

    it("emits Transferred event with correct sender and recipients", async function () {
      const recipients = [signers[1].address, signers[2].address, signers[3].address, signers[5].address];
      const encReceiver = [validCiphertext(70), validCiphertext(71), validCiphertext(72), validCiphertext(73)];
      const encTotal = validCiphertext(78);

      await expect(
        contract.connect(signers[4]).transfer(recipients, encReceiver, encTotal, validCommitment2, validProofInputs),
      )
        .to.emit(contract, "Transferred")
        .withArgs(signers[4].address, recipients);
    });

    it("reverts if recipient array lengths mismatch", async function () {
      // 3 recipients but 4 encReceiver arrays
      const recipients = [signers[1].address, signers[2].address, signers[3].address];
      const encReceiver = [fakeCiphertext(80), fakeCiphertext(81), fakeCiphertext(82), fakeCiphertext(83)];
      const encTotal = fakeCiphertext(88);

      await expect(
        contract.connect(signers[4]).transfer(recipients, encReceiver, encTotal, validCommitment, validProofInputs),
      ).to.be.revertedWithCustomError(contract, "LengthMismatch");
    });

    it("reverts if sender is not registered", async function () {
      // signers[16] is never registered
      const recipients = [signers[1].address, signers[2].address, signers[3].address, signers[4].address];
      const encReceiver = [fakeCiphertext(90), fakeCiphertext(91), fakeCiphertext(92), fakeCiphertext(93)];
      const encTotal = fakeCiphertext(98);

      await expect(
        contract.connect(signers[16]).transfer(recipients, encReceiver, encTotal, validCommitment, validProofInputs),
      ).to.be.revertedWithCustomError(contract, "NotRegistered");
    });

    it("reverts if a recipient is not registered", async function () {
      // signers[17] is not registered
      const recipients = [signers[1].address, signers[2].address, signers[3].address, signers[17].address];
      const encReceiver = [fakeCiphertext(100), fakeCiphertext(101), fakeCiphertext(102), fakeCiphertext(103)];
      const encTotal = fakeCiphertext(108);

      await expect(
        contract.connect(signers[4]).transfer(recipients, encReceiver, encTotal, validCommitment, validProofInputs),
      ).to.be.revertedWithCustomError(contract, "RecipientNotRegistered");
    });

    it("reverts if proof is invalid", async function () {
      const recipients = [signers[1].address, signers[2].address, signers[3].address, signers[5].address];
      const encReceiver = [fakeCiphertext(110), fakeCiphertext(111), fakeCiphertext(112), fakeCiphertext(113)];
      const encTotal = fakeCiphertext(118);

      await expect(
        contract.connect(signers[4]).transfer(recipients, encReceiver, encTotal, zeroCommitment, validProofInputs),
      ).to.be.revertedWithCustomError(contract, "InvalidProof");
    });

    it("reverts when sender is included as recipient", async function () {
      // signers[4] is sender and also in recipients list
      const recipients = [signers[1].address, signers[2].address, signers[3].address, signers[4].address];
      const encReceiver = [fakeCiphertext(120), fakeCiphertext(121), fakeCiphertext(122), fakeCiphertext(123)];
      const encTotal = fakeCiphertext(128);

      await expect(
        contract.connect(signers[4]).transfer(recipients, encReceiver, encTotal, validCommitment, validProofInputs),
      ).to.be.revertedWithCustomError(contract, "InvalidRecipients");
    });

    it("reverts when recipient list contains duplicates", async function () {
      // signers[1] appears twice
      const recipients = [signers[1].address, signers[1].address, signers[2].address, signers[3].address];
      const encReceiver = [fakeCiphertext(130), fakeCiphertext(131), fakeCiphertext(132), fakeCiphertext(133)];
      const encTotal = fakeCiphertext(138);

      await expect(
        contract.connect(signers[4]).transfer(recipients, encReceiver, encTotal, validCommitment, validProofInputs),
      ).to.be.revertedWithCustomError(contract, "InvalidRecipients");
    });

    it("reverts when pool is too small (fewer than N+1 registered users)", async function () {
      // Deploy a fresh contract with only 2 registered users (needs at least 5)
      const PrivateTransfer = await ethers.getContractFactory("PrivateTransfer");
      const fresh = await PrivateTransfer.deploy();
      await fresh.waitForDeployment();

      // Register only 2 users using fresh signers
      await fresh.connect(signers[11]).register(fakePk(11), fakeCiphertext(11), validCommitment, validProofInputs, {
        value: parseEther("1"),
      });
      await fresh.connect(signers[12]).register(fakePk(12), fakeCiphertext(12), validCommitment, validProofInputs, {
        value: parseEther("1"),
      });

      // signers[11] tries to transfer (pool has only 2 users, need >= 5)
      const recipients = [signers[12].address, signers[13].address, signers[14].address, signers[15].address];
      const encReceiver = [fakeCiphertext(140), fakeCiphertext(141), fakeCiphertext(142), fakeCiphertext(143)];
      const encTotal = fakeCiphertext(148);

      await expect(
        fresh.connect(signers[11]).transfer(recipients, encReceiver, encTotal, validCommitment, validProofInputs),
      ).to.be.revertedWithCustomError(fresh, "InsufficientPool");
    });

    it("reverts when the same commitment is reused (double-spend)", async function () {
      const recipients = [signers[1].address, signers[2].address, signers[3].address, signers[5].address];
      const encReceiver = [validCiphertext(150), validCiphertext(151), validCiphertext(152), validCiphertext(153)];
      const encTotal = validCiphertext(158);

      // First call succeeds
      await contract
        .connect(signers[4])
        .transfer(recipients, encReceiver, encTotal, validCommitment3, validProofInputs);

      // Re-submitting the same commitment must revert
      await expect(
        contract.connect(signers[4]).transfer(recipients, encReceiver, encTotal, validCommitment3, validProofInputs),
      ).to.be.revertedWithCustomError(contract, "TransferAlreadyUsed");
    });

    it("tracks totalRegistered correctly", async function () {
      // Fresh contract
      const PrivateTransfer = await ethers.getContractFactory("PrivateTransfer");
      const fresh = await PrivateTransfer.deploy();
      await fresh.waitForDeployment();

      expect(await fresh.totalRegistered()).to.equal(0);

      await fresh.connect(signers[0]).register(fakePk(0), fakeCiphertext(0), validCommitment, validProofInputs, {
        value: parseEther("1"),
      });
      expect(await fresh.totalRegistered()).to.equal(1);

      await fresh.connect(signers[1]).register(fakePk(1), fakeCiphertext(1), validCommitment, validProofInputs, {
        value: parseEther("1"),
      });
      expect(await fresh.totalRegistered()).to.equal(2);
    });
  });
});
