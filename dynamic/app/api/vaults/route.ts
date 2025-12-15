import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { generateId } from '@/lib/utils';
import { CreateVaultRequest, Vault } from '@/types';
import { dynamicLabsService } from '@/lib/services/dynamicLabsService';

export async function POST(request: NextRequest) {
  try {
    const body: CreateVaultRequest = await request.json();
    const { adminEmail, vaultName, name, organizationId, metadata } = body;

    if (!adminEmail) {
      return NextResponse.json(
        { error: 'adminEmail is required' },
        { status: 400 }
      );
    }

    // Auto-generate vault name from email if not provided
    const generatedVaultName = vaultName || name || `Vault for ${adminEmail.split('@')[0]}`;

    // Create vault in Dynamic Labs
    let dynamicUserId: string | null = null;
    let dynamicMessage = '';
    try {
      const dynamicResult = await dynamicLabsService.createVault(
        adminEmail,
        generatedVaultName
      );
      dynamicUserId = dynamicResult.dynamicUserId;
      dynamicMessage = dynamicResult.message;
    } catch (error: any) {
      // Return original error from Dynamic, do not transform
      console.error('Failed to create vault in Dynamic Labs:', error.message);
      // Re-throw to return original error
      throw error;
    }

    // Create local vault record
    const vault: Vault = {
      id: generateId(),
      adminEmail,
      vaultName: generatedVaultName,
      name: generatedVaultName, // Alias for backward compatibility
      createdAt: new Date().toISOString(),
      walletIds: [],
      delegateEmails: [],
      dynamicVaultId: dynamicUserId || undefined,
      dynamicUserEmail: adminEmail, // Store email for wallet creation
      organizationId,
      metadata: {
        ...metadata,
        ...(dynamicUserId && { dynamicUserId }),
      },
      status: 'active',
    };

    const created = store.createVault(vault);
    return NextResponse.json(
      {
        ...created,
        dynamicUserId,
        message: dynamicUserId ? dynamicMessage : 'Vault created locally (Dynamic Labs integration failed).',
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
    const adminEmail = searchParams.get('adminEmail');

    if (adminEmail) {
      const vaults = store.getVaultsByAdminEmail(adminEmail);
      return NextResponse.json(vaults);
    }

    const vaults = store.getAllVaults();
    return NextResponse.json(vaults);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch vaults' },
      { status: 500 }
    );
  }
}

