import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { createCustomPriceItem } from '@/lib/master/topography/priceCatalogService';
import { logTopographyQuoteAudit } from '@/lib/master/topography/quotesService';

export async function POST(request: Request) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  try {
    const body = await request.json();
    const auth = await assertSuperAdmin(supabaseAdmin, body.userId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

    const item = await createCustomPriceItem(
      supabaseAdmin,
      {
        code: String(body.code || ''),
        description: String(body.description || ''),
        category: body.category ?? null,
        unit: String(body.unit || 'UN'),
        price: Number(body.price),
        notes: body.notes ?? null,
      },
      body.userId ? String(body.userId) : null,
    );

    await logTopographyQuoteAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'TOPOGRAPHY_CUSTOM_ITEM_CREATED',
      entityId: item.id,
      description: `Item próprio ${item.code} criado`,
      newData: { code: item.code, price: item.price },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao criar item próprio.';
    const status = /obrigatório|inválid/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
