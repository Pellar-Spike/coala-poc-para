'use client';

import { DynamicWidget } from '@dynamic-labs/sdk-react-core';
import { useEffect, useState } from 'react';

export function DynamicWidgetWrapper() {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Only render on client side and if environment ID exists
  if (!mounted) {
    return null;
  }
  
  const envId = typeof window !== 'undefined' 
    ? process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID 
    : null;
  
  if (!envId) {
    return null;
  }
  
  // Render widget - Dynamic Labs SDK will handle provider check internally
  return <DynamicWidget />;
}

