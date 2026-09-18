import { NextResponse } from 'next/server';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';
import { getEphemeralAuthEnv } from '@/lib/primaryAdminReauthServer';
import {
  PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE,
  readPrimaryAdminVerifyRequest,
} from '@/lib/primaryAdminReauth';
import {
  authorizeAndExecuteManualReceiptPayment,
  previewManualReceiptPayment,
  toPublicManualPaymentError,
  toPublicManualPaymentPreviewError,
} from '@/lib/finance/manualReceiptPayment';
import {
  createManualPaymentDeps,
  createManualPaymentPreviewDeps,
  loadManualReceiptRow,
  persistManualPaymentAudit,
  persistManualPaymentLotAudit,
  persistPrimaryAdminVerifyAudit,
} from '@/lib/finance/manualReceiptPaymentServer';

export const runtime = 'nodejs';

const rateLimitStore = new Map<string, number[]>();

function denied(error = PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE, status = 401) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function buildDeps() {
  const { client: admin } = createAdminSupabase();
  const authEnv = getEphemeralAuthEnv();
  if (!admin || !authEnv) return null;
  return {
    admin,
    deps: createManualPaymentDeps(admin, authEnv, rateLimitStore),
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ receiptId: string }> },
) {
  const auth = await getRequestAuthUser(request);
  if (!auth.user?.id) {
    return NextResponse.json(toPublicManualPaymentPreviewError('unauthenticated'), { status: 401 });
  }
  const { receiptId } = await context.params;
  const { client: admin } = createAdminSupabase();
  if (!admin) {
    console.warn('[manual-payment-preview] admin client unavailable');
    return NextResponse.json(toPublicManualPaymentPreviewError('load_failed'), { status: 422 });
  }

  try {
    const preview = await previewManualReceiptPayment(createManualPaymentPreviewDeps(admin), {
      operatorUserId: auth.user.id,
      receiptId,
    });
    if (!preview.ok) {
      console.warn('[manual-payment-preview]', preview.code, {
        receiptId,
        operatorUserId: auth.user.id,
      });
      const pub = toPublicManualPaymentPreviewError(preview.code);
      return NextResponse.json(pub, { status: pub.code === 'unauthenticated' ? 401 : 422 });
    }
    return NextResponse.json(preview);
  } catch (err) {
    console.warn(
      '[manual-payment-preview] exception',
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(toPublicManualPaymentPreviewError('load_failed'), { status: 422 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ receiptId: string }> },
) {
  const auth = await getRequestAuthUser(request);
  if (!auth.user?.id) {
    return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 });
  }
  const { receiptId } = await context.params;
  const wired = await buildDeps();
  if (!wired) return denied();

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const { password } = readPrimaryAdminVerifyRequest(body);
  const receipt = await loadManualReceiptRow(wired.admin, receiptId);
  const { result, verify } = await authorizeAndExecuteManualReceiptPayment(wired.deps, {
    operatorUserId: auth.user.id,
    receiptId,
    password,
  });

  if (verify) {
    await persistPrimaryAdminVerifyAudit(wired.admin, verify);
  }
  await persistManualPaymentAudit(wired.admin, { result, verify, receipt });

  if (!result.ok) {
    const pub = toPublicManualPaymentError(result);
    const status =
      result.code === 'already_paid' ? 409 : result.code === 'persistence_failed' ? 500 : 401;
    return NextResponse.json(pub, { status });
  }

  await persistManualPaymentLotAudit(wired.admin, receipt || {
    id: result.receiptId,
  }, result.requestedBy);

  return NextResponse.json({
    ok: true,
    receiptId: result.receiptId,
    cashMovementId: result.cashMovementId,
    authorizedBy: {
      userId: result.authorizedBy,
      displayName: result.authorizedByName,
      maskedEmail: result.authorizedByMaskedEmail,
    },
  });
}
