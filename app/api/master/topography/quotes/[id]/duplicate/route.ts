import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  duplicateTopographyQuote,
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

    const quote = await duplicateTopographyQuote(
      supabaseAdmin,
      id,
      body.userId ? String(body.userId) : null,
    );
    await logTopographyQuoteAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'TOPOGRAPHY_QUOTE_DUPLICATED',
      entityId: quote.id,
      description: `Orçamento duplicado como ${quote.code}`,
    });
    return NextResponse.json({ quote }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao duplicar.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
