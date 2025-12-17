"use client";

import { useState, useEffect } from "react";
import { useAccount, useWallet } from "@getpara/react-sdk";
import { useViemAccount, useViemClient } from "@getpara/react-sdk/evm";
import { getAddress, isAddress, decodeFunctionData, formatUnits } from "viem";
import SafeApiKit from "@safe-global/api-kit";
import Safe from "@safe-global/protocol-kit";
import { ethers } from "ethers";
import { http } from "viem";
import { CHAIN, RPC_URL, SAFE_TX_SERVICE_URL, SAFE_API_KEY } from "@/config/network";
import { getSafeSdk, createParaProvider } from "@/lib/safeHelpers";
import { useSafeProtocolKit } from "@/hooks/useSafeProtocolKit";
import { 
  getPendingTransactions, 
  confirmTransaction as confirmTx,
  getTransaction as getTx 
} from "@/lib/safeTxService";

// Use Safe Transaction Service response type directly
type SafeTransaction = any; // Use Safe Transaction Service response as-is

export default function PendingTransactions({ safeAddress }: { safeAddress: string }) {
  const { isConnected } = useAccount();
  const { data: wallet } = useWallet();
  const { safeSdk, isLoading, owners, threshold } = useSafeProtocolKit(safeAddress);
  
  const evmWalletAddress = wallet?.type === "EVM" ? (wallet.address as `0x${string}`) : undefined;
  const { viemAccount } = useViemAccount({
    address: evmWalletAddress,
  });
  const { viemClient: walletClient } = useViemClient({
    address: evmWalletAddress,
    walletClientConfig: {
      chain: CHAIN,
      transport: http(RPC_URL),
    },
  });

  const [pendingTxs, setPendingTxs] = useState<SafeTransaction[]>([]);
  const [isSigning, setIsSigning] = useState<string | null>(null);
  const [isLoadingTxs, setIsLoadingTxs] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  // Load pending transactions ONLY from Safe Transaction Service
  const loadPendingTransactions = async () => {
    setIsLoadingTxs(true);
    setError("");
    
    try {
      console.log("🔍 Loading pending transactions for Safe:", safeAddress);
      
      // Use direct API call instead of SafeApiKit
      const pendingTxsResponse = await getPendingTransactions(safeAddress);
      
      console.log("📦 Raw response from Safe TX Service:", pendingTxsResponse);
      console.log("📊 Total transactions:", pendingTxsResponse?.count || 0);
      console.log("📋 Results length:", pendingTxsResponse?.results?.length || 0);
      
      // Use Safe Transaction Service response directly
      if (pendingTxsResponse && pendingTxsResponse.results) {
        // Filter to only show transactions that are not executed
        const pendingOnly = pendingTxsResponse.results.filter((tx: any) => !tx.isExecuted);
        console.log("✅ Pending (not executed) transactions:", pendingOnly.length);
        
        if (pendingOnly.length > 0) {
          console.log("📝 First pending tx:", {
            hash: pendingOnly[0].safeTxHash,
            to: pendingOnly[0].to,
            confirmations: pendingOnly[0].confirmations?.length || 0,
            isExecuted: pendingOnly[0].isExecuted,
          });
        }
        
        setPendingTxs(pendingOnly);
      } else {
        console.log("⚠️ No results in response");
        setPendingTxs([]);
      }
    } catch (err: any) {
      // Use error from Safe Transaction Service directly, no modification
      console.error("❌ Failed to load pending transactions:", err);
      setError(err?.message || err?.toString() || "Failed to load pending transactions");
      setPendingTxs([]);
    } finally {
      setIsLoadingTxs(false);
    }
  };

  useEffect(() => {
    if (safeAddress) {
      loadPendingTransactions();
    }
  }, [safeAddress]);

  const handleSignTransaction = async (tx: SafeTransaction) => {
    if (!viemAccount || !walletClient) {
      setError("Please connect your wallet first");
      return;
    }

    // Check if current wallet is an owner
    const currentAddress = getAddress(viemAccount.address);
    if (!owners.includes(currentAddress)) {
      setError("Your current wallet is not an owner of this Safe");
      return;
    }

    // Check if already signed using Safe Transaction Service data directly
    const confirmations = tx.confirmations || [];
    const hasAlreadySigned = confirmations.some((conf: any) => 
      getAddress(conf.owner).toLowerCase() === currentAddress.toLowerCase()
    );
    
    if (hasAlreadySigned) {
      setError("You have already signed this transaction");
      return;
    }

    setIsSigning(tx.safeTxHash);
    setError("");
    setSuccess("");

    try {
      // Create Para provider from wallet client
      const paraProvider = createParaProvider(walletClient, viemAccount, RPC_URL);
      
      const signer = viemAccount.address;
      
      // Get Safe SDK using Para provider (following Para docs pattern)
      const safeSdkLocal = await getSafeSdk({
        paraProvider,
        safeAddress,
        signerAddress: signer,
      });
      console.log("Signer address:", signer);
      console.log("Signing transaction hash:", tx.safeTxHash);

      // Get transaction data from Safe Transaction Service
      // Note: We'll recreate from tx data instead of fetching again
      const safeTransactionData = tx;
      
      // Recreate the Safe transaction from service data
      const safeTransaction = await safeSdkLocal.createTransaction({
        transactions: [{
          to: safeTransactionData.to as `0x${string}`,
          value: safeTransactionData.value || "0",
          data: safeTransactionData.data as `0x${string}` || "0x",
        }],
      });

      // Verify the transaction hash matches
      const recreatedHash = await safeSdkLocal.getTransactionHash(safeTransaction);
      console.log("Original hash:", tx.safeTxHash);
      console.log("Recreated hash:", recreatedHash);

      // Sign transaction (following Para docs pattern)
      const signedTx = await safeSdkLocal.signTransaction(safeTransaction);
      console.log("Signed transaction:", signedTx);

      // Extract signature from signedTx
      const signaturesMap = signedTx.signatures || new Map();
      let signature = "";
      for (const [addr, sig] of signaturesMap.entries()) {
        const sigValue = typeof sig === 'string' ? sig : (sig as any)?.data || "";
        if (sigValue) {
          signature = sigValue;
          console.log("Found signature for address:", addr, "signature length:", sigValue.length);
          break;
        }
      }

      if (!signature) {
        throw new Error("Failed to extract signature from signed transaction");
      }

      // Confirm transaction with extracted signature using direct API call
      await confirmTx(tx.safeTxHash, signature);
      
      setSuccess("Transaction confirmed! Reloading...");
      
      // Reload from Safe Transaction Service to get latest state
      await loadPendingTransactions();
    } catch (err: any) {
      // Use error from Safe Transaction Service directly
      console.error("Failed to confirm transaction:", err);
      setError(err?.message || err?.toString() || "Failed to confirm transaction");
    } finally {
      setIsSigning(null);
    }
  };

  const handleExecuteTransaction = async (tx: SafeTransaction) => {
    if (!viemAccount || !walletClient) {
      setError("Please connect your wallet first");
      return;
    }

    // Use Safe Transaction Service data directly
    const confirmations = tx.confirmations || [];
    if (confirmations.length < threshold) {
      setError(`Need ${threshold} signatures, but only have ${confirmations.length}`);
      return;
    }

    setIsSigning(tx.safeTxHash);
    setError("");
    setSuccess("");

    try {
      console.log("Executing transaction:", tx.safeTxHash);
      console.log("Confirmations:", confirmations.length, "Threshold:", threshold);
      
      // Get the full transaction data from Safe Transaction Service using custom helper
      const safeTransactionData = await getTx(tx.safeTxHash);
      
      // Create Para provider from wallet client
      const paraProvider = createParaProvider(walletClient, viemAccount, RPC_URL);
      const signer = viemAccount.address;
      console.log("Executor address:", signer);

      // Get Safe SDK using Para provider
      const safeSdkLocal = await getSafeSdk({
        paraProvider,
        safeAddress,
        signerAddress: signer,
      });

      // Recreate transaction from Safe Transaction Service data
      const safeTransaction = await safeSdkLocal.createTransaction({
        transactions: [{
          to: safeTransactionData.to as `0x${string}`,
          value: safeTransactionData.value || "0",
          data: safeTransactionData.data as `0x${string}` || "0x",
        }],
      });
      
      // Add all collected signatures to the transaction
      console.log("Adding signatures from confirmations...");
      for (const confirmation of confirmations) {
        const ownerAddress = getAddress(confirmation.owner);
        const signatureData = confirmation.signature;
        
        if (signatureData) {
          // Add signature to the transaction
          safeTransaction.addSignature({
            signer: ownerAddress,
            data: signatureData,
          } as any);
          console.log("Added signature from:", ownerAddress);
        }
      }
      
      console.log("Total signatures added:", safeTransaction.signatures?.size || 0);
      
      // Execute transaction with all signatures
      const txResponse = await safeSdkLocal.executeTransaction(safeTransaction);
      
      console.log("Transaction executed:", txResponse.hash);
      
      setSuccess(`Transaction executed successfully!\nHash: ${txResponse.hash}`);
      
      // Reload from Safe Transaction Service to get latest state
      await loadPendingTransactions();
    } catch (err: any) {
      // Use error from Safe SDK/Safe Transaction Service directly
      console.error("Failed to execute transaction:", err);
      setError(err?.message || err?.toString() || "Failed to execute transaction");
    } finally {
      setIsSigning(null);
    }
  };

  if (!isConnected) {
    return (
      <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
        ⚠️ Please connect your wallet to sign transactions
      </div>
    );
  }

  if (isLoading || isLoadingTxs) {
    return (
      <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
          <span>Loading pending transactions...</span>
        </div>
      </div>
    );
  }

  if (pendingTxs.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-900/20 dark:text-gray-400">
          No pending transactions. Create a transaction first.
        </div>
        <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          <strong>💡 Lưu ý:</strong> Tất cả data được lấy trực tiếp từ Safe Transaction Service API, 
          không sử dụng localStorage. Data hiển thị là data gốc từ Safe, không bị biến đổi.
        </div>
      </div>
    );
  }

  const currentAddress = viemAccount ? getAddress(viemAccount.address) : null;
  const isOwner = currentAddress && owners.includes(currentAddress);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
          Pending Transactions
        </h2>
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Transactions waiting for signatures. Each owner needs to sign with their wallet.
          </p>
          <button
            onClick={loadPendingTransactions}
            disabled={isLoadingTxs}
            className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🔄 Refresh
          </button>
        </div>
        <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          <strong>📝 Cách ký transaction:</strong>
          <ol className="list-decimal list-inside mt-1 space-y-1">
            <li>Đảm bảo bạn đã connect với wallet là owner của Safe</li>
            <li>Click nút <strong>"✍️ Sign Transaction"</strong> bên dưới transaction</li>
            <li>Xác nhận ký trong Para wallet popup</li>
            <li>Sau khi đủ signatures, click <strong>"🚀 Execute Transaction"</strong> để execute</li>
          </ol>
        </div>
        {currentAddress && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Current wallet: {currentAddress.slice(0, 6)}...{currentAddress.slice(-4)}
            {isOwner ? " ✅ (Owner)" : " ❌ (Not an owner)"}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {pendingTxs.map((tx) => {
          // Use Safe Transaction Service data directly - no transformation
          const confirmations = tx.confirmations || [];
          const confirmationsCount = confirmations.length;
          
          // Check if current wallet has signed using Safe Transaction Service data
          const hasSigned = currentAddress 
            ? confirmations.some((conf: any) => 
                getAddress(conf.owner).toLowerCase() === currentAddress.toLowerCase()
              )
            : false;
          
          const canSign = isOwner && !hasSigned; // Can sign if owner and hasn't signed yet
          const canExecute = confirmationsCount >= threshold; // Use confirmations count from Safe Transaction Service

          // Decode transaction data to get token transfer details
          let decodedData: { recipient: string; amount: string } | null = null;
          if (tx.data && tx.data !== "0x") {
            try {
              const decoded = decodeFunctionData({
                abi: [
                  {
                    name: "transfer",
                    type: "function",
                    inputs: [
                      { name: "recipient", type: "address" },
                      { name: "amount", type: "uint256" }
                    ],
                    outputs: [{ name: "", type: "bool" }],
                    stateMutability: "nonpayable"
                  }
                ],
                data: tx.data as `0x${string}`,
              });
              
              if (decoded.functionName === "transfer" && decoded.args) {
                const [recipient, amount] = decoded.args as [string, bigint];
                decodedData = {
                  recipient,
                  amount: formatUnits(amount, 6), // USDC has 6 decimals
                };
              }
            } catch (e) {
              // Not an ERC20 transfer, ignore
              console.log("Could not decode transaction data:", e);
            }
          }

          return (
            <div
              key={tx.safeTxHash}
              className="flex flex-col gap-3 p-4 border border-black/[.08] dark:border-white/[.145] rounded-lg"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Transaction</span>
                  <span className="text-xs text-zinc-500">
                    {confirmationsCount} / {threshold} signatures
                    {confirmationsCount >= threshold && " ✅"}
                  </span>
                </div>
                <div className="text-xs font-mono break-all space-y-1">
                  <p><strong>Safe Tx Hash:</strong> {tx.safeTxHash}</p>
                  {decodedData ? (
                    <>
                      <p><strong>Type:</strong> Token Transfer</p>
                      <p><strong>Amount:</strong> {decodedData.amount} USDC</p>
                      <p><strong>Recipient:</strong> {decodedData.recipient}</p>
                      <p><strong>Token:</strong> {tx.to}</p>
                    </>
                  ) : (
                    <>
                      <p><strong>To:</strong> {tx.to}</p>
                      <p><strong>Value:</strong> {tx.value || "0"} ETH</p>
                    </>
                  )}
                  <p><strong>Created:</strong> {tx.submissionDate ? new Date(tx.submissionDate).toLocaleString() : tx.created ? new Date(tx.created).toLocaleString() : "N/A"}</p>
                </div>
              </div>

              <div className="flex gap-2">
                {canSign && (
                  <button
                    onClick={() => handleSignTransaction(tx)}
                    disabled={isSigning === tx.safeTxHash}
                    className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    {isSigning === tx.safeTxHash ? "Signing..." : "✍️ Sign Transaction"}
                  </button>
                )}
                {hasSigned && (
                  <div className="flex-1 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm text-center">
                    ✅ You have signed
                  </div>
                )}
                {canExecute && (
                  <button
                    onClick={() => handleExecuteTransaction(tx)}
                    disabled={isSigning === tx.safeTxHash}
                    className="flex-1 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    {isSigning === tx.safeTxHash ? "Executing..." : "🚀 Execute Transaction"}
                  </button>
                )}
              </div>

              {!isOwner && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400">
                  ⚠️ Switch to an owner wallet to sign this transaction
                </p>
              )}
              
              {isOwner && !canSign && !hasSigned && (
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  ℹ️ Connect with a different owner wallet to sign
                </p>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 dark:bg-green-900/20 dark:text-green-400">
          {success}
        </div>
      )}
    </div>
  );
}
