import { sepolia } from "viem/chains";

/**
 * Network configuration for Sepolia testnet
 * All components and hooks should use these constants to ensure consistency
 */
export const CHAIN = sepolia;

export const RPC_URL = 
  process.env.NEXT_PUBLIC_RPC_URL || 
  "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161";

// Safe Transaction Service URL
// For direct API calls (our custom safeTxService.ts), include /api/v1
// Old URL: https://safe-transaction-sepolia.safe.global (redirects)
export const SAFE_TX_SERVICE_URL = "https://api.safe.global/tx-service/sep/api/v1";

// Safe API Key (required for api.safe.global domain)
// Get your API key at: https://developer.safe.global
export const SAFE_API_KEY = process.env.NEXT_PUBLIC_SAFE_API_KEY || "";

export const ETHERSCAN_URL = "https://sepolia.etherscan.io";

/**
 * Helper function to get Etherscan transaction URL
 */
export function getEtherscanTxUrl(txHash: string): string {
  return `${ETHERSCAN_URL}/tx/${txHash}`;
}

/**
 * Helper function to get Etherscan address URL
 */
export function getEtherscanAddressUrl(address: string): string {
  return `${ETHERSCAN_URL}/address/${address}`;
}
