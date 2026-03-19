// Ethereum Gas Tracker snapshot (gwei). Update as needed.
export const GAS_TRACKER_GWEI = {
  low: 0.101,
  average: 0.101,
  high: 0.102,
} as const;

// Configure with ETH_USD=xxxx when running tests. Default is a fallback only.
const ETH_USD = Number(process.env.ETH_USD ?? "2310");

export function usdFromGas(gasUsed: bigint, gwei: number): number {
  return Number(gasUsed) * gwei * 1e-9 * ETH_USD;
}

export function formatUsd(usd: number): string {
  return usd < 0.01 ? "<$0.01" : `$${usd.toFixed(4)}`;
}
