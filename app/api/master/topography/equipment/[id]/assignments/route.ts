import { authorizePlatformAdminRequest } from '@/lib/security/adminAuthorization';
import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getTopographyEquipmentById } from '@/lib/master/topography/equipmentService';
import {
  listEquipmentAssignments,
  transferEquipmentAssignment,
} from '@/lib/master/topography/equipmentAssignmentsService';
import { validateEquipmentTransferInput } from '@/lib/master/topography/equipmentAssignmentValidation';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  
  const { searchParams } = new URL(request.url);
  const auth = await authorizePlatformAdminRequest(request, searchParams.get('userId'));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }


  const { id } = await context.params;
  try {
    const equipment = await getTopographyEquipmentById(supabaseAdmin, id);
    if (!equipment) {
      return NextResponse.json({ error: 'Equipamento não encontrado.' }, { status: 404 });
    }
    const assignments = await listEquipmentAssignments(supabaseAdmin, id);
    return NextResponse.json({ assignments });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao listar movimentações.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, context: Ctx) {
  
  const { id } = await context.params;

  try {
    const body = await request.json();
    const auth = await authorizePlatformAdminRequest(request, body.userId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }


    const input = validateEquipmentTransferInput(body);
    const result = await transferEquipmentAssignment(supabaseAdmin, {
      equipmentId: id,
      input,
      createdBy: body.userId ? String(body.userId) : null,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha na transferência.';
    const status =
      message.includes('Informe') ||
      message.includes('inválid') ||
      message.includes('não encontrado')
        ? message.includes('não encontrado')
          ? 404
          : 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
