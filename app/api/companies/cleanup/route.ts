import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isTestCompanyForCleanup } from '@/lib/masterProduction';

export async function POST(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase Role Key missing' }, { status: 500 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    // 1. Get all public auth users
    const authUsersList: any[] = [];
    let page = 1;

    while (true) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error || !data.users || data.users.length === 0) break;
        authUsersList.push(...data.users);
        page++;
    }

    // 2. Get all companies
    const { data: companies } = await supabaseAdmin.from('companies').select('id, name, fantasy_name, slug, email, status_operacional, is_test');
    const companyIds = new Set(companies?.map(c => c.id) || []);

    let testCompaniesRemoved = 0;
    if (companies) {
      for (const comp of companies) {
        if (isTestCompanyForCleanup(comp)) {
          console.log(`[CLEANUP] Removendo empresa de teste: ${comp.name || comp.id}`);
          await supabaseAdmin.from('companies').delete().eq('id', comp.id);
          companyIds.delete(comp.id);
          testCompaniesRemoved++;
        }
      }
    }

    // 3. Get all public.users
    const { data: publicUsers } = await supabaseAdmin.from('users').select('id, email, tenant_id');
    const publicUserMap = new Map(publicUsers?.map(u => [u.id, u]) || []);

    let cleanedStats = {
      orphanedAuthUsers: 0,
      invalidPublicUsers: 0,
      emptyCompanies: 0,
      testCompaniesRemoved,
    };

    // 4. Limpar public.users sem tenant válido (incompletos)
    for (const pu of publicUsers || []) {
        if (pu.email?.toLowerCase().includes('nortesul') || pu.email?.toLowerCase().includes('admin')) {
             // Protect master, assume no tenant_id is fine for master
             continue; 
        }

        if (!pu.tenant_id || !companyIds.has(pu.tenant_id)) {
            console.log(`[CLEANUP] Removendo registro público órfão (sem tenant real): ${pu.email}`);
            await supabaseAdmin.from('users').delete().eq('id', pu.id);
            cleanedStats.invalidPublicUsers++;
        }
    }

    // Refresh public.users mapping after deletions
    const { data: refreshedPublicUsers } = await supabaseAdmin.from('users').select('id');
    const validPublicUserIds = new Set(refreshedPublicUsers?.map(u => u.id) || []);

    // 5. Limpar Auth users sem correspondente no public.users (or that were just deleted)
    for (const au of authUsersList) {
        if (au.email?.toLowerCase().includes('nortesul') || au.email?.toLowerCase().includes('admin')) continue;

        if (!validPublicUserIds.has(au.id)) {
            console.log(`[CLEANUP] Removendo usuário órfão do Auth: ${au.email}`);
            await supabaseAdmin.auth.admin.deleteUser(au.id);
            cleanedStats.orphanedAuthUsers++;
        }
    }

    // 6. Delete companies that have no users tied to them
    const { data: usersWithTenants } = await supabaseAdmin.from('users').select('tenant_id');
    const usedTenantIds = new Set(usersWithTenants?.map(u => u.tenant_id).filter(Boolean));

    if (companies) {
      for (const comp of companies) {
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
        stats: cleanedStats
    });

  } catch (err: any) {
    console.error('[CLEANUP ERRO]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
