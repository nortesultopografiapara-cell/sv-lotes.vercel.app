import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  getTopographyProjectById,
  logTopographyProjectAudit,
  patchTopographyProjectFields,
  updateTopographyProject,
} from '@/lib/master/topography/projectsService';
import { isTopographyStatus } from '@/lib/master/topography/statuses';
import { validateTopographyProjectInput } from '@/lib/master/topography/validation';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const auth = await assertSuperAdmin(supabaseAdmin, searchParams.get('userId'));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const { id } = await context.params;
  try {
    const project = await getTopographyProjectById(supabaseAdmin, id);
    if (!project) return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 });
    const { computeProjectCorporateFinancialSummary } = await import(
      '@/lib/master/corporateFinance/projectReceivedBridge'
    );
    const financialSummary = await computeProjectCorporateFinancialSummary(supabaseAdmin, {
      projectId: project.id,
      contractValue: Number(project.contract_value || 0),
      legacyValorRecebido: Number(project.valor_recebido || 0),
    });
    return NextResponse.json({ project, financialSummary });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao carregar projeto.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: Ctx) {
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

    // Patch parcial: status / progresso
    if (body.patchOnly) {
      const fields: Record<string, unknown> = {};
      if (body.status != null) {
        const status = String(body.status);
        if (!isTopographyStatus(status)) {
          return NextResponse.json({ error: 'Status inválido.' }, { status: 400 });
        }
        fields.status = status;
      }
      if (body.progress_percent != null || body.progressPercent != null) {
        const n = Number(body.progress_percent ?? body.progressPercent);
        if (!Number.isInteger(n) || n < 0 || n > 100) {
          return NextResponse.json({ error: 'Progresso deve ser 0 a 100.' }, { status: 400 });
        }
        fields.progress_percent = n;
      }
      if (body.physical_progress_percent != null || body.physicalProgressPercent != null) {
        const n = Number(body.physical_progress_percent ?? body.physicalProgressPercent);
        if (!Number.isInteger(n) || n < 0 || n > 100) {
          return NextResponse.json({ error: 'Progresso físico deve ser 0 a 100.' }, { status: 400 });
        }
        fields.physical_progress_percent = n;
      }
      if (Object.keys(fields).length === 0) {
        return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 });
      }

      const project = await patchTopographyProjectFields(supabaseAdmin, id, fields);

      if (fields.status != null && fields.status !== existing.status) {
        await logTopographyProjectAudit(supabaseAdmin, {
          userId: body.userId ? String(body.userId) : null,
          action: 'TOPOGRAPHY_PROJECT_STATUS_CHANGED',
          entityId: id,
          description: `Status ${existing.code}: ${existing.status} → ${fields.status}`,
          oldData: { status: existing.status },
          newData: { status: fields.status },
        });
      }
      if (fields.progress_percent != null && fields.progress_percent !== existing.progress_percent) {
        await logTopographyProjectAudit(supabaseAdmin, {
          userId: body.userId ? String(body.userId) : null,
          action: 'TOPOGRAPHY_PROJECT_PROGRESS_CHANGED',
          entityId: id,
          description: `Progresso ${existing.code}: ${existing.progress_percent}% → ${fields.progress_percent}%`,
          oldData: { progress_percent: existing.progress_percent },
          newData: { progress_percent: fields.progress_percent },
        });
      }

      return NextResponse.json({ project });
    }

    const input = validateTopographyProjectInput(body);
    const project = await updateTopographyProject(supabaseAdmin, id, input);

    const audits: Array<{ action: string; description: string; oldData: unknown; newData: unknown }> =
      [];

    if (existing.status !== project.status) {
      audits.push({
        action: 'TOPOGRAPHY_PROJECT_STATUS_CHANGED',
        description: `Status ${project.code}: ${existing.status} → ${project.status}`,
        oldData: { status: existing.status },
        newData: { status: project.status },
      });
    }
    if (existing.internal_manager !== project.internal_manager) {
      audits.push({
        action: 'TOPOGRAPHY_PROJECT_MANAGER_CHANGED',
        description: `Responsável ${project.code} alterado`,
        oldData: { internal_manager: existing.internal_manager },
        newData: { internal_manager: project.internal_manager },
      });
    }
    if (Number(existing.contract_value || 0) !== Number(project.contract_value || 0)) {
      audits.push({
        action: 'TOPOGRAPHY_PROJECT_VALUE_CHANGED',
        description: `Valor contratado ${project.code} alterado`,
        oldData: { contract_value: existing.contract_value },
        newData: { contract_value: project.contract_value },
      });
    }
    if (existing.progress_percent !== project.progress_percent) {
      audits.push({
        action: 'TOPOGRAPHY_PROJECT_PROGRESS_CHANGED',
        description: `Progresso ${project.code} alterado`,
        oldData: { progress_percent: existing.progress_percent },
        newData: { progress_percent: project.progress_percent },
      });
    }

    if (audits.length === 0) {
      await logTopographyProjectAudit(supabaseAdmin, {
        userId: body.userId ? String(body.userId) : null,
        action: 'TOPOGRAPHY_PROJECT_UPDATED',
        entityId: id,
        description: `Projeto ${project.code} editado`,
        oldData: { title: existing.title },
        newData: { title: project.title },
      });
    } else {
      for (const a of audits) {
        await logTopographyProjectAudit(supabaseAdmin, {
          userId: body.userId ? String(body.userId) : null,
          action: a.action,
          entityId: id,
          description: a.description,
          oldData: a.oldData,
          newData: a.newData,
        });
      }
    }

    return NextResponse.json({ project });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao atualizar projeto.';
    const status = message.includes('obrigatório') || message.includes('inválid') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
