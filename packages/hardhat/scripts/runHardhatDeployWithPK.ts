import "dotenv/config";
import { Wallet } from "ethers";
import password from "@inquirer/password";
import { spawn } from "child_process";
import { createRequire } from "module";
import { dirname, join } from "path";
import generateTsAbis from "./generateTsAbis.js";

const IGNITION_MODULE = "ignition/modules/PrivateTransfer.ts";
const require = createRequire(import.meta.url);
const HARDHAT_CLI_PATH = join(dirname(require.resolve("hardhat")), "cli.js");

/**
 * Unencrypts the private key (if needed) and runs `hardhat ignition deploy`,
 * then generates the TypeScript ABI definitions for the frontend.
 */
async function runDeploy(extraArgs: string[]) {
  return new Promise<void>((resolve, reject) => {
    const hardhat = spawn(process.execPath, [HARDHAT_CLI_PATH, "ignition", "deploy", IGNITION_MODULE, ...extraArgs], {
      stdio: "inherit",
      env: process.env,
    });

    hardhat.on("error", reject);

    hardhat.on("exit", async code => {
      if (code !== 0) {
        reject(new Error(`hardhat ignition deploy exited with code ${code}`));
        return;
      }
      try {
        await generateTsAbis();
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function main() {
  const networkIndex = process.argv.indexOf("--network");
  const networkName = networkIndex !== -1 ? process.argv[networkIndex + 1] : "localhost";
  const extraArgs = process.argv.slice(2);

  if (networkName === "localhost" || networkName === "hardhat") {
    await runDeploy(extraArgs);
    return;
  }

  const encryptedKey = process.env.DEPLOYER_PRIVATE_KEY_ENCRYPTED;

  if (!encryptedKey) {
    console.log("🚫️ You don't have a deployer account. Run `pnpm generate` or `pnpm account:import` first");
    process.exit(1);
  }

  const pass = await password({ message: "Enter password to decrypt private key:" });

  try {
    const wallet = await Wallet.fromEncryptedJson(encryptedKey, pass);
    process.env.__RUNTIME_DEPLOYER_PRIVATE_KEY = wallet.privateKey;
    await runDeploy(extraArgs);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {
    console.error("Failed to decrypt private key. Wrong password?");
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
