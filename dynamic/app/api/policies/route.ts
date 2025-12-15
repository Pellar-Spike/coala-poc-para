import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { generateId } from '@/lib/utils';
import { CreatePolicyRequest, Policy } from '@/types';
import { dynamicLabsService } from '@/lib/services/dynamicLabsService';

export async function POST(request: NextRequest) {
  try {
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    const userJwtToken = authHeader?.startsWith('Bearer ') 
      ? authHeader.substring(7) // Remove 'Bearer ' prefix
      : undefined;

    console.log('JWT token from Authorization header:', {
      hasHeader: !!authHeader,
      tokenLength: userJwtToken?.length,
      tokenStart: userJwtToken?.substring(0, 50),
      isValidFormat: userJwtToken?.startsWith('eyJ'),
    });

    // Decode JWT to verify and log user info
    if (userJwtToken) {
      try {
        const parts = userJwtToken.split('.');
        if (parts.length === 3) {
          const payload = parts[1];
          const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
          const jwtPayload = JSON.parse(Buffer.from(paddedPayload, 'base64').toString());
          console.log('📋 JWT Payload from SDK:', {
            sub: jwtPayload.sub,
            email: jwtPayload.email,
            environment_id: jwtPayload.environment_id,
            exp: jwtPayload.exp,
            iat: jwtPayload.iat,
            expiresAt: jwtPayload.exp ? new Date(jwtPayload.exp * 1000).toISOString() : null,
            isExpired: jwtPayload.exp ? Date.now() > jwtPayload.exp * 1000 : null,
            verifiedCredentials: jwtPayload.verified_credentials?.map((vc: any) => ({
              address: vc.address,
              walletProvider: vc.wallet_provider,
              walletName: vc.wallet_name,
              format: vc.format,
            })) || [],
          });
          console.log('💡 Available wallet addresses for policy creation:', 
            jwtPayload.verified_credentials?.filter((vc: any) => vc.address?.startsWith('0x')).map((vc: any) => vc.address) || []
          );
        }
      } catch (e) {
        console.warn('Failed to decode JWT from SDK:', e);
      }
    }

    const body: CreatePolicyRequest = await request.json();
    const {
      policyName,
      name,
      policyType,
      type,
      walletId,
      vaultId,
      targetType,
      targetId,
      policyConfig,
      config,
      chainIds,
    } = body;

    // Determine target from walletId or vaultId
    const finalWalletId = walletId || (targetType === 'wallet' ? targetId : undefined);
    const finalVaultId = vaultId || (targetType === 'vault' ? targetId : undefined);

    if (!finalWalletId && !finalVaultId) {
      return NextResponse.json(
        { error: 'Either walletId or vaultId must be provided' },
        { status: 400 }
      );
    }

    if (!policyName && !name) {
      return NextResponse.json(
        { error: 'policyName (or name) is required' },
        { status: 400 }
      );
    }

    if (!policyType && !type) {
      return NextResponse.json(
        { error: 'policyType (or type) is required' },
        { status: 400 }
      );
    }

    const finalPolicyName = policyName || name || '';
    const finalPolicyType = policyType || type || 'spending_limit';
    const finalConfig = policyConfig || config || {};

    // Validate target exists
    let wallet = null;
    let vault = null;
    let walletAddress: string | undefined = undefined;

    if (finalWalletId) {
      // Check if it's a wallet address (starts with 0x) or wallet ID
      if (finalWalletId.startsWith('0x')) {
        // It's a wallet address - try to find wallet by address
        wallet = store.getAllWallets().find(w => w.address.toLowerCase() === finalWalletId.toLowerCase());
        walletAddress = finalWalletId; // Use the provided address
      } else {
        // It's a wallet ID - get wallet from store
        wallet = store.getWallet(finalWalletId);
        if (wallet) {
          walletAddress = wallet.address;
        }
      }
      
      // If wallet not found in store but we have an address, we can still create the policy
      // The policy will be created with the wallet address directly
      if (!wallet && !walletAddress) {
        return NextResponse.json(
          { error: 'Target wallet not found. Please provide a valid wallet address (0x...) or wallet ID.' },
          { status: 404 }
        );
      }
    } else if (finalVaultId) {
      vault = store.getVault(finalVaultId);
      if (!vault) {
        return NextResponse.json(
          { error: 'Target vault not found' },
          { status: 404 }
        );
      }
    }

    // Create policy in Dynamic Labs
    // Using API token (like Dashboard) - no JWT required
    let dynamicPolicyId: string | null = null;
    try {
      // Add chainIds to config if provided
      const configWithChains = {
        ...finalConfig,
        ...(chainIds && { chainIds }),
      };

      console.log('Calling createPolicy with API token (like Dashboard):', {
        finalPolicyType,
        walletAddress: walletAddress || wallet?.address,
        environmentId: wallet?.environmentId,
        note: 'Using API token instead of JWT (like Dashboard)',
      });

      const dynamicResult = await dynamicLabsService.createPolicy(
        finalPolicyType,
        configWithChains,
        walletAddress || wallet?.address, // Use walletAddress if provided, otherwise use wallet.address
        wallet?.environmentId
        // No JWT token needed - using API token instead
      );
      dynamicPolicyId = dynamicResult.dynamicPolicyId;
    } catch (error: any) {
      // Return original error from Dynamic, do not transform
      console.error('Failed to create policy in Dynamic Labs:', error.message);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Create local policy record
    // For wallet policies, use wallet ID if found, otherwise use the address/ID provided
    const policyTargetId = finalWalletId 
      ? (wallet?.id || finalWalletId) // Use wallet.id if found, otherwise use the provided value
      : (finalVaultId || '');
    
    const policy: Policy = {
      id: generateId(),
      name: finalPolicyName,
      policyName: finalPolicyName,
      type: finalPolicyType as Policy['type'],
      policyType: finalPolicyType as Policy['type'],
      targetType: finalWalletId ? 'wallet' : 'vault',
      targetId: policyTargetId,
      walletId: wallet?.id || (finalWalletId && !finalWalletId.startsWith('0x') ? finalWalletId : undefined),
      vaultId: finalVaultId,
      config: finalConfig,
      policyConfig: finalConfig,
      dynamicPolicyId: dynamicPolicyId || undefined,
      createdAt: new Date().toISOString(),
      status: 'active',
    };

    const created = store.createPolicy(policy);

    // Add dynamicPolicyId to policy if available
    const policyWithDynamic = {
      ...created,
      dynamicPolicyId: dynamicPolicyId || undefined,
    };

    return NextResponse.json(
      {
        ...policyWithDynamic,
        message: dynamicPolicyId
          ? `Policy created successfully in Dynamic Labs (ID: ${dynamicPolicyId}).`
          : 'Policy created locally (Dynamic Labs integration failed).',
      },
      { status: 201 }
    );
  } catch (error: any) {
    // Return original error from Dynamic, do not transform
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    const userJwtToken = authHeader?.startsWith('Bearer ') 
      ? authHeader.substring(7) // Remove 'Bearer ' prefix
      : undefined;

    const { searchParams } = new URL(request.url);
    const targetType = searchParams.get('targetType') as 'wallet' | 'vault' | null;
    const targetId = searchParams.get('targetId');
    const fromDynamicLabs = searchParams.get('fromDynamicLabs') === 'true';
    const walletAddress = searchParams.get('walletAddress');

    // If requested, fetch from Dynamic Labs API
    if (fromDynamicLabs) {
      // JWT token is required for fetching policies from Dynamic Labs
      if (!userJwtToken) {
        return NextResponse.json(
          { 
            error: 'JWT token is required to fetch policies from Dynamic Labs. Please ensure you are logged in with Dynamic Labs and the Authorization header contains a valid Bearer token.',
            source: 'dynamic_labs_error'
          },
          { status: 401 }
        );
      }

      try {
        const dynamicPolicies = await dynamicLabsService.getPolicies(
          undefined, // Use environment ID from env
          walletAddress || undefined,
          userJwtToken // Pass JWT token from Authorization header
        );
        return NextResponse.json({
          policies: dynamicPolicies,
          source: 'dynamic_labs',
          count: dynamicPolicies.length,
        });
      } catch (error: any) {
        console.error('Failed to fetch policies from Dynamic Labs:', error);
        // Return original error from Dynamic, do not transform
        return NextResponse.json(
          { 
            error: error.message,
            // Fallback to local policies
            policies: store.getAllPolicies(),
            source: 'local_fallback'
          },
          { status: 500 }
        );
      }
    }

    // Otherwise, fetch from local store
    if (targetType && targetId) {
      const policies = store.getPoliciesByTarget(targetType, targetId);
      // Return as array for backward compatibility
      return NextResponse.json(policies);
    }

    const policies = store.getAllPolicies();
    // Return as array for backward compatibility
    return NextResponse.json(policies);
  } catch (error: any) {
    // Return original error from Dynamic, do not transform
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

