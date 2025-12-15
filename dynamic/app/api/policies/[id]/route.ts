import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { dynamicLabsService } from '@/lib/services/dynamicLabsService';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const fromDynamicLabs = searchParams.get('fromDynamicLabs') === 'true';

    // If requested, fetch from Dynamic Labs API
    if (fromDynamicLabs) {
      try {
        const dynamicPolicy = await dynamicLabsService.getPolicyById(params.id);
        if (!dynamicPolicy) {
          return NextResponse.json(
            { error: 'Policy not found in Dynamic Labs' },
            { status: 404 }
          );
        }
        return NextResponse.json({
          ...dynamicPolicy,
          source: 'dynamic_labs',
        });
      } catch (error: any) {
        console.error('Failed to fetch policy from Dynamic Labs:', error);
        // Return original error from Dynamic, do not transform
        return NextResponse.json(
          {
            error: error.message,
          },
          { status: 500 }
        );
      }
    }

    // Otherwise, fetch from local store
    const policy = store.getPolicy(params.id);
    if (!policy) {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    }
    return NextResponse.json({
      ...policy,
      source: 'local',
    });
  } catch (error: any) {
    // Return original error from Dynamic, do not transform
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

