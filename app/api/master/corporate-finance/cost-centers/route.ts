import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import {
  createCorporateCostCenter,
  listCorporateCostCenters,
  logCorporateFinanceAudit,
} from '@/lib/master/corporateFinance/service';
import { validateCorporateCostCenterInput } from '@/lib/master/corporateFinance/validation';

export async function GET(request: Request) {
  const { client: supabaseAdmin, error: configError } = getCorporateFinanceServiceClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const auth = await authorizeCorporateFinance(supabaseAdmin, {
    userId: searchParams.get('userId'),
    impersonatingTenantId: searchParams.get('impersonatingTenantId'),
  });
  if (!auth.ok) return auth.response;

  try {
    const costCenters = await listCorporateCostCenters(supabaseAdmin, {
      includeInactive: searchParams.get('includeInactive') === '1',
    });
    return NextResponse.json({ costCenters });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao listar centros.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { client: supabaseAdmin, error: configError } = getCorporateFinanceServiceClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  try {
    const body = await request.json();
    const auth = await authorizeCorporateFinance(supabaseAdmin, {
      userId: body.userId,
      impersonatingTenantId: body.impersonatingTenantId,
    });
    if (!auth.ok) return auth.response;

    const input = validateCorporateCostCenterInput(body);
    const costCenter = await createCorporateCostCenter(supabaseAdmin, input);

    await logCorporateFinanceAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'CORPORATE_COST_CENTER_CREATED',
      entityId: costCenter.id,
      description: `Centro de resultado criado: ${costCenter.code} — ${costCenter.name}`,
      newData: costCenter,
    });

    return NextResponse.json({ costCenter }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao criar centro.';
    const status =
      message.includes('obrigatório') ||
      message.includes('inválid') ||
      message.includes('Já existe')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
