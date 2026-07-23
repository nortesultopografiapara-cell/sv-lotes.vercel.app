import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  getTopographyProjectById,
  logTopographyProjectAudit,
  restoreTopographyProject,
} from '@/lib/master/topography/projectsService';
import { isTopographyStatus } from '@/lib/master/topography/statuses';

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

    const status = String(body.status || 'PLANEJAMENTO');
    if (!isTopographyStatus(status) || status === 'ARQUIVADO') {
      return NextResponse.json({ error: 'Status de restauração inválido.' }, { status: 400 });
    }

    const project = await restoreTopographyProject(supabaseAdmin, id, status);
    await logTopographyProjectAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'TOPOGRAPHY_PROJECT_RESTORED',
      entityId: id,
      description: `Projeto ${project.code} restaurado`,
      oldData: { is_archived: existing.is_archived, status: existing.status },
      newData: { is_archived: false, status: project.status },
    });

    return NextResponse.json({ project });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao restaurar projeto.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
