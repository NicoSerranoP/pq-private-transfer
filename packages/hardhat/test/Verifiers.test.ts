import { expect } from "chai";
import { network } from "hardhat";
import { keccak256, toUtf8Bytes } from "ethers";

describe("Verifier Contracts", function () {
  let depositVerifier: any;
  let transferVerifier: any;
  let withdrawVerifier: any;

  before(async function () {
    const { ethers } = await (network as any).connect();

    const DepositVerifier = await ethers.getContractFactory("DepositVerifier");
    depositVerifier = await DepositVerifier.deploy();

    const TransferVerifier = await ethers.getContractFactory("TransferVerifier");
    transferVerifier = await TransferVerifier.deploy();

    const WithdrawVerifier = await ethers.getContractFactory("WithdrawVerifier");
    withdrawVerifier = await WithdrawVerifier.deploy();
  });

  const validCommitment = keccak256(toUtf8Bytes("test"));
  const validInputs = "0x1234";
  const zeroCommitment = "0x0000000000000000000000000000000000000000000000000000000000000000";
  const emptyInputs = "0x";

  for (const [name, getVerifier] of [
    ["DepositVerifier", () => depositVerifier],
    ["TransferVerifier", () => transferVerifier],
    ["WithdrawVerifier", () => withdrawVerifier],
  ] as const) {
    describe(name, function () {
      it("accepts a valid proof (non-zero commitment + non-empty inputs)", async function () {
        const verifier = getVerifier();
        expect(await verifier.verify(validCommitment, validInputs)).to.equal(true);
      });

      it("rejects zero commitment", async function () {
        const verifier = getVerifier();
        expect(await verifier.verify(zeroCommitment, validInputs)).to.equal(false);
      });

      it("rejects empty inputs", async function () {
        const verifier = getVerifier();
        expect(await verifier.verify(validCommitment, emptyInputs)).to.equal(false);
      });
    });
  }
});
