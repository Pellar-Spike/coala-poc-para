import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/store';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const vault = store.getVault(params.id);
    if (!vault) {
      return NextResponse.json({ error: 'Vault not found' }, { status: 404 });
    }
    return NextResponse.json(vault);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch vault' },
      { status: 500 }
    );
  }
}

