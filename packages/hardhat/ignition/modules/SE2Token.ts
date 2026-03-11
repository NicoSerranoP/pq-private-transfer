import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const SE2TokenModule = buildModule("SE2TokenModule", m => {
  const se2Token = m.contract("SE2Token");

  return { se2Token };
});

export default SE2TokenModule;
