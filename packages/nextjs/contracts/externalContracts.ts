import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";

/**
 * @example
 * const externalContracts = {
 *   1: {
 *     DAI: {
 *       address: "0x...",
 *       abi: [...],
 *     },
 *   },
 * } as const;
 */
const externalContracts = {
	31337: {
		SE2Token: {
			// Replace with your deployed SE2Token address when available.
			address: "0x0000000000000000000000000000000000000000",
			abi: [
				{
					inputs: [
						{
							internalType: "address",
							name: "account",
							type: "address",
						},
					],
					name: "balanceOf",
					outputs: [
						{
							internalType: "uint256",
							name: "",
							type: "uint256",
						},
					],
					stateMutability: "view",
					type: "function",
				},
				{
					inputs: [],
					name: "totalSupply",
					outputs: [
						{
							internalType: "uint256",
							name: "",
							type: "uint256",
						},
					],
					stateMutability: "view",
					type: "function",
				},
				{
					inputs: [
						{
							internalType: "address",
							name: "to",
							type: "address",
						},
						{
							internalType: "uint256",
							name: "amount",
							type: "uint256",
						},
					],
					name: "mint",
					outputs: [],
					stateMutability: "nonpayable",
					type: "function",
				},
				{
					inputs: [
						{
							internalType: "address",
							name: "to",
							type: "address",
						},
						{
							internalType: "uint256",
							name: "amount",
							type: "uint256",
						},
					],
					name: "transfer",
					outputs: [
						{
							internalType: "bool",
							name: "",
							type: "bool",
						},
					],
					stateMutability: "nonpayable",
					type: "function",
				},
			],
		},
	},
} as const;

export default externalContracts satisfies GenericContractsDeclaration;
