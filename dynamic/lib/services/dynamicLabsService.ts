/**
 * Dynamic Labs Service
 * Handles integration with Dynamic Labs API for vault and wallet creation
 */

// Import WaasApi from @dynamic-labs/sdk-api for SDK usage
// Also use direct API calls as fallback
import { WaasApi, Configuration, UserIdentifierTypeEnum, WaasChainEnum } from '@dynamic-labs/sdk-api';

interface DynamicCredentials {
  environmentId: string;
  authToken: string;
}

interface CreateUserResponse {
  id?: string;
  userId?: string;
  data?: { id?: string };
  user?: { id?: string };
}

interface CreateWalletResponse {
  wallet?: {
    address?: string;
    publicKey?: string;
    id?: string;
  };
  user?: {
    walletPublicKey?: string;
    wallets?: Array<{ 
      publicKey?: string; 
      address?: string;
      id?: string;
      createdAt?: string;
    }>;
    verifiedCredentials?: Array<{ address?: string }>;
  };
  wallets?: Array<{
    address?: string;
    publicKey?: string;
    id?: string;
  }>;
  walletAddress?: string;
  address?: string;
  publicWalletAddress?: string;
  id?: string;
}

export class DynamicLabsService {
  private getCredentials(): DynamicCredentials | null {
    const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
    const authToken = process.env.NEXT_PUBLIC_DYNAMIC_AUTH_TOKEN;

    if (!environmentId || !authToken) {
      return null;
    }

    return { environmentId, authToken };
  }

  /**
   * Create user in Dynamic Labs
   */
  async createUserInDynamicLabs(
    email: string,
    firstName: string,
    lastName: string,
    environmentId: string,
    authToken: string
  ): Promise<string> {
    try {
      const apiUrl = `https://app.dynamic.xyz/api/v0/environments/${environmentId}/users`;
      
      // Generate UUID v4
      const userId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: userId,
          email: email.toLowerCase(),
          firstName: firstName || email.split('@')[0],
          lastName: lastName || '',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();

        // User already exists - try to get existing user
        if (response.status === 409) {
          const getUserUrl = `https://app.dynamic.xyz/api/v0/environments/${environmentId}/users?email=${encodeURIComponent(email.toLowerCase())}`;
          const getResponse = await fetch(getUserUrl, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
          });

          if (getResponse.ok) {
            const userData = await getResponse.json();
            const user = Array.isArray(userData) ? userData[0] : userData;
            const existingUserId =
              user?.id || user?.userId || userData?.data?.id || userData?.id;
            if (existingUserId) return existingUserId;
          }

        // Return original error from Dynamic
        let errorData: any = {};
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          // Not JSON, use as string
        }
        const errorMessage = errorData?.error || errorData?.message || errorText;
        throw new Error(errorMessage);
      }

      // Return original error from Dynamic
      let errorData: any = {};
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        // Not JSON, use as string
      }
      const errorMessage = errorData?.error || errorData?.message || errorText;
      throw new Error(errorMessage);
      }

      const userData: CreateUserResponse = await response.json();
      const dynamicUserId =
        userData.id ||
        userData.userId ||
        userData.data?.id ||
        userData.user?.id;

      if (!dynamicUserId) {
        throw new Error(
          `User created but no user ID returned. Response: ${JSON.stringify(userData)}`
        );
      }

      return dynamicUserId;
    } catch (error: any) {
      // Return original error from Dynamic, do not transform
      throw error;
    }
  }

  /**
   * Get user information from Dynamic Labs by user ID
   */
  async getUserById(dynamicUserId: string): Promise<{
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  } | null> {
    const credentials = this.getCredentials();
    if (!credentials) {
      throw new Error(
        'Environment ID and AuthToken are required. Please set DYNAMIC_ENVIRONMENT_ID and DYNAMIC_AUTH_TOKEN in .env file.'
      );
    }

    try {
      const apiUrl = `https://app.dynamic.xyz/api/v0/environments/${credentials.environmentId}/users/${dynamicUserId}`;
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${credentials.authToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null; // User not found
        }
        const errorText = await response.text();
        // Return original error from Dynamic
        let errorData: any = {};
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          // Not JSON, use as string
        }
        const errorMessage = errorData?.error || errorData?.message || errorText;
        throw new Error(errorMessage);
      }

      const userData = await response.json();
      return {
        id: userData.id || dynamicUserId,
        email: userData.email || '',
        firstName: userData.firstName,
        lastName: userData.lastName,
      };
    } catch (error: any) {
      // Return original error from Dynamic, do not transform
      throw error;
    }
  }

  /**
   * Trigger delegation for a wallet
   * This method attempts to trigger delegation via Dynamic Labs API
   * Note: Delegation typically requires user interaction, so this may not be fully supported server-side
   * According to Dynamic Labs docs, delegation is typically triggered client-side using useWalletDelegation hook
   */
  async triggerDelegation(
    walletId: string,
    delegateEmail: string,
    webhookUrl?: string
  ): Promise<{
    success: boolean;
    message: string;
    delegationId?: string;
    requiresClientSide?: boolean;
  }> {
    const credentials = this.getCredentials();
    if (!credentials) {
      throw new Error(
        'Environment ID and AuthToken are required. Please set DYNAMIC_ENVIRONMENT_ID and DYNAMIC_AUTH_TOKEN in .env file.'
      );
    }

    // Get webhook URL from environment or use provided one
    const effectiveWebhookUrl = webhookUrl || 
      process.env.NEXT_PUBLIC_DYNAMIC_DELEGATION_WEBHOOK_URL ||
      (process.env.NEXT_PUBLIC_APP_URL 
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/delegation`
        : undefined);

    // Try multiple possible endpoints (in case API structure changes)
    const endpoints = [
      // Primary endpoint
      `https://app.dynamic.xyz/api/v0/environments/${credentials.environmentId}/wallets/${walletId}/delegate`,
      // Alternative endpoint structure
      `https://app.dynamic.xyz/api/v0/environments/${credentials.environmentId}/waas/wallets/${walletId}/delegate`,
      // Alternative with users path
      `https://app.dynamic.xyz/api/v0/environments/${credentials.environmentId}/users/${walletId}/delegate`,
      // Alternative dynamicauth.com domain
      `https://app.dynamicauth.com/api/v0/environments/${credentials.environmentId}/wallets/${walletId}/delegate`,
    ];

    const requestBody: any = {
      delegateEmail: delegateEmail.toLowerCase(),
    };

    if (effectiveWebhookUrl) {
      requestBody.webhookUrl = effectiveWebhookUrl;
    }

    // Try each endpoint
    for (const apiUrl of endpoints) {
      try {
        console.log('Attempting delegation via Dynamic Labs API:', {
          apiUrl,
          walletId,
          delegateEmail,
          webhookUrl: effectiveWebhookUrl,
        });

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${credentials.authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (response.ok) {
          const result = await response.json();
          console.log('Delegation triggered successfully via API:', {
            apiUrl,
            result,
          });
          return {
            success: true,
            message: 'Delegation triggered successfully via server-side API',
            delegationId: result.delegationId || result.id || result.delegation?.id || result.data?.id,
          };
        }

        const errorText = await response.text();
        // 404 is expected - Dynamic Labs does NOT provide server-side delegation API
        if (response.status === 404) {
          console.log(`ℹ️ Delegation API endpoint not found (${response.status}) - This is EXPECTED behavior.`, {
            apiUrl,
            note: 'Dynamic Labs does not provide server-side delegation API. Use client-side SDK instead.',
          });
        } else {
          console.log(`Delegation API attempt failed (${response.status}):`, {
            apiUrl,
            status: response.status,
            error: errorText,
          });
        }

        // If endpoint doesn't exist (404), try next endpoint
        if (response.status === 404) {
          continue; // Try next endpoint
        }

        // If unauthorized, return error (don't try other endpoints)
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            `Authentication failed (${response.status}). Please verify your API token has delegation permissions. ${errorText}`
          );
        }

        // For other errors, try next endpoint
        continue;
      } catch (error: any) {
        // Network errors or other issues - try next endpoint
        console.warn(`Error trying endpoint ${apiUrl}:`, error.message);
        continue;
      }
    }

    // All endpoints failed - delegation must be triggered client-side
    console.log('ℹ️ All delegation API endpoints returned 404 - This is EXPECTED behavior.');
    console.log('✅ Dynamic Labs does NOT provide server-side delegation API.');
    console.log('✅ Delegation must be triggered via client-side SDK (useWalletDelegation hook).');
    return {
      success: false,
      message: 'Delegation API endpoint not available. Delegation must be triggered via client-side SDK using useWalletDelegation hook.',
      requiresClientSide: true,
    };
  }

  /**
   * Create vault (creates user in Dynamic Labs)
   */
  async createVault(adminEmail: string, vaultName: string): Promise<{
    dynamicUserId: string;
    message: string;
  }> {
    const credentials = this.getCredentials();
    if (!credentials) {
      throw new Error(
        'Environment ID and AuthToken are required. Please set DYNAMIC_ENVIRONMENT_ID and DYNAMIC_AUTH_TOKEN in .env file.'
      );
    }

    const firstName = adminEmail.split('@')[0];
    const dynamicUserId = await this.createUserInDynamicLabs(
      adminEmail,
      firstName,
      '',
      credentials.environmentId,
      credentials.authToken
    );

    return {
      dynamicUserId,
      message: `Vault created successfully. User created in Dynamic Labs (ID: ${dynamicUserId}).`,
    };
  }

  /**
   * Create dynamic wallet for user
   * Uses dynamicVaultId (Dynamic Labs user ID) to create wallet
   * If dynamicVaultId is provided, email is not required
   * Supports multi-wallet creation by including walletName
   */
  /**
   * Create WaaS wallet using DynamicWaasClient (Admin client)
   * This is the recommended way to create WaaS wallets
   * 
   * Steps:
   * 1. Create identity for user (if not exists)
   * 2. Create vault for user (if not exists)
   * 3. Create wallet in vault
   */
  async createWaasWallet(
    userEmail: string,
    dynamicVaultId?: string,
    walletName?: string
  ): Promise<{
    walletAddress: string;
    dynamicWalletId: string;
    identityId: string;
    vaultId: string;
  }> {
    const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
    const waasAdminToken = process.env.DYNAMIC_WAAS_ADMIN_TOKEN;

    if (!environmentId) {
      throw new Error(
        'DYNAMIC_ENVIRONMENT_ID or DYNAMIC_ENV_ID is required. Please set it in .env file.'
      );
    }

    if (!waasAdminToken) {
      throw new Error(
        'DYNAMIC_WAAS_ADMIN_TOKEN is required. Please set it in .env file. This should be your WaaS admin token (waas_xxx).'
      );
    }

    console.log('🚀 Creating WaaS wallet using SDK + Direct API...', {
      userEmail,
      dynamicVaultId,
      walletName,
      environmentId,
      hasWaasAdminToken: !!waasAdminToken,
    });

    // METHOD 1: Try SDK first (simpler - auto-creates user/vault)
    try {
      const config = new Configuration({
        accessToken: waasAdminToken,
        basePath: `https://app.dynamic.xyz/api/v0`,
      });
      const waasApi = new WaasApi(config);
      
      console.log('📦 METHOD 1: Attempting to create wallet using WaasApi SDK...');
      console.log('ℹ️ SDK method will auto-create user/vault if not exists');
      
      const walletResponse = await waasApi.createWaasWallet({
        environmentId,
        createUserWaasWalletsRequest: {
          identifier: userEmail.toLowerCase(),
          type: UserIdentifierTypeEnum.Email,
          chains: [WaasChainEnum.Evm],
        },
      });
      
      // Extract wallet from SDK response
      const wallets = (walletResponse.user as any)?.wallets || (walletResponse as any)?.wallets || [];
      if (wallets.length > 0) {
        const latestWallet = wallets[wallets.length - 1];
        const walletAddress = latestWallet.address || latestWallet.publicKey || '';
        const dynamicWalletId = latestWallet.id || walletAddress;
        const identityId = (walletResponse.user as any)?.identityId || (walletResponse as any)?.identityId || dynamicVaultId || '';
        const vaultId = (walletResponse.user as any)?.vaultId || (walletResponse.user as any)?.id || dynamicVaultId || '';
        
        if (walletAddress) {
          console.log('✅ WaaS wallet created successfully using WaasApi SDK:', {
            walletAddress,
            dynamicWalletId,
            identityId,
            vaultId,
            method: 'SDK (WaasApi.createWaasWallet)',
          });
          
          return {
            walletAddress,
            dynamicWalletId,
            identityId,
            vaultId,
          };
        }
      }
      
      throw new Error('SDK response missing wallet address');
    } catch (sdkError: any) {
      console.warn('⚠️ METHOD 1 (SDK) failed, falling back to METHOD 2 (Direct API):', sdkError.message);
      // Continue to Direct API method below
    }

    // METHOD 2: Direct API (create identity → vault → wallet manually)
    console.log('📡 METHOD 2: Using Direct API method...');
    console.log('ℹ️ This method creates identity → vault → wallet step by step');
    
    let identityId: string;
    let vaultId: string;

    try {
      // STEP 1: Create or get identity for user
      console.log('STEP 1: Creating identity for user:', userEmail);
      const identityUrl = `https://app.dynamic.xyz/api/v0/environments/${environmentId}/waas/identities`;
      const identityResponse = await fetch(identityUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${waasAdminToken}`,
        },
        body: JSON.stringify({
          email: userEmail.toLowerCase(),
        }),
      });

      if (!identityResponse.ok) {
        const errorText = await identityResponse.text();
        // Return original error from Dynamic
        let errorData: any = {};
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          // Not JSON, use as string
        }
        const errorMessage = errorData?.error || errorData?.message || errorText;
        throw new Error(errorMessage);
      }

      const identity = await identityResponse.json();
      identityId = identity.id || identity.data?.id;
      console.log('✅ Identity created/found:', identityId);

      // STEP 2: Create vault for user
      // If dynamicVaultId is provided, it might be the vault ID
      if (dynamicVaultId) {
        try {
          // Try to get vault by ID
          const vaultUrl = `https://app.dynamic.xyz/api/v0/environments/${environmentId}/waas/vaults/${dynamicVaultId}`;
          const vaultResponse = await fetch(vaultUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${waasAdminToken}`,
            },
          });

          if (vaultResponse.ok) {
            const existingVault = await vaultResponse.json();
            vaultId = existingVault.id || existingVault.data?.id || dynamicVaultId;
            console.log('✅ Using existing vault:', vaultId);
          } else {
            throw new Error('Vault not found');
          }
        } catch (error) {
          // If not found, create new vault
          console.log('Vault not found, creating new vault for identity:', identityId);
          const vaultUrl = `https://app.dynamic.xyz/api/v0/environments/${environmentId}/waas/vaults`;
          const vaultResponse = await fetch(vaultUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${waasAdminToken}`,
            },
            body: JSON.stringify({
              ownerIdentityId: identityId,
            }),
          });

          if (!vaultResponse.ok) {
            const errorText = await vaultResponse.text();
            // Return original error from Dynamic
            let errorData: any = {};
            try {
              errorData = JSON.parse(errorText);
            } catch (e) {
              // Not JSON, use as string
            }
            const errorMessage = errorData?.error || errorData?.message || errorText;
            throw new Error(errorMessage);
          }

          const vault = await vaultResponse.json();
          vaultId = vault.id || vault.data?.id;
          console.log('✅ Vault created:', vaultId);
        }
      } else {
        // Create new vault
        console.log('Creating new vault for identity:', identityId);
        const vaultUrl = `https://app.dynamic.xyz/api/v0/environments/${environmentId}/waas/vaults`;
        const vaultResponse = await fetch(vaultUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${waasAdminToken}`,
          },
          body: JSON.stringify({
            ownerIdentityId: identityId,
          }),
        });

        if (!vaultResponse.ok) {
          const errorText = await vaultResponse.text();
          // Return original error from Dynamic
          let errorData: any = {};
          try {
            errorData = JSON.parse(errorText);
          } catch (e) {
            // Not JSON, use as string
          }
          const errorMessage = errorData?.error || errorData?.message || errorText;
          throw new Error(errorMessage);
        }

        const vault = await vaultResponse.json();
        vaultId = vault.id || vault.data?.id;
        console.log('✅ Vault created:', vaultId);
      }

      // STEP 3: Create wallet in vault
      console.log('Creating WaaS wallet in vault:', vaultId);
      
      let wallet: any;
      let useSDK = false;
      
      // Try using WaasApi SDK first (simpler - automatically creates user/vault if needed)
      try {
        const config = new Configuration({
          accessToken: waasAdminToken,
          basePath: `https://app.dynamic.xyz/api/v0`,
        });
        const waasApi = new WaasApi(config);
        
        console.log('📦 Attempting to create wallet using WaasApi SDK...');
        // WaasApi.createWaasWallet can create wallet with just email
        // It will automatically create user/vault if not exists
        const walletResponse = await waasApi.createWaasWallet({
          environmentId,
          createUserWaasWalletsRequest: {
            identifier: userEmail.toLowerCase(),
            type: UserIdentifierTypeEnum.Email,
            chains: [WaasChainEnum.Evm],
          },
        });
        
        wallet = walletResponse;
        useSDK = true;
        console.log('✅ Wallet created using WaasApi SDK');
      } catch (sdkError: any) {
        console.warn('⚠️ WaasApi SDK method failed, using direct API:', sdkError.message);
        useSDK = false;
      }
      
      // Fallback to direct API call (using identity/vault we created above)
      if (!useSDK || !wallet) {
        console.log('📡 Using direct API call to create wallet (with vaultId)...');
        const walletUrl = `https://app.dynamic.xyz/api/v0/environments/${environmentId}/waas/wallets`;
        const walletResponse = await fetch(walletUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${waasAdminToken}`,
          },
          body: JSON.stringify({
            vaultId: vaultId,
            chain: 'EVM',
            keyType: 'MPC', // or 'Threshold' - both create MPC wallets
          }),
        });

        if (!walletResponse.ok) {
          const errorText = await walletResponse.text();
          // Return original error from Dynamic
          let errorData: any = {};
          try {
            errorData = JSON.parse(errorText);
          } catch (e) {
            // Not JSON, use as string
          }
          const errorMessage = errorData?.error || errorData?.message || errorText;
          throw new Error(errorMessage);
        }

        wallet = await walletResponse.json();
        console.log('✅ Wallet created using direct API');
      }

      // Extract wallet address from response
      // WaasApi returns UserResponse with user.wallets array
      // Direct API returns wallet object directly
      let walletAddress: string = '';
      let dynamicWalletId: string = '';
      
      if (useSDK && wallet) {
        // SDK response: UserResponse with user.wallets array
        const wallets = wallet.user?.wallets || wallet.wallets || [];
        if (wallets.length > 0) {
          const latestWallet = wallets[wallets.length - 1];
          walletAddress = latestWallet.address || latestWallet.publicKey || '';
          dynamicWalletId = latestWallet.id || walletAddress;
        }
      } else {
        // Direct API response: wallet object
        walletAddress = wallet.address 
          || wallet.publicKey 
          || wallet.data?.address 
          || wallet.data?.publicKey
          || '';
        dynamicWalletId = wallet.id 
          || wallet.data?.id 
          || walletAddress;
      }

      if (!walletAddress) {
        throw new Error('Wallet created but no address returned');
      }

      console.log('✅ WaaS wallet created successfully:', {
        walletAddress,
        dynamicWalletId,
        identityId,
        vaultId,
        keyType: wallet.keyType || wallet.data?.keyType || 'MPC',
      });

      return {
        walletAddress,
        dynamicWalletId,
        identityId,
        vaultId,
      };
    } catch (error: any) {
      console.error('❌ Failed to create WaaS wallet:', error);
      // Return original error from Dynamic, do not transform
      throw error;
    }
  }

  async createWallet(
    userEmail: string = '',
    dynamicVaultId?: string,
    walletName?: string
  ): Promise<{
    walletAddress: string;
    dynamicWalletId: string;
  }> {
    // Try WaaS Admin client first (recommended method)
    const waasAdminToken = process.env.DYNAMIC_WAAS_ADMIN_TOKEN;
    
    if (waasAdminToken) {
      try {
        console.log('🚀 Attempting to create WaaS wallet using DynamicWaasClient...');
        const waasResult = await this.createWaasWallet(userEmail, dynamicVaultId, walletName);
        console.log('✅ WaaS wallet created successfully using DynamicWaasClient');
        return {
          walletAddress: waasResult.walletAddress,
          dynamicWalletId: waasResult.dynamicWalletId,
        };
      } catch (waasError: any) {
        console.warn('⚠️ WaaS Admin client failed, falling back to API method:', waasError.message);
        // Fallback to API method below
      }
    } else {
      console.log('ℹ️ DYNAMIC_WAAS_ADMIN_TOKEN not found, using API method');
    }
    const credentials = this.getCredentials();
    if (!credentials) {
      throw new Error(
        'Environment ID and AuthToken are required. Please set DYNAMIC_ENVIRONMENT_ID and DYNAMIC_AUTH_TOKEN in .env file.'
      );
    }

    // If dynamicVaultId is provided, use it directly (vault admin's Dynamic Labs user ID)
    // Otherwise, create/ensure user exists in Dynamic Labs
    // let dynamicUserId = dynamicVaultId;
    
    // if (!dynamicUserId) {
    //   // Ensure user exists in Dynamic Labs
    //   dynamicUserId = await this.createUserInDynamicLabs(
    //     userEmail,
    //     userEmail.split('@')[0],
    //     '',
    //     credentials.environmentId,
    //     credentials.authToken
    //   );
    // }

    // Create embedded wallet for user using Dynamic Labs API
    // Option 1: Use user ID endpoint (if dynamicVaultId is provided)
    // Option 2: Use identifier endpoint (email-based)
    
    let createWalletUrl: string;
    let requestBody: any;

    if (dynamicVaultId) {
      // Need to get user email from user ID first, or use user ID as identifier
      // Try to get user info first to get email
      let userEmailForWallet = userEmail?.trim() || '';
      
      console.log('createWallet - dynamicVaultId provided:', {
        dynamicVaultId,
        userEmailProvided: userEmail,
        userEmailForWallet,
      });
      
      if (!userEmailForWallet) {
        try {
          // Try to get user info by ID to get email
          const getUserUrl = `https://app.dynamic.xyz/api/v0/environments/${credentials.environmentId}/users/${dynamicVaultId}`;
          const userResponse = await fetch(getUserUrl, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${credentials.authToken}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (userResponse.ok) {
            const userData = await userResponse.json();
            userEmailForWallet = userData.email || userData.user?.email || userData.data?.email;
          }
        } catch (error) {
          console.warn('Could not fetch user email, will try with user ID as identifier');
        }
      }
      
      // For multi-wallet, the /embeddedWallets endpoint may only return existing wallet
      // Try a different approach: Check if we need to create additional wallet
      // by first checking existing wallets, then creating new one if needed
      
      // First, try to get existing wallets to see if we need to create a new one
      let existingWalletsCount = 0;
      try {
        const getUserUrl = `https://app.dynamic.xyz/api/v0/environments/${credentials.environmentId}/users/${dynamicVaultId}`;
        const userResponse = await fetch(getUserUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${credentials.authToken}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (userResponse.ok) {
          const userData = await userResponse.json();
          const wallets = userData.wallets || userData.user?.wallets || [];
          existingWalletsCount = Array.isArray(wallets) ? wallets.length : 0;
          console.log(`User has ${existingWalletsCount} existing wallet(s)`);
        }
      } catch (error) {
        console.warn('Could not fetch existing wallets:', error);
      }
      
      // Use embeddedWallets endpoint - this should create a new wallet if multi-wallet is enabled
      console.log('11111111111111111111111')
      createWalletUrl = `https://app.dynamicauth.com/api/v0/environments/${credentials.environmentId}/embeddedWallets`;
      
      // Use email as identifier (required for embeddedWallets endpoint)
      requestBody = {
        identifier: userEmailForWallet.toLowerCase(),
        type: 'email',
        chain: 'EVM',
      };
      
      // Add walletName if provided (for multi-wallet support)
      // This is crucial - each wallet must have a unique name
      if (walletName) {
        requestBody.walletName = walletName;
      }
      
      // Try adding userId - may be needed for multi-wallet creation
      requestBody.userId = dynamicVaultId;
      
      // Try adding a flag to indicate this is an additional wallet
      if (existingWalletsCount > 0) {
        requestBody.createAdditional = true;
      }
      
      // Note: The /users/{userId}/wallets endpoint requires publicWalletAddress and walletProvider
      // which means it's for adding existing wallets, not creating new embedded wallets
    } else {
      // Use identifier endpoint - create wallet by email identifier
      console.log('22222222222222222222222')
      createWalletUrl = `https://app.dynamicauth.com/api/v0/environments/${credentials.environmentId}/embeddedWallets`;
      requestBody = {
        identifier: userEmail.toLowerCase(),
        type: 'email',
        chain: 'EVM', // Must be EVM, SOL, SUI, or BTC (not ETH)
      };
      
      // Add walletName if provided (for multi-wallet support)
      if (walletName) {
        requestBody.walletName = walletName;
      }
    }

    console.log('Creating wallet with:', {
      url: createWalletUrl,
      hasDynamicVaultId: !!dynamicVaultId,
      requestBody,
    });

    const walletResponse = await fetch(createWalletUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.authToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!walletResponse.ok) {
      const errorText = await walletResponse.text();
      console.error('Dynamic Labs API Error:', {
        status: walletResponse.status,
        statusText: walletResponse.statusText,
        error: errorText,
        url: createWalletUrl,
      });
      // Return original error from Dynamic
      let errorData: any = {};
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        // Not JSON, use as string
      }
      const errorMessage = errorData?.error || errorData?.message || errorText;
      throw new Error(errorMessage);
    }

    const walletData: CreateWalletResponse = await walletResponse.json();

    console.log('Wallet creation response:', JSON.stringify(walletData, null, 2));

    // Extract wallet address from response
    // For multi-wallet, response may contain an array of wallets
    // We need to get the newest wallet (last in array or specific new wallet)
    let walletAddress: string | undefined;
    
    // Check if response has wallets array (multi-wallet scenario)
    if (walletData.user?.wallets && Array.isArray(walletData.user.wallets) && walletData.user.wallets.length > 0) {
      // If walletName was provided, try to find wallet with that name
      if (walletName) {
        const namedWallet = walletData.user.wallets.find((w: any) => w.name === walletName);
        if (namedWallet) {
          walletAddress = namedWallet.address || namedWallet.publicKey;
          console.log(`Found wallet with name "${walletName}":`, walletAddress);
        }
      }
      
      // If not found by name, get the last wallet in the array (newest one)
      if (!walletAddress) {
        const newestWallet = walletData.user.wallets[walletData.user.wallets.length - 1];
        walletAddress = newestWallet.address || newestWallet.publicKey;
        console.log(`Found ${walletData.user.wallets.length} wallets, using newest (last in array):`, walletAddress);
        console.log('All wallets:', walletData.user.wallets.map((w: any) => ({ 
          address: w.address || w.publicKey, 
          name: w.name,
          id: w.id 
        })));
      }
    }
    
    // Check top-level wallets array if exists
    if (!walletAddress && walletData.wallets && Array.isArray(walletData.wallets) && walletData.wallets.length > 0) {
      const newestWallet = walletData.wallets[walletData.wallets.length - 1];
      walletAddress = newestWallet.address || newestWallet.publicKey;
      console.log(`Found ${walletData.wallets.length} wallets in top-level array, using newest:`, walletAddress);
    }
    
    // Fallback to other response formats
    if (!walletAddress) {
      walletAddress =
        walletData.wallet?.address ||
        walletData.address ||
        walletData.publicWalletAddress ||
        walletData.user?.walletPublicKey ||
        walletData.user?.wallets?.[0]?.publicKey ||
        walletData.user?.wallets?.[0]?.address ||
        walletData.user?.verifiedCredentials?.[0]?.address ||
        walletData.walletAddress;
    }

    if (!walletAddress) {
      throw new Error(
        `Wallet created but no address returned. Response: ${JSON.stringify(walletData)}`
      );
    }

    return {
      walletAddress,
      dynamicWalletId: walletAddress,
    };
  }

  /**
   * Exchange API token for JWT token
   * Policy API requires JWT token instead of API token
   */
  private async exchangeApiTokenForJWT(): Promise<string | null> {
    try {
      const credentials = this.getCredentials();
      if (!credentials) return null;

      // Try different endpoints to exchange API token for JWT
      // Note: These endpoints may not exist - JWT is typically obtained from client-side SDK
      const endpoints = [
        `https://app.dynamic.xyz/api/v0/auth/token`,
        `https://app.dynamic.xyz/api/v0/sdk/${credentials.environmentId}/auth/token`,
        `https://app.dynamicauth.com/api/v0/auth/token`,
        `https://app.dynamicauth.com/api/v0/sdk/${credentials.environmentId}/auth/token`,
        `https://app.dynamicauth.com/api/v0/oauth/token`,
      ];

      for (const endpoint of endpoints) {
        try {
          console.log(`Attempting to exchange token at: ${endpoint}`);
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${credentials.authToken}`,
              Accept: 'application/json',
            },
            body: JSON.stringify({ grant_type: 'client_credentials' }),
          });

          const responseText = await response.text();
          console.log(`Response from ${endpoint}:`, {
            status: response.status,
            statusText: response.statusText,
            body: responseText,
          });

          if (response.ok) {
            try {
              const data = JSON.parse(responseText);
              const jwtToken = data.access_token || data.token || data.jwt || data.id_token;
              // JWT tokens start with 'eyJ' (base64 encoded '{"')
              if (jwtToken && typeof jwtToken === 'string' && jwtToken.startsWith('eyJ')) {
                console.log('Successfully exchanged API token for JWT');
                return jwtToken;
              } else {
                console.warn(`Token found but doesn't look like JWT:`, jwtToken?.substring(0, 20));
              }
            } catch (parseError) {
              console.warn(`Failed to parse response from ${endpoint}:`, parseError);
            }
          } else {
            console.warn(`Failed to exchange token at ${endpoint}: ${response.status} - ${responseText}`);
          }
        } catch (error: any) {
          console.warn(`Error exchanging token at ${endpoint}:`, error.message);
          // Continue to next endpoint
        }
      }

      console.warn('Failed to exchange API token for JWT from all endpoints');
      console.warn(
        'Note: JWT tokens are typically obtained from client-side SDK using getAuthToken().\n' +
        'If Policy API requires JWT, you may need to:\n' +
        '1. Get JWT from client-side SDK (Dynamic Labs SDK)\n' +
        '2. Pass JWT as a parameter to the createPolicy function\n' +
        '3. Or check if Policy API accepts API token with proper scopes'
      );
      return null;
    } catch (error: any) {
      console.error('Error exchanging API token for JWT:', error);
      return null;
    }
  }

  /**
   * Create policy in Dynamic Labs Policy Engine
   * Uses API token (like Dashboard) - no JWT required
   */
  async createPolicy(
    policyType: string,
    policyConfig: any,
    walletAddress?: string,
    environmentId?: string,
    userJwtToken?: string // Deprecated: Not used anymore, kept for backward compatibility
  ): Promise<{ dynamicPolicyId: string | null }> {
    const credentials = this.getCredentials();
    const envId = environmentId || credentials?.environmentId;
    const apiToken = credentials?.authToken; // API token (DYNAMIC_AUTH_TOKEN or DYNAMIC_API_KEY)

    if (!envId || !apiToken) {
      throw new Error(
        'Environment ID and API Token are required for policy creation.\n\n' +
        'Please set DYNAMIC_ENVIRONMENT_ID and DYNAMIC_AUTH_TOKEN (or DYNAMIC_API_KEY) in your .env file.'
      );
    }

    console.log('createPolicy - Using API token (like Dashboard):', {
      environmentId: envId,
      apiTokenLength: apiToken?.length,
      apiTokenStart: apiToken?.substring(0, 20) + '...',
      note: 'Using API token instead of JWT (like Dashboard)',
    });

    // Convert policy config to Dynamic Labs format
    const dynamicPolicyRule = this.convertPolicyToDynamicLabsFormat(
      policyType,
      policyConfig,
      walletAddress
    );

    if (!dynamicPolicyRule) {
      throw new Error(
        `Cannot convert policy type "${policyType}" to Dynamic Labs format.`
      );
    }

    // Call Dynamic Labs Policy Engine API
    // According to official docs: https://www.dynamic.xyz/docs/wallets/embedded-wallets/mpc/policies
    // Endpoint: POST /api/v0/environments/{environmentId}/waas/policies
    // Note: Policy API uses app.dynamicauth.com (not app.dynamic.xyz)
    // Using API token (like Dashboard) - no JWT required
    const apiUrl = `https://app.dynamicauth.com/api/v0/environments/${envId}/waas/policies`;

    // Log the exact payload being sent for debugging
    const requestPayload = {
      rulesToAdd: [dynamicPolicyRule],
    };
    console.log('Policy API Request Payload:', JSON.stringify(requestPayload, null, 2));

    // Use API token directly (like Dashboard)
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`, // Use API token (like Dashboard)
        'User-Agent': 'CoalaPay-Server/1.0',
        Accept: 'application/json',
      },
      body: JSON.stringify(requestPayload),
    });
    
    console.log(`Policy API request completed, status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      let errorData: any = {};
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        // Not JSON, use as string
      }

      console.error('Dynamic Labs Policy API Error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        errorData,
        url: apiUrl,
        requestBody: requestPayload,
        apiTokenLength: apiToken?.length,
        apiTokenStart: apiToken?.substring(0, 20) + '...',
      });

      // Return original error from Dynamic, do not transform
      const errorMessage = errorData?.error || errorData?.message || errorText;
      throw new Error(errorMessage);
    }

    const result = await response.json();
    console.log('Policy creation response:', JSON.stringify(result, null, 2));

    // Extract rule ID from response
    // According to docs, response should contain rules array with id field
    let dynamicPolicyId: string | null = null;
    if (result.rules && Array.isArray(result.rules) && result.rules.length > 0) {
      // Response format: { rules: [{ id: "...", ... }] }
      dynamicPolicyId = result.rules[0].id || result.rules[0].ruleId || null;
    } else if (result.rule && result.rule.id) {
      // Alternative format: { rule: { id: "..." } }
      dynamicPolicyId = result.rule.id;
    } else if (result.id) {
      // Single rule response: { id: "..." }
      dynamicPolicyId = result.id;
    } else if (result.data && result.data.id) {
      // Wrapped response: { data: { id: "..." } }
      dynamicPolicyId = result.data.id;
    }

    if (!dynamicPolicyId) {
      console.warn('Policy created but no ID returned. Response:', result);
      // Policy might still be created, but we can't track it
    }

    return { dynamicPolicyId };
  }

  /**
   * Retrieve policies from Dynamic Labs Policy Engine
   * Note: Policy API requires JWT token, not API token
   */
  async getPolicies(
    environmentId?: string,
    walletAddress?: string,
    userJwtToken?: string // Optional: JWT token from client-side SDK
  ): Promise<Array<{
    id: string;
    name: string;
    ruleType: string;
    chain: string;
    chainIds: number[];
    addresses: string[];
    valueLimit?: any;
    metadata?: any;
  }>> {
    const credentials = this.getCredentials();
    const envId = environmentId || credentials?.environmentId;
    const authToken = credentials?.authToken;

    if (!envId || !authToken) {
      throw new Error(
        'Environment ID and AuthToken are required for retrieving policies.'
      );
    }

    // Policy API requires JWT token, not API token
    // JWT token should be obtained from client-side SDK (getAuthToken())
    // If provided, use it; otherwise try to exchange API token (may not work)
    let jwtToken: string | null = userJwtToken || null;
    
    if (!jwtToken) {
      // Try to exchange API token for JWT (this may not work - JWT is typically from SDK)
      jwtToken = await this.exchangeApiTokenForJWT();
    }
    
    if (!jwtToken) {
      throw new Error(
        'JWT token is required for Policy API but not provided.\n\n' +
        'To get JWT token:\n' +
        '1. Use Dynamic Labs SDK on client-side: const jwt = getAuthToken()\n' +
        '2. Pass JWT token to getPolicies function as userJwtToken parameter\n\n' +
        'Alternatively, ensure your API token has waas.policies scope and try again.\n' +
        'Check console logs above for detailed error messages.'
      );
    }

    // Build query parameters
    const queryParams = new URLSearchParams();
    if (walletAddress) {
      queryParams.append('address', walletAddress);
    }

    const apiUrl = `https://app.dynamicauth.com/api/v0/environments/${envId}/waas/policies${queryParams.toString() ? '?' + queryParams.toString() : ''}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwtToken}`, // Policy API requires JWT token
        'User-Agent': 'CoalaPay-Server/1.0',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Dynamic Labs Policy API Error (GET):', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        url: apiUrl,
      });

      // Return original error from Dynamic, do not transform
      let errorData: any = {};
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        // Not JSON, use as string
      }
      const errorMessage = errorData?.error || errorData?.message || errorText;
      throw new Error(errorMessage);
    }

    const result = await response.json();
    console.log('Policy retrieval response:', JSON.stringify(result, null, 2));

    // Extract policies from response
    // Response format might be: { rules: [...] } or { policies: [...] } or just array
    let policies: any[] = [];
    if (Array.isArray(result)) {
      policies = result;
    } else if (result.rules && Array.isArray(result.rules)) {
      policies = result.rules;
    } else if (result.policies && Array.isArray(result.policies)) {
      policies = result.policies;
    } else if (result.data && Array.isArray(result.data)) {
      policies = result.data;
    } else if (result.data && result.data.rules && Array.isArray(result.data.rules)) {
      policies = result.data.rules;
    }

    return policies;
  }

  /**
   * Retrieve a single policy by ID from Dynamic Labs Policy Engine
   */
  async getPolicyById(
    policyId: string,
    environmentId?: string
  ): Promise<{
    id: string;
    name: string;
    ruleType: string;
    chain: string;
    chainIds: number[];
    addresses: string[];
    valueLimit?: any;
    metadata?: any;
  } | null> {
    const credentials = this.getCredentials();
    const envId = environmentId || credentials?.environmentId;
    const authToken = credentials?.authToken;

    if (!envId || !authToken) {
      throw new Error(
        'Environment ID and AuthToken are required for retrieving policy.'
      );
    }

    // Try to get policy by ID
    // Note: Dynamic Labs API might not have direct GET by ID endpoint
    // So we'll get all policies and filter by ID
    try {
      const allPolicies = await this.getPolicies(envId);
      const policy = allPolicies.find(p => p.id === policyId);
      return policy || null;
    } catch (error: any) {
      console.error('Failed to retrieve policy by ID:', error);
      throw error;
    }
  }

  /**
   * Convert internal policy format to Dynamic Labs Policy Engine format
   */
  private convertPolicyToDynamicLabsFormat(
    policyType: string,
    policyConfig: any,
    walletAddress?: string
  ): any | null {
    switch (policyType) {
      case 'spending_limit': {
        const ruleName =
          policyConfig.name ||
          `Spending Limit: ${policyConfig.spendingLimit || 'N/A'}`;

        const valueLimit: any = {};
        if (policyConfig.spendingLimit) {
          if (policyConfig.asset) {
            valueLimit.asset = policyConfig.asset;
          }
          // maxPerCall must be a string according to Dynamic Labs API
          valueLimit.maxPerCall = String(policyConfig.spendingLimit);
        }

        // Build spending limit rule according to Dynamic Labs Policy Engine format
        // Docs: https://www.dynamic.xyz/docs/wallets/embedded-wallets/mpc/policies
        const spendingLimitRule: any = {
          name: ruleName,
          ruleType: 'allow', // 'allow' or 'deny'
          chain: 'EVM', // Must be 'EVM', 'SOL', 'SUI', or 'BTC'
          chainIds: policyConfig.chainIds || [1, 11155111, 137], // Ethereum (1), Sepolia (11155111), Polygon (137)
          addresses: walletAddress ? [walletAddress] : [], // Empty array means apply to all addresses for this wallet
        };

        if (Object.keys(valueLimit).length > 0) {
          spendingLimitRule.valueLimit = valueLimit;
        }

        if (policyConfig.currency || policyConfig.timeWindow) {
          spendingLimitRule.metadata = {
            currency: policyConfig.currency || 'USD',
            timeWindow: policyConfig.timeWindow || 'daily',
          };
        }

        return spendingLimitRule;
      }

      case 'multi_sig': {
        return {
          name:
            policyConfig.name ||
            `Multi-Sig: ${policyConfig.requiredSignatures}/${policyConfig.totalSigners}`,
          ruleType: 'allow',
          chain: 'EVM',
          chainIds: policyConfig.chainIds || [1, 11155111, 137],
          addresses: walletAddress ? [walletAddress] : [],
          metadata: {
            requiredSignatures: policyConfig.requiredSignatures,
            totalSigners: policyConfig.totalSigners,
          },
        };
      }

      case 'time_lock': {
        return {
          name:
            policyConfig.name ||
            `Time Lock: ${policyConfig.timeLockDuration}s`,
          ruleType: 'allow',
          chain: 'EVM',
          chainIds: policyConfig.chainIds || [1, 11155111, 137],
          addresses: walletAddress ? [walletAddress] : [],
          metadata: {
            timeLockDuration: policyConfig.timeLockDuration,
            timeWindow: policyConfig.timeWindow,
          },
        };
      }

      case 'approval_required': {
        return {
          name: policyConfig.name || 'Approval Required',
          ruleType: 'allow',
          chain: 'EVM',
          chainIds: policyConfig.chainIds || [1, 11155111, 137],
          addresses: walletAddress ? [walletAddress] : [],
          metadata: {
            requiresApproval: true,
          },
        };
      }

      default:
        return null;
    }
  }

  /**
   * Get delegations for a user from Dynamic Labs API
   * This method attempts to fetch delegation information from Dynamic Labs
   */
  async getUserDelegations(userId: string): Promise<{
    success: boolean;
    delegations?: any[];
    message?: string;
  }> {
    const credentials = this.getCredentials();
    if (!credentials) {
      return {
        success: false,
        message: 'Environment ID and AuthToken are required',
      };
    }

    try {
      // Try multiple possible endpoints for getting user delegations
      const endpoints = [
        `https://app.dynamic.xyz/api/v0/environments/${credentials.environmentId}/users/${userId}/delegations`,
        `https://app.dynamic.xyz/api/v0/environments/${credentials.environmentId}/waas/users/${userId}/delegations`,
        `https://app.dynamicauth.com/api/v0/environments/${credentials.environmentId}/users/${userId}/delegations`,
      ];

      for (const apiUrl of endpoints) {
        try {
          const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${credentials.authToken}`,
            },
          });

          if (response.ok) {
            const data = await response.json();
            const delegations = Array.isArray(data) ? data : (data.delegations || data.data || []);
            return {
              success: true,
              delegations,
            };
          }
        } catch (error) {
          // Continue to next endpoint
          continue;
        }
      }

      return {
        success: false,
        message: 'No delegation endpoint available or user not found',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to get user delegations',
      };
    }
  }

  /**
   * Get delegations for a wallet from Dynamic Labs API
   * This method attempts to fetch delegation information from Dynamic Labs
   */
  async getWalletDelegations(walletId: string): Promise<{
    success: boolean;
    delegations?: any[];
    message?: string;
  }> {
    const credentials = this.getCredentials();
    if (!credentials) {
      return {
        success: false,
        message: 'Environment ID and AuthToken are required',
      };
    }

    try {
      // Try multiple possible endpoints for getting wallet delegations
      const endpoints = [
        `https://app.dynamic.xyz/api/v0/environments/${credentials.environmentId}/wallets/${walletId}/delegations`,
        `https://app.dynamic.xyz/api/v0/environments/${credentials.environmentId}/waas/wallets/${walletId}/delegations`,
        `https://app.dynamicauth.com/api/v0/environments/${credentials.environmentId}/wallets/${walletId}/delegations`,
      ];

      for (const apiUrl of endpoints) {
        try {
          const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${credentials.authToken}`,
            },
          });

          if (response.ok) {
            const data = await response.json();
            const delegations = Array.isArray(data) ? data : (data.delegations || data.data || []);
            return {
              success: true,
              delegations,
            };
          }
        } catch (error) {
          // Continue to next endpoint
          continue;
        }
      }

      return {
        success: false,
        message: 'No delegation endpoint available or wallet not found',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to get wallet delegations',
      };
    }
  }
}

export const dynamicLabsService = new DynamicLabsService();

