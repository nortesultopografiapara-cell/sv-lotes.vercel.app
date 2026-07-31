import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getTopographyEquipmentById } from '@/lib/master/topography/equipmentService';
import {
  createEquipmentMaintenance,
  listEquipmentMaintenance,
} from '@/lib/master/topography/equipmentMaintenanceService';
import { validateEquipmentMaintenanceInput } from '@/lib/master/topography/equipmentMaintenanceValidation';

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
    const maintenance = await listEquipmentMaintenance(supabaseAdmin, id, {
      includeArchived: searchParams.get('includeArchived') === '1',
    });
    return NextResponse.json({ maintenance });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao listar manutenções.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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

    const input = validateEquipmentMaintenanceInput(body);
    const maintenance = await createEquipmentMaintenance(supabaseAdmin, {
      equipmentId: id,
      input,
      createdBy: body.userId ? String(body.userId) : null,
    });

    return NextResponse.json({ maintenance }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao criar manutenção.';
    const status =
      message.includes('obrigatório') ||
      message.includes('inválid') ||
      message.includes('não pode') ||
      message.includes('não encontrado')
        ? message.includes('não encontrado')
          ? 404
          : 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
