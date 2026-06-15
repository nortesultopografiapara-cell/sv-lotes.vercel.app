import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { sendContractForSignature } from '@/lib/saasContractSignatureService';
import { SaasContractStepError } from '@/lib/saasContractErrors';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { id: companyId } = await params;
  const body = await request.json().catch(() => ({}));
  const userId = typeof body.userId === 'string' ? body.userId : null;

  const auth = await assertSuperAdmin(supabaseAdmin, userId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  try {
    const result = await sendContractForSignature(supabaseAdmin, companyId);
    return NextResponse.json({
      success: true,
      signUrl: result.signUrl,
      signature: result.signature,
      contract: result.contract,
    });
  } catch (err) {
    const message =
      err instanceof SaasContractStepError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Falha ao enviar contrato para assinatura.';
    const status = err instanceof SaasContractStepError && err.step === 'validation' ? 400 : 500;
    console.error('SAAS_CONTRACT_SEND_SIGN_ERROR', { companyId, message });
    return NextResponse.json({ error: message }, { status });
  }
}
