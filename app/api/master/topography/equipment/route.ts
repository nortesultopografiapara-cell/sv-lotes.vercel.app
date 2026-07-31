import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  createTopographyEquipment,
  listTopographyEquipment,
  logTopographyEquipmentAudit,
} from '@/lib/master/topography/equipmentService';
import { validateTopographyEquipmentInput } from '@/lib/master/topography/equipmentValidation';

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
    const result = await listTopographyEquipment(supabaseAdmin, {
      q: searchParams.get('q') || undefined,
      status: searchParams.get('status') || undefined,
      category: searchParams.get('category') || undefined,
      location: searchParams.get('location') || undefined,
      responsible: searchParams.get('responsible') || undefined,
      includeArchived: searchParams.get('includeArchived') === '1',
      page: Number(searchParams.get('page') || 1),
      limit: Number(searchParams.get('limit') || 20),
      sort:
        (searchParams.get('sort') as
          | 'created_at'
          | 'name'
          | 'code'
          | 'purchase_value'
          | 'next_calibration_date') || 'created_at',
      order: searchParams.get('order') === 'asc' ? 'asc' : 'desc',
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao listar equipamentos.';
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

    const input = validateTopographyEquipmentInput(body);
    const equipment = await createTopographyEquipment(
      supabaseAdmin,
      input,
      body.userId ? String(body.userId) : null,
    );

    await logTopographyEquipmentAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'TOPOGRAPHY_EQUIPMENT_CREATED',
      entityId: equipment.id,
      description: `Equipamento ${equipment.code} criado: ${equipment.name}`,
      newData: {
        code: equipment.code,
        name: equipment.name,
        status: equipment.status,
        category: equipment.category,
      },
    });

    return NextResponse.json({ equipment }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao criar equipamento.';
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
