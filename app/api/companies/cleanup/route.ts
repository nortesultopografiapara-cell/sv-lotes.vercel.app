import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function isMarkedTestCompany(company: {
  is_test?: boolean | null;
  is_test_company?: boolean | null;
}): boolean {
  return company.is_test_company === true || company.is_test === true;
}

export async function POST(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase Role Key missing' }, { status: 500 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const authUsersList: { id: string; email?: string }[] = [];
    let page = 1;

    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !data.users || data.users.length === 0) break;
      authUsersList.push(...data.users);
      page++;
    }

    const { data: companies } = await supabaseAdmin
      .from('companies')
      .select('id, name, is_test, is_test_company');
    const companyIds = new Set(companies?.map((c) => c.id) || []);

    let testCompaniesRemoved = 0;
    if (companies) {
      for (const comp of companies) {
        if (!isMarkedTestCompany(comp)) continue;
        console.log(`[CLEANUP] Removendo empresa marcada como teste: ${comp.name || comp.id}`);
        await supabaseAdmin.from('companies').delete().eq('id', comp.id);
        companyIds.delete(comp.id);
        testCompaniesRemoved++;
      }
    }

    const { data: publicUsers } = await supabaseAdmin.from('users').select('id, email, tenant_id');

    const cleanedStats = {
      orphanedAuthUsers: 0,
      invalidPublicUsers: 0,
      emptyCompanies: 0,
      testCompaniesRemoved,
    };

    for (const pu of publicUsers || []) {
      if (pu.email?.toLowerCase().includes('nortesul') || pu.email?.toLowerCase().includes('admin')) {
        continue;
      }

      if (!pu.tenant_id || !companyIds.has(pu.tenant_id)) {
        console.log(`[CLEANUP] Removendo registro público órfão: ${pu.email}`);
        await supabaseAdmin.from('users').delete().eq('id', pu.id);
        cleanedStats.invalidPublicUsers++;
      }
    }

    const { data: refreshedPublicUsers } = await supabaseAdmin.from('users').select('id');
    const validPublicUserIds = new Set(refreshedPublicUsers?.map((u) => u.id) || []);

    for (const au of authUsersList) {
      if (au.email?.toLowerCase().includes('nortesul') || au.email?.toLowerCase().includes('admin')) {
        continue;
      }

      if (!validPublicUserIds.has(au.id)) {
        console.log(`[CLEANUP] Removendo usuário órfão do Auth: ${au.email}`);
        await supabaseAdmin.auth.admin.deleteUser(au.id);
        cleanedStats.orphanedAuthUsers++;
      }
    }

    const { data: usersWithTenants } = await supabaseAdmin.from('users').select('tenant_id');
    const usedTenantIds = new Set(usersWithTenants?.map((u) => u.tenant_id).filter(Boolean));

    if (companies) {
      for (const comp of companies) {
        if (!companyIds.has(comp.id)) continue;
        if (!usedTenantIds.has(comp.id)) {
          console.log(`[CLEANUP] Removendo empresa vazia: ${comp.id}`);
          await supabaseAdmin.from('companies').delete().eq('id', comp.id);
          cleanedStats.emptyCompanies++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Limpeza concluída com sucesso',
      stats: cleanedStats,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno';
    console.error('[CLEANUP ERRO]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
