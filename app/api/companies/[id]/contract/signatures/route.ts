import { authorizePlatformAdminRequest } from '@/lib/security/adminAuthorization';
import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  buildSignatureHistory,
  getActiveContractForCompany,
  listContractSignatures,
} from '@/lib/saasContractSignatureService';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  
  const { id: companyId } = await params;
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const contractId = url.searchParams.get('contractId');

  const auth = await authorizePlatformAdminRequest(request, userId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }


  const activeContract =
    contractId
      ? { id: contractId }
      : await getActiveContractForCompany(supabaseAdmin, companyId);

  const signatures = await listContractSignatures(
    supabaseAdmin,
    companyId,
    activeContract?.id,
  );

  const latest = signatures[0] || null;
  const history = latest ? buildSignatureHistory(latest) : [];

  return NextResponse.json({
    success: true,
    signatures,
    latest,
    history,
  });
}
