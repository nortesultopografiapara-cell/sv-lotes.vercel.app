import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  resolveClientIp,
  signContractByProvider,
} from '@/lib/saasContractSignatureService';
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
  const signatureId = typeof body.signatureId === 'string' ? body.signatureId : null;

  const auth = await assertSuperAdmin(supabaseAdmin, userId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  if (!signatureId) {
    return NextResponse.json({ error: 'signatureId é obrigatório.' }, { status: 400 });
  }

  try {
    const result = await signContractByProvider(supabaseAdmin, companyId, signatureId, {
      providerName: String(body.providerName || ''),
      providerDocument: String(body.providerDocument || ''),
      providerEmail: String(body.providerEmail || ''),
      providerRole: body.providerRole ? String(body.providerRole) : null,
      ipAddress: resolveClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({
      success: true,
      signature: result.signature,
      pdfSignedUrl: result.pdfSignedUrl,
    });
  } catch (err) {
    const message =
      err instanceof SaasContractStepError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Falha ao assinar contrato pela SV.';
    const status = err instanceof SaasContractStepError && err.step === 'validation' ? 400 : 500;
    console.error('SAAS_CONTRACT_PROVIDER_SIGN_ERROR', { companyId, signatureId, message });
    return NextResponse.json({ error: message }, { status });
  }
}
