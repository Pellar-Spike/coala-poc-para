/**
 * Dynamic Labs Service
 * Integrates with Dynamic Labs API for vault, wallet, and policy management
 * Based on coala/coalapay-server-v2 DynamicService
 */

interface DynamicCredentials {
  environmentId: string;
  authToken: string;
}

export class DynamicService {
  /**
   * Get Dynamic Labs credentials from environment variables
   */
  private getDynamicCredentials(): DynamicCredentials | null {
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
  private async createUserInDynamicLabs(
    email: string,
    firstName: string,
    lastName: string,
    environmentId: string,
    authToken: string,
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

        if (response.status === 409) {
          // User already exists, try to get existing user
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

      const userData = await response.json();
      const dynamicUserId =
        userData.id || userData.userId || userData.data?.id || userData.user?.id;

      if (!dynamicUserId) {
        throw new Error(
          `User created but no user ID returned. Response: ${JSON.stringify(userData)}`,
        );
      }

      return dynamicUserId;
    } catch (error: any) {
      // Return original error from Dynamic, do not transform
      throw error;
    }
  }

  /**
   * Create vault (creates user in Dynamic Labs)
   */
  async createVault(dto: {
    adminEmail: string;
    vaultName: string;
    organizationId?: string;
    metadata?: Record<string, any>;
  }): Promise<{
    dynamicUserId: string;
    message: string;
  }> {
    const credentials = this.getDynamicCredentials();
    if (!credentials) {
      throw new Error(
        'Environment ID and AuthToken are required. Please set DYNAMIC_ENVIRONMENT_ID and DYNAMIC_AUTH_TOKEN in .env file.',
      );
    }

    const firstName = dto.adminEmail.split('@')[0];
    const dynamicUserId = await this.createUserInDynamicLabs(
      dto.adminEmail,
      firstName,
      '',
      credentials.environmentId,
      credentials.authToken,
    );

    return {
      dynamicUserId,
      message: `Vault created successfully. User created in Dynamic Labs (ID: ${dynamicUserId}).`,
    };
  }

  /**
   * Create dynamic wallet
   */
  async createWallet(dto: {
    vaultId: string;
    userEmail: string;
    walletName?: string;
    purpose?: string;
    countryOffice?: string;
    metadata?: Record<string, any>;
  }): Promise<{
    walletAddress: string;
    dynamicWalletId: string;
  }> {
    const credentials = this.getDynamicCredentials();
    if (!credentials) {
      throw new Error(
        'Environment ID and AuthToken are required. Please set DYNAMIC_ENVIRONMENT_ID and DYNAMIC_AUTH_TOKEN in .env file.',
      );
    }

    const userEmailForAssociation = dto.userEmail.toLowerCase();

    // Ensure user exists in Dynamic Labs before creating wallet
    await this.createUserInDynamicLabs(
      userEmailForAssociation,
      userEmailForAssociation.split('@')[0],
      '',
      credentials.environmentId,
      credentials.authToken,
    );

    // Create embedded wallet for user using Dynamic Labs API
    const createWalletUrl = `https://app.dynamicauth.com/api/v0/environments/${credentials.environmentId}/embeddedWallets`;
    const walletResponse = await fetch(createWalletUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identifier: userEmailForAssociation,
        type: 'email',
        chain: 'EVM', // Must be EVM, SOL, SUI, or BTC (not ETH)
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

    const walletData = await walletResponse.json();

    // Extract wallet address from response
    const walletAddress =
      walletData.user?.walletPublicKey ||
      walletData.user?.wallets?.[0]?.publicKey ||
      walletData.user?.verifiedCredentials?.[0]?.address ||
      walletData.walletAddress ||
      walletData.address ||
      walletData.publicWalletAddress;

    if (!walletAddress) {
      throw new Error(
        `Wallet created but no address returned. Response: ${JSON.stringify(walletData)}`,
      );
    }

    return {
      walletAddress,
      dynamicWalletId: walletAddress,
    };
  }

  /**
   * Exchange API token for JWT
   */
  async exchangeApiTokenForJWT(): Promise<string | null> {
    try {
      const credentials = this.getDynamicCredentials();
      if (!credentials) return null;

      const endpoints = [
        `https://app.dynamicauth.com/api/v0/auth/token`,
        `https://app.dynamicauth.com/api/v0/sdk/${credentials.environmentId}/auth/token`,
        `https://app.dynamicauth.com/api/v0/oauth/token`,
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${credentials.authToken}`,
              Accept: 'application/json',
            },
            body: JSON.stringify({ grant_type: 'client_credentials' }),
          });

          if (response.ok) {
            const data = await response.json();
            const jwtToken = data.access_token || data.token || data.jwt || data.id_token;
            if (jwtToken?.startsWith('eyJ')) return jwtToken;
          }
        } catch (error) {
          // Continue to next endpoint
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Convert policy config to Dynamic Labs format
   */
  private convertPolicyToDynamicLabsFormat(
    policyType: string,
    policyConfig: any,
    walletAddress?: string,
  ): any | null {
    switch (policyType) {
      case 'spending_limit':
        const ruleName = policyConfig.name || `Spending Limit: ${policyConfig.amountThreshold || 'N/A'}`;

        const valueLimit: any = {};
        if (policyConfig.amountThreshold) {
          if (policyConfig.asset) {
            valueLimit.asset = policyConfig.asset;
          }
          valueLimit.maxPerCall = policyConfig.amountThreshold;
        }

        const spendingLimitRule: any = {
          name: ruleName,
          ruleType: 'allow',
          chain: 'EVM',
          chainIds: policyConfig.chainIds || [1, 11155111, 137],
          addresses: walletAddress ? [walletAddress] : [],
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

      case 'multi_sig':
        return {
          name: policyConfig.name || `Multi-Sig: ${policyConfig.requiredSignatures}/${policyConfig.totalSigners}`,
          ruleType: 'allow',
          chain: 'EVM',
          chainIds: policyConfig.chainIds || [1, 11155111, 137],
          addresses: walletAddress ? [walletAddress] : [],
          metadata: {
            requiredSignatures: policyConfig.requiredSignatures,
            totalSigners: policyConfig.totalSigners,
          },
        };

      case 'time_lock':
        return {
          name: policyConfig.name || `Time Lock: ${policyConfig.timeLockDuration}s`,
          ruleType: 'allow',
          chain: 'EVM',
          chainIds: policyConfig.chainIds || [1, 11155111, 137],
          addresses: walletAddress ? [walletAddress] : [],
          metadata: {
            timeLockDuration: policyConfig.timeLockDuration,
            timeWindow: policyConfig.timeWindow,
          },
        };

      default:
        return null;
    }
  }

  /**
   * Create policy in Dynamic Labs
   */
  async createPolicy(dto: {
    policyName: string;
    policyType: string;
    walletId?: string;
    vaultId?: string;
    policyConfig: any;
    userJwtToken?: string;
    walletAddress?: string;
    chainIds?: number[];
  }): Promise<{
    dynamicPolicyId: string | null;
  }> {
    const credentials = this.getDynamicCredentials();
    if (!credentials) {
      throw new Error(
        'Environment ID and AuthToken are required. Please set DYNAMIC_ENVIRONMENT_ID and DYNAMIC_AUTH_TOKEN in .env file.',
      );
    }

    const environmentId = credentials.environmentId;

    // Determine token to use
    let tokenToUse: string | null = null;

    if (dto.userJwtToken) {
      tokenToUse = dto.userJwtToken;
    } else {
      const exchangedJWT = await this.exchangeApiTokenForJWT();
      if (exchangedJWT) {
        tokenToUse = exchangedJWT;
      } else {
        tokenToUse = credentials.authToken;
      }
    }

    // Convert policy config to Dynamic Labs format
    const dynamicPolicyRule = this.convertPolicyToDynamicLabsFormat(
      dto.policyType,
      dto.policyConfig,
      dto.walletAddress,
    );

    if (!dynamicPolicyRule) {
      throw new Error(`Cannot convert policy type "${dto.policyType}" to Dynamic Labs format.`);
    }

    // Update chainIds if provided
    if (dto.chainIds && dto.chainIds.length > 0) {
      dynamicPolicyRule.chainIds = dto.chainIds;
    }

    // Call Dynamic Labs Policy Engine API
    const apiUrl = `https://app.dynamicauth.com/api/v0/environments/${environmentId}/waas/policies`;

    const requestBody = {
      rulesToAdd: [dynamicPolicyRule],
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenToUse}`,
        'User-Agent': 'CoalaPay-Server/1.0',
        Accept: 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();

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

    // Extract rule ID from response
    let dynamicPolicyId: string | null = null;
    if (result.rules && Array.isArray(result.rules) && result.rules.length > 0) {
      dynamicPolicyId = result.rules[0].id || result.rules[0].ruleId || null;
    } else if (result.rule && result.rule.id) {
      dynamicPolicyId = result.rule.id;
    } else if (result.id) {
      dynamicPolicyId = result.id;
    }

    return {
      dynamicPolicyId,
    };
  }
}

export const dynamicService = new DynamicService();

