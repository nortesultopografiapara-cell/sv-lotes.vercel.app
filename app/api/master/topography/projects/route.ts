import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  createTopographyProject,
  listTopographyProjects,
  logTopographyProjectAudit,
} from '@/lib/master/topography/projectsService';
import { validateTopographyProjectInput } from '@/lib/master/topography/validation';

export async function GET(request: Request) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const auth = await assertSuperAdmin(supabaseAdmin, userId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  try {
    const result = await listTopographyProjects(supabaseAdmin, {
      q: searchParams.get('q') || undefined,
      status: searchParams.get('status') || undefined,
      category: searchParams.get('category') || undefined,
      serviceType: searchParams.get('serviceType') || undefined,
      priority: searchParams.get('priority') || undefined,
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
    const message = err instanceof Error ? err.message : 'Falha ao listar projetos.';
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
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const input = validateTopographyProjectInput(body);
    const project = await createTopographyProject(
      supabaseAdmin,
      input,
      body.userId ? String(body.userId) : null,
    );

    await logTopographyProjectAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'TOPOGRAPHY_PROJECT_CREATED',
      entityId: project.id,
      description: `Projeto ${project.code} criado: ${project.title}`,
      newData: { code: project.code, title: project.title, status: project.status },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao criar projeto.';
    const status = message.includes('obrigatório') || message.includes('inválid') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
