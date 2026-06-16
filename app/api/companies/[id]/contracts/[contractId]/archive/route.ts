import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { archiveCompanyContract } from '@/lib/saasContractArchive';
import { SaasContractStepError } from '@/lib/saasContractErrors';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; contractId: string }> },
) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { id: companyId, contractId } = await params;
  const body = await request.json().catch(() => ({}));
  const userId = body.userId as string | undefined;
  const confirmActive = body.confirmActive === true;
  const archiveKind =
    body.archiveKind === 'manual' || body.archiveKind === 'test'
      ? body.archiveKind
      : undefined;

  const auth = await assertSuperAdmin(supabaseAdmin, userId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  try {
    const contract = await archiveCompanyContract(supabaseAdmin, {
      companyId,
      contractId,
      archivedByUserId: userId!,
      confirmActive,
      archiveKind,
    });

    return NextResponse.json({
      success: true,
      contract,
    });
  } catch (err) {
    if (err instanceof SaasContractStepError) {
      const status = err.step === 'validation' ? 400 : 500;
      return NextResponse.json({ success: false, error: err.message, step: err.step }, { status });
    }
    const message = err instanceof Error ? err.message : 'Erro ao arquivar contrato.';
    console.error('SAAS_CONTRACT_ARCHIVE_ERROR', { companyId, contractId, message });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
