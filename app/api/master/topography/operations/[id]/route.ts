import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  getTopographyOperationById,
  logTopographyOperationAudit,
  patchTopographyOperationFields,
  updateTopographyOperation,
} from '@/lib/master/topography/operationService';
import {
  OPERATION_REOPEN_TARGETS,
  type OperationStatusCode,
} from '@/lib/master/topography/operationStatuses';
import {
  validateOperationStatusChange,
  validateTopographyOperationInput,
} from '@/lib/master/topography/operationValidation';

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
    const operation = await getTopographyOperationById(supabaseAdmin, id);
    if (!operation) {
      return NextResponse.json({ error: 'Operação não encontrada.' }, { status: 404 });
    }
    return NextResponse.json({ operation });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao carregar operação.';
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

    const existing = await getTopographyOperationById(supabaseAdmin, id);
    if (!existing) {
      return NextResponse.json({ error: 'Operação não encontrada.' }, { status: 404 });
    }

    // Patch parcial: status controlado / arquivamento lógico (sem hard delete)
    if (body.patchOnly) {
      const fields: Record<string, unknown> = {};

      if (body.status != null) {
        const nextStatus = validateOperationStatusChange(existing.status, body.status, {
          allowReopen: true,
          actualEnd:
            body.actual_end != null || body.actualEnd != null
              ? String(body.actual_end ?? body.actualEnd)
              : existing.actual_end,
        });
        fields.status = nextStatus;

        // Permitir informar actual_end no mesmo patch ao concluir
        if (body.actual_end != null || body.actualEnd != null) {
          const endRaw = String(body.actual_end ?? body.actualEnd).trim();
          if (endRaw) {
            const ms = Date.parse(endRaw);
            if (!Number.isFinite(ms)) {
              return NextResponse.json({ error: 'Fim real inválido.' }, { status: 400 });
            }
            fields.actual_end = new Date(ms).toISOString();
          }
        }

        const { evaluateOperationStatusGates } = await import(
          '@/lib/master/topography/operationStatusGates'
        );
        const gate = await evaluateOperationStatusGates(supabaseAdmin, id, {
          to: nextStatus,
          actualEnd:
            (fields.actual_end as string | undefined) ||
            existing.actual_end,
          overrideReason:
            body.overrideReason ?? body.override_reason ?? body.completion_override_reason,
          userId: body.userId ? String(body.userId) : null,
        });
        if (!gate.ok) {
          return NextResponse.json(
            {
              error: gate.message,
              requiresOverride: gate.requiresOverride,
              warnings: gate.warnings,
            },
            { status: 400 },
          );
        }
        if (gate.patchFields) Object.assign(fields, gate.patchFields);
        if (gate.warnings?.length) {
          (body as { __warnings?: string[] }).__warnings = gate.warnings;
        }
      }

      if (body.is_archived != null || body.isArchived != null) {
        fields.is_archived = Boolean(body.is_archived ?? body.isArchived);
      }

      if (Object.keys(fields).length === 0) {
        return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 });
      }

      const operation = await patchTopographyOperationFields(supabaseAdmin, id, fields);

      if (fields.status != null && fields.status !== existing.status) {
        const from = existing.status;
        const to = String(fields.status) as OperationStatusCode;
        const isReopen =
          (from === 'COMPLETED' || from === 'CANCELED') &&
          (OPERATION_REOPEN_TARGETS as readonly string[]).includes(to);

        await logTopographyOperationAudit(supabaseAdmin, {
          userId: body.userId ? String(body.userId) : null,
          action: isReopen
            ? 'TOPOGRAPHY_OPERATION_REOPENED'
            : 'TOPOGRAPHY_OPERATION_STATUS_CHANGED',
          entityId: id,
          description: isReopen
            ? `Reabertura SUPER_ADMIN ${existing.code}: ${from} → ${to}`
            : `Status ${existing.code}: ${from} → ${to}`,
          oldData: { status: from, actual_end: existing.actual_end },
          newData: {
            status: to,
            actual_end: operation.actual_end,
            reopen: isReopen,
            actor_role: 'SUPER_ADMIN',
          },
        });
      }

      if (
        fields.is_archived != null &&
        Boolean(fields.is_archived) !== Boolean(existing.is_archived)
      ) {
        await logTopographyOperationAudit(supabaseAdmin, {
          userId: body.userId ? String(body.userId) : null,
          action: fields.is_archived
            ? 'TOPOGRAPHY_OPERATION_ARCHIVED'
            : 'TOPOGRAPHY_OPERATION_RESTORED',
          entityId: id,
          description: fields.is_archived
            ? `Operação ${existing.code} arquivada`
            : `Operação ${existing.code} restaurada`,
          oldData: { is_archived: existing.is_archived },
          newData: { is_archived: fields.is_archived },
        });
      }

      return NextResponse.json({
        operation,
        warnings: (body as { __warnings?: string[] }).__warnings,
      });
    }

    const input = validateTopographyOperationInput(body, {
      previousStatus: existing.status,
    });

    // Código imutável: update nunca envia code
    const operation = await updateTopographyOperation(supabaseAdmin, id, input);

    const audits: Array<{
      action: string;
      description: string;
      oldData: unknown;
      newData: unknown;
    }> = [];

    if (existing.status !== operation.status) {
      const isReopen =
        (existing.status === 'COMPLETED' || existing.status === 'CANCELED') &&
        (OPERATION_REOPEN_TARGETS as readonly string[]).includes(operation.status);
      audits.push({
        action: isReopen
          ? 'TOPOGRAPHY_OPERATION_REOPENED'
          : 'TOPOGRAPHY_OPERATION_STATUS_CHANGED',
        description: isReopen
          ? `Reabertura SUPER_ADMIN ${operation.code}: ${existing.status} → ${operation.status}`
          : `Status ${operation.code}: ${existing.status} → ${operation.status}`,
        oldData: { status: existing.status },
        newData: {
          status: operation.status,
          reopen: isReopen,
          actor_role: 'SUPER_ADMIN',
        },
      });
    }

    if (audits.length === 0) {
      await logTopographyOperationAudit(supabaseAdmin, {
        userId: body.userId ? String(body.userId) : null,
        action: 'TOPOGRAPHY_OPERATION_UPDATED',
        entityId: id,
        description: `Operação ${operation.code} editada`,
        oldData: { title: existing.title, status: existing.status },
        newData: { title: operation.title, status: operation.status },
      });
    } else {
      for (const a of audits) {
        await logTopographyOperationAudit(supabaseAdmin, {
          userId: body.userId ? String(body.userId) : null,
          action: a.action,
          entityId: id,
          description: a.description,
          oldData: a.oldData,
          newData: a.newData,
        });
      }
    }

    return NextResponse.json({ operation });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao atualizar operação.';
    const status =
      message.includes('obrigatório') ||
      message.includes('inválid') ||
      message.includes('não pode') ||
      message.includes('exige') ||
      message.includes('Transição') ||
      message.includes('Referência')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
