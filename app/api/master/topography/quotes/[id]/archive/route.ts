import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  archiveTopographyQuote,
  getTopographyQuoteById,
  logTopographyQuoteAudit,
} from '@/lib/master/topography/quotesService';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }
  const { id } = await context.params;
  try {
    const body = await request.json();
    const auth = await assertSuperAdmin(supabaseAdmin, body.userId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

    const existing = await getTopographyQuoteById(supabaseAdmin, id);
    if (!existing) {
      return NextResponse.json({ error: 'Orçamento não encontrado.' }, { status: 404 });
    }

    const quote = await archiveTopographyQuote(supabaseAdmin, id);
    await logTopographyQuoteAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'TOPOGRAPHY_QUOTE_ARCHIVED',
      entityId: id,
      description: `Orçamento ${quote.code} arquivado`,
    });
    return NextResponse.json({ quote });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao arquivar.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
