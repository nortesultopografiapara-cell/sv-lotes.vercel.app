import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  createExtraordinarySaasIncome,
  updateExtraordinarySaasIncome,
} from '@/lib/saasCashMovements';

export const runtime = 'nodejs';

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

    const result = await createExtraordinarySaasIncome(supabaseAdmin, {
      amount: Number(body.amount),
      movementDate: String(body.movementDate || body.movement_date || ''),
      description: String(body.description || ''),
      category: body.category ? String(body.category) : undefined,
      companyId: body.companyId || body.company_id || null,
      asaasPaymentId: body.asaasPaymentId || body.asaas_payment_id || null,
      externalReference: body.externalReference || body.external_reference || null,
      clientName: body.clientName || body.client_name || null,
      paymentMethod: body.paymentMethod || body.payment_method || null,
      notes: body.notes || null,
      createdBy: body.userId ? String(body.userId) : null,
    });

    return NextResponse.json(
      {
        success: true,
        created: result.created,
        movement: result.movement,
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao lançar receita.';
    const status =
      message.includes('obrigat') ||
      message.includes('maior que zero') ||
      message.includes('inválid')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/** Edição segura — não permite alterar type/amount/source. */
export async function PATCH(request: Request) {
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

    const movement = await updateExtraordinarySaasIncome(supabaseAdmin, {
      id: String(body.id || body.movementId || ''),
      description: body.description !== undefined ? String(body.description) : undefined,
      category: body.category !== undefined ? String(body.category) : undefined,
      clientName:
        body.clientName !== undefined || body.client_name !== undefined
          ? (body.clientName ?? body.client_name ?? null)
          : undefined,
      paymentMethod:
        body.paymentMethod !== undefined || body.payment_method !== undefined
          ? (body.paymentMethod ?? body.payment_method ?? null)
          : undefined,
      notes: body.notes !== undefined ? body.notes : undefined,
      movementDate:
        body.movementDate !== undefined || body.movement_date !== undefined
          ? String(body.movementDate || body.movement_date || '')
          : undefined,
      updatedBy: body.userId ? String(body.userId) : null,
    });

    return NextResponse.json({ success: true, movement });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao atualizar receita.';
    const status =
      message.includes('obrigat') ||
      message.includes('não encontrada') ||
      message.includes('Somente receita')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
