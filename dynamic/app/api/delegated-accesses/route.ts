import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/store';

/**
 * API route to get all delegated accesses
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const vaultId = searchParams.get('vaultId');
    const walletId = searchParams.get('walletId');
    const delegateEmail = searchParams.get('delegateEmail');

    let delegatedAccesses = store.getAllDelegatedAccesses();

    // Filter by vaultId if provided
    if (vaultId) {
      delegatedAccesses = delegatedAccesses.filter(da => da.vaultId === vaultId);
    }

    // Filter by walletId if provided
    if (walletId) {
      delegatedAccesses = delegatedAccesses.filter(da => da.walletId === walletId);
    }

    // Filter by delegateEmail if provided
    if (delegateEmail) {
      delegatedAccesses = delegatedAccesses.filter(da => da.delegateEmail === delegateEmail);
    }

    // Remove sensitive data before returning (for security)
    const sanitized = delegatedAccesses.map(da => ({
      id: da.id,
      vaultId: da.vaultId,
      walletId: da.walletId,
      userId: da.userId,
      delegateUserId: da.delegateUserId,
      delegateEmail: da.delegateEmail,
      publicKey: da.publicKey,
      createdAt: da.createdAt,
      status: da.status,
      eventId: da.eventId,
      // Don't expose delegatedShare and walletApiKey in API response
      // These should only be accessed server-side
    }));

    return NextResponse.json(sanitized);
  } catch (error: any) {
    // Return original error from Dynamic, do not transform
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

