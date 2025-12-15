'use client';

import { useState } from 'react';
import { useDynamicContext, useDynamicWaas } from '@dynamic-labs/sdk-react-core';
import { ChainEnum } from '@dynamic-labs/sdk-api-core';

interface CreateWalletClientProps {
  dynamicVaultId: string;
  email: string;
  walletName?: string;
  onSuccess?: (walletAddress: string) => void;
  onError?: (error: string) => void;
}

export function CreateWalletClient({
  dynamicVaultId,
  email,
  walletName,
  onSuccess,
  onError,
}: CreateWalletClientProps) {
  const context = useDynamicContext();
  const user = context?.user;
  const primaryWallet = (context as any)?.primaryWallet;
  const isAuthenticated = (context as any)?.isAuthenticated as boolean | undefined;
  const setShowAuthFlow = context?.setShowAuthFlow;
  const { createWalletAccount, getWaasWallets } = useDynamicWaas();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if user is authenticated
  const isUserAuthenticated = (isAuthenticated === true || (user !== null && user !== undefined)) && user !== null && user !== undefined;

  const handleCreateWallet = async () => {
    setLoading(true);
    setError(null);

    try {
      // Check if user is authenticated
      if (!isUserAuthenticated) {
        // Try to trigger auth flow
        if (setShowAuthFlow) {
          setShowAuthFlow(true);
          throw new Error('Please login first. Authentication flow will open.');
        }
        throw new Error('User not authenticated. Please login via Dynamic Labs first.');
      }

      // Check if createWalletAccount is available
      if (!createWalletAccount) {
        throw new Error('createWalletAccount is not available. Please check Dynamic WaaS configuration in Dashboard.');
      }

      // Use useDynamicWaas hook to create v3 wallet (TSS-MPC)
      // Docs: https://www.dynamic.xyz/docs/wallets/embedded-wallets/mpc/upgrade-guide#users-without-assets
      console.log('Calling createWalletAccount from useDynamicWaas...');
      const result = await createWalletAccount([ChainEnum.Evm]);

      console.log('Wallet creation result:', result);

      // Wait a bit for context to update after wallet creation
      await new Promise(resolve => setTimeout(resolve, 500));

      // Extract wallet address from result
      let walletAddress: string | null = null;

      // 1. Try to get from getWaasWallets() - returns only v3 wallets
      if (getWaasWallets) {
        const v3Wallets = getWaasWallets();
        if (v3Wallets && Array.isArray(v3Wallets) && v3Wallets.length > 0) {
          // Get the last wallet (newest one)
          const newestWallet = v3Wallets[v3Wallets.length - 1] as any;
          // Wallet type has accountAddress property
          walletAddress = newestWallet?.accountAddress ||
                         newestWallet?.address ||
                         newestWallet?.publicKeyHex ||
                         newestWallet?.publicKey;
        }
      }

      // 2. From result directly (result is an array of wallet accounts)
      if (!walletAddress && result) {
        if (Array.isArray(result) && result.length > 0) {
          const newestAccount = result[result.length - 1] as any;
          walletAddress = newestAccount?.accountAddress ||
                         newestAccount?.address ||
                         newestAccount?.publicKeyHex ||
                         newestAccount?.publicKey;
        } else if (typeof result === 'object') {
          const resultObj = result as any;
          walletAddress = resultObj?.accountAddress ||
                         resultObj?.address ||
                         resultObj?.publicKeyHex ||
                         resultObj?.publicKey;
        }
      }

      // 3. From primaryWallet (after context update)
      if (!walletAddress && primaryWallet) {
        const updatedPrimaryWallet = primaryWallet as any;
        walletAddress = updatedPrimaryWallet?.address || 
                       updatedPrimaryWallet?.publicKey ||
                       updatedPrimaryWallet?.accountAddress ||
                       updatedPrimaryWallet?.wallet?.address ||
                       updatedPrimaryWallet?.wallet?.publicKey;
      }

      // 4. From user.wallets (after context update)
      if (!walletAddress && user) {
        const userWallets = (user as any)?.wallets;
        if (userWallets && Array.isArray(userWallets) && userWallets.length > 0) {
          // Get the last wallet (newest one)
          const newestWallet = userWallets[userWallets.length - 1];
          walletAddress = newestWallet?.address || 
                         newestWallet?.publicKey ||
                         newestWallet?.accountAddress;
        }
      }

      if (!walletAddress) {
        // Log full result for debugging
        console.error('Could not extract wallet address. Result:', JSON.stringify(result, null, 2));
        console.error('V3 Wallets:', getWaasWallets ? getWaasWallets() : 'getWaasWallets not available');
        console.error('User object:', JSON.stringify(user, null, 2));
        console.error('Primary wallet:', JSON.stringify(primaryWallet, null, 2));
        throw new Error('Wallet created but no address could be extracted. Check console for details.');
      }

      if (onSuccess) {
        onSuccess(walletAddress);
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to create wallet';
      setError(errorMessage);
      console.error('Client-side wallet creation error:', err);
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {!isUserAuthenticated && (
        <div style={{ 
          padding: '0.75rem', 
          background: '#fff3cd', 
          border: '1px solid #ffc107', 
          borderRadius: '4px',
          marginBottom: '0.5rem',
          fontSize: '0.875rem'
        }}>
          ⚠️ You need to login with email <strong>{email}</strong> (email used to create vault) before creating wallet.
          {setShowAuthFlow && (
            <button
              onClick={() => setShowAuthFlow(true)}
              style={{
                marginLeft: '0.5rem',
                padding: '0.25rem 0.5rem',
                background: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              Login with {email}
            </button>
          )}
        </div>
      )}
      <button
        onClick={handleCreateWallet}
        disabled={loading || !isUserAuthenticated}
        className="btn btn-primary"
        style={{ 
          marginTop: '0.5rem',
          opacity: (loading || !isUserAuthenticated) ? 0.6 : 1,
          cursor: (loading || !isUserAuthenticated) ? 'not-allowed' : 'pointer'
        }}
      >
        {loading ? 'Creating...' : 'Create Wallet (Client-side SDK)'}
      </button>
      {error && (
        <div style={{ 
          color: 'red', 
          marginTop: '0.5rem', 
          fontSize: '0.875rem',
          padding: '0.75rem',
          background: '#ffebee',
          border: '1px solid #f44336',
          borderRadius: '4px'
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
