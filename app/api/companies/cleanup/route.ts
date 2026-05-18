import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    // 2. Get all public.users
    const { data: publicUsers } = await supabaseAdmin.from('users').select('id');
    const publicUserIds = publicUsers?.map(u => u.id) || [];

    // 3. Find orphaned auth users (not in public.users)
    let cleanedStats = {
      orphanedAuthUsers: 0,
      emptyCompanies: 0
    };

    for (const au of authUsersList) {
        // preserve the true master email just in case
        if (au.email.toLowerCase().includes('nortesul')) continue;

        if (!publicUserIds.includes(au.id)) {
            console.log(`[CLEANUP] Removendo usuário órfão do Auth: ${au.email}`);
            await supabaseAdmin.auth.admin.deleteUser(au.id);
            cleanedStats.orphanedAuthUsers++;
        }
    }

    // 4. Delete companies that have no users tied to them
    const { data: companies } = await supabaseAdmin.from('companies').select('id');
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
