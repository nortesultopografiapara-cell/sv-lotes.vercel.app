import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  archiveTopographyProject,
  getTopographyProjectById,
  logTopographyProjectAudit,
} from '@/lib/master/topography/projectsService';

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

    const existing = await getTopographyProjectById(supabaseAdmin, id);
    if (!existing) {
      return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 });
    }

    const project = await archiveTopographyProject(supabaseAdmin, id);
    await logTopographyProjectAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'TOPOGRAPHY_PROJECT_ARCHIVED',
      entityId: id,
      description: `Projeto ${project.code} arquivado`,
      oldData: { is_archived: existing.is_archived, status: existing.status },
      newData: { is_archived: true, status: project.status },
    });

    return NextResponse.json({ project });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao arquivar projeto.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
