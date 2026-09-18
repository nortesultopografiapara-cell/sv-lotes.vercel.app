import { NextResponse } from 'next/server';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';
import {
  PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE,
  previewPrimaryAdminIdentity,
  readPrimaryAdminVerifyRequest,
  toPublicPrimaryAdminVerifyResult,
  verifyPrimaryAdminPassword,
} from '@/lib/primaryAdminReauth';
import {
  createPrimaryAdminReauthDeps,
  getEphemeralAuthEnv,
  persistPrimaryAdminVerifyAudit,
} from '@/lib/primaryAdminReauthServer';

export const runtime = 'nodejs';

const rateLimitStore = new Map<string, number[]>();

function deniedResponse() {
  return NextResponse.json(
    { ok: false, error: PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE },
    { status: 401 },
  );
}

async function buildDeps() {
  const { client: admin } = createAdminSupabase();
  const authEnv = getEphemeralAuthEnv();
  if (!admin || !authEnv) return null;
  return { admin, deps: createPrimaryAdminReauthDeps(admin, authEnv, rateLimitStore) };
}

export async function GET(request: Request) {
  const auth = await getRequestAuthUser(request);
  if (!auth.user?.id) {
    return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 });
  }

  const wired = await buildDeps();
  if (!wired) return deniedResponse();

  const preview = await previewPrimaryAdminIdentity(wired.deps, auth.user.id);
  if (!preview.ok) return deniedResponse();
  return NextResponse.json(preview);
}

export async function POST(request: Request) {
  const auth = await getRequestAuthUser(request);
  if (!auth.user?.id) {
    return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 });
  }

  const wired = await buildDeps();
  if (!wired) return deniedResponse();

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const { password } = readPrimaryAdminVerifyRequest(body);
  const result = await verifyPrimaryAdminPassword(wired.deps, {
    operatorUserId: auth.user.id,
    password,
  });

  await persistPrimaryAdminVerifyAudit(wired.admin, result);

  if (!result.ok) return deniedResponse();
  return NextResponse.json(toPublicPrimaryAdminVerifyResult(result));
}
