import { NextRequest, NextResponse } from 'next/server';

// Note: @dynamic-labs-wallet/node-evm is an ES Module
// We need to use dynamic import() at runtime, not at build time
// The webpack config should mark this as external so it's not bundled
async function getDynamicEvmWalletClient() {
  // Use dynamic import - webpack should not bundle this due to externals config
  // This will be resolved at runtime by Node.js
  const module: any = await import('@dynamic-labs-wallet/node-evm');
  return module.DynamicEvmWalletClient || (module.default && module.default.DynamicEvmWalletClient);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletId, policy } = body;

    if (!walletId) {
      return NextResponse.json(
        { error: 'walletId is required' },
        { status: 400 }
      );
    }

    if (!policy) {
      return NextResponse.json(
        { error: 'policy is required' },
        { status: 400 }
      );
    }

    // Check all possible env variable names
    const environmentId = 
      process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID
    
    const secretKey = 
      process.env.NEXT_PUBLIC_DYNAMIC_AUTH_TOKEN;

    // Debug: Log all env variables (without exposing sensitive data)

    if (!environmentId || !secretKey) {
      const missingVars = [];
      if (!environmentId) {
        missingVars.push('DYNAMIC_ENVIRONMENT_ID (or DYNAMIC_ENV_ID)');
      }
      if (!secretKey) {
        missingVars.push('DYNAMIC_SECRET_KEY (or DYNAMIC_API_KEY or DYNAMIC_AUTH_TOKEN)');
      }
      
      return NextResponse.json(
        { 
          error: `${missingVars.join(' and ')} are required in .env file`,
          debug: {
            checkedEnvVars: [
              'DYNAMIC_ENVIRONMENT_ID',
              'DYNAMIC_ENV_ID',
              'NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID',
              'NEXT_PUBLIC_DYNAMIC_ENV_ID',
              'DYNAMIC_SECRET_KEY',
              'DYNAMIC_API_KEY',
              'DYNAMIC_AUTH_TOKEN',
            ],
            found: {
              environmentId: !!environmentId,
              secretKey: !!secretKey,
            },
            note: 'Make sure to restart the dev server after adding/updating .env file',
          },
        },
        { status: 500 }
      );
    }

    console.log('Creating DynamicEvmWalletClient with:', {
      environmentId,
      secretKeyLength: secretKey?.length,
      secretKeyStart: secretKey?.substring(0, 10) + '...',
    });

    // Dynamically import and create DynamicEvmWalletClient at runtime
    // This avoids bundling issues with ES modules and native .node files
    const DynamicEvmWalletClientClass = await getDynamicEvmWalletClient();
    
    // Try different constructor parameter names
    // The package might use different parameter names
    // Use 'any' type to bypass TypeScript checking for dynamic imports
    let client: any;
    try {
      // Try with secretKey first (as per user's example)
      client = new (DynamicEvmWalletClientClass as any)({
        environmentId,
        secretKey,
      } as any);
    } catch (e: any) {
      // If that fails, try with apiKey or authToken
      try {
        client = new (DynamicEvmWalletClientClass as any)({
          environmentId,
          apiKey: secretKey,
        } as any);
      } catch (e2: any) {
        client = new (DynamicEvmWalletClientClass as any)({
          environmentId,
          authToken: secretKey,
        } as any);
      }
    }

    console.log('Calling client.policy.createPolicy with:', {
      walletId,
      policy,
      clientMethods: Object.keys(client || {}),
    });

    // Create policy using Node SDK
    // The API might be different - try different methods
    let result: any;
    try {
      // Try client.policy.createPolicy first
      if (client.policy && typeof client.policy.createPolicy === 'function') {
        result = await client.policy.createPolicy({
          walletId,
          policy: {
            type: policy.type || 'spending_limit',
            amount: policy.amount || '0.5',
            period: policy.period || 'daily',
          },
        });
      } else if (typeof client.createPolicy === 'function') {
        // Try client.createPolicy
        result = await client.createPolicy({
          walletId,
          policy: {
            type: policy.type || 'spending_limit',
            amount: policy.amount || '0.5',
            period: policy.period || 'daily',
          },
        });
      } else {
        throw new Error('createPolicy method not found on client. Available methods: ' + Object.keys(client || {}).join(', '));
      }
    } catch (apiError: any) {
      console.error('Error calling createPolicy:', apiError);
      // Return original error from Dynamic, do not transform
      throw apiError;
    }

    console.log('Policy created successfully via Node SDK:', result);

    return NextResponse.json({
      success: true,
      message: 'Policy created successfully using DynamicEvmWalletClient (Node SDK)',
      result,
    });
  } catch (error: any) {
    console.error('Failed to create policy using Node SDK:', error);
    // Return original error from Dynamic, do not transform
    return NextResponse.json(
      { 
        error: error.message,
      },
      { status: 500 }
    );
  }
}

