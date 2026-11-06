import { NextResponse } from 'next/server';
import {
  isProductionSupabaseRuntime,
  resolveSupabaseProjectRef,
} from '@/lib/homolog/env';
import {
  isRecantoSeparateSignalFormEnabled,
  isRecantoSeparateSignalWriteEnabled,
} from '@/lib/recantoSeparateSignalRuntime';

export const runtime = 'nodejs';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (isProductionSupabaseRuntime(url)) {
    return NextResponse.json({
      projectRef: null,
      writeEnabled: false,
      formEnabled: false,
    });
  }
  return NextResponse.json({
    projectRef: resolveSupabaseProjectRef(url),
    writeEnabled: isRecantoSeparateSignalWriteEnabled(),
    formEnabled: isRecantoSeparateSignalFormEnabled(),
  });
}
