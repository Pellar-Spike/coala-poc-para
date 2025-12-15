export interface User {
  id: string;
  email: string;
  role: 'admin' | 'delegate';
  createdAt: string;
}

export interface Vault {
  id: string;
  dynamicVaultId?: string;
  adminEmail: string;
  vaultName: string;
  name?: string; // Alias for vaultName for backward compatibility
  createdAt: string;
  walletIds: string[];
  delegateEmails: string[];
  organizationId?: string;
  metadata?: Record<string, any>;
  status: 'active' | 'inactive';
  dynamicUserEmail?: string; // Email associated with dynamicVaultId (for wallet creation)
}

export interface Wallet {
  id: string;
  dynamicWalletId?: string;
  vaultId: string;
  address: string;
  walletName?: string;
  associatedEmail: string;
  userEmail?: string; // Alias for associatedEmail
  userIdentifier?: string;
  createdAt: string;
  policyIds: string[];
  purpose?: 'OPERATIONAL' | 'TREASURY' | 'GRANT' | 'DONATION' | 'OTHER';
  countryOffice?: string;
  environmentId?: string;
  organizationId?: string;
  metadata?: Record<string, any>;
  status: 'active' | 'inactive';
}

export interface Policy {
  id: string;
  name: string;
  policyName?: string; // Alias for name
  type: 'spending_limit' | 'multi_sig' | 'time_lock' | 'approval_required';
  policyType?: Policy['type']; // Alias for type
  targetType: 'wallet' | 'vault';
  targetId: string;
  walletId?: string;
  vaultId?: string;
  config: {
    spendingLimit?: number;
    amountThreshold?: number; // Alias for spendingLimit
    currency?: string;
    requiredSignatures?: number;
    totalSigners?: number;
    lockUntil?: string;
    timeLockDuration?: number;
    timeWindow?: string;
    requiresApproval?: boolean;
    asset?: string; // Token address for spending limit
    chainIds?: number[]; // Chain IDs
    name?: string;
  };
  policyConfig?: Policy['config']; // Alias for config
  dynamicPolicyId?: string; // Policy ID from Dynamic Labs
  createdAt: string;
  status?: 'active' | 'inactive';
}

export interface CreateVaultRequest {
  adminEmail: string;
  vaultName?: string; // Optional - will be auto-generated from email if not provided
  name?: string; // Alias for vaultName
  organizationId?: string;
  metadata?: Record<string, any>;
}

export interface CreateWalletRequest {
  dynamicVaultId: string; // Dynamic Labs User ID (from vault)
  vaultId?: string; // Optional - for local storage reference
  userEmail?: string; // Optional - not needed when using dynamicVaultId
  associatedEmail?: string; // Alias for userEmail
  walletName?: string;
  purpose?: 'OPERATIONAL' | 'TREASURY' | 'GRANT' | 'DONATION' | 'OTHER';
  countryOffice?: string;
  metadata?: Record<string, any>;
}

export interface DelegateAccessRequest {
  vaultId: string;
  delegateEmail: string;
}

export interface CreatePolicyRequest {
  policyName: string;
  name?: string; // Alias for policyName
  policyType: Policy['type'];
  type?: Policy['type']; // Alias for policyType
  walletId?: string;
  vaultId?: string;
  targetType?: Policy['targetType']; // Derived from walletId or vaultId
  targetId?: string; // Derived from walletId or vaultId
  policyConfig: Policy['config'];
  config?: Policy['config']; // Alias for policyConfig
  userJwtToken?: string; // JWT token from Dynamic Labs SDK
  chainIds?: number[]; // Chain IDs for the policy
}

// Delegated Access types (Dynamic Labs)
export interface EncryptedPayload {
  alg: string; // "HYBRID-RSA-AES-256"
  iv: string; // AES IV (base64url)
  ct: string; // Ciphertext (base64url)
  tag: string; // GCM tag (base64url)
  ek: string; // Encrypted content-encryption key (base64url)
  kid?: string; // Key identifier for rotation
}

export interface DelegationWebhookData {
  chain: string; // "EVM"
  encryptedDelegatedShare: EncryptedPayload;
  encryptedWalletApiKey: EncryptedPayload;
  publicKey: string; // Wallet public key (0x...)
  userId: string; // Dynamic Labs user ID
  walletId: string; // Dynamic Labs wallet ID
}

export interface DelegationWebhook {
  messageId: string;
  eventId: string;
  eventName: 'wallet.delegation.created';
  timestamp: string;
  webhookId: string;
  userId: string;
  environmentId: string;
  environmentName: string;
  data: DelegationWebhookData;
}

export interface DelegatedAccess {
  id: string;
  vaultId: string;
  walletId: string; // Dynamic Labs wallet ID
  userId: string; // Original user ID (who owns the wallet)
  delegateUserId: string; // Delegate user ID (who received access)
  delegateEmail: string; // Delegate email
  publicKey: string; // Wallet public key
  delegatedShare: any; // Decrypted delegated share (store securely!)
  walletApiKey: string; // Decrypted wallet API key (store securely!)
  createdAt: string;
  status: 'active' | 'revoked' | 'pending'; // 'pending' for temporary records before webhook
  eventId?: string; // For idempotency
}

