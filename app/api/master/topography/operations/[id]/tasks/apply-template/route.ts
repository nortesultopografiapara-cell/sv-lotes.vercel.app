import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { isChecklistTemplateCode } from '@/lib/master/topography/operationChecklistTemplates';
import { getTopographyOperationById } from '@/lib/master/topography/operationService';
import { applyChecklistTemplate } from '@/lib/master/topography/operationTaskService';

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
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const operation = await getTopographyOperationById(supabaseAdmin, id);
    if (!operation) {
      return NextResponse.json({ error: 'Operação não encontrada.' }, { status: 404 });
    }

    const templateRaw = String(body.template || '').trim();
    if (!isChecklistTemplateCode(templateRaw)) {
      return NextResponse.json({ error: 'Template inválido.' }, { status: 400 });
    }

    const tasks = await applyChecklistTemplate(
      supabaseAdmin,
      id,
      templateRaw,
      body.userId ? String(body.userId) : null,
    );

    return NextResponse.json({ tasks }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao aplicar template.';
    const status = message.includes('Template inválido') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
