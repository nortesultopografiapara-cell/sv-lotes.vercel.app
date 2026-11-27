import { authorizePlatformAdminRequest } from '@/lib/security/adminAuthorization';
import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { getEquipmentTimeline } from '@/lib/master/topography/equipmentTimelineService';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  
  const { searchParams } = new URL(request.url);
  const auth = await authorizePlatformAdminRequest(request, searchParams.get('userId'));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }


  const { id } = await context.params;
  try {
    const events = await getEquipmentTimeline(supabaseAdmin, id);
    return NextResponse.json({ events });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao carregar timeline.';
    const status = message.includes('não encontrado') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
