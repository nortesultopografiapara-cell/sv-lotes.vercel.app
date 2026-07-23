import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import { exportCorporateCashMovements } from '@/lib/master/corporateFinance/exports/exportService';
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
    const result = await exportCorporateCashMovements(supabaseAdmin, {
      format,
      userId: searchParams.get('userId'),
      filters: {
        q: searchParams.get('q') || undefined,
        type: searchParams.get('type') || undefined,
        origin: searchParams.get('origin') || undefined,
        financialAccountId: searchParams.get('financialAccountId') || undefined,
        categoryId: searchParams.get('categoryId') || undefined,
        costCenterId: searchParams.get('costCenterId') || undefined,
        projectId: searchParams.get('projectId') || undefined,
        paymentMethod: searchParams.get('paymentMethod') || undefined,
        fromDate: searchParams.get('fromDate') || undefined,
        toDate: searchParams.get('toDate') || undefined,
        includeReversed: searchParams.get('includeReversed') === '1',
      },
    });
    return corporateExportHttpResponse(result);
  } catch (err) {
    return corporateExportErrorResponse(err);
  }
}
