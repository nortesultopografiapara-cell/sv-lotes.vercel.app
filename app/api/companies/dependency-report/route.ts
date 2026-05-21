import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Service role não configurada.' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const tables = ['users', 'projects', 'blocks', 'customers', 'brokers', 'sales', 'contracts', 'finance_receipts'];
    const report: Record<string, number> = {};

    for (const table of tables) {
       // Just attempt to count. If table doesn't exist, ignore (e.g. sales, brokers)
       const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('tenant_id', companyId);
       if (!error) {
          report[table] = count || 0;
       } else {
          report[table] = 0;
       }
    }

    return NextResponse.json({ success: true, report });
  } catch (error: any) {
    console.error('API /companies/dependency-report Error:', error);
    return NextResponse.json({ error: error.message || 'Erro interno no servidor' }, { status: 500 });
  }
}
