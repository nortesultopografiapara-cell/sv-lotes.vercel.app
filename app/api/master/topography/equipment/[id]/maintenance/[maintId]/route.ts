import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { updateEquipmentMaintenance } from '@/lib/master/topography/equipmentMaintenanceService';
import { validateEquipmentMaintenancePatch } from '@/lib/master/topography/equipmentMaintenanceValidation';

type Ctx = { params: Promise<{ id: string; maintId: string }> };

export async function PATCH(request: Request, context: Ctx) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { id, maintId } = await context.params;

  try {
    const body = await request.json();
    const auth = await assertSuperAdmin(supabaseAdmin, body.userId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const patch = validateEquipmentMaintenancePatch(body);
    const maintenance = await updateEquipmentMaintenance(supabaseAdmin, {
      equipmentId: id,
      maintenanceId: maintId,
      patch,
      userId: body.userId ? String(body.userId) : null,
    });

    return NextResponse.json({ maintenance });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao atualizar manutenção.';
    const status =
      message.includes('obrigatório') ||
      message.includes('inválid') ||
      message.includes('Nada para') ||
      message.includes('não pode')
        ? 400
        : message.includes('não encontrad')
          ? 404
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
