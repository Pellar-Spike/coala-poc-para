import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { generateId, generateWalletAddress } from '@/lib/utils';
import { CreateWalletRequest, Wallet } from '@/types';
import { dynamicLabsService } from '@/lib/services/dynamicLabsService';

export async function POST(request: NextRequest) {
  try {
    const body: CreateWalletRequest = await request.json();
    const {
      dynamicVaultId,
      vaultId,
      userEmail,
      associatedEmail,
      walletName,
      purpose,
      countryOffice,
      metadata,
    } = body;

    if (!dynamicVaultId) {
      return NextResponse.json(
        { error: 'dynamicVaultId is required' },
        { status: 400 }
      );
    }

    // Find vault by dynamicVaultId if vaultId not provided
    let vault = vaultId ? store.getVault(vaultId) : null;
    if (!vault && dynamicVaultId) {
      // Try to find vault by dynamicVaultId
      const allVaults = store.getAllVaults();
      vault = allVaults.find(v => v.dynamicVaultId === dynamicVaultId) || null;
    }
    
    // Use email from request, vault, or fallback
    const emailForWallet = userEmail || associatedEmail || vault?.dynamicUserEmail || vault?.adminEmail || '';

    // Create wallet in Dynamic Labs using dynamicVaultId directly
    let walletAddress: string | null = null;
    let dynamicWalletId: string | null = null;
    let environmentId: string | undefined;

    try {
      // Use dynamicVaultId and email to create wallet
      console.log('Attempting to create wallet with dynamicVaultId:', dynamicVaultId, 'email:', emailForWallet, 'walletName:', walletName);
      const dynamicResult = await dynamicLabsService.createWallet(
        emailForWallet, // Use email from request or vault
        dynamicVaultId, // Pass dynamicVaultId directly
        walletName // Pass walletName for multi-wallet support
      );
      walletAddress = dynamicResult.walletAddress;
      dynamicWalletId = dynamicResult.dynamicWalletId;
      console.log('Wallet created successfully:', { walletAddress, dynamicWalletId });
      // Get environment ID from env
      environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
    } catch (error: any) {
      // Return original error from Dynamic, do not transform
      console.error('Failed to create wallet in Dynamic Labs:', {
        error: error.message,
        stack: error.stack,
        dynamicVaultId,
        emailForWallet,
      });
      // Re-throw to return original error
      throw error;
    }

    // Create local wallet record
    const wallet: Wallet = {
      id: generateId(),
      vaultId: vault?.id || generateId(), // Use found vault ID or generate new one
      address: walletAddress!,
      dynamicWalletId: dynamicWalletId || undefined,
      walletName,
      associatedEmail: userEmail || associatedEmail || '',
      userEmail: userEmail || associatedEmail || '',
      userIdentifier: userEmail || associatedEmail || '',
      createdAt: new Date().toISOString(),
      policyIds: [],
      purpose: (purpose as any) || 'OTHER',
      countryOffice,
      environmentId,
      organizationId: vault?.organizationId,
      metadata,
      status: 'active',
    };

    const created = store.createWallet(wallet);

    // Update vault to include this wallet if vault exists
    if (vault) {
      store.updateVault(vault.id, {
        walletIds: [...vault.walletIds, created.id],
      });
    }

    return NextResponse.json(
      {
        ...created,
        dynamicWalletId,
        message: dynamicWalletId
          ? `Wallet created successfully in Dynamic Labs (Address: ${walletAddress}).`
          : 'Wallet created locally (Dynamic Labs integration failed). Check server logs for details.',
        warning: !dynamicWalletId ? 'Dynamic Labs integration failed. Wallet created locally only.' : undefined,
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
    const { searchParams } = new URL(request.url);
    const vaultId = searchParams.get('vaultId');
    const email = searchParams.get('email');

    if (vaultId) {
      const wallets = store.getWalletsByVaultId(vaultId);
      return NextResponse.json(wallets);
    }

    if (email) {
      const wallets = store.getWalletsByEmail(email);
      return NextResponse.json(wallets);
    }

    const wallets = store.getAllWallets();
    return NextResponse.json(wallets);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch wallets' },
      { status: 500 }
    );
  }
}

