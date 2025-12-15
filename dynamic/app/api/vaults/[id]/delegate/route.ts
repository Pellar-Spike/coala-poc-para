import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { DelegateAccessRequest } from '@/types';
import { dynamicLabsService } from '@/lib/services/dynamicLabsService';

/**
 * Delegate Access API Route
 * 
 * This route handles delegation by:
 * 1. Getting vault/user information from Dynamic Labs API (not local DB)
 * 2. Storing delegate email locally (for tracking)
 * 3. For full Dynamic Labs delegation, use client-side SDK component (DelegateAccessClient)
 * 
 * The `id` parameter should be the Dynamic Labs user ID (dynamicVaultId), not local vault ID.
 * 
 * Docs: https://www.dynamic.xyz/docs/wallets/embedded-wallets/mpc/delegated-access
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body: DelegateAccessRequest & { walletId?: string; webhookUrl?: string } = await request.json();
    const { delegateEmail, walletId, webhookUrl } = body;

    if (!delegateEmail) {
      return NextResponse.json(
        { error: 'delegateEmail is required' },
        { status: 400 }
      );
    }

    // Get vault/user information from Dynamic Labs API (not local DB)
    // params.id should be the Dynamic Labs user ID (dynamicVaultId)
    let dynamicUser: { id: string; email: string; firstName?: string; lastName?: string } | null = null;
    try {
      dynamicUser = await dynamicLabsService.getUserById(params.id);
      if (!dynamicUser) {
        return NextResponse.json(
          { 
            error: 'Vault not found in Dynamic Labs',
            note: `No user found with Dynamic Labs ID: ${params.id}. Please verify the ID is correct.`,
          },
          { status: 404 }
        );
      }
    } catch (error: any) {
      console.error('Failed to get user from Dynamic Labs:', error);
      // Return original error from Dynamic, do not transform
      return NextResponse.json(
        { 
          error: error.message,
        },
        { status: 500 }
      );
    }

    // Try to find local vault by dynamicVaultId (for backward compatibility)
    const localVault = store.getAllVaults().find(v => v.dynamicVaultId === params.id);
    
    // Check if already delegated (local check if vault exists)
    if (localVault && localVault.delegateEmails.includes(delegateEmail)) {
      return NextResponse.json(
        { 
          error: 'User already has delegate access',
          note: 'To trigger Dynamic Labs delegation, use the client-side SDK component.',
        },
        { status: 400 }
      );
    }

    // If walletId is provided, try to trigger Dynamic Labs delegation via API
    let delegationResult: { success: boolean; message: string; delegationId?: string } | null = null;
    if (walletId) {
      try {
        // Attempt to trigger delegation via Dynamic Labs API
        delegationResult = await dynamicLabsService.triggerDelegation(
          walletId,
          delegateEmail,
          webhookUrl
        );

        if (delegationResult.success) {
          console.log('Delegation triggered successfully via API:', {
            walletId,
            delegateEmail,
            delegationId: delegationResult.delegationId,
          });
        } else {
          console.log('ℹ️ Delegation API not available (404) - This is EXPECTED behavior.');
          console.log('✅ Dynamic Labs does NOT provide server-side delegation API.');
          console.log('✅ Use client-side SDK (button below) to trigger delegation.');
          console.log('📋 Details:', {
            walletId,
            delegateEmail,
            message: delegationResult.message,
          });
        }
      } catch (error: any) {
        console.warn('Failed to trigger Dynamic Labs delegation via API:', error.message);
        // Return original error from Dynamic, do not transform
        delegationResult = {
          success: false,
          message: error.message,
        };
        // Continue with local storage anyway
      }
    }

    // Store delegate email locally (for tracking and webhook processing)
    // This helps us match delegate email when webhook arrives
    // Update local vault if exists, or create a reference
    if (localVault) {
      // Only add if not already in the list
      const updatedDelegateEmails = localVault.delegateEmails.includes(delegateEmail)
        ? localVault.delegateEmails
        : [...localVault.delegateEmails, delegateEmail];
      
      const updatedVault = store.updateVault(localVault.id, {
        delegateEmails: updatedDelegateEmails,
      });
      
      // Store a temporary delegation request for webhook matching
      // This helps us identify delegate email when webhook arrives
      if (walletId) {
        const tempDelegation = {
          id: `temp-${Date.now()}`,
          vaultId: localVault.id,
          walletId: walletId,
          userId: params.id,
          delegateUserId: '',
          delegateEmail: delegateEmail,
          publicKey: '',
          delegatedShare: null,
          walletApiKey: '',
          createdAt: new Date().toISOString(),
          status: 'pending' as const,
          eventId: undefined,
        };
        // Store temporarily (will be updated when webhook arrives)
        try {
          store.createDelegatedAccess(tempDelegation as any);
        } catch (e) {
          // Ignore if already exists
          console.log('Temporary delegation record may already exist');
        }
      }
      
      return NextResponse.json({
        dynamicUserId: params.id,
        dynamicUserEmail: dynamicUser.email,
        delegateEmail,
        walletId: walletId || undefined,
        delegation: delegationResult || undefined,
        message: delegationResult?.success
          ? `✅ Delegation triggered successfully! ${delegationResult.message}`
          : delegationResult?.message || (walletId 
            ? '✅ Vault verified. Use client-side SDK below to trigger Dynamic Labs delegation flow.'
            : '✅ Delegate access stored locally. For Dynamic Labs delegation, use client-side SDK component.'),
        localVault: updatedVault,
      });
    } else {
      // No local vault found, create a temporary delegation record for webhook matching
      if (walletId) {
        const tempDelegation = {
          id: `temp-${Date.now()}`,
          vaultId: '',
          walletId: walletId,
          userId: params.id,
          delegateUserId: '',
          delegateEmail: delegateEmail,
          publicKey: '',
          delegatedShare: null,
          walletApiKey: '',
          createdAt: new Date().toISOString(),
          status: 'pending' as const,
          eventId: undefined,
        };
        try {
          store.createDelegatedAccess(tempDelegation as any);
        } catch (e) {
          console.log('Temporary delegation record may already exist');
        }
      }
      
      // No local vault found, just return success with Dynamic Labs info
      return NextResponse.json({
        dynamicUserId: params.id,
        dynamicUserEmail: dynamicUser.email,
        delegateEmail,
        walletId: walletId || undefined,
        delegation: delegationResult || undefined,
        message: delegationResult?.success
          ? `✅ Delegation triggered successfully! ${delegationResult.message}`
          : delegationResult?.message || (walletId 
            ? '✅ Vault verified in Dynamic Labs. Use client-side SDK below to trigger delegation flow.'
            : '✅ Vault verified in Dynamic Labs. For Dynamic Labs delegation, use client-side SDK component.'),
        note: 'No local vault record found. Delegation will be tracked via Dynamic Labs webhook.',
      });
    }
  } catch (error: any) {
        // Return original error from Dynamic, do not transform
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

