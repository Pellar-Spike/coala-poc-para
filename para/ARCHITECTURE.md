# Architecture Documentation

## System Overview

The NGO Wallet system is a multisig wallet management platform built on top of Safe Protocol (formerly Gnosis Safe). It integrates Para SDK for wallet connectivity and Safe Protocol Kit for smart contract interactions.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                       Next.js Frontend                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Components  │  │    Hooks     │  │   Helpers    │      │
│  │              │  │              │  │              │      │
│  │ • Creator    │  │ • SafeSdk    │  │ • SafeAPI    │      │
│  │ • Manager    │  │ • Multisig   │  │ • Providers  │      │
│  │ • Pending    │  │              │  │              │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │              │
└─────────┼─────────────────┼─────────────────┼──────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│                      Integration Layer                      │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │   Para SDK     │  │ Protocol Kit   │  │  Safe API    │  │
│  │                │  │                │  │              │  │
│  │ • Wallet Conn  │  │ • Safe Ops     │  │ • TX Service │  │
│  │ • Signing      │  │ • Ownership    │  │ • Multisig   │  │
│  │ • Viem Client  │  │ • Threshold    │  │              │  │
│  └────────┬───────┘  └────────┬───────┘  └──────┬───────┘  │
│           │                   │                  │          │
└───────────┼───────────────────┼──────────────────┼──────────┘
            │                   │                  │
            ▼                   ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    Blockchain Layer                         │
│                                                             │
│  ┌──────────────┐           ┌──────────────┐               │
│  │ Sepolia RPC  │◄──────────┤ Safe Contracts│               │
│  │              │           │               │               │
│  │ • Transactions│          │ • GnosisSafe  │               │
│  │ • Events      │          │ • Proxy       │               │
│  └──────────────┘           └──────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Frontend Layer

#### Components

**`ngo-wallet-creator.tsx`**
- Deploy new Safe multisig wallets
- Configure initial signers and threshold
- Uses `useCreateSafeMultisig` hook
- Deploys Safe proxy contract on Sepolia

**`signer-manager.tsx`**
- Add/remove/replace signers
- Update approval threshold
- Handles both single-signer (threshold=1) and multisig (threshold>1) flows
- Uses Safe Protocol Kit for owner management

**`ngo-transaction.tsx`**
- Create token transfer transactions
- Automatic signing by transaction creator
- Threshold-aware: executes immediately if threshold=1, proposes if threshold>1
- Integrates with Safe Transaction Service for multisig

**`pending-transactions.tsx`**
- Display pending transactions from Safe Transaction Service
- Sign transactions with current wallet
- Execute transactions when threshold is met
- Real-time signature collection

**`ngo-wallet-manager.tsx`**
- Main container component
- Tab navigation between features
- Safe address management

#### Hooks

**`useSafeProtocolKit.ts`**
```typescript
export function useSafeProtocolKit(safeAddress?: string) {
  // Initializes Safe SDK with Para provider
  // Returns: safeSdk, owners, threshold, loading states
  // Auto-refreshes on wallet/safe changes
}
```

**`useCreateSafeMultisig.ts`**
```typescript
export function useCreateSafeMultisig() {
  // Deploys new Safe wallets
  // Returns: createSafe function, loading/error states
  // Handles deployment transaction
}
```

### 2. Integration Layer

#### Para SDK Integration

**Purpose:** Connect users' Para wallets and enable signing

**Key Functions:**
- `useAccount()` - Get connection status
- `useWallet()` - Access wallet client for signing
- `useViemAccount()` - Get viem-compatible account
- `useViemClient()` - Get viem client for RPC calls

**EIP-1193 Provider Bridge:**

Para wallet doesn't natively support EIP-1193, so we created a custom provider:

```typescript
// src/lib/safeHelpers.ts
export function createParaEip1193Provider(
  walletClient: any,
  viemAccount: any,
  rpcUrl: string
) {
  return {
    request: async ({ method, params }) => {
      switch (method) {
        case 'eth_accounts':
          return [viemAccount.address];
        
        case 'eth_signTypedData_v4':
          // Use Para's signTypedData
          return await walletClient.signTypedData(...);
        
        case 'eth_sendTransaction':
          // Use Para's sendTransaction
          return await walletClient.sendTransaction(...);
        
        case 'personal_sign':
        case 'eth_sign':
          // Use Para's signMessage
          return await walletClient.signMessage(...);
      }
    }
  };
}
```

#### Safe Protocol Kit Integration

**Purpose:** Interact with Safe smart contracts

**Initialization:**
```typescript
import Safe from '@safe-global/protocol-kit';

const safeSdk = await Safe.init({
  provider: paraEip1193Provider,
  signer: signerAddress,
  safeAddress: safeAddress,
});
```

**Key Operations:**

**Owner Management:**
```typescript
// Add owner
const tx = await safeSdk.createAddOwnerTx({
  ownerAddress: newOwner,
  threshold: newThreshold,
});

// Remove owner
const tx = await safeSdk.createRemoveOwnerTx({
  ownerAddress: ownerToRemove,
  threshold: newThreshold,
});

// Update threshold
const tx = await safeSdk.createChangeThresholdTx(newThreshold);
```

**Transaction Flow:**
```typescript
// 1. Create transaction
const safeTransaction = await safeSdk.createTransaction({
  transactions: [{
    to: recipient,
    value: amount,
    data: encodedData,
  }]
});

// 2. Get transaction hash
const safeTxHash = await safeSdk.getTransactionHash(safeTransaction);

// 3. Sign transaction
const signedTx = await safeSdk.signTransaction(safeTransaction);

// 4a. Execute immediately (threshold = 1)
if (threshold === 1) {
  await safeSdk.executeTransaction(signedTx);
}

// 4b. Propose for more signatures (threshold > 1)
else {
  await proposeTransaction({
    safeAddress,
    ...transactionData,
    contractTransactionHash: safeTxHash,
    sender: currentOwner,
    signature: extractedSignature,
  });
}
```

#### Safe Transaction Service Integration

**Purpose:** Manage multisig transaction flow (propose, sign, execute)

**Why Custom Implementation?**

SafeApiKit v4.0.1 has version mismatch:
- It tries to use `/v2/` endpoints
- Sepolia only has `/v1/` endpoints
- Result: 404 errors

**Solution:** Direct API calls to Safe Transaction Service

**File:** `src/lib/safeTxService.ts`

**Functions:**

```typescript
// 1. Propose Transaction
export async function proposeTransaction(params: {
  safeAddress: string;
  to: string;
  value: string;
  data: string;
  operation: number;
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  gasToken: string;
  refundReceiver: string;
  nonce: number;
  contractTransactionHash: string;
  sender: string;
  signature: string;
}): Promise<void> {
  // POST /safes/{address}/multisig-transactions/
  // Checksums all addresses with getAddress()
  // Adds X-API-Key header if available
  // Handles empty 201 response
}

// 2. Get Pending Transactions
export async function getPendingTransactions(
  safeAddress: string
): Promise<any> {
  // GET /safes/{address}/multisig-transactions/?executed=false
  // Returns: { count, results: [...] }
}

// 3. Confirm Transaction (Add Signature)
export async function confirmTransaction(
  safeTxHash: string,
  signature: string
): Promise<void> {
  // POST /multisig-transactions/{hash}/confirmations/
  // Body: { signature }
}

// 4. Get Transaction Details
export async function getTransaction(
  safeTxHash: string
): Promise<any> {
  // GET /multisig-transactions/{hash}/
  // Returns full transaction with confirmations
}
```

**API Details:**

- **Base URL:** `https://api.safe.global/tx-service/sep/api/v1`
- **Authentication:** API key in `X-API-Key` header (required)
- **Address Format:** All addresses must be EIP-55 checksummed
- **Response Format:** JSON or empty body (201 Created)

### 3. Blockchain Layer

#### Sepolia Testnet Configuration

```typescript
// src/config/network.ts
import { sepolia } from 'viem/chains';

export const CHAIN = sepolia;
export const RPC_URL = "https://sepolia.infura.io/v3/YOUR_KEY";
export const SAFE_TX_SERVICE_URL = 
  "https://api.safe.global/tx-service/sep/api/v1";
export const SAFE_API_KEY = process.env.NEXT_PUBLIC_SAFE_API_KEY || "";
```

#### Safe Contracts on Sepolia

- **Safe Singleton:** `0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552` (v1.3.0)
- **Safe Proxy Factory:** `0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2`
- **Fallback Handler:** `0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4`

**Deployment Flow:**

1. User initiates Safe creation
2. Safe Proxy Factory deploys new proxy
3. Proxy delegates to Safe Singleton (implementation)
4. Initial owners and threshold are set
5. Transaction mined on Sepolia

## Transaction Flows

### Flow 1: Single-Signer Transaction (Threshold = 1)

```
User Action → Create Transaction → Sign → Execute → Confirmed
                     ↓                ↓        ↓
               Safe Protocol     Para Wallet  Sepolia
```

**Code Path:**
```typescript
// ngo-transaction.tsx
const safeTransaction = await safeSdk.createTransaction({...});
const signedTx = await safeSdk.signTransaction(safeTransaction);

if (threshold === 1) {
  const txResponse = await safeSdk.executeTransaction(signedTx);
  // Transaction immediately executed on blockchain
}
```

### Flow 2: Multisig Transaction (Threshold > 1)

```
Owner A: Create → Sign → Propose to Safe TX Service
                            ↓
                   [Pending Transaction]
                            ↓
Owner B: View Pending → Sign → Confirm to Safe TX Service
                            ↓
                   [Updated Confirmations]
                            ↓
Any Owner: Execute Transaction → Blockchain
```

**Code Path:**

**Owner A (Proposer):**
```typescript
// ngo-transaction.tsx
const safeTransaction = await safeSdk.createTransaction({...});
const safeTxHash = await safeSdk.getTransactionHash(safeTransaction);
const signedTx = await safeSdk.signTransaction(safeTransaction);

if (threshold > 1) {
  await proposeTransaction({
    safeAddress,
    contractTransactionHash: safeTxHash,
    sender: getAddress(ownerA),
    signature: extractSignature(signedTx),
    ...txData
  });
}
```

**Owner B (Signer):**
```typescript
// pending-transactions.tsx
const pendingTxs = await getPendingTransactions(safeAddress);

// User selects transaction to sign
const safeTransaction = await safeSdk.createTransaction({...});
const signedTx = await safeSdk.signTransaction(safeTransaction);
const signature = extractSignature(signedTx);

await confirmTransaction(tx.safeTxHash, signature);
```

**Executor (When Threshold Met):**
```typescript
// pending-transactions.tsx
const txData = await getTransaction(safeTxHash);
const safeTransaction = await safeSdk.createTransaction({...});

// Add all collected signatures
for (const confirmation of txData.confirmations) {
  safeTransaction.addSignature({
    signer: getAddress(confirmation.owner),
    data: confirmation.signature,
  });
}

// Execute with all signatures
await safeSdk.executeTransaction(safeTransaction);
```

## Key Technical Decisions

### 1. Why Direct API Calls Instead of SafeApiKit?

**Problem:**
- SafeApiKit v4.0.1 hardcodes `/v2/` in internal methods
- Sepolia Safe Transaction Service only supports `/v1/`
- Even with correct base URL, SafeApiKit appends `/v2/`
- Result: `...api/v1/v2/multisig-transactions/` → 404

**Solution:**
- Direct `fetch` calls to correct `/v1/` endpoints
- Full control over request/response handling
- No version conflicts
- Easier debugging

### 2. Why Custom EIP-1193 Provider?

**Problem:**
- Safe Protocol Kit requires EIP-1193 provider
- Para SDK uses custom wallet interface
- Direct integration causes `TypeError: Cannot read properties of undefined (reading 'bind')`

**Solution:**
- Bridge layer that translates EIP-1193 calls to Para SDK calls
- Handles all required methods: `eth_accounts`, `eth_signTypedData_v4`, `personal_sign`, etc.
- Maintains compatibility with both systems

### 3. Why Checksum All Addresses?

**Problem:**
- Safe Transaction Service strictly validates addresses
- Non-checksummed addresses → 422 error: "Address is not checksumed"

**Solution:**
- Use `getAddress()` from viem for all addresses
- Apply before sending to API
- Special handling for zero address: `0x0000000000000000000000000000000000000000`

### 4. Why Handle Empty JSON Responses?

**Problem:**
- Safe API returns `201 Created` with empty body on success
- `response.json()` throws: "Unexpected end of JSON input"

**Solution:**
```typescript
const text = await response.text();
if (!text || text.trim() === '') {
  console.log("Success (empty response)");
  return;
}
return JSON.parse(text);
```

## Security Considerations

### 1. Private Key Management

- **Para SDK handles private keys** - Never exposed to application
- Signing happens in Para's secure environment
- Application only receives signatures

### 2. Multisig Security

- **No single point of failure** - Requires multiple approvals
- **Threshold enforcement** - Smart contract validates signatures
- **On-chain verification** - All approvals recorded on blockchain

### 3. API Key Security

- **Environment variables only** - Never commit API keys
- **Client-side keys** - Limited scope (read public data, write with signature)
- **HTTPS only** - All API calls over secure connection

### 4. Transaction Validation

- **Safe smart contract validates:**
  - Signature authenticity
  - Signer is valid owner
  - Threshold requirements met
  - Nonce prevents replay attacks

## Performance Considerations

### 1. RPC Calls

- Use Infura/Alchemy for reliable RPC
- Implement retry logic for failed calls
- Cache static data (owners, threshold) when possible

### 2. Safe Transaction Service

- Centralized service handles signature collection
- No need for P2P signature sharing
- Fast sync across all signers

### 3. Frontend Optimization

- Lazy load transaction history
- Paginate pending transactions
- Debounce API calls

## Future Enhancements

### 1. Enhanced Multisig Features

- Transaction queue management
- Batch transactions
- Transaction cancellation
- Signature expiration

### 2. Advanced Policies

- Time-based restrictions (e.g., no large transfers on weekends)
- Whitelisted recipients
- Velocity limits (max amount per day)

### 3. Monitoring & Notifications

- Email/webhook notifications for pending transactions
- Real-time updates via WebSocket
- Transaction history dashboard

### 4. Multi-Network Support

- Mainnet, Polygon, Optimism, etc.
- Network switching in UI
- Cross-chain transactions

## Dependencies

### Core Dependencies

```json
{
  "@getpara/react-sdk": "^2.4.5",
  "@getpara/react-sdk-lite": "^2.4.5",
  "@safe-global/protocol-kit": "^6.0.1",
  "@safe-global/api-kit": "^4.0.1",
  "viem": "^2.21.54",
  "next": "15.1.4",
  "react": "^19.0.0"
}
```

### Why These Versions?

- **Para SDK 2.4.5** - Latest stable with EVM support
- **Protocol Kit 6.0.1** - Latest Safe SDK with v1.3.0 Safe contracts
- **Api Kit 4.0.1** - Mostly bypassed, kept for type definitions
- **Viem 2.21.54** - Para SDK dependency, provides utilities

## Testing Strategy

### Unit Tests (Future)

- Test helper functions (checksumming, signature extraction)
- Test EIP-1193 provider bridge
- Mock Safe Protocol Kit calls

### Integration Tests (Future)

- Test full transaction flow on testnet
- Test multisig approval flow
- Test owner management operations

### Manual Testing (Current)

- Create Safe with multiple signers
- Add/remove signers
- Update threshold
- Create and sign multisig transactions
- Execute when threshold met

## Monitoring & Debugging

### Console Logging

Strategic console logs for debugging:
```typescript
console.log("🔍 Loading pending transactions for Safe:", safeAddress);
console.log("📦 Raw response from Safe TX Service:", response);
console.log("✅ Transaction proposed successfully");
```

### Network Tab Inspection

Monitor API calls in browser DevTools:
- Check request URLs (ensure no `/v1/v2/` double path)
- Verify API key in headers
- Inspect response status codes
- Check address checksumming

### Error Handling

All API calls wrapped in try-catch:
```typescript
try {
  await proposeTransaction({...});
} catch (error) {
  console.error("Failed to propose:", error);
  setError(error.message);
}
```

## Conclusion

This architecture balances:
- **Developer Experience** - Easy to use Para SDK and Safe Protocol Kit
- **Reliability** - Direct API calls for predictable behavior
- **Security** - Multisig enforcement and private key protection
- **Maintainability** - Clear separation of concerns and well-documented code

The system is production-ready for Sepolia testnet and can be extended for mainnet deployment with additional testing and monitoring.
