import { NextResponse } from 'next/server';
import { assertSuperAdmin } from '@/lib/apiSuperAdmin';
import { refreshAllContractGeneratedHtml } from '@/lib/bulkContractHtmlRefresh';
import { executeBulkRegenerate } from '@/lib/bulkContractRegenerateHandler';
import {
  createAdminSupabase,
  getRequestAuthUser,
} from '@/lib/supabase/server';

export const runtime = 'nodejs';

const defaultDeps = {
  getRequestAuthUser,
  createAdminSupabase,
  assertSuperAdmin,
  refreshAllContractGeneratedHtml,
};

export async function GET(request: Request) {
  const result = await executeBulkRegenerate(request, 'GET', defaultDeps);
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: Request) {
  const result = await executeBulkRegenerate(request, 'POST', defaultDeps);
  return NextResponse.json(result.body, { status: result.status });
}
