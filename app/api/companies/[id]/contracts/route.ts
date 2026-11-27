import { authorizePlatformAdminRequest } from '@/lib/security/adminAuthorization';
import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  listAllCompanyContractsIncludingArchived,
  listCompanyContracts,
} from '@/lib/saasContractService';
import { filterVisibleSaasContracts } from '@/lib/saasContractArchive';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  
  const { id: companyId } = await params;
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const includeArchived = url.searchParams.get('includeArchived') === '1';

  const auth = await authorizePlatformAdminRequest(request, userId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }


  const contracts = includeArchived
    ? await listAllCompanyContractsIncludingArchived(supabaseAdmin, companyId)
    : await listCompanyContracts(supabaseAdmin, companyId);

  return NextResponse.json({
    success: true,
    contracts,
    visible_count: filterVisibleSaasContracts(contracts, false).length,
    archived_count: contracts.filter((c) => c.archived_at).length,
  });
}
