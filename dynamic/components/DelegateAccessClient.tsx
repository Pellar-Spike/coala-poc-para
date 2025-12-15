'use client';

import { useState, useEffect } from 'react';
import { useDynamicContext, useWalletDelegation } from '@dynamic-labs/sdk-react-core';

interface DelegateAccessClientProps {
  walletId: string; // Dynamic Labs wallet ID
  delegateEmail: string;
  webhookUrl?: string; // Webhook URL for receiving delegation materials
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

/**
 * Client-side component to trigger delegation using Dynamic Labs SDK
 * Docs: https://www.dynamic.xyz/docs/wallets/embedded-wallets/mpc/delegated-access/triggering-delegation
 * 
 * Uses useWalletDelegation hook to trigger delegation flow
 */
export function DelegateAccessClient({
  walletId,
  delegateEmail,
  webhookUrl,
  onSuccess,
  onError,
}: DelegateAccessClientProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const context = useDynamicContext();
  const user = context?.user;
  const isAuthenticated = (context as any)?.isAuthenticated || (user !== null && user !== undefined);

  // Use useWalletDelegation hook from SDK
  // This hook is available in @dynamic-labs/sdk-react-core v4.49.0+
  // Hook must be called at top level, not inside try-catch
  const walletDelegation = useWalletDelegation();
  
  // Log hook info for debugging
  useEffect(() => {
    console.log('✅ useWalletDelegation hook loaded:', {
      hasInitDelegationProcess: typeof walletDelegation?.initDelegationProcess === 'function',
      hasDelegateKeyShares: typeof walletDelegation?.delegateKeyShares === 'function',
      hasShouldPrompt: typeof walletDelegation?.shouldPromptWalletDelegation === 'function',
      delegatedAccessEnabled: walletDelegation?.delegatedAccessEnabled,
      requiresDelegation: walletDelegation?.requiresDelegation,
      shouldPrompt: walletDelegation?.shouldPromptWalletDelegation ? walletDelegation.shouldPromptWalletDelegation() : undefined,
      walletsDelegatedStatus: walletDelegation?.getWalletsDelegatedStatus ? walletDelegation.getWalletsDelegatedStatus() : undefined,
      allMethods: Object.keys(walletDelegation || {}),
    });
    
    if (walletDelegation?.delegatedAccessEnabled === false) {
      console.warn('⚠️ Delegated Access is disabled in Dynamic Labs Dashboard');
    } else if (walletDelegation?.delegatedAccessEnabled === true) {
      console.log('✅ Delegated Access is enabled in Dynamic Labs Dashboard');
    }
    
    // Check if there are wallets that need delegation
    if (walletDelegation?.getWalletsDelegatedStatus) {
      const walletsStatus = walletDelegation.getWalletsDelegatedStatus();
      console.log('📋 Wallets delegation status:', walletsStatus);
    }
  }, [walletDelegation]);

  // Log primaryWallet info for debugging
  useEffect(() => {
    const primaryWallet = (context as any)?.primaryWallet;
    if (primaryWallet) {
      console.log('🔍 Primary Wallet Info:', {
        id: primaryWallet.id,
        address: primaryWallet.address,
        availableMethods: Object.keys(primaryWallet).filter(key => typeof primaryWallet[key] === 'function'),
        delegationMethods: Object.keys(primaryWallet).filter(key => 
          typeof primaryWallet[key] === 'function' && 
          key.toLowerCase().includes('delegat')
        ),
      });
    }
  }, [context]);

  // Get webhook URL from environment or use default
  // Priority: 1. webhookUrl prop, 2. NEXT_PUBLIC_APP_URL env, 3. window.location.origin
  const effectiveWebhookUrl = webhookUrl || 
    (typeof window !== 'undefined' 
      ? (process.env.NEXT_PUBLIC_APP_URL 
          ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/delegation`
          : `${window.location.origin}/api/webhooks/delegation`)
      : '/api/webhooks/delegation');
  
  console.log('🔗 Webhook URL for delegation:', effectiveWebhookUrl);

  const handleTriggerDelegation = async () => {
    setLoading(true);
    setError(null);

    try {
      if (!isAuthenticated || !user) {
        throw new Error('Please login with Dynamic Labs first to trigger delegation.');
      }

      // Validate delegateEmail if provided (optional - can be entered in modal)
      if (delegateEmail && delegateEmail.trim() !== '') {
        // Validate email format if provided
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(delegateEmail)) {
          throw new Error('Invalid delegate email format. Please provide a valid email address.');
        }
      }

      // Get primary wallet from context
      const primaryWallet = (context as any)?.primaryWallet;
      if (!primaryWallet) {
        throw new Error('No primary wallet found. Please ensure you have a wallet connected.');
      }

      // Create pending delegation record BEFORE triggering delegation
      // This helps webhook handler find the correct delegateEmail
      // Use walletId from props, or fallback to primaryWallet.id
      const effectiveWalletId = walletId || primaryWallet.id;
      const effectiveUserId = (user as any)?.userId || (user as any)?.id || (context as any)?.userId;
      
      // Create pending delegation record if delegateEmail is provided (optional)
      // If delegateEmail is not provided, user will enter it in the modal
      if (effectiveWalletId && delegateEmail && delegateEmail.trim() !== '') {
        try {
          console.log('📝 Creating pending delegation record for webhook matching...', {
            walletId: effectiveWalletId,
            userId: effectiveUserId,
            delegateEmail,
          });
          
          // Call API to create pending record
          const pendingRes = await fetch(`/api/vaults/${effectiveUserId || 'unknown'}/delegate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              delegateEmail: delegateEmail,
              walletId: effectiveWalletId,
            }),
          });
          
          if (pendingRes.ok) {
            console.log('✅ Pending delegation record created successfully');
          } else {
            const errorText = await pendingRes.text();
            console.warn('⚠️ Failed to create pending record (non-critical):', errorText);
            // Don't throw error - this is optional, user can enter email in modal
          }
        } catch (pendingError: any) {
          // Non-critical error - user can still proceed and enter email in modal
          console.warn('⚠️ Failed to create pending delegation record (non-critical):', pendingError.message);
        }
      } else {
        console.log('ℹ️ Delegate email not provided - user will enter it in the delegation modal');
      }

      // Wait a bit for SDK to be fully ready (fixes first-time errors)
      // SDK might need time to sync with Dashboard config and initialize
      console.log('⏳ Waiting for SDK to be ready...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // Wait a bit for SDK to be fully ready (fixes first-time errors)
      // SDK might need time to sync with Dashboard config
      await new Promise(resolve => setTimeout(resolve, 500));

      let delegationResult: any = null;
      let methodUsed = '';

      // Method 1: Try useWalletDelegation hook (preferred method according to docs)
      // Docs: https://www.dynamic.xyz/docs/react-sdk/hooks/embedded-wallets/usewalletdelegation
      // According to SDK types, initDelegationProcess accepts: { wallets?: Wallet[] }
      // It will open a modal for user to select wallets and delegate
      if (walletDelegation) {
        try {
          // Check delegated access status
          // Note: delegatedAccessEnabled might be undefined initially, or false due to SDK sync delay
          // We'll log it but not block the flow - let SDK handle the check
          console.log('🔍 Delegated Access Status:', {
            delegatedAccessEnabled: walletDelegation.delegatedAccessEnabled,
            requiresDelegation: walletDelegation.requiresDelegation,
            shouldPrompt: walletDelegation.shouldPromptWalletDelegation ? walletDelegation.shouldPromptWalletDelegation() : undefined,
          });
          
          // Only throw error if explicitly false AND we're sure it's not a sync issue
          // If undefined, SDK might still work - let it try
          if (walletDelegation.delegatedAccessEnabled === false) {
            console.warn('⚠️ delegatedAccessEnabled is false, but trying anyway (might be SDK sync delay)');
            // Don't throw error - let SDK handle it
            // The SDK will show appropriate error if delegation is truly disabled
          }

          // Check if initDelegationProcess is available
          if (typeof walletDelegation.initDelegationProcess === 'function') {
            methodUsed = 'useWalletDelegation.initDelegationProcess';
            console.log('🚀 Using useWalletDelegation.initDelegationProcess method');
            
            // Get all wallets from context (needed to enable approve button)
            const primaryWallet = (context as any)?.primaryWallet;
            // Try multiple ways to get wallets from context
            const allWallets = (context as any)?.userWallets 
              || (context as any)?.wallets 
              || (context as any)?.user?.wallets
              || [];
            const wallets = allWallets.length > 0 ? allWallets : (primaryWallet ? [primaryWallet] : []);
            
            console.log('📋 Available wallets:', {
              primaryWallet: primaryWallet ? { id: primaryWallet.id, address: primaryWallet.address } : null,
              allWalletsCount: allWallets.length,
              walletsToUse: wallets.length,
              walletDetails: wallets.map((w: any) => ({ id: w.id, address: w.address, connector: w.connector?.name })),
            });
            
            // Check wallet delegation status
            let walletsToDelegate: any[] = [];
            if (walletDelegation.getWalletsToDelegate && walletDelegation.getWalletsDelegatedStatus) {
              try {
                const walletsStatus = walletDelegation.getWalletsDelegatedStatus();
                console.log('📋 Current wallets delegation status:', walletsStatus);
                
                if (wallets.length > 0) {
                  // Get wallets that need delegation
                  walletsToDelegate = walletDelegation.getWalletsToDelegate(wallets, walletDelegation.getWalletsDelegatedStatus);
                  console.log('📋 Wallets to delegate (from SDK):', walletsToDelegate.length);
                }
              } catch (statusError: any) {
                console.warn('⚠️ Error getting wallets delegation status:', statusError.message);
              }
            }
            
            // Use wallets that need delegation, or all wallets if none found
            const finalWallets = walletsToDelegate.length > 0 ? walletsToDelegate : wallets;
            
            console.log('🎯 Final wallets to pass:', {
              count: finalWallets.length,
              wallets: finalWallets.map((w: any) => ({ 
                id: w.id, 
                address: w.address,
                connector: w.connector?.name,
                status: w.status 
              })),
            });
            
            // Wait a bit more to ensure SDK is fully ready
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Try calling with wallets (needed to enable approve button)
            // If it fails, fallback to without wallets
            try {
              if (finalWallets.length > 0) {
                console.log('📤 Calling initDelegationProcess WITH wallets (to enable approve button)...');
                await walletDelegation.initDelegationProcess({ wallets: finalWallets });
                delegationResult = { success: true, message: 'Delegation modal opened with wallets' };
                console.log('✅ initDelegationProcess completed with wallets - modal should be open');
              } else {
                console.log('⚠️ No wallets available, calling without wallets...');
                await walletDelegation.initDelegationProcess();
                delegationResult = { success: true, message: 'Delegation modal opened' };
                console.log('✅ initDelegationProcess completed - modal should be open');
              }
            } catch (firstError: any) {
              console.warn('⚠️ First attempt failed:', firstError.message);
              
              // If error is about clientThreshold or wallets, try without wallets
              if (firstError.message?.includes('clientThreshold') || firstError.message?.includes('wallet')) {
                console.log('⚠️ Wallet-related error, trying without wallets...');
                await new Promise(resolve => setTimeout(resolve, 500));
                try {
                  await walletDelegation.initDelegationProcess();
                  delegationResult = { success: true, message: 'Delegation modal opened (fallback without wallets)' };
                  console.log('✅ initDelegationProcess completed without wallets - modal should be open');
                } catch (fallbackError: any) {
                  console.error('❌ Fallback also failed:', fallbackError);
                  throw fallbackError;
                }
              } else {
                // Other errors - wait and retry with same approach
                console.log('⏳ Waiting 1 second and retrying...');
                await new Promise(resolve => setTimeout(resolve, 1000));
                try {
                  if (finalWallets.length > 0) {
                    await walletDelegation.initDelegationProcess({ wallets: finalWallets });
                  } else {
                    await walletDelegation.initDelegationProcess();
                  }
                  delegationResult = { success: true, message: 'Delegation modal opened (after retry)' };
                  console.log('✅ initDelegationProcess completed after retry - modal should be open');
                } catch (retryError: any) {
                  console.error('❌ Retry also failed:', retryError);
                  throw retryError;
                }
              }
            }
          } else if (typeof walletDelegation.delegateKeyShares === 'function') {
            // Alternative method: delegateKeyShares
            // This requires specific wallet format: { chainName: ChainEnum, accountAddress: string }
            methodUsed = 'useWalletDelegation.delegateKeyShares';
            console.log('Using useWalletDelegation.delegateKeyShares method');
            
            // Get primary wallet address
            const primaryWallet = (context as any)?.primaryWallet;
            if (primaryWallet && primaryWallet.address) {
              // delegateKeyShares requires wallets in specific format
              await walletDelegation.delegateKeyShares([{
                chainName: 'EVM' as any, // ChainEnum.EVM
                accountAddress: primaryWallet.address,
              }]);
              delegationResult = { success: true, message: 'Delegation initiated via delegateKeyShares' };
            } else {
              throw new Error('No primary wallet address found for delegateKeyShares');
            }
          }
        } catch (e: any) {
          console.warn('useWalletDelegation methods failed:', e);
          throw e; // Re-throw to be caught by outer catch
        }
      }
      
      // Method 2: Try primaryWallet.delegateAccess or similar methods
      if (!delegationResult && primaryWallet) {
        // Check for various possible method names on primaryWallet
        const walletMethods = [
          'delegateAccess',
          'initDelegation',
          'delegate',
          'startDelegation',
        ];

        for (const methodName of walletMethods) {
          if (typeof primaryWallet[methodName] === 'function') {
            try {
              methodUsed = `primaryWallet.${methodName}`;
              console.log(`Using primaryWallet.${methodName} method`);
              
              // Try with parameters
              try {
                delegationResult = await primaryWallet[methodName]({
                  walletId,
                  delegateEmail,
                  webhookUrl: effectiveWebhookUrl,
                });
                break; // Success, exit loop
              } catch (e: any) {
                // Try without parameters
                try {
                  delegationResult = await primaryWallet[methodName]();
                  break; // Success, exit loop
                } catch (e2: any) {
                  console.warn(`primaryWallet.${methodName} failed:`, e2);
                }
              }
            } catch (e: any) {
              console.warn(`Error calling primaryWallet.${methodName}:`, e);
            }
          }
        }
      }

      // Method 3: Try context methods
      if (!delegationResult && context) {
        const contextMethods = ['initDelegationProcess', 'delegateAccess', 'delegate'];
        for (const methodName of contextMethods) {
          if (typeof (context as any)[methodName] === 'function') {
            try {
              methodUsed = `context.${methodName}`;
              console.log(`Using context.${methodName} method`);
              delegationResult = await (context as any)[methodName]({
                walletId,
                delegateEmail,
                webhookUrl: effectiveWebhookUrl,
              });
              break;
            } catch (e: any) {
              console.warn(`context.${methodName} failed:`, e);
            }
          }
        }
      }

      // If no method worked, provide detailed error and instructions
      if (!delegationResult) {
        const availableMethods: string[] = [];
        if (walletDelegation) {
          if (typeof walletDelegation.initDelegationProcess === 'function') availableMethods.push('useWalletDelegation.initDelegationProcess');
          if (typeof walletDelegation.delegateKeyShares === 'function') availableMethods.push('useWalletDelegation.delegateKeyShares');
          // Log all available methods for debugging
          console.log('Available walletDelegation methods:', Object.keys(walletDelegation || {}));
        }
        if (primaryWallet) {
          const delegationMethods = Object.keys(primaryWallet).filter(key => 
            typeof primaryWallet[key] === 'function' && key.toLowerCase().includes('delegat')
          );
          availableMethods.push(...delegationMethods.map(m => `primaryWallet.${m}`));
          console.log('Available primaryWallet methods:', Object.keys(primaryWallet));
          console.log('Delegation-related methods:', delegationMethods);
        }
        
        // Check if SDK version might be the issue
        const sdkVersion = (window as any).__DYNAMIC_SDK_VERSION__ || 'unknown';
        console.log('Dynamic Labs SDK version:', sdkVersion);
        
        throw new Error(
          `No methods found to trigger delegation in SDK.\n\n` +
          `Available methods: ${availableMethods.length > 0 ? availableMethods.join(', ') : 'none'}\n\n` +
          `Solutions:\n` +
          `1. ✅ Ensure Delegated Access is enabled in Dynamic Labs Dashboard\n` +
          `2. ✅ Ensure you are logged in with wallet owner (email that owns the wallet)\n` +
          `3. ✅ Update @dynamic-labs/sdk-react-core to the latest version\n` +
          `4. ✅ Refresh page and login again with Dynamic Labs\n` +
          `5. ✅ Check browser console to see available SDK methods\n\n` +
          `Docs: https://www.dynamic.xyz/docs/wallets/embedded-wallets/mpc/delegated-access/triggering-delegation`
        );
      }

      console.log('✅ Delegation triggered successfully:', {
        method: methodUsed,
        result: delegationResult,
      });
      
      // Note: initDelegationProcess opens a modal, but doesn't return immediately
      // The actual delegation happens when user completes the modal flow
      // Webhook will be sent when delegate user approves
      // We should show a message that delegation is in progress
      
      if (onSuccess) {
        onSuccess();
      }
      
      // Show info message about next steps
      console.log('ℹ️ Delegation flow started. Next steps:');
      console.log('1. Complete the modal flow (select wallets, enter delegate email)');
      console.log('2. Delegate user will receive request');
      console.log('3. Delegate user approves delegation');
      console.log('4. Webhook will be sent to server');
      console.log('5. Check "Delegated Accesses" section after webhook is received');
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to trigger delegation';
      console.error('❌ Delegation error:', err);
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div style={{
        padding: '0.75rem',
        background: '#fff3cd',
        border: '1px solid #ffc107',
        borderRadius: '4px',
        fontSize: '0.875rem',
        color: '#856404'
      }}>
        ⚠️ Please login with Dynamic Labs first (as the wallet owner) to trigger delegation.
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={handleTriggerDelegation}
        disabled={loading || !walletId}
        style={{
          padding: '0.75rem 1.5rem',
          background: loading ? '#ccc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '1rem',
          fontWeight: 'bold',
          boxShadow: loading ? 'none' : '0 4px 6px rgba(0,0,0,0.2)',
          transition: 'all 0.3s ease',
          width: '100%',
        }}
        onMouseEnter={(e) => {
          if (!loading) {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.3)';
          }
        }}
        onMouseLeave={(e) => {
          if (!loading) {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.2)';
          }
        }}
      >
        {loading ? '⏳ Đang trigger delegation với Dynamic Labs...' : '🚀 Trigger Delegation với Dynamic Labs'}
      </button>
      {error && (
        <div style={{
          marginTop: '0.75rem',
          padding: '1rem',
          background: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: '4px',
          color: '#721c24',
          fontSize: '0.875rem',
          whiteSpace: 'pre-line',
        }}>
          <strong>❌ Lỗi:</strong>
          <div style={{ marginTop: '0.5rem' }}>{error}</div>
          <div style={{ 
            marginTop: '0.75rem', 
            padding: '0.75rem', 
            background: '#fff3cd', 
            borderRadius: '4px',
            fontSize: '0.8125rem',
            color: '#856404'
          }}>
            <strong>💡 Suggestions:</strong>
            <ul style={{ margin: '0.5rem 0 0 1.5rem', padding: 0 }}>
              <li>Open browser console (F12) to view detailed logs</li>
              <li>Check if SDK methods are available</li>
              <li>Try refreshing the page and login again with Dynamic Labs</li>
              <li>Ensure Delegated Access is enabled in Dashboard</li>
            </ul>
          </div>
        </div>
      )}
      {/* <div style={{
        marginTop: '0.75rem',
        padding: '0.75rem',
        background: '#e7f3ff',
        borderRadius: '4px',
        fontSize: '0.875rem',
        color: '#1976D2',
        border: '1px solid #2196F3'
      }}>
        <strong>📌 Lưu ý:</strong> Button này sẽ trigger delegation flow thực sự với Dynamic Labs. 
        {delegateEmail ? (
          <>Delegate user ({delegateEmail}) sẽ nhận request và cần approve delegation.</>
        ) : (
          <>Bạn sẽ nhập delegate email trong modal của Dynamic Labs.</>
        )}
        <br />
        <strong>Webhook URL:</strong> <code style={{ background: '#fff', padding: '2px 4px', borderRadius: '3px' }}>{effectiveWebhookUrl}</code>
      </div> */}
    </div>
  );
}

