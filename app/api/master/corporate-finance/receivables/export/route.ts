import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { parseArApListFilters } from '@/lib/master/corporateFinance/arApApi';
import { exportCorporateReceivables } from '@/lib/master/corporateFinance/exports/exportService';
import {
  corporateExportErrorResponse,
  corporateExportHttpResponse,
} from '@/lib/master/corporateFinance/exports/http';
import { parseCorporateExportFormat } from '@/lib/master/corporateFinance/exports/exportTypes';

export async function GET(request: Request) {
  const { client: supabaseAdmin, error: configError } = getCorporateFinanceServiceClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const auth = await authorizeCorporateFinance(supabaseAdmin, {
    userId: searchParams.get('userId'),
    impersonatingTenantId: searchParams.get('impersonatingTenantId'),
  });
  if (!auth.ok) return auth.response;

  try {
    const format = parseCorporateExportFormat(searchParams.get('format'));
    const filters = parseArApListFilters(searchParams);
    const result = await exportCorporateReceivables(supabaseAdmin, {
      format,
      userId: searchParams.get('userId'),
      filters,
    });
    return corporateExportHttpResponse(result);
  } catch (err) {
    return corporateExportErrorResponse(err);
  }
}
