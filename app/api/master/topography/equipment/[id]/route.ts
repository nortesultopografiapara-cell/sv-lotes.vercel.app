import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  getTopographyEquipmentById,
  logTopographyEquipmentAudit,
  patchTopographyEquipmentFields,
  updateTopographyEquipment,
} from '@/lib/master/topography/equipmentService';
import { isEquipmentStatus } from '@/lib/master/topography/equipmentStatuses';
import { validateTopographyEquipmentInput } from '@/lib/master/topography/equipmentValidation';

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
    const equipment = await getTopographyEquipmentById(supabaseAdmin, id);
    if (!equipment) {
      return NextResponse.json({ error: 'Equipamento não encontrado.' }, { status: 404 });
    }
    return NextResponse.json({ equipment });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao carregar equipamento.';
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

    const existing = await getTopographyEquipmentById(supabaseAdmin, id);
    if (!existing) {
      return NextResponse.json({ error: 'Equipamento não encontrado.' }, { status: 404 });
    }

    // Patch parcial: status / localização / horas / arquivamento lógico
    if (body.patchOnly) {
      const fields: Record<string, unknown> = {};
      if (body.status != null) {
        const status = String(body.status);
        if (!isEquipmentStatus(status)) {
          return NextResponse.json({ error: 'Status inválido.' }, { status: 400 });
        }
        fields.status = status;
      }
      if (body.location != null) {
        fields.location = String(body.location).trim() || null;
      }
      if (body.usage_hours != null || body.usageHours != null) {
        const n = Number(body.usage_hours ?? body.usageHours);
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json({ error: 'Horas de uso inválidas.' }, { status: 400 });
        }
        fields.usage_hours = Math.round(n * 100) / 100;
      }
      if (body.is_archived != null || body.isArchived != null) {
        fields.is_archived = Boolean(body.is_archived ?? body.isArchived);
      }
      if (Object.keys(fields).length === 0) {
        return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 });
      }

      const equipment = await patchTopographyEquipmentFields(supabaseAdmin, id, fields);

      if (fields.status != null && fields.status !== existing.status) {
        await logTopographyEquipmentAudit(supabaseAdmin, {
          userId: body.userId ? String(body.userId) : null,
          action: 'TOPOGRAPHY_EQUIPMENT_STATUS_CHANGED',
          entityId: id,
          description: `Status ${existing.code}: ${existing.status} → ${fields.status}`,
          oldData: { status: existing.status },
          newData: { status: fields.status },
        });
      }

      if (
        fields.is_archived != null &&
        Boolean(fields.is_archived) !== Boolean(existing.is_archived)
      ) {
        await logTopographyEquipmentAudit(supabaseAdmin, {
          userId: body.userId ? String(body.userId) : null,
          action: fields.is_archived
            ? 'TOPOGRAPHY_EQUIPMENT_ARCHIVED'
            : 'TOPOGRAPHY_EQUIPMENT_RESTORED',
          entityId: id,
          description: fields.is_archived
            ? `Equipamento ${existing.code} arquivado`
            : `Equipamento ${existing.code} restaurado`,
          oldData: { is_archived: existing.is_archived },
          newData: { is_archived: fields.is_archived },
        });
      }

      return NextResponse.json({ equipment });
    }

    const input = validateTopographyEquipmentInput(body);
    const equipment = await updateTopographyEquipment(supabaseAdmin, id, input);

    const audits: Array<{
      action: string;
      description: string;
      oldData: unknown;
      newData: unknown;
    }> = [];

    if (existing.status !== equipment.status) {
      audits.push({
        action: 'TOPOGRAPHY_EQUIPMENT_STATUS_CHANGED',
        description: `Status ${equipment.code}: ${existing.status} → ${equipment.status}`,
        oldData: { status: existing.status },
        newData: { status: equipment.status },
      });
    }
    if (
      existing.responsible_user_id !== equipment.responsible_user_id ||
      existing.responsible_name !== equipment.responsible_name
    ) {
      audits.push({
        action: 'TOPOGRAPHY_EQUIPMENT_RESPONSIBLE_CHANGED',
        description: `Responsável ${equipment.code} alterado`,
        oldData: {
          responsible_user_id: existing.responsible_user_id,
          responsible_name: existing.responsible_name,
        },
        newData: {
          responsible_user_id: equipment.responsible_user_id,
          responsible_name: equipment.responsible_name,
        },
      });
    }
    if (existing.location !== equipment.location) {
      audits.push({
        action: 'TOPOGRAPHY_EQUIPMENT_LOCATION_CHANGED',
        description: `Localização ${equipment.code} alterada`,
        oldData: { location: existing.location },
        newData: { location: equipment.location },
      });
    }

    if (audits.length === 0) {
      await logTopographyEquipmentAudit(supabaseAdmin, {
        userId: body.userId ? String(body.userId) : null,
        action: 'TOPOGRAPHY_EQUIPMENT_UPDATED',
        entityId: id,
        description: `Equipamento ${equipment.code} editado`,
        oldData: { name: existing.name },
        newData: { name: equipment.name },
      });
    } else {
      for (const a of audits) {
        await logTopographyEquipmentAudit(supabaseAdmin, {
          userId: body.userId ? String(body.userId) : null,
          action: a.action,
          entityId: id,
          description: a.description,
          oldData: a.oldData,
          newData: a.newData,
        });
      }
    }

    return NextResponse.json({ equipment });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao atualizar equipamento.';
    const status =
      message.includes('obrigatório') ||
      message.includes('inválid') ||
      message.includes('já cadastrado') ||
      message.includes('não pode')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
