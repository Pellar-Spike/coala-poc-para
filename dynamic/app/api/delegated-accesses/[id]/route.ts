import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/store';

/**
 * API route for individual delegated access operations
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const delegatedAccess = store.getDelegatedAccess(params.id);
    
    if (!delegatedAccess) {
      return NextResponse.json(
        { error: 'Delegated access not found' },
        { status: 404 }
      );
    }

    // Sanitize sensitive data
    const sanitized = {
      id: delegatedAccess.id,
      vaultId: delegatedAccess.vaultId,
      walletId: delegatedAccess.walletId,
      userId: delegatedAccess.userId,
      delegateUserId: delegatedAccess.delegateUserId,
      delegateEmail: delegatedAccess.delegateEmail,
      publicKey: delegatedAccess.publicKey,
      createdAt: delegatedAccess.createdAt,
      status: delegatedAccess.status,
      eventId: delegatedAccess.eventId,
      // Don't expose delegatedShare and walletApiKey
    };

    return NextResponse.json(sanitized);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch delegated access', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Update delegated access (e.g., revoke)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { status } = body;

    const delegatedAccess = store.getDelegatedAccess(params.id);
    if (!delegatedAccess) {
      return NextResponse.json(
        { error: 'Delegated access not found' },
        { status: 404 }
      );
    }

    // Only allow updating status
    const updated = store.updateDelegatedAccess(params.id, {
      status: status || delegatedAccess.status,
    });

    if (!updated) {
      return NextResponse.json(
        { error: 'Failed to update delegated access' },
        { status: 500 }
      );
    }

    // Sanitize before returning
    const sanitized = {
      id: updated.id,
      vaultId: updated.vaultId,
      walletId: updated.walletId,
      userId: updated.userId,
      delegateUserId: updated.delegateUserId,
      delegateEmail: updated.delegateEmail,
      publicKey: updated.publicKey,
      createdAt: updated.createdAt,
      status: updated.status,
      eventId: updated.eventId,
    };

    return NextResponse.json(sanitized);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to update delegated access', details: error.message },
      { status: 500 }
    );
  }
}


