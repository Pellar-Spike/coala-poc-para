# Troubleshooting Guide

Common issues and their solutions when working with the NGO Wallet system.

## Table of Contents

1. [Setup Issues](#setup-issues)
2. [API Errors](#api-errors)
3. [Transaction Issues](#transaction-issues)
4. [Multisig Flow Issues](#multisig-flow-issues)
5. [Network Issues](#network-issues)
6. [Build Errors](#build-errors)

---

## Setup Issues

### Issue: Missing API Keys

**Error:**
```
apiKey is mandatory when using api.safe.global or api.5afe.dev domains
```

**Cause:** Safe Transaction Service requires API key for api.safe.global domain.

**Solution:**

1. Get API key from [Safe Developer Portal](https://developer.safe.global)
2. Add to `.env.local`:
   ```env
   NEXT_PUBLIC_SAFE_API_KEY=your_safe_api_key_here
   ```
3. Restart development server:
   ```bash
   npm run dev
   ```

### Issue: Para Wallet Not Connecting

**Error:** Wallet connection fails or shows "Not connected"

**Solution:**

1. Ensure Para API key is set in `.env.local`:
   ```env
   NEXT_PUBLIC_PARA_API_KEY=your_para_api_key_here
   ```
2. Clear browser cache and cookies
3. Try different browser (Chrome recommended)
4. Check browser console for errors
5. Ensure you have created an EVM wallet in Para

---

## API Errors

### Issue: 404 Not Found with `/v2/` Endpoint

**Error:**
```
GET https://api.safe.global/tx-service/sep/api/v1/v2/multisig-transactions/...
404 (Not Found)
```

**Cause:** 
- SafeApiKit v4.0.1 automatically appends `/v2/` to base URL
- Results in double path: `.../api/v1/v2/...`
- Sepolia only supports `/v1/` endpoints

**Solution:** 
Already fixed in codebase. We use custom API calls in `src/lib/safeTxService.ts` that directly call `/v1/` endpoints.

**If you see this error:**
1. Check that you're importing from `safeTxService.ts`:
   ```typescript
   import { proposeTransaction, getPendingTransactions } from '@/lib/safeTxService';
   ```
2. NOT from `@safe-global/api-kit`:
   ```typescript
   // DON'T USE THIS:
   const apiKit = new SafeApiKit({...});
   await apiKit.proposeTransaction(...); // Uses /v2/
   ```

### Issue: 422 Address Not Checksummed

**Error:**
```
422 (Unprocessable Content)
{"sender":["Address 0x1b2b55... is not checksumed"]}
```

**Cause:** Safe Transaction Service requires all addresses to be EIP-55 checksummed.

**Solution:**
Already fixed in codebase. All addresses are checksummed using `getAddress()` from viem.

**If you see this error:**
```typescript
import { getAddress } from 'viem';

// Before sending to API:
const checksummedAddress = getAddress(address);
```

**Special case - Zero address:**
```typescript
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
// Zero address doesn't need checksumming
```

### Issue: Unexpected End of JSON Input

**Error:**
```
SyntaxError: Failed to execute 'json' on 'Response': Unexpected end of JSON input
```

**Cause:** 
- Safe Transaction Service returns `201 Created` with empty body on success
- Calling `response.json()` on empty body throws error

**Solution:**
Already fixed in codebase. Safe response handling:

```typescript
const text = await response.text();
if (!text || text.trim() === '') {
  console.log("Success (empty response)");
  return;
}

try {
  return JSON.parse(text);
} catch (e) {
  console.warn("Response is not JSON:", text);
  return;
}
```

---

## Transaction Issues

### Issue: Transaction Executes Immediately (Multisig Not Working)

**Symptom:** Transaction executes right away, other signers can't sign

**Cause:** Threshold = 1 or code is calling `executeTransaction` instead of `proposeTransaction`

**Solution:**

1. Check Safe threshold:
   ```typescript
   const threshold = await safeSdk.getThreshold();
   console.log("Current threshold:", threshold);
   ```

2. Update threshold if needed (in "Manage Signers" tab)

3. Ensure code follows multisig flow:
   ```typescript
   const signedTx = await safeSdk.signTransaction(safeTransaction);
   
   if (threshold === 1) {
     await safeSdk.executeTransaction(signedTx);
   } else {
     // Propose to Safe TX Service for other signers
     await proposeTransaction({...});
   }
   ```

### Issue: "1 Signature Missing" Error

**Error:**
```
There is 1 signature missing
```

**Cause:** Trying to execute transaction before collecting enough signatures

**Solution:**

**For Add/Remove Signer:**
- If current threshold = 1: Transaction executes immediately
- If current threshold > 1: Transaction is proposed to Safe TX Service

Code should check threshold:
```typescript
const currentThreshold = await safeSdk.getThreshold();

if (currentThreshold === 1) {
  // Execute immediately
  await safeSdk.executeTransaction(signedTx);
} else {
  // Propose for more signatures
  await proposeTransaction({...});
}
```

### Issue: Transaction Not Appearing for Other Signers

**Symptom:** Owner A creates transaction, Owner B doesn't see it in "Pending Transactions"

**Possible Causes:**

#### 1. Different Safe Addresses

**Check:**
```
Owner A viewing Safe: 0xABC...
Owner B viewing Safe: 0xDEF...  ← DIFFERENT!
```

**Solution:** Both owners must use the exact same Safe address

#### 2. Transaction Not Proposed Successfully

**Check console for errors:**
```
✅ Good: "Transaction proposed successfully"
❌ Bad: "Failed to propose transaction: ..."
```

**Solution:** Fix the error (usually API key or address checksumming)

#### 3. Safe Transaction Service Indexing Delay

**Check:** Wait 2-3 seconds after proposing

**Solution:** 
- Click refresh button
- Reload page
- Check on [Safe UI](https://app.safe.global)

#### 4. API Key Missing

**Check:** See "Missing API Keys" section above

**Debug Steps:**

1. Open browser console (F12)
2. Look for logs:
   ```
   🔍 Loading pending transactions for Safe: 0x...
   📦 Raw response from Safe TX Service: {...}
   📊 Total transactions: ???
   ```
3. If count = 0, transaction wasn't proposed
4. If error, check API key and address

---

## Multisig Flow Issues

### Issue: Can't Sign Transaction (Not an Owner)

**Error:**
```
Your current wallet is not an owner of this Safe
```

**Cause:** Connected wallet address is not in Safe's owner list

**Solution:**

1. Check current wallet address:
   ```typescript
   const { address } = useViemAccount();
   console.log("Current wallet:", address);
   ```

2. Check Safe owners:
   ```typescript
   const owners = await safeSdk.getOwners();
   console.log("Safe owners:", owners);
   ```

3. Switch to a wallet that IS an owner:
   - Click "Connect Wallet"
   - Select different Para wallet
   - Or import wallet with owner private key

### Issue: Can't Execute Transaction (Threshold Not Met)

**Error:**
```
Transaction requires 2 signatures but only has 1
```

**Cause:** Not enough signers have signed the transaction

**Solution:**

1. Check confirmations:
   ```typescript
   const confirmations = tx.confirmations || [];
   console.log(`Signatures: ${confirmations.length} / ${threshold}`);
   ```

2. Other owners need to sign:
   - Share Safe address with other owners
   - They switch to their owner wallet
   - They go to "Pending Transactions" tab
   - They click "Sign Transaction"

3. Once threshold met, execute button appears

### Issue: Already Signed Error

**Error:**
```
You have already signed this transaction
```

**Cause:** Current wallet already signed

**Solution:** 
- This is expected behavior
- Switch to a different owner wallet to add another signature
- Or wait for other owners to sign

---

## Network Issues

### Issue: RPC Connection Failed

**Error:**
```
Failed to connect to RPC endpoint
```

**Solution:**

1. Check RPC URL in `src/config/network.ts`:
   ```typescript
   export const RPC_URL = "https://sepolia.infura.io/v3/YOUR_KEY";
   ```

2. Verify RPC endpoint works:
   ```bash
   curl -X POST https://sepolia.infura.io/v3/YOUR_KEY \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
   ```

3. Try alternative RPC:
   - Alchemy: `https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY`
   - Public: `https://rpc.sepolia.org` (rate limited)

### Issue: Transaction Timeout

**Error:**
```
Transaction timeout - not mined within 50 blocks
```

**Solution:**

1. Check Sepolia network status: [Sepolia Etherscan](https://sepolia.etherscan.io)
2. Ensure you have enough Sepolia ETH for gas
3. Try increasing gas limit
4. Wait longer (Sepolia can be slow)

### Issue: Insufficient Funds

**Error:**
```
Insufficient funds for gas
```

**Solution:**

1. Get Sepolia ETH from faucets:
   - [Alchemy Sepolia Faucet](https://sepoliafaucet.com/)
   - [Infura Sepolia Faucet](https://www.infura.io/faucet/sepolia)

2. Check balance:
   ```bash
   # On Sepolia Etherscan
   https://sepolia.etherscan.io/address/YOUR_ADDRESS
   ```

---

## Build Errors

### Issue: TypeScript Errors

**Error:**
```
Type error: Cannot find name 'X'
```

**Solution:**

1. Ensure all imports are correct
2. Check file paths (use `@/` prefix for src/ imports)
3. Run type check:
   ```bash
   npx tsc --noEmit
   ```

### Issue: Module Not Found

**Error:**
```
Module not found: Can't resolve 'X'
```

**Solution:**

1. Reinstall dependencies:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. Clear Next.js cache:
   ```bash
   rm -rf .next
   npm run dev
   ```

### Issue: EPERM Build Error

**Error:**
```
EPERM: operation not permitted
```

**Solution:**

Run build with elevated permissions:
```bash
npm run build
# If fails, try with sudo (macOS/Linux)
```

---

## Debug Checklist

When encountering any issue:

### 1. Check Console Logs
- Open DevTools (F12)
- Look for emoji logs (🔍, 📦, ✅, ❌)
- Copy full error message

### 2. Check Network Tab
- Filter by "multisig-transactions" or "api.safe.global"
- Check request URL (should have `/v1/`, not `/v1/v2/`)
- Check response status (200, 201, 401, 404, 422)
- Check request headers (API key present?)

### 3. Verify Configuration
```bash
# Check environment variables
cat .env.local

# Should have:
NEXT_PUBLIC_PARA_API_KEY=...
NEXT_PUBLIC_SAFE_API_KEY=...
```

### 4. Verify Safe Status
Visit Safe UI:
```
https://app.safe.global/transactions/queue?safe=sep:YOUR_SAFE_ADDRESS
```

Compare with your app:
- Same owners?
- Same threshold?
- Same pending transactions?

### 5. Test with Curl

Test Safe API directly:
```bash
# Get pending transactions
curl -H "X-API-Key: YOUR_KEY" \
  "https://api.safe.global/tx-service/sep/api/v1/safes/YOUR_SAFE/multisig-transactions/?executed=false"

# Should return:
{
  "count": 1,
  "results": [...]
}
```

---

## Getting Help

If issue persists:

1. **Provide:**
   - Console logs (full error messages)
   - Network tab screenshot
   - Safe address
   - Steps to reproduce

2. **Resources:**
   - [Para Documentation](https://docs.getpara.com)
   - [Safe Documentation](https://docs.safe.global)
   - [Safe Transaction Service API](https://safe-transaction-sepolia.safe.global)

3. **Common Pitfalls:**
   - Using wrong Safe address
   - Missing API keys
   - Not checksumming addresses
   - Calling SafeApiKit instead of custom helpers
   - Not handling empty responses

---

## Prevention Best Practices

### 1. Always Checksum Addresses
```typescript
import { getAddress } from 'viem';
const address = getAddress(rawAddress);
```

### 2. Use Custom Safe API Helpers
```typescript
import { proposeTransaction } from '@/lib/safeTxService';
// NOT: new SafeApiKit()
```

### 3. Check Threshold Before Actions
```typescript
const threshold = await safeSdk.getThreshold();
if (threshold > 1) {
  // Propose to service
} else {
  // Execute immediately
}
```

### 4. Handle Empty Responses
```typescript
const text = await response.text();
if (!text) return;
return JSON.parse(text);
```

### 5. Add Comprehensive Logging
```typescript
console.log("🔍 Action:", action);
console.log("📦 Response:", response);
console.log("✅ Success:", result);
console.log("❌ Error:", error);
```

---

## Quick Reference

### Environment Variables
```env
NEXT_PUBLIC_PARA_API_KEY=<from Para Dashboard>
NEXT_PUBLIC_SAFE_API_KEY=<from Safe Developer Portal>
NEXT_PUBLIC_APP_NAME=NGO Wallet Management
```

### Key URLs
- Para Dashboard: https://dashboard.getpara.com
- Safe Developer: https://developer.safe.global
- Safe UI (Sepolia): https://app.safe.global
- Sepolia Etherscan: https://sepolia.etherscan.io
- Safe TX Service: https://api.safe.global/tx-service/sep/api/v1

### Key Commands
```bash
npm run dev          # Start development
npm run build        # Production build
npm start            # Production server
npx tsc --noEmit     # Type check only
```

### Key Files
- `src/lib/safeTxService.ts` - Safe API client
- `src/lib/safeHelpers.ts` - Safe SDK helpers
- `src/config/network.ts` - Network config
- `.env.local` - Environment variables
