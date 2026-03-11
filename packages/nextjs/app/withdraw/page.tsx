"use client";

import { useState } from "react";
import { decrypt, deserializeCiphertext, encrypt, proveWithdraw, serializeCiphertext } from "@pq/crypto";
import type { NextPage } from "next";
import { hexToBytes } from "viem";
import { useAccount } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { AMOUNT_SCALE, toBytes32, toHex, unitsToWei, weiToUnits } from "~~/utils/pq/amounts";
import { loadSecretKey } from "~~/utils/pq/keyStorage";
import { notification } from "~~/utils/scaffold-eth";

const WithdrawPage: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const [amountEth, setAmountEth] = useState("0.001");
  const [step, setStep] = useState<"idle" | "proving" | "submitting">("idle");

  const { data: account, refetch: refetchAccount } = useScaffoldReadContract({
    contractName: "PrivateTransfer",
    functionName: "accounts",
    args: [connectedAddress],
  });

  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "PrivateTransfer" });

  const handleWithdraw = async () => {
    if (!connectedAddress) {
      notification.error("Connect your wallet first");
      return;
    }
    if (!account || (account[1] as string).length === 0) {
      notification.error("You are not registered");
      return;
    }

    const sk = loadSecretKey(connectedAddress);
    if (!sk) {
      notification.error("Private key not found. Did you register from this browser?");
      return;
    }

    const amountUnits = weiToUnits(BigInt(Math.round(parseFloat(amountEth) * 1e18)));
    if (amountUnits === 0n) {
      notification.error("Amount too small (minimum 0.001 ETH)");
      return;
    }

    try {
      setStep("proving");

      // Deserialize encrypted balance and public key
      const encBalance = deserializeCiphertext(hexToBytes(account[0] as `0x${string}`));
      const pk = deserializeCiphertext(hexToBytes(account[1] as `0x${string}`));

      // Decrypt balance to verify sufficient funds
      const plainBalance = decrypt(encBalance, sk);

      if (amountUnits > plainBalance) {
        notification.error(
          `Insufficient balance. Have ${plainBalance} units (~${(Number(plainBalance) * 0.001).toFixed(3)} ETH)`,
        );
        setStep("idle");
        return;
      }

      // Encrypt the withdrawal amount and new balance
      const encAmount = encrypt(amountUnits, pk);
      const encNewBalance = encrypt(plainBalance - amountUnits, pk);

      // Generate STARK proof
      const proof = proveWithdraw(
        { pkB: pk, encBalance, encAmount, encNewBalance, amount: amountUnits },
        { pvkB: sk, plainBalance, rAmount: [] as any, rNewBalance: [] as any },
      );

      setStep("submitting");

      await writeContractAsync({
        functionName: "withdraw",
        args: [
          unitsToWei(amountUnits),
          toHex(serializeCiphertext(encAmount)),
          toHex(serializeCiphertext(encNewBalance)),
          toBytes32(proof.commitment) as `0x${string}`,
          toHex(proof.inputs),
        ],
      });

      notification.success(`Withdrew ${amountEth} ETH!`);
      setAmountEth("0.001");
      refetchAccount();
    } catch (err: any) {
      notification.error(err?.message ?? "Withdrawal failed");
    } finally {
      setStep("idle");
    }
  };

  // Decrypt balance for display if key is available
  const getDisplayBalance = (): string => {
    if (!connectedAddress || !account || (account[1] as string).length === 0) return "—";
    const sk = loadSecretKey(connectedAddress);
    if (!sk) return "key not found";
    try {
      const encBalance = deserializeCiphertext(hexToBytes(account[0] as `0x${string}`));
      const units = decrypt(encBalance, sk);
      return `${(Number(units) * 0.001).toFixed(3)} ETH`;
    } catch {
      return "decryption error";
    }
  };

  return (
    <div className="flex items-center flex-col grow pt-10">
      <div className="px-5 w-full max-w-lg">
        <h1 className="text-center text-4xl font-bold mb-2">Withdraw</h1>
        <p className="text-center text-base-content/70 mb-8">
          Withdraw ETH from your encrypted balance. A STARK proof confirms you own sufficient funds without revealing
          your total balance.
        </p>

        {!connectedAddress ? (
          <div className="alert alert-warning">
            <span>Connect your wallet to withdraw.</span>
          </div>
        ) : (
          <div className="card bg-base-200 shadow-lg">
            <div className="card-body gap-4">
              {account && (account[1] as string).length > 0 && (
                <div className="stat bg-base-100 rounded-box">
                  <div className="stat-title">Your balance (decrypted client-side)</div>
                  <div className="stat-value text-2xl">{getDisplayBalance()}</div>
                  <div className="stat-desc">
                    {loadSecretKey(connectedAddress ?? "") ? "Private key loaded" : "⚠ Private key missing"}
                  </div>
                </div>
              )}

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-semibold">Withdraw amount (ETH)</span>
                  <span className="label-text-alt text-base-content/50">min 0.001 ETH</span>
                </label>
                <input
                  type="number"
                  className="input input-bordered w-full"
                  placeholder="0.001"
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
                      Generating STARK proof…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="loading loading-spinner loading-sm" />
                      Submitting transaction…
                    </span>
                  )}
                </div>
              )}

              <button className="btn btn-primary w-full" onClick={handleWithdraw} disabled={step !== "idle"}>
                {step === "idle" ? "Withdraw" : "Processing…"}
              </button>

              <div className="text-sm text-base-content/60 space-y-1">
                <p>• Withdrawal amount is visible on-chain (unavoidable)</p>
                <p>• Remaining balance stays encrypted and private</p>
                <p>• A STARK proof confirms you have sufficient balance</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WithdrawPage;
