import { NextResponse } from 'next/server';
import {
  createAdminSupabase,
  getRequestAuthUser,
  resolveCallerProfile,
} from '@/lib/supabase/server';
import { executeGisSaleCreate, type GisSaleCreateInput } from '@/lib/gisSaleCreateService';

export const runtime = 'nodejs';

type Body = {
  tenantId?: string;
  projectId?: string;
  lot?: GisSaleCreateInput['lot'];
  finalPrice?: number;
  customerData?: Record<string, unknown>;
  brokerId?: string | null;
  tenantContractModel?: string | null;
  financialAccountId?: string | null;
};

export async function POST(request: Request) {
  const startedAt = Date.now();
  const mark = (step: string, extra?: Record<string, unknown>) => {
    console.log('[sales/create]', step, { ms: Date.now() - startedAt, ...extra });
  };

  try {
    mark('validate_payload');
    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      mark('response', { status: 401 });
      return NextResponse.json(
        { success: false, error: configError || 'Não autenticado' },
        { status: 401 },
      );
    }

    const body = (await request.json()) as Body;
    const tenantId = body.tenantId?.trim();
    const projectId = body.projectId?.trim();
    const lot = body.lot;
    const finalPrice = Number(body.finalPrice);
    const customerData = body.customerData;

    if (!tenantId || !projectId || !lot?.id || !customerData) {
      mark('response', { status: 400 });
      return NextResponse.json(
        {
          success: false,
          error: 'tenantId, projectId, lot e customerData são obrigatórios.',
        },
        { status: 400 },
      );
    }

    if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
      mark('response', { status: 400 });
      return NextResponse.json(
        { success: false, error: 'Valor da venda inválido.' },
        { status: 400 },
      );
    }

    const { client: supabase, configError: adminError } = createAdminSupabase();
    if (!supabase || adminError) {
      mark('response', { status: 503 });
      return NextResponse.json(
        { success: false, error: adminError || 'Supabase não configurado' },
        { status: 503 },
      );
    }

    const profile = await resolveCallerProfile(supabase, user.id);
    const userRole = String(profile?.role || user.role || '').toUpperCase();

    const result = await executeGisSaleCreate(supabase, {
      userId: user.id,
      userRole,
      tenantId,
      projectId,
      lot,
      finalPrice,
      customerData,
      brokerId: body.brokerId?.trim() || null,
      tenantContractModel: body.tenantContractModel,
      financialAccountId: body.financialAccountId?.trim() || null,
      isSuperAdmin: userRole === 'SUPER_ADMIN',
    });

    mark('response', { status: 200, saleId: result.saleId });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Falha ao registrar venda no mapa.';
    console.error('[sales/create] error', message);
    mark('response', { status: 500, message });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
