import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  listPriceDatabases,
  searchPriceCatalog,
} from '@/lib/master/topography/priceCatalogService';

export async function GET(request: Request) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const auth = await assertSuperAdmin(supabaseAdmin, searchParams.get('userId'));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  try {
    if (searchParams.get('mode') === 'databases') {
      const databases = await listPriceDatabases(supabaseAdmin);
      return NextResponse.json({ databases });
    }

    const result = await searchPriceCatalog(supabaseAdmin, {
      q: searchParams.get('q') || undefined,
      bankCode: searchParams.get('bank') || searchParams.get('bankCode') || undefined,
      page: Number(searchParams.get('page') || 1),
      limit: Number(searchParams.get('limit') || 20),
      includeCustom: searchParams.get('includeCustom') !== '0',
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha na pesquisa do catálogo.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
