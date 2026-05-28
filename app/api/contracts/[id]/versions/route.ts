import { NextResponse } from 'next/server';
import {
  loadSaleContractContext,
  listSaleContractVersions,
} from '@/lib/contractRegeneration';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      return NextResponse.json({ error: configError || 'Não autenticado' }, { status: 401 });
    }

    const { client: supabase, configError: adminError } = createAdminSupabase();
    if (!supabase || adminError) {
      return NextResponse.json({ error: adminError || 'Supabase não configurado' }, { status: 503 });
    }

    const { id: contractId } = await params;
    const contract = await loadSaleContractContext(supabase, contractId);
    const saleId = contract.sale_id as string;
    if (!saleId) {
      return NextResponse.json({ versions: [contract] });
    }

    const versions = await listSaleContractVersions(supabase, saleId);
    return NextResponse.json({ versions, active: versions.find((v) => v.status === 'ativo') });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao listar versões';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
