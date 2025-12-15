'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Policy } from '@/types';
import { CreateWalletClient } from '@/components/CreateWalletClient';
import { DynamicWidgetWrapper } from '@/components/DynamicWidgetWrapper';
import { DelegateAccessClient } from '@/components/DelegateAccessClient';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';

// Component that uses Dynamic context
function HomeContent() {
  // Safely get Dynamic context - handle case where provider might not be ready
  let context: ReturnType<typeof useDynamicContext> | null = null;
  let isAuthenticated: boolean | undefined;
  let user: any = undefined;
  
  try {
    context = useDynamicContext();
    isAuthenticated = (context as any)?.isAuthenticated;
    user = context?.user;
  } catch (error) {
    // Context not available - provider may not be ready yet
    // This is OK, we'll handle it gracefully
    console.warn('Dynamic context not available:', error);
    context = null;
    isAuthenticated = undefined;
    user = undefined;
  }

  console.log('context 111111111:', context);
  
  // If user object exists, consider authenticated even if isAuthenticated is undefined
  const isUserAuthenticated = (isAuthenticated === true) || (user !== null && user !== undefined);
  
  const [loading, setLoading] = useState(false);
  // Separate messages for each section
  const [vaultMessage, setVaultMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [walletMessage, setWalletMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [delegateMessage, setDelegateMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [policyMessage, setPolicyMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Form states
  const [vaultForm, setVaultForm] = useState({ adminEmail: '' });
  const [walletForm, setWalletForm] = useState({ dynamicVaultId: '', email: '', walletName: '' });
  const [delegateEmail, setDelegateEmail] = useState('');
  const [policyForm, setPolicyForm] = useState({
    name: '',
    type: 'spending_limit' as Policy['type'],
    targetType: 'wallet' as 'wallet' | 'vault',
    targetId: '',
    spendingLimit: '',
    currency: 'USD',
    requiredSignatures: '',
    totalSigners: '',
  });


  // Message handlers for each section (15 seconds timeout)
  const showVaultMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setVaultMessage({ type, text });
    setTimeout(() => setVaultMessage(null), 15000);
  };
  const showWalletMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setWalletMessage({ type, text });
    setTimeout(() => setWalletMessage(null), 15000);
  };
  const showDelegateMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setDelegateMessage({ type, text });
    setTimeout(() => setDelegateMessage(null), 15000);
  };
  const showPolicyMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setPolicyMessage({ type, text });
    setTimeout(() => setPolicyMessage(null), 15000);
  };

  const handleCreateVault = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/vaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminEmail: vaultForm.adminEmail,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        showVaultMessage('success', result.message || 'Vault created successfully');
        setVaultForm({ adminEmail: '' });
      } else {
        const error = await res.json();
        showVaultMessage('error', error.error || 'Failed to create vault');
      }
    } catch (error) {
      showVaultMessage('error', 'Failed to create vault');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dynamicVaultId: walletForm.dynamicVaultId,
          userEmail: walletForm.email,
          associatedEmail: walletForm.email,
          walletName: walletForm.walletName || undefined,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        showWalletMessage('success', result.message || 'Wallet created successfully');
        setWalletForm({ dynamicVaultId: '', email: '', walletName: '' });
      } else {
        const error = await res.json();
        showWalletMessage('error', error.error || 'Failed to create wallet');
      }
    } catch (error) {
      showWalletMessage('error', 'Failed to create wallet');
    } finally {
      setLoading(false);
    }
  };


  const handleRetrievePolicy = async (policyId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/policies/${policyId}`);
      if (res.ok) {
        const policy = await res.json();
        showPolicyMessage('success', 'Policy retrieved successfully');
      } else {
        const error = await res.json();
        showPolicyMessage('error', error.error || 'Failed to retrieve policy');
      }
    } catch (error) {
      showPolicyMessage('error', 'Failed to retrieve policy');
    } finally {
      setLoading(false);
    }
  };

      const handleCreatePolicy = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
          const config: any = {};
          if (policyForm.type === 'spending_limit') {
            config.spendingLimit = parseFloat(policyForm.spendingLimit);
            config.currency = policyForm.currency;
          } else if (policyForm.type === 'multi_sig') {
            config.requiredSignatures = parseInt(policyForm.requiredSignatures);
            config.totalSigners = parseInt(policyForm.totalSigners);
          } else if (policyForm.type === 'approval_required') {
            config.requiresApproval = true;
          }

          // Using API token (like Dashboard) - no JWT needed
          const res = await fetch('/api/policies', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              // No Authorization header needed - API token is used server-side
            },
            body: JSON.stringify({
              name: policyForm.name,
              type: policyForm.type,
              targetType: policyForm.targetType,
              targetId: policyForm.targetId,
              config,
            }),
          });
      if (res.ok) {
        const result = await res.json();
        // Only show success if policy was created successfully on Dynamic Labs
        if (result.dynamicPolicyId) {
          showPolicyMessage('success', result.message || `Policy created successfully in Dynamic Labs (ID: ${result.dynamicPolicyId})`);
          setPolicyForm({
            name: '',
            type: 'spending_limit',
            targetType: 'wallet',
            targetId: '',
            spendingLimit: '',
            currency: 'USD',
            requiredSignatures: '',
            totalSigners: '',
          });
        } else {
          // Policy was only created locally, not on Dynamic Labs
          showPolicyMessage('error', result.message || 'Policy created locally but failed to create on Dynamic Labs. Please check console logs for details.');
        }
      } else {
        const error = await res.json();
        showPolicyMessage('error', error.error || 'Failed to create policy');
      }
    } catch (error) {
      showPolicyMessage('error', 'Failed to create policy');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <h1>Coala POC - Vault & Wallet Management</h1>
            <p>Internal tool for managing vaults, wallets, users, and policies</p>
          </div>
          <div style={{ marginTop: '1rem' }}>
            <DynamicWidgetWrapper />
          </div>
        </div>
      </div>

      {/* Create Vault Section */}
      <div className="section">
        <h2>Create Vault (not create wallet)</h2>
        {vaultMessage && (
          <div 
            className={`alert alert-${vaultMessage.type}`}
            style={{
              padding: '1rem',
              marginBottom: '1rem',
              borderRadius: '4px',
              border: vaultMessage.type === 'error' ? '1px solid #f5c6cb' : vaultMessage.type === 'info' ? '1px solid #bee5eb' : '1px solid #c3e6cb',
              background: vaultMessage.type === 'error' ? '#f8d7da' : vaultMessage.type === 'info' ? '#d1ecf1' : '#d4edda',
              color: vaultMessage.type === 'error' ? '#721c24' : vaultMessage.type === 'info' ? '#0c5460' : '#155724',
              whiteSpace: 'pre-line',
            }}
          >
            {vaultMessage.text}
          </div>
        )}
        <form onSubmit={handleCreateVault}>
          <div className="form-group">
            <label>Admin Email</label>
            <input
              type="email"
              value={vaultForm.adminEmail}
              onChange={(e) => setVaultForm({ ...vaultForm, adminEmail: e.target.value })}
              required
              placeholder="admin@ngo.org"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            Create Vault
          </button>
        </form>
      </div>

      {/* Create Wallet Section */}
      <div className="section">
        <h2>Create Wallet (create vault/user when not exist)</h2>
        {walletMessage && (
          <div 
            className={`alert alert-${walletMessage.type}`}
            style={{
              padding: '1rem',
              marginBottom: '1rem',
              borderRadius: '4px',
              border: walletMessage.type === 'error' ? '1px solid #f5c6cb' : walletMessage.type === 'info' ? '1px solid #bee5eb' : '1px solid #c3e6cb',
              background: walletMessage.type === 'error' ? '#f8d7da' : walletMessage.type === 'info' ? '#d1ecf1' : '#d4edda',
              color: walletMessage.type === 'error' ? '#721c24' : walletMessage.type === 'info' ? '#0c5460' : '#155724',
              whiteSpace: 'pre-line',
            }}
          >
            {walletMessage.text}
          </div>
        )}
        {/* Server-side API - Temporarily hidden */}
        {/* <form onSubmit={handleCreateWallet}>
          <div className="form-group">
            <label>Dynamic Vault ID</label>
            <input
              type="text"
              value={walletForm.dynamicVaultId}
              onChange={(e) => setWalletForm({ ...walletForm, dynamicVaultId: e.target.value })}
              required
              placeholder="Dynamic Labs User ID (from vault)"
            />
            <small style={{ color: '#666', fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}>
              Enter the Dynamic Labs User ID (dynamicVaultId) from the vault
            </small>
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={walletForm.email}
              onChange={(e) => setWalletForm({ ...walletForm, email: e.target.value })}
              required
              placeholder="user@ngo.org"
            />
            <small style={{ color: '#666', fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}>
              User email used to create vault (not the Dynamic Labs account email)
            </small>
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            Create Wallet (Server-side API)
          </button>
        </form> */}
        
        {/* Client-side SDK - Always shown */}
        <div style={{ padding: '1rem', background: '#f8f9fa', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Create Wallet (Client-side SDK)</h3>
          <div style={{ 
            padding: '0.75rem', 
            background: '#e7f3ff', 
            border: '1px solid #2196F3', 
            borderRadius: '4px',
            marginBottom: '0.5rem',
            fontSize: '0.875rem',
            color: '#1976D2'
          }}>
            <strong>⚠️ Important Note:</strong>
            <ul style={{ margin: '0.5rem 0 0 1.5rem', padding: 0 }}>
              <li>You need to <strong>login with Dynamic Labs</strong> before creating wallet</li>
              <li>Login email must match the email registered in Dynamic Labs</li>
            </ul>
          </div>
          <p style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>
            Use Client-side SDK to create wallet. User must login with Dynamic Labs first.
          </p>
          <CreateWalletClient
            dynamicVaultId={walletForm.dynamicVaultId || ''}
            email={walletForm.email || ''}
            walletName={walletForm.walletName}
            onSuccess={(walletAddress) => {
              showWalletMessage('success', `Wallet created successfully via SDK (Address: ${walletAddress})`);
            }}
            onError={(error) => {
              showWalletMessage('error', `Failed to create wallet via SDK: ${error}`);
            }}
          />
        </div>
      </div>

      {/* Delegate Access Section */}
      <div className="section">
        <h2>Delegate Access</h2>
        {delegateMessage && (
          <div 
            className={`alert alert-${delegateMessage.type}`}
            style={{
              padding: '1rem',
              marginBottom: '1rem',
              borderRadius: '4px',
              border: delegateMessage.type === 'error' ? '1px solid #f5c6cb' : delegateMessage.type === 'info' ? '1px solid #bee5eb' : '1px solid #c3e6cb',
              background: delegateMessage.type === 'error' ? '#f8d7da' : delegateMessage.type === 'info' ? '#d1ecf1' : '#d4edda',
              color: delegateMessage.type === 'error' ? '#721c24' : delegateMessage.type === 'info' ? '#0c5460' : '#155724',
              whiteSpace: 'pre-line',
            }}
          >
            {delegateMessage.text}
          </div>
        )}

        {!isUserAuthenticated ? (
          <div style={{
            padding: '0.75rem',
            background: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '4px',
            marginBottom: '1rem',
            fontSize: '0.875rem',
            color: '#856404'
          }}>
            ⚠️ <strong>Requirement:</strong> You need to login with Dynamic Labs first (with wallet owner's email) to trigger delegation.
          </div>
        ) : (
          <>
            {/* Get wallet ID and user ID from context */}
            {(() => {
              const primaryWallet = context?.primaryWallet as any;
              const walletId = primaryWallet?.id || primaryWallet?.walletId || primaryWallet?.wallet?.id || (context as any)?.primaryWallet?.id;
              const userId = user?.id || user?.userId || (context as any)?.userId;

              if (!walletId) {
                return (
                  <div style={{
                    padding: '0.75rem',
                    background: '#ffebee',
                    border: '1px solid #f44336',
                    borderRadius: '4px',
                    marginBottom: '1rem',
                    fontSize: '0.875rem',
                    color: '#c62828'
                  }}>
                    ❌ <strong>Wallet ID not found.</strong> Please ensure you have a wallet and are logged in with Dynamic Labs.
                  </div>
                );
              }

              return (
                <DelegateAccessClient
                  walletId={walletId}
                  delegateEmail={delegateEmail || ''}
                  onSuccess={() => {
 
                  }}
                  onError={(error) => {
                    showDelegateMessage('error', `❌ Failed to trigger delegation with Dynamic Labs: ${error}`);
                  }}
                />
              );
            })()}
          </>
        )}
      </div>

      {/* Create Policy Section */}
      <div className="section">
        <h2>Create Policy (Look like APIKey is not enough for Permission now, should do it in Dashboard)</h2>
        {policyMessage && (
          <div 
            className={`alert alert-${policyMessage.type}`}
            style={{
              padding: '1rem',
              marginBottom: '1rem',
              borderRadius: '4px',
              border: policyMessage.type === 'error' ? '1px solid #f5c6cb' : policyMessage.type === 'info' ? '1px solid #bee5eb' : '1px solid #c3e6cb',
              background: policyMessage.type === 'error' ? '#f8d7da' : policyMessage.type === 'info' ? '#d1ecf1' : '#d4edda',
              color: policyMessage.type === 'error' ? '#721c24' : policyMessage.type === 'info' ? '#0c5460' : '#155724',
              whiteSpace: 'pre-line',
            }}
          >
            {policyMessage.text}
          </div>
        )}
        <form onSubmit={handleCreatePolicy}>
          <div className="form-group">
            <label>Policy Name</label>
            <input
              type="text"
              value={policyForm.name}
              onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })}
              required
              placeholder="Monthly Spending Limit"
            />
          </div>
          <div className="form-group">
            <label>Policy Type</label>
            <select
              value={policyForm.type}
              onChange={(e) => setPolicyForm({ ...policyForm, type: e.target.value as Policy['type'] })}
              required
            >
              <option value="spending_limit">Spending Limit</option>
              <option value="multi_sig">Multi-Signature</option>
              <option value="time_lock">Time Lock</option>
              <option value="approval_required">Approval Required</option>
            </select>
          </div>
          <div className="form-group">
            <label>Target Type</label>
            <select
              value={policyForm.targetType}
              onChange={(e) => setPolicyForm({ ...policyForm, targetType: e.target.value as 'wallet' | 'vault' })}
              required
            >
              <option value="wallet">Wallet</option>
              <option value="vault">Vault</option>
            </select>
          </div>
          <div className="form-group">
            <label>Target {policyForm.targetType === 'wallet' ? 'Wallet' : 'Vault'}</label>
            {policyForm.targetType === 'wallet' ? (
              <input
                type="text"
                value={policyForm.targetId}
                onChange={(e) => setPolicyForm({ ...policyForm, targetId: e.target.value })}
                required
                placeholder="0x..."
                style={{ fontFamily: 'monospace' }}
              />
            ) : (
              <input
                type="text"
                value={policyForm.targetId}
                onChange={(e) => setPolicyForm({ ...policyForm, targetId: e.target.value })}
                required
                placeholder="Enter vault ID"
                style={{ fontFamily: 'monospace' }}
              />
            )}
            {policyForm.targetType === 'wallet' && (
              <>
                <small style={{ color: '#666', fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}>
                  ⚠️ <strong>IMPORTANT:</strong> The wallet address must belong to the logged-in user. Use a wallet address from your account.
                </small>
                {isUserAuthenticated && user && (
                  <div style={{ 
                    marginTop: '0.5rem', 
                    padding: '0.75rem', 
                    background: '#e7f3ff', 
                    border: '1px solid #2196F3', 
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}>
                    <strong>💡 Tip:</strong> Check the console logs to see your available wallet addresses. The wallet address you enter must match one of the wallets owned by your logged-in account ({user.email}).
                  </div>
                )}
              </>
            )}
          </div>
          {policyForm.type === 'spending_limit' && (
            <>
              <div className="form-group">
                <label>Spending Limit</label>
                <input
                  type="number"
                  value={policyForm.spendingLimit}
                  onChange={(e) => setPolicyForm({ ...policyForm, spendingLimit: e.target.value })}
                  required
                  step="0.01"
                  placeholder="1000"
                />
              </div>
              <div className="form-group">
                <label>Currency</label>
                <select
                  value={policyForm.currency}
                  onChange={(e) => setPolicyForm({ ...policyForm, currency: e.target.value })}
                  required
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="ETH">ETH</option>
                  <option value="BTC">BTC</option>
                </select>
              </div>
            </>
          )}
          {policyForm.type === 'multi_sig' && (
            <>
              <div className="form-group">
                <label>Required Signatures</label>
                <input
                  type="number"
                  value={policyForm.requiredSignatures}
                  onChange={(e) => setPolicyForm({ ...policyForm, requiredSignatures: e.target.value })}
                  required
                  min="1"
                  placeholder="2"
                />
              </div>
              <div className="form-group">
                <label>Total Signers</label>
                <input
                  type="number"
                  value={policyForm.totalSigners}
                  onChange={(e) => setPolicyForm({ ...policyForm, totalSigners: e.target.value })}
                  required
                  min="1"
                  placeholder="3"
                />
              </div>
            </>
          )}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            Create Policy
          </button>
        </form>
      </div>

    </div>
  );
}

// Wrapper component that only renders HomeContent when provider is ready
function HomeWrapper() {
  const [providerReady, setProviderReady] = useState(false);

  useEffect(() => {
    // Check if environment ID is available (provider will be rendered)
    const envId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
    if (envId) {
      // Small delay to ensure provider is mounted
      setTimeout(() => setProviderReady(true), 100);
    } else {
      // No environment ID, but still render (provider won't work but won't crash)
      setProviderReady(true);
    }
  }, []);

  if (!providerReady) {
    return <div className="loading">Loading...</div>;
  }

  return <HomeContent />;
}

// Main component
export default function Home() {
  return <HomeWrapper />;
}

