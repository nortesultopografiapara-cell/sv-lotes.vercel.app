import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { registerPriceImport } from '@/lib/master/topography/priceCatalogService';
import { logTopographyQuoteAudit } from '@/lib/master/topography/quotesService';

/**
 * Mecanismo de importação preparado (sem conexão automática a órgãos).
 * Body: { userId, bankCode, uf?, competence?, version?, sourceFilename?, rows: [...] }
 */
export async function POST(request: Request) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  try {
    const body = await request.json();
    const auth = await assertSuperAdmin(supabaseAdmin, body.userId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) {
      return NextResponse.json({ error: 'Nenhuma linha para importar.' }, { status: 400 });
    }

    const result = await registerPriceImport(supabaseAdmin, {
      bankCode: String(body.bankCode || body.bank || ''),
      uf: body.uf ?? null,
      competence: body.competence ?? null,
      version: body.version ?? null,
      sourceFilename: body.sourceFilename ?? null,
      sourceOrigin: body.sourceOrigin ?? 'MANUAL_UPLOAD',
      rows: rows.map((r: Record<string, unknown>) => ({
        code: String(r.code || ''),
        description: String(r.description || ''),
        unit: r.unit ? String(r.unit) : 'UN',
        reference_price: Number(r.reference_price ?? r.referencePrice ?? r.price ?? 0),
        item_type: r.item_type ? String(r.item_type) : 'COMPOSICAO',
      })),
      userId: body.userId ? String(body.userId) : null,
    });

    await logTopographyQuoteAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'TOPOGRAPHY_PRICE_IMPORT',
      entityId: result.importId,
      description: `Importação de preços ${body.bankCode || ''} — ${result.rowsOk} ok`,
      newData: result,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha na importação.';
    const status = /obrigatório|inválid|Nenhuma/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
