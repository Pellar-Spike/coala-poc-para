'use client';

import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';
import { useEffect, useState } from 'react';

export function DynamicProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [environmentId, setEnvironmentId] = useState<string | undefined>(undefined);

  useEffect(() => {
    setMounted(true);
    // Get environment ID from process.env on client side
    setEnvironmentId(process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID);
  }, []);

  // Always render provider to avoid "useDynamicContext must be used within a DynamicContextProvider" error
  // Use environmentId if available, otherwise use a placeholder (provider will handle it)
  // This ensures the provider is always available for hooks to use
  const effectiveEnvironmentId = (mounted && environmentId) 
    ? environmentId 
    : (process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || 'placeholder-until-mounted');

  return (
    <DynamicContextProvider
      settings={{
        environmentId: effectiveEnvironmentId,
        walletConnectors: [EthereumWalletConnectors],
      }}
    >
      {children}
    </DynamicContextProvider>
  );
}

