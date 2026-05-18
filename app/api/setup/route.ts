import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Read schema of companies
  const { data, error } = await supabase.from('companies').select('address').limit(1);
  
  if (error) {
    // Column doesn't exist. Apply migration via PostgREST RPC if possible.
    // Wait, Supabase provides an RPC to execute arbitrary SQL on some environments? No.
    // But how can I apply DDL? I'll just check if the column exists.
    return NextResponse.json({ exists: false, error: error.message });
  }

  return NextResponse.json({ exists: true });
}
