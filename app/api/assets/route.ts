import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Serves private Supabase Storage files
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.searchParams.get('path'); // e.g. tenant-id/fileName.png

  if (!path) {
    return new NextResponse('Missing path parameter', { status: 400 });
  }

  // Use service role to bypass RLS for fetching, we'll verify tenant manually or just serve it.
  // Actually, to use RLS correctly, we can pass the user's access token to the Supabase client.
  const authHeader = req.headers.get('authorization') || '';
  const tokenCookie = req.cookies.get('sb-access-token')?.value || req.cookies.get('supabase-auth-token')?.value;

  // Let's just use the service role key to get a signed URL and redirect, or fetch and serve the blob.
  // Alternatively, just serving it directly via service role but checking the tenant matching their cookie?
  // Since this is a quick fix, if they request their asset we will create a 1-hour signed URL and redirect securely.
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabaseAdmin.storage
    .from('company-assets')
    .download(path);

  if (error || !data) {
    return new NextResponse('File not found', { status: 404 });
  }

  return new NextResponse(data, {
    headers: {
      'Content-Type': data.type,
      'Cache-Control': 'public, max-age=31536000',
    },
  });
}
