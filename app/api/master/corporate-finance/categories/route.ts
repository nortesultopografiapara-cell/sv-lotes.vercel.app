import { NextResponse } from 'next/server';
import {
  authorizeCorporateFinance,
  getCorporateFinanceServiceClient,
} from '@/lib/master/corporateFinance/apiAuth';
import {
  createCorporateCategory,
  listCorporateCategories,
  logCorporateFinanceAudit,
} from '@/lib/master/corporateFinance/service';
import { validateCorporateCategoryInput } from '@/lib/master/corporateFinance/validation';

export async function GET(request: Request) {
  
  const { searchParams } = new URL(request.url);
  const auth = await authorizeCorporateFinance(request, {
    userId: searchParams.get('userId'),
    impersonatingTenantId: searchParams.get('impersonatingTenantId'),
  });
  if (!auth.ok) return auth.response;
const { client: supabaseAdmin, error: configError } = getCorporateFinanceServiceClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }


  try {
    const categories = await listCorporateCategories(supabaseAdmin, {
      type: searchParams.get('type') || undefined,
      includeInactive: searchParams.get('includeInactive') === '1',
    });
    return NextResponse.json({ categories });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao listar categorias.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  
  try {
    const body = await request.json();
    const auth = await authorizeCorporateFinance(request, {
      userId: body.userId,
      impersonatingTenantId: body.impersonatingTenantId,
    });
    if (!auth.ok) return auth.response;
const { client: supabaseAdmin, error: configError } = getCorporateFinanceServiceClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }


    const input = validateCorporateCategoryInput(body);
    const category = await createCorporateCategory(supabaseAdmin, input);

    await logCorporateFinanceAudit(supabaseAdmin, {
      userId: body.userId ? String(body.userId) : null,
      action: 'CORPORATE_CATEGORY_CREATED',
      entityId: category.id,
      description: `Categoria criada: ${category.name} (${category.type})`,
      newData: category,
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao criar categoria.';
    const status = message.includes('obrigatório') || message.includes('inválid') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
