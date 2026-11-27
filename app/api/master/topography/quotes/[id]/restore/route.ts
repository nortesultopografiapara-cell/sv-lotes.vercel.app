import { authorizePlatformAdminRequest } from '@/lib/security/adminAuthorization';
import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  getTopographyQuoteById,
  logTopographyQuoteAudit,
  restoreTopographyQuote,
} from '@/lib/master/topography/quotesService';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
    const { id } = await context.params;
  try {
    const body = await request.json();
    const auth = await authorizePlatformAdminRequest(request, body.userId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }


    const existing = await getTopographyQuoteById(supabaseAdmin, id);
    if (!existing) {
      return NextResponse.json({ error: 'Orçamento não encontrado.' }, { status: 404 });
    }

    const quote = await restoreTopographyQuote(supabaseAdmin, id);
    await logTopographyQuoteAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'TOPOGRAPHY_QUOTE_RESTORED',
      entityId: id,
      description: `Orçamento ${quote.code} restaurado`,
    });
    return NextResponse.json({ quote });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao restaurar.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
