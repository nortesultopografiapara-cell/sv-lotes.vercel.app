import { NextResponse } from 'next/server';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';
import {
  LegacySignalAccessError,
  loadLegacySignalActor,
  previewLegacySignalForActor,
  readLegacySignalRequest,
} from '@/lib/finance/legacySignalRegularizationServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      return NextResponse.json({ success: false, code: 'UNAUTHORIZED', message: 'Sessão ou autorização inválida.', mutation: false }, { status: 401 });
    }
    const { client: admin, configError: adminError } = createAdminSupabase();
    if (!admin || adminError) {
      return NextResponse.json({ success: false, code: 'SUPABASE_CONFIG', message: 'Supabase não configurado.', mutation: false }, { status: 503 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = readLegacySignalRequest(body);
    if ('error' in parsed) {
      return NextResponse.json({ success: false, code: 'invalid', message: parsed.error, mutation: false }, { status: 400 });
    }
    const actor = await loadLegacySignalActor(admin, user.id);
    const preview = await previewLegacySignalForActor(admin, actor, String(body.saleId || '').trim(), {
      ...parsed,
      confirm: false,
    });
    return NextResponse.json({ success: preview.ok, ...preview, mutation: false });
  } catch (error) {
    if (error instanceof LegacySignalAccessError) {
      return NextResponse.json({ success: false, code: error.code, message: error.message, mutation: false }, { status: error.status });
    }
    console.error('[legacy-signal-regularization/preview]', error);
    return NextResponse.json({ success: false, code: 'preview_failed', message: 'Não foi possível montar a prévia.', mutation: false }, { status: 500 });
  }
}
