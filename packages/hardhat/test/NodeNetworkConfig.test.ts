import { expect } from "chai";
import config from "../hardhat.config.js";

type SimulatedNetworkConfig = {
  type: "edr-simulated";
  hardfork?: string;
  forking?: {
    enabled: boolean;
    url: string;
  };
};

function isSimulatedNetworkConfig(value: unknown): value is SimulatedNetworkConfig {
  return typeof value === "object" && value !== null && "type" in value && value.type === "edr-simulated";
}

describe("Hardhat node network config", function () {
  it("pins the JSON-RPC node network to Prague", function () {
    const nodeNetwork = config.networks?.node;

    expect(isSimulatedNetworkConfig(nodeNetwork)).to.equal(true);
    if (!isSimulatedNetworkConfig(nodeNetwork)) {
      throw new Error("node network must be edr-simulated");
    }

    expect(nodeNetwork).to.include({
      type: "edr-simulated",
      hardfork: "prague",
    });
  });

  it("keeps localhost node and default simulated network settings aligned", function () {
    const defaultNetwork = config.networks?.default;
    const nodeNetwork = config.networks?.node;

    expect(isSimulatedNetworkConfig(defaultNetwork)).to.equal(true);
    expect(isSimulatedNetworkConfig(nodeNetwork)).to.equal(true);
    if (!isSimulatedNetworkConfig(defaultNetwork) || !isSimulatedNetworkConfig(nodeNetwork)) {
      throw new Error("default and node networks must be edr-simulated");
    }

    expect(nodeNetwork).to.include({
      type: defaultNetwork.type,
      hardfork: defaultNetwork.hardfork,
    });
    expect(nodeNetwork.forking).to.deep.equal(defaultNetwork.forking);
  });
});
