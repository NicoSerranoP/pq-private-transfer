"use client";

import { useState } from "react";
import { decrypt, deserializeCiphertext, encrypt, proveTransfer, serializeCiphertext } from "@pq/crypto";
import type { NextPage } from "next";
import { hexToBytes, isAddress } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import {
  useDeployedContractInfo,
  useScaffoldEventHistory,
  useScaffoldReadContract,
  useScaffoldWriteContract,
} from "~~/hooks/scaffold-eth";
import { toBytes32, toHex, weiToUnits } from "~~/utils/pq/amounts";
import { loadSecretKey } from "~~/utils/pq/keyStorage";
import { notification } from "~~/utils/scaffold-eth";

const N = 4; // 1 real recipient + 3 dummies

function makeZeroPolynomial(): bigint[] {
  return new Array<bigint>(1024).fill(0n);
}

const TransferPage: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const [recipientAddress, setRecipientAddress] = useState("");
  const [amountEth, setAmountEth] = useState("0.001");
  const [step, setStep] = useState<"idle" | "proving" | "submitting">("idle");

  const publicClient = usePublicClient();
  const { data: contractInfo } = useDeployedContractInfo({ contractName: "PrivateTransfer" });

  const { data: senderAccount } = useScaffoldReadContract({
    contractName: "PrivateTransfer",
    functionName: "accounts",
    args: [connectedAddress],
  });

  const { data: recipientAccount } = useScaffoldReadContract({
    contractName: "PrivateTransfer",
    functionName: "accounts",
    args: [isAddress(recipientAddress) ? recipientAddress : undefined],
  });

  // Collect all registered addresses from events for dummy selection
  const { data: registeredEvents } = useScaffoldEventHistory({
    contractName: "PrivateTransfer",
    eventName: "Registered",
    fromBlock: 0n,
  });

  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "PrivateTransfer" });

  const handleTransfer = async () => {
    if (!connectedAddress) {
      notification.error("Connect your wallet first");
      return;
    }
    if (!senderAccount || (senderAccount[1] as string).length === 0) {
      notification.error("You are not registered");
      return;
    }
    if (!isAddress(recipientAddress)) {
      notification.error("Invalid recipient address");
      return;
    }
    if (recipientAddress.toLowerCase() === connectedAddress.toLowerCase()) {
      notification.error("Cannot transfer to yourself");
      return;
    }
    if (!recipientAccount || (recipientAccount[1] as string).length === 0) {
      notification.error("Recipient is not registered");
      return;
    }
    if (!publicClient || !contractInfo) {
      notification.error("Contract not loaded");
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

    // Find dummy candidates: registered addresses that are neither sender nor recipient
    const dummyCandidates: string[] = (registeredEvents ?? [])
      .map((e: any) => e.args?.user as string)
      .filter(
        (addr: string) =>
          addr &&
          addr.toLowerCase() !== connectedAddress.toLowerCase() &&
          addr.toLowerCase() !== recipientAddress.toLowerCase(),
      );

    if (dummyCandidates.length < N - 1) {
      notification.error(
        `Need at least ${N - 1} other registered accounts for dummy recipients (found ${dummyCandidates.length})`,
      );
      return;
    }

    const dummyAddresses = dummyCandidates.slice(0, N - 1);

    try {
      setStep("proving");

      // Deserialize sender's encrypted balance and public key
      const encBalanceSender = deserializeCiphertext(hexToBytes(senderAccount[0] as `0x${string}`));
      const pkSender = deserializeCiphertext(hexToBytes(senderAccount[1] as `0x${string}`));

      // Decrypt sender's plaintext balance
      const plainBalance = decrypt(encBalanceSender, sk);

      if (amountUnits > plainBalance) {
        notification.error(
          `Insufficient balance. Have ${plainBalance} units (~${(Number(plainBalance) * 0.001).toFixed(3)} ETH)`,
        );
        setStep("idle");
        return;
      }

      // Deserialize recipient public key
      const pkRecipient = deserializeCiphertext(hexToBytes(recipientAccount[1] as `0x${string}`));

      // Fetch dummy public keys from contract via publicClient.readContract
      const dummyPkBytes = await Promise.all(
        dummyAddresses.map(addr =>
          publicClient.readContract({
            address: contractInfo.address,
            abi: contractInfo.abi,
            functionName: "accounts",
            args: [addr as `0x${string}`],
          }),
        ),
      );
      const dummyPks = dummyPkBytes.map((acc: any) => deserializeCiphertext(hexToBytes(acc[1] as `0x${string}`)));

      // Build recipient list: [real, dummy0, dummy1, dummy2]
      const pks = [pkRecipient, ...dummyPks] as [
        typeof pkRecipient,
        (typeof dummyPks)[0],
        (typeof dummyPks)[1],
        (typeof dummyPks)[2],
      ];
      const allAddresses = [recipientAddress, ...dummyAddresses] as [string, string, string, string];
      const amounts: [bigint, bigint, bigint, bigint] = [amountUnits, 0n, 0n, 0n];
      const total = amountUnits;

      // Encrypt each amount for the respective recipient's pk
      const encBalanceToUpdateReceiver = pks.map((pk, i) => encrypt(amounts[i], pk)) as [
        ReturnType<typeof encrypt>,
        ReturnType<typeof encrypt>,
        ReturnType<typeof encrypt>,
        ReturnType<typeof encrypt>,
      ];

      // Encrypt total under sender's pk
      const encTotal = encrypt(total, pkSender);

      // Generate STARK proof
      const proof = proveTransfer(
        {
          pkB: pkSender,
          pks,
          encBalanceSender,
          encBalanceToUpdateReceiver,
          encTotal,
        },
        {
          pvkB: sk,
          plainBalance,
          amounts,
          total,
          rReceiver: [makeZeroPolynomial(), makeZeroPolynomial(), makeZeroPolynomial(), makeZeroPolynomial()],
          rTotal: makeZeroPolynomial(),
        },
      );

      setStep("submitting");

      await writeContractAsync({
        functionName: "transfer",
        args: [
          allAddresses,
          encBalanceToUpdateReceiver.map(ct => toHex(serializeCiphertext(ct))),
          toHex(serializeCiphertext(encTotal)),
          toBytes32(proof.commitment) as `0x${string}`,
          toHex(proof.inputs),
        ],
      });

      notification.success("Transfer submitted!");
      setRecipientAddress("");
      setAmountEth("0.001");
    } catch (err: any) {
      notification.error(err?.message ?? "Transfer failed");
    } finally {
      setStep("idle");
    }
  };

  return (
    <div className="flex items-center flex-col grow pt-10">
      <div className="px-5 w-full max-w-lg">
        <h1 className="text-center text-4xl font-bold mb-2">Transfer</h1>
        <p className="text-center text-base-content/70 mb-8">
          Send encrypted ETH to a registered address. Three dummy recipients are added automatically for recipient
          anonymity.
        </p>

        {!connectedAddress ? (
          <div className="alert alert-warning">
            <span>Connect your wallet to transfer.</span>
          </div>
        ) : (
          <div className="card bg-base-200 shadow-lg">
            <div className="card-body gap-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-semibold">Recipient address</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered w-full font-mono"
                  placeholder="0x..."
                  value={recipientAddress}
                  onChange={e => setRecipientAddress(e.target.value)}
                  disabled={step !== "idle"}
                />
                {isAddress(recipientAddress) && recipientAccount && (recipientAccount[1] as string).length === 0 && (
                  <label className="label">
                    <span className="label-text-alt text-error">Recipient not registered</span>
                  </label>
                )}
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-semibold">Amount (ETH)</span>
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

              <button className="btn btn-primary w-full" onClick={handleTransfer} disabled={step !== "idle"}>
                {step === "idle" ? "Transfer" : "Processing…"}
              </button>

              <div className="text-sm text-base-content/60 space-y-1">
                <p>• Transfer amount is hidden from on-chain observers</p>
                <p>• 3 dummy recipients are auto-selected for anonymity</p>
                <p>• A STARK proof proves the transfer is valid without revealing amounts</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransferPage;
