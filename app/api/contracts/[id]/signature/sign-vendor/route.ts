import { NextResponse } from 'next/server';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';
import { getEphemeralAuthEnv } from '@/lib/primaryAdminReauthServer';
import { PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE } from '@/lib/primaryAdminReauth';
import { resolveClientIp } from '@/lib/saleContractSignatureService';
import {
  authorizeAndExecuteInternalVendorSign,
  previewInternalVendorSignAuthorization,
  stripClientVendorSignIdentity,
  toPublicVendorSignError,
  toPublicVendorSignPreviewError,
} from '@/lib/saleContractVendorSignAuth';
import {
  createVendorSignAuthDeps,
  createVendorSignPreviewDeps,
  loadVendorSignContract,
  persistPrimaryAdminVerifyAudit,
  persistSellerSignatureAudit,
} from '@/lib/saleContractVendorSignAuthServer';

export const runtime = 'nodejs';
export const maxDuration = 60;

const rateLimitStore = new Map<string, number[]>();

function denied(error = PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE, status = 401) {
  return NextResponse.json({ ok: false, error }, { status });
}

function httpStatusForExecute(code: string): number {
  if (code === 'already_signed') return 409;
  if (code === 'persistence_failed') return 500;
  if (code === 'precondition' || code === 'unsupported_party' || code === 'not_found') {
    return 400;
  }
  if (code === 'owner' || code === 'broker' || code === 'forbidden_role' || code === 'wrong_tenant') {
    return 403;
  }
  if (code === 'unauthenticated') return 401;
  return 401;
}

async function buildDeps() {
  const { client: admin } = createAdminSupabase();
  const authEnv = getEphemeralAuthEnv();
  if (!admin || !authEnv) return null;
  return {
    admin,
    deps: createVendorSignAuthDeps(admin, authEnv, rateLimitStore),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getRequestAuthUser(request);
  if (!auth.user?.id) {
    return NextResponse.json(toPublicVendorSignPreviewError('unauthenticated'), { status: 401 });
  }

  const { client: admin } = createAdminSupabase();
  if (!admin) {
    return NextResponse.json(toPublicVendorSignPreviewError('denied'), { status: 422 });
  }

  const { id: contractId } = await params;
  const url = new URL(request.url);
  const signatureId = String(url.searchParams.get('signatureId') || '').trim();
  const partyId = String(url.searchParams.get('partyId') || '').trim() || null;
  const vendorName = url.searchParams.get('vendorName');
  const vendorDocument = url.searchParams.get('vendorDocument');

  if (!signatureId) {
    return NextResponse.json(toPublicVendorSignPreviewError('not_found'), { status: 422 });
  }

  try {
    const preview = await previewInternalVendorSignAuthorization(createVendorSignPreviewDeps(admin), {
      operatorUserId: auth.user.id,
      contractId,
      signatureId,
      partyId,
      vendorName,
      vendorDocument,
    });
    if (!preview.ok) {
      const pub = toPublicVendorSignPreviewError(preview.code);
      return NextResponse.json(pub, { status: pub.code === 'unauthenticated' ? 401 : 422 });
    }
    return NextResponse.json(preview);
  } catch (err) {
    console.warn(
      '[seller-signature-preview] exception',
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(toPublicVendorSignPreviewError('denied'), { status: 422 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      return NextResponse.json({ ok: false, error: configError || 'Não autenticado' }, { status: 401 });
    }

    const wired = await buildDeps();
    if (!wired) return denied();

    const { id: contractId } = await params;
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const parsed = stripClientVendorSignIdentity(body);
    if (!parsed.signatureId) {
      return NextResponse.json({ ok: false, error: 'signatureId é obrigatório.' }, { status: 400 });
    }

    const { result, verify } = await authorizeAndExecuteInternalVendorSign(wired.deps, {
      operatorUserId: user.id,
      contractId,
      signatureId: parsed.signatureId,
      password: parsed.password,
      vendorName: parsed.vendorName,
      vendorDocument: parsed.vendorDocument,
      vendorEmail: parsed.vendorEmail,
      vendorRole: parsed.vendorRole,
      partyId: parsed.partyId,
      ipAddress: resolveClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });

    if (verify) {
      await persistPrimaryAdminVerifyAudit(wired.admin, verify);
    }
    const contract = await loadVendorSignContract(wired.admin, contractId);
    await persistSellerSignatureAudit(wired.admin, { result, verify, contract });

    if (!result.ok) {
      const pub = toPublicVendorSignError(result);
      return NextResponse.json(pub, { status: httpStatusForExecute(result.code) });
    }

    return NextResponse.json({
      success: true,
      ok: true,
      signature: result.signature,
      pdfSignedUrl: result.pdfSignedUrl,
      authorizedBy: result.skippedAuth
        ? null
        : {
            userId: result.authorizedBy,
            displayName: result.authorizedByName,
            maskedEmail: result.authorizedByMaskedEmail,
          },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Falha ao assinar como vendedor.';
    console.error('SALE_CONTRACT_VENDOR_SIGN_ERROR', { message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
