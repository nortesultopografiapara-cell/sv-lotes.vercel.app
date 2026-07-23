import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  createTopographyQuote,
  listTopographyQuotes,
  logTopographyQuoteAudit,
} from '@/lib/master/topography/quotesService';
import { validateTopographyQuoteInput } from '@/lib/master/topography/quoteValidation';

export async function GET(request: Request) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const auth = await assertSuperAdmin(supabaseAdmin, searchParams.get('userId'));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  try {
    const result = await listTopographyQuotes(supabaseAdmin, {
      q: searchParams.get('q') || undefined,
      status: searchParams.get('status') || undefined,
      category: searchParams.get('category') || undefined,
      serviceType: searchParams.get('serviceType') || undefined,
      city: searchParams.get('city') || undefined,
      manager: searchParams.get('manager') || undefined,
      fromDate: searchParams.get('fromDate') || undefined,
      toDate: searchParams.get('toDate') || undefined,
      includeArchived: searchParams.get('includeArchived') === '1',
      page: Number(searchParams.get('page') || 1),
      limit: Number(searchParams.get('limit') || 20),
      sort: (searchParams.get('sort') as 'created_at') || 'created_at',
      order: searchParams.get('order') === 'asc' ? 'asc' : 'desc',
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao listar orçamentos.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  try {
    const body = await request.json();
    const auth = await assertSuperAdmin(supabaseAdmin, body.userId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

    const input = validateTopographyQuoteInput(body);
    const quote = await createTopographyQuote(
      supabaseAdmin,
      input,
      body.userId ? String(body.userId) : null,
    );
    await logTopographyQuoteAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'TOPOGRAPHY_QUOTE_CREATED',
      entityId: quote.id,
      description: `Orçamento ${quote.code} criado`,
      newData: { code: quote.code, status: quote.status },
    });
    return NextResponse.json({ quote }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao criar orçamento.';
    const status = /obrigatório|inválid|não pode/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
