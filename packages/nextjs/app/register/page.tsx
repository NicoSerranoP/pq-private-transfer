"use client";

import { useState } from "react";
import { encrypt, keygen, proveDeposit, serializeCiphertext, serializePublicKey } from "@pq/crypto";
import type { NextPage } from "next";
import { parseEther } from "viem";
import { useAccount } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { AMOUNT_SCALE, toBytes32, toHex, weiToUnits } from "~~/utils/pq/amounts";
import { saveSecretKey } from "~~/utils/pq/keyStorage";
import { notification } from "~~/utils/scaffold-eth";

const RegisterPage: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const [amountEth, setAmountEth] = useState("0.01");
  const [step, setStep] = useState<"idle" | "proving" | "submitting">("idle");

  const { data: isRegistered, refetch: refetchRegistered } = useScaffoldReadContract({
    contractName: "PrivateTransfer",
    functionName: "isRegistered",
    args: [connectedAddress],
  });

  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "PrivateTransfer" });

  const handleRegister = async () => {
    if (!connectedAddress) {
      notification.error("Connect your wallet first");
      return;
    }
    if (isRegistered) {
      notification.error("This address is already registered");
      return;
    }

    let depositWei: bigint;
    try {
      depositWei = parseEther(amountEth);
    } catch {
      notification.error("Invalid ETH amount");
      return;
    }

    const depositUnits = weiToUnits(depositWei);
    if (depositUnits === 0n) {
      notification.error(`Minimum deposit is ${AMOUNT_SCALE / BigInt(1e15)} ETH (1 finney)`);
      return;
    }
    if (depositUnits > 16384n) {
      notification.error("Maximum deposit is ~16.384 ETH for prototype plaintext space");
      return;
    }

    try {
      setStep("proving");

      // Generate keypair client-side
      const { pk, sk } = keygen();

      // Encrypt deposit amount using Ring Regev
      const initialBalance = encrypt(depositUnits, pk);

      // Generate STARK proof for deposit circuit
      const proof = proveDeposit(
        { pk, initialBalance, depositAmount: depositUnits },
        { r: new Array(1024).fill(0n) }, // deterministic randomness for proof
      );

      setStep("submitting");

      // Save secret key in localStorage before tx (so it's available even if tx fails)
      saveSecretKey(connectedAddress, sk);

      await writeContractAsync({
        functionName: "register",
        args: [
          toHex(serializePublicKey(pk)),
          toHex(serializeCiphertext(initialBalance)),
          toBytes32(proof.commitment) as `0x${string}`,
          toHex(proof.inputs),
        ],
        value: depositWei,
      });

      notification.success("Registered successfully! Your private key is saved locally.");
      await refetchRegistered();
    } catch (err) {
      notification.error("Registration failed. Check the console for details.");
      console.error(err);
    } finally {
      setStep("idle");
    }
  };

  return (
    <div className="flex items-center flex-col grow pt-10">
      <div className="px-5 w-full max-w-lg">
        <h1 className="text-center text-4xl font-bold mb-2">Register</h1>
        <p className="text-center text-base-content/70 mb-8">
          Deposit ETH and create your encrypted anonymous account. Your private key is generated client-side and never
          leaves your browser.
        </p>

        {!connectedAddress ? (
          <div className="alert alert-warning">
            <span>Connect your wallet to register.</span>
          </div>
        ) : isRegistered ? (
          <div className="alert alert-success">
            <span>✓ This address is already registered. Head to Transfer or Withdraw.</span>
          </div>
        ) : (
          <div className="card bg-base-200 shadow-lg">
            <div className="card-body gap-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-semibold">Deposit amount (ETH)</span>
                  <span className="label-text-alt text-base-content/50">max ~16.384 ETH</span>
                </label>
                <input
                  type="number"
                  className="input input-bordered w-full"
                  placeholder="0.01"
                  min="0.001"
                  step="0.001"
                  value={amountEth}
                  onChange={e => setAmountEth(e.target.value)}
                  disabled={step !== "idle"}
                />
              </div>

              {step !== "idle" && (
                <div className="alert alert-info">
                  {step === "proving" ? (
                    <span className="flex items-center gap-2">
                      <span className="loading loading-spinner loading-sm" />
                      Generating keypair and STARK proof…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="loading loading-spinner loading-sm" />
                      Submitting transaction…
                    </span>
                  )}
                </div>
              )}

              <button className="btn btn-primary w-full" onClick={handleRegister} disabled={step !== "idle"}>
                {step === "idle" ? "Register & Deposit" : "Processing…"}
              </button>

              <div className="text-sm text-base-content/60 space-y-1">
                <p>• A keypair is generated in your browser</p>
                <p>• Your deposit is encrypted with Ring Regev (RLWE)</p>
                <p>• A STARK proof proves correctness without revealing your balance</p>
                <p>• Your private key is stored in browser localStorage</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RegisterPage;
