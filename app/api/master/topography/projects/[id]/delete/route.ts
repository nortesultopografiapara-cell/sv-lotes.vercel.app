import { authorizePlatformAdminRequest } from '@/lib/security/adminAuthorization';
import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  countTopographyProjectLinks,
  deleteTopographyProjectSecure,
} from '@/lib/master/topography/projectDeleteService';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
    const { searchParams } = new URL(request.url);
  const auth = await authorizePlatformAdminRequest(request, searchParams.get('userId'));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }


  const { id } = await ctx.params;
  try {
    const links = await countTopographyProjectLinks(supabaseAdmin, id);
    return NextResponse.json({ links });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao inspecionar vínculos.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: Ctx) {
  
  const { id } = await ctx.params;

  try {
    const body = await request.json().catch(() => ({}));
    const auth = await authorizePlatformAdminRequest(request, body.userId ?? null);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }


    const result = await deleteTopographyProjectSecure(supabaseAdmin, {
      id,
      confirmWord: String(body.confirmWord || body.confirmation || ''),
      userId: body.userId ? String(body.userId) : null,
      reason: body.reason != null ? String(body.reason) : null,
      cascadeLinks: Boolean(body.cascadeLinks),
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao excluir projeto.';
    const status = /vínculos|Confirmação|EXCLUIR|restrita/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
