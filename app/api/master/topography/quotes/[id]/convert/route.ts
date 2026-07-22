import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  convertQuoteToProject,
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

    const result = await convertQuoteToProject(
      supabaseAdmin,
      id,
      body.userId ? String(body.userId) : null,
    );

    await logTopographyQuoteAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'TOPOGRAPHY_QUOTE_CONVERTED',
      entityId: id,
      description: `Orçamento ${result.quote.code} convertido em ${result.projectCode}`,
      newData: { projectId: result.projectId, projectCode: result.projectCode },
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao converter orçamento.';
    const status = /já foi convertido|não pode|bloqueada|não encontrado/i.test(message)
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
