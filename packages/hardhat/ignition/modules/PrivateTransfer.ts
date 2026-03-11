import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const PrivateTransferModule = buildModule("PrivateTransferModule", m => {
  const privateTransfer = m.contract("PrivateTransfer");

  return { privateTransfer };
});

export default PrivateTransferModule;
